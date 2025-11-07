/**
 * System prompt builder per RAG chatbot
 * 
 * Centralizza tutta la logica di costruzione del system prompt
 * per evitare duplicazioni tra route.ts e agent.ts
 */

export interface SystemPromptOptions {
  /** Se ci sono documenti rilevanti nella knowledge base */
  hasContext: boolean
  /** Contenuto del contesto formattato (documenti) */
  context?: string
  /** Numero di documenti nel contesto */
  documentCount?: number
  /** Nomi dei documenti unici (per query comparative) */
  uniqueDocumentNames?: string[]
  /** Termini per query comparative (es. ["GDPR", "ESPR"]) */
  comparativeTerms?: string[]
  /** Numero articolo specifico richiesto */
  articleNumber?: number
  /** Se la ricerca web è abilitata */
  webSearchEnabled?: boolean
  /** Se le fonti sono insufficienti */
  sourcesInsufficient?: boolean
  /** Similarità media per logica web search */
  avgSimilarity?: number
}

/**
 * Costruisce il system prompt appropriato in base ai parametri forniti
 * 
 * Gestisce tutti i casi d'uso:
 * - Query comparative con documenti
 * - Query normali con documenti
 * - Query con articolo specifico
 * - Nessun documento + web search abilitato
 * - Nessun documento + web search disabilitato
 * 
 * @param options - Opzioni per la costruzione del prompt
 * @returns System prompt formattato
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const {
    hasContext,
    context,
    documentCount = 0,
    uniqueDocumentNames = [],
    comparativeTerms,
    articleNumber,
    webSearchEnabled = false,
    sourcesInsufficient = false,
    avgSimilarity = 0,
  } = options

  // Costruisci istruzione per ricerca web se necessario
  const buildWebSearchInstruction = (): string => {
    if (webSearchEnabled && sourcesInsufficient) {
      return `\n\nIMPORTANTE - RICERCA WEB:
- Le fonti nella knowledge base non sono completamente sufficienti per rispondere a questa domanda (similarità media: ${avgSimilarity.toFixed(2)})
- DEVI usare il tool web_search per cercare informazioni aggiuntive e aggiornate sul web
- Dopo aver ottenuto i risultati della ricerca web, integra le informazioni nella tua risposta
- Cita le fonti web con [web:N] dove N è il numero del risultato (1, 2, 3, ecc.)
- Usa [cit:N] per le fonti dalla knowledge base e [web:N] per le fonti web
- Combina le informazioni dalla knowledge base con quelle trovate sul web per una risposta completa`
    }
    return ''
  }

  // Costruisci sezione citazioni standard
  const buildCitationsSection = (): string => {
    return `
CITAZIONI - REGOLE IMPORTANTI:
- Il contesto contiene ${documentCount} documenti numerati da 1 a ${documentCount}
- Ogni documento inizia con "[Documento N: nome_file]" dove N è il numero del documento (1, 2, 3, ..., ${documentCount})
- Quando citi informazioni da un documento, usa [cit:N] dove N è il numero ESATTO del documento nel contesto
- Per citazioni multiple da più documenti, usa [cit:N,M] (es. [cit:1,2] per citare documenti 1 e 2)
- NON inventare numeri di documento che non esistono nel contesto
- Gli indici delle citazioni DEVONO corrispondere esattamente ai numeri "[Documento N:" presenti nel contesto

ESEMPIO:
Se il contesto contiene:
[Documento 1: file1.pdf]
Testo del documento 1...

[Documento 2: file2.pdf]
Testo del documento 2...

E usi informazioni da entrambi, cita: [cit:1,2]

IMPORTANTE: 
- NON inventare citazioni
- Usa citazioni SOLO se il contesto fornito contiene informazioni rilevanti
- Se citi informazioni, usa SEMPRE il numero corretto del documento dal contesto`
  }

  // Caso 1: Ci sono documenti rilevanti
  if (hasContext && context) {
    const webSearchInstruction = buildWebSearchInstruction()

    // Caso 1a: Query comparative con documenti
    if (comparativeTerms && comparativeTerms.length > 0) {
      const uniqueDocuments = uniqueDocumentNames.length > 0
        ? uniqueDocumentNames.join(', ')
        : 'vari documenti'
      
      return `Sei un assistente per un team di consulenza. L'utente ha chiesto un confronto tra: ${comparativeTerms.join(' e ')}. 

Ho trovato informazioni nei seguenti documenti: ${uniqueDocuments}.

Usa il seguente contesto dai documenti per rispondere.${webSearchInstruction}${buildCitationsSection()}

IMPORTANTE: 
- Confronta esplicitamente i concetti trovati in entrambe le normative
- Cita SOLO informazioni presenti nel contesto fornito
- Se trovi concetti simili in documenti diversi, menzionalo esplicitamente

Contesto dai documenti:
${context}`
    }

    // Caso 1b: Query normale con documenti (con o senza articolo specifico)
    const articleContext = articleNumber
      ? `\n\nL'utente ha chiesto informazioni sull'ARTICOLO ${articleNumber}. Il contesto seguente contiene questo articolo specifico. Rispondi con il contenuto dell'articolo ${articleNumber}.`
      : ''

    return `Sei un assistente per un team di consulenza. Usa il seguente contesto dai documenti della knowledge base per rispondere.${articleContext}${webSearchInstruction}${buildCitationsSection()}

Contesto dai documenti:
${context}`
  }

  // Caso 2: Nessun documento rilevante
  if (webSearchEnabled && sourcesInsufficient) {
    // Caso 2a: Nessun documento + web search abilitato
    return `Sei un assistente per un team di consulenza. Non ci sono documenti rilevanti nella knowledge base per questa domanda.

IMPORTANTE - RICERCA WEB:
- Le fonti nella knowledge base non sono sufficienti per rispondere completamente a questa domanda
- DEVI usare il tool web_search per cercare informazioni aggiornate sul web
- Dopo aver ottenuto i risultati della ricerca web, integra le informazioni nella tua risposta
- Cita le fonti web con [web:N] dove N è il numero del risultato (1, 2, 3, ecc.)
- NON usare citazioni [cit:N] perché non ci sono documenti rilevanti nella knowledge base
- Usa [web:N] per citare le fonti web trovate

Rispondi in modo completo combinando le tue conoscenze generali con le informazioni trovate sul web.`
  }

  // Caso 2b: Nessun documento + web search disabilitato
  return `Sei un assistente per un team di consulenza. 

IMPORTANTE - SITUAZIONE ATTUALE:
- Non ci sono documenti rilevanti nella knowledge base per questa domanda
- La ricerca web non è abilitata

ISTRUZIONI:
- NON rispondere usando conoscenze generali o informazioni non verificate
- NON inventare informazioni o fare supposizioni
- DEVI informare l'utente che non ci sono informazioni sufficienti nella knowledge base per rispondere a questa domanda
- Suggerisci all'utente di abilitare la ricerca web se vuole informazioni aggiornate dal web
- Sii onesto e trasparente: se non hai informazioni rilevanti, dillo chiaramente

Rispondi in modo breve e diretto, informando l'utente che non ci sono informazioni sufficienti nella knowledge base.`
}

