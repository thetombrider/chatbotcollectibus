/**
 * Script di test per verificare tutte le connessioni API
 */

import { supabaseAdmin } from '../lib/supabase/admin'
import { generateEmbedding } from '../lib/embeddings/openai'
import { ragAgent } from '../lib/mastra/agent'

async function testSupabase() {
  console.log('🔍 Testing Supabase connection...')
  try {
    const { data, error } = await supabaseAdmin.from('documents').select('count').limit(1)
    if (error) throw error
    console.log('✅ Supabase connection: OK')
    return true
  } catch (error) {
    console.error('❌ Supabase connection failed:', error)
    return false
  }
}

async function testOpenAI() {
  console.log('🔍 Testing OpenAI API...')
  try {
    const embedding = await generateEmbedding('test')
    if (embedding && embedding.length === 1536) {
      console.log('✅ OpenAI API: OK (embedding generated)')
      return true
    } else {
      console.error('❌ OpenAI API: Invalid embedding length')
      return false
    }
  } catch (error) {
    console.error('❌ OpenAI API failed:', error instanceof Error ? error.message : error)
    return false
  }
}

async function testOpenRouter() {
  console.log('🔍 Testing OpenRouter API...')
  try {
    // Test semplice - verifica che l'agent sia configurato
    if (ragAgent && ragAgent.model) {
      console.log('✅ OpenRouter configuration: OK')
      return true
    } else {
      console.error('❌ OpenRouter configuration: Agent not properly configured')
      return false
    }
  } catch (error) {
    console.error('❌ OpenRouter configuration failed:', error instanceof Error ? error.message : error)
    return false
  }
}

async function runTests() {
  console.log('🚀 Starting API connection tests...\n')
  
  const results = {
    supabase: await testSupabase(),
    openai: await testOpenAI(),
    openrouter: await testOpenRouter(),
  }
  
  console.log('\n📊 Test Results:')
  console.log('----------------')
  console.log(`Supabase:   ${results.supabase ? '✅' : '❌'}`)
  console.log(`OpenAI:     ${results.openai ? '✅' : '❌'}`)
  console.log(`OpenRouter: ${results.openrouter ? '✅' : '❌'}`)
  
  const allPassed = Object.values(results).every(r => r === true)
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! Application is ready.')
    process.exit(0)
  } else {
    console.log('\n⚠️  Some tests failed. Please check your environment variables.')
    process.exit(1)
  }
}

runTests().catch(console.error)


