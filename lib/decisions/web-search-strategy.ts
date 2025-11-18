/**
 * Web Search Strategy
 * 
 * Centralizes decision logic for determining when web search is required.
 * This module handles all decision paths for sources sufficiency evaluation.
 */

import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import type { SearchResult } from '@/lib/supabase/database.types'

export interface WebSearchDecisionInput {
  /** Query analysis result */
  analysis: QueryAnalysisResult
  
  /** Search results from vector database */
  relevantResults: SearchResult[]
  
  /** Average similarity score of search results */
  avgSimilarity: number
  
  /** Whether user has enabled web search */
  webSearchEnabled: boolean
  
  /** Context text from search results (null if no context) */
  contextText: string | null
}

export interface WebSearchDecisionOutput {
  /** True if sources are insufficient and web search should be used */
  sourcesInsufficient: boolean
  
  /** Reasons for the decision (for debugging) */
  reasons: string[]
  
  /** Decision factors breakdown */
  factors: {
    baseSourcesTooWeak: boolean
    needsWebForTemporal: boolean
    needsWebForExplicitRequest: boolean
    userWantsWebSearch: boolean
  }
}

/**
 * Determines if web search is required based on multiple decision paths
 * 
 * Decision Paths:
 * 1. BASE LOGIC: Evaluate semantic quality of search results
 * 2. TEMPORAL OVERRIDE: Temporal queries always need web search
 * 3. EXPLICIT OVERRIDE: User explicitly requested web search
 * 4. USER PREFERENCE OVERRIDE: User preference for general queries without context
 * 
 * @param input Decision input parameters
 * @returns Decision output with reasons
 */
export function evaluateWebSearchNeed(input: WebSearchDecisionInput): WebSearchDecisionOutput {
  const {
    analysis,
    relevantResults,
    avgSimilarity,
    webSearchEnabled,
    contextText,
  } = input

  const reasons: string[] = []
  
  // PATH 1: BASE LOGIC - Evaluate semantic quality
  const baseSourcesTooWeak = relevantResults.length === 0 || 
    (relevantResults.length < 3 && avgSimilarity < 0.55) ||
    (relevantResults.length >= 3 && avgSimilarity < 0.50)
  
  if (baseSourcesTooWeak) {
    if (relevantResults.length === 0) {
      reasons.push('No search results found')
    } else if (relevantResults.length < 3) {
      reasons.push(`Low result count (${relevantResults.length}) with weak similarity (${avgSimilarity.toFixed(2)})`)
    } else {
      reasons.push(`Weak semantic similarity (${avgSimilarity.toFixed(2)}) across ${relevantResults.length} results`)
    }
  }
  
  // PATH 2: TEMPORAL OVERRIDE - Temporal queries need fresh data
  const needsWebForTemporal = webSearchEnabled && (analysis.hasTemporal || false)
  
  if (needsWebForTemporal) {
    reasons.push(`Temporal query detected: ${analysis.temporalTerms?.join(', ') || 'temporal indicators present'}`)
  }
  
  // PATH 3: EXPLICIT OVERRIDE - User explicitly requested web search
  const needsWebForExplicitRequest = webSearchEnabled && (analysis.hasWebSearchRequest || false)
  
  if (needsWebForExplicitRequest) {
    reasons.push(`Explicit web search request: "${analysis.webSearchCommand || 'web search command detected'}"`)
  }
  
  // PATH 4: USER PREFERENCE OVERRIDE - User wants web for general queries
  const userWantsWebSearch = webSearchEnabled && analysis.intent === 'general' && !contextText
  
  if (userWantsWebSearch) {
    reasons.push('User preference: web search enabled for general query without context')
  }
  
  // FINAL DECISION: Any path can trigger web search
  const sourcesInsufficient = baseSourcesTooWeak || needsWebForTemporal || needsWebForExplicitRequest || userWantsWebSearch
  
  return {
    sourcesInsufficient,
    reasons,
    factors: {
      baseSourcesTooWeak,
      needsWebForTemporal,
      needsWebForExplicitRequest,
      userWantsWebSearch,
    },
  }
}

/**
 * Helper to format decision output for logging
 */
export function formatDecisionForLog(
  decision: WebSearchDecisionOutput,
  resultsCount: number,
  avgSimilarity: number
): Record<string, unknown> {
  return {
    sourcesInsufficient: decision.sourcesInsufficient,
    resultsCount,
    avgSimilarity: avgSimilarity.toFixed(3),
    reasons: decision.reasons,
    ...decision.factors,
  }
}
