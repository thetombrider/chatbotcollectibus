import { supabaseAdmin } from './admin'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import { isCacheEnabled } from '@/lib/config/env'

/**
 * Cached query analysis result
 */
export interface CachedQueryAnalysis {
  query_text: string
  query_hash: string
  analysis_result: QueryAnalysisResult
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
 * Generates a hash for the query (simple hash for fast lookup)
 * 
 * @param query - Query text
 * @returns Hash string
 */
function generateQueryHash(query: string): string {
  // Simple hash function (for exact match lookup)
  // In the future, we could use semantic similarity with embeddings
  let hash = 0
  const normalized = normalizeCacheKey(query)
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Finds a cached query analysis for the given query
 * 
 * Uses normalized query text and hash as cache keys. Updates hit_count and last_accessed_at
 * on cache hit for analytics.
 * 
 * @param query - User query to look up
 * @returns Cached analysis if found and not expired, null otherwise
 * 
 * @example
 * const cached = await findCachedQueryAnalysis("confronta GDPR e ESPR")
 * if (cached) {
 *   return cached.analysis_result
 * }
 */
export async function findCachedQueryAnalysis(
  query: string
): Promise<QueryAnalysisResult | null> {
  // Check if query analysis cache is disabled
  if (!isCacheEnabled('query-analysis')) {
    console.log('[query-analysis-cache] Cache disabled via DISABLE_QUERY_ANALYSIS_CACHE')
    return null
  }

  try {
    const normalizedQuery = normalizeCacheKey(query)
    const queryHash = generateQueryHash(normalizedQuery)
    
    // Find non-expired cache entry (try hash first for speed, then text match)
    const { data, error } = await supabaseAdmin
      .from('query_analysis_cache')
      .select('*')
      .eq('query_hash', queryHash)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      // If hash lookup fails, try text match
      if (error.code === 'PGRST116') {
        const { data: textData, error: textError } = await supabaseAdmin
          .from('query_analysis_cache')
          .select('*')
          .eq('query_text', normalizedQuery)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        if (textError || !textData) {
          return null
        }
        
        // Update hit_count and last_accessed_at
        await supabaseAdmin
          .from('query_analysis_cache')
          .update({
            hit_count: textData.hit_count + 1,
            last_accessed_at: new Date().toISOString(),
          })
          .eq('id', textData.id)
        
        // Parse analysis_result
        const analysisResult = typeof textData.analysis_result === 'string'
          ? JSON.parse(textData.analysis_result)
          : textData.analysis_result
        
        console.log('[query-analysis-cache] Cache HIT (text match) for query:', normalizedQuery.substring(0, 50))
        return analysisResult as QueryAnalysisResult
      }
      
      console.error('[query-analysis-cache] Find error:', error)
      return null
    }
    
    if (!data) {
      return null
    }
    
    // Update hit_count and last_accessed_at
    await supabaseAdmin
      .from('query_analysis_cache')
      .update({
        hit_count: data.hit_count + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', data.id)
    
    // Parse analysis_result
    const analysisResult = typeof data.analysis_result === 'string'
      ? JSON.parse(data.analysis_result)
      : data.analysis_result
    
    console.log('[query-analysis-cache] Cache HIT (hash match) for query:', normalizedQuery.substring(0, 50))
    console.log('[query-analysis-cache] Intent:', (analysisResult as QueryAnalysisResult).intent)
    console.log('[query-analysis-cache] Hit count:', data.hit_count + 1)
    
    return analysisResult as QueryAnalysisResult
  } catch (err) {
    console.error('[query-analysis-cache] Find failed:', err)
    return null
  }
}

/**
 * Saves a query analysis result to cache
 * 
 * @param query - Original user query
 * @param analysisResult - Complete analysis result to cache
 * 
 * @example
 * await saveCachedQueryAnalysis("confronta GDPR e ESPR", {
 *   intent: "comparison",
 *   isComparative: true,
 *   comparativeTerms: ["GDPR", "ESPR"],
 *   ...
 * })
 */
export async function saveCachedQueryAnalysis(
  query: string,
  analysisResult: QueryAnalysisResult
): Promise<void> {
  // Check if query analysis cache is disabled
  if (!isCacheEnabled('query-analysis')) {
    console.log('[query-analysis-cache] Cache save disabled via DISABLE_QUERY_ANALYSIS_CACHE')
    return
  }

  try {
    const normalizedQuery = normalizeCacheKey(query)
    const queryHash = generateQueryHash(normalizedQuery)
    
    const { error } = await supabaseAdmin
      .from('query_analysis_cache')
      .insert({
        query_text: normalizedQuery,
        query_hash: queryHash,
        analysis_result: analysisResult,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        hit_count: 0,
        last_accessed_at: new Date().toISOString(),
      })
    
    if (error) {
      console.error('[query-analysis-cache] Save error:', error)
      // Don't throw - cache failure shouldn't break the query flow
      return
    }
    
    console.log('[query-analysis-cache] Cached analysis for query:', normalizedQuery.substring(0, 50))
    console.log('[query-analysis-cache] Intent:', analysisResult.intent)
    console.log('[query-analysis-cache] Is comparative:', analysisResult.isComparative)
    console.log('[query-analysis-cache] Is meta:', analysisResult.isMeta)
  } catch (err) {
    console.error('[query-analysis-cache] Save failed:', err)
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
export async function cleanExpiredQueryAnalyses(): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin
      .from('query_analysis_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select()
    
    if (error) {
      console.error('[query-analysis-cache] Cleanup error:', error)
      return 0
    }
    
    const deletedCount = data?.length || 0
    console.log('[query-analysis-cache] Cleaned up', deletedCount, 'expired entries')
    return deletedCount
  } catch (err) {
    console.error('[query-analysis-cache] Cleanup failed:', err)
    return 0
  }
}

