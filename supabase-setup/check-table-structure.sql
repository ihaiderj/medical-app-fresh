-- Check the actual table structure to understand the schema
-- Run this in your Supabase SQL Editor

-- Check doctors table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'doctors' 
ORDER BY ordinal_position;

-- Check doctor_assignments table structure (if it exists)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'doctor_assignments' 
ORDER BY ordinal_position;

-- Check mr_doctor_assignments table structure (more likely name)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'mr_doctor_assignments' 
ORDER BY ordinal_position;

-- List all tables to see what exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%doctor%'
ORDER BY table_name;

