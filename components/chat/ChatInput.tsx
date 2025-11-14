'use client'

import { PromptInputBox } from '@/components/chat/PromptInputBox'

interface CreditsData {
  totalCredits: number
  totalUsage: number
  remaining: number
}

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  loading: boolean
  disabled?: boolean
  onSend: () => void
  statusMessage?: string | null
  webSearchEnabled?: boolean
  onWebSearchToggle?: (enabled: boolean) => void
  credits?: CreditsData | null
  creditsLoading?: boolean
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
  credits,
  creditsLoading = false,
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
      credits={credits}
      creditsLoading={creditsLoading}
    />
  )
}

