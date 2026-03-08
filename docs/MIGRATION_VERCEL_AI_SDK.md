# Piano di Migrazione e Semplificazione Radicale

> **Obiettivo:** Rendere i risultati affidabili e testabili, eliminare l'accoppiamento fragile tra componenti, e semplificare lo stack (Mastra → Vercel AI SDK, prompt consolidati su Langfuse, evaluation automatica).

## Problemi che risolviamo

| Problema | Causa | Soluzione |
|---|---|---|
| Risultati inaffidabili | 5 system prompt separati + istruzioni citazione duplicate in 4 posti | Unificazione a 1 system prompt su Langfuse |
| Cambiare un pezzo ne rompe un altro | Catena fragile: analysis → prompt variant → LLM output → citation parsing | Prompt unico su Langfuse, evaluation suite |
| Race condition citazioni sbagliate | `toolResultsCache` globale condiviso tra request | Vercel AI SDK (tool results per-request) |
| Impossibile testare le risposte | Nessun framework di valutazione | Langfuse Datasets + Experiments |
| Type safety inesistente layer LLM | Mastra API opache, 7× `as any` | AI SDK con Zod schema |
| ~300 righe di fallback potenzialmente stale | Fallback hardcoded che potrebbe non coincidere con i prompt live su Langfuse | Eliminare i fallback, fidarsi di Langfuse |

## Stato Attuale dei Prompt

I prompt **sono già su Langfuse** come fonte primaria. Il codice li recupera con `compilePromptWithConfig()` e usa fallback hardcoded solo se Langfuse è irraggiungibile.

**9 prompt registrati in `prompt-manager.ts`:**

| Nome Langfuse | Usato in | Problema |
|---|---|---|
| `system-rag-with-context` | system-prompt.ts | 1 di 5 varianti, dovrebbe essere unificato |
| `system-rag-comparative` | system-prompt.ts | Variante separata, duplica 80% del contenuto |
| `system-rag-no-context-web` | system-prompt.ts | Variante separata |
| `system-rag-no-context` | system-prompt.ts | Variante separata |
| `system-meta-query` | system-prompt.ts | Variante separata |
| `query-analysis` | query-analysis.ts | ✅ OK, indipendente |
| `query-expansion` | intent-based-expansion.ts | ✅ OK, indipendente |
| `meta-folder-inference` | meta-folder-inference.ts | ✅ OK, indipendente |
| `keyword_extractor` | keyword-extraction.ts | ✅ OK, indipendente |

**Istruzioni citazione hardcoded nel codice (NON su Langfuse):**

| File | Cosa contiene | Problema |
|---|---|---|
| `agent.ts:728` | `webSearchTool.description` con formato `[web:N]` | Hardcoded nel codice |
| `agent.ts:744` | `metaQueryTool.description` | Hardcoded nel codice |
| `agent.ts:184` | `citationFormat` nell'output di webSearchTool | Istruzioni inline nel tool result |
| `system-prompt.ts:240-270` | `buildCitationsSection()` — regole citazione nel fallback | Duplica le regole su Langfuse |

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

Rimuovere file spazzatura dal root: export Langfuse `.json`, file `chatbotcollectibus`, file con nome git command.

---

## Fase 1: Consolidamento Prompt su Langfuse

**Tempo:** 2-3 ore — **Risolve il problema principale: "cambiare uno rompe gli altri"**

### 1.1 Unificare i 5 system prompt in 1

**Su Langfuse Dashboard:**

Creare un nuovo prompt `system-rag` che sostituisce i 5 esistenti, usando variabili condizionali:

```
Sei un assistente per un team di consulenza.

{{#if context}}
Usa il seguente contesto dai documenti per rispondere:
{{context}}

Cita con [cit:N] dove N = numero documento del contesto.
Non inventare citazioni.
{{/if}}

{{#if web_search_section}}
{{web_search_section}}
{{/if}}

Per informazioni sul database stesso (lista documenti, statistiche), usa il tool meta_query.
Quando elenchi documenti dal tool meta_query, includi [cit:N] per ogni documento.
```

**~30 righe** invece di 5 prompt separati con contenuto sovrapposto.

### 1.2 Semplificare `system-prompt.ts`

```diff
# Da:
- 461 righe con 5 funzioni buildFallback* + routing a 5 prompt Langfuse

# A:
- ~60 righe con 1 chiamata a compilePromptWithConfig('system-rag', variables)
- 1 fallback minimale (20 righe) invece di 5
```

**File da modificare:**
- **[SIMPLIFY]** `lib/llm/system-prompt.ts` — da 461 righe a ~80
- **[DEPRECATE su Langfuse]** I 5 prompt separati, sostituiti dal singolo `system-rag`

### 1.3 Eliminare istruzioni citazione duplicate

Le regole di citazione devono stare in **un solo posto** (il system prompt su Langfuse). Rimuovere:

- `agent.ts:184` — `citationFormat` dall'output di webSearchTool
- Istruzioni ridondanti nelle `description` dei tool (mantenere solo la descrizione funzionale, senza regole di formato)

---

## Fase 2: Migrazione a Vercel AI SDK

**Tempo:** 4-6 ore — **Elimina race condition, dà type safety e token usage**

### 2.1 Installa dipendenze

```bash
npm install ai @ai-sdk/openai @ai-sdk/react
```

### 2.2 Provider OpenRouter

**[NEW] `lib/ai/provider.ts`**

```typescript
import { createOpenAI } from '@ai-sdk/openai'

export const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})
```

### 2.3 Tool con Zod

**[NEW] `lib/ai/tools.ts`**

```typescript
import { tool } from 'ai'
import { z } from 'zod'

export const webSearchTool = tool({
  description: 'Cerca informazioni sul web quando le fonti nella knowledge base non bastano.',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    const { searchWeb } = await import('@/lib/tavily/web-search')
    const results = await searchWeb(query, 5)
    return {
      results: results.results.map((r, i) => ({
        index: i + 1,
        title: r.title || 'Senza titolo',
        url: r.url || '',
        content: r.content || '',
      })),
    }
  },
})

export const metaQueryTool = tool({
  description: 'Ottieni info sul database (lista documenti, cartelle, statistiche).',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    const { handleMetaQuery } = await import('@/lib/ai/handlers/meta-query-handler')
    return handleMetaQuery(query)
  },
})
```

### 2.4 Estrarre business logic metaQueryTool

**[NEW] `lib/ai/handlers/meta-query-handler.ts`**

Spostare le ~450 righe di logica da `agent.ts:metaQueryTool` in una funzione pura `handleMetaQuery(query)`. Questa funzione:
- Non dipende da Mastra
- Non scrive in `toolResultsCache` (eliminato — AI SDK espone tool results nel response)
- Ritorna un tipo strutturato `MetaQueryResult`
- È testabile in isolamento

### 2.5 Nuova chat route

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
  const systemPrompt = await buildSystemPrompt({ context, analysis, webSearchEnabled })

  // Step 5: LLM con AI SDK
  const result = streamText({
    model: openrouter(analysis.isComparative ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash'),
    system: systemPrompt.text,
    messages,
    tools: {
      ...(webSearchEnabled ? { web_search: webSearchTool } : {}),
      meta_query: metaQueryTool,
    },
    maxSteps: 3,
    experimental_telemetry: { isEnabled: true, functionId: 'chat' },
    onFinish: async ({ text, usage, toolResults }) => {
      const processed = processResponse(text, searchResults, toolResults)
      saveAssistantMessage(conversationId, processed.content, { usage, sources: processed.sources })
      saveCache(enhancement.enhanced, embedding, processed.content, processed.sources)
    },
  })

  return result.toDataStreamResponse()
}
```

**Da 489 righe a ~80 righe.**

### 2.6 Frontend con `useChat`

```typescript
import { useChat } from '@ai-sdk/react'

const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  body: { webSearchEnabled, skipCache },
})
```

Elimina il parsing SSE manuale.

### 2.7 File da eliminare

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

## Fase 3: Evaluation Suite con Langfuse

**Tempo:** 3-4 ore — **Dà regression testing sulle risposte**

### 3.1 Creare Dataset su Langfuse

Creare un dataset `golden-queries` con 15-20 query rappresentative:

| Query | Tipo | Aspettative |
|---|---|---|
| "che documenti GRI abbiamo?" | meta/list | Lista ≥5 documenti, tutti GRI |
| "confronta CSRD e ESPR" | comparative | Menziona entrambi, struttura comparativa |
| "articolo 5 del GDPR" | factual/article | Testo articolo specifico |
| "quanti documenti ci sono?" | meta/stats | Numero corretto |
| "documenti su sostenibilità" | exploratory | Lista documenti tematici |
| "cosa dice la norma ISO 14001?" | factual | Contenuto dalla KB |
| "documenti nella cartella GRI" | meta/folder | Solo documenti in quella cartella |

### 3.2 Script di valutazione automatica

**[NEW] `scripts/run-evaluation.ts`**

Esegue tutte le golden query, calcola score automatici (ha citazioni? ha sources? risposta non vuota? nessuna allucinazione?), e pubblica i risultati su Langfuse come score.

### 3.3 Workflow di valutazione

```
1. Modifica un prompt su Langfuse
2. npm run evaluate  →  esegue golden queries
3. Confronta score su Langfuse dashboard con versione precedente
4. Se migliorano → pubblica prompt. Se peggiorano → rollback versione prompt.
```

---

## Fase 4: Citazioni Post-hoc (Opzionale)

**Tempo:** 2-3 ore — **Elimina la fragilità della catena di citazioni**

### Problema

Oggi l'LLM deve produrre `[cit:N]` inline → 4 normalizzatori diversi (Unicode, Gemini, web, standard) → citation-service parsa. Se il modello sbaglia formato → sources vuote o sbagliate.

### Soluzione

Rimuovere istruzioni di citazione dal prompt. Nel callback `onFinish`, fare matching automatico tra frasi della risposta e chunks del contesto usando similarità coseno. Citazioni sempre corrette perché basate su dati, non sull'output LLM.

---

## Riepilogo

| Fase | Tempo | Cosa risolve |
|---|---|---|
| **0. Fix sicurezza** | 30 min | CORS + API auth |
| **1. Consolidamento prompt** | 2-3 ore | Da 5 system prompt a 1 + eliminazione duplicati |
| **2. AI SDK** | 4-6 ore | Race condition, type safety, token usage, -1650 righe |
| **3. Evaluation suite** | 3-4 ore | Regression testing risposte |
| **4. Citazioni post-hoc** | 2-3 ore | Fragilità catena citazioni (opzionale) |
| **Totale** | **~2-3 giorni** | |

### Impatto finale

| Metrica | Prima | Dopo |
|---|---|---|
| System prompt su Langfuse | 5 separati | 1 unificato |
| Fallback hardcoded nel codice | ~300 righe (5 funzioni) | ~20 righe (1 fallback minimale) |
| Istruzioni citazione | In 4 posti diversi | In 1 posto (system prompt Langfuse) |
| Righe flusso chat | ~3500 | ~1800 |
| `as any` cast | 7 | 0 |
| Race conditions | 1 (critica) | 0 |
| Test risultati | 0 | 15-20 golden queries |
| Iterazione prompt | Modifica Langfuse (già istantaneo) | Stessa velocità, ma 1 prompt invece di 5 |
