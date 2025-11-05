# Query Enhancement Feature

## Overview

The query enhancement feature uses LLM-based detection to identify when user queries are generic, broad, or incomplete, and automatically expands them with related terms and context to improve vector search similarity scores.

## Problem Addressed

Based on `ANALISI_SIMILARITY_ISSUES.md`, the system was experiencing:
- **Average similarity scores of ~0.35** (target: 0.6-0.7)
- Poor results for generic queries like "GDPR", "sustainability"
- Insufficient semantic context in short queries

## Solution

A three-stage enhancement pipeline:

1. **Detection**: LLM (Gemini 1.5 Flash) analyzes if query needs enhancement
2. **Expansion**: If needed, LLM adds related terms, synonyms, and context
3. **Caching**: Stores decisions and results to minimize API costs

## Architecture

```
User Query
    ↓
Enhancement Cache Check
    ↓
[Cache Miss] → LLM Detection (should enhance?)
    ↓
[If Yes] → LLM Expansion (add context)
    ↓
Cache Result
    ↓
Generate Embedding
    ↓
Vector Search
```

## Files Added

- `lib/embeddings/query-enhancement.ts` - Core enhancement logic
- `lib/supabase/enhancement-cache.ts` - Cache operations
- `supabase/migrations/20241105000001_query_enhancement_cache.sql` - Database table
- `tests/query-enhancement-test.ts` - Test suite

## Files Modified

- `app/api/chat/route.ts` - Integrated enhancement before embedding generation

## Configuration

### Environment Variables

```bash
# Enable/disable query enhancement (default: true)
ENABLE_QUERY_ENHANCEMENT=true

# Required: OpenRouter API key for Gemini 1.5 Flash
OPENROUTER_API_KEY=your_key_here
```

### Model Configuration

The feature uses **Gemini 1.5 Flash** (`google/gemini-flash-1.5`) via OpenRouter for:
- Low cost (~$0.00001 per detection)
- Fast response times
- Good accuracy for binary decisions

To change the model, edit `lib/embeddings/query-enhancement.ts`:

```typescript
const ENHANCEMENT_MODEL = 'google/gemini-flash-1.5' // Change here
```

## Usage

### Automatic Enhancement in Chat

Enhancement is automatically applied in the chat API. No changes needed to client code.

```typescript
// User sends query
POST /api/chat
{
  "message": "GDPR",
  "conversationId": "..."
}

// Backend automatically:
// 1. Detects query is generic
// 2. Enhances to: "GDPR General Data Protection Regulation protezione dati..."
// 3. Generates embedding from enhanced query
// 4. Performs search
```

### Programmatic Usage

```typescript
import { enhanceQueryIfNeeded } from '@/lib/embeddings/query-enhancement'

// Enhance a single query
const result = await enhanceQueryIfNeeded("GDPR")
console.log(result.shouldEnhance) // true
console.log(result.enhanced) // "GDPR General Data Protection Regulation..."
console.log(result.fromCache) // false (first time)

// Enhance multiple queries
import { enhanceQueriesBatch } from '@/lib/embeddings/query-enhancement'
const results = await enhanceQueriesBatch(["GDPR", "ESPR"])
```

## Enhancement Logic

### Queries that ARE Enhanced

1. **Very short (1-3 words) and generic**
   - "GDPR"
   - "sustainability"
   - "privacy regulations"

2. **Too broad or vague**
   - "tell me about regulations"
   - "how does it work"

3. **Missing context**
   - "compliance requirements"
   - "data protection"

### Queries that are NOT Enhanced

1. **Already specific and detailed**
   - "What are the GDPR requirements for data retention in Italy?"

2. **Contains clear context and intent**
   - "How do I implement privacy by design in my CRM?"

3. **Complete questions with sufficient detail**
   - "Explain Article 25 of GDPR regarding data protection by design"

## Caching

### Cache Strategy

- **Key**: Normalized query text (lowercase, trimmed, whitespace normalized)
- **TTL**: 7 days
- **Hit tracking**: Records `hit_count` and `last_accessed_at` for analytics

### Cache Table Schema

```sql
CREATE TABLE query_enhancement_cache (
  id UUID PRIMARY KEY,
  query_text TEXT NOT NULL,           -- Original query (normalized)
  enhanced_query TEXT NOT NULL,       -- Enhanced version
  should_enhance BOOLEAN NOT NULL,    -- LLM decision
  created_at TIMESTAMP,
  expires_at TIMESTAMP,               -- NOW() + 7 days
  hit_count INTEGER,                  -- Analytics
  last_accessed_at TIMESTAMP          -- Analytics
);
```

### Cache Cleanup

Run periodically to remove expired entries:

```typescript
import { cleanExpiredEnhancements } from '@/lib/supabase/enhancement-cache'

const deleted = await cleanExpiredEnhancements()
console.log(`Cleaned ${deleted} expired entries`)
```

## Testing

### Run Test Suite

```bash
npx tsx tests/query-enhancement-test.ts
```

The test suite includes:
- **Generic queries** (should be enhanced)
- **Specific queries** (should NOT be enhanced)
- **Comparative queries** (should be enhanced)
- **Cache functionality** (second call uses cache)
- **Similarity improvement** (measures impact)

### Manual Testing

1. **Test generic query**:
   ```bash
   curl -X POST http://localhost:3000/api/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "GDPR"}'
   ```
   
   Check logs for:
   ```
   [query-enhancement] Detection result: ... shouldEnhance: true
   [query-enhancement] Expansion result: ...
   ```

2. **Test specific query**:
   ```bash
   curl -X POST http://localhost:3000/api/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "What are the GDPR requirements for data retention?"}'
   ```
   
   Check logs for:
   ```
   [query-enhancement] Detection result: ... shouldEnhance: false
   ```

3. **Test cache hit**:
   Send same query twice, second should show:
   ```
   [enhancement-cache] Cache HIT for query: gdpr
   ```

## Performance Metrics

### Expected Improvements

Based on `ANALISI_SIMILARITY_ISSUES.md`:

| Metric | Before | After (Target) | Improvement |
|--------|--------|----------------|-------------|
| Avg Similarity (generic queries) | 0.35 | 0.55-0.65 | +57-86% |
| Results > 0.6 | 10% | 50-75% | +5-7.5x |
| Results < 0.3 | 60% | 20-5% | -3-12x |

### Cost Analysis

- **Detection**: ~$0.00001 per query
- **Expansion**: ~$0.00002 per query (if needed)
- **Total**: ~$0.00003 per uncached query
- **Cache hit rate target**: 60-70% after warm-up

For 1000 queries/day:
- Uncached (30-40%): 300-400 × $0.00003 = $0.009-$0.012/day
- **Monthly cost**: ~$0.27-$0.36

## Comparative Queries

Enhancement integrates with the existing comparative query detection:

1. **Query is enhanced first** (if needed)
2. **Comparative detection** runs on enhanced query (better pattern matching)
3. **Multi-query search** uses enhanced query (avoids double expansion)

Example:
```
User query: "GDPR vs ESPR"
↓
Enhanced: "GDPR General Data Protection Regulation ESPR Ecodesign..."
↓
Detected as comparative: ["GDPR", "ESPR"]
↓
Multi-query search (no re-enhancement)
```

## Monitoring

### View Cache Analytics

```sql
-- Cache hit rate
SELECT 
  COUNT(*) as total_entries,
  AVG(hit_count) as avg_hits_per_entry,
  SUM(hit_count) as total_hits
FROM query_enhancement_cache;

-- Most frequently enhanced queries
SELECT 
  query_text,
  enhanced_query,
  hit_count,
  created_at
FROM query_enhancement_cache
ORDER BY hit_count DESC
LIMIT 20;

-- Cache size and age
SELECT 
  COUNT(*) as total_entries,
  COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_entries,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/3600) as avg_age_hours
FROM query_enhancement_cache;
```

### Application Logs

Look for these log patterns:

```
[query-enhancement] Enhancement needed, expanding query...
[query-enhancement] Enhancement not needed, using original query
[enhancement-cache] Cache HIT for query: ...
[api/chat] Enhancement result: { wasEnhanced: true, fromCache: false }
```

## Rollback

### Disable Feature

Set environment variable:
```bash
ENABLE_QUERY_ENHANCEMENT=false
```

### Remove Feature Completely

1. Remove enhancement call from `app/api/chat/route.ts`:
   ```typescript
   // Remove this block
   const enhancementResult = await enhanceQueryIfNeeded(message)
   const queryToEmbed = enhancementResult.enhanced
   
   // Replace with
   const queryToEmbed = message
   ```

2. Drop database table:
   ```sql
   DROP TABLE query_enhancement_cache;
   ```

3. Delete files:
   - `lib/embeddings/query-enhancement.ts`
   - `lib/supabase/enhancement-cache.ts`
   - `supabase/migrations/20241105000001_query_enhancement_cache.sql`

## Troubleshooting

### Enhancement not working

1. Check environment variable:
   ```bash
   echo $ENABLE_QUERY_ENHANCEMENT
   ```

2. Check OpenRouter API key:
   ```bash
   echo $OPENROUTER_API_KEY
   ```

3. Check logs for errors:
   ```
   [query-enhancement] Detection failed: ...
   [query-enhancement] Expansion failed: ...
   ```

### Similarity not improving

1. Run test suite to verify enhancement is working
2. Check if documents need re-ingestion with new chunk size (see `ANALISI_SIMILARITY_ISSUES.md`)
3. Monitor average similarity scores over time

### Cache not working

1. Verify migration was applied:
   ```sql
   SELECT * FROM query_enhancement_cache LIMIT 1;
   ```

2. Check cache logs:
   ```
   [enhancement-cache] Cache HIT for query: ...
   [enhancement-cache] Cached enhancement for query: ...
   ```

3. Verify cache expiration:
   ```sql
   SELECT COUNT(*) FROM query_enhancement_cache WHERE expires_at > NOW();
   ```

## Future Enhancements

1. **Domain-specific expansion rules**: Add custom expansion logic for specific consulting domains
2. **User feedback integration**: Learn from user interactions to improve detection
3. **A/B testing**: Compare enhanced vs non-enhanced for specific query patterns
4. **Multilingual support**: Better handling of Italian/English mixed queries
5. **Query intent classification**: Categorize queries (factual, how-to, comparative) for tailored enhancement

## References

- Main analysis: `docs/ANALISI_SIMILARITY_ISSUES.md`
- Implementation plan: `query-expansion-feature.plan.md`
- OpenRouter docs: https://openrouter.ai/docs
- Gemini pricing: https://openrouter.ai/models/google/gemini-flash-1.5

