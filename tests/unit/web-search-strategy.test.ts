/**
 * Unit Tests: Web Search Strategy
 * 
 * Tests all decision paths for web search need evaluation
 */

import { describe, it, expect } from '@jest/globals'
import { evaluateWebSearchNeed, formatDecisionForLog } from '@/lib/decisions/web-search-strategy'
import type { WebSearchDecisionInput } from '@/lib/decisions/web-search-strategy'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import type { SearchResult } from '@/lib/supabase/database.types'

// Mock factory functions
function createMockAnalysis(overrides: Partial<QueryAnalysisResult> = {}): QueryAnalysisResult {
  return {
    intent: 'general',
    isComparative: false,
    isMeta: false,
    hasTemporal: false,
    temporalTerms: [],
    hasWebSearchRequest: false,
    webSearchCommand: undefined,
    ...overrides,
  } as QueryAnalysisResult
}

function createMockResults(count: number, similarity: number): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}`,
    document_id: `doc-${i}`,
    chunk_index: i,
    content: `Mock content ${i}`,
    similarity: similarity,
    metadata: {},
  } as SearchResult))
}

describe('Web Search Strategy', () => {
  describe('PATH 1: Base Logic (Semantic Quality)', () => {
    it('should require web search when no results found', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis(),
        relevantResults: [],
        avgSimilarity: 0,
        webSearchEnabled: true,
        contextText: null,
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.sourcesInsufficient).toBe(true)
      expect(decision.factors.baseSourcesTooWeak).toBe(true)
      expect(decision.reasons).toContain('No search results found')
    })

    it('should require web search when few results with low similarity', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis(),
        relevantResults: createMockResults(2, 0.45),
        avgSimilarity: 0.45,
        webSearchEnabled: true,
        contextText: 'some context',
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.sourcesInsufficient).toBe(true)
      expect(decision.factors.baseSourcesTooWeak).toBe(true)
      expect(decision.reasons[0]).toContain('Low result count (2)')
      expect(decision.reasons[0]).toContain('weak similarity (0.45)')
    })

    it('should require web search when many results but low avg similarity', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis(),
        relevantResults: createMockResults(5, 0.42),
        avgSimilarity: 0.42,
        webSearchEnabled: true,
        contextText: 'some context',
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.sourcesInsufficient).toBe(true)
      expect(decision.factors.baseSourcesTooWeak).toBe(true)
      expect(decision.reasons[0]).toContain('Weak semantic similarity (0.42)')
      expect(decision.reasons[0]).toContain('5 results')
    })

    it('should NOT require web search when sufficient results with good similarity', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis(),
        relevantResults: createMockResults(5, 0.72),
        avgSimilarity: 0.72,
        webSearchEnabled: true,
        contextText: 'good context',
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.sourcesInsufficient).toBe(false)
      expect(decision.factors.baseSourcesTooWeak).toBe(false)
      expect(decision.reasons).toHaveLength(0)
    })

    it('should handle edge case: exactly 3 results at threshold', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis(),
        relevantResults: createMockResults(3, 0.50),
        avgSimilarity: 0.50,
        webSearchEnabled: true,
        contextText: 'context',
      }

      const decision = evaluateWebSearchNeed(input)

      // At threshold, should NOT require web search
      expect(decision.sourcesInsufficient).toBe(false)
      expect(decision.factors.baseSourcesTooWeak).toBe(false)
    })
  })

  describe('PATH 2: Temporal Override', () => {
    it('should require web search for temporal query even with good results', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis({
          hasTemporal: true,
          temporalTerms: ['2024', 'ultimo'],
        }),
        relevantResults: createMockResults(5, 0.85),
        avgSimilarity: 0.85,
        webSearchEnabled: true,
        contextText: 'excellent context',
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.sourcesInsufficient).toBe(true)
      expect(decision.factors.needsWebForTemporal).toBe(true)
      expect(decision.reasons[0]).toContain('Temporal query detected')
      expect(decision.reasons[0]).toContain('2024, ultimo')
    })

    it('should NOT require web search for temporal query if web search disabled', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis({
          hasTemporal: true,
          temporalTerms: ['2024'],
        }),
        relevantResults: createMockResults(5, 0.85),
        avgSimilarity: 0.85,
        webSearchEnabled: false,
        contextText: 'context',
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.factors.needsWebForTemporal).toBe(false)
    })
  })

  describe('PATH 3: Explicit Request Override', () => {
    it('should require web search when user explicitly requests it', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis({
          hasWebSearchRequest: true,
          webSearchCommand: 'vai su web e cerca',
        }),
        relevantResults: createMockResults(5, 0.90),
        avgSimilarity: 0.90,
        webSearchEnabled: true,
        contextText: 'perfect context',
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.sourcesInsufficient).toBe(true)
      expect(decision.factors.needsWebForExplicitRequest).toBe(true)
      expect(decision.reasons[0]).toContain('Explicit web search request')
      expect(decision.reasons[0]).toContain('vai su web e cerca')
    })

    it('should NOT require web search for explicit request if web search disabled', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis({
          hasWebSearchRequest: true,
        }),
        relevantResults: createMockResults(5, 0.90),
        avgSimilarity: 0.90,
        webSearchEnabled: false,
        contextText: 'context',
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.factors.needsWebForExplicitRequest).toBe(false)
    })
  })

  describe('PATH 4: User Preference Override', () => {
    it('should require web search for general query without context when enabled', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis({
          intent: 'general',
        }),
        relevantResults: createMockResults(5, 0.75),
        avgSimilarity: 0.75,
        webSearchEnabled: true,
        contextText: null, // No context
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.sourcesInsufficient).toBe(true)
      expect(decision.factors.userWantsWebSearch).toBe(true)
      expect(decision.reasons[0]).toContain('User preference')
      expect(decision.reasons[0]).toContain('web search enabled for general query without context')
    })

    it('should NOT require web search for general query WITH context', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis({
          intent: 'general',
        }),
        relevantResults: createMockResults(5, 0.75),
        avgSimilarity: 0.75,
        webSearchEnabled: true,
        contextText: 'has context', // Has context
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.factors.userWantsWebSearch).toBe(false)
    })

    it('should NOT require web search for non-general intent without context', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis({
          intent: 'article',
        }),
        relevantResults: createMockResults(5, 0.75),
        avgSimilarity: 0.75,
        webSearchEnabled: true,
        contextText: null,
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.factors.userWantsWebSearch).toBe(false)
    })
  })

  describe('Multiple Paths Triggered', () => {
    it('should include all applicable reasons when multiple paths trigger', () => {
      const input: WebSearchDecisionInput = {
        analysis: createMockAnalysis({
          hasTemporal: true,
          temporalTerms: ['2025'],
          hasWebSearchRequest: true,
          webSearchCommand: 'cerca online',
        }),
        relevantResults: createMockResults(1, 0.30), // Also triggers base logic
        avgSimilarity: 0.30,
        webSearchEnabled: true,
        contextText: null,
      }

      const decision = evaluateWebSearchNeed(input)

      expect(decision.sourcesInsufficient).toBe(true)
      expect(decision.factors.baseSourcesTooWeak).toBe(true)
      expect(decision.factors.needsWebForTemporal).toBe(true)
      expect(decision.factors.needsWebForExplicitRequest).toBe(true)
      expect(decision.reasons).toHaveLength(3)
    })
  })

  describe('formatDecisionForLog', () => {
    it('should format decision output for structured logging', () => {
      const decision = evaluateWebSearchNeed({
        analysis: createMockAnalysis({ hasTemporal: true }),
        relevantResults: createMockResults(3, 0.65),
        avgSimilarity: 0.65,
        webSearchEnabled: true,
        contextText: 'context',
      })

      const formatted = formatDecisionForLog(decision, 3, 0.65)

      expect(formatted).toHaveProperty('sourcesInsufficient', true)
      expect(formatted).toHaveProperty('resultsCount', 3)
      expect(formatted).toHaveProperty('avgSimilarity', '0.650')
      expect(formatted).toHaveProperty('reasons')
      expect(formatted).toHaveProperty('baseSourcesTooWeak', false)
      expect(formatted).toHaveProperty('needsWebForTemporal', true)
    })
  })
})
