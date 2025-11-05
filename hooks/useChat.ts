import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { Message, Source } from '@/types/chat'

interface UseChatOptions {
  conversationId?: string | null
  onConversationCreated?: (id: string) => void
}

interface UseChatReturn {
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  loading: boolean
  statusMessage: string | null
  input: string
  setInput: (value: string) => void
  messagesEndRef: React.RefObject<HTMLDivElement>
  handleSend: () => Promise<void>
  scrollToBottom: () => void
}

/**
 * Custom hook for managing chat functionality
 * Handles message streaming, conversation creation, and state management
 */
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { conversationId: initialConversationId, onConversationCreated } = options
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId || null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const onConversationCreatedRef = useRef(onConversationCreated)
  
  useEffect(() => {
    onConversationCreatedRef.current = onConversationCreated
  }, [onConversationCreated])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages.length, scrollToBottom])

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return

    const messageContent = input.trim()
    const userMessage: Message = {
      role: 'user',
      content: messageContent,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setStatusMessage(null)

    // Create conversation if it doesn't exist
    const wasNewConversation = !conversationId
    let currentConversationId = conversationId
    if (!currentConversationId) {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: messageContent.substring(0, 50) }),
        })
        const { conversation } = await res.json()
        currentConversationId = conversation.id
        setConversationId(conversation.id)
        onConversationCreatedRef.current?.(conversation.id)
      } catch (error) {
        console.error('Failed to create conversation:', error)
        setLoading(false)
        setMessages((prev) => prev.slice(0, -1))
        throw new Error('Failed to create conversation')
      }
    }

    // Streaming response
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageContent,
          conversationId: currentConversationId,
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
                setStatusMessage(data.message || null)
              } else if (data.type === 'text') {
                setStatusMessage(null)
                assistantMessage.content += data.content
                setMessages((prev) => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = { ...assistantMessage }
                  return newMessages
                })
              } else if (data.type === 'text_complete') {
                assistantMessage.content = data.content
                setMessages((prev) => {
                  const newMessages = [...prev]
                  newMessages[newMessages.length - 1] = { ...assistantMessage }
                  return newMessages
                })
              } else if (data.type === 'done') {
                setStatusMessage(null)
                if (data.sources) {
                  assistantMessage.sources = data.sources as Source[]
                  setMessages((prev) => {
                    const newMessages = [...prev]
                    newMessages[newMessages.length - 1] = { ...assistantMessage }
                    return newMessages
                  })
                }
                setLoading(false)
                // Update URL without reloading if it's a new conversation
                if (wasNewConversation && currentConversationId) {
                  window.history.replaceState(null, '', `/chat/${currentConversationId}`)
                }
              } else if (data.type === 'error') {
                setStatusMessage(null)
                console.error('Stream error:', data.error)
                setLoading(false)
                setMessages((prev) => prev.slice(0, -1))
                throw new Error(data.error || 'Stream error')
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
      setMessages((prev) => prev.slice(0, -1))
      throw error
    }
  }, [input, loading, conversationId, onConversationCreated])

  return {
    messages,
    setMessages,
    loading,
    statusMessage,
    input,
    setInput,
    messagesEndRef,
    handleSend,
    scrollToBottom,
  }
}

