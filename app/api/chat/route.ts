import { NextRequest, NextResponse } from 'next/server'
import { ragAgent } from '@/lib/mastra/agent'
import { generateEmbedding } from '@/lib/embeddings/openai'
import { findCachedResponse, saveCachedResponse } from '@/lib/supabase/semantic-cache'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const maxDuration = 60 // 60 secondi per Vercel

/**
 * Rileva se la query è comparativa e estrae i termini chiave da confrontare
 */
function detectComparativeQuery(message: string): string[] | null {
  const lowerMessage = message.toLowerCase()
  
  // Pattern per query comparative
  const comparativePatterns = [
    /(?:punti?\s+in\s+comune|similari|differenze?|confronto|confronta|compara|vs|versus)\s+(?:tra|di|fra)\s+(?:la\s+)?(\w+)\s+(?:e|ed?)\s+(?:la\s+)?(\w+)/i,
    /(\w+)\s+(?:e|ed?)\s+(\w+)\s*[:,-]?\s*(?:punti?\s+in\s+comune|similari|differenze?|confronto)/i,
    /(?:entrambe|ambedue)\s+(?:le\s+)?(?:norme?|regolamenti?|direttive?)/i
  ]
  
  for (const pattern of comparativePatterns) {
    const match = message.match(pattern)
    if (match) {
      // Estrai i termini (gruppo 1 e 2 della regex)
      if (match[1] && match[2]) {
        return [match[1].toUpperCase(), match[2].toUpperCase()]
      }
    }
  }
  
  // Caso speciale: rileva menzioni di più normative note
  const knownRegulations = ['ESPR', 'PPWR', 'CSRD', 'CSDDD', 'GDPR', 'REACH']
  const mentionedRegulations = knownRegulations.filter(reg => 
    lowerMessage.includes(reg.toLowerCase())
  )
  
  if (mentionedRegulations.length >= 2 && 
      (lowerMessage.includes('comune') || 
       lowerMessage.includes('entramb') || 
       lowerMessage.includes('confronto') ||
       lowerMessage.includes('differenz'))) {
    return mentionedRegulations
  }
  
  return null
}

/**
 * Esegue ricerche multiple per query comparative e combina i risultati
 */
async function performMultiQuerySearch(
  terms: string[], 
  originalQuery: string,
  originalEmbedding: number[]
): Promise<any[]> {
  console.log('[api/chat] Performing multi-query search for terms:', terms)
  
  // Esegui una ricerca per ogni termine
  const searchPromises = terms.map(async (term) => {
    try {
      // Crea una query mirata per questo termine
      const targetedQuery = `${term} ${originalQuery}`
      const targetedEmbedding = await generateEmbedding(targetedQuery)
      
      // Ricerca con threshold più alto per risultati più rilevanti
      const results = await hybridSearch(targetedEmbedding, targetedQuery, 8, 0.25, 0.7)
      
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
  const combinedMap = new Map()
  allResults.flat().forEach(result => {
    if (!combinedMap.has(result.id) || combinedMap.get(result.id).similarity < result.similarity) {
      combinedMap.set(result.id, result)
    }
  })
  
  const combined = Array.from(combinedMap.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 15) // Top 15 per avere più diversità
  
  console.log('[api/chat] Combined results:', combined.length, 
    combined.length > 0 ? `(best: ${combined[0]?.similarity.toFixed(3)})` : '')
  
  // Se abbiamo pochi risultati dalla multi-query, aggiungi anche dalla query originale
  if (combined.length < 10) {
    console.log('[api/chat] Adding results from original query to boost coverage')
    const originalResults = await hybridSearch(originalEmbedding, originalQuery, 10, 0.25, 0.7)
    
    originalResults.forEach(result => {
      if (!combinedMap.has(result.id)) {
        combined.push(result)
      }
    })
    
    // Riordina e limita
    combined.sort((a, b) => b.similarity - a.similarity)
    combined.splice(15)
  }
  
  return combined
}

export async function POST(req: NextRequest) {
  try {
    const { message, conversationId } = await req.json()

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

    // Check semantic cache
    const queryEmbedding = await generateEmbedding(message)
    const cached = await findCachedResponse(queryEmbedding)

    if (cached) {
      console.log('[api/chat] Found cached response')
      console.log('[api/chat] Cached response_text length:', cached.response_text?.length || 0)
      console.log('[api/chat] Cached response_text preview:', cached.response_text?.substring(0, 100) || 'EMPTY')
      
      if (!cached.response_text || cached.response_text.trim().length === 0) {
        console.error('[api/chat] ERROR: Cached response is empty!')
        // Continue with normal flow instead of using cache
      } else {
        // Return cached response
        const stream = new ReadableStream({
          async start(controller) {
            try {
              // Send cached response
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', content: cached.response_text })}\n\n`)
              )
              
              // Save assistant message to database
              if (conversationId) {
                try {
                  console.log('[api/chat] Saving cached assistant message to database')
                  console.log('[api/chat] Cached content length:', cached.response_text.length)
                  const { error } = await supabaseAdmin.from('messages').insert({
                    conversation_id: conversationId,
                    role: 'assistant',
                    content: cached.response_text.trim(),
                    metadata: {
                      cached: true,
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

              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
              )
              controller.close()
            } catch (error) {
              console.error('[api/chat] Error in cached response:', error)
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ type: 'error', error: 'Failed to process cached response' })}\n\n`
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
      }
    }

    // Vector search per context con hybrid search migliorata
    // Rileva se è una query comparativa e usa strategia multi-query
    const comparativeTerms = detectComparativeQuery(message)
    let searchResults
    
    if (comparativeTerms) {
      console.log('[api/chat] Comparative query detected for terms:', comparativeTerms)
      // Usa strategia multi-query per query comparative
      searchResults = await performMultiQuerySearch(comparativeTerms, message, queryEmbedding)
    } else {
      // Query standard: hybrid search normale
      // Parametri: top-10, threshold 0.3, vector_weight 0.7
      searchResults = await hybridSearch(queryEmbedding, message, 10, 0.3, 0.7)
    }
    
    // Log dei risultati per debugging
    console.log('[api/chat] Search results:', searchResults.map(r => ({
      filename: r.document_filename,
      similarity: r.similarity.toFixed(3),
      vector_score: r.vector_score?.toFixed(3),
      text_score: r.text_score?.toFixed(3),
      preview: r.content.substring(0, 100) + '...'
    })))
    
    // Filtra solo risultati con similarity >= 0.20 per evitare citazioni a documenti non rilevanti
    // Threshold ridotto a 0.20 per permettere match anche con similarity bassa (utile per query generiche)
    // Nota: con questo threshold, anche chunks con vector_score ~0.30 passeranno il filtro
    // TODO: Considerare di aumentare quando si migliora la qualità degli embeddings
    const RELEVANCE_THRESHOLD = 0.20
    const relevantResults = searchResults.filter(r => r.similarity >= RELEVANCE_THRESHOLD)
    
    console.log('[api/chat] Relevant results after filtering:', relevantResults.length)
    if (relevantResults.length > 0) {
      const avgSimilarity = relevantResults.reduce((sum, r) => sum + r.similarity, 0) / relevantResults.length
      console.log('[api/chat] Average similarity:', avgSimilarity.toFixed(3))
      console.log('[api/chat] Similarity range:', 
        Math.min(...relevantResults.map(r => r.similarity)).toFixed(3), 
        '-', 
        Math.max(...relevantResults.map(r => r.similarity)).toFixed(3)
      )
      
      // Per query comparative, mostra distribuzione documenti
      if (comparativeTerms) {
        const documentDistribution = new Map<string, number>()
        relevantResults.forEach(r => {
          const filename = r.document_filename || 'Unknown'
          documentDistribution.set(filename, (documentDistribution.get(filename) || 0) + 1)
        })
        console.log('[api/chat] Document distribution:', Object.fromEntries(documentDistribution))
      }
    }

    // Build context solo se ci sono risultati rilevanti
    const context = relevantResults.length > 0
      ? relevantResults
          .map((r, index) => `[Documento ${index + 1}: ${r.document_filename || 'Documento sconosciuto'}]\n${r.content}`)
          .join('\n\n')
      : null

    // Crea mappa delle fonti per il frontend solo se ci sono risultati rilevanti
    const sources = relevantResults.length > 0
      ? relevantResults.map((r, index) => ({
          index: index + 1,
          documentId: r.document_id,
          filename: r.document_filename || 'Documento sconosciuto',
          similarity: r.similarity,
        }))
      : []

    // Stream response from agent
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = ''

        try {
          console.log('[api/chat] Starting agent stream...')
          console.log('[api/chat] Context available:', context !== null)
          console.log('[api/chat] Relevant results count:', relevantResults.length)
          console.log('[api/chat] Message:', message)
          
          // Prova prima con stream(), se fallisce usa generate()
          try {
            let systemPrompt
            if (context) {
              // Per query comparative, aggiungi informazioni sui documenti disponibili
              if (comparativeTerms) {
                const uniqueDocuments = [...new Set(relevantResults.map(r => r.document_filename))]
                systemPrompt = `Sei un assistente per un team di consulenza. L'utente ha chiesto un confronto tra: ${comparativeTerms.join(' e ')}. 

Ho trovato informazioni nei seguenti documenti: ${uniqueDocuments.join(', ')}.

Usa SOLO il seguente contesto dai documenti per rispondere. Quando citi informazioni, usa [cit:N] dove N è il numero del documento. Per citazioni multiple usa [cit:N,M]. 

IMPORTANTE: 
- Confronta esplicitamente i concetti trovati in entrambe le normative
- Cita SOLO informazioni presenti nel contesto fornito
- Se trovi concetti simili in documenti diversi, menzionalo esplicitamente

Contesto dai documenti:
${context}`
              } else {
                systemPrompt = `Sei un assistente per un team di consulenza. Usa SOLO il seguente contesto dai documenti della knowledge base per rispondere. Se il contesto contiene informazioni rilevanti, citalo usando [cit:N] dove N è il numero del documento. Per citazioni multiple usa [cit:N,M]. IMPORTANTE: NON inventare citazioni. Usa citazioni SOLO se il contesto fornito contiene informazioni rilevanti.\n\nContesto dai documenti:\n${context}`
              }
            } else {
              systemPrompt = `Sei un assistente per un team di consulenza. Non ci sono documenti rilevanti nella knowledge base per questa domanda. Rispondi usando le tue conoscenze generali. IMPORTANTE: NON usare citazioni [cit:N] perché non ci sono documenti rilevanti nella knowledge base.`
            }
            
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await ragAgent.stream(messages as any)

            console.log('[api/chat] Agent stream result:', result)
            console.log('[api/chat] Result type:', typeof result)
            console.log('[api/chat] Result keys:', Object.keys(result || {}))

            // Prova diverse proprietà possibili
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const streamSource = (result as any).textStream || (result as any).stream || ((result as any)[Symbol.asyncIterator] ? result : null)
            
            if (streamSource && typeof streamSource[Symbol.asyncIterator] === 'function') {
              console.log('[api/chat] Found async iterable stream')
              // Mastra stream restituisce un oggetto con textStream
              for await (const chunk of streamSource) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const content = typeof chunk === 'string' ? chunk : (chunk as any)?.text || (chunk as any)?.content || ''
                if (content) {
                  fullResponse += content

                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', content, sources })}\n\n`)
                  )
                }
              }
            } else {
              throw new Error('No valid stream source found')
            }
          } catch (streamError) {
            console.error('[api/chat] Stream failed, trying generate():', streamError)
            // Fallback a generate() se stream() non funziona
            const systemPrompt = context
              ? `Sei un assistente per un team di consulenza. Usa SOLO il seguente contesto dai documenti della knowledge base per rispondere. Se il contesto contiene informazioni rilevanti, citalo usando [cit:N] dove N è il numero del documento. IMPORTANTE: NON inventare citazioni. Usa citazioni SOLO se il contesto fornito contiene informazioni rilevanti.\n\nContesto dai documenti:\n${context}`
              : `Sei un assistente per un team di consulenza. Non ci sono documenti rilevanti nella knowledge base per questa domanda. Rispondi usando le tue conoscenze generali. IMPORTANTE: NON usare citazioni [cit:N] perché non ci sono documenti rilevanti nella knowledge base.`
            
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
              const words = fullResponse.split(/\s+/)
              for (const word of words) {
                const chunk = word + ' '
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', content: chunk, sources })}\n\n`)
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

          // Save to cache
          try {
            await saveCachedResponse(message, queryEmbedding, fullResponse)
          } catch (err) {
            console.error('[api/chat] Failed to save cache:', err)
          }

          // Save assistant message to database
          if (conversationId) {
            try {
              console.log('[api/chat] Saving assistant message to database')
              console.log('[api/chat] Content length:', fullResponse.length)
              console.log('[api/chat] Content preview:', fullResponse.substring(0, 200))
              
              const insertData = {
                conversation_id: conversationId,
                role: 'assistant' as const,
                content: fullResponse.trim(),
                metadata: {
                  chunks_used: searchResults.map((r) => ({
                    id: r.id,
                    similarity: r.similarity,
                  })),
                  sources: sources,
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

          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          )
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

