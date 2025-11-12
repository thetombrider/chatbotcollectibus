/**
 * Response Handler
 * 
 * Gestisce la costruzione e formattazione della risposta finale
 */

import { getRagAgentForModel, runWithAgentContext, getMetaQueryDocuments, getMetaQueryChunks, getWebSearchResults } from '@/lib/mastra/agent'
import { buildSystemPrompt } from '@/lib/llm/system-prompt'
import { DEFAULT_FLASH_MODEL, DEFAULT_PRO_MODEL } from '@/lib/llm/models'
import type { SearchResult } from '@/lib/supabase/database.types'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import { extractUniqueDocumentNames, calculateAverageSimilarity } from '../services/context-builder'
import { 
  normalizeWebCitations, 
  processCitations, 
  extractWebCitedIndices,
  extractCitedIndices 
} from '@/lib/services/citation-service'
import type { Source } from '@/lib/services/citation-service'
import type { MetaDocument } from '../services/source-service'
import type { StreamController } from './stream-handler'
import { 
  createGeneration,
  endGeneration,
  type TraceContext 
} from '@/lib/observability/langfuse'

export interface ResponseContext {
  message: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  analysis: QueryAnalysisResult
  queryToEmbed: string
  queryEmbedding: number[]
  searchResults: SearchResult[]
  relevantResults: SearchResult[]
  context: string | null
  sources: Source[]
  webSearchResults?: Array<{ index: number; title: string; url: string; content: string }>
  metaQueryDocuments?: MetaDocument[]
  metaQueryChunks?: SearchResult[]
  webSearchEnabled: boolean
  articleNumber?: number
  traceContext?: TraceContext | null
}

export interface ResponseResult {
  content: string
  sources: Source[]
  webSources: Source[]
}

export interface GenerateResponseResult {
  fullResponse: string
  metaQueryDocuments?: MetaDocument[]
  metaQueryChunks?: SearchResult[] // Chunks effettivi dei documenti meta query
  webSearchResults?: Array<{ index: number; title: string; url: string; content: string }>
}

/**
 * Genera la risposta usando l'agent Mastra
 */
export async function generateResponse(
  context: ResponseContext,
  streamController: StreamController
): Promise<GenerateResponseResult> {
  const {
    message,
    conversationHistory,
    analysis,
    relevantResults,
    context: contextText,
    webSearchEnabled,
    articleNumber,
  } = context

  const isMetaQuery = analysis.isMeta && analysis.metaType === 'list'
  const avgSimilarity = calculateAverageSimilarity(relevantResults)
  
  // Logica migliorata per determinare se le fonti sono sufficienti:
  // BASE LOGIC: Valuta la qualità semantica dei risultati
  const baseSourcesTooWeak = relevantResults.length === 0 || 
    (relevantResults.length < 3 && avgSimilarity < 0.55) ||
    (relevantResults.length >= 3 && avgSimilarity < 0.50)
  
  // TEMPORAL OVERRIDE: Query temporali richiedono sempre ricerca web se abilitata
  const needsWebForTemporal = webSearchEnabled && analysis.hasTemporal
  
  // EXPLICIT OVERRIDE: Utente ha chiesto esplicitamente ricerca web
  const needsWebForExplicitRequest = webSearchEnabled && analysis.hasWebSearchRequest
  
  // USER PREFERENCE OVERRIDE: Utente ha attivato ricerca web e dovrebbe avere precedenza per query generiche
  const userWantsWebSearch = webSearchEnabled && analysis.intent === 'general' && !contextText
  
  // FINAL DECISION: Fonti sono insufficienti se:
  // 1. Qualità semantica troppo bassa (base logic), O
  // 2. Query temporale con web search abilitato, O  
  // 3. Richiesta esplicita di web search, O
  // 4. Utente vuole web search per query generica senza contesto
  const SOURCES_INSUFFICIENT = baseSourcesTooWeak || needsWebForTemporal || needsWebForExplicitRequest || userWantsWebSearch
  
  // Log per debugging
  console.log('[response-handler] Sources evaluation:', {
    resultsCount: relevantResults.length,
    avgSimilarity: avgSimilarity.toFixed(3),
    sourcesInsufficient: SOURCES_INSUFFICIENT,
    hasContext: contextText !== null,
    contextLength: contextText?.length || 0,
    // New temporal and web search logic
    hasTemporal: analysis.hasTemporal,
    temporalTerms: analysis.temporalTerms,
    hasWebSearchRequest: analysis.hasWebSearchRequest,
    webSearchCommand: analysis.webSearchCommand,
    webSearchEnabled,
    // Decision factors
    baseSourcesTooWeak,
    needsWebForTemporal,
    needsWebForExplicitRequest, 
    userWantsWebSearch,
  })

  // Calcola uniqueDocumentNames per query comparative
  const uniqueDocumentNames = contextText && analysis.comparativeTerms
    ? extractUniqueDocumentNames(relevantResults)
    : []

  // Costruisci system prompt (now async with Langfuse)
  const { text: systemPromptText, config: systemPromptConfig } = await buildSystemPrompt({
    hasContext: contextText !== null,
    context: contextText || undefined,
    documentCount: relevantResults.length,
    uniqueDocumentNames,
    comparativeTerms: analysis.comparativeTerms || undefined,
    articleNumber,
    webSearchEnabled,
    sourcesInsufficient: SOURCES_INSUFFICIENT,
    avgSimilarity,
    isMetaQuery,
  })

  const messages = [
    {
      role: 'system' as const,
      content: systemPromptText,
    },
    ...conversationHistory,
    {
      role: 'user' as const,
      content: message,
    },
  ]

  // Disabilita tools solo se abbiamo context E le fonti sono sufficienti
  // IMPORTANTE: Se le fonti sono insufficienti, permette sempre i tool (anche se c'è un context piccolo)
  // Questo garantisce che web_search venga chiamato quando necessario
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shouldDisableTools = contextText && !SOURCES_INSUFFICIENT
  const streamOptions = shouldDisableTools
    ? { maxToolRoundtrips: 0 }
    : {}
  
  console.log('[response-handler] Stream options:', {
    hasContext: !!contextText,
    contextLength: contextText?.length || 0,
    webSearchEnabled,
    sourcesInsufficient: SOURCES_INSUFFICIENT,
    shouldDisableTools,
    maxToolRoundtrips: streamOptions.maxToolRoundtrips || 'unlimited',
  })

  let fullResponse = ''
  let capturedMetaDocuments: Array<{ id: string; filename: string; index: number }> = []
  let capturedMetaChunks: SearchResult[] = []
  let capturedWebResults: Array<{ index: number; title: string; url: string; content: string }> = []

  const promptModel =
    systemPromptConfig && typeof (systemPromptConfig as { model?: unknown }).model === 'string'
      ? (systemPromptConfig as { model: string }).model
      : undefined

  const fallbackModel = analysis.isComparative ? DEFAULT_PRO_MODEL : DEFAULT_FLASH_MODEL
  const requestedModel = promptModel ?? fallbackModel
  const selectedAgent = getRagAgentForModel(requestedModel)

  console.log('[response-handler] Selected LLM model', {
    requestedModel,
    normalizedModel: selectedAgent.model,
    source: promptModel ? 'langfuse-config' : 'fallback',
    isComparative: analysis.isComparative,
  })

  // Esegui l'agent con il contesto per passare traceContext e risultati
  await runWithAgentContext(
    {
      traceId: context.traceContext?.traceId || null,
      webSearchResults: [],
      metaQueryDocuments: context.metaQueryDocuments || [],
      metaQueryChunks: context.metaQueryChunks || [],
    },
    async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await selectedAgent.stream(messages as any, streamOptions as any)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const streamSource = (result as any).textStream || (result as any).stream || ((result as any)[Symbol.asyncIterator] ? result : null)

        if (streamSource && typeof streamSource[Symbol.asyncIterator] === 'function') {
          let firstChunk = true
          for await (const chunk of streamSource) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content = typeof chunk === 'string' ? chunk : (chunk as any)?.text || (chunk as any)?.content || ''
            if (content) {
              if (firstChunk) {
                try {
                  streamController.hideStatus()
                } catch (error) {
                  // Controller potrebbe essere chiuso, continua comunque
                  console.warn('[response-handler] Failed to hide status:', error)
                }
                firstChunk = false
              }
              
              fullResponse += content
              try {
                streamController.sendText(content)
              } catch (error) {
                // Controller potrebbe essere chiuso, continua comunque
                console.warn('[response-handler] Failed to send text chunk:', error)
              }
            }
          }
        } else {
          throw new Error('No valid stream source found')
        }
      } catch (streamError) {
        console.error('[response-handler] Stream failed, trying generate():', streamError)
        
        // Fallback a generate() se stream() non funziona
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const generated = await selectedAgent.generate(messages as any)
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const generatedText = (generated as any).text || (generated as any).content || String(generated) || ''
          fullResponse = generatedText
          
          if (fullResponse) {
            try {
              streamController.hideStatus()
              
              // Stream la risposta completa in chunks per simulare lo streaming
              const words = fullResponse.split(/\s+/)
              for (const word of words) {
                const chunk = word + ' '
                try {
                  streamController.sendText(chunk)
                } catch (error) {
                  // Controller chiuso, interrompi lo streaming
                  console.warn('[response-handler] Stream controller closed during fallback streaming')
                  break
                }
                await new Promise(resolve => setTimeout(resolve, 10))
              }
            } catch (error) {
              // Controller chiuso, continua comunque per salvare la risposta
              console.warn('[response-handler] Stream controller closed during fallback:', error)
            }
          }
        } catch (generateError) {
          console.error('[response-handler] Generate fallback also failed:', generateError)
          // Continua comunque per recuperare i risultati dal context
        }
      }
      
      // IMPORTANTE: Recupera i documenti E chunks dal context PRIMA di uscire da runWithAgentContext
      // Se non lo facciamo qui, il context dell'AsyncLocalStorage viene perso
      capturedMetaDocuments = getMetaQueryDocuments()
      capturedMetaChunks = getMetaQueryChunks()
      capturedWebResults = getWebSearchResults()
      
      console.log('[response-handler] Captured from agent context:', {
        metaDocumentsCount: capturedMetaDocuments.length,
        metaChunksCount: capturedMetaChunks.length,
        webResultsCount: capturedWebResults.length,
        webResultsSample: capturedWebResults.slice(0, 2).map(r => ({
          index: (r as { index?: number }).index,
          hasTitle: !!(r as { title?: string }).title,
          hasUrl: !!(r as { url?: string }).url,
        })),
      })
    }
  )

  // Log main LLM call to Langfuse (after streaming completes)
  // NOTA: Mastra agent non espone token usage direttamente, quindi loghiamo senza usage
  // Se possibile, in futuro intercettare i token usage dal response stream
  if (context.traceContext && fullResponse) {
    // Crea generation per la chiamata LLM principale
    const generation = createGeneration(
      context.traceContext.trace,
      'chat-response',
      'openrouter/google/gemini-2.5-flash', // Model from agent config
      messages,
      {
        operation: 'chat-response',
        messageLength: message.length,
        hasContext: contextText !== null,
        contextLength: contextText?.length || 0,
        sourcesInsufficient: SOURCES_INSUFFICIENT,
        avgSimilarity,
      }
    )

    // Finalizza generation con output
    endGeneration(
      generation,
      fullResponse,
      undefined, // Usage not available from Mastra stream
      {
        responseLength: fullResponse.length,
      }
    )
  }

  return {
    fullResponse,
    metaQueryDocuments: capturedMetaDocuments,
    metaQueryChunks: capturedMetaChunks as SearchResult[], // Chunks effettivi per contesto RAG
    webSearchResults: capturedWebResults.map((r: unknown) => ({
      index: (r as { index: number }).index,
      title: (r as { title: string }).title || 'Senza titolo',
      url: (r as { url: string }).url || '',
      content: (r as { content: string }).content || '',
    })),
  }
}

/**
 * Processa la risposta finale: normalizza citazioni, estrae sources, etc.
 */
export async function processResponse(
  fullResponse: string,
  context: ResponseContext
): Promise<ResponseResult> {
  const { sources, webSearchResults, metaQueryDocuments, analysis } = context

  console.log('[response-handler] processResponse called with context:', {
    sourcesCount: sources.length,
    webSearchResultsCount: webSearchResults?.length || 0,
    metaQueryDocumentsCount: metaQueryDocuments?.length || 0,
    isMeta: analysis.isMeta,
    metaType: analysis.metaType,
  })

  // Normalizza citazioni web errate
  let processedResponse = normalizeWebCitations(fullResponse)

  // Estrai citazioni
  const citedIndices = extractCitedIndices(processedResponse)
  const webCitedIndices = extractWebCitedIndices(processedResponse)

  // Gestisci sources per query meta
  let finalSources = sources
  if (metaQueryDocuments && metaQueryDocuments.length > 0) {
    const { createMetaSources } = await import('../services/source-service')
    finalSources = createMetaSources(metaQueryDocuments)
    console.log('[response-handler] Created meta sources:', {
      count: finalSources.length,
      sample: finalSources.slice(0, 3).map(s => ({
        index: s.index,
        filename: s.filename,
      })),
    })
  }

  // Processa citazioni KB
  let kbSources: Source[] = []
  const isMetaQuery = analysis.isMeta && analysis.metaType === 'list'
  const hasMetaQueryDocuments = metaQueryDocuments && metaQueryDocuments.length > 0

  if (!isMetaQuery && !hasMetaQueryDocuments) {
    // Query normale: processa citazioni normalmente
    if (citedIndices.length > 0) {
      // Log per debugging: verifica quali documenti vengono citati
      console.log('[response-handler] Citations found:', citedIndices)
      console.log('[response-handler] Available sources:', finalSources.map(s => ({
        index: s.index,
        filename: s.filename,
        similarity: s.similarity,
      })))
      
      const kbResult = processCitations(processedResponse, finalSources, 'cit')
      processedResponse = kbResult.content
      kbSources = kbResult.sources
      
      // Log per debugging: verifica quali sources sono state selezionate
      console.log('[response-handler] Selected sources after processing:', kbSources.map(s => ({
        index: s.index,
        filename: s.filename,
        similarity: s.similarity,
      })))
    } else {
      kbSources = []
    }
  } else {
    // Query meta: filtra sources basandosi sulle citazioni
    console.log('[response-handler] Meta query detected, processing citations...')
    console.log('[response-handler] Citations in response (first 200 chars):', processedResponse.substring(0, 200))
    
    if (citedIndices.length > 0) {
      console.log('[response-handler] Meta query citations found:', {
        citedIndices: citedIndices.slice(0, 10), // Primi 10 per non loggare troppo
        totalCited: citedIndices.length,
        availableSources: finalSources.length,
      })
      
      const { filterSourcesByCitations, createCitationMapping, renumberCitations } = await import('@/lib/services/citation-service')
      kbSources = filterSourcesByCitations(citedIndices, finalSources)
      
      console.log('[response-handler] Filtered sources:', {
        filteredCount: kbSources.length,
        sample: kbSources.slice(0, 3).map(s => ({
          index: s.index,
          filename: s.filename,
        })),
      })
      
      const mapping = createCitationMapping(citedIndices)
      console.log('[response-handler] Citation mapping (first 10):', {
        mappingSize: mapping.size,
        sample: Array.from(mapping.entries()).slice(0, 10),
      })
      
      processedResponse = renumberCitations(processedResponse, mapping, 'cit')
    } else {
      console.warn('[response-handler] Meta query but no citations found in response!')
      kbSources = []
    }
  }

  // Processa citazioni web
  let webSources: Source[] = []
  if (webCitedIndices.length > 0 && webSearchResults && webSearchResults.length > 0) {
    const { createWebSources } = await import('../services/source-service')
    webSources = createWebSources(webSearchResults, webCitedIndices)
    
    // Rinumerà citazioni web
    const { createCitationMapping, renumberCitations } = await import('@/lib/services/citation-service')
    const webMapping = createCitationMapping(webCitedIndices)
    processedResponse = renumberCitations(processedResponse, webMapping, 'web')
  }

  const result = {
    content: processedResponse,
    sources: kbSources,
    webSources,
  }
  
  // Log finale per verificare cosa viene ritornato
  console.log('[response-handler] Final result:', {
    contentLength: result.content.length,
    sourcesCount: result.sources.length,
    webSourcesCount: result.webSources.length,
    hasCitations: result.content.includes('[cit:'),
    citationSample: result.content.match(/\[cit:\d+\]/g)?.slice(0, 5) || [],
  })
  
  return result
}

