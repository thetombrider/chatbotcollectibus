-- Migration: Add sources column to query_cache
-- Purpose: Store sources metadata with cached responses to enable citation mapping
-- 
-- This allows cached responses to include their original sources so citations
-- can be properly rendered when the cache is hit.

-- Add sources column (JSONB to store array of source objects)
ALTER TABLE query_cache 
ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]'::jsonb;

-- Add index for queries that filter by sources (optional, but useful for analytics)
CREATE INDEX IF NOT EXISTS query_cache_sources_idx ON query_cache USING gin (sources);

-- Comment on column
COMMENT ON COLUMN query_cache.sources IS 'Array of source objects (with index, filename, etc.) used in the cached response. Used for citation mapping.';

