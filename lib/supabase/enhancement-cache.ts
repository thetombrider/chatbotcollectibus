import { supabaseAdmin } from './admin'

/**
 * Cached enhancement result
 */
export interface CachedEnhancement {
  query_text: string
  enhanced_query: string
  should_enhance: boolean
  created_at: string
  expires_at: string
  hit_count: number
}

/**
 * Normalizes query text for cache key consistency
 * 
 * @param query - Original query text
 * @returns Normalized query for cache lookup
 */
function normalizeCacheKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Finds a cached enhancement for the given query
 * 
 * Uses normalized query text as cache key. Updates hit_count and last_accessed_at
 * on cache hit for analytics.
 * 
 * @param query - User query to look up
 * @returns Cached enhancement if found and not expired, null otherwise
 * 
 * @example
 * const cached = await findCachedEnhancement("GDPR")
 * if (cached?.should_enhance) {
 *   return cached.enhanced_query
 * }
 */
export async function findCachedEnhancement(
  query: string
): Promise<CachedEnhancement | null> {
  try {
    const normalizedQuery = normalizeCacheKey(query)
    
    // Find non-expired cache entry
    const { data, error } = await supabaseAdmin
      .from('query_enhancement_cache')
      .select('*')
      .eq('query_text', normalizedQuery)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      // Not found is expected, other errors should be logged
      if (error.code !== 'PGRST116') {
        console.error('[enhancement-cache] Find error:', error)
      }
      return null
    }
    
    if (!data) {
      return null
    }
    
    // Update hit_count and last_accessed_at
    await supabaseAdmin
      .from('query_enhancement_cache')
      .update({
        hit_count: data.hit_count + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', data.id)
    
    console.log('[enhancement-cache] Cache HIT for query:', normalizedQuery.substring(0, 50))
    console.log('[enhancement-cache] Should enhance:', data.should_enhance)
    console.log('[enhancement-cache] Hit count:', data.hit_count + 1)
    
    return data as CachedEnhancement
  } catch (err) {
    console.error('[enhancement-cache] Find failed:', err)
    return null
  }
}

/**
 * Saves a query enhancement decision and result to cache
 * 
 * @param query - Original user query
 * @param enhancedQuery - Enhanced query text (or same as original if not enhanced)
 * @param shouldEnhance - Whether the LLM decided this query needs enhancement
 * 
 * @example
 * await saveCachedEnhancement(
 *   "GDPR",
 *   "GDPR General Data Protection Regulation privacy data protection",
 *   true
 * )
 */
export async function saveCachedEnhancement(
  query: string,
  enhancedQuery: string,
  shouldEnhance: boolean
): Promise<void> {
  try {
    const normalizedQuery = normalizeCacheKey(query)
    
    const { error } = await supabaseAdmin
      .from('query_enhancement_cache')
      .insert({
        query_text: normalizedQuery,
        enhanced_query: enhancedQuery,
        should_enhance: shouldEnhance,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        hit_count: 0,
        last_accessed_at: new Date().toISOString(),
      })
    
    if (error) {
      console.error('[enhancement-cache] Save error:', error)
      // Don't throw - cache failure shouldn't break the query flow
      return
    }
    
    console.log('[enhancement-cache] Cached enhancement for query:', normalizedQuery.substring(0, 50))
    console.log('[enhancement-cache] Should enhance:', shouldEnhance)
  } catch (err) {
    console.error('[enhancement-cache] Save failed:', err)
    // Don't throw - cache failure shouldn't break the query flow
  }
}

/**
 * Cleans up expired cache entries
 * 
 * Should be called periodically (e.g., via cron job or on app startup)
 * 
 * @returns Number of deleted entries
 */
export async function cleanExpiredEnhancements(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('clean_expired_enhancement_cache')
    
    if (error) {
      console.error('[enhancement-cache] Cleanup error:', error)
      return 0
    }
    
    console.log('[enhancement-cache] Cleaned up', data, 'expired entries')
    return data as number
  } catch (err) {
    console.error('[enhancement-cache] Cleanup failed:', err)
    return 0
  }
}





