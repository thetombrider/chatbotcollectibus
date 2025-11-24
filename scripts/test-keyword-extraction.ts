/**
 * Test Keyword Extraction
 * 
 * Valida l'estrazione LLM di keywords per BM25 search
 */

import { extractKeywordsLLM, extractKeywordsBatch } from '../lib/processing/keyword-extraction'

// Sample chunks from legal/employment documents
const testChunks = [
  {
    content: `Art. 28 - Orario di lavoro
L'orario normale di lavoro è fissato in 40 ore settimanali distribuite su 5 giorni lavorativi.
Il dipendente ha diritto a pause regolari come previsto dal CCNL vigente.`,
    context: {
      documentTitle: 'CCNL Commercio 2024',
      articleNumber: 28,
      sectionTitle: 'Orario di lavoro',
    },
  },
  {
    content: `Il trattamento di fine rapporto (TFR) è la somma accantonata dal datore di lavoro
per ogni anno di servizio del dipendente. L'importo viene calcolato dividendo la retribuzione
annua per 13,5 e viene erogato alla cessazione del rapporto di lavoro.`,
    context: {
      documentTitle: 'Guida al TFR',
    },
  },
  {
    content: `In caso di malattia, il lavoratore è tenuto a comunicare immediatamente l'assenza
e inviare il certificato medico entro 2 giorni dall'inizio dell'assenza. Il certificato
può essere trasmesso telematicamente tramite il portale INPS.`,
    context: {
      documentTitle: 'Procedura assenze per malattia',
      sectionTitle: 'Obblighi del lavoratore',
    },
  },
  {
    content: `Le ferie annuali sono stabilite in 26 giorni lavorativi per anno di servizio.
Il periodo feriale deve essere concordato tra datore e lavoratore, con preavviso
di almeno 15 giorni. È prevista la possibilità di frazionamento del periodo feriale.`,
    context: {
      documentTitle: 'Normativa ferie e permessi',
      articleNumber: 15,
    },
  },
  {
    content: `Il lavoro straordinario è quello effettuato oltre l'orario normale di lavoro.
La maggiorazione per lavoro straordinario feriale è del 25%, mentre per lavoro
festivo o notturno la maggiorazione sale al 50% della retribuzione oraria.`,
    context: {
      documentTitle: 'Retribuzione straordinari',
      sectionTitle: 'Maggiorazioni',
    },
  },
]

async function testKeywordExtraction() {
  console.log('=== Keyword Extraction Test ===\n')

  // Test singolo chunk
  console.log('--- Test 1: Single chunk extraction ---')
  const singleResult = await extractKeywordsLLM(
    testChunks[0].content,
    testChunks[0].context
  )

  console.log('Input content:')
  console.log(testChunks[0].content.slice(0, 150) + '...')
  console.log('\nExtracted keywords:')
  console.log(singleResult.keywords.join(', '))
  console.log(`\nModel: ${singleResult.model}`)
  console.log(`Processing time: ${singleResult.processingTime}ms`)

  // Test batch extraction
  console.log('\n\n--- Test 2: Batch extraction (5 chunks, concurrency 3) ---')
  const startTime = Date.now()
  
  const batchResults = await extractKeywordsBatch(testChunks, 3)
  
  const totalTime = Date.now() - startTime
  const avgTime = totalTime / testChunks.length

  console.log(`\nTotal processing time: ${totalTime}ms`)
  console.log(`Average per chunk: ${avgTime.toFixed(0)}ms`)
  console.log(`Total keywords extracted: ${batchResults.reduce((sum, r) => sum + r.keywords.length, 0)}`)

  // Analizza qualità keywords
  console.log('\n--- Test 3: Keyword quality analysis ---')
  
  batchResults.forEach((result, idx) => {
    const chunk = testChunks[idx]
    console.log(`\nChunk ${idx + 1}: ${chunk.context?.documentTitle || 'Unknown'}`)
    
    // Conta acronimi (all uppercase, 2-5 lettere)
    const acronyms = result.keywords.filter(k => 
      k.length >= 2 && k.length <= 5 && k === k.toUpperCase()
    )
    
    // Conta numeri
    const numbers = result.keywords.filter(k => /^\d+$/.test(k))
    
    // Conta termini tecnici (lunghezza > 5)
    const technical = result.keywords.filter(k => k.length > 5)
    
    console.log(`  Keywords: ${result.keywords.join(', ')}`)
    console.log(`  Stats: ${result.keywords.length} total, ${acronyms.length} acronyms, ${numbers.length} numbers, ${technical.length} technical terms`)
    console.log(`  Model: ${result.model}`)
    
    // Check coverage: keywords presenti nel content
    const inContent = result.keywords.filter(k => 
      chunk.content.toLowerCase().includes(k.toLowerCase())
    )
    const coverage = (inContent.length / result.keywords.length) * 100
    console.log(`  Coverage: ${coverage.toFixed(0)}% (${inContent.length}/${result.keywords.length} found in content)`)
  })

  // Test fallback
  console.log('\n\n--- Test 4: Fallback extraction (simulating LLM failure) ---')
  
  // Temporarily break OPENROUTER_API_KEY to trigger fallback
  const originalKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'invalid_key_for_testing'
  
  try {
    const fallbackResult = await extractKeywordsLLM(testChunks[0].content)
    
    console.log('Fallback keywords:')
    console.log(fallbackResult.keywords.join(', '))
    console.log(`Model: ${fallbackResult.model} (should be "fallback-frequency")`)
  } catch (error) {
    console.error('❌ Fallback test failed:', error)
  } finally {
    // Restore original key
    process.env.OPENROUTER_API_KEY = originalKey
  }

  // Recommendations
  console.log('\n\n=== Recommendations ===')
  const avgKeywords = batchResults.reduce((sum, r) => sum + r.keywords.length, 0) / batchResults.length
  
  console.log(`✓ Average keywords per chunk: ${avgKeywords.toFixed(1)}`)
  
  if (avgKeywords < 5) {
    console.log('⚠️  Consider increasing keyword count (target: 8-15)')
  } else if (avgKeywords > 15) {
    console.log('⚠️  Too many keywords may dilute BM25 effectiveness')
  } else {
    console.log('✓ Keyword count is optimal for BM25')
  }

  const llmUsed = batchResults.filter(r => r.model.includes('claude')).length
  console.log(`✓ LLM success rate: ${(llmUsed / batchResults.length * 100).toFixed(0)}%`)
}

// Run test
testKeywordExtraction()
  .then(() => {
    console.log('\n✅ Keyword extraction test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  })
