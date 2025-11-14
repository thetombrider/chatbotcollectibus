-- Migration: Drop old cache tables
-- After unified cache is deployed and working
-- Created: 2025-11-14

-- Drop old query_analysis_cache table
DROP TABLE IF EXISTS query_analysis_cache CASCADE;

-- Drop old enhancement_cache table
DROP TABLE IF EXISTS enhancement_cache CASCADE;

-- Note: These tables are replaced by unified_query_cache
COMMENT ON TABLE unified_query_cache IS 'Unified cache for query analysis and enhancement (replaces query_analysis_cache and enhancement_cache)';
