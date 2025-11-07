'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ConversationSidebar } from '@/components/chat/ConversationSidebar'
import { SourceDetailPanel } from '@/components/chat/Citation'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageSkeleton } from '@/components/ui/Skeleton'
import { useChat } from '@/hooks/useChat'
import { useToast } from '@/components/ui/Toast'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import type { SourceDetail } from '@/types/chat'

export default function ChatPage() {
  const router = useRouter()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false)
  const [selectedSourcesForPanel, setSelectedSourcesForPanel] = useState<SourceDetail[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const { showToast } = useToast()

  const {
    messages,
    loading,
    statusMessage,
    input,
    setInput,
    messagesEndRef,
    handleSend: handleSendOriginal,
    webSearchEnabled,
    setWebSearchEnabled,
  } = useChat({
    onConversationCreated: (_id) => {
      // Handle conversation creation if needed
    },
  })

  useEffect(() => {
    // Load company logo
    const loadLogo = async () => {
      try {
        const response = await fetch('/api/settings')
        if (response.ok) {
          const data = await response.json()
          setLogoUrl(data.company_logo?.url || null)
        }
      } catch (err) {
        console.error('Error loading logo:', err)
        // Fail silently - logo is optional
      }
    }
    loadLogo()
  }, [])

  const handleSend = async () => {
    try {
      await handleSendOriginal()
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Errore durante l\'invio del messaggio. Riprova.'
      showToast(errorMessage, 'error')
    }
  }

  const openSourcesPanel = (sources: SourceDetail[]) => {
    setSelectedSourcesForPanel(sources)
    setIsSourcesPanelOpen(true)
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      metaKey: true, // Cmd+K on Mac
      ctrlKey: true, // Ctrl+K on Windows/Linux
      handler: () => {
        router.push('/chat')
      },
      description: 'Nuova conversazione',
    },
    {
      key: 'Escape',
      handler: () => {
        if (isSourcesPanelOpen) {
          setIsSourcesPanelOpen(false)
        }
      },
      description: 'Chiudi pannello',
    },
  ])

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white relative">
      <ConversationSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col relative">
        {/* Mobile menu button */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden fixed top-20 left-4 z-30 p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
          aria-label="Apri menu conversazioni"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.length === 0 ? (
                <div className="text-center mt-20 space-y-4">
                  {logoUrl && (
                    <div className="flex justify-center mb-8">
                      <img
                        src={logoUrl}
                        alt="Company Logo"
                        className="max-w-xs max-h-32 object-contain"
                      />
                    </div>
                  )}
                  <h1 className="text-3xl font-medium text-gray-900 mb-3">
                    Come posso aiutarti?
                  </h1>
                  <p className="text-gray-500 mb-8">
                    Fai una domanda per iniziare la conversazione
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto mt-8">
                    <div className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <h3 className="font-medium text-gray-900 mb-1.5 text-sm">Esempi di domande</h3>
                      <p className="text-xs text-gray-500">
                        Prova a chiedere: "Quali sono le tendenze nel settore fintech?"
                      </p>
                    </div>
                    <div className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <h3 className="font-medium text-gray-900 mb-1.5 text-sm">Ricerca documenti</h3>
                      <p className="text-xs text-gray-500">
                        Cerca informazioni specifiche nei documenti caricati
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages
                    .filter((msg) => !(msg.role === 'assistant' && !msg.content))
                    .map((msg, idx) => (
                      <MessageBubble
                        key={msg.id || `msg-${idx}`}
                        message={msg}
                        onOpenSources={openSourcesPanel}
                      />
                    ))}
                  {loading && (() => {
                    const lastMessage = messages[messages.length - 1]
                    const isStreaming = lastMessage?.role === 'assistant' && lastMessage.content.length > 0
                    
                    // Show phase label + skeletons only before streaming starts
                    if (!isStreaming) {
                      return (
                        <div className="space-y-3">
                          {statusMessage && (
                            <div className="flex gap-4 justify-start">
                              <div className="text-gray-500 text-sm font-medium px-2">
                                {statusMessage}
                              </div>
                            </div>
                          )}
                          <MessageSkeleton />
                        </div>
                      )
                    }
                    // When streaming, the message is already rendered above, so nothing to show here
                    return null
                  })()}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          <SourceDetailPanel
            isOpen={isSourcesPanelOpen}
            sources={selectedSourcesForPanel}
            onClose={() => setIsSourcesPanelOpen(false)}
          />
        </div>

        <ChatInput
          input={input}
          setInput={setInput}
          loading={loading}
          onSend={handleSend}
          statusMessage={statusMessage}
          webSearchEnabled={webSearchEnabled}
          onWebSearchToggle={setWebSearchEnabled}
        />
      </div>
    </div>
  )
}
