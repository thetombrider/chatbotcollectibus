import { NextRequest, NextResponse } from 'next/server'
import { ragAgent } from '@/lib/mastra/agent'
import { generateEmbedding } from '@/lib/embeddings/openai'
import { findCachedResponse, saveCachedResponse } from '@/lib/supabase/semantic-cache'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { supabaseAdmin } from '@/lib/supabase/client'

export const maxDuration = 60 // 60 secondi per Vercel

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
        await supabaseAdmin.from('messages').insert({
          conversation_id: conversationId,
          role: 'user',
          content: message,
        })
      } catch (err) {
        console.error('[api/chat] Failed to save user message:', err)
        // Continue anyway, don't fail the request
      }
    }

    // Check semantic cache
    const queryEmbedding = await generateEmbedding(message)
    const cached = await findCachedResponse(queryEmbedding)

    if (cached) {
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
                await supabaseAdmin.from('messages').insert({
                  conversation_id: conversationId,
                  role: 'assistant',
                  content: cached.response_text,
                  metadata: {
                    cached: true,
                  },
                })
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

    // Vector search per context
    const searchResults = await hybridSearch(queryEmbedding, message, 5)

    // Build context from chunks con numerazione per citazioni
    const context = searchResults
      .map((r, index) => `[Documento ${index + 1}: ${r.document_filename || 'Documento sconosciuto'}]\n${r.content}`)
      .join('\n\n')

    // Crea mappa delle fonti per il frontend
    const sources = searchResults.map((r, index) => ({
      index: index + 1,
      documentId: r.document_id,
      filename: r.document_filename || 'Documento sconosciuto',
      similarity: r.similarity,
    }))

    // Stream response from agent
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = ''

        try {
          console.log('[api/chat] Starting agent stream...')
          console.log('[api/chat] Context length:', context.length)
          console.log('[api/chat] Message:', message)
          
          // Prova prima con stream(), se fallisce usa generate()
          try {
            const result = await ragAgent.stream([
              {
                role: 'system',
                content: `Usa il seguente contesto dai documenti per rispondere:\n\n${context}`,
              },
              {
                role: 'user',
                content: message,
              },
            ])

            console.log('[api/chat] Agent stream result:', result)
            console.log('[api/chat] Result type:', typeof result)
            console.log('[api/chat] Result keys:', Object.keys(result || {}))

            // Prova diverse proprietà possibili
            const streamSource = (result as any).textStream || (result as any).stream || ((result as any)[Symbol.asyncIterator] ? result : null)
            
            if (streamSource && typeof streamSource[Symbol.asyncIterator] === 'function') {
              console.log('[api/chat] Found async iterable stream')
              // Mastra stream restituisce un oggetto con textStream
              for await (const chunk of streamSource) {
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
            const generated = await ragAgent.generate([
              {
                role: 'system',
                content: `Usa il seguente contesto dai documenti per rispondere:\n\n${context}`,
              },
              {
                role: 'user',
                content: message,
              },
            ])
            
            console.log('[api/chat] Generated result:', generated)
            const generatedText = (generated as any).text || (generated as any).content || String(generated) || ''
            fullResponse = generatedText
            
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
            }
          }

          console.log('[api/chat] Stream completed, full response length:', fullResponse.length)

          // Save to cache
          try {
            await saveCachedResponse(message, queryEmbedding, fullResponse)
          } catch (err) {
            console.error('[api/chat] Failed to save cache:', err)
          }

          // Save assistant message to database
          if (conversationId) {
            try {
              await supabaseAdmin.from('messages').insert({
                conversation_id: conversationId,
                role: 'assistant',
                content: fullResponse,
                metadata: {
                  chunks_used: searchResults.map((r) => ({
                    id: r.id,
                    similarity: r.similarity,
                  })),
                  sources: sources,
                },
              })
            } catch (err) {
              console.error('[api/chat] Failed to save assistant message:', err)
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

