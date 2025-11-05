import { useState, useEffect, useCallback } from 'react'
import type { ConversationListItem } from '@/types/chat'

/**
 * Custom hook for managing conversation list
 */
export function useConversation() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/conversations')
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const deleteConversation = useCallback(async (id: string): Promise<boolean> => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      })
      setConversations((prev) => prev.filter((c) => c.id !== id))
      return true
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      return false
    }
  }, [])

  const createNewConversation = useCallback(async (): Promise<ConversationListItem | null> => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nuova conversazione' }),
      })
      const { conversation } = await res.json()
      setConversations((prev) => [conversation, ...prev])
      return conversation
    } catch (error) {
      console.error('Failed to create conversation:', error)
      return null
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  return {
    conversations,
    loading,
    loadConversations,
    deleteConversation,
    createNewConversation,
  }
}

