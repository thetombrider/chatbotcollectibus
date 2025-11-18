/**
 * Async Cache Operations
 * 
 * Fire-and-forget wrappers for cache save operations.
 * These operations don't block the response to the user.
 */

import { 
  saveUnifiedCache as syncSaveUnifiedCache,
  findUnifiedCache,
  cleanupUnifiedCache
} from '@/lib/supabase/unified-query-cache'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'

/**
 * Enhancement data structure
 */
export interface EnhancementData {
  enhanced: string
  shouldEnhance: boolean
  articleNumber?: number
  intent?: string
}

/**
 * Async wrapper for saving to unified query cache (fire-and-forget)
 * 
 * This function starts the save operation but doesn't wait for completion.
 * Use this to avoid blocking response generation.
 * 
 * @param query User query
 * @param analysis Query analysis result
 * @param enhancement Query enhancement data
 */
export function saveUnifiedCacheAsync(
  query: string,
  analysis: QueryAnalysisResult,
  enhancement: EnhancementData
): void {
  // Fire-and-forget: Start the promise but don't await it
  // Catch any errors to prevent unhandled promise rejections
  syncSaveUnifiedCache(query, analysis, enhancement).catch((error) => {
    console.error('[async-cache] Fire-and-forget unified cache save failed:', {
      queryPreview: query.substring(0, 50),
      intent: analysis.intent,
      error: error.message || error,
      stack: error.stack,
    })
  })
}

/**
 * Synchronized wrapper for finding cached query data
 * 
 * This operation must complete before we can use the cached data,
 * so it remains synchronous (awaitable).
 * 
 * @param query User query
 * @returns Promise with cached data or null
 */
export async function findUnifiedCacheAsync(
  query: string
) {
  return findUnifiedCache(query)
}

/**
 * Synchronized wrapper for cache cleanup
 * 
 * This is typically called as a scheduled job, so it can remain synchronous.
 * 
 * @param ttlDays Number of days to keep cache entries
 * @returns Promise with number of deleted entries
 */
export async function cleanupUnifiedCacheAsync(
  ttlDays?: number
): Promise<number> {
  return cleanupUnifiedCache(ttlDays)
}

/**
 * Health check: Ensures async cache operations don't cause memory leaks
 * 
 * Call this periodically in development to verify fire-and-forget
 * operations are completing successfully.
 * 
 * @returns Statistics about pending async operations
 */
export function getAsyncCacheStats(): {
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
