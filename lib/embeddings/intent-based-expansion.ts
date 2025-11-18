import OpenAI from 'openai'
import type { QueryAnalysisResult, QueryIntent } from './query-analysis'
import { PROMPTS, compilePrompt } from '@/lib/observability/prompt-manager'
import { 
  formatConversationContext, 
  buildConversationContextSection,
  summarizeConversationHistory,
  type ConversationMessage 
} from '@/lib/context/conversation-context'
// TODO: Re-implement tracing with new Langfuse patterns (createGeneration, etc.)
// import { logLLMCall } from '@/lib/observability/langfuse'

/**
 * Intent-Based Query Expansion Module
 * 
 * Expands queries based on detected semantic intent.
 * Each intent type has a specific expansion strategy to improve vector search relevance.
 */

// Initialize OpenAI client for OpenRouter
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

// Model for expansion (cheap and fast)
const EXPANSION_MODEL = 'google/gemini-2.5-flash'

/**
 * Expansion strategy interface
 */
export interface ExpansionStrategy {
  intent: QueryIntent
  expansionTerms: string[] // Terms to add for this intent
  expansionMethod: 'add_terms' | 'llm_guided' | 'custom'
  customExpander?: (query: string, analysis: QueryAnalysisResult) => Promise<string>
  priority?: number // Priority if multiple strategies match
}

/**
 * Registry of expansion strategies for each intent type
 */
const EXPANSION_STRATEGIES = new Map<QueryIntent, ExpansionStrategy>([
  // Comparison: Expand each term separately + comparative terms
  ['comparison', {
    intent: 'comparison',
    expansionTerms: ['confronto', 'differenza', 'simile', 'comparazione', 'comparison', 'difference', 'similarity'],
    expansionMethod: 'llm_guided', // Use LLM to expand each term separately
  }],
  
  // Definition: Add definition-related terms
  ['definition', {
    intent: 'definition',
    expansionTerms: ['definizione', 'concetto', 'significato', 'cos\'è', 'che cosa è', 'definition', 'concept', 'meaning', 'what is'],
    expansionMethod: 'add_terms',
  }],
  
  // Requirements: Add requirements/obligations terms
  ['requirements', {
    intent: 'requirements',
    expansionTerms: ['requisiti', 'obblighi', 'prescrizioni', 'compliance', 'doveri', 'requirements', 'obligations', 'prescriptions', 'duties'],
    expansionMethod: 'add_terms',
  }],
  
  // Procedure: Add procedure/process terms
  ['procedure', {
    intent: 'procedure',
    expansionTerms: ['processo', 'procedura', 'come', 'step', 'fasi', 'implementazione', 'procedure', 'process', 'how', 'steps', 'phases', 'implementation'],
    expansionMethod: 'add_terms',
  }],
  
  // Article lookup: Keep article expansion (handled separately)
  ['article_lookup', {
    intent: 'article_lookup',
    expansionTerms: ['articolo', 'art', 'article', 'contenuto', 'disposizioni', 'norme', 'prescrizioni', 'content', 'provisions', 'requirements'],
    expansionMethod: 'add_terms',
  }],
  
  // Timeline: Add timeline/deadline terms
  ['timeline', {
    intent: 'timeline',
    expansionTerms: ['scadenze', 'deadline', 'timeline', 'quando', 'date', 'periodo', 'scadenza', 'deadlines', 'when', 'dates', 'period'],
    expansionMethod: 'add_terms',
  }],
  
  // Causes/Effects: Add cause/effect terms
  ['causes_effects', {
    intent: 'causes_effects',
    expansionTerms: ['causa', 'effetto', 'conseguenza', 'impatto', 'risultato', 'cause', 'effect', 'consequence', 'impact', 'result'],
    expansionMethod: 'add_terms',
  }],
  
  // Meta: Don't expand (query about database)
  ['meta', {
    intent: 'meta',
    expansionTerms: [],
    expansionMethod: 'add_terms', // No expansion for meta queries
  }],
  
  // Exploratory: Document discovery queries about themes/topics
  // Expand to improve semantic matching for document summaries
  ['exploratory', {
    intent: 'exploratory',
    expansionTerms: ['argomenti', 'tematiche', 'contenuti', 'trattano', 'riguardano', 'parlano', 'relativi', 'documenti', 'topics', 'themes', 'content', 'related', 'documents', 'about', 'regarding'],
    expansionMethod: 'llm_guided', // Use LLM for richer topical expansion
  }],
  
  // General: Use generic expansion (synonyms + related terms)
  // Per spiegazioni generali, usa termini più ampi invece di definizioni formali
  ['general', {
    intent: 'general',
    expansionTerms: ['spiegazione', 'descrizione', 'informazioni', 'dettagli', 'caratteristiche', 'aspetti', 'elementi', 'explanation', 'description', 'information', 'details', 'features', 'aspects', 'elements'],
    expansionMethod: 'llm_guided', // Usa LLM per espansione più ricca
  }],
])

/**
 * Expands a query based on detected intent
 * 
 * @param query - Original user query
 * @param analysis - Query analysis result with intent and metadata
 * @returns Expanded query optimized for vector search
 * 
 * @example
 * const analysis = { intent: 'definition', ... }
 * const expanded = await expandQueryByIntent("GDPR", analysis)
 * // expanded = "GDPR definizione concetto significato cos'è General Data Protection Regulation..."
 */
export async function expandQueryByIntent(
  query: string,
  analysis: QueryAnalysisResult,
  conversationHistory?: ConversationMessage[]
): Promise<string> {
  try {
    const strategy = EXPANSION_STRATEGIES.get(analysis.intent)
    
    if (!strategy) {
      console.warn('[intent-based-expansion] No strategy found for intent:', analysis.intent)
      return query
    }

    // Meta queries: don't expand
    if (analysis.intent === 'meta') {
      console.log('[intent-based-expansion] Meta query detected, skipping expansion')
      return query
    }

    // Article lookup: use article-specific expansion
    if (analysis.intent === 'article_lookup' && analysis.articleNumber) {
      return await expandArticleQuery(query, analysis.articleNumber)
    }

    // Comparison: expand each term separately
    if (analysis.intent === 'comparison' && analysis.comparativeTerms && analysis.comparativeTerms.length >= 2) {
      return await expandComparativeQuery(query, analysis.comparativeTerms)
    }

    // LLM-guided expansion (with conversation history)
    if (strategy.expansionMethod === 'llm_guided') {
      return await expandWithLLM(query, analysis.intent, strategy.expansionTerms, conversationHistory)
    }

    // Custom expander
    if (strategy.expansionMethod === 'custom' && strategy.customExpander) {
      return await strategy.customExpander(query, analysis)
    }

    // Add terms expansion (default)
    if (strategy.expansionTerms.length > 0) {
      return addExpansionTerms(query, strategy.expansionTerms)
    }

    // Fallback: return original query
    return query
  } catch (error) {
    console.error('[intent-based-expansion] Expansion failed:', error)
    return query
  }
}

/**
 * Adds expansion terms to the query
 */
function addExpansionTerms(query: string, terms: string[]): string {
  const expanded = `${query} ${terms.join(' ')}`
  console.log('[intent-based-expansion] Added terms:', {
    original: query.substring(0, 50),
    terms: terms.slice(0, 5),
    expanded: expanded.substring(0, 100),
  })
  return expanded
}

/**
 * Expands query using LLM with intent-specific guidance
 */
async function expandWithLLM(
  query: string,
  intent: QueryIntent,
  baseTerms: string[],
  conversationHistory?: ConversationMessage[]
): Promise<string> {
  try {
    const intentContext = getIntentContext(intent)
    const baseTermsSection = baseTerms.length > 0
      ? `5. Include these intent-specific terms: ${baseTerms.join(', ')}`
      : ''

    // Build conversation context using centralized module
    console.log('[intent-based-expansion] Conversation history received:', 
      summarizeConversationHistory(conversationHistory)
    )
    
    const conversationSection = buildConversationContextSection(conversationHistory, {
      maxMessages: 3,
      maxCharsPerMessage: 200,
    })
    
    if (conversationSection) {
      const contextPreview = formatConversationContext(conversationHistory, { 
        maxMessages: 1, 
        maxCharsPerMessage: 150 
      })
      console.log('[intent-based-expansion] Using conversation context:', contextPreview)
    }

    // Fetch prompt from Langfuse with fallback
    const prompt = await compilePrompt(
      PROMPTS.QUERY_EXPANSION,
      {
        query,
        intent,
        intentContext: intentContext ? `Context: ${intentContext}` : '',
        baseTermsSection,
        conversationContext: conversationSection,
      },
      {
        // Fallback to hard-coded prompt if Langfuse fails
        fallback: buildFallbackExpansionPrompt(query, intent, intentContext, baseTerms, conversationSection),
      }
    )

    const response = await openrouter.chat.completions.create({
      model: EXPANSION_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 150,
    })

    const expanded = response.choices[0]?.message?.content?.trim() || query
    
    // Log LLM call to Langfuse
    // const usage = response.usage ? {
    //   promptTokens: response.usage.prompt_tokens,
    //   completionTokens: response.usage.completion_tokens,
    //   totalTokens: response.usage.total_tokens,
    // } : undefined
    
    // TODO: Re-implement with new Langfuse patterns (createGeneration, etc.)
    // logLLMCall(
    //   'query-expansion', // traceId (standalone per query expansion)
    //   EXPANSION_MODEL,
    //   { query, intent, prompt },
    //   expanded,
    //   usage,
    //   { operation: 'query-expansion', intent, queryLength: query.length }
    // )
    
    console.log('[intent-based-expansion] LLM expansion result:', {
      original: query.substring(0, 50),
      intent,
      expanded: expanded.substring(0, 100),
    })
    
    return expanded
  } catch (error) {
    console.error('[intent-based-expansion] LLM expansion failed:', error)
    return query
  }
}

/**
 * Expands article query with article variants
 */
async function expandArticleQuery(query: string, articleNumber: number): Promise<string> {
  const variants = [
    `Articolo ${articleNumber}`,
    `Art. ${articleNumber}`,
    `articolo ${articleNumber}`,
    `art ${articleNumber}`,
    `Article ${articleNumber}`,
  ]

  const contextTerms = [
    'contenuto',
    'disposizioni',
    'norme',
    'prescrizioni',
    'content',
    'provisions',
    'requirements',
  ]

  const contextPhrases = contextTerms.map(term => `${term} articolo ${articleNumber}`)
  const expanded = `${query} ${variants.join(' ')} ${contextPhrases.join(' ')}`

  console.log('[intent-based-expansion] Article expansion:', {
    original: query.substring(0, 50),
    articleNumber,
    expanded: expanded.substring(0, 100),
  })

  return expanded
}

/**
 * Expands comparative query by expanding each term separately
 */
async function expandComparativeQuery(query: string, terms: string[]): Promise<string> {
  // Expand each term separately, then combine
  const expandedTerms = await Promise.all(
    terms.map(term => expandWithLLM(term, 'comparison', ['confronto', 'differenza', 'simile']))
  )

  const expanded = `${query} ${expandedTerms.join(' ')}`
  
  console.log('[intent-based-expansion] Comparative expansion:', {
    original: query.substring(0, 50),
    terms,
    expanded: expanded.substring(0, 150),
  })

  return expanded
}

/**
 * Gets context description for intent (for LLM prompts)
 */
function getIntentContext(intent: QueryIntent): string | null {
  const contexts: Record<QueryIntent, string> = {
    comparison: 'This is a comparison query - expand terms that help compare entities',
    definition: 'This is a definition query - expand with terms related to definitions and concepts',
    requirements: 'This is a requirements query - expand with terms related to obligations and compliance',
    procedure: 'This is a procedure query - expand with terms related to processes and implementation',
    article_lookup: 'This is an article lookup query - expand with article variants and context',
    meta: 'This is a meta query about the database - do not expand',
    timeline: 'This is a timeline query - expand with terms related to deadlines and dates',
    causes_effects: 'This is a causes/effects query - expand with terms related to consequences and impacts',
    exploratory: 'This is an exploratory query - expand with terms related to document themes and topics',
    general: 'This is a general query - expand with synonyms and related terms',
  }

  return contexts[intent] || null
}

/**
 * Registers a new expansion strategy (for extensibility)
 */
export function registerExpansionStrategy(strategy: ExpansionStrategy): void {
  EXPANSION_STRATEGIES.set(strategy.intent, strategy)
  console.log('[intent-based-expansion] Registered strategy for intent:', strategy.intent)
}

/**
 * Builds fallback expansion prompt (used when Langfuse is unavailable)
 */
function buildFallbackExpansionPrompt(
  query: string,
  intent: QueryIntent,
  intentContext: string | null,
  baseTerms: string[],
  conversationContext?: string
): string {
  return `You are a semantic query expander for a consulting knowledge base.

${conversationContext ? `${conversationContext}` : ''}Original query: "${query}"
Intent: ${intent}
${intentContext ? `Context: ${intentContext}` : ''}

Expand this query by adding:
1. Related terms and synonyms in both Italian and English
2. Common acronym expansions (e.g., GDPR → General Data Protection Regulation)
3. Relevant domain context for ${intent} queries
4. Alternative phrasings
${baseTerms.length > 0 ? `5. Include these intent-specific terms: ${baseTerms.join(', ')}` : ''}
${conversationContext ? '6. Use the conversation context to preserve references to specific documents/folders mentioned earlier' : ''}

Rules:
- Keep expansion concise (max 30-40 words total)
- Focus on terms that would appear in relevant documents
- Do NOT add questions or complete sentences
- Do NOT change the original intent
- Combine original query + expansions naturally
${conversationContext ? '- If the conversation mentions specific documents/folders, include those names in the expansion' : ''}

Example:
Original: "GDPR"
Expanded: "GDPR General Data Protection Regulation protezione dati personali privacy regolamento europeo privacy by design data subject rights"

Now expand the query. Respond with ONLY the expanded query text, nothing else.`
}

