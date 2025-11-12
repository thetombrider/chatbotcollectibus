import OpenAI from 'openai'
import { PROMPTS, compilePrompt } from '@/lib/observability/prompt-manager'

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

const META_FOLDER_MODEL = 'google/gemini-2.5-flash'

const STOPWORDS = new Set([
  'a',
  'ad',
  'ai',
  'al',
  'all',
  'allo',
  'alla',
  'alle',
  'agli',
  'anche',
  'che',
  'chi',
  'ci',
  'con',
  'come',
  'da',
  'dal',
  'dalla',
  'dalle',
  'dai',
  'degli',
  'dei',
  'del',
  'dell',
  'della',
  'delle',
  'di',
  'e',
  'ed',
  'gli',
  'i',
  'il',
  'in',
  'la',
  'le',
  'li',
  'lo',
  'ma',
  'nel',
  'nella',
  'nelle',
  'nei',
  'non',
  'o',
  'per',
  'quali',
  'qual',
  'qualche',
  'quale',
  'quello',
  'questa',
  'queste',
  'questi',
  'sono',
  'su',
  'tra',
  'un',
  'una',
  'uno',
  'verso',
  'what',
  'which',
  'are',
  'is',
  'the',
  'of',
  'in',
  'on',
  'for',
])

export interface MetaFolderInferenceResult {
  folder: string | null
  confidence: number
  reasoning?: string
  rawFolder?: string | null
}

interface LlmResponseShape {
  folder?: string | null
  confidence?: number
  reasoning?: string
}

function extractKeywords(query: string, maxKeywords: number = 8): string[] {
  return query
    .toLowerCase()
    .split(/[^a-zàèéìòù0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .filter((token, index, array) => array.indexOf(token) === index)
    .slice(0, maxKeywords)
}

function buildFallbackPrompt(
  query: string,
  folders: string[],
  totalFolderCount: number,
  truncatedLabel: string,
  keywordsLine: string
): string {
  const folderLines = folders
    .map((name, index) => `${index + 1}. ${name}`)
    .join('\n')
  const truncatedNote = `Elenco troncato: ${truncatedLabel}`

  return `Sei un assistente che deve dedurre la cartella più pertinente in cui cercare documenti in un database aziendale.

Query utente (in italiano): "${query}"

Elenco cartelle disponibili (seleziona la più pertinente):
${folderLines || '- Nessuna cartella disponibile'}
${totalFolderCount > folders.length ? `\nSono mostrate ${folders.length} cartelle su ${totalFolderCount}.` : ''}

${keywordsLine}
${truncatedNote}

Regole fondamentali:
1. Devi scegliere esclusivamente tra le cartelle fornite. Non inventare nuovi nomi. Se nessuna cartella è adatta, imposta "folder": null.
2. Confronta le parole chiave della query con le parole presenti nelle cartelle (considera singolare/plurale, sinonimi o traduzioni evidenti). Preferisci la cartella che contiene la maggioranza delle parole chiave rilevanti.
3. Evita di selezionare cartelle con sovrapposizione minima o semantica diversa rispetto alla query.
4. La motivazione deve spiegare in 1-2 frasi perché la cartella scelta è pertinente (o perché nessuna lo è).

Output:
- Rispondi esclusivamente con un oggetto JSON contenente "folder", "confidence" (0-1) e "reasoning".
- Il campo "folder" deve riportare il nome esatto della cartella scelta (mai inventato).

Esempio di risposta valida:
{"folder": "Codice di condotta fornitori", "confidence": 0.88, "reasoning": "La query menziona codici di condotta fornitori, corrispondenti a questa cartella"}

Rispondi ora con il JSON richiesto.`
}

function sanitizeFolders(folders: readonly string[]): string[] {
  const seen = new Set<string>()
  const sanitized: string[] = []

  folders.forEach((folder) => {
    const trimmed = folder.trim()
    if (trimmed.length === 0) {
      return
    }

    if (seen.has(trimmed.toLowerCase())) {
      return
    }

    seen.add(trimmed.toLowerCase())
    sanitized.push(trimmed)
  })

  return sanitized
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export async function inferMetaQueryFolder(
  query: string,
  availableFolders: string[],
  maxFolders: number = 80
): Promise<MetaFolderInferenceResult> {
  try {
    if (!query || query.trim().length === 0) {
      return {
        folder: null,
        confidence: 0,
        reasoning: 'Query vuota',
        rawFolder: null,
      }
    }

    const sanitizedFolders = sanitizeFolders(availableFolders)
    if (sanitizedFolders.length === 0) {
      return {
        folder: null,
        confidence: 0,
        reasoning: 'Nessuna cartella disponibile',
        rawFolder: null,
      }
    }

    const limitedFolders =
      sanitizedFolders.length > maxFolders
        ? sanitizedFolders.slice(0, maxFolders)
        : sanitizedFolders

    const keywords = extractKeywords(query)
    const keywordList =
      keywords.length > 0
        ? keywords.join(', ')
        : '(nessuna parola chiave rilevante individuata)'
    const truncatedLabel =
      sanitizedFolders.length > limitedFolders.length
        ? 'SÌ – sono presenti altre cartelle non elencate qui.'
        : 'NO – l’elenco include tutte le cartelle disponibili.'

    const prompt = await compilePrompt(
      PROMPTS.META_FOLDER_INFERENCE,
      {
        query,
        folders: limitedFolders.join('\n'),
        folders_count: sanitizedFolders.length,
        query_keywords: keywordList,
        max_folders: maxFolders,
        truncated_label: truncatedLabel,
      },
      {
        fallback: buildFallbackPrompt(
          query,
          limitedFolders,
          sanitizedFolders.length,
          truncatedLabel,
          `Parole chiave estratte dalla query: ${keywordList}`
        ),
      }
    )

    const folderListBlock = limitedFolders.map((name, index) => `- ${index + 1}. ${name}`).join('\n') || '- Nessuna cartella disponibile'
    const structuredSection = [
      '',
      '=== DATI STRUTTURATI ===',
      `Query originale: ${query}`,
      `Parole chiave: ${keywordList}`,
      `Elenco troncato: ${truncatedLabel}`,
      `Cartelle disponibili (${limitedFolders.length}/${sanitizedFolders.length}):`,
      folderListBlock,
      '',
      '=== ISTRUZIONI FINALI ===',
      'Analizza la query e seleziona UNA cartella dall\'elenco sopra che sia semanticamente coerente con le parole chiave.',
      'Se nessuna cartella è adatta, imposta "folder": null.',
      'Rispondi SOLO con JSON avente esattamente i campi: folder (string|null), confidence (numero tra 0 e 1), reasoning (string).',
    ].join('\n')

    const finalPrompt = `${prompt.trim()}\n${structuredSection}`

    const response = await openrouter.chat.completions.create({
      model: META_FOLDER_MODEL,
      messages: [
        {
          role: 'user',
          content: finalPrompt,
        },
      ],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content?.trim()

    if (!content) {
      console.warn('[meta-folder-inference] Empty LLM response')
      return {
        folder: null,
        confidence: 0,
        reasoning: 'Risposta vuota dal modello',
        rawFolder: null,
      }
    }

    let parsed: LlmResponseShape

    try {
      parsed = JSON.parse(content)
    } catch (parseError) {
      const firstBrace = content.indexOf('{')
      const lastBrace = content.lastIndexOf('}')

      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        console.error('[meta-folder-inference] Unable to locate JSON braces in response')
        console.error('[meta-folder-inference] Raw response:', content)
        return {
          folder: null,
          confidence: 0,
          reasoning: 'Formato risposta non valido',
          rawFolder: null,
        }
      }

      const jsonCandidate = content.slice(firstBrace, lastBrace + 1)

      try {
        parsed = JSON.parse(jsonCandidate)
      } catch (extractionError) {
        console.error('[meta-folder-inference] Failed to parse extracted JSON:', extractionError)
        console.error('[meta-folder-inference] Raw response:', content)
        console.error('[meta-folder-inference] Extracted JSON:', jsonCandidate)
        return {
          folder: null,
          confidence: 0,
          reasoning: 'Impossibile interpretare la risposta del modello',
          rawFolder: null,
        }
      }
    }

    const rawFolder =
      typeof parsed.folder === 'string' && parsed.folder.trim().length > 0
        ? parsed.folder.trim()
        : null

    const normalizedMap = new Map<string, string>()
    sanitizedFolders.forEach((name) => {
      normalizedMap.set(normalizeName(name), name)
    })

    let resolvedFolder: string | null = null

    if (rawFolder) {
      const normalized = normalizeName(rawFolder)

      if (normalizedMap.has(normalized)) {
        resolvedFolder = normalizedMap.get(normalized) ?? null
      } else {
        // Try contains fallback (LLM might return partial)
        const candidate = sanitizedFolders.find(
          (name) => normalizeName(name) === normalized || normalizeName(name).includes(normalized) || normalized.includes(normalizeName(name))
        )
        if (candidate) {
          resolvedFolder = candidate
        } else {
          console.warn('[meta-folder-inference] LLM returned folder not present in list:', rawFolder)
        }
      }
    }

    const confidence =
      parsed.confidence !== undefined &&
      typeof parsed.confidence === 'number' &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
        ? parsed.confidence
        : rawFolder
        ? 0.5
        : 0

    return {
      folder: resolvedFolder,
      confidence,
      reasoning: parsed.reasoning,
      rawFolder,
    }
  } catch (error) {
    console.error('[meta-folder-inference] Inference failed:', error)
    return {
      folder: null,
      confidence: 0,
      reasoning: 'Errore interno durante la deduzione della cartella',
      rawFolder: null,
    }
  }
}


