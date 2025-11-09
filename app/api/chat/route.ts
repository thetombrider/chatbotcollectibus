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
import { getWebSearchResults, clearWebSearchResults, getMetaQueryDocuments } from '@/lib/mastra/agent'
import { createStream, StreamController } from './handlers/stream-handler'
import { lookupCache, saveCache } from './handlers/cache-handler'
import { performSearch } from './handlers/search-handler'
import { generateResponse, processResponse, type ResponseContext } from './handlers/response-handler'
import { buildContext, filterRelevantResults } from './services/context-builder'
import { createKBSources, combineSources } from './services/source-service'
import { saveUserMessage, getConversationHistory, saveAssistantMessage } from './services/message-service'
import { createChatTrace, finalizeTrace, createStepSpan, finalizeSpan } from '@/lib/observability/langfuse'

export const maxDuration = 60 // 60 secondi per Vercel

/**
 * Gestisce una richiesta chat completa
 */
async function handleChatRequest(
  message: string,
  conversationId: string | null,
  webSearchEnabled: boolean,
  skipCache: boolean,
  streamController: StreamController
): Promise<void> {
  // Create Langfuse trace for this chat request
  const traceId = createChatTrace(
    conversationId || 'anonymous',
    message,
    { webSearchEnabled, skipCache }
  )

  // STEP 1: Salva messaggio utente
  if (conversationId) {
    await saveUserMessage(conversationId, message)
  }

  // STEP 2: Recupera cronologia conversazione
  const conversationHistory = conversationId
    ? await getConversationHistory(conversationId)
    : []

  // STEP 3: Analisi query
  streamController.sendStatus('Analisi della query...')
  const analysisSpanId = createStepSpan(traceId, 'query-analysis', { message })
  const analysis = await analyzeQuery(message)
  finalizeSpan(analysisSpanId, {
    intent: analysis.intent,
    isMeta: analysis.isMeta,
    isComparative: analysis.isComparative,
    articleNumber: analysis.articleNumber,
  })

  // STEP 4: Enhancement query
  streamController.sendStatus('Miglioramento query...')
  const enhancementSpanId = createStepSpan(traceId, 'query-enhancement', { 
    original: message, 
    analysis 
  })
  const enhancement = await enhanceQueryIfNeeded(message, analysis)
  const queryToEmbed = enhancement.enhanced
  const articleNumber = analysis.articleNumber || enhancement.articleNumber
  finalizeSpan(enhancementSpanId, {
    enhanced: queryToEmbed,
    shouldEnhance: enhancement.shouldEnhance,
  })

  // STEP 5: Check cache
  streamController.sendStatus('Verifica cache...')
  const cacheSpanId = createStepSpan(traceId, 'cache-lookup', { query: queryToEmbed })
  const queryEmbedding = await generateEmbedding(queryToEmbed, 'text-embedding-3-large', traceId)
  const cached = await lookupCache(queryToEmbed, queryEmbedding, skipCache)
  finalizeSpan(cacheSpanId, { cached: cached.cached })

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
    if (traceId) {
      finalizeTrace(traceId, {
        response: cached.response.substring(0, 500), // Limita lunghezza
        sourcesCount: cached.sources.length,
        cached: true,
      }, {
        analysis: analysis.intent,
        enhancement: enhancement.shouldEnhance,
        cacheHit: true,
      })
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

    const searchSpanId = createStepSpan(traceId, 'vector-search', { 
      query: queryToEmbed,
      isComparative: analysis.isComparative,
      comparativeTerms: analysis.comparativeTerms,
    })
    searchResults = await performSearch(queryToEmbed, queryEmbedding, analysis, articleNumber, traceId)
    
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
    
    finalizeSpan(searchSpanId, {
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
    traceId, // Passa traceId al context per logging LLM
  }

  const responseSpanId = createStepSpan(traceId, 'response-generation', {
    query: queryToEmbed,
    contextLength: context?.length || 0,
    sourcesCount: kbSources.length,
    searchResultsCount: searchResults.length,
  })
  const fullResponse = await generateResponse(responseContext, streamController)
  finalizeSpan(responseSpanId, {
    responseLength: fullResponse?.length || 0,
    truncated: fullResponse?.substring(0, 200) || '',
  })

  // STEP 8: Valida risposta non vuota
  if (!fullResponse || fullResponse.trim().length === 0) {
    streamController.sendError('Failed to generate response: empty content')
    streamController.close()
    return
  }

  // STEP 9: Processa risposta (citazioni, sources, etc.)
  // Recupera risultati web e meta dal context globale (temporaneo, da refactorare)
  const webSearchResults = getWebSearchResults()
  const metaQueryDocuments = getMetaQueryDocuments()

  // Aggiungi al context per processing
  responseContext.webSearchResults = webSearchResults.map((r: unknown, idx: number) => ({
    index: idx + 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    title: (r as any).title || 'Senza titolo',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    url: (r as any).url || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: (r as any).content || '',
  }))

  responseContext.metaQueryDocuments = metaQueryDocuments.map((doc) => ({
    id: doc.id,
    filename: doc.filename,
    index: doc.index,
  }))

  const processingSpanId = createStepSpan(traceId, 'response-processing', {
    responseLength: fullResponse?.length || 0,
    webResultsCount: webSearchResults.length,
    metaDocumentsCount: metaQueryDocuments.length,
  })
  const processed = await processResponse(fullResponse, responseContext)
  finalizeSpan(processingSpanId, {
    processedLength: processed.content?.length || 0,
    sourcesCount: processed.sources?.length || 0,
    webSourcesCount: processed.webSources?.length || 0,
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
    })
  }

  // STEP 12: Invia risposta finale
  streamController.sendTextComplete(processed.content)
  streamController.sendDone(allSources)

  // STEP 13: Salva in cache
  await saveCache(queryToEmbed, queryEmbedding, processed.content, processed.sources)

  // Pulisci context globale (temporaneo)
  clearWebSearchResults()

  // Finalize Langfuse trace
  if (traceId) {
    finalizeTrace(traceId, {
      response: processed.content.substring(0, 500), // Limita lunghezza
      sourcesCount: allSources.length,
      cached: false,
    }, {
      analysis: analysis.intent,
      enhancement: enhancement.shouldEnhance,
      searchResultsCount: searchResults.length,
      relevantResultsCount: relevantResults.length,
    })
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

    // Crea stream
    const stream = createStream(async (streamController) => {
      try {
        await handleChatRequest(
          message,
          conversationId || null,
              webSearchEnabled,
          skipCache,
          streamController
        )
        streamController.close()
        } catch (error) {
        console.error('[api/chat] Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate response'
        streamController.sendError(errorMessage)
        streamController.close()
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
