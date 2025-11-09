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
      input: { message }, // Aggiungi input al trace
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
    // Per gli embeddings, non inviare l'array completo (troppo grande)
    // Invia solo metadata sull'output invece dell'array completo
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
      input: normalizedInput, // Input testo è OK
      // Per output, invia solo metadata invece dell'array completo (troppo grande per Langfuse)
      output: {
        type: 'embedding',
        count: normalizedOutput.length,
        dimensions: normalizedOutput[0]?.length || 1536,
        // Includi solo il primo embedding come esempio (opzionale)
        sample: normalizedOutput[0]?.slice(0, 10), // Primi 10 valori come esempio
      },
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
 * Crea uno span per uno step del processo
 * 
 * @param traceId - ID del trace padre
 * @param name - Nome dello span
 * @param input - Input dello step (opzionale)
 * @param output - Output dello step (opzionale)
 * @param metadata - Metadata aggiuntiva
 * @returns Span ID o null se Langfuse non è configurato
 */
export function createStepSpan(
  traceId: string | null,
  name: string,
  input?: unknown,
  output?: unknown,
  metadata?: Record<string, unknown>
): string | null {
  if (!traceId) {
    return null
  }

  const client = getLangfuseClient()
  if (!client) {
    return null
  }

  try {
    // Assicurati che ci sia almeno input o output per evitare spans vuoti
    const hasInput = input !== null && input !== undefined
    const hasOutput = output !== null && output !== undefined
    
    if (!hasInput && !hasOutput && (!metadata || Object.keys(metadata).length === 0)) {
      // Non creare span se non c'è nessun dato
      console.warn(`[langfuse] Skipping empty span creation: ${name}`)
      return null
    }

    const span = client.span({
      traceId,
      name,
      input: hasInput ? (typeof input === 'string' ? input : JSON.stringify(input)) : undefined,
      output: hasOutput ? (typeof output === 'string' ? output : JSON.stringify(output)) : undefined,
      metadata: metadata || {},
    })

    return span.id
  } catch (error) {
    console.error('[langfuse] Failed to create step span:', error)
    return null
  }
}

/**
 * Finalizza uno span
 * 
 * @param spanId - ID dello span da finalizzare
 * @param output - Output finale (opzionale)
 * @param metadata - Metadata aggiuntiva
 */
export function finalizeSpan(
  spanId: string | null,
  output?: unknown,
  metadata?: Record<string, unknown>
): void {
  if (!spanId) {
    return
  }

  const client = getLangfuseClient()
  if (!client) {
    return
  }

  try {
    // Assicurati che ci sia almeno output o metadata per evitare aggiornamenti vuoti
    const hasOutput = output !== null && output !== undefined
    const hasMetadata = metadata && Object.keys(metadata).length > 0
    
    if (!hasOutput && !hasMetadata) {
      // Non aggiornare span se non c'è nessun dato
      return
    }

    client.span({
      id: spanId,
      output: hasOutput ? (typeof output === 'string' ? output : JSON.stringify(output)) : undefined,
      metadata: metadata || {},
    })
  } catch (error) {
    console.error('[langfuse] Failed to finalize span:', error)
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

