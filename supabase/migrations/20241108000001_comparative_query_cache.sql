-- Migration: Comparative Query Detection Cache
-- Purpose: Store LLM-based comparative query detection decisions and extracted terms to minimize costs
-- 
-- This table caches:
-- 1. Whether a query is comparative (detection result)
-- 2. The extracted terms/entities to compare (2+ terms)
-- 3. The type of comparison: "differences", "similarities", or "general_comparison"
-- 
-- TTL: 7 days (balance between freshness and cost savings)

CREATE TABLE IF NOT EXISTS comparative_query_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_text TEXT NOT NULL,
  query_embedding vector(1536), -- For future semantic similarity lookup
  is_comparative BOOLEAN NOT NULL DEFAULT false,
  comparison_terms JSONB, -- Array of terms to compare: ["GDPR", "ESPR"]
  comparison_type TEXT CHECK (comparison_type IN ('differences', 'similarities', 'general_comparison')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by query text (primary access pattern)
CREATE INDEX comparative_query_cache_query_text_idx ON comparative_query_cache(query_text);

-- Index for cleanup of expired entries
CREATE INDEX comparative_query_cache_expires_at_idx ON comparative_query_cache(expires_at);

-- Index for analytics (track most frequently detected comparative queries)
CREATE INDEX comparative_query_cache_hit_count_idx ON comparative_query_cache(hit_count DESC);

-- Index for semantic similarity lookup (future use)
CREATE INDEX comparative_query_cache_embedding_idx ON comparative_query_cache 
USING ivfflat (query_embedding vector_cosine_ops)
WITH (lists = 100);

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_comparative_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM comparative_query_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE comparative_query_cache IS 'Caches LLM-based comparative query detection decisions to reduce API costs';
COMMENT ON COLUMN comparative_query_cache.query_text IS 'Original user query (normalized for cache key)';
COMMENT ON COLUMN comparative_query_cache.query_embedding IS 'Vector embedding of query for semantic similarity lookup (future use)';
COMMENT ON COLUMN comparative_query_cache.is_comparative IS 'LLM decision: whether this query is comparative';
COMMENT ON COLUMN comparative_query_cache.comparison_terms IS 'Array of extracted terms/entities to compare (JSON array)';
COMMENT ON COLUMN comparative_query_cache.comparison_type IS 'Type of comparison: differences, similarities, or general_comparison';
COMMENT ON COLUMN comparative_query_cache.hit_count IS 'Number of times this cached entry has been reused';
COMMENT ON COLUMN comparative_query_cache.last_accessed_at IS 'Last time this cache entry was accessed (for analytics)';

