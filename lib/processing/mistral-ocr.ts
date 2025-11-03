/**
 * Mistral OCR integration for document processing
 * Converts PDFs and images to structured Markdown using Mistral's OCR model
 */

export interface MistralOCRResponse {
  markdown: string
  metadata: {
    pages: number
    language: string
    confidence: number
    processingTime: number
  }
}

/**
 * Processa documento con Mistral OCR
 * Converte PDF in Markdown strutturato preservando layout, tabelle e immagini
 */
export async function processWithMistralOCR(
  file: File
): Promise<MistralOCRResponse> {
  const startTime = Date.now()
  const mistralApiKey = process.env.MISTRAL_API_KEY

  if (!mistralApiKey) {
    throw new Error(
      'MISTRAL_API_KEY not configured. Set it in .env.local to use OCR processing.'
    )
  }

  try {
    console.log(`[mistral-ocr] Processing ${file.name} (${file.size} bytes)`)

    // Converti file in base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const dataUrl = `data:${file.type};base64,${base64}`

    // Chiama Mistral OCR API
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mistralApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-ocr',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Convert this document to well-structured Markdown. Follow these rules strictly:
1. Preserve all headers using # ## ### notation (based on font size and hierarchy)
2. Convert all tables to proper Markdown tables with | alignment
3. Describe all images, charts, and diagrams in detail using ![detailed description]
4. Preserve emphasis: use **bold** for strong text, *italic* for emphasis
5. Format lists properly: use - for unordered, 1. 2. 3. for ordered
6. Add section breaks (---) between major sections
7. Maintain the original language (Italian or English)
8. Keep all numerical data and statistics accurate
9. Preserve document structure: title, sections, subsections
10. For complex layouts (multi-column, sidebars), linearize logically

Return ONLY the Markdown content, no explanations or meta-commentary.`,
              },
              {
                type: 'image_url',
                image_url: dataUrl,
              },
            ],
          },
        ],
        max_tokens: 16000, // Documenti lunghi
        temperature: 0, // Deterministic per OCR
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Mistral OCR API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`
      )
    }

    const data = await response.json()

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from Mistral OCR')
    }

    const markdown = data.choices[0].message.content

    if (!markdown || markdown.trim().length === 0) {
      throw new Error('Empty response from Mistral OCR')
    }

    const processingTime = Date.now() - startTime

    console.log(
      `[mistral-ocr] Successfully processed ${file.name} in ${processingTime}ms`
    )
    console.log(
      `[mistral-ocr] Generated ${markdown.length} characters of Markdown`
    )

    return {
      markdown,
      metadata: {
        pages: estimatePages(markdown),
        language: detectLanguage(markdown),
        confidence: 0.95, // Mistral OCR è molto accurato
        processingTime,
      },
    }
  } catch (error) {
    console.error('[mistral-ocr] Processing failed:', error)

    if (error instanceof Error) {
      // Rethrow con context più chiaro
      throw new Error(`Mistral OCR failed: ${error.message}`)
    }

    throw new Error('Mistral OCR failed with unknown error')
  }
}

/**
 * Stima numero pagine dal markdown generato
 * Approssimazione: ~500 parole per pagina
 */
function estimatePages(markdown: string): number {
  const wordCount = markdown.split(/\s+/).filter((w) => w.length > 0).length
  return Math.max(1, Math.ceil(wordCount / 500))
}

/**
 * Rileva lingua predominante nel testo
 * Usa euristica semplice basata su parole comuni
 */
function detectLanguage(text: string): string {
  const lowerText = text.toLowerCase()

  // Parole comuni italiane
  const italianWords = [
    'il',
    'la',
    'di',
    'da',
    'in',
    'con',
    'per',
    'una',
    'che',
    'del',
    'della',
    'dei',
    'gli',
    'le',
    'sono',
    'è',
  ]

  // Parole comuni inglesi
  const englishWords = [
    'the',
    'of',
    'and',
    'to',
    'a',
    'in',
    'for',
    'is',
    'on',
    'that',
    'by',
    'this',
    'with',
    'from',
    'are',
    'was',
  ]

  let italianCount = 0
  let englishCount = 0

  // Conta occorrenze di parole comuni
  for (const word of italianWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    const matches = lowerText.match(regex)
    italianCount += matches ? matches.length : 0
  }

  for (const word of englishWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    const matches = lowerText.match(regex)
    englishCount += matches ? matches.length : 0
  }

  // Determina lingua predominante
  if (italianCount > englishCount * 1.2) {
    return 'it'
  } else if (englishCount > italianCount * 1.2) {
    return 'en'
  } else {
    // Default a italiano per questo progetto
    return 'it'
  }
}

