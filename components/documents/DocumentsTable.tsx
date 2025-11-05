'use client'

import { useState, useEffect } from 'react'
import type { Document } from '@/lib/supabase/database.types'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { BatchActionsToolbar } from './BatchActionsToolbar'
import { DocumentPreview } from './DocumentPreview'
import { FolderSelector } from './FolderSelector'

interface DocumentsTableProps {
  refreshTrigger?: number
}

type SortField = 'filename' | 'file_size' | 'created_at' | 'chunks_count'
type SortOrder = 'asc' | 'desc'

export function DocumentsTable({ refreshTrigger }: DocumentsTableProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean
    document: Document | null
  }>({ isOpen: false, document: null })
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null)

  useEffect(() => {
    fetchDocuments()
    fetchFolders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, selectedFolder])

  const fetchDocuments = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = selectedFolder !== null
        ? `/api/documents?folder=${encodeURIComponent(selectedFolder)}`
        : '/api/documents'
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('Failed to fetch documents')
      }
      const data = await response.json()
      setDocuments(data.documents || [])
    } catch (err) {
      console.error('Error fetching documents:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const fetchFolders = async () => {
    try {
      await fetch('/api/documents/folders')
      // Refresh folders list for folder selector
    } catch (err) {
      console.error('Error fetching folders:', err)
    }
  }

  const handleDelete = async (document: Document) => {
    setDeleteDialog({ isOpen: true, document })
  }

  const confirmDelete = async () => {
    if (!deleteDialog.document) return

    try {
      const response = await fetch(`/api/documents/${deleteDialog.document.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      // Rimuovi dalla lista
      setDocuments((prev) => prev.filter((doc) => doc.id !== deleteDialog.document!.id))
      setDeleteDialog({ isOpen: false, document: null })
    } catch (err) {
      console.error('Error deleting document:', err)
      alert('Errore durante l\'eliminazione del documento. Riprova.')
    }
  }

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle order
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // New field, default to desc
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const handleBatchDelete = async () => {
    if (selectedDocuments.size === 0) return

    try {
      const response = await fetch('/api/documents/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedDocuments) }),
      })

      if (!response.ok) {
        throw new Error('Failed to batch delete documents')
      }

      // Remove deleted documents from list
      setDocuments((prev) => prev.filter((doc) => !selectedDocuments.has(doc.id)))
      setSelectedDocuments(new Set())
      // Refresh folders count
      fetchFolders()
    } catch (err) {
      console.error('Error batch deleting documents:', err)
      alert('Errore durante l\'eliminazione dei documenti. Riprova.')
    }
  }

  const handleBatchMove = async (folder: string | null) => {
    if (selectedDocuments.size === 0) return

    try {
      const response = await fetch('/api/documents/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedDocuments), folder }),
      })

      if (!response.ok) {
        throw new Error('Failed to batch move documents')
      }

      // Update documents in list
      setDocuments((prev) =>
        prev.map((doc) =>
          selectedDocuments.has(doc.id) ? { ...doc, folder: folder || undefined } : doc
        )
      )
      setSelectedDocuments(new Set())
      // Refresh folders count
      fetchFolders()
    } catch (err) {
      console.error('Error batch moving documents:', err)
      alert('Errore durante lo spostamento dei documenti. Riprova.')
    }
  }

  const handleSelectAll = () => {
    if (selectedDocuments.size === filteredAndSorted.length) {
      setSelectedDocuments(new Set())
    } else {
      setSelectedDocuments(new Set(filteredAndSorted.map((doc) => doc.id)))
    }
  }

  const handleSelectDocument = (id: string) => {
    setSelectedDocuments((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handlePreview = (document: Document) => {
    setPreviewDocument(document)
  }

  // Filter and sort documents
  const filteredAndSorted = documents
    .filter((doc) =>
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'filename':
          comparison = a.filename.localeCompare(b.filename)
          break
        case 'file_size':
          comparison = a.file_size - b.file_size
          break
        case 'created_at':
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'chunks_count':
          comparison = (a.chunks_count || 0) - (b.chunks_count || 0)
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

  const formatFileSize = (bytes: number): string => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Adesso'
    if (diffMins < 60) return `${diffMins} minut${diffMins === 1 ? 'o' : 'i'} fa`
    if (diffHours < 24) return `${diffHours} or${diffHours === 1 ? 'a' : 'e'} fa`
    if (diffDays < 7) return `${diffDays} giorn${diffDays === 1 ? 'o' : 'i'} fa`

    return date.toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const getStatusBadge = (status?: string) => {
    const statusColors = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      processing: 'bg-blue-100 text-blue-800 border-blue-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      error: 'bg-red-100 text-red-800 border-red-200',
    }

    const statusLabels = {
      pending: 'In attesa',
      processing: 'Elaborazione',
      completed: 'Completato',
      error: 'Errore',
    }

    const color = statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800 border-gray-200'
    const label = statusLabels[status as keyof typeof statusLabels] || status || 'Sconosciuto'

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${color}`}>
        {label}
      </span>
    )
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }

    return sortOrder === 'asc' ? (
      <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Errore nel caricamento dei documenti: {error}</p>
          <button
            onClick={fetchDocuments}
            className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium underline"
          >
            Riprova
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl">
      {/* Folder Filter and Breadcrumbs */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filtra per cartella
            </label>
            <FolderSelector
              value={selectedFolder}
              onChange={(folder) => {
                setSelectedFolder(folder)
                setSelectedDocuments(new Set()) // Clear selection when folder changes
              }}
              allowCreate={false}
            />
          </div>
        </div>
        {selectedFolder && (
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <button
              onClick={() => setSelectedFolder(null)}
              className="text-gray-500 hover:text-gray-700 underline"
            >
              Tutte le cartelle
            </button>
            <span>/</span>
            <span className="font-medium">{selectedFolder}</span>
          </div>
        )}
      </div>

      {/* Batch Actions Toolbar */}
      <BatchActionsToolbar
        selectedCount={selectedDocuments.size}
        onDelete={handleBatchDelete}
        onMove={handleBatchMove}
        onClearSelection={() => setSelectedDocuments(new Set())}
      />

      {/* Search bar */}
      <div className="mb-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Cerca documenti..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
          />
        </div>
        <p className="mt-2 text-sm text-gray-600">
          {filteredAndSorted.length} document{filteredAndSorted.length !== 1 ? 'i' : 'o'} trovato
        </p>
      </div>

      {/* Empty state */}
      {filteredAndSorted.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nessun documento trovato
          </h3>
          <p className="text-gray-600">
            {searchQuery
              ? 'Prova a modificare i criteri di ricerca'
              : 'Carica il tuo primo documento per iniziare'}
          </p>
        </div>
      )}

      {/* Table */}
      {filteredAndSorted.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    checked={selectedDocuments.size === filteredAndSorted.length && filteredAndSorted.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                </th>
                <th
                  onClick={() => handleSort('filename')}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors min-w-[200px]"
                >
                  <div className="flex items-center gap-1">
                    Nome File
                    <SortIcon field="filename" />
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-32">
                  Cartella
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-20">
                  Versione
                </th>
                <th
                  onClick={() => handleSort('file_size')}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors w-24"
                >
                  <div className="flex items-center gap-1">
                    Dim.
                    <SortIcon field="file_size" />
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-28">
                  Stato
                </th>
                <th
                  onClick={() => handleSort('chunks_count')}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors w-20"
                >
                  <div className="flex items-center gap-1">
                    Chunks
                    <SortIcon field="chunks_count" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('created_at')}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors w-28"
                >
                  <div className="flex items-center gap-1">
                    Data
                    <SortIcon field="created_at" />
                  </div>
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wider w-24">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSorted.map((doc) => (
                <>
                  <tr
                    key={doc.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-2 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedDocuments.has(doc.id)}
                        onChange={() => handleSelectDocument(doc.id)}
                        className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-3 cursor-pointer" onClick={() => toggleRowExpansion(doc.id)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="text-sm font-medium text-gray-900 truncate" title={doc.filename}>
                          {doc.filename}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {doc.folder ? (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs truncate block max-w-[120px]" title={doc.folder}>
                          {doc.folder}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {doc.version && doc.version > 1 ? (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          v{doc.version}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td className="px-3 py-3">
                      {getStatusBadge(doc.processing_status)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                      {doc.chunks_count || 0}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(doc.created_at)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePreview(doc)
                          }}
                          className="text-blue-600 hover:text-blue-900 transition-colors p-1.5 rounded hover:bg-blue-50"
                          title="Preview documento"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(doc)
                          }}
                          className="text-red-600 hover:text-red-900 transition-colors p-1.5 rounded hover:bg-red-50"
                          title="Elimina documento"
                          disabled={selectedDocuments.size > 0}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(doc.id) && (
                    <tr key={`${doc.id}-expanded`}>
                      <td colSpan={9} className="px-3 py-3 bg-gray-50">
                        <div className="text-sm">
                          <h4 className="font-medium text-gray-900 mb-2">Metadata</h4>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <div>
                              <dt className="text-gray-600">ID:</dt>
                              <dd className="font-mono text-xs text-gray-900">{doc.id}</dd>
                            </div>
                            <div>
                              <dt className="text-gray-600">Tipo file:</dt>
                              <dd className="text-gray-900">{doc.file_type}</dd>
                            </div>
                            <div>
                              <dt className="text-gray-600">Storage path:</dt>
                              <dd className="font-mono text-xs text-gray-900 truncate">{doc.storage_path}</dd>
                            </div>
                            <div>
                              <dt className="text-gray-600">Aggiornato:</dt>
                              <dd className="text-gray-900">{new Date(doc.updated_at).toLocaleString('it-IT')}</dd>
                            </div>
                            {doc.error_message && (
                              <div className="col-span-2">
                                <dt className="text-gray-600">Errore:</dt>
                                <dd className="text-red-600">{doc.error_message}</dd>
                              </div>
                            )}
                            {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                              <div className="col-span-2">
                                <dt className="text-gray-600 mb-1">Metadata aggiuntivo:</dt>
                                <dd className="font-mono text-xs text-gray-900 bg-white p-2 rounded border border-gray-200 overflow-auto max-h-32">
                                  {JSON.stringify(doc.metadata, null, 2)}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Document Preview */}
      {previewDocument && (
        <DocumentPreview
          document={previewDocument}
          isOpen={true}
          onClose={() => setPreviewDocument(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, document: null })}
        onConfirm={confirmDelete}
        filename={deleteDialog.document?.filename || ''}
        chunksCount={deleteDialog.document?.chunks_count}
      />
    </div>
  )
}

