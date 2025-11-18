'use client'

import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Document, DocumentChunk } from '@/lib/supabase/database.types'

interface DocumentPreviewProps {
  document: Document
  isOpen: boolean
  onClose: () => void
}

export function DocumentPreview({ document, isOpen, onClose }: DocumentPreviewProps) {
  const [chunks, setChunks] = useState<DocumentChunk[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showChunks, setShowChunks] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  useEffect(() => {
    if (isOpen && document.id) {
      fetchChunks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, document.id])

  const fetchChunks = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/documents/${document.id}/chunks`)
      if (!response.ok) {
        throw new Error('Failed to fetch chunks')
      }
      const data = await response.json()
      setChunks(data.chunks || [])
    } catch (err) {
      console.error('Error fetching chunks:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const getPdfUrl = () => {
    // For PDF preview, we'll use a simple iframe approach
    // In production, you might want to use react-pdf or PDF.js
    if (document.file_type === 'application/pdf') {
      // Use the file API endpoint which generates a signed URL
      return `/api/documents/${document.id}/file`
    }
    return null
  }

  if (!isOpen) return null

  const pdfUrl = getPdfUrl()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              {document.filename}
            </h2>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{formatFileSize(document.file_size)}</span>
              {document.folder && (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                  {document.folder}
                </span>
              )}
              {document.version && (
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                  v{document.version}
                </span>
              )}
              <span>{formatDate(document.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowChunks(!showChunks)}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {showChunks ? 'Nascondi chunks' : 'Mostra chunks'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* PDF Preview with Summary */}
          {pdfUrl && document.file_type === 'application/pdf' && (
            <div className="flex-1 overflow-auto">
              {/* Summary Section */}
              {document.summary && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
                  <button
                    onClick={() => setShowSummary(!showSummary)}
                    className="w-full p-4 flex items-center justify-between hover:bg-blue-100/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <h3 className="text-sm font-semibold text-blue-900">Riepilogo del documento</h3>
                    </div>
                    <svg 
                      className={`w-5 h-5 text-blue-600 transition-transform ${showSummary ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showSummary && (
                    <div className="px-6 pb-6">
                      <div className="prose prose-sm max-w-none text-gray-700">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {document.summary}
                        </ReactMarkdown>
                      </div>
                      {document.summary_generated_at && (
                        <p className="text-xs text-gray-500 mt-3">
                          Generato il {formatDate(document.summary_generated_at)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* PDF Viewer */}
              <div className="p-6">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full min-h-[600px] border border-gray-200 rounded-lg shadow-sm"
                  title="PDF Preview"
                />
              </div>
            </div>
          )}

          {/* Chunks Panel */}
          {showChunks && (
            <div className="w-96 border-l border-gray-200 overflow-y-auto">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Chunks ({chunks.length})
                </h3>

                {loading && (
                  <div className="text-center py-8 text-gray-500">
                    Caricamento chunks...
                  </div>
                )}

                {error && (
                  <div className="text-center py-8 text-red-600">
                    Errore: {error}
                  </div>
                )}

                {!loading && !error && chunks.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    Nessun chunk disponibile
                  </div>
                )}

                    {!loading && !error && chunks.length > 0 && (
                      <div className="space-y-4">
                        {chunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500">
                            Chunk #{chunk.chunk_index}
                          </span>
                          {chunk.metadata && typeof chunk.metadata.tokenCount === 'number' && (
                            <span className="text-xs text-gray-400">
                              {chunk.metadata.tokenCount} tokens
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {chunk.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No PDF Preview Message */}
          {!pdfUrl && document.file_type !== 'application/pdf' && (
            <div className="flex-1 overflow-auto p-6">
              {/* Summary for non-PDF files */}
              {document.summary ? (
                <div className="max-w-3xl mx-auto">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setShowSummary(!showSummary)}
                      className="w-full p-6 flex items-center justify-between hover:bg-blue-100/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h3 className="text-lg font-semibold text-blue-900">Riepilogo del documento</h3>
                      </div>
                      <svg 
                        className={`w-6 h-6 text-blue-600 transition-transform ${showSummary ? 'rotate-180' : ''}`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showSummary && (
                      <div className="px-6 pb-6">
                        <div className="prose prose-base max-w-none text-gray-700">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {document.summary}
                          </ReactMarkdown>
                        </div>
                        {document.summary_generated_at && (
                          <p className="text-sm text-gray-500">
                            Generato il {formatDate(document.summary_generated_at)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-600 mb-2">Preview non disponibile</p>
                    <p className="text-sm text-gray-500">
                      Il preview PDF è disponibile solo per file PDF.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

