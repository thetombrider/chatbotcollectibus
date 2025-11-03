import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const results = {
    supabase: { success: false, error: '' },
    openai: { success: false, error: '' },
    openrouter: { success: false, error: '' }
  }

  // Test Supabase
  try {
    const supabaseRes = await fetch(`${req.nextUrl.origin}/api/test/supabase`)
    const supabaseData = await supabaseRes.json()
    results.supabase = supabaseData
  } catch (error) {
    results.supabase = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // Test OpenAI
  try {
    const openaiRes = await fetch(`${req.nextUrl.origin}/api/test/openai`)
    const openaiData = await openaiRes.json()
    results.openai = openaiData
  } catch (error) {
    results.openai = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // Test OpenRouter
  try {
    const openrouterRes = await fetch(`${req.nextUrl.origin}/api/test/openrouter`)
    const openrouterData = await openrouterRes.json()
    results.openrouter = openrouterData
  } catch (error) {
    results.openrouter = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  const allPassed = Object.values(results).every(r => r.success === true)

  return NextResponse.json({
    success: allPassed,
    timestamp: new Date().toISOString(),
    results
  })
}


