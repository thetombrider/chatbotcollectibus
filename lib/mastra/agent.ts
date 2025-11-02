import { createAgent } from '@mastra/core'
import { createReactAgent } from '@mastra/react'

/**
 * Mastra Agent configuration per RAG
 */

// Validazione OpenRouter API key
const openrouterApiKey = process.env.OPENROUTER_API_KEY

if (!openrouterApiKey) {
  throw new Error(
    'OPENROUTER_API_KEY is not set. Please add it to your .env.local file.'
  )
}

// Tool per vector search
async function vectorSearchTool(query: string) {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty')
  }

  // Import dinamico per evitare problemi di SSR
  const { generateEmbedding } = await import('@/lib/embeddings/openai')
  const { hybridSearch } = await import('@/lib/supabase/vector-operations')

  const queryEmbedding = await generateEmbedding(query)
  const results = await hybridSearch(queryEmbedding, query, 5)

  return {
    chunks: results.map((r) => ({
      content: r.content,
      similarity: r.similarity,
      documentId: r.document_id,
      metadata: r.metadata,
    })),
  }
}

// Tool per semantic cache lookup
async function semanticCacheTool(query: string) {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty')
  }

  const { generateEmbedding } = await import('@/lib/embeddings/openai')
  const { findCachedResponse } = await import('@/lib/supabase/semantic-cache')

  const queryEmbedding = await generateEmbedding(query)
  const cached = await findCachedResponse(queryEmbedding)

  return cached ? { cached: true, response: cached.response_text } : { cached: false }
}

// Configurazione agent
export const ragAgent = createAgent({
  name: 'RAG Consulting Agent',
  instructions: `Sei un assistente AI specializzato nell'analisi di documenti aziendali e consulenza.
Usa i documenti forniti per rispondere alle domande dell'utente in modo accurato e professionale.
Cita sempre le fonti quando possibile.`,
  model: {
    provider: 'openrouter',
    name: 'google/gemini-2.0-flash-exp',
    apiKey: openrouterApiKey,
  },
  tools: [
    {
      name: 'vector_search',
      description: 'Cerca informazioni rilevanti nei documenti caricati',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Query di ricerca',
          },
        },
        required: ['query'],
      },
      execute: vectorSearchTool,
    },
    {
      name: 'semantic_cache',
      description: 'Verifica se esiste una risposta cached per questa query',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Query da verificare',
          },
        },
        required: ['query'],
      },
      execute: semanticCacheTool,
    },
  ],
})

// React agent per uso nel frontend
export const reactRagAgent = createReactAgent(ragAgent)

