/**
 * Shared types for chat functionality
 */

export interface Source {
  index: number
  filename: string
  documentId: string
  similarity: number
}

export interface SourceDetail extends Source {
  content?: string
  chunkIndex?: number
  originalIndex?: number
}

export interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
  sources?: Source[]
}

export interface Conversation {
  id: string
  title: string | null
  messages: Message[]
}

export interface ConversationListItem {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

export interface MessageWithCitationsProps {
  content: string
  sources?: SourceDetail[]
  onOpenSources?: () => void
}

export interface SourceDetailPanelProps {
  isOpen: boolean
  sources: SourceDetail[]
  onClose: () => void
}

