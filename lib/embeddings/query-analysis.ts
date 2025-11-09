import OpenAI from 'openai'
import { findCachedQueryAnalysis, saveCachedQueryAnalysis } from '@/lib/supabase/query-analysis-cache'
import { logLLMCall } from '@/lib/observability/langfuse'

/**
 * Unified Query Analysis Module
 * 
 * Uses a SINGLE LLM call to detect:
 * - Semantic intent (comparison, definition, requirements, procedure, etc.)
 * - Comparative queries and extract terms
 * - Meta queries (database queries)
 * - Article references
 * 
 * This replaces multiple separate LLM calls from:
 * - comparative-query-detection.ts
 * - meta-query-detection.ts
 * - query-enhancement.ts (article detection)
 * 
 * Caches results to minimize LLM API costs.
 */

// Initialize OpenAI client for OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

// Check if query analysis is enabled (default: true)
const ENABLE_QUERY_ANALYSIS = process.env.ENABLE_QUERY_ANALYSIS !== 'false'

// Model for analysis (cheap and fast)
const ANALYSIS_MODEL = 'google/gemini-2.5-flash'

/**
 * Query intent types
 */
export type QueryIntent = 
  | 'comparison'
  | 'definition'
  | 'requirements'
  | 'procedure'
  | 'article_lookup'
  | 'meta'
  | 'timeline'
  | 'causes_effects'
  | 'general'

/**
 * Unified query analysis result
 */
export interface QueryAnalysisResult {
  // Semantic intent
  intent: QueryIntent
  
  // Comparative query data
  isComparative: boolean
  comparativeTerms?: string[]
  comparisonType?: 'differences' | 'similarities' | 'general_comparison'
  
  // Meta query data
  isMeta: boolean
  metaType?: 'stats' | 'list' | 'folders' | 'structure'
  
  // Article reference
  articleNumber?: number
  
  // Metadata
  fromCache: boolean
  confidence?: number
}

/**
 * Detects article reference using regex (fast, no LLM needed)
 * This is used as a fallback and to confirm LLM detection
 */
function detectArticleReferenceRegex(query: string): number | null {
  const articleRegexes = [
    /(?:articolo|article)\s+(\d+)/i,
    /art\.?\s+(\d+)/i,
    /\b(?:il|al|del|nell'?|l')\s+(?:articolo\s+)?(\d{1,3})\b/i,
  ]

  for (const regex of articleRegexes) {
    const match = query.match(regex)
    if (match) {
      const articleNumber = parseInt(match[1], 10)
      if (articleNumber >= 1 && articleNumber <= 999) {
        return articleNumber
      }
    }
  }

  return null
}

/**
 * Main function: Analyzes a query and detects everything in one LLM call
 * 
 * @param query - User query to analyze
 * @returns Complete analysis result with intent, comparative terms, meta info, article number
 * 
 * @example
 * const analysis = await analyzeQuery("confronta GDPR e ESPR")
 * // analysis.intent = "comparison"
 * // analysis.isComparative = true
 * // analysis.comparativeTerms = ["GDPR", "ESPR"]
 * 
 * @example
 * const analysis = await analyzeQuery("cos'è il GDPR")
 * // analysis.intent = "definition"
 * // analysis.isComparative = false
 * // analysis.isMeta = false
 */
export async function analyzeQuery(query: string): Promise<QueryAnalysisResult> {
  // Feature flag check
  if (!ENABLE_QUERY_ANALYSIS) {
    console.log('[query-analysis] Feature disabled via env var')
    return getDefaultResult(query)
  }

  try {
    // Step 1: Check cache
    const cached = await findCachedQueryAnalysis(query)
    if (cached) {
      console.log('[query-analysis] Using cached analysis')
      return {
        ...cached,
        fromCache: true,
      }
    }

    // Step 2: Fast regex check for articles (before LLM call)
    const articleNumberRegex = detectArticleReferenceRegex(query)

    // Step 3: Use LLM to analyze everything at once
    console.log('[query-analysis] Cache miss, using LLM for unified analysis...')
    const result = await analyzeWithLLM(query, articleNumberRegex)

    // Step 4: Cache the result
    await saveCachedQueryAnalysis(query, result)

    console.log('[query-analysis] Analysis result:', {
      query: query.substring(0, 50),
      intent: result.intent,
      isComparative: result.isComparative,
      isMeta: result.isMeta,
      articleNumber: result.articleNumber,
    })

    return result
  } catch (error) {
    console.error('[query-analysis] Analysis failed:', error)
    // On error, return default result
    return getDefaultResult(query)
  }
}

/**
 * Uses LLM to analyze query and detect everything at once
 * 
 * @param query - Query to analyze
 * @param articleNumberRegex - Article number detected by regex (if any)
 * @returns Complete analysis result
 */
async function analyzeWithLLM(
  query: string,
  articleNumberRegex: number | null
): Promise<QueryAnalysisResult> {
  try {
    const prompt = `Analizza questa query e determina tutte le sue caratteristiche in una sola volta.

Query: "${query}"

Devi rilevare:

1. INTENT SEMANTICO (uno solo):
   - "comparison": Confronto tra 2+ entità (es: "confronta GDPR e ESPR", "differenze tra X e Y")
   - "definition": SOLO definizione formale/concept breve (es: "cos'è il GDPR", "definizione di sostenibilità", "che cosa significa X")
     IMPORTANTE: "spiegami X", "descrivimi X", "raccontami di X" NON sono "definition" ma "general"
   - "requirements": Requisiti/obblighi (es: "requisiti GDPR", "cosa serve per compliance")
   - "procedure": Procedure/processi (es: "come implementare GDPR", "processo per compliance")
   - "article_lookup": Ricerca articolo specifico (es: "articolo 28 GDPR", "art. 5")
   - "meta": Query sul database stesso (es: "quanti documenti ci sono", "che norme ci sono")
   - "timeline": Scadenze/timeline (es: "quando scade GDPR", "scadenze compliance")
   - "causes_effects": Cause/effetti (es: "perché serve GDPR", "conseguenze non compliance")
   - "general": Spiegazione generale/descrizione completa (es: "spiegami X", "descrivimi X", "raccontami di X", "parlami di X")

2. QUERY COMPARATIVA:
   - Se intent è "comparison", estrai i termini da confrontare (min 2, max 5)
   - Tipo: "differences" (differenze), "similarities" (somiglianze), "general_comparison" (confronto generale)

3. QUERY META:
   - Se intent è "meta", determina il tipo: "stats" (statistiche), "list" (liste), "folders" (cartelle), "structure" (struttura)

4. RIFERIMENTO ARTICOLO:
   - Se la query menziona un articolo specifico, estrai il numero (1-999)
   - ${articleNumberRegex ? `NOTA: Regex ha rilevato articolo ${articleNumberRegex} - conferma o correggi se necessario.` : ''}

IMPORTANTE:
- L'intent deve essere UNO SOLO (il più rilevante)
- Se la query è comparativa, intent DEVE essere "comparison"
- Se la query è meta, intent DEVE essere "meta"
- Se la query menziona un articolo specifico, intent DEVE essere "article_lookup" (a meno che non sia anche comparativa o meta)
- DISTINGUI tra "definition" e "general":
  * "definition": SOLO per richieste di definizione breve/formale ("cos'è", "definizione di", "che cosa significa")
  * "general": per richieste di spiegazione/descrizione completa ("spiegami", "descrivimi", "raccontami", "parlami di")
- Estrai SOLO i termini principali per confronti (es: "GDPR", "ESPR", non "confronto", "differenza")

Rispondi SOLO in JSON valido, senza altro testo:
{
  "intent": "comparison" | "definition" | "requirements" | "procedure" | "article_lookup" | "meta" | "timeline" | "causes_effects" | "general",
  "is_comparative": true/false,
  "comparative_terms": ["term1", "term2", ...] o null,
  "comparison_type": "differences" | "similarities" | "general_comparison" | null,
  "is_meta": true/false,
  "meta_type": "stats" | "list" | "folders" | "structure" | null,
  "article_number": numero o null,
  "confidence": 0.0-1.0
}`

    const response = await openrouter.chat.completions.create({
      model: ANALYSIS_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0, // Deterministic for caching
      max_tokens: 300,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content?.trim()
    
    // Log LLM call to Langfuse
    const usage = response.usage ? {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    } : undefined
    
    logLLMCall(
      'query-analysis', // traceId (standalone per query analysis)
      ANALYSIS_MODEL,
      { query, prompt },
      content,
      usage,
      { operation: 'query-analysis', queryLength: query.length }
    )
    if (!content) {
      console.warn('[query-analysis] Empty LLM response')
      return getDefaultResult(query, articleNumberRegex)
    }

    // Parse JSON response - use robust extraction method
    // Extract JSON by finding first { and last } - this handles markdown code blocks
    let parsed: {
      intent?: string
      is_comparative?: boolean
      comparative_terms?: string[] | null
      comparison_type?: string | null
      is_meta?: boolean
      meta_type?: string | null
      article_number?: number | null
      confidence?: number
    }

    // First, try to parse the content directly (in case it's already clean JSON)
    try {
      parsed = JSON.parse(content.trim())
      console.log('[query-analysis] JSON parsing succeeded on raw content')
    } catch (firstError) {
      // If that fails, extract JSON by finding first { and last }
      // This is the most robust method - it works even with markdown code blocks
      console.log('[query-analysis] Direct parsing failed, extracting JSON from content')
      
      const firstBrace = content.indexOf('{')
      const lastBrace = content.lastIndexOf('}')
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonCandidate = content.substring(firstBrace, lastBrace + 1)
        console.log('[query-analysis] Extracted JSON candidate (first 200 chars):', jsonCandidate.substring(0, 200))
        
        try {
          parsed = JSON.parse(jsonCandidate)
          console.log('[query-analysis] JSON extraction and parsing succeeded!')
        } catch (extractError) {
          console.error('[query-analysis] Failed to parse extracted JSON:', extractError)
          console.error('[query-analysis] Raw response:', content)
          console.error('[query-analysis] Extracted JSON:', jsonCandidate)
          return getDefaultResult(query, articleNumberRegex)
        }
      } else {
        console.error('[query-analysis] Could not find JSON braces in content')
        console.error('[query-analysis] First brace index:', firstBrace)
        console.error('[query-analysis] Last brace index:', lastBrace)
        console.error('[query-analysis] Raw response:', content)
        return getDefaultResult(query, articleNumberRegex)
      }
    }

    // Validate and normalize response
    const validIntents: QueryIntent[] = [
      'comparison',
      'definition',
      'requirements',
      'procedure',
      'article_lookup',
      'meta',
      'timeline',
      'causes_effects',
      'general',
    ]
    const intent = parsed.intent && validIntents.includes(parsed.intent as QueryIntent)
      ? (parsed.intent as QueryIntent)
      : 'general'

    const isComparative = parsed.is_comparative === true
    const comparativeTerms = isComparative && parsed.comparative_terms && Array.isArray(parsed.comparative_terms) && parsed.comparative_terms.length >= 2
      ? parsed.comparative_terms.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : undefined

    const validComparisonTypes = ['differences', 'similarities', 'general_comparison']
    const comparisonType = parsed.comparison_type && validComparisonTypes.includes(parsed.comparison_type)
      ? (parsed.comparison_type as 'differences' | 'similarities' | 'general_comparison')
      : undefined

    const isMeta = parsed.is_meta === true
    const validMetaTypes = ['stats', 'list', 'folders', 'structure']
    const metaType = isMeta && parsed.meta_type && validMetaTypes.includes(parsed.meta_type)
      ? (parsed.meta_type as 'stats' | 'list' | 'folders' | 'structure')
      : undefined

    // Use LLM article number if provided, otherwise use regex result
    const articleNumber = parsed.article_number !== null && parsed.article_number !== undefined
      ? (parsed.article_number >= 1 && parsed.article_number <= 999 ? parsed.article_number : null)
      : articleNumberRegex

    const confidence = parsed.confidence !== undefined && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : undefined

    const result: QueryAnalysisResult = {
      intent,
      isComparative,
      comparativeTerms,
      comparisonType,
      isMeta,
      metaType,
      articleNumber: articleNumber || undefined,
      fromCache: false,
      confidence,
    }

    return result
  } catch (error) {
    console.error('[query-analysis] LLM analysis failed:', error)
    return getDefaultResult(query, articleNumberRegex)
  }
}

/**
 * Returns default analysis result (fallback)
 */
function getDefaultResult(query: string, articleNumber?: number | null): QueryAnalysisResult {
  return {
    intent: 'general',
    isComparative: false,
    isMeta: false,
    fromCache: false,
    articleNumber: articleNumber || undefined,
  }
}

