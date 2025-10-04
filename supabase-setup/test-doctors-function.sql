-- Test the MR doctors function to see if it works
-- Run this in your Supabase SQL Editor

-- Test if function exists and works
SELECT * FROM get_mr_assigned_doctors('c88b07e5-316e-4d53-9aa5-f3b12fb78abc'::uuid) LIMIT 5;

-- Also check if the doctors table has data
SELECT id, first_name, last_name, specialty, hospital FROM doctors LIMIT 5;

-- Check if there are any doctor assignments
SELECT * FROM mr_doctor_assignments LIMIT 5;
