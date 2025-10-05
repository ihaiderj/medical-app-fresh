-- Fix for meeting creation function
-- This function creates a meeting with brochure association for the notes system

CREATE OR REPLACE FUNCTION public.create_meeting_with_brochure(
    p_mr_id UUID,
    p_doctor_id UUID,
    p_title TEXT,
    p_purpose TEXT,
    p_scheduled_date TIMESTAMP WITH TIME ZONE,
    p_duration_minutes INTEGER,
    p_brochure_id TEXT,
    p_brochure_title TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_meeting_id UUID;
    v_result JSON;
BEGIN
    -- Generate a new meeting ID
    v_meeting_id := gen_random_uuid();
    
    -- Insert the meeting
    INSERT INTO meetings (
        meeting_id,
        mr_id,
        doctor_id,
        title,
        purpose,
        scheduled_date,
        duration_minutes,
        brochure_id,
        brochure_title,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_meeting_id,
        p_mr_id,
        p_doctor_id,
        p_title,
        p_purpose,
        p_scheduled_date,
        p_duration_minutes,
        p_brochure_id,
        p_brochure_title,
        'scheduled',
        NOW(),
        NOW()
    );
    
    -- Return the created meeting data
    SELECT json_build_object(
        'success', true,
        'meeting_id', v_meeting_id,
        'mr_id', p_mr_id,
        'doctor_id', p_doctor_id,
        'title', p_title,
        'purpose', p_purpose,
        'scheduled_date', p_scheduled_date,
        'duration_minutes', p_duration_minutes,
        'brochure_id', p_brochure_id,
        'brochure_title', p_brochure_title,
        'status', 'scheduled',
        'created_at', NOW(),
        'updated_at', NOW()
    ) INTO v_result;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error creating meeting: %', SQLERRM;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_meeting_with_brochure TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_meeting_with_brochure TO anon;
