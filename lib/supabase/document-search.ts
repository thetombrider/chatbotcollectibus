/**
 * Document-level search using summary embeddings
 * 
 * This module provides semantic search at the DOCUMENT level (not chunks).
 * Used for exploratory queries like "documenti che parlano di sostenibilità".
 * 
 * Note: Uses text-embedding-3-small (1536 dimensions) for summaries due to pgvector limit.
 */

import { supabaseAdmin } from './admin'
import { generateEmbeddings } from '../embeddings/openai'

export interface DocumentSearchResult {
  id: string
  filename: string
  summary: string | null
  similarity: number
  file_size: number
  uploaded_at: string
  folder_path: string | null
  processing_status: string
  summary_generated_at: string | null
}

export interface DocumentSearchOptions {
  threshold?: number
  limit?: number
  includeWithoutSummary?: boolean
}

/**
 * Search documents by semantic similarity on summaries
 * 
 * @param query - Natural language query (e.g., "sostenibilità ambientale")
 * @param options - Search configuration
 * @returns Array of matching documents with similarity scores
 * 
 * @example
 * const results = await searchDocumentsBySummary(
 *   "privacy e protezione dati personali",
 *   { threshold: 0.7, limit: 20 }
 * )
 */
export async function searchDocumentsBySummary(
  query: string,
  options: DocumentSearchOptions = {}
): Promise<DocumentSearchResult[]> {
  const {
    threshold = 0.6, // Lower than chunk search (summaries are broader)
    limit = 50,
    includeWithoutSummary = false
  } = options

  console.log('[document-search] Searching documents by summary:', {
    query,
    threshold,
    limit,
    includeWithoutSummary
  })

  try {
    // Generate embedding for the query using small model (1536 dimensions)
    const startEmbed = Date.now()
    const embeddings = await generateEmbeddings([query], 'text-embedding-3-small')
    const queryEmbedding = embeddings[0]
    console.log(`[document-search] Generated query embedding in ${Date.now() - startEmbed}ms`)
    console.log('[document-search] Query for embedding:', query.substring(0, 150))

    // Search using the Postgres function from migration
    const startSearch = Date.now()
    const { data, error } = await supabaseAdmin.rpc('search_documents_by_summary', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit
    })

    if (error) {
      console.error('[document-search] Search failed:', error)
      throw error
    }

    const searchTime = Date.now() - startSearch
    console.log(`[document-search] Found ${data?.length || 0} documents in ${searchTime}ms`)
    
    // Log top results for debugging
    if (data && data.length > 0) {
      console.log('[document-search] Top 5 results:')
      data.slice(0, 5).forEach((doc: DocumentSearchResult, idx: number) => {
        console.log(`  ${idx + 1}. ${doc.filename} (similarity: ${doc.similarity.toFixed(3)})`)
        console.log(`     Summary preview: ${doc.summary?.substring(0, 100) || 'None'}...`)
      })
    } else {
      console.log('[document-search] No documents found - possible reasons:')
      console.log('  1. No documents have summaries generated')
      console.log('  2. Similarity threshold too high')
      console.log('  3. Query embedding does not match any summary embeddings')
    }

    // Filter out documents without summaries if needed
    let results = data || []
    if (!includeWithoutSummary) {
      results = results.filter((doc: DocumentSearchResult) => doc.summary !== null)
      console.log(`[document-search] After filtering: ${results.length} documents with summaries`)
    }

    return results
  } catch (error) {
    console.error('[document-search] Unexpected error:', error)
    throw error
  }
}

/**
 * Get summary for a specific document
 * 
 * @param documentId - Document UUID
 * @returns Document summary or null if not generated
 */
export async function getDocumentSummary(documentId: string): Promise<string | null> {
  console.log('[document-search] Fetching summary for document:', documentId)

  try {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('summary, summary_generated_at')
      .eq('id', documentId)
      .single()

    if (error) {
      console.error('[document-search] Failed to fetch summary:', error)
      throw error
    }

    console.log('[document-search] Summary status:', {
      hasSummary: !!data?.summary,
      generatedAt: data?.summary_generated_at
    })

    return data?.summary || null
  } catch (error) {
    console.error('[document-search] Unexpected error:', error)
    throw error
  }
}

/**
 * Check if a document has a summary generated
 * 
 * @param documentId - Document UUID
 * @returns True if summary exists
 */
export async function hasDocumentSummary(documentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('summary')
      .eq('id', documentId)
      .single()

    if (error) {
      console.error('[document-search] Failed to check summary:', error)
      return false
    }

    return !!data?.summary
  } catch (error) {
    console.error('[document-search] Unexpected error:', error)
    return false
  }
}

/**
 * Count documents with/without summaries
 * 
 * @returns Stats about summary generation coverage
 */
export async function getDocumentSummaryStats(): Promise<{
  total: number
  withSummary: number
  withoutSummary: number
  percentage: number
}> {
  console.log('[document-search] Calculating summary statistics...')

  try {
    // Count total documents
    const { count: total, error: totalError } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true })

    if (totalError) throw totalError

    // Count documents with summaries
    const { count: withSummary, error: summaryError } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .not('summary', 'is', null)

    if (summaryError) throw summaryError

    const totalDocs = total || 0
    const docsWithSummary = withSummary || 0
    const docsWithoutSummary = totalDocs - docsWithSummary
    const percentage = totalDocs > 0 ? (docsWithSummary / totalDocs) * 100 : 0

    const stats = {
      total: totalDocs,
      withSummary: docsWithSummary,
      withoutSummary: docsWithoutSummary,
      percentage: Math.round(percentage * 10) / 10 // Round to 1 decimal
    }

    console.log('[document-search] Summary statistics:', stats)
    return stats
  } catch (error) {
    console.error('[document-search] Failed to calculate stats:', error)
    throw error
  }
}
