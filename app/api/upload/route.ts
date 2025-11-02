import { NextRequest, NextResponse } from 'next/server'
import { extractText, chunkText } from '@/lib/processing/document-processor'
import { generateEmbeddings } from '@/lib/embeddings/openai'
import { insertDocumentChunks } from '@/lib/supabase/vector-operations'
import { createDocument } from '@/lib/supabase/document-operations'
import { supabaseAdmin } from '@/lib/supabase/client'

export const maxDuration = 300 // 5 minuti per upload e processing

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    // Validazione file
    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 50MB limit' },
        { status: 400 }
      )
    }

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Supported: PDF, DOCX, TXT' },
        { status: 400 }
      )
    }

    // Upload file su Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `documents/${fileName}`

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('documents')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[api/upload] Upload failed:', uploadError)
      
      // Se il bucket non esiste, suggerisci di crearlo
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('bucket')) {
        return NextResponse.json(
          { 
            error: 'Storage bucket not found. Please create a "documents" bucket in Supabase Storage.',
            details: 'Run the migration: supabase/migrations/20240101000001_storage_bucket.sql'
          },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to upload file', details: uploadError.message },
        { status: 500 }
      )
    }

    // Crea record documento nel database con status 'processing'
    const document = await createDocument(
      file.name,
      file.type,
      file.size,
      filePath,
      {
        uploadedAt: new Date().toISOString(),
        processing_status: 'processing',
      }
    )

    // Aggiorna status a processing
    await supabaseAdmin
      .from('documents')
      .update({ processing_status: 'processing' })
      .eq('id', document.id)

    // Processa documento
    try {
      console.log(`[api/upload] Processing document ${document.id}: ${file.name}`)
      
      const text = await extractText(file)
      
      if (!text || text.trim().length === 0) {
        throw new Error('No text extracted from document')
      }

      console.log(`[api/upload] Extracted ${text.length} characters from ${file.name}`)
      
      const chunks = chunkText(text, 500, 50)

      if (chunks.length === 0) {
        throw new Error('No chunks created from document')
      }

      console.log(`[api/upload] Created ${chunks.length} chunks for ${file.name}`)

      // Genera embeddings per tutti i chunks (batch di 100)
      const chunkTexts = chunks.map((c) => c.content)
      const embeddings = await generateEmbeddings(chunkTexts)

      console.log(`[api/upload] Generated ${embeddings.length} embeddings for ${file.name}`)

      // Prepara chunks con embeddings
      const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        document_id: document.id,
        content: chunk.content,
        embedding: embeddings[index],
        chunk_index: chunk.chunkIndex,
        metadata: {
          ...chunk.metadata,
          documentFilename: file.name,
        },
      }))

      // Inserisci chunks nel database (batch di 1000)
      await insertDocumentChunks(chunksWithEmbeddings)

      // Aggiorna status a completed e chunks_count
      await supabaseAdmin
        .from('documents')
        .update({
          processing_status: 'completed',
          chunks_count: chunks.length,
        })
        .eq('id', document.id)

      console.log(`[api/upload] Successfully processed document ${document.id}`)

      return NextResponse.json({
        success: true,
        documentId: document.id,
        chunksCount: chunks.length,
        status: 'completed',
      })
    } catch (processingError) {
      console.error('[api/upload] Processing failed:', processingError)
      
      const errorMessage = processingError instanceof Error 
        ? processingError.message 
        : 'Unknown processing error'

      // Aggiorna status a error con messaggio
      await supabaseAdmin
        .from('documents')
        .update({
          processing_status: 'error',
          error_message: errorMessage,
        })
        .eq('id', document.id)

      // Elimina documento e file se processing fallisce
      await supabaseAdmin.from('documents').delete().eq('id', document.id)
      await supabaseAdmin.storage.from('documents').remove([filePath])

      return NextResponse.json(
        { 
          error: 'Failed to process document',
          details: errorMessage,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[api/upload] Error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

