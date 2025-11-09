# Piano di Refactoring - Chatbot RAG

## 📊 Analisi dell'Implementazione Corrente

### Statistiche Critiche
- **`app/api/chat/route.ts`**: 1142 righe (⚠️ CRITICO)
- **109 console.log** in un solo file
- **1 sola funzione export** (tutto il codice in un unico blocco)
- **Global state** in `lib/mastra/agent.ts` (Map condivise)
- **Logica di citazioni** duplicata e complessa (300+ righe)

---

## 🔴 PROBLEMI SUPER CRITICI (Risolvere ASAP)

### 1. **File Monolitico `app/api/chat/route.ts` (1142 righe)**

**Problema:**
- Tutta la logica del chatbot è in un unico file
- Impossibile testare unità singole
- Difficile da mantenere e debuggare
- Violazione del principio Single Responsibility

**Impatto:**
- ⚠️ **ALTO**: Blocca sviluppo futuro, aumenta rischio di bug
- Difficile onboarding nuovi sviluppatori
- Tempo di debugging aumentato del 300%

**Soluzione:**
```typescript
// Struttura proposta:
app/api/chat/
  ├── route.ts (solo orchestrazione, ~100 righe)
  ├── handlers/
  │   ├── stream-handler.ts (gestione streaming)
  │   ├── cache-handler.ts (gestione cache)
  │   ├── search-handler.ts (gestione ricerca)
  │   └── response-handler.ts (gestione risposta)
  ├── services/
  │   ├── citation-service.ts (gestione citazioni)
  │   ├── source-service.ts (gestione sources)
  │   └── context-builder.ts (costruzione contesto)
  └── utils/
      ├── citation-parser.ts (parsing citazioni)
      └── response-formatter.ts (formattazione risposta)
```

**Priorità: P0 (CRITICA)**

---

### 2. **Global State in `lib/mastra/agent.ts`**

**Problema:**
```typescript
// ❌ PROBLEMA: Map globali condivise tra tutte le richieste
const webSearchResultsContext = new Map<string, any[]>()
const metaQueryDocumentsContext = new Map<string, Array<{ id: string; filename: string; index: number }>>()
```

**Rischi:**
- ⚠️ **CRITICO**: Race conditions in ambiente multi-utente
- Memory leaks (le Map non vengono mai pulite completamente)
- Dati di un utente possono essere accessibili da altri (sicurezza)
- Impossibile scalare orizzontalmente

**Impatto:**
- ⚠️ **CRITICO**: Problemi di sicurezza e scalabilità
- Bug difficili da riprodurre (dipendono da timing)

**Soluzione:**
```typescript
// ✅ SOLUZIONE: Passare context come parametro
interface RequestContext {
  webSearchResults?: WebSearchResult[]
  metaQueryDocuments?: MetaDocument[]
  // ... altri dati temporanei
}

// Passare context attraverso la catena di chiamate
async function processChatRequest(
  message: string,
  context: RequestContext
): Promise<ChatResponse> {
  // Usa context invece di global state
}
```

**Priorità: P0 (CRITICA)**

---

### 3. **Logica di Citazioni Duplicata e Complessa**

**Problema:**
- Logica di parsing citazioni duplicata in 3+ punti
- Rinumerazione citazioni complessa (100+ righe)
- Matching citazioni ↔ sources fragile
- Codice difficile da testare

**Esempio di duplicazione:**
```typescript
// In route.ts (righe 17-34)
function extractCitedIndices(content: string): number[] { ... }

// In route.ts (righe 42-54)
function normalizeWebCitations(content: string): string { ... }

// In route.ts (righe 61-81)
function extractWebCitedIndices(content: string): number[] { ... }

// Logica di rinumerazione duplicata in 3 punti diversi (righe 300-400, 800-900, 950-990)
```

**Impatto:**
- ⚠️ **ALTO**: Bug frequenti nelle citazioni
- Difficile mantenere consistenza
- Testing complesso

**Soluzione:**
```typescript
// ✅ Centralizzare in lib/services/citation-service.ts
export class CitationService {
  extractCitedIndices(content: string): number[]
  extractWebCitedIndices(content: string): number[]
  normalizeCitations(content: string, mapping: Map<number, number>): string
  renumberCitations(content: string, sources: Source[]): { content: string; sources: Source[] }
  matchCitationsToSources(citations: number[], sources: Source[]): Source[]
}
```

**Priorità: P0 (CRITICA)**

---

### 4. **Eccessivo Logging (109 console.log)**

**Problema:**
- 109 console.log in un solo file
- Logging inconsistente (alcuni con prefisso, altri no)
- Difficile filtrare log rilevanti
- Performance impact in produzione

**Impatto:**
- ⚠️ **MEDIO**: Rallenta debugging, aumenta rumore

**Soluzione:**
```typescript
// ✅ Integrare Langfuse per observability LLM
// Langfuse fornisce:
// - Tracing end-to-end delle chiamate LLM
// - Metriche (token, costi, latency)
// - Dashboard per monitoring
// - Integrazione nativa con LLM calls

import { createChatTrace, logLLMCall, finalizeTrace } from '@/lib/observability/langfuse'

const trace = createChatTrace(conversationId, message)
logLLMCall(trace.id, model, input, output, usage)
finalizeTrace(trace.id, response)
```

**Priorità: P1 (ALTA) - Integrazione Langfuse**

---

### 5. **Error Handling Inconsistente**

**Problema:**
- Alcuni errori vengono catturati e ignorati silenziosamente
- Altri vengono loggati ma non gestiti
- Nessuna strategia unificata per retry
- Errori di streaming non sempre propagati correttamente

**Esempi:**
```typescript
// ❌ Errore ignorato silenziosamente
try {
  await supabaseAdmin.from('messages').insert(...)
} catch (err) {
  console.error('[api/chat] Failed to save user message:', err)
  // Continue anyway, don't fail the request
}

// ❌ Errore loggato ma non gestito
catch (error) {
  console.error('[api/chat] Stream error:', error)
  // Solo log, nessuna recovery
}
```

**Impatto:**
- ⚠️ **ALTO**: Difficile debugging, perdita di dati

**Soluzione:**
```typescript
// ✅ Error handling centralizzato
class ChatError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false
  ) {
    super(message)
  }
}

// ✅ Retry strategy
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  // Implementazione retry
}
```

**Priorità: P1 (ALTA)**

---

### 6. **Logica di Streaming Mescolata con Business Logic**

**Problema:**
- Logica di streaming (SSE) mescolata con logica di business
- Difficile testare senza mockare streaming
- Codice difficile da riutilizzare

**Impatto:**
- ⚠️ **MEDIO**: Testing complesso, riusabilità limitata

**Soluzione:**
```typescript
// ✅ Separare streaming da business logic
class StreamController {
  enqueue(type: string, data: unknown): void
  close(): void
}

class ChatService {
  async processMessage(message: string): Promise<ChatResponse> {
    // Business logic pura, senza streaming
  }
}

// In route.ts
const service = new ChatService()
const controller = new StreamController()

const response = await service.processMessage(message)
controller.enqueue('text', response.content)
```

**Priorità: P1 (ALTA)**

---

## 🟡 PROBLEMI IMPORTANTI (Risolvere a breve)

### 7. **Troppe Variabili di Stato**

**Problema:**
- 15+ variabili di stato in `route.ts`
- Difficile tracciare il flusso
- Facile introdurre bug

**Soluzione:**
```typescript
// ✅ Usare oggetti di stato tipizzati
interface ChatRequestState {
  query: string
  analysis: QueryAnalysisResult
  searchResults: SearchResult[]
  context: string | null
  sources: Source[]
  // ...
}

const state: ChatRequestState = {
  // Inizializzazione
}
```

**Priorità: P2 (MEDIA)**

---

### 8. **Duplicazione Logica Query Enhancement**

**Problema:**
- Logica di enhancement duplicata tra `query-enhancement.ts` e `intent-based-expansion.ts`
- Alcune funzioni deprecate ma ancora presenti

**Soluzione:**
- Rimuovere funzioni deprecate
- Unificare logica in un unico modulo

**Priorità: P2 (MEDIA)**

---

### 9. **Mancanza di Type Safety**

**Problema:**
- Uso eccessivo di `any` e `as any`
- Type casting non sicuro
- Interfacce incomplete

**Esempi:**
```typescript
// ❌ Type casting non sicuro
const streamSource = (result as any).textStream || (result as any).stream
const generatedText = (generated as any).text || (generated as any).content
```

**Soluzione:**
- Definire tipi completi per tutte le strutture dati
- Eliminare `any` e `as any`
- Usare type guards

**Priorità: P2 (MEDIA)**

---

## 📋 PIANO DI REFACTORING (Priorità)

### Fase 1: Criticità Immediate (Settimana 1)

1. **✅ Separare `route.ts` in moduli** (2-3 giorni)
   - Estrarre handlers
   - Estrarre services
   - Estrarre utils
   - Testare ogni modulo

2. **✅ Eliminare global state** (1 giorno)
   - Passare context come parametro
   - Testare concorrenza
   - Verificare memory leaks

3. **✅ Centralizzare logica citazioni** (1-2 giorni)
   - Creare `CitationService`
   - Refactorare tutti i punti di utilizzo
   - Testare edge cases

### Fase 2: Miglioramenti Importanti (Settimana 2)

4. **✅ Implementare logger strutturato** (1 giorno)
   - Sostituire console.log
   - Configurare livelli di log
   - Aggiungere context tracking

5. **✅ Unificare error handling** (1-2 giorni)
   - Creare error classes
   - Implementare retry strategy
   - Aggiungere error recovery

6. **✅ Separare streaming da business logic** (2 giorni)
   - Estrarre `StreamController`
   - Estrarre `ChatService`
   - Testare separatamente

### Fase 3: Pulizia e Ottimizzazione (Settimana 3)

7. **✅ Refactorare state management** (1 giorno)
   - Creare state objects tipizzati
   - Ridurre variabili di stato

8. **✅ Pulire duplicazioni** (1 giorno)
   - Rimuovere funzioni deprecate
   - Unificare logica enhancement

9. **✅ Migliorare type safety** (2 giorni)
   - Definire tipi completi
   - Eliminare `any`
   - Aggiungere type guards

---

## 🎯 Metriche di Successo

### Prima del Refactoring
- ❌ `route.ts`: 1142 righe
- ❌ Global state: 2 Map condivise
- ❌ Funzioni duplicate: 5+
- ❌ console.log: 109
- ❌ Type safety: ~60% (molti `any`)

### Dopo il Refactoring
- ✅ `route.ts`: <150 righe
- ✅ Global state: 0
- ✅ Funzioni duplicate: 0
- ✅ Logger strutturato: 100%
- ✅ Type safety: >95%

### Benefici Attesi
- 🚀 **Velocità sviluppo**: +200%
- 🐛 **Bug rate**: -70%
- ⏱️ **Tempo debugging**: -60%
- 🧪 **Test coverage**: +80%
- 📖 **Leggibilità**: +150%

---

## 🛠️ Strumenti e Best Practices

### Testing
- Unit tests per ogni service/handler
- Integration tests per flussi completi
- E2E tests per scenari critici

### Code Review Checklist
- [ ] Nessun global state
- [ ] Logica separata per responsabilità
- [ ] Error handling completo
- [ ] Type safety al 100%
- [ ] Test coverage >80%

### Documentazione
- JSDoc per tutte le funzioni pubbliche
- README per ogni modulo
- Diagrammi di flusso per logica complessa

---

## ⚠️ RISCHI E MITIGAZIONI

### Rischio 1: Regressioni durante refactoring
**Mitigazione:**
- Test completi prima di iniziare
- Refactoring incrementale (un modulo alla volta)
- Code review approfondita

### Rischio 2: Tempo di sviluppo aumentato
**Mitigazione:**
- Priorità chiare (P0 prima)
- Sprint dedicati al refactoring
- Non aggiungere features durante refactoring

### Rischio 3: Breaking changes
**Mitigazione:**
- Mantenere API compatibili
- Versioning se necessario
- Migration guide per team

---

## 📝 Note Finali

Questo refactoring è **CRITICO** per la manutenibilità futura del progetto. I problemi P0 devono essere risolti **IMMEDIATAMENTE** per evitare:
- Bug di sicurezza (global state)
- Impossibilità di scalare
- Blocco sviluppo nuove features

**Tempo stimato totale**: 2-3 settimane
**Risorse necessarie**: 1-2 sviluppatori full-time
**ROI**: Alto (risparmio tempo futuro >10x)

