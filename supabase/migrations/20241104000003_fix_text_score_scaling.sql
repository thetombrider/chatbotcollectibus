-- Fix text_score scaling in hybrid search
-- Problem: ts_rank_cd with normalization 32 returns values between 0-0.1, too small compared to vector scores
-- Solution: Use normalization 1 (divide by 1 + log(document length)) and scale the result

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
DECLARE
  text_weight FLOAT := 1 - vector_weight;
  -- Fattore di scaling per text_score: moltiplica i valori di ts_rank_cd
  -- ts_rank_cd tipicamente restituisce 0-0.1, lo scaliamo a 0-1
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
COMMENT ON FUNCTION hybrid_search IS 'Hybrid search with improved text_score scaling. Uses normalization 1 instead of 32 and scales text scores by 10x to make them comparable to vector scores (0-1 range).';

-- Note sui miglioramenti:
-- 1. Cambiata normalizzazione da 32 a 1 (più sensibile ai match)
-- 2. Aggiunto scaling factor 10x per text_score
-- 3. Aggiunto LEAST() per cappare i valori a 1.0
-- 4. Dichiarata variabile text_scale_factor per facile tuning

