-- Improved hybrid search function
-- Combines vector similarity + full-text search with configurable weights and better ranking

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  query_text TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  vector_weight FLOAT DEFAULT 0.7
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
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    -- Combined similarity score con pesi configurabili (cast esplicito a DOUBLE PRECISION)
    (
      vector_weight * (1 - (dc.embedding <=> query_embedding)) +
      (1 - vector_weight) * CAST(ts_rank_cd(
        to_tsvector('italian', dc.content),
        websearch_to_tsquery('italian', query_text),
        32  -- Normalization: divide by document length
      ) AS DOUBLE PRECISION)
    )::DOUBLE PRECISION AS similarity,
    -- Vector similarity score separato (per debugging/analytics, cast esplicito)
    (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION AS vector_score,
    -- Full-text search score separato (per debugging/analytics, cast esplicito)
    CAST(ts_rank_cd(
      to_tsvector('italian', dc.content),
      websearch_to_tsquery('italian', query_text),
      32
    ) AS DOUBLE PRECISION) AS text_score,
    -- Document filename per citazioni
    d.filename AS document_filename
  FROM document_chunks dc
  LEFT JOIN documents d ON dc.document_id = d.id
  WHERE 
    -- Filtro: includi se passa soglia vector similarity O full-text match
    (1 - (dc.embedding <=> query_embedding) > match_threshold * 0.5) OR
    (to_tsvector('italian', dc.content) @@ websearch_to_tsquery('italian', query_text))
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Commento per documentazione
COMMENT ON FUNCTION hybrid_search IS 'Hybrid search combining vector similarity and full-text search with configurable weights. Returns top matching chunks with separate scores for debugging.';

-- Note sui miglioramenti rispetto alla versione precedente:
-- 1. Pesi configurabili (vector_weight parameter) invece di 70/30 fissi
-- 2. websearch_to_tsquery invece di plainto_tsquery (supporta operatori booleani: AND, OR, NOT, "phrase")
-- 3. ts_rank_cd con normalization (32) invece di ts_rank (normalizza per lunghezza documento)
-- 4. JOIN con documents per avere filename direttamente
-- 5. Ritorna vector_score e text_score separati per analytics
-- 6. Soglia più permissiva per vector similarity (match_threshold * 0.5) per catch più risultati

