/**
 * Adaptive Chunking
 * 
 * Chunking intelligente che si adatta alla struttura del documento:
 * - Rileva pattern strutturali (articoli, sezioni, capitoli)
 * - Chunk preservando queste strutture quando possibile
 * - Fallback a sentence-aware chunking per documenti senza struttura chiara
 * 
 * Risolve il problema delle query su articoli specifici preservando
 * integrità strutturale dei documenti normativi.
 */

import { sentenceAwareChunking, type SentenceChunk, type SentenceChunkOptions } from './sentence-aware-chunking'
import type { DocumentStructure, ArticlePattern, SectionPattern } from './structure-detector'

export interface AdaptiveChunk extends SentenceChunk {
  metadata: SentenceChunk['metadata'] & {
    articleNumber?: number
    articleType?: 'complete' | 'partial'
    sectionTitle?: string
    sectionLevel?: number
    chapterNumber?: number | string
  }
}

export interface AdaptiveChunkOptions extends SentenceChunkOptions {
  // Nessun campo aggiuntivo per ora, ma estendibile in futuro
}

/**
 * Conta token usando approssimazione
 * 1 token ≈ 4 caratteri (approssimazione standard)
 */
function countTokens(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return Math.ceil(normalized.length / 4)
}

/**
 * Chunking adattivo che usa structure detector per chunkare intelligentemente
 * 
 * @param text - Testo del documento
 * @param structure - Struttura rilevata dal structure detector
 * @param options - Opzioni di chunking
 * @returns Array di chunks con metadati strutturali
 */
export async function adaptiveChunking(
  text: string,
  structure: DocumentStructure,
  options: AdaptiveChunkOptions = {}
): Promise<AdaptiveChunk[]> {
  const {
    targetTokens = 350,
    maxTokens = 450,
    minTokens = 200,
    preserveStructure = true,
    format = 'plain',
  } = options

  console.log(
    `[adaptive-chunking] Starting adaptive chunking (type: ${structure.type}, confidence: ${structure.confidence.toFixed(2)})`
  )

  // Strategia 1: Se ci sono articoli ben definiti, chunk per articolo
  if (
    structure.patterns.articles &&
    structure.patterns.articles.length > 0 &&
    structure.confidence > 0.7
  ) {
    console.log(
      `[adaptive-chunking] Using article-based chunking (${structure.patterns.articles.length} articles)`
    )
    return chunkByArticles(text, structure.patterns.articles, options)
  }

  // Strategia 2: Se ci sono sezioni markdown, preserva sezioni intere quando possibile
  if (
    structure.patterns.sections &&
    structure.patterns.sections.length > 0 &&
    format === 'markdown' &&
    preserveStructure
  ) {
    console.log(
      `[adaptive-chunking] Using section-based chunking (${structure.patterns.sections.length} sections)`
    )
    return chunkBySections(text, structure.patterns.sections, options)
  }

  // Strategia 3: Fallback a sentence-aware chunking
  console.log('[adaptive-chunking] Using sentence-aware chunking (fallback)')
  const chunks = await sentenceAwareChunking(text, options)
  
  // Converti SentenceChunk[] a AdaptiveChunk[]
  return chunks.map((chunk) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
    },
  }))
}

/**
 * Chunka preservando articoli interi quando possibile
 * Se articolo è troppo grande, chunk per comma/paragrafo
 */
async function chunkByArticles(
  text: string,
  articles: ArticlePattern[],
  options: AdaptiveChunkOptions
): Promise<AdaptiveChunk[]> {
  const {
    targetTokens = 350,
    maxTokens = 450,
    minTokens = 200,
  } = options

  const chunks: AdaptiveChunk[] = []
  let chunkIndex = 0

  for (const article of articles) {
    const articleText = text.slice(article.start, article.end).trim()

    if (!articleText || articleText.length === 0) {
      continue
    }

    const articleTokens = await countTokens(articleText)

    // Se articolo è piccolo, chunk intero
    if (articleTokens <= maxTokens) {
      // Conta frasi approssimativamente
      const sentenceCount = (articleText.match(/[.!?]+\s+/g) || []).length || 1
      
      chunks.push({
        content: articleText,
        chunkIndex: chunkIndex++,
        metadata: {
          tokenCount: articleTokens,
          sentenceCount,
          charStart: article.start,
          charEnd: article.end,
          contentType: detectContentType(articleText),
          hasOverlap: false,
          articleNumber: article.number,
          articleType: 'complete',
        },
      })
    } else {
      // Se articolo è grande, chunk per comma/paragrafo usando sentence-aware
      console.log(
        `[adaptive-chunking] Article ${article.number} is too large (${articleTokens} tokens), chunking by paragraphs`
      )

      const articleChunks = await sentenceAwareChunking(articleText, {
        targetTokens,
        maxTokens,
        minTokens,
        preserveStructure: true,
        format: 'plain',
      })

      // Aggiungi metadati articolo a ogni chunk
      for (const chunk of articleChunks) {
        chunks.push({
          ...chunk,
          chunkIndex: chunkIndex++,
          metadata: {
            ...chunk.metadata,
            charStart: article.start + chunk.metadata.charStart,
            charEnd: article.start + chunk.metadata.charEnd,
            articleNumber: article.number,
            articleType: 'partial',
          },
        })
      }
    }
  }

  console.log(
    `[adaptive-chunking] Created ${chunks.length} chunks from ${articles.length} articles`
  )

  return chunks
}

/**
 * Chunka preservando sezioni intere quando possibile
 * Usa sentence-aware chunking per ogni sezione
 */
async function chunkBySections(
  text: string,
  sections: SectionPattern[],
  options: AdaptiveChunkOptions
): Promise<AdaptiveChunk[]> {
  const {
    targetTokens = 350,
    maxTokens = 450,
    minTokens = 200,
    format = 'plain',
  } = options

  const chunks: AdaptiveChunk[] = []
  let chunkIndex = 0

  for (const section of sections) {
    const sectionText = text.slice(section.start, section.end).trim()

    if (!sectionText || sectionText.length === 0) {
      continue
    }

    // Chunka sezione usando sentence-aware
    const sectionChunks = await sentenceAwareChunking(sectionText, {
      targetTokens,
      maxTokens,
      minTokens,
      preserveStructure: true,
      format,
    })

    // Aggiungi metadati sezione a ogni chunk
    for (const chunk of sectionChunks) {
      chunks.push({
        ...chunk,
        chunkIndex: chunkIndex++,
        metadata: {
          ...chunk.metadata,
          charStart: section.start + chunk.metadata.charStart,
          charEnd: section.start + chunk.metadata.charEnd,
          sectionTitle: section.title,
          sectionLevel: section.level,
        },
      })
    }
  }

  console.log(
    `[adaptive-chunking] Created ${chunks.length} chunks from ${sections.length} sections`
  )

  return chunks
}

/**
 * Rileva tipo di contenuto di un chunk
 * Copiato da sentence-aware-chunking per consistenza
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

