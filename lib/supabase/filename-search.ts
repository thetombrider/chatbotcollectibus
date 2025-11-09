/**
 * Filename Search
 * 
 * Cerca documenti per nome file come fallback quando la ricerca vettoriale
 * non trova documenti rilevanti ma il nome del file corrisponde alla query
 */

import { supabaseAdmin } from './admin'
import type { SearchResult } from './database.types'

/**
 * Estrae possibili nomi di file dalla query
 * Es: "spiegami la CSRD" -> ["CSRD"]
 *     "GDPR e ESPR" -> ["GDPR", "ESPR"]
 */
export function extractPossibleFilenames(query: string): string[] {
  const filenames: string[] = []
  
  // Pattern per acronimi comuni (2-10 lettere maiuscole)
  const acronymPattern = /\b([A-Z]{2,10})\b/g
  const matches = query.matchAll(acronymPattern)
  
  for (const match of matches) {
    const acronym = match[1]
    // Escludi parole comuni che non sono acronimi
    const commonWords = ['IL', 'LA', 'LO', 'LE', 'DI', 'DA', 'IN', 'SU', 'PER', 'CON', 'DEL', 'DELLA', 'DELLE', 'DELLO']
    if (!commonWords.includes(acronym)) {
      filenames.push(acronym)
    }
  }
  
  // Pattern per nomi di normative comuni (es: "GDPR", "CSRD", "ESPR")
  const regulationPattern = /\b(GDPR|CSRD|ESPR|ESRS|NFRD|SFDR|EU|UE)\b/gi
  const regulationMatches = query.matchAll(regulationPattern)
  
  for (const match of regulationMatches) {
    const regulation = match[1].toUpperCase()
    if (!filenames.includes(regulation)) {
      filenames.push(regulation)
    }
  }
  
  return filenames
}

/**
 * Cerca documenti per nome file e restituisce i chunks
 */
export async function searchByFilename(
  filenames: string[],
  limit: number = 10
): Promise<SearchResult[]> {
  if (filenames.length === 0) {
    return []
  }

  try {
    // Cerca documenti con nomi che contengono gli acronimi
    // Costruisci query OR per ogni acronimo
    let query = supabaseAdmin
      .from('documents')
      .select('id, filename')
      .eq('processing_status', 'completed')
    
    // Aggiungi filtri OR per ogni acronimo
    const orConditions = filenames.map(f => `filename.ilike.%${f}%`).join(',')
    query = query.or(orConditions)
    query = query.limit(10)
    
    const { data: documents, error } = await query

    if (error) {
      console.error('[filename-search] Failed to search documents:', error)
      return []
    }

    if (!documents || documents.length === 0) {
      return []
    }

    // Per ogni documento trovato, recupera i chunks
    const documentIds = documents.map(d => d.id)
    const filenameMap = new Map(documents.map(d => [d.id, d.filename]))
    
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .select('id, document_id, content, chunk_index, metadata, created_at')
      .in('document_id', documentIds)
      .order('chunk_index', { ascending: true })
      .limit(limit * 5) // Prendi più chunks per avere più contenuto

    if (chunksError) {
      console.error('[filename-search] Failed to get chunks:', chunksError)
      return []
    }

    if (!chunks || chunks.length === 0) {
      return []
    }

    // Converti in SearchResult con similarity alta (perché match esatto per nome)
    const results: SearchResult[] = chunks.map((chunk: any) => {
      const filename = filenameMap.get(chunk.document_id) || 'Documento sconosciuto'
      return {
        id: chunk.id,
        document_id: chunk.document_id,
        content: chunk.content,
        chunk_index: chunk.chunk_index,
        metadata: chunk.metadata || {},
        created_at: chunk.created_at || new Date().toISOString(),
        similarity: 0.8, // Similarity alta per match esatto per nome file
        document_filename: filename,
        document_metadata: {},
        vector_score: 0.8,
        text_score: 1.0, // Score alto per match esatto
      }
    })

    // Ordina per similarity (decrescente) e limita
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
  } catch (error) {
    console.error('[filename-search] Search by filename failed:', error)
    return []
  }
}

/**
 * Combina risultati vettoriali con risultati per nome file
 * Rimuove duplicati e mantiene i risultati migliori
 */
export function combineSearchResults(
  vectorResults: SearchResult[],
  filenameResults: SearchResult[]
): SearchResult[] {
  // Crea mappa per rimuovere duplicati (stesso chunk_id)
  const resultMap = new Map<string, SearchResult>()
  
  // Aggiungi risultati vettoriali (priorità più alta se similarity > 0.5)
  vectorResults.forEach(result => {
    const key = result.id
    const existing = resultMap.get(key)
    if (!existing || result.similarity > existing.similarity) {
      resultMap.set(key, result)
    }
  })
  
  // Aggiungi risultati per nome file (solo se non già presenti o con similarity più alta)
  filenameResults.forEach(result => {
    const key = result.id
    const existing = resultMap.get(key)
    if (!existing || result.similarity > existing.similarity) {
      resultMap.set(key, result)
    }
  })
  
  // Ordina per similarity e restituisci
  return Array.from(resultMap.values())
    .sort((a, b) => b.similarity - a.similarity)
}

