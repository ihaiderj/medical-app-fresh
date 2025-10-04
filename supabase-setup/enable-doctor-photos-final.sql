-- Final setup for doctor photos with proper function signatures
-- Run this in your Supabase SQL Editor

-- First run the updated functions
-- Run this first: fix-doctor-photos-function-v2.sql

-- Then run the updated get function
-- Run this: fix-mr-doctors-function-correct.sql

-- Test that everything works
SELECT 'Testing doctor functions...' as status;

-- Test the get function (should now include profile_image_url)
SELECT doctor_id, first_name, last_name, profile_image_url 
FROM get_mr_assigned_doctors('f726b2a4-0ec0-4193-bcb4-a172c5b090a4'::uuid) 
LIMIT 3;

-- Test if we can see storage objects
SELECT name, bucket_id, created_at 
FROM storage.objects 
WHERE bucket_id = 'brochures' 
ORDER BY created_at DESC 
LIMIT 5;

SELECT 'Setup complete!' as status;
