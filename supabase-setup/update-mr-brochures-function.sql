-- Update the get_mr_assigned_brochures function to include file information

-- Drop the existing function first
DROP FUNCTION IF EXISTS get_mr_assigned_brochures(UUID);

-- Create the updated function
CREATE FUNCTION get_mr_assigned_brochures(p_mr_id UUID)
RETURNS TABLE (
    brochure_id UUID,
    title VARCHAR,
    category VARCHAR,
    description TEXT,
    thumbnail_url TEXT,
    view_count INTEGER,
    download_count INTEGER,
    uploaded_by_name VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE,
    file_url TEXT,
    file_name VARCHAR,
    file_type VARCHAR
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
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), 
                 CASE WHEN u.role = 'admin' THEN 'Administrator' ELSE 'Unknown' END) as uploaded_by_name,
        b.created_at,
        b.file_url,
        b.file_name,
        b.file_type
    FROM brochures b
    LEFT JOIN users u ON b.uploaded_by = u.id
    WHERE b.status = 'active'
    AND (
        b.uploaded_by = p_mr_id  -- Brochures uploaded by this MR
        OR b.is_public = true    -- Public brochures uploaded by admin
        OR b.uploaded_by IN (    -- Brochures uploaded by admin (all MRs can see admin brochures)
            SELECT id FROM users WHERE role = 'admin'
        )
    )
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
