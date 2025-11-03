import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/embeddings/openai'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { z } from 'zod'

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(20).optional().default(5),
  threshold: z.number().min(0).max(1).optional().default(0.1),
  vectorWeight: z.number().min(0).max(1).optional().default(0.7),
})

/**
 * Diagnostic endpoint to test hybrid search with configurable parameters
 * POST /api/diagnostics/search
 * 
 * Body:
 * {
 *   "query": "search query",
 *   "limit": 5,           // optional, default 5
 *   "threshold": 0.1,     // optional, default 0.1
 *   "vectorWeight": 0.7   // optional, default 0.7
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { query, limit, threshold, vectorWeight } = searchSchema.parse(body)

    console.log('[api/diagnostics/search] Testing search with:', {
      query,
      limit,
      threshold,
      vectorWeight,
    })

    // Generate embedding
    const queryEmbedding = await generateEmbedding(query)
    console.log('[api/diagnostics/search] Embedding generated, dimensions:', queryEmbedding.length)

    // Perform search
    const startTime = Date.now()
    const results = await hybridSearch(queryEmbedding, query, limit, threshold, vectorWeight)
    const searchTime = Date.now() - startTime

    console.log('[api/diagnostics/search] Search completed in', searchTime, 'ms')
    console.log('[api/diagnostics/search] Found', results.length, 'results')

    // Format results for readability
    const formattedResults = results.map((r, index) => ({
      rank: index + 1,
      document: r.document_filename || 'Unknown',
      similarity: parseFloat(r.similarity.toFixed(4)),
      vector_score: r.vector_score ? parseFloat(r.vector_score.toFixed(4)) : null,
      text_score: r.text_score ? parseFloat(r.text_score.toFixed(4)) : null,
      chunk_index: r.chunk_index,
      content_preview: r.content.substring(0, 200) + '...',
      content_length: r.content.length,
    }))

    // Calculate statistics
    const stats = {
      total_results: results.length,
      search_time_ms: searchTime,
      avg_similarity: results.length > 0
        ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
        : 0,
      avg_vector_score: results.length > 0 && results[0].vector_score !== undefined
        ? results.reduce((sum, r) => sum + (r.vector_score || 0), 0) / results.length
        : 0,
      avg_text_score: results.length > 0 && results[0].text_score !== undefined
        ? results.reduce((sum, r) => sum + (r.text_score || 0), 0) / results.length
        : 0,
      max_similarity: results.length > 0
        ? Math.max(...results.map(r => r.similarity))
        : 0,
      min_similarity: results.length > 0
        ? Math.min(...results.map(r => r.similarity))
        : 0,
    }

    return NextResponse.json({
      success: true,
      query,
      parameters: {
        limit,
        threshold,
        vectorWeight,
      },
      statistics: stats,
      results: formattedResults,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }
    console.error('[api/diagnostics/search] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

