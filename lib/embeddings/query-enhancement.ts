import OpenAI from 'openai'
import { findUnifiedCache, saveUnifiedCache, type EnhancementData } from '@/lib/supabase/unified-query-cache'
import { analyzeQuery, type QueryAnalysisResult } from './query-analysis'
import { expandQueryByIntent } from './intent-based-expansion'

/**
 * Query Enhancement Module
 * 
 * Uses unified query analysis to detect intent, then expands queries
 * based on detected intent to improve vector search similarity.
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
  articleNumber?: number // Numero articolo rilevato, se presente
  intent?: string // Intent rilevato (per compatibilità e analytics)
  analysis?: QueryAnalysisResult // Complete analysis result (opzionale, per uso avanzato)
}

/**
 * Rileva riferimenti ad articoli nella query
 * Pattern: "articolo 28", "art. 28", "article 28", "il 34", "al 28", etc.
 * 
 * @deprecated Use analyzeQuery() which detects article numbers
 * @param query - Query da analizzare
 * @returns Numero articolo se rilevato, null altrimenti
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _detectArticleReference(query: string): number | null {
  // Pattern per articoli in italiano e inglese
  const articleRegexes = [
    // Pattern formali: "articolo 28", "article 28"
    /(?:articolo|article)\s+(\d+)/i,
    // Pattern abbreviati: "art. 28", "art 28"
    /art\.?\s+(\d+)/i,
    // Pattern colloquiali per follow-up: "il 34", "al 28", "del 15", "l'articolo 20", "nell'articolo 5"
    // Limitato a 1-3 cifre per evitare falsi positivi come "il 2024"
    /\b(?:il|al|del|nell'?|l')\s+(?:articolo\s+)?(\d{1,3})\b/i,
  ]

  for (const regex of articleRegexes) {
    const match = query.match(regex)
    if (match) {
      const articleNumber = parseInt(match[1], 10)
      // Sanity check: articoli solitamente sono tra 1 e 999
      if (articleNumber >= 1 && articleNumber <= 999) {
        console.log(`[query-enhancement] Detected article reference: ${articleNumber}`)
        return articleNumber
      }
    }
  }

  return null
}

/**
 * Espande query con riferimenti ad articoli
 * Aggiunge varianti e contesto semantico per migliorare la ricerca
 * 
 * @param query - Query originale
 * @param articleNumber - Numero articolo rilevato
 * @returns Query espansa con varianti e contesto
 */
async function expandArticleQuery(query: string, articleNumber: number): Promise<string> {
  try {
    // Espansione base: aggiungi varianti comuni
    const variants = [
      `Articolo ${articleNumber}`,
      `Art. ${articleNumber}`,
      `articolo ${articleNumber}`,
      `art ${articleNumber}`,
      `Article ${articleNumber}`,
    ]

    // Aggiungi contesto semantico
    const contextTerms = [
      'contenuto',
      'disposizioni',
      'norme',
      'prescrizioni',
      'content',
      'provisions',
      'requirements',
    ]

    // Costruisci query espansa
    let expanded = query
    
    // Aggiungi varianti
    expanded += ' ' + variants.join(' ')
    
    // Aggiungi contesto semantico
    const contextPhrases = contextTerms.map(term => 
      `${term} articolo ${articleNumber}`
    )
    expanded += ' ' + contextPhrases.join(' ')

    console.log('[query-enhancement] Article query expansion:', {
      original: query.substring(0, 50),
      articleNumber,
      expanded: expanded.substring(0, 100),
    })

    return expanded
  } catch (error) {
    console.error('[query-enhancement] Article expansion failed:', error)
    // On error, return original query
    return query
  }
}

/**
 * Detects if a query needs enhancement using LLM
 * 
 * Checks if query is:
 * - Too generic (e.g., "GDPR", "sustainability")
 * - Too broad (e.g., "tell me about regulations")
 * - Incomplete or vague
 * 
 * @deprecated Use analyzeQuery() and enhanceQueryIfNeeded() instead
 * @param query - User query to analyze
 * @returns Boolean decision: true if enhancement would help
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _shouldEnhanceQuery(query: string): Promise<boolean> {
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
 * @deprecated Use expandQueryByIntent() instead
 * @param query - Original user query
 * @returns Enhanced query with additional context
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _expandQuery(query: string): Promise<string> {
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
 * NEW FLOW (with unified analysis):
 * 1. Analyze query once (detects intent, comparative, meta, articles)
 * 2. Use intent to guide expansion strategy
 * 3. Expand query based on intent
 * 4. Cache the result for future use
 * 5. Return enhanced or original query
 * 
 * @param query - User query to potentially enhance
 * @param analysisResult - Optional pre-computed analysis result (to avoid duplicate LLM call)
 * @returns Enhancement result with query and metadata
 * 
 * @example
 * const result = await enhanceQueryIfNeeded("GDPR")
 * // result.shouldEnhance = true
 * // result.enhanced = "GDPR General Data Protection Regulation protezione dati..."
 * // result.intent = "definition"
 * 
 * @example
 * // With pre-computed analysis (to avoid duplicate LLM call)
 * const analysis = await analyzeQuery("confronta GDPR e ESPR")
 * const result = await enhanceQueryIfNeeded("confronta GDPR e ESPR", analysis)
 * // Uses analysis.intent to guide expansion
 */
export async function enhanceQueryIfNeeded(
  query: string,
  analysisResult?: QueryAnalysisResult,
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>
): Promise<EnhancementResult> {
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
    // Step 0: Check unified cache first (contains both analysis and enhancement)
    const cached = await findUnifiedCache(query)
    
    if (cached) {
      console.log('[query-enhancement] Using cached enhancement from unified cache')
      return {
        enhanced: cached.enhancement.enhanced,
        shouldEnhance: cached.enhancement.shouldEnhance,
        fromCache: true,
        articleNumber: cached.enhancement.articleNumber || cached.analysis.articleNumber,
        intent: cached.enhancement.intent || cached.analysis.intent,
        analysis: cached.analysis,
      }
    }
    
    // Step 1: Analyze query (if not provided)
    let analysis: QueryAnalysisResult
    if (analysisResult) {
      analysis = analysisResult
      console.log('[query-enhancement] Using provided analysis result')
    } else {
      console.log('[query-enhancement] Analyzing query...')
      analysis = await analyzeQuery(query)
    }
    
    // Step 2: Skip expansion for meta queries (they don't need enhancement)
    if (analysis.isMeta) {
      console.log('[query-enhancement] Meta query detected, skipping expansion')
      
      const enhancementData: EnhancementData = {
        enhanced: query,
        shouldEnhance: false,
        intent: analysis.intent,
      }
      
      // Save to unified cache
      await saveUnifiedCache(query, analysis, enhancementData)
      
      return {
        enhanced: query,
        shouldEnhance: false,
        fromCache: false,
        intent: analysis.intent,
        analysis,
      }
    }
    
    let enhancedQuery = query
    
    // Step 3: Expand query based on intent
    if (analysis.intent === 'article_lookup' && analysis.articleNumber) {
      // Article lookup: use article-specific expansion
      console.log(`[query-enhancement] Article lookup detected (${analysis.articleNumber}), expanding...`)
      enhancedQuery = await expandArticleQuery(query, analysis.articleNumber)
    } else if (analysis.intent === 'comparison' && analysis.comparativeTerms) {
      // Comparison: expand each term separately
      console.log('[query-enhancement] Comparison query detected, expanding terms...')
      enhancedQuery = await expandQueryByIntent(query, analysis, conversationHistory)
    } else {
      // Other intents: use intent-based expansion
      console.log(`[query-enhancement] Intent "${analysis.intent}" detected, expanding...`)
      enhancedQuery = await expandQueryByIntent(query, analysis, conversationHistory)
    }
    
    // Step 4: Determine if enhancement was applied
    const shouldEnhance = enhancedQuery !== query || analysis.articleNumber !== undefined
    
    // Step 5: Save to unified cache (both analysis and enhancement together)
    const enhancementData: EnhancementData = {
      enhanced: enhancedQuery,
      shouldEnhance,
      articleNumber: analysis.articleNumber,
      intent: analysis.intent,
    }
    
    await saveUnifiedCache(query, analysis, enhancementData)
    
    // Step 6: Return result
    return {
      enhanced: enhancedQuery,
      shouldEnhance,
      fromCache: false,
      articleNumber: analysis.articleNumber,
      intent: analysis.intent,
      analysis,
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

