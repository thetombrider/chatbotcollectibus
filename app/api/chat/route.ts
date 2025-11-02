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
          // Usa il metodo stream() di Mastra
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

          // Mastra stream restituisce un oggetto con textStream
          for await (const chunk of result.textStream) {
            const content = chunk || ''
            fullResponse += content

            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', content, sources })}\n\n`)
            )
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
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: 'error', error: 'Failed to generate response' })}\n\n`
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

