'use client'

import { useState, useRef, useEffect } from 'react'
import { ConversationSidebar } from '@/components/chat/ConversationSidebar'
import { MessageWithCitations } from '@/components/chat/Citation'

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
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    scrollToBottom()
  }, [messages])

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

              if (data.type === 'text') {
                assistantMessage.content += data.content
                if (data.sources) {
                  assistantMessage.sources = data.sources
                }
                setMessages((prev) => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = { ...assistantMessage }
                  return newMessages
                })
              } else if (data.type === 'done') {
                setLoading(false)
                // Ricarica i messaggi dal database per ottenere gli ID
                try {
                  const reloadRes = await fetch(`/api/conversations/${conversationId}`)
                  if (reloadRes.ok) {
                    const reloadData = await reloadRes.json()
                    const reloadedMessages = (reloadData.messages || []).map((msg: Message) => {
                      const sources = msg.metadata?.sources as Array<{ index: number; filename: string; documentId: string; similarity: number }> | undefined
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

  return (
    <div className="flex h-screen bg-white">
      <ConversationSidebar />
      <div className="flex-1 flex flex-col">
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
                {messages.map((msg, idx) => (
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
                        <MessageWithCitations content={msg.content} sources={msg.sources} />
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
                ))}
                {loading && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Scrivi un messaggio..."
                  rows={1}
                  className="w-full resize-none border border-gray-300 rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent text-gray-900 placeholder-gray-500 bg-white"
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
            <p className="text-xs text-gray-500 mt-2 text-center">
              Il chatbot può commettere errori. Verifica sempre le informazioni importanti.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

