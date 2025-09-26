-- Functions for tracking brochure downloads and views

-- Function to track brochure download
CREATE OR REPLACE FUNCTION track_brochure_download(
    p_brochure_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Increment download count
    UPDATE brochures 
    SET download_count = download_count + 1,
        updated_at = NOW()
    WHERE id = p_brochure_id;
    
    -- Log the activity
    INSERT INTO activity_logs (user_id, activity_type, description, metadata)
    VALUES (
        auth.uid(),
        'brochure_download',
        'Downloaded brochure',
        jsonb_build_object('brochure_id', p_brochure_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track brochure view
CREATE OR REPLACE FUNCTION track_brochure_view(
    p_brochure_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Increment view count
    UPDATE brochures 
    SET view_count = view_count + 1,
        updated_at = NOW()
    WHERE id = p_brochure_id;
    
    -- Log the activity
    INSERT INTO activity_logs (user_id, activity_type, description, metadata)
    VALUES (
        auth.uid(),
        'brochure_viewed',
        'Viewed brochure',
        jsonb_build_object('brochure_id', p_brochure_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
