/**
 * Langfuse Prompt Manager
 * 
 * Manages prompt retrieval from Langfuse with caching and fallback support.
 * Replaces hard-coded prompts with versioned, managed prompts.
 */

import { getLangfuseClient } from './langfuse-client'
import type { TextPromptClient, ChatPromptClient } from '@langfuse/client'

// Type for prompt (can be either text or chat)
type PromptClientType = TextPromptClient | ChatPromptClient

/**
 * Prompt names registry (centralized)
 */
export const PROMPTS = {
  // System prompts for RAG
  SYSTEM_RAG_WITH_CONTEXT: 'system-rag-with-context',
  SYSTEM_RAG_COMPARATIVE: 'system-rag-comparative',
  SYSTEM_RAG_NO_CONTEXT_WEB: 'system-rag-no-context-web',
  SYSTEM_RAG_NO_CONTEXT: 'system-rag-no-context',
  SYSTEM_META_QUERY: 'system-meta-query',
  
  // Query analysis
  QUERY_ANALYSIS: 'query-analysis',
  
  // Query expansion
  QUERY_EXPANSION: 'query-expansion',

  // Meta folder inference
  META_FOLDER_INFERENCE: 'meta-folder-inference',
} as const

/**
 * Prompt cache (in-memory, per-process)
 * Maps: promptName -> { prompt, fetchedAt }
 */
const promptCache = new Map<string, { prompt: PromptClientType; fetchedAt: number }>()

// Cache TTL: 5 minutes (configurable)
// Set PROMPT_CACHE_DISABLED=true to disable caching entirely (useful for development)
const CACHE_DISABLED = process.env.PROMPT_CACHE_DISABLED === 'true'
const CACHE_TTL_MS = parseInt(process.env.PROMPT_CACHE_TTL_MS || '300000', 10)

/**
 * Prompt manager options
 */
export interface PromptOptions {
  /** Label to fetch (default: 'production') */
  label?: string
  /** Version to fetch (overrides label) */
  version?: number
  /** Fallback prompt text if fetch fails */
  fallback?: string
  /** Fallback configuration when Langfuse prompt/config is unavailable */
  fallbackConfig?: Record<string, unknown>
  /** Skip cache (force fetch from Langfuse) */
  skipCache?: boolean
}

/**
 * Result of compiling a prompt with its metadata configuration.
 */
export interface CompiledPromptResult<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  text: string
  config: TConfig | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Fetches a prompt from Langfuse with caching
 * 
 * @param promptName - Name of the prompt in Langfuse
 * @param options - Fetch options
 * @returns Langfuse prompt client or null if not found
 * 
 * @example
 * const prompt = await getPrompt(PROMPTS.SYSTEM_RAG_WITH_CONTEXT)
 * const compiled = prompt.compile({ context: '...', documentCount: 5 })
 */
export async function getPrompt(
  promptName: string,
  options: PromptOptions = {}
): Promise<PromptClientType | null> {
  const { label = 'production', version, skipCache = false } = options

  try {
    // Check cache first (unless skipCache is true or cache is disabled)
    if (!skipCache && !CACHE_DISABLED) {
      const cached = promptCache.get(promptName)
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        console.log(`[prompt-manager] Cache hit for prompt: ${promptName}`)
        return cached.prompt
      }
    }
    
    if (CACHE_DISABLED) {
      console.log(`[prompt-manager] Cache disabled, fetching from Langfuse: ${promptName}`)
    }

    // Fetch from Langfuse
    console.log(`[prompt-manager] Fetching prompt from Langfuse: ${promptName}`, {
      label,
      version,
    })

    const langfuse = getLangfuseClient()
    
    // Build fetch options dynamically
    let prompt: PromptClientType
    if (version !== undefined) {
      prompt = await langfuse.prompt.get(promptName, { version })
    } else {
      prompt = await langfuse.prompt.get(promptName, { label })
    }

    if (!prompt) {
      console.warn(`[prompt-manager] Prompt not found: ${promptName}`)
      return null
    }

    // Update cache (unless cache is disabled)
    if (!CACHE_DISABLED) {
      promptCache.set(promptName, {
        prompt,
        fetchedAt: Date.now(),
      })
    }

    console.log(`[prompt-manager] Prompt fetched successfully: ${promptName}`, {
      version: prompt.version,
      config: prompt.config,
    })

    return prompt
  } catch (error) {
    console.error(`[prompt-manager] Error fetching prompt: ${promptName}`, error)
    return null
  }
}

/**
 * Compiles a prompt with variables, with fallback support
 * 
 * @param promptName - Name of the prompt in Langfuse
 * @param variables - Variables to compile into the prompt
 * @param options - Fetch options with optional fallback
 * @returns Compiled prompt text
 * 
 * @example
 * const systemPrompt = await compilePrompt(
 *   PROMPTS.SYSTEM_RAG_WITH_CONTEXT,
 *   { context: '...', documentCount: 5 },
 *   { fallback: 'Default system prompt...' }
 * )
 */
export async function compilePrompt(
  promptName: string,
  variables: Record<string, string | number | boolean>,
  options: PromptOptions = {}
): Promise<string> {
  const result = await compilePromptWithConfig(promptName, variables, options)
  return result.text
}

/**
 * Compiles a prompt and returns both the rendered text and the Langfuse configuration.
 *
 * @param promptName - Name of the prompt in Langfuse
 * @param variables - Variables to compile into the prompt
 * @param options - Fetch options with optional fallback and fallback config
 * @returns Compiled prompt text with configuration metadata
 *
 * @example
 * const { text, config } = await compilePromptWithConfig(
 *   PROMPTS.SYSTEM_RAG_WITH_CONTEXT,
 *   { context: '...', documentCount: 5 },
 *   { fallback: 'Default system prompt...', fallbackConfig: { model: 'openrouter/google/gemini-2.5-flash' } }
 * )
 */
export async function compilePromptWithConfig(
  promptName: string,
  variables: Record<string, string | number | boolean>,
  options: PromptOptions = {}
): Promise<CompiledPromptResult> {
  const { fallback } = options

  try {
    const prompt = await getPrompt(promptName, options)

    if (!prompt) {
      if (fallback) {
        console.warn(`[prompt-manager] Using fallback for prompt: ${promptName}`)
        return {
          text: fallback,
          config: options.fallbackConfig ? { ...options.fallbackConfig } : null,
        }
      }
      throw new Error(`Prompt not found and no fallback provided: ${promptName}`)
    }

    // Compile prompt with variables (convert to Record<string, string>)
    const stringVariables = Object.entries(variables).reduce((acc, [key, value]) => {
      acc[key] = String(value)
      return acc
    }, {} as Record<string, string>)

    const compiled = prompt.compile(stringVariables)
    const config = isRecord((prompt as { config?: unknown }).config)
      ? (prompt as { config: Record<string, unknown> }).config
      : null

    // Handle both text and chat prompts
    if (typeof compiled === 'string') {
      return {
        text: compiled,
        config,
      }
    } else if (Array.isArray(compiled)) {
      // Chat prompt - convert to text (or return as-is depending on usage)
      // For now, we'll just join the messages
      return {
        text: compiled.map((msg: { content: string }) => msg.content).join('\n'),
        config,
      }
    }

    return {
      text: String(compiled),
      config,
    }
  } catch (error) {
    console.error(`[prompt-manager] Error compiling prompt: ${promptName}`, error)

    if (fallback) {
      console.warn(`[prompt-manager] Using fallback for prompt: ${promptName}`)
      return {
        text: fallback,
        config: options.fallbackConfig ? { ...options.fallbackConfig } : null,
      }
    }

    throw error
  }
}

/**
 * Clears the prompt cache
 * 
 * Call this when you want to force-refresh prompts from Langfuse
 */
export function clearPromptCache(): void {
  promptCache.clear()
  console.log('[prompt-manager] Prompt cache cleared')
}

/**
 * Gets cache statistics
 * 
 * @returns Cache stats
 */
export function getCacheStats(): {
  size: number
  entries: Array<{ name: string; age: number }>
} {
  const now = Date.now()
  const entries = Array.from(promptCache.entries()).map(([name, data]) => ({
    name,
    age: now - data.fetchedAt,
  }))

  return {
    size: promptCache.size,
    entries,
  }
}

