import OpenAI from 'openai'
import { normalizeTextForEmbedding } from './text-preprocessing'
import { 
  createEmbeddingGeneration,
  updateEmbeddingGeneration,
  endGeneration,
} from '@/lib/observability/langfuse'
import type { LangfuseTraceClient, LangfuseSpanClient } from 'langfuse'

// Lazy-load OpenAI client to ensure env vars are available
let openaiInstance: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiInstance
}

/**
 * Genera embedding per un testo usando OpenAI
 * 
 * Applica automaticamente normalizzazione del testo per migliorare
 * la consistency degli embeddings e aumentare i punteggi di similarity.
 * 
 * @param text - Testo da convertire in embedding
 * @param model - Modello OpenAI da usare (default: text-embedding-3-large)
 * @param parent - Trace o Span object padre per collegare la generation (opzionale)
 * @returns Array numerico rappresentante l'embedding
 * 
 * @example
 * const embedding = await generateEmbedding("La GDPR stabilisce...", 'text-embedding-3-large', traceContext.trace)
 */
export async function generateEmbedding(
  text: string,
  model: string = 'text-embedding-3-large',
  parent?: LangfuseTraceClient | LangfuseSpanClient | null
): Promise<number[]> {
  // Normalizza testo prima di generare embedding
  const normalizedText = normalizeTextForEmbedding(text)
  
  // Crea generation Langfuse per tracciare embedding
  const generation = parent ? createEmbeddingGeneration(
    parent,
    model,
    normalizedText,
    { 
      operation: 'single-embedding', 
      textLength: normalizedText.length,
    }
  ) : null

  try {
    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
      model,
      input: normalizedText,
      encoding_format: 'float',
      dimensions: 1536, // Specifica esplicitamente 1536 dimensioni per text-embedding-3-large
    })

    const embedding = response.data[0].embedding
    
    // Validazione dimensioni
    if (embedding.length !== 1536) {
      console.error(`[embeddings] Invalid embedding dimensions: expected 1536, got ${embedding.length}`)
      throw new Error(`Invalid embedding dimensions: expected 1536, got ${embedding.length}. This may indicate a model configuration issue.`)
    }

    // Aggiorna generation con output e usage
    const usage = response.usage ? { tokens: response.usage.total_tokens } : undefined
    if (generation) {
      updateEmbeddingGeneration(generation, embedding, usage)
      endGeneration(generation)
    }

    return embedding
  } catch (error: unknown) {
    console.error('[embeddings] Generation failed:', error)
    
    // Segna generation come fallita se presente
    if (generation) {
      endGeneration(generation, undefined, undefined, { 
        error: error instanceof Error ? error.message : 'Unknown error',
        failed: true 
      })
    }
    
    // Gestione errori più specifica
    if (error && typeof error === 'object' && 'code' in error) {
      const apiError = error as { code?: string; message?: string; status?: number }
      
      if (apiError.code === 'model_not_found') {
        throw new Error(
          `Model not found: ${model}. Please check:\n` +
          `1. The model name is correct (text-embedding-3-large)\n` +
          `2. Your OpenAI API key has access to this model\n` +
          `3. You have sufficient credits in your OpenAI account`
        )
      }
      
      if (apiError.status === 401) {
        throw new Error(
          `Authentication failed. Please check your OPENAI_API_KEY is valid and has sufficient credits.`
        )
      }
      
      if (apiError.status === 429) {
        throw new Error(
          `Rate limit exceeded or insufficient credits. Please check your OpenAI account balance.`
        )
      }
    }
    
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Genera embeddings per multipli testi (batch)
 * 
 * Applica automaticamente normalizzazione del testo per ogni input
 * per migliorare la consistency degli embeddings e aumentare i punteggi di similarity.
 * 
 * @param texts - Array di testi da convertire in embeddings
 * @param model - Modello OpenAI da usare (default: text-embedding-3-large)
 * @param parent - Trace o Span object padre per collegare la generation (opzionale)
 * @returns Array di arrays numerici rappresentanti gli embeddings
 * 
 * @example
 * const embeddings = await generateEmbeddings([
 *   "Chunk 1 content...",
 *   "Chunk 2 content..."
 * ], 'text-embedding-3-large', traceContext.trace)
 */
export async function generateEmbeddings(
  texts: string[],
  model: string = 'text-embedding-3-large',
  parent?: LangfuseTraceClient | LangfuseSpanClient | null
): Promise<number[][]> {
  // Normalizza tutti i testi prima di generare embeddings
  const normalizedTexts = texts.map(text => normalizeTextForEmbedding(text))
  
  // Crea generation Langfuse per tracciare embedding batch
  const generation = parent ? createEmbeddingGeneration(
    parent,
    model,
    normalizedTexts,
    { 
      operation: 'batch-embedding', 
      inputCount: normalizedTexts.length,
    }
  ) : null

  try {
    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
      model,
      input: normalizedTexts,
      encoding_format: 'float',
      dimensions: 1536, // Specifica esplicitamente 1536 dimensioni per text-embedding-3-large
    })

    const embeddings = response.data.map(item => item.embedding)
    
    // Validazione dimensioni per tutti gli embeddings
    const invalidEmbeddings = embeddings.filter(emb => emb.length !== 1536)
    if (invalidEmbeddings.length > 0) {
      const invalidDims = invalidEmbeddings.map(emb => emb.length)
      console.error(`[embeddings] Invalid embedding dimensions found: ${invalidDims.join(', ')}. Expected 1536 for all embeddings.`)
      throw new Error(`Invalid embedding dimensions: found ${invalidEmbeddings.length} embeddings with incorrect dimensions. Expected 1536, got: ${invalidDims.join(', ')}`)
    }

    // Aggiorna generation con output e usage
    const usage = response.usage ? { tokens: response.usage.total_tokens } : undefined
    if (generation) {
      updateEmbeddingGeneration(generation, embeddings, usage)
      endGeneration(generation)
    }

    return embeddings
  } catch (error: unknown) {
    console.error('[embeddings] Batch generation failed:', error)
    
    // Segna generation come fallita se presente
    if (generation) {
      endGeneration(generation, undefined, undefined, { 
        error: error instanceof Error ? error.message : 'Unknown error',
        failed: true 
      })
    }
    
    // Gestione errori più specifica
    if (error && typeof error === 'object' && 'code' in error) {
      const apiError = error as { code?: string; message?: string; status?: number }
      
      if (apiError.code === 'model_not_found') {
        throw new Error(
          `Model not found: ${model}. Please check:\n` +
          `1. The model name is correct (text-embedding-3-large)\n` +
          `2. Your OpenAI API key has access to this model\n` +
          `3. You have sufficient credits in your OpenAI account`
        )
      }
      
      if (apiError.status === 401) {
        throw new Error(
          `Authentication failed. Please check your OPENAI_API_KEY is valid and has sufficient credits.`
        )
      }
      
      if (apiError.status === 429) {
        throw new Error(
          `Rate limit exceeded or insufficient credits. Please check your OpenAI account balance.`
        )
      }
    }
    
    throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

