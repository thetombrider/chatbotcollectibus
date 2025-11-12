#!/usr/bin/env tsx
/**
 * Test script per verificare il rilevamento delle query temporali (solo parte regex, senza LLM)
 * 
 * Questo script testa le funzioni di rilevamento regex senza richiedere connessioni esterne
 */

// Mock delle funzioni di rilevamento dal query-analysis.ts
function detectTemporalTerms(query: string): { hasTemporal: boolean; temporalTerms: string[] } {
  const temporalPatterns = [
    /\b(?:ultime|ultimissime|recenti|recentissime|nuove|aggiornate|aggiornamenti|novità)\b/gi,
    /\b(?:latest|recent|new|updated|newest|current|up-to-date)\b/gi,
    /\b(?:quest'anno|anno corrente|del 2024|del 2025|di recente|negli ultimi)\b/gi,
    /\b(?:da poco|di recente|attualmente|oggi|ora|adesso)\b/gi,
    /(?:che novità|ci sono novità|cosa c'è di nuovo|news)/gi,
  ]
  
  const foundTerms: string[] = []
  
  for (const pattern of temporalPatterns) {
    const matches = query.matchAll(pattern)
    for (const match of matches) {
      if (match[0] && !foundTerms.includes(match[0].toLowerCase())) {
        foundTerms.push(match[0].toLowerCase())
      }
    }
  }
  
  return {
    hasTemporal: foundTerms.length > 0,
    temporalTerms: foundTerms,
  }
}

function detectWebSearchCommand(query: string): { hasWebSearchRequest: boolean; webSearchCommand?: string } {
  const webSearchPatterns = [
    /\b(?:vai su web|cerca su internet|ricerca su internet|ricerca online|cerca online|guarda su internet)\b/gi,
    /\b(?:search the web|go online|check online|look online|web search)\b/gi,
    /\b(?:cerca informazioni aggiornate|cerca info recenti|verifica online)\b/gi,
    /\b(?:controlla su internet|vedi se ci sono novità|cerca novità)\b/gi,
  ]
  
  for (const pattern of webSearchPatterns) {
    const match = query.match(pattern)
    if (match) {
      return {
        hasWebSearchRequest: true,
        webSearchCommand: match[0],
      }
    }
  }
  
  return {
    hasWebSearchRequest: false,
  }
}

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
  'che novità ci sono?',
  'info aggiornate sulla privacy',
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
  'cerca informazioni aggiornate online',
  'verifica online le nuove regole',
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
  'come funziona la LCA?',
]

/**
 * Test una singola query per rilevamento temporale
 */
function testTemporalDetection(query: string, expectedTemporal: boolean): void {
  console.log(`\n🕒 Testing temporal: "${query}"`)
  
  const detection = detectTemporalTerms(query)
  
  console.log(`   Temporal detected: ${detection.hasTemporal}`)
  if (detection.temporalTerms.length > 0) {
    console.log(`   Terms found: ${detection.temporalTerms.join(', ')}`)
  }
  
  const correct = detection.hasTemporal === expectedTemporal
  console.log(`   Expected: ${expectedTemporal} | Result: ${correct ? '✅ CORRECT' : '❌ WRONG'}`)
  
  if (!correct) {
    console.log(`   ⚠️  MISMATCH: Expected temporal detection to be ${expectedTemporal}`)
  }
}

/**
 * Test una singola query per rilevamento comando web
 */
function testWebCommandDetection(query: string, expectedWebCommand: boolean): void {
  console.log(`\n🌐 Testing web command: "${query}"`)
  
  const detection = detectWebSearchCommand(query)
  
  console.log(`   Web command detected: ${detection.hasWebSearchRequest}`)
  if (detection.webSearchCommand) {
    console.log(`   Command found: "${detection.webSearchCommand}"`)
  }
  
  const correct = detection.hasWebSearchRequest === expectedWebCommand
  console.log(`   Expected: ${expectedWebCommand} | Result: ${correct ? '✅ CORRECT' : '❌ WRONG'}`)
  
  if (!correct) {
    console.log(`   ⚠️  MISMATCH: Expected web command detection to be ${expectedWebCommand}`)
  }
}

/**
 * Simula la logica di decision del response-handler
 */
function simulateWebSearchDecision(
  hasTemporal: boolean,
  hasWebSearchRequest: boolean,
  webSearchEnabled: boolean,
  intent: string,
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
  const needsWebForTemporal = webSearchEnabled && hasTemporal
  
  // EXPLICIT OVERRIDE: Utente ha chiesto esplicitamente ricerca web
  const needsWebForExplicitRequest = webSearchEnabled && hasWebSearchRequest
  
  // USER PREFERENCE OVERRIDE: Utente ha attivato ricerca web e dovrebbe avere precedenza per query generiche
  const userWantsWebSearch = webSearchEnabled && intent === 'general' && !contextText
  
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
 * Test completo con decision logic
 */
function testCompleteLogic(
  query: string,
  webSearchEnabled: boolean,
  expectedWebSearch: boolean,
  mockSimilarity: number = 0.75
): void {
  console.log(`\n🧪 Testing complete logic: "${query}"`)
  console.log(`   Web search enabled: ${webSearchEnabled}`)
  console.log(`   Mock similarity: ${mockSimilarity}`)
  
  const temporalDetection = detectTemporalTerms(query)
  const webCommandDetection = detectWebSearchCommand(query)
  
  // Mock intent (semplificato)
  const intent = temporalDetection.hasTemporal ? 'timeline' : 'general'
  
  console.log(`   Analysis results:`)
  console.log(`     - Intent: ${intent}`)
  console.log(`     - Temporal: ${temporalDetection.hasTemporal} ${temporalDetection.temporalTerms.length > 0 ? `(${temporalDetection.temporalTerms.join(', ')})` : ''}`)
  console.log(`     - Web request: ${webCommandDetection.hasWebSearchRequest} ${webCommandDetection.webSearchCommand ? `("${webCommandDetection.webSearchCommand}")` : ''}`)
  
  const decision = simulateWebSearchDecision(
    temporalDetection.hasTemporal,
    webCommandDetection.hasWebSearchRequest,
    webSearchEnabled,
    intent,
    null, // No context
    mockSimilarity
  )
  
  console.log(`   Decision: Web search ${decision.SOURCES_INSUFFICIENT ? '✅ ENABLED' : '❌ DISABLED'}`)
  if (decision.reasons.length > 0) {
    console.log(`   Reasons: ${decision.reasons.join(', ')}`)
  }
  
  const correct = decision.SOURCES_INSUFFICIENT === expectedWebSearch
  console.log(`   Expected: ${expectedWebSearch ? 'ENABLED' : 'DISABLED'} | Result: ${correct ? '✅ CORRECT' : '❌ WRONG'}`)
  
  if (!correct) {
    console.log(`   ⚠️  MISMATCH: Expected web search to be ${expectedWebSearch ? 'enabled' : 'disabled'}`)
  }
}

/**
 * Main test function
 */
function runTests(): void {
  console.log('🚀 Testing Temporal Web Search Detection (Regex Only)')
  console.log('=' .repeat(60))
  
  // Test 1: Rilevamento termini temporali
  console.log('\n📅 Test 1: Temporal terms detection')
  console.log('-'.repeat(50))
  for (const query of TEMPORAL_QUERIES) {
    testTemporalDetection(query, true)
  }
  
  for (const query of NORMAL_QUERIES.slice(0, 3)) {
    testTemporalDetection(query, false)
  }
  
  // Test 2: Rilevamento comandi web espliciti
  console.log('\n🎯 Test 2: Web command detection')
  console.log('-'.repeat(50))
  for (const query of EXPLICIT_WEB_COMMANDS) {
    testWebCommandDetection(query, true)
  }
  
  for (const query of NORMAL_QUERIES.slice(0, 3)) {
    testWebCommandDetection(query, false)
  }
  
  // Test 3: Logic completa - Query temporali con web search abilitato
  console.log('\n🔄 Test 3: Complete logic - Temporal queries with web enabled')
  console.log('-'.repeat(50))
  for (const query of TEMPORAL_QUERIES.slice(0, 3)) {
    testCompleteLogic(query, true, true, 0.8) // High similarity but should still use web
  }
  
  // Test 4: Logic completa - Comandi espliciti
  console.log('\n🔄 Test 4: Complete logic - Explicit web commands')
  console.log('-'.repeat(50))
  for (const query of EXPLICIT_WEB_COMMANDS.slice(0, 3)) {
    testCompleteLogic(query, true, true, 0.9) // Very high similarity but should still use web
  }
  
  // Test 5: Logic completa - Query normali con web disabilitato
  console.log('\n🔄 Test 5: Complete logic - Normal queries with web disabled')
  console.log('-'.repeat(50))
  for (const query of NORMAL_QUERIES.slice(0, 2)) {
    testCompleteLogic(query, false, false, 0.8) // High similarity, web disabled
  }
  
  console.log('\n✅ Tests completed!')
  console.log('\nNote: This script tests the REGEX DETECTION LOGIC only.')
  console.log('For complete testing including LLM analysis, ensure proper environment setup.')
}

// Run tests
runTests()