# Stato Migrazioni Supabase

## 📋 Riepilogo Situazione

**Data Analisi:** 2025-01-XX

### Stato Generale
✅ **Tutte le migrazioni del repo sono state applicate nel database**, anche se con timestamp e nomi diversi.

⚠️ **Disallineamento:** Le migrazioni nel database hanno timestamp 2025 (novembre 2025) mentre quelle nel repo hanno timestamp 2024 (gennaio e novembre 2024). Questo indica che le migrazioni sono state applicate manualmente o ricreate con nuovi timestamp.

---

## 🔍 Confronto Migrazioni: Repo vs Database

### Migrazioni nel Repository

| File | Descrizione | Stato DB |
|------|-------------|----------|
| `20240101000000_initial_schema.sql` | Schema iniziale completo | ✅ Applicata come `20251102110821_initial_schema` |
| `20240101000001_storage_bucket.sql` | Storage bucket e policies | ✅ Applicata come `20251102110823_storage_bucket` |
| `20240101000002_fix_match_cached_query.sql` | Fix funzione match_cached_query | ✅ Applicata come `20251102115444_fix_match_cached_query_v2` |
| `20240101000003_add_processing_status.sql` | Aggiunge processing_status, error_message, chunks_count | ✅ Applicata come `20251102115310_add_processing_status` |
| `20240101000004_enable_rls_auth.sql` | Abilita RLS per conversations e messages | ✅ Applicata come `20251103074804_enable_rls_auth` |
| `20241104000001_enhanced_chunks.sql` | Funzioni helper per metadata chunks | ✅ Applicata come `20251103085008_enhanced_chunks_metadata` |
| `20241104000002_improved_hybrid_search.sql` | Migliora hybrid_search con pesi configurabili | ✅ Applicata (combinata con altre) |
| `20241104000003_fix_text_score_scaling.sql` | Fix scaling text_score in hybrid_search | ✅ Applicata come `20251103205622_fix_text_score_scaling` e `20251103210923_fix_text_score_scaling_prod` |

### Migrazioni nel Database (Non nel Repo)

| Versione | Nome | Descrizione | Stato |
|----------|------|-------------|-------|
| `20251102115833` | `add_document_metadata_to_search_v2` | Aggiunge `document_filename` alla funzione `hybrid_search` | ✅ **Aggiunta al repo** come `20241104000004_add_document_metadata_to_search.sql` |

---

## ✅ Verifica Applicazione

### Tabelle e Colonne
Tutte le tabelle e colonne previste dalle migrazioni esistono:

- ✅ `documents` con `processing_status`, `error_message`, `chunks_count`
- ✅ `document_chunks` con `metadata` (JSONB)
- ✅ `conversations` con RLS abilitato
- ✅ `messages` con RLS abilitato
- ✅ `query_cache` con tutte le colonne

### Funzioni Database
Tutte le funzioni previste esistono e sono aggiornate:

- ✅ `hybrid_search()` - Versione aggiornata con fix text_score scaling
  - Ritorna: `document_filename` (dalla migrazione extra nel DB)
  - Commento: "Hybrid search with improved text_score scaling..."
- ✅ `match_cached_query()` - Fixata (usa alias `qc` per evitare ambiguità)
- ✅ `match_document_chunks()` - Presente
- ✅ `get_chunk_section()`, `get_chunk_content_type()`, `get_chunk_token_count()`, `get_chunk_processing_method()` - Tutte presenti

### Indici
Tutti gli indici previsti esistono:

- ✅ HNSW index su `document_chunks.embedding`
- ✅ GIN index su `document_chunks.content` (full-text search)
- ✅ Indici su `documents.processing_status`
- ✅ Indici parziali su `document_chunks.metadata` (section, contentType, processingMethod)

---

## 🔍 Analisi Migrazioni

### 1. `20240101000000_initial_schema.sql`
**Scopo:** Creazione schema iniziale completo

**Contenuto:**
- Estensione pgvector
- Tabelle: `documents`, `document_chunks`, `conversations`, `messages`, `query_cache`
- Funzioni: `match_document_chunks()`, `hybrid_search()`, `match_cached_query()`
- Indici HNSW e GIN

**Stato:** ✅ Applicata - Struttura base presente e funzionante

**Necessaria?** ✅ **SÌ** - Migrazione fondamentale per il setup iniziale

---

### 2. `20240101000001_storage_bucket.sql`
**Scopo:** Crea storage bucket per documenti

**Contenuto:**
- Crea bucket `documents` (privato)
- Policies per upload/read per utenti autenticati

**Stato:** ✅ Applicata - Bucket esiste (verificato dalla struttura)

**Necessaria?** ✅ **SÌ** - Il bucket viene utilizzato per storage temporaneo durante il processing:
- `app/api/upload/route.ts` - Uploada file nel bucket `documents`
- `supabase/functions/process-document/index.ts` - Scarica file dal bucket per processing

**Nota:** Sebbene `.cursorrules` menzioni che i documenti sono già in SharePoint, il bucket è necessario per il workflow di processing. I file vengono caricati temporaneamente, processati, e poi i chunks vengono salvati nel database. I file originali potrebbero essere rimossi dopo il processing (verificare se c'è cleanup automatico).

---

### 3. `20240101000002_fix_match_cached_query.sql`
**Scopo:** Fix ambiguità colonne nella funzione `match_cached_query`

**Contenuto:**
- Sostituisce la funzione con alias espliciti (`qc.query_embedding` invece di `query_embedding`)

**Stato:** ✅ Applicata - Funzione fixata nel database

**Necessaria?** ✅ **SÌ** - Fix critico per evitare errori SQL

**Nota:** Esiste anche uno script `scripts/apply-migration.ts` che applica questa migrazione manualmente.

---

### 4. `20240101000003_add_processing_status.sql`
**Scopo:** Aggiunge tracking dello stato di processing dei documenti

**Contenuto:**
- Aggiunge `processing_status` (pending, processing, completed, error)
- Aggiunge `error_message` per errori
- Aggiunge `chunks_count` per tracking
- Indice su `processing_status`

**Stato:** ✅ Applicata - Colonne presenti nel database

**Necessaria?** ✅ **SÌ** - Essenziale per il workflow di processing dei documenti

---

### 5. `20240101000004_enable_rls_auth.sql`
**Scopo:** Abilita Row Level Security per conversations e messages

**Contenuto:**
- Abilita RLS su `conversations` e `messages`
- Crea policies per permettere a utenti di vedere/modificare solo le proprie conversazioni
- Assicura che `conversations.user_id` sia NOT NULL

**Stato:** ✅ Applicata - RLS abilitato e policies presenti

**Necessaria?** ✅ **SÌ** - Critico per sicurezza e multi-tenancy

---

### 6. `20241104000001_enhanced_chunks.sql`
**Scopo:** Aggiunge funzioni helper per estrarre metadata dai chunks

**Contenuto:**
- Funzioni: `get_chunk_section()`, `get_chunk_content_type()`, `get_chunk_token_count()`, `get_chunk_processing_method()`
- Indici parziali su metadata per filtering

**Stato:** ✅ Applicata - Funzioni presenti nel database

**Necessaria?** ✅ **SÌ** - Utile per analytics e filtering avanzato

---

### 7. `20241104000002_improved_hybrid_search.sql`
**Scopo:** Migliora la funzione `hybrid_search` con pesi configurabili

**Contenuto:**
- Aggiunge parametro `vector_weight` configurabile (default 0.7)
- Usa `websearch_to_tsquery` invece di `plainto_tsquery` (supporta operatori booleani)
- Usa `ts_rank_cd` con normalizzazione 32
- Ritorna `vector_score` e `text_score` separati
- Aggiunge JOIN con `documents` per `document_filename`

**Stato:** ✅ Applicata - Funzione aggiornata nel database (con fix successivi)

**Necessaria?** ⚠️ **SOSTITUITA** - Questa migrazione è stata sostituita da `20241104000003_fix_text_score_scaling.sql` che migliora ulteriormente la funzione.

**Nota:** La versione nel database include anche `document_filename` dalla migrazione `add_document_metadata_to_search_v2`.

---

### 8. `20241104000003_fix_text_score_scaling.sql`
**Scopo:** Fix scaling del text_score in `hybrid_search`

**Problema risolto:** `ts_rank_cd` con normalizzazione 32 restituiva valori 0-0.1, troppo piccoli rispetto ai vector scores (0-1).

**Soluzione:**
- Cambia normalizzazione da 32 a 1 (più sensibile)
- Applica scaling factor 10x ai text scores
- Cappati i valori a 1.0 con `LEAST()`

**Stato:** ✅ Applicata - Funzione aggiornata nel database (due versioni: `fix_text_score_scaling` e `fix_text_score_scaling_prod`)

**Necessaria?** ✅ **SÌ** - Fix critico per bilanciare vector e text scores

**Nota:** Questa è la versione finale della funzione `hybrid_search` attualmente in uso.

---

## 🎯 Raccomandazioni

### ✅ Mantenere Tutte le Migrazioni
Tutte le migrazioni del repo sono necessarie e applicate. Raccomandazioni:

1. **Sincronizzare i nomi** - Le migrazioni nel database hanno nomi leggermente diversi. Considerare di allineare i nomi se si riapplica il set completo.

2. **Verificare storage bucket** - La migrazione `storage_bucket` potrebbe essere ridondante se i documenti sono già in SharePoint. Verificare se il bucket è effettivamente utilizzato.

3. **Aggiungere migrazione mancante** - La migrazione `add_document_metadata_to_search_v2` (presente nel DB ma non nel repo) dovrebbe essere aggiunta al repo per allineamento completo.

4. **Documentare migrazione extra** - La migrazione `add_document_metadata_to_search_v2` aggiunge `document_filename` alla funzione `hybrid_search`, che è utilizzata dal codice TypeScript. Assicurarsi che questa modifica sia documentata nel repo.

---

## 📝 Prossimi Passi

1. ✅ **Verificare utilizzo storage bucket** - ✅ **FATTO** - Il bucket è utilizzato per storage temporaneo durante il processing. La migrazione è necessaria.

2. ✅ **Aggiungere migrazione mancante al repo** - ✅ **FATTO** - Creata `20241104000004_add_document_metadata_to_search.sql` per allineare il repo con il database.

3. ✅ **Documentare workflow migrazioni** - Stabilire se le migrazioni devono essere applicate via Supabase CLI o manualmente, e documentare il processo.

4. ✅ **Verificare timestamp** - Considerare se è necessario allineare i timestamp delle migrazioni nel repo con quelli nel database, o se è accettabile mantenere la discrepanza.

---

## 🔗 Riferimenti

- **Codice che usa `hybrid_search`:** `lib/supabase/vector-operations.ts`
- **Codice che usa `match_cached_query`:** `lib/supabase/semantic-cache.ts`
- **Script di applicazione manuale:** `scripts/apply-migration.ts`
- **Documentazione analisi similarity:** `docs/ANALISI_SIMILARITY_ISSUES.md`

