/**
 * Normalizza testo prima della generazione embedding
 * 
 * Questa funzione applica normalizzazione per migliorare la consistency
 * degli embeddings e aumentare i punteggi di similarity.
 * 
 * @param text - Testo da normalizzare
 * @returns Testo normalizzato pronto per l'embedding
 * 
 * @example
 * const normalized = normalizeTextForEmbedding("La GDPR  stabilisce...")
 * // Output: "la gdpr general data protection regulation stabilisce..."
 */
export function normalizeTextForEmbedding(text: string): string {
  let normalized = text
  
  // 1. Lowercase (per ridurre varianza)
  normalized = normalized.toLowerCase()
  
  // 2. Rimuovi caratteri speciali non informativi
  normalized = normalized.replace(/[•●○◦►▸▪▫■□]/g, '')
  
  // 3. Normalizza whitespace (spazi multipli, tabs, newlines)
  normalized = normalized.replace(/\s+/g, ' ')
  
  // 4. Rimuovi spazi prima/dopo punteggiatura
  normalized = normalized.replace(/\s+([.,;:!?])/g, '$1')
  normalized = normalized.replace(/([.,;:!?])\s+/g, '$1 ')
  
  // 5. Espandi acronimi comuni nel dominio consulting/regolamentazione
  const acronyms: Record<string, string> = {
    'gdpr': 'gdpr general data protection regulation protezione dati personali privacy',
    'espr': 'espr ecodesign sustainable products regulation regolamento prodotti sostenibili',
    'ppwr': 'ppwr packaging waste regulation regolamento imballaggi rifiuti',
    'ce': 'ce conformità europea marcatura',
    'iso': 'iso international organization for standardization',
    'pii': 'pii personally identifiable information dati identificativi',
    'dpo': 'dpo data protection officer responsabile protezione dati',
    'roi': 'roi return on investment ritorno investimento',
    'kpi': 'kpi key performance indicator indicatori prestazione',
    'sla': 'sla service level agreement accordo livello servizio',
    'nda': 'nda non disclosure agreement accordo riservatezza',
    'rnd': 'rnd research and development ricerca sviluppo',
    'ai': 'ai artificial intelligence intelligenza artificiale',
    'ml': 'ml machine learning apprendimento automatico',
    'api': 'api application programming interface',
    'crm': 'crm customer relationship management',
    'erp': 'erp enterprise resource planning',
    'sap': 'sap systems applications products',
    'iot': 'iot internet of things internet delle cose',
    'cbd': 'cbd cannabidiol cannabidiolo',
    'thc': 'thc tetrahydrocannabinol tetraidrocannabinolo',
  }
  
  for (const [acronym, expansion] of Object.entries(acronyms)) {
    // Match whole word boundaries only
    const regex = new RegExp(`\\b${acronym}\\b`, 'gi')
    if (regex.test(normalized)) {
      // Aggiungi expansion solo se non è già presente
      if (!normalized.includes(expansion)) {
        normalized = normalized + ' ' + expansion
      }
    }
  }
  
  // 6. Trim
  normalized = normalized.trim()
  
  return normalized
}





