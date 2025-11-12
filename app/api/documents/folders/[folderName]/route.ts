import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * DELETE /api/documents/folders/[folderName]
 * Elimina una cartella (imposta folder a null per tutti i documenti in quella cartella)
 */
export async function DELETE(
  request: Request,
  { params }: { params: { folderName: string } }
) {
  try {
    const folderName = decodeURIComponent(params.folderName)

    if (!folderName) {
      return NextResponse.json(
        {
          success: false,
          error: 'Nome cartella richiesto',
        },
        { status: 400 }
      )
    }

    // Update all documents in this folder to have no folder
    const { error } = await supabaseAdmin
      .from('documents')
      .update({ folder: null })
      .eq('folder', folderName)

    if (error) {
      console.error('[api/documents/folders/delete] Update failed:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      message: `Cartella "${folderName}" eliminata. I documenti sono stati spostati in "Nessuna cartella".`,
    })
  } catch (error) {
    console.error('[api/documents/folders/delete] Delete failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Errore durante l\'eliminazione della cartella',
      },
      { status: 500 }
    )
  }
}