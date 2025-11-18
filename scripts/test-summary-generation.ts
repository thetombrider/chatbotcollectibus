// IMPORTANT: Load environment variables FIRST before any other imports
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

/**
 * Test script for summary generation
 * 
 * Tests the summary-of-summaries generation process on a specific document
 * 
 * Usage:
 * npx tsx scripts/test-summary-generation.ts <document-id>
 */

import { generateDocumentSummary, saveSummary } from '../lib/processing/summary-generation'
import { supabaseAdmin } from '../lib/supabase/admin'

async function testSummaryGeneration(documentId: string) {
  console.log('\n=== TEST SUMMARY GENERATION ===\n')
  console.log('Document ID:', documentId)
  console.log('\n---\n')

  try {
    // 1. Verify document exists
    console.log('📋 Checking document...')
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, filename, file_size, chunks_count, processing_status, summary')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      console.error('❌ Document not found:', docError)
      process.exit(1)
    }

    console.log('✅ Document found:', {
      filename: document.filename,
      size: (document.file_size / 1024 / 1024).toFixed(2) + ' MB',
      chunks: document.chunks_count,
      status: document.processing_status,
      hasSummary: !!document.summary,
    })

    if (document.processing_status !== 'completed') {
      console.error('❌ Document is not in completed status')
      process.exit(1)
    }

    console.log('\n---\n')

    // 2. Generate summary
    console.log('⚙️  Generating summary with summary-of-summaries strategy...\n')
    const startTime = Date.now()

    const summary = await generateDocumentSummary(documentId, {
      maxChunksPerBatch: 10,
      maxChunkSummaryTokens: 150,
      maxFinalSummaryTokens: 500,
      language: 'it',
    })

    const elapsed = Date.now() - startTime
    console.log('\n---\n')
    console.log('✅ Summary generated successfully!\n')
    console.log('📊 Generation Statistics:')
    console.log(`   Chunk summaries: ${summary.chunkSummaries.length}`)
    console.log(`   Total tokens used: ${summary.totalTokensUsed}`)
    console.log(`   Model: ${summary.model}`)
    console.log(`   Time elapsed: ${(elapsed / 1000).toFixed(1)}s`)
    console.log(`   Summary length: ${summary.summary.length} chars`)
    console.log(`   Embedding dimension: ${summary.embedding.length}`)

    console.log('\n📝 Chunk Summaries:')
    summary.chunkSummaries.forEach((cs, idx) => {
      console.log(`   ${idx + 1}. [${cs.tokensUsed} tokens] ${cs.summary.substring(0, 80)}...`)
    })

    console.log('\n📄 Final Summary:')
    console.log('---')
    console.log(summary.summary)
    console.log('---')

    // 3. Save to database
    console.log('\n💾 Saving summary to database...')
    await saveSummary(documentId, summary.summary, summary.embedding)
    console.log('✅ Summary saved successfully!')

    // 4. Verify saved
    console.log('\n🔍 Verifying saved summary...')
    const { data: updated, error: verifyError } = await supabaseAdmin
      .from('documents')
      .select('summary, summary_generated_at')
      .eq('id', documentId)
      .single()

    if (verifyError || !updated?.summary) {
      console.error('❌ Failed to verify saved summary:', verifyError)
      process.exit(1)
    }

    console.log('✅ Summary verified:', {
      summaryLength: updated.summary.length,
      generatedAt: updated.summary_generated_at,
    })

    console.log('\n=== TEST COMPLETE ===\n')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

// Parse arguments
const documentId = process.argv[2]

if (!documentId) {
  console.error('Usage: tsx scripts/test-summary-generation.ts <document-id>')
  process.exit(1)
}

// Run test
testSummaryGeneration(documentId)
