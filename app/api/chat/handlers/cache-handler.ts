/**
 * Cache Handler
 * 
 * Gestisce la logica di cache semantica per le risposte
 * 
 * TRACCIAMENTO LANGFUSE:
 * - cache-lookup viene tracciato come span in route.ts
 * - qui si aggiunge solo metadata aggiuntiva per dettagli interni
 */

import { findCachedResponse, saveCachedResponse } from '@/lib/supabase/semantic-cache'
import type { Source } from '@/lib/services/citation-service'
import { processCitations } from '@/lib/services/citation-service'
import type { TraceContext } from '@/lib/observability/langfuse'

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
 * 
 * NOTA: Il tracciamento avviene a livello di span in route.ts
 * Questa funzione fornisce solo dati per il tracciamento
 */
export async function lookupCache(
  query: string,
  queryEmbedding: number[],
  skipCache: boolean = false,
  _traceContext?: TraceContext | null
): Promise<CacheResult> {
  if (skipCache) {
    console.log('[cache-handler] Cache lookup skipped (skipCache=true)')
    return { cached: false }
  }

  try {
    const cached = await findCachedResponse(queryEmbedding)
    
    if (!cached || !cached.response_text || cached.response_text.trim().length === 0) {
      console.log('[cache-handler] Cache miss')
      return { cached: false }
    }

    console.log('[cache-handler] Cache hit found', {
      responseLength: cached.response_text.length,
      sourcesCount: cached.sources?.length || 0,
    })

    // Processa le citazioni nel testo cached usando le sources salvate
    let processedResponse = cached.response_text
    // Normalizza sources: assicura che chunkIndex sia un numero (usa 0 se null/undefined)
    // Non filtrare sources con chunkIndex null - potrebbero essere meta query sources
    let cachedSources: Source[] = (cached.sources || [])
      .map(s => ({
        ...s,
        chunkIndex: s.chunkIndex ?? 0,
      })) as Source[]
    
    // Log per debugging: verifica che le sources siano presenti dopo la normalizzazione
    console.log('[cache-handler] Normalized sources:', {
      originalCount: cached.sources?.length || 0,
      normalizedCount: cachedSources.length,
      sampleSources: cachedSources.slice(0, 3).map(s => ({
        index: s.index,
        filename: s.filename,
        chunkIndex: s.chunkIndex,
      })),
    })
    
    // Estrai citazioni dal testo cached
    const { extractCitedIndices } = await import('@/lib/services/citation-service')
    const citedIndices = extractCitedIndices(cached.response_text)
    
    // Log per debugging: verifica quali citazioni sono presenti
    console.log('[cache-handler] Citations found in cached text:', {
      citedIndices,
      citedCount: citedIndices.length,
    })
    
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
        
        // Log per debugging: verifica il risultato del processing
        console.log('[cache-handler] Citations processed:', {
          originalCitedCount: citedIndices.length,
          validCitedCount: validCitedIndices.length,
          finalSourcesCount: cachedSources.length,
        })
      } else {
        // Nessuna citazione valida corrisponde alle sources, rimuovi tutte le citazioni
        console.warn('[cache-handler] No valid citations match saved sources, removing all citations')
        processedResponse = cached.response_text.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, '')
        cachedSources = []
      }
    } else if (citedIndices.length > 0 && cachedSources.length === 0) {
      // Ci sono citazioni ma non ci sono sources salvate, rimuovi le citazioni
      console.warn('[cache-handler] Citations found but no sources available, removing citations')
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

