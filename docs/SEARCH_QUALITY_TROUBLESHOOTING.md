# Search Quality Troubleshooting

## Problema Riscontrato

Il chatbot non trova documenti rilevanti nella knowledge base anche quando sono stati caricati correttamente.

### Sintomi
- Query restituisce 0 risultati rilevanti
- Nei log: `"Relevant results after filtering: 0"`
- `similarity` scores troppo bassi (~0.24)
- `text_score` sempre 0.000

## Cause Identificate

### 1. **Soglia di rilevanza troppo alta**
- La soglia era impostata a 0.30
- I punteggi di similarity erano ~0.24
- Risultato: tutti i risultati venivano filtrati

### 2. **text_score sempre zero**
- La funzione `hybrid_search` usava normalizzazione 32 in `ts_rank_cd()`
- Questa normalizzazione produce valori molto piccoli (0-0.1)
- Con pesi 70/30 (vector/text), il text_score contribuiva pochissimo al punteggio finale

### 3. **Query troppo generiche**
- Query come "che documenti hai nella knowledge base?" non hanno somiglianza semantica con contenuti tecnici specifici
- Gli embeddings della query e dei chunks sono molto diversi
- vector_score risulta basso (~0.35 invece di >0.7)

## Soluzioni Implementate

### ✅ Fix Immediato: Soglia Abbassata

**File modificato:** `app/api/chat/route.ts`

```typescript
// Prima: const RELEVANCE_THRESHOLD = 0.30
// Dopo:  const RELEVANCE_THRESHOLD = 0.20
```

**Effetto:** Permette risultati con similarity più bassa, utile per query generiche.

**Limitazione:** È un workaround. Con soglie troppo basse si rischiano risultati non rilevanti.

**Stato:** ✅ Applicato

### 🔧 Fix Strutturale: Scaling del text_score

**Migrazione:** `20241104000003_fix_text_score_scaling.sql`

**Cambiamenti:**
1. **Normalizzazione 1 invece di 32**: Più sensibile ai match full-text
2. **Scaling 10x**: Porta text_score da range 0-0.1 a range 0-1
3. **Cap a 1.0**: Mantiene comparabilità con vector_score

**Stato:** ✅ Applicato tramite Supabase MCP

**Risultati dei test:**
Query "conformità documentazione":
- Prima migrazione: text_score ~0.026 (quasi zero)
- Dopo migrazione: text_score ~0.26 (10x più alto)
- Match trovati: 5 chunks rilevanti nel Regolamento ESPR

✅ Verificato che text_score ora contribuisce effettivamente alla ricerca hybrid!

## Tool di Diagnostica

### 1. Verifica Stato Documenti

**Endpoint:** `GET /api/diagnostics/documents`

**Cosa controlla:**
- Quali documenti sono nel database
- Quanti chunks ha ogni documento
- Se i chunks hanno embeddings
- Dimensioni degli embeddings

**Esempio di utilizzo:**
```bash
curl http://localhost:3000/api/diagnostics/documents
```

**Output esempio:**
```json
{
  "success": true,
  "summary": {
    "total_documents": 2,
    "documents_with_chunks": 2,
    "documents_with_embeddings": 2,
    "total_chunks": 45,
    "avg_chunks_per_document": 22.5
  },
  "documents": [
    {
      "filename": "Regolamento ESPR.pdf",
      "chunk_count": 30,
      "has_embeddings": true,
      "embedding_dimensions": 1536
    }
  ]
}
```

### 2. Test Ricerca Hybrid

**Endpoint:** `POST /api/diagnostics/search`

**Cosa fa:**
- Testa la ricerca con parametri configurabili
- Mostra similarity, vector_score, text_score separati
- Permette di ottimizzare i parametri

**Esempio di utilizzo:**
```bash
curl -X POST http://localhost:3000/api/diagnostics/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "regolamento ESPR",
    "limit": 5,
    "threshold": 0.1,
    "vectorWeight": 0.7
  }'
```

**Parametri:**
- `query` (string, required): Testo da cercare
- `limit` (number, optional): Max risultati, default 5
- `threshold` (number, optional): Soglia minima similarity, default 0.1
- `vectorWeight` (number, optional): Peso vector vs text (0-1), default 0.7

**Output esempio:**
```json
{
  "success": true,
  "statistics": {
    "total_results": 5,
    "search_time_ms": 156,
    "avg_similarity": 0.3421,
    "avg_vector_score": 0.3854,
    "avg_text_score": 0.2156,
    "max_similarity": 0.4567,
    "min_similarity": 0.2345
  },
  "results": [
    {
      "rank": 1,
      "document": "Regolamento ESPR.pdf",
      "similarity": 0.4567,
      "vector_score": 0.4234,
      "text_score": 0.3456,
      "content_preview": "..."
    }
  ]
}
```

## Come Interpretare i Punteggi

### Similarity Score (Combined)
| Range | Qualità | Azione |
|-------|---------|--------|
| 0.7 - 1.0 | Ottima | Match molto rilevante |
| 0.5 - 0.7 | Buona | Match rilevante |
| 0.3 - 0.5 | Moderata | Potenzialmente rilevante |
| 0.0 - 0.3 | Bassa | Poco rilevante o query generica |

### Vector Score (Semantic Similarity)
| Range | Significato |
|-------|-------------|
| 0.8 - 1.0 | Query e contenuto molto simili semanticamente |
| 0.6 - 0.8 | Buona similarità semantica |
| 0.4 - 0.6 | Similarità moderata |
| 0.0 - 0.4 | Scarsa similarità (query generica o documento non rilevante) |

### Text Score (Full-Text Match)
**Prima della migrazione (con normalizzazione 32):**
| Range | Significato |
|-------|-------------|
| 0.001 - 0.1 | Match full-text presente |
| 0.000 | Nessun match testuale |

**Dopo la migrazione (con scaling 10x):**
| Range | Significato |
|-------|-------------|
| 0.5 - 1.0 | Match full-text forte (molte parole chiave) |
| 0.1 - 0.5 | Match full-text moderato |
| 0.001 - 0.1 | Match full-text debole |
| 0.000 | Nessun match testuale |

## Best Practices per Query

### ❌ Query Generiche (Bassa similarità)
```
"che documenti hai?"
"quali file sono nella knowledge base?"
"dammi una lista di documenti"
```
**Problema:** Non hanno somiglianza semantica con contenuto tecnico

**Soluzione:** Usare una strategia diversa (es. endpoint dedicato per listare documenti)

### ✅ Query Specifiche (Alta similarità)
```
"cosa dice il regolamento ESPR sulla documentazione tecnica?"
"quali sono i requisiti per la dichiarazione di conformità?"
"quando entra in vigore il regolamento ESPR?"
```
**Perché funzionano:** Contengono termini specifici presenti nei documenti

## Workflow di Troubleshooting

### Passo 1: Verifica Documenti Processati
```bash
curl http://localhost:3000/api/diagnostics/documents
```
✅ Controlla che:
- `chunk_count > 0`
- `has_embeddings = true`
- `embedding_dimensions = 1536`

### Passo 2: Testa con Query Specifica
```bash
curl -X POST http://localhost:3000/api/diagnostics/search \
  -H "Content-Type: application/json" \
  -d '{"query": "termine specifico dal documento", "threshold": 0.1}'
```
✅ Controlla che:
- `total_results > 0`
- `avg_similarity > 0.3` per query specifiche
- `text_score > 0` se la query contiene parole esatte dal documento

### Passo 3: Ottimizza Parametri
Se i risultati non sono soddisfacenti:

1. **Abbassa threshold**: Prova 0.1 invece di 0.3
2. **Aggiusta vector_weight**:
   - Aumenta (es. 0.8) se vuoi più peso alla similarità semantica
   - Diminuisci (es. 0.5) se vuoi più peso al full-text match
3. **Aumenta limit**: Prova 10 invece di 5 per vedere più candidati

### Passo 4: Applica Migrazione Text Score
Se `text_score` è sempre 0.000:
```bash
# Applica la migrazione
npx tsx scripts/apply-text-score-fix.ts

# Ri-testa
curl -X POST http://localhost:3000/api/diagnostics/search \
  -H "Content-Type: application/json" \
  -d '{"query": "parola chiave esatta", "threshold": 0.1}'
```

## Miglioramenti Futuri

### 1. Gestione Query Meta
Riconoscere query come "quali documenti hai?" e rispondere con una lista diretta invece di fare semantic search.

```typescript
// Esempio implementazione
if (isMetaQuery(message)) {
  const documents = await listAllDocuments()
  return formatDocumentList(documents)
}
```

### 2. Re-ranking
Dopo hybrid search, applicare un secondo passaggio di re-ranking con modello più sofisticato.

### 3. Query Expansion
Espandere query corte/generiche con sinonimi e termini correlati prima di generare embeddings.

### 4. Chunk Optimization
- Aumentare overlap tra chunks (da 50 a 100 token)
- Preservare più contesto (titoli, sezioni)
- Chunk dinamici basati sulla struttura del documento

### 5. Embeddings Fine-tuning
Fine-tune del modello di embedding sul dominio specifico (consulenza, regolamenti, etc.)

## FAQ

**Q: Perché text_score è 0.000 anche con query che contengono parole del documento?**

A: Probabilmente per la normalizzazione 32 in `ts_rank_cd()` che produce valori troppo piccoli. Applica la migrazione `20241104000003_fix_text_score_scaling.sql`.

---

**Q: Quale threshold dovrei usare?**

A: Dipende dal caso d'uso:
- **0.7**: Solo match molto rilevanti (precision alta)
- **0.5**: Bilanciamento precision/recall
- **0.3**: Più risultati, alcuni meno rilevanti
- **0.2 o meno**: Per query generiche o debugging

---

**Q: Come posso migliorare i punteggi di similarity?**

A:
1. Verifica che i documenti siano processati correttamente (chunks + embeddings)
2. Usa query più specifiche con termini tecnici presenti nei documenti
3. Applica la migrazione per migliorare text_score
4. Considera di riprocessare i documenti con chunking migliore

---

**Q: Posso cambiare il modello di embeddings?**

A: Sì, ma:
1. Devi riprocessare TUTTI i documenti con il nuovo modello
2. Assicurati che le dimensioni siano compatibili (attualmente 1536 per text-embeddings-3-large)
3. Aggiorna il tipo vector(1536) nel database se le dimensioni cambiano

---

**Q: Come faccio a vedere i log dettagliati della ricerca?**

A: I log sono già implementati in `app/api/chat/route.ts`. Guarda la console del server durante le richieste, vedrai:
- `[api/chat] Search results`: Tutti i risultati con punteggi
- `[api/chat] Relevant results after filtering`: Quanti passano la soglia
- `[api/chat] Average similarity`: Media dei punteggi rilevanti

---

**Q: Devo riprocessare i documenti dopo aver applicato le fix?**

A: **No** per la soglia abbassata e la migrazione text_score. **Sì** solo se:
- Gli embeddings mancano o sono corrotti
- Vuoi cambiare la strategia di chunking
- Vuoi usare un modello di embedding diverso

