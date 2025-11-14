import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/client'

/**
 * POST /api/auth/reset-password
 * Update user password after clicking reset link from email
 */
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()

    // Validate password
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Password non valida' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La password deve essere di almeno 6 caratteri' },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()

    // Check if user is authenticated (has valid reset token from email link)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error('[reset-password] No valid session:', sessionError)
      return NextResponse.json(
        { error: 'Sessione non valida. Il link potrebbe essere scaduto.' },
        { status: 401 }
      )
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    })

    if (updateError) {
      console.error('[reset-password] Error updating password:', updateError)
      return NextResponse.json(
        { error: 'Errore durante l\'aggiornamento della password' },
        { status: 500 }
      )
    }

    console.log('[reset-password] Password updated successfully for user:', session.user.id)

    return NextResponse.json(
      { 
        success: true,
        message: 'Password aggiornata con successo'
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[reset-password] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Errore del server. Riprova più tardi.' },
      { status: 500 }
    )
  }
}
