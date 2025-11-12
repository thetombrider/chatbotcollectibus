'use client'

import { useState, useEffect } from 'react'
import type { Document } from '@/lib/supabase/database.types'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { BatchActionsToolbar } from './BatchActionsToolbar'
import { DocumentPreview } from './DocumentPreview'

interface DocumentsTableProps {
  refreshTrigger?: number
  selectedFolder?: string | null
}

type SortField = 'filename' | 'file_size' | 'created_at' | 'chunks_count'
type SortOrder = 'asc' | 'desc'

const ITEMS_PER_PAGE = 10

export function DocumentsTable({ refreshTrigger, selectedFolder }: DocumentsTableProps) {
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
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    fetchDocuments()
    fetchFolders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, selectedFolder])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedFolder])

  const fetchDocuments = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = selectedFolder
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
    // Calculate current page documents
    const filtered = documents.filter((doc) =>
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'filename':
          comparison = a.filename.localeCompare(b.filename)
          break
        case 'file_size':
          comparison = a.file_size - b.file_size
          break
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'chunks_count':
          comparison = (a.chunks_count || 0) - (b.chunks_count || 0)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE
    const endIdx = startIdx + ITEMS_PER_PAGE
    const currentPageDocs = sorted.slice(startIdx, endIdx).map((doc) => doc.id)
    const allCurrentPageSelected = currentPageDocs.every((id) => selectedDocuments.has(id))
    
    if (allCurrentPageSelected) {
      // Deselect all on current page
      setSelectedDocuments((prev) => {
        const newSet = new Set(prev)
        currentPageDocs.forEach((id) => newSet.delete(id))
        return newSet
      })
    } else {
      // Select all on current page
      setSelectedDocuments((prev) => {
        const newSet = new Set(prev)
        currentPageDocs.forEach((id) => newSet.add(id))
        return newSet
      })
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

  // Pagination
  const totalPages = Math.ceil(filteredAndSorted.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedDocuments = filteredAndSorted.slice(startIndex, endIndex)

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
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      {/* Batch Actions Toolbar */}
      <div className="flex-shrink-0 mb-3">
        <BatchActionsToolbar
          selectedCount={selectedDocuments.size}
          onDelete={handleBatchDelete}
          onMove={handleBatchMove}
          onClearSelection={() => setSelectedDocuments(new Set())}
        />
      </div>

      {/* Search bar and Folder Filter */}
      <div className="flex-shrink-0 mb-3">
        <div className="flex items-end gap-4">
          {/* Search bar */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cerca documenti
            </label>
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
          </div>
        </div>
        
        {/* Results count */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {filteredAndSorted.length} document{filteredAndSorted.length !== 1 ? 'i' : 'o'} trovato
          </p>
        </div>
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
        <div className="flex flex-col bg-white border border-gray-200 rounded-lg">
          <div className="overflow-auto">
            <table className="w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    checked={paginatedDocuments.length > 0 && paginatedDocuments.every((doc) => selectedDocuments.has(doc.id))}
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
              {paginatedDocuments.map((doc) => (
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
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Precedente
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Successivo
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Mostrando <span className="font-medium">{startIndex + 1}</span> a{' '}
                    <span className="font-medium">{Math.min(endIndex, filteredAndSorted.length)}</span> di{' '}
                    <span className="font-medium">{filteredAndSorted.length}</span> risultati
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Precedente</span>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Show first page, last page, current page, and pages around current
                      const showPage = 
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      
                      if (!showPage) {
                        // Show ellipsis
                        if (page === currentPage - 2 || page === currentPage + 2) {
                          return (
                            <span key={page} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                              ...
                            </span>
                          )
                        }
                        return null
                      }
                      
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            page === currentPage
                              ? 'z-10 bg-gray-900 border-gray-900 text-white'
                              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Successivo</span>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
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

