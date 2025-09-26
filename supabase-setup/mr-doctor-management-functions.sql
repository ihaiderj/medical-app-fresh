-- MR Doctor Management Functions
-- Functions for updating and deleting doctor assignments

-- Function to update a doctor assignment
CREATE OR REPLACE FUNCTION update_mr_doctor_assignment(
  p_doctor_id UUID,
  p_first_name VARCHAR(100),
  p_last_name VARCHAR(100),
  p_specialty VARCHAR(100),
  p_hospital VARCHAR(200),
  p_phone VARCHAR(20) DEFAULT NULL,
  p_email VARCHAR(255) DEFAULT NULL,
  p_location VARCHAR(200) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Update the doctor assignment
  UPDATE doctor_assignments 
  SET 
    first_name = p_first_name,
    last_name = p_last_name,
    specialty = p_specialty,
    hospital = p_hospital,
    phone = p_phone,
    email = p_email,
    location = p_location,
    notes = p_notes,
    updated_at = NOW()
  WHERE id = p_doctor_id;

  -- Check if the update was successful
  IF FOUND THEN
    result := json_build_object(
      'success', true,
      'message', 'Doctor assignment updated successfully'
    );
  ELSE
    result := json_build_object(
      'success', false,
      'error', 'Doctor assignment not found'
    );
  END IF;

  RETURN result;
END;
$$;

-- Function to delete a doctor assignment
CREATE OR REPLACE FUNCTION delete_mr_doctor_assignment(
  p_doctor_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Delete the doctor assignment
  DELETE FROM doctor_assignments 
  WHERE id = p_doctor_id;

  -- Check if the deletion was successful
  IF FOUND THEN
    result := json_build_object(
      'success', true,
      'message', 'Doctor assignment deleted successfully'
    );
  ELSE
    result := json_build_object(
      'success', false,
      'error', 'Doctor assignment not found'
    );
  END IF;

  RETURN result;
END;
$$;

-- Function to update a meeting
CREATE OR REPLACE FUNCTION update_mr_meeting(
  p_meeting_id UUID,
  p_scheduled_date TIMESTAMP WITH TIME ZONE,
  p_duration_minutes INTEGER DEFAULT 30,
  p_presentation_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_status VARCHAR(50) DEFAULT 'scheduled'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Update the meeting
  UPDATE meetings 
  SET 
    scheduled_date = p_scheduled_date,
    duration_minutes = p_duration_minutes,
    presentation_id = p_presentation_id,
    notes = p_notes,
    status = p_status,
    updated_at = NOW()
  WHERE id = p_meeting_id;

  -- Check if the update was successful
  IF FOUND THEN
    result := json_build_object(
      'success', true,
      'message', 'Meeting updated successfully'
    );
  ELSE
    result := json_build_object(
      'success', false,
      'error', 'Meeting not found'
    );
  END IF;

  RETURN result;
END;
$$;

-- Function to delete a meeting
CREATE OR REPLACE FUNCTION delete_mr_meeting(
  p_meeting_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Delete the meeting
  DELETE FROM meetings 
  WHERE id = p_meeting_id;

  -- Check if the deletion was successful
  IF FOUND THEN
    result := json_build_object(
      'success', true,
      'message', 'Meeting deleted successfully'
    );
  ELSE
    result := json_build_object(
      'success', false,
      'error', 'Meeting not found'
    );
  END IF;

  RETURN result;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION update_mr_doctor_assignment TO authenticated;
GRANT EXECUTE ON FUNCTION delete_mr_doctor_assignment TO authenticated;
GRANT EXECUTE ON FUNCTION update_mr_meeting TO authenticated;
GRANT EXECUTE ON FUNCTION delete_mr_meeting TO authenticated;
