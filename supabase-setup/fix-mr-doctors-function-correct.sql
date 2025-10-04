-- Final correct fix for get_mr_assigned_doctors function based on actual table structure
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
    profile_image_url TEXT,
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
        d.id,
        d.first_name,
        d.last_name,
        d.specialty,
        d.hospital,
        d.phone,
        d.email,
        d.location,
        d.profile_image_url,
        COALESCE(d.relationship_status, 'active')::VARCHAR as relationship_status,
        COALESCE(d.meetings_count, 0)::INTEGER as meetings_count,
        d.last_meeting_date,
        d.next_appointment as next_meeting_date,
        COALESCE(da.notes, d.notes, '')::TEXT as notes,
        da.assigned_at as created_at
    FROM doctors d
    JOIN doctor_assignments da ON d.id = da.doctor_id
    WHERE da.mr_id = p_mr_id
    AND COALESCE(da.status, 'active') = 'active'
    ORDER BY da.assigned_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the function with your MR ID
SELECT * FROM get_mr_assigned_doctors('c88b07e5-316e-4d53-9aa5-f3b12fb78abc'::uuid);

-- Also test with a simple query to see all assignments
SELECT 
    da.mr_id,
    da.doctor_id,
    d.first_name,
    d.last_name,
    d.specialty,
    d.hospital,
    da.status,
    da.assigned_at
FROM doctor_assignments da
JOIN doctors d ON d.id = da.doctor_id
ORDER BY da.assigned_at DESC;

