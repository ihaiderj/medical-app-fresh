-- MR Doctors and Meetings Functions
-- Run this in your Supabase SQL Editor

-- Function to get MR assigned doctors
CREATE OR REPLACE FUNCTION get_mr_assigned_doctors(p_mr_id UUID)
RETURNS TABLE (
    doctor_id UUID,
    first_name VARCHAR,
    last_name VARCHAR,
    specialty VARCHAR,
    hospital VARCHAR,
    phone VARCHAR,
    email VARCHAR,
    location VARCHAR,
    relationship_status VARCHAR,
    meetings_count INTEGER,
    last_meeting_date TIMESTAMP WITH TIME ZONE,
    next_meeting_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as doctor_id,
        d.first_name,
        d.last_name,
        d.specialty,
        d.hospital,
        d.phone,
        d.email,
        d.location,
        da.relationship_status,
        COALESCE(m.meetings_count, 0) as meetings_count,
        m.last_meeting_date,
        m.next_meeting_date,
        da.notes,
        da.created_at
    FROM doctors d
    JOIN doctor_assignments da ON d.id = da.doctor_id
    LEFT JOIN (
        SELECT 
            doctor_id,
            COUNT(*) as meetings_count,
            MAX(CASE WHEN status = 'completed' THEN scheduled_date END) as last_meeting_date,
            MIN(CASE WHEN status = 'scheduled' AND scheduled_date >= CURRENT_DATE THEN scheduled_date END) as next_meeting_date
        FROM meetings 
        WHERE mr_id = p_mr_id
        GROUP BY doctor_id
    ) m ON d.id = m.doctor_id
    WHERE da.mr_id = p_mr_id
    AND da.status = 'active'
    ORDER BY da.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get MR meetings
CREATE OR REPLACE FUNCTION get_mr_meetings(p_mr_id UUID, p_filter VARCHAR DEFAULT 'All')
RETURNS TABLE (
    meeting_id UUID,
    doctor_name VARCHAR,
    doctor_specialty VARCHAR,
    hospital VARCHAR,
    scheduled_date TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    presentation_title VARCHAR,
    status VARCHAR,
    follow_up_required BOOLEAN,
    follow_up_date TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    slides_discussed TEXT[],
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id as meeting_id,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty as doctor_specialty,
        d.hospital,
        m.scheduled_date,
        m.duration_minutes,
        COALESCE(b.title, 'No Presentation') as presentation_title,
        m.status,
        m.follow_up_required,
        m.follow_up_date,
        m.notes,
        COALESCE(m.slides_discussed, ARRAY[]::TEXT[]) as slides_discussed,
        m.created_at
    FROM meetings m
    JOIN doctors d ON m.doctor_id = d.id
    LEFT JOIN brochures b ON m.presentation_id = b.id
    WHERE m.mr_id = p_mr_id
    AND (
        CASE p_filter
            WHEN 'This Week' THEN
                m.scheduled_date >= date_trunc('week', CURRENT_DATE) 
                AND m.scheduled_date < date_trunc('week', CURRENT_DATE) + INTERVAL '1 week'
            WHEN 'This Month' THEN
                m.scheduled_date >= date_trunc('month', CURRENT_DATE)
            WHEN 'Follow-up Required' THEN
                m.follow_up_required = true
            WHEN 'Completed' THEN
                m.status = 'completed'
            ELSE
                true -- All meetings
        END
    )
    ORDER BY m.scheduled_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get MR presentations (brochures used in meetings)
CREATE OR REPLACE FUNCTION get_mr_presentations(p_mr_id UUID)
RETURNS TABLE (
    presentation_id UUID,
    title VARCHAR,
    category VARCHAR,
    description TEXT,
    thumbnail_url TEXT,
    total_slides INTEGER,
    times_used INTEGER,
    last_used_date TIMESTAMP WITH TIME ZONE,
    view_count INTEGER,
    download_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id as presentation_id,
        b.title,
        b.category,
        b.description,
        b.thumbnail_url,
        COALESCE(b.pages, 0) as total_slides,
        COALESCE(m.times_used, 0) as times_used,
        m.last_used_date,
        COALESCE(b.view_count, 0) as view_count,
        COALESCE(b.download_count, 0) as download_count,
        b.created_at
    FROM brochures b
    LEFT JOIN (
        SELECT 
            presentation_id,
            COUNT(*) as times_used,
            MAX(scheduled_date) as last_used_date
        FROM meetings 
        WHERE mr_id = p_mr_id
        AND presentation_id IS NOT NULL
        GROUP BY presentation_id
    ) m ON b.id = m.presentation_id
    WHERE b.uploaded_by = p_mr_id
    AND b.status = 'active'
    ORDER BY m.times_used DESC, b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a new doctor assignment for MR
CREATE OR REPLACE FUNCTION create_mr_doctor_assignment(
    p_mr_id UUID,
    p_first_name VARCHAR,
    p_last_name VARCHAR,
    p_specialty VARCHAR,
    p_hospital VARCHAR,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_location VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_doctor_id UUID;
    result JSON;
BEGIN
    -- Create new doctor
    INSERT INTO doctors (
        first_name,
        last_name,
        specialty,
        hospital,
        phone,
        email,
        location,
        created_at,
        updated_at
    ) VALUES (
        p_first_name,
        p_last_name,
        p_specialty,
        p_hospital,
        p_phone,
        p_email,
        p_location,
        NOW(),
        NOW()
    ) RETURNING id INTO new_doctor_id;

    -- Create doctor assignment
    INSERT INTO doctor_assignments (
        mr_id,
        doctor_id,
        relationship_status,
        notes,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_mr_id,
        new_doctor_id,
        'new',
        p_notes,
        'active',
        NOW(),
        NOW()
    );

    -- Return success with doctor info
    SELECT json_build_object(
        'success', true,
        'doctor_id', new_doctor_id,
        'message', 'Doctor added successfully'
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a new meeting for MR
CREATE OR REPLACE FUNCTION create_mr_meeting(
    p_mr_id UUID,
    p_doctor_id UUID,
    p_scheduled_date TIMESTAMP WITH TIME ZONE,
    p_duration_minutes INTEGER DEFAULT 30,
    p_presentation_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_meeting_id UUID;
    result JSON;
BEGIN
    -- Create new meeting
    INSERT INTO meetings (
        mr_id,
        doctor_id,
        scheduled_date,
        duration_minutes,
        presentation_id,
        notes,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_mr_id,
        p_doctor_id,
        p_scheduled_date,
        p_duration_minutes,
        p_presentation_id,
        p_notes,
        'scheduled',
        NOW(),
        NOW()
    ) RETURNING id INTO new_meeting_id;

    -- Return success with meeting info
    SELECT json_build_object(
        'success', true,
        'meeting_id', new_meeting_id,
        'message', 'Meeting scheduled successfully'
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
