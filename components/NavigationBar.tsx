'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Navigation bar principale - Stile ChatGPT
 */
export function NavigationBar() {
  const pathname = usePathname()

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-6">
          <Link
            href="/chat"
            className={`text-sm font-medium transition-colors ${
              pathname?.startsWith('/chat')
                ? 'text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Chat
          </Link>
          <Link
            href="/upload"
            className={`text-sm font-medium transition-colors ${
              pathname === '/upload'
                ? 'text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Upload Documenti
          </Link>
        </div>
      </div>
    </nav>
  )
}

