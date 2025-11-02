'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Navigation bar principale
 */
export function NavigationBar() {
  const pathname = usePathname()

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <Link
          href="/chat"
          className={`px-4 py-2 rounded-lg transition-colors ${
            pathname?.startsWith('/chat')
              ? 'bg-blue-500 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Chat
        </Link>
        <Link
          href="/upload"
          className={`px-4 py-2 rounded-lg transition-colors ${
            pathname === '/upload'
              ? 'bg-blue-500 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Upload Documenti
        </Link>
      </div>
    </nav>
  )
}

