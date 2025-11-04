import { NextRequest, NextResponse } from 'next/server'
import { ragAgent } from '@/lib/mastra/agent'
import { generateEmbedding } from '@/lib/embeddings/openai'
import { findCachedResponse, saveCachedResponse } from '@/lib/supabase/semantic-cache'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

export const maxDuration = 60 // 60 secondi per Vercel

/**
 * Rileva se la query è comparativa e estrae i termini chiave da confrontare
 * 
 * Strategia:
 * 1. Primo step: Cerca keyword comparative + normative note (veloce e accurato)
 * 2. Secondo step: Prova pattern regex migliorati
 * 3. Validazione: Verifica che i termini siano normative note
 */
function detectComparativeQuery(message: string): string[] | null {
  const lowerMessage = message.toLowerCase()
  
  // Normative riconosciute (deve essere in sync con quelle nel knowledge base)
  const knownRegulations = ['ESPR', 'PPWR', 'CSRD', 'CSDDD', 'GDPR', 'REACH', 'CCPA', 'RGPD', 'ISO']
  
  // Parole chiave che indicano una query comparativa
  const comparativeKeywords = [
    'comune', 'comunanza', 'similari', 'similitudine', 'similare',
    'differenz', 'differiscon', 'diversit', 'diverso',
    'confronto', 'confronta', 'compara', 'confrontand',
    'vs', 'versus', 'versus',
    // Verbi di comparazione
    'come', 'quale', 'cosa', 'chi', 'distingue', 'differisce',
    'somiglia', 'uguaglia', 'uguale', 'pari',
    // Espressioni comuni
    'entramb', 'ambedu', 'ambo', 'recipro', 'mutu',
    'punti in comune', 'punti comuni',
  ]
  
  // Step 1: Verifica se ci sono keyword comparative
  const hasComparativeKeyword = comparativeKeywords.some(kw => lowerMessage.includes(kw))
  
  if (!hasComparativeKeyword) {
    return null
  }
  
  // Step 2: Trova tutte le normative note menzionate nel messaggio
  const mentionedRegulations = knownRegulations.filter(reg => 
    lowerMessage.includes(reg.toLowerCase())
  )
  
  // Step 3: Se sono menzionate 2+ normative + keyword comparativa → è comparativa
  if (mentionedRegulations.length >= 2) {
    console.log('[api/chat] Comparative query: found keywords + regulations:', mentionedRegulations)
    
    // Se sono più di 2 normative, prendi le prime 2 in ordine di comparsa
    if (mentionedRegulations.length > 2) {
      const positions = mentionedRegulations.map(reg => ({
        reg,
        index: lowerMessage.indexOf(reg.toLowerCase())
      }))
      positions.sort((a, b) => a.index - b.index)
      
      // Ritorna le prime 2 per evitare confusione
      return [positions[0].reg, positions[1].reg]
    }
    
    return mentionedRegulations
  }
  
  // Step 4: Se non ha trovato 2+ normative, prova pattern regex migliorati
  const improvedPatterns = [
    // Pattern 1: "parola_comparativa tra/con/di X e Y"
    // Es: "confronto tra ESPR e PPWR", "differenza con GDPR e REACH"
    /(?:confronto|differenza|comune|simil|distinzione|rapporto)\s+(?:tra|con|di)\s+(?:la\s+)?([A-Z]{2,})\s+(?:e|ed|&)\s+(?:la\s+)?([A-Z]{2,})/i,
    
    // Pattern 2: "X e Y: parola_comparativa"
    // Es: "ESPR e PPWR: punti in comune", "GDPR vs REACH - differenze"
    /([A-Z]{2,})\s+(?:e|ed|&|vs|versus)\s+([A-Z]{2,})\s*[:,-]?\s*(?:confronto|differenza|comune|simil|distinzione)/i,
    
    // Pattern 3: "come/quale... X e Y"
    // Es: "come si differenziano ESPR e PPWR", "quali sono i punti comuni tra GDPR e REACH"
    /(?:come|quale|cosa|chi)\s+(?:[^.]*?)\s+([A-Z]{2,})\s+(?:e|ed|&)\s+([A-Z]{2,})/i,
    
    // Pattern 4: "entrambe/ambedue le normative X e Y"
    // Es: "entrambe le norme ESPR e PPWR", "ambedue i regolamenti"
    /(?:entramb|ambedu|ambo)\s+(?:le\s+)?(?:norm|regolament|direttiv|standard)\s+(?:sono\s+)?([A-Z]{2,})\s+(?:e|ed|&)\s+([A-Z]{2,})/i,
    
    // Pattern 5: "X e Y: cosa/quali/come" (inverso del pattern 3)
    // Es: "ESPR e PPWR: quali sono le differenze", "GDPR e REACH: come si differenziano"
    /([A-Z]{2,})\s+(?:e|ed|&)\s+([A-Z]{2,})\s*[:,-]?\s*(?:cosa|quale|come|chi)\s+(?:[^.]*?)/i,
  ]
  
  for (const pattern of improvedPatterns) {
    const match = message.match(pattern)
    if (match && match[1] && match[2]) {
      const term1 = match[1].toUpperCase()
      const term2 = match[2].toUpperCase()
      
      // Validazione: i termini devono essere normative note (evita falsi positivi come "Mario e Luigi")
      if (knownRegulations.includes(term1) && knownRegulations.includes(term2)) {
        console.log('[api/chat] Comparative query: pattern matched:', [term1, term2])
        return [term1, term2]
      }
    }
  }
  
  // Step 5: Fallback - se la query ha keyword comparativa ma non abbiamo trovato termini specifici,
  // potrebbe essere una query comparativa generica (es: "quali sono gli obblighi comuni delle direttive EU?")
  // Ma non ritorniamo nulla perché non sappiamo su cosa fare la multi-query search
  console.log('[api/chat] Comparative keywords found but no specific regulations matched')
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
    // NOTA: Riduciamo il campo content a 1000 caratteri per evitare problemi di parsing SSE
    const sources = relevantResults.length > 0
      ? relevantResults.map((r, index) => ({
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
              // Conta quanti documenti ci sono nel contesto per fornire un esempio chiaro
              const documentCount = relevantResults.length
              
              // Per query comparative, aggiungi informazioni sui documenti disponibili
              if (comparativeTerms) {
                const uniqueDocuments = [...new Set(relevantResults.map(r => r.document_filename))]
                systemPrompt = `Sei un assistente per un team di consulenza. L'utente ha chiesto un confronto tra: ${comparativeTerms.join(' e ')}. 

Ho trovato informazioni nei seguenti documenti: ${uniqueDocuments.join(', ')}.

Usa SOLO il seguente contesto dai documenti per rispondere. 

CITAZIONI - REGOLE IMPORTANTI:
- Il contesto contiene ${documentCount} documenti numerati da 1 a ${documentCount}
- Ogni documento inizia con "[Documento N: nome_file]" dove N è il numero del documento (1, 2, 3, ..., ${documentCount})
- Quando citi informazioni da un documento, usa [cit:N] dove N è il numero ESATTO del documento nel contesto
- Per citazioni multiple da più documenti, usa [cit:N,M] (es. [cit:1,2] per citare documenti 1 e 2)
- NON inventare numeri di documento che non esistono nel contesto
- Gli indici delle citazioni DEVONO corrispondere esattamente ai numeri "[Documento N:" presenti nel contesto

ESEMPIO:
Se il contesto contiene:
[Documento 1: file1.pdf]
Testo del documento 1...

[Documento 2: file2.pdf]
Testo del documento 2...

E usi informazioni da entrambi, cita: [cit:1,2]

IMPORTANTE: 
- Confronta esplicitamente i concetti trovati in entrambe le normative
- Cita SOLO informazioni presenti nel contesto fornito
- Se trovi concetti simili in documenti diversi, menzionalo esplicitamente

Contesto dai documenti:
${context}`
              } else {
                systemPrompt = `Sei un assistente per un team di consulenza. Usa SOLO il seguente contesto dai documenti della knowledge base per rispondere.

CITAZIONI - REGOLE IMPORTANTI:
- Il contesto contiene ${documentCount} documenti numerati da 1 a ${documentCount}
- Ogni documento inizia con "[Documento N: nome_file]" dove N è il numero del documento (1, 2, 3, ..., ${documentCount})
- Quando citi informazioni da un documento, usa [cit:N] dove N è il numero ESATTO del documento nel contesto
- Per citazioni multiple da più documenti, usa [cit:N,M] (es. [cit:1,2] per citare documenti 1 e 2)
- NON inventare numeri di documento che non esistono nel contesto
- Gli indici delle citazioni DEVONO corrispondere esattamente ai numeri "[Documento N:" presenti nel contesto

ESEMPIO:
Se il contesto contiene:
[Documento 1: file1.pdf]
Testo del documento 1...

[Documento 2: file2.pdf]
Testo del documento 2...

E usi informazioni da entrambi, cita: [cit:1,2]

IMPORTANTE: 
- NON inventare citazioni
- Usa citazioni SOLO se il contesto fornito contiene informazioni rilevanti
- Se citi informazioni, usa SEMPRE il numero corretto del documento dal contesto

Contesto dai documenti:
${context}`
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
            let systemPrompt
            if (context) {
              const documentCount = relevantResults.length
              systemPrompt = `Sei un assistente per un team di consulenza. Usa SOLO il seguente contesto dai documenti della knowledge base per rispondere.

CITAZIONI - REGOLE IMPORTANTI:
- Il contesto contiene ${documentCount} documenti numerati da 1 a ${documentCount}
- Ogni documento inizia con "[Documento N: nome_file]" dove N è il numero del documento (1, 2, 3, ..., ${documentCount})
- Quando citi informazioni da un documento, usa [cit:N] dove N è il numero ESATTO del documento nel contesto
- Per citazioni multiple da più documenti, usa [cit:N,M] (es. [cit:1,2] per citare documenti 1 e 2)
- NON inventare numeri di documento che non esistono nel contesto
- Gli indici delle citazioni DEVONO corrispondere esattamente ai numeri "[Documento N:" presenti nel contesto

ESEMPIO:
Se il contesto contiene:
[Documento 1: file1.pdf]
Testo del documento 1...

[Documento 2: file2.pdf]
Testo del documento 2...

E usi informazioni da entrambi, cita: [cit:1,2]

IMPORTANTE: 
- NON inventare citazioni
- Usa citazioni SOLO se il contesto fornito contiene informazioni rilevanti
- Se citi informazioni, usa SEMPRE il numero corretto del documento dal contesto

Contesto dai documenti:
${context}`
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

          // Save to cache
          try {
            await saveCachedResponse(message, queryEmbedding, fullResponse)
          } catch (err) {
            console.error('[api/chat] Failed to save cache:', err)
          }

          // Estrai gli indici citati dalla risposta LLM e filtra le sources
          const citedIndices = extractCitedIndices(fullResponse)
          console.log('[api/chat] Cited indices in LLM response:', citedIndices)
          console.log('[api/chat] All available sources indices:', sources.map(s => s.index))
          
          // Filtra le sources per includere solo quelle citate nel testo
          let filteredSources = sources
          let responseWithRenumberedCitations = fullResponse
          
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
                  chunks_used: searchResults.map((r) => ({
                    id: r.id,
                    similarity: r.similarity,
                  })),
                  sources: filteredSources, // Salva solo le sources citate (già rinumerate)
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

          // Invia sources filtrate (solo quelle citate) e testo rinumerato alla fine
          console.log('[api/chat] Sending filtered sources to frontend:', filteredSources.length)
          console.log('[api/chat] Sending renumbered response to frontend')
          
          // Invia il testo completo rinumerato in un messaggio separato prima del "done"
          // Questo permette al frontend di sostituire il contenuto streamato con quello rinumerato
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text_complete', content: responseWithRenumberedCitations })}\n\n`)
          )
          
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', sources: filteredSources })}\n\n`)
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

