# Piano di Migrazione e Semplificazione Radicale

> **Obiettivo:** Rendere i risultati affidabili e testabili, eliminare l'accoppiamento fragile tra componenti, e semplificare lo stack (Mastra → Vercel AI SDK, prompt centralizzati in Langfuse, evaluation automatica).

## Problemi che risolviamo

| Problema | Causa | Soluzione |
|---|---|---|
| Risultati inaffidabili | ~10 prompt in ~10 file con istruzioni contraddittorie | Prompt centralizzati in Langfuse, system prompt unico |
| Cambiare un pezzo ne rompe un altro | Catena fragile: analysis → prompt variant → LLM output → citation parsing | Prompt unico, citazioni post-hoc, evaluation suite |
| Race condition citazioni sbagliate | `toolResultsCache` globale condiviso tra request | Vercel AI SDK (tool results per-request) |
| Impossibile testare le risposte | Nessun framework di valutazione | Langfuse Datasets + Experiments |
| Type safety inesistente layer LLM | Mastra API opache, 7× `as any` | AI SDK con Zod schema |

---

## Fase 0: Fix Sicurezza Immediati

**Tempo:** 30 min — **Indipendente dal resto**

### 0.1 CORS

```diff
# next.config.js
- { key: 'Access-Control-Allow-Origin', value: '*' },
+ { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000' },
```

### 0.2 Auth helper per API routes

Creare `lib/auth/require-user.ts` e aggiungere auth check a: `/api/documents`, `/api/upload/process`, `/api/settings`, `/api/diagnostics/*`.

### 0.3 Pulizia root

```bash
rm "1762893525394-lf-traces-export-*.json"
rm "how 8ac6625 --format=*"
rm "chatbotcollectibus"
```

---

## Fase 1: Centralizzazione Prompt in Langfuse

**Tempo:** 2-3 ore — **Risolve il problema principale: "cambiare uno rompe gli altri"**

### Situazione attuale: ~10 prompt in ~10 file

```
system-prompt.ts        → 5 varianti system prompt (~300 righe di testo prompt)
agent.ts                → BASE_AGENT_INSTRUCTIONS + citationFormat nell'output webSearchTool
                          + description dei 2 tool con istruzioni citazione
query-analysis.ts       → prompt per classificazione intent
query-enhancement.ts    → prompt per espansione query
meta-folder-inference.ts → prompt per inferire folder name
keyword-extraction.ts   → prompt per keywords (upload)
summary-generation.ts   → prompt per summary (upload)
```

Le istruzioni di citazione sono ripetute in **4 posti** con formulazioni diverse → se cambi una, le altre 3 restano disallineate.

### Target: tutti i prompt in Langfuse, zero testo prompt nel codice

**Langfuse Prompts Dashboard:**

| Nome Prompt | Usato in | Variabili |
|---|---|---|
| `system-rag` | chat route | `{{context}}`, `{{web_search_section}}`, `{{meta_query_section}}` |
| `query-analysis` | query-analysis.ts | `{{query}}`, `{{valid_intents}}` |
| `query-enhancement` | query-enhancement.ts | `{{query}}`, `{{analysis}}`, `{{history}}` |
| `folder-inference` | meta-folder-inference.ts | `{{query}}`, `{{folders}}` |
| `keyword-extraction` | keyword-extraction.ts | `{{chunk}}`, `{{document_title}}` |
| `summary-generation` | summary-generation.ts | `{{chunks}}`, `{{filename}}` |

### Implementazione

1. **Creare i prompt su Langfuse Dashboard** — copia-incolla il testo attuale, poi semplifica
2. **Creare `lib/prompts/index.ts`** — un modulo che recupera i prompt da Langfuse con cache locale

```typescript
import { getLangfusePrompt } from '@/lib/observability/prompt-manager'

export async function getPrompt(name: string, variables: Record<string, string>) {
  return getLangfusePrompt(name, variables)
}
```

3. **Aggiornare ogni file** — sostituire il testo hardcoded con `getPrompt('nome', { variabili })`
4. **Eliminare `buildFallbackComparativePrompt()` e le altre 4 funzioni** — un solo template, varianti gestite con variabili

### Beneficio

- Modificare un prompt = cambiarlo su Langfuse → effetto immediato senza deploy
- Versioning automatico → rollback se qualcosa peggiora
- **Un solo posto** per le regole di citazione

---

## Fase 2: Unificazione System Prompt

**Tempo:** 1-2 ore — **Riduce da 5 varianti a 1 template**

### Da (oggi — `system-prompt.ts`, 461 righe)

```
buildFallbackMetaPrompt()
buildFallbackComparativePrompt()
buildFallbackWithContextPrompt()
buildFallbackNoContextWebPrompt()
buildFallbackNoContextPrompt()
```

5 funzioni che ripetono le stesse sezioni con variazioni minime.

### A (target — prompt Langfuse `system-rag`)

```
Sei un assistente per un team di consulenza.

{{#if context}}
CONTESTO DOCUMENTI:
{{context}}

Cita le fonti con [cit:N] dove N corrisponde a [Documento N: filename].
Non inventare citazioni. Cita solo documenti presenti nel contesto.
{{/if}}

{{#if web_search_enabled}}
Se le fonti non bastano, usa il tool web_search. Cita i risultati web con [web:N].
{{/if}}

Per informazioni sul database stesso (lista documenti, cartelle, statistiche), usa il tool meta_query.
```

~20 righe invece di ~300. Meno istruzioni = LLM meno confuso = output più prevedibile.

### File da modificare

- **[DELETE]** Le 5 funzioni `buildFallback*` in `system-prompt.ts`
- **[SIMPLIFY]** `buildSystemPrompt()` → chiama `getPrompt('system-rag', variables)`
- **[REMOVE]** `citationFormat` dall'output di `webSearchTool` (istruzioni già nel system prompt)
- **[REMOVE]** Istruzioni citazione ridondanti nelle `description` dei tool

---

## Fase 3: Migrazione a Vercel AI SDK

**Tempo:** 4-6 ore — **Elimina race condition, dà type safety e token usage**

### 3.1 Installa dipendenze

```bash
npm install ai @ai-sdk/openai @ai-sdk/react
```

### 3.2 Provider OpenRouter

**[NEW] `lib/ai/provider.ts`**

```typescript
import { createOpenAI } from '@ai-sdk/openai'

export const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})
```

### 3.3 Tool con Zod

**[NEW] `lib/ai/tools.ts`**

```typescript
import { tool } from 'ai'
import { z } from 'zod'

export const webSearchTool = tool({
  description: 'Cerca informazioni sul web quando le fonti nella knowledge base non bastano.',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => { /* logica da lib/tavily/web-search */ },
})

export const metaQueryTool = tool({
  description: 'Ottieni info sul database (lista documenti, cartelle, statistiche).',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => { /* logica estratta da agent.ts */ },
})
```

### 3.4 Estrarre business logic metaQueryTool

**[NEW] `lib/ai/handlers/meta-query-handler.ts`**

Spostare le ~450 righe di logica da `agent.ts:metaQueryTool` in una funzione pura `handleMetaQuery(query)`. Questa funzione:
- Non dipende da Mastra
- Non scrive in `toolResultsCache` (eliminato — AI SDK espone tool results nel response)
- Ritorna un tipo strutturato
- È testabile in isolamento

### 3.5 Nuova chat route

**[REWRITE] `app/api/chat/route.ts`**

```typescript
import { streamText, StreamData } from 'ai'
import { openrouter } from '@/lib/ai/provider'
import { webSearchTool, metaQueryTool } from '@/lib/ai/tools'

export async function POST(req: Request) {
  // Auth
  const { user, error } = await requireUser()
  if (error) return error

  const { messages, conversationId, webSearchEnabled, skipCache } = await req.json()
  const lastMessage = messages[messages.length - 1].content

  // Step 1-4: IDENTICI (analyze, enhance, cache, search)
  const analysis = await analyzeQuery(lastMessage)
  const enhancement = await enhanceQueryIfNeeded(lastMessage, analysis, history)
  const embedding = await generateEmbedding(enhancement.enhanced)
  const cached = await lookupCache(enhancement.enhanced, embedding, skipCache)
  if (cached.cached) return Response.json(cached)

  const searchResults = await performSearch(enhancement.enhanced, embedding, analysis)
  const context = buildContext(searchResults)
  const systemPrompt = await getPrompt('system-rag', { context, ... })

  // Step 5: LLM con AI SDK
  const result = streamText({
    model: openrouter(analysis.isComparative ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash'),
    system: systemPrompt,
    messages,
    tools: {
      ...(webSearchEnabled ? { web_search: webSearchTool } : {}),
      meta_query: metaQueryTool,
    },
    maxSteps: 3,
    experimental_telemetry: { isEnabled: true, functionId: 'chat' },
    onFinish: async ({ text, usage, toolResults }) => {
      // Post-processing + save (fire-and-forget)
      const processed = processResponse(text, searchResults, toolResults)
      saveAssistantMessage(conversationId, processed.content, { usage, sources: processed.sources })
      saveCache(enhancement.enhanced, embedding, processed.content, processed.sources)
    },
  })

  return result.toDataStreamResponse()
}
```

**Da 489 righe a ~80 righe.**

### 3.6 Frontend con `useChat`

**[MODIFY]** Componente chat:

```typescript
import { useChat } from '@ai-sdk/react'

const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  body: { webSearchEnabled, skipCache },
})
```

Elimina tutto il parsing SSE manuale.

### Cosa elimina questa fase

| File | Righe | Azione |
|---|---|---|
| `handlers/stream-handler.ts` | 196 | **DELETE** |
| `handlers/response-handler.ts` | 466 | **DELETE** |
| `lib/mastra/agent.ts` | 888 | **DELETE** |
| `lib/mastra/workflows/` | — | **DELETE** directory |
| `lib/async/message-operations.ts` | 107 | **DELETE** (logica in `onFinish`) |
| **Totale rimosso** | **~1657** | |
| **Codice nuovo** | **~300** | `provider.ts`, `tools.ts`, `meta-query-handler.ts`, route riscritta |

```bash
npm uninstall @mastra/core
```

---

## Fase 4: Evaluation Suite con Langfuse

**Tempo:** 3-4 ore — **Dà regression testing sulle risposte**

### 4.1 Creare Dataset su Langfuse

Creare un dataset `golden-queries` con 15-20 query rappresentative:

| Query | Tipo | Aspettative |
|---|---|---|
| "che documenti GRI abbiamo?" | meta/list | Lista ≥5 documenti, tutti GRI |
| "confronta CSRD e ESPR" | comparative | Menziona entrambi, tabella/struttura |
| "articolo 5 del GDPR" | factual/article | Testo articolo specifico |
| "quanti documenti ci sono?" | meta/stats | Numero corretto |
| "documenti su sostenibilità" | exploratory | Lista documenti tematici |
| "cosa dice la norma ISO 14001?" | factual | Contenuto dalla KB |
| "documenti nella cartella GRI" | meta/folder | Solo documenti in quella cartella |

### 4.2 Script di valutazione automatica

**[NEW] `scripts/run-evaluation.ts`**

```typescript
import Langfuse from 'langfuse'

const langfuse = new Langfuse()

async function runEvaluation() {
  const dataset = await langfuse.getDataset('golden-queries')

  for (const item of dataset.items) {
    // Esegui la query tramite l'API
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: item.input }] }),
    })

    const result = await response.json()

    // Scoring automatico
    const scores = {
      has_citations: result.content.includes('[cit:') ? 1 : 0,
      has_sources: result.sources?.length > 0 ? 1 : 0,
      response_length: result.content.length > 50 ? 1 : 0,
      no_hallucination: !result.content.includes('non ho informazioni') || item.expectNoResults ? 1 : 0,
    }

    // Pubblica risultati su Langfuse
    await langfuse.score({
      traceId: result.traceId,
      name: 'evaluation',
      value: Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length,
      comment: JSON.stringify(scores),
    })
  }
}
```

### 4.3 Workflow di valutazione

```
1. Modifica un prompt su Langfuse
2. npm run evaluate  →  esegue golden queries
3. Confronta score su Langfuse dashboard con versione precedente
4. Se migliorano → pubblica prompt. Se peggiorano → rollback versione.
```

Aggiungere a `package.json`:
```json
"evaluate": "tsx scripts/run-evaluation.ts"
```

---

## Fase 5: Citazioni Post-hoc (Opzionale)

**Tempo:** 2-3 ore — **Elimina la fragilità della catena di citazioni**

### Problema

Oggi l'LLM deve produrre `[cit:N]` inline → 4 normalizzatori diversi → citation-service parsa → se il formato è sbagliato, sources vuote.

### Soluzione

Rimuovere istruzioni di citazione dal prompt. Nel callback `onFinish` di `streamText`, fare matching automatico:

```typescript
onFinish: async ({ text }) => {
  // Per ogni frase della risposta, trova il chunk più simile
  const sentences = text.split(/[.!?]+/)
  const citations = await matchSentencesToChunks(sentences, searchResults)
  // Inserisci citazioni nel testo
  const citedText = insertCitations(text, citations)
}
```

**Beneficio:** Il prompt diventa più corto, l'LLM si concentra sulla qualità della risposta, le citazioni sono sempre corrette perché basate su similarità reale.

---

## Riepilogo

| Fase | Tempo | Cosa risolve |
|---|---|---|
| **0. Fix sicurezza** | 30 min | CORS + API auth |
| **1. Prompt in Langfuse** | 2-3 ore | "Cambiare uno rompe gli altri" |
| **2. System prompt unico** | 1-2 ore | Risultati imprevedibili |
| **3. AI SDK** | 4-6 ore | Race condition, type safety, token usage |
| **4. Evaluation suite** | 3-4 ore | Testabilità dei risultati |
| **5. Citazioni post-hoc** | 2-3 ore | Fragilità catena citazioni |
| **Totale** | **~2-3 giorni** | |

### Impatto finale

| Metrica | Prima | Dopo |
|---|---|---|
| Prompt nel codice | ~10, in ~10 file | 0 (tutti in Langfuse) |
| Righe flusso chat | ~3500 | ~1800 |
| Varianti system prompt | 5 | 1 template |
| `as any` cast | 7 | 0 |
| Race conditions | 1 (critica) | 0 |
| Test risultati | 0 | 15-20 golden queries |
| Tempo per iterare su un prompt | Deploy completo | Modifica su Langfuse (istantaneo) |
