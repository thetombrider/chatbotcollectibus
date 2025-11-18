/**
 * Database types per Supabase
 * Questi tipi verranno generati automaticamente da Supabase CLI
 * Per ora definiamo i tipi base manualmente
 */

export interface Document {
  id: string
  filename: string
  file_type: string
  file_size: number
  storage_path: string
  metadata?: Record<string, unknown>
  processing_status?: 'pending' | 'processing' | 'completed' | 'error'
  error_message?: string
  chunks_count?: number
  folder?: string
  version?: number
  parent_version_id?: string
  summary?: string | null
  summary_embedding?: number[] | null
  summary_generated_at?: string | null
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  content: string
  embedding?: number[]
  chunk_index: number
  metadata?: Record<string, unknown>
  created_at: string
}

export interface SearchResult extends DocumentChunk {
  similarity: number
  document_filename?: string
  document_metadata?: Record<string, unknown>
  vector_score?: number
  text_score?: number
}

export interface Conversation {
  id: string
  user_id?: string
  title?: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface QueryCache {
  id: string
  query_text: string
  query_embedding?: number[]
  response_text: string
  similarity_threshold: number
  hit_count: number
  created_at: string
  expires_at: string
  sources?: Array<{
    index: number
    documentId: string
    filename: string
    similarity: number
    content: string
    chunkIndex: number | null
  }>
}

