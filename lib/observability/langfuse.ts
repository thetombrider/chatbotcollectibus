/**
 * Langfuse Integration
 * 
 * Observability LLM con Langfuse per:
 * - Tracing delle chiamate LLM
 * - Metriche (token, costi, latency)
 * - Dashboard per monitoring
 */

import { Langfuse } from 'langfuse'

// Singleton Langfuse client
let langfuseClient: Langfuse | null = null

/**
 * Inizializza Langfuse client
 * 
 * @returns Langfuse client instance o null se non configurato
 */
export function initLangfuse(): Langfuse | null {
  // Se già inizializzato, restituisci il client esistente
  if (langfuseClient) {
    return langfuseClient
  }

  // Verifica che le chiavi API siano presenti
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  const baseURL = process.env.LANGFUSE_BASE_URL

  if (!publicKey || !secretKey) {
    console.warn('[langfuse] LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY not set, Langfuse disabled')
    return null
  }

  try {
    langfuseClient = new Langfuse({
      publicKey,
      secretKey,
      baseUrl: baseURL || undefined, // Usa default se non specificato
    })

    console.log('[langfuse] Langfuse client initialized successfully')
    return langfuseClient
  } catch (error) {
    console.error('[langfuse] Failed to initialize Langfuse client:', error)
    return null
  }
}

/**
 * Ottiene il client Langfuse (inizializza se necessario)
 */
function getLangfuseClient(): Langfuse | null {
  if (!langfuseClient) {
    return initLangfuse()
  }
  return langfuseClient
}

/**
 * Crea un trace per una richiesta chat
 * 
 * @param conversationId - ID della conversazione
 * @param message - Messaggio utente
 * @param metadata - Metadata aggiuntiva
 * @returns Trace ID o null se Langfuse non è configurato
 */
export function createChatTrace(
  conversationId: string,
  message: string,
  metadata?: Record<string, unknown>
): string | null {
  const client = getLangfuseClient()
  if (!client) {
    return null
  }

  try {
    const trace = client.trace({
      name: 'chat-request',
      userId: conversationId,
      metadata: {
        message: message.substring(0, 200), // Limita lunghezza per metadata
        ...metadata,
      },
    })

    return trace.id
  } catch (error) {
    console.error('[langfuse] Failed to create chat trace:', error)
    return null
  }
}

/**
 * Crea uno span per una chiamata LLM
 * 
 * @param traceId - ID del trace padre
 * @param name - Nome dello span
 * @param input - Input della chiamata LLM
 * @param output - Output della chiamata LLM (opzionale)
 * @param metadata - Metadata aggiuntiva
 * @returns Span ID o null se Langfuse non è configurato
 */
export function createLLMSpan(
  traceId: string,
  name: string,
  input: unknown,
  output?: unknown,
  metadata?: Record<string, unknown>
): string | null {
  const client = getLangfuseClient()
  if (!client) {
    return null
  }

  try {
    const span = client.span({
      traceId,
      name,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      output: output ? (typeof output === 'string' ? output : JSON.stringify(output)) : undefined,
      metadata,
    })

    return span.id
  } catch (error) {
    console.error('[langfuse] Failed to create LLM span:', error)
    return null
  }
}

/**
 * Registra una chiamata LLM (generation)
 * 
 * @param traceId - ID del trace padre
 * @param model - Nome del modello LLM
 * @param input - Input della chiamata (messaggi o prompt)
 * @param output - Output della chiamata LLM
 * @param usage - Usage tokens (opzionale)
 * @param metadata - Metadata aggiuntiva
 * @returns Generation ID o null se Langfuse non è configurato
 */
export function logLLMCall(
  traceId: string,
  model: string,
  input: unknown,
  output: unknown,
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number },
  metadata?: Record<string, unknown>
): string | null {
  const client = getLangfuseClient()
  if (!client) {
    return null
  }

  try {
    // Normalizza input/output per Langfuse
    const normalizedInput = typeof input === 'string' 
      ? input 
      : Array.isArray(input) 
        ? input 
        : JSON.stringify(input)
    
    const normalizedOutput = typeof output === 'string' 
      ? output 
      : output !== null && output !== undefined
        ? JSON.stringify(output)
        : undefined

    const generation = client.generation({
      traceId,
      name: 'llm-call',
      model,
      modelParameters: {
        provider: model.includes('openrouter') ? 'openrouter' : 'openai',
      },
      input: normalizedInput,
      output: normalizedOutput,
      usage: usage ? {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      } : undefined,
      metadata,
    })

    return generation.id
  } catch (error) {
    console.error('[langfuse] Failed to log LLM call:', error)
    return null
  }
}

/**
 * Registra una chiamata di embedding
 * 
 * @param traceId - ID del trace padre (opzionale)
 * @param model - Nome del modello embedding
 * @param input - Input della chiamata (testo)
 * @param output - Output della chiamata (embedding vector)
 * @param usage - Usage tokens (opzionale)
 * @param metadata - Metadata aggiuntiva
 * @returns Generation ID o null se Langfuse non è configurato
 */
export function logEmbeddingCall(
  traceId: string | null,
  model: string,
  input: string | string[],
  output: number[] | number[][],
  usage?: { tokens: number },
  metadata?: Record<string, unknown>
): string | null {
  const client = getLangfuseClient()
  if (!client) {
    return null
  }

  try {
    // Normalizza input/output
    const normalizedInput = Array.isArray(input) ? input : [input]
    // Normalizza output: se è array di array, usa così; altrimenti wrappa in array
    const normalizedOutput: number[][] = Array.isArray(output) && Array.isArray(output[0])
      ? output as number[][]
      : [output as number[]]

    const generation = client.generation({
      traceId: traceId || undefined,
      name: 'embedding-call',
      model,
      modelParameters: {
        provider: 'openai',
      },
      input: normalizedInput,
      output: normalizedOutput,
      usage: usage ? {
        promptTokens: usage.tokens,
        totalTokens: usage.tokens,
      } : undefined,
      metadata: {
        inputCount: normalizedInput.length,
        outputDimensions: normalizedOutput[0]?.length || 1536,
        ...metadata,
      },
    })

    return generation.id
  } catch (error) {
    console.error('[langfuse] Failed to log embedding call:', error)
    return null
  }
}

/**
 * Finalizza un trace
 * 
 * @param traceId - ID del trace da finalizzare
 * @param output - Output finale (opzionale)
 * @param metadata - Metadata aggiuntiva
 */
export function finalizeTrace(
  traceId: string,
  output?: unknown,
  metadata?: Record<string, unknown>
): void {
  const client = getLangfuseClient()
  if (!client) {
    return
  }

  try {
    client.trace({
      id: traceId,
      output: output ? (typeof output === 'string' ? output : JSON.stringify(output)) : undefined,
      metadata,
    })
  } catch (error) {
    console.error('[langfuse] Failed to finalize trace:', error)
  }
}

/**
 * Crea un trace per una richiesta chat completa
 * Helper function che crea trace e span iniziale
 * 
 * @param conversationId - ID della conversazione
 * @param message - Messaggio utente
 * @param metadata - Metadata aggiuntiva
 * @returns Trace ID o null se Langfuse non è configurato
 */
export function createChatTraceWithSpan(
  conversationId: string,
  message: string,
  metadata?: Record<string, unknown>
): string | null {
  const traceId = createChatTrace(conversationId, message, metadata)
  if (!traceId) {
    return null
  }

  // Crea span iniziale per la richiesta
  createLLMSpan(traceId, 'chat-request', { message }, undefined, metadata)
  
  return traceId
}

