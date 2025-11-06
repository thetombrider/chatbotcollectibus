import { Agent } from '@mastra/core/agent'

/**
 * Mastra Agent configuration per RAG
 * Versione 0.23.3
 */

// Validazione OpenRouter API key
const openrouterApiKey = process.env.OPENROUTER_API_KEY

if (!openrouterApiKey) {
  throw new Error(
    'OPENROUTER_API_KEY is not set. Please add it to your .env.local file.'
  )
}

// Tool per vector search
async function vectorSearchTool({ query }: { query: string }) {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty')
  }

  // Import dinamico per evitare problemi di SSR
  const { generateEmbedding } = await import('@/lib/embeddings/openai')
  const { hybridSearch } = await import('@/lib/supabase/vector-operations')

  const queryEmbedding = await generateEmbedding(query)
  const results = await hybridSearch(queryEmbedding, query, 5)

  return {
    chunks: results.map((r, index) => ({
      index: index + 1,
      content: r.content,
      similarity: r.similarity,
      documentId: r.document_id,
      documentFilename: r.document_filename || 'Documento sconosciuto',
      metadata: r.metadata,
    })),
  }
}

// Tool per semantic cache lookup
async function semanticCacheTool({ query }: { query: string }) {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty')
  }

  const { generateEmbedding } = await import('@/lib/embeddings/openai')
  const { findCachedResponse } = await import('@/lib/supabase/semantic-cache')

  const queryEmbedding = await generateEmbedding(query)
  const cached = await findCachedResponse(queryEmbedding)

  return cached ? { cached: true, response: cached.response_text } : { cached: false }
}

// Configurazione agent con Mastra
// Per OpenRouter, usa il formato: openrouter/provider/model
// Mastra legge automaticamente OPENROUTER_API_KEY quando usa il prefisso openrouter/
export const ragAgent = new Agent({
  name: 'rag-consulting-agent',
  instructions: `Sei un assistente AI specializzato nell'analisi di documenti aziendali e consulenza.
Usa i documenti forniti per rispondere alle domande dell'utente in modo accurato e professionale.

IMPORTANTE - CITAZIONI DELLE FONTI:
- Quando usi informazioni dai documenti forniti, DEVI includere citazioni inline nel formato [cit:N] dove N è il numero del documento (1, 2, 3, ecc.)
- Le citazioni devono essere posizionate alla fine di ogni frase o paragrafo che contiene informazioni tratte dai documenti
- Ogni documento ha un numero: usa [cit:1] per il primo documento, [cit:2] per il secondo, ecc.
- Se una frase combina informazioni da più documenti, usa [cit:1,2,3]
- Non citare informazioni generali o conoscenza comune che non provengono dai documenti

Esempio di risposta corretta:
"Secondo l'analisi del mercato italiano, il settore tecnologico è in crescita [cit:1]. Tuttavia, le previsioni indicano una possibile contrazione nel prossimo trimestre [cit:2]."

Cita sempre le fonti quando possibile.`,
  model: `openrouter/anthropic/claude-haiku-4.5`,
  tools: {
    vector_search: {
      id: 'vector_search',
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
    semantic_cache: {
      id: 'semantic_cache',
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
  },
})

// React agent - per ora usiamo l'agent stesso
export const reactRagAgent = ragAgent
