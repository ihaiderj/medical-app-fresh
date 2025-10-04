-- Test to see what MR ID the app is using vs what's in the database
-- Run this in your Supabase SQL Editor

-- Check what MR IDs exist in users table
SELECT id, email, first_name, last_name, role 
FROM users 
WHERE role = 'mr' 
ORDER BY created_at DESC;

-- Check what MR IDs are in doctor_assignments
SELECT DISTINCT mr_id, COUNT(*) as doctor_count
FROM doctor_assignments 
GROUP BY mr_id
ORDER BY doctor_count DESC;

-- Test the function with the actual MR ID from your data
SELECT * FROM get_mr_assigned_doctors('f726b2a4-0ec0-4193-bcb4-a172c5b090a4'::uuid);

