/**
 * Test con testo lungo per verificare sentence-aware chunking
 */

import { sentenceAwareChunking } from '@/lib/processing/sentence-aware-chunking'

const LONG_TEXT = `
La cybersecurity nel 2024 rappresenta una delle sfide più critiche per le organizzazioni globali. Gli attacchi informatici sono diventati sempre più sofisticati e mirati. Le aziende devono adottare un approccio proattivo alla sicurezza. La protezione dei dati sensibili è fondamentale per mantenere la fiducia dei clienti.

Il ransomware continua a essere una minaccia significativa. Gli attaccanti utilizzano tecniche di social engineering per infiltrarsi nei sistemi. I dipendenti rappresentano spesso l'anello più debole della catena di sicurezza. La formazione continua è essenziale per ridurre il rischio di violazioni. Le simulazioni di phishing aiutano a aumentare la consapevolezza del personale.

L'intelligenza artificiale sta rivoluzionando il campo della sicurezza informatica. I sistemi di AI possono rilevare anomalie in tempo reale. Il machine learning identifica pattern di attacco prima sconosciuti. L'automazione riduce i tempi di risposta agli incidenti. Le piattaforme SIEM integrate con AI offrono una visibilità completa della rete.

La zero trust architecture è diventata lo standard de facto. Il principio "never trust, always verify" guida le moderne implementazioni di sicurezza. L'autenticazione multi-fattore è obbligatoria per tutti gli accessi. La micro-segmentazione della rete limita il movimento laterale degli attaccanti. Il monitoraggio continuo delle sessioni utente previene compromissioni.

Il cloud computing introduce nuove sfide di sicurezza. La shared responsibility model richiede una chiara definizione dei ruoli. Le configurazioni errate rappresentano il 70% delle violazioni cloud. I tool di CSPM aiutano a identificare vulnerabilità nelle configurazioni. L'encryption at rest e in transit è fondamentale per proteggere i dati.

Le normative sulla privacy stanno diventando sempre più stringenti. Il GDPR ha stabilito un precedente globale per la protezione dei dati. Le aziende devono implementare privacy by design e by default. Le violazioni dei dati comportano sanzioni severe e danni reputazionali. La conformità normativa richiede investimenti significativi in tecnologia e processi.

L'Internet of Things espande la superficie di attacco. I dispositivi IoT spesso mancano di sicurezza adeguata. Gli attaccanti sfruttano vulnerabilità nei firmware. Le botnet IoT vengono utilizzate per attacchi DDoS massicci. La segmentazione delle reti IoT è cruciale per limitare l'esposizione.

La supply chain security è una preoccupazione crescente. Gli attacchi alla catena di fornitura possono compromettere migliaia di organizzazioni. La verifica dei vendor e dei loro prodotti è essenziale. I software bill of materials (SBOM) aiutano a tracciare le dipendenze. Gli aggiornamenti di sicurezza devono essere applicati tempestivamente.

Il quantum computing rappresenta sia un'opportunità che una minaccia. Gli algoritmi di crittografia attuali potrebbero diventare obsoleti. Le organizzazioni devono prepararsi alla transizione verso la crittografia post-quantum. La standardizzazione degli algoritmi resistenti al quantum è in corso. L'adozione anticipata offre un vantaggio competitivo.

La security operations center (SOC) moderna è altamente automatizzata. Gli analisti utilizzano playbook per rispondere agli incidenti. L'orchestrazione delle risposte riduce i tempi di remediation. Le threat intelligence feed forniscono contesto sugli attacchi. La collaboration tra team di sicurezza migliora l'efficacia complessiva.

In conclusione, la sicurezza informatica richiede un approccio olistico e continuativo. Le organizzazioni devono investire in tecnologia, processi e persone. La resilienza cyber è un fattore critico di successo nel business moderno. La preparazione e la risposta rapida agli incidenti fanno la differenza tra una minaccia gestita e un disastro aziendale.
`.trim()

async function testLongText() {
  console.log('🧪 Test: Sentence-Aware Chunking con Testo Lungo\n')
  console.log('=' .repeat(80))
  console.log(`📄 Testo: ${LONG_TEXT.length} caratteri, ~${Math.round(LONG_TEXT.length / 4)} token approssimativi\n`)

  const start = Date.now()
  const chunks = await sentenceAwareChunking(LONG_TEXT, {
    targetTokens: 350,
    maxTokens: 450,
    minTokens: 200,
    preserveStructure: false,
    format: 'plain',
  })
  const time = Date.now() - start

  console.log('📊 Statistiche Chunks')
  console.log('-'.repeat(80))
  console.log(`✓ Chunks creati: ${chunks.length}`)
  console.log(`✓ Tempo: ${time}ms`)
  console.log(`✓ Avg tokens: ${Math.round(chunks.reduce((s, c) => s + c.metadata.tokenCount, 0) / chunks.length)}`)
  console.log(`✓ Avg sentences: ${Math.round(chunks.reduce((s, c) => s + c.metadata.sentenceCount, 0) / chunks.length)}`)
  console.log(`✓ Min tokens: ${Math.min(...chunks.map(c => c.metadata.tokenCount))}`)
  console.log(`✓ Max tokens: ${Math.max(...chunks.map(c => c.metadata.tokenCount))}`)
  console.log(`✓ Chunks con overlap: ${chunks.filter(c => c.metadata.hasOverlap).length}`)

  console.log('\n📝 Dettagli Chunks:')
  console.log('-'.repeat(80))
  chunks.forEach((chunk, i) => {
    const overlap = chunk.metadata.hasOverlap ? '🔗' : '  '
    const tokens = String(chunk.metadata.tokenCount).padStart(3, ' ')
    const sentences = String(chunk.metadata.sentenceCount).padStart(2, ' ')
    console.log(`${overlap}[${i}] ${tokens} tokens, ${sentences} sentences`)
    console.log(`    "${chunk.content.slice(0, 120).replace(/\n/g, ' ')}..."`)
    console.log()
  })

  // Verifica qualità
  console.log('✅ Verifica Qualità:')
  console.log('-'.repeat(80))
  
  const tokensInRange = chunks.filter(c => c.metadata.tokenCount >= 200 && c.metadata.tokenCount <= 450).length
  const percentageInRange = Math.round((tokensInRange / chunks.length) * 100)
  
  console.log(`✓ Chunks nel range target (200-450): ${tokensInRange}/${chunks.length} (${percentageInRange}%)`)
  console.log(`✓ Tutti i chunks terminano con punteggiatura: ${chunks.every(c => /[.!?]$/.test(c.content.trim())) ? '✅' : '❌'}`)
  console.log(`✓ Nessun chunk vuoto: ${chunks.every(c => c.content.trim().length > 0) ? '✅' : '❌'}`)
  
  const avgTokens = chunks.reduce((s, c) => s + c.metadata.tokenCount, 0) / chunks.length
  console.log(`✓ Media vicina al target (350): ${Math.abs(avgTokens - 350) < 100 ? '✅' : '⚠️'} (${Math.round(avgTokens)} vs 350)`)

  console.log('\n✅ Test completato!')
  console.log('=' .repeat(80))
}

testLongText().catch((error) => {
  console.error('❌ Errore:', error)
  process.exit(1)
})

