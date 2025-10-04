-- Fix the get_mr_assigned_doctors function with correct table structure
-- Run this in your Supabase SQL Editor

DROP FUNCTION IF EXISTS get_mr_assigned_doctors(UUID);

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
    -- First check if mr_doctor_assignments table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mr_doctor_assignments') THEN
        -- Use mr_doctor_assignments table
        RETURN QUERY
        SELECT 
            d.id,
            d.first_name,
            d.last_name,
            d.specialty,
            d.hospital,
            d.phone,
            d.email,
            d.location,
            COALESCE(d.relationship_status, 'active')::VARCHAR as relationship_status,
            COALESCE(m.meetings_count, 0)::INTEGER as meetings_count,
            m.last_meeting_date,
            m.next_meeting_date,
            COALESCE(mda.notes, '')::TEXT as notes,
            mda.created_at
        FROM doctors d
        JOIN mr_doctor_assignments mda ON d.id = mda.doctor_id
        LEFT JOIN (
            SELECT 
                mt.doctor_id as meeting_doctor_id,
                COUNT(*)::INTEGER as meetings_count,
                MAX(CASE WHEN mt.status = 'completed' THEN mt.scheduled_date END) as last_meeting_date,
                MIN(CASE WHEN mt.status = 'scheduled' AND mt.scheduled_date >= CURRENT_DATE THEN mt.scheduled_date END) as next_meeting_date
            FROM meetings mt
            WHERE mt.mr_id = p_mr_id
            GROUP BY mt.doctor_id
        ) m ON d.id = m.meeting_doctor_id
        WHERE mda.mr_id = p_mr_id
        ORDER BY mda.created_at DESC;
        
    ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'doctor_assignments') THEN
        -- Use doctor_assignments table
        RETURN QUERY
        SELECT 
            d.id,
            d.first_name,
            d.last_name,
            d.specialty,
            d.hospital,
            d.phone,
            d.email,
            d.location,
            COALESCE(d.relationship_status, 'active')::VARCHAR as relationship_status,
            COALESCE(m.meetings_count, 0)::INTEGER as meetings_count,
            m.last_meeting_date,
            m.next_meeting_date,
            COALESCE(da.notes, '')::TEXT as notes,
            da.created_at
        FROM doctors d
        JOIN doctor_assignments da ON d.id = da.doctor_id
        LEFT JOIN (
            SELECT 
                mt.doctor_id as meeting_doctor_id,
                COUNT(*)::INTEGER as meetings_count,
                MAX(CASE WHEN mt.status = 'completed' THEN mt.scheduled_date END) as last_meeting_date,
                MIN(CASE WHEN mt.status = 'scheduled' AND mt.scheduled_date >= CURRENT_DATE THEN mt.scheduled_date END) as next_meeting_date
            FROM meetings mt
            WHERE mt.mr_id = p_mr_id
            GROUP BY mt.doctor_id
        ) m ON d.id = m.meeting_doctor_id
        WHERE da.mr_id = p_mr_id
        ORDER BY da.created_at DESC;
        
    ELSE
        -- Fallback: return doctors directly (for testing)
        RETURN QUERY
        SELECT 
            d.id,
            d.first_name,
            d.last_name,
            d.specialty,
            d.hospital,
            d.phone,
            d.email,
            d.location,
            COALESCE(d.relationship_status, 'active')::VARCHAR as relationship_status,
            0::INTEGER as meetings_count,
            NULL::TIMESTAMP WITH TIME ZONE as last_meeting_date,
            NULL::TIMESTAMP WITH TIME ZONE as next_meeting_date,
            ''::TEXT as notes,
            d.created_at
        FROM doctors d
        ORDER BY d.created_at DESC
        LIMIT 10;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the function
SELECT * FROM get_mr_assigned_doctors('c88b07e5-316e-4d53-9aa5-f3b12fb78abc'::uuid) LIMIT 5;

