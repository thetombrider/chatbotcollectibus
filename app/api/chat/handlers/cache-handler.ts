/**
 * Cache Handler
 * 
 * Gestisce la logica di cache semantica per le risposte
 */

import { findCachedResponse, saveCachedResponse } from '@/lib/supabase/semantic-cache'
import { generateEmbedding } from '@/lib/embeddings/openai'
import type { Source } from '@/lib/services/citation-service'
import { processCitations } from '@/lib/services/citation-service'

export interface CachedResponse {
  response_text: string
  sources: Source[]
}

export interface CacheResult {
  cached: boolean
  response?: string
  sources?: Source[]
}

/**
 * Cerca una risposta cached per la query
 */
export async function lookupCache(
  query: string,
  queryEmbedding: number[],
  skipCache: boolean = false
): Promise<CacheResult> {
  if (skipCache) {
    return { cached: false }
  }

  try {
    const cached = await findCachedResponse(queryEmbedding)
    
    if (!cached || !cached.response_text || cached.response_text.trim().length === 0) {
      return { cached: false }
    }

    // Processa le citazioni nel testo cached usando le sources salvate
    let processedResponse = cached.response_text
    let cachedSources = cached.sources || []
    
    // Estrai citazioni dal testo cached
    const { extractCitedIndices } = await import('@/lib/services/citation-service')
    const citedIndices = extractCitedIndices(cached.response_text)
    
    if (citedIndices.length > 0 && cachedSources.length > 0) {
      // Verifica che gli indici citati corrispondano alle sources salvate
      const validCitedIndices = citedIndices.filter(idx => 
        cachedSources.some(s => s.index === idx)
      )
      
      if (validCitedIndices.length > 0) {
        // Processa citazioni con rinumerazione
        const result = processCitations(processedResponse, cachedSources, 'cit')
        processedResponse = result.content
        cachedSources = result.sources
      } else {
        // Nessuna citazione valida corrisponde alle sources, rimuovi tutte le citazioni
        processedResponse = cached.response_text.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, '')
        cachedSources = []
      }
    } else if (citedIndices.length > 0 && cachedSources.length === 0) {
      // Ci sono citazioni ma non ci sono sources salvate, rimuovi le citazioni
      processedResponse = cached.response_text.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, '')
    }

    return {
      cached: true,
      response: processedResponse,
      sources: cachedSources,
    }
  } catch (error) {
    console.error('[cache-handler] Cache lookup failed:', error)
    return { cached: false }
  }
}

/**
 * Salva una risposta in cache
 */
export async function saveCache(
  query: string,
  queryEmbedding: number[],
  response: string,
  sources: Source[]
): Promise<void> {
  try {
    await saveCachedResponse(query, queryEmbedding, response, sources)
  } catch (error) {
    console.error('[cache-handler] Cache save failed:', error)
    // Non bloccare la risposta se il salvataggio cache fallisce
  }
}

