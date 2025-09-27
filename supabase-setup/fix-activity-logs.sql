-- Fix Activity Logs Table
-- Run this in your Supabase SQL Editor

-- Drop existing function first to avoid conflicts
DROP FUNCTION IF EXISTS log_activity(UUID, VARCHAR, TEXT, JSONB);
DROP FUNCTION IF EXISTS log_activity(UUID, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS log_activity;

-- Drop the table if it exists with wrong structure
DROP TABLE IF EXISTS activity_logs CASCADE;

-- Create activity_logs table with correct columns
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

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

-- Function to get recent activities
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_activity TO authenticated;
GRANT EXECUTE ON FUNCTION get_mr_recent_activities TO authenticated;
