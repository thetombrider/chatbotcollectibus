import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * GET /api/documents/folders
 * Lista tutte le cartelle esistenti con conteggio documenti
 */
export async function GET() {
  try {
    // Get all unique folders with document counts
    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select('folder')

    if (error) {
      console.error('[api/documents/folders] List failed:', error)
      throw error
    }

    // Count documents per folder
    const folderCounts = new Map<string, number>()
    let noFolderCount = 0

    documents?.forEach((doc) => {
      if (doc.folder) {
        folderCounts.set(doc.folder, (folderCounts.get(doc.folder) || 0) + 1)
      } else {
        noFolderCount++
      }
    })

    // Convert to array format
    const folders = Array.from(folderCounts.entries()).map(([name, count]) => ({
      name,
      count,
    }))

    // Sort by name
    folders.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      success: true,
      folders,
      noFolderCount,
      total: folders.length,
    })
  } catch (error) {
    console.error('[api/documents/folders] List failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to list folders',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

