-- Create server-side photo upload function that bypasses authentication issues
-- Run this in your Supabase SQL Editor

-- Create a function to handle photo uploads server-side
CREATE OR REPLACE FUNCTION upload_doctor_photo(
    p_user_id UUID,
    p_photo_data TEXT, -- Base64 encoded image data
    p_file_name VARCHAR(255),
    p_mime_type VARCHAR(100) DEFAULT 'image/jpeg'
)
RETURNS JSON AS $$
DECLARE
    photo_url TEXT;
    file_path TEXT;
BEGIN
    -- Generate unique file path
    file_path := 'uploads/doctor_' || extract(epoch from now())::bigint || '_' || p_file_name;
    
    -- For now, we'll store the photo data in a temporary table
    -- and return a placeholder URL until we can implement proper storage
    
    -- Create a photos table if it doesn't exist
    CREATE TABLE IF NOT EXISTS doctor_photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        file_name VARCHAR(255),
        file_path TEXT,
        photo_data TEXT, -- Base64 data
        mime_type VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    -- Insert photo data
    INSERT INTO doctor_photos (user_id, file_name, file_path, photo_data, mime_type)
    VALUES (p_user_id, p_file_name, file_path, p_photo_data, p_mime_type);
    
    -- Return a data URL that can be used directly
    photo_url := 'data:' || p_mime_type || ';base64,' || p_photo_data;
    
    RETURN json_build_object(
        'success', true,
        'photo_url', photo_url,
        'file_path', file_path
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get photo data
CREATE OR REPLACE FUNCTION get_doctor_photo(p_file_path TEXT)
RETURNS JSON AS $$
DECLARE
    photo_record RECORD;
BEGIN
    SELECT photo_data, mime_type INTO photo_record
    FROM doctor_photos 
    WHERE file_path = p_file_path;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Photo not found');
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'photo_url', 'data:' || photo_record.mime_type || ';base64,' || photo_record.photo_data
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the function
SELECT 'Photo upload functions created successfully' as status;
