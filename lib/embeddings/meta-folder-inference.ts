import OpenAI from 'openai'
import { PROMPTS, compilePrompt } from '@/lib/observability/prompt-manager'

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

const META_FOLDER_MODEL = 'google/gemini-2.5-flash'

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

function buildFallbackPrompt(
  query: string,
  folders: string[],
  totalFolderCount: number
): string {
  const folderLines = folders
    .map((name, index) => `${index + 1}. ${name}`)
    .join('\n')
  const truncatedNote =
    totalFolderCount > folders.length
      ? `\nATTENZIONE: Sono mostrate solo ${folders.length} cartelle su ${totalFolderCount}. Se nessuna cartella è pertinente, restituisci null.`
      : ''

  return `Sei un assistente che deve dedurre la cartella più pertinente in cui cercare documenti in un database aziendale.

Query utente (in italiano): "${query}"

Elenco cartelle disponibili (seleziona la più pertinente):
${folderLines || '- Nessuna cartella disponibile'}
${truncatedNote}

Istruzioni:
- Rispondi esclusivamente con JSON.
- Se una cartella è rilevante per la query, imposta "folder" con il nome ESATTO (rispettando maiuscole/minuscole come fornito).
- Se nessuna cartella è adatta, usa "folder": null.
- Includi "confidence" (0-1) e una breve "reasoning".

Esempio di risposta valida:
{"folder": "Codice di Condotta Fornitori", "confidence": 0.88, "reasoning": "La query menziona 'codici di condotta fornitori' che corrispondono a questa cartella"}

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

    const prompt = await compilePrompt(
      PROMPTS.META_FOLDER_INFERENCE,
      {
        query,
        folders: limitedFolders.join('\n'),
        folders_count: sanitizedFolders.length,
        max_folders: maxFolders,
        truncated: sanitizedFolders.length > limitedFolders.length,
      },
      {
        fallback: buildFallbackPrompt(query, limitedFolders, sanitizedFolders.length),
      }
    )

    const response = await openrouter.chat.completions.create({
      model: META_FOLDER_MODEL,
      messages: [
        {
          role: 'user',
          content: prompt,
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


