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
import type { Conversation, Message, SourceDetail } from '@/types/chat'

export default function ChatPageWithId({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loadingConversation, setLoadingConversation] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false)
  const [selectedSourcesForPanel, setSelectedSourcesForPanel] = useState<SourceDetail[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const { showToast } = useToast()

  const {
    messages,
    setMessages,
    loading,
    statusMessage,
    input,
    setInput,
    messagesEndRef,
    handleSend: handleSendOriginal,
    webSearchEnabled,
    setWebSearchEnabled,
  } = useChat({
    conversationId,
    onConversationCreated: (id) => {
      setConversationId(id)
    },
  })

  useEffect(() => {
    const loadConversation = async () => {
      const { id } = await params
      setConversationId(id)
      setLoadingConversation(true)

      try {
        const res = await fetch(`/api/conversations/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            console.warn(`[chat/[id]] Conversation ${id} not found`)
            window.location.href = '/chat'
            return
          }
          throw new Error(`Failed to fetch: ${res.status}`)
        }
        const data = await res.json()
        setConversation(data.conversation)
        // Extract sources from metadata if present
        const loadedMessages = (data.messages || []).map((msg: Message) => {
          const sources = msg.metadata?.sources as SourceDetail[] | undefined
          return {
            ...msg,
            sources: sources && Array.isArray(sources) && sources.length > 0 ? sources : undefined,
          }
        })
        setMessages(loadedMessages)
      } catch (error) {
        console.error('Failed to load conversation:', error)
        setConversation(null)
        setMessages([])
      } finally {
        setLoadingConversation(false)
      }
    }

    loadConversation()
  }, [params, setMessages])

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
    if (!conversationId) return
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
            <div className="max-w-3xl mx-auto px-4 py-8">
              {loadingConversation ? (
                <div className="space-y-6 mt-20">
                  <MessageSkeleton />
                  <MessageSkeleton />
                  <MessageSkeleton />
                </div>
              ) : !conversation ? (
                <div className="text-center mt-20">
                  <h1 className="text-2xl font-semibold text-gray-900 mb-4">
                    Conversazione non trovata
                  </h1>
                  <p className="text-gray-600 mb-4">
                    La conversazione che stai cercando non esiste o è stata eliminata.
                  </p>
                  <a
                    href="/chat"
                    className="inline-block bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Torna alla chat
                  </a>
                </div>
              ) : messages.length === 0 ? (
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
                  <h1 className="text-4xl font-semibold text-gray-900 mb-4">
                    Nuova conversazione
                  </h1>
                  <p className="text-gray-600 mb-8">
                    Fai una domanda per iniziare la conversazione
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto mt-8">
                    <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <h3 className="font-semibold text-gray-900 mb-2">Continuare la conversazione</h3>
                      <p className="text-sm text-gray-600">
                        Fai una domanda per continuare il dialogo
                      </p>
                    </div>
                    <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <h3 className="font-semibold text-gray-900 mb-2">Chiedi informazioni</h3>
                      <p className="text-sm text-gray-600">
                        Il chatbot può rispondere a domande sui documenti
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
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
          disabled={!conversationId}
          onSend={handleSend}
          statusMessage={statusMessage}
          webSearchEnabled={webSearchEnabled}
          onWebSearchToggle={setWebSearchEnabled}
        />
      </div>
    </div>
  )
}
