import type { SearchResult } from '../supabase/database.types'
import type { Source } from '../services/citation-service'

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

export function createKBSources(searchResults: SearchResult[]): Source[] {
  return searchResults.map((result, index) => ({
    index: index + 1,
    documentId: result.document_id,
    filename: result.document_filename || 'Documento sconosciuto',
    similarity: result.similarity,
    content:
      result.content.substring(0, 1000) + (result.content.length > 1000 ? '...' : ''),
    chunkIndex: result.chunk_index,
    type: 'kb' as const,
  }))
}

export function createWebSources(
  webResults: WebSearchResult[] = [],
  citedIndices: number[] = []
): Source[] {
  const sortedCited = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
  const sources: Source[] = []

  sortedCited.forEach((citedIndex, idx) => {
    const result = webResults[citedIndex - 1]
    if (!result) {
      return
    }

    sources.push({
      index: idx + 1,
      documentId: '',
      filename: result.title || 'Senza titolo',
      similarity: 1,
      content: result.content || '',
      chunkIndex: 0,
      type: 'web',
      title: result.title || 'Senza titolo',
      url: result.url || '',
    })
  })

  return sources
}

export function createMetaSources(metaDocuments: MetaDocument[] = []): Source[] {
  return metaDocuments
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((doc) => ({
      index: doc.index,
      documentId: doc.id,
      filename: doc.filename,
      type: 'kb' as const,
      similarity: 1,
      content: '',
      chunkIndex: 0,
    }))
}

export function combineSources(kbSources: Source[], webSources: Source[]): Source[] {
  return [...kbSources, ...webSources]
}

