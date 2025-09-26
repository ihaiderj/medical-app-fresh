-- Additional Dashboard Functions for Dynamic Data
-- Run this in your Supabase SQL Editor

-- Function to get recent activities
CREATE OR REPLACE FUNCTION get_recent_activities(limit_count INTEGER DEFAULT 5)
RETURNS TABLE (
    id UUID,
    activity_type VARCHAR,
    description TEXT,
    user_name VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.activity_type,
        al.description,
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        al.created_at
    FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get system status
CREATE OR REPLACE FUNCTION get_system_status()
RETURNS JSON AS $$
DECLARE
    result JSON;
    total_users INTEGER;
    active_users INTEGER;
    total_storage_mb INTEGER;
    last_backup_date TIMESTAMP;
BEGIN
    -- Get user counts
    SELECT COUNT(*) INTO total_users FROM users;
    SELECT COUNT(*) INTO active_users FROM users WHERE is_active = true;
    
    -- Calculate storage usage (estimate based on brochures)
    SELECT COALESCE(SUM(
        CASE 
            WHEN file_size ~ '^[0-9]+$' THEN (file_size::INTEGER / 1024 / 1024)
            ELSE 0
        END
    ), 0)::INTEGER INTO total_storage_mb FROM brochures;
    
    -- Get last backup date (mock for now)
    last_backup_date := NOW() - INTERVAL '2 hours';
    
    SELECT json_build_object(
        'server_status', 'online',
        'database_status', 'connected',
        'total_users', total_users,
        'active_users', active_users,
        'storage_used_mb', total_storage_mb,
        'storage_percentage', LEAST(ROUND((total_storage_mb::FLOAT / 1000) * 100), 100),
        'last_backup', last_backup_date,
        'uptime_hours', 720 -- Mock uptime
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get MR performance stats
CREATE OR REPLACE FUNCTION get_mr_performance_stats()
RETURNS TABLE (
    mr_id UUID,
    mr_name VARCHAR,
    total_meetings INTEGER,
    completed_meetings INTEGER,
    total_doctors INTEGER,
    brochures_uploaded INTEGER,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as mr_id,
        CONCAT(u.first_name, ' ', u.last_name) as mr_name,
        COALESCE(m.meeting_count, 0) as total_meetings,
        COALESCE(m.completed_meetings, 0) as completed_meetings,
        COALESCE(d.doctor_count, 0) as total_doctors,
        COALESCE(b.brochure_count, 0) as brochures_uploaded,
        COALESCE(al.last_activity, u.updated_at) as last_activity
    FROM users u
    LEFT JOIN (
        SELECT 
            mr_id,
            COUNT(*) as meeting_count,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_meetings
        FROM meetings 
        GROUP BY mr_id
    ) m ON u.id = m.mr_id
    LEFT JOIN (
        SELECT 
            mr_id,
            COUNT(*) as doctor_count
        FROM doctor_assignments 
        WHERE status = 'active'
        GROUP BY mr_id
    ) d ON u.id = d.mr_id
    LEFT JOIN (
        SELECT 
            uploaded_by,
            COUNT(*) as brochure_count
        FROM brochures 
        GROUP BY uploaded_by
    ) b ON u.id = b.uploaded_by
    LEFT JOIN (
        SELECT 
            user_id,
            MAX(created_at) as last_activity
        FROM activity_logs 
        GROUP BY user_id
    ) al ON u.id = al.user_id
    WHERE u.role = 'mr' AND u.is_active = true
    ORDER BY last_activity DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get brochure analytics
CREATE OR REPLACE FUNCTION get_brochure_analytics()
RETURNS TABLE (
    brochure_id UUID,
    title VARCHAR,
    category VARCHAR,
    total_views INTEGER,
    total_downloads INTEGER,
    last_viewed TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id as brochure_id,
        b.title,
        b.category,
        COALESCE(b.view_count, 0) as total_views,
        COALESCE(b.download_count, 0) as total_downloads,
        b.updated_at as last_viewed,
        b.created_at
    FROM brochures b
    WHERE b.status = 'active'
    ORDER BY b.view_count DESC, b.download_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
