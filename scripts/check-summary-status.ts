/**
 * Check summary status in database
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { supabaseAdmin } from '@/lib/supabase/admin'

async function checkSummaryStatus() {
  console.log('\n📊 Checking summary status in database...')
  console.log('='.repeat(80))
  
  // Total documents
  const { count: totalDocs, error: countError } = await supabaseAdmin
    .from('documents')
    .select('*', { count: 'exact', head: true })
  
  if (countError) {
    console.error('❌ Error counting documents:', countError)
    return
  }
  
  console.log(`\n✅ Total documents: ${totalDocs}`)
  
  // Documents with summary
  const { count: withSummary, error: summaryError } = await supabaseAdmin
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .not('summary', 'is', null)
  
  if (summaryError) {
    console.error('❌ Error counting summaries:', summaryError)
    return
  }
  
  console.log(`✅ Documents with summary: ${withSummary}`)
  console.log(`⚠️  Documents without summary: ${totalDocs! - withSummary!}`)
  
  if (withSummary && withSummary > 0) {
    const percentage = ((withSummary / totalDocs!) * 100).toFixed(1)
    console.log(`📈 Summary coverage: ${percentage}%`)
  }
  
  // Check for GRI documents
  console.log('\n🔍 Checking GRI documents...')
  const { data: griDocs, error: griError } = await supabaseAdmin
    .from('documents')
    .select('id, filename, summary, summary_embedding')
    .ilike('filename', '%GRI%')
    .limit(5)
  
  if (griError) {
    console.error('❌ Error fetching GRI documents:', griError)
    return
  }
  
  console.log(`✅ Found ${griDocs?.length || 0} GRI documents (showing max 5):`)
  griDocs?.forEach((doc, idx) => {
    console.log(`\n  ${idx + 1}. ${doc.filename}`)
    console.log(`     Has summary: ${!!doc.summary}`)
    console.log(`     Has summary embedding: ${!!doc.summary_embedding}`)
    if (doc.summary) {
      console.log(`     Summary preview: ${doc.summary.substring(0, 150)}...`)
    }
  })
  
  console.log('\n' + '='.repeat(80))
  console.log('✅ Check completed')
}

checkSummaryStatus().catch(console.error)
