import { analyzeQuery } from './query-analysis'

/**
 * Comparative Query Detection Module
 * 
 * Wrapper around unified query analysis for backward compatibility.
 * Uses analyzeQuery() internally to detect comparative queries.
 * 
 * @deprecated Use analyzeQuery() directly for better performance and more features.
 * This wrapper is maintained for backward compatibility.
 */

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
 * Detects if a query is comparative and extracts terms
 * 
 * Wrapper around analyzeQuery() for backward compatibility.
 * 
 * @param query - User query to analyze
 * @param enhancedQuery - Optional enhanced query (ignored, kept for compatibility)
 * @returns Array of terms to compare, or null if not comparative
 * 
 * @example
 * const result = await detectComparativeQueryLLM("confronta GDPR e ESPR")
 * // result = ["GDPR", "ESPR"] or null
 * 
 * @deprecated Use analyzeQuery() directly for better performance
 */
export async function detectComparativeQueryLLM(
  query: string,
  enhancedQuery?: string
): Promise<string[] | null> {
  try {
    // Use unified analysis (cached internally)
    const analysis = await analyzeQuery(query)
    
    // Extract comparative terms if comparative
    if (analysis.isComparative && analysis.comparativeTerms && analysis.comparativeTerms.length >= 2) {
      console.log('[comparative-detection] Comparative query detected:', {
        terms: analysis.comparativeTerms,
        type: analysis.comparisonType,
        fromCache: analysis.fromCache,
      })
      return analysis.comparativeTerms
    }
    
    return null
  } catch (error) {
    console.error('[comparative-detection] Detection failed:', error)
    return null
  }
}

// Legacy interface kept for type compatibility (not used anymore)
export interface ComparativeQueryResult {
  isComparative: boolean
  terms: string[] | null
  comparisonType: 'differences' | 'similarities' | 'general_comparison' | null
  fromCache: boolean
}


