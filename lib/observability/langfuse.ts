/**
 * Langfuse Integration
 * 
 * Observability LLM con Langfuse per:
 * - Tracing delle chiamate LLM
 * - Metriche (token, costi, latency)
 * - Dashboard per monitoring
 * 
 * BEST PRACTICES (da documentazione ufficiale):
 * - Usare propagateAttributes() per userId, sessionId, metadata, version, tags
 * - Tutti gli span devono essere collegati al trace padre
 * - Tracciare input e output per ogni operazione
 * - Usare generation objects per LLM calls ed embeddings
 */

import { Langfuse } from 'langfuse'
import type { 
  LangfuseSpanClient,
  LangfuseGenerationClient,
  LangfuseTraceClient 
} from 'langfuse'

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
export function getLangfuseClient(): Langfuse | null {
  if (!langfuseClient) {
    return initLangfuse()
  }
  return langfuseClient
}

/**
 * Flush dei dati pending (importante in ambienti serverless)
 */
export async function flushLangfuse(): Promise<void> {
  const client = getLangfuseClient()
  if (client) {
    try {
      await client.flushAsync()
    } catch (error) {
      console.error('[langfuse] Failed to flush:', error)
    }
  }
}

/**
 * Interfaccia per il contesto del trace
 */
export interface TraceContext {
  traceId: string
  trace: LangfuseTraceClient
  userId: string | null
  sessionId: string
}

/**
 * Crea un trace per una richiesta chat con propagazione automatica degli attributi
 * 
 * IMPORTANTE: Questa funzione restituisce un TraceContext che include il trace object.
 * Usa il trace object per creare span figli con trace.span() o generation con trace.generation()
 * 
 * @param chatId - ID della conversazione (usato come sessionId)
 * @param userId - ID dell'utente (opzionale)
 * @param message - Messaggio utente (input del trace)
 * @param metadata - Metadata aggiuntiva
 * @returns TraceContext o null se Langfuse non è configurato
 */
export function createChatTrace(
  chatId: string,
  userId: string | null,
  message: string,
  metadata?: Record<string, unknown>
): TraceContext | null {
  const client = getLangfuseClient()
  if (!client) {
    return null
  }

  try {
    // Crea il trace con attributi base
    const trace = client.trace({
      name: 'chat-request',
      userId: userId || undefined,
      sessionId: chatId, // sessionId = chatId per aggregazioni
      input: { message }, // Input del trace
      metadata: {
        ...metadata,
        messageLength: message.length,
      },
      tags: metadata?.tags as string[] || [],
    })

    console.log(`[langfuse] Trace created: ${trace.id} (user: ${userId || 'anonymous'}, session: ${chatId})`)

    return {
      traceId: trace.id,
      trace,
      userId,
      sessionId: chatId,
    }
  } catch (error) {
    console.error('[langfuse] Failed to create chat trace:', error)
    return null
  }
}

/**
 * Crea uno span figlio collegato al trace
 * 
 * IMPORTANTE: Usa il trace object dal TraceContext per creare span figli
 * Questo garantisce che lo span sia correttamente collegato al trace padre
 * 
 * @param trace - Trace object dal TraceContext
 * @param name - Nome dello span
 * @param input - Input dello span
 * @param metadata - Metadata aggiuntiva
 * @returns Span object o null se fallisce
 */
export function createSpan(
  trace: LangfuseTraceClient | LangfuseSpanClient,
  name: string,
  input?: unknown,
  metadata?: Record<string, unknown>
): LangfuseSpanClient | null {
  try {
    const span = trace.span({
      name,
      input,
      metadata,
    })

    return span
  } catch (error) {
    console.error('[langfuse] Failed to create span:', error)
    return null
  }
}

/**
 * Aggiorna uno span con output e metadata
 * 
 * @param span - Span object da aggiornare
 * @param output - Output dello span
 * @param metadata - Metadata aggiuntiva
 */
export function updateSpan(
  span: LangfuseSpanClient | null,
  output?: unknown,
  metadata?: Record<string, unknown>
): void {
  if (!span) {
    return
  }

  try {
    span.update({
      output,
      metadata,
    })
  } catch (error) {
    console.error('[langfuse] Failed to update span:', error)
  }
}

/**
 * Finalizza uno span (segna come completato)
 * 
 * @param span - Span object da finalizzare
 * @param output - Output finale (opzionale)
 * @param metadata - Metadata aggiuntiva (opzionale)
 */
export function endSpan(
  span: LangfuseSpanClient | null,
  output?: unknown,
  metadata?: Record<string, unknown>
): void {
  if (!span) {
    return
  }

  try {
    if (output !== undefined || metadata !== undefined) {
      span.update({
        output,
        metadata,
      })
    }
    span.end()
  } catch (error) {
    console.error('[langfuse] Failed to end span:', error)
  }
}

/**
 * Crea una generation per una chiamata LLM
 * 
 * IMPORTANTE: Usa il trace o span object per creare generation figlie
 * Questo garantisce che la generation sia correttamente collegata al trace/span padre
 * 
 * @param parent - Trace o Span object padre
 * @param name - Nome della generation
 * @param model - Nome del modello LLM
 * @param input - Input della chiamata (messaggi o prompt)
 * @param metadata - Metadata aggiuntiva
 * @returns Generation object o null se fallisce
 */
export function createGeneration(
  parent: LangfuseTraceClient | LangfuseSpanClient,
  name: string,
  model: string,
  input: unknown,
  metadata?: Record<string, unknown>
): LangfuseGenerationClient | null {
  try {
    const generation = parent.generation({
      name,
      model,
      input,
      modelParameters: {
        provider: model.includes('openrouter') ? 'openrouter' : 'openai',
      },
      metadata,
    })

    return generation
  } catch (error) {
    console.error('[langfuse] Failed to create generation:', error)
    return null
  }
}

/**
 * Aggiorna una generation con output e usage
 * 
 * @param generation - Generation object da aggiornare
 * @param output - Output della generation
 * @param usage - Usage tokens (opzionale)
 * @param metadata - Metadata aggiuntiva
 */
export function updateGeneration(
  generation: LangfuseGenerationClient | null,
  output?: unknown,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  metadata?: Record<string, unknown>
): void {
  if (!generation) {
    return
  }

  try {
    generation.update({
      output,
      usage,
      metadata,
    })
  } catch (error) {
    console.error('[langfuse] Failed to update generation:', error)
  }
}

/**
 * Finalizza una generation (segna come completata)
 * 
 * @param generation - Generation object da finalizzare
 * @param output - Output finale (opzionale)
 * @param usage - Usage tokens (opzionale)
 * @param metadata - Metadata aggiuntiva (opzionale)
 */
export function endGeneration(
  generation: LangfuseGenerationClient | null,
  output?: unknown,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  metadata?: Record<string, unknown>
): void {
  if (!generation) {
    return
  }

  try {
    if (output !== undefined || usage !== undefined || metadata !== undefined) {
      generation.update({
        output,
        usage,
        metadata,
      })
    }
    generation.end()
  } catch (error) {
    console.error('[langfuse] Failed to end generation:', error)
  }
}

/**
 * Crea una generation per una chiamata di embedding
 * 
 * IMPORTANTE: Gli embeddings sono trattati come generation objects
 * Questo permette di tracciare costi e usage tokens
 * 
 * @param parent - Trace o Span object padre
 * @param model - Nome del modello embedding
 * @param input - Input della chiamata (testo)
 * @param metadata - Metadata aggiuntiva
 * @returns Generation object o null se fallisce
 */
export function createEmbeddingGeneration(
  parent: LangfuseTraceClient | LangfuseSpanClient,
  model: string,
  input: string | string[],
  metadata?: Record<string, unknown>
): LangfuseGenerationClient | null {
  try {
    // Normalizza input
    const normalizedInput = Array.isArray(input) ? input : [input]

    const generation = parent.generation({
      name: 'embedding',
      model,
      input: normalizedInput,
      modelParameters: {
        provider: 'openai',
      },
      metadata: {
        inputCount: normalizedInput.length,
        ...metadata,
      },
    })

    return generation
  } catch (error) {
    console.error('[langfuse] Failed to create embedding generation:', error)
    return null
  }
}

/**
 * Aggiorna una generation di embedding con output e usage
 * 
 * NOTA: L'output degli embeddings è troppo grande per essere inviato integralmente.
 * Inviamo solo metadata (dimensioni, count, sample) invece del vettore completo.
 * 
 * @param generation - Generation object da aggiornare
 * @param output - Output della chiamata (embedding vector)
 * @param usage - Usage tokens (opzionale)
 */
export function updateEmbeddingGeneration(
  generation: LangfuseGenerationClient | null,
  output: number[] | number[][],
  usage?: { tokens?: number; promptTokens?: number; totalTokens?: number }
): void {
  if (!generation) {
    return
  }

  try {
    // Normalizza output
    const normalizedOutput: number[][] = Array.isArray(output) && Array.isArray(output[0])
      ? output as number[][]
      : [output as number[]]

    // Per output, invia solo metadata invece dell'array completo (troppo grande per Langfuse)
    const outputMetadata = {
      type: 'embedding',
      count: normalizedOutput.length,
      dimensions: normalizedOutput[0]?.length || 1536,
      // Includi solo il primo embedding come esempio (primi 10 valori)
      sample: normalizedOutput[0]?.slice(0, 10),
    }

    generation.update({
      output: outputMetadata,
      usage: usage ? {
        promptTokens: usage.promptTokens || usage.tokens || 0,
        totalTokens: usage.totalTokens || usage.tokens || 0,
      } : undefined,
    })
  } catch (error) {
    console.error('[langfuse] Failed to update embedding generation:', error)
  }
}

/**
 * Aggiorna un trace con output e metadata
 * 
 * @param trace - Trace object da aggiornare
 * @param output - Output finale
 * @param metadata - Metadata aggiuntiva
 */
export function updateTrace(
  trace: LangfuseTraceClient | null,
  output?: unknown,
  metadata?: Record<string, unknown>
): void {
  if (!trace) {
    return
  }

  try {
    trace.update({
      output,
      metadata,
    })
  } catch (error) {
    console.error('[langfuse] Failed to update trace:', error)
  }
}

// Note: Le vecchie funzioni basate su traceId stringa sono state rimosse
// Usa invece le nuove funzioni che accettano trace/span objects:
// - createSpan() per creare span figli
// - createGeneration() per chiamate LLM
// - createEmbeddingGeneration() per embeddings
// - updateSpan(), endSpan() per gestire il ciclo di vita degli span
// - updateGeneration(), endGeneration() per gestire le generation
// - updateTrace() per aggiornare il trace

