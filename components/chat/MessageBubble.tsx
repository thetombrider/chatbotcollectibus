'use client'

import React, { useMemo, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MessageWithCitations } from '@/components/chat/Citation'
import { markdownComponents } from '@/components/chat/MarkdownComponents'
import type { Message, SourceDetail } from '@/types/chat'

interface MessageBubbleProps {
  message: Message
  onOpenSources?: (sources: SourceDetail[]) => void
}

export const MessageBubble = React.memo(function MessageBubble({ message, onOpenSources }: MessageBubbleProps) {
  const handleOpenSources = useCallback(() => {
    if (message.sources && onOpenSources) {
      onOpenSources(message.sources as SourceDetail[])
    }
  }, [message.sources, onOpenSources])

  const hasSources = useMemo(() => {
    return message.role === 'assistant' && message.sources && message.sources.length > 0
  }, [message.role, message.sources])
  return (
    <div
      className={`flex gap-4 ${
        message.role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      {message.role === 'assistant' && (
        <div
          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"
          aria-label="Assistente AI"
        >
          <svg
            className="w-5 h-5 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
      )}
      <div
        className={`max-w-[85%] ${
          message.role === 'user'
            ? 'bg-gray-100 text-gray-900 rounded-2xl rounded-tr-sm'
            : 'bg-white text-gray-900 rounded-2xl rounded-tl-sm border border-gray-200'
        } px-4 py-3`}
        style={{ overflow: 'visible' }}
      >
        {hasSources ? (
          <MessageWithCitations
            content={message.content}
            sources={message.sources as SourceDetail[]}
            onOpenSources={handleOpenSources}
          />
        ) : message.role === 'assistant' ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}
      </div>
      {message.role === 'user' && (
        <div
          className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0"
          aria-label="Utente"
        >
          <span className="text-white text-sm font-medium">U</span>
        </div>
      )}
    </div>
  )
})

