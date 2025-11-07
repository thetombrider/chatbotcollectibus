-- Migration: Unified Query Analysis Cache
-- Purpose: Store unified query analysis results (intent, comparative, meta, articles) to minimize LLM API costs
-- 
-- This table replaces multiple separate caches:
-- 1. comparative_query_cache (comparative detection)
-- 2. meta_query_cache (in-memory, now in DB)
-- 3. query_intent_cache (new, for intent detection)
-- 
-- TTL: 7 days (balance between freshness and cost savings)

CREATE TABLE IF NOT EXISTS query_analysis_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_text TEXT NOT NULL,
  query_hash TEXT NOT NULL, -- Hash for fast lookup
  analysis_result JSONB NOT NULL, -- Complete analysis result with all detected features
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by query hash (primary access pattern)
CREATE INDEX query_analysis_cache_query_hash_idx ON query_analysis_cache(query_hash);

-- Index for fast lookup by query text (fallback)
CREATE INDEX query_analysis_cache_query_text_idx ON query_analysis_cache(query_text);

-- Index for cleanup of expired entries
CREATE INDEX query_analysis_cache_expires_at_idx ON query_analysis_cache(expires_at);

-- Index for analytics (track most frequently analyzed queries)
CREATE INDEX query_analysis_cache_hit_count_idx ON query_analysis_cache(hit_count DESC);

-- Index for intent-based queries (for analytics)
CREATE INDEX query_analysis_cache_intent_idx ON query_analysis_cache((analysis_result->>'intent'));

-- Comment on table
COMMENT ON TABLE query_analysis_cache IS 'Unified cache for query analysis results (intent, comparative, meta, articles) to reduce LLM API costs';
COMMENT ON COLUMN query_analysis_cache.query_text IS 'Original user query (normalized for cache key)';
COMMENT ON COLUMN query_analysis_cache.query_hash IS 'Hash of normalized query for fast lookup';
COMMENT ON COLUMN query_analysis_cache.analysis_result IS 'Complete analysis result JSON with intent, comparative terms, meta info, article number, etc.';
COMMENT ON COLUMN query_analysis_cache.hit_count IS 'Number of times this cached entry has been reused';
COMMENT ON COLUMN query_analysis_cache.last_accessed_at IS 'Last time this cache entry was accessed (for analytics)';

