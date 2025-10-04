-- Add duplicate checking for doctors
-- Run this in your Supabase SQL Editor

-- Create function to check for duplicate doctors
CREATE OR REPLACE FUNCTION check_doctor_duplicates(
    p_mr_id UUID,
    p_first_name VARCHAR(100),
    p_last_name VARCHAR(100),
    p_email VARCHAR(100) DEFAULT NULL,
    p_phone VARCHAR(20) DEFAULT NULL,
    p_exclude_doctor_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    duplicate_count INTEGER := 0;
    duplicate_info JSON;
    similar_doctors JSON[];
BEGIN
    -- Check for exact name match
    SELECT COUNT(*) INTO duplicate_count
    FROM doctors d
    JOIN doctor_assignments da ON d.id = da.doctor_id
    WHERE da.mr_id = p_mr_id
    AND da.status = 'active'
    AND LOWER(TRIM(d.first_name)) = LOWER(TRIM(p_first_name))
    AND LOWER(TRIM(d.last_name)) = LOWER(TRIM(p_last_name))
    AND (p_exclude_doctor_id IS NULL OR d.id != p_exclude_doctor_id);
    
    IF duplicate_count > 0 THEN
        SELECT json_build_object(
            'has_duplicates', true,
            'duplicate_type', 'exact_name',
            'message', 'A doctor with the same name already exists'
        ) INTO duplicate_info;
        RETURN duplicate_info;
    END IF;
    
    -- Check for email match (if email provided)
    IF p_email IS NOT NULL AND TRIM(p_email) != '' THEN
        SELECT COUNT(*) INTO duplicate_count
        FROM doctors d
        JOIN doctor_assignments da ON d.id = da.doctor_id
        WHERE da.mr_id = p_mr_id
        AND da.status = 'active'
        AND LOWER(TRIM(d.email)) = LOWER(TRIM(p_email))
        AND (p_exclude_doctor_id IS NULL OR d.id != p_exclude_doctor_id);
        
        IF duplicate_count > 0 THEN
            SELECT json_build_object(
                'has_duplicates', true,
                'duplicate_type', 'email',
                'message', 'A doctor with this email already exists'
            ) INTO duplicate_info;
            RETURN duplicate_info;
        END IF;
    END IF;
    
    -- Check for phone match (if phone provided)
    IF p_phone IS NOT NULL AND TRIM(p_phone) != '' THEN
        SELECT COUNT(*) INTO duplicate_count
        FROM doctors d
        JOIN doctor_assignments da ON d.id = da.doctor_id
        WHERE da.mr_id = p_mr_id
        AND da.status = 'active'
        AND REGEXP_REPLACE(d.phone, '[^0-9]', '', 'g') = REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g')
        AND (p_exclude_doctor_id IS NULL OR d.id != p_exclude_doctor_id);
        
        IF duplicate_count > 0 THEN
            SELECT json_build_object(
                'has_duplicates', true,
                'duplicate_type', 'phone',
                'message', 'A doctor with this phone number already exists'
            ) INTO duplicate_info;
            RETURN duplicate_info;
        END IF;
    END IF;
    
    -- No duplicates found
    RETURN json_build_object(
        'has_duplicates', false,
        'message', 'No duplicates found'
    );
    
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the function
SELECT check_doctor_duplicates(
    'f726b2a4-0ec0-4193-bcb4-a172c5b090a4'::uuid,
    'Test',
    'Doctor',
    'test@example.com',
    '1234567890'
) as duplicate_check_result;
