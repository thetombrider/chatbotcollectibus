#!/usr/bin/env tsx
/**
 * Test script per verificare il miglioramento della ricerca web per query temporali
 * 
 * Questo script testa che:
 * 1. Query temporali attivino la ricerca web anche con buoni match semantici
 * 2. Comandi espliciti web siano rilevati correttamente
 * 3. Preferenze utente (webSearchEnabled) siano rispettate
 */

import { analyzeQuery } from '../lib/embeddings/query-analysis'

/**
 * Test cases per query temporali
 */
const TEMPORAL_QUERIES = [
  'quali sono le ultime normative in ambito LCA?',
  'novità recenti sul GDPR',
  'aggiornamenti del 2024 sulla sostenibilità',
  'nuove direttive europee',
  'latest developments in AI regulation',
  'recent updates on data protection',
]

/**
 * Test cases per comandi espliciti
 */
const EXPLICIT_WEB_COMMANDS = [
  'vai su web e cerca informazioni sul GDPR',
  'cerca su internet le ultime normative',
  'ricerca online novità sulla privacy',
  'search the web for AI regulations',
  'check online for recent updates',
  'guarda su internet se ci sono novità',
]

/**
 * Test cases normali (non dovrebbero attivare automaticamente web search)
 */
const NORMAL_QUERIES = [
  'cos\'è il GDPR?',
  'spiegami la sostenibilità',
  'requisiti ISO 14001',
  'what is data protection',
  'definizione di economia circolare',
]

/**
 * Simula la logica di decision del response-handler
 */
function simulateWebSearchDecision(
  analysis: Awaited<ReturnType<typeof analyzeQuery>>,
  webSearchEnabled: boolean,
  contextText: string | null,
  avgSimilarity: number
): {
  SOURCES_INSUFFICIENT: boolean
  reasons: string[]
} {
  const relevantResultsCount = avgSimilarity > 0.5 ? (avgSimilarity > 0.7 ? 5 : 3) : (avgSimilarity > 0.3 ? 2 : 0) // Mock: simulate results based on similarity
  
  // BASE LOGIC: Valuta la qualità semantica dei risultati
  const baseSourcesTooWeak = relevantResultsCount === 0 || 
    (relevantResultsCount < 3 && avgSimilarity < 0.55) ||
    (relevantResultsCount >= 3 && avgSimilarity < 0.50)
  
  // TEMPORAL OVERRIDE: Query temporali richiedono sempre ricerca web se abilitata
  const needsWebForTemporal = webSearchEnabled && analysis.hasTemporal
  
  // EXPLICIT OVERRIDE: Utente ha chiesto esplicitamente ricerca web
  const needsWebForExplicitRequest = webSearchEnabled && analysis.hasWebSearchRequest
  
  // USER PREFERENCE OVERRIDE: Utente ha attivato ricerca web e dovrebbe avere precedenza per query generiche
  const userWantsWebSearch = webSearchEnabled && analysis.intent === 'general' && !contextText
  
  // FINAL DECISION
  const SOURCES_INSUFFICIENT = baseSourcesTooWeak || needsWebForTemporal || needsWebForExplicitRequest || userWantsWebSearch
  
  const reasons: string[] = []
  if (baseSourcesTooWeak) reasons.push('Base sources too weak')
  if (needsWebForTemporal) reasons.push('Temporal query needs web search')
  if (needsWebForExplicitRequest) reasons.push('Explicit web search request')
  if (userWantsWebSearch) reasons.push('User preference for web search')
  
  return { SOURCES_INSUFFICIENT, reasons }
}

/**
 * Test una singola query
 */
async function testQuery(
  query: string, 
  webSearchEnabled: boolean,
  expectedWebSearch: boolean,
  mockSimilarity: number = 0.75
): Promise<void> {
  try {
    console.log(`\n🧪 Testing: "${query}"`)
    console.log(`   Web search enabled: ${webSearchEnabled}`)
    console.log(`   Mock similarity: ${mockSimilarity}`)
    
    const analysis = await analyzeQuery(query)
    
    console.log(`   Analysis results:`)
    console.log(`     - Intent: ${analysis.intent}`)
    console.log(`     - Temporal: ${analysis.hasTemporal} ${analysis.temporalTerms ? `(${analysis.temporalTerms.join(', ')})` : ''}`)
    console.log(`     - Web request: ${analysis.hasWebSearchRequest} ${analysis.webSearchCommand ? `("${analysis.webSearchCommand}")` : ''}`)
    console.log(`     - From cache: ${analysis.fromCache}`)
    
    const decision = simulateWebSearchDecision(analysis, webSearchEnabled, null, mockSimilarity)
    
    console.log(`   Decision: Web search ${decision.SOURCES_INSUFFICIENT ? '✅ ENABLED' : '❌ DISABLED'}`)
    if (decision.reasons.length > 0) {
      console.log(`   Reasons: ${decision.reasons.join(', ')}`)
    }
    
    const correct = decision.SOURCES_INSUFFICIENT === expectedWebSearch
    console.log(`   Expected: ${expectedWebSearch ? 'ENABLED' : 'DISABLED'} | Result: ${correct ? '✅ CORRECT' : '❌ WRONG'}`)
    
    if (!correct) {
      console.log(`   ⚠️  MISMATCH: Expected web search to be ${expectedWebSearch ? 'enabled' : 'disabled'}`)
    }
    
  } catch (error) {
    console.error(`   ❌ Error testing query: ${error}`)
  }
}

/**
 * Main test function
 */
async function runTests(): Promise<void> {
  console.log('🚀 Testing Temporal Web Search Improvements')
  console.log('=' .repeat(60))
  
  // Test 1: Query temporali con web search abilitato dovrebbero sempre usare web search
  console.log('\n📅 Test 1: Temporal queries with web search enabled')
  console.log('-'.repeat(50))
  for (const query of TEMPORAL_QUERIES) {
    await testQuery(query, true, true, 0.8) // High similarity but should still use web
  }
  
  // Test 2: Comandi espliciti dovrebbero sempre attivare web search
  console.log('\n🎯 Test 2: Explicit web search commands')
  console.log('-'.repeat(50))
  for (const query of EXPLICIT_WEB_COMMANDS) {
    await testQuery(query, true, true, 0.9) // Very high similarity but should still use web
  }
  
  // Test 3: Query normali con web search abilitato e intent generale dovrebbero usare web search
  console.log('\n🔍 Test 3: Normal queries with web search enabled')
  console.log('-'.repeat(50))
  for (const query of NORMAL_QUERIES) {
    await testQuery(query, true, true, 0.9) // High similarity, but user wants web search
  }
  
  // Test 4: Query normali con web search disabilitato NON dovrebbero usare web search se fonti buone
  console.log('\n❌ Test 4: Normal queries with web search disabled')
  console.log('-'.repeat(50))
  for (const query of NORMAL_QUERIES.slice(0, 2)) {
    await testQuery(query, false, false, 0.8) // High similarity, web disabled
  }
  
  // Test 5: Query temporali con web search disabilitato NON dovrebbero usare web search
  console.log('\n⏰ Test 5: Temporal queries with web search disabled')
  console.log('-'.repeat(50))
  for (const query of TEMPORAL_QUERIES.slice(0, 2)) {
    await testQuery(query, false, false, 0.8) // Temporal but web disabled
  }
  
  console.log('\n✅ Tests completed!')
  console.log('\nNote: This script tests the LOGIC, not the actual web search execution.')
  console.log('For integration testing, use the actual chat API with webSearchEnabled=true.')
}

// Run tests
runTests().catch(console.error)