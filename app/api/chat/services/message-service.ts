/**
 * Message Service
 * 
 * Gestisce il salvataggio e recupero di messaggi e conversazioni
 */

import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Salva il messaggio dell'utente
 */
export async function saveUserMessage(
  conversationId: string,
  message: string
): Promise<void> {
  try {
    console.log('[message-service] Saving user message:', {
      conversationId,
      messagePreview: message.substring(0, 50),
    })
    
    // Conta i messaggi esistenti per verificare se è il primo messaggio
    const { count: messageCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
    
    const isFirstMessage = (messageCount || 0) === 0
    
    console.log('[message-service] Message count check:', {
      messageCount: messageCount || 0,
      isFirstMessage,
    })
    
    const { error } = await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: message,
    })
    
    if (error) {
      console.error('[message-service] Failed to insert user message:', error)
    } else {
      console.log('[message-service] User message saved successfully')
    }
    
    // Aggiorna il titolo della conversazione se è il primo messaggio
    if (isFirstMessage) {
      const title = message.substring(0, 50).trim() || 'Nuova conversazione'
      await supabaseAdmin
        .from('conversations')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
    }
  } catch (err) {
    console.error('[message-service] Failed to save user message:', err)
    // Continue anyway, don't fail the request
  }
}

/**
 * Recupera la cronologia della conversazione
 */
export async function getConversationHistory(
  conversationId: string,
  limit: number = 10
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  try {
    console.log('[message-service] Fetching conversation history:', { conversationId, limit })
    
    const { data: historyMessages, error } = await supabaseAdmin
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)
    
    if (error) {
      console.error('[message-service] Database error fetching history:', error)
      return []
    }
    
    console.log('[message-service] Retrieved messages:', {
      count: historyMessages?.length || 0,
      messageRoles: historyMessages?.map(m => m.role) || [],
    })
    
    return historyMessages || []
  } catch (err) {
    console.error('[message-service] Failed to retrieve conversation history:', err)
    return []
  }
}

/**
 * Salva il messaggio dell'assistant
 */
export async function saveAssistantMessage(
  conversationId: string,
  content: string,
  metadata: {
    chunks_used?: Array<{ id: string; similarity: number }>
    sources?: unknown[]
    query_enhanced?: boolean
    original_query?: string
    enhanced_query?: string
    model?: string // Nome del modello LLM usato
  }
): Promise<void> {
  try {
    console.log('[message-service] Saving assistant message:', {
      conversationId,
      contentLength: content.length,
      contentPreview: content.substring(0, 50),
    })
    
    const insertData = {
      conversation_id: conversationId,
      role: 'assistant' as const,
      content: content.trim(),
      metadata,
    }
    
    const { error } = await supabaseAdmin.from('messages').insert(insertData)
    
    if (error) {
      console.error('[message-service] Failed to save assistant message:', error)
    } else {
      console.log('[message-service] Assistant message saved successfully')
    }
  } catch (err) {
    console.error('[message-service] Failed to save assistant message:', err)
  }
}

/**
 * Elimina gli ultimi N messaggi di una conversazione
 * Utilizzato per il retry quando si vuole rimuovere il messaggio fallito e la sua risposta
 */
export async function deleteLastMessages(
  conversationId: string,
  count: number = 2
): Promise<void> {
  try {
    console.log('[message-service] Deleting last messages:', {
      conversationId,
      count,
    })
    
    // Recupera gli ultimi N messaggi
    const { data: messagesToDelete, error: fetchError } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(count)
    
    if (fetchError) {
      console.error('[message-service] Failed to fetch messages to delete:', fetchError)
      return
    }
    
    if (!messagesToDelete || messagesToDelete.length === 0) {
      console.log('[message-service] No messages to delete')
      return
    }
    
    // Elimina i messaggi
    const messageIds = messagesToDelete.map(m => m.id)
    const { error: deleteError } = await supabaseAdmin
      .from('messages')
      .delete()
      .in('id', messageIds)
    
    if (deleteError) {
      console.error('[message-service] Failed to delete messages:', deleteError)
    } else {
      console.log('[message-service] Messages deleted successfully:', {
        deletedCount: messagesToDelete.length,
      })
    }
  } catch (err) {
    console.error('[message-service] Failed to delete last messages:', err)
  }
}

