import { NextRequest, NextResponse } from 'next/server'
import { batchDeleteDocuments, batchMoveDocuments } from '@/lib/supabase/document-operations'
import { z } from 'zod'

/**
 * DELETE /api/documents/batch
 * Elimina multipli documenti
 */
const batchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
})

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = batchDeleteSchema.parse(body)

    await batchDeleteDocuments(validated.ids)

    return NextResponse.json({
      success: true,
      message: `Deleted ${validated.ids.length} document(s)`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    console.error('[api/documents/batch] Delete failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to batch delete documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/documents/batch
 * Sposta multipli documenti in una cartella
 */
const batchMoveSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  folder: z.string().nullable(),
})

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = batchMoveSchema.parse(body)

    await batchMoveDocuments(validated.ids, validated.folder)

    return NextResponse.json({
      success: true,
      message: `Moved ${validated.ids.length} document(s) to ${validated.folder || 'root'}`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    console.error('[api/documents/batch] Move failed:', error)
    return NextResponse.json(
      {
        error: 'Failed to batch move documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

