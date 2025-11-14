/**
 * Integration Tests for Unified Query Cache
 * 
 * Tests the unified cache system that combines analysis and enhancement caching.
 */

import { findUnifiedCache, saveUnifiedCache, cleanupUnifiedCache } from '@/lib/supabase/unified-query-cache'
import type { QueryAnalysisResult } from '@/lib/embeddings/query-analysis'
import type { EnhancementData } from '@/lib/supabase/unified-query-cache'

describe('Unified Query Cache', () => {
  const testQuery = 'What is the GDPR article 28 about?'
  
  const mockAnalysis: QueryAnalysisResult = {
    intent: 'article_lookup',
    isComparative: false,
    comparativeTerms: undefined,
    comparisonType: undefined,
    isMeta: false,
    metaType: undefined,
    articleNumber: 28,
    hasTemporal: false,
    temporalTerms: undefined,
    hasWebSearchRequest: false,
    webSearchCommand: undefined,
    fromCache: false,
    confidence: 0.9,
  }
  
  const mockEnhancement: EnhancementData = {
    enhanced: 'What is the GDPR article 28 about? Article 28 content requirements provisions',
    shouldEnhance: true,
    articleNumber: 28,
    intent: 'article_lookup',
  }

  beforeEach(async () => {
    // Clean up test data
    await cleanupUnifiedCache(0) // Delete all entries
  })

  test('should save and retrieve cached data', async () => {
    // Save to cache
    await saveUnifiedCache(testQuery, mockAnalysis, mockEnhancement)
    
    // Retrieve from cache
    const cached = await findUnifiedCache(testQuery)
    
    expect(cached).not.toBeNull()
    expect(cached?.analysis.intent).toBe('article_lookup')
    expect(cached?.analysis.articleNumber).toBe(28)
    expect(cached?.enhancement.shouldEnhance).toBe(true)
    expect(cached?.enhancement.enhanced).toContain('Article 28')
  })

  test('should return null for non-existent query', async () => {
    const cached = await findUnifiedCache('Non-existent query that was never cached')
    
    expect(cached).toBeNull()
  })

  test('should update hit count on cache hit', async () => {
    // Save initial
    await saveUnifiedCache(testQuery, mockAnalysis, mockEnhancement)
    
    // First hit
    const firstHit = await findUnifiedCache(testQuery)
    expect(firstHit?.hit_count).toBe(0) // Still 0 because update is async
    
    // Wait a bit for async update
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Second hit
    const secondHit = await findUnifiedCache(testQuery)
    expect(secondHit?.hit_count).toBeGreaterThanOrEqual(1)
  })

  test('should handle case-insensitive queries', async () => {
    // Save with lowercase
    await saveUnifiedCache(testQuery.toLowerCase(), mockAnalysis, mockEnhancement)
    
    // Retrieve with uppercase
    const cached = await findUnifiedCache(testQuery.toUpperCase())
    
    expect(cached).not.toBeNull()
    expect(cached?.analysis.intent).toBe('article_lookup')
  })

  test('should cleanup old entries', async () => {
    // Save test data
    await saveUnifiedCache(testQuery, mockAnalysis, mockEnhancement)
    
    // Verify it exists
    const beforeCleanup = await findUnifiedCache(testQuery)
    expect(beforeCleanup).not.toBeNull()
    
    // Cleanup entries older than 0 days (all entries)
    const deletedCount = await cleanupUnifiedCache(0)
    
    expect(deletedCount).toBeGreaterThanOrEqual(1)
    
    // Verify it's gone
    const afterCleanup = await findUnifiedCache(testQuery)
    expect(afterCleanup).toBeNull()
  })

  test('should handle upsert on duplicate query', async () => {
    // Save first version
    await saveUnifiedCache(testQuery, mockAnalysis, mockEnhancement)
    
    // Save updated version
    const updatedEnhancement: EnhancementData = {
      ...mockEnhancement,
      enhanced: 'Updated enhanced query',
    }
    
    await saveUnifiedCache(testQuery, mockAnalysis, updatedEnhancement)
    
    // Retrieve - should have updated data
    const cached = await findUnifiedCache(testQuery)
    
    expect(cached).not.toBeNull()
    expect(cached?.enhancement.enhanced).toBe('Updated enhanced query')
  })
})

describe('Unified Cache Integration with Analysis & Enhancement', () => {
  test('should work with actual analyzeQuery and enhanceQueryIfNeeded', async () => {
    // This test requires actual Supabase connection and will be skipped in CI
    if (process.env.CI === 'true') {
      console.log('Skipping integration test in CI environment')
      return
    }

    const { analyzeQuery } = await import('@/lib/embeddings/query-analysis')
    const { enhanceQueryIfNeeded } = await import('@/lib/embeddings/query-enhancement')
    
    const testQuery = 'What are the differences between GDPR and ESPR?'
    
    // First call - should miss cache and perform analysis + enhancement
    const firstAnalysis = await analyzeQuery(testQuery)
    expect(firstAnalysis.fromCache).toBe(false)
    
    const firstEnhancement = await enhanceQueryIfNeeded(testQuery, firstAnalysis)
    expect(firstEnhancement.fromCache).toBe(false)
    
    // Second call - should hit unified cache
    const secondEnhancement = await enhanceQueryIfNeeded(testQuery)
    expect(secondEnhancement.fromCache).toBe(true)
    expect(secondEnhancement.analysis?.fromCache).toBe(true)
    
    // Verify data consistency
    expect(secondEnhancement.enhanced).toBe(firstEnhancement.enhanced)
    expect(secondEnhancement.analysis?.intent).toBe(firstAnalysis.intent)
  })
})
