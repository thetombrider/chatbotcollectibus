/**
 * Test meta query with fixed logic
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local FIRST
config({ path: resolve(process.cwd(), '.env.local') })

// Verify environment
if (!process.env.OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY not found in environment')
  process.exit(1)
}

console.log('✅ Environment loaded')

// Import after env is loaded
const { analyzeQuery } = await import('@/lib/embeddings/query-analysis')

async function testMetaQueryLogic() {
  const query = 'che documenti GRI abbiamo nel db?'
  
  console.log('\n🧪 Testing meta query detection logic...')
  console.log('Query:', query)
  console.log('='.repeat(80))
  
  // Step 1: Analyze query
  console.log('\n1️⃣ Analyzing query...')
  const analysis = await analyzeQuery(query)
  console.log('Analysis result:', JSON.stringify(analysis, null, 2))
  
  // Step 2: Check if exploratory with list indicators (simulating agent logic)
  const queryLower = query.toLowerCase()
  const isExploratoryWithList = analysis.intent === 'exploratory' && 
    (queryLower.includes('che documenti') || queryLower.includes('che norme') || 
     queryLower.includes('quali documenti') || queryLower.includes('quali norme') ||
     queryLower.includes('documenti') || queryLower.includes('norme'))
  
  console.log('\n2️⃣ Checking conversion logic...')
  console.log('Is exploratory with list indicators:', isExploratoryWithList)
  console.log('Should convert to meta list query:', isExploratoryWithList && !analysis.isMeta)
  
  if (isExploratoryWithList && !analysis.isMeta) {
    console.log('\n✅ Would convert to meta list query')
    console.log('   Setting: isMeta = true, metaType = "list"')
  } else if (analysis.isMeta) {
    console.log('\n✅ Already classified as meta query')
    console.log('   metaType:', analysis.metaType)
  } else {
    console.log('\n❌ Would NOT be processed as meta query')
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('✅ Test completed')
}

testMetaQueryLogic().catch(console.error)
