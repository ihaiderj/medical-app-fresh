-- Fix Supabase Storage Policies for Brochures
-- Run this in your Supabase SQL Editor

-- Enable RLS on storage.buckets if not already enabled
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- Enable RLS on storage.objects if not already enabled  
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow authenticated users to create buckets" ON storage.buckets;
DROP POLICY IF EXISTS "Allow authenticated users to view buckets" ON storage.buckets;
DROP POLICY IF EXISTS "Allow authenticated users to update buckets" ON storage.buckets;
DROP POLICY IF EXISTS "Allow authenticated users to delete buckets" ON storage.buckets;

DROP POLICY IF EXISTS "Allow authenticated users to upload files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete files" ON storage.objects;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads" ON storage.objects;

-- Create bucket policies for authenticated users
CREATE POLICY "Allow authenticated users to create buckets" ON storage.buckets
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users to view buckets" ON storage.buckets
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to update buckets" ON storage.buckets
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated users to delete buckets" ON storage.buckets
    FOR DELETE TO authenticated
    USING (true);

-- Create object policies for brochures bucket
CREATE POLICY "Allow authenticated users to upload files" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'brochures');

CREATE POLICY "Allow authenticated users to view files" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'brochures');

CREATE POLICY "Allow authenticated users to update files" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'brochures');

CREATE POLICY "Allow authenticated users to delete files" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'brochures');

-- Allow public access to files in brochures bucket (for downloads)
CREATE POLICY "Allow public downloads" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'brochures');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;
GRANT ALL ON storage.objects TO authenticated;

-- Grant public access for downloads
GRANT USAGE ON SCHEMA storage TO public;
GRANT SELECT ON storage.objects TO public;

-- Create the brochures bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
VALUES (
    'brochures',
    'brochures', 
    true,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    public = true,
    updated_at = NOW();

-- Verify the setup
SELECT 'Storage policies created successfully!' as status;

