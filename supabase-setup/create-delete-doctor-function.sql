-- Create delete_my_doctor_assignment function
-- This function allows MRs to delete their assigned doctors

CREATE OR REPLACE FUNCTION public.delete_my_doctor_assignment(
  doctor_id_param UUID,
  mr_id_param UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  doctor_exists BOOLEAN;
BEGIN
  -- Check if the doctor exists and belongs to the MR
  SELECT EXISTS(
    SELECT 1 FROM local_doctors 
    WHERE id = doctor_id_param 
    AND mr_id = mr_id_param 
    AND is_deleted = false
  ) INTO doctor_exists;
  
  IF NOT doctor_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Doctor not found or not assigned to you'
    );
  END IF;
  
  -- Soft delete the doctor
  UPDATE local_doctors 
  SET 
    is_deleted = true,
    updated_at = NOW(),
    sync_status = 'pending',
    local_changes = jsonb_build_object('deleted_at', NOW()::text),
    version = version + 1
  WHERE id = doctor_id_param 
  AND mr_id = mr_id_param;
  
  -- Return success
  RETURN json_build_object(
    'success', true,
    'message', 'Doctor deleted successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Failed to delete doctor: ' || SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_my_doctor_assignment(UUID, UUID) TO authenticated;
