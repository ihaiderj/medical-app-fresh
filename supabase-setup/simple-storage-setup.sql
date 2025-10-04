-- Simple Storage Setup for Brochures (No Admin Rights Required)
-- Run this in your Supabase SQL Editor

-- Create storage policies for objects (this should work with standard permissions)
CREATE POLICY "Allow authenticated uploads to brochures" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'brochures');

CREATE POLICY "Allow authenticated reads from brochures" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'brochures');

CREATE POLICY "Allow public reads from brochures" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'brochures');

CREATE POLICY "Allow authenticated updates to brochures" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'brochures');

CREATE POLICY "Allow authenticated deletes from brochures" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'brochures');

-- Verify the setup
SELECT 'Basic storage policies created!' as status;
