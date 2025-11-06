-- Structure metadata utilities
-- Adds helper functions and indexes for structural metadata (articles, sections, chapters)
-- Supports adaptive chunking that preserves document structure

-- Funzione per estrarre articleNumber da metadata
CREATE OR REPLACE FUNCTION get_chunk_article_number(chunk_metadata JSONB)
RETURNS INTEGER AS $$
BEGIN
  RETURN (chunk_metadata->>'articleNumber')::INTEGER;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Funzione per estrarre articleType da metadata
CREATE OR REPLACE FUNCTION get_chunk_article_type(chunk_metadata JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN chunk_metadata->>'articleType';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Funzione per estrarre sectionTitle da metadata
CREATE OR REPLACE FUNCTION get_chunk_section_title(chunk_metadata JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN chunk_metadata->>'sectionTitle';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Funzione per estrarre sectionLevel da metadata
CREATE OR REPLACE FUNCTION get_chunk_section_level(chunk_metadata JSONB)
RETURNS INTEGER AS $$
BEGIN
  RETURN (chunk_metadata->>'sectionLevel')::INTEGER;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Funzione per estrarre chapterNumber da metadata
CREATE OR REPLACE FUNCTION get_chunk_chapter_number(chunk_metadata JSONB)
RETURNS TEXT AS $$
BEGIN
  RETURN chunk_metadata->>'chapterNumber';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Index per filtering per articleNumber (utile per filtrare chunks per articolo specifico)
CREATE INDEX IF NOT EXISTS document_chunks_article_number_idx 
ON document_chunks ((metadata->>'articleNumber'))
WHERE metadata->>'articleNumber' IS NOT NULL;

-- Index per filtering per sectionTitle (utile per filtrare chunks per sezione)
CREATE INDEX IF NOT EXISTS document_chunks_section_title_idx 
ON document_chunks ((metadata->>'sectionTitle'))
WHERE metadata->>'sectionTitle' IS NOT NULL;

-- Index per filtering per articleType (utile per distinguere articoli completi da parziali)
CREATE INDEX IF NOT EXISTS document_chunks_article_type_idx 
ON document_chunks ((metadata->>'articleType'))
WHERE metadata->>'articleType' IS NOT NULL;

-- Commenti per documentazione
COMMENT ON FUNCTION get_chunk_article_number IS 'Estrae il numero dell''articolo dal metadata JSONB del chunk';
COMMENT ON FUNCTION get_chunk_article_type IS 'Estrae il tipo di articolo (complete o partial) dal metadata del chunk';
COMMENT ON FUNCTION get_chunk_section_title IS 'Estrae il titolo della sezione dal metadata del chunk';
COMMENT ON FUNCTION get_chunk_section_level IS 'Estrae il livello della sezione (per markdown headers) dal metadata del chunk';
COMMENT ON FUNCTION get_chunk_chapter_number IS 'Estrae il numero del capitolo dal metadata del chunk';

