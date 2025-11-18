/**
 * Conversation Context Module
 * 
 * Centralizes conversation history management for query enhancement,
 * follow-up question handling, and context-aware processing.
 */

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ConversationContextOptions {
  /** Maximum number of messages to include */
  maxMessages?: number
  
  /** Maximum characters per message */
  maxCharsPerMessage?: number
  
  /** Whether to include assistant responses */
  includeAssistant?: boolean
  
  /** Whether to include user messages */
  includeUser?: boolean
}

/**
 * Default options for conversation context formatting
 */
const DEFAULT_OPTIONS: Required<ConversationContextOptions> = {
  maxMessages: 3,
  maxCharsPerMessage: 200,
  includeAssistant: true,
  includeUser: true,
}

/**
 * Formats conversation history for inclusion in LLM prompts
 * 
 * @param conversationHistory Full conversation history
 * @param options Formatting options
 * @returns Formatted conversation context string, or empty string if no history
 */
export function formatConversationContext(
  conversationHistory: ConversationMessage[] | undefined,
  options: ConversationContextOptions = {}
): string {
  if (!conversationHistory || conversationHistory.length === 0) {
    return ''
  }

  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // Filter by role if specified
  let filtered = conversationHistory
  if (!opts.includeUser || !opts.includeAssistant) {
    filtered = conversationHistory.filter(msg => {
      if (msg.role === 'user') return opts.includeUser
      if (msg.role === 'assistant') return opts.includeAssistant
      return false
    })
  }

  // Take last N messages
  const recent = filtered.slice(-opts.maxMessages)
  
  // Format each message with truncation
  const formatted = recent
    .map(msg => {
      const label = msg.role === 'user' ? 'User' : 'Assistant'
      const truncated = msg.content.substring(0, opts.maxCharsPerMessage)
      const ellipsis = msg.content.length > opts.maxCharsPerMessage ? '...' : ''
      return `${label}: ${truncated}${ellipsis}`
    })
    .join('\n')

  return formatted
}

/**
 * Extracts the last user message from conversation history
 * Useful for determining if current query is a follow-up
 */
export function getLastUserMessage(
  conversationHistory: ConversationMessage[] | undefined
): string | null {
  if (!conversationHistory || conversationHistory.length === 0) {
    return null
  }

  // Find last user message (may not be the very last if assistant responded)
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    if (conversationHistory[i].role === 'user') {
      return conversationHistory[i].content
    }
  }

  return null
}

/**
 * Extracts the last assistant message from conversation history
 * Useful for context-aware follow-ups
 */
export function getLastAssistantMessage(
  conversationHistory: ConversationMessage[] | undefined
): string | null {
  if (!conversationHistory || conversationHistory.length === 0) {
    return null
  }

  // Find last assistant message
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    if (conversationHistory[i].role === 'assistant') {
      return conversationHistory[i].content
    }
  }

  return null
}

/**
 * Detects if current query is likely a follow-up question
 * based on conversation history and query characteristics
 */
export function isFollowUpQuery(
  query: string,
  conversationHistory: ConversationMessage[] | undefined
): boolean {
  if (!conversationHistory || conversationHistory.length === 0) {
    return false
  }

  const queryLower = query.toLowerCase()
  
  // Indicators of follow-up questions
  const followUpIndicators = [
    // Pronouns and references
    /\b(e |ma |però |quindi |allora |inoltre |anche |invece )/i,
    /\b(questo|questa|questi|queste|quello|quella|quelli|quelle)\b/i,
    /\b(lo stesso|la stessa|gli stessi|le stesse)\b/i,
    /\b(sopra|sotto|precedente|seguente)\b/i,
    
    // Comparative and contrastive
    /\b(rispetto a|confronto|differenza|simile|diverso)\b/i,
    /\b(invece|piuttosto|al contrario)\b/i,
    
    // Sequential
    /\b(ancora|poi|dopo|prima|infine|inoltre)\b/i,
    
    // Questions building on previous context
    /\b(e (se|quando|dove|come|perch[eé]|chi|cosa))\b/i,
    /\b(ma (se|quando|dove|come|perch[eé]|chi|cosa))\b/i,
    
    // Short questions (often follow-ups)
    // If query is very short (< 30 chars) and has history, likely a follow-up
  ]

  // Check for follow-up indicators
  const hasIndicator = followUpIndicators.some(pattern => pattern.test(queryLower))
  
  // Short questions with history are often follow-ups
  const isShortWithHistory = query.length < 30 && conversationHistory.length > 0
  
  return hasIndicator || isShortWithHistory
}

/**
 * Summarizes conversation history for logging/debugging
 */
export function summarizeConversationHistory(
  conversationHistory: ConversationMessage[] | undefined
): {
  messageCount: number
  userMessages: number
  assistantMessages: number
  lastUserPreview: string | null
  lastAssistantPreview: string | null
} {
  if (!conversationHistory || conversationHistory.length === 0) {
    return {
      messageCount: 0,
      userMessages: 0,
      assistantMessages: 0,
      lastUserPreview: null,
      lastAssistantPreview: null,
    }
  }

  const userMessages = conversationHistory.filter(m => m.role === 'user').length
  const assistantMessages = conversationHistory.filter(m => m.role === 'assistant').length
  
  const lastUser = getLastUserMessage(conversationHistory)
  const lastAssistant = getLastAssistantMessage(conversationHistory)

  return {
    messageCount: conversationHistory.length,
    userMessages,
    assistantMessages,
    lastUserPreview: lastUser ? lastUser.substring(0, 50) : null,
    lastAssistantPreview: lastAssistant ? lastAssistant.substring(0, 50) : null,
  }
}

/**
 * Builds conversation context section for LLM prompts
 * Returns empty string if no conversation history
 */
export function buildConversationContextSection(
  conversationHistory: ConversationMessage[] | undefined,
  options: ConversationContextOptions = {}
): string {
  const formatted = formatConversationContext(conversationHistory, options)
  
  if (!formatted) {
    return ''
  }

  return `Previous conversation context:\n${formatted}\n\n`
}
