import OpenAI from 'openai'

// Validazione API key
const openaiApiKey = process.env.OPENAI_API_KEY

if (!openaiApiKey) {
  throw new Error(
    'OPENAI_API_KEY is not set. Please add it to your .env.local file.'
  )
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
})

/**
 * Genera embedding per un testo usando OpenAI
 */
export async function generateEmbedding(
  text: string,
  model: string = 'text-embedding-3-large'
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty')
  }

  try {
    const response = await openai.embeddings.create({
      model,
      input: text,
      encoding_format: 'float',
      dimensions: 1536,
    })

    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding returned from OpenAI')
    }

    return response.data[0].embedding
  } catch (error) {
    console.error('[embeddings] Generation failed:', error)
    if (error instanceof Error && error.message.includes('API key')) {
      throw new Error(
        'OpenAI API key is invalid or expired. Please check your OPENAI_API_KEY environment variable.'
      )
    }
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Genera embeddings per multipli testi (batch)
 */
export async function generateEmbeddings(
  texts: string[],
  model: string = 'text-embedding-3-large'
): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    throw new Error('Texts array cannot be empty')
  }

  // OpenAI ha un limite di batch size
  const MAX_BATCH_SIZE = 100
  const results: number[][] = []

  try {
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE)
      const response = await openai.embeddings.create({
        model,
        input: batch,
        encoding_format: 'float',
        dimensions: 1536,
      })

      const batchEmbeddings = response.data.map((item) => item.embedding)
      results.push(...batchEmbeddings)
    }

    return results
  } catch (error) {
    console.error('[embeddings] Batch generation failed:', error)
    if (error instanceof Error && error.message.includes('API key')) {
      throw new Error(
        'OpenAI API key is invalid or expired. Please check your OPENAI_API_KEY environment variable.'
      )
    }
    throw new Error(
      `Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

