import { supabaseAdmin } from './admin'

/**
 * Cached comparative detection result
 */
export interface CachedComparativeDetection {
  query_text: string
  query_embedding: number[]
  is_comparative: boolean
  comparison_terms: string[] | null
  comparison_type: 'differences' | 'similarities' | 'general_comparison' | null
  created_at: string
  expires_at: string
  hit_count: number
  last_accessed_at: string
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
 * Finds a cached comparative detection for the given query
 * 
 * Uses normalized query text as cache key. Updates hit_count and last_accessed_at
 * on cache hit for analytics.
 * 
 * @param query - User query to look up
 * @returns Cached detection if found and not expired, null otherwise
 * 
 * @example
 * const cached = await findCachedComparativeDetection("confronta GDPR e ESPR")
 * if (cached?.is_comparative) {
 *   return cached.comparison_terms
 * }
 */
export async function findCachedComparativeDetection(
  query: string
): Promise<CachedComparativeDetection | null> {
  try {
    const normalizedQuery = normalizeCacheKey(query)
    
    // Find non-expired cache entry
    const { data, error } = await supabaseAdmin
      .from('comparative_query_cache')
      .select('*')
      .eq('query_text', normalizedQuery)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      // Not found is expected, other errors should be logged
      if (error.code !== 'PGRST116') {
        console.error('[comparative-cache] Find error:', error)
      }
      return null
    }
    
    if (!data) {
      return null
    }
    
    // Update hit_count and last_accessed_at
    await supabaseAdmin
      .from('comparative_query_cache')
      .update({
        hit_count: data.hit_count + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', data.id)
    
    console.log('[comparative-cache] Cache HIT for query:', normalizedQuery.substring(0, 50))
    console.log('[comparative-cache] Is comparative:', data.is_comparative)
    console.log('[comparative-cache] Terms:', data.comparison_terms)
    console.log('[comparative-cache] Hit count:', data.hit_count + 1)
    
    // Parse comparison_terms if it's a string (JSONB might return as string)
    let parsedTerms: string[] | null = null
    if (data.comparison_terms) {
      if (typeof data.comparison_terms === 'string') {
        try {
          parsedTerms = JSON.parse(data.comparison_terms)
        } catch (err) {
          console.warn('[comparative-cache] Failed to parse comparison_terms JSON:', err)
          parsedTerms = null
        }
      } else if (Array.isArray(data.comparison_terms)) {
        parsedTerms = data.comparison_terms
      }
    }
    
    return {
      ...data,
      comparison_terms: parsedTerms,
    } as CachedComparativeDetection
  } catch (err) {
    console.error('[comparative-cache] Find failed:', err)
    return null
  }
}

/**
 * Saves a comparative detection decision and result to cache
 * 
 * @param query - Original user query
 * @param isComparative - Whether the LLM detected this as a comparative query
 * @param terms - Extracted terms to compare (null if not comparative)
 * @param comparisonType - Type of comparison: "differences", "similarities", or "general_comparison"
 * 
 * @example
 * await saveCachedComparativeDetection(
 *   "confronta GDPR e ESPR",
 *   true,
 *   ["GDPR", "ESPR"],
 *   "general_comparison"
 * )
 */
export async function saveCachedComparativeDetection(
  query: string,
  isComparative: boolean,
  terms: string[] | null,
  comparisonType: 'differences' | 'similarities' | 'general_comparison' | null
): Promise<void> {
  try {
    const normalizedQuery = normalizeCacheKey(query)
    
    // Generate embedding for semantic similarity (optional, for future semantic cache)
    // For now, we use exact text match, but embedding is stored for potential future use
    const { generateEmbedding } = await import('@/lib/embeddings/openai')
    let queryEmbedding: number[] | null = null
    
    try {
      queryEmbedding = await generateEmbedding(normalizedQuery)
    } catch (embeddingError) {
      console.warn('[comparative-cache] Failed to generate embedding, continuing without it:', embeddingError)
      // Continue without embedding - exact text match will still work
    }
    
    const { error } = await supabaseAdmin
      .from('comparative_query_cache')
      .insert({
        query_text: normalizedQuery,
        query_embedding: queryEmbedding,
        is_comparative: isComparative,
        comparison_terms: terms ? JSON.stringify(terms) : null,
        comparison_type: comparisonType,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        hit_count: 0,
        last_accessed_at: new Date().toISOString(),
      })
    
    if (error) {
      console.error('[comparative-cache] Save error:', error)
      // Don't throw - cache failure shouldn't break the query flow
      return
    }
    
    console.log('[comparative-cache] Cached detection for query:', normalizedQuery.substring(0, 50))
    console.log('[comparative-cache] Is comparative:', isComparative)
    console.log('[comparative-cache] Terms:', terms)
    console.log('[comparative-cache] Type:', comparisonType)
  } catch (err) {
    console.error('[comparative-cache] Save failed:', err)
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
export async function cleanExpiredComparativeDetections(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin.rpc('clean_expired_comparative_cache')
    
    if (error) {
      console.error('[comparative-cache] Cleanup error:', error)
      return 0
    }
    
    console.log('[comparative-cache] Cleaned up', data, 'expired entries')
    return data as number
  } catch (err) {
    console.error('[comparative-cache] Cleanup failed:', err)
    return 0
  }
}






