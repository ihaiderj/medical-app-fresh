-- Fix User IDs After Migration - Simple Approach
-- This script uses ALTER TABLE to temporarily disable foreign key constraints
-- Run this in Supabase SQL Editor

BEGIN;

-- Step 1: Get constraint names (we'll need to drop and recreate them)
-- Note: This approach temporarily removes foreign key constraints

-- Drop foreign key constraints temporarily
ALTER TABLE saved_brochures DROP CONSTRAINT IF EXISTS saved_brochures_mr_id_fkey;
ALTER TABLE brochure_sync DROP CONSTRAINT IF EXISTS brochure_sync_mr_id_fkey;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_mr_id_fkey;
ALTER TABLE doctor_assignments DROP CONSTRAINT IF EXISTS doctor_assignments_mr_id_fkey;
ALTER TABLE doctor_assignments DROP CONSTRAINT IF EXISTS doctor_assignments_assigned_by_fkey;
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_created_by_fkey;
ALTER TABLE brochures DROP CONSTRAINT IF EXISTS brochures_assigned_by_fkey;
ALTER TABLE system_settings DROP CONSTRAINT IF EXISTS system_settings_updated_by_fkey;
ALTER TABLE mr_permissions DROP CONSTRAINT IF EXISTS mr_permissions_mr_id_fkey;

-- Step 2: Temporarily disable user-defined triggers (not system triggers)
-- We'll disable specific triggers that might cause issues
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    -- Disable user-defined triggers on tables we'll be updating
    FOR trigger_record IN
        SELECT n.nspname AS schemaname, c.relname AS tablename, t.tgname AS triggername
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
            AND NOT t.tgisinternal  -- Exclude system triggers
            AND c.relname IN (
                'saved_brochures', 'brochure_sync', 'user_sessions', 
                'activity_logs', 'meetings', 'doctor_assignments', 
                'doctors', 'brochures', 'system_settings', 
                'mr_permissions', 'users'
            )
    LOOP
        EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I',
            trigger_record.schemaname,
            trigger_record.tablename,
            trigger_record.triggername
        );
    END LOOP;
END $$;

-- Step 3: Update foreign key references
UPDATE saved_brochures 
SET mr_id = CASE 
    WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE mr_id
END
WHERE mr_id IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

UPDATE brochure_sync 
SET mr_id = CASE 
    WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE mr_id
END
WHERE mr_id IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

UPDATE user_sessions 
SET user_id = CASE 
    WHEN user_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN user_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN user_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE user_id
END
WHERE user_id IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

UPDATE activity_logs 
SET user_id = CASE 
    WHEN user_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN user_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN user_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE user_id
END
WHERE user_id IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

UPDATE meetings 
SET mr_id = CASE 
    WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE mr_id
END
WHERE mr_id IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

-- Update doctor_assignments if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_assignments') THEN
        -- Update mr_id
        UPDATE doctor_assignments 
        SET mr_id = CASE 
            WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
            WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
            WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
            ELSE mr_id
        END
        WHERE mr_id IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');
        
        -- Update assigned_by
        UPDATE doctor_assignments 
        SET assigned_by = CASE 
            WHEN assigned_by = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
            WHEN assigned_by = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
            WHEN assigned_by = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
            ELSE assigned_by
        END
        WHERE assigned_by IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');
    END IF;
END $$;

-- Update doctors table (created_by column)
UPDATE doctors 
SET created_by = CASE 
    WHEN created_by = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN created_by = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN created_by = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE created_by
END
WHERE created_by IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

-- Update brochures table (assigned_by column)
UPDATE brochures 
SET assigned_by = CASE 
    WHEN assigned_by = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN assigned_by = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN assigned_by = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE assigned_by
END
WHERE assigned_by IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

-- Update system_settings table (updated_by column)
UPDATE system_settings 
SET updated_by = CASE 
    WHEN updated_by = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN updated_by = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN updated_by = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE updated_by
END
WHERE updated_by IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

-- Update mr_permissions table (mr_id column)
UPDATE mr_permissions 
SET mr_id = CASE 
    WHEN mr_id = '6214bd64-9db1-4ae1-bb87-adff581a2a44' THEN '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
    WHEN mr_id = '065a30b3-2300-498d-aa6f-0589567e5e28' THEN 'a32b5cd4-2670-488e-9bb5-24acf6540230'
    WHEN mr_id = '2b4924ca-0572-4da7-9ce7-17a87ec80239' THEN 'e53371eb-64be-4d18-8720-9aea95d26658'
    ELSE mr_id
END
WHERE mr_id IN ('6214bd64-9db1-4ae1-bb87-adff581a2a44', '065a30b3-2300-498d-aa6f-0589567e5e28', '2b4924ca-0572-4da7-9ce7-17a87ec80239');

-- Step 4: Update the users table IDs (triggers already disabled)
UPDATE users 
SET id = '4dc6b184-c8f9-4666-906c-1f4e7829c78d'
WHERE email = 'billy@gmail.com';

UPDATE users 
SET id = 'a32b5cd4-2670-488e-9bb5-24acf6540230'
WHERE email = 'immy666@gmail.com';

UPDATE users 
SET id = 'e53371eb-64be-4d18-8720-9aea95d26658'
WHERE email = 'salman@gmail.com';

-- Step 5: Re-enable user-defined triggers
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    -- Re-enable user-defined triggers on tables we updated
    FOR trigger_record IN
        SELECT n.nspname AS schemaname, c.relname AS tablename, t.tgname AS triggername
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
            AND NOT t.tgisinternal  -- Exclude system triggers
            AND c.relname IN (
                'saved_brochures', 'brochure_sync', 'user_sessions', 
                'activity_logs', 'meetings', 'doctor_assignments', 
                'doctors', 'brochures', 'system_settings', 
                'mr_permissions', 'users'
            )
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER %I',
            trigger_record.schemaname,
            trigger_record.tablename,
            trigger_record.triggername
        );
    END LOOP;
END $$;

-- Step 6: Recreate foreign key constraints
ALTER TABLE saved_brochures 
ADD CONSTRAINT saved_brochures_mr_id_fkey 
FOREIGN KEY (mr_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE brochure_sync 
ADD CONSTRAINT brochure_sync_mr_id_fkey 
FOREIGN KEY (mr_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_sessions 
ADD CONSTRAINT user_sessions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE activity_logs 
ADD CONSTRAINT activity_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Only add if meetings table has mr_id column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'meetings' AND column_name = 'mr_id'
    ) THEN
        ALTER TABLE meetings 
        ADD CONSTRAINT meetings_mr_id_fkey 
        FOREIGN KEY (mr_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Only add if doctor_assignments table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_assignments') THEN
        ALTER TABLE doctor_assignments 
        ADD CONSTRAINT doctor_assignments_mr_id_fkey 
        FOREIGN KEY (mr_id) REFERENCES users(id) ON DELETE CASCADE;
        
        -- Add assigned_by constraint if column exists
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'doctor_assignments' AND column_name = 'assigned_by'
        ) THEN
            ALTER TABLE doctor_assignments 
            ADD CONSTRAINT doctor_assignments_assigned_by_fkey 
            FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- Recreate doctors.created_by constraint if column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'doctors' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE doctors 
        ADD CONSTRAINT doctors_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Recreate brochures.assigned_by constraint if column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'brochures' AND column_name = 'assigned_by'
    ) THEN
        ALTER TABLE brochures 
        ADD CONSTRAINT brochures_assigned_by_fkey 
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Recreate system_settings.updated_by constraint if column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'system_settings' AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE system_settings 
        ADD CONSTRAINT system_settings_updated_by_fkey 
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Recreate mr_permissions.mr_id constraint if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mr_permissions') THEN
        ALTER TABLE mr_permissions 
        ADD CONSTRAINT mr_permissions_mr_id_fkey 
        FOREIGN KEY (mr_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 7: Verify the updates
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

