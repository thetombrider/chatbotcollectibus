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

// Context globale per salvare i risultati della ricerca web
// Questo ci permette di accedere ai risultati dopo che l'agent ha finito
const webSearchResultsContext = new Map<string, any[]>()

// Tool per ricerca web con Tavily
async function webSearchTool({ query }: { query: string }) {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty')
  }

  try {
    // Usa Tavily per la ricerca web
    // Nota: Questo tool viene chiamato solo quando le fonti nella KB non sono sufficienti
    const { searchWeb } = await import('@/lib/tavily/web-search')
    
    const results = await searchWeb(query, 5)
    
    // Salva i risultati nel contesto usando la query come chiave
    // Questo ci permette di recuperarli dopo che l'agent ha finito
    const contextKey = `web_search_${Date.now()}_${query.substring(0, 50)}`
    webSearchResultsContext.set(contextKey, results.results || [])
    
    console.log('[mastra/agent] Web search results saved to context:', {
      contextKey,
      resultsCount: results.results?.length || 0,
    })

    return {
      results: results.results || [],
      query: results.query,
      contextKey, // Includiamo la chiave nel risultato per poterla recuperare
    }
  } catch (error) {
    console.error('[mastra/agent] Web search failed:', error)
    throw new Error(`Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Recupera i risultati della ricerca web dal contesto
 * @param contextKey - Chiave del contesto (opzionale, se non fornita restituisce tutti i risultati)
 * @returns Array di risultati della ricerca web
 */
export function getWebSearchResults(contextKey?: string): any[] {
  if (contextKey) {
    return webSearchResultsContext.get(contextKey) || []
  }
  // Se non c'è una chiave specifica, restituisce tutti i risultati più recenti
  const allResults: any[] = []
  webSearchResultsContext.forEach((results) => {
    allResults.push(...results)
  })
  return allResults
}

/**
 * Pulisce i risultati della ricerca web dal contesto
 * @param contextKey - Chiave del contesto (opzionale, se non fornita pulisce tutto)
 */
export function clearWebSearchResults(contextKey?: string): void {
  if (contextKey) {
    webSearchResultsContext.delete(contextKey)
  } else {
    webSearchResultsContext.clear()
  }
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
  model: `openrouter/google/gemini-2.5-flash`,
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
    web_search: {
      id: 'web_search',
      name: 'web_search',
      description: 'Cerca informazioni sul web quando i documenti nella knowledge base non sono sufficienti per rispondere completamente alla domanda. Usa questo tool solo quando le fonti disponibili non coprono completamente la query dell\'utente.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Query di ricerca web',
          },
        },
        required: ['query'],
      },
      execute: webSearchTool,
    },
  },
})

// React agent - per ora usiamo l'agent stesso
export const reactRagAgent = ragAgent
