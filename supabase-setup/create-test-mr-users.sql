-- Create Test MR Users
-- Run this in your Supabase SQL Editor to create test MR users

-- Insert test MR users into the users table
INSERT INTO users (
    id,
    email, 
    password_hash, 
    role, 
    first_name, 
    last_name, 
    phone, 
    address,
    profile_image_url,
    can_upload_brochures,
    can_manage_doctors,
    can_schedule_meetings,
    is_active,
    created_at,
    updated_at
) VALUES 
(
    uuid_generate_v4(),
    'mr1@medpresent.com',
    'hashed_password_1', -- In production, use proper password hashing
    'mr',
    'Sarah',
    'Wilson',
    '+1234567890',
    '123 Medical Street, City, State',
    'https://picsum.photos/200/200?random=1',
    true,
    true,
    true,
    true,
    NOW(),
    NOW()
),
(
    uuid_generate_v4(),
    'mr2@medpresent.com',
    'hashed_password_2', -- In production, use proper password hashing
    'mr',
    'John',
    'Smith',
    '+1234567891',
    '456 Healthcare Ave, City, State',
    'https://picsum.photos/200/200?random=2',
    false,
    true,
    true,
    true,
    NOW(),
    NOW()
),
(
    uuid_generate_v4(),
    'mr3@medpresent.com',
    'hashed_password_3', -- In production, use proper password hashing
    'mr',
    'Emily',
    'Johnson',
    '+1234567892',
    '789 Pharma Blvd, City, State',
    'https://picsum.photos/200/200?random=3',
    true,
    false,
    true,
    true,
    NOW(),
    NOW()
);

-- Create permissions for the MR users
INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'upload_brochures',
    u.can_upload_brochures,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email IN ('mr1@medpresent.com', 'mr2@medpresent.com', 'mr3@medpresent.com');

INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'manage_doctors',
    u.can_manage_doctors,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email IN ('mr1@medpresent.com', 'mr2@medpresent.com', 'mr3@medpresent.com');

INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'schedule_meetings',
    u.can_schedule_meetings,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email IN ('mr1@medpresent.com', 'mr2@medpresent.com', 'mr3@medpresent.com');

-- Verify the users were created
SELECT 
    email,
    first_name,
    last_name,
    role,
    can_upload_brochures,
    can_manage_doctors,
    can_schedule_meetings,
    is_active
FROM users 
WHERE role = 'mr'
ORDER BY created_at;
