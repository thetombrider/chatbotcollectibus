import type { Metadata } from 'next'
import './globals.css'
import { NavigationBar } from '@/components/NavigationBar'

export const metadata: Metadata = {
  title: 'RAG Chatbot - Collectibus',
  description: 'Chatbot RAG per interagire con documenti',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it">
      <body className="bg-white text-gray-900 antialiased">
        <NavigationBar />
        {children}
      </body>
    </html>
  )
}

