'use client'

import { useState, useCallback } from 'react'
import JSZip from 'jszip'
import { FolderSelector } from './FolderSelector'
import { VersionDialog } from './VersionDialog'
import { createClient } from '@/lib/supabase/client'

interface UploadStatus {
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  progress?: number
  error?: string
  documentId?: string
  chunksCount?: number
  stageMessage?: string
  retryCount?: number
}

interface DuplicateInfo {
  duplicate: true
  existingDocument: {
    id: string
    filename: string
    folder?: string | null
    version: number
    created_at: string
  }
  maxVersion: number
}

interface DocumentUploaderProps {
  onUploadComplete?: (documentId: string, filename: string) => void
}

export function DocumentUploader({ onUploadComplete }: DocumentUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, UploadStatus>>({})
  const [uploading, setUploading] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [duplicateInfo, setDuplicateInfo] = useState<{
    file: File
    info: DuplicateInfo
  } | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [folderCreatedMessage, setFolderCreatedMessage] = useState<string | null>(null)

  /**
   * Verifica se un file è un ZIP
   */
  const isZipFile = (file: File): boolean => {
    return (
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed' ||
      file.name.toLowerCase().endsWith('.zip')
    )
  }

  /**
   * Verifica se un file è supportato (PDF, DOCX, TXT)
   */
  const isSupportedFile = (file: File): boolean => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]
    return allowedTypes.includes(file.type)
  }

  /**
   * Determina il MIME type di un file basandosi sull'estensione
   */
  const getMimeTypeFromExtension = (filename: string): string => {
    const ext = filename.toLowerCase().split('.').pop()
    switch (ext) {
      case 'pdf':
        return 'application/pdf'
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      case 'txt':
        return 'text/plain'
      default:
        return 'application/octet-stream'
    }
  }

  /**
   * Decomprime un file ZIP e estrae solo i file supportati
   */
  const extractFilesFromZip = async (zipFile: File): Promise<File[]> => {
    try {
      const zip = await JSZip.loadAsync(zipFile)
      const extractedFiles: File[] = []
      const seenFilenames = new Set<string>()

      // Itera su tutti i file nel ZIP
      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        // Salta directory e file nascosti
        if (zipEntry.dir || relativePath.startsWith('__MACOSX/') || relativePath.includes('/.')) {
          continue
        }

        // Estrai solo file supportati
        const filename = relativePath.split('/').pop() || relativePath
        const mimeType = getMimeTypeFromExtension(filename)

        if (
          mimeType === 'application/pdf' ||
          mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          mimeType === 'text/plain'
        ) {
          // Gestisci file con nomi duplicati: se il nome è già stato visto,
          // usa il percorso relativo come parte del nome
          let finalFilename = filename
          if (seenFilenames.has(filename)) {
            // Usa il percorso relativo per creare un nome univoco
            const pathParts = relativePath.split('/').filter((p) => p && p !== filename)
            if (pathParts.length > 0) {
              finalFilename = `${pathParts.join('_')}_${filename}`
            } else {
              // Se non c'è percorso, aggiungi un timestamp
              finalFilename = `${Date.now()}_${filename}`
            }
          }
          seenFilenames.add(filename)

          // Estrai il contenuto del file
          const fileData = await zipEntry.async('blob')
          
          // Crea un oggetto File dal blob
          const extractedFile = new File([fileData], finalFilename, {
            type: mimeType,
            lastModified: zipEntry.date?.getTime() || Date.now(),
          })

          extractedFiles.push(extractedFile)
        }
      }

      return extractedFiles
    } catch (error) {
      console.error('[DocumentUploader] Error extracting ZIP:', error)
      throw new Error(`Failed to extract ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Processa file (normali o ZIP) e aggiunge alla lista
   */
  const processFiles = useCallback(async (fileList: File[]) => {
    const filesToAdd: File[] = []

    for (const file of fileList) {
      if (isZipFile(file)) {
        try {
          // Decomprimi ZIP e estrai file supportati
          const extractedFiles = await extractFilesFromZip(file)
          
          if (extractedFiles.length === 0) {
            console.warn(`[DocumentUploader] No supported files found in ZIP: ${file.name}`)
            // Mostra errore per il ZIP
            setUploadStatuses((prev) => ({
              ...prev,
              [file.name]: {
                status: 'error',
                error: 'Nessun file supportato trovato nel ZIP (PDF, DOCX, TXT)',
              },
            }))
            continue
          }

          filesToAdd.push(...extractedFiles)
        } catch (error) {
          console.error(`[DocumentUploader] Error processing ZIP ${file.name}:`, error)
          // Mostra errore per il ZIP
          setUploadStatuses((prev) => ({
            ...prev,
            [file.name]: {
              status: 'error',
              error: error instanceof Error ? error.message : 'Errore durante la decompressione del ZIP',
            },
          }))
        }
      } else if (isSupportedFile(file)) {
        filesToAdd.push(file)
      }
    }

    // Aggiungi file alla lista
    if (filesToAdd.length > 0) {
      setFiles((prev) => [...prev, ...filesToAdd])
      
      filesToAdd.forEach((file) => {
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: { status: 'pending' },
        }))
      })
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    
    // Filtra solo file supportati o ZIP
    const validFiles = droppedFiles.filter((file) => {
      return isSupportedFile(file) || isZipFile(file)
    })

    if (validFiles.length > 0) {
      await processFiles(validFiles)
    }
  }, [processFiles])

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      
      // Filtra solo file supportati o ZIP
      const validFiles = selectedFiles.filter((file) => {
        return isSupportedFile(file) || isZipFile(file)
      })

      if (validFiles.length > 0) {
        await processFiles(validFiles)
      }

      // Reset input per permettere di selezionare lo stesso file di nuovo
      e.target.value = ''
    }
  }, [processFiles])

  /**
   * Sanitizza il nome del file per renderlo compatibile con le chiavi di storage
   * Rimuove caratteri non validi e li sostituisce con underscore
   */
  const sanitizeFileName = (fileName: string): string => {
    // Estrai estensione
    const lastDot = fileName.lastIndexOf('.')
    const name = lastDot > 0 ? fileName.slice(0, lastDot) : fileName
    const extension = lastDot > 0 ? fileName.slice(lastDot) : ''
    
    // Sostituisci caratteri non validi con underscore
    // Mantieni lettere, numeri, trattini, underscore e punti
    const sanitized = name
      .normalize('NFD') // Normalizza caratteri Unicode (es. à -> a + accent)
      .replace(/[\u0300-\u036f]/g, '') // Rimuovi diacritici
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Sostituisci caratteri non validi
      .replace(/_{2,}/g, '_') // Rimuovi underscore multipli
      .replace(/^_+|_+$/g, '') // Rimuovi underscore all'inizio/fine
    
    // Se il nome è vuoto dopo la sanitizzazione, usa un nome di default
    const finalName = sanitized || 'file'
    
    return `${finalName}${extension}`
  }

  /**
   * Helper per retry con exponential backoff
   */
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const uploadFileWithRetry = async (
    file: File,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    action?: 'replace' | 'version'
  ): Promise<void> => {
    let retryCount = 0
    const supabase = createClient()

    while (retryCount <= maxRetries) {
      let storagePath: string | undefined

      try {
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: {
            ...prev[file.name],
            status: retryCount > 0 ? 'processing' : 'uploading',
            progress: 0,
            stageMessage: retryCount > 0 ? `Retrying (attempt ${retryCount + 1}/${maxRetries + 1})...` : 'Uploading to storage...',
            retryCount,
          },
        }))

        // Step 1: Upload directly to Supabase Storage (bypasses Vercel limit)
        const timestamp = Date.now()
        const sanitizedFileName = sanitizeFileName(file.name)
        storagePath = `temp-uploads/${timestamp}-${sanitizedFileName}`
        
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          })

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`)
        }

        // Step 2: Update progress
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: {
            ...prev[file.name],
            status: 'processing',
            progress: 10,
            stageMessage: 'File uploaded, starting processing...',
            retryCount,
          },
        }))

        // Step 3: Call API to process the file
        const res = await fetch('/api/upload/process?stream=true', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            storagePath,
            filename: file.name,
            fileType: file.type,
            fileSize: file.size,
            folder,
            action,
          }),
        })

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(errorData.error || `Upload failed for ${file.name}`)
        }

        // Leggi Server-Sent Events
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('Response body is not readable')
        }

        let finalDocumentId: string | undefined

        while (true) {
          const { done, value } = await reader.read()

          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                // Handle duplicate detection
                if (data.stage === 'duplicate') {
                  const duplicateInfo = JSON.parse(data.message) as DuplicateInfo
                  setDuplicateInfo({ file, info: duplicateInfo })
                  setPendingFile(file)
                  return // Exit, wait for user decision
                }

                if (data.stage === 'error') {
                  throw new Error(data.message || 'Processing failed')
                }

                setUploadStatuses((prev) => {
                  const currentStatus = prev[file.name]
                  const currentProgress = currentStatus?.progress || 0
                  const newProgress = data.progress || 0
                  // Se completato, imposta sempre 100%, altrimenti mantieni il progresso più alto
                  const finalProgress = data.stage === 'completed' ? 100 : Math.max(currentProgress, newProgress)
                  
                  return {
                    ...prev,
                    [file.name]: {
                      status: data.stage === 'completed' ? 'completed' : data.stage === 'uploading' ? 'uploading' : 'processing',
                      progress: finalProgress,
                      stageMessage: data.message,
                      documentId: data.documentId,
                      chunksCount: data.chunksCount,
                      retryCount,
                    },
                  }
                })

                // Salva documentId per callback
                if (data.documentId) {
                  finalDocumentId = data.documentId
                }

                // Se completato, esci dal loop
                if (data.stage === 'completed') {
                  // Chiama callback se fornito
                  if (onUploadComplete && finalDocumentId) {
                    onUploadComplete(finalDocumentId, file.name)
                  }
                  return
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE data:', parseError)
              }
            }
          }
        }

        // Se arriviamo qui, l'upload è completato con successo
        return
      } catch (error) {
        console.error(`Error uploading ${file.name} (attempt ${retryCount + 1}):`, error)

        // Cleanup: remove temporary file from storage if upload failed
        if (storagePath) {
          try {
            await supabase.storage.from('documents').remove([storagePath])
          } catch (cleanupError) {
            console.error('Failed to cleanup temporary file:', cleanupError)
          }
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        // Se abbiamo ancora tentativi disponibili e l'errore è retryable
        if (retryCount < maxRetries && isRetryableError(errorMessage)) {
          retryCount++
          const delay = baseDelay * Math.pow(2, retryCount - 1)
          
          setUploadStatuses((prev) => ({
            ...prev,
            [file.name]: {
              ...prev[file.name],
              status: 'error',
              error: `${errorMessage} - Retrying in ${delay / 1000}s...`,
              retryCount,
            },
          }))

          await sleep(delay)
          continue
        }

        // Nessun retry disponibile o errore non retryable
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: {
            status: 'error',
            error: errorMessage,
            retryCount,
          },
        }))
        throw error
      }
    }
  }

  /**
   * Determina se un errore è retryable
   */
  const isRetryableError = (errorMessage: string): boolean => {
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /connection/i,
      /temporary/i,
      /rate limit/i,
      /429/i,
      /503/i,
      /502/i,
      /500/i,
    ]

    // Non retry per errori di validazione o configurazione
    const nonRetryablePatterns = [
      /file size/i,
      /file type/i,
      /unsupported/i,
      /bucket not found/i,
      /invalid/i,
      /required/i,
    ]

    if (nonRetryablePatterns.some((pattern) => pattern.test(errorMessage))) {
      return false
    }

    return retryablePatterns.some((pattern) => pattern.test(errorMessage))
  }

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    // Clear folder creation message when starting upload
    setFolderCreatedMessage(null)

    // Upload file uno alla volta per mostrare progress individuale
    for (const file of files) {
      // Salta file già completati o in processing
      const currentStatus = uploadStatuses[file.name]
      if (currentStatus?.status === 'completed' || currentStatus?.status === 'processing') {
        continue
      }

      try {
        // Log folder for debugging
        if (folder) {
          console.log(`[DocumentUploader] Uploading ${file.name} to folder: ${folder}`)
        }
        await uploadFileWithRetry(file)
      } catch (error) {
        // Errore già gestito in uploadFileWithRetry con retry logic
        console.error(`Final error for ${file.name}:`, error)
      }
    }

    setUploading(false)
    // Reset folder after upload
    setFolder(null)
  }

  const handleRetry = async (fileName: string) => {
    const file = files.find((f) => f.name === fileName)
    if (!file) return

    setUploadStatuses((prev) => ({
      ...prev,
      [fileName]: {
        ...prev[fileName],
        status: 'pending',
        error: undefined,
        retryCount: (prev[fileName]?.retryCount || 0) + 1,
      },
    }))

    try {
      await uploadFileWithRetry(file)
    } catch (error) {
      console.error(`Retry failed for ${fileName}:`, error)
    }
  }

  const handleReplace = async () => {
    if (!pendingFile || !duplicateInfo) return

    setDuplicateInfo(null)
    setPendingFile(null)

    try {
      await uploadFileWithRetry(pendingFile, 3, 1000, 'replace')
    } catch (error) {
      console.error('Replace failed:', error)
    }
  }

  const handleVersion = async () => {
    if (!pendingFile || !duplicateInfo) return

    setDuplicateInfo(null)
    setPendingFile(null)

    try {
      await uploadFileWithRetry(pendingFile, 3, 1000, 'version')
    } catch (error) {
      console.error('Version creation failed:', error)
    }
  }

  const handleCancelDuplicate = () => {
    if (!pendingFile) return

    // Remove the file from queue
    removeFile(pendingFile.name)
    setDuplicateInfo(null)
    setPendingFile(null)
  }

  const removeFile = (fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName))
    setUploadStatuses((prev) => {
      const newStatuses = { ...prev }
      delete newStatuses[fileName]
      return newStatuses
    })
  }

  const getStatusColor = (status: UploadStatus['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600'
      case 'error':
        return 'text-red-600'
      case 'processing':
        return 'text-blue-600'
      case 'uploading':
        return 'text-yellow-600'
      default:
        return 'text-gray-600'
    }
  }

  const getStatusText = (status: UploadStatus['status']) => {
    switch (status) {
      case 'completed':
        return 'Completato'
      case 'error':
        return 'Errore'
      case 'processing':
        return 'Elaborazione...'
      case 'uploading':
        return 'Caricamento...'
      default:
        return 'In attesa'
    }
  }

  return (
    <div className="max-w-4xl">
      {/* Folder Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Cartella
        </label>
        <FolderSelector 
          value={folder} 
          onChange={setFolder} 
          allowCreate={true}
          onFolderCreated={(folderName) => {
            setFolderCreatedMessage(`Cartella "${folderName}" creata. Carica il documento e verrà salvato al suo interno.`)
            // Auto-hide message after 5 seconds
            setTimeout(() => {
              setFolderCreatedMessage(null)
            }, 5000)
          }}
        />
        {folderCreatedMessage && (
          <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">{folderCreatedMessage}</p>
          </div>
        )}
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center mb-6 hover:border-gray-400 transition-colors bg-gray-50"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-gray-700 mb-2 font-medium">
          Trascina file qui o clicca per selezionare
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Formati supportati: PDF, DOCX, TXT, ZIP (max 50MB)
        </p>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.zip"
          onChange={handleFileInput}
          className="hidden"
          id="file-input"
        />
        <label
          htmlFor="file-input"
          className="inline-block bg-gray-900 text-white px-6 py-2.5 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          Seleziona File
        </label>
      </div>

      {/* Version Dialog */}
      {duplicateInfo && (
        <VersionDialog
          isOpen={true}
          existingDocument={duplicateInfo.info.existingDocument}
          maxVersion={duplicateInfo.info.maxVersion}
          onReplace={handleReplace}
          onVersion={handleVersion}
          onCancel={handleCancelDuplicate}
        />
      )}

      {files.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">File selezionati</h2>
          <div className="space-y-3">
            {files.map((file) => {
              const status = uploadStatuses[file.name] || { status: 'pending' }
              return (
                <div
                  key={file.name}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{file.name}</p>
                    <div className="flex items-center gap-4 mt-1.5">
                      <p className="text-sm text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <p className={`text-sm font-medium ${getStatusColor(status.status)}`}>
                        {getStatusText(status.status)}
                      </p>
                      {status.chunksCount && (
                        <p className="text-sm text-gray-500">
                          {status.chunksCount} chunks
                        </p>
                      )}
                    </div>
                    {status.error && (
                      <div className="mt-2">
                        <p className="text-sm text-red-600 mb-2">{status.error}</p>
                        {status.status === 'error' && (
                          <button
                            onClick={() => handleRetry(file.name)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium underline"
                          >
                            Riprova
                          </button>
                        )}
                      </div>
                    )}
                    {(status.status === 'uploading' || status.status === 'processing') && (
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              status.status === 'uploading'
                                ? 'bg-yellow-500'
                                : 'bg-blue-600'
                            }`}
                            style={{ width: `${status.progress || 0}%` }}
                          />
                        </div>
                        {status.stageMessage && (
                          <p className="text-xs text-gray-600 mt-1.5">{status.stageMessage}</p>
                        )}
                        {status.progress !== undefined && (
                          <p className="text-xs text-gray-500 mt-1">{Math.round(status.progress)}%</p>
                        )}
                      </div>
                    )}
                    {status.status === 'completed' && status.progress === 100 && (
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(file.name)}
                    className="text-gray-400 hover:text-gray-600 ml-4 p-2 rounded hover:bg-gray-100 transition-colors"
                    disabled={status.status === 'processing' || status.status === 'uploading'}
                    title="Rimuovi file"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          className="bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {uploading ? 'Caricamento...' : 'Carica File'}
        </button>
        {files.length > 0 && (
          <button
            onClick={() => {
              setFiles([])
              setUploadStatuses({})
            }}
            className="bg-white border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancella Tutto
          </button>
        )}
      </div>
    </div>
  )
}

