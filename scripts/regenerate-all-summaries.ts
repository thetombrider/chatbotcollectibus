// IMPORTANT: Load environment variables FIRST before any other imports
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

/**
 * Regenerate ALL summaries with updated strategy
 * 
 * This script regenerates summaries for ALL documents, including those that already have one.
 * Use this after updating the summary generation strategy.
 * 
 * Usage:
 * npx tsx scripts/regenerate-all-summaries.ts [--limit 10] [--dry-run] [--force]
 * 
 * Options:
 * --limit N        Process at most N documents (default: all)
 * --dry-run        Show what would be processed without actually regenerating
 * --force          Skip confirmation prompt
 */

import { supabaseAdmin } from '../lib/supabase/admin'
import { generateAndSaveSummary } from '../lib/processing/summary-generation'
import * as readline from 'readline'

interface ScriptOptions {
  limit?: number
  dryRun: boolean
  force: boolean
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    dryRun: false,
    force: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--limit' && i + 1 < args.length) {
      options.limit = parseInt(args[i + 1], 10)
      i++
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--force') {
      options.force = true
    }
  }

  return options
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function confirmRegeneration(documentCount: number): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    console.log(`\n⚠️  WARNING: This will regenerate summaries for ${documentCount} document(s).`)
    console.log('   This will overwrite existing summaries and incur API costs.')
    console.log('   Estimated cost: ~$0.02-0.03 per document with GPT-4o-mini\n')
    
    rl.question('Do you want to continue? (yes/no): ', (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y')
    })
  })
}

async function regenerateAllSummaries(options: ScriptOptions) {
  console.log('\n=== REGENERATE ALL SUMMARIES ===\n')
  console.log('Strategy: Max 10 chunks (first 3 + random middle + last 3)')
  console.log('Model: openai/gpt-4o-mini')
  console.log('Max tokens: 1000 (400-750 words)')
  console.log('\nOptions:', {
    limit: options.limit || 'all documents',
    dryRun: options.dryRun,
    force: options.force,
  })
  console.log('\n---\n')

  try {
    // Find all completed documents (regardless of summary status)
    let query = supabaseAdmin
      .from('documents')
      .select('id, filename, file_size, chunks_count, processing_status, summary, created_at')
      .eq('processing_status', 'completed')
      .order('created_at', { ascending: false })

    // Apply limit if specified
    if (options.limit) {
      query = query.limit(options.limit)
    }

    const { data: documents, error } = await query

    if (error) {
      console.error('❌ Failed to fetch documents:', error)
      process.exit(1)
    }

    if (!documents || documents.length === 0) {
      console.log('No documents found to process.')
      process.exit(0)
    }

    // Show document list
    console.log(`Found ${documents.length} document(s) to process:\n`)
    
    documents.forEach((doc, idx) => {
      const hasSummary = doc.summary ? '✓' : '✗'
      const sizeKB = (doc.file_size / 1024).toFixed(2)
      console.log(`  ${idx + 1}. [${hasSummary}] ${doc.filename}`)
      console.log(`      ${doc.chunks_count || 0} chunks, ${sizeKB} KB`)
    })

    // Dry run mode
    if (options.dryRun) {
      console.log('\n🔍 DRY RUN MODE - No summaries will be regenerated')
      console.log(`Would process ${documents.length} document(s)`)
      process.exit(0)
    }

    // Confirmation
    if (!options.force) {
      const confirmed = await confirmRegeneration(documents.length)
      if (!confirmed) {
        console.log('\n❌ Operation cancelled by user')
        process.exit(0)
      }
    }

    console.log('\n---\n')
    console.log('⚙️  Starting summary regeneration...\n')

    let successCount = 0
    let failCount = 0
    const startTime = Date.now()

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      const docNum = i + 1
      
      console.log(`[${docNum}/${documents.length}] Processing: ${doc.filename}`)
      console.log(`   Document ID: ${doc.id}`)
      console.log(`   Current status: ${doc.summary ? 'Has summary (will overwrite)' : 'No summary'}`)

      try {
        const docStartTime = Date.now()
        
        // Generate and save summary (overwrites existing)
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
    const estimatedCost = (documents.length * 0.02).toFixed(2) // ~$0.02 per doc with GPT-4o-mini

    console.log('---\n')
    console.log('📊 SUMMARY:\n')
    console.log(`  Total processed: ${documents.length}`)
    console.log(`  ✅ Successful: ${successCount}`)
    console.log(`  ❌ Failed: ${failCount}`)
    console.log(`  ⏱️  Total time: ${totalMinutes} minutes`)
    console.log(`  ⚡ Avg time per doc: ${(totalElapsed / documents.length / 1000).toFixed(1)}s`)
    console.log(`  💰 Estimated cost: ~$${estimatedCost} USD`)

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
regenerateAllSummaries(options)
