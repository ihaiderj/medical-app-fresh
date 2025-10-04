-- Saved Brochures Cross-Device Synchronization
-- This file contains functions for syncing saved brochures across devices

-- Create saved_brochures table to track which brochures each MR has saved
CREATE TABLE IF NOT EXISTS saved_brochures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mr_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brochure_id TEXT NOT NULL,
    brochure_title TEXT NOT NULL,
    custom_title TEXT NOT NULL,
    original_brochure_data JSONB NOT NULL, -- Store original brochure metadata
    saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(mr_id, brochure_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_saved_brochures_mr_id ON saved_brochures(mr_id);
CREATE INDEX IF NOT EXISTS idx_saved_brochures_brochure_id ON saved_brochures(brochure_id);

-- Function to save a brochure for an MR user
CREATE OR REPLACE FUNCTION save_brochure_for_mr(
    p_mr_id UUID,
    p_brochure_id TEXT,
    p_brochure_title TEXT,
    p_custom_title TEXT,
    p_original_brochure_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Insert or update saved brochure
    INSERT INTO saved_brochures (mr_id, brochure_id, brochure_title, custom_title, original_brochure_data, saved_at, last_accessed)
    VALUES (p_mr_id, p_brochure_id, p_brochure_title, p_custom_title, p_original_brochure_data, NOW(), NOW())
    ON CONFLICT (mr_id, brochure_id)
    DO UPDATE SET
        brochure_title = EXCLUDED.brochure_title,
        custom_title = EXCLUDED.custom_title,
        original_brochure_data = EXCLUDED.original_brochure_data,
        last_accessed = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Brochure saved successfully'
    );
END;
$$;

-- Function to get all saved brochures for an MR user
CREATE OR REPLACE FUNCTION get_saved_brochures_for_mr(
    p_mr_id UUID
)
RETURNS TABLE (
    brochure_id TEXT,
    brochure_title TEXT,
    custom_title TEXT,
    original_brochure_data JSONB,
    saved_at TIMESTAMP WITH TIME ZONE,
    last_accessed TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        sb.brochure_id,
        sb.brochure_title,
        sb.custom_title,
        sb.original_brochure_data,
        sb.saved_at,
        sb.last_accessed
    FROM saved_brochures sb
    WHERE sb.mr_id = p_mr_id
    ORDER BY sb.last_accessed DESC;
END;
$$;

-- Function to remove a saved brochure for an MR user
CREATE OR REPLACE FUNCTION remove_saved_brochure_for_mr(
    p_mr_id UUID,
    p_brochure_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Delete the saved brochure
    DELETE FROM saved_brochures 
    WHERE mr_id = p_mr_id AND brochure_id = p_brochure_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Saved brochure removed successfully'
    );
END;
$$;

-- Function to update custom title of a saved brochure
CREATE OR REPLACE FUNCTION update_saved_brochure_title(
    p_mr_id UUID,
    p_brochure_id TEXT,
    p_new_custom_title TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Update the custom title
    UPDATE saved_brochures 
    SET custom_title = p_new_custom_title,
        last_accessed = NOW()
    WHERE mr_id = p_mr_id AND brochure_id = p_brochure_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Saved brochure not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Custom title updated successfully'
    );
END;
$$;

-- Function to update last accessed time (when brochure is viewed)
CREATE OR REPLACE FUNCTION update_saved_brochure_access(
    p_mr_id UUID,
    p_brochure_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update last accessed time
    UPDATE saved_brochures 
    SET last_accessed = NOW()
    WHERE mr_id = p_mr_id AND brochure_id = p_brochure_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Saved brochure not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Access time updated'
    );
END;
$$;

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION save_brochure_for_mr(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_saved_brochures_for_mr(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_saved_brochure_for_mr(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_saved_brochure_title(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_saved_brochure_access(UUID, TEXT) TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_brochures TO authenticated;
