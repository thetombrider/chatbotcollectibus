import { NextRequest, NextResponse } from 'next/server'
import { generateEmbedding } from '@/lib/embeddings/openai'

export async function GET(req: NextRequest) {
  try {
    // Test connessione OpenAI
    const embedding = await generateEmbedding('test connection')

    if (!embedding || embedding.length !== 1536) {
      return NextResponse.json(
        { 
          success: false,
          service: 'OpenAI',
          error: 'Invalid embedding length'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      service: 'OpenAI',
      message: 'Connected successfully',
      embeddingLength: embedding.length,
      model: 'text-embeddings-3-large'
    })
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        service: 'OpenAI',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

