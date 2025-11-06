-- Migration: Query Enhancement Cache
-- Purpose: Store LLM-based query enhancement decisions and results to minimize costs
-- 
-- This table caches:
-- 1. Whether a query needs enhancement (detection result)
-- 2. The enhanced query text (expansion result)
-- 
-- TTL: 7 days (balance between freshness and cost savings)

CREATE TABLE IF NOT EXISTS query_enhancement_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_text TEXT NOT NULL,
  enhanced_query TEXT NOT NULL,
  should_enhance BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by query text (primary access pattern)
CREATE INDEX query_enhancement_cache_query_text_idx ON query_enhancement_cache(query_text);

-- Index for cleanup of expired entries
CREATE INDEX query_enhancement_cache_expires_at_idx ON query_enhancement_cache(expires_at);

-- Index for analytics (track most frequently enhanced queries)
CREATE INDEX query_enhancement_cache_hit_count_idx ON query_enhancement_cache(hit_count DESC);

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_enhancement_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM query_enhancement_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE query_enhancement_cache IS 'Caches LLM-based query enhancement decisions to reduce API costs';
COMMENT ON COLUMN query_enhancement_cache.query_text IS 'Original user query (normalized for cache key)';
COMMENT ON COLUMN query_enhancement_cache.enhanced_query IS 'Expanded query with additional semantic context';
COMMENT ON COLUMN query_enhancement_cache.should_enhance IS 'LLM decision: whether this query benefits from enhancement';
COMMENT ON COLUMN query_enhancement_cache.hit_count IS 'Number of times this cached entry has been reused';
COMMENT ON COLUMN query_enhancement_cache.last_accessed_at IS 'Last time this cache entry was accessed (for analytics)';




