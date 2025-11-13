/**
 * Script per testare l'API dei crediti OpenRouter
 * Eseguire con: tsx scripts/test-credits-api.ts
 */

import 'dotenv/config'

async function testCreditsAPI() {
  console.log('🧪 Testing OpenRouter Credits API...\n')

  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY non configurata')
    process.exit(1)
  }

  try {
    console.log('📡 Fetching credits from OpenRouter...')
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      console.error(`❌ API request failed with status ${response.status}`)
      process.exit(1)
    }

    const data = await response.json()
    
    console.log('\n✅ Raw API Response:')
    console.log(JSON.stringify(data, null, 2))

    const totalCredits = data.data?.total_credits || 0
    const totalUsage = data.data?.total_usage || 0
    const remaining = totalCredits - totalUsage

    console.log('\n📊 Processed Data:')
    console.log(`   Total Credits: $${totalCredits.toFixed(2)}`)
    console.log(`   Total Usage: $${totalUsage.toFixed(2)}`)
    console.log(`   Remaining: $${remaining.toFixed(2)}`)

    console.log('\n💡 Label Preview:')
    console.log(`   "Crediti rimanenti: $${remaining.toFixed(2)} / $${totalCredits.toFixed(2)}"`)

    console.log('\n✨ Test completed successfully!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testCreditsAPI()
