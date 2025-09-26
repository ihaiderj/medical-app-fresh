-- Row Level Security (RLS) Policies - FIXED VERSION
-- Run this in your Supabase SQL Editor after running the schema and functions

-- First, disable RLS temporarily to fix the policies
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE doctors DISABLE ROW LEVEL SECURITY;
ALTER TABLE brochures DISABLE ROW LEVEL SECURITY;
ALTER TABLE meetings DISABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can create users" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;

DROP POLICY IF EXISTS "MRs can view their assigned doctors" ON doctors;
DROP POLICY IF EXISTS "Admins can view all doctors" ON doctors;
DROP POLICY IF EXISTS "Admins can create doctors" ON doctors;
DROP POLICY IF EXISTS "MRs can update their assigned doctors" ON doctors;
DROP POLICY IF EXISTS "Admins can update all doctors" ON doctors;

DROP POLICY IF EXISTS "Anyone can view active brochures" ON brochures;
DROP POLICY IF EXISTS "Admins can view all brochures" ON brochures;
DROP POLICY IF EXISTS "Admins can create brochures" ON brochures;
DROP POLICY IF EXISTS "Admins can update brochures" ON brochures;
DROP POLICY IF EXISTS "Admins can delete brochures" ON brochures;

DROP POLICY IF EXISTS "MRs can view their own meetings" ON meetings;
DROP POLICY IF EXISTS "Admins can view all meetings" ON meetings;
DROP POLICY IF EXISTS "MRs can create their own meetings" ON meetings;
DROP POLICY IF EXISTS "MRs can update their own meetings" ON meetings;
DROP POLICY IF EXISTS "Admins can update all meetings" ON meetings;

DROP POLICY IF EXISTS "MRs can view their assignments" ON doctor_assignments;
DROP POLICY IF EXISTS "Admins can view all assignments" ON doctor_assignments;
DROP POLICY IF EXISTS "Admins can create assignments" ON doctor_assignments;
DROP POLICY IF EXISTS "Admins can update assignments" ON doctor_assignments;

DROP POLICY IF EXISTS "Admins can view system settings" ON system_settings;
DROP POLICY IF EXISTS "Admins can update system settings" ON system_settings;

DROP POLICY IF EXISTS "Users can view their own activity logs" ON activity_logs;
DROP POLICY IF EXISTS "Admins can view all activity logs" ON activity_logs;
DROP POLICY IF EXISTS "System can create activity logs" ON activity_logs;

-- Create a function to check if user is admin (avoids recursion)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.email = 'admin@medpresent.com'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE brochures ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Users table policies (FIXED)
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (is_admin());

CREATE POLICY "Admins can create users" ON users
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Admins can update all users" ON users
    FOR UPDATE USING (is_admin());

-- Doctors table policies
CREATE POLICY "MRs can view their assigned doctors" ON doctors
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM doctor_assignments da
            WHERE da.doctor_id = doctors.id 
            AND da.mr_id::text = auth.uid()::text 
            AND da.status = 'active'
        )
    );

CREATE POLICY "Admins can view all doctors" ON doctors
    FOR SELECT USING (is_admin());

CREATE POLICY "Admins can create doctors" ON doctors
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "MRs can update their assigned doctors" ON doctors
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM doctor_assignments da
            WHERE da.doctor_id = doctors.id 
            AND da.mr_id::text = auth.uid()::text 
            AND da.status = 'active'
        )
    );

CREATE POLICY "Admins can update all doctors" ON doctors
    FOR UPDATE USING (is_admin());

-- Brochures table policies
CREATE POLICY "Anyone can view active brochures" ON brochures
    FOR SELECT USING (status = 'active');

CREATE POLICY "Admins can view all brochures" ON brochures
    FOR SELECT USING (is_admin());

CREATE POLICY "Admins can create brochures" ON brochures
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update brochures" ON brochures
    FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete brochures" ON brochures
    FOR DELETE USING (is_admin());

-- Meetings table policies
CREATE POLICY "MRs can view their own meetings" ON meetings
    FOR SELECT USING (mr_id::text = auth.uid()::text);

CREATE POLICY "Admins can view all meetings" ON meetings
    FOR SELECT USING (is_admin());

CREATE POLICY "MRs can create their own meetings" ON meetings
    FOR INSERT WITH CHECK (mr_id::text = auth.uid()::text);

CREATE POLICY "MRs can update their own meetings" ON meetings
    FOR UPDATE USING (mr_id::text = auth.uid()::text);

CREATE POLICY "Admins can update all meetings" ON meetings
    FOR UPDATE USING (is_admin());

-- Doctor assignments table policies
CREATE POLICY "MRs can view their assignments" ON doctor_assignments
    FOR SELECT USING (mr_id::text = auth.uid()::text);

CREATE POLICY "Admins can view all assignments" ON doctor_assignments
    FOR SELECT USING (is_admin());

CREATE POLICY "Admins can create assignments" ON doctor_assignments
    FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update assignments" ON doctor_assignments
    FOR UPDATE USING (is_admin());

-- System settings table policies
CREATE POLICY "Admins can view system settings" ON system_settings
    FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update system settings" ON system_settings
    FOR ALL USING (is_admin());

-- Activity logs table policies
CREATE POLICY "Users can view their own activity logs" ON activity_logs
    FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Admins can view all activity logs" ON activity_logs
    FOR SELECT USING (is_admin());

CREATE POLICY "System can create activity logs" ON activity_logs
    FOR INSERT WITH CHECK (true);

-- Create admin user in auth system if it doesn't exist
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- Check if admin user already exists
    SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@medpresent.com';
    
    -- If admin user doesn't exist, create it
    IF admin_user_id IS NULL THEN
        admin_user_id := uuid_generate_v4();
        
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            recovery_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            admin_user_id,
            'authenticated',
            'authenticated',
            'admin@medpresent.com',
            crypt('admin123', gen_salt('bf')),
            NOW(),
            NULL,
            NULL,
            '{"provider": "email", "providers": ["email"]}',
            '{}',
            NOW(),
            NOW(),
            '',
            '',
            '',
            ''
        );
        
        RAISE NOTICE 'Admin user created with ID: %', admin_user_id;
    ELSE
        RAISE NOTICE 'Admin user already exists with ID: %', admin_user_id;
    END IF;
    
    -- Update the users table with the admin user's auth ID
    UPDATE users 
    SET id = admin_user_id
    WHERE email = 'admin@medpresent.com';
    
    RAISE NOTICE 'Users table updated with admin auth ID';
END $$;
