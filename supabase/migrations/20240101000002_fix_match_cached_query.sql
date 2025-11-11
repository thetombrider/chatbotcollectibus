-- Fix ambiguous column reference in match_cached_query function
CREATE OR REPLACE FUNCTION match_cached_query(
  p_query_embedding vector(1536),
  match_threshold FLOAT
)
RETURNS TABLE (
  id UUID,
  query_text TEXT,
  response_text TEXT,
  similarity FLOAT,
  hit_count INTEGER
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
    qc.hit_count
  FROM query_cache qc
  WHERE 
    1 - (qc.query_embedding <=> p_query_embedding) > match_threshold
    AND qc.expires_at > NOW()
  ORDER BY qc.query_embedding <=> p_query_embedding
  LIMIT 1;
END;
$$;
























