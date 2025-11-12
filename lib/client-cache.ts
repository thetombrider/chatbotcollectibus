interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

const cache = new Map<string, CacheEntry<unknown>>()

/**
 * Recupera un valore dalla cache, invalidando automaticamente gli entry scaduti.
 */
function getFromCache<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) {
    return undefined
  }

  const isExpired = Date.now() - entry.timestamp > entry.ttl
  if (isExpired) {
    cache.delete(key)
    return undefined
  }

  return entry.data as T
}

/**
 * Salva un valore nella cache con un TTL.
 */
function setCache<T>(key: string, value: T, ttl: number) {
  cache.set(key, {
    data: value,
    timestamp: Date.now(),
    ttl,
  })
}

/**
 * Recupera un valore utilizzando un semplice caching in-memory lato client.
 * In caso di errore la cache non viene popolata.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 30_000
): Promise<T> {
  const cached = getFromCache<T>(key)
  if (cached !== undefined) {
    return cached
  }

  const data = await fetcher()
  setCache(key, data, ttl)
  return data
}

/**
 * Invalida un entry specifico o l'intera cache se la chiave non è fornita.
 */
export function invalidateCache(key?: string) {
  if (key) {
    cache.delete(key)
    return
  }
  cache.clear()
}


