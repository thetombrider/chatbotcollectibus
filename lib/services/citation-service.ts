/**
 * Citation Service
 * 
 * Centralizza tutta la logica di gestione citazioni:
 * - Parsing citazioni da testo
 * - Rinumerazione citazioni
 * - Matching citazioni ↔ sources
 * - Normalizzazione formati errati
 */

export interface CitationMatch {
  originalIndex: number
  newIndex: number
}

export interface RenumberedResult {
  content: string
  sources: Source[]
  citationMapping: Map<number, number>
}

export interface Source {
  index: number
  documentId: string
  filename: string
  similarity: number
  content: string
  chunkIndex: number
  type?: 'kb' | 'web'
  title?: string
  url?: string
}

/**
 * Estrae tutti gli indici citati dal contenuto del messaggio
 * Supporta formato [cit:1,2,3] o [cit:8,9]
 * 
 * @param content - Contenuto del messaggio con citazioni
 * @returns Array di indici unici citati, ordinati
 */
export function extractCitedIndices(content: string): number[] {
  const indices = new Set<number>()
  const regex = /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
  const matches = content.matchAll(regex)
  
  for (const match of matches) {
    const indicesStr = match[1]
    const nums = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    
    nums.forEach(n => {
      if (!isNaN(n) && n > 0) {
        indices.add(n)
      }
    })
  }
  
  return Array.from(indices).sort((a, b) => a - b)
}

/**
 * Estrae tutti gli indici delle citazioni web dal contenuto del messaggio
 * Supporta formato [web:1,2,3] o [web:1, web:2, web:4, web:5]
 * 
 * @param content - Contenuto del messaggio con citazioni web
 * @returns Array di indici unici citati, ordinati
 */
export function extractWebCitedIndices(content: string): number[] {
  const indices = new Set<number>()
  // Supporta sia [web:1,2,3] che [web:1, web:2, web:4, web:5]
  const regex = /\[web[\s:]+(\d+(?:\s*,\s*(?:web[\s:]+)?\d+)*)\]/g
  const matches = content.matchAll(regex)
  
  for (const match of matches) {
    const indicesStr = match[1]
    // Estrai tutti i numeri, gestendo sia formato compatto che con prefisso ripetuto
    const allNumbers = indicesStr.match(/\d+/g) || []
    const nums = allNumbers.map((n: string) => parseInt(n, 10))
    
    nums.forEach(n => {
      if (!isNaN(n) && n > 0) {
        indices.add(n)
      }
    })
  }
  
  return Array.from(indices).sort((a, b) => a - b)
}

/**
 * Normalizza le citazioni web errate nel formato corretto [web:N]
 * Gestisce formati errati come [web_search_...] o altri pattern non standard
 * 
 * @param content - Contenuto del messaggio con possibili citazioni web errate
 * @returns Contenuto con citazioni web normalizzate nel formato [web:N]
 */
export function normalizeWebCitations(content: string): string {
  let normalized = content
  
  // Pattern 1: [web_search_TIMESTAMP_QUERY] -> rimuovi completamente (non è un formato valido)
  normalized = normalized.replace(/\[web_search_\d+_[^\]]+\]/g, '')
  
  // Pattern 2: Altri formati errati che contengono "web" ma non seguono [web:N]
  normalized = normalized.replace(/\[web_[^\]]+\]/g, '')
  
  return normalized
}

/**
 * Filtra le sources per includere solo quelle citate
 * 
 * @param citedIndices - Indici citati nel testo
 * @param sources - Array di sources disponibili
 * @returns Sources filtrate e rinumerate sequenzialmente (1, 2, 3...)
 */
export function filterSourcesByCitations(
  citedIndices: number[],
  sources: Source[]
): Source[] {
  if (citedIndices.length === 0) {
    return []
  }

  // Deduplica: per ogni indice citato, prendi solo la source con similarity più alta
  const sourceMap = new Map<number, Source>()
  sources.forEach(s => {
    if (citedIndices.includes(s.index)) {
      const existing = sourceMap.get(s.index)
      if (!existing || s.similarity > existing.similarity) {
        sourceMap.set(s.index, s)
      }
    }
  })

  // Ordina gli indici citati e crea array finale con rinumerazione sequenziale (1, 2, 3...)
  const sortedCitedIndices = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
  const filteredSources = sortedCitedIndices
    .map(index => sourceMap.get(index))
    .filter((s): s is Source => s !== undefined)
    .map((s, idx) => ({
      ...s,
      index: idx + 1, // Rinumerazione sequenziale semplice (1, 2, 3...)
    }))

  return filteredSources
}

/**
 * Crea mappatura da indice originale a nuovo indice
 * 
 * @param citedIndices - Indici citati (originali)
 * @returns Map<originalIndex, newIndex>
 */
export function createCitationMapping(citedIndices: number[]): Map<number, number> {
  const mapping = new Map<number, number>()
  const sortedIndices = Array.from(new Set(citedIndices)).sort((a, b) => a - b)
  
  sortedIndices.forEach((originalIndex, idx) => {
    mapping.set(originalIndex, idx + 1)
  })
  
  return mapping
}

/**
 * Rinumerà le citazioni nel testo usando la mappatura fornita
 * 
 * @param content - Contenuto con citazioni originali
 * @param mapping - Mappatura da indice originale a nuovo indice
 * @param citationType - Tipo di citazione ('cit' o 'web')
 * @returns Contenuto con citazioni rinumerate
 */
export function renumberCitations(
  content: string,
  mapping: Map<number, number>,
  citationType: 'cit' | 'web' = 'cit'
): string {
  const pattern = citationType === 'cit' 
    ? /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
    : /\[web[\s:]+(\d+(?:\s*,\s*(?:web[\s:]+)?\d+)*)\]/g

  return content.replace(pattern, (match, indicesStr) => {
    const indices = indicesStr.replace(/\s+/g, '').split(',').map((n: string) => parseInt(n, 10))
    const newIndices = indices
      .map((oldIdx: number) => mapping.get(oldIdx))
      .filter((newIdx: number | undefined): newIdx is number => newIdx !== undefined)
      .sort((a: number, b: number) => a - b)
    
    if (newIndices.length === 0) {
      return '' // Rimuovi citazione se non c'è corrispondenza
    }
    
    return `[${citationType}:${newIndices.join(',')}]`
  })
}

/**
 * Processa citazioni complete: estrae, filtra sources, rinumerà
 * 
 * @param content - Contenuto con citazioni
 * @param sources - Sources disponibili
 * @param citationType - Tipo di citazione ('cit' o 'web')
 * @returns Risultato con contenuto rinumerato, sources filtrate e mappatura
 */
export function processCitations(
  content: string,
  sources: Source[],
  citationType: 'cit' | 'web' = 'cit'
): RenumberedResult {
  // Estrai citazioni
  const citedIndices = citationType === 'cit' 
    ? extractCitedIndices(content)
    : extractWebCitedIndices(content)

  if (citedIndices.length === 0) {
    return {
      content,
      sources: [],
      citationMapping: new Map(),
    }
  }

  // Filtra sources
  const filteredSources = filterSourcesByCitations(citedIndices, sources)

  // Crea mappatura
  const mapping = createCitationMapping(citedIndices)

  // Rinumerà citazioni
  const renumberedContent = renumberCitations(content, mapping, citationType)

  return {
    content: renumberedContent,
    sources: filteredSources,
    citationMapping: mapping,
  }
}

