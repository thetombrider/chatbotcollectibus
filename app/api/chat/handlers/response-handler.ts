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
import { processAssistantResponse } from '../../../../lib/jobs/response-processor'
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
  // - Se non ci sono risultati, fonti insufficienti
  // - Se ci sono >= 3 risultati con similarità media >= 0.50, fonti sufficienti (alzato da 0.30 per evitare risultati semanticamente non correlati)
  // - Se ci sono < 3 risultati ma similarità media >= 0.55, fonti sufficienti (alzato da 0.40)
  // - Altrimenti fonti insufficienti
  // NOTA: soglie più alte = maggiore rilevanza semantica richiesta per considerare le fonti sufficienti
  const SOURCES_INSUFFICIENT = relevantResults.length === 0 || 
    (relevantResults.length < 3 && avgSimilarity < 0.55) ||
    (relevantResults.length >= 3 && avgSimilarity < 0.50)
  
  // Log per debugging
  console.log('[response-handler] Sources evaluation:', {
    resultsCount: relevantResults.length,
    avgSimilarity: avgSimilarity.toFixed(3),
    sourcesInsufficient: SOURCES_INSUFFICIENT,
    hasContext: contextText !== null,
    contextLength: contextText?.length || 0,
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
  const processed = await processAssistantResponse({
    content: fullResponse,
    kbSources: context.sources,
    analysis: context.analysis,
    webSearchResults: context.webSearchResults,
    metaDocuments: context.metaQueryDocuments,
  })

  console.log('[response-handler] Final result:', {
    contentLength: processed.content.length,
    sourcesCount: processed.kbSources.length,
    webSourcesCount: processed.webSources.length,
    hasCitations: processed.content.includes('[cit:'),
    citationSample: processed.content.match(/\[cit:\d+\]/g)?.slice(0, 5) || [],
  })

  return {
    content: processed.content,
    sources: processed.kbSources,
    webSources: processed.webSources,
  }
}

