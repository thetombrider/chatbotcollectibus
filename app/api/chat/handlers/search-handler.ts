/**
 * Search Handler
 * 
 * Gestisce la logica di ricerca vettoriale e multi-query
 */

import { generateEmbedding } from '@/lib/embeddings/openai'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { extractPossibleFilenames, searchByFilename, combineSearchResults } from '@/lib/supabase/filename-search'
import type { SearchResult } from '@/lib/supabase/database.types'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'

/**
 * Esegue ricerche multiple per query comparative e combina i risultati
 */
export async function performMultiQuerySearch(
  terms: string[],
  originalQuery: string,
  originalEmbedding: number[],
  articleNumber?: number,
  traceId?: string | null
): Promise<SearchResult[]> {
  console.log('[search-handler] Performing multi-query search for terms:', terms)
  
  // Esegui una ricerca per ogni termine
  const searchPromises = terms.map(async (term) => {
    try {
      const targetedQuery = term
      const targetedEmbedding = await generateEmbedding(targetedQuery, 'text-embedding-3-large', traceId)
      
      // Ricerca con threshold più alto per risultati più rilevanti
      const results = await hybridSearch(targetedEmbedding, targetedQuery, 8, 0.25, 0.7, articleNumber)
      
      console.log(`[search-handler] Results for ${term}:`, results.length, 
        results.length > 0 ? `(best: ${results[0]?.similarity.toFixed(3)})` : '')
      
      return results
    } catch (err) {
      console.error(`[search-handler] Search failed for term ${term}:`, err)
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
 */
export async function performSearch(
  query: string,
  queryEmbedding: number[],
  analysis: QueryAnalysisResult,
  articleNumber?: number,
  traceId?: string | null
): Promise<SearchResult[]> {
  const { isComparative, comparativeTerms } = analysis

  let vectorResults: SearchResult[]
  
  if (isComparative && comparativeTerms && comparativeTerms.length >= 2) {
    // Query comparativa: usa strategia multi-query
    vectorResults = await performMultiQuerySearch(comparativeTerms, query, queryEmbedding, articleNumber, traceId)
  } else {
    // Query standard: hybrid search normale
    vectorResults = await hybridSearch(queryEmbedding, query, 10, 0.3, 0.7, articleNumber)
  }

  // Calcola similarità media per decidere se usare fallback
  const avgSimilarity = vectorResults.length > 0
    ? vectorResults.reduce((sum, r) => sum + r.similarity, 0) / vectorResults.length
    : 0
  
  // Strategia 1+2: Cerca sempre per nome file se ci sono termini chiave,
  // ma con priorità quando similarità vettoriale è bassa (< 0.5)
  const possibleFilenames = extractPossibleFilenames(query)
  let filenameResults: SearchResult[] = []
  
  // Cerca per nome file se:
  // 1. Ci sono termini chiave estratti dalla query, OPPURE
  // 2. Similarità vettoriale è bassa (< 0.5) - fallback
  const shouldSearchByFilename = possibleFilenames.length > 0 || avgSimilarity < 0.5
  
  if (shouldSearchByFilename) {
    if (possibleFilenames.length > 0) {
      console.log('[search-handler] Possible filenames detected:', possibleFilenames)
    } else {
      console.log('[search-handler] Low vector similarity detected (avg:', avgSimilarity.toFixed(3), '), using filename search as fallback')
      // Se non ci sono termini chiave ma similarità è bassa, estrai termini dalla query originale
      const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length >= 3)
        .slice(0, 5) // Prendi i primi 5 termini significativi
      possibleFilenames.push(...queryTerms)
    }
    
    filenameResults = await searchByFilename(possibleFilenames, 10)
    console.log('[search-handler] Filename search results:', filenameResults.length)
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

