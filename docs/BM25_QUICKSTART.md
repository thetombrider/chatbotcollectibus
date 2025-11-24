# Quick Start: BM25 Keyword Search Upgrade

## Deployment Steps

### 1. Apply Database Migration

```powershell
# Test locally first
supabase db reset

# Or push to production
supabase db push
```

### 2. Verify Migration Success

```powershell
# Check if columns exist
supabase db query "SELECT column_name FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name IN ('keywords', 'content_tsv');"

# Should return both: keywords, content_tsv
```

### 3. Test Keyword Extraction

```powershell
# Test LLM keyword extraction
tsx scripts/test-keyword-extraction.ts

# Expected output:
# ✓ Keywords extracted for each chunk
# ✓ Acronyms, numbers, technical terms identified
# ✓ Fallback tested successfully
```

### 4. Test BM25 Hybrid Search

```powershell
# Test hybrid search with different weights
tsx scripts/test-bm25-hybrid-search.ts

# Expected output:
# ✓ Vector-only, Hybrid, Text-heavy comparisons
# ✓ Ranking analysis
# ✓ Query matching validation
```

### 5. Upload Test Document

```powershell
# Upload a document via UI or API
# Check console logs for:
# - "[keyword-extraction] Extracting keywords for X chunks"
# - "[keyword-extraction] Extracted keywords: count: X"
# - Keywords saved in metadata
```

### 6. Verify in Database

```sql
-- Check recent chunks have keywords
SELECT 
  id, 
  array_length(keywords, 1) as keyword_count,
  keywords,
  (metadata->>'keywordModel') as model,
  content_tsv IS NOT NULL as has_tsv
FROM document_chunks
ORDER BY created_at DESC
LIMIT 5;

-- Expected:
-- keyword_count: 8-15
-- model: 'anthropic/claude-3.5-haiku' or 'fallback-frequency'
-- has_tsv: true
```

## Troubleshooting

### Migration Fails

```powershell
# Check current schema
supabase db query "\\d document_chunks"

# If columns already exist, skip to next step
# If trigger conflicts, drop and recreate:
supabase db query "DROP TRIGGER IF EXISTS document_chunks_tsv_update ON document_chunks;"
```

### Keyword Extraction Fails

```powershell
# Check OpenRouter API key
$env:OPENROUTER_API_KEY

# If missing, set it:
# Copy from .env.local
# Should fallback to frequency-based if API fails
```

### Hybrid Search Returns No Results

```sql
-- Check if any chunks exist
SELECT COUNT(*) FROM document_chunks;

-- Check if content_tsv is populated
SELECT COUNT(*) FROM document_chunks WHERE content_tsv IS NOT NULL;

-- If not, trigger update:
UPDATE document_chunks 
SET content_tsv = setweight(to_tsvector('italian', content), 'A')
WHERE content_tsv IS NULL;
```

## Performance Monitoring

### Langfuse Traces

Check for new traces:
- `keyword-extraction-batch` - batch keyword processing
- `hybrid-search-bm25` - BM25 search operations

### Database Queries

```sql
-- Keyword statistics
SELECT 
  AVG(array_length(keywords, 1)) as avg_keywords,
  MIN(array_length(keywords, 1)) as min_keywords,
  MAX(array_length(keywords, 1)) as max_keywords
FROM document_chunks
WHERE keywords IS NOT NULL;

-- Top keywords
SELECT unnest(keywords) as keyword, COUNT(*) as frequency
FROM document_chunks
WHERE keywords IS NOT NULL
GROUP BY keyword
ORDER BY frequency DESC
LIMIT 20;

-- Model distribution
SELECT 
  metadata->>'keywordModel' as model,
  COUNT(*) as count
FROM document_chunks
WHERE metadata->>'keywordModel' IS NOT NULL
GROUP BY model;
```

## Rollback

If issues occur:

```sql
-- Restore old hybrid_search
-- Re-run: supabase/migrations/20241110000001_fix_text_score_null_handling.sql

-- Remove new columns (optional)
ALTER TABLE document_chunks DROP COLUMN IF EXISTS keywords CASCADE;
ALTER TABLE document_chunks DROP COLUMN IF EXISTS content_tsv CASCADE;
```

## Success Metrics

✅ **Migration complete** when:
- `keywords` and `content_tsv` columns exist
- Trigger `document_chunks_tsv_update` active
- New function `hybrid_search` deployed

✅ **Keywords working** when:
- New uploads show keyword extraction in logs
- Database queries show 8-15 keywords per chunk
- Model tracked in metadata

✅ **BM25 active** when:
- Search queries return results
- Text score > 0 for matching terms
- Acronyms (CCNL, TFR) match successfully

## Next Steps After Deployment

1. **Monitor first 10 uploads** - check keyword quality
2. **Run regression tests** - ensure existing functionality works
3. **Compare user feedback** - better search relevance?
4. **Tune vector/text weights** - optimize for your use case
5. **Consider backfilling** - re-process old documents (optional)

## Cost Estimation

Per document (100 chunks):
- Embeddings: $0.013 (unchanged)
- Keywords: $0.025 (new)
- **Total: $0.038** (~3x overhead but better quality)

Monthly estimate (100 docs/month):
- Additional cost: ~$2.50/month
- ROI: Better search = fewer support tickets

## Support

Issues or questions:
- Check `docs/BM25_KEYWORDS_UPGRADE.md` for detailed docs
- Review Langfuse traces for debugging
- Consult migration file comments for schema details
