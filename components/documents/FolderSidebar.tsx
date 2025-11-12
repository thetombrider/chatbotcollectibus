'use client'

import { useState, useEffect } from 'react'

interface Folder {
  name: string
  count: number
}

interface FolderSidebarProps {
  selectedFolder: string | null
  onFolderSelect: (folder: string | null) => void
  onFolderCreated?: () => void
}

export function FolderSidebar({ 
  selectedFolder, 
  onFolderSelect, 
  onFolderCreated 
}: FolderSidebarProps) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    folder: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    fetchFolders()
  }, [])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const fetchFolders = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/documents/folders')
      if (!response.ok) throw new Error('Failed to fetch folders')
      
      const data = await response.json()
      setFolders(data.folders || [])
    } catch (error) {
      console.error('Error fetching folders:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return

    try {
      // For now, we'll just add it to the list optimistically
      // The actual folder will be created when a document is uploaded to it
      const folderName = newFolderName.trim()
      
      // Add to folders list optimistically
      setFolders(prev => [...prev, { name: folderName, count: 0 }])
      
      // Select the new folder
      onFolderSelect(folderName)
      
      // Reset input
      setNewFolderName('')
      setShowNewFolderInput(false)
      
      if (onFolderCreated) {
        onFolderCreated()
      }
    } catch (error) {
      console.error('Error creating folder:', error)
    }
  }

  const handleRightClick = (e: React.MouseEvent, folder: string) => {
    e.preventDefault()
    setContextMenu({
      folder,
      x: e.clientX,
      y: e.clientY
    })
  }

  const handleDeleteFolder = async (folderName: string) => {
    if (!confirm(`Sei sicuro di voler eliminare la cartella "${folderName}"? I documenti al suo interno non verranno eliminati.`)) {
      return
    }

    try {
      const response = await fetch(`/api/documents/folders/${encodeURIComponent(folderName)}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Failed to delete folder')

      // Remove from local state
      setFolders(prev => prev.filter(f => f.name !== folderName))
      
      // If the deleted folder was selected, select "All Documents"
      if (selectedFolder === folderName) {
        onFolderSelect(null)
      }
      
      setContextMenu(null)
    } catch (error) {
      console.error('Error deleting folder:', error)
      alert('Errore durante l\'eliminazione della cartella')
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
      </div>
    )
  }

  return (
    <>
      <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Cartelle</h3>
            <button
              onClick={() => setShowNewFolderInput(true)}
              className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              title="Crea nuova cartella"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* New folder input */}
        {showNewFolderInput && (
          <div className="p-3 bg-white border-b border-gray-200">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nome cartella..."
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateFolder()
                  } else if (e.key === 'Escape') {
                    setShowNewFolderInput(false)
                    setNewFolderName('')
                  }
                }}
              />
              <button
                onClick={handleCreateFolder}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setShowNewFolderInput(false)
                  setNewFolderName('')
                }}
                className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Folders list */}
        <div className="flex-1 overflow-y-auto">
          {/* All Documents */}
          <div
            className={`px-4 py-2 cursor-pointer flex items-center gap-2 hover:bg-gray-100 ${
              selectedFolder === null ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
            }`}
            onClick={() => onFolderSelect(null)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className="text-sm">Tutti i documenti</span>
          </div>

          {/* Folder list */}
          {folders.map((folder) => (
            <div
              key={folder.name}
              className={`px-4 py-2 cursor-pointer flex items-center justify-between gap-2 hover:bg-gray-100 ${
                selectedFolder === folder.name ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
              onClick={() => onFolderSelect(folder.name)}
              onContextMenu={(e) => handleRightClick(e, folder.name)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-sm truncate">{folder.name}</span>
              </div>
              <span className="text-xs text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full">
                {folder.count}
              </span>
            </div>
          ))}

          {folders.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              Nessuna cartella presente
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleDeleteFolder(contextMenu.folder)}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Elimina cartella
          </button>
        </div>
      )}
    </>
  )
}