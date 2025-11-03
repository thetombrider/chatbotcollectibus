import { supabaseAdmin } from './admin'
import type { SearchResult } from './database.types'

/**
 * Vector search operations usando pgvector
 */

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
 * 
 * @param queryEmbedding - Vector embedding della query
 * @param queryText - Testo originale della query
 * @param limit - Numero massimo di risultati
 * @param threshold - Soglia minima di similarity
 * @param vectorWeight - Peso per vector similarity (0-1, default 0.7). Il resto va al full-text search.
 * @returns Array di SearchResult ordinati per similarity
 */
export async function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  limit: number = 5,
  threshold: number = 0.7,
  vectorWeight: number = 0.7
): Promise<SearchResult[]> {
  const { data, error } = await supabaseAdmin.rpc('hybrid_search', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    match_threshold: threshold,
    match_count: limit,
    vector_weight: vectorWeight,
  })

  if (error) {
    console.error('[vector-operations] Hybrid search failed:', error)
    throw new Error(`Hybrid search failed: ${error.message}`)
  }

  return (data || []) as SearchResult[]
}

/**
 * Inserisce chunks con embeddings nel database
 * Gestisce automaticamente batch di 1000 elementi per evitare errori di dimensione query
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
  const BATCH_SIZE = 1000
  
  // Se ci sono pochi chunks, inserisci tutto insieme
  if (chunks.length <= BATCH_SIZE) {
    const { error } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunks)

    if (error) {
      console.error('[vector-operations] Insert failed:', error)
      throw new Error(`Failed to insert chunks: ${error.message}`)
    }
    return
  }

  // Per molti chunks, inserisci in batch
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const { error } = await supabaseAdmin
      .from('document_chunks')
      .insert(batch)

    if (error) {
      console.error(`[vector-operations] Insert failed for batch ${i / BATCH_SIZE + 1}:`, error)
      throw new Error(`Failed to insert chunks batch ${i / BATCH_SIZE + 1}: ${error.message}`)
    }
    
    console.log(`[vector-operations] Inserted batch ${i / BATCH_SIZE + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`)
  }
}

