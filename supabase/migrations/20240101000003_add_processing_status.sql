-- Add processing_status column to documents table
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending' 
CHECK (processing_status IN ('pending', 'processing', 'completed', 'error'));

-- Add index for filtering by processing status
CREATE INDEX IF NOT EXISTS documents_processing_status_idx 
ON documents(processing_status);

-- Add error_message column for processing errors
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add chunks_count column for tracking
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS chunks_count INTEGER DEFAULT 0;












