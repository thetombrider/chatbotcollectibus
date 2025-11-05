-- Update match_cached_query function to include sources column
-- Purpose: Return sources metadata with cached responses for citation mapping

-- Drop existing function first (cannot change return type of existing function)
DROP FUNCTION IF EXISTS match_cached_query(vector(1536), FLOAT);

-- Recreate function with sources column
CREATE OR REPLACE FUNCTION match_cached_query(
  p_query_embedding vector(1536),
  match_threshold FLOAT
)
RETURNS TABLE (
  id UUID,
  query_text TEXT,
  response_text TEXT,
  similarity FLOAT,
  hit_count INTEGER,
  sources JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    qc.id,
    qc.query_text,
    qc.response_text,
    1 - (qc.query_embedding <=> p_query_embedding) AS similarity,
    qc.hit_count,
    COALESCE(qc.sources, '[]'::jsonb) AS sources
  FROM query_cache qc
  WHERE 
    1 - (qc.query_embedding <=> p_query_embedding) > match_threshold
    AND qc.expires_at > NOW()
  ORDER BY qc.query_embedding <=> p_query_embedding
  LIMIT 1;
END;
$$;

