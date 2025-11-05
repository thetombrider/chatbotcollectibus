import OpenAI from 'openai'
import { findCachedEnhancement, saveCachedEnhancement } from '@/lib/supabase/enhancement-cache'

/**
 * Query Enhancement Module
 * 
 * Uses LLM to detect when queries are generic, broad, or incomplete,
 * and expands them with related terms and context to improve vector search similarity.
 * 
 * Caches decisions to minimize LLM API costs.
 */

// Initialize OpenAI client for OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

// Check if query enhancement is enabled (default: true)
const ENABLE_QUERY_ENHANCEMENT = process.env.ENABLE_QUERY_ENHANCEMENT !== 'false'

// Model for enhancement (cheap and fast) - using the same model as the chat agent
const ENHANCEMENT_MODEL = 'google/gemini-2.5-flash'

/**
 * Enhancement result
 */
export interface EnhancementResult {
  enhanced: string
  shouldEnhance: boolean
  fromCache: boolean
}

/**
 * Detects if a query needs enhancement using LLM
 * 
 * Checks if query is:
 * - Too generic (e.g., "GDPR", "sustainability")
 * - Too broad (e.g., "tell me about regulations")
 * - Incomplete or vague
 * 
 * @param query - User query to analyze
 * @returns Boolean decision: true if enhancement would help
 */
async function shouldEnhanceQuery(query: string): Promise<boolean> {
  try {
    const prompt = `You are a query analyzer for a RAG system. Analyze if this query needs semantic expansion to improve search results.

Query: "${query}"

A query needs enhancement if it is:
1. Very short (1-3 words) and generic (e.g., "GDPR", "sustainability", "privacy")
2. Too broad or vague (e.g., "tell me about regulations", "how does it work")
3. Missing important context that could improve semantic search
4. Contains only acronyms without explanation

A query does NOT need enhancement if it is:
1. Already specific and detailed (e.g., "What are the GDPR requirements for data retention in Italy?")
2. Contains clear context and intent
3. Is a complete question with sufficient detail

Respond with ONLY "YES" or "NO".`

    const response = await openrouter.chat.completions.create({
      model: ENHANCEMENT_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0, // Deterministic for caching
      max_tokens: 10,
    })

    const decision = response.choices[0]?.message?.content?.trim().toUpperCase()
    const shouldEnhance = decision === 'YES'
    
    console.log('[query-enhancement] Detection result:', {
      query: query.substring(0, 50),
      decision,
      shouldEnhance,
    })
    
    return shouldEnhance
  } catch (error) {
    console.error('[query-enhancement] Detection failed:', error)
    // On error, don't enhance (conservative approach)
    return false
  }
}

/**
 * Expands a query with related terms, synonyms, and context
 * 
 * Uses LLM to add semantic richness while keeping the query focused.
 * 
 * @param query - Original user query
 * @returns Enhanced query with additional context
 */
async function expandQuery(query: string): Promise<string> {
  try {
    const prompt = `You are a semantic query expander for a consulting knowledge base.

Original query: "${query}"

Expand this query by adding:
1. Related terms and synonyms in both Italian and English
2. Common acronym expansions (e.g., GDPR → General Data Protection Regulation)
3. Relevant domain context
4. Alternative phrasings

Rules:
- Keep expansion concise (max 30-40 words total)
- Focus on terms that would appear in relevant documents
- Do NOT add questions or complete sentences
- Do NOT change the original intent
- Combine original query + expansions naturally

Example:
Original: "GDPR"
Expanded: "GDPR General Data Protection Regulation protezione dati personali privacy regolamento europeo privacy by design data subject rights"

Original: "sustainable packaging"
Expanded: "sustainable packaging imballaggi sostenibili packaging sostenibile PPWR eco-design circular economy economia circolare riciclabilità recyclability environmental impact"

Now expand the query. Respond with ONLY the expanded query text, nothing else.`

    const response = await openrouter.chat.completions.create({
      model: ENHANCEMENT_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Slight creativity for variety
      max_tokens: 150,
    })

    const expanded = response.choices[0]?.message?.content?.trim() || query
    
    console.log('[query-enhancement] Expansion result:', {
      original: query.substring(0, 50),
      expanded: expanded.substring(0, 100),
      expansionLength: expanded.length - query.length,
    })
    
    return expanded
  } catch (error) {
    console.error('[query-enhancement] Expansion failed:', error)
    // On error, return original query
    return query
  }
}

/**
 * Main entry point: Enhances a query if needed
 * 
 * Flow:
 * 1. Check cache for previous decision
 * 2. If not cached, use LLM to detect if enhancement is needed
 * 3. If needed, use LLM to expand the query
 * 4. Cache the result for future use
 * 5. Return enhanced or original query
 * 
 * @param query - User query to potentially enhance
 * @returns Enhancement result with query and metadata
 * 
 * @example
 * const result = await enhanceQueryIfNeeded("GDPR")
 * // result.shouldEnhance = true
 * // result.enhanced = "GDPR General Data Protection Regulation protezione dati..."
 * // result.fromCache = false
 * 
 * const result2 = await enhanceQueryIfNeeded("What are the specific GDPR requirements for data retention in Italy?")
 * // result2.shouldEnhance = false
 * // result2.enhanced = "What are the specific GDPR requirements..." (unchanged)
 * // result2.fromCache = false
 */
export async function enhanceQueryIfNeeded(query: string): Promise<EnhancementResult> {
  // Feature flag check
  if (!ENABLE_QUERY_ENHANCEMENT) {
    console.log('[query-enhancement] Feature disabled via env var')
    return {
      enhanced: query,
      shouldEnhance: false,
      fromCache: false,
    }
  }
  
  try {
    // Step 1: Check cache
    const cached = await findCachedEnhancement(query)
    
    if (cached) {
      console.log('[query-enhancement] Using cached enhancement')
      return {
        enhanced: cached.enhanced_query,
        shouldEnhance: cached.should_enhance,
        fromCache: true,
      }
    }
    
    // Step 2: Detect if enhancement is needed
    console.log('[query-enhancement] Cache miss, detecting if enhancement needed...')
    const shouldEnhance = await shouldEnhanceQuery(query)
    
    let enhancedQuery = query
    
    // Step 3: Expand if needed
    if (shouldEnhance) {
      console.log('[query-enhancement] Enhancement needed, expanding query...')
      enhancedQuery = await expandQuery(query)
    } else {
      console.log('[query-enhancement] Enhancement not needed, using original query')
    }
    
    // Step 4: Cache the result
    await saveCachedEnhancement(query, enhancedQuery, shouldEnhance)
    
    // Step 5: Return result
    return {
      enhanced: enhancedQuery,
      shouldEnhance,
      fromCache: false,
    }
  } catch (error) {
    console.error('[query-enhancement] Enhancement failed:', error)
    // On error, return original query
    return {
      enhanced: query,
      shouldEnhance: false,
      fromCache: false,
    }
  }
}

/**
 * Batch enhancement for multiple queries
 * 
 * Useful for comparative queries where we need to enhance multiple search terms.
 * Uses parallel processing for efficiency.
 * 
 * @param queries - Array of queries to enhance
 * @returns Array of enhancement results
 * 
 * @example
 * const results = await enhanceQueriesBatch(["GDPR", "ESPR"])
 */
export async function enhanceQueriesBatch(queries: string[]): Promise<EnhancementResult[]> {
  try {
    const results = await Promise.all(
      queries.map(query => enhanceQueryIfNeeded(query))
    )
    
    console.log('[query-enhancement] Batch enhancement completed:', {
      total: queries.length,
      enhanced: results.filter(r => r.shouldEnhance).length,
      fromCache: results.filter(r => r.fromCache).length,
    })
    
    return results
  } catch (error) {
    console.error('[query-enhancement] Batch enhancement failed:', error)
    // Return original queries on error
    return queries.map(query => ({
      enhanced: query,
      shouldEnhance: false,
      fromCache: false,
    }))
  }
}

