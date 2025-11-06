import { NextRequest, NextResponse } from 'next/server'
import { extractTextUnified } from '@/lib/processing/document-processor'
import { detectDocumentStructure } from '@/lib/processing/structure-detector'
import { adaptiveChunking } from '@/lib/processing/adaptive-chunking'
import { preprocessChunkContent } from '@/lib/processing/chunk-preprocessing'
import { generateEmbeddings } from '@/lib/embeddings/openai'
import { insertDocumentChunks } from '@/lib/supabase/vector-operations'
import { createDocument, checkDuplicateFilename, deleteDocument, getDocumentVersions } from '@/lib/supabase/document-operations'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const maxDuration = 300 // 5 minuti per processing

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

/**
 * POST /api/upload/process
 * Process a document that has already been uploaded to Supabase Storage
 * This bypasses Vercel's 4.5MB serverless limit by having the client
 * upload directly to Supabase Storage first
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const useStreaming = url.searchParams.get('stream') === 'true'

  if (useStreaming) {
    // Streaming mode con SSE per progress real-time
    const stream = new ReadableStream({
      async start(controller) {
        let document: { id: string } | undefined
        let tempStoragePath: string | undefined
        let finalStoragePath: string | undefined

        try {
          // Parse request body
          const body = await req.json()
          const { storagePath, filename, fileType, fileSize, folder, action } = body

          if (!storagePath || !filename) {
            sendProgress(controller, 'error', 0, 'Missing required fields: storagePath or filename')
            controller.close()
            return
          }

          tempStoragePath = storagePath

          // Validazione
          const maxSize = 50 * 1024 * 1024 // 50MB
          if (fileSize > maxSize) {
            sendProgress(controller, 'error', 0, 'File size exceeds 50MB limit')
            controller.close()
            return
          }

          const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
          ]
          if (!allowedTypes.includes(fileType)) {
            sendProgress(controller, 'error', 0, 'Unsupported file type. Supported: PDF, DOCX, TXT')
            controller.close()
            return
          }

          // Fase 1: Download file from storage (5%)
          sendProgress(controller, 'processing', 5, 'Downloading file from storage...')
          
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from('documents')
            .download(storagePath)

          if (downloadError || !fileData) {
            throw new Error(`Failed to download file from storage: ${downloadError?.message}`)
          }

          // Convert Blob to File object for processing
          const file = new File([fileData], filename, { type: fileType })

          // Fase 2: Check for duplicate (10%)
          sendProgress(controller, 'checking', 10, 'Checking for duplicate files...')
          
          const folderValue = folder && folder.trim() !== '' ? folder.trim() : null
          const existingDoc = await checkDuplicateFilename(filename, folderValue || undefined)

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
            sendProgress(controller, 'processing', 15, 'Replacing existing document...')
            await deleteDocument(existingDoc.id)
            // Also delete storage file
            await supabaseAdmin.storage.from('documents').remove([existingDoc.storage_path])
          }

          // Fase 3: Move file to permanent location (20%)
          sendProgress(controller, 'processing', 20, 'Moving file to permanent location...')
          
          const fileExt = filename.split('.').pop()
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
          finalStoragePath = `documents/${fileName}`

          // Upload to final location
          const { error: uploadError } = await supabaseAdmin.storage
            .from('documents')
            .upload(finalStoragePath, file, {
              contentType: fileType,
              upsert: false,
            })

          if (uploadError) {
            throw new Error(`Failed to move file to permanent location: ${uploadError.message}`)
          }

          // Delete temp file
          if (tempStoragePath) {
            await supabaseAdmin.storage.from('documents').remove([tempStoragePath])
            tempStoragePath = undefined // Mark as cleaned up
          }

          // Fase 4: Crea record documento (30%)
          sendProgress(controller, 'processing', 30, 'Creating document record...')
          
          // Determine version and parent_version_id
          let version = 1
          let parentVersionId: string | null = null
          
          if (existingDoc && action === 'version') {
            const existingVersions = await getDocumentVersions(existingDoc.id)
            const maxVersion = Math.max(...existingVersions.map((v) => v.version || 1))
            version = maxVersion + 1
            parentVersionId = existingDoc.parent_version_id || existingDoc.id
          }
          
          document = await createDocument(
            filename,
            fileType,
            fileSize,
            finalStoragePath,
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

          // Fase 5: Estrazione testo (40%)
          sendProgress(controller, 'processing', 40, 'Extracting text from document...')
          
          const extracted = await extractTextUnified(file)
          const text = extracted.text
          const format = extracted.format
          
          console.log(`[api/upload/process] Processing method: ${extracted.processingMethod}`)
          console.log(`[api/upload/process] Format: ${format}`)
          
          if (!text || text.trim().length === 0) {
            throw new Error('No text extracted from document')
          }

          // Fase 6: Chunking (50%)
          sendProgress(controller, 'processing', 50, 'Detecting document structure and chunking...')
          
          const structure = detectDocumentStructure(text, format)
          console.log(`[api/upload/process] Detected structure: ${structure.type}, confidence: ${structure.confidence.toFixed(2)}`)
          
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
          
          console.log(`[api/upload/process] Created ${chunks.length} chunks`)

          // Fase 7: Generazione embeddings (50-80%)
          const chunkTexts = chunks.map((c) => c.content)
          const totalBatches = Math.ceil(chunks.length / 100)
          
          sendProgress(controller, 'processing', 60, `Generating embeddings (0/${totalBatches} batches)...`)
          
          const embeddings: number[][] = []
          const MAX_BATCH_SIZE = 100
          
          for (let i = 0; i < chunkTexts.length; i += MAX_BATCH_SIZE) {
            const batch = chunkTexts.slice(i, i + MAX_BATCH_SIZE)
            const batchIndex = Math.floor(i / MAX_BATCH_SIZE) + 1
            
            const embedProgress = 60 + (batchIndex / totalBatches) * 20
            sendProgress(
              controller,
              'processing',
              embedProgress,
              `Generating embeddings (${batchIndex}/${totalBatches} batches)...`
            )
            
            const batchEmbeddings = await generateEmbeddings(batch)
            embeddings.push(...batchEmbeddings)
          }

          // Fase 8: Preparazione chunks (80-85%)
          sendProgress(controller, 'processing', 85, 'Preparing chunks with embeddings...')
          
          if (!document || !document.id) {
            throw new Error('Document not found during chunk preparation')
          }
          
          const documentId = document.id
          const chunksWithEmbeddings = chunks.map((chunk, index) => ({
            document_id: documentId,
            content: preprocessChunkContent(chunk.content),
            embedding: embeddings[index],
            chunk_index: chunk.chunkIndex,
            metadata: {
              ...chunk.metadata,
              documentFilename: filename,
              processingMethod: extracted.processingMethod,
              sourceFormat: format,
              ...extracted.metadata,
            },
          }))

          // Fase 9: Inserimento nel database (85-95%)
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

          // Fase 10: Completamento (95-100%)
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
          console.error('[api/upload/process] Processing failed:', error)
          
          const errorMessage = error instanceof Error 
            ? error.message 
            : 'Unknown processing error'

          // Cleanup: rimuovi document e file se sono stati creati
          try {
            // Clean up temp file if still exists
            if (tempStoragePath) {
              await supabaseAdmin.storage.from('documents').remove([tempStoragePath])
            }

            // Se document esiste, fa cleanup completo
            if (document && document.id) {
              try {
                await supabaseAdmin
                  .from('documents')
                  .update({
                    processing_status: 'error',
                    error_message: errorMessage,
                  })
                  .eq('id', document.id)
              } catch {}

              try {
                await supabaseAdmin
                  .from('document_chunks')
                  .delete()
                  .eq('document_id', document.id)
              } catch {}

              try {
                await supabaseAdmin
                  .from('documents')
                  .delete()
                  .eq('id', document.id)
              } catch {}

              // Elimina file permanente se esiste
              if (finalStoragePath) {
                try {
                  await supabaseAdmin.storage
                    .from('documents')
                    .remove([finalStoragePath])
                } catch {}
              }

              console.log(`[api/upload/process] Cleaned up failed document ${document.id}`)
            }
          } catch (cleanupError) {
            console.error('[api/upload/process] Cleanup failed:', cleanupError)
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

  // Non-streaming fallback
  return NextResponse.json(
    { error: 'Streaming mode required. Add ?stream=true to the URL' },
    { status: 400 }
  )
}

