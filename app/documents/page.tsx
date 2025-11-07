'use client'

import { useState } from 'react'
import { DocumentUploader } from '@/components/documents/DocumentUploader'
import { DocumentsTable } from '@/components/documents/DocumentsTable'

type TabType = 'upload' | 'manage'

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('upload')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleUploadComplete = (documentId: string, filename: string) => {
    console.log(`Upload completed: ${filename} (${documentId})`)
    // Trigger refresh della tabella
    setRefreshTrigger((prev) => prev + 1)
  }

  return (
    <div className="flex h-[calc(100vh-56px)] bg-gray-50 overflow-hidden">
      {/* Sidebar - Fixed */}
      <aside className="fixed left-0 top-14 h-[calc(100vh-56px)] w-64 bg-white border-r border-gray-200 flex-shrink-0 overflow-y-auto z-10">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Gestione Documenti
          </h2>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('upload')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'upload'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Carica
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'manage'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Gestisci
            </button>
          </nav>
        </div>

        {/* Info panel */}
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Knowledge Base
                </p>
                <p className="text-xs text-blue-700">
                  I documenti caricati vengono elaborati e indicizzati per la
                  ricerca semantica.
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 h-[calc(100vh-56px)] overflow-hidden flex flex-col">
        {activeTab === 'upload' && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-7xl mx-auto px-8 py-8">
              <div className="mb-8">
                <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                  Carica Documenti
                </h1>
                <p className="text-gray-600">
                  Carica PDF, DOCX o file di testo per aggiungerli alla knowledge base.
                  I documenti verranno automaticamente elaborati ed indicizzati.
                </p>
              </div>
              <DocumentUploader onUploadComplete={handleUploadComplete} />
            </div>
          </div>
        )}

        {activeTab === 'manage' && (
          <div className="h-full overflow-hidden flex flex-col min-h-0">
            <div className="max-w-7xl mx-auto px-8 w-full flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex-shrink-0 pt-6 pb-3">
                <h1 className="text-3xl font-semibold text-gray-900 mb-2">
                  Gestisci Documenti
                </h1>
                <p className="text-gray-600">
                  Visualizza, cerca ed elimina i documenti presenti nella knowledge base.
                </p>
              </div>
              <div className="flex-1 overflow-hidden min-h-0">
                <DocumentsTable refreshTrigger={refreshTrigger} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

