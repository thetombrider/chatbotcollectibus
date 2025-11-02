import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    // Verifica che la chiave OpenRouter sia configurata
    const apiKey = process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { 
          success: false,
          service: 'OpenRouter',
          error: 'OPENROUTER_API_KEY not configured'
        },
        { status: 500 }
      )
    }

    // Test chiamata API OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { 
          success: false,
          service: 'OpenRouter',
          error: `API error: ${response.status} - ${errorText}`
        },
        { status: response.status }
      )
    }

    const models = await response.json()

    return NextResponse.json({
      success: true,
      service: 'OpenRouter',
      message: 'Connected successfully',
      apiKeyConfigured: true,
      modelsAvailable: models.data?.length || 0
    })
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        service: 'OpenRouter',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

