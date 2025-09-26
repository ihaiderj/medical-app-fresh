-- Fix brochure creation errors
-- Run this in your Supabase SQL Editor

-- Increase file_type column size to handle long MIME types
ALTER TABLE brochures ALTER COLUMN file_type TYPE VARCHAR(100);

-- Make the original category column nullable since we're using category_id now
ALTER TABLE brochures ALTER COLUMN category DROP NOT NULL;

-- Drop the existing function first to change return type
DROP FUNCTION IF EXISTS get_all_brochures_with_categories();

-- Update the create_brochure_with_category function to handle status properly
CREATE OR REPLACE FUNCTION create_brochure_with_category(
    p_title VARCHAR,
    p_category_id UUID,
    p_description TEXT DEFAULT NULL,
    p_file_url TEXT DEFAULT NULL,
    p_file_name TEXT DEFAULT NULL,
    p_file_type VARCHAR(100) DEFAULT NULL,
    p_thumbnail_url TEXT DEFAULT NULL,
    p_pages INTEGER DEFAULT NULL,
    p_file_size VARCHAR DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_is_public BOOLEAN DEFAULT true
)
RETURNS JSON AS $$
DECLARE
    new_brochure_id UUID;
    result JSON;
BEGIN
    INSERT INTO brochures (
        title, category, category_id, description, file_url, file_name, file_type,
        thumbnail_url, pages, file_size, tags, is_public, uploaded_by, status
    )
    VALUES (
        p_title, 
        (SELECT name FROM brochure_categories WHERE id = p_category_id), -- Populate old category column
        p_category_id, 
        p_description, p_file_url, p_file_name, p_file_type,
        p_thumbnail_url, p_pages, p_file_size, p_tags, p_is_public, auth.uid(), 'active'::brochure_status
    )
    RETURNING id INTO new_brochure_id;
    
    SELECT json_build_object(
        'success', true,
        'message', 'Brochure created successfully',
        'brochure_id', new_brochure_id
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the get_all_brochures_with_categories function with correct return type
CREATE FUNCTION get_all_brochures_with_categories()
RETURNS TABLE (
    id UUID,
    title VARCHAR(255),
    category_name VARCHAR(100),
    category_color VARCHAR(7),
    description TEXT,
    file_url TEXT,
    file_name TEXT,
    file_type VARCHAR(100),
    thumbnail_url TEXT,
    pages INTEGER,
    file_size VARCHAR(50),
    status TEXT,
    download_count INTEGER,
    view_count INTEGER,
    tags TEXT[],
    is_public BOOLEAN,
    uploaded_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.title,
        bc.name as category_name,
        bc.color as category_color,
        b.description,
        b.file_url,
        b.file_name,
        b.file_type,
        b.thumbnail_url,
        b.pages,
        b.file_size,
        b.status::text as status,
        b.download_count,
        b.view_count,
        b.tags,
        b.is_public,
        CONCAT(u.first_name, ' ', u.last_name) as uploaded_by_name,
        b.created_at
    FROM brochures b
    LEFT JOIN brochure_categories bc ON b.category_id = bc.id
    LEFT JOIN users u ON b.uploaded_by = u.id
    ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
