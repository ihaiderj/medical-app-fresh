-- MR Dashboard Functions for Dynamic Data
-- Run this in your Supabase SQL Editor

-- Function to get MR dashboard stats
CREATE OR REPLACE FUNCTION get_mr_dashboard_stats(p_mr_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'active_presentations', (
            SELECT COUNT(*) 
            FROM brochures b 
            WHERE b.uploaded_by = p_mr_id 
            AND b.status = 'active'
        ),
        'scheduled_meetings', (
            SELECT COUNT(*) 
            FROM meetings m 
            WHERE m.mr_id = p_mr_id 
            AND m.status = 'scheduled'
            AND m.scheduled_date >= CURRENT_DATE
        ),
        'doctors_connected', (
            SELECT COUNT(*) 
            FROM doctor_assignments da 
            WHERE da.mr_id = p_mr_id 
            AND da.status = 'active'
        ),
        'monthly_meetings', (
            SELECT COUNT(*) 
            FROM meetings m 
            WHERE m.mr_id = p_mr_id 
            AND m.scheduled_date >= date_trunc('month', CURRENT_DATE)
        ),
        'completed_meetings', (
            SELECT COUNT(*) 
            FROM meetings m 
            WHERE m.mr_id = p_mr_id 
            AND m.status = 'completed'
            AND m.scheduled_date >= date_trunc('month', CURRENT_DATE)
        ),
        'brochures_uploaded', (
            SELECT COUNT(*) 
            FROM brochures b 
            WHERE b.uploaded_by = p_mr_id
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get MR recent activities
CREATE OR REPLACE FUNCTION get_mr_recent_activities(p_mr_id UUID, limit_count INTEGER DEFAULT 5)
RETURNS TABLE (
    id UUID,
    activity_type VARCHAR,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.activity_type,
        al.description,
        al.created_at
    FROM activity_logs al
    WHERE al.user_id = p_mr_id
    ORDER BY al.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get MR assigned brochures (all brochures MR can access)
CREATE OR REPLACE FUNCTION get_mr_assigned_brochures(p_mr_id UUID)
RETURNS TABLE (
    brochure_id UUID,
    title VARCHAR,
    category VARCHAR,
    description TEXT,
    thumbnail_url TEXT,
    view_count INTEGER,
    download_count INTEGER,
    uploaded_by_name VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id as brochure_id,
        b.title,
        b.category,
        b.description,
        b.thumbnail_url,
        COALESCE(b.view_count, 0) as view_count,
        COALESCE(b.download_count, 0) as download_count,
        CONCAT(u.first_name, ' ', u.last_name) as uploaded_by_name,
        b.created_at
    FROM brochures b
    LEFT JOIN users u ON b.uploaded_by = u.id
    WHERE b.status = 'active'
    AND (
        b.uploaded_by = p_mr_id  -- Brochures uploaded by this MR
        OR b.is_public = true    -- Public brochures uploaded by admin
        OR b.uploaded_by IN (    -- Brochures uploaded by admin users
            SELECT id FROM users WHERE role = 'admin'
        )
    )
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get MR upcoming meetings
CREATE OR REPLACE FUNCTION get_mr_upcoming_meetings(p_mr_id UUID, limit_count INTEGER DEFAULT 5)
RETURNS TABLE (
    meeting_id UUID,
    doctor_name VARCHAR,
    hospital VARCHAR,
    scheduled_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR,
    notes TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id as meeting_id,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.hospital,
        m.scheduled_date,
        m.status,
        m.notes
    FROM meetings m
    JOIN doctors d ON m.doctor_id = d.id
    WHERE m.mr_id = p_mr_id
    AND m.scheduled_date >= CURRENT_DATE
    ORDER BY m.scheduled_date ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get MR performance summary
CREATE OR REPLACE FUNCTION get_mr_performance_summary(p_mr_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_meetings_this_month', (
            SELECT COUNT(*) 
            FROM meetings m 
            WHERE m.mr_id = p_mr_id 
            AND m.scheduled_date >= date_trunc('month', CURRENT_DATE)
        ),
        'completed_meetings_this_month', (
            SELECT COUNT(*) 
            FROM meetings m 
            WHERE m.mr_id = p_mr_id 
            AND m.status = 'completed'
            AND m.scheduled_date >= date_trunc('month', CURRENT_DATE)
        ),
        'total_doctors_assigned', (
            SELECT COUNT(*) 
            FROM doctor_assignments da 
            WHERE da.mr_id = p_mr_id 
            AND da.status = 'active'
        ),
        'brochures_uploaded_this_month', (
            SELECT COUNT(*) 
            FROM brochures b 
            WHERE b.uploaded_by = p_mr_id
            AND b.created_at >= date_trunc('month', CURRENT_DATE)
        ),
        'completion_rate', (
            CASE 
                WHEN (
                    SELECT COUNT(*) 
                    FROM meetings m 
                    WHERE m.mr_id = p_mr_id 
                    AND m.scheduled_date >= date_trunc('month', CURRENT_DATE)
                ) > 0 THEN
                    ROUND(
                        (
                            SELECT COUNT(*) 
                            FROM meetings m 
                            WHERE m.mr_id = p_mr_id 
                            AND m.status = 'completed'
                            AND m.scheduled_date >= date_trunc('month', CURRENT_DATE)
                        )::FLOAT / 
                        (
                            SELECT COUNT(*) 
                            FROM meetings m 
                            WHERE m.mr_id = p_mr_id 
                            AND m.scheduled_date >= date_trunc('month', CURRENT_DATE)
                        )::FLOAT * 100
                    )
                ELSE 0
            END
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
