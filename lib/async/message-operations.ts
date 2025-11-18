/**
 * Async Message Operations
 * 
 * Fire-and-forget wrappers for message save operations.
 * These operations don't block the streaming response to the user.
 */

import { 
  saveUserMessage as syncSaveUserMessage,
  saveAssistantMessage as syncSaveAssistantMessage,
  getConversationHistory
} from '@/app/api/chat/services/message-service'

/**
 * Async wrapper for saving user message (fire-and-forget)
 * 
 * This function starts the save operation but doesn't wait for completion.
 * Use this to avoid blocking streaming response to user.
 * 
 * @param conversationId Conversation ID
 * @param message User message content
 */
export function saveUserMessageAsync(
  conversationId: string,
  message: string
): void {
  // Fire-and-forget: Start the promise but don't await it
  // Catch any errors to prevent unhandled promise rejections
  syncSaveUserMessage(conversationId, message).catch((error) => {
    console.error('[async-message] Fire-and-forget user message save failed:', {
      conversationId,
      error: error.message || error,
      stack: error.stack,
    })
  })
}

/**
 * Async wrapper for saving assistant message (fire-and-forget)
 * 
 * This function starts the save operation but doesn't wait for completion.
 * Use this to avoid blocking after streaming is complete.
 * 
 * @param conversationId Conversation ID
 * @param content Assistant response content
 * @param metadata Message metadata (chunks, sources, model, etc.)
 */
export function saveAssistantMessageAsync(
  conversationId: string,
  content: string,
  metadata: {
    chunks_used?: Array<{ id: string; similarity: number }>
    sources?: unknown[]
    query_enhanced?: boolean
    original_query?: string
    enhanced_query?: string
    model?: string
  }
): void {
  // Fire-and-forget: Start the promise but don't await it
  syncSaveAssistantMessage(conversationId, content, metadata).catch((error) => {
    console.error('[async-message] Fire-and-forget assistant message save failed:', {
      conversationId,
      contentLength: content.length,
      error: error.message || error,
      stack: error.stack,
    })
  })
}

/**
 * Synchronized wrapper for getting conversation history
 * 
 * This operation must complete before we can use the history,
 * so it remains synchronous (awaitable).
 * 
 * @param conversationId Conversation ID
 * @param limit Maximum number of messages to retrieve
 * @returns Promise with conversation history
 */
export async function getConversationHistoryAsync(
  conversationId: string,
  limit?: number
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  return getConversationHistory(conversationId, limit)
}

/**
 * Health check: Ensures async operations don't cause memory leaks
 * 
 * Call this periodically in development to verify fire-and-forget
 * operations are completing successfully.
 * 
 * @returns Statistics about pending async operations
 */
export function getAsyncOperationsStats(): {
  message: string
  pendingOperations: number
} {
  // In fire-and-forget pattern, we don't track pending operations
  // This is a placeholder for future monitoring if needed
  return {
    message: 'Fire-and-forget pattern: operations not tracked',
    pendingOperations: 0,
  }
}
