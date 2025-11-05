import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * OAuth callback handler for Azure AD SSO
 * This route handles the redirect from Supabase after OAuth authentication
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('[auth/callback] OAuth error:', error, errorDescription)
    const errorUrl = new URL('/login', request.url)
    errorUrl.searchParams.set(
      'error',
      errorDescription || 'Errore durante l\'autenticazione con Microsoft'
    )
    return NextResponse.redirect(errorUrl)
  }

  // If no code, redirect to login
  if (!code) {
    console.error('[auth/callback] No authorization code received')
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Create response object for cookie handling
  const response = NextResponse.redirect(new URL('/chat', request.url))

  // Create Supabase client to exchange code for session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          // Set cookie on both request and response
          request.cookies.set({ name, value, ...options })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: Record<string, unknown>) {
          // Remove cookie on both request and response
          request.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

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

