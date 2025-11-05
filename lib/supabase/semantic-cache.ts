import { supabaseAdmin } from './admin'
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
    p_query_embedding: queryEmbedding,
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

  // Parse sources se necessario (potrebbero arrivare come stringa JSON da JSONB)
  let parsedSources: QueryCache['sources'] = []
  if (cached.sources) {
    if (typeof cached.sources === 'string') {
      try {
        parsedSources = JSON.parse(cached.sources)
      } catch (err) {
        console.warn('[semantic-cache] Failed to parse sources JSON:', err)
        parsedSources = []
      }
    } else if (Array.isArray(cached.sources)) {
      parsedSources = cached.sources
    }
  }

  // Log per debug: verifica che le sources siano presenti
  console.log('[semantic-cache] Retrieved cached response:', {
    id: cached.id,
    response_text_length: cached.response_text?.length || 0,
    sources_count: parsedSources?.length || 0,
    sources_type: typeof cached.sources,
    sources_is_array: Array.isArray(parsedSources)
  })

  // Verifica che la risposta cached non sia vuota
  if (!cached.response_text || cached.response_text.trim().length === 0) {
    console.warn('[semantic-cache] Found cached response but it is empty, ignoring')
    return null
  }

  // Sostituisci le sources parse con quelle nel cached object
  const cachedWithSources = {
    ...cached,
    sources: parsedSources
  }

  // Aggiorna hit_count
  await supabaseAdmin
    .from('query_cache')
    .update({
      hit_count: cached.hit_count + 1,
    })
    .eq('id', cached.id)

  return cachedWithSources
}

/**
 * Salva risposta nel cache con sources
 */
export async function saveCachedResponse(
  queryText: string,
  queryEmbedding: number[],
  responseText: string,
  sources?: Array<{
    index: number
    documentId: string
    filename: string
    similarity: number
    content: string
    chunkIndex: number | null
  }>,
  ttlDays: number = 7
): Promise<void> {
  // Non salvare cache vuote
  if (!responseText || responseText.trim().length === 0) {
    console.warn('[semantic-cache] Skipping cache save: response text is empty')
    return
  }

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + ttlDays)

  const { error } = await supabaseAdmin
    .from('query_cache')
    .insert({
      query_text: queryText,
      query_embedding: queryEmbedding,
      response_text: responseText.trim(),
      sources: sources || [],
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

