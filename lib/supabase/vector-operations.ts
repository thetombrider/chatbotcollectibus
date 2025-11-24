import { supabaseAdmin } from './admin'
import type { SearchResult } from './database.types'

/**
 * Vector search operations usando pgvector
 */

/**
 * Recupera chunks da una lista di document IDs
 * Utile per meta queries quando vogliamo il contenuto di documenti specifici
 * 
 * @param documentIds - Array di document IDs
 * @param limit - Numero massimo di chunks per documento (default: 5)
 * @returns Array di SearchResult con i chunks dei documenti specificati
 */
export async function getChunksByDocumentIds(
  documentIds: string[],
  limit: number = 5
): Promise<SearchResult[]> {
  if (documentIds.length === 0) {
    return []
  }

  try {
    console.log('[vector-operations] Fetching chunks for documents:', {
      documentIds: documentIds.length,
      limitPerDoc: limit,
    })

    // Per ogni documento, recupera i primi N chunks (ordinati per chunk_index)
    const chunkPromises = documentIds.map(async (documentId) => {
      const { data, error } = await supabaseAdmin
        .from('document_chunks')
        .select(`
          id,
          content,
          chunk_index,
          created_at,
          metadata,
          document:documents (
            id,
            filename,
            file_type,
            folder
          )
        `)
        .eq('document_id', documentId)
        .order('chunk_index', { ascending: true })
        .limit(limit)

      if (error) {
        console.error(`[vector-operations] Failed to fetch chunks for document ${documentId}:`, error)
        return []
      }

      // Transform to SearchResult format
      return (data || []).map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        chunk_index: chunk.chunk_index,
        created_at: chunk.created_at,
        metadata: (chunk.metadata as Record<string, unknown> | null) ?? undefined,
        document_id: documentId,
        document_filename: (chunk.document as any)?.filename || 'Unknown',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        file_type: (chunk.document as any)?.file_type || 'unknown',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        folder: (chunk.document as any)?.folder || null,
        similarity: 0.8, // Fixed high similarity since these are explicitly requested documents
      }))
    })

    const allChunks = await Promise.all(chunkPromises)
    const flattenedChunks = allChunks.flat()

    console.log('[vector-operations] Retrieved chunks:', {
      total: flattenedChunks.length,
      perDocument: flattenedChunks.length / documentIds.length,
    })

    return flattenedChunks
  } catch (error) {
    console.error('[vector-operations] getChunksByDocumentIds failed:', error)
    return []
  }
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
 * 
 * @param queryEmbedding - Vector embedding della query
 * @param queryText - Testo originale della query
 * @param limit - Numero massimo di risultati
 * @param threshold - Soglia minima di similarity
 * @param vectorWeight - Peso per vector similarity (0-1, default 0.7). Il resto va al full-text search.
 * @param articleNumber - Optional: filtra chunks per numero articolo specifico (es. 28 per "articolo 28")
 * @returns Array di SearchResult ordinati per similarity
 */
export async function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  limit: number = 5,
  threshold: number = 0.7,
  vectorWeight: number = 0.7,
  articleNumber?: number
): Promise<SearchResult[]> {
  const { data, error } = await supabaseAdmin.rpc('hybrid_search', {
    query_embedding: queryEmbedding,
    query_text: queryText,
    match_threshold: threshold,
    match_count: limit,
    vector_weight: vectorWeight,
    article_number: articleNumber ?? null,
  })

  if (error) {
    console.error('[vector-operations] Hybrid search failed:', error)
    throw new Error(`Hybrid search failed: ${error.message}`)
  }

  // Log filtro articolo se presente
  if (articleNumber) {
    console.log(`[vector-operations] Article filter applied: ${articleNumber}`)
  }

  // Log similarity values per verifica
  if (data && data.length > 0) {
    console.log('[vector-operations] Hybrid search results similarity values:')
    data.forEach((result: Record<string, unknown>, idx: number) => {
      console.log(`  [${idx + 1}] Similarity: ${result.similarity} (raw), ${((result.similarity as number) * 100).toFixed(1)}% (display)`)
      if (result.vector_score !== undefined && result.vector_score !== null) {
        const vectorScore = result.vector_score as number
        const textScore = result.text_score as number | undefined | null
        const textScoreDisplay = textScore !== undefined && textScore !== null 
          ? textScore.toFixed(3) 
          : 'N/A'
        console.log(`      Vector score: ${vectorScore.toFixed(3)}, Text score: ${textScoreDisplay}`)
      }
      // Log article number se presente nei metadati
      if (result.metadata && typeof result.metadata === 'object') {
        const metadata = result.metadata as Record<string, unknown>
        if (metadata.articleNumber) {
          console.log(`      Article number: ${metadata.articleNumber}`)
        }
      }
    })
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
    keywords?: string[]
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

