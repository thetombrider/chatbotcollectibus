/**
 * Test script for exploratory document search
 * 
 * Usage:
 * npx tsx scripts/test-exploratory-search.ts
 */

// Load environment variables from .env.local
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

import { searchDocumentsBySummary, getDocumentSummaryStats } from '../lib/supabase/document-search'

async function testExploratorySearch() {
  console.log('\n=== TEST EXPLORATORY SEARCH ===\n')

  // Test 1: Get summary statistics
  console.log('📊 Getting summary statistics...')
  try {
    const stats = await getDocumentSummaryStats()
    console.log('Summary Coverage:', {
      total: stats.total,
      withSummary: stats.withSummary,
      withoutSummary: stats.withoutSummary,
      percentage: `${stats.percentage}%`,
    })

    if (stats.withSummary === 0) {
      console.log('\n⚠️  No documents with summaries found!')
      console.log('Please generate summaries first before testing search.')
      return
    }
  } catch (error) {
    console.error('❌ Failed to get statistics:', error)
    return
  }

  console.log('\n---\n')

  // Test 2: Search with Italian query
  const testQueries = [
    'sostenibilità ambientale',
    'privacy e protezione dati',
    'normativa europea',
    'compliance GDPR',
  ]

  for (const query of testQueries) {
    console.log(`🔍 Testing query: "${query}"`)
    
    try {
      const results = await searchDocumentsBySummary(query, {
        threshold: 0.6,
        limit: 10,
        includeWithoutSummary: false,
      })

      console.log(`Found ${results.length} documents:`)
      
      if (results.length > 0) {
        results.forEach((doc, idx) => {
          console.log(`  ${idx + 1}. ${doc.filename}`)
          console.log(`     Similarity: ${doc.similarity.toFixed(3)}`)
          console.log(`     Summary: ${doc.summary?.substring(0, 100)}...`)
          console.log(`     Folder: ${doc.folder_path || 'root'}`)
        })
      } else {
        console.log('  (no matches above threshold)')
      }
    } catch (error) {
      console.error(`❌ Search failed:`, error)
    }

    console.log('\n---\n')
  }

  // Test 3: Low threshold search (broader results)
  console.log('🔍 Testing with low threshold (0.4) for broader matches...')
  
  try {
    const results = await searchDocumentsBySummary('energia rinnovabile', {
      threshold: 0.4,
      limit: 5,
      includeWithoutSummary: false,
    })

    console.log(`Found ${results.length} documents with threshold 0.4:`)
    results.forEach((doc, idx) => {
      console.log(`  ${idx + 1}. ${doc.filename} (${doc.similarity.toFixed(3)})`)
    })
  } catch (error) {
    console.error('❌ Search failed:', error)
  }

  console.log('\n=== TEST COMPLETE ===\n')
}

// Run test
testExploratorySearch()
  .then(() => {
    console.log('✅ All tests completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
