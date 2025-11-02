import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Genera embedding per un testo usando OpenAI
 */
export async function generateEmbedding(
  text: string,
  model: string = 'text-embeddings-3-large'
): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model,
      input: text,
      encoding_format: 'float',
    })

    return response.data[0].embedding
  } catch (error) {
    console.error('[embeddings] Generation failed:', error)
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Genera embeddings per multipli testi (batch)
 */
export async function generateEmbeddings(
  texts: string[],
  model: string = 'text-embeddings-3-large'
): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model,
      input: texts,
      encoding_format: 'float',
    })

    return response.data.map(item => item.embedding)
  } catch (error) {
    console.error('[embeddings] Batch generation failed:', error)
    throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

