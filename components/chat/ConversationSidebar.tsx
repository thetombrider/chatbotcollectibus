'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useConversation } from '@/hooks/useConversation'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { ConversationSkeleton } from '@/components/ui/Skeleton'
import type { ConversationListItem } from '@/types/chat'

interface ConversationSidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

interface GroupedConversations {
  today: ConversationListItem[]
  thisWeek: ConversationListItem[]
  older: ConversationListItem[]
}

export function ConversationSidebar({ isOpen = true, onClose }: ConversationSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { showToast } = useToast()
  const { conversations, loading, deleteConversation, createNewConversation } = useConversation()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  
  // Stato per i gruppi collassabili (default: tutti aperti)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    today: false,
    thisWeek: false,
    older: false,
  })

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }))
  }

  // Raggruppa le conversazioni per data
  const groupedConversations = useMemo<GroupedConversations>(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgoStart = new Date(todayStart)
    weekAgoStart.setDate(weekAgoStart.getDate() - 7)

    const groups: GroupedConversations = {
      today: [],
      thisWeek: [],
      older: [],
    }

    conversations.forEach((conv) => {
      const updatedAt = new Date(conv.updated_at)
      const updatedAtDate = new Date(updatedAt.getFullYear(), updatedAt.getMonth(), updatedAt.getDate())
      
      if (updatedAtDate.getTime() === todayStart.getTime()) {
        groups.today.push(conv)
      } else if (updatedAtDate >= weekAgoStart) {
        groups.thisWeek.push(conv)
      } else {
        groups.older.push(conv)
      }
    })

    return groups
  }, [conversations])

  const handleDeleteClick = (id: string) => {
    setDeleteTargetId(id)
    setIsConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return

    const success = await deleteConversation(deleteTargetId)
    if (success) {
      showToast('Conversazione eliminata con successo', 'success')
      // Se stiamo visualizzando la conversazione eliminata, torna alla chat principale
      if (pathname === `/chat/${deleteTargetId}`) {
        router.push('/chat')
      }
    } else {
      showToast('Errore durante l\'eliminazione della conversazione', 'error')
    }
    setIsConfirmOpen(false)
    setDeleteTargetId(null)
  }

  const handleCreateNew = async () => {
    const conversation = await createNewConversation()
    if (conversation) {
      router.push(`/chat/${conversation.id}`)
      onClose?.() // Close sidebar on mobile after creating conversation
    } else {
      showToast('Errore durante la creazione della conversazione', 'error')
    }
  }

  const handleLinkClick = () => {
    onClose?.() // Close sidebar on mobile when clicking a conversation
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 lg:z-auto w-64 bg-white border-r border-gray-100 h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] flex flex-col transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        role="complementary"
        aria-label="Lista conversazioni"
      >
        <div className="p-2.5 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleCreateNew}
              className="flex-1 bg-transparent border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors text-sm font-medium"
              aria-label="Crea nuova conversazione"
            >
              + Nuova Conversazione
            </button>
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition-colors"
              aria-label="Chiudi sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <ConversationSkeleton />
          ) : conversations.length === 0 ? (
            <div className="text-center text-gray-400 mt-4 text-sm">
              Nessuna conversazione
            </div>
          ) : (
            <nav className="space-y-4" role="list" aria-label="Conversazioni">
              {/* Gruppo: Oggi */}
              {groupedConversations.today.length > 0 && (
                <CollapsibleGroup
                  title="Oggi"
                  groupKey="today"
                  isCollapsed={collapsedGroups.today}
                  onToggle={toggleGroup}
                  conversations={groupedConversations.today}
                  pathname={pathname}
                  onLinkClick={handleLinkClick}
                  onDeleteClick={handleDeleteClick}
                />
              )}

              {/* Gruppo: Questa settimana */}
              {groupedConversations.thisWeek.length > 0 && (
                <CollapsibleGroup
                  title="Questa settimana"
                  groupKey="thisWeek"
                  isCollapsed={collapsedGroups.thisWeek}
                  onToggle={toggleGroup}
                  conversations={groupedConversations.thisWeek}
                  pathname={pathname}
                  onLinkClick={handleLinkClick}
                  onDeleteClick={handleDeleteClick}
                />
              )}

              {/* Gruppo: Altre */}
              {groupedConversations.older.length > 0 && (
                <CollapsibleGroup
                  title="Altre"
                  groupKey="older"
                  isCollapsed={collapsedGroups.older}
                  onToggle={toggleGroup}
                  conversations={groupedConversations.older}
                  pathname={pathname}
                  onLinkClick={handleLinkClick}
                  onDeleteClick={handleDeleteClick}
                />
              )}
            </nav>
          )}
        </div>
      </aside>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Elimina conversazione"
        message="Sei sicuro di voler eliminare questa conversazione? Questa azione non può essere annullata."
        confirmText="Elimina"
        cancelText="Annulla"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setIsConfirmOpen(false)
          setDeleteTargetId(null)
        }}
      />
    </>
  )
}

// Componente per il gruppo collassabile
function CollapsibleGroup({
  title,
  groupKey,
  isCollapsed,
  onToggle,
  conversations,
  pathname,
  onLinkClick,
  onDeleteClick,
}: {
  title: string
  groupKey: string
  isCollapsed: boolean
  onToggle: (key: string) => void
  conversations: ConversationListItem[]
  pathname: string
  onLinkClick: () => void
  onDeleteClick: (id: string) => void
}) {
  return (
    <div className="space-y-1">
      <button
        onClick={() => onToggle(groupKey)}
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors group"
        aria-label={`${isCollapsed ? 'Espandi' : 'Collassa'} gruppo ${title}`}
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {title}
          </h3>
          <span className="text-xs text-gray-400 font-medium">
            ({conversations.length})
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
            isCollapsed ? '' : 'rotate-180'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {!isCollapsed && (
        <div className="space-y-1 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              pathname={pathname}
              onLinkClick={onLinkClick}
              onDeleteClick={onDeleteClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Componente per il singolo item della conversazione
function ConversationItem({
  conv,
  pathname,
  onLinkClick,
  onDeleteClick,
}: {
  conv: ConversationListItem
  pathname: string
  onLinkClick: () => void
  onDeleteClick: (id: string) => void
}) {
  return (
    <div
      className={`group flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors ${
        pathname === `/chat/${conv.id}` ? 'bg-gray-50' : ''
      }`}
      role="listitem"
    >
      <Link
        href={`/chat/${conv.id}`}
        className="flex-1 min-w-0 truncate"
        onClick={onLinkClick}
        aria-label={`Apri conversazione: ${conv.title || 'Senza titolo'}`}
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
          onDeleteClick(conv.id)
        }}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-500 ml-2 p-1 rounded hover:bg-gray-100 transition-colors"
        title="Elimina conversazione"
        aria-label={`Elimina conversazione: ${conv.title || 'Senza titolo'}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  )
}
