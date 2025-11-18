#!/usr/bin/env tsx
/**
 * E2E Test: Web Search Flow
 * 
 * Verifica l'intero flusso di ricerca web:
 * 1. Decision logic in response-handler identifica sourcesInsufficient
 * 2. System prompt include istruzioni web search
 * 3. Agent chiama web_search tool
 * 4. Tool results vengono catturati
 * 5. Citations vengono processate correttamente
 * 
 * Questo test aiuta a diagnosticare perché il web_search tool
 * potrebbe non essere chiamato anche quando SOURCES_INSUFFICIENT=true
 */

import { analyzeQuery } from '../../lib/embeddings/query-analysis'
import { getRagAgentForModel, clearToolResults, getWebSearchResults } from '../../lib/mastra/agent'
import { buildSystemPrompt } from '../../lib/llm/system-prompt'
import { DEFAULT_FLASH_MODEL } from '../../lib/llm/models'

interface TestCase {
  name: string
  query: string
  expectedSourcesInsufficient: boolean
  expectedWebSearch: boolean
  expectedIntent: string
  mockAvgSimilarity: number
}

const TEST_CASES: TestCase[] = [
  {
    name: 'Query general con fonti insufficienti',
    query: 'chi era Carlo Magno?',
    expectedSourcesInsufficient: true,
    expectedWebSearch: true,
    expectedIntent: 'general',
    mockAvgSimilarity: 0.244,
  },
  {
    name: 'Query temporale con web search',
    query: 'quali sono le ultime normative in ambito LCA?',
    expectedSourcesInsufficient: true,
    expectedWebSearch: true,
    expectedIntent: 'timeline',
    mockAvgSimilarity: 0.8, // Anche con alta similarità, temporale forza web
  },
  {
    name: 'Query con comando esplicito web',
    query: 'vai su web e cerca informazioni sul GDPR',
    expectedSourcesInsufficient: true,
    expectedWebSearch: true,
    expectedIntent: 'general',
    mockAvgSimilarity: 0.9, // Anche con ottima similarità, comando esplicito forza web
  },
  {
    name: 'Query con fonti sufficienti',
    query: 'cos\'è il GDPR?',
    expectedSourcesInsufficient: false,
    expectedWebSearch: false,
    expectedIntent: 'general',
    mockAvgSimilarity: 0.85,
  },
]

/**
 * Simula la decision logic di response-handler
 */
function simulateDecisionLogic(
  analysis: Awaited<ReturnType<typeof analyzeQuery>>,
  avgSimilarity: number,
  webSearchEnabled: boolean
): {
  sourcesInsufficient: boolean
  reasons: string[]
} {
  const relevantResultsCount = avgSimilarity > 0.5 ? (avgSimilarity > 0.7 ? 5 : 3) : (avgSimilarity > 0.3 ? 2 : 0)
  
  // BASE LOGIC
  const baseSourcesTooWeak = relevantResultsCount === 0 || 
    (relevantResultsCount < 3 && avgSimilarity < 0.55) ||
    (relevantResultsCount >= 3 && avgSimilarity < 0.50)
  
  // OVERRIDES
  const needsWebForTemporal = webSearchEnabled && (analysis.hasTemporal || false)
  const needsWebForExplicitRequest = webSearchEnabled && (analysis.hasWebSearchRequest || false)
  const userWantsWebSearch = webSearchEnabled && analysis.intent === 'general' && !baseSourcesTooWeak
  
  const sourcesInsufficient = baseSourcesTooWeak || needsWebForTemporal || needsWebForExplicitRequest || userWantsWebSearch
  
  const reasons: string[] = []
  if (baseSourcesTooWeak) reasons.push('Base sources too weak')
  if (needsWebForTemporal) reasons.push('Temporal query needs web search')
  if (needsWebForExplicitRequest) reasons.push('Explicit web search request')
  if (userWantsWebSearch) reasons.push('User preference for web search')
  
  return { sourcesInsufficient, reasons }
}

/**
 * Test decision logic
 */
async function testDecisionLogic(testCase: TestCase): Promise<boolean> {
  console.log(`\n📋 Testing decision logic: ${testCase.name}`)
  console.log(`   Query: "${testCase.query}"`)
  
  const analysis = await analyzeQuery(testCase.query)
  const decision = simulateDecisionLogic(analysis, testCase.mockAvgSimilarity, true)
  
  console.log(`   Analysis:`)
  console.log(`     - Intent: ${analysis.intent}`)
  console.log(`     - Temporal: ${analysis.hasTemporal || false}`)
  console.log(`     - Web request: ${analysis.hasWebSearchRequest || false}`)
  console.log(`   Decision:`)
  console.log(`     - Sources insufficient: ${decision.sourcesInsufficient}`)
  console.log(`     - Reasons: ${decision.reasons.join(', ') || 'none'}`)
  
  const passed = decision.sourcesInsufficient === testCase.expectedSourcesInsufficient
  console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`)
  
  if (!passed) {
    console.log(`   Expected sourcesInsufficient: ${testCase.expectedSourcesInsufficient}`)
    console.log(`   Got: ${decision.sourcesInsufficient}`)
  }
  
  return passed
}

/**
 * Test system prompt generation
 */
async function testSystemPromptGeneration(testCase: TestCase): Promise<boolean> {
  console.log(`\n📝 Testing system prompt: ${testCase.name}`)
  
  const analysis = await analyzeQuery(testCase.query)
  const decision = simulateDecisionLogic(analysis, testCase.mockAvgSimilarity, true)
  
  const promptResult = await buildSystemPrompt({
    hasContext: false,
    webSearchEnabled: true,
    sourcesInsufficient: decision.sourcesInsufficient,
    avgSimilarity: testCase.mockAvgSimilarity,
    isMetaQuery: false,
  })
  
  const hasWebSearchInstruction = promptResult.text.includes('DEVI usare il tool web_search')
  const expectedHasInstruction = testCase.expectedWebSearch
  
  console.log(`   System prompt includes web search instruction: ${hasWebSearchInstruction}`)
  console.log(`   Expected: ${expectedHasInstruction}`)
  
  const passed = hasWebSearchInstruction === expectedHasInstruction
  console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`)
  
  if (!passed) {
    console.log(`   Prompt excerpt:`)
    const lines = promptResult.text.split('\n')
    const webSearchLines = lines.filter(line => line.includes('web_search') || line.includes('RICERCA WEB'))
    console.log(`   ${webSearchLines.join('\n   ')}`)
  }
  
  return passed
}

/**
 * Test agent configuration
 */
async function testAgentConfiguration(testCase: TestCase): Promise<boolean> {
  console.log(`\n🤖 Testing agent configuration: ${testCase.name}`)
  
  const agent = getRagAgentForModel(DEFAULT_FLASH_MODEL, true)
  
  console.log(`   Agent name: ${agent.name}`)
  console.log(`   Agent model: ${agent.model}`)
  console.log(`   Tools count: ${Object.keys(agent.tools || {}).length}`)
  
  const hasWebSearchTool = agent.tools && 'web_search' in agent.tools
  console.log(`   Has web_search tool: ${hasWebSearchTool}`)
  
  const passed = hasWebSearchTool === true
  console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`)
  
  if (!passed) {
    console.log(`   Available tools: ${Object.keys(agent.tools || {}).join(', ')}`)
  }
  
  return passed
}

/**
 * Test agent tool invocation (LIVE TEST)
 * WARNING: This makes real API calls to OpenRouter and Tavily
 */
async function testAgentToolInvocation(testCase: TestCase): Promise<boolean> {
  console.log(`\n🔄 Testing agent tool invocation (LIVE): ${testCase.name}`)
  console.log(`   ⚠️  This test makes real API calls`)
  
  if (!testCase.expectedWebSearch) {
    console.log(`   Skipping: Test case does not expect web search`)
    return true
  }
  
  try {
    const analysis = await analyzeQuery(testCase.query)
    const decision = simulateDecisionLogic(analysis, testCase.mockAvgSimilarity, true)
    
    const promptResult = await buildSystemPrompt({
      hasContext: false,
      webSearchEnabled: true,
      sourcesInsufficient: decision.sourcesInsufficient,
      avgSimilarity: testCase.mockAvgSimilarity,
      isMetaQuery: false,
    })
    
    const agent = getRagAgentForModel(DEFAULT_FLASH_MODEL, true)
    
    // Clear cache before test
    clearToolResults()
    
    const messages = [
      {
        role: 'system' as const,
        content: promptResult.text,
      },
      {
        role: 'user' as const,
        content: testCase.query,
      },
    ]
    
    console.log(`   Executing agent.stream()...`)
    const startTime = Date.now()
    
    // Stream the response
    let fullResponse = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await agent.stream(messages as any)
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const chunk of stream as any) {
      if (chunk.type === 'text') {
        fullResponse += chunk.text || ''
      }
      
      // Log tool calls
      if (chunk.type === 'tool-call') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log(`   Tool called: ${(chunk as any).toolName}`)
      }
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`   Agent execution completed in ${elapsedTime}s`)
    console.log(`   Response length: ${fullResponse.length} chars`)
    
    // Check if web search was called
    const webResults = getWebSearchResults()
    const webSearchWasCalled = webResults.length > 0
    
    console.log(`   Web search tool called: ${webSearchWasCalled}`)
    console.log(`   Web results count: ${webResults.length}`)
    
    const passed = webSearchWasCalled === testCase.expectedWebSearch
    console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`)
    
    if (!passed) {
      console.log(`   Expected web search to be called: ${testCase.expectedWebSearch}`)
      console.log(`   Actual: ${webSearchWasCalled}`)
      console.log(`   Response preview: ${fullResponse.substring(0, 200)}...`)
    }
    
    return passed
    
  } catch (error) {
    console.error(`   ❌ ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return false
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log('🚀 E2E Test: Web Search Flow')
  console.log('='.repeat(60))
  console.log('Testing the complete web search flow from decision to tool invocation')
  console.log('')
  
  let totalTests = 0
  let passedTests = 0
  
  // Test 1: Decision Logic
  console.log('\n📊 PHASE 1: Decision Logic Tests')
  console.log('-'.repeat(60))
  for (const testCase of TEST_CASES) {
    totalTests++
    const passed = await testDecisionLogic(testCase)
    if (passed) passedTests++
  }
  
  // Test 2: System Prompt Generation
  console.log('\n📊 PHASE 2: System Prompt Generation Tests')
  console.log('-'.repeat(60))
  for (const testCase of TEST_CASES) {
    totalTests++
    const passed = await testSystemPromptGeneration(testCase)
    if (passed) passedTests++
  }
  
  // Test 3: Agent Configuration
  console.log('\n📊 PHASE 3: Agent Configuration Tests')
  console.log('-'.repeat(60))
  for (const testCase of TEST_CASES.slice(0, 1)) { // Test once
    totalTests++
    const passed = await testAgentConfiguration(testCase)
    if (passed) passedTests++
  }
  
  // Test 4: Agent Tool Invocation (LIVE)
  console.log('\n📊 PHASE 4: Agent Tool Invocation Tests (LIVE)')
  console.log('-'.repeat(60))
  console.log('⚠️  WARNING: These tests make real API calls to OpenRouter and Tavily')
  console.log('⚠️  Set SKIP_LIVE_TESTS=true to skip these tests')
  console.log('')
  
  if (process.env.SKIP_LIVE_TESTS !== 'true') {
    // Test only the first case to avoid excessive API costs
    const liveTestCase = TEST_CASES[0]
    totalTests++
    const passed = await testAgentToolInvocation(liveTestCase)
    if (passed) passedTests++
  } else {
    console.log('   Skipping live tests (SKIP_LIVE_TESTS=true)')
  }
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary')
  console.log('='.repeat(60))
  console.log(`Total tests: ${totalTests}`)
  console.log(`Passed: ${passedTests}`)
  console.log(`Failed: ${totalTests - passedTests}`)
  console.log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`)
  console.log('')
  
  if (passedTests === totalTests) {
    console.log('✅ All tests passed!')
  } else {
    console.log('❌ Some tests failed. See details above.')
    process.exit(1)
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
