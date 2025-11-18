import { NextRequest, NextResponse } from 'next/server'
import { extractTextUnified } from '@/lib/processing/document-processor'
import { detectDocumentStructure } from '@/lib/processing/structure-detector'
import { adaptiveChunking } from '@/lib/processing/adaptive-chunking'
import { preprocessChunkContent } from '@/lib/processing/chunk-preprocessing'
import { generateEmbeddings } from '@/lib/embeddings/openai'
import { insertDocumentChunks } from '@/lib/supabase/vector-operations'
import { createDocument, checkDuplicateFilename, deleteDocument, getDocumentVersions } from '@/lib/supabase/document-operations'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateAndSaveSummary } from '@/lib/processing/summary-generation'

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
  try {
    const data = JSON.stringify({ stage, progress, message })
    controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
  } catch (error) {
    console.error('[upload] Failed to send progress:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stage,
      progress,
      messageLength: message?.length || 0
    })
    
    // Invia un messaggio di errore più semplice
    try {
      const errorData = JSON.stringify({ 
        stage: 'error', 
        progress, 
        message: 'Progress update failed' 
      })
      controller.enqueue(new TextEncoder().encode(`data: ${errorData}\n\n`))
    } catch {
      // Se anche questo fallisce, non fare nulla per evitare loop infiniti
    }
  }
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
        const folder = formData.get('folder') as string | null
        const action = formData.get('action') as string | null // 'replace' | 'version'

        const stream = new ReadableStream({
          async start(controller) {
            // Variabili per cleanup in caso di errore
            let document: { id: string } | undefined
            let filePath: string | undefined

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

          // Fase 1: Check for duplicate (10%)
          sendProgress(controller, 'checking', 10, 'Checking for duplicate files...')
          
          const folderValue = folder && folder.trim() !== '' ? folder.trim() : null
          const existingDoc = await checkDuplicateFilename(file.name, folderValue || undefined)

          // If duplicate exists and no action specified, return duplicate flag
          if (existingDoc && !action) {
            const existingVersions = await getDocumentVersions(existingDoc.id)
            const maxVersion = Math.max(...existingVersions.map((v) => v.version || 1))
            
            const duplicateData = {
              duplicate: true,
              existingDocument: {
                id: existingDoc.id,
                filename: existingDoc.filename,
                folder: existingDoc.folder,
                version: existingDoc.version || 1,
                created_at: existingDoc.created_at,
              },
              maxVersion,
            }
            
            const data = JSON.stringify({
              stage: 'duplicate',
              progress: 0,
              message: JSON.stringify(duplicateData),
            })
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`))
            controller.close()
            return
          }

          // Handle replace action: delete old document
          if (existingDoc && action === 'replace') {
            sendProgress(controller, 'processing', 10, 'Replacing existing document...')
            await deleteDocument(existingDoc.id)
            // Also delete storage file
            await supabaseAdmin.storage.from('documents').remove([existingDoc.storage_path])
          }

          // Fase 2: Upload file (20%)
          sendProgress(controller, 'uploading', 20, 'Uploading file to storage...')
          
          const fileExt = file.name.split('.').pop()
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
          filePath = `documents/${fileName}`

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

          // Fase 3: Crea record documento (30%)
          sendProgress(controller, 'processing', 30, 'Creating document record...')
          
          // Determine version and parent_version_id
          let version = 1
          let parentVersionId: string | null = null
          
          if (existingDoc && action === 'version') {
            const existingVersions = await getDocumentVersions(existingDoc.id)
            const maxVersion = Math.max(...existingVersions.map((v) => v.version || 1))
            version = maxVersion + 1
            // Use the original document ID as parent (or the existing doc's parent)
            parentVersionId = existingDoc.parent_version_id || existingDoc.id
          }
          
          document = await createDocument(
            file.name,
            file.type,
            file.size,
            filePath,
            {
              uploadedAt: new Date().toISOString(),
              processing_status: 'processing',
            },
            folderValue,
            version,
            parentVersionId
          )

          await supabaseAdmin
            .from('documents')
            .update({ processing_status: 'processing' })
            .eq('id', document.id)

          // Fase 4: Estrazione testo (40%)
          sendProgress(controller, 'processing', 40, 'Extracting text from document...')
          
          // Usa estrattore unificato (OCR o native)
          const extracted = await extractTextUnified(file)
          const text = extracted.text
          const format = extracted.format
          
          console.log(`[api/upload/stream] Processing method: ${extracted.processingMethod}`)
          console.log(`[api/upload/stream] Format: ${format}`)
          
          if (!text || text.trim().length === 0) {
            throw new Error('No text extracted from document')
          }

          // Fase 5: Chunking (50%)
          sendProgress(controller, 'processing', 50, 'Detecting document structure and chunking...')
          
          // Rileva struttura del documento (articoli, sezioni, capitoli)
          const structure = detectDocumentStructure(text, format)
          console.log(`[api/upload/stream] Detected structure: ${structure.type}, confidence: ${structure.confidence.toFixed(2)}`)
          if (structure.patterns.articles) {
            console.log(`[api/upload/stream] Found ${structure.patterns.articles.length} articles`)
          }
          if (structure.patterns.sections) {
            console.log(`[api/upload/stream] Found ${structure.patterns.sections.length} sections`)
          }
          
          // Usa adaptive chunking per preservare integrità strutturale
          // Target 350 token (sweet spot per text-embeddings-3-large)
          // Chunk per articoli/sezioni quando rilevati, altrimenti sentence-aware
          const chunks = await adaptiveChunking(text, structure, {
            targetTokens: 350,
            maxTokens: 450,
            minTokens: 200,
            preserveStructure: true,
            format: format,
          })

          if (chunks.length === 0) {
            throw new Error('No chunks created from document')
          }
          
          console.log(`[api/upload/stream] Created ${chunks.length} chunks`)
          console.log(`[api/upload/stream] Average tokens per chunk: ${Math.round(chunks.reduce((sum, c) => sum + c.metadata.tokenCount, 0) / chunks.length)}`)

          // Fase 6: Generazione embeddings (50-80%)
          const chunkTexts = chunks.map((c) => c.content)
          const totalBatches = Math.ceil(chunks.length / 100)
          
          sendProgress(controller, 'processing', 60, `Generating embeddings (0/${totalBatches} batches)...`)
          
          // Genera embeddings con progress tracking
          const embeddings: number[][] = []
          const MAX_BATCH_SIZE = 100
          
          for (let i = 0; i < chunkTexts.length; i += MAX_BATCH_SIZE) {
            const batch = chunkTexts.slice(i, i + MAX_BATCH_SIZE)
            const batchIndex = Math.floor(i / MAX_BATCH_SIZE) + 1
            
            // Progress durante generazione embeddings: 60-80%
            const embedProgress = 60 + (batchIndex / totalBatches) * 20
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
          
          if (!document || !document.id) {
            throw new Error('Document not found during chunk preparation')
          }
          
          const documentId = document.id
          const chunksWithEmbeddings = chunks.map((chunk, index) => ({
            document_id: documentId,
            content: preprocessChunkContent(chunk.content), // Preprocessa contenuto prima di salvare
            embedding: embeddings[index],
            chunk_index: chunk.chunkIndex,
            metadata: {
              ...chunk.metadata,
              documentFilename: file.name,
              processingMethod: extracted.processingMethod,
              sourceFormat: format,
              // Aggiungi metadata da OCR se disponibile
              ...extracted.metadata,
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
          
          if (!document || !document.id) {
            throw new Error('Document not found during finalization')
          }
          
          await supabaseAdmin
            .from('documents')
            .update({
              processing_status: 'completed',
              chunks_count: chunks.length,
            })
            .eq('id', document.id)

          // Dispatch async summary generation (non-blocking)
          if (document?.id) {
            const docId = document.id // Capture for closure
            generateAndSaveSummary(docId).catch(error => {
              console.error('[upload] Background summary generation failed:', {
                documentId: docId,
                error: error instanceof Error ? error.message : 'Unknown error'
              })
              // Don't fail the upload, just log the error
            })
          }

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

          // Cleanup: rimuovi document e file se sono stati creati
          try {
            // Se document esiste, fa cleanup
            if (document && document.id) {
              // Aggiorna status a error con messaggio (opzionale, per tracking)
              try {
                await supabaseAdmin
                  .from('documents')
                  .update({
                    processing_status: 'error',
                    error_message: errorMessage,
                  })
                  .eq('id', document.id)
              } catch {
                // Ignora se il documento non esiste più
              }

              // Elimina chunks parziali se presenti (ON DELETE CASCADE dovrebbe gestirli, ma meglio essere espliciti)
              try {
                await supabaseAdmin
                  .from('document_chunks')
                  .delete()
                  .eq('document_id', document.id)
              } catch {
                // Ignora se non ci sono chunks
              }

              // Elimina documento dal database
              try {
                await supabaseAdmin
                  .from('documents')
                  .delete()
                  .eq('id', document.id)
              } catch {
                // Ignora se il documento non esiste più
              }

              // Elimina file da storage (se esiste)
              if (filePath) {
                try {
                  await supabaseAdmin.storage
                    .from('documents')
                    .remove([filePath])
                } catch (storageError) {
                  // Log ma non bloccare se il file non esiste o è già stato rimosso
                  console.warn('[api/upload] Failed to remove file from storage:', storageError)
                }
              }

              console.log(`[api/upload] Cleaned up failed document ${document.id}`)
            }
          } catch (cleanupError) {
            // Log cleanup errors ma non bloccare il processo
            console.error('[api/upload] Cleanup failed:', cleanupError)
          }

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
      
      // Usa estrattore unificato (OCR o native)
      const extracted = await extractTextUnified(file)
      const text = extracted.text
      const format = extracted.format
      
      console.log(`[api/upload] Processing method: ${extracted.processingMethod}`)
      console.log(`[api/upload] Format: ${format}`)
      
      if (!text || text.trim().length === 0) {
        throw new Error('No text extracted from document')
      }

      console.log(`[api/upload] Extracted ${text.length} characters from ${file.name}`)
      
      // Rileva struttura del documento (articoli, sezioni, capitoli)
      const structure = detectDocumentStructure(text, format)
      console.log(`[api/upload] Detected structure: ${structure.type}, confidence: ${structure.confidence.toFixed(2)}`)
      if (structure.patterns.articles) {
        console.log(`[api/upload] Found ${structure.patterns.articles.length} articles`)
      }
      if (structure.patterns.sections) {
        console.log(`[api/upload] Found ${structure.patterns.sections.length} sections`)
      }
      
      // Usa adaptive chunking per preservare integrità strutturale
      // Target 350 token (sweet spot per text-embeddings-3-large)
      // Chunk per articoli/sezioni quando rilevati, altrimenti sentence-aware
      const chunks = await adaptiveChunking(text, structure, {
        targetTokens: 350,
        maxTokens: 450,
        minTokens: 200,
        preserveStructure: true,
        format: format,
      })

      if (chunks.length === 0) {
        throw new Error('No chunks created from document')
      }

      console.log(`[api/upload] Created ${chunks.length} chunks for ${file.name}`)
      console.log(`[api/upload] Average tokens per chunk: ${Math.round(chunks.reduce((sum, c) => sum + c.metadata.tokenCount, 0) / chunks.length)}`)

      // Genera embeddings per tutti i chunks (batch di 100)
      const chunkTexts = chunks.map((c) => c.content)
      const embeddings = await generateEmbeddings(chunkTexts)

      console.log(`[api/upload] Generated ${embeddings.length} embeddings for ${file.name}`)

      // Prepara chunks con embeddings e metadata ricchi
      const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        document_id: document.id,
        content: preprocessChunkContent(chunk.content), // Preprocessa contenuto prima di salvare
        embedding: embeddings[index],
        chunk_index: chunk.chunkIndex,
        metadata: {
          ...chunk.metadata,
          documentFilename: file.name,
          processingMethod: extracted.processingMethod,
          sourceFormat: format,
          // Aggiungi metadata da OCR se disponibile
          ...extracted.metadata,
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

      // Dispatch async summary generation (non-blocking)
      generateAndSaveSummary(document.id).catch(error => {
        console.error('[upload] Background summary generation failed:', {
          documentId: document.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        // Don't fail the upload, just log the error
      })

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

