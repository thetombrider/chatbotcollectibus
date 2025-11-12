'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'

interface NavigationBarClientProps {
  readonly userEmail: string | null
}

export function NavigationBarClient({ userEmail }: NavigationBarClientProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { showToast } = useToast()

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
      showToast('Errore durante il logout. Riprova.', 'error')
    }
  }, [router, showToast])

  if (pathname === '/login') {
    return null
  }

  return (
    <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50">
      <div className="flex">
        <div className="w-64 flex items-center gap-5 px-4 py-2.5 border-r border-gray-100">
          <Link
            href="/chat"
            className={`text-sm font-medium transition-colors ${
              pathname?.startsWith('/chat')
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Chat
          </Link>
          <Link
            href="/documents"
            className={`text-sm font-medium transition-colors ${
              pathname === '/documents'
                ? 'text-gray-900'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Documenti
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-end px-4 py-2.5">
          {userEmail && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{userEmail}</span>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

