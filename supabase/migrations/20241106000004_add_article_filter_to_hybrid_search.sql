-- Add article number filtering to hybrid_search
-- Allows filtering chunks by specific article number when detected in query
-- This ensures that queries like "cosa dice articolo 28?" return only chunks from article 28

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  query_text TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  vector_weight FLOAT DEFAULT 0.7,
  article_number INT DEFAULT NULL  -- NEW: optional article number filter
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INTEGER,
  metadata JSONB,
  similarity DOUBLE PRECISION,
  vector_score DOUBLE PRECISION,
  text_score DOUBLE PRECISION,
  document_filename TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  text_weight FLOAT := 1.0 - vector_weight;
  text_scale_factor FLOAT := 10.0;
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    -- Combined similarity score con text_score scalato
    (
      vector_weight * (1 - (dc.embedding <=> query_embedding)) +
      text_weight * LEAST(
        CAST(ts_rank_cd(
          to_tsvector('italian', dc.content),
          websearch_to_tsquery('italian', query_text),
          1  -- Normalization: divide by 1 + log(document length)
        ) AS DOUBLE PRECISION) * text_scale_factor,
        1.0  -- Cap at 1.0 to keep scores comparable
      )
    )::DOUBLE PRECISION AS similarity,
    -- Vector similarity score separato
    (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION AS vector_score,
    -- Full-text search score scalato (per debugging/analytics)
    LEAST(
      CAST(ts_rank_cd(
        to_tsvector('italian', dc.content),
        websearch_to_tsquery('italian', query_text),
        1
      ) AS DOUBLE PRECISION) * text_scale_factor,
      1.0
    ) AS text_score,
    -- Document filename per citazioni
    d.filename AS document_filename
  FROM document_chunks dc
  LEFT JOIN documents d ON dc.document_id = d.id
  WHERE 
    -- Filtro per article_number se fornito
    (
      article_number IS NULL 
      OR 
      (dc.metadata->>'articleNumber')::INTEGER = article_number
    )
    AND
    -- Filtro più permissivo per catturare più risultati candidati
    (
      -- Passa se vector similarity è sopra metà della soglia
      (1 - (dc.embedding <=> query_embedding) > match_threshold * 0.5)
      OR
      -- Oppure se c'è un match full-text
      (to_tsvector('italian', dc.content) @@ websearch_to_tsquery('italian', query_text))
    )
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Commento per documentazione
COMMENT ON FUNCTION hybrid_search IS 'Hybrid search with article number filtering. When article_number is provided, only returns chunks from that specific article. Uses vector similarity + full-text search with configurable weights.';

