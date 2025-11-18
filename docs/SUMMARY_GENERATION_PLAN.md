# Summary Generation Integration Plan

**Date:** 18 Nov 2025  
**Priority:** HIGH (critical for exploratory search feature)  
**Estimated Effort:** 2-3 hours  
**Status:** ✅ COMPLETED

---

## 🎯 Implementation Summary

Successfully implemented "summary of summaries" strategy for document summarization:

1. ✅ **Module Created:** `lib/processing/summary-generation.ts` (400+ lines)
   - `generateChunkSummary()` - Summarize individual chunks
   - `generateFinalSummary()` - Combine chunk summaries into final summary
   - `generateDocumentSummary()` - Main orchestration function
   - `saveSummary()` - Save to database
   - `generateAndSaveSummary()` - Convenience wrapper

2. ✅ **Integration:** Modified `app/api/upload/route.ts`
   - Added async summary generation after document processing
   - Both streaming and non-streaming modes supported
   - Non-blocking: doesn't delay upload response

3. ✅ **Backfill Script:** `scripts/generate-missing-summaries.ts`
   - Process existing documents without summaries
   - Supports `--limit`, `--dry-run`, `--document-id`, `--all` flags
   - Rate limiting and error handling

4. ✅ **Test Script:** `scripts/test-summary-generation.ts`
   - Test summary generation on specific document
   - Verify saved results

---

## 📋 Summary-of-Summaries Strategy

### Phase 1: Chunk Summarization
For each document chunk (or sampled chunks if document is very long):
1. Generate concise summary (150 tokens max)
2. Capture key concepts and main topics
3. Rate limit: 1 request/second

**Prompt Template:**
```
Riassumi questo estratto di documento in modo conciso (max 150 parole).
Focus su: concetti chiave, argomenti principali, informazioni rilevanti.

Estratto #N:
[chunk content]

Riassunto conciso:
```

### Phase 2: Final Summary
Combine all chunk summaries and generate comprehensive document summary:
1. Input: All chunk summaries concatenated
2. Output: 200-500 word coherent summary
3. Captures: themes, purpose, content, relevance

**Prompt Template:**
```
Analizza questi riassunti parziali di un documento e genera un riassunto completo 
e coerente del documento (200-500 parole).

Il riassunto finale deve catturare:
1. TEMA PRINCIPALE: Argomento centrale del documento
2. ARGOMENTI CHIAVE: Concetti e temi principali trattati
3. SCOPO: Obiettivo e finalità del documento
4. CONTENUTO: Cosa contiene concretamente
5. RILEVANZA: A chi è rivolto e contesto di applicazione

[chunk summaries]

Riassunto completo del documento:
```

### Sampling Strategy for Long Documents
If document has >30 chunks:
- First 3 chunks (introduction)
- Random middle chunks (strategic sample)
- Last 3 chunks (conclusion)

This ensures coverage of document structure while controlling costs.

---

## 🎯 Objective

Automatically generate AI summaries for documents and store them with embeddings to enable exploratory document search.

---

## 📋 Requirements

### Functional Requirements
1. **Automatic Generation:** Summaries generated as part of document processing workflow
2. **Non-Blocking:** Should not delay document availability for regular search
3. **Quality:** Summaries should be comprehensive (200-500 words) and capture document themes
4. **Consistency:** Use same embedding model (text-embedding-3-large) as chunks
5. **Status Tracking:** Clear status in processing_status field

### Technical Requirements
1. **Input:** First 5-10 chunks of document (or random sample if very long)
2. **LLM:** Use OpenRouter (same as chat) for summary generation
3. **Embedding:** text-embedding-3-large (3072 dimensions)
4. **Storage:** Update documents table: summary, summary_embedding, summary_generated_at
5. **Error Handling:** Graceful degradation if summary generation fails

---

## 🏗️ Architecture Design

### Processing Status Flow

```
Document Upload
    ↓
processing_status: 'processing'
    ↓
Text Extraction
    ↓
processing_status: 'chunking'
    ↓
Adaptive Chunking
    ↓
Chunk Embedding Generation
    ↓
processing_status: 'completed' ← CURRENT END
    ↓
🆕 processing_status: 'summarizing'
    ↓
🆕 Generate Document Summary
    ↓
🆕 Embed Summary
    ↓
🆕 Save to documents table
    ↓
processing_status: 'completed_with_summary'
```

### Alternative: Background Job Pattern

For **existing documents** without summaries:
```
Background Job (cron/manual trigger)
    ↓
Query documents WHERE summary IS NULL AND processing_status = 'completed'
    ↓
For each document:
    - Load first 10 chunks
    - Generate summary
    - Embed + save
    ↓
Update processing_status: 'completed_with_summary'
```

---

## 📂 Implementation Plan

### Step 1: Create Summary Generation Module

**File:** `lib/processing/summary-generation.ts`

```typescript
/**
 * Generate AI summary for a document
 */
export interface SummaryGenerationOptions {
  maxChunks?: number  // Default: 10
  maxTokens?: number  // Default: 500
  language?: string   // Default: 'it'
}

export interface DocumentSummary {
  summary: string
  embedding: number[]
  tokensUsed: number
  model: string
  generatedAt: string
}

/**
 * Generate summary from document chunks
 */
export async function generateDocumentSummary(
  documentId: string,
  options?: SummaryGenerationOptions
): Promise<DocumentSummary>
```

**Key Logic:**
1. Load first N chunks from database (ordered by position)
2. Concatenate chunks with separators
3. Call LLM with summary prompt
4. Generate embedding for summary
5. Return structured result

### Step 2: Create Summary Prompt

**Prompt Template:**
```typescript
const SUMMARY_PROMPT = `Analizza questi estratti di un documento e genera un riassunto completo (200-500 parole) che catturi:

1. TEMI PRINCIPALI: Argomenti e concetti chiave trattati
2. SCOPO: Obiettivo e finalità del documento
3. CONTENUTI: Cosa contiene concretamente (regole, procedure, dati, analisi)
4. CONTESTO: A chi è rivolto e quando si applica
5. PAROLE CHIAVE: Terminologia specifica rilevante

Il riassunto deve essere in italiano, chiaro e adatto per ricerche tematiche.

Documento: {filename}
Tipo: {file_type}

Estratti del documento:
{chunks}

Riassunto del documento:`
```

### Step 3: Integrate into Document Processing

**File:** `app/api/upload/route.ts` (or wherever processing happens)

**Option A: Inline (Blocking)**
```typescript
// After chunk embedding
await saveChunksToDatabase(chunks, documentId)

// Generate summary (blocks upload response)
const summary = await generateDocumentSummary(documentId)
await saveSummaryToDatabase(documentId, summary)

return Response.json({ success: true, documentId })
```

**Option B: Async (Non-Blocking) ⭐ RECOMMENDED**
```typescript
// After chunk embedding
await saveChunksToDatabase(chunks, documentId)

// Dispatch summary generation as background job
generateDocumentSummaryAsync(documentId).catch(error => {
  console.error('[summary] Background generation failed:', error)
})

return Response.json({ success: true, documentId })
```

### Step 4: Database Update Function

**File:** `lib/supabase/document-operations.ts` (or create new)

```typescript
export async function saveSummary(
  documentId: string,
  summary: string,
  embedding: number[]
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('documents')
    .update({
      summary: summary,
      summary_embedding: embedding,
      summary_generated_at: new Date().toISOString(),
      processing_status: 'completed_with_summary'
    })
    .eq('id', documentId)

  if (error) {
    console.error('[summary] Failed to save:', error)
    throw error
  }
}
```

### Step 5: Background Job for Existing Documents

**File:** `scripts/generate-missing-summaries.ts`

```typescript
/**
 * Generate summaries for documents that don't have one
 * 
 * Usage:
 * tsx scripts/generate-missing-summaries.ts [--limit 10] [--dry-run]
 */

async function generateMissingSummaries(limit?: number, dryRun?: boolean) {
  // 1. Find documents without summaries
  const { data: documents } = await supabaseAdmin
    .from('documents')
    .select('id, filename')
    .is('summary', null)
    .eq('processing_status', 'completed')
    .limit(limit || 100)

  console.log(`Found ${documents.length} documents without summaries`)

  // 2. Generate summaries one by one
  for (const doc of documents) {
    try {
      if (dryRun) {
        console.log(`[DRY RUN] Would generate summary for: ${doc.filename}`)
        continue
      }

      console.log(`Generating summary for: ${doc.filename}`)
      const summary = await generateDocumentSummary(doc.id)
      await saveSummary(doc.id, summary.summary, summary.embedding)
      console.log(`✅ Summary saved (${summary.tokensUsed} tokens)`)
      
      // Rate limiting
      await sleep(1000)
    } catch (error) {
      console.error(`❌ Failed for ${doc.filename}:`, error)
    }
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests
```typescript
// tests/summary-generation.test.ts

describe('generateDocumentSummary', () => {
  it('should generate summary from chunks', async () => {
    const summary = await generateDocumentSummary(testDocId)
    expect(summary.summary).toBeTruthy()
    expect(summary.summary.length).toBeGreaterThan(100)
    expect(summary.embedding.length).toBe(3072)
  })

  it('should handle documents with few chunks', async () => {
    // Test with 2-3 chunks only
  })

  it('should handle errors gracefully', async () => {
    // Test with invalid document ID
  })
})
```

### Integration Tests
1. Upload a test document
2. Wait for processing to complete
3. Verify summary exists in database
4. Verify summary_embedding is valid vector
5. Test exploratory search with that document

### Performance Tests
- Measure time to generate summary: Target <10 seconds
- Measure token usage: Track costs
- Test with different document sizes

---

## 💰 Cost Estimation

### Per Document Costs

**Input:**
- Average 10 chunks × 500 tokens/chunk = 5,000 tokens input
- Summary prompt = ~200 tokens
- **Total input:** ~5,200 tokens

**Output:**
- Summary = 500 tokens

**Embedding:**
- 500 tokens summary embedding

**Cost (using GPT-4.1-mini via OpenRouter):**
- Input: 5,200 tokens × $0.15/1M = $0.00078
- Output: 500 tokens × $0.60/1M = $0.00030
- Embedding: 500 tokens × $0.13/1M = $0.000065
- **Total per document:** ~$0.001 (0.1 cent)

**For 1,000 documents:** ~$1.00

**Conclusion:** Very affordable! 🎉

---

## 🚀 Deployment Plan

### Phase 1: Code Implementation (1-2 hours)
- [ ] Create summary-generation.ts module
- [ ] Create summary prompt template
- [ ] Add saveSummary() to document-operations
- [ ] Write unit tests
- [ ] Type check (0 errors)

### Phase 2: Background Job (30 min)
- [ ] Create generate-missing-summaries.ts script
- [ ] Test with --dry-run flag
- [ ] Test with --limit 5 on real documents

### Phase 3: Integration (30 min)
- [ ] Add async summary generation to upload route
- [ ] Add error handling
- [ ] Add Langfuse tracing
- [ ] Test end-to-end with new upload

### Phase 4: Backfill Existing Documents (manual)
- [ ] Run script with limit 10 for testing
- [ ] Validate results with test-exploratory-search.ts
- [ ] Run full backfill for all documents
- [ ] Monitor costs in OpenRouter dashboard

### Phase 5: Monitoring & Refinement
- [ ] Add metrics: success rate, avg tokens, avg time
- [ ] Monitor exploratory search usage
- [ ] Gather user feedback
- [ ] Iterate on prompt if needed

---

## ⚙️ Configuration

### Environment Variables (Already Set)
```env
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...  # For embeddings
```

### Model Selection
- **Summary Generation:** `openai/gpt-4.1-mini` (cheap, good quality)
- **Alternative:** `anthropic/claude-3-haiku` (even cheaper)
- **Embedding:** `text-embedding-3-large` (consistency with chunks)

### Tunable Parameters
```typescript
const SUMMARY_CONFIG = {
  maxChunksToSample: 10,      // More = better context, higher cost
  summaryMaxTokens: 500,       // Summary length
  summaryTemperature: 0.3,     // Lower = more consistent
  embeddingModel: 'text-embedding-3-large',
  rateLimitDelay: 1000,        // ms between requests (backfill)
}
```

---

## 🐛 Error Handling

### Potential Issues & Solutions

1. **LLM API Failure**
   - Retry with exponential backoff (3 attempts)
   - Log error but don't fail document upload
   - Mark document as 'needs_summary_retry'

2. **Embedding API Failure**
   - Same retry logic
   - Summary stored without embedding → manual retry later

3. **Document Too Short**
   - If <2 chunks, generate summary anyway (better than nothing)
   - Flag in logs for quality check

4. **Document Too Long**
   - If >100 chunks, sample strategically:
     - First 3 chunks (intro)
     - Random 4 chunks (middle)
     - Last 3 chunks (conclusion)

5. **Rate Limits**
   - Implement rate limiting in backfill script
   - Queue-based processing for high volume

---

## 📊 Success Metrics

### Technical Metrics
- **Generation Success Rate:** Target 95%+
- **Average Generation Time:** Target <10 seconds
- **Average Token Usage:** Target ~5,000 input + 500 output
- **Cost per Document:** Target <$0.002

### Quality Metrics
- **Summary Relevance:** Manual review of 10 samples
- **Keyword Coverage:** Summary contains main document keywords
- **Exploratory Search Accuracy:** Improves with summaries vs without

### Operational Metrics
- **Coverage:** % of documents with summaries
- **Backfill Progress:** Documents processed per hour
- **Error Rate:** % of failures

---

## 🔮 Future Enhancements

### Incremental Summary Updates
- Regenerate summary when document is updated
- Append new content to existing summary (for very long docs)

### Multi-Stage Summarization
- For documents >50 chunks: summarize in stages
  1. Chunk-level summaries (every 10 chunks)
  2. Meta-summary from chunk summaries

### User-Editable Summaries
- Allow users to edit generated summaries
- Track which summaries are edited (quality signal)

### Summary Templates by Document Type
- Different prompts for: regulations, reports, guides, policies
- Auto-detect document type and apply template

---

## 📖 Related Files

### Created
- `lib/processing/summary-generation.ts` (to be created)
- `scripts/generate-missing-summaries.ts` (to be created)

### Modified
- `app/api/upload/route.ts` (add async summary call)
- `lib/supabase/document-operations.ts` (add saveSummary)

### Dependencies
- `lib/embeddings/openai.ts` (generateEmbeddings)
- `lib/supabase/admin.ts` (database access)
- `lib/observability/langfuse.ts` (tracing)

---

## ✅ Checklist Before Starting

- [x] Migration deployed (summary columns exist)
- [x] Document search module implemented
- [x] Agent routing completed
- [x] Test script ready
- [ ] Review prompt template
- [ ] Decide: inline vs async generation
- [ ] Decide: which LLM model to use
- [ ] Estimate costs for full backfill

**Ready to implement?** Let's go! 🚀
