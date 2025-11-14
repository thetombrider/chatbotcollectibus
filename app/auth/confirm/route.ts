import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/client'

/**
 * Email confirmation handler for Supabase Auth
 * Handles email verification links from signup, magic links, and password reset
 * 
 * Based on official Supabase Next.js documentation:
 * https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  console.log('[auth/confirm] Processing confirmation:', { type, has_token: !!token_hash })

  if (token_hash && type) {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      console.log('[auth/confirm] OTP verified successfully')
      
      // Determine redirect based on type
      if (type === 'recovery') {
        redirect('/reset-password')
      }
      
      // For other types (signup, invite, etc.), redirect to specified path
      redirect(next)
    }

    console.error('[auth/confirm] OTP verification failed:', error)
  }

  // Redirect to error page with instructions
  console.error('[auth/confirm] Missing or invalid parameters')
  redirect('/login?error=Link+non+valido+o+scaduto')
}
