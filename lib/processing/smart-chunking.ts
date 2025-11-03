/**
 * Smart chunking with tiktoken for precise token counting
 * Preserves document structure (headers, tables, lists) when chunking Markdown
 */

// Import tiktoken dinamicamente per evitare problemi WASM in Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let encoding_for_model: any = null

// Lazy load tiktoken
async function getTiktoken() {
  if (!encoding_for_model) {
    try {
      const tiktoken = await import('@dqbd/tiktoken')
      encoding_for_model = tiktoken.encoding_for_model
      return true
    } catch (error) {
      console.warn('[smart-chunking] Tiktoken not available, using fallback token counting:', error)
      return false
    }
  }
  return true
}

/**
 * Fallback token counter quando tiktoken non è disponibile
 * Approssimazione: ~4 caratteri per token in italiano/inglese
 */
function approximateTokenCount(text: string): number {
  // Remove extra whitespace
  const normalized = text.replace(/\s+/g, ' ').trim()
  // Approssimazione: 1 token ≈ 4 caratteri
  return Math.ceil(normalized.length / 4)
}

export interface ImprovedChunk {
  content: string
  chunkIndex: number
  metadata: {
    charStart: number
    charEnd: number
    tokenCount: number
    section?: string
    contentType: 'paragraph' | 'heading' | 'list' | 'table' | 'mixed'
  }
}

export interface SmartChunkOptions {
  maxTokens?: number
  overlapTokens?: number
  preserveStructure?: boolean
  format?: 'plain' | 'markdown'
}

/**
 * Chunka testo in modo intelligente con token counting preciso
 * 
 * @param text - Testo da chunkare
 * @param options - Opzioni di chunking
 * @returns Array di ImprovedChunk con metadata ricchi
 */
export async function smartChunkText(
  text: string,
  options: SmartChunkOptions = {}
): Promise<ImprovedChunk[]> {
  const {
    maxTokens = 800,
    overlapTokens = 100,
    preserveStructure = true,
    format = 'plain',
  } = options

  console.log(
    `[smart-chunking] Chunking ${text.length} chars with max ${maxTokens} tokens, overlap ${overlapTokens}`
  )

  // Se il testo è in formato Markdown e vogliamo preservare la struttura
  if (format === 'markdown' && preserveStructure) {
    return chunkMarkdown(text, maxTokens, overlapTokens)
  }

  // Altrimenti usa chunking semplice ma con token counting preciso
  return chunkPlainText(text, maxTokens, overlapTokens)
}

/**
 * Chunka testo plain con token counting preciso o fallback
 */
async function chunkPlainText(
  text: string,
  maxTokens: number,
  overlapTokens: number
): Promise<ImprovedChunk[]> {
  const chunks: ImprovedChunk[] = []
  const tiktokenAvailable = await getTiktoken()

  // CASO 1: Usa tiktoken se disponibile
  if (tiktokenAvailable && encoding_for_model) {
    const encoding = encoding_for_model('gpt-3.5-turbo')

    try {
      // Tokenize tutto il testo
      const tokens = encoding.encode(text)
      console.log(`[smart-chunking] Total tokens (tiktoken): ${tokens.length}`)

      let chunkIndex = 0
      let currentPos = 0

      while (currentPos < tokens.length) {
        // Prendi chunk di maxTokens
        const chunkTokens = tokens.slice(
          currentPos,
          Math.min(currentPos + maxTokens, tokens.length)
        )

        // Decodifica in testo
        let chunkText = new TextDecoder().decode(encoding.decode(chunkTokens))

        // Se non siamo alla fine, cerca un break point naturale
        if (currentPos + maxTokens < tokens.length) {
          const lastPeriod = chunkText.lastIndexOf('.')
          const lastNewline = chunkText.lastIndexOf('\n\n')
          const lastSentence = chunkText.lastIndexOf('. ')

          const breakPoint = Math.max(lastNewline, lastSentence, lastPeriod)

          // Se troviamo un break point ragionevole (oltre il 70% del chunk)
          if (breakPoint > chunkText.length * 0.7) {
            chunkText = chunkText.slice(0, breakPoint + 1).trim()
            
            // Re-encode per aggiornare position
            const actualTokens = encoding.encode(chunkText)
            currentPos += actualTokens.length - overlapTokens
          } else {
            currentPos += chunkTokens.length - overlapTokens
          }
        } else {
          currentPos = tokens.length
        }

        const actualTokenCount = encoding.encode(chunkText).length

        chunks.push({
          content: chunkText,
          chunkIndex: chunkIndex++,
          metadata: {
            charStart: 0,
            charEnd: 0,
            tokenCount: actualTokenCount,
            contentType: detectContentType(chunkText),
          },
        })
      }

      console.log(`[smart-chunking] Created ${chunks.length} chunks with tiktoken`)
      return chunks
    } finally {
      encoding.free()
    }
  }

  // CASO 2: Fallback a chunking basato su caratteri con approssimazione token
  console.log('[smart-chunking] Using fallback character-based chunking')
  
  const chunkSizeChars = maxTokens * 4 // Approssimazione: 1 token ≈ 4 caratteri
  const overlapChars = overlapTokens * 4

  let chunkIndex = 0
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSizeChars, text.length)
    let chunkText = text.slice(start, end)

    // Cerca punto di interruzione naturale
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
      chunkIndex: chunkIndex++,
      metadata: {
        charStart: start - chunkText.length,
        charEnd: start,
        tokenCount: approximateTokenCount(chunkText),
        contentType: detectContentType(chunkText),
      },
    })
  }

  console.log(`[smart-chunking] Created ${chunks.length} chunks with fallback`)
  return chunks
}

/**
 * Chunka Markdown preservando struttura (headers, tables, lists)
 */
async function chunkMarkdown(
  text: string,
  maxTokens: number,
  overlapTokens: number
): Promise<ImprovedChunk[]> {
  const chunks: ImprovedChunk[] = []
  const tiktokenAvailable = await getTiktoken()

  // Helper function per contare token (usa tiktoken o fallback)
  const countTokens = tiktokenAvailable && encoding_for_model
    ? (text: string) => {
        const enc = encoding_for_model('gpt-3.5-turbo')
        const count = enc.encode(text).length
        enc.free()
        return count
      }
    : approximateTokenCount

  // 1. Identifica sezioni basate su headers
  const sections = extractMarkdownSections(text)

  console.log(`[smart-chunking] Found ${sections.length} markdown sections`)

  let chunkIndex = 0
  let currentChunk: string[] = []
  let currentTokens = 0
  let currentSection: string | undefined = undefined

  for (const section of sections) {
    const sectionTokens = countTokens(section.content)

    // Se la sezione da sola è troppo grande, spezzala
    if (sectionTokens > maxTokens) {
      // Prima salva chunk corrente se non vuoto
      if (currentChunk.length > 0) {
        const chunkContent = currentChunk.join('\n\n')
        chunks.push({
          content: chunkContent,
          chunkIndex: chunkIndex++,
          metadata: {
            charStart: 0,
            charEnd: chunkContent.length,
            tokenCount: countTokens(chunkContent),
            section: currentSection,
            contentType: detectContentType(chunkContent),
          },
        })
        currentChunk = []
        currentTokens = 0
      }

      // Spezza la sezione grande in sub-chunks
      const subChunks = await chunkPlainText(
        section.content,
        maxTokens,
        overlapTokens
      )

      for (const subChunk of subChunks) {
        chunks.push({
          ...subChunk,
          chunkIndex: chunkIndex++,
          metadata: {
            ...subChunk.metadata,
            section: section.header || currentSection,
          },
        })
      }

      currentSection = section.header
      continue
    }

    // Se aggiungere questa sezione supera maxTokens, salva chunk corrente
    if (currentTokens + sectionTokens > maxTokens && currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n\n')
      chunks.push({
        content: chunkContent,
        chunkIndex: chunkIndex++,
        metadata: {
          charStart: 0,
          charEnd: chunkContent.length,
          tokenCount: countTokens(chunkContent),
          section: currentSection,
          contentType: detectContentType(chunkContent),
        },
      })

      // Mantieni overlap: includi ultima sezione nel nuovo chunk
      if (overlapTokens > 0 && currentChunk.length > 0) {
        const lastSection = currentChunk[currentChunk.length - 1]
        currentChunk = [lastSection, section.content]
        currentTokens = countTokens(currentChunk.join('\n\n'))
      } else {
        currentChunk = [section.content]
        currentTokens = sectionTokens
      }
    } else {
      currentChunk.push(section.content)
      currentTokens += sectionTokens
    }

    if (section.header) {
      currentSection = section.header
    }
  }

  // Salva ultimo chunk se non vuoto
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join('\n\n')
    chunks.push({
      content: chunkContent,
      chunkIndex: chunkIndex++,
      metadata: {
        charStart: 0,
        charEnd: chunkContent.length,
        tokenCount: countTokens(chunkContent),
        section: currentSection,
        contentType: detectContentType(chunkContent),
      },
    })
  }

  console.log(`[smart-chunking] Created ${chunks.length} markdown chunks`)
  return chunks
}

/**
 * Estrae sezioni da Markdown basandosi su headers
 */
interface MarkdownSection {
  content: string
  header?: string
  level?: number
}

function extractMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split('\n')
  const sections: MarkdownSection[] = []
  let currentSection: string[] = []
  let currentHeader: string | undefined = undefined
  let currentLevel: number | undefined = undefined

  for (const line of lines) {
    // Rileva header markdown (# ## ### etc)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)

    if (headerMatch) {
      // Salva sezione precedente se non vuota
      if (currentSection.length > 0) {
        sections.push({
          content: currentSection.join('\n').trim(),
          header: currentHeader,
          level: currentLevel,
        })
      }

      // Inizia nuova sezione
      currentHeader = headerMatch[2].trim()
      currentLevel = headerMatch[1].length
      currentSection = [line]
    } else {
      currentSection.push(line)
    }
  }

  // Aggiungi ultima sezione
  if (currentSection.length > 0) {
    sections.push({
      content: currentSection.join('\n').trim(),
      header: currentHeader,
      level: currentLevel,
    })
  }

  return sections.filter((s) => s.content.length > 0)
}

/**
 * Rileva tipo di contenuto di un chunk
 */
function detectContentType(
  text: string
): 'paragraph' | 'heading' | 'list' | 'table' | 'mixed' {
  const hasHeader = /^#{1,6}\s+/m.test(text)
  const hasList = /^[\-\*\+]\s+/m.test(text) || /^\d+\.\s+/m.test(text)
  const hasTable = /\|.*\|/m.test(text)

  const indicators = [hasHeader, hasList, hasTable].filter(Boolean).length

  if (indicators === 0) return 'paragraph'
  if (indicators > 1) return 'mixed'
  if (hasHeader) return 'heading'
  if (hasList) return 'list'
  if (hasTable) return 'table'

  return 'paragraph'
}

