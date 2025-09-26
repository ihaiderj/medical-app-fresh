-- Create MR User for valuesinfotech@gmail.com
-- Run this in your Supabase SQL Editor

-- Insert the MR user into the users table
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
) VALUES (
    uuid_generate_v4(),
    'valuesinfotech@gmail.com',
    'hashed_password_demo', -- In production, use proper password hashing
    'mr',
    'Values',
    'Infotech',
    '+1234567890',
    '123 Tech Street, City, State',
    'https://picsum.photos/200/200?random=4',
    true,
    true,
    true,
    true,
    NOW(),
    NOW()
);

-- Create permissions for the MR user
INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'upload_brochures',
    u.can_upload_brochures,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email = 'valuesinfotech@gmail.com';

INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'manage_doctors',
    u.can_manage_doctors,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email = 'valuesinfotech@gmail.com';

INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'schedule_meetings',
    u.can_schedule_meetings,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email = 'valuesinfotech@gmail.com';

-- Verify the user was created
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
WHERE email = 'valuesinfotech@gmail.com';
