import { supabaseAdmin } from './client'
import type { QueryCache } from './database.types'

/**
 * Semantic cache operations
 */

/**
 * Cerca risposta cached simile alla query
 */
export async function findCachedResponse(
  queryEmbedding: number[],
  threshold: number = 0.95
): Promise<QueryCache | null> {
  const { data, error } = await supabaseAdmin.rpc('match_cached_query', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
  })

  if (error) {
    console.error('[semantic-cache] Cache lookup failed:', error)
    return null
  }

  if (!data || data.length === 0) {
    return null
  }

  const cached = data[0] as QueryCache

  // Aggiorna hit_count e last_accessed
  await supabaseAdmin
    .from('query_cache')
    .update({
      hit_count: cached.hit_count + 1,
    })
    .eq('id', cached.id)

  return cached
}

/**
 * Salva risposta nel cache
 */
export async function saveCachedResponse(
  queryText: string,
  queryEmbedding: number[],
  responseText: string,
  ttlDays: number = 7
): Promise<void> {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + ttlDays)

  const { error } = await supabaseAdmin
    .from('query_cache')
    .insert({
      query_text: queryText,
      query_embedding: queryEmbedding,
      response_text: responseText,
      expires_at: expiresAt.toISOString(),
    })

  if (error) {
    console.error('[semantic-cache] Save failed:', error)
    throw new Error(`Failed to cache response: ${error.message}`)
  }
}

/**
 * Pulisce cache scaduti
 */
export async function cleanExpiredCache(): Promise<void> {
  const { error } = await supabaseAdmin
    .from('query_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())

  if (error) {
    console.error('[semantic-cache] Cleanup failed:', error)
  }
}

