-- Allow public uploads to temp-uploads folder
-- This allows clients to upload large files directly to Supabase Storage
-- bypassing Vercel's 4.5MB serverless limit

-- Drop existing insert policy if it exists (it was for authenticated users only)
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;

-- Create new policy for temp-uploads folder (public access)
CREATE POLICY "Allow public temp uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'temp-uploads'
);

-- Keep authenticated uploads for permanent documents folder
CREATE POLICY "Allow authenticated permanent uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'documents'
);

-- Policy for server to manage all files (uses service role key)
-- No additional policy needed as service role bypasses RLS

-- Add policy for public to delete temp files (for cleanup on client errors)
CREATE POLICY "Allow public temp cleanup"
ON storage.objects FOR DELETE
TO public
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'temp-uploads'
);

-- Keep existing read policy for authenticated users
-- (Already exists from previous migration)

