import { NextRequest, NextResponse } from 'next/server'
import { ragAgent, getWebSearchResults, clearWebSearchResults, getMetaQueryDocuments, clearMetaQueryDocuments } from '@/lib/mastra/agent'
import { generateEmbedding } from '@/lib/embeddings/openai'
import { findCachedResponse, saveCachedResponse } from '@/lib/supabase/semantic-cache'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { SearchResult } from '@/lib/supabase/database.types'
import { enhanceQueryIfNeeded } from '@/lib/embeddings/query-enhancement'
import { detectComparativeQueryLLM } from '@/lib/embeddings/comparative-query-detection'
import { buildSystemPrompt } from '@/lib/llm/system-prompt'

/**
 * Estrae tutti gli indici citati dal contenuto del messaggio (versione server-side)
 * @param content - Contenuto del messaggio con citazioni [cit:1,2,3] o [cit:8,9]
 * @returns Array di indici unici citati, ordinati
 */
function extractCitedIndices(content: string): number[] {
  const indices = new Set<number>()
  const regex = /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
  const matches = content.matchAll(regex)
  
  for (const match of matches) {
    const indicesStr = match[1]
    const nums = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    
    nums.forEach(n => {
      if (!isNaN(n) && n > 0) {
        indices.add(n)
      }
    })
  }
  
  return Array.from(indices).sort((a, b) => a - b)
}

/**
 * Estrae tutti gli indici delle citazioni web dal contenuto del messaggio
 * @param content - Contenuto del messaggio con citazioni web [web:1,2,3] o [web:8,9]
 * @returns Array di indici unici citati, ordinati
 */
function extractWebCitedIndices(content: string): number[] {
  const indices = new Set<number>()
  const regex = /\[web[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
  const matches = content.matchAll(regex)
  
  for (const match of matches) {
    const indicesStr = match[1]
    const nums = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    
    nums.forEach(n => {
      if (!isNaN(n) && n > 0) {
        indices.add(n)
      }
    })
  }
  
  return Array.from(indices).sort((a, b) => a - b)
}

export const maxDuration = 60 // 60 secondi per Vercel

/**
 * Esegue ricerche multiple per query comparative e combina i risultati
 * 
 * @param terms - Regulation terms to search for (e.g., ["GDPR", "ESPR"])
 * @param originalQuery - Original user query (may already be enhanced)
 * @param originalEmbedding - Embedding of the original query
 * @param queryAlreadyEnhanced - Whether the originalQuery has already been enhanced (skip re-enhancement)
 * @param articleNumber - Optional article number to filter results
 */
async function performMultiQuerySearch(
  terms: string[], 
  originalQuery: string,
  originalEmbedding: number[],
  queryAlreadyEnhanced: boolean = false,
  articleNumber?: number
): Promise<SearchResult[]> {
  console.log('[api/chat] Performing multi-query search for terms:', terms)
  console.log('[api/chat] Query already enhanced:', queryAlreadyEnhanced)
  
  // Esegui una ricerca per ogni termine
  const searchPromises = terms.map(async (term) => {
    try {
      // Crea una query mirata per questo termine
      // Se la query è già stata enhanced, usa solo il termine senza aggiungere la query
      // per evitare doppia espansione
      const targetedQuery = queryAlreadyEnhanced 
        ? `${term} ${originalQuery}` 
        : `${term} ${originalQuery}`
      
      const targetedEmbedding = await generateEmbedding(targetedQuery)
      
      // Ricerca con threshold più alto per risultati più rilevanti
      // Pass articleNumber to filter by article if specified
      const results = await hybridSearch(targetedEmbedding, targetedQuery, 8, 0.25, 0.7, articleNumber)
      
      console.log(`[api/chat] Results for ${term}:`, results.length, 
        results.length > 0 ? `(best: ${results[0]?.similarity.toFixed(3)})` : '')
      
      return results
    } catch (err) {
      console.error(`[api/chat] Search failed for term ${term}:`, err)
      return []
    }
  })
  
  // Attendi tutte le ricerche
  const allResults = await Promise.all(searchPromises)
  
  // Combina i risultati, rimuovi duplicati, ordina per similarity
  const combinedMap = new Map<string, SearchResult>()
  allResults.flat().forEach((result: SearchResult) => {
    if (!combinedMap.has(result.id) || combinedMap.get(result.id)!.similarity < result.similarity) {
      combinedMap.set(result.id, result)
    }
  })
  
  const combined = Array.from(combinedMap.values())
    .sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity)
    .slice(0, 15) // Top 15 per avere più diversità
  
  console.log('[api/chat] Combined results:', combined.length, 
    combined.length > 0 ? `(best: ${combined[0]?.similarity.toFixed(3)})` : '')
  
  // Se abbiamo pochi risultati dalla multi-query, aggiungi anche dalla query originale
  if (combined.length < 10) {
    console.log('[api/chat] Adding results from original query to boost coverage')
    const originalResults = await hybridSearch(originalEmbedding, originalQuery, 10, 0.25, 0.7, articleNumber)
    
    originalResults.forEach((result: SearchResult) => {
      if (!combinedMap.has(result.id)) {
        combined.push(result)
      }
    })
    
    // Riordina e limita
    combined.sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity)
    combined.splice(15)
  }
  
  return combined
}

export async function POST(req: NextRequest) {
  try {
    const { message, conversationId, webSearchEnabled = false } = await req.json()
    
    console.log('[api/chat] Request received:', {
      messageLength: message?.length || 0,
      conversationId: conversationId || 'none',
      webSearchEnabled,
      webSearchEnabledType: typeof webSearchEnabled,
    })

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    // Save user message first (before any processing)
    if (conversationId) {
      try {
        // Conta i messaggi esistenti per verificare se è il primo messaggio
        const { count: messageCount } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
        
        const isFirstMessage = (messageCount || 0) === 0
        
        await supabaseAdmin.from('messages').insert({
          conversation_id: conversationId,
          role: 'user',
          content: message,
        })
        
        // Aggiorna il titolo della conversazione se è il primo messaggio
        if (isFirstMessage) {
          const title = message.substring(0, 50).trim() || 'Nuova conversazione'
          await supabaseAdmin
            .from('conversations')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', conversationId)
        }
      } catch (err) {
        console.error('[api/chat] Failed to save user message:', err)
        // Continue anyway, don't fail the request
      }
    }

    // Recupera gli ultimi 10 messaggi per context conversazionale
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (conversationId) {
      try {
        const { data: historyMessages } = await supabaseAdmin
          .from('messages')
          .select('role, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(10)
        
        conversationHistory = historyMessages || []
        console.log('[api/chat] Retrieved conversation history:', conversationHistory.length, 'messages')
      } catch (err) {
        console.error('[api/chat] Failed to retrieve conversation history:', err)
        // Continue with empty history
      }
    }

    // Create stream early to send status messages during processing
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // STEP 1: Query Enhancement (before embedding and caching)
          // Uses LLM to detect if query is generic/broad/incomplete and expands it
          console.log('[api/chat] Step 1: Query enhancement')
          
          // Send status message: Analisi della query
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'status', message: 'Analisi della query...' })}\n\n`)
          )
          
          const enhancementResult = await enhanceQueryIfNeeded(message)
          const queryToEmbed = enhancementResult.enhanced
          const wasEnhanced = enhancementResult.shouldEnhance
          const articleNumber = enhancementResult.articleNumber // Extract article number if detected
          
          console.log('[api/chat] Enhancement result:', {
            original: message.substring(0, 50),
            enhanced: queryToEmbed.substring(0, 100),
            wasEnhanced,
            fromCache: enhancementResult.fromCache,
            articleNumber,
          })

          // STEP 2: Check semantic cache (using enhanced query for embedding)
          console.log('[api/chat] Step 2: Semantic cache lookup')
          const queryEmbedding = await generateEmbedding(queryToEmbed)
          const cached = await findCachedResponse(queryEmbedding)

          if (cached) {
            console.log('[api/chat] Found cached response')
            console.log('[api/chat] Cached response_text length:', cached.response_text?.length || 0)
            console.log('[api/chat] Cached response_text preview:', cached.response_text?.substring(0, 100) || 'EMPTY')
            console.log('[api/chat] Cached sources count:', cached.sources?.length || 0)
            
            if (!cached.response_text || cached.response_text.trim().length === 0) {
              console.error('[api/chat] ERROR: Cached response is empty!')
              // Continue with normal flow instead of using cache
            } else {
              // Processa le citazioni nel testo cached usando le sources salvate
              let processedCachedResponse = cached.response_text
              let cachedSources = cached.sources || []
              
              // Estrai citazioni dal testo cached
              const cachedCitedIndices = extractCitedIndices(cached.response_text)
              console.log('[api/chat] Cached response cited indices:', cachedCitedIndices)
              
              if (cachedCitedIndices.length > 0 && cachedSources.length > 0) {
                // Verifica che gli indici citati corrispondano alle sources salvate
                const validCitedIndices = cachedCitedIndices.filter(idx => 
                  cachedSources.some(s => s.index === idx)
                )
                
                if (validCitedIndices.length > 0) {
                  // Filtra sources per includere solo quelle citate
                  const filteredCachedSources = validCitedIndices
                    .map(idx => cachedSources.find(s => s.index === idx))
                    .filter((s): s is typeof cachedSources[0] => s !== undefined)
                    .map((s, idx) => ({
                      ...s,
                      index: idx + 1, // Rinumerazione sequenziale (1, 2, 3...)
                    }))
                  
                  // Crea mappatura da indice originale a nuovo indice
                  const indexMapping = new Map<number, number>()
                  validCitedIndices.forEach((originalIndex) => {
                    // Trova la source originale con questo indice
                    const originalSource = cachedSources.find(s => s.index === originalIndex)
                    if (originalSource) {
                      // Trova la posizione nella lista filtrata (usando documentId come identificatore univoco)
                      const newIndex = filteredCachedSources.findIndex(s => s.documentId === originalSource.documentId && s.chunkIndex === originalSource.chunkIndex) + 1
                      if (newIndex > 0) {
                        indexMapping.set(originalIndex, newIndex)
                        console.log(`[api/chat] Cached citation mapping: original ${originalIndex} -> new ${newIndex}`)
                      }
                    }
                  })
                  
                  // Rinumerà le citazioni nel testo
                  processedCachedResponse = cached.response_text.replace(
                    /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g,
                    (match, indicesStr) => {
                      const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
                      const newIndices = indices
                        .map((oldIdx: number) => indexMapping.get(oldIdx))
                        .filter((newIdx: number | undefined): newIdx is number => newIdx !== undefined)
                        .sort((a: number, b: number) => a - b)
                      
                      if (newIndices.length === 0) {
                        return '' // Rimuovi citazione se non c'è corrispondenza
                      }
                      
                      return `[cit:${newIndices.join(',')}]`
                    }
                  )
                  
                  cachedSources = filteredCachedSources
                  console.log('[api/chat] Cached response citations processed, sources found:', cachedSources.length)
                } else {
                  // Nessuna citazione valida corrisponde alle sources, rimuovi tutte le citazioni
                  console.warn('[api/chat] Cached response citations do not match saved sources, removing citations')
                  processedCachedResponse = cached.response_text.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, '')
                  cachedSources = []
                }
              } else if (cachedCitedIndices.length > 0 && cachedSources.length === 0) {
                // Ci sono citazioni ma non ci sono sources salvate, rimuovi le citazioni
                console.warn('[api/chat] Cached response has citations but no saved sources, removing citations')
                processedCachedResponse = cached.response_text.replace(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g, '')
              }
              
              // Send cached response (con citazioni processate)
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', content: processedCachedResponse })}\n\n`)
              )
              
              // Save assistant message to database
              if (conversationId) {
                try {
                  console.log('[api/chat] Saving cached assistant message to database')
                  console.log('[api/chat] Cached content length:', processedCachedResponse.length)
                  const { error } = await supabaseAdmin.from('messages').insert({
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: processedCachedResponse.trim(),
                    metadata: {
                      cached: true,
                      sources: cachedSources,
                    },
                  })
                  if (error) {
                    console.error('[api/chat] Failed to save cached assistant message:', error)
                  } else {
                    console.log('[api/chat] Cached assistant message saved successfully')
                  }
                } catch (err) {
                  console.error('[api/chat] Failed to save cached assistant message:', err)
                }
              }

              // Invia sources se presenti
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', sources: cachedSources })}\n\n`)
              )
              controller.close()
              return
            }
          }

          // STEP 3: Vector search per context con hybrid search migliorata
          // Rileva se è una query comparativa e usa strategia multi-query
          console.log('[api/chat] Step 3: Vector search')
          
          // Use enhanced query for comparative detection (better pattern matching)
          const comparativeTerms = await detectComparativeQueryLLM(message, wasEnhanced ? queryToEmbed : undefined)
          
          // Send status message for search
          if (comparativeTerms) {
            console.log('[api/chat] Comparative query detected for terms:', comparativeTerms)
            const statusMessage = `Analisi comparativa tra ${comparativeTerms.join(' e ')}...`
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: 'status', message: statusMessage })}\n\n`)
            )
          } else {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: 'status', message: 'Ricerca documenti nella knowledge base...' })}\n\n`)
            )
          }
          
          let searchResults
          
          if (comparativeTerms) {
            // Usa strategia multi-query per query comparative
            // Pass flag to indicate query is already enhanced (avoid double expansion)
            searchResults = await performMultiQuerySearch(comparativeTerms, queryToEmbed, queryEmbedding, wasEnhanced, articleNumber)
          } else {
            // Query standard: hybrid search normale
            // Use enhanced query for better results
            // Parametri: top-10, threshold 0.3, vector_weight 0.7
            // Pass articleNumber if detected to filter chunks by article
            searchResults = await hybridSearch(queryEmbedding, queryToEmbed, 10, 0.3, 0.7, articleNumber)
          }
          
          // Log dei risultati per debugging
          console.log('[api/chat] Search results:', searchResults.map((r: SearchResult) => ({
            filename: r.document_filename,
            similarity: r.similarity.toFixed(3),
            vector_score: r.vector_score?.toFixed(3),
            text_score: r.text_score?.toFixed(3),
            preview: r.content.substring(0, 100) + '...'
          })))
          
          // Threshold per filtrare i risultati rilevanti
          // Se viene filtrato per articolo specifico, abbassa la soglia perché 
          // l'utente ha chiesto esplicitamente quell'articolo
          const RELEVANCE_THRESHOLD = articleNumber ? 0.1 : 0.40
          console.log('[api/chat] Relevance threshold:', RELEVANCE_THRESHOLD, articleNumber ? `(lowered for article ${articleNumber})` : '(standard)')
          const relevantResults = searchResults.filter((r: SearchResult) => r.similarity >= RELEVANCE_THRESHOLD)
          
          console.log('[api/chat] Relevant results after filtering:', relevantResults.length)
          let avgSimilarity = 0
          if (relevantResults.length > 0) {
            avgSimilarity = relevantResults.reduce((sum: number, r: SearchResult) => sum + r.similarity, 0) / relevantResults.length
            console.log('[api/chat] Average similarity:', avgSimilarity.toFixed(3))
            console.log('[api/chat] Similarity range:', 
              Math.min(...relevantResults.map((r: SearchResult) => r.similarity)).toFixed(3), 
              '-', 
              Math.max(...relevantResults.map((r: SearchResult) => r.similarity)).toFixed(3)
            )
            
            // Per query comparative, mostra distribuzione documenti
            if (comparativeTerms) {
              const documentDistribution = new Map<string, number>()
              relevantResults.forEach((r: SearchResult) => {
                const filename = r.document_filename || 'Unknown'
                documentDistribution.set(filename, (documentDistribution.get(filename) || 0) + 1)
              })
              console.log('[api/chat] Document distribution:', Object.fromEntries(documentDistribution))
            }
          }
          
          // Valuta se le fonti sono sufficienti
          // Le fonti sono INSUFFICIENTI se ALMENO UNA delle seguenti condizioni è vera (OR logico):
          // 1. Non ci sono risultati rilevanti (relevantResults.length === 0)
          // 2. La similarità media è troppo bassa (< 0.25)
          // Basta che UNA delle due condizioni sia vera per considerare le fonti insufficienti
          const SOURCES_INSUFFICIENT = relevantResults.length === 0 || avgSimilarity < 0.5
          console.log('[api/chat] Sources sufficient?', !SOURCES_INSUFFICIENT, {
            resultsCount: relevantResults.length,
            avgSimilarity: avgSimilarity.toFixed(3),
            webSearchEnabled,
          })
          
          // Se le fonti non sono sufficienti e la ricerca web è abilitata, 
          // il tool web_search verrà chiamato automaticamente dall'agent
          // quando genererà la risposta (vedi systemPrompt più avanti)

          // Build context solo se ci sono risultati rilevanti
          const context = relevantResults.length > 0
            ? relevantResults
                .map((r: SearchResult, index: number) => `[Documento ${index + 1}: ${r.document_filename || 'Documento sconosciuto'}]\n${r.content}`)
                .join('\n\n')
            : null

          // Crea mappa delle fonti per il frontend solo se ci sono risultati rilevanti
          // NOTA: Riduciamo il campo content a 1000 caratteri per evitare problemi di parsing SSE
          const sources = relevantResults.length > 0
            ? relevantResults.map((r: SearchResult, index: number) => ({
                index: index + 1,
                documentId: r.document_id,
                filename: r.document_filename || 'Documento sconosciuto',
                similarity: r.similarity,
                content: r.content.substring(0, 1000) + (r.content.length > 1000 ? '...' : ''), // Preview del chunk
                chunkIndex: r.chunk_index, // Indice del chunk nel documento
              }))
            : []
          
          // Log per verificare che i dati del chunk siano presenti
          if (sources.length > 0) {
            console.log('[api/chat] Sources with content:', sources.map(s => ({
              index: s.index,
              filename: s.filename,
              hasContent: !!s.content,
              contentLength: s.content?.length || 0,
              chunkIndex: s.chunkIndex,
              similarity: s.similarity,
              similarityPercent: (s.similarity * 100).toFixed(1) + '%'
            })))
            console.log('[api/chat] Similarity score verification:')
            sources.forEach(s => {
              console.log(`  Source ${s.index}: raw=${s.similarity}, display=${(s.similarity * 100).toFixed(1)}%`)
            })
          }

          // Send status message before generation
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'status', message: 'Generazione risposta...' })}\n\n`)
          )

          let fullResponse = ''

          console.log('[api/chat] Starting agent stream...')
          console.log('[api/chat] Context available:', context !== null)
          console.log('[api/chat] Relevant results count:', relevantResults.length)
          console.log('[api/chat] Message:', message)
          
          // Prova prima con stream(), se fallisce usa generate()
          try {
            // Calcola uniqueDocumentNames per query comparative
            const uniqueDocumentNames = context && comparativeTerms
              ? [...new Set(relevantResults.map((r: SearchResult) => r.document_filename || 'Documento sconosciuto'))]
              : []

            // Costruisci system prompt usando funzione centralizzata
            const systemPrompt = buildSystemPrompt({
              hasContext: context !== null,
              context: context || undefined,
              documentCount: relevantResults.length,
              uniqueDocumentNames,
              comparativeTerms,
              articleNumber,
              webSearchEnabled,
              sourcesInsufficient: SOURCES_INSUFFICIENT,
              avgSimilarity,
            })
            
            const messages = [
              {
                role: 'system',
                content: systemPrompt,
              },
              ...conversationHistory,
              {
                role: 'user',
                content: message,
              },
            ]
            
            // Mastra Agent stream() accepts string or message array with proper typing
            // Quando abbiamo già il context, disabilitiamo i tools per evitare ricerche duplicate
            // MA: se le fonti non sono sufficienti e la ricerca web è abilitata, permettiamo l'uso del tool web_search
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const streamOptions = (context && !(webSearchEnabled && SOURCES_INSUFFICIENT)) 
              ? { maxToolRoundtrips: 0 } 
              : {}  // Disable tools only when we have sufficient context
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await ragAgent.stream(messages as any, streamOptions as any)

            console.log('[api/chat] Agent stream result:', result)
            console.log('[api/chat] Result type:', typeof result)
            console.log('[api/chat] Result keys:', Object.keys(result || {}))

            // Prova diverse proprietà possibili
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const streamSource = (result as any).textStream || (result as any).stream || ((result as any)[Symbol.asyncIterator] ? result : null)
            
            if (streamSource && typeof streamSource[Symbol.asyncIterator] === 'function') {
              console.log('[api/chat] Found async iterable stream')
              // Mastra stream restituisce un oggetto con textStream
              let firstChunk = true
              for await (const chunk of streamSource) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const content = typeof chunk === 'string' ? chunk : (chunk as any)?.text || (chunk as any)?.content || ''
                if (content) {
                  // Hide status message when first text chunk arrives
                  if (firstChunk) {
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ type: 'status', message: null })}\n\n`)
                    )
                    firstChunk = false
                  }
                  
                  fullResponse += content

                  // NON inviare sources ad ogni chunk - troppo grande e può causare errori di parsing
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', content })}\n\n`)
                  )
                }
              }
            } else {
              throw new Error('No valid stream source found')
            }
          } catch (streamError) {
            console.error('[api/chat] Stream failed, trying generate():', streamError)
            // Fallback a generate() se stream() non funziona
            // Calcola uniqueDocumentNames per query comparative
            const uniqueDocumentNames = context && comparativeTerms
              ? [...new Set(relevantResults.map((r: SearchResult) => r.document_filename || 'Documento sconosciuto'))]
              : []

            // Costruisci system prompt usando funzione centralizzata (stessa logica del blocco try)
            const systemPrompt = buildSystemPrompt({
              hasContext: context !== null,
              context: context || undefined,
              documentCount: relevantResults.length,
              uniqueDocumentNames,
              comparativeTerms,
              articleNumber,
              webSearchEnabled,
              sourcesInsufficient: SOURCES_INSUFFICIENT,
              avgSimilarity,
            })
            
            const messages = [
              {
                role: 'system',
                content: systemPrompt,
              },
              ...conversationHistory,
              {
                role: 'user',
                content: message,
              },
            ]
            
            // Mastra Agent generate() accepts string or message array with proper typing
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const generated = await ragAgent.generate(messages as any)
            
            console.log('[api/chat] Generated result:', generated)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const generatedText = (generated as any).text || (generated as any).content || String(generated) || ''
            fullResponse = generatedText
            console.log('[api/chat] Generated text length:', generatedText.length)
            console.log('[api/chat] Generated text preview:', generatedText.substring(0, 100))
            
            // Stream la risposta completa in chunks per simulare lo streaming
            if (fullResponse) {
              // Hide status message when starting to stream text
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: 'status', message: null })}\n\n`)
              )
              
              const words = fullResponse.split(/\s+/)
              for (const word of words) {
                const chunk = word + ' '
                // NON inviare sources ad ogni chunk - troppo grande e può causare errori di parsing
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
                )
                // Piccolo delay per simulare streaming
                await new Promise(resolve => setTimeout(resolve, 10))
              }
            } else {
              console.warn('[api/chat] Generated text is empty!')
            }
          }

          console.log('[api/chat] Stream completed, full response length:', fullResponse.length)
          console.log('[api/chat] Full response preview:', fullResponse.substring(0, 100))
          console.log('[api/chat] Full response type:', typeof fullResponse)
          console.log('[api/chat] Full response is null?', fullResponse === null)
          console.log('[api/chat] Full response is undefined?', fullResponse === undefined)

          // Check if response is empty before saving
          if (!fullResponse || fullResponse.trim().length === 0) {
            console.error('[api/chat] ERROR: Empty response generated!')
            console.error('[api/chat] Response value:', JSON.stringify(fullResponse))
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: 'error', error: 'Failed to generate response: empty content' })}\n\n`
              )
            )
            controller.close()
            return
          }

          // Estrai gli indici citati dalla risposta LLM e filtra le sources
          const citedIndices = extractCitedIndices(fullResponse)
          console.log('[api/chat] Cited indices in LLM response:', citedIndices)
          console.log('[api/chat] All available sources indices:', sources.map(s => s.index))
          
          // Estrai gli indici delle citazioni web dalla risposta LLM
          const webCitedIndices = extractWebCitedIndices(fullResponse)
          console.log('[api/chat] Web cited indices in LLM response:', webCitedIndices)
          
          // Recupera i risultati della ricerca web dal contesto
          const webSearchResults = getWebSearchResults()
          console.log('[api/chat] Web search results from context:', webSearchResults.length)
          
          // Recupera i documenti dalle query meta dal contesto
          const metaQueryDocuments = getMetaQueryDocuments()
          console.log('[api/chat] Meta query documents from context:', metaQueryDocuments.length)
          
          // Aggiungi documenti dalle query meta come sources se presenti
          if (metaQueryDocuments.length > 0) {
            // Crea sources dai documenti meta query
            const metaSources = metaQueryDocuments.map((doc) => ({
              index: doc.index,
              documentId: doc.id,
              filename: doc.filename,
              type: 'kb' as const,
            }))
            
            // Aggiungi le meta sources alle sources esistenti
            // Se ci sono citazioni nella risposta per i documenti meta, aggiungi le sources
            const metaCitedIndices = extractCitedIndices(fullResponse)
            if (metaCitedIndices.length > 0) {
              // Filtra solo le sources citate
              const citedMetaSources = metaSources.filter(s => 
                metaCitedIndices.includes(s.index)
              )
              sources.push(...citedMetaSources)
              console.log('[api/chat] Added cited meta query sources:', citedMetaSources.length)
            } else {
              // Se non ci sono citazioni ma ci sono documenti meta, aggiungi tutte le sources
              // Questo permette di mostrare i link anche senza citazioni esplicite
              sources.push(...metaSources)
              console.log('[api/chat] Added all meta query sources:', metaSources.length)
            }
          }
          
          // Costruisci array di sources web basato sulle citazioni
          let webSources: Array<{
            index: number
            type: 'web'
            title: string
            filename: string // Per compatibilità con i tipi esistenti
            url: string
            content: string
          }> = []
          
          if (webCitedIndices.length > 0 && webSearchResults.length > 0) {
            // Mappa gli indici citati ai risultati della ricerca web
            const sortedWebCitedIndices = Array.from(new Set(webCitedIndices)).sort((a, b) => a - b)
            webSources = sortedWebCitedIndices
              .map((citedIndex, idx) => {
                // Gli indici nella risposta partono da 1, quindi sottraiamo 1 per accedere all'array
                const webResult = webSearchResults[citedIndex - 1]
                if (webResult) {
                  return {
                    index: idx + 1, // Rinumerazione sequenziale (1, 2, 3...)
                    type: 'web' as const,
                    title: webResult.title || 'Senza titolo',
                    filename: webResult.title || 'Senza titolo', // Per compatibilità
                    url: webResult.url || '',
                    content: webResult.content || '',
                  }
                }
                return null
              })
              .filter((s): s is NonNullable<typeof s> => s !== null)
            
            console.log('[api/chat] Web sources built:', webSources.length)
          }
          
          // Filtra le sources per includere solo quelle citate nel testo
          let filteredSources = sources
          let responseWithRenumberedCitations = fullResponse
          
          // Rinumerazione citazioni web se presenti
          if (webCitedIndices.length > 0 && webSources.length > 0) {
            // Crea mappatura da indice originale a nuovo indice per le citazioni web
            const sortedWebCitedIndices = Array.from(new Set(webCitedIndices)).sort((a, b) => a - b)
            const webIndexMapping = new Map<number, number>()
            sortedWebCitedIndices.forEach((originalIndex, idx) => {
              webIndexMapping.set(originalIndex, idx + 1)
              console.log(`[api/chat] Web citation mapping: original ${originalIndex} -> new ${idx + 1}`)
            })
            
            // Sostituisci citazioni web nel testo con indici rinumerati
            responseWithRenumberedCitations = responseWithRenumberedCitations.replace(
              /\[web[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g,
              (match, indicesStr) => {
                const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
                const newIndices = indices
                  .map((oldIdx: number) => webIndexMapping.get(oldIdx))
                  .filter((newIdx: number | undefined): newIdx is number => newIdx !== undefined)
                  .sort((a: number, b: number) => a - b)
                
                if (newIndices.length === 0) {
                  return '' // Rimuovi citazione se non c'è corrispondenza
                }
                
                return `[web:${newIndices.join(',')}]`
              }
            )
            
            console.log('[api/chat] Web citations renumbered:', {
              original: fullResponse.match(/\[web[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g) || [],
              renumbered: responseWithRenumberedCitations.match(/\[web[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g) || []
            })
          }
          
          if (citedIndices.length > 0) {
            // Deduplica: per ogni indice citato, prendi solo la source con similarity più alta
            const sourceMap = new Map<number, typeof sources[0]>()
            sources.forEach(s => {
              if (citedIndices.includes(s.index)) {
                const existing = sourceMap.get(s.index)
                if (!existing || s.similarity > existing.similarity) {
                  sourceMap.set(s.index, s)
                }
              }
            })
            
            // Ordina gli indici citati e crea array finale con rinumerazione sequenziale (1, 2, 3...)
            const sortedCitedIndices = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
            filteredSources = sortedCitedIndices
              .map(index => sourceMap.get(index))
              .filter((s): s is typeof sources[0] => s !== undefined)
              .map((s, idx) => ({
                ...s,
                index: idx + 1, // Rinumerazione sequenziale semplice (1, 2, 3...)
              }))
            
            // Crea mappatura da indice originale a nuovo indice (1, 2, 3...)
            const indexMapping = new Map<number, number>()
            sortedCitedIndices.forEach((originalIndex, idx) => {
              indexMapping.set(originalIndex, idx + 1)
              console.log(`[api/chat] Citation mapping: original ${originalIndex} -> new ${idx + 1}`)
            })
            
            // Sostituisci citazioni nel testo con indici rinumerati
            responseWithRenumberedCitations = fullResponse.replace(
              /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g,
              (match, indicesStr) => {
                const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
                const newIndices = indices
                  .map((oldIdx: number) => indexMapping.get(oldIdx))
                  .filter((newIdx: number | undefined): newIdx is number => newIdx !== undefined)
                  .sort((a: number, b: number) => a - b)
                
                if (newIndices.length === 0) {
                  return '' // Rimuovi citazione se non c'è corrispondenza
                }
                
                return `[cit:${newIndices.join(',')}]`
              }
            )
            
            // Verifica finale: assicurati che tutti gli indici nel testo corrispondano alle sources
            const finalCitedIndices = extractCitedIndices(responseWithRenumberedCitations)
            console.log('[api/chat] Final sources:', filteredSources.map(s => ({
              index: s.index,
              filename: s.filename,
              cited: true
            })))
            console.log('[api/chat] Final cited indices in text:', finalCitedIndices)
            console.log('[api/chat] Final sources indices:', filteredSources.map(s => s.index))
            
            // Verifica che tutti gli indici nel testo esistano nelle sources
            const missingIndices = finalCitedIndices.filter(idx => !filteredSources.some(s => s.index === idx))
            if (missingIndices.length > 0) {
              console.error('[api/chat] ERROR: Text contains citations not in sources!', missingIndices)
            }
            
            console.log('[api/chat] Response citations renumbered:', {
              original: fullResponse.match(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g) || [],
              renumbered: responseWithRenumberedCitations.match(/\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g) || []
            })
          } else {
            console.log('[api/chat] No citations found in response, no sources to send')
            filteredSources = [] // Nessuna citazione = nessuna source da mostrare
          }
          
          // Combina sources KB e web per il frontend
          // Le sources KB usano indici [cit:N], le sources web usano indici [web:N]
          // Nel frontend, le distingueremo tramite il campo `type`
          const allSources = [
            ...filteredSources.map(s => ({ ...s, type: 'kb' as const })),
            ...webSources,
          ]
          
          console.log('[api/chat] All sources (KB + Web):', {
            kbSources: filteredSources.length,
            webSources: webSources.length,
            total: allSources.length,
          })
          
          // Pulisci il contesto della ricerca web dopo aver recuperato i risultati
          clearWebSearchResults()

          // Save assistant message to database
          if (conversationId) {
            try {
              console.log('[api/chat] Saving assistant message to database')
              console.log('[api/chat] Content length:', fullResponse.length)
              console.log('[api/chat] Content preview:', fullResponse.substring(0, 200))
              
              const insertData = {
                conversation_id: conversationId,
                role: 'assistant' as const,
                content: responseWithRenumberedCitations.trim(), // Usa il testo con citazioni rinumerate
                metadata: {
                  chunks_used: searchResults.map((r: SearchResult) => ({
                    id: r.id,
                    similarity: r.similarity,
                  })),
                  sources: allSources, // Salva tutte le sources (KB + web) citate
                  query_enhanced: wasEnhanced, // Track if query was enhanced
                  original_query: message, // Keep original for reference
                  enhanced_query: wasEnhanced ? queryToEmbed : undefined, // Enhanced version if applicable
                },
              }
              
              console.log('[api/chat] Insert data check:', {
                conversation_id: insertData.conversation_id,
                role: insertData.role,
                content_length: insertData.content.length,
                content_preview: insertData.content.substring(0, 50),
                metadata_sources_count: insertData.metadata.sources.length,
              })
              
              const { data, error } = await supabaseAdmin.from('messages').insert(insertData)
              
              if (error) {
                console.error('[api/chat] Failed to save assistant message:', error)
                console.error('[api/chat] Error code:', error.code)
                console.error('[api/chat] Error message:', error.message)
                console.error('[api/chat] Error details:', error.details)
              } else {
                console.log('[api/chat] Assistant message saved successfully')
                if (data) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const savedData = data as any[]
                  if (Array.isArray(savedData) && savedData.length > 0) {
                    const savedMessage = savedData[0]
                    console.log('[api/chat] Saved message ID:', savedMessage.id)
                    console.log('[api/chat] Saved message content length:', savedMessage.content?.length || 0)
                    console.log('[api/chat] Saved message content preview:', savedMessage.content?.substring(0, 50) || 'EMPTY')
                  }
                }
              }
            } catch (err) {
              console.error('[api/chat] Failed to save assistant message:', err)
              if (err instanceof Error) {
                console.error('[api/chat] Error stack:', err.stack)
              }
            }
          }

          // Invia tutte le sources (KB + web) e testo rinumerato alla fine
          console.log('[api/chat] Sending all sources to frontend:', allSources.length)
          console.log('[api/chat] Sending renumbered response to frontend')
          
          // Invia il testo completo rinumerato in un messaggio separato prima del "done"
          // Questo permette al frontend di sostituire il contenuto streamato con quello rinumerato
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text_complete', content: responseWithRenumberedCitations })}\n\n`)
          )
          
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', sources: allSources })}\n\n`)
          )
          
          // Save to cache (use enhanced query for embedding key)
          // Save AFTER processing citations so we save filteredSources with correct indices
          try {
            await saveCachedResponse(queryToEmbed, queryEmbedding, responseWithRenumberedCitations, filteredSources)
          } catch (err) {
            console.error('[api/chat] Failed to save cache:', err)
          }
          
          controller.close()
        } catch (error) {
          console.error('[api/chat] Stream error:', error)
          console.error('[api/chat] Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
          })
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Failed to generate response' })}\n\n`
            )
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[api/chat] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

