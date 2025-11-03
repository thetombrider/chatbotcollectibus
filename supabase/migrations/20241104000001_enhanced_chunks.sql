-- Enhanced chunk metadata utilities
-- Adds helper functions and indexes for improved chunk metadata access

-- Funzione per estrarre section da metadata
CREATE OR REPLACE FUNCTION get_chunk_section(chunk_metadata JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN chunk_metadata->>'section';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Funzione per estrarre content type da metadata
CREATE OR REPLACE FUNCTION get_chunk_content_type(chunk_metadata JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN chunk_metadata->>'contentType';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Funzione per estrarre token count da metadata
CREATE OR REPLACE FUNCTION get_chunk_token_count(chunk_metadata JSONB)
RETURNS INTEGER AS $$
BEGIN
  RETURN (chunk_metadata->>'tokenCount')::INTEGER;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Funzione per estrarre processing method da metadata
CREATE OR REPLACE FUNCTION get_chunk_processing_method(chunk_metadata JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN chunk_metadata->>'processingMethod';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Index per filtering per section (utile per filtrare chunks per sezione documento)
CREATE INDEX IF NOT EXISTS document_chunks_section_idx 
ON document_chunks ((metadata->>'section'))
WHERE metadata->>'section' IS NOT NULL;

-- Index per filtering per content type (utile per filtrare solo tabelle, headers, etc)
CREATE INDEX IF NOT EXISTS document_chunks_content_type_idx 
ON document_chunks ((metadata->>'contentType'))
WHERE metadata->>'contentType' IS NOT NULL;

-- Index per filtering per processing method (utile per analytics su OCR vs native)
CREATE INDEX IF NOT EXISTS document_chunks_processing_method_idx 
ON document_chunks ((metadata->>'processingMethod'))
WHERE metadata->>'processingMethod' IS NOT NULL;

-- Commenti per documentazione
COMMENT ON FUNCTION get_chunk_section IS 'Estrae il nome della sezione dal metadata JSONB del chunk';
COMMENT ON FUNCTION get_chunk_content_type IS 'Estrae il tipo di contenuto (paragraph, heading, list, table, mixed) dal metadata';
COMMENT ON FUNCTION get_chunk_token_count IS 'Estrae il numero di token dal metadata del chunk';
COMMENT ON FUNCTION get_chunk_processing_method IS 'Estrae il metodo di processing usato (mistral-ocr, native, native-fallback)';

