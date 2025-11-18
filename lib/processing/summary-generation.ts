/**
 * Document Summary Generation Module
 * 
 * Implements a "summary of summaries" strategy:
 * 1. Generate individual summaries for each chunk
 * 2. Combine chunk summaries and generate final document summary
 * 
 * This approach scales better for long documents and captures themes from all sections.
 * 
 * Note: Uses text-embedding-3-small (1536 dimensions) for embeddings due to pgvector limit (max 2000).
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateEmbeddings } from '@/lib/embeddings/openai'
import { createSpan, endSpan, type TraceContext } from '@/lib/observability/langfuse'

export interface SummaryGenerationOptions {
  maxChunksPerBatch?: number  // Default: 10 (for chunk summarization)
  maxChunkSummaryTokens?: number  // Default: 150 per chunk
  maxFinalSummaryTokens?: number  // Default: 1000 for final summary (500-750 words)
  language?: string  // Default: 'it'
  model?: string  // Default: from env
}

export interface ChunkSummary {
  chunkIndex: number
  summary: string
  tokensUsed: number
}

export interface DocumentSummary {
  summary: string
  embedding: number[]
  chunkSummaries: ChunkSummary[]
  totalTokensUsed: number
  model: string
  generatedAt: string
}

/**
 * Generate summary for a single chunk
 */
async function generateChunkSummary(
  chunkContent: string,
  chunkIndex: number,
  options: SummaryGenerationOptions = {}
): Promise<ChunkSummary> {
  const { maxChunkSummaryTokens = 150, language = 'it', model = 'google/gemini-2.5-flash' } = options

  const prompt = `Riassumi questo estratto di documento in modo conciso (max ${maxChunkSummaryTokens} parole).
Focus su: concetti chiave, argomenti principali, informazioni rilevanti.

Estratto #${chunkIndex + 1}:
${chunkContent}

Riassunto conciso:`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxChunkSummaryTokens,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const data = await response.json()
    const summary = data.choices[0]?.message?.content?.trim() || ''
    const tokensUsed = data.usage?.total_tokens || 0

    return {
      chunkIndex,
      summary,
      tokensUsed,
    }
  } catch (error) {
    console.error(`[summary-generation] Failed to generate chunk summary #${chunkIndex}:`, error)
    throw error
  }
}

/**
 * Generate final document summary from chunk summaries
 */
async function generateFinalSummary(
  chunkSummaries: ChunkSummary[],
  documentFilename: string,
  options: SummaryGenerationOptions = {}
): Promise<{ summary: string; tokensUsed: number }> {
  const { maxFinalSummaryTokens = 1000, language = 'it', model = 'google/gemini-2.5-flash' } = options

  // Combine all chunk summaries
  const combinedSummaries = chunkSummaries
    .map(cs => `[Parte ${cs.chunkIndex + 1}] ${cs.summary}`)
    .join('\n\n')

  const prompt = `Analizza questi riassunti parziali di un documento e genera un riassunto completo e coerente del documento (400-750 parole).

Il riassunto finale deve catturare:
1. TEMA PRINCIPALE: Argomento centrale del documento
2. ARGOMENTI CHIAVE: Concetti e temi principali trattati
3. SCOPO: Obiettivo e finalità del documento
4. CONTENUTO: Cosa contiene concretamente (regole, procedure, analisi, dati)
5. RILEVANZA: A chi è rivolto e contesto di applicazione

Il riassunto deve essere in italiano, chiaro, fluido e adatto per ricerche tematiche.

Documento: ${documentFilename}

Riassunti parziali delle sezioni:
${combinedSummaries}

Riassunto completo del documento:`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxFinalSummaryTokens,
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    const data = await response.json()
    const summary = data.choices[0]?.message?.content?.trim() || ''
    const tokensUsed = data.usage?.total_tokens || 0

    return { summary, tokensUsed }
  } catch (error) {
    console.error('[summary-generation] Failed to generate final summary:', error)
    throw error
  }
}

/**
 * Main function: Generate document summary using summary-of-summaries strategy
 * 
 * @param documentId - UUID of document to summarize
 * @param options - Configuration options
 * @param traceContext - Optional Langfuse trace context
 * @returns Complete document summary with embedding
 */
export async function generateDocumentSummary(
  documentId: string,
  options: SummaryGenerationOptions = {},
  traceContext?: TraceContext
): Promise<DocumentSummary> {
  const startTime = Date.now()
  const { maxChunksPerBatch = 10 } = options

  console.log('[summary-generation] Starting summary generation:', { documentId })

  const summarySpan = traceContext ? createSpan(traceContext.trace, 'generate-document-summary', {
    documentId,
    strategy: 'summary-of-summaries',
  }) : null

  try {
    // Step 1: Load document chunks from database
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('id, content, chunk_index')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })

    if (chunksError) {
      console.error('[summary-generation] Failed to load chunks:', chunksError)
      throw chunksError
    }

    if (!chunks || chunks.length === 0) {
      throw new Error('No chunks found for document')
    }

    console.log('[summary-generation] Loaded chunks:', { count: chunks.length })

    // Step 2: Get document metadata
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('filename, file_type')
      .eq('id', documentId)
      .single()

    if (docError) {
      console.error('[summary-generation] Failed to load document:', docError)
      throw docError
    }

    // Step 3: Select chunks to summarize (always use same strategy for consistency)
    // Strategy: first 3 + random middle + last 3 = max 10 chunks total
    let selectedChunks = chunks
    if (chunks.length > maxChunksPerBatch) {
      const firstChunks = chunks.slice(0, 3)
      const lastChunks = chunks.slice(-3)
      const middleChunks = chunks.slice(3, -3)
      
      // Random sample from middle (max 4 chunks for total of 10)
      const middleSampleSize = Math.min(middleChunks.length, maxChunksPerBatch - 6)
      const middleSample = middleChunks
        .sort(() => Math.random() - 0.5)
        .slice(0, middleSampleSize)
        .sort((a, b) => a.chunk_index - b.chunk_index)

      selectedChunks = [...firstChunks, ...middleSample, ...lastChunks]
      console.log('[summary-generation] Sampled chunks:', {
        total: chunks.length,
        selected: selectedChunks.length,
        strategy: 'first-3 + random-middle + last-3',
      })
    } else {
      console.log('[summary-generation] Using all chunks (≤10):', {
        total: chunks.length,
      })
    }

    // Step 4: Generate summaries for each chunk
    console.log('[summary-generation] Generating chunk summaries...')
    const chunkSpan = summarySpan ? createSpan(summarySpan, 'generate-chunk-summaries', {
      chunkCount: selectedChunks.length,
    }) : null

    const chunkSummaries: ChunkSummary[] = []
    for (let i = 0; i < selectedChunks.length; i++) {
      const chunk = selectedChunks[i]
      console.log(`[summary-generation] Processing chunk ${i + 1}/${selectedChunks.length}`)
      
      const chunkSummary = await generateChunkSummary(chunk.content, i, options)
      chunkSummaries.push(chunkSummary)

      // Rate limiting: 1 request per second
      if (i < selectedChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    const chunkTokensUsed = chunkSummaries.reduce((sum, cs) => sum + cs.tokensUsed, 0)
    endSpan(chunkSpan, {
      chunkCount: chunkSummaries.length,
      totalTokens: chunkTokensUsed,
    })

    console.log('[summary-generation] Chunk summaries generated:', {
      count: chunkSummaries.length,
      totalTokens: chunkTokensUsed,
    })

    // Step 5: Generate final document summary from chunk summaries
    console.log('[summary-generation] Generating final summary...')
    const finalSpan = summarySpan ? createSpan(summarySpan, 'generate-final-summary', {
      chunkSummariesCount: chunkSummaries.length,
    }) : null

    const { summary, tokensUsed: finalTokens } = await generateFinalSummary(
      chunkSummaries,
      document.filename,
      options
    )

    endSpan(finalSpan, {
      summaryLength: summary.length,
      tokensUsed: finalTokens,
    })

    console.log('[summary-generation] Final summary generated:', {
      length: summary.length,
      tokens: finalTokens,
    })

    // Step 6: Generate embedding for final summary
    console.log('[summary-generation] Generating embedding...')
    const embedSpan = summarySpan ? createSpan(summarySpan, 'generate-summary-embedding', {
      summaryLength: summary.length,
    }) : null

    const embeddings = await generateEmbeddings([summary], 'text-embedding-3-small')
    const embedding = embeddings[0]

    endSpan(embedSpan, {
      embeddingDimension: embedding.length,
    })

    // Step 7: Return complete summary
    const totalTokens = chunkTokensUsed + finalTokens
    const elapsedTime = Date.now() - startTime

    const result: DocumentSummary = {
      summary,
      embedding,
      chunkSummaries,
      totalTokensUsed: totalTokens,
      model: options.model || 'openai/gpt-4o-mini',
      generatedAt: new Date().toISOString(),
    }

    console.log('[summary-generation] Summary generation complete:', {
      documentId,
      summaryLength: summary.length,
      chunkSummaries: chunkSummaries.length,
      totalTokens,
      elapsedTime: `${elapsedTime}ms`,
    })

    endSpan(summarySpan, {
      success: true,
      summaryLength: summary.length,
      totalTokens,
      elapsedTime,
    })

    return result
  } catch (error) {
    console.error('[summary-generation] Summary generation failed:', error)
    endSpan(summarySpan, {
      success: false,
      error: String(error),
    })
    throw error
  }
}

/**
 * Save generated summary to database
 */
export async function saveSummary(
  documentId: string,
  summary: string,
  embedding: number[]
): Promise<void> {
  console.log('[summary-generation] Saving summary to database:', { documentId })

  try {
    const { error } = await supabaseAdmin
      .from('documents')
      .update({
        summary,
        summary_embedding: embedding,
        summary_generated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    if (error) {
      console.error('[summary-generation] Failed to save summary:', error)
      throw error
    }

    console.log('[summary-generation] Summary saved successfully')
  } catch (error) {
    console.error('[summary-generation] Unexpected error saving summary:', error)
    throw error
  }
}

/**
 * Generate and save summary in one operation (convenience function)
 */
export async function generateAndSaveSummary(
  documentId: string,
  options: SummaryGenerationOptions = {},
  traceContext?: TraceContext
): Promise<void> {
  console.log('[summary-generation] Generate and save summary:', { documentId })

  try {
    const summary = await generateDocumentSummary(documentId, options, traceContext)
    await saveSummary(documentId, summary.summary, summary.embedding)
    
    console.log('[summary-generation] Complete - summary generated and saved')
  } catch (error) {
    console.error('[summary-generation] Failed to generate and save:', error)
    throw error
  }
}
