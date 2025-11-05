# Query Enhancement Deployment Guide

## Prerequisites

- Supabase project with database access
- OpenRouter API key with Gemini access
- Node.js environment with `tsx` or `ts-node`

## Deployment Steps

### 1. Apply Database Migration

```bash
# Navigate to project root
cd /path/to/chatbotcollectibus

# Apply migration using Supabase CLI
npx supabase db push

# OR manually execute the migration
psql <your-database-url> < supabase/migrations/20241105000001_query_enhancement_cache.sql
```

Verify migration:
```sql
-- Check table exists
SELECT * FROM query_enhancement_cache LIMIT 1;

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'query_enhancement_cache';

-- Check function exists
SELECT proname FROM pg_proc WHERE proname = 'clean_expired_enhancement_cache';
```

### 2. Configure Environment Variables

Add to `.env.local`:

```bash
# Query Enhancement Configuration
ENABLE_QUERY_ENHANCEMENT=true

# OpenRouter API Key (required)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Existing vars (verify these are set)
OPENAI_API_KEY=your_openai_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Get OpenRouter API Key:**
1. Go to https://openrouter.ai/
2. Sign up or log in
3. Navigate to Keys section
4. Create new API key
5. Copy and add to `.env.local`

### 3. Install Dependencies (if needed)

```bash
npm install
# or
pnpm install
```

### 4. Build and Test Locally

```bash
# Start dev server
npm run dev

# In another terminal, run test suite
npx tsx tests/query-enhancement-test.ts
```

### 5. Deploy to Production

#### Vercel Deployment

```bash
# Add environment variables to Vercel
vercel env add ENABLE_QUERY_ENHANCEMENT
# Enter: true

vercel env add OPENROUTER_API_KEY
# Enter: your_key

# Deploy
git add .
git commit -m "feat: add query enhancement feature"
git push origin main

# Vercel will auto-deploy
```

#### Manual Deployment

If not using Vercel:

```bash
# Build
npm run build

# Set production env vars
export ENABLE_QUERY_ENHANCEMENT=true
export OPENROUTER_API_KEY=your_key

# Start
npm start
```

### 6. Apply Production Database Migration

If Supabase production DB is separate:

```bash
# Using Supabase CLI
npx supabase link --project-ref your-project-ref
npx supabase db push

# OR manually
psql <production-database-url> < supabase/migrations/20241105000001_query_enhancement_cache.sql
```

### 7. Verify Deployment

#### Test Generic Query

```bash
curl -X POST https://your-app-url/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "GDPR",
    "conversationId": "test-123"
  }'
```

Check response and server logs for:
```
[query-enhancement] Detection result: ... shouldEnhance: true
[query-enhancement] Expansion result: ...
```

#### Test Specific Query

```bash
curl -X POST https://your-app-url/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the GDPR requirements for data retention in Italy?",
    "conversationId": "test-123"
  }'
```

Should show:
```
[query-enhancement] Enhancement not needed, using original query
```

#### Test Cache

Send same query twice:
```bash
# First call
curl -X POST https://your-app-url/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "GDPR", "conversationId": "test-123"}'

# Second call (should use cache)
curl -X POST https://your-app-url/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "GDPR", "conversationId": "test-123"}'
```

Second call should show:
```
[enhancement-cache] Cache HIT for query: gdpr
```

### 8. Monitor Performance

#### Check Cache Statistics

```sql
-- Connect to production DB
psql <production-database-url>

-- View cache stats
SELECT 
  COUNT(*) as total_cached_queries,
  AVG(hit_count) as avg_hits_per_query,
  SUM(hit_count) as total_cache_hits,
  COUNT(*) FILTER (WHERE should_enhance = true) as queries_enhanced,
  COUNT(*) FILTER (WHERE should_enhance = false) as queries_not_enhanced
FROM query_enhancement_cache
WHERE expires_at > NOW();
```

#### Monitor API Costs

Check OpenRouter dashboard:
1. Go to https://openrouter.ai/activity
2. Monitor API calls for `google/gemini-flash-1.5`
3. Expected: ~$0.30-0.50/month for 1000 queries/day

#### Monitor Similarity Improvements

```sql
-- Check average similarity scores from messages metadata
SELECT 
  AVG((metadata->'sources'->0->>'similarity')::float) as avg_similarity,
  COUNT(*) FILTER (WHERE (metadata->>'query_enhanced')::boolean = true) as enhanced_count,
  COUNT(*) FILTER (WHERE (metadata->>'query_enhanced')::boolean = false) as not_enhanced_count
FROM messages
WHERE role = 'assistant'
  AND created_at > NOW() - INTERVAL '7 days';
```

## Post-Deployment Tasks

### 1. Set Up Scheduled Cache Cleanup

Create a cron job or Vercel cron to clean expired cache entries:

**Option A: Vercel Cron**

Create `app/api/cron/cleanup-cache/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { cleanExpiredEnhancements } from '@/lib/supabase/enhancement-cache'

export async function GET() {
  const deleted = await cleanExpiredEnhancements()
  return NextResponse.json({ deleted })
}
```

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/cleanup-cache",
    "schedule": "0 2 * * *"
  }]
}
```

**Option B: Manual Cron**

Add to crontab:
```bash
# Clean cache daily at 2 AM
0 2 * * * curl https://your-app-url/api/cron/cleanup-cache
```

### 2. Set Up Monitoring Alerts

**Supabase Dashboard:**
1. Go to Logs section
2. Create alert for errors containing `[query-enhancement]`
3. Set notification via email/Slack

**Vercel Logs:**
1. Go to Vercel dashboard → Project → Logs
2. Filter for `query-enhancement`
3. Monitor error rates

### 3. Document Rollback Procedure

Save this in your runbook:

```bash
# Emergency rollback
# Set env var to disable feature
vercel env add ENABLE_QUERY_ENHANCEMENT
# Enter: false

# Trigger redeployment
vercel --prod

# Feature will be disabled but data remains intact
```

## Troubleshooting

### Migration Fails

```bash
# Check if table already exists
psql <db-url> -c "SELECT * FROM query_enhancement_cache LIMIT 1;"

# If exists, migration may have already been applied
# If error about missing extensions:
psql <db-url> -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### OpenRouter API Key Invalid

```bash
# Test API key
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"

# Should return list of available models
# If error, regenerate key at https://openrouter.ai/keys
```

### No Enhancement Happening

```bash
# Check logs for errors
vercel logs --follow

# Verify env var is set
vercel env ls

# Test locally first
ENABLE_QUERY_ENHANCEMENT=true npm run dev
```

### Cache Not Working

```sql
-- Check cache table
SELECT COUNT(*) FROM query_enhancement_cache;

-- Check for errors in Postgres logs
-- Verify RLS is not blocking inserts (should not be enabled on this table)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'query_enhancement_cache';
```

## Rollback Instructions

### Quick Disable (No Data Loss)

```bash
# Set environment variable
vercel env add ENABLE_QUERY_ENHANCEMENT
# Enter: false

# Redeploy
vercel --prod
```

### Full Rollback

```bash
# 1. Disable feature
vercel env add ENABLE_QUERY_ENHANCEMENT
# Enter: false

# 2. Revert code changes
git revert <commit-hash>
git push origin main

# 3. (Optional) Drop database table
psql <db-url> -c "DROP TABLE IF EXISTS query_enhancement_cache;"
```

## Success Criteria

✅ Migration applied successfully
✅ Environment variables configured
✅ Generic queries get enhanced (check logs)
✅ Specific queries don't get enhanced
✅ Cache hit rate increases over time
✅ No errors in logs
✅ Similarity scores improve (monitor over 1-2 weeks)
✅ API costs within budget (<$1/month for typical usage)

## Next Steps

After successful deployment:

1. **Monitor for 1 week**: Check logs, cache hit rates, similarity scores
2. **Gather metrics**: Compare similarity before/after enhancement
3. **Optimize prompts**: Adjust detection/expansion prompts if needed
4. **Expand acronym list**: Add domain-specific acronyms in `text-preprocessing.ts`
5. **Consider A/B testing**: Test with/without enhancement for specific query types

## Support

For issues or questions:
- Check logs: `vercel logs --follow`
- Review: `docs/QUERY_ENHANCEMENT.md`
- Database queries: See monitoring section above
- OpenRouter status: https://status.openrouter.ai/

