/**
 * Response Handler
 * 
 * Gestisce la costruzione e formattazione della risposta finale
 */

import { ragAgent } from '@/lib/mastra/agent'
import { buildSystemPrompt } from '@/lib/llm/system-prompt'
import type { SearchResult } from '@/lib/supabase/database.types'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import { buildContext, extractUniqueDocumentNames, calculateAverageSimilarity, filterRelevantResults } from '../services/context-builder'
import { createKBSources } from '../services/source-service'
import { 
  normalizeWebCitations, 
  processCitations, 
  extractWebCitedIndices,
  extractCitedIndices 
} from '@/lib/services/citation-service'
import type { Source } from '@/lib/services/citation-service'
import type { StreamController } from './stream-handler'

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
  metaQueryDocuments?: Array<{ id: string; filename: string; index: number }>
  webSearchEnabled: boolean
  articleNumber?: number
}

export interface ResponseResult {
  content: string
  sources: Source[]
  webSources: Source[]
}

/**
 * Genera la risposta usando l'agent Mastra
 */
export async function generateResponse(
  context: ResponseContext,
  streamController: StreamController
): Promise<string> {
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
  // - Se ci sono >= 3 risultati con similarità media >= 0.35, fonti sufficienti
  // - Se ci sono < 3 risultati ma similarità media >= 0.45, fonti sufficienti
  // - Altrimenti fonti insufficienti
  const SOURCES_INSUFFICIENT = relevantResults.length === 0 || 
    (relevantResults.length < 3 && avgSimilarity < 0.45) ||
    (relevantResults.length >= 3 && avgSimilarity < 0.35)

  // Calcola uniqueDocumentNames per query comparative
  const uniqueDocumentNames = contextText && analysis.comparativeTerms
    ? extractUniqueDocumentNames(relevantResults)
    : []

  // Costruisci system prompt
  const systemPrompt = buildSystemPrompt({
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
      content: systemPrompt,
    },
    ...conversationHistory,
    {
      role: 'user' as const,
      content: message,
    },
  ]

  // Disabilita tools se abbiamo già context sufficiente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamOptions = (contextText && !(webSearchEnabled && SOURCES_INSUFFICIENT))
    ? { maxToolRoundtrips: 0 }
    : {}

  let fullResponse = ''

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await ragAgent.stream(messages as any, streamOptions as any)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamSource = (result as any).textStream || (result as any).stream || ((result as any)[Symbol.asyncIterator] ? result : null)

    if (streamSource && typeof streamSource[Symbol.asyncIterator] === 'function') {
      let firstChunk = true
      for await (const chunk of streamSource) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content = typeof chunk === 'string' ? chunk : (chunk as any)?.text || (chunk as any)?.content || ''
        if (content) {
          if (firstChunk) {
            streamController.hideStatus()
            firstChunk = false
          }
          
          fullResponse += content
          streamController.sendText(content)
        }
      }
    } else {
      throw new Error('No valid stream source found')
    }
  } catch (streamError) {
    console.error('[response-handler] Stream failed, trying generate():', streamError)
    
    // Fallback a generate() se stream() non funziona
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generated = await ragAgent.generate(messages as any)
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generatedText = (generated as any).text || (generated as any).content || String(generated) || ''
    fullResponse = generatedText
    
    if (fullResponse) {
      streamController.hideStatus()
      
      // Stream la risposta completa in chunks per simulare lo streaming
      const words = fullResponse.split(/\s+/)
      for (const word of words) {
        const chunk = word + ' '
        streamController.sendText(chunk)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
  }

  return fullResponse
}

/**
 * Processa la risposta finale: normalizza citazioni, estrae sources, etc.
 */
export async function processResponse(
  fullResponse: string,
  context: ResponseContext
): Promise<ResponseResult> {
  const { sources, webSearchResults, metaQueryDocuments, analysis } = context

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
  }

  // Processa citazioni KB
  let kbSources: Source[] = []
  const isMetaQuery = analysis.isMeta && analysis.metaType === 'list'
  const hasMetaQueryDocuments = metaQueryDocuments && metaQueryDocuments.length > 0

  if (!isMetaQuery && !hasMetaQueryDocuments) {
    // Query normale: processa citazioni normalmente
    if (citedIndices.length > 0) {
      const kbResult = processCitations(processedResponse, finalSources, 'cit')
      processedResponse = kbResult.content
      kbSources = kbResult.sources
    } else {
      kbSources = []
    }
  } else {
    // Query meta: filtra sources basandosi sulle citazioni
    if (citedIndices.length > 0) {
      const { filterSourcesByCitations, createCitationMapping, renumberCitations } = await import('@/lib/services/citation-service')
      kbSources = filterSourcesByCitations(citedIndices, finalSources)
      const mapping = createCitationMapping(citedIndices)
      processedResponse = renumberCitations(processedResponse, mapping, 'cit')
    } else {
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

  return {
    content: processedResponse,
    sources: kbSources,
    webSources,
  }
}

