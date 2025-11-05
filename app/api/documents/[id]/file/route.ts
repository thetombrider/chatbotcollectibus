import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getDocument } from '@/lib/supabase/document-operations'

/**
 * GET /api/documents/[id]/file
 * Get signed URL for document file (for PDF preview)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const document = await getDocument(params.id)
    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Get signed URL for the file (expires in 1 hour)
    const { data, error } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(document.storage_path, 3600)

    if (error) {
      console.error('[api/documents/[id]/file] Failed to create signed URL:', error)
      return NextResponse.json(
        { error: 'Failed to generate file URL' },
        { status: 500 }
      )
    }

    // Redirect to the signed URL
    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    console.error('[api/documents/[id]/file] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to get file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

