# Cache Control System

Il sistema di chat RAG utilizza diversi livelli di cache per ottimizzare le performance e ridurre i costi delle API. È ora possibile disabilitare selettivamente questi sistemi di cache tramite variabili d'ambiente.

## Tipi di Cache Disponibili

### 1. Conversation Cache (`DISABLE_CONVERSATION_CACHE`)
- **Cosa fa**: Cache semantica delle risposte complete alle conversazioni
- **Quando usare la disabilitazione**: 
  - Durante il debugging di problemi di generazione delle risposte
  - Quando si vogliono sempre risposte fresche
  - Per testing di nuovi prompt o modelli
- **Impatto**: Aumento significativo del tempo di risposta e costi API

### 2. Query Analysis Cache (`DISABLE_QUERY_ANALYSIS_CACHE`)
- **Cosa fa**: Cache dell'analisi delle query (intent detection, comparative analysis, article references)
- **Include**: 
  - Rilevamento di query comparative 
  - Identificazione dell'intent semantico
  - Estrazione di riferimenti ad articoli specifici
- **Quando usare la disabilitazione**:
  - Durante lo sviluppo di nuovi tipi di analisi query
  - Per testing di modifiche ai prompt di analisi
  - Debugging di classificazioni errate delle query
- **Impatto**: Aumento dei costi LLM per l'analisi delle query

### 3. Enhancement Cache (`DISABLE_ENHANCEMENT_CACHE`)
- **Cosa fa**: Cache delle decisioni e risultati dell'enhancement delle query
- **Quando usare la disabilitazione**:
  - Durante il tuning dei prompt di enhancement
  - Testing di nuove strategie di espansione delle query
  - Debugging di query enhancement inappropriati
- **Impatto**: Aumento dei costi LLM per l'enhancement delle query

## Configurazione

Aggiungi le variabili d'ambiente desiderate al tuo file `.env.local`:

```bash
# Disabilita la cache delle conversazioni (risposte complete)
DISABLE_CONVERSATION_CACHE=true

# Disabilita la cache dell'analisi delle query
DISABLE_QUERY_ANALYSIS_CACHE=true

# Disabilita la cache dell'enhancement delle query  
DISABLE_ENHANCEMENT_CACHE=true
```

## Esempi di Utilizzo

### Development/Debug Mode
```bash
# Disabilita tutte le cache per sviluppo
DISABLE_CONVERSATION_CACHE=true
DISABLE_QUERY_ANALYSIS_CACHE=true
DISABLE_ENHANCEMENT_CACHE=true
```

### Performance Testing
```bash
# Mantieni solo la cache delle conversazioni per testare le performance del RAG
DISABLE_CONVERSATION_CACHE=false
DISABLE_QUERY_ANALYSIS_CACHE=true
DISABLE_ENHANCEMENT_CACHE=true
```

### Production con Cache Selettiva
```bash
# Disabilita solo la cache delle conversazioni per avere sempre risposte fresche
# ma mantieni le cache delle analisi per ridurre i costi
DISABLE_CONVERSATION_CACHE=true
DISABLE_QUERY_ANALYSIS_CACHE=false
DISABLE_ENHANCEMENT_CACHE=false
```

## Comportamento

- **Default**: Tutte le cache sono **abilitate** se le variabili non sono impostate
- **Valori validi**: Solo `true` disabilita la cache. Qualsiasi altro valore (incluso `false`, `0`, stringa vuota) mantiene la cache abilitata
- **Logging**: Quando una cache è disabilitata, viene loggato un messaggio di debug nel formato `[cache-type] Cache disabled via DISABLE_*_CACHE`
- **Fallback sicuro**: In caso di errori nella configurazione, le cache rimangono abilitate per default

## Monitoraggio

I log del sistema indicheranno quando le cache sono disabilitate:

```
[cache-handler] Cache disabled via DISABLE_CONVERSATION_CACHE
[query-analysis-cache] Cache disabled via DISABLE_QUERY_ANALYSIS_CACHE  
[enhancement-cache] Cache disabled via DISABLE_ENHANCEMENT_CACHE
[comparative-cache] Cache disabled via DISABLE_QUERY_ANALYSIS_CACHE
```

## Considerazioni per la Produzione

⚠️ **Attenzione**: Disabilitare le cache in produzione può portare a:

- Aumento significativo dei costi API (OpenRouter, OpenAI)
- Maggiore latenza nelle risposte
- Maggiore carico sul database Supabase
- Possibili timeout per query complesse

Usa queste opzioni principalmente per:
- Environment di sviluppo e test
- Debugging di problemi specifici
- Tuning temporaneo del sistema

## Test

Per verificare che la configurazione funzioni correttamente:

```bash
npx tsx scripts/test-cache-control.ts
```

Questo script testerà tutti i scenari di configurazione e confermerà che le variabili d'ambiente vengano interpretate correttamente.