'use client'

import { useState } from 'react'
import { DocumentUploader } from '@/components/documents/DocumentUploader'
import { DocumentsTable } from '@/components/documents/DocumentsTable'
import { FolderSidebar } from '@/components/documents/FolderSidebar'

type TabType = 'upload' | 'manage'

export default function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('manage')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const handleUploadComplete = (documentId: string, filename: string) => {
    console.log(`Upload completed: ${filename} (${documentId})`)
    // Trigger refresh della tabella
    setRefreshTrigger((prev) => prev + 1)
  }

  const handleFolderSelect = (folder: string | null) => {
    setSelectedFolder(folder)
  }

  const handleFolderCreated = () => {
    // Refresh the documents table when a new folder is created
    setRefreshTrigger((prev) => prev + 1)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-gray-50 overflow-hidden">
      {/* Mode Toggle - Normal flow */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Carica
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'manage'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Gestisci
          </button>
        </div>
      </div>

      {activeTab === 'upload' && (
        <div className="flex-1 overflow-y-auto">
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
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Folder Sidebar */}
          <div className="w-64 flex-shrink-0">
            <FolderSidebar
              selectedFolder={selectedFolder}
              onFolderSelect={handleFolderSelect}
              onFolderCreated={handleFolderCreated}
            />
          </div>

          {/* Documents Table */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white">
            <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">
                    {selectedFolder ? selectedFolder : 'Tutti i documenti'}
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedFolder 
                      ? `Documenti nella cartella "${selectedFolder}"`
                      : 'Visualizza, cerca ed elimina i documenti presenti nella knowledge base'
                    }
                  </p>
                </div>
              </div>
              
              {/* Search bar - Fixed position */}
              <div className="mb-4">
                <div className="max-w-md">
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
            </div>
            <div className="flex-1 px-6 pb-2">
              <DocumentsTable 
                refreshTrigger={refreshTrigger} 
                selectedFolder={selectedFolder}
                searchQuery={searchQuery}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

