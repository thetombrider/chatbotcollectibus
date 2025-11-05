'use client'

import { useTextareaResize } from '@/hooks/useTextareaResize'

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  loading: boolean
  disabled?: boolean
  onSend: () => void
  statusMessage?: string | null
}

export function ChatInput({
  input,
  setInput,
  loading,
  disabled = false,
  onSend,
  statusMessage,
}: ChatInputProps) {
  const { textareaRef, handleInputChange, resetHeight } = useTextareaResize()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    handleInputChange(e)
  }

  return (
    <div className="relative z-10 backdrop-blur-xl bg-transparent shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi un messaggio..."
              rows={1}
              className="w-full resize-none border border-gray-300 rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent text-gray-900 placeholder-gray-500 bg-white/95 backdrop-blur-sm"
              disabled={loading || disabled}
              style={{ minHeight: '52px', maxHeight: '200px' }}
              aria-label="Input messaggio"
            />
            <button
              onClick={onSend}
              disabled={loading || !input.trim() || disabled}
              className="absolute right-2 bottom-2 p-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Invia messaggio"
              aria-label="Invia messaggio"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-gray-500">
            Il chatbot può commettere errori. Verifica sempre le informazioni importanti.
          </p>
          <p className="text-xs text-gray-400">{input.length} caratteri</p>
        </div>
      </div>
    </div>
  )
}

