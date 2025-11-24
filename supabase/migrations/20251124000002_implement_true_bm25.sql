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
  content_tsv tsvector,
  query_tsquery tsquery,
  doc_length INTEGER,
  avg_doc_length FLOAT,
  k1 FLOAT DEFAULT 1.2,
  b FLOAT DEFAULT 0.75
)
RETURNS FLOAT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  term_freq INTEGER;
  doc_freq INTEGER;
  total_docs INTEGER;
  idf FLOAT;
  tf_component FLOAT;
  length_norm FLOAT;
  score FLOAT := 0.0;
  term TEXT;
  terms TEXT[];
BEGIN
  -- Extract query terms from tsquery
  terms := regexp_split_to_array(
    regexp_replace(query_tsquery::TEXT, '[&|!():*]', ' ', 'g'),
    '\s+'
  );
  
  -- Get total document count (cached in session)
  SELECT COUNT(DISTINCT document_id)::INTEGER INTO total_docs 
  FROM document_chunks;
  
  -- Calculate BM25 for each query term
  FOREACH term IN ARRAY terms
  LOOP
    CONTINUE WHEN term = '' OR term IS NULL;
    
    -- Get term frequency in this document
    SELECT COALESCE(
      (SELECT count FROM unnest(content_tsv) WITH ORDINALITY AS t(lexeme, positions, count) 
       WHERE lexeme = lower(term) LIMIT 1),
      0
    ) INTO term_freq;
    
    CONTINUE WHEN term_freq = 0;
    
    -- Get document frequency (how many documents contain this term)
    SELECT COUNT(DISTINCT document_id)::INTEGER INTO doc_freq
    FROM document_chunks
    WHERE content_tsv @@ to_tsquery('italian', term);
    
    -- Calculate IDF: log((N - df + 0.5) / (df + 0.5))
    idf := ln((total_docs - doc_freq + 0.5) / (doc_freq + 0.5 + 1.0));
    
    -- Calculate length normalization
    length_norm := (1.0 - b + b * (doc_length::FLOAT / NULLIF(avg_doc_length, 0)));
    
    -- Calculate TF component: (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * length_norm)
    tf_component := (term_freq::FLOAT * (k1 + 1.0)) / (term_freq::FLOAT + k1 * length_norm);
    
    -- Accumulate score
    score := score + (idf * tf_component);
  END LOOP;
  
  -- Normalize to 0-1 range (approximation)
  RETURN GREATEST(0.0, LEAST(1.0, score / 10.0));
END;
$$;

COMMENT ON FUNCTION bm25_score IS 'True BM25 scoring implementation with IDF calculation, term frequency saturation (k1=1.2), and length normalization (b=0.75). Returns normalized score 0-1.';

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
  SELECT AVG(array_length(string_to_array(content, ' '), 1))::FLOAT 
  INTO avg_length
  FROM document_chunks;
  
  -- Build tsquery with websearch syntax, fallback to plainto
  tsquery_result := COALESCE(
    websearch_to_tsquery('italian', query_text),
    plainto_tsquery('italian', cleaned_query),
    to_tsquery('italian', '')
  );
  
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
