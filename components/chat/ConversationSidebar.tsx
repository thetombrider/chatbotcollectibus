'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

export function ConversationSidebar() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    loadConversations()
  }, [])

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteConversation = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa conversazione?')) {
      return
    }

    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
      })
      setConversations(conversations.filter((c) => c.id !== id))
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      alert('Errore durante l\'eliminazione')
    }
  }

  const createNewConversation = async () => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nuova conversazione' }),
      })
      const { conversation } = await res.json()
      setConversations([conversation, ...conversations])
      window.location.href = `/chat/${conversation.id}`
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }

  return (
    <div className="w-64 bg-gray-100 border-r border-gray-300 h-screen flex flex-col">
      <div className="p-4 border-b border-gray-300">
        <button
          onClick={createNewConversation}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Nuova Conversazione
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-center text-gray-500 mt-4">Caricamento...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-gray-500 mt-4">
            Nessuna conversazione
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between p-2 rounded-lg hover:bg-gray-200 transition-colors ${
                  pathname === `/chat/${conv.id}` ? 'bg-blue-100' : ''
                }`}
              >
                <Link
                  href={`/chat/${conv.id}`}
                  className="flex-1 min-w-0 truncate"
                >
                  <div className="text-sm font-medium truncate">
                    {conv.title || 'Senza titolo'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(conv.updated_at).toLocaleDateString('it-IT')}
                  </div>
                </Link>
                <button
                  onClick={() => deleteConversation(conv.id)}
                  className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 ml-2 p-1"
                  title="Elimina conversazione"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

