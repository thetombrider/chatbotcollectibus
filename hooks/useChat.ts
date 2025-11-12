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

  const delay = useCallback((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)), [])

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

  const pollJobStatus = useCallback(
    async (jobId: string, options: { wasNewConversation: boolean; conversationId: string | null }) => {
      const MAX_ATTEMPTS = 60

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const response = await fetch(`/api/jobs/${jobId}`)

          if (!response.ok) {
            console.warn('Failed to fetch job status:', response.status, response.statusText)
          } else {
            const { job } = await response.json()

            const messages = stateRef.current.messages
            const lastMessage = messages[messages.length - 1]

            if (!lastMessage || lastMessage.role !== 'assistant') {
              await delay(2000)
              continue
            }

            if (job.status === 'completed') {
              const result = (job.result ?? {}) as Record<string, unknown>
              const content =
                typeof result.content === 'string'
                  ? result.content
                  : 'Risultato disponibile.'
              const sources = Array.isArray(result.sources) ? (result.sources as Source[]) : []

              const updatedMessage: Message = {
                ...lastMessage,
                content,
                sources,
                metadata: {
                  ...(lastMessage.metadata ?? {}),
                  jobId,
                  jobStatus: 'completed',
                  completedAt: job.completed_at,
                  traceId: job.trace_id ?? null,
                },
              }

              dispatch({ type: 'UPDATE_LAST_MESSAGE', value: updatedMessage })
              dispatch({ type: 'SET_STATUS', value: null })
              dispatch({ type: 'SET_LOADING', value: false })

              if (options.wasNewConversation && options.conversationId) {
                window.history.replaceState(null, '', `/chat/${options.conversationId}`)
              }

              return
            }

            if (job.status === 'failed') {
              const errorMessage =
                (job.error && typeof job.error === 'object' && job.error !== null && 'message' in job.error)
                  ? String(job.error.message)
                  : 'Elaborazione fallita'

              const updatedMessage: Message = {
                ...lastMessage,
                content: `❌ Elaborazione fallita: ${errorMessage}`,
                metadata: {
                  ...(lastMessage.metadata ?? {}),
                  jobId,
                  jobStatus: 'failed',
                },
              }

              dispatch({ type: 'UPDATE_LAST_MESSAGE', value: updatedMessage })
              dispatch({ type: 'SET_STATUS', value: null })
              dispatch({ type: 'SET_LOADING', value: false })
              throw new Error(errorMessage)
            }

            const updatedMessage: Message = {
              ...lastMessage,
              metadata: {
                ...(lastMessage.metadata ?? {}),
                jobId,
                jobStatus: job.status as string,
                progress: job.progress ?? null,
              },
            }
            dispatch({ type: 'UPDATE_LAST_MESSAGE', value: updatedMessage })
          }
        } catch (error) {
          console.warn('Polling error:', error)
        }

        await delay(2000)
      }

      throw new Error('Timeout elaborazione job async')
    },
    [delay]
  )

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

      if (response.status === 202) {
        const jobInfo = await response.json().catch(() => null)
        const jobId = jobInfo?.jobId

        if (!jobId || typeof jobId !== 'string') {
          throw new Error('Risposta asincrona senza jobId')
        }

        const placeholder: Message = {
          role: 'assistant',
          content: '⏳ Sto preparando un confronto approfondito. Riceverai la risposta completa appena pronta.',
          metadata: {
            jobId,
            jobStatus: 'queued',
            queue: jobInfo?.queue ?? null,
            reason: jobInfo?.reason ?? null,
          },
          sources: [],
        }

        dispatch({ type: 'PUSH_MESSAGE', value: placeholder })
        dispatch({ type: 'SET_STATUS', value: 'Analisi in background in corso...' })

        try {
          await pollJobStatus(jobId, { wasNewConversation, conversationId })
        } catch (error) {
          console.error('Async job failed:', error)
          if (wasNewConversation) {
            dispatch({ type: 'SET_CONVERSATION_ID', value: conversationId })
          }
          throw error
        }

        return
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
            const data = JSON.parse(line.slice(6))

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
            console.warn('Failed to parse SSE data:', parseError)
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      dispatch({ type: 'SET_LOADING', value: false })
      dispatch({ type: 'SET_STATUS', value: null })

      const currentMessages = stateRef.current.messages
      const lastMessage = currentMessages[currentMessages.length - 1]
      const isAsyncPlaceholder =
        lastMessage?.metadata && typeof lastMessage.metadata === 'object' && 'jobId' in lastMessage.metadata

      if (!isAsyncPlaceholder) {
        dispatch({ type: 'POP_MESSAGE' })
      }

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

