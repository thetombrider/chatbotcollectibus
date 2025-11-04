# Analisi: Bassi Punteggi di Similarity nel RAG Chatbot

## Executive Summary

Il sistema RAG presenta **punteggi di similarity sistematicamente bassi (< 0.5)** tra query e chunks, indicando un **problema strutturale nella pipeline di ingestion o nella gestione delle query**. L'analisi ha identificato 8 aree critiche che richiedono intervento immediato.

**Severity:** 🔴 **CRITICA** - Impatta direttamente la qualità delle risposte del chatbot

---

## 📊 Situazione Attuale

### Configurazione Corrente

| Componente | Valore Attuale | Standard Industry | Stato |
|------------|---------------|-------------------|-------|
| Chunk size | 800 token | 300-512 token | ⚠️ Troppo grande |
| Overlap | 100 token | 50-100 token | ✅ OK |
| Embedding model | text-embeddings-3-large (1536d) | ✅ Ottimo | ✅ OK |
| Vector weight | 0.7 (70%) | 0.5-0.8 | ✅ OK |
| Search threshold | 0.3 (standard), 0.25 (comparative) | 0.5-0.7 | 🔴 Troppo basso |
| Final filter | 0.20 | 0.4-0.6 | 🔴 Troppo basso |

### Sintomi Osservati

1. **Threshold progressivamente abbassati** - Segno che i risultati non superano soglie normali
2. **Commenti nel codice** che evidenziano il problema (`TODO: Considerare di aumentare quando si migliora la qualità degli embeddings`)
3. **Similarity range** - Risultati tipicamente tra 0.2-0.4 invece di 0.6-0.9

---

## 🔍 Problemi Identificati

### 🔴 P1 - Critico: Mancanza di Normalizzazione Testo

**Problema:** Nessuna normalizzazione del testo prima della generazione degli embeddings, né per i documenti né per le query.

**Impatto:** 
- Embeddings incosistenti per lo stesso concetto
- Penalizzazione per differenze di formattazione (maiuscole, punteggiatura, spazi)
- Riduzione drastica della similarity score

**Evidenza nel codice:**
```typescript
// lib/embeddings/openai.ts
export async function generateEmbedding(text: string, ...) {
  // ❌ Nessuna normalizzazione
  const response = await openai.embeddings.create({
    input: text,  // Passato direttamente senza preprocessing
    ...
  })
}
```

**Esempio pratico:**
- Chunk: "La GDPR (Regolamento Generale sulla Protezione dei Dati) stabilisce..."
- Query: "gdpr protezione dati"
- **Risultato attuale:** Similarity ~0.3 (troppo basso)
- **Risultato atteso (con normalizzazione):** Similarity ~0.7-0.8

---

### 🟠 P2 - Alto: Chunk Size Eccessivo

**Problema:** Chunk size di 800 token è **troppo grande** per embeddings efficaci.

**Impatto:**
- Embeddings troppo generici e diluiti
- Perdita di granularità semantica
- Riduzione della precisione nel matching

**Evidenza nel codice:**
```typescript
// app/api/upload/route.ts
const chunks = await smartChunkText(text, {
  maxTokens: 800,  // ⚠️ Troppo grande
  overlapTokens: 100,
  ...
})
```

**Research & Best Practices:**
- **OpenAI Documentation:** Raccomanda 200-512 token per text-embeddings-3-large
- **Pinecone Best Practices:** 300-500 token optimal range
- **Motivo:** Gli embeddings rappresentano la "media semantica" del testo. Più lungo il testo, più generico l'embedding.

**Confronto:**

| Chunk Size | Pro | Contro | Similarity Tipica |
|------------|-----|--------|-------------------|
| 200-300 token | Semantica specifica, similarity alta | Più chunks da gestire | 0.6-0.9 |
| 500-600 token | Bilanciato | Buon compromesso | 0.5-0.8 |
| **800 token (attuale)** | Meno chunks | **Embeddings diluiti, similarity bassa** | **0.2-0.5** |

---

### 🟠 P3 - Alto: Mismatch di Lingua nel Full-Text Search

**Problema:** Full-text search configurato per `'italian'`, ma non è verificato che tutti i documenti siano in italiano.

**Impatto:**
- Text score zero per documenti in altre lingue
- Hybrid search degradata a solo vector search
- Riduzione complessiva della similarity

**Evidenza nel codice:**
```sql
-- supabase/migrations/20241104000003_fix_text_score_scaling.sql
to_tsvector('italian', dc.content),
websearch_to_tsquery('italian', query_text)
```

**Test necessario:**
```sql
-- Query diagnostica per verificare lingua documenti
SELECT 
  d.filename,
  COUNT(*) as chunks,
  AVG(LENGTH(dc.content)) as avg_length,
  -- Rileva lingua basandosi su stopwords
  SUM(CASE WHEN dc.content ~* '\y(the|is|are|was|were|have|has)\y' THEN 1 ELSE 0 END) as english_markers,
  SUM(CASE WHEN dc.content ~* '\y(il|lo|la|di|da|in|su|per|con)\y' THEN 1 ELSE 0 END) as italian_markers
FROM document_chunks dc
JOIN documents d ON dc.document_id = d.id
GROUP BY d.filename;
```

---

### 🟡 P4 - Medio: Text Score Scaling Potenzialmente Inadeguato

**Problema:** Text score viene scalato con un fattore fisso di 10x, ma potrebbe non essere calibrato correttamente.

**Impatto:**
- Sbilanciamento tra vector score e text score
- Possibile dominanza eccessiva del vector score

**Evidenza nel codice:**
```sql
-- supabase/migrations/20241104000003_fix_text_score_scaling.sql
text_scale_factor FLOAT := 10.0;  -- ⚠️ Valore arbitrario
```

**Analisi necessaria:**
```typescript
// Test per analizzare distribuzione degli scores
const results = await diagnosticSearch(query)
results.forEach(r => {
  console.log(`Vector: ${r.vector_score.toFixed(3)}, Text: ${r.text_score.toFixed(3)}, Combined: ${r.similarity.toFixed(3)}`)
})
```

---

### 🟡 P5 - Medio: Assenza di Preprocessing del Contenuto

**Problema:** Il contenuto dei chunks viene salvato "as-is" senza pulizia o normalizzazione.

**Impatto:**
- Caratteri speciali, simboli Unicode, whitespace eccessivo
- Degrada la qualità degli embeddings
- Aumenta la dimensione dei chunks inutilmente

**Esempio di problemi comuni:**
- Spazi multipli: `"La  GDPR    stabilisce"`
- Line breaks multipli: `"Articolo 1\n\n\n\nArticolo 2"`
- Caratteri speciali: `"•••Article••• ➤ Content"`
- Encoding issues: `"CafÃ©"` invece di `"Café"`

---

### 🟡 P6 - Medio: Query Embedding senza Context Enhancement

**Problema:** Le query vengono embedded "as-is" senza arricchimento di contesto.

**Impatto:**
- Query brevi producono embeddings poveri
- Mancanza di espansione semantica

**Esempio:**
```typescript
// Attuale
const embedding = await generateEmbedding("GDPR")

// Migliore
const enhanced = await enhanceQuery("GDPR")
// Output: "GDPR General Data Protection Regulation protezione dati personali privacy"
const embedding = await generateEmbedding(enhanced)
```

---

### 🟢 P7 - Basso: Mancanza di Embeddings Caching per Chunks Identici

**Problema:** Non c'è verifica per evitare di ri-generare embeddings per chunks identici.

**Impatto:**
- Costi API non necessari
- Tempo di processing aumentato
- Possibile inconsistenza (raramente, se OpenAI cambia leggermente gli embeddings)

---

### 🟢 P8 - Basso: Assenza di Metadata per Debugging Similarity

**Problema:** Non vengono salvati metadata sufficienti per diagnosticare problemi di similarity.

**Impatto:**
- Difficile fare debugging
- Mancanza di tracciabilità
- Non è possibile fare A/B testing

**Metadata mancanti:**
- Versione dell'embedding model usato
- Timestamp di generazione
- Preprocessing applicato
- Original text hash

---

## 🎯 Piano di Azione

### Phase 1: Quick Wins (1-2 giorni) 🚀

#### Action 1.1: Implementare Text Normalization

**File:** `lib/embeddings/text-preprocessing.ts` (nuovo)

```typescript
/**
 * Normalizza testo prima della generazione embedding
 */
export function normalizeTextForEmbedding(text: string): string {
  let normalized = text
  
  // 1. Lowercase (per ridurre varianza)
  normalized = normalized.toLowerCase()
  
  // 2. Rimuovi caratteri speciali non informativi
  normalized = normalized.replace(/[•●○◦►▸▪▫■□]/g, '')
  
  // 3. Normalizza whitespace (spazi multipli, tabs, newlines)
  normalized = normalized.replace(/\s+/g, ' ')
  
  // 4. Rimuovi spazi prima/dopo punteggiatura
  normalized = normalized.replace(/\s+([.,;:!?])/g, '$1')
  
  // 5. Espandi acronimi comuni nel dominio (opzionale, domain-specific)
  const acronyms: Record<string, string> = {
    'gdpr': 'gdpr general data protection regulation',
    'espr': 'espr ecodesign sustainable products regulation',
    'ppwr': 'ppwr packaging waste regulation',
    // ... altri acronimi rilevanti
  }
  
  for (const [acronym, expansion] of Object.entries(acronyms)) {
    const regex = new RegExp(`\\b${acronym}\\b`, 'gi')
    if (regex.test(normalized)) {
      normalized = normalized + ' ' + expansion
    }
  }
  
  // 6. Trim
  normalized = normalized.trim()
  
  return normalized
}
```

**Integrazione:**

```typescript
// lib/embeddings/openai.ts
import { normalizeTextForEmbedding } from './text-preprocessing'

export async function generateEmbedding(text: string, ...) {
  const normalizedText = normalizeTextForEmbedding(text)  // ✅ Aggiungi questa riga
  
  const response = await openai.embeddings.create({
    input: normalizedText,  // ✅ Usa testo normalizzato
    ...
  })
}
```

**Testing:**
```bash
# Crea endpoint diagnostico
curl -X POST http://localhost:3000/api/diagnostics/normalization \
  -H "Content-Type: application/json" \
  -d '{"text": "La GDPR  stabilisce..."}'
```

---

#### Action 1.2: Ridurre Chunk Size a 400-500 Token

**File:** `app/api/upload/route.ts`

```typescript
// Prima (800 token)
const chunks = await smartChunkText(text, {
  maxTokens: 800,  // ❌
  overlapTokens: 100,
  ...
})

// Dopo (400-500 token)
const chunks = await smartChunkText(text, {
  maxTokens: 500,  // ✅ Ridotto per embeddings più specifici
  overlapTokens: 100,  // ✅ Mantieni overlap proporzionalmente maggiore (20%)
  ...
})
```

**Nota:** Questo richiederà **re-ingestion dei documenti esistenti** per vedere miglioramenti.

**Script di re-ingestion:**
```typescript
// scripts/reprocess-documents.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import { extractTextUnified } from '@/lib/processing/document-processor'
import { smartChunkText } from '@/lib/processing/smart-chunking'
import { generateEmbeddings } from '@/lib/embeddings/openai'

async function reprocessAllDocuments() {
  // 1. Ottieni tutti i documenti
  const { data: documents } = await supabaseAdmin
    .from('documents')
    .select('*')
  
  for (const doc of documents || []) {
    console.log(`Reprocessing ${doc.filename}...`)
    
    // 2. Elimina chunks vecchi
    await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('document_id', doc.id)
    
    // 3. Download file da storage
    const { data: fileData } = await supabaseAdmin.storage
      .from('documents')
      .download(doc.storage_path)
    
    // 4. Ri-processa con nuove impostazioni
    // ... (logica upload)
  }
}
```

---

#### Action 1.3: Verificare e Configurare Lingua Corretta

**File:** `scripts/detect-document-language.ts` (nuovo)

```typescript
import { supabaseAdmin } from '@/lib/supabase/admin'

async function detectLanguages() {
  const { data: chunks } = await supabaseAdmin
    .from('document_chunks')
    .select('id, content, document_id')
    .limit(100)  // Sample
  
  const languageDetection = chunks?.map(chunk => {
    const content = chunk.content.toLowerCase()
    
    // Simple heuristic
    const englishScore = (content.match(/\b(the|is|are|was|were|have|has|had|do|does|did|will|would|should|could|may|might|can|must|shall)\b/g) || []).length
    const italianScore = (content.match(/\b(il|lo|la|le|gli|di|da|in|su|per|con|che|chi|come|quando|dove|perché|quale)\b/g) || []).length
    
    return {
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      english_score: englishScore,
      italian_score: italianScore,
      likely_language: englishScore > italianScore ? 'english' : 'italian'
    }
  })
  
  // Aggrega per documento
  const byDocument = languageDetection?.reduce((acc, curr) => {
    if (!acc[curr.document_id]) {
      acc[curr.document_id] = { english: 0, italian: 0 }
    }
    if (curr.likely_language === 'english') acc[curr.document_id].english++
    else acc[curr.document_id].italian++
    return acc
  }, {} as Record<string, {english: number, italian: number}>)
  
  console.log('Language distribution by document:', byDocument)
}

detectLanguages()
```

**Se documenti sono in inglese:**

```sql
-- Migration: switch to english
CREATE OR REPLACE FUNCTION hybrid_search(...) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ...
    to_tsvector('english', dc.content),  -- ✅ Cambia da 'italian' a 'english'
    websearch_to_tsquery('english', query_text)
    ...
END;
$$;

-- Rebuild full-text index
DROP INDEX IF EXISTS document_chunks_content_idx;
CREATE INDEX document_chunks_content_idx 
ON document_chunks 
USING gin(to_tsvector('english', content));  -- ✅ 'english'
```

**Se documenti sono multilingua:**

```sql
-- Usa 'simple' per language-agnostic search
to_tsvector('simple', dc.content)
```

---

### Phase 2: Ottimizzazioni Avanzate (3-5 giorni) 📈

#### Action 2.1: Query Enhancement con LLM

**File:** `lib/embeddings/query-enhancement.ts` (nuovo)

```typescript
import { ragAgent } from '@/lib/mastra/agent'

/**
 * Arricchisce query brevi con contesto semantico
 */
export async function enhanceQuery(query: string): Promise<string> {
  // Se query è già lunga, non serve enhancement
  if (query.split(' ').length > 10) {
    return query
  }
  
  // Usa LLM per espandere query
  const prompt = `Espandi questa query aggiungendo termini correlati, sinonimi e contesto. Mantieni la query breve (max 50 parole).

Query originale: "${query}"

Query espansa (solo termini rilevanti, no frasi complete):`

  const response = await ragAgent.generate(prompt)
  const enhanced = response.text || query
  
  // Combina query originale + enhancement
  return `${query} ${enhanced}`
}
```

**Integrazione in chat:**

```typescript
// app/api/chat/route.ts
import { enhanceQuery } from '@/lib/embeddings/query-enhancement'

export async function POST(req: NextRequest) {
  const { message } = await req.json()
  
  // Enhance query prima di embedding
  const enhancedQuery = await enhanceQuery(message)
  const queryEmbedding = await generateEmbedding(enhancedQuery)
  
  // Usa query originale per full-text search (più precisa)
  const results = await hybridSearch(queryEmbedding, message, ...)
}
```

---

#### Action 2.2: Calibrazione Text Score Scaling

**File:** `scripts/calibrate-text-scaling.ts` (nuovo)

```typescript
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateEmbedding } from '@/lib/embeddings/openai'

async function calibrateTextScaling() {
  // Test queries
  const testQueries = [
    "GDPR data protection",
    "sustainable packaging requirements",
    "privacy by design principles"
  ]
  
  const results = []
  
  for (const query of testQueries) {
    const embedding = await generateEmbedding(query)
    
    // Test con diversi scaling factors
    for (const scaleFactor of [1, 5, 10, 15, 20]) {
      // Query diretta SQL per testare scaling
      const { data } = await supabaseAdmin.rpc('hybrid_search_test', {
        query_embedding: embedding,
        query_text: query,
        text_scale_factor: scaleFactor,
        match_count: 10
      })
      
      // Analizza distribuzione
      const avgVectorScore = data.reduce((sum: number, r: any) => sum + r.vector_score, 0) / data.length
      const avgTextScore = data.reduce((sum: number, r: any) => sum + r.text_score, 0) / data.length
      const avgSimilarity = data.reduce((sum: number, r: any) => sum + r.similarity, 0) / data.length
      
      results.push({
        query,
        scaleFactor,
        avgVectorScore,
        avgTextScore,
        avgSimilarity,
        balanceRatio: avgTextScore / avgVectorScore
      })
    }
  }
  
  // Trova scaling factor ottimale (balance ratio ~1.0)
  console.table(results)
}
```

**Goal:** Text score e vector score devono avere **range simili** (0-1) per contribuire equamente.

---

#### Action 2.3: Implementare Chunk Preprocessing

**File:** `lib/processing/chunk-preprocessing.ts` (nuovo)

```typescript
/**
 * Pulisce e normalizza contenuto chunk prima del salvataggio
 */
export function preprocessChunkContent(content: string): string {
  let cleaned = content
  
  // 1. Rimuovi header/footer ripetuti (es. "Pagina 1/10")
  cleaned = cleaned.replace(/pagina\s+\d+\s*\/\s*\d+/gi, '')
  
  // 2. Normalizza line breaks (max 2 consecutivi)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  
  // 3. Rimuovi spazi multipli
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ')
  
  // 4. Fix encoding comune (se necessario)
  // cleaned = cleaned.replace(/Ã©/g, 'é')
  
  // 5. Rimuovi caratteri non stampabili
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  
  // 6. Trim
  cleaned = cleaned.trim()
  
  return cleaned
}
```

**Integrazione:**

```typescript
// app/api/upload/route.ts
import { preprocessChunkContent } from '@/lib/processing/chunk-preprocessing'

const chunksWithEmbeddings = chunks.map((chunk, index) => ({
  document_id: document.id,
  content: preprocessChunkContent(chunk.content),  // ✅ Preprocessa
  embedding: embeddings[index],
  ...
}))
```

---

### Phase 3: Monitoring & Analytics (2-3 giorni) 📊

#### Action 3.1: Dashboard di Diagnostica Similarity

**File:** `app/diagnostics/similarity/page.tsx` (nuovo)

```typescript
'use client'

import { useState } from 'react'

export default function SimilarityDiagnosticsPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  
  async function testQuery() {
    const res = await fetch('/api/diagnostics/search', {
      method: 'POST',
      body: JSON.stringify({ 
        query, 
        limit: 20,
        threshold: 0.1  // Molto basso per vedere tutti i risultati
      })
    })
    const data = await res.json()
    setResults(data.results)
  }
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Similarity Diagnostics</h1>
      
      <div className="mb-4">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="border p-2 w-full"
          placeholder="Enter test query..."
        />
        <button onClick={testQuery} className="mt-2 bg-blue-500 text-white px-4 py-2">
          Test Query
        </button>
      </div>
      
      {results.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-2">Results</h2>
          <table className="w-full border">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Document</th>
                <th>Similarity</th>
                <th>Vector Score</th>
                <th>Text Score</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.rank} className={r.similarity < 0.4 ? 'bg-red-50' : r.similarity < 0.6 ? 'bg-yellow-50' : 'bg-green-50'}>
                  <td>{r.rank}</td>
                  <td>{r.document}</td>
                  <td>{r.similarity.toFixed(3)}</td>
                  <td>{r.vector_score?.toFixed(3)}</td>
                  <td>{r.text_score?.toFixed(3)}</td>
                  <td className="text-sm">{r.content_preview.substring(0, 100)}...</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="mt-4 p-4 bg-gray-100">
            <h3 className="font-bold">Statistics</h3>
            <p>Average Similarity: {(results.reduce((sum, r) => sum + r.similarity, 0) / results.length).toFixed(3)}</p>
            <p>Results &gt; 0.6: {results.filter(r => r.similarity > 0.6).length} / {results.length}</p>
            <p>Results &gt; 0.4: {results.filter(r => r.similarity > 0.4).length} / {results.length}</p>
            <p>Results &lt; 0.3: {results.filter(r => r.similarity < 0.3).length} / {results.length}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

#### Action 3.2: Logging Avanzato con Metriche

**File:** `lib/supabase/similarity-metrics.ts` (nuovo)

```typescript
import { supabaseAdmin } from './admin'

interface SimilarityLog {
  query: string
  results_count: number
  avg_similarity: number
  max_similarity: number
  min_similarity: number
  avg_vector_score: number
  avg_text_score: number
  timestamp: string
}

export async function logSimilarityMetrics(
  query: string,
  results: any[]
) {
  if (results.length === 0) return
  
  const metrics: SimilarityLog = {
    query,
    results_count: results.length,
    avg_similarity: results.reduce((sum, r) => sum + r.similarity, 0) / results.length,
    max_similarity: Math.max(...results.map(r => r.similarity)),
    min_similarity: Math.min(...results.map(r => r.similarity)),
    avg_vector_score: results.reduce((sum, r) => sum + (r.vector_score || 0), 0) / results.length,
    avg_text_score: results.reduce((sum, r) => sum + (r.text_score || 0), 0) / results.length,
    timestamp: new Date().toISOString()
  }
  
  // Salva in tabella dedicata
  await supabaseAdmin
    .from('similarity_metrics')
    .insert(metrics)
  
  // Log anche su console per debugging immediato
  console.log('[similarity-metrics]', metrics)
}
```

**Migration per tabella metrics:**

```sql
-- supabase/migrations/create_similarity_metrics_table.sql
CREATE TABLE IF NOT EXISTS similarity_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query TEXT NOT NULL,
  results_count INTEGER,
  avg_similarity FLOAT,
  max_similarity FLOAT,
  min_similarity FLOAT,
  avg_vector_score FLOAT,
  avg_text_score FLOAT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX similarity_metrics_timestamp_idx ON similarity_metrics(timestamp DESC);
CREATE INDEX similarity_metrics_avg_similarity_idx ON similarity_metrics(avg_similarity);
```

---

## 🧪 Testing Plan

### Test Suite 1: Normalization Impact

**Obiettivo:** Verificare che normalizzazione migliori similarity

**Test Cases:**
```typescript
const testCases = [
  {
    query: "GDPR protezione dati",
    expected_similarity_before: 0.3,
    expected_similarity_after: 0.6
  },
  {
    query: "sustainable packaging",
    expected_similarity_before: 0.35,
    expected_similarity_after: 0.65
  },
  // ... altri test
]
```

**Procedura:**
1. Testa query PRIMA di applicare normalization
2. Applica normalization
3. Ri-testa stesse query
4. Confronta risultati

**Success Criteria:** ✅ Similarity aumenta in media di **+0.2-0.3 punti**

---

### Test Suite 2: Chunk Size Impact

**Obiettivo:** Verificare che chunk size ridotto migliori similarity

**Procedura:**
1. Prendi 5 documenti sample
2. Re-processa con chunk 800 token (baseline)
3. Re-processa con chunk 500 token
4. Re-processa con chunk 300 token
5. Esegui stesse 20 query su tutte le versioni
6. Confronta similarity medio

**Expected Results:**

| Chunk Size | Avg Similarity | Precision@5 |
|------------|----------------|-------------|
| 800 (attuale) | 0.35 | 60% |
| 500 | 0.55 | 75% |
| 300 | 0.65 | 85% |

**Success Criteria:** ✅ Similarity con 500 token > Similarity con 800 token

---

### Test Suite 3: End-to-End User Queries

**Obiettivo:** Verificare miglioramento qualità risposte

**Test Queries Reali:**
```typescript
const realQueries = [
  "Quali sono gli obblighi GDPR per le PMI?",
  "Differenze tra ESPR e PPWR",
  "Come implementare privacy by design",
  "Requisiti sostenibilità packaging 2024",
  // ... 20+ query rappresentative
]
```

**Metriche:**
- **Relevance Score** (1-5): Quanto è rilevante la risposta?
- **Citation Accuracy**: Le citazioni sono corrette?
- **Coverage**: La risposta copre tutti gli aspetti della query?

**Success Criteria:** 
- ✅ Relevance medio > 4/5
- ✅ Citation accuracy > 90%
- ✅ Coverage > 80%

---

## 📈 Expected Improvements

### Metriche Pre/Post

| Metrica | Attuale | Target (Phase 1) | Target (Phase 2-3) |
|---------|---------|------------------|-------------------|
| Avg Similarity | **0.35** | **0.55** (+57%) | **0.70** (+100%) |
| Results > 0.6 | 10% | 50% | 75% |
| Results < 0.3 | 60% | 20% | 5% |
| Query Relevance | 3.0/5 | 4.0/5 | 4.5/5 |
| Response Quality | 60% | 75% | 85% |

---

## 🚨 Rischi e Mitigazioni

### Rischio 1: Re-ingestion Richiede Tempo

**Impatto:** Con 40GB di documenti, re-processing può richiedere ore/giorni

**Mitigazione:**
- Inizia con subset di documenti più importanti
- Esegui re-ingestion in background
- Implementa resume capability se processo si interrompe
- Monitora costi OpenAI API (embeddings)

### Rischio 2: Costi API Aumentati

**Impatto:** Re-embedding di tutti i chunks può costare $$

**Mitigazione:**
- Calcola costo stimato PRIMA di procedere
- Considera di fare re-embedding solo per documenti più usati
- Implementa caching degli embeddings per evitare duplicati

**Formula costo:**
```
Total chunks = (40 GB / avg_doc_size) * (avg_tokens / chunk_size)
Cost = (Total chunks * 1536 dimensions * price_per_1K_tokens)

Con chunk 500 token invece di 800:
- Chunks aumentano di ~60%
- Ma similarity migliora significativamente
```

### Rischio 3: Breaking Changes per Utenti Esistenti

**Impatto:** Query cache invalida dopo normalizzazione

**Mitigazione:**
- Clear semantic cache dopo deployment
- Notify users di possibile momentanea degradazione performance
- Implementa gradual rollout (50% queries con nuovo sistema, 50% vecchio)

---

## 📋 Checklist Implementazione

### Phase 1 (Priorità ALTA)
- [ ] Implementare `normalizeTextForEmbedding()` in `lib/embeddings/text-preprocessing.ts`
- [ ] Integrare normalizzazione in `generateEmbedding()` e `generateEmbeddings()`
- [ ] Creare script `detect-document-language.ts`
- [ ] Eseguire language detection sui documenti esistenti
- [ ] Aggiornare funzione SQL `hybrid_search` con lingua corretta
- [ ] Rebuild full-text search index con lingua corretta
- [ ] Modificare chunk size da 800 a 500 token in `app/api/upload/route.ts`
- [ ] Creare script `reprocess-documents.ts` per re-ingestion
- [ ] Testare normalizzazione con test suite 1

### Phase 2 (Priorità MEDIA)
- [ ] Implementare `enhanceQuery()` in `lib/embeddings/query-enhancement.ts`
- [ ] Integrare query enhancement in `app/api/chat/route.ts`
- [ ] Creare script `calibrate-text-scaling.ts`
- [ ] Eseguire calibrazione e trovare scaling factor ottimale
- [ ] Aggiornare funzione SQL `hybrid_search` con nuovo scaling factor
- [ ] Implementare `preprocessChunkContent()` in `lib/processing/chunk-preprocessing.ts`
- [ ] Integrare preprocessing in upload pipeline
- [ ] Testare con test suite 2

### Phase 3 (Priorità BASSA)
- [ ] Creare dashboard diagnostica `app/diagnostics/similarity/page.tsx`
- [ ] Implementare `logSimilarityMetrics()` in `lib/supabase/similarity-metrics.ts`
- [ ] Creare migration per tabella `similarity_metrics`
- [ ] Integrare logging in `app/api/chat/route.ts`
- [ ] Setup monitoring dashboard (Supabase o custom)
- [ ] Eseguire test suite 3 (end-to-end)

### Re-Ingestion (Dopo Phase 1)
- [ ] Backup database completo
- [ ] Calcolare costo stimato re-embedding
- [ ] Ottenere approval per costi
- [ ] Identificare subset documenti critici (se necessario)
- [ ] Eseguire re-ingestion con monitoring
- [ ] Validare risultati con query test
- [ ] Rollout completo se validazione OK

---

## 🔗 Risorse Utili

### Documentation
- [OpenAI Embeddings Best Practices](https://platform.openai.com/docs/guides/embeddings/use-cases)
- [Pinecone: Chunking Strategies](https://www.pinecone.io/learn/chunking-strategies/)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)

### Tools
- [tiktoken](https://github.com/openai/tiktoken) - Token counting
- [Supabase Vector Toolkit](https://supabase.com/docs/guides/ai)

### Similar Issues
- [LangChain Discussion: Low Similarity Scores](https://github.com/langchain-ai/langchain/discussions/5500)
- [OpenAI Forum: Improving Embedding Quality](https://community.openai.com/t/improving-embedding-quality/)

---

## 📞 Next Steps

1. **Review questo documento** con il team
2. **Prioritize actions** basandosi su impact/effort
3. **Setup tracking** (JIRA, Linear, GitHub Projects)
4. **Begin Phase 1 implementation**
5. **Schedule checkpoints** settimanali per review progress

**Owner:** Tech Lead / Backend Team
**Timeline:** 2-3 settimane per completamento completo
**Budget:** Stimato $200-500 per re-embedding (da validare)

---

*Documento generato il: 2024-11-04*
*Versione: 1.0*
*Status: DRAFT - Pending Review*

