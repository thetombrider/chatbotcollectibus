import { NextRequest, NextResponse } from 'next/server'
import { listDocuments } from '@/lib/supabase/document-operations'

/**
 * GET /api/documents
 * Lista tutti i documenti con supporto per ricerca, ordinamento e paginazione
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const sortBy = searchParams.get('sort') || 'created_at'
    const order = searchParams.get('order') || 'desc'
    const limit = parseInt(searchParams.get('limit') || '100')

    // Fetch documenti dal database
    const documents = await listDocuments(limit)

    // Filtra per search term (client-side per semplicità)
    let filtered = documents
    if (search) {
      filtered = documents.filter((doc) =>
        doc.filename.toLowerCase().includes(search.toLowerCase())
      )
    }

    // Ordina documenti
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'name':
        case 'filename':
          comparison = a.filename.localeCompare(b.filename)
          break
        case 'size':
        case 'file_size':
          comparison = a.file_size - b.file_size
          break
        case 'date':
        case 'created_at':
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'chunks':
        case 'chunks_count':
          comparison = (a.chunks_count || 0) - (b.chunks_count || 0)
          break
        default:
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }

      return order === 'asc' ? comparison : -comparison
    })

    return NextResponse.json({
      success: true,
      documents: sorted,
      total: sorted.length,
    })
  } catch (error) {
    console.error('[api/documents] List failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to list documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

