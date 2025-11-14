/**
 * Test script for thematic meta query detection
 * 
 * Tests the new isThematicMetaQuery() function to ensure it correctly
 * distinguishes between:
 * - Thematic queries (search by content): "documenti su salute e sicurezza"
 * - Structural queries (search by metadata): "quanti documenti ci sono"
 */

// Test queries
const testQueries = [
  // === THEMATIC queries (should return TRUE) ===
  {
    query: 'indicami i nomi dei documenti presenti nella KB che trattano di salute e sicurezza',
    expected: true,
    description: 'Original problem query - thematic'
  },
  {
    query: 'documenti che parlano di GDPR',
    expected: true,
    description: 'Simple thematic query'
  },
  {
    query: 'norme su sostenibilità ambientale',
    expected: true,
    description: 'Thematic with "su" keyword'
  },
  {
    query: 'file che trattano di privacy',
    expected: true,
    description: 'Thematic with "trattano di"'
  },
  {
    query: 'documenti about ESG reporting',
    expected: true,
    description: 'English thematic query'
  },
  {
    query: 'che documenti ci sono sul tema della compliance',
    expected: true,
    description: 'Thematic with "tema"'
  },
  {
    query: 'norme in materia di cybersecurity',
    expected: true,
    description: 'Thematic with "in materia di"'
  },
  
  // === STRUCTURAL queries (should return FALSE) ===
  {
    query: 'quanti documenti ci sono',
    expected: false,
    description: 'Count query - structural'
  },
  {
    query: 'quali cartelle esistono',
    expected: false,
    description: 'Folders list - structural'
  },
  {
    query: 'documenti nella cartella GRI',
    expected: false,
    description: 'Folder filter - structural'
  },
  {
    query: 'file nella cartella Codice di Condotta',
    expected: false,
    description: 'Another folder filter - structural'
  },
  {
    query: 'tipi di file presenti nel database',
    expected: false,
    description: 'File types - structural'
  },
  {
    query: 'statistiche sui documenti',
    expected: false,
    description: 'Statistics - structural'
  },
  {
    query: 'elenca tutti i documenti',
    expected: false,
    description: 'List all - structural (no thematic filter)'
  },
  
  // === EDGE CASES ===
  {
    query: 'quanti documenti ci sono che trattano di GDPR',
    expected: false, // Structural takes precedence (asks for count)
    description: 'Mixed: count + thematic (should prioritize structural)'
  },
]

// Copy the isThematicMetaQuery function here for testing
function isThematicMetaQuery(query: string): boolean {
  const queryLower = query.toLowerCase()
  
  // Structural indicators (ask about DB structure, not content)
  // These take PRIORITY - if query asks for count/stats/folders, it's structural even with thematic terms
  const strongStructuralPatterns = [
    /\b(quanti|how many|numero di|count)\b/i,
    /\b(quali cartelle|which folders|folder names|cartelle presenti)\b/i,
    /\b(tipi di file|file types|formati|formats)\b/i,
    /\b(statistiche|statistics|stats)\b/i,
  ]
  
  // Check if query has strong structural indicators
  for (const pattern of strongStructuralPatterns) {
    if (pattern.test(query)) {
      console.log('[test] Strong structural indicator found, treating as structural query')
      return false // Structural takes priority
    }
  }
  
  // Thematic indicators (search by content/topic)
  const thematicPatterns = [
    /\b(tratta(no)?|parla(no)?|riguarda(no)?|su|about|on|concerning|regarding)\s+(di\s+)?[a-zàèéìòù\s]+/i,
    /\b(che tratta(no)?|che parla(no)?|che riguarda(no)?|related to|about)\b/i,
    /\b(tema|topic|argomento|subject|materia)\b/i,
    /\b(in materia di|on the topic of|regarding)\b/i,
  ]
  
  // If query has thematic indicators, it's thematic
  for (const pattern of thematicPatterns) {
    if (pattern.test(query)) {
      console.log('[test] Detected thematic meta query:', query.substring(0, 80))
      return true
    }
  }
  
  // Special case: "documenti nella cartella X" is structural (filters by folder)
  // But "documenti su X" is thematic (filters by content)
  if (queryLower.includes('nella cartella') || queryLower.includes('in folder') || queryLower.includes('nella ')) {
    return false
  }
  
  // Default: if asking for "documenti"/"norme" without structural filters, check for topics
  // If query has specific domain terms (not folder/file names), it's likely thematic
  const hasDomainTerms = /\b(gdpr|espr|sostenibilità|ambiente|salute|sicurezza|privacy|compliance|esg|gri|csrd)\b/i.test(query)
  
  return hasDomainTerms
}

// Run tests
console.log('='.repeat(80))
console.log('THEMATIC META QUERY DETECTION TEST')
console.log('='.repeat(80))
console.log()

let passed = 0
let failed = 0

for (const test of testQueries) {
  const result = isThematicMetaQuery(test.query)
  const status = result === test.expected ? '✅ PASS' : '❌ FAIL'
  
  if (result === test.expected) {
    passed++
  } else {
    failed++
  }
  
  console.log(`${status} | ${test.description}`)
  console.log(`  Query: "${test.query}"`)
  console.log(`  Expected: ${test.expected ? 'THEMATIC' : 'STRUCTURAL'} | Got: ${result ? 'THEMATIC' : 'STRUCTURAL'}`)
  console.log()
}

console.log('='.repeat(80))
console.log(`RESULTS: ${passed} passed, ${failed} failed (${testQueries.length} total)`)
console.log('='.repeat(80))

if (failed > 0) {
  process.exit(1)
}
