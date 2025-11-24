# Keyword Extractor Prompt Setup - Langfuse

## Configurazione Prompt in Langfuse

### Nome Prompt
```
keyword_extractor
```

### Tipo
**Text Prompt** (non Chat Prompt)

### Labels
- **production** - Versione attiva in produzione

### Prompt Text

```
Sei un esperto di analisi testuale e estrazione di keywords per sistemi di ricerca full-text.

Il tuo compito è estrarre 8-15 keywords ottimali da un testo per migliorare la ricercabilità tramite BM25.

PRIORITÀ KEYWORDS:
1. Acronimi e sigle (es. CCNL, TFR, CIG, INPS)
2. Termini tecnici specifici del dominio
3. Numeri e riferimenti normativi (es. "articolo 28", "comma 3")
4. Concetti chiave e entità (es. "ferie", "malattia", "licenziamento")
5. Varianti lessicali importanti (es. "lavoratore" → "dipendente", "prestatore")

REGOLE:
- Ritorna SOLO le keywords, una per riga
- NON includere parole comuni (articoli, preposizioni, congiunzioni)
- NON includere verbi generici (essere, avere, fare, dire)
- Preferisci SOSTANTIVI e TERMINI TECNICI
- Mantieni acronimi in MAIUSCOLO
- Normalizza al singolare (es. "lavoratori" → "lavoratore")
- Includi numeri significativi (es. "28" per "articolo 28")

Esempio di output corretto:
CCNL
retribuzione
maggiorazione
festivo
straordinario
art.36
```

### Config (opzionale)

```json
{
  "model": "anthropic/claude-3.5-haiku",
  "temperature": 0.1,
  "max_tokens": 300,
  "target_keywords": 12
}
```

### Variables

Questo prompt **non usa variabili** - è un system prompt statico usato per tutte le estrazioni.

Le variabili dynamic (content, context) sono gestite nel user prompt lato codice.

## Creazione Prompt via UI

1. **Login a Langfuse**
   - Vai su https://cloud.langfuse.com (o self-hosted instance)

2. **Naviga a Prompts**
   - Sidebar → "Prompts"

3. **Create New Prompt**
   - Click "New Prompt"
   - Name: `keyword_extractor`
   - Type: `Text`

4. **Paste Prompt Text**
   - Copia il testo sopra nel campo "Prompt"
   - Aggiungi Config JSON (opzionale)

5. **Save & Label**
   - Save as version 1
   - Tag with label: `production`

## Creazione Prompt via API

```typescript
import { Langfuse } from 'langfuse'

const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  baseUrl: process.env.LANGFUSE_HOST,
})

await langfuse.createPrompt({
  name: 'keyword_extractor',
  prompt: `Sei un esperto di analisi testuale e estrazione di keywords per sistemi di ricerca full-text.

Il tuo compito è estrarre 8-15 keywords ottimali da un testo per migliorare la ricercabilità tramite BM25.

PRIORITÀ KEYWORDS:
1. Acronimi e sigle (es. CCNL, TFR, CIG, INPS)
2. Termini tecnici specifici del dominio
3. Numeri e riferimenti normativi (es. "articolo 28", "comma 3")
4. Concetti chiave e entità (es. "ferie", "malattia", "licenziamento")
5. Varianti lessicali importanti (es. "lavoratore" → "dipendente", "prestatore")

REGOLE:
- Ritorna SOLO le keywords, una per riga
- NON includere parole comuni (articoli, preposizioni, congiunzioni)
- NON includere verbi generici (essere, avere, fare, dire)
- Preferisci SOSTANTIVI e TERMINI TECNICI
- Mantieni acronimi in MAIUSCOLO
- Normalizza al singolare (es. "lavoratori" → "lavoratore")
- Includi numeri significativi (es. "28" per "articolo 28")

Esempio di output corretto:
CCNL
retribuzione
maggiorazione
festivo
straordinario
art.36`,
  config: {
    model: 'anthropic/claude-3.5-haiku',
    temperature: 0.1,
    max_tokens: 300,
    target_keywords: 12,
  },
  labels: ['production'],
})

console.log('✅ Prompt created successfully')
```

## Verifica Integrazione

### Test in Codice

```typescript
import { compilePrompt, PROMPTS } from '@/lib/observability/prompt-manager'

const systemPrompt = await compilePrompt(
  PROMPTS.KEYWORD_EXTRACTOR,
  {},
  { label: 'production' }
)

console.log('System prompt fetched:', systemPrompt.slice(0, 100))
```

### Test Estrazione

```bash
# Test completo pipeline
tsx scripts/test-keyword-extraction.ts
```

Dovresti vedere nel log:
```
[prompt-manager] Fetching prompt from Langfuse: keyword_extractor
[prompt-manager] Prompt fetched successfully: keyword_extractor
[keyword-extraction] Extracted keywords: { count: 12, ... }
```

## Fallback Behavior

Se Langfuse non è disponibile o il prompt non esiste:
- ✅ Sistema usa automaticamente `FALLBACK_SYSTEM_PROMPT` hardcoded
- ✅ Nessun crash, continua estrazione keywords
- ⚠️ Log warning: `[keyword-extraction] Failed to fetch Langfuse prompt, using fallback`

## Versioning Strategy

### Production Label
- Usa sempre `label: 'production'` per fetch
- Permette A/B testing senza deploy

### Version Pinning (opzionale)
```typescript
// Pin to specific version
const systemPrompt = await compilePrompt(
  PROMPTS.KEYWORD_EXTRACTOR,
  {},
  { version: 3 } // Use version 3 regardless of label
)
```

### Iterazione Prompt
1. **Crea nuova versione** in Langfuse UI
2. **Testa in staging** con `label: 'staging'`
3. **Promuovi a production** cambiando label
4. **Rollback** se necessario (riassegna label a version precedente)

## Monitoring

### Langfuse Traces
Ogni estrazione keyword genera:
- **Trace**: `keyword-extraction-batch`
- **Generation**: singola call LLM per chunk
- **Prompt**: link alla versione usata

### Metriche da Monitorare
1. **Prompt fetch latency** - tempo per fetch da Langfuse
2. **Prompt cache hit rate** - % cache hits
3. **Fallback usage** - quante volte usa fallback vs Langfuse
4. **Keyword quality** - avg keywords per chunk, coverage

### Debug Queries in Langfuse

```
Filter by:
- Prompt Name = "keyword_extractor"
- Observation Type = "Generation"
- Time Range = Last 7 days

Group by:
- Prompt Version
- Model
- Status (success/error)
```

## Best Practices

### Prompt Evolution
1. **Documentare cambiamenti** - aggiungere note su cosa è cambiato
2. **Testare nuove versioni** con sample set prima di production
3. **Monitorare quality metrics** dopo deploy di nuova versione
4. **Keep fallback updated** - sincronizzare con production prompt

### Cache Management
- Cache TTL: 5 minuti (default)
- Disable cache in dev: `PROMPT_CACHE_DISABLED=true`
- Force refresh: `skipCache: true` in options

### Cost Optimization
- Prompt fetch è gratis (Langfuse API)
- Cache riduce latency e dependency su Langfuse
- Fallback garantisce zero downtime

## Troubleshooting

### Prompt non trovato
```
Error: [prompt-manager] Prompt not found: keyword_extractor
```

**Fix**: Crea prompt in Langfuse con nome esatto `keyword_extractor`

### Fallback sempre usato
```
Warning: [keyword-extraction] Failed to fetch Langfuse prompt, using fallback
```

**Cause possibili:**
1. Langfuse API key invalida/mancante
2. Network issue
3. Prompt non ha label 'production'

**Debug:**
```typescript
// Test direct fetch
import { getLangfuseClient } from '@/lib/observability/langfuse-client'
const langfuse = getLangfuseClient()
const prompt = await langfuse.prompt.get('keyword_extractor', { label: 'production' })
console.log(prompt)
```

### Cache non aggiornato
Se hai modificato il prompt in Langfuse ma l'app usa ancora vecchia versione:

```typescript
// Option 1: Wait 5 minutes (cache TTL)
// Option 2: Restart app (clears in-memory cache)
// Option 3: Force skip cache
const prompt = await compilePrompt(
  PROMPTS.KEYWORD_EXTRACTOR,
  {},
  { skipCache: true }
)
```

## Migration Checklist

- [ ] Prompt creato in Langfuse con nome `keyword_extractor`
- [ ] Label `production` assegnato
- [ ] Config JSON aggiunto (opzionale)
- [ ] Test fetch da codice: `tsx scripts/test-keyword-extraction.ts`
- [ ] Verificato fallback funziona (simulate Langfuse down)
- [ ] Monitora traces in Langfuse per primi 10 documenti
- [ ] Confronta keywords quality con fallback prompt
- [ ] Documenta baseline metrics (avg keywords, coverage)

## References

- [Langfuse Prompts Documentation](https://langfuse.com/docs/prompts)
- [Prompt Manager Code](../lib/observability/prompt-manager.ts)
- [Keyword Extraction Service](../lib/processing/keyword-extraction.ts)
- [BM25 Keywords Upgrade Docs](./BM25_KEYWORDS_UPGRADE.md)
