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
    <div className="max-w-4xl mx-auto px-4 py-8 bg-white min-h-screen">
      <h1 className="text-3xl font-semibold text-gray-900 mb-8">Carica Documenti</h1>

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
                      <p className="text-sm text-red-600 mt-2">{status.error}</p>
                    )}
                    {status.status === 'processing' && (
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full animate-pulse"
                            style={{ width: '50%' }}
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

