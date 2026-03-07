# Piano di Migrazione: Mastra → Vercel AI SDK

> **Obiettivo:** Sostituire Mastra con Vercel AI SDK per eliminare la race condition del module-level cache, ottenere type safety, token usage tracking, e ridurre ~1500 righe di glue code.

## Principi Guida

- **Sostituire il plumbing, non la logica** — query analysis, search, caching, citations restano intatti
- **Una fase alla volta** — ogni fase produce codice funzionante e deployabile
- **Zero downtime** — nessuna fase richiede migration del database

---

## Fase 0: Setup Dipendenze

**Tempo stimato:** 30 minuti

### 0.1 Installa Vercel AI SDK

```bash
npm install ai @ai-sdk/openai
```

> Nota: `@ai-sdk/openai` è il provider che supporta anche OpenRouter passando un `baseURL` custom. Non serve un pacchetto `@ai-sdk/openrouter` separato.

### 0.2 Rimuovi dipendenza Mastra (solo alla fine della Fase 2)

```bash
npm uninstall @mastra/core
```

### 0.3 Fix sicurezza immediati (indipendenti dalla migrazione)

Questi fix vanno fatti subito, prima di qualsiasi migrazione:

#### CORS — `next.config.js`
```diff
- { key: 'Access-Control-Allow-Origin', value: '*' },
+ { key: 'Access-Control-Allow-Origin', value: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000' },
```

#### Auth sulle API routes — creare un helper riutilizzabile

Creare `lib/auth/require-user.ts`:
```typescript
import { createServerSupabaseClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function requireUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  
  return { user, error: null }
}
```

Aggiungere `requireUser()` a: `/api/documents/route.ts`, `/api/upload/process/route.ts`, `/api/settings/route.ts`, `/api/diagnostics/*`.

---

## Fase 1: Nuova Chat Route con AI SDK

**Tempo stimato:** 4-6 ore  
**File coinvolti:** 3 nuovi, 1 modificato

Questa è la fase centrale. Si crea una nuova route che usa AI SDK al posto di Mastra, mantenendo tutta la logica RAG esistente.

### 1.1 Creare il provider OpenRouter per AI SDK

**[NEW] `lib/ai/provider.ts`**

```typescript
import { createOpenAI } from '@ai-sdk/openai'

export const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})
```

### 1.2 Creare le definizioni dei tool con Zod

**[NEW] `lib/ai/tools.ts`**

Estrai la logica dai tool di Mastra in funzioni pure, poi wrappa con `tool()` di AI SDK:

```typescript
import { tool } from 'ai'
import { z } from 'zod'

export const webSearchTool = tool({
  description: 'Cerca informazioni sul web...',
  parameters: z.object({
    query: z.string().describe('Query di ricerca web'),
  }),
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
      query: results.query,
    }
  },
})

export const metaQueryTool = tool({
  description: 'Ottieni informazioni sul database...',
  parameters: z.object({
    query: z.string().describe('Query meta sul database'),
  }),
  execute: async ({ query }) => {
    // Estrai la logica da agent.ts metaQueryTool (lines 258-712)
    // in una funzione pura lib/ai/handlers/meta-query-handler.ts
    const { handleMetaQuery } = await import('@/lib/ai/handlers/meta-query-handler')
    return handleMetaQuery(query)
  },
})
```

### 1.3 Estrarre la business logic del metaQueryTool

**[NEW] `lib/ai/handlers/meta-query-handler.ts`**

Spostare le 450 righe di logica da `agent.ts:metaQueryTool` in una funzione pura `handleMetaQuery(query)` → `MetaQueryResult`. Questa funzione:
- Non dipende da Mastra
- Non scrive in `toolResultsCache` (non serve più — AI SDK espone i tool results nel response)
- Ritorna un tipo strutturato
- È testabile in isolamento

### 1.4 Creare la nuova chat route

**[MODIFY] `app/api/chat/route.ts`**

Riscrittura della route usando `streamText()`. La struttura:

```typescript
import { streamText } from 'ai'
import { openrouter } from '@/lib/ai/provider'
import { webSearchTool, metaQueryTool } from '@/lib/ai/tools'
// ... import degli step RAG esistenti (invariati)

export const maxDuration = 60

export async function POST(req: Request) {
  const { messages, conversationId, webSearchEnabled, skipCache } = await req.json()
  const lastMessage = messages[messages.length - 1].content
  
  // Auth
  const { user, error: authError } = await requireUser()
  if (authError) return authError

  // STEP 1-4: Identici a ora (analyze, enhance, cache, search)
  const history = await getConversationHistory(conversationId)
  saveUserMessageAsync(conversationId, lastMessage)
  const analysis = await analyzeQuery(lastMessage)
  const enhancement = await enhanceQueryIfNeeded(lastMessage, analysis, history)
  const queryEmbedding = await generateEmbedding(enhancement.enhanced)
  
  // Cache check
  const cached = await lookupCache(enhancement.enhanced, queryEmbedding, skipCache)
  if (cached.cached) {
    // Ritorna risposta cached (non-streaming)
    return Response.json({ role: 'assistant', content: cached.response, sources: cached.sources })
  }
  
  // Search
  const searchResults = await performSearch(enhancement.enhanced, queryEmbedding, analysis)
  const context = buildContext(searchResults)
  const systemPrompt = await buildSystemPrompt({ context, ... })

  // STEP 5: Genera risposta con AI SDK (sostituisce response-handler + agent.ts)
  const tools = {
    ...(webSearchEnabled ? { web_search: webSearchTool } : {}),
    meta_query: metaQueryTool,
  }

  const result = streamText({
    model: openrouter(analysis.isComparative ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash'),
    system: systemPrompt.text,
    messages,
    tools,
    maxSteps: 3, // Permette tool use + risposta
    onFinish: async ({ text, usage, toolResults }) => {
      // Post-processing (fire-and-forget)
      const processed = processResponse(text, searchResults, toolResults)
      saveAssistantMessageAsync(conversationId, processed.content, {
        sources: processed.sources,
        model: analysis.isComparative ? 'gemini-2.5-pro' : 'gemini-2.5-flash',
        usage, // Token usage reale!
      })
      saveCache(enhancement.enhanced, queryEmbedding, processed.content, processed.sources)
    },
  })

  return result.toDataStreamResponse()
}
```

### Cosa cambia rispetto a ora

| Componente | Prima | Dopo |
|---|---|---|
| Streaming | `StreamController` custom (196 righe) | `result.toDataStreamResponse()` (1 riga) |
| Tool results | `toolResultsCache` globale | `toolResults` nel callback `onFinish` |
| Agent creation | `getRagAgentForModel()` con cache dinamica | `openrouter('model-name')` inline |
| Token usage | `undefined` (Mastra non lo espone) | `usage` oggetto con `promptTokens`, `completionTokens` |
| Type safety | 7× `as any` | Tipi nativi Zod |
| Race condition | ✅ Presente | ❌ Eliminata |

---

## Fase 2: Aggiornamento Frontend

**Tempo stimato:** 2-3 ore  
**File coinvolti:** componenti chat

### 2.1 Installare `@ai-sdk/react`

```bash
npm install @ai-sdk/react
```

### 2.2 Migrare il client chat a `useChat`

Il client attualmente fa parsing manuale degli eventi SSE. Con `useChat` di AI SDK:

```typescript
import { useChat } from '@ai-sdk/react'

export function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: '/api/chat',
    body: { webSearchEnabled, skipCache }, // Parametri extra
  })

  return (
    // UI identica, ma usa messages direttamente
    // Niente parsing SSE manuale
  )
}
```

### 2.3 Adattare le sources/citations al nuovo formato

AI SDK usa un formato stream diverso (`data stream protocol`). Le sources devono essere inviate come `data` annotations:

```typescript
// Nel server
const result = streamText({ ... })
return result.toDataStreamResponse({
  getErrorMessage: (error) => error.message,
})
```

Per inviare sources come metadata, usare `StreamData`:

```typescript
import { StreamData } from 'ai'

const data = new StreamData()
// Dopo il completamento
data.append({ sources: allSources, model: modelName })
data.close()

return result.toDataStreamResponse({ data })
```

---

## Fase 3: Cleanup

**Tempo stimato:** 1-2 ore

### 3.1 Rimuovere file obsoleti

```
DELETE  app/api/chat/handlers/stream-handler.ts      (196 righe)
DELETE  app/api/chat/handlers/response-handler.ts     (466 righe)
DELETE  lib/mastra/agent.ts                           (888 righe)
DELETE  lib/mastra/workflows/                         (directory)
DELETE  lib/async/message-operations.ts               (107 righe — logica spostata in onFinish)
```

**Totale rimosso:** ~1657 righe

### 3.2 File da tenere (invariati)

```
KEEP  app/api/chat/handlers/cache-handler.ts         ✅
KEEP  app/api/chat/handlers/search-handler.ts        ✅
KEEP  app/api/chat/services/context-builder.ts       ✅
KEEP  app/api/chat/services/message-service.ts       ✅
KEEP  app/api/chat/services/source-service.ts        ✅
KEEP  lib/services/citation-service.ts               ✅
KEEP  lib/llm/system-prompt.ts                       ✅ (semplificabile dopo)
KEEP  lib/embeddings/*                               ✅
KEEP  lib/supabase/*                                 ✅
KEEP  lib/processing/*                               ✅
KEEP  lib/observability/*                            ✅
```

### 3.3 Rimuovere dipendenza Mastra

```bash
npm uninstall @mastra/core
```

### 3.4 Pulire file spazzatura dal root

```bash
rm "1762893525394-lf-traces-export-cmhqipufy0001ad066142xvb6.json"
rm "how 8ac6625 --format=-H-n-h-n-an-n-ad-n-s --date=format-Y--m--d -H-M-S --no-patch"
rm "chatbotcollectibus"  # file misterioso nel root
```

### 3.5 Aggiornare `next.config.js`

Rimuovere la configurazione webpack per tiktoken se non più necessaria dopo la rimozione di Mastra (verificare se `@dqbd/tiktoken` è usato direttamente altrove).

---

## Fase 4: Miglioramenti Post-Migrazione (Opzionale)

**Tempo stimato:** 2-3 ore

### 4.1 Semplificare il system prompt
Ridurre `system-prompt.ts` da 461 righe a ~150 righe con un unico template che inserisce sezioni dinamiche. Le 5 funzioni `buildFallback*` sono ridondanti.

### 4.2 Logger strutturato
Sostituire i ~100 `console.log` con un logger (es. `pino`) con livelli e prefissi automatici.

### 4.3 Rate limiting
Aggiungere rate limiting alla route `/api/chat` (es. `@upstash/ratelimit` con Redis, o un semplice in-memory limiter).

### 4.4 Langfuse con AI SDK telemetry
AI SDK supporta `experimental_telemetry` nativo:
```typescript
streamText({
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'chat-response',
  },
})
```

Questo integra automaticamente con Langfuse senza span/generation manuali.

---

## Riepilogo Impatto

| Metrica | Prima | Dopo |
|---|---|---|
| Righe totali flusso chat | ~3500 | ~1800 |
| Righe rimosse | — | ~1650 |
| Righe nuove | — | ~300 |
| Dipendenze framework | `@mastra/core` | `ai`, `@ai-sdk/openai`, `@ai-sdk/react` |
| `as any` cast | 7 | 0 |
| Race conditions | 1 (critica) | 0 |
| Token usage tracking | ❌ | ✅ |
| Type safety tools | ❌ | ✅ (Zod) |
| Fasi deployabili | — | 4 |

## Ordine di Esecuzione

```
Fase 0 (30 min)  → Fix sicurezza + install deps
Fase 1 (4-6 ore) → Nuova route con AI SDK [deploy intermedio possibile]
Fase 2 (2-3 ore) → Frontend con useChat
Fase 3 (1-2 ore) → Cleanup file obsoleti + uninstall Mastra
Fase 4 (opzionale) → Miglioramenti post-migrazione
```

**Tempo totale stimato: 1-2 giorni di lavoro**
