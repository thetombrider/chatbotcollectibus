/**
 * Test script to verify that meta query sources now include summaries
 */

import { listDocumentsMeta } from '@/lib/supabase/meta-queries'
import { createMetaSources } from '@/app/api/chat/services/source-service'

async function testMetaQuerySummary() {
  console.log('🧪 Testing meta query with summary in sources...\n')

  try {
    // Fetch some documents
    console.log('📚 Fetching documents...')
    const documents = await listDocumentsMeta({ limit: 5 })
    
    console.log(`Found ${documents.length} documents\n`)

    if (documents.length === 0) {
      console.log('⚠️  No documents found in database')
      return
    }

    // Check which documents have summaries
    const withSummary = documents.filter(doc => doc.summary && doc.summary.trim().length > 0)
    const withoutSummary = documents.filter(doc => !doc.summary || doc.summary.trim().length === 0)

    console.log('📊 Summary statistics:')
    console.log(`  - Documents with summary: ${withSummary.length}`)
    console.log(`  - Documents without summary: ${withoutSummary.length}\n`)

    // Show sample documents
    for (const doc of documents.slice(0, 3)) {
      console.log('─'.repeat(80))
      console.log(`📄 ${doc.filename}`)
      console.log(`   Folder: ${doc.folder || '(root)'}`)
      console.log(`   Has summary: ${doc.summary ? '✅ YES' : '❌ NO'}`)
      
      if (doc.summary) {
        const summaryPreview = doc.summary.substring(0, 150) + (doc.summary.length > 150 ? '...' : '')
        console.log(`   Summary preview: "${summaryPreview}"`)
      }
      console.log()
    }

    // Test source creation
    console.log('🔧 Testing source creation with summaries...\n')
    const metaDocuments = documents.map((doc, idx) => ({
      id: doc.id,
      filename: doc.filename,
      index: idx + 1,
      folder: doc.folder,
      chunkCount: doc.chunks_count,
      summary: doc.summary,
      contentPreview: doc.summary ? undefined : '(fallback to chunks)', // Simulate fallback
      fileType: doc.file_type,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      processingStatus: doc.processing_status,
    }))

    const sources = createMetaSources(metaDocuments)

    console.log(`Created ${sources.length} sources\n`)

    for (const source of sources.slice(0, 3)) {
      console.log('─'.repeat(80))
      console.log(`[${source.index}] ${source.filename}`)
      console.log(`    Content length: ${source.content.length} chars`)
      
      if (source.content.length > 0) {
        const contentPreview = source.content.substring(0, 150) + (source.content.length > 150 ? '...' : '')
        console.log(`    Preview: "${contentPreview}"`)
      } else {
        console.log(`    Preview: (empty)`)
      }
      console.log()
    }

    console.log('✅ Test completed successfully!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  }
}

// Run test
testMetaQuerySummary().catch(console.error)
