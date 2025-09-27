-- Activity Logs Setup for MR Dashboard
-- Run this in your Supabase SQL Editor

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Function to log activity
CREATE OR REPLACE FUNCTION log_activity(
    p_user_id UUID,
    p_activity_type VARCHAR(50),
    p_description TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_activity_id UUID;
BEGIN
    INSERT INTO activity_logs (user_id, activity_type, description, metadata)
    VALUES (p_user_id, p_activity_type, p_description, p_metadata)
    RETURNING id INTO new_activity_id;
    
    RETURN new_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the get_mr_recent_activities function (should already exist)
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

-- Add some sample activities for testing (optional)
-- You can remove this section after testing
DO $$
DECLARE
    sample_user_id UUID;
BEGIN
    -- Get a sample MR user ID (replace with actual user ID if needed)
    SELECT id INTO sample_user_id FROM users WHERE role = 'mr' LIMIT 1;
    
    IF sample_user_id IS NOT NULL THEN
        -- Insert sample activities
        PERFORM log_activity(sample_user_id, 'brochure_download', 'Downloaded Visualet Fervid brochure');
        PERFORM log_activity(sample_user_id, 'brochure_view', 'Viewed Visualet Fervid brochure');
        PERFORM log_activity(sample_user_id, 'meeting_scheduled', 'Scheduled meeting with Dr. Smith');
        PERFORM log_activity(sample_user_id, 'doctor_added', 'Added new doctor: Dr. Johnson');
        PERFORM log_activity(sample_user_id, 'login', 'Logged into the system');
    END IF;
END $$;
