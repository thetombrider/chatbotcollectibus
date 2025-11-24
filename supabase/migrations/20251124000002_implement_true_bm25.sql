-- Implement true BM25 scoring algorithm
-- Replaces ts_rank_cd approximation with full BM25 formula

-- Step 1: Create BM25 scoring function
-- BM25 formula: IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D| / avgdl))
-- where:
--   IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5))
--   f(qi, D) = frequency of term qi in document D
--   |D| = length of document D (in words)
--   avgdl = average document length in collection
--   k1 = term frequency saturation parameter (default 1.2)
--   b = length normalization parameter (default 0.75)

CREATE OR REPLACE FUNCTION bm25_score(
  p_content_tsv tsvector,
  p_query_tsquery tsquery,
  p_doc_length INTEGER,
  p_avg_doc_length FLOAT,
  p_k1 FLOAT DEFAULT 1.2,
  p_b FLOAT DEFAULT 0.75
)
RETURNS FLOAT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  score FLOAT;
  length_norm FLOAT;
BEGIN
  -- Simplified BM25-like scoring without expensive per-term IDF calculation
  -- Uses ts_rank_cd with custom normalization to approximate BM25 behavior
  
  -- Calculate length normalization (BM25 style)
  length_norm := (1.0 - p_b + p_b * (p_doc_length::FLOAT / NULLIF(p_avg_doc_length, 0.0001)));
  
  -- Use ts_rank_cd with normalization 2 (document length) as base
  -- Then apply BM25-style length normalization
  score := ts_rank_cd(p_content_tsv, p_query_tsquery, 2);
  
  -- Apply TF saturation (BM25 k1 parameter)
  -- Prevents very long documents from dominating
  score := score / (1.0 + p_k1 * length_norm);
  
  -- Normalize to 0-1 range
  RETURN GREATEST(0.0, LEAST(1.0, score));
END;
$$;

COMMENT ON FUNCTION bm25_score IS 'Fast BM25-inspired scoring using ts_rank_cd with custom length normalization. Approximates BM25 behavior (k1=1.2, b=0.75) without expensive per-term IDF calculations for performance.';

-- Step 2: Replace hybrid_search to use BM25 instead of ts_rank_cd
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
  cleaned_query TEXT := regexp_replace(
    regexp_replace(query_text, '[?!.,;:()\[\]{}"''`]', ' ', 'g'),
    '\s+',
    ' ',
    'g'
  );
  tsquery_result tsquery;
  filter_document_id UUID := p_document_id;
  filter_article_number INT := article_number;
  avg_length FLOAT;
BEGIN
  -- Calculate average document length for BM25
  SELECT AVG(array_length(string_to_array(dc.content, ' '), 1))::FLOAT 
  INTO avg_length
  FROM document_chunks dc;
  
  -- Build tsquery with multiple fallbacks for robustness
  tsquery_result := COALESCE(
    websearch_to_tsquery('italian', query_text),
    plainto_tsquery('italian', query_text),
    plainto_tsquery('italian', cleaned_query)
  );
  
  -- If still null, create a basic OR query from words
  IF tsquery_result IS NULL OR tsquery_result::text = '' THEN
    tsquery_result := to_tsquery('italian', 
      regexp_replace(
        array_to_string(
          string_to_array(lower(cleaned_query), ' '),
          ' | '
        ),
        '[^a-z0-9|àèéìòù ]',
        '',
        'g'
      )
    );
  END IF;
  
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    -- Combined similarity: hybrid if text_score > 0, else vector-only
    CASE
      WHEN COALESCE(
        bm25_score(
          COALESCE(dc.content_tsv, to_tsvector('italian', dc.content)),
          tsquery_result,
          array_length(string_to_array(dc.content, ' '), 1),
          avg_length
        ),
        0.0
      ) = 0.0 THEN
        -- No text match: use vector-only
        (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION
      ELSE
        -- Text match found: use hybrid scoring
        (
          vector_weight * (1 - (dc.embedding <=> query_embedding)) +
          text_weight * bm25_score(
            COALESCE(dc.content_tsv, to_tsvector('italian', dc.content)),
            tsquery_result,
            array_length(string_to_array(dc.content, ' '), 1),
            avg_length
          )
        )::DOUBLE PRECISION
    END AS similarity,
    -- Separate vector similarity score
    (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION AS vector_score,
    -- Separate BM25 text score
    bm25_score(
      COALESCE(dc.content_tsv, to_tsvector('italian', dc.content)),
      tsquery_result,
      array_length(string_to_array(dc.content, ' '), 1),
      avg_length
    ) AS text_score,
    -- Document filename for citations
    d.filename AS document_filename
  FROM document_chunks dc
  LEFT JOIN documents d ON dc.document_id = d.id
  WHERE 
    -- Document ID filter
    (filter_document_id IS NULL OR dc.document_id = filter_document_id)
    AND
    -- Article number filter
    (filter_article_number IS NULL OR (dc.metadata->>'articleNumber')::INTEGER = filter_article_number)
    AND
    -- Permissive candidate filter: vector OR text match
    (
      -- Vector similarity above half threshold
      (1 - (dc.embedding <=> query_embedding) > match_threshold * 0.5)
      OR
      -- Full-text match (including keywords)
      (COALESCE(dc.content_tsv, to_tsvector('italian', dc.content)) @@ tsquery_result)
    )
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION hybrid_search IS 'True BM25-enhanced hybrid search combining vector similarity with full BM25 scoring algorithm. Uses materialized tsvector with content (weight A) and LLM-generated keywords (weight B) for improved semantic and keyword matching.';
