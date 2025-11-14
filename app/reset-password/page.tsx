'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useSettings } from '@/hooks/useSettings'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { showToast } = useToast()
  const { logoUrl } = useSettings()

  // Check for errors from the confirmation link
  useEffect(() => {
    const errorParam = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    
    if (errorParam) {
      setError(errorDescription || 'Link non valido o scaduto')
      showToast('Link non valido o scaduto. Richiedi un nuovo link di reset.', 'error')
    }
  }, [searchParams, showToast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (password.length < 6) {
      setError('La password deve essere di almeno 6 caratteri')
      showToast('La password deve essere di almeno 6 caratteri', 'error')
      return
    }

    if (password !== confirmPassword) {
      setError('Le password non coincidono')
      showToast('Le password non coincidono', 'error')
      return
    }

    setLoading(true)

    try {
      // Update password directly using Supabase client
      // This works because the session is already established from the email link
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        console.error('[reset-password] Error updating password:', updateError)
        setError(updateError.message || 'Errore durante il reset della password')
        showToast(updateError.message || 'Errore durante il reset della password', 'error')
        return
      }

      showToast('Password aggiornata con successo', 'success')
      
      // Sign out after password reset for security
      await supabase.auth.signOut()
      
      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/login')
      }, 1500)
    } catch (error) {
      console.error('[reset-password] Unexpected error:', error)
      const errorMsg = 'Errore imprevisto. Riprova più tardi.'
      setError(errorMsg)
      showToast(errorMsg, 'error')
    } finally {
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
            Nuova password
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Inserisci la tua nuova password
          </p>
        </div>

        {/* Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-900 mb-1.5">
                Nuova password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-300 transition-colors"
                placeholder="••••••••"
                disabled={loading}
                minLength={6}
              />
              <p className="mt-1 text-xs text-gray-400">Minimo 6 caratteri</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-900 mb-1.5">
                Conferma password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-300 transition-colors"
                placeholder="••••••••"
                disabled={loading}
                minLength={6}
              />
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
                Aggiornamento...
              </span>
            ) : (
              'Aggiorna password'
            )}
          </button>

          {/* Back to login */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              disabled={loading}
            >
              Torna al <span className="font-medium text-gray-900">login</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
