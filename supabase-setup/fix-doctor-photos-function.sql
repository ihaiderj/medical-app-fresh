-- Fix doctor functions to handle profile photos
-- Run this in your Supabase SQL Editor

-- Update create_mr_doctor_assignment function to handle photos
CREATE OR REPLACE FUNCTION create_mr_doctor_assignment(
    p_mr_id UUID,
    p_first_name VARCHAR(100),
    p_last_name VARCHAR(100),
    p_specialty VARCHAR(100),
    p_hospital VARCHAR(200),
    p_phone VARCHAR(20) DEFAULT NULL,
    p_email VARCHAR(100) DEFAULT NULL,
    p_location VARCHAR(200) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_profile_image_url TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    new_doctor_id UUID;
BEGIN
    -- Create new doctor with photo URL
    INSERT INTO doctors (
        first_name,
        last_name,
        specialty,
        hospital,
        phone,
        email,
        location,
        profile_image_url,
        notes,
        created_at,
        updated_at
    ) VALUES (
        p_first_name,
        p_last_name,
        p_specialty,
        p_hospital,
        p_phone,
        p_email,
        p_location,
        p_profile_image_url,
        p_notes,
        NOW(),
        NOW()
    ) RETURNING id INTO new_doctor_id;

    -- Create doctor assignment
    INSERT INTO doctor_assignments (
        mr_id,
        doctor_id,
        assigned_by,
        notes,
        status,
        assigned_at
    ) VALUES (
        p_mr_id,
        new_doctor_id,
        p_mr_id, -- MR assigns to themselves
        p_notes,
        'active',
        NOW()
    );

    RETURN new_doctor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update update_mr_doctor_assignment function to handle photos
CREATE OR REPLACE FUNCTION update_mr_doctor_assignment(
    p_doctor_id UUID,
    p_first_name VARCHAR(100),
    p_last_name VARCHAR(100),
    p_specialty VARCHAR(100),
    p_hospital VARCHAR(200),
    p_phone VARCHAR(20) DEFAULT NULL,
    p_email VARCHAR(100) DEFAULT NULL,
    p_location VARCHAR(200) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_profile_image_url TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Update doctor record with photo URL
    UPDATE doctors SET
        first_name = p_first_name,
        last_name = p_last_name,
        specialty = p_specialty,
        hospital = p_hospital,
        phone = p_phone,
        email = p_email,
        location = p_location,
        profile_image_url = p_profile_image_url,
        notes = p_notes,
        updated_at = NOW()
    WHERE id = p_doctor_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create delete function for doctor assignments
CREATE OR REPLACE FUNCTION delete_mr_doctor_assignment(
    p_doctor_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Delete the doctor assignment (not the doctor record itself)
    DELETE FROM doctor_assignments 
    WHERE doctor_id = p_doctor_id;

    -- Optionally, delete the doctor record if no other assignments exist
    -- (uncomment if you want to completely remove the doctor)
    /*
    DELETE FROM doctors 
    WHERE id = p_doctor_id 
    AND NOT EXISTS (
        SELECT 1 FROM doctor_assignments 
        WHERE doctor_id = p_doctor_id
    );
    */

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
