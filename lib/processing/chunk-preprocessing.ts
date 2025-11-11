/**
 * Pulisce e normalizza contenuto chunk prima del salvataggio
 * 
 * Questa funzione rimuove caratteri non informativi, normalizza whitespace
 * e rimuove header/footer ripetuti per migliorare la qualità del contenuto
 * salvato nel database e utilizzato per full-text search.
 * 
 * @param content - Contenuto del chunk da preprocessare
 * @returns Contenuto pulito e normalizzato
 * 
 * @example
 * const cleaned = preprocessChunkContent("Pagina 1/10\n\n\nArticolo 1\n\n\nContenuto...")
 * // Output: "Pagina 1/10\n\nArticolo 1\n\nContenuto..."
 */
export function preprocessChunkContent(content: string): string {
  let cleaned = content
  
  // 1. Rimuovi header/footer ripetuti comuni (es. "Pagina 1/10", "Page 1 of 10")
  cleaned = cleaned.replace(/pagina\s+\d+\s*\/\s*\d+/gi, '')
  cleaned = cleaned.replace(/page\s+\d+\s+of\s+\d+/gi, '')
  cleaned = cleaned.replace(/^\d+\s*\/\s*\d+\s*$/gm, '') // Solo numeri su riga
  
  // 2. Normalizza line breaks (max 2 consecutivi)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  
  // 3. Rimuovi spazi multipli e tabs
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ')
  
  // 4. Rimuovi caratteri non stampabili (mantieni newline, tab, space)
  // Rimuove: \x00-\x08 (control chars), \x0B-\x0C (vertical tab, form feed),
  // \x0E-\x1F (altri control chars), \x7F (DEL), \uFEFF (BOM)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFEFF]/g, '')
  
  // 5. Rimuovi caratteri Unicode non informativi (bullet points vari)
  cleaned = cleaned.replace(/[•●○◦►▸▪▫■□▲▼◆◇]/g, '')
  
  // 6. Normalizza spazi attorno a punteggiatura (opzionale, può essere troppo aggressivo)
  // Rimuoviamo spazi multipli prima della punteggiatura
  cleaned = cleaned.replace(/\s+([.,;:!?])/g, '$1')
  
  // 7. Rimuovi righe vuote all'inizio e alla fine
  cleaned = cleaned.replace(/^\s+|\s+$/g, '')
  
  // 8. Trim finale
  cleaned = cleaned.trim()
  
  return cleaned
}













