/**
 * Test semplice delle connessioni senza Mastra
 * Esegui con: node --loader ts-node/esm scripts/test-simple.ts
 */

async function testConnections() {
  console.log('🔍 Testing API Connections...\n')

  // Test Supabase
  console.log('1. Testing Supabase...')
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error('   ❌ Missing Supabase environment variables')
      return false
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data, error } = await supabase.from('documents').select('id').limit(1)
    
    if (error) throw error
    console.log('   ✅ Supabase: Connected successfully')
  } catch (error) {
    console.error('   ❌ Supabase:', error instanceof Error ? error.message : error)
    return false
  }

  // Test OpenAI
  console.log('\n2. Testing OpenAI...')
  try {
    const OpenAI = (await import('openai')).default
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      console.error('   ❌ Missing OPENAI_API_KEY')
      return false
    }

    const openai = new OpenAI({ apiKey })
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-large',
      input: 'test',
    })

    if (response.data && response.data[0].embedding.length === 1536) {
      console.log('   ✅ OpenAI: Connected successfully (embedding generated)')
    } else {
      console.error('   ❌ OpenAI: Invalid response')
      return false
    }
  } catch (error) {
    console.error('   ❌ OpenAI:', error instanceof Error ? error.message : error)
    return false
  }

  // Test OpenRouter (verifica solo che la chiave esista)
  console.log('\n3. Testing OpenRouter configuration...')
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      console.error('   ❌ Missing OPENROUTER_API_KEY')
      return false
    }
    console.log('   ✅ OpenRouter: API key configured')
  } catch (error) {
    console.error('   ❌ OpenRouter:', error instanceof Error ? error.message : error)
    return false
  }

  console.log('\n✅ All basic connections verified!')
  return true
}

testConnections().then(success => {
  process.exit(success ? 0 : 1)
}).catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})

