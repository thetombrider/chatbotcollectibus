import { supabaseAdmin } from './client'
import type { DocumentChunk } from './database.types'

/**
 * Vector search operations usando pgvector
 */

export interface SearchResult extends DocumentChunk {
  similarity: number
}

/**
 * Cerca chunks simili usando vector similarity
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  limit: number = 5,
  threshold: number = 0.7
): Promise<SearchResult[]> {
  const { data, error } = await supabaseAdmin.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.error('[vector-operations] Search failed:', error)
    throw new Error(`Vector search failed: ${error.message}`)
  }

  return (data || []) as SearchResult[]
}

/**
 * Hybrid search: combina vector similarity + full-text search
 */
export async function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  limit: number = 5,
  threshold: number = 0.7
): Promise<SearchResult[]> {
  const { data, error } = await supabaseAdmin.rpc('hybrid_search', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.error('[vector-operations] Hybrid search failed:', error)
    throw new Error(`Hybrid search failed: ${error.message}`)
  }

  return (data || []) as SearchResult[]
}

/**
 * Inserisce chunks con embeddings nel database
 */
export async function insertDocumentChunks(
  chunks: Array<{
    document_id: string
    content: string
    embedding: number[]
    chunk_index: number
    metadata?: Record<string, unknown>
  }>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('document_chunks')
    .insert(chunks)

  if (error) {
    console.error('[vector-operations] Insert failed:', error)
    throw new Error(`Failed to insert chunks: ${error.message}`)
  }
}

