import { NextRequest, NextResponse } from 'next/server'
import { getDocument, deleteDocument } from '@/lib/supabase/document-operations'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * GET /api/documents/[id]
 * Recupera un documento singolo per ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    const document = await getDocument(documentId)

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      document,
    })
  } catch (error) {
    console.error('[api/documents/[id]] Get failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to get document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/documents/[id]
 * Elimina un documento e tutti i suoi chunks e embeddings
 * Rimuove anche il file dallo storage
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    // Verifica che il documento esista
    const document = await getDocument(documentId)

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    console.log(`[api/documents/delete] Deleting document ${documentId}: ${document.filename}`)

    // Elimina il file dallo storage (se esiste)
    if (document.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('documents')
        .remove([document.storage_path])

      if (storageError) {
        console.warn(
          `[api/documents/delete] Failed to delete file from storage:`,
          storageError
        )
        // Non blocca l'eliminazione del documento se il file non esiste più
      } else {
        console.log(`[api/documents/delete] Deleted file from storage: ${document.storage_path}`)
      }
    }

    // Elimina il documento (i chunks vengono eliminati automaticamente via CASCADE)
    await deleteDocument(documentId)

    console.log(`[api/documents/delete] Successfully deleted document ${documentId}`)

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully',
      documentId,
    })
  } catch (error) {
    console.error('[api/documents/delete] Delete failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

