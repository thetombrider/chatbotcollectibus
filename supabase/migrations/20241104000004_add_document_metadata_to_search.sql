-- Add document filename to hybrid_search results
-- This migration adds JOIN with documents table to include filename in search results
-- for better citations and user experience

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
    (
      vector_weight * (1 - (dc.embedding <=> query_embedding)) +
      (1 - vector_weight) * CAST(ts_rank_cd(
        to_tsvector('italian', dc.content),
        websearch_to_tsquery('italian', query_text),
        32  -- Normalization: divide by document length
      ) AS DOUBLE PRECISION)
    )::DOUBLE PRECISION AS similarity,
    (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION AS vector_score,
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
COMMENT ON FUNCTION hybrid_search IS 'Hybrid search combining vector similarity and full-text search with configurable weights. Returns top matching chunks with separate scores and document filename for citations.';

-- Note: Questa migrazione aggiunge il JOIN con documents per includere document_filename
-- nei risultati della ricerca. Questo è già stato applicato nel database come
-- add_document_metadata_to_search_v2, ma viene aggiunto qui per allineamento del repo.

















