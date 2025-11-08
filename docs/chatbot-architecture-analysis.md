# Analisi Architetturale RAG Chatbot - Consulting Knowledge Base

**Data**: 2025-11-08  
**Versione**: 1.0  
**Obiettivo**: Analisi completa dell'implementazione corrente e proposta di architettura target modulare e scalabile

---

## Executive Summary

Il chatbot RAG è un sistema complesso che integra Next.js 14, Mastra, Supabase, OpenAI embeddings e OpenRouter LLM per fornire risposte contestualizzate da una knowledge base di 40GB+. L'analisi evidenzia un'architettura funzionale ma con diverse criticità che limitano la scalabilità, l'osservabilità e la manutenibilità del sistema.

**Criticità principali identificate**:
- **Monoliticità dell'API route principale** (1035 linee)
- **Sistemi di caching frammentati** (3 cache separate non coordinate)
- **Mancanza di observability** (no tracing, no metrics centralizzate)
- **Coupling forte tra componenti** (difficile testare e modificare)
- **Gestione ridondante delle citazioni** (logica duplicata in più punti)

**Architettura target proposta**:
- **Modularizzazione completa** con pattern pipeline
- **Observability integrata** (Langfuse via Mastra)
- **Cache unificata** con invalidazione coordinata
- **Separazione dei concern** (query processing, retrieval, generation)
- **Testabilità** (dependency injection, interfaces)

---

## 1. Flusso Attuale: Dalla Domanda alla Risposta

### 1.1 Panoramica del Flusso

```
USER INPUT → Frontend (useChat) → API Route (/api/chat) → Processing Pipeline → LLM Response → Frontend Display
```

### 1.2 Step Dettagliato

#### **STEP 0: Frontend Input**
- **Componente**: `useChat` hook, `ChatInput`, `PromptInputBox`
- **Azioni**:
  - User digita messaggio
  - Opzionale: attiva web search toggle
  - Invia richiesta POST a `/api/chat`
  - Inizia a ricevere stream SSE (Server-Sent Events)

#### **STEP 1: Salvataggio Messaggio Utente**
- **File**: `app/api/chat/route.ts` (righe 184-213)
- **Azioni**:
  - Salva messaggio utente in `messages` table
  - Se primo messaggio: aggiorna titolo conversazione
  - Recupera ultimi 10 messaggi per history conversazionale

#### **STEP 2: Analisi Query Unificata**
- **File**: `lib/embeddings/query-analysis.ts`
- **Azioni**:
  - **Cache lookup** in `query_analysis_cache` table
  - Se cache miss: chiama LLM (Gemini 2.5 Flash)
  - Rileva in UNA SOLA chiamata LLM:
    - **Intent semantico** (comparison, definition, requirements, procedure, article_lookup, meta, timeline, causes_effects, general)
    - **Query comparativa** (isComparative + comparativeTerms)
    - **Query meta** (isMeta + metaType: stats/list/folders/structure)
    - **Riferimenti articoli** (articleNumber tramite regex + LLM validation)
  - Salva risultato in cache (TTL: 7 giorni)

#### **STEP 3: Query Enhancement**
- **File**: `lib/embeddings/query-enhancement.ts`
- **Azioni**:
  - **Cache lookup** in `query_enhancement_cache` table
  - Usa il risultato dell'analisi dello step 2 (no duplicate LLM call)
  - Espande query in base all'intent rilevato:
    - **Article lookup**: aggiunge varianti articolo (art. 28, Articolo 28, Article 28, ecc.)
    - **Comparison**: espande ogni termine separatamente (GDPR → "GDPR General Data Protection Regulation protezione dati...")
    - **Other intents**: usa strategy intent-based con termini specifici
  - Salva risultato in cache (TTL: 7 giorni)

#### **STEP 4: Semantic Cache Lookup**
- **File**: `lib/supabase/semantic-cache.ts`
- **Azioni**:
  - Genera embedding della query enhanced (OpenAI text-embedding-3-large)
  - Cerca risposta cached in `query_cache` tramite vector similarity
  - Threshold: 0.95 (molto alto per evitare falsi positivi)
  - Se cache hit:
    - Aggiorna hit_count
    - Processa citazioni per rinumerarle correttamente
    - Invia risposta cached e termina

#### **STEP 5: Vector Search & Routing**
- **File**: `app/api/chat/route.ts` (righe 399-431), `lib/supabase/vector-operations.ts`
- **Azioni**:
  - **Routing basato su intent**:
    
    **A) Query Comparativa** (es. "confronta GDPR e ESPR"):
    - Esegue **multi-query search** (funzione `performMultiQuerySearch`)
    - Per ogni termine (es. GDPR, ESPR):
      - Genera embedding specifico per quel termine
      - Esegue hybrid search (vector + text)
      - Recupera top 8 risultati per termine
    - Combina risultati, deduplica, ordina per similarity
    - Top 15 risultati finali
    
    **B) Query con Articolo** (es. "articolo 28 GDPR"):
    - Esegue hybrid search normale
    - **Filtra chunks per articleNumber** nel metadata
    - Threshold similarity abbassata (0.1 invece di 0.4) perché filtro è esplicito
    
    **C) Query Normale**:
    - Esegue hybrid search normale
    - Top 10 risultati, threshold 0.3, vector_weight 0.7

  - **Hybrid Search** (RPC function in Postgres):
    - Combina vector similarity (cosine distance) + full-text search (tsvector)
    - Formula: `(vector_score * vector_weight) + (text_score * (1 - vector_weight))`
    - Indici usati: HNSW per vector, GIN per full-text
  
  - **Filtering & Relevance**:
    - Filtra risultati con similarity >= threshold (0.4 standard, 0.1 per articoli)
    - Calcola average similarity
    - Determina se fonti sono sufficienti: `avgSimilarity >= 0.5`

#### **STEP 6: Costruzione Contesto & System Prompt**
- **File**: `lib/llm/system-prompt.ts`
- **Azioni**:
  - Costruisce system prompt dinamico in base a:
    - Presenza di documenti rilevanti
    - Query comparativa vs normale
    - Articolo specifico richiesto
    - Web search abilitata + fonti insufficienti
  - Formatta contesto con numerazione: `[Documento 1: filename.pdf]\ncontent...\n\n[Documento 2: ...]`
  - Aggiunge istruzioni per citazioni: `[cit:N]` per KB, `[web:N]` per web
  - Aggiunge istruzioni per meta queries se necessario

#### **STEP 7: Generazione Risposta LLM con Tools**
- **File**: `lib/mastra/agent.ts`, `app/api/chat/route.ts` (righe 531-677)
- **Azioni**:
  - **Mastra Agent** con OpenRouter (Gemini 2.5 Flash)
  - **Tools disponibili**:
    1. **vector_search**: Cerca documenti (disabilitato se context già presente)
    2. **semantic_cache**: Verifica cache (disabilitato, già fatto in step 4)
    3. **web_search** (Tavily): Solo se web search enabled + fonti insufficienti
    4. **meta_query**: Solo se query è meta (stats, list, folders, structure)
  
  - **Streaming**:
    - Modalità `ragAgent.stream(messages, options)` per risposta in tempo reale
    - Fallback a `ragAgent.generate()` se stream fallisce
    - Ogni chunk di testo inviato via SSE al frontend
  
  - **Tool Execution Context**:
    - Se LLM chiama `web_search`: risultati salvati in `webSearchResultsContext` Map
    - Se LLM chiama `meta_query`: documenti salvati in `metaQueryDocumentsContext` Map
    - Context recuperato dopo generazione per processare citazioni

#### **STEP 8: Post-Processing Risposta**
- **File**: `app/api/chat/route.ts` (righe 685-920)
- **Azioni**:
  1. **Normalizzazione citazioni web**: rimuove formati errati
  2. **Estrazione indici citati**: regex per trovare `[cit:N]` e `[web:N]`
  3. **Matching sources con citazioni**:
     - Per query normali: filtra sources per includere solo quelle citate
     - Per query meta: usa documenti dal context (no matching, già completo)
  4. **Rinumerazione citazioni**: da N originali a 1,2,3... sequenziali
  5. **Mappatura indici**: crea mapping oldIndex → newIndex
  6. **Sostituzione nel testo**: replace di tutte le citazioni con nuovi indici
  7. **Combinazione sources**: KB sources + web sources in array unico

#### **STEP 9: Salvataggio e Caching**
- **File**: `app/api/chat/route.ts` (righe 922-1002)
- **Azioni**:
  - Salva messaggio assistant in `messages` table con:
    - `content`: testo con citazioni rinumerate
    - `metadata.sources`: array completo di sources (KB + web)
    - `metadata.chunks_used`: chunk IDs e similarity scores
    - `metadata.query_enhanced`: flag se query era stata enhanced
  - Salva in semantic cache per future queries simili
  - Pulisce context (web search results, meta query documents)

#### **STEP 10: Invio Risposta al Frontend**
- **Azioni**:
  - Invia `text_complete` con testo rinumerato completo
  - Invia `done` con array di sources (KB + web)
  - Frontend sostituisce contenuto streamato con quello rinumerato
  - Frontend renderizza citazioni come componenti interattivi

---

## 2. Componenti e Tools del Sistema

### 2.1 Core Pipeline Components

| Componente | File | Responsabilità | Dipendenze |
|------------|------|----------------|------------|
| **API Route** | `app/api/chat/route.ts` | Orchestrazione completa del flusso | Tutti i moduli |
| **Query Analyzer** | `lib/embeddings/query-analysis.ts` | Analisi intenti e tipi di query | OpenRouter LLM, Supabase |
| **Query Enhancer** | `lib/embeddings/query-enhancement.ts` | Espansione query intent-based | Analyzer, OpenRouter, Supabase |
| **Intent Expander** | `lib/embeddings/intent-based-expansion.ts` | Strategy pattern per espansione | OpenRouter LLM |
| **Vector Search** | `lib/supabase/vector-operations.ts` | Hybrid search (vector + text) | Supabase, pgvector |
| **Semantic Cache** | `lib/supabase/semantic-cache.ts` | Cache basata su vector similarity | Supabase, pgvector |
| **Mastra Agent** | `lib/mastra/agent.ts` | Orchestrazione LLM + tools | OpenRouter, Tools |
| **System Prompt Builder** | `lib/llm/system-prompt.ts` | Costruzione prompt dinamico | Nessuna |

### 2.2 Tools Utilizzabili da Mastra Agent

#### **Tool 1: vector_search**
- **Funzione**: `vectorSearchTool` in `lib/mastra/agent.ts`
- **Quando usato**: (Attualmente disabilitato quando context è già presente)
- **Azioni**: Genera embedding, esegue hybrid search, restituisce top 5 chunks
- **Formato output**: Array di chunks con content, similarity, documentId, filename

#### **Tool 2: semantic_cache**
- **Funzione**: `semanticCacheTool` in `lib/mastra/agent.ts`
- **Quando usato**: (Attualmente disabilitato, fatto prima dell'agent)
- **Azioni**: Genera embedding, cerca in cache, restituisce risposta se presente
- **Formato output**: `{ cached: true/false, response?: string }`

#### **Tool 3: web_search**
- **Funzione**: `webSearchTool` in `lib/mastra/agent.ts`
- **Quando usato**: Solo se `webSearchEnabled=true` E `sourcesInsufficient=true`
- **Azioni**:
  1. Chiama Tavily API (max 5 risultati)
  2. Salva risultati in `webSearchResultsContext` Map globale
  3. Formatta risultati con indici numerici (1, 2, 3...)
  4. Restituisce array con `citationFormat` instruction per LLM
- **Formato output**: `{ results: [{index, title, url, content}], query, contextKey }`
- **Citazioni**: `[web:N]` dove N è l'indice del risultato

#### **Tool 4: meta_query**
- **Funzione**: `metaQueryTool` in `lib/mastra/agent.ts`
- **Quando usato**: Quando query riguarda il database stesso (non il contenuto)
- **Azioni**:
  1. Usa `analyzeQuery()` per confermare che è meta
  2. Routing in base a `metaType`:
     - **stats**: `getDatabaseStats()` - statistiche generali (count, size, ecc.)
     - **list**: `listDocumentsMeta()` - lista documenti con filtri
     - **folders**: `listFoldersMeta()` + opzionale `getFolderStats()`
     - **structure**: `getDocumentTypesMeta()` - tipi di file
  3. Per liste: salva documenti in `metaQueryDocumentsContext` con indici
- **Formato output**: `{ isMeta, metaType, data, contextKey? }`
- **Esempi query**:
  - "Quanti documenti ci sono?" → stats
  - "Che norme ci sono salvate?" → list
  - "Quali cartelle esistono?" → folders
  - "Che tipi di file ci sono?" → structure

### 2.3 Sistemi di Caching (3 Cache Indipendenti)

#### **Cache 1: Semantic Cache**
- **Tabella**: `query_cache`
- **Chiave**: `query_embedding` (vector similarity)
- **Contenuto**: `response_text`, `sources[]`, `query_text`
- **Threshold**: 0.95 (molto alto)
- **TTL**: 7 giorni
- **Lookup**: Step 4 (dopo enhancement, prima di vector search)
- **Save**: Step 9 (dopo generazione completa)
- **Metrics**: `hit_count`, `last_accessed_at`

#### **Cache 2: Enhancement Cache**
- **Tabella**: `query_enhancement_cache`
- **Chiave**: `query_text` (normalizzato: lowercase, trimmed)
- **Contenuto**: `enhanced_query`, `should_enhance`, `intent_type`
- **TTL**: 7 giorni
- **Lookup**: Step 3 (query enhancement)
- **Save**: Step 3 (dopo enhancement)
- **Metrics**: `hit_count`, `last_accessed_at`

#### **Cache 3: Query Analysis Cache**
- **Tabella**: `query_analysis_cache`
- **Chiave**: `query_text` (normalizzato)
- **Contenuto**: Intent completo (intent, isComparative, comparativeTerms, isMeta, metaType, articleNumber)
- **TTL**: 7 giorni
- **Lookup**: Step 2 (query analysis)
- **Save**: Step 2 (dopo analisi LLM)
- **Metrics**: `hit_count`, `last_accessed_at`

### 2.4 Document Processing Pipeline

#### **Ingestion Flow**
```
File Upload → Text Extraction → Chunking → Embedding Generation → Storage
```

#### **Componenti**:

1. **Document Analyzer** (`lib/processing/document-analyzer.ts`)
   - Analizza PDF per determinare strategia di extraction
   - Rileva text density, layout complexity
   - Decide: native extraction vs OCR (Mistral)

2. **Text Extraction**:
   - **PDF**: `pdf-parse` o Mistral OCR (via Pixtral)
   - **DOCX**: `mammoth`
   - **TXT**: native File API
   - **Unified Extraction** (`extractTextUnified`): sceglie automaticamente

3. **Mistral OCR** (`lib/processing/mistral-ocr.ts`)
   - Usa Pixtral Large per PDF con layout complesso o scanned
   - Output: Markdown strutturato
   - Preserva headers, tables, lists, formatting

4. **Chunking Strategies**:
   - **Smart Chunking** (`lib/processing/smart-chunking.ts`): Rispetta boundaries semantiche (paragrafi, sezioni)
   - **Sentence-Aware** (`lib/processing/sentence-aware-chunking.ts`): Non spezza frasi
   - **Adaptive Chunking** (`lib/processing/adaptive-chunking.ts`): Varia dimensione in base a content type
   - **Parameters**: ~500 tokens, overlap 50 tokens

5. **Chunk Preprocessing** (`lib/processing/chunk-preprocessing.ts`)
   - Normalizzazione testo
   - Rimozione caratteri speciali
   - Preservazione metadata (articleNumber, section, page)

6. **Embedding Generation** (`lib/embeddings/openai.ts`)
   - OpenAI text-embedding-3-large (1536 dimensions)
   - Batch processing (max 100 chunks per call)
   - Normalizzazione automatica del testo (`text-preprocessing.ts`)

7. **Storage**:
   - **Metadata**: `documents` table (filename, file_type, folder, chunks_count, file_size, status)
   - **Chunks**: `document_chunks` table (content, embedding, chunk_index, metadata, document_id FK)
   - **Batch insert**: 1000 chunks per batch per evitare errori query size

---

## 3. Criticità e Problemi Architetturali Identificati

### 3.1 Monoliticità dell'API Route Principale

**Problema**: `app/api/chat/route.ts` contiene 1035 linee in un singolo file con:
- Orchestrazione completa del flusso
- Logica di caching
- Vector search routing
- Post-processing citazioni
- Salvataggio database
- Gestione streaming SSE

**Impatto**:
- ❌ **Difficile da testare**: No unit tests possibili senza mock complessi
- ❌ **Difficile da modificare**: Cambiare un componente richiede toccare tutto
- ❌ **Code smell**: Funzioni nested, logica duplicata, bassa coesione
- ❌ **Debugging complesso**: Difficile tracciare errori attraverso 1000+ righe

**Metriche**:
- Cyclomatic complexity: ~45 (molto alto, ideale < 10)
- Lines of code: 1035
- Numero funzioni: 4 (1 main, 3 helper)
- Numero dipendenze dirette: 12+

### 3.2 Sistemi di Caching Frammentati

**Problema**: 3 cache indipendenti senza coordinazione:

| Cache | Invalidation Strategy | Consistency Check | Warming Strategy |
|-------|----------------------|-------------------|------------------|
| Semantic Cache | TTL 7 giorni | ❌ Nessuna | ❌ Nessuna |
| Enhancement Cache | TTL 7 giorni | ❌ Nessuna | ❌ Nessuna |
| Query Analysis Cache | TTL 7 giorni | ❌ Nessuna | ❌ Nessuna |

**Problemi**:
- **Inconsistency**: Se documenti vengono aggiornati, cache non vengono invalidate
- **Stale data**: Risposta cached può riferirsi a documenti eliminati o modificati
- **Spreco memoria**: 3 lookup separati invece di uno coordinato
- **No eviction policy**: Solo TTL fisso, no LRU/LFU
- **No metrics aggregate**: Cache hit rate non calcolato globalmente

**Esempio scenario problematico**:
```
1. User chiede "cos'è il GDPR" → response cached
2. Admin aggiorna documento GDPR con nuova info
3. User chiede stessa domanda → riceve risposta vecchia (cache hit)
4. Cache invalida solo dopo 7 giorni
```

### 3.3 Mancanza di Observability

**Problema**: Zero tracing, logging frammentato, no metrics centralizzate

**Cosa manca**:
- ❌ **Tracing distribuito**: Non posso tracciare una richiesta end-to-end
- ❌ **Latency breakdown**: Non so quanto tempo prende ogni step
- ❌ **LLM metrics**: No token count, no cost tracking, no latency per call
- ❌ **Error tracking**: Errori solo in console.error, no aggregation
- ❌ **Query analytics**: No stats su query types, intents, enhancement rate
- ❌ **Cache metrics**: Hit rate, eviction count, size tracking manuali

**Impatto business**:
- Non posso ottimizzare costi LLM (no visibility su token usage)
- Non posso diagnosticare lentezza (no latency breakdown)
- Non posso migliorare accuracy (no feedback loop)
- Non posso capacity planning (no usage metrics)

### 3.4 Coupling Forte tra Componenti

**Problema**: Import diretti, no interfaces, no dependency injection

**Esempi**:
```typescript
// api/chat/route.ts importa direttamente:
import { ragAgent } from '@/lib/mastra/agent'
import { generateEmbedding } from '@/lib/embeddings/openai'
import { hybridSearch } from '@/lib/supabase/vector-operations'
import { findCachedResponse } from '@/lib/supabase/semantic-cache'
// ... 8+ import diretti
```

**Impatto**:
- ❌ Impossibile sostituire implementazioni (es. switch da OpenAI a Cohere embeddings)
- ❌ Testing difficile (no mock, no stub)
- ❌ Circular dependencies risk
- ❌ Deploy graduale impossibile (no feature flags)

### 3.5 Gestione Ridondante delle Citazioni

**Problema**: Logica di citazioni duplicata in 4 punti:

1. **Cached response processing** (righe 290-360): Rinumerazione citazioni da cache
2. **Normal query processing** (righe 820-892): Rinumerazione citazioni da vector search
3. **Web citations normalization** (righe 42-54, 787-818): Normalizzazione e rinumerazione web citations
4. **Meta query processing** (righe 719-742): Gestione documenti senza citazioni

**Codice duplicato**:
- Regex `extractCitedIndices()` e `extractWebCitedIndices()` quasi identici
- Logica di rinumerazione ripetuta 3 volte con piccole varianti
- Index mapping creato manualmente in ogni caso

**Impatto**:
- ❌ DRY violation (Don't Repeat Yourself)
- ❌ Bug risk: fix in un punto non si propaga agli altri
- ❌ Manutenzione costosa: modifiche richiedono update in 4 posti

### 3.6 Error Handling Inconsistente

**Problema**: Mix di strategie senza pattern uniforme

**Esempi**:
```typescript
// Alcuni punti: swallow error e continue
catch (err) {
  console.error('[api/chat] Failed to save message:', err)
  // Continue anyway, don't fail the request
}

// Altri punti: throw error e fail request
catch (error) {
  console.error('[vector-operations] Search failed:', error)
  throw new Error(`Vector search failed: ${error.message}`)
}

// Altri punti: return fallback value
catch (error) {
  console.error('[query-enhancement] Enhancement failed:', error)
  return { enhanced: query, shouldEnhance: false, fromCache: false }
}
```

**Impatto**:
- User experience imprevedibile
- Silent failures nascosti nei log
- Retry logic mancante per errori transitori
- No circuit breaker per servizi esterni (OpenAI, OpenRouter, Tavily)

### 3.7 Gestione Context Globale con Map

**Problema**: Uso di Map globali per passare dati tra tool e main function

```typescript
// lib/mastra/agent.ts
const webSearchResultsContext = new Map<string, any[]>()
const metaQueryDocumentsContext = new Map<string, Array<...>>()

// Salvato nei tools:
webSearchResultsContext.set(contextKey, results)

// Recuperato nell'API route:
const webSearchResults = getWebSearchResults()
```

**Problemi**:
- ❌ **Memory leak risk**: Map non pulite se request fallisce
- ❌ **Concurrency issues**: Se multiple requests simultanee, context si mescola
- ❌ **Testing difficile**: Stato globale rende tests non isolati
- ❌ **Code smell**: Accoppiamento implicito via side effects

**Soluzione corretta**: Passare context esplicitamente via return values o Mastra context API

### 3.8 Assenza di Rate Limiting e Throttling

**Problema**: No protezione contro:
- Burst di richieste (DDoS accidentale o intenzionale)
- Utenti che consumano troppi LLM tokens
- Chiamate costose ripetute (es. query enhancement sempre on)

**Rischi**:
- **Costi esplosi**: Un bug o malicious user può generare migliaia di euro di costi OpenAI/OpenRouter
- **Downtime**: Supabase connection pool esaurito
- **Poor UX**: Latency alta per tutti se un utente monopolizza risorse

### 3.9 Document Processing non Ottimizzato

**Problema**: Processing sincrono, no parallelizzazione

**Bottleneck**:
```typescript
// Processing sequenziale:
for (const chunk of chunks) {
  const embedding = await generateEmbedding(chunk.content) // ❌ Serial
  await supabaseAdmin.from('document_chunks').insert({...}) // ❌ Serial
}
```

**Impatto**:
- Processing di un documento da 100 pagine prende 10+ minuti
- User deve aspettare prima che documento sia searchable
- Supabase Edge Function (process-document) ha timeout di 60 secondi
- Impossibile processare documenti molto grandi (40GB+ total)

**Soluzione necessaria**:
- Batch embedding generation (già implementato ma non usato ovunque)
- Batch inserts (già implementato ma non usato ovunque)
- Background jobs con progress tracking
- Chunking progressivo con indicizzazione incrementale

### 3.10 Mancanza di Testing

**Problema**: Zero tests automatizzati

**Impatto**:
- ❌ Refactoring pericoloso (no safety net)
- ❌ Regression bugs inevitabili
- ❌ Difficile onboarding nuovi sviluppatori
- ❌ Confidence bassa su modifiche

**Test necessari**:
- Unit tests: Ogni modulo (query-analysis, query-enhancement, vector-operations, ecc.)
- Integration tests: API routes, database operations
- E2E tests: Full flow user question → response
- Performance tests: Latency, throughput, cache hit rate

---

## 4. Architettura Target: Design Modulare e Scalabile

> **⚠️ NOTA IMPORTANTE**: Questa sezione descrive un'architettura custom-built. Per un approccio **Mastra-Native** che sfrutta al massimo le capabilities del framework (workflows, RAG pipelines, evals, telemetry), vedi il documento dedicato:
> 
> **📄 [Mastra-Native Architecture](./mastra-native-architecture.md)**
> 
> L'approccio Mastra-Native è **raccomandato** perché:
> - ✅ Riduce code da 1035 a ~30 linee
> - ✅ Observability automatica (OpenTelemetry → Langfuse)
> - ✅ Quality assurance built-in (Evals)
> - ✅ Workflows dichiarativi (XState)
> - ✅ RAG pipelines native
> - ✅ Memory management automatico

### 4.1 Principi Architetturali

1. **Separation of Concerns**: Ogni modulo ha una responsabilità chiara
2. **Dependency Inversion**: Dipendenze da abstractions, non implementations
3. **Single Responsibility**: Ogni classe/modulo fa una cosa sola
4. **Open/Closed**: Estendibile senza modificare codice esistente
5. **Testability**: Ogni componente testabile in isolamento
6. **Observability**: Tracing, logging, metrics integrati nativamente

### 4.2 Architettura a Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐        │
│  │   useChat   │  │ ChatInput   │  │  Citations   │        │
│  └─────────────┘  └─────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       API LAYER                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ChatController (route handler)                      │   │
│  │  - Request validation                                │   │
│  │  - Response formatting                               │   │
│  │  - SSE streaming                                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ChatOrchestrator (pipeline coordinator)            │   │
│  │  - Pipeline execution                                │   │
│  │  - Error handling & retry                            │   │
│  │  - Tracing & metrics                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐              │
│         ▼                 ▼                 ▼              │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐         │
│  │  Pipeline  │  │  Pipeline  │  │   Pipeline   │         │
│  │   Step 1   │  │   Step 2   │  │    Step N    │         │
│  └────────────┘  └────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     BUSINESS LOGIC LAYER                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │    Query     │ │   Retrieval  │ │  Generation  │        │
│  │  Processing  │ │    Engine    │ │    Engine    │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │    Cache     │ │  Citation    │ │    Tools     │        │
│  │   Manager    │ │   Manager    │ │   Registry   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │   Supabase   │ │    OpenAI    │ │  OpenRouter  │        │
│  │   Client     │ │   Client     │ │    Client    │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │    Mastra    │ │   Langfuse   │ │    Tavily    │        │
│  │    Agent     │ │  Observability│ │  Web Search  │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Pipeline Pattern per Chat Flow

**Concetto**: Ogni step è un `PipelineStep` indipendente che:
- Riceve input
- Esegue operazione
- Produce output
- È testabile in isolamento
- Ha tracing automatico

#### **Interface PipelineStep**

```typescript
// lib/pipeline/types.ts
export interface PipelineStep<TInput, TOutput> {
  name: string
  execute(input: TInput, context: PipelineContext): Promise<TOutput>
}

export interface PipelineContext {
  conversationId?: string
  traceId: string
  userId?: string
  metrics: MetricsCollector
  cache: CacheManager
  logger: Logger
}

export interface PipelineResult<T> {
  data: T
  metadata: {
    stepName: string
    duration: number
    cached: boolean
    error?: Error
  }
}
```

#### **Pipeline Steps Proposti**

```typescript
// lib/pipeline/steps/

1. ValidateInputStep
   Input: { message: string, conversationId?, webSearchEnabled }
   Output: { validatedMessage: string, options: ChatOptions }
   Responsabilità: Validation, sanitization, rate limiting check

2. SaveUserMessageStep
   Input: { message, conversationId }
   Output: { messageId: string, isFirstMessage: boolean }
   Responsabilità: Save to DB, update conversation title

3. QueryAnalysisStep
   Input: { message }
   Output: QueryAnalysisResult (intent, isComparative, isMeta, articleNumber)
   Responsabilità: Unified query analysis (con cache)

4. QueryEnhancementStep
   Input: { message, analysis: QueryAnalysisResult }
   Output: { enhanced: string, shouldEnhance: boolean }
   Responsabilità: Intent-based expansion (con cache)

5. SemanticCacheLookupStep
   Input: { enhancedQuery }
   Output: { cached: boolean, response?: CachedResponse }
   Responsabilità: Vector similarity cache lookup

6. RetrievalStep (conditional: skip if cached)
   Input: { enhancedQuery, queryEmbedding, analysis }
   Output: { results: SearchResult[], avgSimilarity }
   Responsabilità: Vector search con routing (multi-query, article, normal)

7. ContextBuildingStep
   Input: { results, analysis }
   Output: { context: string, sources: Source[], prompt: string }
   Responsabilità: Format context, build system prompt

8. GenerationStep
   Input: { prompt, context, conversationHistory }
   Output: { response: string, toolCalls: ToolCall[] }
   Responsabilità: LLM generation con tools (streaming)

9. PostProcessingStep
   Input: { response, sources, toolCalls }
   Output: { processedResponse: string, finalSources: Source[] }
   Responsabilità: Citation normalization, renumbering, matching

10. SaveResponseStep
    Input: { response, sources, metadata }
    Output: { messageId: string }
    Responsabilità: Save to DB, save to cache

11. FormatOutputStep
    Input: { response, sources }
    Output: SSE stream
    Responsabilità: SSE formatting, streaming to client
```

#### **Pipeline Executor**

```typescript
// lib/pipeline/executor.ts
export class PipelineExecutor {
  constructor(
    private steps: PipelineStep<any, any>[],
    private observability: ObservabilityService // Langfuse
  ) {}

  async execute<TOutput>(
    initialInput: any,
    context: PipelineContext
  ): Promise<PipelineResult<TOutput>> {
    let currentOutput = initialInput
    
    for (const step of this.steps) {
      const span = this.observability.startSpan(step.name, context.traceId)
      
      try {
        const startTime = Date.now()
        currentOutput = await step.execute(currentOutput, context)
        const duration = Date.now() - startTime
        
        span.end({ success: true, duration })
        context.metrics.recordStepDuration(step.name, duration)
        
      } catch (error) {
        span.end({ success: false, error })
        context.logger.error(`Step ${step.name} failed`, error)
        throw new PipelineError(step.name, error)
      }
    }
    
    return {
      data: currentOutput,
      metadata: { /* aggregated metadata */ }
    }
  }
}
```

### 4.4 Unified Cache Manager

**Problema risolto**: 3 cache separate → 1 cache manager coordinato

```typescript
// lib/cache/manager.ts
export interface CacheKey {
  type: 'semantic' | 'enhancement' | 'analysis'
  value: string | number[]
}

export interface CacheEntry<T> {
  key: CacheKey
  data: T
  metadata: {
    createdAt: Date
    accessCount: number
    lastAccessedAt: Date
    ttl: number
  }
}

export class UnifiedCacheManager {
  async get<T>(key: CacheKey): Promise<T | null>
  async set<T>(key: CacheKey, data: T, ttl?: number): Promise<void>
  async invalidate(pattern: string): Promise<number>
  async invalidateByDocument(documentId: string): Promise<void>
  async getHitRate(): Promise<number>
  async warm(queries: string[]): Promise<void>
}
```

**Vantaggi**:
- ✅ Invalidazione coordinata (se documento cambia, invalidano tutte le 3 cache)
- ✅ Metrics aggregate (hit rate globale)
- ✅ Warming strategies (pre-populate cache con common queries)
- ✅ Eviction policies (LRU, LFU, TTL-based)
- ✅ Single interface per tutti i caching needs

### 4.5 Observability con Langfuse via Mastra

**Integrazione Mastra + Langfuse**: Mastra ha supporto nativo per Langfuse

```typescript
// lib/observability/langfuse.ts
import { Mastra } from '@mastra/core'
import { LangfuseExporter } from '@mastra/langfuse'

export const mastra = new Mastra({
  workflows: [chatWorkflow],
  tools: [vectorSearchTool, webSearchTool, metaQueryTool],
  telemetry: {
    serviceName: 'rag-chatbot',
    exporters: [
      new LangfuseExporter({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL,
      }),
    ],
  },
})
```

**Cosa tracciamo automaticamente**:
- ✅ **Traces completi**: Ogni richiesta con tutti gli step
- ✅ **LLM calls**: Token count, latency, cost per call
- ✅ **Tool executions**: Vector search, web search, meta queries
- ✅ **Cache hits/misses**: Per ogni layer di cache
- ✅ **Errors**: Stack traces, context, retry attempts
- ✅ **User feedback**: Thumbs up/down collegato a trace ID

**Dashboard Langfuse**:
- Query analytics: Intents distribution, enhancement rate
- Cost tracking: Token usage, $$$ per query, cost breakdown
- Latency percentiles: P50, P95, P99 per ogni step
- Error rates: Per step, per tool, per LLM model
- A/B testing: Confronta diversi prompt, models, strategies

### 4.6 Modularizzazione Query Processing

```typescript
// lib/query/processor.ts
export interface IQueryAnalyzer {
  analyze(query: string): Promise<QueryAnalysisResult>
}

export interface IQueryEnhancer {
  enhance(query: string, analysis: QueryAnalysisResult): Promise<EnhancementResult>
}

// Implementations
export class CachedQueryAnalyzer implements IQueryAnalyzer {
  constructor(
    private analyzer: IQueryAnalyzer,
    private cache: CacheManager
  ) {}
  
  async analyze(query: string): Promise<QueryAnalysisResult> {
    const cached = await this.cache.get<QueryAnalysisResult>({
      type: 'analysis',
      value: query
    })
    
    if (cached) return { ...cached, fromCache: true }
    
    const result = await this.analyzer.analyze(query)
    await this.cache.set({ type: 'analysis', value: query }, result)
    
    return result
  }
}

export class LLMQueryAnalyzer implements IQueryAnalyzer {
  constructor(
    private llm: LLMClient,
    private observability: ObservabilityService
  ) {}
  
  async analyze(query: string): Promise<QueryAnalysisResult> {
    const span = this.observability.startSpan('llm-query-analysis')
    
    try {
      const result = await this.llm.complete({
        prompt: buildAnalysisPrompt(query),
        model: 'gemini-2.5-flash',
        temperature: 0,
      })
      
      span.end({ success: true, tokens: result.usage.totalTokens })
      return parseAnalysisResult(result.text)
      
    } catch (error) {
      span.end({ success: false, error })
      throw error
    }
  }
}
```

**Vantaggi**:
- ✅ Testabile: Mock IQueryAnalyzer facilmente
- ✅ Sostituibile: Cambia implementazione senza toccare API route
- ✅ Componibile: Decora con cache, retry, circuit breaker
- ✅ Observable: Ogni implementazione logga e traccia

### 4.7 Retrieval Engine Modulare

```typescript
// lib/retrieval/engine.ts
export interface IRetrievalEngine {
  retrieve(query: RetrievalQuery): Promise<RetrievalResult>
}

export interface RetrievalQuery {
  text: string
  embedding: number[]
  filters?: {
    articleNumber?: number
    folder?: string
    documentIds?: string[]
  }
  options?: {
    limit?: number
    threshold?: number
    vectorWeight?: number
  }
}

export interface RetrievalResult {
  chunks: SearchResult[]
  avgSimilarity: number
  strategy: 'normal' | 'comparative' | 'article_lookup' | 'meta'
  metadata: {
    queriesExecuted: number
    totalResults: number
    filteredResults: number
  }
}

// Strategies
export class NormalRetrievalStrategy implements IRetrievalEngine {
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    // Hybrid search
  }
}

export class ComparativeRetrievalStrategy implements IRetrievalEngine {
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    // Multi-query search
  }
}

export class ArticleLookupRetrievalStrategy implements IRetrievalEngine {
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    // Filtered search by articleNumber
  }
}

// Router
export class RetrievalEngineRouter {
  constructor(
    private strategies: Map<string, IRetrievalEngine>,
    private analyzer: IQueryAnalyzer
  ) {}
  
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
    const analysis = await this.analyzer.analyze(query.text)
    
    let strategy: IRetrievalEngine
    
    if (analysis.isComparative) {
      strategy = this.strategies.get('comparative')!
    } else if (analysis.articleNumber) {
      strategy = this.strategies.get('article_lookup')!
    } else {
      strategy = this.strategies.get('normal')!
    }
    
    return strategy.retrieve(query)
  }
}
```

### 4.8 Citation Manager (DRY)

**Problema risolto**: Logica citazioni duplicata in 4 punti

```typescript
// lib/citations/manager.ts
export class CitationManager {
  /**
   * Estrae citazioni da testo
   */
  extractCitations(text: string, type: 'kb' | 'web'): Citation[] {
    const regex = type === 'kb' 
      ? /\[cit[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
      : /\[web[\s:]+(\d+(?:\s*,\s*\d+)*)\]/g
    
    const citations: Citation[] = []
    const matches = text.matchAll(regex)
    
    for (const match of matches) {
      citations.push(this.parseCitation(match[0], match[1]))
    }
    
    return citations
  }
  
  /**
   * Normalizza citazioni (rimuove formati errati)
   */
  normalizeCitations(text: string): string {
    // Rimuovi pattern errati
    let normalized = text.replace(/\[web_search_\d+_[^\]]+\]/g, '')
    normalized = normalized.replace(/\[web_[^\]]+\]/g, '')
    return normalized
  }
  
  /**
   * Rinumera citazioni sequenzialmente
   */
  renumberCitations(
    text: string,
    sources: Source[],
    type: 'kb' | 'web'
  ): RenumberResult {
    const citations = this.extractCitations(text, type)
    const citedIndices = citations.flatMap(c => c.indices)
    
    // Filtra sources per includere solo quelle citate
    const filteredSources = this.filterSources(sources, citedIndices)
    
    // Crea mapping da vecchio indice a nuovo indice
    const mapping = this.createIndexMapping(citedIndices, filteredSources)
    
    // Sostituisci citazioni nel testo
    const renumberedText = this.replaceCitations(text, mapping, type)
    
    // Rinumera sources sequenzialmente
    const renumberedSources = this.renumberSources(filteredSources)
    
    return {
      text: renumberedText,
      sources: renumberedSources,
      mapping,
    }
  }
  
  /**
   * Valida che citazioni nel testo corrispondano alle sources
   */
  validate(text: string, sources: Source[]): ValidationResult {
    const citations = this.extractCitations(text, 'kb')
      .concat(this.extractCitations(text, 'web'))
    
    const citedIndices = citations.flatMap(c => c.indices)
    const sourceIndices = sources.map(s => s.index)
    
    const missingIndices = citedIndices.filter(idx => !sourceIndices.includes(idx))
    const unusedSources = sources.filter(s => !citedIndices.includes(s.index))
    
    return {
      valid: missingIndices.length === 0,
      missingIndices,
      unusedSources,
    }
  }
}
```

### 4.9 Error Handling & Retry Policies

```typescript
// lib/errors/handler.ts
export class ErrorHandler {
  constructor(
    private logger: Logger,
    private observability: ObservabilityService
  ) {}
  
  async withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      backoff = 'exponential',
      retryableErrors = [NetworkError, RateLimitError],
    } = options
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        if (attempt === maxRetries || !this.isRetryable(error, retryableErrors)) {
          throw error
        }
        
        const delay = this.calculateBackoff(attempt, backoff)
        this.logger.warn(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`, { error })
        await this.sleep(delay)
      }
    }
    
    throw new Error('Unexpected: max retries reached')
  }
  
  async withCircuitBreaker<T>(
    fn: () => Promise<T>,
    serviceName: string
  ): Promise<T> {
    const breaker = this.getCircuitBreaker(serviceName)
    
    if (breaker.isOpen()) {
      throw new ServiceUnavailableError(`Circuit breaker open for ${serviceName}`)
    }
    
    try {
      const result = await fn()
      breaker.recordSuccess()
      return result
    } catch (error) {
      breaker.recordFailure()
      throw error
    }
  }
}
```

### 4.10 Feature Flags & Gradual Rollout

```typescript
// lib/features/flags.ts
export class FeatureFlags {
  constructor(
    private store: FeatureFlagStore // DB, Redis, or LaunchDarkly
  ) {}
  
  async isEnabled(flag: string, context?: FeatureFlagContext): Promise<boolean> {
    const config = await this.store.getFlag(flag)
    
    if (!config) return false
    if (config.enabledForAll) return true
    
    // Gradual rollout
    if (config.rolloutPercentage && context?.userId) {
      return this.isInRollout(context.userId, config.rolloutPercentage)
    }
    
    // User/group targeting
    if (config.enabledUsers?.includes(context?.userId)) return true
    if (config.enabledGroups?.includes(context?.userGroup)) return true
    
    return false
  }
}

// Utilizzo in pipeline
if (await featureFlags.isEnabled('query-enhancement-v2', { userId })) {
  // Usa nuova versione
  enhancer = new QueryEnhancerV2()
} else {
  // Usa versione corrente
  enhancer = new QueryEnhancer()
}
```

---

## 5. Roadmap Implementazione

### Phase 1: Foundation (Sprint 1-2, 2 settimane)

**Obiettivo**: Setup infrastruttura base per refactoring

**Tasks**:
1. ✅ Setup Langfuse account e API keys
2. ✅ Installare `@mastra/langfuse` package
3. ✅ Creare `lib/observability/langfuse.ts` con configurazione
4. ✅ Aggiungere tracing a `ragAgent` in Mastra
5. ✅ Creare interfaces base:
   - `lib/pipeline/types.ts`
   - `lib/cache/types.ts`
   - `lib/query/types.ts`
   - `lib/retrieval/types.ts`
6. ✅ Setup testing framework (Vitest)
7. ✅ Creare `lib/errors/handler.ts` con retry e circuit breaker

**Deliverable**: Infrastruttura pronta, primi traces in Langfuse

### Phase 2: Pipeline Extraction (Sprint 3-4, 2 settimane)

**Obiettivo**: Estrarre step dal monolitico route.ts

**Tasks**:
1. ✅ Implementare `PipelineExecutor`
2. ✅ Creare primi 5 step:
   - `ValidateInputStep`
   - `SaveUserMessageStep`
   - `QueryAnalysisStep`
   - `QueryEnhancementStep`
   - `SemanticCacheLookupStep`
3. ✅ Migrare `route.ts` per usare pipeline (gradualmente)
4. ✅ Unit tests per ogni step (coverage > 80%)
5. ✅ Integration test per pipeline completa

**Deliverable**: Route.ts dimezzato, primi step estratti e testati

### Phase 3: Cache Unification (Sprint 5-6, 2 settimane)

**Obiettivo**: Unificare 3 cache in CacheManager

**Tasks**:
1. ✅ Implementare `UnifiedCacheManager`
2. ✅ Migrare semantic cache
3. ✅ Migrare enhancement cache
4. ✅ Migrare query analysis cache
5. ✅ Implementare invalidazione coordinata
6. ✅ Aggiungere cache warming strategy
7. ✅ Dashboard metrics in Langfuse

**Deliverable**: Cache unificata, invalidazione funzionante, metrics visibili

### Phase 4: Retrieval Refactoring (Sprint 7-8, 2 settimane)

**Obiettivo**: Modularizzare retrieval con strategy pattern

**Tasks**:
1. ✅ Creare `RetrievalEngine` interface
2. ✅ Implementare 3 strategies:
   - `NormalRetrievalStrategy`
   - `ComparativeRetrievalStrategy`
   - `ArticleLookupRetrievalStrategy`
3. ✅ Implementare `RetrievalEngineRouter`
4. ✅ Estrarre `RetrievalStep` in pipeline
5. ✅ Unit tests per ogni strategy
6. ✅ Performance testing (latency, accuracy)

**Deliverable**: Retrieval modulare, facilmente estendibile

### Phase 5: Citation Manager (Sprint 9, 1 settimana)

**Obiettivo**: DRY - eliminare duplicazione logica citazioni

**Tasks**:
1. ✅ Implementare `CitationManager`
2. ✅ Sostituire tutte le 4 occorrenze di logica citazioni
3. ✅ Unit tests per:
   - `extractCitations()`
   - `normalizeCitations()`
   - `renumberCitations()`
   - `validate()`
4. ✅ Integration test con scenari reali

**Deliverable**: Logica citazioni unificata, tested, DRY

### Phase 6: Generation & Tools (Sprint 10-11, 2 settimane)

**Obiettivo**: Refactor tools e generazione

**Tasks**:
1. ✅ Creare `ToolRegistry`
2. ✅ Refactor tools per usare explicit context (no Map globali)
3. ✅ Implementare `GenerationStep` con streaming
4. ✅ Implementare `PostProcessingStep`
5. ✅ Migliorare error handling in tools
6. ✅ Aggiungere circuit breaker per Tavily, OpenAI, OpenRouter

**Deliverable**: Tools robusti, generation step modulare

### Phase 7: Document Processing (Sprint 12-13, 2 settimane)

**Obiettivo**: Ottimizzare processing per grandi documenti

**Tasks**:
1. ✅ Parallelizzare embedding generation (batch API)
2. ✅ Parallelizzare inserts (batch + concurrent)
3. ✅ Implementare progress tracking (real-time updates)
4. ✅ Background jobs con Supabase Edge Functions + Queue
5. ✅ Chunking incrementale con indicizzazione progressiva

**Deliverable**: Processing 5-10x più veloce, real-time progress

### Phase 8: Testing & Documentation (Sprint 14, 1 settimana)

**Obiettivo**: Coverage completo e docs

**Tasks**:
1. ✅ Unit tests per tutti i moduli (target: 90% coverage)
2. ✅ Integration tests per pipeline completa
3. ✅ E2E tests per scenari critici
4. ✅ Performance tests (load, stress)
5. ✅ Documentation completa:
   - Architecture diagrams
   - API documentation
   - Runbook per operations
   - Onboarding guide

**Deliverable**: Sistema testato, documentato, production-ready

### Phase 9: Monitoring & Alerts (Sprint 15, 1 settimana)

**Obiettivo**: Observability completa

**Tasks**:
1. ✅ Setup alerts in Langfuse:
   - Latency > P95 threshold
   - Error rate > 1%
   - Cost > budget threshold
2. ✅ Dashboard per monitoring:
   - Query analytics
   - Cache hit rates
   - LLM costs
   - Tool usage
3. ✅ Logging aggregation (Sentry, LogRocket, o simili)
4. ✅ Incident response playbook

**Deliverable**: Sistema observable, alerts configurati

### Phase 10: Feature Flags & Optimization (Sprint 16, 1 settimana)

**Obiettivo**: Deploy graduale e ottimizzazioni finali

**Tasks**:
1. ✅ Implementare `FeatureFlags`
2. ✅ A/B testing framework:
   - Testare prompt variations
   - Testare retrieval strategies
   - Testare LLM models
3. ✅ Performance optimizations basate su Langfuse data
4. ✅ Cleanup codice legacy (vecchio route.ts)

**Deliverable**: Sistema in produzione, A/B testing attivo, legacy code rimosso

---

## 6. Metriche di Successo

### 6.1 Metriche Tecniche

| Metrica | Attuale | Target | Come Misurare |
|---------|---------|--------|---------------|
| **Code Quality** |
| Cyclomatic complexity | 45 | < 10 | SonarQube |
| Test coverage | 0% | > 90% | Vitest coverage |
| LOC per file | 1035 | < 300 | SonarQube |
| **Performance** |
| Query latency (P95) | ~3-5s | < 2s | Langfuse |
| Cache hit rate | ~40% (estimate) | > 70% | CacheManager metrics |
| Token usage per query | Unknown | < 5000 | Langfuse |
| Cost per 1000 queries | Unknown | < $5 | Langfuse |
| **Reliability** |
| Error rate | Unknown | < 1% | Langfuse |
| Availability | Unknown | > 99.5% | Uptime monitoring |
| MTTR (Mean Time to Recovery) | Unknown | < 30min | Incident tracking |

### 6.2 Metriche Business

| Metrica | Target | Come Misurare |
|---------|--------|---------------|
| User satisfaction | > 4.5/5 | Thumbs up/down in chat |
| Answer accuracy | > 85% | Manual evaluation + user feedback |
| Citation correctness | > 95% | Automated validation + spot checks |
| Query success rate | > 95% | % queries with relevant response |

### 6.3 Metriche Osservabilità

- ✅ **Latency breakdown**: Quanto tempo prende ogni step?
- ✅ **LLM token usage**: Quanti token per intent type?
- ✅ **Cache hit rate per layer**: Semantic vs enhancement vs analysis
- ✅ **Tool usage**: Quante volte viene chiamato web_search vs meta_query?
- ✅ **Error distribution**: Quali errors sono più comuni?
- ✅ **User behavior**: Quali intent sono più frequenti?

---

## 7. Benefici Attesi dell'Architettura Target

### 7.1 Manutenibilità

**Prima**:
- ❌ Modificare qualsiasi cosa richiede toccare route.ts (1035 linee)
- ❌ Bug in un punto si propaga ovunque
- ❌ Refactoring pericoloso (no tests)

**Dopo**:
- ✅ Ogni componente è isolato e testato
- ✅ Modifica locale non impatta resto del sistema
- ✅ Refactoring sicuro grazie a test coverage > 90%

### 7.2 Testabilità

**Prima**:
- ❌ Zero unit tests
- ❌ Integration tests impossibili (tutto coupled)

**Dopo**:
- ✅ Unit tests per ogni modulo (interfaces mock facilmente)
- ✅ Integration tests per pipeline
- ✅ E2E tests per critical paths
- ✅ Performance tests per regression detection

### 7.3 Osservabilità

**Prima**:
- ❌ Console.log sparsi
- ❌ No tracing distribuito
- ❌ No LLM cost tracking
- ❌ Debug manuale (grep logs)

**Dopo**:
- ✅ Traces completi in Langfuse
- ✅ Latency breakdown per step
- ✅ LLM token/cost tracking
- ✅ Dashboard per query analytics
- ✅ Alerts automatici per anomalie

### 7.4 Scalabilità

**Prima**:
- ❌ Monolite difficile da scalare orizzontalmente
- ❌ Coupling forte limita deploy indipendente

**Dopo**:
- ✅ Pipeline steps possono essere distribuiti
- ✅ Cache unificata scalabile (Redis, Memcached)
- ✅ Background jobs per document processing
- ✅ Feature flags per gradual rollout

### 7.5 Estendibilità

**Prima**:
- ❌ Aggiungere nuovo tool richiede modifiche in 4+ punti
- ❌ Aggiungere nuova strategia di retrieval richiede fork di logica esistente

**Dopo**:
- ✅ Aggiungere tool: implementa interface, registra in ToolRegistry
- ✅ Aggiungere retrieval strategy: implementa IRetrievalEngine, registra in router
- ✅ Aggiungere pipeline step: implementa PipelineStep, aggiungi a executor
- ✅ Aggiungere cache layer: implementa CacheProvider, registra in CacheManager

### 7.6 Developer Experience

**Prima**:
- ❌ Onboarding lento (settimane per capire sistema)
- ❌ Debug frustrante (no tracing)
- ❌ Paura di modificare codice (no tests)

**Dopo**:
- ✅ Onboarding veloce (giorni, grazie a docs e interfaces chiare)
- ✅ Debug rapido (Langfuse traces)
- ✅ Confidence alta (test coverage > 90%)
- ✅ Local development facile (mock interfaces)

---

## 8. Rischi e Mitigazioni

### Rischio 1: Complessità Eccessiva

**Rischio**: Over-engineering, introduzione di complessità non necessaria

**Mitigazione**:
- ✅ Implementare incrementalmente (fase per fase)
- ✅ Mantenere backward compatibility durante transizione
- ✅ Monitorare complexity metrics (SonarQube)
- ✅ Code review obbligatorie

### Rischio 2: Regression Bugs

**Rischio**: Refactoring introduce bug che rompono funzionalità esistenti

**Mitigazione**:
- ✅ Test coverage > 90% prima di modificare
- ✅ Feature flags per rollback rapido
- ✅ Canary deployment (gradual rollout)
- ✅ Monitoring attivo per anomalie

### Rischio 3: Performance Degradation

**Rischio**: Nuova architettura più lenta dell'attuale

**Mitigazione**:
- ✅ Performance tests in CI/CD
- ✅ Benchmarking prima/dopo refactoring
- ✅ Profiling con Langfuse
- ✅ Optimization based on real data

### Rischio 4: Team Capacity

**Rischio**: Team non ha tempo/skill per implementare architettura target

**Mitigazione**:
- ✅ Training su pattern (pipeline, dependency injection)
- ✅ Pair programming per trasferimento knowledge
- ✅ Documentazione completa
- ✅ Prioritizzare fasi più critiche

---

## 9. Conclusioni

### 9.1 Stato Attuale: Funzionale ma Fragile

Il chatbot RAG attuale è **funzionale** e fornisce valore agli utenti, ma ha limiti significativi:
- Architettura monolitica difficile da manutenere
- Mancanza di testing automatizzato
- Osservabilità limitata
- Scalabilità difficile

### 9.2 Architettura Target: Scalabile e Manutenibile

L'architettura proposta risolve le criticità identificate:
- ✅ **Modularità**: Pipeline pattern con step indipendenti
- ✅ **Testabilità**: Interfaces + dependency injection + coverage > 90%
- ✅ **Osservabilità**: Langfuse integration per tracing completo
- ✅ **Estendibilità**: Strategy pattern per retrieval, tools, caching
- ✅ **Manutenibilità**: DRY, SOLID principles, bassa complessità

### 9.3 Raccomandazioni

**Priorità Alta** (fare subito):
1. ✅ Setup Langfuse (Fase 1)
2. ✅ Implementare PipelineExecutor (Fase 2)
3. ✅ Unificare cache (Fase 3)

**Priorità Media** (dopo 1-2 mesi):
4. ✅ Retrieval refactoring (Fase 4)
5. ✅ Citation manager (Fase 5)
6. ✅ Document processing optimization (Fase 7)

**Priorità Bassa** (nice to have):
7. ✅ Feature flags (Fase 10)
8. ✅ A/B testing framework (Fase 10)

### 9.4 Next Steps

**Immediate (questa settimana)**:
1. Review documento con team
2. Prioritizzare fasi in base a business needs
3. Setup Langfuse account
4. Creare epic/tickets per Fase 1

**Short-term (prossimo mese)**:
1. Implementare Fase 1-3
2. Primi unit tests
3. Dashboard Langfuse basic

**Long-term (prossimi 3-4 mesi)**:
1. Completare tutte le 10 fasi
2. Test coverage > 90%
3. Sistema in produzione con nuova architettura

---

## 10. Appendice: Riferimenti Tecnici

### 10.1 Stack Tecnologico Attuale

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (Postgres 15 + pgvector)
- **Embeddings**: OpenAI text-embedding-3-large (1536 dim)
- **LLM**: OpenRouter (Gemini 2.5 Flash)
- **RAG Orchestration**: Mastra 0.23.3
- **Web Search**: Tavily API
- **UI**: shadcn/ui + Tailwind CSS
- **Deployment**: Vercel

### 10.2 Dipendenze Chiave

```json
{
  "@mastra/core": "^0.23.3",
  "@supabase/supabase-js": "^2.39.0",
  "openai": "^4.28.0",
  "pdf-parse": "^1.1.1",
  "mammoth": "^1.6.0",
  "next": "^14.1.0",
  "react": "^18.2.0"
}
```

### 10.3 Database Schema (Rilevante)

**Tables**:
- `documents`: Metadata documenti (id, filename, file_type, folder, chunks_count, file_size, processing_status)
- `document_chunks`: Chunks con embeddings (id, document_id, content, embedding vector(1536), chunk_index, metadata jsonb)
- `query_cache`: Semantic cache (id, query_text, query_embedding vector(1536), response_text, sources jsonb, hit_count, expires_at)
- `query_enhancement_cache`: Enhancement decisions (id, query_text, enhanced_query, should_enhance, intent_type, hit_count, expires_at)
- `query_analysis_cache`: Query analysis results (id, query_text, intent, is_comparative, comparative_terms, is_meta, meta_type, article_number, confidence, hit_count, expires_at)
- `conversations`: Chat conversations (id, user_id, title, created_at, updated_at)
- `messages`: Chat messages (id, conversation_id, role, content, metadata jsonb)

**Indexes**:
- `document_chunks.embedding`: HNSW index per vector similarity
- `document_chunks.content`: GIN index per full-text search (tsvector)
- `query_cache.query_embedding`: HNSW index per semantic cache lookup
- B-tree indexes su foreign keys

**RPC Functions**:
- `match_document_chunks(query_embedding, match_threshold, match_count)`: Vector similarity search
- `hybrid_search(query_embedding, query_text, match_threshold, match_count, vector_weight, article_number)`: Hybrid search (vector + text)
- `match_cached_query(p_query_embedding, match_threshold)`: Semantic cache lookup
- `clean_expired_cache()`: Cleanup expired cache entries
- `clean_expired_enhancement_cache()`: Cleanup expired enhancement cache

### 10.4 File Structure (Rilevante)

```
/workspace/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts                 # ❌ MONOLITICO (1035 linee)
│   └── chat/
│       └── [id]/page.tsx
├── lib/
│   ├── embeddings/
│   │   ├── query-analysis.ts           # ✅ Buono (unified analysis)
│   │   ├── query-enhancement.ts        # ✅ Buono (intent-based)
│   │   └── intent-based-expansion.ts   # ✅ Buono (strategy pattern)
│   ├── mastra/
│   │   └── agent.ts                     # ⚠️ Map globali (context management)
│   ├── supabase/
│   │   ├── vector-operations.ts         # ✅ Buono
│   │   ├── semantic-cache.ts            # ⚠️ Separato da enhancement-cache
│   │   ├── enhancement-cache.ts         # ⚠️ Separato da semantic-cache
│   │   ├── query-analysis-cache.ts      # ⚠️ Terzo cache separato
│   │   └── meta-queries.ts              # ✅ Buono
│   ├── llm/
│   │   └── system-prompt.ts             # ✅ Buono (centralizzato)
│   └── processing/
│       ├── document-processor.ts        # ⚠️ Può essere parallelizzato
│       └── smart-chunking.ts            # ✅ Buono
└── components/
    └── chat/
        ├── ChatInput.tsx                # ✅ Buono
        └── Citation.tsx                 # ✅ Buono
```

### 10.5 Glossario

- **RAG**: Retrieval-Augmented Generation - pattern che combina vector search con LLM generation
- **Hybrid Search**: Combina vector similarity (embeddings) con full-text search (keywords)
- **Intent**: Tipo semantico di query (comparison, definition, requirements, ecc.)
- **Embedding**: Rappresentazione vettoriale di testo (1536 dimensioni per OpenAI)
- **Similarity**: Cosine similarity tra embeddings (0-1, dove 1 = identico)
- **Pipeline Step**: Unità atomica di processing in pipeline pattern
- **Tool**: Funzione chiamabile da LLM agent (vector_search, web_search, meta_query)
- **Context**: Documenti rilevanti formattati per LLM prompt
- **Citation**: Riferimento a fonte (`[cit:N]` per KB, `[web:N]` per web)
- **Semantic Cache**: Cache basata su vector similarity invece che exact match
- **Query Enhancement**: Espansione query con sinonimi/termini correlati per migliorare retrieval
- **Observability**: Capacity di ispezionare sistema interno via tracing, logging, metrics

---

**Fine Documento**

**Autore**: AI Analyst  
**Reviewer**: Team Consulting  
**Versione**: 1.0  
**Data**: 2025-11-08
