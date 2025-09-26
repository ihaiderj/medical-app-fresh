-- Test MR Login Query
-- Run this in your Supabase SQL Editor to verify MR user exists and is active

-- Check if MR user exists and is active
SELECT 
    id,
    email,
    role,
    is_active,
    first_name,
    last_name,
    created_at
FROM users 
WHERE email = 'immy666@gmail.com' 
AND role = 'mr';

-- Check all MR users
SELECT 
    email,
    role,
    is_active,
    first_name,
    last_name
FROM users 
WHERE role = 'mr'
ORDER BY created_at;

-- Test the exact query that AuthService uses
SELECT *
FROM users
WHERE email = 'immy666@gmail.com'
AND is_active = true;
