-- Check current storage policies
-- Run this in your Supabase SQL Editor

-- Check if RLS is enabled on storage.objects
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'storage' AND tablename = 'objects';

-- Check existing storage policies
SELECT policyname, cmd, qual, with_check 
FROM pg_policies 
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- Check brochures bucket configuration
SELECT * FROM storage.buckets WHERE name = 'brochures';

-- Test if we can see objects in the bucket
SELECT name, bucket_id, owner 
FROM storage.objects 
WHERE bucket_id = 'brochures' 
ORDER BY created_at DESC 
LIMIT 10;
