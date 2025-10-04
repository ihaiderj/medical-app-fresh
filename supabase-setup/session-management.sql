-- Session Management for Single-Device Login Enforcement
-- This ensures users can only be logged in on one device at a time

-- Create user_sessions table to track active sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_info TEXT,
    login_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, device_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device ON user_sessions(device_id);

-- Function to register a new session and deactivate others
CREATE OR REPLACE FUNCTION register_user_session(
    p_user_id UUID,
    p_device_id TEXT,
    p_device_info TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_sessions_count INTEGER;
    conflict_device TEXT;
BEGIN
    -- Check if user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;

    -- Check for existing active sessions on other devices
    SELECT COUNT(*), device_info 
    INTO existing_sessions_count, conflict_device
    FROM user_sessions 
    WHERE user_id = p_user_id 
    AND is_active = true 
    AND device_id != p_device_id
    GROUP BY device_info
    LIMIT 1;

    -- Deactivate all other sessions for this user
    UPDATE user_sessions 
    SET is_active = false, ended_at = NOW()
    WHERE user_id = p_user_id AND device_id != p_device_id;

    -- Insert or update current session
    INSERT INTO user_sessions (user_id, device_id, device_info, login_time, last_activity, is_active)
    VALUES (p_user_id, p_device_id, p_device_info, NOW(), NOW(), true)
    ON CONFLICT (user_id, device_id)
    DO UPDATE SET
        login_time = NOW(),
        last_activity = NOW(),
        is_active = true,
        ended_at = NULL;

    RETURN jsonb_build_object(
        'success', true,
        'has_conflict', COALESCE(existing_sessions_count > 0, false),
        'conflict_device', conflict_device,
        'message', 'Session registered successfully'
    );
END;
$$;

-- Function to update session activity
CREATE OR REPLACE FUNCTION update_session_activity(
    p_user_id UUID,
    p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update last activity time
    UPDATE user_sessions 
    SET last_activity = NOW()
    WHERE user_id = p_user_id 
    AND device_id = p_device_id 
    AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Active session not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Activity updated'
    );
END;
$$;

-- Function to end session
CREATE OR REPLACE FUNCTION end_user_session(
    p_user_id UUID,
    p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- End the session
    UPDATE user_sessions 
    SET is_active = false, ended_at = NOW()
    WHERE user_id = p_user_id 
    AND device_id = p_device_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Session ended successfully'
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION register_user_session(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_session_activity(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION end_user_session(UUID, TEXT) TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE ON user_sessions TO authenticated;
