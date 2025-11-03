'use client'

import { useState, useCallback } from 'react'

interface UploadStatus {
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  progress?: number
  error?: string
  documentId?: string
  chunksCount?: number
  stageMessage?: string
  retryCount?: number
}

interface DocumentUploaderProps {
  onUploadComplete?: (documentId: string, filename: string) => void
}

export function DocumentUploader({ onUploadComplete }: DocumentUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, UploadStatus>>({})
  const [uploading, setUploading] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files).filter((file) => {
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ]
      return allowedTypes.includes(file.type)
    })
    setFiles((prev) => [...prev, ...droppedFiles])
    
    droppedFiles.forEach((file) => {
      setUploadStatuses((prev) => ({
        ...prev,
        [file.name]: { status: 'pending' },
      }))
    })
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter((file) => {
        const allowedTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
        ]
        return allowedTypes.includes(file.type)
      })
      setFiles((prev) => [...prev, ...selectedFiles])
      
      selectedFiles.forEach((file) => {
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: { status: 'pending' },
        }))
      })
    }
  }, [])

  /**
   * Helper per retry con exponential backoff
   */
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const uploadFileWithRetry = async (
    file: File,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<void> => {
    let retryCount = 0

    while (retryCount <= maxRetries) {
      try {
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: {
            ...prev[file.name],
            status: retryCount > 0 ? 'processing' : 'uploading',
            progress: 0,
            stageMessage: retryCount > 0 ? `Retrying (attempt ${retryCount + 1}/${maxRetries + 1})...` : undefined,
            retryCount,
          },
        }))

        const formData = new FormData()
        formData.append('file', file)

        // Usa streaming per progress real-time
        const res = await fetch('/api/upload?stream=true', {
          method: 'POST',
          body: formData,
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

                if (data.stage === 'error') {
                  throw new Error(data.message || 'Processing failed')
                }

                setUploadStatuses((prev) => ({
                  ...prev,
                  [file.name]: {
                    status: data.stage === 'completed' ? 'completed' : data.stage === 'uploading' ? 'uploading' : 'processing',
                    progress: data.progress || 0,
                    stageMessage: data.message,
                    documentId: data.documentId,
                    chunksCount: data.chunksCount,
                    retryCount,
                  },
                }))

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

    // Upload file uno alla volta per mostrare progress individuale
    for (const file of files) {
      // Salta file già completati o in processing
      const currentStatus = uploadStatuses[file.name]
      if (currentStatus?.status === 'completed' || currentStatus?.status === 'processing') {
        continue
      }

      try {
        await uploadFileWithRetry(file)
      } catch (error) {
        // Errore già gestito in uploadFileWithRetry con retry logic
        console.error(`Final error for ${file.name}:`, error)
      }
    }

    setUploading(false)
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
          Formati supportati: PDF, DOCX, TXT (max 50MB)
        </p>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
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

