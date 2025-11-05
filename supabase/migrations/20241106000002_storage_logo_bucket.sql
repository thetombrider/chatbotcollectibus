-- Create storage bucket for company logo
-- Purpose: Store company logo image (public bucket for easy access)

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logo', 'company-logo', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow public reads (logo should be accessible)
CREATE POLICY "Allow public reads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-logo');

-- Storage policy: allow authenticated users to upload/update logo
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-logo');

CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'company-logo');

CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'company-logo');

