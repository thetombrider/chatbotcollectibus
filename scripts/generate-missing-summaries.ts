// IMPORTANT: Load environment variables FIRST before any other imports
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

/**
 * Generate summaries for documents that don't have one
 * 
 * This script processes existing documents in the database that were uploaded
 * before the summary generation feature was implemented.
 * 
 * Usage:
 * npx tsx scripts/generate-missing-summaries.ts [--limit 10] [--dry-run] [--document-id <uuid>]
 * 
 * Options:
 * --limit N        Process at most N documents (default: 100)
 * --dry-run        Show what would be processed without actually generating summaries
 * --document-id    Process a specific document by ID
 * --all            Process all documents (removes limit)
 */

import { supabaseAdmin } from '../lib/supabase/admin'
import { generateAndSaveSummary } from '../lib/processing/summary-generation'

interface ScriptOptions {
  limit?: number
  dryRun: boolean
  documentId?: string
  all: boolean
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    dryRun: false,
    all: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--limit' && i + 1 < args.length) {
      options.limit = parseInt(args[i + 1], 10)
      i++
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--document-id' && i + 1 < args.length) {
      options.documentId = args[i + 1]
      i++
    } else if (arg === '--all') {
      options.all = true
    }
  }

  // Default limit if not specified and not --all
  if (!options.limit && !options.all && !options.documentId) {
    options.limit = 100
  }

  return options
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function generateMissingSummaries(options: ScriptOptions) {
  console.log('\n=== GENERATE MISSING SUMMARIES ===\n')
  console.log('Options:', {
    limit: options.limit || 'unlimited',
    dryRun: options.dryRun,
    documentId: options.documentId || 'all without summaries',
  })
  console.log('\n---\n')

  try {
    // Find documents without summaries
    let query = supabaseAdmin
      .from('documents')
      .select('id, filename, file_size, chunks_count, processing_status, created_at')
      .is('summary', null)
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false })

    // Filter by specific document if provided
    if (options.documentId) {
      query = query.eq('id', options.documentId)
    }

    // Apply limit if specified
    if (options.limit && !options.all) {
      query = query.limit(options.limit)
    }

    const { data: documents, error } = await query

    if (error) {
      console.error('❌ Failed to fetch documents:', error)
      process.exit(1)
    }

    if (!documents || documents.length === 0) {
      console.log('✅ No documents found without summaries!')
      console.log('All documents are already summarized or no completed documents exist.')
      process.exit(0)
    }

    console.log(`📋 Found ${documents.length} document(s) without summaries:\n`)
    
    // Show document list
    documents.forEach((doc, idx) => {
      const sizeMB = (doc.file_size / 1024 / 1024).toFixed(2)
      console.log(`  ${idx + 1}. ${doc.filename}`)
      console.log(`     ID: ${doc.id}`)
      console.log(`     Size: ${sizeMB} MB | Chunks: ${doc.chunks_count}`)
      console.log(`     Created: ${new Date(doc.created_at).toLocaleString()}`)
    })

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN MODE - No summaries will be generated')
      console.log(`Would process ${documents.length} document(s)`)
      process.exit(0)
    }

    console.log('\n---\n')
    console.log('⚙️  Starting summary generation...\n')

    let successCount = 0
    let failCount = 0
    const startTime = Date.now()

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      const docNum = i + 1
      
      console.log(`[${docNum}/${documents.length}] Processing: ${doc.filename}`)
      console.log(`   Document ID: ${doc.id}`)

      try {
        const docStartTime = Date.now()
        
        // Generate and save summary
        await generateAndSaveSummary(doc.id)
        
        const docElapsed = Date.now() - docStartTime
        successCount++
        
        console.log(`   ✅ Success (${(docElapsed / 1000).toFixed(1)}s)`)
        
        // Rate limiting: 2 seconds between requests
        if (i < documents.length - 1) {
          console.log(`   ⏳ Waiting 2s before next document...\n`)
          await sleep(2000)
        } else {
          console.log('')
        }
      } catch (error) {
        failCount++
        console.error(`   ❌ Failed:`, error instanceof Error ? error.message : 'Unknown error')
        console.log('')
        
        // Continue with next document even if this one fails
        continue
      }
    }

    const totalElapsed = Date.now() - startTime
    const totalMinutes = (totalElapsed / 1000 / 60).toFixed(1)

    console.log('---\n')
    console.log('📊 SUMMARY:\n')
    console.log(`  Total processed: ${documents.length}`)
    console.log(`  ✅ Successful: ${successCount}`)
    console.log(`  ❌ Failed: ${failCount}`)
    console.log(`  ⏱️  Total time: ${totalMinutes} minutes`)
    console.log(`  ⚡ Avg time per doc: ${(totalElapsed / documents.length / 1000).toFixed(1)}s`)

    if (failCount > 0) {
      console.log('\n⚠️  Some documents failed. Check logs above for details.')
      console.log('You can re-run this script to retry failed documents.')
    }

    console.log('\n=== COMPLETE ===\n')
    process.exit(failCount > 0 ? 1 : 0)
  } catch (error) {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  }
}

// Parse arguments and run
const options = parseArgs()
generateMissingSummaries(options)
