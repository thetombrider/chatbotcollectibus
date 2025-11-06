import OpenAI from 'openai'
import { findCachedComparativeDetection, saveCachedComparativeDetection } from '@/lib/supabase/comparative-cache'

/**
 * Comparative Query Detection Module
 * 
 * Uses LLM to detect if a query is comparative and extract terms/entities to compare.
 * Works generically with any type of entity (regulations, concepts, products, etc.).
 * 
 * Caches decisions to minimize LLM API costs.
 */

// Initialize OpenAI client for OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

// Check if comparative detection is enabled (default: true)
const ENABLE_COMPARATIVE_DETECTION = process.env.ENABLE_COMPARATIVE_DETECTION !== 'false'

// Model for detection (cheap and fast) - using the same model as the chat agent
const DETECTION_MODEL = 'google/gemini-2.5-flash'

/**
 * Comparative query detection result
 */
export interface ComparativeQueryResult {
  isComparative: boolean
  terms: string[] | null
  comparisonType: 'differences' | 'similarities' | 'general_comparison' | null
  fromCache: boolean
}

/**
 * Detects if a query is comparative and extracts terms using LLM
 * 
 * A query is comparative if it:
 * - Asks to compare, differentiate, or find similarities between 2+ entities
 * - Uses words like "confronto", "differenza", "simile", "vs", etc.
 * - Explicitly mentions 2+ terms/entities to compare
 * 
 * @param query - User query to analyze
 * @param enhancedQuery - Optional enhanced query (for better pattern matching)
 * @returns Comparative query result with extracted terms, or null if not comparative
 * 
 * @example
 * const result = await detectComparativeQueryLLM("confronta GDPR e ESPR")
 * // result.isComparative = true
 * // result.terms = ["GDPR", "ESPR"]
 * // result.comparisonType = "general_comparison"
 */
export async function detectComparativeQueryLLM(
  query: string,
  enhancedQuery?: string
): Promise<string[] | null> {
  // Feature flag check
  if (!ENABLE_COMPARATIVE_DETECTION) {
    console.log('[comparative-detection] Feature disabled via env var')
    return null
  }

  // Use enhanced query if available for better detection
  const queryToAnalyze = enhancedQuery || query

  try {
    // Step 1: Check cache
    const cached = await findCachedComparativeDetection(queryToAnalyze)

    if (cached) {
      console.log('[comparative-detection] Using cached detection')
      if (cached.is_comparative && cached.comparison_terms && cached.comparison_terms.length >= 2) {
        return cached.comparison_terms
      }
      return null
    }

    // Step 2: Use LLM to detect and extract terms
    console.log('[comparative-detection] Cache miss, using LLM for detection...')
    const result = await detectWithLLM(queryToAnalyze)

    // Step 3: Cache the result
    await saveCachedComparativeDetection(
      queryToAnalyze,
      result.isComparative,
      result.terms,
      result.comparisonType
    )

    // Step 4: Return terms if comparative, null otherwise
    if (result.isComparative && result.terms && result.terms.length >= 2) {
      console.log('[comparative-detection] Comparative query detected:', {
        terms: result.terms,
        type: result.comparisonType,
      })
      return result.terms
    }

    console.log('[comparative-detection] Query is not comparative or insufficient terms')
    return null
  } catch (error) {
    console.error('[comparative-detection] Detection failed:', error)
    // On error, return null (treat as non-comparative)
    return null
  }
}

/**
 * Uses LLM to detect if query is comparative and extract terms
 * 
 * @param query - Query to analyze
 * @returns Detection result with terms and comparison type
 */
async function detectWithLLM(query: string): Promise<ComparativeQueryResult> {
  try {
    const prompt = `Analizza questa query e determina se è una query comparativa.

Query: "${query}"

Una query è comparativa se:
- Chiede di confrontare, differenziare, o trovare somiglianze tra 2+ entità
- Usa parole come "confronto", "differenza", "simile", "vs", "versus", "confronta", "compara", "differenze", "somiglianze", ecc.
- Menziona esplicitamente 2+ termini/entità da confrontare

Se è comparativa, estrai:
- I termini/entità da confrontare (min 2, max 5)
- Il tipo di comparazione: "differences" (se chiede differenze), "similarities" (se chiede somiglianze), o "general_comparison" (se chiede confronto generale)

IMPORTANTE:
- Estrai SOLO i termini/entità principali da confrontare (es: "GDPR", "ESPR", "sostenibilità", "circolarità")
- Non includere parole come "confronto", "differenza", "tra", "e", ecc. nei termini
- Se non riesci a identificare almeno 2 termini chiari, ritorna is_comparative: false

Rispondi SOLO in JSON valido, senza altro testo:
{
  "is_comparative": true/false,
  "terms": ["term1", "term2", ...] o null,
  "comparison_type": "differences"|"similarities"|"general_comparison"|null
}`

    const response = await openrouter.chat.completions.create({
      model: DETECTION_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0, // Deterministic for caching
      max_tokens: 200,
      response_format: { type: 'json_object' }, // Force JSON response
    })

    const content = response.choices[0]?.message?.content?.trim()
    if (!content) {
      console.warn('[comparative-detection] Empty LLM response')
      return {
        isComparative: false,
        terms: null,
        comparisonType: null,
        fromCache: false,
      }
    }

    // Parse JSON response
    let parsed: {
      is_comparative?: boolean
      terms?: string[] | null
      comparison_type?: 'differences' | 'similarities' | 'general_comparison' | null
    }

    try {
      parsed = JSON.parse(content)
    } catch (parseError) {
      console.error('[comparative-detection] Failed to parse LLM JSON response:', parseError)
      console.error('[comparative-detection] Raw response:', content)
      return {
        isComparative: false,
        terms: null,
        comparisonType: null,
        fromCache: false,
      }
    }

    // Validate and normalize response
    const isComparative = parsed.is_comparative === true
    const terms = parsed.terms && Array.isArray(parsed.terms) && parsed.terms.length >= 2
      ? parsed.terms.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : null

    // Validate comparison type
    const validTypes = ['differences', 'similarities', 'general_comparison']
    const comparisonType = parsed.comparison_type && validTypes.includes(parsed.comparison_type)
      ? parsed.comparison_type
      : null

    console.log('[comparative-detection] LLM detection result:', {
      query: query.substring(0, 50),
      isComparative,
      terms,
      comparisonType,
    })

    return {
      isComparative,
      terms: terms && terms.length >= 2 ? terms : null,
      comparisonType,
      fromCache: false,
    }
  } catch (error) {
    console.error('[comparative-detection] LLM detection failed:', error)
    return {
      isComparative: false,
      terms: null,
      comparisonType: null,
      fromCache: false,
    }
  }
}

