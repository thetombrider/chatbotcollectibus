/**
 * Stream Handler
 * 
 * Gestisce la creazione e gestione dello stream SSE per le risposte del chatbot
 */

export interface StreamMessage {
  type: 'status' | 'text' | 'text_complete' | 'done' | 'error'
  message?: string | null
  content?: string
  sources?: unknown[]
  error?: string
}

/**
 * Controller per gestire lo stream SSE
 */
export class StreamController {
  private controller: ReadableStreamDefaultController<Uint8Array>
  private isClosed: boolean = false

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller
  }

  /**
   * Invia un messaggio nello stream
   */
  enqueue(message: StreamMessage): void {
    if (this.isClosed) {
      return
    }
    try {
      const data = `data: ${JSON.stringify(message)}\n\n`
      this.controller.enqueue(new TextEncoder().encode(data))
    } catch (error) {
      // Controller potrebbe essere chiuso
      if (error instanceof Error && error.message.includes('closed')) {
        this.isClosed = true
        return
      }
      
      // Errore di serializzazione JSON (contenuto troppo grande o caratteri invalidi)
      if (error instanceof Error && error.message.includes('JSON')) {
        console.error('[stream-handler] JSON serialization error:', {
          error: error.message,
          messageType: message.type,
          contentLength: typeof message.content === 'string' ? message.content.length : 'N/A'
        })
        
        // Se è un errore di contenuto troppo grande, prova a inviare un messaggio di errore più piccolo
        if (message.type === 'text_complete' || message.type === 'text') {
          try {
            const errorMessage: StreamMessage = {
              type: 'error',
              error: 'Response too large to transmit. Please try a different query.'
            }
            const errorData = `data: ${JSON.stringify(errorMessage)}\n\n`
            this.controller.enqueue(new TextEncoder().encode(errorData))
          } catch {
            // Se anche questo fallisce, chiudi il controller
            this.close()
          }
        }
        return
      }
      
      // Altri errori generici
      console.error('[stream-handler] Enqueue error:', error)
    }
  }

  /**
   * Invia un messaggio di status
   */
  sendStatus(message: string): void {
    this.enqueue({ type: 'status', message })
  }

  /**
   * Invia un chunk di testo
   */
  sendText(content: string): void {
    this.enqueue({ type: 'text', content })
  }

  /**
   * Invia il testo completo (per sostituire lo stream)
   * Chunka automaticamente contenuti molto grandi per evitare problemi di serializzazione JSON
   */
  sendTextComplete(content: string): void {
    // Se il contenuto è troppo grande (> 4KB), lo chunka per evitare problemi JSON
    const MAX_CHUNK_SIZE = 4096
    
    if (content.length <= MAX_CHUNK_SIZE) {
      this.enqueue({ type: 'text_complete', content })
    } else {
      // Per contenuti molto grandi, usa streaming incrementale
      console.warn(`[stream-handler] Large content detected (${content.length} chars), using chunked streaming`)
      
      // Prima pulisci il contenuto esistente
      this.enqueue({ type: 'text_complete', content: '' })
      
      // Poi invia in chunks sincroni
      let position = 0
      while (position < content.length) {
        const chunk = content.slice(position, position + MAX_CHUNK_SIZE)
        this.enqueue({ type: 'text', content: chunk })
        position += MAX_CHUNK_SIZE
      }
    }
  }

  /**
   * Nasconde il messaggio di status
   */
  hideStatus(): void {
    this.enqueue({ type: 'status', message: null })
  }

  /**
   * Invia le sources finali
   */
  sendDone(sources: unknown[]): void {
    this.enqueue({ type: 'done', sources })
  }

  /**
   * Invia un errore
   */
  sendError(error: string): void {
    this.enqueue({ type: 'error', error })
  }

  /**
   * Chiude lo stream
   */
  close(): void {
    if (this.isClosed) {
      return
    }
    try {
      this.controller.close()
      this.isClosed = true
    } catch (error) {
      // Controller potrebbe essere già chiuso
      this.isClosed = true
    }
  }
}

/**
 * Crea un ReadableStream per SSE
 */
export function createStream(
  handler: (controller: StreamController) => Promise<void>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const streamController = new StreamController(controller)
      try {
        await handler(streamController)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate response'
        streamController.sendError(errorMessage)
        streamController.close()
      }
    },
  })
}

