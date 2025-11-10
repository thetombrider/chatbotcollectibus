import { Agent } from '@mastra/core/agent'
import { AsyncLocalStorage } from 'async_hooks'

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

/**
 * Context per passare traceId e risultati senza race conditions
 * Usa AsyncLocalStorage per mantenere il contesto per ogni richiesta
 */
interface AgentContext {
  traceId: string | null
  webSearchResults: any[]
  metaQueryDocuments: Array<{ id: string; filename: string; index: number }>
}

const agentContextStore = new AsyncLocalStorage<AgentContext>()

/**
 * Esegue una funzione con un contesto agent
 */
export async function runWithAgentContext<T>(
  context: AgentContext,
  fn: () => Promise<T>
): Promise<T> {
  return agentContextStore.run(context, fn)
}

/**
 * Ottiene il contesto agent corrente
 */
function getAgentContext(): AgentContext | undefined {
  return agentContextStore.getStore()
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

// Tool per ricerca web con Tavily
async function webSearchTool({ query }: { query: string }) {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty')
  }

  const context = getAgentContext()
  // const traceId = context?.traceId || null

  // Log per debugging: verifica se il context è disponibile
  console.log('[mastra/agent] Web search tool called:', {
    hasContext: !!context,
    contextWebResultsLength: context?.webSearchResults?.length || 0,
    query: query.substring(0, 50),
  })

  // TODO: Re-implement with new Langfuse patterns (createSpan, etc.)
  // const { createToolSpan, finalizeSpan } = await import('@/lib/observability/langfuse')
  // const toolSpanId = createToolSpan(traceId, 'web_search', { query })

  try {
    // Usa Tavily per la ricerca web
    // Nota: Questo tool viene chiamato solo quando le fonti nella KB non sono sufficienti
    const { searchWeb } = await import('@/lib/tavily/web-search')
    
    const results = await searchWeb(query, 5)
    
    // Formatta i risultati con indici numerici espliciti per le citazioni
    const formattedResults = (results.results || []).map((result, index) => ({
      index: index + 1, // Indice numerico per citazione (1, 2, 3...)
      title: result.title || 'Senza titolo',
      url: result.url || '',
      content: result.content || '',
    }))
    
    // Salva i risultati FORMATTATI nel contesto locale (senza race conditions)
    // IMPORTANTE: Salva i risultati formattati con gli indici, non i risultati RAW
    if (context) {
      context.webSearchResults = formattedResults
      console.log('[mastra/agent] Web search results saved to context:', {
        resultsCount: formattedResults.length,
        sampleIndex: formattedResults[0]?.index,
        contextHasResults: context.webSearchResults.length > 0,
      })
    } else {
      console.error('[mastra/agent] WARNING: Context not available when saving web search results!', {
        resultsCount: formattedResults.length,
      })
    }

    const toolOutput = {
      results: formattedResults,
      query: results.query,
      citationFormat: 'IMPORTANTE: Cita questi risultati usando il formato [web:N] dove N è l\'indice numerico (1, 2, 3, ecc.). Esempio: [web:1] per il primo risultato, [web:2] per il secondo, ecc. NON usare il contextKey o altri identificatori.',
    }

    // TODO: Re-implement span finalization
    // finalizeSpan(toolSpanId, {
    //   resultsCount: formattedResults.length,
    //   query: results.query,
    // }, {
    //   toolName: 'web_search',
    // })

    return toolOutput
  } catch (error) {
    console.error('[mastra/agent] Web search failed:', error)
    
    // TODO: Re-implement span finalization
    // finalizeSpan(toolSpanId, undefined, {
    //   toolName: 'web_search',
    //   error: error instanceof Error ? error.message : 'Unknown error',
    // })
    
    throw new Error(`Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Tool per query meta sul database
async function metaQueryTool({ query }: { query: string }) {
  if (!query || query.trim().length === 0) {
    throw new Error('Query cannot be empty')
  }

  // const context = getAgentContext()
  // const traceId = context?.traceId || null

  // TODO: Re-implement with new Langfuse patterns (createSpan, etc.)
  // const { createToolSpan, finalizeSpan } = await import('@/lib/observability/langfuse')
  // const toolSpanId = createToolSpan(traceId, 'meta_query', { query })

  try {
    const { analyzeQuery } = await import('@/lib/embeddings/query-analysis')
    const {
      getDatabaseStats,
      listDocumentsMeta,
      listFoldersMeta,
      getDocumentTypesMeta,
      getFolderStats,
    } = await import('@/lib/supabase/meta-queries')

    // Use unified analysis (cached internally)
    const analysis = await analyzeQuery(query)
    
    if (!analysis.isMeta) {
      return {
        isMeta: false,
        message: 'Questa query non sembra essere una query meta sul database.',
      }
    }

    const metaType = analysis.metaType
    const queryLower = query.toLowerCase()

    // Determine which function to call based on query content and metaType
    let toolOutput: unknown

    if (metaType === 'stats' || queryLower.includes('quanti') || queryLower.includes('statistiche') || queryLower.includes('statistics')) {
      // Statistics query
      const stats = await getDatabaseStats()
      toolOutput = {
        isMeta: true,
        metaType: 'stats',
        data: stats,
      }
    } else if (metaType === 'folders' || queryLower.includes('cartelle') || queryLower.includes('folder')) {
      // Folders query
      const folders = await listFoldersMeta()
      
      // Check if asking about specific folder
      const folderMatch = query.match(/(?:cartella|folder)\s+["']?([^"']+)["']?/i)
      if (folderMatch) {
        const folderName = folderMatch[1]
        const folderStats = await getFolderStats(folderName)
        toolOutput = {
          isMeta: true,
          metaType: 'folders',
          data: {
            allFolders: folders,
            specificFolder: folderStats,
          },
        }
      } else {
        toolOutput = {
          isMeta: true,
          metaType: 'folders',
          data: {
            allFolders: folders,
          },
        }
      }
    } else if (metaType === 'structure' || queryLower.includes('tipo') || queryLower.includes('type') || queryLower.includes('formato') || queryLower.includes('format')) {
      // Document types query
      const types = await getDocumentTypesMeta()
      toolOutput = {
        isMeta: true,
        metaType: 'structure',
        data: {
          documentTypes: types,
        },
      }
    } else if (metaType === 'list' || queryLower.includes('elenca') || queryLower.includes('lista') || queryLower.includes('list') || queryLower.includes('quali') || queryLower.includes('che norme') || queryLower.includes('che documenti')) {
      // List documents query
      // Try to extract filters from query
      let folder: string | null | undefined
      let fileType: string | undefined
      let limit = 50
      
      // Extract folder filter
      const folderMatch = query.match(/(?:cartella|folder|in)\s+["']?([^"']+)["']?/i)
      if (folderMatch) {
        folder = folderMatch[1]
      }
      
      // Extract file type filter
      const typeMatch = query.match(/(?:tipo|type|formato|format)\s+["']?([^"']+)["']?/i)
      if (typeMatch) {
        fileType = typeMatch[1]
      }
      
      // Extract limit
      const limitMatch = query.match(/(?:primi|first|top|limite|limit)\s+(\d+)/i)
      if (limitMatch) {
        limit = parseInt(limitMatch[1], 10)
      }
      
      const documents = await listDocumentsMeta({
        folder,
        file_type: fileType,
        limit,
      })
      
      // Salva i documenti nel contesto locale (senza race conditions)
      const context = getAgentContext()
      const documentsWithIndex = documents.map((doc, idx) => ({
        id: doc.id,
        filename: doc.filename,
        index: idx + 1, // Indici partono da 1 per le citazioni
      }))
      
      if (context) {
        context.metaQueryDocuments = documentsWithIndex
      }
      
      console.log('[mastra/agent] Meta query documents saved to context:', {
        documentsCount: documentsWithIndex.length,
      })
      
      toolOutput = {
        isMeta: true,
        metaType: 'list',
        data: {
          documents: documents.map((doc, idx) => ({
            ...doc,
            citationIndex: idx + 1, // Indice per citazione [cit:N]
          })),
          count: documents.length,
          filters: {
            folder,
            file_type: fileType,
            limit,
          },
        },
      }
    } else {
      // Default: return general stats
      const stats = await getDatabaseStats()
      toolOutput = {
        isMeta: true,
        metaType: 'stats',
        data: stats,
      }
    }

    // TODO: Re-implement span finalization
    // finalizeSpan(toolSpanId, {
    //   metaType: (toolOutput as { metaType?: string })?.metaType,
    //   isMeta: (toolOutput as { isMeta?: boolean })?.isMeta,
    // }, {
    //   toolName: 'meta_query',
    // })

    return toolOutput
  } catch (error) {
    console.error('[mastra/agent] Meta query failed:', error)
    
    // TODO: Re-implement span finalization
    // finalizeSpan(toolSpanId, undefined, {
    //   toolName: 'meta_query',
    //   error: error instanceof Error ? error.message : 'Unknown error',
    // })
    
    throw new Error(`Meta query failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Recupera i risultati della ricerca web dal contesto corrente
 * @returns Array di risultati della ricerca web
 */
export function getWebSearchResults(): any[] {
  const context = getAgentContext()
  return context?.webSearchResults || []
}

/**
 * Pulisce i risultati della ricerca web dal contesto corrente
 */
export function clearWebSearchResults(): void {
  const context = getAgentContext()
  if (context) {
    context.webSearchResults = []
  }
}

/**
 * Recupera i documenti dalle query meta dal contesto corrente
 * @returns Array di documenti con id, filename e index
 */
export function getMetaQueryDocuments(): Array<{ id: string; filename: string; index: number }> {
  const context = getAgentContext()
  return context?.metaQueryDocuments || []
}

/**
 * Pulisce i documenti dalle query meta dal contesto corrente
 */
export function clearMetaQueryDocuments(): void {
  const context = getAgentContext()
  if (context) {
    context.metaQueryDocuments = []
  }
}

// Configurazione agent con Mastra
// Per OpenRouter, usa il formato: openrouter/provider/model
// Mastra legge automaticamente OPENROUTER_API_KEY quando usa il prefisso openrouter/
// 
// NOTA: Il prompt nelle `instructions` viene sovrascritto dinamicamente in app/api/chat/route.ts
// tramite la funzione buildSystemPrompt() da lib/llm/system-prompt.ts.
// Questo prompt statico serve solo come fallback generico e non viene utilizzato nella pratica.
export const ragAgent = new Agent({
  name: 'rag-consulting-agent',
  instructions: `Sei un assistente AI per un team di consulenza. Rispondi alle domande in modo accurato e professionale.`,
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
      description: 'Cerca informazioni sul web quando i documenti nella knowledge base non sono sufficienti per rispondere completamente alla domanda. Usa questo tool solo quando le fonti disponibili non coprono completamente la query dell\'utente. IMPORTANTE: Quando citi i risultati della ricerca web nella tua risposta, usa SEMPRE il formato [web:N] dove N è l\'indice numerico del risultato (1, 2, 3, ecc.). Esempio: [web:1] per il primo risultato, [web:2] per il secondo, [web:1,2,3] per più risultati. NON usare altri formati o identificatori.',
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
    meta_query: {
      id: 'meta_query',
      name: 'meta_query',
      description: 'Ottieni informazioni sul database stesso (statistiche, liste documenti, cartelle, tipi di file) invece che sul contenuto dei documenti. Usa questo tool quando l\'utente chiede "quanti documenti ci sono", "che norme ci sono salvate", "quali cartelle esistono", "quali tipi di file ci sono", ecc.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Query meta sul database (es. "quanti documenti ci sono", "che norme ci sono", "quali cartelle esistono")',
          },
        },
        required: ['query'],
      },
      execute: metaQueryTool,
    },
  },
})

// React agent - per ora usiamo l'agent stesso
export const reactRagAgent = ragAgent
