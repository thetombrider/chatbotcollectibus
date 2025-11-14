import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/client'

/**
 * POST /api/auth/forgot-password
 * Send password reset email to user
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email non valida' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Formato email non valido' },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()

    // Send password reset email
    // Supabase will handle everything: email delivery, token generation, expiration
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password`,
    })

    if (error) {
      console.error('[forgot-password] Error sending reset email:', error)
      
      // Don't reveal whether the email exists or not for security reasons
      // Always return success to prevent email enumeration
      return NextResponse.json(
        { 
          success: true,
          message: 'Se l\'email esiste nel nostro sistema, riceverai un link per il reset della password'
        },
        { status: 200 }
      )
    }

    console.log('[forgot-password] Password reset email sent to:', email)

    return NextResponse.json(
      { 
        success: true,
        message: 'Email di reset inviata con successo'
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[forgot-password] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Errore del server. Riprova più tardi.' },
      { status: 500 }
    )
  }
}
