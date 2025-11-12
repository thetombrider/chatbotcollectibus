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
    <div className="flex h-[calc(100vh-56px)] bg-gray-50 overflow-hidden">
      {/* Mode Toggle - Fixed at top */}
      <div className="fixed top-14 left-0 right-0 h-12 bg-white border-b border-gray-200 flex items-center px-6 z-20">
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
        <div className="w-full pt-12 h-full overflow-y-auto">
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
        <div className="flex w-full pt-12 h-[calc(100vh-68px)]">
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
              <div className="flex items-center justify-between">
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
            </div>
            <div className="flex-1 overflow-hidden min-h-0 px-6 pb-6">
              <DocumentsTable 
                refreshTrigger={refreshTrigger} 
                selectedFolder={selectedFolder}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

