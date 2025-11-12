import type { Metadata } from 'next'
import './globals.css'
import { NavigationBar } from '@/components/NavigationBar'
import { ToastProvider } from '@/components/ui/Toast'
import { createServerSupabaseClient } from '@/lib/supabase/client'

export const metadata: Metadata = {
  title: 'RAG Chatbot - Collectibus',
  description: 'Chatbot RAG per interagire con documenti',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.error('[layout] Failed to load Supabase user session:', error)
  }

  return (
    <html lang="it">
      <body className="bg-white text-gray-900 antialiased">
        <ToastProvider>
          <NavigationBar userEmail={user?.email ?? null} />
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}

