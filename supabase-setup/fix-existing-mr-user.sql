-- Fix Existing MR User for valuesinfotech@gmail.com
-- Run this in your Supabase SQL Editor

-- First, check the current status of the user
SELECT 
    id,
    email,
    role,
    is_active,
    first_name,
    last_name,
    can_upload_brochures,
    can_manage_doctors,
    can_schedule_meetings,
    created_at
FROM users 
WHERE email = 'valuesinfotech@gmail.com';

-- Update the user to make sure it's active and has proper settings
UPDATE users 
SET 
    is_active = true,
    role = 'mr',
    can_upload_brochures = true,
    can_manage_doctors = true,
    can_schedule_meetings = true,
    updated_at = NOW()
WHERE email = 'valuesinfotech@gmail.com';

-- Check if permissions exist, if not create them
INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'upload_brochures',
    true,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email = 'valuesinfotech@gmail.com'
AND NOT EXISTS (
    SELECT 1 FROM mr_permissions mp 
    WHERE mp.mr_id = u.id AND mp.permission_type = 'upload_brochures'
);

INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'manage_doctors',
    true,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email = 'valuesinfotech@gmail.com'
AND NOT EXISTS (
    SELECT 1 FROM mr_permissions mp 
    WHERE mp.mr_id = u.id AND mp.permission_type = 'manage_doctors'
);

INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
SELECT 
    u.id,
    'schedule_meetings',
    true,
    (SELECT id FROM users WHERE email = 'admin@medpresent.com' LIMIT 1)
FROM users u 
WHERE u.role = 'mr' AND u.email = 'valuesinfotech@gmail.com'
AND NOT EXISTS (
    SELECT 1 FROM mr_permissions mp 
    WHERE mp.mr_id = u.id AND mp.permission_type = 'schedule_meetings'
);

-- Verify the user is now properly configured
SELECT 
    email,
    first_name,
    last_name,
    role,
    is_active,
    can_upload_brochures,
    can_manage_doctors,
    can_schedule_meetings
FROM users 
WHERE email = 'valuesinfotech@gmail.com';

-- Check permissions
SELECT 
    u.email,
    mp.permission_type,
    mp.is_granted
FROM users u
JOIN mr_permissions mp ON u.id = mp.mr_id
WHERE u.email = 'valuesinfotech@gmail.com';
