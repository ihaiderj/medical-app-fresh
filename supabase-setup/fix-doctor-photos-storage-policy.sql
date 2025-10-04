-- Fix storage policies for doctor photos
-- Run this in your Supabase SQL Editor

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for doctor photos if they exist
DROP POLICY IF EXISTS "Allow doctor photo uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow doctor photo reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow doctor photo updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow doctor photo deletes" ON storage.objects;

-- Create policy to allow uploads to doctor_photos folder
CREATE POLICY "Allow doctor photo uploads" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'brochures' 
    AND (storage.foldername(name))[1] = 'doctor_photos'
);

-- Create policy to allow reading doctor photos (public access)
CREATE POLICY "Allow doctor photo reads" ON storage.objects
FOR SELECT USING (
    bucket_id = 'brochures' 
    AND (storage.foldername(name))[1] = 'doctor_photos'
);

-- Create policy to allow updating doctor photos
CREATE POLICY "Allow doctor photo updates" ON storage.objects
FOR UPDATE USING (
    bucket_id = 'brochures' 
    AND (storage.foldername(name))[1] = 'doctor_photos'
);

-- Create policy to allow deleting doctor photos
CREATE POLICY "Allow doctor photo deletes" ON storage.objects
FOR DELETE USING (
    bucket_id = 'brochures' 
    AND (storage.foldername(name))[1] = 'doctor_photos'
);

-- Test the policies by checking if they exist
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects' 
AND policyname LIKE '%doctor%';

-- Also check if the brochures bucket exists and is properly configured
SELECT * FROM storage.buckets WHERE name = 'brochures';
