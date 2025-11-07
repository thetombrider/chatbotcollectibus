'use client'

import { PromptInputBox } from '@/components/chat/PromptInputBox'

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  loading: boolean
  disabled?: boolean
  onSend: () => void
  statusMessage?: string | null
  webSearchEnabled?: boolean
  onWebSearchToggle?: (enabled: boolean) => void
}

export function ChatInput({
  input,
  setInput,
  loading,
  disabled = false,
  onSend,
  statusMessage: _statusMessage,
  webSearchEnabled = false,
  onWebSearchToggle,
}: ChatInputProps) {
  return (
    <PromptInputBox
      input={input}
      setInput={setInput}
      onSend={onSend}
      isLoading={loading}
      disabled={disabled}
      placeholder="Scrivi un messaggio..."
      webSearchEnabled={webSearchEnabled}
      onWebSearchToggle={onWebSearchToggle}
    />
  )
}

