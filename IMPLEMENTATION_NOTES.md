# Mistral OCR Integration - Implementation Notes

## ✅ Implementazione Completata

Tutte le funzionalità del piano sono state implementate con successo:

### File Creati/Modificati:

1. **Moduli di Processing:**
   - `lib/processing/mistral-ocr.ts` - Integrazione Mistral OCR API
   - `lib/processing/document-analyzer.ts` - Analizzatore strategia processing
   - `lib/processing/smart-chunking.ts` - Smart chunking con tiktoken
   - `lib/processing/document-processor.ts` - Funzione `extractTextUnified()` aggiunta

2. **Database:**
   - `supabase/migrations/20241104000001_enhanced_chunks.sql` - Utility functions per metadata
   - `supabase/migrations/20241104000002_improved_hybrid_search.sql` - Hybrid search migliorata

3. **API Routes:**
   - `app/api/upload/route.ts` - Aggiornata per usare OCR e smart chunking
   - `app/api/chat/route.ts` - Aggiornata per usare hybrid search migliorata

4. **Types:**
   - `lib/supabase/database.types.ts` - Aggiornato SearchResult type
   - `lib/supabase/vector-operations.ts` - Aggiornata funzione hybridSearch()

5. **Dependencies:**
   - Installato `@dqbd/tiktoken` per token counting preciso

---

## 🚀 Prossimi Passi (RICHIESTO)

### 1. Configurare Mistral API Key

Aggiungi al tuo file `.env.local`:

```bash
MISTRAL_API_KEY=your_mistral_api_key_here
```

> **Nota:** L'API key Mistral è **opzionale**. Se non configurata, il sistema farà automaticamente fallback a native extraction per tutti i PDF.

### 2. Applicare Migration SQL

Le migration devono essere applicate manualmente al database Supabase:

#### Opzione A: Via Supabase Dashboard (CONSIGLIATO)

1. Vai su **Supabase Dashboard** → **SQL Editor**
2. Apri e esegui in ordine:
   - `supabase/migrations/20241104000001_enhanced_chunks.sql`
   - `supabase/migrations/20241104000002_improved_hybrid_search.sql`

#### Opzione B: Via Supabase CLI (se installata)

```bash
npx supabase db push
```

### 3. Verificare l'Installazione

Esegui il type checking:

```bash
npm run type-check
```

Dovrebbe completare senza errori.

---

## 📊 Come Funziona

### Pipeline di Ingestion

```
File Upload
    ↓
Document Analyzer (decide strategia)
    ↓
    ├─→ PDF con text density < 0.05  → Mistral OCR (Markdown)
    ├─→ PDF con layout complesso     → Mistral OCR (Markdown)
    ├─→ PDF standard                 → Native extraction (plain text)
    ├─→ DOCX/TXT                     → Native extraction (plain text)
    ↓
Smart Chunking (tiktoken)
    - Max 800 tokens per chunk
    - Overlap 100 tokens
    - Preserva struttura Markdown
    - Metadata ricchi (section, contentType, tokenCount)
    ↓
Embeddings (OpenAI)
    ↓
Storage in Supabase
```

### Hybrid Search Migliorata

```
User Query
    ↓
Generate Embedding (OpenAI)
    ↓
Hybrid Search (Postgres)
    - Vector similarity (default 70%)
    - Full-text search (default 30%)
    - websearch_to_tsquery (supporta AND, OR, "phrase")
    - ts_rank_cd (normalizzato per lunghezza)
    ↓
Filter by threshold (0.3 default)
    ↓
Return top-K chunks con metadata
```

---

## 🧪 Testing

### Test Manuali Consigliati

1. **PDF Testuale Nativo:**
   - Upload un report PDF normale
   - Verifica log: `Processing method: native`
   - Aspettativa: Veloce (~1-2s), no costi Mistral

2. **PDF Scansionato:**
   - Upload un documento scansionato (immagine)
   - Verifica log: `Processing method: mistral-ocr`
   - Aspettativa: Più lento (~5-10s), costi Mistral, output Markdown

3. **PDF con Tabelle:**
   - Upload un PDF con tabelle complesse
   - Verifica log: potrebbe usare OCR se layout complesso
   - Aspettativa: Tabelle preservate in formato Markdown

4. **DOCX/TXT:**
   - Upload file Word o text
   - Verifica log: `Processing method: native`
   - Aspettativa: MAI usa OCR (come da specifica)

### Verificare Metadata nei Chunks

Dopo l'upload, controlla il database:

```sql
SELECT 
  metadata->>'section' as section,
  metadata->>'contentType' as content_type,
  metadata->>'tokenCount' as token_count,
  metadata->>'processingMethod' as processing_method,
  content
FROM document_chunks
ORDER BY created_at DESC
LIMIT 5;
```

### Testare Hybrid Search

```sql
-- Test direct SQL (sostituisci con vero embedding)
SELECT 
  id,
  content,
  similarity,
  vector_score,
  text_score,
  document_filename
FROM hybrid_search(
  '[...embedding array...]'::vector(1536),
  'fintech cybersecurity',
  0.7,
  5,
  0.7
);
```

---

## 📈 Metriche da Monitorare

### Costi Mistral OCR

- ~$0.10-0.15 per documento da 20 pagine
- OCR applicato solo a PDF che ne hanno bisogno
- Log ogni chiamata OCR con timing

### Performance

- **Native extraction:** ~1-2s per documento
- **Mistral OCR:** ~5-10s per documento (dipende da pagine)
- **Smart chunking:** +0.5s per tiktoken (trascurabile)
- **Hybrid search:** invariato (~100-200ms)

### Qualità Chunks

Verifica nei log:
```
[api/upload] Created 25 chunks for report.pdf
[api/upload] Average tokens per chunk: 750
```

Target: 600-800 tokens medi per chunk

### Retrieval Quality

Monitora similarity scores nelle query:
- `vector_score`: quanto è simile semanticamente
- `text_score`: quanto matcha keyword/full-text
- `similarity`: score combinato

---

## 🔧 Troubleshooting

### "MISTRAL_API_KEY not configured"

**Causa:** Variabile ambiente mancante  
**Soluzione:** Aggiungi `MISTRAL_API_KEY` a `.env.local` o accetta che OCR non verrà usato

### "tiktoken error"

**Causa:** Libreria non installata correttamente  
**Soluzione:**
```bash
npm install @dqbd/tiktoken --force
```

### Migration SQL fallisce

**Causa:** Permessi insufficienti o syntax error  
**Soluzione:** Copia e incolla manualmente via Supabase Dashboard SQL Editor

### PDF scansionato estratto con native invece di OCR

**Causa:** Text density sopra soglia  
**Soluzione:** La soglia 0.05 può essere troppo bassa. Modifica in `document-analyzer.ts`:
```typescript
if (textDensity < 0.10) { // aumenta a 0.10
```

### Chunks troppo piccoli/grandi

**Causa:** Parametri di chunking  
**Soluzione:** Modifica in `app/api/upload/route.ts`:
```typescript
const chunks = await smartChunkText(text, {
  maxTokens: 1000,  // aumenta da 800
  overlapTokens: 150, // aumenta da 100
  // ...
})
```

---

## 🎯 Miglioramenti Futuri (Non Implementati)

Come discusso nell'analisi, questi sono miglioramenti avanzati per future iterazioni:

1. **Re-ranking con Cross-Encoder** (Fase 2)
   - Usa HuggingFace `BAAI/bge-reranker-base`
   - Migliora precision per query ambigue

2. **Query Expansion** (Fase 2)
   - NER per estrarre entità
   - Espansione con sinonimi
   - Intent classification

3. **MMR (Maximal Marginal Relevance)** (Fase 2)
   - Diversifica risultati
   - Copre aspetti differenti della query

4. **Analytics Dashboard** (Fase 3)
   - Metriche retrieval (MRR, NDCG@5)
   - User feedback (👍👎)
   - A/B testing framework

---

## 📝 Checklist Pre-Production

- [ ] Mistral API key configurata (opzionale)
- [ ] Migration SQL applicate
- [ ] Type checking passa (`npm run type-check`)
- [ ] Test manuale con PDF nativo
- [ ] Test manuale con PDF scansionato (se hai Mistral key)
- [ ] Test manuale con DOCX
- [ ] Verificato metadata nei chunks
- [ ] Monitorato costi OCR (se applicabile)
- [ ] Configurato monitoring/logging
- [ ] Documentato limiti per team

---

## 🤝 Supporto

Per domande o problemi:
1. Controlla i log console (`[mistral-ocr]`, `[document-analyzer]`, `[smart-chunking]`)
2. Verifica configurazione `.env.local`
3. Controlla Supabase Dashboard per errori SQL
4. Rivedi questo documento per troubleshooting

**Buon lavoro! 🚀**

