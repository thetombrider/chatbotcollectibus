'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import type { User } from '@supabase/supabase-js'

/**
 * Navigation bar principale - Stile ChatGPT
 */
export function NavigationBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { showToast } = useToast()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Get initial user
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }

    getUser()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      })
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
      showToast('Errore durante il logout. Riprova.', 'error')
    }
  }

  // Don't show navbar on login page
  if (pathname === '/login') {
    return null
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="flex">
        {/* Navigation Links - Left side, aligned with sidebar (w-64 = 256px) */}
        <div className="w-64 flex items-center gap-6 px-4 py-3 border-r border-gray-200">
          <Link
            href="/chat"
            className={`text-sm font-bold transition-colors ${
              pathname?.startsWith('/chat')
                ? 'text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Chat
          </Link>
          <Link
            href="/documents"
            className={`text-sm font-bold transition-colors ${
              pathname === '/documents'
                ? 'text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Documenti
          </Link>
        </div>

        {/* User info and logout - Right side */}
        <div className="flex-1 flex items-center justify-end px-4 py-3">
          {!loading && user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
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

