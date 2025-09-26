-- Updated API Functions for MR Management and Brochure Features
-- Run this in your Supabase SQL Editor after running the schema updates

-- Function to create new MR with permissions
CREATE OR REPLACE FUNCTION create_mr_with_permissions(
    p_email VARCHAR,
    p_password_hash VARCHAR,
    p_first_name VARCHAR,
    p_last_name VARCHAR,
    p_phone VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_profile_image_url TEXT DEFAULT NULL,
    p_can_upload_brochures BOOLEAN DEFAULT false,
    p_can_manage_doctors BOOLEAN DEFAULT false,
    p_can_schedule_meetings BOOLEAN DEFAULT true
)
RETURNS JSON AS $$
DECLARE
    new_mr_id UUID;
    result JSON;
BEGIN
    INSERT INTO users (
        email, password_hash, role, first_name, last_name, 
        phone, address, profile_image_url, 
        can_upload_brochures, can_manage_doctors, can_schedule_meetings
    )
    VALUES (
        p_email, p_password_hash, 'mr', p_first_name, p_last_name,
        p_phone, p_address, p_profile_image_url,
        p_can_upload_brochures, p_can_manage_doctors, p_can_schedule_meetings
    )
    RETURNING id INTO new_mr_id;
    
    -- Create permissions records
    INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
    VALUES 
        (new_mr_id, 'upload_brochures', p_can_upload_brochures, auth.uid()),
        (new_mr_id, 'manage_doctors', p_can_manage_doctors, auth.uid()),
        (new_mr_id, 'schedule_meetings', p_can_schedule_meetings, auth.uid());
    
    SELECT json_build_object(
        'success', true,
        'message', 'MR created successfully',
        'mr_id', new_mr_id
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update MR permissions
CREATE OR REPLACE FUNCTION update_mr_permissions(
    p_mr_id UUID,
    p_can_upload_brochures BOOLEAN DEFAULT NULL,
    p_can_manage_doctors BOOLEAN DEFAULT NULL,
    p_can_schedule_meetings BOOLEAN DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- Update user permissions
    UPDATE users SET
        can_upload_brochures = COALESCE(p_can_upload_brochures, can_upload_brochures),
        can_manage_doctors = COALESCE(p_can_manage_doctors, can_manage_doctors),
        can_schedule_meetings = COALESCE(p_can_schedule_meetings, can_schedule_meetings)
    WHERE id = p_mr_id AND role = 'mr';
    
    -- Update permission records
    IF p_can_upload_brochures IS NOT NULL THEN
        INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
        VALUES (p_mr_id, 'upload_brochures', p_can_upload_brochures, auth.uid())
        ON CONFLICT (mr_id, permission_type) 
        DO UPDATE SET 
            is_granted = EXCLUDED.is_granted,
            granted_by = EXCLUDED.granted_by,
            granted_at = NOW();
    END IF;
    
    IF p_can_manage_doctors IS NOT NULL THEN
        INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
        VALUES (p_mr_id, 'manage_doctors', p_can_manage_doctors, auth.uid())
        ON CONFLICT (mr_id, permission_type) 
        DO UPDATE SET 
            is_granted = EXCLUDED.is_granted,
            granted_by = EXCLUDED.granted_by,
            granted_at = NOW();
    END IF;
    
    IF p_can_schedule_meetings IS NOT NULL THEN
        INSERT INTO mr_permissions (mr_id, permission_type, is_granted, granted_by)
        VALUES (p_mr_id, 'schedule_meetings', p_can_schedule_meetings, auth.uid())
        ON CONFLICT (mr_id, permission_type) 
        DO UPDATE SET 
            is_granted = EXCLUDED.is_granted,
            granted_by = EXCLUDED.granted_by,
            granted_at = NOW();
    END IF;
    
    SELECT json_build_object(
        'success', true,
        'message', 'MR permissions updated successfully'
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all MRs with permissions
CREATE OR REPLACE FUNCTION get_all_mrs_with_permissions()
RETURNS TABLE (
    id UUID,
    email VARCHAR,
    first_name VARCHAR,
    last_name VARCHAR,
    phone VARCHAR,
    address TEXT,
    profile_image_url TEXT,
    is_active BOOLEAN,
    can_upload_brochures BOOLEAN,
    can_manage_doctors BOOLEAN,
    can_schedule_meetings BOOLEAN,
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
        u.address,
        u.profile_image_url,
        u.is_active,
        u.can_upload_brochures,
        u.can_manage_doctors,
        u.can_schedule_meetings,
        COUNT(DISTINCT da.doctor_id) as doctors_count,
        COUNT(DISTINCT m.id) as meetings_count,
        u.created_at
    FROM users u
    LEFT JOIN doctor_assignments da ON u.id = da.mr_id AND da.status = 'active'
    LEFT JOIN meetings m ON u.id = m.mr_id
    WHERE u.role = 'mr'
    GROUP BY u.id, u.email, u.first_name, u.last_name, u.phone, u.address, 
             u.profile_image_url, u.is_active, u.can_upload_brochures, 
             u.can_manage_doctors, u.can_schedule_meetings, u.created_at
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create brochure with category
CREATE OR REPLACE FUNCTION create_brochure_with_category(
    p_title VARCHAR,
    p_category_id UUID,
    p_description TEXT DEFAULT NULL,
    p_file_url TEXT DEFAULT NULL,
    p_file_name TEXT DEFAULT NULL,
    p_file_type VARCHAR DEFAULT NULL,
    p_thumbnail_url TEXT DEFAULT NULL,
    p_pages INTEGER DEFAULT NULL,
    p_file_size VARCHAR DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_is_public BOOLEAN DEFAULT true
)
RETURNS JSON AS $$
DECLARE
    new_brochure_id UUID;
    result JSON;
BEGIN
    INSERT INTO brochures (
        title, category_id, description, file_url, file_name, file_type,
        thumbnail_url, pages, file_size, tags, is_public, uploaded_by, status
    )
    VALUES (
        p_title, p_category_id, p_description, p_file_url, p_file_name, p_file_type,
        p_thumbnail_url, p_pages, p_file_size, p_tags, p_is_public, auth.uid(), 'active'::brochure_status
    )
    RETURNING id INTO new_brochure_id;
    
    SELECT json_build_object(
        'success', true,
        'message', 'Brochure created successfully',
        'brochure_id', new_brochure_id
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get all brochures with category info
CREATE OR REPLACE FUNCTION get_all_brochures_with_categories()
RETURNS TABLE (
    id UUID,
    title VARCHAR,
    category_name VARCHAR,
    category_color VARCHAR,
    description TEXT,
    file_url TEXT,
    file_name TEXT,
    file_type VARCHAR,
    thumbnail_url TEXT,
    pages INTEGER,
    file_size VARCHAR,
    status TEXT,
    download_count INTEGER,
    view_count INTEGER,
    tags TEXT[],
    is_public BOOLEAN,
    uploaded_by_name VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.title,
        bc.name as category_name,
        bc.color as category_color,
        b.description,
        b.file_url,
        b.file_name,
        b.file_type,
        b.thumbnail_url,
        b.pages,
        b.file_size,
        b.status::text as status,
        b.download_count,
        b.view_count,
        b.tags,
        b.is_public,
        CONCAT(u.first_name, ' ', u.last_name) as uploaded_by_name,
        b.created_at
    FROM brochures b
    LEFT JOIN brochure_categories bc ON b.category_id = bc.id
    LEFT JOIN users u ON b.uploaded_by = u.id
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get brochure categories
CREATE OR REPLACE FUNCTION get_brochure_categories()
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    description TEXT,
    color VARCHAR,
    brochure_count BIGINT,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bc.id,
        bc.name,
        bc.description,
        bc.color,
        COUNT(b.id) as brochure_count,
        bc.is_active
    FROM brochure_categories bc
    LEFT JOIN brochures b ON bc.id = b.category_id AND b.status = 'active'
    GROUP BY bc.id, bc.name, bc.description, bc.color, bc.is_active
    ORDER BY bc.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update MR profile
CREATE OR REPLACE FUNCTION update_mr_profile(
    p_mr_id UUID,
    p_first_name VARCHAR DEFAULT NULL,
    p_last_name VARCHAR DEFAULT NULL,
    p_phone VARCHAR DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_profile_image_url TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    UPDATE users SET
        first_name = COALESCE(p_first_name, first_name),
        last_name = COALESCE(p_last_name, last_name),
        phone = COALESCE(p_phone, phone),
        address = COALESCE(p_address, address),
        profile_image_url = COALESCE(p_profile_image_url, profile_image_url),
        is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_mr_id AND role = 'mr';
    
    SELECT json_build_object(
        'success', true,
        'message', 'MR profile updated successfully'
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete MR
CREATE OR REPLACE FUNCTION delete_mr(p_mr_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- First deactivate the MR
    UPDATE users SET is_active = false WHERE id = p_mr_id AND role = 'mr';
    
    -- Remove doctor assignments
    UPDATE doctor_assignments SET status = 'inactive' WHERE mr_id = p_mr_id;
    
    -- Cancel future meetings
    UPDATE meetings SET status = 'cancelled' 
    WHERE mr_id = p_mr_id AND status = 'scheduled';
    
    SELECT json_build_object(
        'success', true,
        'message', 'MR deactivated successfully'
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
