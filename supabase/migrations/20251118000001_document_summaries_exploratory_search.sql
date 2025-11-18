-- Migration: Add document summaries for exploratory search
-- Description: Adds AI-generated summary and embedding columns to enable semantic document-level search

-- Add summary columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS summary_embedding vector(1536),
ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN documents.summary IS 'AI-generated summary of document content for exploratory search';
COMMENT ON COLUMN documents.summary_embedding IS 'Vector embedding of document summary using text-embedding-3-small (1536 dimensions)';
COMMENT ON COLUMN documents.summary_generated_at IS 'Timestamp when summary was generated';

-- Create vector index for efficient similarity search on summaries
-- Using hnsw with cosine distance (supports high-dimensional vectors like 3072)
-- hnsw provides better accuracy than ivfflat and supports more dimensions
CREATE INDEX IF NOT EXISTS documents_summary_embedding_idx 
ON documents 
USING hnsw (summary_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add index on summary_generated_at for filtering and sorting
CREATE INDEX IF NOT EXISTS documents_summary_generated_at_idx 
ON documents (summary_generated_at);

-- Create function for document-level semantic search
-- This searches documents by their summary embeddings instead of chunk embeddings
CREATE OR REPLACE FUNCTION search_documents_by_summary(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  filename text,
  folder text,
  file_type text,
  summary text,
  similarity float,
  chunks_count int,
  file_size bigint,
  processing_status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.filename,
    d.folder,
    d.file_type,
    d.summary,
    1 - (d.summary_embedding <=> query_embedding) AS similarity,
    d.chunks_count,
    d.file_size,
    d.processing_status,
    d.created_at,
    d.updated_at
  FROM documents d
  WHERE 
    d.summary_embedding IS NOT NULL
    AND d.processing_status = 'completed'
    AND 1 - (d.summary_embedding <=> query_embedding) > match_threshold
  ORDER BY d.summary_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment for function
COMMENT ON FUNCTION search_documents_by_summary IS 'Search documents by semantic similarity of their summaries - used for exploratory queries like "documents about topic X"';
