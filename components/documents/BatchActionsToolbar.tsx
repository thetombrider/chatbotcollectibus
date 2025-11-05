'use client'

import { useState } from 'react'
import { FolderSelector } from './FolderSelector'

interface BatchActionsToolbarProps {
  selectedCount: number
  onDelete: () => void
  onMove: (folder: string | null) => void
  onClearSelection: () => void
}

export function BatchActionsToolbar({
  selectedCount,
  onDelete,
  onMove,
  onClearSelection,
}: BatchActionsToolbarProps) {
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [targetFolder, setTargetFolder] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleMoveClick = () => {
    setShowMoveDialog(true)
  }

  const handleMoveConfirm = () => {
    onMove(targetFolder)
    setTargetFolder(null)
    setShowMoveDialog(false)
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirm = () => {
    onDelete()
    setShowDeleteConfirm(false)
  }

  if (selectedCount === 0) {
    return null
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">
              {selectedCount} documento{selectedCount !== 1 ? 'i' : ''} selezionato{selectedCount !== 1 ? 'i' : ''}
            </span>
            <button
              onClick={onClearSelection}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Deseleziona tutto
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleMoveClick}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              Sposta in cartella
            </button>
            <button
              onClick={handleDeleteClick}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Elimina
            </button>
          </div>
        </div>
      </div>

      {/* Move Dialog */}
      {showMoveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Sposta {selectedCount} documento{selectedCount !== 1 ? 'i' : ''} in cartella
            </h3>
            <div className="mb-6">
              <FolderSelector
                value={targetFolder}
                onChange={setTargetFolder}
                allowCreate={true}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleMoveConfirm}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                Sposta
              </button>
              <button
                onClick={() => {
                  setShowMoveDialog(false)
                  setTargetFolder(null)
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Elimina documenti
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Sei sicuro di voler eliminare {selectedCount} documento{selectedCount !== 1 ? 'i' : ''}?
              Questa azione non può essere annullata.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Elimina
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

