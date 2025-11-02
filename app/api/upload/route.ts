import { NextRequest, NextResponse } from 'next/server'
import { extractText, chunkText } from '@/lib/processing/document-processor'
import { generateEmbeddings } from '@/lib/embeddings/openai'
import { insertDocumentChunks } from '@/lib/supabase/vector-operations'
import { createDocument } from '@/lib/supabase/document-operations'
import { supabaseAdmin } from '@/lib/supabase/client'

export const maxDuration = 300 // 5 minuti per upload e processing

/**
 * Helper per inviare progress update via Server-Sent Events
 */
function sendProgress(
  controller: ReadableStreamDefaultController,
  stage: string,
  progress: number,
  message?: string
) {
  const data = JSON.stringify({ stage, progress, message })
  controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
}

export async function POST(req: NextRequest) {
  // Controlla se il client richiede streaming (query param ?stream=true)
  const url = new URL(req.url)
  const useStreaming = url.searchParams.get('stream') === 'true'

  // Se streaming è richiesto, usa Server-Sent Events
  if (useStreaming) {
    // Leggi formData prima di creare lo stream
    const formData = await req.formData()
    const file = formData.get('file') as File

    const stream = new ReadableStream({
      async start(controller) {
        try {

          if (!file) {
            sendProgress(controller, 'error', 0, 'File is required')
            controller.close()
            return
          }

          // Validazione file
          const maxSize = 50 * 1024 * 1024 // 50MB
          if (file.size > maxSize) {
            sendProgress(controller, 'error', 0, 'File size exceeds 50MB limit')
            controller.close()
            return
          }

          const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
          ]
          if (!allowedTypes.includes(file.type)) {
            sendProgress(controller, 'error', 0, 'Unsupported file type. Supported: PDF, DOCX, TXT')
            controller.close()
            return
          }

          // Fase 1: Upload file (10%)
          sendProgress(controller, 'uploading', 10, 'Uploading file to storage...')
          
          const fileExt = file.name.split('.').pop()
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
          const filePath = `documents/${fileName}`

          const { error: uploadError } = await supabaseAdmin.storage
            .from('documents')
            .upload(filePath, file, {
              contentType: file.type,
              upsert: false,
            })

          if (uploadError) {
            console.error('[api/upload] Upload failed:', uploadError)
            
            let errorMsg = 'Failed to upload file'
            if (uploadError.message?.includes('not found') || uploadError.message?.includes('bucket')) {
              errorMsg = 'Storage bucket not found. Please create a "documents" bucket in Supabase Storage.'
            } else {
              errorMsg = `Failed to upload file: ${uploadError.message}`
            }
            
            sendProgress(controller, 'error', 0, errorMsg)
            controller.close()
            return
          }

          // Fase 2: Crea record documento (20%)
          sendProgress(controller, 'processing', 20, 'Creating document record...')
          
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

          await supabaseAdmin
            .from('documents')
            .update({ processing_status: 'processing' })
            .eq('id', document.id)

          // Fase 3: Estrazione testo (30%)
          sendProgress(controller, 'processing', 30, 'Extracting text from document...')
          
          const text = await extractText(file)
          
          if (!text || text.trim().length === 0) {
            throw new Error('No text extracted from document')
          }

          // Fase 4: Chunking (40%)
          sendProgress(controller, 'processing', 40, 'Chunking document text...')
          
          const chunks = chunkText(text, 500, 50)

          if (chunks.length === 0) {
            throw new Error('No chunks created from document')
          }

          // Fase 5: Generazione embeddings (40-80%)
          const chunkTexts = chunks.map((c) => c.content)
          const totalBatches = Math.ceil(chunks.length / 100)
          
          sendProgress(controller, 'processing', 50, `Generating embeddings (0/${totalBatches} batches)...`)
          
          // Genera embeddings con progress tracking
          const embeddings: number[][] = []
          const MAX_BATCH_SIZE = 100
          
          for (let i = 0; i < chunkTexts.length; i += MAX_BATCH_SIZE) {
            const batch = chunkTexts.slice(i, i + MAX_BATCH_SIZE)
            const batchIndex = Math.floor(i / MAX_BATCH_SIZE) + 1
            
            // Progress durante generazione embeddings: 50-80%
            const embedProgress = 50 + (batchIndex / totalBatches) * 30
            sendProgress(
              controller,
              'processing',
              embedProgress,
              `Generating embeddings (${batchIndex}/${totalBatches} batches)...`
            )
            
            const { generateEmbeddings: genEmbeddings } = await import('@/lib/embeddings/openai')
            const batchEmbeddings = await genEmbeddings(batch)
            embeddings.push(...batchEmbeddings)
          }

          // Fase 6: Preparazione chunks (80-85%)
          sendProgress(controller, 'processing', 85, 'Preparing chunks with embeddings...')
          
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

          // Fase 7: Inserimento nel database (85-95%)
          const totalChunks = chunksWithEmbeddings.length
          const insertBatchSize = 1000
          const totalInsertBatches = Math.ceil(totalChunks / insertBatchSize)
          
          sendProgress(controller, 'processing', 90, `Inserting chunks into database (0/${totalInsertBatches} batches)...`)
          
          for (let i = 0; i < chunksWithEmbeddings.length; i += insertBatchSize) {
            const batch = chunksWithEmbeddings.slice(i, i + insertBatchSize)
            const batchIndex = Math.floor(i / insertBatchSize) + 1
            
            const insertProgress = 90 + (batchIndex / totalInsertBatches) * 5
            sendProgress(
              controller,
              'processing',
              insertProgress,
              `Inserting chunks (${batchIndex}/${totalInsertBatches} batches)...`
            )
            
            await insertDocumentChunks(batch)
          }

          // Fase 8: Completamento (95-100%)
          sendProgress(controller, 'processing', 95, 'Finalizing...')
          
          await supabaseAdmin
            .from('documents')
            .update({
              processing_status: 'completed',
              chunks_count: chunks.length,
            })
            .eq('id', document.id)

          // Invio risultato finale
          const finalResult = JSON.stringify({
            stage: 'completed',
            progress: 100,
            documentId: document.id,
            chunksCount: chunks.length,
            message: 'Document processed successfully',
          })
          controller.enqueue(new TextEncoder().encode(`data: ${finalResult}\n\n`))
          controller.close()
        } catch (error) {
          console.error('[api/upload] Processing failed:', error)
          
          const errorMessage = error instanceof Error 
            ? error.message 
            : 'Unknown processing error'

          sendProgress(controller, 'error', 0, errorMessage)
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  // Codice originale per compatibilità senza streaming
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

    const { error: uploadError } = await supabaseAdmin.storage
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

