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
      }
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
   */
  sendTextComplete(content: string): void {
    this.enqueue({ type: 'text_complete', content })
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

