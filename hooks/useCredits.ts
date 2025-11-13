import { useEffect, useState } from 'react'

interface CreditsData {
  totalCredits: number
  totalUsage: number
  remaining: number
}

export function useCredits() {
  const [credits, setCredits] = useState<CreditsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCredits = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/credits')
      
      if (!response.ok) {
        throw new Error('Failed to fetch credits')
      }

      const data = await response.json()
      setCredits(data)
      setError(null)
    } catch (err) {
      console.error('Error fetching credits:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCredits()
    
    // Refresh credits every 5 minutes
    const interval = setInterval(fetchCredits, 5 * 60 * 1000)
    
    return () => clearInterval(interval)
  }, [])

  return { credits, loading, error, refetch: fetchCredits }
}
