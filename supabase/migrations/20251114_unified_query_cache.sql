-- Migration: Unified Query Cache
-- Combines query-analysis-cache and enhancement-cache into single table
-- Created: 2025-11-14

-- Create unified_query_cache table
CREATE TABLE IF NOT EXISTS unified_query_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL UNIQUE,
  query_text TEXT NOT NULL,
  
  -- Analysis results (from query-analysis-cache)
  analysis JSONB NOT NULL,
  
  -- Enhancement results (from enhancement-cache)
  enhancement JSONB NOT NULL,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INTEGER NOT NULL DEFAULT 0,
  
  -- Indexes
  CONSTRAINT unified_query_cache_query_hash_key UNIQUE (query_hash)
);

-- Create index on query_hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_unified_query_cache_query_hash 
  ON unified_query_cache(query_hash);

-- Create index on created_at for TTL cleanup
CREATE INDEX IF NOT EXISTS idx_unified_query_cache_created_at 
  ON unified_query_cache(created_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_unified_query_cache_updated_at
  BEFORE UPDATE ON unified_query_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE unified_query_cache IS 'Unified cache for query analysis and enhancement results';

-- Note: Old tables (query_analysis_cache, enhancement_cache) will be dropped after migration is complete
