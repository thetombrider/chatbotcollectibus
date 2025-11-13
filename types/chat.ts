/**
 * Shared types for chat functionality
 */

export interface Source {
  index: number
  type?: 'kb' | 'web' // Tipo di source: 'kb' per knowledge base, 'web' per ricerca web
  filename: string
  documentId?: string // Opzionale per sources web
  similarity?: number // Opzionale per sources web
  // Campi per sources web
  title?: string // Titolo della fonte web
  url?: string // URL della fonte web
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
  model?: string // Nome del modello LLM usato per generare la risposta
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

