/**
 * Mistral Document AI integration for document processing
 * Converts PDFs and images to structured Markdown using Mistral's Document AI OCR
 * Uses official @mistralai/mistralai SDK
 */

import { Mistral } from '@mistralai/mistralai'

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
 * Processa documento con Mistral Document AI OCR
 * Converte PDF/immagini in Markdown strutturato preservando layout, tabelle e immagini
 * 
 * @param file - File da processare (PDF, PNG, JPG, ecc.)
 * @returns MistralOCRResponse con markdown e metadata
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
    console.log(`[mistral-ocr] Processing ${file.name} (${file.size} bytes, type: ${file.type})`)

    // Inizializza Mistral client
    const client = new Mistral({ apiKey: mistralApiKey })

    // Converti file in base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Determina il tipo di documento e costruisci il payload corretto
    // Mistral OCR supporta:
    // - PDF: type="document_url" con documentUrl
    // - Immagini: type="image_url" con imageUrl
    const isPdf = file.type === 'application/pdf'
    const isImage = file.type.startsWith('image/')

    if (!isPdf && !isImage) {
      throw new Error(`Unsupported file type: ${file.type}. Only PDF and images are supported.`)
    }

    console.log(`[mistral-ocr] Calling Mistral Document AI OCR (model: mistral-ocr-latest, document type: ${isPdf ? 'PDF' : 'Image'})`)

    // Chiama Mistral Document AI OCR con il tipo corretto
    // Docs: https://docs.mistral.ai/capabilities/document_ai/basic_ocr
    const ocrResponse = isPdf
      ? await client.ocr.process({
          model: 'mistral-ocr-latest',
          document: {
            type: 'document_url',
            documentUrl: `data:application/pdf;base64,${base64}`,
          },
        })
      : await client.ocr.process({
          model: 'mistral-ocr-latest',
          document: {
            type: 'image_url',
            imageUrl: `data:${file.type};base64,${base64}`,
          },
        })

    // Estrai il markdown da tutte le pagine
    // L'API restituisce un array di pages, ognuna con il suo markdown
    const markdown = ocrResponse.pages
      .map((page) => page.markdown)
      .join('\n\n---\n\n') // Separa le pagine con section break

    if (!markdown || markdown.trim().length === 0) {
      throw new Error('Empty response from Mistral Document AI OCR')
    }

    console.log(`[mistral-ocr] Processed ${ocrResponse.pages.length} page(s)`)

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
      throw new Error(`Mistral Document AI OCR failed: ${error.message}`)
    }

    throw new Error('Mistral Document AI OCR failed with unknown error')
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

