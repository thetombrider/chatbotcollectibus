/**
 * Context Builder Service
 * 
 * Costruisce il contesto per l'LLM dai risultati di ricerca
 */

import type { SearchResult } from '@/lib/supabase/database.types'

/**
 * Deduplica i risultati per document_id, mantenendo solo il chunk con similarity più alta per ogni documento
 * 
 * @param searchResults - Risultati della ricerca vettoriale
 * @returns Array di SearchResult con un solo chunk per documento (quello con similarity più alta)
 */
export function deduplicateByDocument(searchResults: SearchResult[]): SearchResult[] {
  if (searchResults.length === 0) {
    return []
  }

  // Raggruppa per document_id e mantieni solo il chunk con similarity più alta
  const bestChunkPerDocument = new Map<string, SearchResult>()
  
  searchResults.forEach((result) => {
    const existing = bestChunkPerDocument.get(result.document_id)
    
    // Mantieni il chunk con similarity più alta (o il primo se non c'è già uno salvato)
    if (!existing || result.similarity > existing.similarity) {
      bestChunkPerDocument.set(result.document_id, result)
    }
  })
  
  // Ritorna l'array dei migliori chunk, mantenendo l'ordine di similarity
  return Array.from(bestChunkPerDocument.values())
    .sort((a, b) => b.similarity - a.similarity)
}

/**
 * Costruisce il contesto formattato per l'LLM dai risultati di ricerca
 * 
 * @param searchResults - Risultati della ricerca vettoriale
 * @param deduplicateDocuments - Se true, deduplica per document_id (utile per query "list")
 * @returns Contesto formattato con documenti numerati
 */
export function buildContext(searchResults: SearchResult[], deduplicateDocuments: boolean = false): string {
  if (searchResults.length === 0) {
    return ''
  }

  // Se richiesto, deduplica per documento
  const resultsToUse = deduplicateDocuments 
    ? deduplicateByDocument(searchResults)
    : searchResults

  return resultsToUse
    .map((r, index) => {
      const docNumber = index + 1
      const filename = r.document_filename || 'Documento sconosciuto'
      return `[Documento ${docNumber}: ${filename}]\n${r.content}`
    })
    .join('\n\n')
}

/**
 * Estrae i nomi unici dei documenti dai risultati
 */
export function extractUniqueDocumentNames(searchResults: SearchResult[]): string[] {
  const uniqueNames = new Set<string>()
  
  searchResults.forEach((r) => {
    const filename = r.document_filename || 'Documento sconosciuto'
    uniqueNames.add(filename)
  })
  
  return Array.from(uniqueNames)
}

/**
 * Calcola la similarità media dei risultati
 */
export function calculateAverageSimilarity(searchResults: SearchResult[]): number {
  if (searchResults.length === 0) {
    return 0
  }

  const sum = searchResults.reduce((acc, r) => acc + r.similarity, 0)
  return sum / searchResults.length
}

/**
 * Filtra i risultati per soglia di rilevanza
 */
export function filterRelevantResults(
  searchResults: SearchResult[],
  threshold: number = 0.4
): SearchResult[] {
  return searchResults.filter((r) => r.similarity >= threshold)
}

