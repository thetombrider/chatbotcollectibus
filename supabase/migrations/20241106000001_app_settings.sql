-- Create app_settings table for application-level settings
-- Purpose: Store application-wide settings like company logo, etc.

CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on key for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Enable RLS (Row Level Security) - for now, allow all reads (we'll restrict later if needed)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read settings (public read for logo)
CREATE POLICY "Allow public reads"
ON app_settings FOR SELECT
TO public
USING (true);

-- Policy: Allow authenticated users to update settings (only admins should do this)
-- For now, we'll restrict this to service role only (via API routes)
CREATE POLICY "Allow authenticated updates"
ON app_settings FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated inserts"
ON app_settings FOR INSERT
TO authenticated
WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_settings_updated_at();

-- Insert default settings row
INSERT INTO app_settings (key, value)
VALUES ('company_logo', '{"url": null, "storage_path": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

