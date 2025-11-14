/**
 * Test per la normalizzazione delle citazioni Unicode
 * Eseguire con: tsx scripts/test-unicode-citations.ts
 */

import { normalizeUnicodeCitations } from '../lib/services/citation-service'

console.log('🧪 Testing Unicode Citations Normalization\n')

const testCases = [
  {
    name: 'Citazione Unicode singola',
    input: 'Questo è un testo con una citazione 【cit:1】 nel mezzo.',
    expected: 'Questo è un testo con una citazione [cit:1] nel mezzo.',
  },
  {
    name: 'Citazione Unicode multipla',
    input: 'Prima citazione 【cit:1】 e seconda citazione 【cit:2】.',
    expected: 'Prima citazione [cit:1] e seconda citazione [cit:2].',
  },
  {
    name: 'Citazione Unicode con virgole',
    input: 'Citazione combinata 【cit:1,2,3】 nel testo.',
    expected: 'Citazione combinata [cit:1,2,3] nel testo.',
  },
  {
    name: 'Citazione web Unicode',
    input: 'Ricerca web 【web:1】 e altra ricerca 【web:2】.',
    expected: 'Ricerca web [web:1] e altra ricerca [web:2].',
  },
  {
    name: 'Mix di citazioni Unicode e standard',
    input: 'Unicode 【cit:1】 e standard [cit:2] insieme.',
    expected: 'Unicode [cit:1] e standard [cit:2] insieme.',
  },
  {
    name: 'Citazione Unicode con spazi',
    input: 'Citazione con spazi 【cit: 1, 2】 nel testo.',
    expected: 'Citazione con spazi [cit: 1, 2] nel testo.',
  },
  {
    name: 'Nessuna citazione Unicode',
    input: 'Testo normale con citazione standard [cit:1].',
    expected: 'Testo normale con citazione standard [cit:1].',
  },
]

let passed = 0
let failed = 0

testCases.forEach((testCase, index) => {
  const result = normalizeUnicodeCitations(testCase.input)
  const success = result === testCase.expected

  if (success) {
    console.log(`✅ Test ${index + 1}: ${testCase.name}`)
    passed++
  } else {
    console.log(`❌ Test ${index + 1}: ${testCase.name}`)
    console.log(`   Input:    "${testCase.input}"`)
    console.log(`   Expected: "${testCase.expected}"`)
    console.log(`   Got:      "${result}"`)
    failed++
  }
})

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)

if (failed === 0) {
  console.log('✨ All tests passed!')
  process.exit(0)
} else {
  console.log('⚠️  Some tests failed')
  process.exit(1)
}
