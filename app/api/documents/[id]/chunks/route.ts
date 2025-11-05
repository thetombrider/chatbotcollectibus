import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { DocumentChunk } from '@/lib/supabase/database.types'

/**
 * GET /api/documents/[id]/chunks
 * Recupera tutti i chunks di un documento con supporto per highlighting
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url)
    const highlight = searchParams.get('highlight') || undefined

    const { data: chunks, error } = await supabaseAdmin
      .from('document_chunks')
      .select('*')
      .eq('document_id', params.id)
      .order('chunk_index', { ascending: true })

    if (error) {
      console.error('[api/documents/[id]/chunks] Get failed:', error)
      throw error
    }

    // Apply highlighting if requested
    let processedChunks = chunks as DocumentChunk[]
    if (highlight) {
      const highlightLower = highlight.toLowerCase()
      processedChunks = processedChunks.map((chunk) => {
        const content = chunk.content
        // Simple highlighting: wrap matching text in spans
        const highlightedContent = content.replace(
          new RegExp(`(${highlightLower})`, 'gi'),
          '<mark>$1</mark>'
        )
        return {
          ...chunk,
          highlightedContent,
        }
      }) as DocumentChunk[]
    }

    return NextResponse.json({
      success: true,
      chunks: processedChunks,
      total: processedChunks.length,
    })
  } catch (error) {
    console.error('[api/documents/[id]/chunks] Get failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to get document chunks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

