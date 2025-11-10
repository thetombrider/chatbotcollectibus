import { createServerSupabaseClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()

    // Check if a user is logged in
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      await supabase.auth.signOut()
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[logout] Error:', error)
    return NextResponse.json(
      { error: 'Failed to log out' },
      { status: 500 }
    )
  }
}






















