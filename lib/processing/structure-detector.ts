/**
 * Structure Detector
 * 
 * Rileva pattern strutturali comuni in modo generico:
 * - Articoli (Articolo N, Art. N, Article N)
 * - Sezioni (markdown headers, "Sezione N", "Parte I")
 * - Capitoli ("Capitolo N", "Chapter N")
 * 
 * Funziona per tutti i tipi di documenti (regolamenti, report, manuali, etc.)
 */

export interface ArticlePattern {
  number: number
  text: string // "Articolo 28"
  start: number // posizione carattere nel testo
  end: number
}

export interface SectionPattern {
  title: string
  level?: number // per markdown headers
  start: number
  end: number
  type: 'markdown' | 'textual'
}

export interface ChapterPattern {
  number: number | string // può essere numero o romano (I, II, III)
  title?: string
  start: number
  end: number
}

export interface DocumentStructure {
  type: 'regulatory' | 'report' | 'manual' | 'mixed' | 'unknown'
  patterns: {
    articles?: ArticlePattern[]
    sections?: SectionPattern[]
    chapters?: ChapterPattern[]
  }
  confidence: number
}

// Limite per evitare timeout su documenti molto grandi
const MAX_TEXT_SIZE_FOR_FULL_DETECTION = 5 * 1024 * 1024 // 5MB
const MAX_PATTERNS_PER_TYPE = 1000 // Limite pattern per tipo per evitare array troppo grandi

/**
 * Rileva struttura del documento in modo generico
 * 
 * @param text - Testo del documento
 * @param format - Formato del testo ('markdown' o 'plain')
 * @returns DocumentStructure con pattern rilevati e confidence
 */
export function detectDocumentStructure(
  text: string,
  format: 'markdown' | 'plain'
): DocumentStructure {
  const textSize = text.length
  console.log(`[structure-detector] Detecting structure (format: ${format}, size: ${(textSize / 1024).toFixed(2)}KB)`)

  // Per documenti molto grandi, usa strategia semplificata
  if (textSize > MAX_TEXT_SIZE_FOR_FULL_DETECTION) {
    console.log(`[structure-detector] Large document detected (${(textSize / 1024 / 1024).toFixed(2)}MB), using optimized detection`)
    return detectDocumentStructureOptimized(text, format)
  }

  // Rileva pattern strutturali
  const startTime = Date.now()
  const articles = detectArticlePatterns(text)
  console.log(`[structure-detector] Articles detection took ${Date.now() - startTime}ms, found ${articles.length}`)
  
  const sectionsStartTime = Date.now()
  const sections = format === 'markdown' 
    ? detectMarkdownSections(text)
    : detectTextualSections(text)
  console.log(`[structure-detector] Sections detection took ${Date.now() - sectionsStartTime}ms, found ${sections.length}`)
  
  const chaptersStartTime = Date.now()
  const chapters = detectChapterPatterns(text)
  console.log(`[structure-detector] Chapters detection took ${Date.now() - chaptersStartTime}ms, found ${chapters.length}`)

  console.log(`[structure-detector] Found ${articles.length} articles, ${sections.length} sections, ${chapters.length} chapters`)

  // Inferisce tipo documento basandosi sui pattern trovati
  const type = inferDocumentType({
    articles,
    sections,
    chapters,
  })

  // Calcola confidence score
  const confidence = calculateConfidence({
    articles,
    sections,
    chapters,
    type,
  })

  console.log(`[structure-detector] Detected type: ${type}, confidence: ${confidence.toFixed(2)}`)

  return {
    type,
    patterns: {
      articles: articles.length > 0 ? articles : undefined,
      sections: sections.length > 0 ? sections : undefined,
      chapters: chapters.length > 0 ? chapters : undefined,
    },
    confidence,
  }
}

/**
 * Rileva pattern "Articolo N", "Art. N", "Article N", etc.
 * Generico - funziona per qualsiasi documento con articoli
 */
function detectArticlePatterns(text: string): ArticlePattern[] {
  const patterns: ArticlePattern[] = []
  
  // Pattern per articoli in italiano e inglese - ottimizzati per evitare backtracking
  // Usa (?:^|\n) solo all'inizio per catturare anche pattern all'inizio del documento
  const articleRegexes = [
    // "Articolo 28", "Articolo 1", etc.
    /(?:^|\n)\s*(?:Articolo|Article)\s+(\d+)\s*(?:\n|$|\.|:)/gim,
    // "Art. 28", "Art. 1", etc.
    /(?:^|\n)\s*Art\.?\s+(\d+)\s*(?:\n|$|\.|:)/gim,
    // "Art 28" (senza punto)
    /(?:^|\n)\s*Art\s+(\d+)\s*(?:\n|$|\.|:)/gim,
  ]

  for (const regex of articleRegexes) {
    // Usa matchAll per performance migliori e evitare bug con exec()
    const matches = Array.from(text.matchAll(regex))
    
    for (let i = 0; i < matches.length && patterns.length < MAX_PATTERNS_PER_TYPE; i++) {
      const match = matches[i]
      if (!match.index) continue
      
      const articleNumber = parseInt(match[1], 10)
      const fullMatch = match[0]
      const start = match.index
      const end = start + fullMatch.length

      // Evita duplicati (stesso numero, posizione simile)
      const isDuplicate = patterns.some(
        (p) => p.number === articleNumber && Math.abs(p.start - start) < 50
      )

      if (!isDuplicate) {
        patterns.push({
          number: articleNumber,
          text: fullMatch.trim(),
          start,
          end,
        })
      }
    }
  }

  // Ordina per posizione nel testo
  patterns.sort((a, b) => a.start - b.start)

  // Calcola end position più accurata cercando il prossimo articolo o fine documento
  for (let i = 0; i < patterns.length; i++) {
    const current = patterns[i]
    const next = patterns[i + 1]
    
    if (next) {
      // End è l'inizio del prossimo articolo
      current.end = next.start
    } else {
      // Ultimo articolo: end è fine documento o prossima sezione importante
      const nextSection = text.indexOf('\n\n', current.start + 100)
      current.end = nextSection > current.start ? nextSection : text.length
    }
  }

  return patterns
}

/**
 * Rileva sezioni markdown basandosi su headers (# ## ### etc)
 * Ottimizzato per documenti grandi usando iterazione invece di split
 */
function detectMarkdownSections(text: string): SectionPattern[] {
  const sections: SectionPattern[] = []
  
  // Per documenti molto grandi, usa regex invece di split per evitare array enormi
  if (text.length > 1 * 1024 * 1024) { // > 1MB
    const headerRegex = /^(#{1,6})\s+(.+)$/gm
    const matches = Array.from(text.matchAll(headerRegex))
    
    for (let i = 0; i < matches.length && sections.length < MAX_PATTERNS_PER_TYPE; i++) {
      const match = matches[i]
      if (!match.index) continue
      
      const level = match[1].length
      const title = match[2].trim()
      const start = match.index
      
      // Trova fine sezione (prossimo header o fine documento)
      const nextMatch = matches[i + 1]
      const end = nextMatch ? nextMatch.index : text.length
      
      sections.push({
        title,
        level,
        start,
        end,
        type: 'markdown',
      })
    }
    
    return sections
  }
  
  // Per documenti più piccoli, usa il metodo originale
  const lines = text.split('\n')
  
  let currentSectionStart = 0
  let currentSectionTitle: string | undefined = undefined
  let currentLevel: number | undefined = undefined

  for (let i = 0; i < lines.length && sections.length < MAX_PATTERNS_PER_TYPE; i++) {
    const line = lines[i]
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)

    if (headerMatch) {
      // Salva sezione precedente se non vuota
      if (currentSectionTitle !== undefined && i > 0) {
        const sectionText = lines.slice(currentSectionStart, i).join('\n')
        const start = text.indexOf(sectionText, currentSectionStart > 0 ? currentSectionStart - 1 : 0)
        
        if (start >= 0) {
          sections.push({
            title: currentSectionTitle,
            level: currentLevel,
            start,
            end: start + sectionText.length,
            type: 'markdown',
          })
        }
      }

      // Inizia nuova sezione
      currentSectionTitle = headerMatch[2].trim()
      currentLevel = headerMatch[1].length
      currentSectionStart = i
    }
  }

  // Aggiungi ultima sezione
  if (currentSectionTitle !== undefined) {
    const sectionText = lines.slice(currentSectionStart).join('\n')
    const start = text.indexOf(sectionText, currentSectionStart > 0 ? currentSectionStart - 1 : 0)
    
    if (start >= 0) {
      sections.push({
        title: currentSectionTitle,
        level: currentLevel,
        start,
        end: text.length,
        type: 'markdown',
      })
    }
  }

  return sections
}

/**
 * Rileva sezioni testuali (non markdown)
 * Pattern: "Sezione 1", "Parte I", "Section 1", etc.
 */
function detectTextualSections(text: string): SectionPattern[] {
  const sections: SectionPattern[] = []
  
  // Pattern per sezioni testuali - ottimizzati per evitare backtracking
  const sectionRegexes = [
    // "Sezione 1", "Sezione I", etc.
    /(?:^|\n)\s*(?:Sezione|Section|Parte|Part)\s+([IVX\d]+)\s*(?:\n|$|\.|:)/gim,
    // "Parte Prima", "Parte Seconda", etc.
    /(?:^|\n)\s*(?:Parte|Part)\s+(Prima|Seconda|Terza|Quarta|Quinta|Sesta|Settima|Ottava|Nona|Decima)\s*(?:\n|$|\.|:)/gim,
    // "Informativa", "Informativa sul trattamento", "Informativa privacy", etc.
    /(?:^|\n)\s*Informativa(?:\s+(?:sul|sulla|sui|sulle|breve|estesa|privacy|trattamento|dati|personali))?\s*(?:\n|$|\.|:)/gim,
  ]

  for (const regex of sectionRegexes) {
    // Usa matchAll per performance migliori e evitare bug con exec()
    const matches = Array.from(text.matchAll(regex))
    
    for (let i = 0; i < matches.length && sections.length < MAX_PATTERNS_PER_TYPE; i++) {
      const match = matches[i]
      if (!match.index) continue
      
      const title = match[0].trim()
      const start = match.index
      
      // Trova fine sezione (prossima sezione o fine documento)
      const nextMatch = matches[i + 1]
      const end = nextMatch ? nextMatch.index : text.length

      // Evita duplicati
      const isDuplicate = sections.some(
        (s) => s.title === title && Math.abs(s.start - start) < 50
      )

      if (!isDuplicate) {
        sections.push({
          title,
          start,
          end,
          type: 'textual',
        })
      }
    }
  }

  // Ordina per posizione
  sections.sort((a, b) => a.start - b.start)

  return sections
}

/**
 * Rileva capitoli ("Capitolo N", "Chapter N", etc.)
 */
function detectChapterPatterns(text: string): ChapterPattern[] {
  const chapters: ChapterPattern[] = []
  
  // Pattern per capitoli - ottimizzati per evitare backtracking
  const chapterRegexes = [
    // "Capitolo 1", "Chapter 1", etc.
    /(?:^|\n)\s*(?:Capitolo|Chapter)\s+(\d+)\s*(?:\n|$|\.|:)/gim,
    // "Capitolo I", "Chapter I", etc. (numeri romani)
    /(?:^|\n)\s*(?:Capitolo|Chapter)\s+([IVX]+)\s*(?:\n|$|\.|:)/gim,
  ]

  for (const regex of chapterRegexes) {
    // Usa matchAll per performance migliori e evitare bug con exec()
    const matches = Array.from(text.matchAll(regex))
    
    for (let i = 0; i < matches.length && chapters.length < MAX_PATTERNS_PER_TYPE; i++) {
      const match = matches[i]
      if (!match.index) continue
      
      const numberStr = match[1]
      const number = /^\d+$/.test(numberStr) 
        ? parseInt(numberStr, 10) 
        : numberStr // mantieni romano come stringa
      
      const fullMatch = match[0]
      const start = match.index
      
      // Trova fine capitolo (prossimo capitolo o fine documento)
      const nextMatch = matches[i + 1]
      const end = nextMatch ? nextMatch.index : text.length

      // Estrai titolo se presente (dopo il numero)
      const titleMatch = fullMatch.match(/:\s*(.+)$/)
      const title = titleMatch ? titleMatch[1].trim() : undefined

      // Evita duplicati
      const isDuplicate = chapters.some(
        (c) => c.number === number && Math.abs(c.start - start) < 50
      )

      if (!isDuplicate) {
        chapters.push({
          number,
          title,
          start,
          end,
        })
      }
    }
  }

  // Ordina per posizione
  chapters.sort((a, b) => a.start - b.start)

  return chapters
}

/**
 * Inferisce tipo documento basandosi sui pattern trovati
 * Non è perfetto, ma aiuta a scegliere strategia di chunking
 */
function inferDocumentType(patterns: {
  articles: ArticlePattern[]
  sections: SectionPattern[]
  chapters: ChapterPattern[]
}): DocumentStructure['type'] {
  const { articles, sections, chapters } = patterns

  // Regolamenti/leggi: molti articoli
  if (articles.length >= 5) {
    return 'regulatory'
  }

  // Manuali: molti capitoli
  if (chapters.length >= 3) {
    return 'manual'
  }

  // Report: molte sezioni
  if (sections.length >= 10) {
    return 'report'
  }

  // Documenti misti: hanno più tipi di pattern
  if (articles.length > 0 && sections.length > 0) {
    return 'mixed'
  }

  // Sconosciuto: nessun pattern chiaro
  return 'unknown'
}

/**
 * Calcola confidence score per i pattern trovati
 * 
 * Confidence alta se:
 * - Pattern sono ben definiti e numerosi
 * - Pattern sono ordinati sequenzialmente
 * - Pattern coprono una buona parte del documento
 */
function calculateConfidence(patterns: {
  articles: ArticlePattern[]
  sections: SectionPattern[]
  chapters: ChapterPattern[]
  type: DocumentStructure['type']
}): number {
  const { articles, sections, chapters, type } = patterns

  // Se nessun pattern, confidence bassa
  if (articles.length === 0 && sections.length === 0 && chapters.length === 0) {
    return 0.0
  }

  let confidence = 0.0

  // Confidence per articoli
  if (articles.length > 0) {
    // Più articoli = confidence più alta
    const articleScore = Math.min(articles.length / 20, 1.0) * 0.4
    
    // Verifica sequenzialità (articoli in ordine)
    let sequentialScore = 0.0
    if (articles.length > 1) {
      let sequential = 0
      for (let i = 1; i < articles.length; i++) {
        if (articles[i].number > articles[i - 1].number) {
          sequential++
        }
      }
      sequentialScore = (sequential / (articles.length - 1)) * 0.2
    } else {
      sequentialScore = 0.1
    }

    confidence += articleScore + sequentialScore
  }

  // Confidence per sezioni
  if (sections.length > 0) {
    const sectionScore = Math.min(sections.length / 30, 1.0) * 0.3
    confidence += sectionScore
  }

  // Confidence per capitoli
  if (chapters.length > 0) {
    const chapterScore = Math.min(chapters.length / 10, 1.0) * 0.2
    confidence += chapterScore
  }

  // Bonus per tipo documento ben definito
  if (type !== 'unknown' && type !== 'mixed') {
    confidence += 0.1
  }

  // Cap a 1.0
  return Math.min(confidence, 1.0)
}

/**
 * Versione ottimizzata per documenti molto grandi
 * Usa strategia semplificata per evitare timeout
 */
function detectDocumentStructureOptimized(
  text: string,
  format: 'markdown' | 'plain'
): DocumentStructure {
  console.log(`[structure-detector] Using optimized detection for large document`)
  
  // Per documenti molto grandi, campiona solo una porzione del testo
  // per rilevare pattern strutturali (assumiamo che il pattern sia consistente)
  const sampleSize = Math.min(500 * 1024, text.length) // Campiona primi 500KB
  const sampleText = text.substring(0, sampleSize)
  
  // Rileva pattern solo sul campione
  const articles = detectArticlePatterns(sampleText)
  const sections = format === 'markdown' 
    ? detectMarkdownSections(sampleText)
    : detectTextualSections(sampleText)
  const chapters = detectChapterPatterns(sampleText)
  
  console.log(`[structure-detector] Optimized detection found ${articles.length} articles, ${sections.length} sections, ${chapters.length} chapters (from sample)`)
  
  // Inferisce tipo documento basandosi sui pattern trovati
  const type = inferDocumentType({
    articles,
    sections,
    chapters,
  })
  
  // Calcola confidence score (leggermente ridotto per campionamento)
  const confidence = Math.min(calculateConfidence({
    articles,
    sections,
    chapters,
    type,
  }) * 0.9, 1.0) // Riduce confidence del 10% per campionamento
  
  console.log(`[structure-detector] Detected type: ${type}, confidence: ${confidence.toFixed(2)} (optimized)`)
  
  return {
    type,
    patterns: {
      articles: articles.length > 0 ? articles : undefined,
      sections: sections.length > 0 ? sections : undefined,
      chapters: chapters.length > 0 ? chapters : undefined,
    },
    confidence,
  }
}

