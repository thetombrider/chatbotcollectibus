# Langfuse Prompt Management

Questo progetto utilizza **Langfuse Prompt Management** per gestire i prompt in modo centralizzato, versionato e facile da mantenere.

## Vantaggi

- ✅ **Versionamento**: Ogni modifica ai prompt viene versionata automaticamente
- ✅ **Gestione centralizzata**: Modifica i prompt dalla UI di Langfuse senza rifare deploy
- ✅ **A/B Testing**: Testa diverse versioni dei prompt con labels (production, staging, etc.)
- ✅ **Rollback facile**: Torna a versioni precedenti con un click
- ✅ **Caching**: I prompt sono cachati lato client per performance ottimali
- ✅ **Fallback**: Se Langfuse non è disponibile, usa prompt hard-coded

## Configurazione

### 1. Variabili d'ambiente

Aggiungi al tuo `.env.local`:

```bash
# Langfuse Configuration
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # EU region
# LANGFUSE_BASE_URL=https://us.cloud.langfuse.com  # US region (se necessario)

# Optional: Prompt cache TTL (default: 5 minutes)
PROMPT_CACHE_TTL_MS=300000
```

**Come ottenere le chiavi:**
1. Vai su [Langfuse Cloud](https://cloud.langfuse.com) e crea un account
2. Crea un nuovo progetto
3. Vai in **Settings** → **API Keys**
4. Crea una nuova API key e copia `Public Key` e `Secret Key`

### 2. Crea i prompt su Langfuse

Esegui lo script per creare tutti i prompt:

```bash
npm run setup-prompts
# oppure
tsx scripts/setup-langfuse-prompts.ts
```

Questo creerà i seguenti prompt con label `production`:

- `system-rag-with-context` - Prompt per query con contesto
- `system-rag-comparative` - Prompt per query comparative
- `system-meta-query` - Prompt per query meta (database)
- `system-rag-no-context-web` - Prompt senza contesto + web search
- `system-rag-no-context` - Prompt senza contesto
- `query-analysis` - Prompt per analisi query
- `query-expansion` - Prompt per espansione query

### 3. Verifica su Langfuse UI

1. Vai su [Langfuse Cloud](https://cloud.langfuse.com)
2. Seleziona il tuo progetto
3. Vai in **Prompts** nella sidebar
4. Dovresti vedere tutti i prompt creati con label `production`

## Utilizzo

### Usare i prompt nel codice

I prompt vengono automaticamente fetchati da Langfuse quando necessario:

```typescript
import { PROMPTS, compilePrompt } from '@/lib/observability/prompt-manager'

// Compila un prompt con variabili
const systemPrompt = await compilePrompt(
  PROMPTS.SYSTEM_RAG_WITH_CONTEXT,
  {
    context: '...',
    documentCount: 5,
    webSearchInstruction: '...',
    // ... altre variabili
  },
  {
    fallback: 'Fallback prompt if Langfuse fails...'
  }
)
```

### Modificare i prompt

**Opzione 1: Via UI (consigliato)**
1. Vai su Langfuse → Prompts
2. Seleziona il prompt da modificare
3. Clicca **New Version**
4. Modifica il prompt
5. Salva con label `production` per usarlo immediatamente

**Opzione 2: Via script**
1. Modifica il file `scripts/setup-langfuse-prompts.ts`
2. Riesegui lo script con `tsx scripts/setup-langfuse-prompts.ts`
3. Verrà creata una nuova versione del prompt

### Gestione versioni e labels

Langfuse supporta:
- **Versions**: Auto-incrementate ad ogni modifica (1, 2, 3, ...)
- **Labels**: Tag personalizzati per ambienti o esperimenti
  - `production` - Versione in produzione (default)
  - `staging` - Versione di staging
  - `experiment-a`, `experiment-b` - Per A/B testing
  - Qualsiasi altro label custom

**Esempio: Fetch versione specifica**
```typescript
const prompt = await getPrompt('system-rag-with-context', {
  version: 3  // Usa versione 3
})

const prompt = await getPrompt('system-rag-with-context', {
  label: 'staging'  // Usa versione con label staging
})
```

### A/B Testing

Per testare due varianti di un prompt:

1. Crea due versioni del prompt su Langfuse
2. Assegna label `prod-a` e `prod-b`
3. Nel codice, scegli random quale usare:

```typescript
const label = Math.random() < 0.5 ? 'prod-a' : 'prod-b'
const prompt = await compilePrompt(
  PROMPTS.SYSTEM_RAG_WITH_CONTEXT,
  variables,
  { label }
)
```

4. Monitora le performance su Langfuse per vedere quale performa meglio

## Prompt Registry

I nomi dei prompt sono centralizzati in `lib/observability/prompt-manager.ts`:

```typescript
export const PROMPTS = {
  SYSTEM_RAG_WITH_CONTEXT: 'system-rag-with-context',
  SYSTEM_RAG_COMPARATIVE: 'system-rag-comparative',
  SYSTEM_META_QUERY: 'system-meta-query',
  SYSTEM_RAG_NO_CONTEXT_WEB: 'system-rag-no-context-web',
  SYSTEM_RAG_NO_CONTEXT: 'system-rag-no-context',
  QUERY_ANALYSIS: 'query-analysis',
  QUERY_EXPANSION: 'query-expansion',
} as const
```

Usa sempre `PROMPTS.*` invece di stringhe hard-coded per evitare typo.

## Caching

I prompt sono automaticamente cachati in-memory per 5 minuti (configurabile).

**Clear cache manualmente:**
```typescript
import { clearPromptCache } from '@/lib/observability/prompt-manager'

clearPromptCache()  // Rimuove tutti i prompt dalla cache
```

**Vedere statistiche cache:**
```typescript
import { getCacheStats } from '@/lib/observability/prompt-manager'

const stats = getCacheStats()
console.log('Cache size:', stats.size)
console.log('Entries:', stats.entries)
```

## Fallback System

Se Langfuse non è disponibile (network error, API down, etc.), il sistema usa automaticamente i prompt hard-coded come fallback.

Questo garantisce che l'applicazione continui a funzionare anche se Langfuse è offline.

## Monitoring

Su Langfuse puoi monitorare:
- **Usage**: Quante volte ogni prompt viene fetchato
- **Versions**: Storico delle modifiche
- **Performance**: Metriche delle generazioni che usano quel prompt

Vai su **Prompts** → Seleziona prompt → **Metrics** per vedere le statistiche.

## Troubleshooting

### "Prompt not found"
- Verifica che il prompt esista su Langfuse
- Verifica che abbia la label corretta (default: `production`)
- Esegui di nuovo lo script `setup-langfuse-prompts.ts`

### "Langfuse connection error"
- Verifica che le variabili d'ambiente siano corrette
- Verifica che `LANGFUSE_BASE_URL` punti al region corretto
- Controlla che le API keys siano valide e non scadute

### "Cache not working"
- Il cache è in-memory e viene resettato ad ogni restart del server
- Verifica `PROMPT_CACHE_TTL_MS` nel `.env.local`

## Best Practices

1. ✅ **Usa sempre label `production`** per i prompt in produzione
2. ✅ **Testa le modifiche con label diversa** (es. `staging`) prima di promuovere a `production`
3. ✅ **Aggiungi commit message** quando crei nuove versioni su Langfuse
4. ✅ **Non modificare i prompt hard-coded** - sono solo fallback
5. ✅ **Monitora le performance** dei prompt su Langfuse
6. ✅ **Usa variabili** invece di hard-codare valori nei prompt

## Risorse

- [Langfuse Docs](https://langfuse.com/docs/prompt-management)
- [Langfuse Cloud](https://cloud.langfuse.com)
- [Langfuse GitHub](https://github.com/langfuse/langfuse)

