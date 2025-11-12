import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Message, Source } from '@/types/chat'

interface UseChatOptions {
  conversationId?: string | null
  onConversationCreated?: (id: string) => void
  webSearchEnabled?: boolean
  initialMessages?: Message[]
}

interface UseChatReturn {
  messages: Message[]
  setMessages: (value: Message[] | ((prev: Message[]) => Message[])) => void
  loading: boolean
  statusMessage: string | null
  input: string
  setInput: (value: string) => void
  messagesEndRef: React.RefObject<HTMLDivElement>
  handleSend: (skipCache?: boolean, messageOverride?: string) => Promise<void>
  scrollToBottom: () => void
  webSearchEnabled: boolean
  setWebSearchEnabled: (enabled: boolean) => void
}

interface ChatState {
  messages: Message[]
  input: string
  loading: boolean
  statusMessage: string | null
  conversationId: string | null
  webSearchEnabled: boolean
}

type ChatAction =
  | { type: 'SET_INPUT'; value: string }
  | { type: 'SET_MESSAGES'; value: Message[] }
  | { type: 'PUSH_MESSAGE'; value: Message }
  | { type: 'UPDATE_LAST_MESSAGE'; value: Message }
  | { type: 'POP_MESSAGE' }
  | { type: 'SET_LOADING'; value: boolean }
  | { type: 'SET_STATUS'; value: string | null }
  | { type: 'SET_CONVERSATION_ID'; value: string | null }
  | { type: 'SET_WEB_SEARCH_ENABLED'; value: boolean }

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_INPUT':
      return { ...state, input: action.value }
    case 'SET_MESSAGES':
      return { ...state, messages: action.value }
    case 'PUSH_MESSAGE':
      return { ...state, messages: [...state.messages, action.value] }
    case 'UPDATE_LAST_MESSAGE': {
      if (state.messages.length === 0) {
        return state
      }
      const nextMessages = [...state.messages]
      nextMessages[nextMessages.length - 1] = action.value
      return { ...state, messages: nextMessages }
    }
    case 'POP_MESSAGE':
      return { ...state, messages: state.messages.slice(0, -1) }
    case 'SET_LOADING':
      return { ...state, loading: action.value }
    case 'SET_STATUS':
      return { ...state, statusMessage: action.value }
    case 'SET_CONVERSATION_ID':
      return { ...state, conversationId: action.value }
    case 'SET_WEB_SEARCH_ENABLED':
      return { ...state, webSearchEnabled: action.value }
    default:
      return state
  }
}

/**
 * Custom hook for managing chat functionality with a reducer-based state machine.
 */
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const {
    conversationId: controlledConversationId,
    onConversationCreated,
    webSearchEnabled: initialWebSearchEnabled = false,
    initialMessages = [],
  } = options

  const initialStateRef = useRef<ChatState>({
    messages: initialMessages,
    input: '',
    loading: false,
    statusMessage: null,
    conversationId: controlledConversationId ?? null,
    webSearchEnabled: initialWebSearchEnabled,
  })

  const [state, dispatch] = useReducer(chatReducer, initialStateRef.current)
  const stateRef = useRef(state)
  const onConversationCreatedRef = useRef(onConversationCreated)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    onConversationCreatedRef.current = onConversationCreated
  }, [onConversationCreated])

  useEffect(() => {
    if (
      controlledConversationId !== undefined &&
      controlledConversationId !== stateRef.current.conversationId
    ) {
      dispatch({ type: 'SET_CONVERSATION_ID', value: controlledConversationId })
    }
  }, [controlledConversationId])

  useEffect(() => {
    dispatch({ type: 'SET_WEB_SEARCH_ENABLED', value: initialWebSearchEnabled })
  }, [initialWebSearchEnabled])

  useEffect(() => {
    dispatch({ type: 'SET_MESSAGES', value: initialMessages })
  }, [initialMessages])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [state.messages.length, scrollToBottom])

  const setInput = useCallback((value: string) => {
    dispatch({ type: 'SET_INPUT', value })
  }, [])

  const setMessages = useCallback(
    (value: Message[] | ((prev: Message[]) => Message[])) => {
      const nextMessages =
        typeof value === 'function'
          ? (value as (prev: Message[]) => Message[])(stateRef.current.messages)
          : value
      dispatch({ type: 'SET_MESSAGES', value: nextMessages })
    },
    []
  )

  const setWebSearchEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_WEB_SEARCH_ENABLED', value: enabled })
  }, [])

  const handleSend = useCallback(async (skipCache = false, messageOverride?: string) => {
    const currentState = stateRef.current
    const messageContent = (messageOverride ?? currentState.input).trim()

    if (!messageContent || currentState.loading) {
      return
    }

    const userMessage: Message = {
      role: 'user',
      content: messageContent,
    }

    dispatch({ type: 'PUSH_MESSAGE', value: userMessage })
    if (!messageOverride) {
      dispatch({ type: 'SET_INPUT', value: '' })
    }
    dispatch({ type: 'SET_LOADING', value: true })
    dispatch({ type: 'SET_STATUS', value: null })

    let conversationId = currentState.conversationId
    const wasNewConversation = !conversationId

    if (!conversationId) {
      try {
        const createResponse = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: messageContent.substring(0, 50) }),
        })

        if (!createResponse.ok) {
          throw new Error(`Failed to create conversation: ${createResponse.status}`)
        }

        const { conversation } = await createResponse.json()
        conversationId = conversation.id
        dispatch({ type: 'SET_CONVERSATION_ID', value: conversationId })
        onConversationCreatedRef.current?.(conversation.id)
      } catch (error) {
        console.error('Failed to create conversation:', error)
        dispatch({ type: 'SET_LOADING', value: false })
        dispatch({ type: 'POP_MESSAGE' })
        throw new Error('Failed to create conversation')
      }
    }

    try {
      const requestBody = {
        message: messageContent,
        conversationId,
        webSearchEnabled: stateRef.current.webSearchEnabled,
        skipCache,
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantMessage: Message = {
        role: 'assistant',
        content: '',
        sources: [],
      }

      const updateAssistantMessage = (partial: Partial<Message>) => {
        assistantMessage = {
          ...assistantMessage,
          ...partial,
        }
        dispatch({ type: 'UPDATE_LAST_MESSAGE', value: assistantMessage })
      }

      dispatch({ type: 'PUSH_MESSAGE', value: assistantMessage })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue
          }

          try {
            const jsonString = line.slice(6)
            
            // Skip empty lines
            if (!jsonString.trim()) {
              continue
            }
            
            const data = JSON.parse(jsonString)

            switch (data.type) {
              case 'status':
                dispatch({ type: 'SET_STATUS', value: data.message || null })
                break
              case 'text':
                dispatch({ type: 'SET_STATUS', value: null })
                updateAssistantMessage({
                  content: `${assistantMessage.content}${data.content}`,
                })
                break
              case 'text_complete':
                updateAssistantMessage({ content: data.content })
                break
              case 'done': {
                dispatch({ type: 'SET_STATUS', value: null })
                if (data.sources) {
                  updateAssistantMessage({ sources: data.sources as Source[] })
                }
                dispatch({ type: 'SET_LOADING', value: false })
                if (wasNewConversation && conversationId) {
                  window.history.replaceState(null, '', `/chat/${conversationId}`)
                }
                break
              }
              case 'error':
                dispatch({ type: 'SET_STATUS', value: null })
                dispatch({ type: 'SET_LOADING', value: false })
                dispatch({ type: 'POP_MESSAGE' })
                throw new Error(data.error || 'Stream error')
              default:
                break
            }
          } catch (parseError) {
            const jsonString = line.slice(6)
            console.warn('Failed to parse SSE data:', {
              error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
              line: line.substring(0, 100) + (line.length > 100 ? '...' : ''),
              jsonLength: jsonString.length,
              firstChars: jsonString.substring(0, 50),
              lastChars: jsonString.length > 50 ? jsonString.substring(jsonString.length - 50) : ''
            })
            
            // Se l'errore è un JSON malformato per contenuto troppo grande,
            // non interrompere lo streaming - potrebbe essere un chunk parziale
            if (parseError instanceof SyntaxError && parseError.message.includes('unterminated string')) {
              // Questo potrebbe essere un chunk parziale - continua
              continue
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      dispatch({ type: 'SET_LOADING', value: false })
      dispatch({ type: 'POP_MESSAGE' })
      throw error
    }
  }, [])

  return {
    messages: state.messages,
    setMessages,
    loading: state.loading,
    statusMessage: state.statusMessage,
    input: state.input,
    setInput,
    messagesEndRef,
    handleSend,
    scrollToBottom,
    webSearchEnabled: state.webSearchEnabled,
    setWebSearchEnabled,
  }
}

