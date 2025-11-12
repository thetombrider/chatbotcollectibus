import { useState, useEffect, useCallback } from 'react'
import { fetchWithCache, invalidateCache } from '@/lib/client-cache'
import type { ConversationListItem } from '@/types/chat'

/**
 * Custom hook for managing conversation list
 */
export function useConversation() {
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadConversations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchWithCache<ConversationListItem[]>(
        'conversations:list',
        async () => {
          const res = await fetch('/api/conversations')
          if (!res.ok) {
            throw new Error(`Failed to fetch conversations: ${res.status}`)
          }
          const payload = await res.json()
          return (payload.conversations as ConversationListItem[]) || []
        },
        60_000
      )
      setConversations(data)
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const deleteConversation = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(`Failed to delete conversation: ${res.status}`)
      }
      setConversations((prev) => prev.filter((c) => c.id !== id))
      invalidateCache('conversations:list')
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
      if (!res.ok) {
        throw new Error(`Failed to create conversation: ${res.status}`)
      }
      const { conversation } = await res.json()
      setConversations((prev) => [conversation, ...prev])
      invalidateCache('conversations:list')
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

