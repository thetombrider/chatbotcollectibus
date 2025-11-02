'use client'

import { useState, useCallback } from 'react'

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    setFiles((prev) => [...prev, ...droppedFiles])
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      setFiles((prev) => [...prev, ...selectedFiles])
    }
  }, [])

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)

    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          throw new Error(`Upload failed for ${file.name}`)
        }

        const data = await res.json()
        setUploadProgress((prev) => ({
          ...prev,
          [file.name]: 100,
        }))

        console.log(`Uploaded ${file.name}:`, data)
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error)
        setUploadProgress((prev) => ({
          ...prev,
          [file.name]: -1, // Error
        }))
      }
    }

    setUploading(false)
    setFiles([])
    setUploadProgress({})
  }

  const removeFile = (fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName))
    setUploadProgress((prev) => {
      const newProgress = { ...prev }
      delete newProgress[fileName]
      return newProgress
    })
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Carica Documenti</h1>

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <p className="text-gray-600 mb-4">
          Trascina file qui o clicca per selezionare
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
          className="bg-blue-500 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-600 inline-block"
        >
          Seleziona File
        </label>
      </div>

      {files.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">File selezionati:</h2>
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.name}
                className="flex items-center justify-between bg-gray-100 p-3 rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  {uploadProgress[file.name] === -1 && (
                    <p className="text-sm text-red-500">Errore upload</p>
                  )}
                  {uploadProgress[file.name] === 100 && (
                    <p className="text-sm text-green-500">Caricato con successo</p>
                  )}
                </div>
                <button
                  onClick={() => removeFile(file.name)}
                  className="text-red-500 hover:text-red-700 ml-4"
                >
                  Rimuovi
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={files.length === 0 || uploading}
        className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? 'Caricamento...' : 'Carica File'}
      </button>
    </div>
  )
}

