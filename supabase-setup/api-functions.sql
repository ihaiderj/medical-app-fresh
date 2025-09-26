-- API Functions for Medical Representative App
-- Run this in your Supabase SQL Editor after running the schema

-- Function to get admin dashboard stats
CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_mrs', (SELECT COUNT(*) FROM users WHERE role = 'mr' AND is_active = true),
        'active_brochures', (SELECT COUNT(*) FROM brochures WHERE status = 'active'),
        'total_doctors', (SELECT COUNT(*) FROM doctors),
        'monthly_meetings', (SELECT COUNT(*) FROM meetings WHERE scheduled_date >= date_trunc('month', CURRENT_DATE))
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all MRs with their stats
CREATE OR REPLACE FUNCTION get_all_mrs()
RETURNS TABLE (
    id UUID,
    email VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    phone VARCHAR,
    profile_image_url TEXT,
    is_active BOOLEAN,
    doctors_count BIGINT,
    meetings_count BIGINT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.profile_image_url,
        u.is_active,
        COUNT(DISTINCT da.doctor_id) as doctors_count,
        COUNT(DISTINCT m.id) as meetings_count,
        u.created_at
    FROM users u
    LEFT JOIN doctor_assignments da ON u.id = da.mr_id AND da.status = 'active'
    LEFT JOIN meetings m ON u.id = m.mr_id
    WHERE u.role = 'mr'
    GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.profile_image_url, u.is_active, u.created_at
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create new MR
CREATE OR REPLACE FUNCTION create_mr(
    p_email VARCHAR,
    p_password_hash VARCHAR,
    p_first_name VARCHAR,
    p_last_name VARCHAR,
    p_phone VARCHAR DEFAULT NULL,
    p_profile_image_url TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_mr_id UUID;
    result JSON;
BEGIN
    INSERT INTO users (email, password_hash, role, first_name, last_name, phone, profile_image_url)
    VALUES (p_email, p_password_hash, 'mr', p_first_name, p_last_name, p_phone, p_profile_image_url)
    RETURNING id INTO new_mr_id;
    
    SELECT json_build_object(
        'success', true,
        'message', 'MR created successfully',
        'mr_id', new_mr_id
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all brochures with stats
CREATE OR REPLACE FUNCTION get_all_brochures()
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    category VARCHAR,
    description TEXT,
    file_url TEXT,
    thumbnail_url TEXT,
    pages INTEGER,
    file_size VARCHAR,
    status brochure_status,
    download_count INTEGER,
    view_count INTEGER,
    assigned_by_name VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.title,
        b.category,
        b.description,
        b.file_url,
        b.thumbnail_url,
        b.pages,
        b.file_size,
        b.status,
        b.download_count,
        b.view_count,
        CONCAT(u.first_name, ' ', u.last_name) as assigned_by_name,
        b.created_at
    FROM brochures b
    LEFT JOIN users u ON b.assigned_by = u.id
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create new brochure
CREATE OR REPLACE FUNCTION create_brochure(
    p_title VARCHAR,
    p_category VARCHAR,
    p_description TEXT DEFAULT NULL,
    p_file_url TEXT DEFAULT NULL,
    p_thumbnail_url TEXT DEFAULT NULL,
    p_pages INTEGER DEFAULT NULL,
    p_file_size VARCHAR DEFAULT NULL,
    p_assigned_by UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_brochure_id UUID;
    result JSON;
BEGIN
    INSERT INTO brochures (title, category, description, file_url, thumbnail_url, pages, file_size, assigned_by)
    VALUES (p_title, p_category, p_description, p_file_url, p_thumbnail_url, p_pages, p_file_size, p_assigned_by)
    RETURNING id INTO new_brochure_id;
    
    SELECT json_build_object(
        'success', true,
        'message', 'Brochure created successfully',
        'brochure_id', new_brochure_id
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all meetings with details
CREATE OR REPLACE FUNCTION get_all_meetings()
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    mr_name VARCHAR,
    doctor_name VARCHAR,
    hospital VARCHAR,
    scheduled_date TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    status meeting_status,
    location VARCHAR,
    follow_up_required BOOLEAN,
    brochure_title VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.title,
        CONCAT(u.first_name, ' ', u.last_name) as mr_name,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.hospital,
        m.scheduled_date,
        m.duration_minutes,
        m.status,
        m.location,
        m.follow_up_required,
        b.title as brochure_title,
        m.created_at
    FROM meetings m
    LEFT JOIN users u ON m.mr_id = u.id
    LEFT JOIN doctors d ON m.doctor_id = d.id
    LEFT JOIN brochures b ON m.brochure_id = b.id
    ORDER BY m.scheduled_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all doctors with assignment info
CREATE OR REPLACE FUNCTION get_all_doctors()
RETURNS TABLE (
    id UUID,
    first_name VARCHAR,
    last_name VARCHAR,
    email VARCHAR,
    phone VARCHAR,
    specialty VARCHAR,
    hospital VARCHAR,
    location VARCHAR,
    profile_image_url TEXT,
    relationship_status VARCHAR,
    meetings_count INTEGER,
    last_meeting_date TIMESTAMP WITH TIME ZONE,
    next_appointment TIMESTAMP WITH TIME ZONE,
    assigned_mr_name VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.first_name,
        d.last_name,
        d.email,
        d.phone,
        d.specialty,
        d.hospital,
        d.location,
        d.profile_image_url,
        d.relationship_status,
        d.meetings_count,
        d.last_meeting_date,
        d.next_appointment,
        CONCAT(u.first_name, ' ', u.last_name) as assigned_mr_name,
        d.created_at
    FROM doctors d
    LEFT JOIN doctor_assignments da ON d.id = da.doctor_id AND da.status = 'active'
    LEFT JOIN users u ON da.mr_id = u.id
    ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create new doctor
CREATE OR REPLACE FUNCTION create_doctor(
    p_first_name VARCHAR,
    p_last_name VARCHAR,
    p_email VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_specialty VARCHAR DEFAULT NULL,
    p_hospital VARCHAR DEFAULT NULL,
    p_location VARCHAR DEFAULT NULL,
    p_profile_image_url TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_doctor_id UUID;
    result JSON;
BEGIN
    INSERT INTO doctors (first_name, last_name, email, phone, specialty, hospital, location, profile_image_url, notes, created_by)
    VALUES (p_first_name, p_last_name, p_email, p_phone, p_specialty, p_hospital, p_location, p_profile_image_url, p_notes, p_created_by)
    RETURNING id INTO new_doctor_id;
    
    SELECT json_build_object(
        'success', true,
        'message', 'Doctor created successfully',
        'doctor_id', new_doctor_id
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to assign doctor to MR
CREATE OR REPLACE FUNCTION assign_doctor_to_mr(
    p_doctor_id UUID,
    p_mr_id UUID,
    p_assigned_by UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- Deactivate any existing active assignments for this doctor
    UPDATE doctor_assignments 
    SET status = 'inactive', transferred_at = NOW()
    WHERE doctor_id = p_doctor_id AND status = 'active';
    
    -- Create new assignment
    INSERT INTO doctor_assignments (doctor_id, mr_id, assigned_by, notes)
    VALUES (p_doctor_id, p_mr_id, p_assigned_by, p_notes);
    
    SELECT json_build_object(
        'success', true,
        'message', 'Doctor assigned to MR successfully'
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get MR's assigned doctors
CREATE OR REPLACE FUNCTION get_mr_doctors(p_mr_id UUID)
RETURNS TABLE (
    id UUID,
    first_name VARCHAR,
    last_name VARCHAR,
    specialty VARCHAR,
    hospital VARCHAR,
    location VARCHAR,
    relationship_status VARCHAR,
    meetings_count INTEGER,
    last_meeting_date TIMESTAMP WITH TIME ZONE,
    next_appointment TIMESTAMP WITH TIME ZONE,
    assignment_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.first_name,
        d.last_name,
        d.specialty,
        d.hospital,
        d.location,
        d.relationship_status,
        d.meetings_count,
        d.last_meeting_date,
        d.next_appointment,
        da.assigned_at as assignment_date
    FROM doctors d
    JOIN doctor_assignments da ON d.id = da.doctor_id
    WHERE da.mr_id = p_mr_id AND da.status = 'active'
    ORDER BY da.assigned_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update system settings
CREATE OR REPLACE FUNCTION update_system_setting(
    p_setting_key VARCHAR,
    p_setting_value TEXT,
    p_updated_by UUID
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    INSERT INTO system_settings (setting_key, setting_value, updated_by)
    VALUES (p_setting_key, p_setting_value, p_updated_by)
    ON CONFLICT (setting_key) 
    DO UPDATE SET 
        setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW();
    
    SELECT json_build_object(
        'success', true,
        'message', 'System setting updated successfully'
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get system settings
CREATE OR REPLACE FUNCTION get_system_settings()
RETURNS TABLE (
    setting_key VARCHAR,
    setting_value TEXT,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ss.setting_key,
        ss.setting_value,
        ss.description,
        ss.updated_at
    FROM system_settings ss
    ORDER BY ss.setting_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log activity
CREATE OR REPLACE FUNCTION log_activity(
    p_user_id UUID,
    p_action VARCHAR,
    p_entity_type VARCHAR,
    p_entity_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
    VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_details, p_ip_address, p_user_agent);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

