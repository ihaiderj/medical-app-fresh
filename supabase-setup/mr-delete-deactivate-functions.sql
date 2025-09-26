-- MR Delete and Deactivate Functions
-- Run this in your Supabase SQL Editor to separate delete and deactivate processes

-- Function to deactivate MR (soft delete - keeps data but makes inactive)
CREATE OR REPLACE FUNCTION deactivate_mr(p_mr_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- First deactivate the MR
    UPDATE users SET is_active = false WHERE id = p_mr_id AND role = 'mr';
    
    -- Remove doctor assignments
    UPDATE doctor_assignments SET status = 'inactive' WHERE mr_id = p_mr_id;
    
    -- Cancel future meetings
    UPDATE meetings SET status = 'cancelled' 
    WHERE mr_id = p_mr_id AND status = 'scheduled';
    
    SELECT json_build_object(
        'success', true,
        'message', 'MR deactivated successfully',
        'mr_id', p_mr_id
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to hard delete MR (permanently removes from database)
CREATE OR REPLACE FUNCTION hard_delete_mr(p_mr_id UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    -- Delete related records first (to avoid foreign key constraints)
    
    -- Delete MR permissions
    DELETE FROM mr_permissions WHERE mr_id = p_mr_id;
    
    -- Delete doctor assignments
    DELETE FROM doctor_assignments WHERE mr_id = p_mr_id;
    
    -- Delete meetings
    DELETE FROM meetings WHERE mr_id = p_mr_id;
    
    -- Delete activity logs
    DELETE FROM activity_logs WHERE user_id = p_mr_id;
    
    -- Finally delete the MR user
    DELETE FROM users WHERE id = p_mr_id AND role = 'mr';
    
    SELECT json_build_object(
        'success', true,
        'message', 'MR permanently deleted',
        'mr_id', p_mr_id
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the existing delete_mr function to use deactivate_mr for backward compatibility
CREATE OR REPLACE FUNCTION delete_mr(p_mr_id UUID)
RETURNS JSON AS $$
BEGIN
    -- Call the deactivate function for backward compatibility
    RETURN deactivate_mr(p_mr_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
