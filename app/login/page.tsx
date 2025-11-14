'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useSettings } from '@/hooks/useSettings'

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const { logoUrl } = useSettings()

  useEffect(() => {
    // Check for OAuth errors in URL query params
    const urlParams = new URLSearchParams(window.location.search)
    const errorParam = urlParams.get('error')
    if (errorParam) {
      setError(errorParam)
      showToast(errorParam, 'error')
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [showToast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (isLogin) {
        // Login
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          setError(signInError.message)
          showToast(signInError.message, 'error')
          return
        }
      } else {
        // Signup - no email verification
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/chat`,
            data: {
              email_confirmed: true,
            },
          },
        })

        if (signUpError) {
          setError(signUpError.message)
          showToast(signUpError.message, 'error')
          return
        }

        // Auto-login after signup
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInError) {
          const errorMsg = 'Account created but login failed. Please try logging in.'
          setError(errorMsg)
          showToast(errorMsg, 'error')
          return
        }
      }

      // Success - redirect to chat
      router.push('/chat')
      router.refresh()
    } catch (err) {
      const errorMsg = 'An unexpected error occurred. Please try again.'
      setError(errorMsg)
      showToast(errorMsg, 'error')
      console.error('Auth error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleMicrosoftLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'email openid profile',
        },
      })

      if (oauthError) {
        setError(oauthError.message)
        showToast(oauthError.message, 'error')
        setLoading(false)
        return
      }

      // Redirect to Azure AD for authentication
      if (data?.url) {
        window.location.href = data.url
      }
    } catch (err) {
      const errorMsg = 'Errore durante l\'autenticazione con Microsoft. Riprova.'
      setError(errorMsg)
      showToast(errorMsg, 'error')
      console.error('Microsoft OAuth error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        {/* Logo */}
        {logoUrl && (
          <div className="flex justify-center">
            <img
              src={logoUrl}
              alt="Company Logo"
              className="max-h-24 w-full max-w-full object-contain"
            />
          </div>
        )}

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-medium text-gray-900">
            {isLogin ? 'Accedi' : 'Registrati'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {isLogin
              ? 'Accedi al tuo account per continuare'
              : 'Crea un nuovo account per iniziare'}
          </p>
        </div>

        {/* Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-1.5">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-300 transition-colors"
                placeholder="nome@esempio.it"
                disabled={loading}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-900">
                  Password
                </label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => router.push('/forgot-password')}
                    className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                    disabled={loading}
                  >
                    Password dimenticata?
                  </button>
                )}
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-300 transition-colors"
                placeholder="••••••••"
                disabled={loading}
                minLength={6}
              />
              {!isLogin && (
                <p className="mt-1 text-xs text-gray-400">Minimo 6 caratteri</p>
              )}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-100 p-3">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-4 w-4 text-red-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-2.5">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Caricamento...
              </span>
            ) : isLogin ? (
              'Accedi'
            ) : (
              'Registrati'
            )}
          </button>

          {/* Microsoft SSO Button */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-400">oppure</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMicrosoftLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 bg-white hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 23 23"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11.5 11.5H22.5V22.5H11.5V11.5Z"
                fill="#F25022"
              />
              <path
                d="M0.5 11.5H11.5V22.5H0.5V11.5Z"
                fill="#7FBA00"
              />
              <path
                d="M0.5 0.5H11.5V11.5H0.5V0.5Z"
                fill="#00A4EF"
              />
              <path
                d="M11.5 0.5H22.5V11.5H11.5V0.5Z"
                fill="#FFB900"
              />
            </svg>
            {loading ? 'Caricamento...' : 'Entra con Microsoft'}
          </button>

          {/* Toggle between login and signup */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin)
                setError(null)
              }}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              disabled={loading}
            >
              {isLogin ? (
                <>
                  Non hai un account?{' '}
                  <span className="font-medium text-gray-900">Registrati</span>
                </>
              ) : (
                <>
                  Hai già un account?{' '}
                  <span className="font-medium text-gray-900">Accedi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}












