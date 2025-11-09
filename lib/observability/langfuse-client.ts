/**
 * Langfuse Client Configuration
 * 
 * Centralizes Langfuse client initialization for prompt management and observability.
 */

import { LangfuseClient } from '@langfuse/client'

// Singleton instance
let langfuseClient: LangfuseClient | null = null

/**
 * Gets or creates a Langfuse client instance
 * 
 * @returns Langfuse client instance
 */
export function getLangfuseClient(): LangfuseClient {
  if (!langfuseClient) {
    langfuseClient = new LangfuseClient({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    })

    console.log('[langfuse-client] Client initialized')
  }

  return langfuseClient
}

/**
 * Flushes pending events to Langfuse
 * 
 * Call this before process exit to ensure all events are sent
 */
export async function flushLangfuse(): Promise<void> {
  if (langfuseClient) {
    await langfuseClient.shutdown()
    console.log('[langfuse-client] Client flushed and shutdown')
  }
}

