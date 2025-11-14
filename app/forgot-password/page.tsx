'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useSettings } from '@/hooks/useSettings'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()
  const { showToast } = useToast()
  const { logoUrl } = useSettings()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Use Supabase Auth directly as per official documentation
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm`,
      })

      if (error) {
        showToast(error.message || 'Errore durante l\'invio dell\'email', 'error')
        return
      }

      setSuccess(true)
      showToast('Email di reset inviata con successo', 'success')
    } catch (error) {
      console.error('Forgot password error:', error)
      showToast('Errore imprevisto. Riprova più tardi.', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
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

          {/* Success message */}
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-medium text-gray-900">
              Email inviata
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Controlla la tua casella di posta. Ti abbiamo inviato un link per reimpostare la password.
            </p>
            <p className="mt-4 text-xs text-gray-400">
              Il link scadrà tra 1 ora. Se non ricevi l'email, controlla la cartella spam.
            </p>
          </div>

          {/* Back to login */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Torna al <span className="font-medium text-gray-900">login</span>
            </button>
          </div>
        </div>
      </div>
    )
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
            Password dimenticata?
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Inserisci il tuo indirizzo email e ti invieremo un link per reimpostare la password
          </p>
        </div>

        {/* Form */}
        <form className="space-y-6" onSubmit={handleSubmit}>
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
                Invio in corso...
              </span>
            ) : (
              'Invia link di reset'
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
