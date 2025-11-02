'use client'

import { useState } from 'react'

interface TestResult {
  success: boolean
  message?: string
  error?: string
}

export default function TestPage() {
  const [results, setResults] = useState<Record<string, TestResult>>({})
  const [testing, setTesting] = useState(false)

  const testAPI = async (url: string, name: string) => {
    setResults(prev => ({ ...prev, [name]: { success: false, message: 'Testing...' } }))
    
    try {
      const res = await fetch(url)
      const data = await res.json()
      setResults(prev => ({ ...prev, [name]: data }))
    } catch (error) {
      setResults(prev => ({
        ...prev,
        [name]: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }))
    }
  }

  const testAll = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/test/all')
      const data = await res.json()
      setResults(data.results || {})
    } catch (error) {
      console.error('Test failed:', error)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">API Connection Tests</h1>
        
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Test All Connections</h2>
            <button
              onClick={testAll}
              disabled={testing}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test All APIs'}
            </button>
            
            {Object.keys(results).length > 0 && (
              <div className="mt-4 space-y-2">
                {Object.entries(results).map(([service, result]) => (
                  <div
                    key={service}
                    className={result.success ? 'text-green-600' : 'text-red-600'}
                  >
                    {result.success ? '✅' : '❌'} {service.toUpperCase()}:{' '}
                    {result.message || result.error}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Individual Tests</h2>
            <div className="space-y-2">
              <button
                onClick={() => testAPI('/api/test/supabase', 'supabase')}
                className="bg-green-500 text-white px-4 py-2 rounded mr-2 hover:bg-green-600"
              >
                Test Supabase
              </button>
              <button
                onClick={() => testAPI('/api/test/openai', 'openai')}
                className="bg-purple-500 text-white px-4 py-2 rounded mr-2 hover:bg-purple-600"
              >
                Test OpenAI
              </button>
              <button
                onClick={() => testAPI('/api/test/openrouter', 'openrouter')}
                className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
              >
                Test OpenRouter
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

