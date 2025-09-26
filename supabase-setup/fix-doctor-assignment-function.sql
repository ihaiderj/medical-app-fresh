-- Fix the create_mr_doctor_assignment function
-- This fixes the 'relationship_status' column error

CREATE OR REPLACE FUNCTION create_mr_doctor_assignment(
    p_mr_id UUID,
    p_first_name VARCHAR,
    p_last_name VARCHAR,
    p_specialty VARCHAR,
    p_hospital VARCHAR,
    p_phone VARCHAR DEFAULT NULL,
    p_email VARCHAR DEFAULT NULL,
    p_location VARCHAR DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_doctor_id UUID;
    result JSON;
BEGIN
    -- Create new doctor
    INSERT INTO doctors (
        first_name,
        last_name,
        specialty,
        hospital,
        phone,
        email,
        location,
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
        NOW(),
        NOW()
    ) RETURNING id INTO new_doctor_id;

    -- Create doctor assignment (fixed - removed non-existent relationship_status column)
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

    -- Return success with doctor info
    SELECT json_build_object(
        'success', true,
        'doctor_id', new_doctor_id,
        'message', 'Doctor added successfully'
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_mr_doctor_assignment TO authenticated;
