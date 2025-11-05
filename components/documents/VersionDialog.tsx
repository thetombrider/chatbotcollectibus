'use client'

import { useState } from 'react'
import type { Document } from '@/lib/supabase/database.types'

interface VersionDialogProps {
  isOpen: boolean
  existingDocument: {
    id: string
    filename: string
    folder?: string | null
    version: number
    created_at: string
  }
  maxVersion: number
  onReplace: () => void
  onVersion: () => void
  onCancel: () => void
}

export function VersionDialog({
  isOpen,
  existingDocument,
  maxVersion,
  onReplace,
  onVersion,
  onCancel,
}: VersionDialogProps) {
  if (!isOpen) return null

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            File già esistente
          </h3>

          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              Esiste già un documento con lo stesso nome:
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {existingDocument.filename}
                  </p>
                  {existingDocument.folder && (
                    <p className="text-sm text-gray-500 mt-1">
                      Cartella: {existingDocument.folder}
                    </p>
                  )}
                </div>
                <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded">
                  v{existingDocument.version}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Creato: {formatDate(existingDocument.created_at)}
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Cosa vuoi fare?
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={onReplace}
              className="px-4 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              Sostituire documento esistente
            </button>

            <button
              onClick={onVersion}
              className="px-4 py-2.5 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              Creare nuova versione (v{maxVersion + 1})
            </button>

            <button
              onClick={onCancel}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

