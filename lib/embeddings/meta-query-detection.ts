import { analyzeQuery } from './query-analysis'

/**
 * Meta Query Detection Module
 * 
 * Wrapper around unified query analysis for backward compatibility.
 * Uses analyzeQuery() internally to detect meta queries.
 * 
 * @deprecated Use analyzeQuery() directly for better performance and more features.
 * This wrapper is maintained for backward compatibility.
 */

/**
 * Meta query detection result
 */
export interface MetaQueryResult {
  isMeta: boolean
  metaType?: 'stats' | 'list' | 'folders' | 'structure'
  fromCache: boolean
}

// Legacy interface kept for type compatibility

/**
 * Detects if a query is asking about the database itself
 * 
 * Wrapper around analyzeQuery() for backward compatibility.
 * 
 * @param query - User query to analyze
 * @returns Detection result with isMeta flag and metaType if meta
 * 
 * @deprecated Use analyzeQuery() directly for better performance
 */
export async function detectMetaQuery(query: string): Promise<MetaQueryResult> {
  try {
    // Use unified analysis (cached internally)
    const analysis = await analyzeQuery(query)
    
    const result: MetaQueryResult = {
      isMeta: analysis.isMeta,
      metaType: analysis.metaType,
      fromCache: analysis.fromCache,
    }
    
    console.log('[meta-query-detection] Detection result:', {
      query: query.substring(0, 50),
      isMeta: result.isMeta,
      metaType: result.metaType,
      fromCache: result.fromCache,
    })
    
    return result
  } catch (error) {
    console.error('[meta-query-detection] Detection failed:', error)
    return {
      isMeta: false,
      fromCache: false,
    }
  }
}

