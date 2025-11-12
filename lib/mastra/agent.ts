import { Agent } from '@mastra/core/agent'
import { AsyncLocalStorage } from 'async_hooks'
import { DEFAULT_FLASH_MODEL, DEFAULT_PRO_MODEL, normalizeModelId } from '@/lib/llm/models'
import { inferMetaQueryFolder } from '@/lib/embeddings/meta-folder-inference'
import type { SearchResult } from '@/lib/supabase/database.types'

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

const CHUNK_PREVIEW_MAX_LENGTH = 600
const DOCUMENT_PREVIEW_MAX_LENGTH = 3200

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength)}...`
}

function normalizeFolderQuery(name: string): string {
  return name
    .trim()
    .replace(/^(di|del|della|dei|degli|delle)\s+/i, '')
    .replace(/^(la|il|lo|i|gli|le)\s+/i, '')
    .trim()
}

/**
 * Context per passare traceId e risultati senza race conditions
 * Usa AsyncLocalStorage per mantenere il contesto per ogni richiesta
 */
interface AgentContext {
  traceId: string | null
  webSearchResults: any[]
  metaQueryDocuments: Array<{
    id: string
    filename: string
    index: number
    folder?: string | null
    chunkCount?: number
    chunkPreviews?: Array<{ chunkIndex: number; content: string }>
    contentPreview?: string
  }>
  metaQueryChunks?: SearchResult[] // Chunks effettivi dei documenti recuperati da meta query
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
      findBestMatchingFolder,
    } = await import('@/lib/supabase/meta-queries')

    // Use unified analysis (cached internally)
    const analysis = await analyzeQuery(query)
    
    if (!analysis.isMeta) {
      return {
        isMeta: false,
        message: 'Questa query non sembra essere una query meta sul database.',
      }
    }

    let metaType = analysis.metaType // Make it mutable so we can change it
    const queryLower = query.toLowerCase()

    // Determine which function to call based on query content and metaType
    let toolOutput: unknown
    
    // IMPORTANT: Detect if user wants DOCUMENTS in folder vs INFO about folders
    // Query like "documenti nella cartella X" should list documents, not folder stats
    if (metaType === 'folders') {
      const wantsDocuments = queryLower.includes('documenti') || queryLower.includes('document') || 
                             queryLower.includes('file') || queryLower.includes('norme') ||
                             queryLower.includes('elenca') || queryLower.includes('list')
      if (wantsDocuments) {
        console.log('[mastra/agent] Folders metaType detected but user wants documents, changing to list')
        metaType = 'list' // Change to list so it goes to the right branch below
      }
    }

    if (metaType === 'stats' || queryLower.includes('quanti') || queryLower.includes('statistiche') || queryLower.includes('statistics')) {
      // Statistics query
      const stats = await getDatabaseStats()
      toolOutput = {
        isMeta: true,
        metaType: 'stats',
        data: stats,
      }
    } else if ((metaType === 'folders' || queryLower.includes('cartelle') || queryLower.includes('folder')) && !toolOutput) {
      // Folders info query (list of folders, folder statistics)
      // Note: If user wants DOCUMENTS in folder, metaType is already changed to 'list' above
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
    }
    
    if ((metaType === 'structure' || queryLower.includes('tipo') || queryLower.includes('type') || queryLower.includes('formato') || queryLower.includes('format')) && !toolOutput) {
      // Document types query
      const types = await getDocumentTypesMeta()
      toolOutput = {
        isMeta: true,
        metaType: 'structure',
        data: {
          documentTypes: types,
        },
      }
    }
    
    if ((metaType === 'list' || queryLower.includes('elenca') || queryLower.includes('lista') || queryLower.includes('list') || queryLower.includes('quali') || queryLower.includes('che norme') || queryLower.includes('che documenti')) && !toolOutput) {
      // List documents query
      // Try to extract filters from query
      let folder: string | null | undefined
      let fileType: string | undefined
      let limit = 50
      
      // IMPROVED: Extract folder filter with better patterns
      let folderQuery: string | null = null
      
      // Pattern 1: "cartella X" or "folder X"
      const folderPattern1 = query.match(/(?:cartella|folder)\s+["']?([^"'.!?]+?)["']?(?:\s|$|,|\.|!|\?)/i)
      if (folderPattern1) {
        folderQuery = normalizeFolderQuery(folderPattern1[1])
      }
      
      // Pattern 2: "nella X" or "nella cartella X" (more flexible)
      if (!folderQuery) {
        const folderPattern2 = query.match(/(?:nella|nella cartella|nel|nel folder|in|in the|in folder|in cartella)\s+["']?([^"'.!?]+?)["']?(?:\s|$|,|\.|!|\?)/i)
        if (folderPattern2) {
          folderQuery = normalizeFolderQuery(folderPattern2[1])
        }
      }
      
      // Pattern 3: "contenuti nella X" or "che sono in X"
      if (!folderQuery) {
        const folderPattern3 = query.match(/(?:contenuti|che sono|presenti|salvati)\s+(?:nella|nel|in)\s+["']?([^"'.!?]+?)["']?(?:\s|$|,|\.|!|\?)/i)
        if (folderPattern3) {
          folderQuery = normalizeFolderQuery(folderPattern3[1])
        }
      }
      
      console.log('[mastra/agent] Extracted folder query:', folderQuery)
      
      let folderNeedsInference = false

      // If we found a folder query, use fuzzy matching to find the best match
      if (folderQuery) {
        const matchedFolder = await findBestMatchingFolder(folderQuery, 0.6)
        if (matchedFolder) {
          folder = matchedFolder
          console.log('[mastra/agent] Using matched folder:', folder)
        } else {
          folderNeedsInference = true
          // No good match found, try using the raw query as-is (might be exact)
          folder = folderQuery
          console.log('[mastra/agent] No fuzzy match found, using raw folder query:', folder)
        }
      } else {
        folderNeedsInference = true
      }
      
      if (folder && folder.trim().length > 0 && folder.trim().length <= 2) {
        folderNeedsInference = true
        console.log('[mastra/agent] Folder candidate too short, triggering LLM inference', { folder })
      }

      if (folderNeedsInference) {
        const folderMetaList = await listFoldersMeta()
        const folderNames = folderMetaList.map((meta) => meta.name)
        console.log('[mastra/agent] Running LLM folder inference', {
          querySnippet: query.slice(0, 80),
          availableFolders: folderNames.length,
          foldersSample: folderNames.slice(0, 10),
        })

        const inference = await inferMetaQueryFolder(query, folderNames)

        if (inference.folder) {
          folder = inference.folder
          console.log('[mastra/agent] LLM inferred folder:', {
            folder,
            confidence: inference.confidence.toFixed(2),
            reasoning: inference.reasoning,
            raw: inference.rawFolder,
          })
        } else {
          console.log('[mastra/agent] LLM folder inference returned no match', {
            reasoning: inference.reasoning,
            raw: inference.rawFolder,
          })
          folder = undefined
        }
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
      
      // IMPORTANT: Recupera i chunks dei documenti trovati
      // Questo permette all'LLM di avere il CONTENUTO effettivo, non solo i nomi
      const { getChunksByDocumentIds } = await import('@/lib/supabase/vector-operations')
      const documentIds = documents.map(doc => doc.id)
      const chunksPerDocument = 5 // Primi 5 chunks per documento per avere overview
      const documentChunks = await getChunksByDocumentIds(documentIds, chunksPerDocument)
      
      console.log('[mastra/agent] Retrieved chunks for meta query documents:', {
        documentsCount: documents.length,
        chunksCount: documentChunks.length,
        avgChunksPerDoc: documents.length > 0 ? (documentChunks.length / documents.length).toFixed(1) : '0.0',
      })

      // Organizza i chunks per documento
      const chunksByDocument = new Map<string, SearchResult[]>()
      documentChunks.forEach((chunk) => {
        const current = chunksByDocument.get(chunk.document_id) || []
        current.push(chunk)
        chunksByDocument.set(chunk.document_id, current)
      })

      const documentsDetailed = documents.map((doc, idx) => {
        const docChunks = (chunksByDocument.get(doc.id) || [])
          .sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0))
          .slice(0, chunksPerDocument)

        const chunkPreviews = docChunks.map((chunk) => ({
          chunkIndex: chunk.chunk_index ?? 0,
          content: truncateText(chunk.content, CHUNK_PREVIEW_MAX_LENGTH),
        }))

        const combinedPreview = chunkPreviews.length > 0
          ? chunkPreviews
              .map((preview) => `[#${preview.chunkIndex}] ${preview.content}`)
              .join('\n\n')
          : ''

        return {
          id: doc.id,
          filename: doc.filename,
          folder: doc.folder || null,
          index: idx + 1, // Indici partono da 1 per le citazioni
          chunkCount: doc.chunks_count ?? docChunks.length,
          chunkPreviews,
          contentPreview: combinedPreview ? truncateText(combinedPreview, DOCUMENT_PREVIEW_MAX_LENGTH) : '',
          fileType: doc.file_type,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
          processingStatus: doc.processing_status,
        }
      })
      
      // Salva i documenti E i chunks nel contesto locale (senza race conditions)
      const context = getAgentContext()
      
      if (context) {
        context.metaQueryDocuments = documentsDetailed
        // CRITICAL: Salva anche i chunks per passarli come contesto RAG
        context.metaQueryChunks = documentChunks
      }
      
      console.log('[mastra/agent] Meta query documents saved to context:', {
        documentsCount: documentsDetailed.length,
        chunksCount: documentChunks.length,
      })
      
      toolOutput = {
        isMeta: true,
        metaType: 'list',
        data: {
          documents: documentsDetailed,
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
export function getMetaQueryDocuments(): Array<{
  id: string
  filename: string
  index: number
  folder?: string | null
  chunkCount?: number
  chunkPreviews?: Array<{ chunkIndex: number; content: string }>
  contentPreview?: string
}> {
  const context = getAgentContext()
  return context?.metaQueryDocuments || []
}

/**
 * Recupera i chunks dei documenti dalle query meta dal contesto corrente
 * @returns Array di SearchResult con i chunks dei documenti meta query
 */
export function getMetaQueryChunks(): SearchResult[] {
  const context = getAgentContext()
  return context?.metaQueryChunks || []
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

// Tools configuration (shared between agents)
const agentTools = {
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
}

const BASE_AGENT_INSTRUCTIONS =
  'Sei un assistente AI per un team di consulenza. Rispondi alle domande in modo accurato e professionale.'

const dynamicAgentCache = new Map<string, Agent>()

/**
 * Agent con Gemini 2.5 Flash - per query normali
 * Più veloce ed economico, adatto per la maggior parte delle query
 */
export const ragAgentFlash = new Agent({
  name: 'rag-consulting-agent-flash',
  instructions: BASE_AGENT_INSTRUCTIONS,
  model: DEFAULT_FLASH_MODEL,
  tools: agentTools,
})

/**
 * Agent con Gemini 2.5 Pro - per query comparative
 * Più potente e accurato, utilizzato per analisi comparative complesse che richiedono
 * ragionamento avanzato e sintesi cross-document
 */
export const ragAgentPro = new Agent({
  name: 'rag-consulting-agent-pro',
  instructions: BASE_AGENT_INSTRUCTIONS,
  model: DEFAULT_PRO_MODEL,
  tools: agentTools,
})

/**
 * Agent predefinito (Flash) - per retrocompatibilità
 * @deprecated Usa ragAgentFlash o ragAgentPro invece
 */
export const ragAgent = ragAgentFlash

// React agent - per ora usiamo l'agent Flash
export const reactRagAgent = ragAgentFlash

/**
 * Restituisce l'agent Mastra corretto in base al modello richiesto.
 * Implementa una cache per evitare di creare istanze duplicate.
 *
 * @param model - Modello richiesto dalla configurazione del prompt
 * @returns Istanza di Agent configurata per il modello richiesto
 */
export function getRagAgentForModel(model?: string | null): Agent {
  const normalizedModel = normalizeModelId(model)

  if (normalizedModel === ragAgentFlash.model) {
    return ragAgentFlash
  }

  if (normalizedModel === ragAgentPro.model) {
    return ragAgentPro
  }

  const cached = dynamicAgentCache.get(normalizedModel)
  if (cached) {
    return cached
  }

  const agentNameSuffix = normalizedModel
    .replace(/^openrouter\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'custom'

  const agent = new Agent({
    name: `rag-consulting-agent-${agentNameSuffix}`,
    instructions: BASE_AGENT_INSTRUCTIONS,
    model: normalizedModel,
    tools: agentTools,
  })

  dynamicAgentCache.set(normalizedModel, agent)

  return agent
}
