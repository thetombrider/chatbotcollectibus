import { createServerSupabaseClient } from '@/lib/supabase/client'
import type { Message, Source } from '@/types/chat'

interface ConversationRow {
  id: string
  title: string | null
  created_at?: string
  updated_at?: string
}

interface MessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata: Record<string, unknown> | null
}

export interface ConversationDetail {
  readonly conversation: ConversationRow | null
  readonly messages: Message[]
  readonly notFound: boolean
}

/**
 * Recupera conversazione e messaggi dalla vista server-side rispettando le policy RLS.
 */
export async function getConversationDetail(
  conversationId: string
): Promise<ConversationDetail> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    console.warn('[conversation-service] Missing auth session for conversation fetch')
    return { conversation: null, messages: [], notFound: true }
  }

  const {
    data: conversation,
    error: convError,
  } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('id', conversationId)
    .single<ConversationRow>()

  if (convError) {
    if (convError.code === 'PGRST116') {
      return { conversation: null, messages: [], notFound: true }
    }
    console.error('[conversation-service] Conversation lookup failed:', convError)
    throw convError
  }

  const {
    data: messageRows,
    error: msgError,
  } = await supabase
    .from('messages')
    .select('id, role, content, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (msgError) {
    console.error('[conversation-service] Messages fetch failed:', msgError)
    throw msgError
  }

  const messages = (messageRows ?? []).map<Message>((row: MessageRow) => {
    const metadata = row.metadata ?? undefined
    let sources: Source[] | undefined
    let model: string | undefined

    if (metadata && typeof metadata === 'object') {
      // Estrai sources
      if ('sources' in metadata) {
        const extracted = (metadata as Record<string, unknown>).sources
        if (Array.isArray(extracted)) {
          sources = extracted as Source[]
        }
      }
      
      // Estrai model
      if ('model' in metadata) {
        const extractedModel = (metadata as Record<string, unknown>).model
        if (typeof extractedModel === 'string') {
          model = extractedModel
        }
      }
    }

    return {
      id: row.id,
      role: row.role,
      content: row.content,
      metadata,
      sources: sources && sources.length > 0 ? sources : undefined,
      model, // Includi il modello se presente
    }
  })

  return {
    conversation,
    messages,
    notFound: false,
  }
}


