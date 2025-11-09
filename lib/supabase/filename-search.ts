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
 * Strategia migliorata: estrae termini chiave generici invece di solo acronimi hardcoded
 * 
 * Es: "spiegami la CSRD" -> ["CSRD"]
 *     "GDPR e ESPR" -> ["GDPR", "ESPR"]
 *     "regolamento 2016/679" -> ["2016", "679", "regolamento"]
 *     "Corporate Sustainability Reporting Directive" -> ["Corporate", "Sustainability", "Reporting", "Directive"]
 */
export function extractPossibleFilenames(query: string): string[] {
  const filenames: string[] = []
  const seen = new Set<string>()
  
  // 1. Pattern per acronimi (2-10 lettere maiuscole consecutive)
  const acronymPattern = /\b([A-Z]{2,10})\b/g
  const acronymMatches = query.matchAll(acronymPattern)
  
  const commonWords = new Set([
    'IL', 'LA', 'LO', 'LE', 'DI', 'DA', 'IN', 'SU', 'PER', 'CON', 'DEL', 'DELLA', 'DELLE', 'DELLO',
    'CHE', 'CHI', 'COSA', 'COME', 'QUANDO', 'DOVE', 'PERCHÉ', 'PERCHE',
    'THE', 'AND', 'OR', 'BUT', 'FOR', 'WITH', 'FROM', 'TO', 'OF', 'IN', 'ON', 'AT', 'BY'
  ])
  
  for (const match of acronymMatches) {
    const acronym = match[1]
    if (!commonWords.has(acronym) && !seen.has(acronym)) {
      filenames.push(acronym)
      seen.add(acronym)
    }
  }
  
  // 2. Pattern per numeri di regolamento/direttiva (es: "2016/679", "2013/34")
  const regulationNumberPattern = /\b(\d{4})\/\d+\b/g
  const numberMatches = query.matchAll(regulationNumberPattern)
  for (const match of numberMatches) {
    const year = match[1]
    if (!seen.has(year)) {
      filenames.push(year)
      seen.add(year)
    }
  }
  
  // 3. Estrai termini chiave importanti (nomi propri, termini tecnici)
  // Rimuovi stop words e estrai parole significative
  const stopWords = new Set([
    'il', 'la', 'lo', 'le', 'gli', 'i', 'un', 'una', 'uno', 'di', 'da', 'in', 'su', 'per', 'con', 'del', 'della', 'delle', 'dello',
    'che', 'chi', 'cosa', 'come', 'quando', 'dove', 'perché', 'perche',
    'the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'from', 'to', 'of', 'in', 'on', 'at', 'by',
    'spiegami', 'spiega', 'descrivimi', 'raccontami', 'parlami', 'dimmi', 'mostrami',
    'explain', 'describe', 'tell', 'show', 'what', 'is', 'are', 'was', 'were'
  ])
  
  // Estrai parole con iniziale maiuscola (nomi propri, termini tecnici)
  const capitalizedWordsPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g
  const capitalizedMatches = query.matchAll(capitalizedWordsPattern)
  
  for (const match of capitalizedMatches) {
    const phrase = match[1]
    // Dividi in parole singole
    const words = phrase.split(/\s+/)
    for (const word of words) {
      const lowerWord = word.toLowerCase()
      if (!stopWords.has(lowerWord) && word.length >= 3 && !seen.has(word)) {
        filenames.push(word)
        seen.add(word)
      }
    }
  }
  
  // 4. Estrai anche termini tecnici comuni (anche se minuscoli ma significativi)
  const technicalTerms = [
    'regolamento', 'direttiva', 'normativa', 'legge', 'decreto',
    'regulation', 'directive', 'regulation', 'law', 'decree',
    'gdpr', 'csrd', 'espr', 'esrs', 'nfrd', 'sfdr'
  ]
  
  const lowerQuery = query.toLowerCase()
  for (const term of technicalTerms) {
    if (lowerQuery.includes(term) && !seen.has(term.toUpperCase())) {
      filenames.push(term.toUpperCase())
      seen.add(term.toUpperCase())
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

