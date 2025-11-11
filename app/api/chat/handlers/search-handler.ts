/**
 * Search Handler
 * 
 * Gestisce la logica di ricerca vettoriale e multi-query
 * 
 * TRACCIAMENTO LANGFUSE:
 * - vector-search viene tracciato come span in route.ts
 * - gli embeddings per le multi-query creano generation objects figli
 */

import { generateEmbedding } from '@/lib/embeddings/openai'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { extractPossibleFilenames, searchByFilename, combineSearchResults } from '@/lib/supabase/filename-search'
import type { SearchResult } from '@/lib/supabase/database.types'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import { createSpan, endSpan, type TraceContext } from '@/lib/observability/langfuse'

/**
 * Esegue ricerche multiple per query comparative e combina i risultati
 * 
 * NOTA: Gli embeddings per ogni termine creano generation objects figli
 * del span vector-search, tracciando correttamente ogni operazione
 */
export async function performMultiQuerySearch(
  terms: string[],
  originalQuery: string,
  originalEmbedding: number[],
  articleNumber?: number,
  traceContext?: TraceContext | null,
  parentSpan?: ReturnType<typeof createSpan> | null
): Promise<SearchResult[]> {
  console.log('[search-handler] Performing multi-query search for terms:', terms)
  
  // Esegui una ricerca per ogni termine
  const searchPromises = terms.map(async (term, index) => {
    // Crea span per la ricerca di questo termine specifico
    const termSpan = (parentSpan && traceContext) ? createSpan(parentSpan, `comparative-search-${index + 1}`, {
      term,
      index: index + 1,
      totalTerms: terms.length,
    }) : null

    try {
      const targetedQuery = term
      // Passa il parentSpan (o termSpan) per creare generation objects figli
      const targetedEmbedding = await generateEmbedding(
        targetedQuery, 
        'text-embedding-3-large', 
        termSpan || parentSpan || (traceContext ? traceContext.trace : null)
      )
      
      // Ricerca con threshold più alto per risultati più rilevanti
      const results = await hybridSearch(targetedEmbedding, targetedQuery, 8, 0.25, 0.7, articleNumber)
      
      console.log(`[search-handler] Results for ${term}:`, results.length, 
        results.length > 0 ? `(best: ${results[0]?.similarity.toFixed(3)})` : '')
      
      // Finalizza span con risultati
      endSpan(termSpan, {
        resultsCount: results.length,
        bestSimilarity: results[0]?.similarity || 0,
      })
      
      return results
    } catch (err) {
      console.error(`[search-handler] Search failed for term ${term}:`, err)
      
      // Segna span come fallito
      endSpan(termSpan, undefined, {
        error: err instanceof Error ? err.message : 'Unknown error',
        failed: true,
      })
      
      return []
    }
  })
  
  // Attendi tutte le ricerche
  const allResults = await Promise.all(searchPromises)
  
  // Combina i risultati, rimuovi duplicati, ordina per similarity
  const combinedMap = new Map<string, SearchResult>()
  allResults.flat().forEach((result: SearchResult) => {
    if (!combinedMap.has(result.id) || combinedMap.get(result.id)!.similarity < result.similarity) {
      combinedMap.set(result.id, result)
    }
  })
  
  const combined = Array.from(combinedMap.values())
    .sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity)
    .slice(0, 15) // Top 15 per avere più diversità
  
  console.log('[search-handler] Combined results:', combined.length, 
    combined.length > 0 ? `(best: ${combined[0]?.similarity.toFixed(3)})` : '')
  
  // Se abbiamo pochi risultati dalla multi-query, aggiungi anche dalla query originale
  if (combined.length < 10) {
    console.log('[search-handler] Adding results from original query to boost coverage')
    const originalResults = await hybridSearch(originalEmbedding, originalQuery, 10, 0.25, 0.7, articleNumber)
    
    originalResults.forEach((result: SearchResult) => {
      if (!combinedMap.has(result.id)) {
        combined.push(result)
      }
    })
    
    // Riordina e limita
    combined.sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity)
    combined.splice(15)
  }
  
  return combined
}

/**
 * Esegue la ricerca vettoriale in base al tipo di query
 * Include anche ricerca per nome file come fallback
 * 
 * NOTA: Questa funzione è chiamata all'interno dello span vector-search creato in route.ts
 * Gli embeddings multi-query creano generation objects figli dello span
 */
export async function performSearch(
  query: string,
  queryEmbedding: number[],
  analysis: QueryAnalysisResult,
  articleNumber?: number,
  traceContext?: TraceContext | null
): Promise<SearchResult[]> {
  const { isComparative, comparativeTerms } = analysis

  // Recupera lo span "vector-search" corrente dal context (se disponibile)
  // In route.ts viene creato con createSpan(traceContext.trace, 'vector-search', ...)
  // Per semplicità, passiamo direttamente il trace per permettere la creazione di span figli
  const parentSpan = null // Lo span è già stato creato in route.ts, qui creiamo figli se necessario

  let vectorResults: SearchResult[]
  
  if (isComparative && comparativeTerms && comparativeTerms.length >= 2) {
    // Query comparativa: usa strategia multi-query
    vectorResults = await performMultiQuerySearch(
      comparativeTerms, 
      query, 
      queryEmbedding, 
      articleNumber, 
      traceContext,
      parentSpan
    )
  } else {
    // Query standard: hybrid search normale
    vectorResults = await hybridSearch(queryEmbedding, query, 10, 0.3, 0.7, articleNumber)
  }

  // Calcola similarità media per decidere se usare fallback
  const avgSimilarity = vectorResults.length > 0
    ? vectorResults.reduce((sum, r) => sum + r.similarity, 0) / vectorResults.length
    : 0
  
  // Filename search è un FALLBACK: viene usata SOLO quando la similarità vettoriale è bassa
  // NOTA: Per query comparative, disabilita completamente il fallback
  //       perché già usano retrieval potenziato (15 chunks) e modello Pro
  const possibleFilenames = extractPossibleFilenames(query)
  let filenameResults: SearchResult[] = []
  
  // Usa filename search SOLO come fallback quando:
  // - Similarità vettoriale è bassa (< 0.5) E
  // - NON è una query comparativa
  const shouldSearchByFilename = !isComparative && avgSimilarity < 0.5
  
  if (shouldSearchByFilename) {
    console.log('[search-handler] Low vector similarity detected (avg:', avgSimilarity.toFixed(3), '), using filename search as fallback')
    
    // Estrai termini dalla query per la ricerca filename
    let searchTerms: string[] = []
    
    // Se ci sono possibili filenames espliciti, usali
    if (possibleFilenames.length > 0) {
      searchTerms = possibleFilenames
      console.log('[search-handler] Using detected filenames:', possibleFilenames)
    } else {
      // Altrimenti, estrai termini dalla query originale
      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length >= 3)
        .slice(0, 5) // Prendi i primi 5 termini significativi
      searchTerms = queryTerms
      console.log('[search-handler] Extracted query terms for filename search:', queryTerms)
    }
    
    filenameResults = await searchByFilename(searchTerms, 10)
    console.log('[search-handler] Filename search results:', filenameResults.length)
  } else if (possibleFilenames.length > 0 && avgSimilarity >= 0.5) {
    // Log informativo: abbiamo possibili filenames ma non li usiamo perché la similarità è buona
    console.log('[search-handler] Filenames detected but similarity is good (avg:', avgSimilarity.toFixed(3), '), skipping filename search')
  }

  // Combina risultati vettoriali e per nome file
  if (filenameResults.length > 0) {
    const combined = combineSearchResults(vectorResults, filenameResults)
    console.log('[search-handler] Combined results:', {
      vector: vectorResults.length,
      filename: filenameResults.length,
      combined: combined.length,
      avgSimilarity: avgSimilarity.toFixed(3),
    })
    return combined
  }

  return vectorResults
}

