'use client'

import { useState, useEffect } from 'react'

interface FolderSelectorProps {
  value?: string | null
  onChange: (folder: string | null) => void
  allowCreate?: boolean
}

export function FolderSelector({
  value,
  onChange,
  allowCreate = true,
}: FolderSelectorProps) {
  const [folders, setFolders] = useState<Array<{ name: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [showInput, setShowInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  useEffect(() => {
    fetchFolders()
  }, [])

  const fetchFolders = async () => {
    try {
      const response = await fetch('/api/documents/folders')
      if (!response.ok) {
        throw new Error('Failed to fetch folders')
      }
      const data = await response.json()
      setFolders(data.folders || [])
    } catch (err) {
      console.error('Error fetching folders:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (folder: string | null) => {
    onChange(folder)
    setShowInput(false)
  }

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      const folderName = newFolderName.trim()
      // Call onChange immediately so the parent can use it
      onChange(folderName)
      setNewFolderName('')
      setShowInput(false)
      // Refresh folders list to include the new folder
      await fetchFolders()
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <select
          value={value || ''}
          onChange={(e) => handleSelect(e.target.value || null)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
        >
          <option value="">Nessuna cartella</option>
          {folders.map((folder) => (
            <option key={folder.name} value={folder.name}>
              {folder.name} ({folder.count})
            </option>
          ))}
        </select>
        {allowCreate && (
          <button
            type="button"
            onClick={() => setShowInput(!showInput)}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            {showInput ? 'Annulla' : 'Nuova'}
          </button>
        )}
      </div>

      {showInput && allowCreate && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nome cartella..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateFolder()
              } else if (e.key === 'Escape') {
                setShowInput(false)
                setNewFolderName('')
              }
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleCreateFolder}
            className="px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            Crea
          </button>
        </div>
      )}
    </div>
  )
}

