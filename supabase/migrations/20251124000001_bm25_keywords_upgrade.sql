-- Add keywords column and BM25-based hybrid search
-- Migration to improve text search with BM25 ranking and LLM-generated keywords

-- Step 1: Add keywords column to document_chunks
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS keywords TEXT[];

-- Step 2: Add GIN index for keywords array (fast array containment queries)
CREATE INDEX IF NOT EXISTS document_chunks_keywords_idx 
ON document_chunks 
USING gin(keywords);

-- Step 3: Create materialized tsvector column for better BM25 performance
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- Step 4: Create index on materialized tsvector
CREATE INDEX IF NOT EXISTS document_chunks_content_tsv_idx 
ON document_chunks 
USING gin(content_tsv);

-- Step 5: Create function to update tsvector from content + keywords
CREATE OR REPLACE FUNCTION update_content_tsv()
RETURNS TRIGGER AS $$
BEGIN
  -- Combine content and keywords (if present) into tsvector
  NEW.content_tsv := 
    setweight(to_tsvector('italian', COALESCE(NEW.content, '')), 'A') ||
    setweight(to_tsvector('italian', COALESCE(array_to_string(NEW.keywords, ' '), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger to auto-update tsvector
DROP TRIGGER IF EXISTS document_chunks_tsv_update ON document_chunks;
CREATE TRIGGER document_chunks_tsv_update
  BEFORE INSERT OR UPDATE OF content, keywords
  ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_content_tsv();

-- Step 7: Populate existing rows (may take time on large datasets)
UPDATE document_chunks 
SET content_tsv = 
  setweight(to_tsvector('italian', COALESCE(content, '')), 'A') ||
  setweight(to_tsvector('italian', COALESCE(array_to_string(keywords, ' '), '')), 'B')
WHERE content_tsv IS NULL;

-- Step 8: Drop old hybrid_search and create BM25-based version
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
  -- Preprocess query for tsquery
  cleaned_query TEXT := regexp_replace(
    regexp_replace(query_text, '[?!.,;:()\[\]{}"''`]', ' ', 'g'),
    '\s+',
    ' ',
    'g'
  );
  tsquery_result tsquery;
  filter_document_id UUID := p_document_id;
  filter_article_number INT := article_number;
BEGIN
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
        -- BM25 ranking using ts_rank_cd with normalization 2 (document length)
        CAST(ts_rank_cd(
          COALESCE(dc.content_tsv, to_tsvector('italian', dc.content)),
          tsquery_result,
          2  -- Normalization method 2: divide by document length (BM25-like)
        ) AS DOUBLE PRECISION),
        0.0
      ) = 0.0 THEN
        -- No text match: use vector-only to avoid degrading results
        (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION
      ELSE
        -- Text match found: use hybrid scoring
        (
          vector_weight * (1 - (dc.embedding <=> query_embedding)) +
          text_weight * LEAST(
            COALESCE(
              CAST(ts_rank_cd(
                COALESCE(dc.content_tsv, to_tsvector('italian', dc.content)),
                tsquery_result,
                2  -- BM25-like normalization
              ) AS DOUBLE PRECISION),
              0.0
            ),
            1.0
          )
        )::DOUBLE PRECISION
    END AS similarity,
    -- Separate vector similarity score
    (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION AS vector_score,
    -- Separate BM25 text score (normalized to 0-1 range)
    LEAST(
      COALESCE(
        CAST(ts_rank_cd(
          COALESCE(dc.content_tsv, to_tsvector('italian', dc.content)),
          tsquery_result,
          2
        ) AS DOUBLE PRECISION),
        0.0
      ),
      1.0
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

-- Step 9: Add comment for documentation
COMMENT ON FUNCTION hybrid_search IS 'BM25-enhanced hybrid search combining vector similarity with BM25 full-text ranking. Uses materialized tsvector with content (weight A) and LLM-generated keywords (weight B) for improved semantic and keyword matching. Normalization method 2 provides BM25-like document length compensation.';

-- Step 10: Create helper function to extract keywords from text using array
CREATE OR REPLACE FUNCTION extract_top_keywords(
  p_content TEXT,
  p_limit INT DEFAULT 10
)
RETURNS TEXT[]
LANGUAGE plpgsql
AS $$
DECLARE
  keyword_array TEXT[];
BEGIN
  -- Extract top N keywords from tsvector using ts_stat
  -- This is a simple frequency-based extraction, LLM will provide better keywords
  SELECT ARRAY_AGG(word ORDER BY ndoc DESC, nentry DESC)
  INTO keyword_array
  FROM (
    SELECT word, ndoc, nentry
    FROM ts_stat('SELECT to_tsvector(''italian'', ''' || replace(p_content, '''', '''''') || ''')')
    WHERE length(word) > 3  -- Skip short words
    ORDER BY ndoc DESC, nentry DESC
    LIMIT p_limit
  ) subq;
  
  RETURN COALESCE(keyword_array, ARRAY[]::TEXT[]);
END;
$$;

COMMENT ON FUNCTION extract_top_keywords IS 'Extracts top keywords from text content using frequency analysis. Used as fallback when LLM keyword generation is not available.';
