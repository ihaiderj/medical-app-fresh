-- Fix Admin Dashboard Stats to show accurate data
-- Run this in your Supabase SQL Editor

-- Update the admin dashboard stats function to be more accurate
CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_mrs', (
            SELECT COUNT(*) 
            FROM users 
            WHERE role = 'mr' AND is_active = true
        ),
        'active_brochures', (
            SELECT COUNT(*) 
            FROM brochures 
            WHERE status = 'active'
        ),
        'total_doctors', (
            SELECT COUNT(*) 
            FROM doctors
        ),
        'monthly_meetings', (
            SELECT COUNT(*) 
            FROM meetings 
            WHERE scheduled_date >= date_trunc('month', CURRENT_DATE)
        ),
        'total_uploads_this_month', (
            SELECT COUNT(*) 
            FROM brochures 
            WHERE created_at >= date_trunc('month', CURRENT_DATE)
        ),
        'total_downloads', (
            SELECT COALESCE(SUM(download_count), 0) 
            FROM brochures
        ),
        'total_views', (
            SELECT COALESCE(SUM(view_count), 0) 
            FROM brochures
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the function
SELECT get_admin_dashboard_stats();
