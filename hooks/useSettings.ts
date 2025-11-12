import { useCallback, useEffect, useState } from 'react'
import { fetchWithCache, invalidateCache } from '@/lib/client-cache'

interface SettingsResponse {
  company_logo?: {
    url: string | null
    storage_path: string | null
  }
}

const SETTINGS_CACHE_KEY = 'settings:company'

export function useSettings() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchWithCache<SettingsResponse>(
        SETTINGS_CACHE_KEY,
        async () => {
          const res = await fetch('/api/settings')
          if (!res.ok) {
            throw new Error(`Failed to fetch settings: ${res.status}`)
          }
          return (await res.json()) as SettingsResponse
        },
        120_000
      )
      setLogoUrl(data.company_logo?.url ?? null)
      setError(null)
    } catch (err) {
      console.error('Failed to load settings:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const refresh = useCallback(() => {
    invalidateCache(SETTINGS_CACHE_KEY)
    return loadSettings()
  }, [loadSettings])

  return {
    logoUrl,
    loading,
    error,
    refresh,
  }
}


