import { createServerClient, type EmailOtpType } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Auth callback handler for OAuth, email confirmation, and password reset
 * Handles redirects from Supabase after various authentication flows
 * 
 * Based on official Supabase documentation:
 * https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url)
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const next = requestUrl.searchParams.get('next') ?? '/'
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('[auth/callback] OAuth error:', error, errorDescription)
    const errorUrl = new URL(type === 'recovery' ? '/reset-password' : '/login', request.url)
    errorUrl.searchParams.set('error', errorDescription || 'Errore durante l\'autenticazione')
    return NextResponse.redirect(errorUrl)
  }

  // Create response first so we can set cookies
  let redirectPath = next
  if (type === 'recovery') {
    redirectPath = '/reset-password'
  } else if (!code && !token_hash) {
    redirectPath = '/login'
  }
  
  const response = NextResponse.redirect(new URL(redirectPath, request.url))

  // Create Supabase client with cookie handling
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          request.cookies.set({ name, value, ...options })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: Record<string, unknown>) {
          request.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Handle email confirmation with OTP (signup, recovery, etc.)
  if (token_hash && type) {
    console.log(`[auth/callback] Verifying OTP for type: ${type}`)
    
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (verifyError) {
      console.error('[auth/callback] Failed to verify OTP:', verifyError)
      const errorUrl = new URL(type === 'recovery' ? '/reset-password' : '/login', request.url)
      errorUrl.searchParams.set('error', 'Link non valido o scaduto')
      errorUrl.searchParams.set('error_description', verifyError.message)
      return NextResponse.redirect(errorUrl)
    }

    console.log(`[auth/callback] OTP verified successfully for type: ${type}`)
    return response
  }

  // Handle OAuth code exchange
  if (code) {
    console.log('[auth/callback] Exchanging OAuth code for session')
    
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('[auth/callback] Failed to exchange code:', exchangeError)
      const errorUrl = new URL('/login', request.url)
      errorUrl.searchParams.set('error', 'Errore durante la creazione della sessione')
      return NextResponse.redirect(errorUrl)
    }

    console.log('[auth/callback] OAuth code exchanged successfully')
    return response
  }

  // No valid parameters found
  console.error('[auth/callback] No valid authentication parameters received')
  return NextResponse.redirect(new URL('/login', request.url))
}

  // Exchange code for session
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.session) {
    console.error('[auth/callback] Failed to exchange code for session:', exchangeError)
    const errorUrl = new URL('/login', request.url)
    errorUrl.searchParams.set('error', 'Errore durante la creazione della sessione')
    return NextResponse.redirect(errorUrl)
  }

  // Success - redirect to chat with session cookies
  return response
}

