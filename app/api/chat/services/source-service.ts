/**
 * Source Service
 * 
 * Gestisce la creazione e manipolazione delle sources (documenti KB + web)
 */

import type { SearchResult } from '@/lib/supabase/database.types'
import type { Source } from '@/lib/services/citation-service'

export interface WebSearchResult {
  index: number
  title: string
  url: string
  content: string
}

export interface MetaDocument {
  id: string
  filename: string
  index: number
  folder?: string | null
  chunkCount?: number
  contentPreview?: string
  chunkPreviews?: Array<{ chunkIndex: number; content: string }>
  fileType?: string
  createdAt?: string
  updatedAt?: string
  processingStatus?: string | null
}

/**
 * Converte SearchResult in Source per KB
 */
export function createKBSources(searchResults: SearchResult[]): Source[] {
  return searchResults.map((r, index) => ({
    index: index + 1,
    documentId: r.document_id,
    filename: r.document_filename || 'Documento sconosciuto',
    similarity: r.similarity,
    content: r.content.substring(0, 1000) + (r.content.length > 1000 ? '...' : ''), // Preview del chunk
    chunkIndex: r.chunk_index,
    type: 'kb' as const,
  }))
}

/**
 * Converte WebSearchResult in Source per web
 */
export function createWebSources(
  webResults: WebSearchResult[],
  citedIndices: number[]
): Source[] {
  const sortedCitedIndices = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
  
  const sources: Source[] = []
  for (let idx = 0; idx < sortedCitedIndices.length; idx++) {
    const citedIndex = sortedCitedIndices[idx]
    // Gli indici nella risposta partono da 1, quindi sottraiamo 1 per accedere all'array
    const webResult = webResults[citedIndex - 1]
    if (webResult) {
      sources.push({
        index: idx + 1, // Rinumerazione sequenziale (1, 2, 3...)
        documentId: '', // Web sources non hanno documentId
        filename: webResult.title || 'Senza titolo',
        similarity: 1.0, // Web sources non hanno similarity
        content: webResult.content || '',
        chunkIndex: 0, // Web sources non hanno chunkIndex
        type: 'web' as const,
        title: webResult.title || 'Senza titolo',
        url: webResult.url || '',
      })
    }
  }
  return sources
}

/**
 * Converte MetaDocument in Source per query meta
 */
export function createMetaSources(metaDocuments: MetaDocument[]): Source[] {
  return metaDocuments
    .sort((a, b) => a.index - b.index) // Ordina per indice per sicurezza
    .map((doc) => ({
      index: doc.index,
      documentId: doc.id,
      filename: doc.filename,
      type: 'kb' as const,
      // Per query meta, non abbiamo similarity o chunkIndex perché il riferimento è all'intero documento
      similarity: 1.0, // Similarity fittizia per query meta (non usata)
      content: '', // Content vuoto perché il riferimento è all'intero documento, non a un chunk specifico
      chunkIndex: 0, // ChunkIndex fittizio per query meta (non usato)
    }))
}

/**
 * Combina sources KB e web in un unico array
 */
export function combineSources(kbSources: Source[], webSources: Source[]): Source[] {
  return [...kbSources, ...webSources]
}

