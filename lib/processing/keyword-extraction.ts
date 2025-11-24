/**
 * LLM-based Keyword Extraction Service
 * 
 * Genera keywords ottimizzate per la ricerca usando LLM.
 * Le keywords migliorano il BM25 ranking permettendo match su:
 * - Acronimi e sigle (es. CCNL, TFR, CIG)
 * - Termini tecnici e giuridici
 * - Sinonimi e varianti lessicali
 * - Concetti chiave del chunk
 */

import { compilePrompt, PROMPTS } from '@/lib/observability/prompt-manager'

export interface KeywordExtractionResult {
  keywords: string[]
  processingTime: number
  model: string
}

// Fallback system prompt (usato se Langfuse non è disponibile)
const FALLBACK_SYSTEM_PROMPT = `Sei un esperto di analisi testuale e estrazione di keywords per sistemi di ricerca full-text.

Il tuo compito è estrarre 8-15 keywords ottimali da un testo per migliorare la ricercabilità tramite BM25.

PRIORITÀ KEYWORDS:
1. Acronimi e sigle (es. CCNL, TFR, CIG, INPS)
2. Termini tecnici specifici del dominio
3. Numeri e riferimenti normativi (es. "articolo 28", "comma 3")
4. Concetti chiave e entità (es. "ferie", "malattia", "licenziamento")
5. Varianti lessicali importanti (es. "lavoratore" → "dipendente", "prestatore")

REGOLE:
- Ritorna SOLO le keywords, una per riga
- NON includere parole comuni (articoli, preposizioni, congiunzioni)
- NON includere verbi generici (essere, avere, fare, dire)
- Preferisci SOSTANTIVI e TERMINI TECNICI
- Mantieni acronimi in MAIUSCOLO
- Normalizza al singolare (es. "lavoratori" → "lavoratore")
- Includi numeri significativi (es. "28" per "articolo 28")

Esempio di output corretto:
CCNL
retribuzione
maggiorazione
festivo
straordinario
art.36`

/**
 * Estrae keywords da un chunk di testo usando LLM
 * 
 * @param content - Contenuto del chunk
 * @param context - Context opzionale (es. document title, article number)
 * @returns Array di keywords ottimizzate per la ricerca
 */
export async function extractKeywordsLLM(
  content: string,
  context?: {
    documentTitle?: string
    articleNumber?: number
    sectionTitle?: string
  }
): Promise<KeywordExtractionResult> {
  const startTime = Date.now()

  // Costruisci context string per user prompt
  const contextStr = context
    ? [
        context.documentTitle && `Documento: ${context.documentTitle}`,
        context.articleNumber && `Articolo: ${context.articleNumber}`,
        context.sectionTitle && `Sezione: ${context.sectionTitle}`,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  // Fetch system prompt from Langfuse (con fallback)
  let systemPrompt: string
  try {
    systemPrompt = await compilePrompt(
      PROMPTS.KEYWORD_EXTRACTOR,
      {}, // No variables needed for system prompt
      { 
        fallback: FALLBACK_SYSTEM_PROMPT,
        label: 'production',
      }
    )
  } catch (error) {
    console.warn('[keyword-extraction] Failed to fetch Langfuse prompt, using fallback:', error)
    systemPrompt = FALLBACK_SYSTEM_PROMPT
  }

  const userPrompt = `${contextStr ? contextStr + '\n\n' : ''}TESTO DA ANALIZZARE:
${content.slice(0, 2000)}${content.length > 2000 ? '...' : ''}

Estrai le keywords più rilevanti per la ricerca full-text.`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const data = await response.json()
    const llmResponse = data.choices[0]?.message?.content?.trim() || ''

    // Parse keywords da risposta (una per riga)
    const keywords = llmResponse
      .split('\n')
      .map((k: string) => k.trim())
      .filter((k: string) => k.length > 0 && !k.startsWith('#')) // Remove empty lines and comments
      .slice(0, 15) // Max 15 keywords

    const processingTime = Date.now() - startTime

    console.log('[keyword-extraction] Extracted keywords:', {
      count: keywords.length,
      processingTime,
      sample: keywords.slice(0, 5),
    })

    return {
      keywords,
      processingTime,
      model: 'anthropic/claude-3.5-haiku',
    }
  } catch (error) {
    console.error('[keyword-extraction] LLM extraction failed:', error)
    
    // Fallback: estrazione basata su frequenza
    const fallbackKeywords = extractKeywordsFallback(content)
    
    return {
      keywords: fallbackKeywords,
      processingTime: Date.now() - startTime,
      model: 'fallback-frequency',
    }
  }
}

/**
 * Fallback keyword extraction usando analisi frequenza
 * Usato quando LLM non è disponibile o fallisce
 */
function extractKeywordsFallback(content: string): string[] {
  // Rimuovi punteggiatura e split in parole
  const words = content
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}""''«»]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3) // Skip parole corte

  // Conta frequenze
  const frequency = new Map<string, number>()
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1)
  }

  // Stopwords italiane comuni da escludere
  const stopwords = new Set([
    'alla', 'allo', 'altri', 'altro', 'anche', 'ancora', 'anno', 'anni',
    'essere', 'avere', 'fare', 'dire', 'andare', 'venire', 'potere', 'dovere',
    'quale', 'quando', 'quanto', 'quello', 'questa', 'questo', 'questi', 'quelle',
    'dalle', 'dagli', 'dalla', 'dallo', 'della', 'delle', 'dello', 'degli',
    'nelle', 'nella', 'nello', 'negli', 'sulle', 'sulla', 'sullo', 'sugli',
    'come', 'cosa', 'dove', 'ogni', 'oltre', 'molto', 'più', 'meno',
    'prima', 'dopo', 'durante', 'contro', 'verso', 'presso',
  ])

  // Filtra e ordina per frequenza
  const keywords = Array.from(frequency.entries())
    .filter(([word]) => !stopwords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word)

  console.log('[keyword-extraction] Using fallback extraction:', {
    count: keywords.length,
    sample: keywords.slice(0, 5),
  })

  return keywords
}

/**
 * Batch keyword extraction per più chunks
 * Ottimizza le chiamate LLM processando chunks in parallelo
 */
export async function extractKeywordsBatch(
  chunks: Array<{
    content: string
    context?: {
      documentTitle?: string
      articleNumber?: number
      sectionTitle?: string
    }
  }>,
  concurrency: number = 5
): Promise<KeywordExtractionResult[]> {
  console.log('[keyword-extraction] Starting batch extraction:', {
    totalChunks: chunks.length,
    concurrency,
  })

  const results: KeywordExtractionResult[] = []

  // Process in batches
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency)
    
    const batchResults = await Promise.all(
      batch.map((chunk) => extractKeywordsLLM(chunk.content, chunk.context))
    )
    
    results.push(...batchResults)

    console.log('[keyword-extraction] Batch progress:', {
      processed: results.length,
      total: chunks.length,
      percentage: ((results.length / chunks.length) * 100).toFixed(1),
    })
  }

  return results
}
