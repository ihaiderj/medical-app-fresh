-- Fix User IDs After Migration - Complete Solution
-- This script updates the users table IDs to match Supabase Auth user IDs
-- AND updates all foreign key references
-- 
-- IMPORTANT: Run this in Supabase SQL Editor
-- This will update all related tables to maintain data integrity

BEGIN;

-- Step 1: Update foreign key references in all related tables
-- This must be done BEFORE updating the users table

-- Update saved_brochures table
UPDATE saved_brochures 
SET mr_id = CASE 
    WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'  -- billy@gmail.com
    WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'  -- immy666@gmail.com
    WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'  -- salman@gmail.com
    ELSE mr_id
END
WHERE mr_id IN (
    '6214bd64-9db1-4ae1-bb87-adff581a2a44',  -- billy@gmail.com old ID
    '065a30b3-2300-498d-aa6f-0589567e5e28',  -- immy666@gmail.com old ID
    '2b4924ca-0572-4da7-9ce7-17a87ec80239'   -- salman@gmail.com old ID
);

-- Update brochure_sync table
UPDATE brochure_sync 
SET mr_id = CASE 
    WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'  -- billy@gmail.com
    WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'  -- immy666@gmail.com
    WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'  -- salman@gmail.com
    ELSE mr_id
END
WHERE mr_id IN (
    '6214bd64-9db1-4ae1-bb87-adff581a2a44',  -- billy@gmail.com old ID
    '065a30b3-2300-498d-aa6f-0589567e5e28',  -- immy666@gmail.com old ID
    '2b4924ca-0572-4da7-9ce7-17a87ec80239'   -- salman@gmail.com old ID
);

-- Update user_sessions table
UPDATE user_sessions 
SET user_id = CASE 
    WHEN user_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'  -- billy@gmail.com
    WHEN user_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'  -- immy666@gmail.com
    WHEN user_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'  -- salman@gmail.com
    ELSE user_id
END
WHERE user_id IN (
    '6214bd64-9db1-4ae1-bb87-adff581a2a44',  -- billy@gmail.com old ID
    '065a30b3-2300-498d-aa6f-0589567e5e28',  -- immy666@gmail.com old ID
    '2b4924ca-0572-4da7-9ce7-17a87ec80239'   -- salman@gmail.com old ID
);

-- Update activity_logs table
UPDATE activity_logs 
SET user_id = CASE 
    WHEN user_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'  -- billy@gmail.com
    WHEN user_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'  -- immy666@gmail.com
    WHEN user_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'  -- salman@gmail.com
    ELSE user_id
END
WHERE user_id IN (
    '6214bd64-9db1-4ae1-bb87-adff581a2a44',  -- billy@gmail.com old ID
    '065a30b3-2300-498d-aa6f-0589567e5e28',  -- immy666@gmail.com old ID
    '2b4924ca-0572-4da7-9ce7-17a87ec80239'   -- salman@gmail.com old ID
);

-- Update meetings table (if it has mr_id column)
UPDATE meetings 
SET mr_id = CASE 
    WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'  -- billy@gmail.com
    WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'  -- immy666@gmail.com
    WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'  -- salman@gmail.com
    ELSE mr_id
END
WHERE mr_id IN (
    '6214bd64-9db1-4ae1-bb87-adff581a2a44',  -- billy@gmail.com old ID
    '065a30b3-2300-498d-aa6f-0589567e5e28',  -- immy666@gmail.com old ID
    '2b4924ca-0572-4da7-9ce7-17a87ec80239'   -- salman@gmail.com old ID
);

-- Update doctor_assignments table (if it exists)
UPDATE doctor_assignments 
SET mr_id = CASE 
    WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'  -- billy@gmail.com
    WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'  -- immy666@gmail.com
    WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'  -- salman@gmail.com
    ELSE mr_id
END
WHERE mr_id IN (
    '6214bd64-9db1-4ae1-bb87-adff581a2a44',  -- billy@gmail.com old ID
    '065a30b3-2300-498d-aa6f-0589567e5e28',  -- immy666@gmail.com old ID
    '2b4924ca-0572-4da7-9ce7-17a87ec80239'   -- salman@gmail.com old ID
);

-- Step 2: Now update the users table IDs
UPDATE users 
SET id = '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
WHERE email = 'billy@gmail.com';

UPDATE users 
SET id = 'a32b5cd4-2670-488e-9bb5-24acf6540230'
WHERE email = 'immy666@gmail.com';

UPDATE users 
SET id = 'e53371eb-64be-4d18-8720-9aea95d26658'
WHERE email = 'salman@gmail.com';

-- Step 3: Verify the updates
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    au.id AS auth_id,
    CASE 
        WHEN u.id = au.id THEN '✅ IDs Match'
        ELSE '❌ IDs Mismatch'
    END AS status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.email IN ('billy@gmail.com', 'immy666@gmail.com', 'salman@gmail.com')
ORDER BY u.email;

COMMIT;

-- If you see any errors, run ROLLBACK; instead of COMMIT;

