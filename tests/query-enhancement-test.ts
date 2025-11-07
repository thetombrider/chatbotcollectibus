/**
 * Query Enhancement Testing Script
 * 
 * Tests the query enhancement feature with various query types:
 * 1. Generic queries (should be enhanced)
 * 2. Specific queries (should NOT be enhanced)
 * 3. Comparative queries (should be enhanced, then use multi-query)
 * 
 * Run: npx tsx tests/query-enhancement-test.ts
 */

import { enhanceQueryIfNeeded } from '../lib/embeddings/query-enhancement'
import { generateEmbedding } from '../lib/embeddings/openai'
import { hybridSearch } from '../lib/supabase/vector-operations'

interface TestCase {
  query: string
  expectedToEnhance: boolean
  type: 'generic' | 'specific' | 'comparative'
  description: string
}

const testCases: TestCase[] = [
  // Generic queries - should be enhanced
  {
    query: 'GDPR',
    expectedToEnhance: true,
    type: 'generic',
    description: 'Single acronym - very generic',
  },
  {
    query: 'sustainability',
    expectedToEnhance: true,
    type: 'generic',
    description: 'Single broad term',
  },
  {
    query: 'privacy regulations',
    expectedToEnhance: true,
    type: 'generic',
    description: 'Short and generic',
  },
  {
    query: 'packaging requirements',
    expectedToEnhance: true,
    type: 'generic',
    description: 'Broad topic without context',
  },
  
  // Specific queries - should NOT be enhanced
  {
    query: 'What are the specific GDPR requirements for data retention in Italy for companies with more than 250 employees?',
    expectedToEnhance: false,
    type: 'specific',
    description: 'Detailed question with clear context',
  },
  {
    query: 'How do I implement privacy by design principles in my CRM system?',
    expectedToEnhance: false,
    type: 'specific',
    description: 'Specific implementation question',
  },
  {
    query: 'What is the deadline for CSRD compliance for large companies?',
    expectedToEnhance: false,
    type: 'specific',
    description: 'Specific factual question',
  },
  {
    query: 'Explain the Article 25 of GDPR regarding data protection by design and default',
    expectedToEnhance: false,
    type: 'specific',
    description: 'Specific article reference',
  },
  
  // Comparative queries - should be enhanced
  {
    query: 'GDPR vs ESPR',
    expectedToEnhance: true,
    type: 'comparative',
    description: 'Short comparative',
  },
  {
    query: 'differences between GDPR and ESPR',
    expectedToEnhance: true,
    type: 'comparative',
    description: 'Comparative with keyword but lacking context',
  },
  {
    query: 'What are the main differences between GDPR and ESPR in terms of compliance requirements?',
    expectedToEnhance: false,
    type: 'comparative',
    description: 'Detailed comparative question',
  },
]

async function runTest(testCase: TestCase): Promise<{
  passed: boolean
  result: any
  error?: string
}> {
  try {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`Testing: ${testCase.query}`)
    console.log(`Type: ${testCase.type} | Expected to enhance: ${testCase.expectedToEnhance}`)
    console.log(`Description: ${testCase.description}`)
    console.log('-'.repeat(80))
    
    // Test enhancement
    const result = await enhanceQueryIfNeeded(testCase.query)
    
    console.log('Enhancement Result:')
    console.log(`  Should Enhance: ${result.shouldEnhance}`)
    console.log(`  From Cache: ${result.fromCache}`)
    console.log(`  Original: ${testCase.query}`)
    console.log(`  Enhanced: ${result.enhanced.substring(0, 150)}${result.enhanced.length > 150 ? '...' : ''}`)
    
    // Check if result matches expectation
    const passed = result.shouldEnhance === testCase.expectedToEnhance
    
    if (!passed) {
      console.log(`\n❌ FAILED: Expected shouldEnhance=${testCase.expectedToEnhance}, got ${result.shouldEnhance}`)
    } else {
      console.log('\n✅ PASSED')
    }
    
    // If enhanced, test similarity improvement
    if (result.shouldEnhance) {
      console.log('\nTesting similarity improvement...')
      
      // Generate embeddings for both queries
      const originalEmbedding = await generateEmbedding(testCase.query)
      const enhancedEmbedding = await generateEmbedding(result.enhanced)
      
      // Search with both
      const originalResults = await hybridSearch(originalEmbedding, testCase.query, 5, 0.1, 0.7)
      const enhancedResults = await hybridSearch(enhancedEmbedding, result.enhanced, 5, 0.1, 0.7)
      
      // Compare average similarity
      const originalAvgSim = originalResults.length > 0
        ? originalResults.reduce((sum, r) => sum + r.similarity, 0) / originalResults.length
        : 0
      
      const enhancedAvgSim = enhancedResults.length > 0
        ? enhancedResults.reduce((sum, r) => sum + r.similarity, 0) / enhancedResults.length
        : 0
      
      console.log(`  Original avg similarity: ${originalAvgSim.toFixed(3)}`)
      console.log(`  Enhanced avg similarity: ${enhancedAvgSim.toFixed(3)}`)
      console.log(`  Improvement: ${((enhancedAvgSim - originalAvgSim) * 100).toFixed(1)}%`)
      
      if (enhancedAvgSim > originalAvgSim) {
        console.log('  ✅ Similarity improved!')
      } else {
        console.log('  ⚠️  No improvement (this may be OK if original was already good)')
      }
    }
    
    return { passed, result }
  } catch (error) {
    console.error(`\n❌ ERROR: ${error instanceof Error ? error.message : String(error)}`)
    return {
      passed: false,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runCacheTest() {
  console.log('\n\n' + '='.repeat(80))
  console.log('CACHE TEST')
  console.log('='.repeat(80))
  
  const testQuery = 'GDPR'
  
  // First call - should NOT be from cache
  console.log('\nFirst call (should be fresh):')
  const result1 = await enhanceQueryIfNeeded(testQuery)
  console.log(`  From Cache: ${result1.fromCache}`)
  console.log(`  Should Enhance: ${result1.shouldEnhance}`)
  
  // Second call - should be from cache
  console.log('\nSecond call (should be cached):')
  const result2 = await enhanceQueryIfNeeded(testQuery)
  console.log(`  From Cache: ${result2.fromCache}`)
  console.log(`  Should Enhance: ${result2.shouldEnhance}`)
  
  // Verify cache worked
  if (result2.fromCache) {
    console.log('\n✅ CACHE TEST PASSED')
    return true
  } else {
    console.log('\n❌ CACHE TEST FAILED: Second call should be from cache')
    return false
  }
}

async function main() {
  console.log('Query Enhancement Test Suite')
  console.log('='.repeat(80))
  
  let passed = 0
  let failed = 0
  let errors = 0
  
  // Run all test cases
  for (const testCase of testCases) {
    const result = await runTest(testCase)
    
    if (result.error) {
      errors++
    } else if (result.passed) {
      passed++
    } else {
      failed++
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  // Run cache test
  const cacheTestPassed = await runCacheTest()
  if (cacheTestPassed) {
    passed++
  } else {
    failed++
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(80))
  console.log('TEST SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total Tests: ${testCases.length + 1}`) // +1 for cache test
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`⚠️  Errors: ${errors}`)
  console.log('='.repeat(80))
  
  // Exit with appropriate code
  process.exit(failed + errors > 0 ? 1 : 0)
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})





