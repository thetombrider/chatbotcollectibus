'use client'

import { useState, useCallback } from 'react'

interface UploadStatus {
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  progress?: number
  error?: string
  documentId?: string
  chunksCount?: number
}

export default function UploadPage() {
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
    
    // Inizializza status per nuovi file
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

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)

    for (const file of files) {
      try {
        // Aggiorna status a uploading
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: { status: 'uploading', progress: 0 },
        }))

        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || `Upload failed for ${file.name}`)
        }

        // Aggiorna status a completed
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: {
            status: 'completed',
            progress: 100,
            documentId: data.documentId,
            chunksCount: data.chunksCount,
          },
        }))
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error)
        setUploadStatuses((prev) => ({
          ...prev,
          [file.name]: {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        }))
      }
    }

    setUploading(false)
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
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Carica Documenti</h1>

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4 hover:border-blue-500 transition-colors"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <p className="text-gray-600 mb-4">
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
          className="bg-blue-500 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-600 inline-block transition-colors"
        >
          Seleziona File
        </label>
      </div>

      {files.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">File selezionati:</h2>
          <div className="space-y-2">
            {files.map((file) => {
              const status = uploadStatuses[file.name] || { status: 'pending' }
              return (
                <div
                  key={file.name}
                  className="flex items-center justify-between bg-gray-100 p-3 rounded-lg border border-gray-200"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-4 mt-1">
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
                      <p className="text-sm text-red-500 mt-1">{status.error}</p>
                    )}
                    {status.status === 'processing' && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full animate-pulse"
                            style={{ width: '50%' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(file.name)}
                    className="text-red-500 hover:text-red-700 ml-4 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    disabled={status.status === 'processing' || status.status === 'uploading'}
                  >
                    Rimuovi
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? 'Caricamento...' : 'Carica File'}
        </button>
        {files.length > 0 && (
          <button
            onClick={() => {
              setFiles([])
              setUploadStatuses({})
            }}
            className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancella Tutto
          </button>
        )}
      </div>
    </div>
  )
}

