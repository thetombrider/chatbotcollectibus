'use client'

import { useState, useEffect } from 'react'
import { ConversationSidebar } from '@/components/chat/ConversationSidebar'
import { SourceDetailPanel } from '@/components/chat/Citation'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ChatInput } from '@/components/chat/ChatInput'
import { useChat } from '@/hooks/useChat'
import { useToast } from '@/components/ui/Toast'
import type { SourceDetail } from '@/types/chat'

export default function ChatPage() {
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
    scrollToBottom,
  } = useChat({
    onConversationCreated: (id) => {
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

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white relative">
      <ConversationSidebar />
      <div className="flex-1 flex flex-col relative">
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-8">
              {messages.length === 0 ? (
                <div className="text-center mt-20">
                  {logoUrl && (
                    <div className="flex justify-center mb-8">
                      <img
                        src={logoUrl}
                        alt="Company Logo"
                        className="max-w-xs max-h-32 object-contain"
                      />
                    </div>
                  )}
                  <h1 className="text-4xl font-semibold text-gray-900 mb-4">
                    Come posso aiutarti?
                  </h1>
                  <p className="text-gray-600">
                    Fai una domanda per iniziare la conversazione
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map((msg, idx) => (
                    <MessageBubble
                      key={msg.id || `msg-${idx}`}
                      message={msg}
                      onOpenSources={openSourcesPanel}
                    />
                  ))}
                  {loading && (
                    <div className="flex gap-4 justify-start">
                      <div
                        className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"
                        aria-label="Caricamento in corso"
                      >
                        <svg
                          className="w-5 h-5 text-gray-600 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
                        <p className="text-gray-600 text-sm">
                          {statusMessage || 'Elaborazione in corso...'}
                        </p>
                      </div>
                    </div>
                  )}
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
        />
      </div>
    </div>
  )
}
