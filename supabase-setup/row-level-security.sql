-- Row Level Security (RLS) Policies
-- Run this in your Supabase SQL Editor after running the schema and functions

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE brochures ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can create users" ON users
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can update all users" ON users
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Doctors table policies
CREATE POLICY "MRs can view their assigned doctors" ON doctors
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM doctor_assignments da
            WHERE da.doctor_id = doctors.id 
            AND da.mr_id = auth.uid() 
            AND da.status = 'active'
        )
    );

CREATE POLICY "Admins can view all doctors" ON doctors
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can create doctors" ON doctors
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update doctors" ON doctors
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "MRs can update their assigned doctors" ON doctors
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM doctor_assignments da
            WHERE da.doctor_id = doctors.id 
            AND da.mr_id = auth.uid() 
            AND da.status = 'active'
        )
    );

-- Brochures table policies
CREATE POLICY "All authenticated users can view active brochures" ON brochures
    FOR SELECT USING (status = 'active');

CREATE POLICY "Admins can view all brochures" ON brochures
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can create brochures" ON brochures
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update brochures" ON brochures
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete brochures" ON brochures
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Meetings table policies
CREATE POLICY "MRs can view their own meetings" ON meetings
    FOR SELECT USING (mr_id = auth.uid());

CREATE POLICY "Admins can view all meetings" ON meetings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "MRs can create meetings for their assigned doctors" ON meetings
    FOR INSERT WITH CHECK (
        mr_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM doctor_assignments da
            WHERE da.doctor_id = meetings.doctor_id 
            AND da.mr_id = auth.uid() 
            AND da.status = 'active'
        )
    );

CREATE POLICY "Admins can create meetings" ON meetings
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "MRs can update their own meetings" ON meetings
    FOR UPDATE USING (mr_id = auth.uid());

CREATE POLICY "Admins can update all meetings" ON meetings
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Doctor assignments table policies
CREATE POLICY "MRs can view their own assignments" ON doctor_assignments
    FOR SELECT USING (mr_id = auth.uid());

CREATE POLICY "Admins can view all assignments" ON doctor_assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can create assignments" ON doctor_assignments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update assignments" ON doctor_assignments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- System settings table policies
CREATE POLICY "Admins can view system settings" ON system_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update system settings" ON system_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Activity logs table policies
CREATE POLICY "Users can view their own activity logs" ON activity_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all activity logs" ON activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "System can insert activity logs" ON activity_logs
    FOR INSERT WITH CHECK (true);

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

