#!/usr/bin/env tsx

/**
 * Test Cache Control Feature
 * 
 * Testa che le variabili d'ambiente per disabilitare la cache funzionino correttamente
 */

import { isCacheEnabled } from '@/lib/config/env'

console.log('🧪 Testing Cache Control System...\n')

// Test default behavior (cache should be enabled by default)
console.log('=== Default Behavior (no env vars set) ===')
console.log('Conversation cache enabled:', isCacheEnabled('conversation'))
console.log('Query analysis cache enabled:', isCacheEnabled('query-analysis'))
console.log('Enhancement cache enabled:', isCacheEnabled('enhancement'))

// Test with environment variables
console.log('\n=== Testing with Environment Variables ===')

// Temporarily set environment variables for testing
const originalValues = {
  conversation: process.env.DISABLE_CONVERSATION_CACHE,
  queryAnalysis: process.env.DISABLE_QUERY_ANALYSIS_CACHE,
  enhancement: process.env.DISABLE_ENHANCEMENT_CACHE
}

// Test with cache disabled
process.env.DISABLE_CONVERSATION_CACHE = 'true'
process.env.DISABLE_QUERY_ANALYSIS_CACHE = 'true'
process.env.DISABLE_ENHANCEMENT_CACHE = 'true'

// Clear any cached config to force re-evaluation
console.log('Setting all cache disable flags to true...')
console.log('Conversation cache enabled:', isCacheEnabled('conversation'))
console.log('Query analysis cache enabled:', isCacheEnabled('query-analysis'))
console.log('Enhancement cache enabled:', isCacheEnabled('enhancement'))

// Test with some enabled, some disabled
process.env.DISABLE_CONVERSATION_CACHE = 'false'
process.env.DISABLE_QUERY_ANALYSIS_CACHE = 'true'
process.env.DISABLE_ENHANCEMENT_CACHE = 'false'

console.log('\nSetting mixed values (conversation=false, query-analysis=true, enhancement=false)...')
console.log('Conversation cache enabled:', isCacheEnabled('conversation'))
console.log('Query analysis cache enabled:', isCacheEnabled('query-analysis'))
console.log('Enhancement cache enabled:', isCacheEnabled('enhancement'))

// Test with invalid values (should default to enabled)
process.env.DISABLE_CONVERSATION_CACHE = 'invalid'
process.env.DISABLE_QUERY_ANALYSIS_CACHE = 'not-boolean'
process.env.DISABLE_ENHANCEMENT_CACHE = '1'

console.log('\nTesting with invalid values (should default to enabled)...')
console.log('Conversation cache enabled:', isCacheEnabled('conversation'))
console.log('Query analysis cache enabled:', isCacheEnabled('query-analysis'))
console.log('Enhancement cache enabled:', isCacheEnabled('enhancement'))

// Restore original values
if (originalValues.conversation !== undefined) {
  process.env.DISABLE_CONVERSATION_CACHE = originalValues.conversation
} else {
  delete process.env.DISABLE_CONVERSATION_CACHE
}

if (originalValues.queryAnalysis !== undefined) {
  process.env.DISABLE_QUERY_ANALYSIS_CACHE = originalValues.queryAnalysis
} else {
  delete process.env.DISABLE_QUERY_ANALYSIS_CACHE
}

if (originalValues.enhancement !== undefined) {
  process.env.DISABLE_ENHANCEMENT_CACHE = originalValues.enhancement
} else {
  delete process.env.DISABLE_ENHANCEMENT_CACHE
}

console.log('\n✅ Cache control tests completed!')
console.log('\n📝 Usage Instructions:')
console.log('Set the following environment variables to disable specific caches:')
console.log('- DISABLE_CONVERSATION_CACHE=true    # Disables semantic conversation cache')
console.log('- DISABLE_QUERY_ANALYSIS_CACHE=true  # Disables query analysis & comparative detection cache')
console.log('- DISABLE_ENHANCEMENT_CACHE=true     # Disables query enhancement cache')
console.log('\nExample in .env.local:')
console.log('DISABLE_CONVERSATION_CACHE=true')
console.log('DISABLE_QUERY_ANALYSIS_CACHE=false')
console.log('DISABLE_ENHANCEMENT_CACHE=true')