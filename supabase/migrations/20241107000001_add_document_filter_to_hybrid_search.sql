-- Add document ID filtering to hybrid_search
-- Allows filtering chunks by specific document ID when user tags a document with @document-name
-- This ensures that queries with @document-name return only relevant chunks from that specific document

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  query_text TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  vector_weight FLOAT DEFAULT 0.7,
  article_number INT DEFAULT NULL,  -- Optional article number filter
  document_id UUID DEFAULT NULL      -- NEW: optional document ID filter
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
    -- Filtro per document_id se fornito
    (
      document_id IS NULL 
      OR 
      dc.document_id = document_id
    )
    AND
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
COMMENT ON FUNCTION hybrid_search IS 'Hybrid search with article number and document ID filtering. When document_id is provided, only returns chunks from that specific document. When article_number is provided, only returns chunks from that specific article. Uses vector similarity + full-text search with configurable weights.';






