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
    <div className="w-64 bg-gray-50 border-r border-gray-200 h-screen flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={createNewConversation}
          className="w-full bg-transparent border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
        >
          + Nuova Conversazione
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-center text-gray-500 mt-4 text-sm">Caricamento...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center text-gray-500 mt-4 text-sm">
            Nessuna conversazione
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-100 transition-colors ${
                  pathname === `/chat/${conv.id}` ? 'bg-gray-100' : ''
                }`}
              >
                <Link
                  href={`/chat/${conv.id}`}
                  className="flex-1 min-w-0 truncate"
                >
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {conv.title || 'Senza titolo'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {new Date(conv.updated_at).toLocaleDateString('it-IT')}
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    deleteConversation(conv.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 ml-2 p-1 rounded hover:bg-gray-200 transition-colors"
                  title="Elimina conversazione"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

