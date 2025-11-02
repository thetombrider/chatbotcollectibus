/**
 * Document processing utilities
 * Usa import dinamici per compatibilità con Next.js
 */

export interface Chunk {
  content: string
  chunkIndex: number
  metadata?: Record<string, unknown>
}

/**
 * Chunk text in chunks di dimensione specificata con overlap
 */
export function chunkText(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50
): Chunk[] {
  // Approximazione: 1 token ≈ 4 caratteri
  const chunkSizeChars = chunkSize * 4
  const overlapChars = overlap * 4

  const chunks: Chunk[] = []
  let start = 0
  let chunkIndex = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSizeChars, text.length)
    let chunkText = text.slice(start, end)

    // Cerca punto di interruzione naturale (fine frase, paragrafo)
    if (end < text.length) {
      const lastPeriod = chunkText.lastIndexOf('.')
      const lastNewline = chunkText.lastIndexOf('\n\n')
      const breakPoint = Math.max(lastPeriod, lastNewline)

      if (breakPoint > chunkSizeChars * 0.7) {
        chunkText = chunkText.slice(0, breakPoint + 1)
        start += breakPoint + 1
      } else {
        start += chunkSizeChars - overlapChars
      }
    } else {
      start = text.length
    }

    chunks.push({
      content: chunkText.trim(),
      chunkIndex,
      metadata: {
        charStart: start - chunkText.length,
        charEnd: start,
      },
    })

    chunkIndex++
  }

  return chunks
}

/**
 * Estrae testo da PDF usando pdf-parse (import dinamico)
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  // Import dinamico per evitare problemi di SSR
  const pdfParse = (await import('pdf-parse')).default
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const data = await pdfParse(buffer)
  return data.text
}

/**
 * Estrae testo da DOCX usando mammoth (import dinamico)
 */
export async function extractTextFromDOCX(file: File): Promise<string> {
  // Import dinamico per evitare problemi di SSR
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

/**
 * Estrae testo da file di testo
 */
export async function extractTextFromTXT(file: File): Promise<string> {
  return await file.text()
}

/**
 * Estrae testo da file (supporta PDF, DOCX, TXT)
 */
export async function extractText(file: File): Promise<string> {
  const fileType = file.type.toLowerCase()

  if (fileType === 'application/pdf') {
    return extractTextFromPDF(file)
  } else if (
    fileType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractTextFromDOCX(file)
  } else if (fileType === 'text/plain') {
    return extractTextFromTXT(file)
  } else {
    throw new Error(`Unsupported file type: ${fileType}`)
  }
}

