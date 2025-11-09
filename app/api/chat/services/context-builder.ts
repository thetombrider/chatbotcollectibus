/**
 * Context Builder Service
 * 
 * Costruisce il contesto per l'LLM dai risultati di ricerca
 */

import type { SearchResult } from '@/lib/supabase/database.types'

/**
 * Costruisce il contesto formattato per l'LLM dai risultati di ricerca
 * 
 * @param searchResults - Risultati della ricerca vettoriale
 * @returns Contesto formattato con documenti numerati
 */
export function buildContext(searchResults: SearchResult[]): string {
  if (searchResults.length === 0) {
    return ''
  }

  return searchResults
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

