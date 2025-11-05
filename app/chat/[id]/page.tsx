'use client'

import { useState, useRef, useEffect } from 'react'
import { ConversationSidebar } from '@/components/chat/ConversationSidebar'
import { MessageWithCitations, SourceDetailPanel } from '@/components/chat/Citation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
  sources?: Array<{ index: number; filename: string; documentId: string; similarity: number }>
}

interface Conversation {
  id: string
  title: string | null
  messages: Message[]
}

export default function ChatPageWithId({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingConversation, setLoadingConversation] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isSourcesPanelOpen, setIsSourcesPanelOpen] = useState(false)
  const [selectedSourcesForPanel, setSelectedSourcesForPanel] = useState<Array<{ index: number; filename: string; documentId: string; similarity: number; content?: string; chunkIndex?: number }>>([])
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
            // Redirect alla pagina chat principale se la conversazione non esiste
            window.location.href = '/chat'
            return
          }
          throw new Error(`Failed to fetch: ${res.status}`)
        }
        const data = await res.json()
        console.log('[chat/[id]] Loaded conversation:', data)
        setConversation(data.conversation)
        // Estrai sources dai metadata se presenti
        const loadedMessages = (data.messages || []).map((msg: Message) => {
          const sources = msg.metadata?.sources as Array<{ index: number; filename: string; documentId: string; similarity: number }> | undefined
          return {
            ...msg,
            sources: sources && Array.isArray(sources) && sources.length > 0 ? sources : undefined,
          }
        })
        console.log('[chat/[id]] Loaded messages:', loadedMessages)
        console.log('[chat/[id]] Messages count:', loadedMessages.length)
        console.log('[chat/[id]] First message:', loadedMessages[0])
        console.log('[chat/[id]] Messages content check:', loadedMessages.map((m: Message) => ({ id: m.id, role: m.role, contentLength: m.content?.length || 0 })))
        setMessages(loadedMessages)
      } catch (error) {
        console.error('Failed to load conversation:', error)
        // Mostra un messaggio di errore invece di rimanere in loading
        setConversation(null)
        setMessages([])
      } finally {
        setLoadingConversation(false)
      }
    }

    loadConversation()
  }, [params])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Auto-resize textarea based on content
  const handleTextareaResize = () => {
    const textarea = textareaRef.current
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto'
      // Set height to scrollHeight (min 52px, max 200px)
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 52), 200)
      textarea.style.height = `${newHeight}px`
    }
  }

  // Handle input change with auto-resize
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Trigger resize on next frame to ensure accurate measurement
    requestAnimationFrame(handleTextareaResize)
  }

  // Reset textarea height when input is cleared (after sending message)
  useEffect(() => {
    if (input === '' && textareaRef.current) {
      textareaRef.current.style.height = '52px'
    }
  }, [input])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Componenti markdown personalizzati per messaggi senza citazioni
  const markdownComponents: Components = {
    p: ({ children }) => (
      <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>
    ),
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold mb-3 mt-6 first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl font-bold mb-2 mt-5 first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h3>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) => {
      if (inline) {
        return (
          <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
            {children}
          </code>
        )
      }
      return (
        <code className="block bg-gray-100 text-gray-800 p-3 rounded-md text-sm font-mono overflow-x-auto mb-4">
          {children}
        </code>
      )
    },
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4 text-gray-700">
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 underline"
      >
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-4">
        <table className="min-w-full border-collapse border border-gray-300">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-gray-100">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-300 px-4 py-2">{children}</td>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic">{children}</em>
    ),
  }

  const handleSend = async () => {
    if (!input.trim() || loading || !conversationId) return

    const messageContent = input.trim()
    const userMessage: Message = {
      role: 'user',
      content: messageContent,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setStatusMessage(null) // Reset status message for new request

    // Streaming response
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageContent,
          conversationId,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`)
      }

      if (!res.body) {
        throw new Error('No response body')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        sources: [],
      }

      setMessages((prev) => [...prev, assistantMessage])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'status') {
                // Update or clear status message
                setStatusMessage(data.message || null)
              } else if (data.type === 'text') {
                // Hide status message when text streaming starts
                setStatusMessage(null)
                assistantMessage.content += data.content
                setMessages((prev) => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = { ...assistantMessage }
                  return newMessages
                })
              } else if (data.type === 'text_complete') {
                // Sostituisci il contenuto con la versione completa rinumerata dal backend
                assistantMessage.content = data.content
                setMessages((prev) => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = { ...assistantMessage }
                  return newMessages
                })
              } else if (data.type === 'done') {
                // Clear status message
                setStatusMessage(null)
                // Ricevi sources nel messaggio done
                if (data.sources) {
                  assistantMessage.sources = data.sources
                  setMessages((prev) => {
                    const newMessages = [...prev]
                    newMessages[newMessages.length - 1] = { ...assistantMessage }
                    return newMessages
                  })
                }
                setLoading(false)
                // NON ricaricare i messaggi dal database qui perché sovrascriverebbe il contenuto rinumerato
                // Il contenuto rinumerato è già stato ricevuto tramite text_complete
                // Ricarica solo se necessario per ottenere gli ID (ma mantieni il contenuto attuale)
                try {
                  const reloadRes = await fetch(`/api/conversations/${conversationId}`)
                  if (reloadRes.ok) {
                    const reloadData = await reloadRes.json()
                    const reloadedMessages = (reloadData.messages || []).map((msg: Message, idx: number) => {
                      const sources = msg.metadata?.sources as Array<{ index: number; filename: string; documentId: string; similarity: number }> | undefined
                      // Se è l'ultimo messaggio (quello appena creato), mantieni il contenuto e le sources già aggiornate
                      const isLastMessage = idx === reloadData.messages.length - 1
                      if (isLastMessage && assistantMessage.content) {
                        return {
                          ...msg,
                          content: assistantMessage.content, // Mantieni il contenuto rinumerato
                          sources: assistantMessage.sources || (sources && Array.isArray(sources) && sources.length > 0 ? sources : undefined),
                        }
                      }
                      return {
                        ...msg,
                        sources: sources && Array.isArray(sources) && sources.length > 0 ? sources : undefined,
                      }
                    })
                    setMessages(reloadedMessages)
                  }
                } catch (reloadError) {
                  console.error('Failed to reload messages:', reloadError)
                }
              } else if (data.type === 'error') {
                // Clear status message on error
                setStatusMessage(null)
                console.error('Stream error:', data.error)
                setLoading(false)
                // Rimuovi il messaggio assistant vuoto in caso di errore
                setMessages((prev) => prev.slice(0, -1))
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', parseError)
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      setLoading(false)
      // Rimuovi il messaggio assistant vuoto in caso di errore
      setMessages((prev) => prev.slice(0, -1))
      alert('Errore durante l\'invio del messaggio. Riprova.')
    }
  }

  const openSourcesPanel = (sources: Array<{ index: number; filename: string; documentId: string; similarity: number }>) => {
    // Le sources sono già filtrate e rinumerate dal backend
    // Basta passarle direttamente al side panel
    console.log('[chat/[id]/page] Opening sources panel with', sources.length, 'sources')
    console.log('[chat/[id]/page] Sources:', sources.map(s => ({ 
      index: s.index, 
      filename: s.filename,
      similarity: s.similarity 
    })))
    
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
            {loadingConversation ? (
              <div className="text-center mt-20">
                <div className="animate-pulse text-gray-500">Caricamento conversazione...</div>
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
              <div className="text-center mt-20">
                <h1 className="text-4xl font-semibold text-gray-900 mb-4">
                  {conversation?.title || 'Conversazione'}
                </h1>
                <p className="text-gray-600">
                  Fai una domanda per iniziare la conversazione
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg, idx) => {
                  if (idx === 0) {
                    console.log('[chat/[id]] Rendering messages, count:', messages.length)
                  }
                  console.log(`[chat/[id]] Rendering message ${idx}:`, { id: msg.id, role: msg.role, contentLength: msg.content?.length || 0 })
                  return (
                    <div
                      key={msg.id || `msg-${idx}`}
                      className={`flex gap-4 ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] ${
                          msg.role === 'user'
                            ? 'bg-gray-100 text-gray-900 rounded-2xl rounded-tr-sm'
                            : 'bg-white text-gray-900 rounded-2xl rounded-tl-sm border border-gray-200'
                        } px-4 py-3`}
                        style={{ overflow: 'visible' }}
                      >
                        {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 ? (
                          <MessageWithCitations 
                            content={msg.content} 
                            sources={msg.sources} 
                            onOpenSources={() => openSourcesPanel(msg.sources || [])} 
                          />
                        ) : msg.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm font-medium">U</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                {loading && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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

        <div className="relative z-10 backdrop-blur-xl bg-transparent shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Scrivi un messaggio..."
                  rows={1}
                  className="w-full resize-none border border-gray-300 rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent text-gray-900 placeholder-gray-500 bg-white/95 backdrop-blur-sm"
                  disabled={loading || !conversationId}
                  style={{ minHeight: '52px', maxHeight: '200px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim() || !conversationId}
                  className="absolute right-2 bottom-2 p-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Invia messaggio"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center mt-2">
              <p className="text-xs text-gray-500">
                Il chatbot può commettere errori. Verifica sempre le informazioni importanti.
              </p>
              <p className="text-xs text-gray-400">
                {input.length} caratteri
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

