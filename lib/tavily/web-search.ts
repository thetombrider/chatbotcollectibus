/**
 * Wrapper per ricerca web con Tavily
 * Usa l'API Tavily per cercare informazioni sul web quando la knowledge base non è sufficiente
 */

interface TavilySearchResult {
  title: string
  url: string
  content: string
  score?: number
  published_date?: string
}

interface TavilySearchResponse {
  results: TavilySearchResult[]
  query: string
}

/**
 * Esegue una ricerca web usando Tavily
 * 
 * @param query - Query di ricerca
 * @param maxResults - Numero massimo di risultati (default: 5)
 * @returns Risultati della ricerca web
 */
export async function searchWeb(query: string, maxResults: number = 5): Promise<TavilySearchResponse> {
  const tavilyApiKey = process.env.TAVILY_API_KEY

  if (!tavilyApiKey) {
    throw new Error('TAVILY_API_KEY is not set. Please add it to your .env.local file.')
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Tavily API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    return {
      results: (data.results || []).map((result: any) => ({
        title: result.title || 'Senza titolo',
        url: result.url || '',
        content: result.content || '',
        score: result.score,
        published_date: result.published_date,
      })),
      query,
    }
  } catch (error) {
    console.error('[tavily/web-search] Search failed:', error)
    throw error instanceof Error ? error : new Error('Web search failed')
  }
}

export type { TavilySearchResult, TavilySearchResponse }

