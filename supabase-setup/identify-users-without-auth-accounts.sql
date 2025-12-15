-- Identify MR users who don't have Supabase Auth accounts
-- This script helps identify which users need Supabase Auth accounts created

-- Find all MR users in the users table
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.is_active,
    CASE 
        WHEN au.id IS NULL THEN 'NEEDS_AUTH_ACCOUNT'
        ELSE 'HAS_AUTH_ACCOUNT'
    END AS auth_status
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.role = 'mr' 
    AND u.is_active = true
ORDER BY u.email;

-- Count summary
SELECT 
    COUNT(*) FILTER (WHERE au.id IS NULL) AS users_needing_auth_accounts,
    COUNT(*) FILTER (WHERE au.id IS NOT NULL) AS users_with_auth_accounts,
    COUNT(*) AS total_mr_users
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.role = 'mr' AND u.is_active = true;

