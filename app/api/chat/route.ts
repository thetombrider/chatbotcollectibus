/**
 * Chat Route - Refactored Version
 * 
 * Versione refactorizzata che orchestra tutti i moduli:
 * - Handlers (stream, cache, search, response)
 * - Services (citation, source, context, message)
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/embeddings/openai'
import { analyzeQuery } from '@/lib/embeddings/query-analysis'
import { enhanceQueryIfNeeded } from '@/lib/embeddings/query-enhancement'
import { clearWebSearchResults } from '@/lib/mastra/agent'
import { createStream, StreamController } from './handlers/stream-handler'
import { lookupCache, saveCache } from './handlers/cache-handler'
import { performSearch } from './handlers/search-handler'
import { generateResponse, processResponse, type ResponseContext } from './handlers/response-handler'
import { buildContext, filterRelevantResults } from './services/context-builder'
import { createKBSources, combineSources } from './services/source-service'
import { saveUserMessage, getConversationHistory, saveAssistantMessage } from './services/message-service'
import { 
  createChatTrace, 
  createSpan,
  endSpan,
  updateTrace,
  flushLangfuse,
  type TraceContext 
} from '@/lib/observability/langfuse'
import { createServerSupabaseClient } from '@/lib/supabase/client'

export const maxDuration = 60 // 60 secondi per Vercel

/**
 * Gestisce una richiesta chat completa
 */
async function handleChatRequest(
  message: string,
  conversationId: string | null,
  webSearchEnabled: boolean,
  skipCache: boolean,
  streamController: StreamController,
  traceContext?: TraceContext | null
): Promise<void> {
  // Se traceContext non è fornito, crea un nuovo trace
  // (questo può accadere se viene chiamato direttamente senza trace)
  if (!traceContext) {
    // Estrai userId dalla sessione Supabase
    let userId: string | null = null
    try {
      const supabase = await createServerSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id || null
    } catch (error) {
      console.warn('[api/chat] Failed to get user from session:', error)
      // Continua senza userId se non disponibile
    }

    traceContext = createChatTrace(
      conversationId || 'anonymous',
      userId,
      message,
      { webSearchEnabled, skipCache }
    )
  }

  // STEP 1: Recupera cronologia conversazione (PRIMA di salvare il messaggio corrente)
  // Questo ci dà il contesto dei messaggi PRECEDENTI, non quello corrente
  const conversationHistory = conversationId
    ? await getConversationHistory(conversationId)
    : []
  
  console.log('[api/chat] Conversation history retrieved:', {
    conversationId,
    historyLength: conversationHistory.length,
    lastMessages: conversationHistory.slice(-2).map(m => ({ role: m.role, preview: m.content.substring(0, 50) }))
  })

  // STEP 2: Salva messaggio utente (DOPO aver recuperato la history)
  if (conversationId) {
    await saveUserMessage(conversationId, message)
  }

  // STEP 3: Analisi query
  streamController.sendStatus('Analisi della query...')
  const analysisSpan = traceContext ? createSpan(traceContext.trace, 'query-analysis', { message }) : null
  const analysis = await analyzeQuery(message)
  endSpan(analysisSpan, {
    intent: analysis.intent,
    isMeta: analysis.isMeta,
    isComparative: analysis.isComparative,
    articleNumber: analysis.articleNumber,
  })

  // STEP 4: Enhancement query (with conversation history)
  streamController.sendStatus('Miglioramento query...')
  const enhancementSpan = traceContext ? createSpan(traceContext.trace, 'query-enhancement', { 
    original: message, 
    analysis 
  }) : null
  const enhancement = await enhanceQueryIfNeeded(message, analysis, conversationHistory)
  const queryToEmbed = enhancement.enhanced
  const articleNumber = analysis.articleNumber || enhancement.articleNumber
  endSpan(enhancementSpan, {
    enhanced: queryToEmbed,
    shouldEnhance: enhancement.shouldEnhance,
  })

  // STEP 5: Check cache
  streamController.sendStatus('Verifica cache...')
  const cacheSpan = traceContext ? createSpan(traceContext.trace, 'cache-lookup', { query: queryToEmbed }) : null
  const queryEmbedding = await generateEmbedding(
    queryToEmbed, 
    'text-embedding-3-large', 
    traceContext ? traceContext.trace : null
  )
  const cached = await lookupCache(queryToEmbed, queryEmbedding, skipCache, traceContext)
  endSpan(cacheSpan, { cached: cached.cached })

  if (cached.cached && cached.response && cached.sources) {
    // Cache hit: invia risposta cached
    streamController.sendText(cached.response)
    streamController.sendTextComplete(cached.response)
    streamController.sendDone(cached.sources)
    
    // Salva messaggio assistant
    if (conversationId) {
      await saveAssistantMessage(conversationId, cached.response, {
        sources: cached.sources,
        query_enhanced: enhancement.shouldEnhance,
        original_query: message,
        enhanced_query: enhancement.shouldEnhance ? queryToEmbed : undefined,
      })
    }
    
    // Finalize Langfuse trace (cache hit)
    if (traceContext) {
      updateTrace(traceContext.trace, {
        response: cached.response, // Risposta completa (non troncata)
        responseLength: cached.response.length,
        sourcesCount: cached.sources.length,
        cached: true,
      }, {
        analysis: analysis.intent,
        enhancement: enhancement.shouldEnhance,
        cacheHit: true,
      })

      // CRITICAL: Flush Langfuse anche per cache hit
      await flushLangfuse()
    }
    
    return
  }

  // STEP 6: Vector search
  const isMetaQuery = analysis.isMeta && analysis.metaType === 'list'
  
  let searchResults: Awaited<ReturnType<typeof performSearch>> = []
  let relevantResults: Awaited<ReturnType<typeof performSearch>> = []
  let context: string | null = null
  let kbSources: ReturnType<typeof createKBSources> = []

  if (!isMetaQuery) {
    // Query normale: esegui ricerca vettoriale
    if (analysis.comparativeTerms && analysis.comparativeTerms.length >= 2) {
      streamController.sendStatus(`Analisi comparativa tra ${analysis.comparativeTerms.join(' e ')}...`)
    } else {
      streamController.sendStatus('Ricerca documenti nella knowledge base...')
    }

    const searchSpan = traceContext ? createSpan(traceContext.trace, 'vector-search', { 
      query: queryToEmbed,
      isComparative: analysis.isComparative,
      comparativeTerms: analysis.comparativeTerms,
    }) : null
    searchResults = await performSearch(queryToEmbed, queryEmbedding, analysis, articleNumber, traceContext)
    
    // Filtra risultati rilevanti
    // Threshold più basso per includere più risultati (0.35 invece di 0.40)
    // Questo permette di includere risultati con similarità 0.35-0.40 che potrebbero essere comunque utili
    const RELEVANCE_THRESHOLD = articleNumber ? 0.1 : 0.35
    relevantResults = filterRelevantResults(searchResults, RELEVANCE_THRESHOLD)
    
    // Log per debugging
    const avgSimilarity = relevantResults.length > 0
      ? relevantResults.reduce((sum, r) => sum + r.similarity, 0) / relevantResults.length
      : 0
    console.log('[api/chat] Search results:', {
      total: searchResults.length,
      relevant: relevantResults.length,
      avgSimilarity: avgSimilarity.toFixed(3),
      threshold: RELEVANCE_THRESHOLD,
    })
    
    // Costruisci contesto
    context = buildContext(relevantResults)
    
    // Crea sources KB
    kbSources = createKBSources(relevantResults)
    
    endSpan(searchSpan, {
      totalResults: searchResults.length,
      relevantResults: relevantResults.length,
      avgSimilarity: avgSimilarity.toFixed(3),
      threshold: RELEVANCE_THRESHOLD,
    })
  } else {
    // Query meta: salta ricerca vettoriale
    streamController.sendStatus('Recupero documenti dal database...')
  }

  // STEP 7: Genera risposta
  streamController.sendStatus('Generazione risposta...')
  
  const responseContext: ResponseContext = {
    message,
    conversationHistory,
    analysis,
    queryToEmbed,
    queryEmbedding,
    searchResults,
    relevantResults,
    context,
    sources: kbSources,
    webSearchEnabled,
    articleNumber,
    traceContext, // Passa traceContext al context per logging LLM
  }

  const responseSpan = traceContext ? createSpan(traceContext.trace, 'response-generation', {
    query: queryToEmbed,
    contextLength: context?.length || 0,
    sourcesCount: kbSources.length,
    searchResultsCount: searchResults.length,
  }) : null
  const generateResult = await generateResponse(responseContext, streamController)
  endSpan(responseSpan, {
    responseLength: generateResult.fullResponse?.length || 0,
    truncated: generateResult.fullResponse?.substring(0, 200) || '',
  })

  // STEP 8: Valida risposta non vuota
  if (!generateResult.fullResponse || generateResult.fullResponse.trim().length === 0) {
    streamController.sendError('Failed to generate response: empty content')
    streamController.close()
    return
  }

  // STEP 9: Processa risposta (citazioni, sources, etc.)
  // I risultati web e meta sono ora inclusi in generateResult (recuperati dentro il context)
  const webSearchResults = generateResult.webSearchResults || []

  console.log('[api/chat] Retrieved from generateResponse:', {
    webResultsCount: webSearchResults.length,
    metaDocumentsCount: generateResult.metaQueryDocuments?.length || 0,
    metaDocumentsSample: generateResult.metaQueryDocuments?.slice(0, 3) || [],
  })

  // Aggiungi al context per processing
  responseContext.webSearchResults = webSearchResults
  responseContext.metaQueryDocuments = generateResult.metaQueryDocuments
  responseContext.metaQueryChunks = generateResult.metaQueryChunks
  
  console.log('[api/chat] Added to response context:', {
    webSearchResultsCount: responseContext.webSearchResults?.length || 0,
    metaQueryDocumentsCount: responseContext.metaQueryDocuments?.length || 0,
  })

  const processingSpan = traceContext ? createSpan(traceContext.trace, 'response-processing', {
    responseLength: generateResult.fullResponse?.length || 0,
    webResultsCount: webSearchResults.length,
    metaDocumentsCount: responseContext.metaQueryDocuments?.length || 0,
  }) : null
  const processed = await processResponse(generateResult.fullResponse, responseContext, generateResult.model)
  endSpan(processingSpan, {
    processedLength: processed.content?.length || 0,
    sourcesCount: processed.sources?.length || 0,
    webSourcesCount: processed.webSources?.length || 0,
    model: processed.model,
  })

  // STEP 10: Combina sources
  const allSources = combineSources(processed.sources, processed.webSources)

  // STEP 11: Salva messaggio assistant
  if (conversationId) {
    await saveAssistantMessage(conversationId, processed.content, {
      chunks_used: searchResults.map((r) => ({
        id: r.id,
        similarity: r.similarity,
      })),
      sources: allSources,
      query_enhanced: enhancement.shouldEnhance,
      original_query: message,
      enhanced_query: enhancement.shouldEnhance ? queryToEmbed : undefined,
      model: processed.model, // Salva il modello usato
    })
  }

  // STEP 12: Invia risposta finale
  streamController.sendTextComplete(processed.content)
  streamController.sendDone(allSources, processed.model)

  // STEP 13: Salva in cache
  await saveCache(queryToEmbed, queryEmbedding, processed.content, processed.sources)

  // Pulisci context globale (temporaneo)
  clearWebSearchResults()

  // Finalize Langfuse trace con la risposta completa
  if (traceContext) {
    updateTrace(traceContext.trace, {
      response: processed.content, // Risposta completa (non troncata)
      responseLength: processed.content.length,
      sourcesCount: allSources.length,
      cached: false,
    }, {
      analysis: analysis.intent,
      enhancement: enhancement.shouldEnhance,
      searchResultsCount: searchResults.length,
      relevantResultsCount: relevantResults.length,
      webSourcesCount: processed.webSources?.length || 0,
      kbSourcesCount: processed.sources?.length || 0,
    })

    // CRITICAL: Flush Langfuse prima che la funzione serverless termini
    // In produzione su Vercel, senza flush gli ultimi eventi vanno persi
    await flushLangfuse()
  }
}

/**
 * POST handler per chat
 */
export async function POST(req: NextRequest) {
  try {
    const { message, conversationId, webSearchEnabled = false, skipCache = false } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Estrai userId dalla sessione Supabase
    let userId: string | null = null
    try {
      const supabase = await createServerSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id || null
    } catch (error) {
      console.warn('[api/chat] Failed to get user from session:', error)
      // Continua senza userId se non disponibile
    }

    // Crea trace Langfuse per questa richiesta chat
    const traceContext = createChatTrace(
      conversationId || 'anonymous',
      userId,
      message,
      { webSearchEnabled, skipCache }
    )

    // Crea stream
    const stream = createStream(async (streamController) => {
      try {
        await handleChatRequest(
          message,
          conversationId || null,
          webSearchEnabled,
          skipCache,
          streamController,
          traceContext // Passa traceContext al handler
        )
        streamController.close()
      } catch (error) {
        console.error('[api/chat] Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate response'
        streamController.sendError(errorMessage)
        streamController.close()

        // CRITICAL: Flush Langfuse anche in caso di errore
        if (traceContext) {
          await flushLangfuse()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[api/chat] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
