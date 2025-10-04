-- Brochure Synchronization API
-- This file contains functions for cross-device brochure synchronization

-- Create brochure_sync table to track changes
CREATE TABLE IF NOT EXISTS brochure_sync (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mr_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brochure_id TEXT NOT NULL,
    brochure_title TEXT NOT NULL,
    brochure_data JSONB NOT NULL,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(mr_id, brochure_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_brochure_sync_mr_brochure ON brochure_sync(mr_id, brochure_id);
CREATE INDEX IF NOT EXISTS idx_brochure_sync_last_modified ON brochure_sync(last_modified);

-- Function to save brochure changes to server
CREATE OR REPLACE FUNCTION save_brochure_changes(
    p_mr_id UUID,
    p_brochure_id TEXT,
    p_brochure_title TEXT,
    p_brochure_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Insert or update brochure sync data
    INSERT INTO brochure_sync (mr_id, brochure_id, brochure_title, brochure_data, last_modified)
    VALUES (p_mr_id, p_brochure_id, p_brochure_title, p_brochure_data, NOW())
    ON CONFLICT (mr_id, brochure_id)
    DO UPDATE SET
        brochure_title = EXCLUDED.brochure_title,
        brochure_data = EXCLUDED.brochure_data,
        last_modified = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Brochure changes saved successfully',
        'last_modified', NOW()
    );
END;
$$;

-- Function to get brochure changes for MR user
CREATE OR REPLACE FUNCTION get_brochure_changes(
    p_mr_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    brochure_changes JSONB;
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Get all brochure changes for the MR user
    SELECT jsonb_agg(
        jsonb_build_object(
            'brochure_id', brochure_id,
            'brochure_title', brochure_title,
            'last_modified', last_modified,
            'has_changes', true
        )
    ) INTO brochure_changes
    FROM brochure_sync
    WHERE mr_id = p_mr_id
    ORDER BY last_modified DESC;

    -- Handle case when no changes exist
    IF brochure_changes IS NULL THEN
        brochure_changes := '[]'::jsonb;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'data', brochure_changes
    );
END;
$$;

-- Function to get specific brochure data for download
CREATE OR REPLACE FUNCTION get_brochure_sync_data(
    p_mr_id UUID,
    p_brochure_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    sync_data JSONB;
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Get brochure sync data
    SELECT brochure_data INTO sync_data
    FROM brochure_sync
    WHERE mr_id = p_mr_id AND brochure_id = p_brochure_id;

    -- Check if brochure exists
    IF sync_data IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Brochure not found or no changes saved'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'data', sync_data
    );
END;
$$;

-- Function to check if brochure has server changes
CREATE OR REPLACE FUNCTION check_brochure_sync_status(
    p_brochure_id TEXT,
    p_local_last_modified TIMESTAMP WITH TIME ZONE,
    p_mr_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    server_last_modified TIMESTAMP WITH TIME ZONE;
    has_server_changes BOOLEAN := false;
    needs_download BOOLEAN := false;
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Get server last modified time
    SELECT last_modified INTO server_last_modified
    FROM brochure_sync
    WHERE mr_id = p_mr_id AND brochure_id = p_brochure_id;

    -- Check if brochure exists on server
    IF server_last_modified IS NOT NULL THEN
        has_server_changes := true;
        
        -- Check if server version is newer than local (with 1-second tolerance for timing issues)
        IF p_local_last_modified IS NULL THEN
            needs_download := true;
        ELSIF server_last_modified > (p_local_last_modified + INTERVAL '1 second') THEN
            needs_download := true;
        ELSE
            needs_download := false;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'has_server_changes', has_server_changes,
        'needs_download', needs_download,
        'server_last_modified', server_last_modified,
        'local_last_modified', p_local_last_modified
    );
END;
$$;

-- Function to delete brochure sync data (when brochure is deleted locally)
CREATE OR REPLACE FUNCTION delete_brochure_sync(
    p_mr_id UUID,
    p_brochure_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Delete brochure sync data
    DELETE FROM brochure_sync
    WHERE mr_id = p_mr_id AND brochure_id = p_brochure_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Brochure sync data deleted successfully'
    );
END;
$$;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION save_brochure_changes(UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_brochure_changes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_brochure_sync_data(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_brochure_sync_status(TEXT, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_brochure_sync(UUID, TEXT) TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON brochure_sync TO authenticated;
