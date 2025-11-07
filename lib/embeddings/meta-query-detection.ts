import OpenAI from 'openai'

/**
 * Meta Query Detection Module
 * 
 * Uses LLM to detect when queries are asking about the database itself
 * (statistics, lists, structure) rather than the content of documents.
 * 
 * Caches decisions to minimize LLM API costs.
 */

// Initialize OpenAI client for OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

// Check if meta query detection is enabled (default: true)
const ENABLE_META_DETECTION = process.env.ENABLE_META_DETECTION !== 'false'

// Model for detection (cheap and fast) - using the same model as the chat agent
const DETECTION_MODEL = 'google/gemini-2.5-flash'

// In-memory cache for meta query detection (simple cache, can be replaced with DB cache later)
const metaDetectionCache = new Map<string, { isMeta: boolean; metaType?: string; timestamp: number }>()
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Meta query detection result
 */
export interface MetaQueryResult {
  isMeta: boolean
  metaType?: 'stats' | 'list' | 'folders' | 'structure'
  fromCache: boolean
}

/**
 * Normalize query for cache key
 * Lowercase, trim, remove extra spaces
 */
function normalizeCacheKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Check in-memory cache for meta query detection
 */
function getCachedDetection(query: string): MetaQueryResult | null {
  const normalizedQuery = normalizeCacheKey(query)
  const cached = metaDetectionCache.get(normalizedQuery)
  
  if (!cached) {
    return null
  }
  
  // Check if cache is expired
  const now = Date.now()
  if (now - cached.timestamp > CACHE_TTL) {
    metaDetectionCache.delete(normalizedQuery)
    return null
  }
  
  return {
    isMeta: cached.isMeta,
    metaType: cached.metaType as 'stats' | 'list' | 'folders' | 'structure' | undefined,
    fromCache: true,
  }
}

/**
 * Save detection result to in-memory cache
 */
function saveCachedDetection(query: string, result: MetaQueryResult): void {
  const normalizedQuery = normalizeCacheKey(query)
  metaDetectionCache.set(normalizedQuery, {
    isMeta: result.isMeta,
    metaType: result.metaType,
    timestamp: Date.now(),
  })
}

/**
 * Detects if a query is asking about the database itself using LLM
 * 
 * A meta query asks about:
 * - Statistics: "quanti documenti ci sono", "quante norme sono salvate"
 * - Lists: "che norme ci sono", "elenca i documenti", "quali file sono nel database"
 * - Folders: "quali cartelle esistono", "che cartelle ci sono"
 * - Structure: "quali tipi di file ci sono", "come è organizzato il database"
 * 
 * A non-meta query asks about:
 * - Content of documents: "cosa dice il GDPR", "requisiti per la privacy"
 * - Specific information: "articolo 28 GDPR", "normative sulla sostenibilità"
 * 
 * @param query - User query to analyze
 * @returns Detection result with isMeta flag and metaType if meta
 */
export async function detectMetaQuery(query: string): Promise<MetaQueryResult> {
  if (!ENABLE_META_DETECTION) {
    console.log('[meta-query-detection] Feature disabled via env var')
    return {
      isMeta: false,
      fromCache: false,
    }
  }
  
  try {
    // Check cache first
    const cached = getCachedDetection(query)
    if (cached) {
      console.log('[meta-query-detection] Using cached detection:', cached)
      return cached
    }
    
    // Use LLM to detect if query is meta
    const prompt = `You are a query analyzer for a RAG system. Determine if this query is asking about the DATABASE ITSELF (meta query) or about the CONTENT of documents (content query).

Query: "${query}"

A META query asks about:
1. Statistics: "quanti documenti ci sono", "quante norme sono salvate", "quanti file ci sono"
2. Lists: "che norme ci sono", "elenca i documenti", "quali file sono nel database", "che documenti ci sono"
3. Folders/Structure: "quali cartelle esistono", "che cartelle ci sono", "come è organizzato il database"
4. File types: "quali tipi di file ci sono", "che formati sono supportati"
5. Database metadata: "quando sono stati caricati i documenti", "quali sono le dimensioni dei file"

A CONTENT query asks about:
1. Information in documents: "cosa dice il GDPR", "requisiti per la privacy", "normative sulla sostenibilità"
2. Specific content: "articolo 28 GDPR", "cosa prevede la normativa X", "differenze tra Y e Z"
3. Document content: "spiegami il contenuto di...", "cosa significa...", "come funziona..."

Examples:
- "quanti documenti ci sono" → META (stats)
- "che norme ci sono salvate" → META (list)
- "quali cartelle esistono" → META (folders)
- "cosa dice il GDPR" → CONTENT
- "articolo 28 GDPR" → CONTENT
- "requisiti per la privacy" → CONTENT

Respond with ONLY a JSON object in this format:
{
  "isMeta": true/false,
  "metaType": "stats" | "list" | "folders" | "structure" | null
}

If isMeta is false, metaType should be null.`

    const response = await openrouter.chat.completions.create({
      model: DETECTION_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0, // Deterministic for caching
      max_tokens: 50,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content?.trim()
    if (!content) {
      console.error('[meta-query-detection] Empty response from LLM')
      return {
        isMeta: false,
        fromCache: false,
      }
    }

    // Parse JSON response
    let parsed: { isMeta: boolean; metaType?: string | null }
    try {
      parsed = JSON.parse(content)
    } catch (error) {
      console.error('[meta-query-detection] Failed to parse LLM response:', error)
      return {
        isMeta: false,
        fromCache: false,
      }
    }

    const result: MetaQueryResult = {
      isMeta: parsed.isMeta || false,
      metaType: parsed.isMeta && parsed.metaType ? (parsed.metaType as 'stats' | 'list' | 'folders' | 'structure') : undefined,
      fromCache: false,
    }
    
    // Cache the result
    saveCachedDetection(query, result)
    
    console.log('[meta-query-detection] Detection result:', {
      query: query.substring(0, 50),
      isMeta: result.isMeta,
      metaType: result.metaType,
    })
    
    return result
  } catch (error) {
    console.error('[meta-query-detection] Detection failed:', error)
    // On error, assume not meta (conservative approach)
    return {
      isMeta: false,
      fromCache: false,
    }
  }
}

