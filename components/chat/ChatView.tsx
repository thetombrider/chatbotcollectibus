'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConversationSidebar } from '@/components/chat/ConversationSidebar'
import { SourceDetailPanel } from '@/components/chat/Citation'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageSkeleton } from '@/components/ui/Skeleton'
import { TextLoop } from '@/components/ui/TextLoop'
import { useToast } from '@/components/ui/Toast'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useChat } from '@/hooks/useChat'
import { useCredits } from '@/hooks/useCredits'
import type { Message, SourceDetail } from '@/types/chat'

interface ChatViewProps {
  readonly initialLogoUrl: string | null
  readonly initialConversationId?: string | null
  readonly initialMessages?: Message[]
  readonly conversationNotFound?: boolean
}

export function ChatView({
  initialLogoUrl,
  initialConversationId = null,
  initialMessages = [],
  conversationNotFound = false,
}: ChatViewProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [logoUrl] = useState<string | null>(initialLogoUrl)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false)
  const [selectedSourcesForPanel, setSelectedSourcesForPanel] = useState<SourceDetail[]>([])
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const { credits, loading: creditsLoading, refetch: refetchCredits } = useCredits()

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
    onConversationCreated: (id) => setConversationId(id),
    initialMessages,
    onMessageComplete: refetchCredits,
  })

  const handleSend = useCallback(
    async (skipCache: boolean = false, messageOverride?: string) => {
      if (conversationNotFound && !conversationId) {
        showToast('Conversazione non disponibile.', 'error')
        return
      }
      try {
        await handleSendOriginal(skipCache, messageOverride)
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Errore durante l'invio del messaggio. Riprova."
        showToast(errorMessage, 'error')
      }
    },
    [conversationId, conversationNotFound, handleSendOriginal, showToast]
  )

  const openSourcesPanel = useCallback((sources: SourceDetail[]) => {
    setSelectedSourcesForPanel(sources)
    setIsSourcesPanelOpen(true)
  }, [])

  const handleRetry = useCallback(
    async (messageIndex: number) => {
      const assistantMessage = messages[messageIndex]
      if (assistantMessage?.role !== 'assistant') return

      let userMessageIndex = messageIndex - 1
      while (userMessageIndex >= 0 && messages[userMessageIndex]?.role !== 'user') {
        userMessageIndex--
      }

      if (userMessageIndex < 0) return

      const userMessage = messages[userMessageIndex]
      if (!userMessage) return

      // Prima elimina i messaggi dal database (user + assistant fallito)
      if (conversationId) {
        try {
          await fetch('/api/messages/delete-last', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, count: 2 }),
          })
        } catch (error) {
          console.error('Failed to delete messages from database:', error)
          showToast('Errore durante il retry. Riprova.', 'error')
          return
        }
      }

      // Poi rimuovi i messaggi dall'UI e ri-invia
      setMessages((prev) => prev.slice(0, userMessageIndex))
      await handleSend(true, userMessage.content)
    },
    [conversationId, handleSend, messages, setMessages, showToast]
  )

  const keyboardShortcuts = useMemo(
    () => [
      {
        key: 'k',
        metaKey: true,
        ctrlKey: true,
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
    ],
    [isSourcesPanelOpen, router]
  )

  useKeyboardShortcuts(keyboardShortcuts)

  const showEmptyState = !conversationNotFound && messages.length === 0

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white relative">
      <ConversationSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col relative">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden fixed top-20 left-4 z-30 p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
          aria-label="Apri menu conversazioni"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex-1 flex overflow-hidden relative">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {conversationNotFound ? (
                <div className="text-center mt-20">
                  <h1 className="text-2xl font-medium text-gray-900 mb-3">Conversazione non trovata</h1>
                  <p className="text-gray-500 mb-4">
                    La conversazione che stai cercando non esiste o è stata eliminata.
                  </p>
                  <button
                    onClick={() => router.push('/chat')}
                    className="inline-block bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Torna alla chat
                  </button>
                </div>
              ) : showEmptyState ? (
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
                  <h1 className="text-3xl font-medium text-gray-900 mb-3">Come posso aiutarti?</h1>
                  <p className="text-gray-500 mb-8">Fai una domanda per iniziare la conversazione</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto mt-8">
                    <div className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <h3 className="font-medium text-gray-900 mb-1.5 text-sm">Esempi di domande</h3>
                      <p className="text-xs text-gray-500">
                        Prova a chiedere: "Quali sono le tendenze nel settore fintech?"
                      </p>
                    </div>
                    <div className="p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                      <h3 className="font-medium text-gray-900 mb-1.5 text-sm">Ricerca documenti</h3>
                      <p className="text-xs text-gray-500">Cerca informazioni specifiche nei documenti caricati</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages
                    .map((msg, idx) => {
                      if (msg.role === 'assistant' && !msg.content) {
                        return null
                      }
                      return (
                        <MessageBubble
                          key={msg.id || `msg-${idx}`}
                          message={msg}
                          onOpenSources={openSourcesPanel}
                          onRetry={msg.role === 'assistant' ? () => handleRetry(idx) : undefined}
                        />
                      )
                    })
                    .filter(Boolean)}
                  {loading &&
                    (() => {
                      const lastMessage = messages[messages.length - 1]
                      const isStreaming = lastMessage?.role === 'assistant' && lastMessage.content.length > 0

                      if (!isStreaming) {
                        const defaultStatusMessages = [
                          'Analisi della domanda...',
                          'Ricerca documenti nella knowledge base...',
                          'Elaborazione contenuti...',
                          'Generazione risposta...',
                        ]

                        const statusMessagesToShow = statusMessage
                          ? [statusMessage, ...defaultStatusMessages]
                          : defaultStatusMessages

                        return (
                          <div className="space-y-3">
                            <div className="flex gap-4 justify-start">
                              <div className="text-gray-500 text-sm font-medium px-2 min-h-[20px]">
                                <TextLoop
                                  key="status-loop"
                                  interval={1.2}
                                  transition={{ duration: 0.5, ease: 'easeInOut' }}
                                  variants={{
                                    initial: { y: 10, opacity: 0 },
                                    animate: { y: 0, opacity: 1 },
                                    exit: { y: -10, opacity: 0 },
                                  }}
                                >
                                  {statusMessagesToShow.map((msgText, textIdx) => (
                                    <span key={textIdx}>{msgText}</span>
                                  ))}
                                </TextLoop>
                              </div>
                            </div>
                            <MessageSkeleton />
                          </div>
                        )
                      }
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
          disabled={conversationNotFound && !conversationId}
          onSend={handleSend}
          statusMessage={statusMessage}
          webSearchEnabled={webSearchEnabled}
          onWebSearchToggle={setWebSearchEnabled}
          credits={credits}
          creditsLoading={creditsLoading}
        />
      </div>
    </div>
  )
}


