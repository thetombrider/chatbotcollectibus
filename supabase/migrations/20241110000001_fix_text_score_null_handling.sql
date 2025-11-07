-- Fix text_score NULL handling in hybrid_search
-- Problem: websearch_to_tsquery can return NULL when query contains special characters,
--          complex queries, or cannot be tokenized. This causes text_score to always be 0.
-- Solution: Use COALESCE with fallback to plainto_tsquery and preprocess query to remove problematic characters

-- Drop all existing versions of hybrid_search to avoid signature conflicts
DROP FUNCTION IF EXISTS hybrid_search CASCADE;

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(1536),
  query_text TEXT,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  vector_weight FLOAT DEFAULT 0.7,
  article_number INT DEFAULT NULL,
  p_document_id UUID DEFAULT NULL
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
  -- Preprocessed query: remove problematic characters and normalize
  cleaned_query TEXT := regexp_replace(
    regexp_replace(query_text, '[?!.,;:()\[\]{}"''`]', ' ', 'g'),
    '\s+',
    ' ',
    'g'
  );
  -- Try websearch_to_tsquery first, fallback to plainto_tsquery if NULL
  tsquery_result tsquery;
  -- Local variables to avoid parameter name conflicts with column names
  filter_document_id UUID := p_document_id;
  filter_article_number INT := article_number;
BEGIN
  -- Build tsquery with fallback: try websearch_to_tsquery first, then plainto_tsquery
  -- Note: plainto_tsquery never returns NULL, so this should always succeed
  tsquery_result := COALESCE(
    websearch_to_tsquery('italian', query_text),
    plainto_tsquery('italian', cleaned_query),
    plainto_tsquery('italian', '')  -- Final fallback: empty query (matches nothing but prevents NULL)
  );
  
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    -- Combined similarity score con text_score scalato e gestione NULL
    (
      vector_weight * (1 - (dc.embedding <=> query_embedding)) +
      text_weight * LEAST(
        COALESCE(
          CAST(ts_rank_cd(
            to_tsvector('italian', dc.content),
            tsquery_result,
            1  -- Normalization: divide by 1 + log(document length)
          ) AS DOUBLE PRECISION) * text_scale_factor,
          0.0  -- Default to 0 if NULL
        ),
        1.0  -- Cap at 1.0 to keep scores comparable
      )
    )::DOUBLE PRECISION AS similarity,
    -- Vector similarity score separato
    (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION AS vector_score,
    -- Full-text search score scalato con gestione NULL (per debugging/analytics)
    LEAST(
      COALESCE(
        CAST(ts_rank_cd(
          to_tsvector('italian', dc.content),
          tsquery_result,
          1
        ) AS DOUBLE PRECISION) * text_scale_factor,
        0.0  -- Default to 0 if NULL
      ),
      1.0
    ) AS text_score,
    -- Document filename per citazioni
    d.filename AS document_filename
  FROM document_chunks dc
  LEFT JOIN documents d ON dc.document_id = d.id
  WHERE 
    -- Filtro per document_id se fornito (usa variabile locale per evitare conflitto con colonna)
    (
      filter_document_id IS NULL 
      OR 
      dc.document_id = filter_document_id
    )
    AND
    -- Filtro per article_number se fornito (usa variabile locale per evitare conflitto)
    (
      filter_article_number IS NULL 
      OR 
      (dc.metadata->>'articleNumber')::INTEGER = filter_article_number
    )
    AND
    -- Filtro più permissivo per catturare più risultati candidati
    (
      -- Passa se vector similarity è sopra metà della soglia
      (1 - (dc.embedding <=> query_embedding) > match_threshold * 0.5)
      OR
      -- Oppure se c'è un match full-text (usa tsquery_result invece di websearch_to_tsquery)
      (to_tsvector('italian', dc.content) @@ tsquery_result)
    )
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Commento per documentazione
COMMENT ON FUNCTION hybrid_search IS 'Hybrid search with fixed text_score NULL handling. Uses COALESCE with websearch_to_tsquery fallback to plainto_tsquery, and preprocesses query to remove problematic characters. Handles NULL values in ts_rank_cd with COALESCE defaults.';

