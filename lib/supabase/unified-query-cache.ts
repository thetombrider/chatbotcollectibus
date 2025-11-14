import { supabaseAdmin } from './admin'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import crypto from 'crypto'

/**
 * Unified Query Cache
 * 
 * Combines query analysis and enhancement caching into a single table.
 * Replaces the separate query-analysis-cache and enhancement-cache tables.
 */

/**
 * Enhancement result structure (embedded in unified cache)
 */
export interface EnhancementData {
  enhanced: string
  shouldEnhance: boolean
  articleNumber?: number
  intent?: string
}

/**
 * Unified cache entry
 */
export interface UnifiedQueryCache {
  id: string
  query_hash: string
  query_text: string
  analysis: QueryAnalysisResult
  enhancement: EnhancementData
  created_at: string
  updated_at: string
  hit_count: number
}

/**
 * Generate hash for query (deterministic)
 */
function hashQuery(query: string): string {
  const normalized = query.trim().toLowerCase()
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

/**
 * Find cached query analysis and enhancement
 * 
 * @param query - User query
 * @returns Cached data or null if not found
 */
export async function findUnifiedCache(
  query: string
): Promise<UnifiedQueryCache | null> {
  try {
    const queryHash = hashQuery(query)
    
    const { data, error } = await supabaseAdmin
      .from('unified_query_cache')
      .select('*')
      .eq('query_hash', queryHash)
      .single()
    
    if (error) {
      // Not found is expected, don't log as error
      if (error.code === 'PGRST116') {
        console.log('[unified-cache] Cache miss:', { queryHash: queryHash.substring(0, 12) })
        return null
      }
      console.error('[unified-cache] Lookup failed:', error)
      return null
    }
    
    if (!data) {
      return null
    }
    
    // Update hit count asynchronously (don't await)
    supabaseAdmin
      .from('unified_query_cache')
      .update({ hit_count: data.hit_count + 1 })
      .eq('id', data.id)
      .then((result) => {
        if (result.error) {
          console.warn('[unified-cache] Failed to update hit count:', result.error)
        } else {
          console.log('[unified-cache] Cache hit:', { 
            queryHash: queryHash.substring(0, 12),
            hitCount: data.hit_count + 1 
          })
        }
      })
    
    return data as UnifiedQueryCache
  } catch (error) {
    console.error('[unified-cache] Unexpected error:', error)
    return null
  }
}

/**
 * Save query analysis and enhancement to cache
 * 
 * @param query - User query
 * @param analysis - Query analysis result
 * @param enhancement - Query enhancement data
 */
export async function saveUnifiedCache(
  query: string,
  analysis: QueryAnalysisResult,
  enhancement: EnhancementData
): Promise<void> {
  try {
    const queryHash = hashQuery(query)
    
    const { error } = await supabaseAdmin
      .from('unified_query_cache')
      .upsert({
        query_hash: queryHash,
        query_text: query.trim(),
        analysis,
        enhancement,
        hit_count: 0,
      }, {
        onConflict: 'query_hash',
        ignoreDuplicates: false, // Update if exists
      })
    
    if (error) {
      console.error('[unified-cache] Save failed:', error)
      return
    }
    
    console.log('[unified-cache] Saved:', { 
      queryHash: queryHash.substring(0, 12),
      intent: analysis.intent,
      shouldEnhance: enhancement.shouldEnhance,
    })
  } catch (error) {
    console.error('[unified-cache] Unexpected error during save:', error)
  }
}

/**
 * Clear old cache entries (TTL cleanup)
 * Should be called periodically (e.g., daily cron job)
 * 
 * @param ttlDays - Number of days to keep cache entries
 * @returns Number of deleted entries
 */
export async function cleanupUnifiedCache(ttlDays: number = 7): Promise<number> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - ttlDays)
    
    const { data, error } = await supabaseAdmin
      .from('unified_query_cache')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id')
    
    if (error) {
      console.error('[unified-cache] Cleanup failed:', error)
      return 0
    }
    
    const deletedCount = data?.length || 0
    console.log('[unified-cache] Cleanup completed:', { 
      deletedCount,
      ttlDays,
      cutoffDate: cutoffDate.toISOString(),
    })
    
    return deletedCount
  } catch (error) {
    console.error('[unified-cache] Unexpected error during cleanup:', error)
    return 0
  }
}
