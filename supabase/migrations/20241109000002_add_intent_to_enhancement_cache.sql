-- Migration: Add intent_type to query_enhancement_cache
-- Purpose: Store detected intent type for analytics and future optimizations

-- Add intent_type column
ALTER TABLE query_enhancement_cache
ADD COLUMN IF NOT EXISTS intent_type TEXT;

-- Add index for intent-based queries (for analytics)
CREATE INDEX IF NOT EXISTS query_enhancement_cache_intent_type_idx 
ON query_enhancement_cache(intent_type);

-- Comment on column
COMMENT ON COLUMN query_enhancement_cache.intent_type IS 'Detected intent type (comparison, definition, requirements, etc.) for analytics and optimizations';

