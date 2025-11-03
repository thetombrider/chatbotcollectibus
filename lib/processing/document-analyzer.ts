/**
 * Document analyzer for determining optimal processing strategy
 * Decides whether to use Mistral OCR or native text extraction
 */

import { extractText } from './document-processor'

export interface ProcessingStrategy {
  useOCR: boolean
  reason: string
  textDensity?: number
  hasComplexLayout?: boolean
}

/**
 * Analizza il documento e determina la strategia di processing ottimale
 * 
 * @param file - File da analizzare
 * @returns ProcessingStrategy con decisione e reasoning
 */
export async function analyzeDocument(
  file: File
): Promise<ProcessingStrategy> {
  const fileType = file.type

  console.log(`[document-analyzer] Analyzing ${file.name} (type: ${fileType})`)

  // 1. DOCX e TXT: sempre native extraction (no OCR necessario)
  if (
    fileType === 'text/plain' ||
    fileType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return {
      useOCR: false,
      reason: 'Text-based document (DOCX/TXT) - native extraction sufficient',
    }
  }

  // 2. PDF: Analisi approfondita per determinare se serve OCR
  if (fileType === 'application/pdf') {
    try {
      // Prova estrazione nativa
      const nativeText = await extractText(file)

      // Calcola "text density" per rilevare PDF scansionati
      const textDensity = calculateTextDensity(nativeText, file.size)

      console.log(
        `[document-analyzer] PDF text density: ${textDensity.toFixed(4)}`
      )

      // Soglia: < 0.05 caratteri per KB indica PDF scansionato o immagine
      if (textDensity < 0.05) {
        console.log('[document-analyzer] Low text density detected → OCR needed')
        return {
          useOCR: true,
          reason: 'Scanned PDF detected (very low text density)',
          textDensity,
        }
      }

      // Controlla layout complesso (tabelle, multi-colonna)
      const complexLayout = hasComplexLayout(nativeText)

      if (complexLayout) {
        console.log('[document-analyzer] Complex layout detected → OCR recommended')
        return {
          useOCR: true,
          reason: 'Complex layout detected (tables/multi-column)',
          textDensity,
          hasComplexLayout: true,
        }
      }

      // PDF testuale normale: native extraction ok
      console.log('[document-analyzer] Standard PDF → native extraction')
      return {
        useOCR: false,
        reason: 'Standard PDF with extractable text',
        textDensity,
        hasComplexLayout: false,
      }
    } catch (error) {
      // Se native extraction fallisce completamente, usa OCR
      console.warn(
        '[document-analyzer] Native extraction failed:',
        error instanceof Error ? error.message : 'Unknown error'
      )
      return {
        useOCR: true,
        reason: 'Native extraction failed - fallback to OCR',
      }
    }
  }

  // 3. Altri formati: fallback a native
  return {
    useOCR: false,
    reason: 'Unsupported file type - attempting native extraction',
  }
}

/**
 * Calcola "text density" - rapporto tra caratteri estratti e dimensione file
 * 
 * @param text - Testo estratto
 * @param fileSize - Dimensione file in bytes
 * @returns Density ratio (caratteri per KB)
 */
function calculateTextDensity(text: string, fileSize: number): number {
  const charCount = text.trim().length
  const fileSizeKB = fileSize / 1024

  // Evita divisione per zero
  if (fileSizeKB === 0) return 0

  return charCount / fileSizeKB
}

/**
 * Rileva layout complessi che beneficerebbero da OCR
 * Cerca indicatori di tabelle, multi-colonna, box, etc.
 * 
 * @param text - Testo estratto
 * @returns true se layout complesso rilevato
 */
function hasComplexLayout(text: string): boolean {
  const lines = text.split('\n')

  // Indicatore 1: Molti tab consecutivi (tabelle mal estratte)
  const manyTabs = /\t{3,}/g.test(text)

  // Indicatore 2: Molte righe molto corte (multi-colonna mal estratto)
  const shortLinesCount = lines.filter((l) => {
    const trimmed = l.trim()
    return trimmed.length > 0 && trimmed.length < 10
  }).length
  const shortLinesRatio = shortLinesCount / Math.max(lines.length, 1)
  const hasShortLines = shortLinesRatio > 0.3

  // Indicatore 3: Box drawing characters (tabelle/frame)
  const hasBoxChars = /[│┤├┬┴┼┌┐└┘─]/g.test(text)

  // Indicatore 4: Molti spazi consecutivi (allineamento colonne)
  const spaceCount = (text.match(/\s{5,}/g) || []).length
  const hasFrequentSpaces = spaceCount > lines.length * 0.2

  // Indicatore 5: Pattern tabulari (numero<spazi>numero)
  const tabularPattern = /\d+\s{3,}\d+/g
  const hasTabularData = (text.match(tabularPattern) || []).length > 5

  const indicators = [
    manyTabs,
    hasShortLines,
    hasBoxChars,
    hasFrequentSpaces,
    hasTabularData,
  ]

  const indicatorCount = indicators.filter(Boolean).length

  // Se almeno 2 indicatori presenti, consideriamo layout complesso
  const isComplex = indicatorCount >= 2

  if (isComplex) {
    console.log(
      `[document-analyzer] Complex layout indicators: tabs=${manyTabs}, ` +
        `shortLines=${hasShortLines}, boxChars=${hasBoxChars}, ` +
        `spaces=${hasFrequentSpaces}, tabular=${hasTabularData}`
    )
  }

  return isComplex
}

