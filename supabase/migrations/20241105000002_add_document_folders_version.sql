-- Add folder column (flat structure)
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS folder TEXT DEFAULT NULL;

-- Add version column for version tracking
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add parent_version_id column for version history (optional, to link versions)
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS documents_folder_idx ON documents(folder);
CREATE INDEX IF NOT EXISTS documents_version_idx ON documents(version);
CREATE INDEX IF NOT EXISTS documents_parent_version_idx ON documents(parent_version_id);

