import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY not configured' },
        { status: 500 }
      )
    }

    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('OpenRouter API error:', response.statusText)
      return NextResponse.json(
        { error: 'Failed to fetch credits' },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    console.log('[credits] OpenRouter response:', JSON.stringify(data, null, 2))

    const totalCredits = data.data?.total_credits || 0
    const totalUsage = data.data?.total_usage || 0
    const remaining = totalCredits - totalUsage

    console.log('[credits] Calculated:', { totalCredits, totalUsage, remaining })

    return NextResponse.json({
      totalCredits,
      totalUsage,
      remaining,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    })
  } catch (error) {
    console.error('Error fetching OpenRouter credits:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
