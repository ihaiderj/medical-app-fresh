-- Check the exact structure of doctor_assignments table
-- Run this in your Supabase SQL Editor

-- Check doctor_assignments table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'doctor_assignments' 
ORDER BY ordinal_position;

-- Check doctors table structure  
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'doctors' 
ORDER BY ordinal_position;

-- Check if there are any existing doctor assignments
SELECT COUNT(*) as total_assignments FROM doctor_assignments;

-- Check if there are any doctors
SELECT COUNT(*) as total_doctors FROM doctors;

