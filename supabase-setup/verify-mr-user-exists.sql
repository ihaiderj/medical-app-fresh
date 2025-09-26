-- Verify MR User Exists and is Active
-- Run this in your Supabase SQL Editor

-- Check if the user exists with exact email
SELECT 
    id,
    email,
    role,
    is_active,
    first_name,
    last_name
FROM users 
WHERE email = 'valuesinfotech@gmail.com';

-- Check if the user is active
SELECT 
    email,
    is_active,
    role
FROM users 
WHERE email = 'valuesinfotech@gmail.com' 
AND is_active = true;

-- Test the exact query that AuthService uses
SELECT *
FROM users
WHERE email = 'valuesinfotech@gmail.com'
AND is_active = true;

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
