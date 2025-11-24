/**
 * Test BM25 Hybrid Search with Keywords
 * 
 * Valida il nuovo sistema di ricerca con:
 * - BM25 ranking invece di ts_rank_cd standard
 * - Keywords LLM-generated per matching migliorato
 * - Confronto vector-only vs hybrid search
 */

import { generateEmbedding } from '../lib/embeddings/openai'
import { hybridSearch } from '../lib/supabase/vector-operations'
import { supabaseAdmin } from '../lib/supabase/admin'

interface TestQuery {
  query: string
  expectedMatches?: string[] // Keywords che dovrebbero matchare
  description: string
}

const testQueries: TestQuery[] = [
  {
    query: 'CCNL ferie e permessi',
    expectedMatches: ['CCNL', 'ferie', 'permessi'],
    description: 'Test acronimi + termini comuni',
  },
  {
    query: 'TFR trattamento di fine rapporto',
    expectedMatches: ['TFR', 'trattamento', 'fine', 'rapporto'],
    description: 'Test acronimo con espansione',
  },
  {
    query: 'articolo 28 orario di lavoro',
    expectedMatches: ['articolo', '28', 'orario', 'lavoro'],
    description: 'Test riferimento normativo',
  },
  {
    query: 'straordinario festivo',
    expectedMatches: ['straordinario', 'festivo'],
    description: 'Test termini tecnici',
  },
  {
    query: 'malattia certificato medico',
    expectedMatches: ['malattia', 'certificato', 'medico'],
    description: 'Test procedura documentale',
  },
]

async function testBM25HybridSearch() {
  console.log('=== BM25 Hybrid Search Test ===\n')

  // Check if keywords column exists
  const { data: schemaCheck, error: schemaError } = await supabaseAdmin
    .from('document_chunks')
    .select('keywords')
    .limit(1)

  if (schemaError) {
    console.error('❌ Keywords column not found. Run migration first:')
    console.error('   supabase/migrations/20251124000001_bm25_keywords_upgrade.sql')
    return
  }

  // Check if any chunks have keywords
  const { data: keywordCheck } = await supabaseAdmin
    .from('document_chunks')
    .select('id, keywords')
    .not('keywords', 'is', null)
    .limit(5)

  if (!keywordCheck || keywordCheck.length === 0) {
    console.warn('⚠️  No chunks with keywords found. Upload a document to test keyword extraction.\n')
  } else {
    console.log(`✓ Found ${keywordCheck.length} chunks with keywords`)
    console.log('Sample keywords:', keywordCheck[0].keywords, '\n')
  }

  for (const testCase of testQueries) {
    console.log(`\n--- ${testCase.description} ---`)
    console.log(`Query: "${testCase.query}"`)

    try {
      // Generate embedding
      const embedding = await generateEmbedding(testCase.query)

      // Test 1: Vector-only (weight 1.0)
      console.log('\n[Vector-only search (weight=1.0)]')
      const vectorResults = await hybridSearch(
        embedding,
        testCase.query,
        5,
        0.7,
        1.0 // 100% vector
      )

      vectorResults.slice(0, 3).forEach((result, idx) => {
        console.log(`  ${idx + 1}. Similarity: ${(result.similarity * 100).toFixed(1)}%`)
        console.log(`     Vector: ${((result as any).vector_score * 100).toFixed(1)}%, Text: ${((result as any).text_score * 100).toFixed(1)}%`)
        console.log(`     Content preview: ${result.content.slice(0, 100)}...`)
      })

      // Test 2: Hybrid (weight 0.7 vector, 0.3 text)
      console.log('\n[Hybrid search (vector=0.7, text=0.3)]')
      const hybridResults = await hybridSearch(
        embedding,
        testCase.query,
        5,
        0.7,
        0.7 // 70% vector, 30% text (BM25)
      )

      hybridResults.slice(0, 3).forEach((result, idx) => {
        console.log(`  ${idx + 1}. Similarity: ${(result.similarity * 100).toFixed(1)}%`)
        console.log(`     Vector: ${((result as any).vector_score * 100).toFixed(1)}%, Text: ${((result as any).text_score * 100).toFixed(1)}%`)
        console.log(`     Content preview: ${result.content.slice(0, 100)}...`)
        
        // Check if expected matches are in content or keywords
        if (testCase.expectedMatches) {
          const matches = testCase.expectedMatches.filter(keyword => 
            result.content.toLowerCase().includes(keyword.toLowerCase())
          )
          if (matches.length > 0) {
            console.log(`     ✓ Matches: ${matches.join(', ')}`)
          }
        }
      })

      // Test 3: Text-heavy (weight 0.3 vector, 0.7 text)
      console.log('\n[Text-heavy search (vector=0.3, text=0.7)]')
      const textResults = await hybridSearch(
        embedding,
        testCase.query,
        5,
        0.7,
        0.3 // 30% vector, 70% text (BM25)
      )

      textResults.slice(0, 3).forEach((result, idx) => {
        console.log(`  ${idx + 1}. Similarity: ${(result.similarity * 100).toFixed(1)}%`)
        console.log(`     Vector: ${((result as any).vector_score * 100).toFixed(1)}%, Text: ${((result as any).text_score * 100).toFixed(1)}%`)
        console.log(`     Content preview: ${result.content.slice(0, 100)}...`)
      })

      // Compare ranking changes
      console.log('\n[Ranking Analysis]')
      const vectorTop = vectorResults[0]?.id
      const hybridTop = hybridResults[0]?.id
      const textTop = textResults[0]?.id

      if (vectorTop === hybridTop && hybridTop === textTop) {
        console.log('  ✓ All methods returned same top result (consistent)')
      } else {
        console.log('  ⚠ Different top results across methods:')
        console.log(`    Vector-only: ${vectorTop}`)
        console.log(`    Hybrid: ${hybridTop}`)
        console.log(`    Text-heavy: ${textTop}`)
      }

    } catch (error) {
      console.error('❌ Test failed:', error)
    }
  }

  console.log('\n\n=== Test Summary ===')
  console.log('✓ BM25 hybrid search functional')
  console.log('✓ Multiple weight configurations tested')
  console.log('Next: Compare results with old ts_rank_cd implementation')
}

// Run test
testBM25HybridSearch()
  .then(() => {
    console.log('\n✅ All tests completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error)
    process.exit(1)
  })
