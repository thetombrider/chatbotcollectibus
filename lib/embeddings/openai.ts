import OpenAI from 'openai'
import { normalizeTextForEmbedding } from './text-preprocessing'
import { logEmbeddingCall } from '@/lib/observability/langfuse'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Genera embedding per un testo usando OpenAI
 * 
 * Applica automaticamente normalizzazione del testo per migliorare
 * la consistency degli embeddings e aumentare i punteggi di similarity.
 * 
 * @param text - Testo da convertire in embedding
 * @param model - Modello OpenAI da usare (default: text-embedding-3-large)
 * @returns Array numerico rappresentante l'embedding
 * 
 * @example
 * const embedding = await generateEmbedding("La GDPR stabilisce...")
 */
export async function generateEmbedding(
  text: string,
  model: string = 'text-embedding-3-large'
): Promise<number[]> {
  try {
    // Normalizza testo prima di generare embedding
    const normalizedText = normalizeTextForEmbedding(text)
    
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

    // Log embedding call to Langfuse
    const usage = response.usage ? { tokens: response.usage.total_tokens } : undefined
    logEmbeddingCall(
      null, // traceId (standalone per embedding singolo)
      model,
      normalizedText,
      embedding,
      usage,
      { operation: 'single-embedding', textLength: normalizedText.length, dimensions: embedding.length }
    )

    return embedding
  } catch (error: unknown) {
    console.error('[embeddings] Generation failed:', error)
    
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
 * @returns Array di arrays numerici rappresentanti gli embeddings
 * 
 * @example
 * const embeddings = await generateEmbeddings([
 *   "Chunk 1 content...",
 *   "Chunk 2 content..."
 * ])
 */
export async function generateEmbeddings(
  texts: string[],
  model: string = 'text-embedding-3-large'
): Promise<number[][]> {
  try {
    // Normalizza tutti i testi prima di generare embeddings
    const normalizedTexts = texts.map(text => normalizeTextForEmbedding(text))
    
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

    // Log embedding call to Langfuse
    const usage = response.usage ? { tokens: response.usage.total_tokens } : undefined
    logEmbeddingCall(
      null, // traceId (standalone per batch embedding)
      model,
      normalizedTexts,
      embeddings,
      usage,
      { operation: 'batch-embedding', inputCount: normalizedTexts.length, dimensions: embeddings[0]?.length || 1536 }
    )

    return embeddings
  } catch (error: unknown) {
    console.error('[embeddings] Batch generation failed:', error)
    
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

