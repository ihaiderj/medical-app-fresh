-- Fix brochure delete functionality
-- Run this in your Supabase SQL Editor

-- Ensure the admin delete policy exists for brochures
DROP POLICY IF EXISTS "Admins can delete brochures" ON brochures;

CREATE POLICY "Admins can delete brochures" ON brochures
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.users.id = auth.uid() 
            AND auth.users.email = 'admin@medpresent.com'
        )
    );

-- Also allow users to delete their own uploaded brochures
CREATE POLICY "Users can delete their own brochures" ON brochures
    FOR DELETE USING (uploaded_by::text = auth.uid()::text);

-- Test the delete functionality by checking current brochures
-- SELECT id, title, uploaded_by FROM brochures;

