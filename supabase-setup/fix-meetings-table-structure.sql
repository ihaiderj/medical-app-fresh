-- Fix Meeting Table Structure and Functions
-- This script addresses the column naming issues and missing functions

-- First, let's ensure the meetings table has the correct structure
-- Note: Adjust column names based on your actual table structure

-- Drop ALL existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.create_meeting_with_brochure CASCADE;
DROP FUNCTION IF EXISTS public.add_slide_note_to_meeting CASCADE;
DROP FUNCTION IF EXISTS public.get_meeting_details_with_notes CASCADE;
DROP FUNCTION IF EXISTS public.get_mr_meetings_with_notes CASCADE;
DROP FUNCTION IF EXISTS public.delete_mr_meeting CASCADE;
DROP FUNCTION IF EXISTS public.update_mr_meeting CASCADE;
-- Drop any misspelled function names that might exist
DROP FUNCTION IF EXISTS public.dele_mr_meething CASCADE;
DROP FUNCTION IF EXISTS public.delete_meeting CASCADE;
DROP FUNCTION IF EXISTS public.update_meeting CASCADE;

-- Clean up any other potential function variations
DO $$ 
DECLARE 
    func_name TEXT;
BEGIN
    -- Drop any function that contains 'meeting' and 'delete'
    FOR func_name IN 
        SELECT proname FROM pg_proc 
        WHERE proname LIKE '%meeting%' AND proname LIKE '%delete%'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.' || func_name || ' CASCADE';
    END LOOP;
END $$;

-- Update the create_meeting_with_brochure function to use correct column names
CREATE OR REPLACE FUNCTION create_meeting_with_brochure(
    p_mr_id UUID,
    p_doctor_id UUID,
    p_brochure_id TEXT,
    p_brochure_title TEXT,
    p_title TEXT,
    p_purpose TEXT,
    p_scheduled_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    p_duration_minutes INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_meeting_id UUID;
BEGIN
    -- Generate new meeting ID
    new_meeting_id := gen_random_uuid();
    
    -- Insert meeting using the correct column names
    INSERT INTO meetings (
        id,                    -- Use 'id' instead of 'meeting_id'
        mr_id,
        doctor_id,
        title,
        scheduled_date,
        duration_minutes,
        status,
        notes,
        presentation_slides,
        created_at,
        updated_at
    )
    VALUES (
        new_meeting_id,
        p_mr_id,
        p_doctor_id,
        p_title,
        p_scheduled_date,
        p_duration_minutes,
        'scheduled',
        p_purpose,
        jsonb_build_object(
            'brochure_id', p_brochure_id, 
            'brochure_title', p_brochure_title
        ),
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'meeting_id', new_meeting_id,
        'message', 'Meeting created successfully'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Create meeting_slide_notes table if it doesn't exist
CREATE TABLE IF NOT EXISTS meeting_slide_notes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    slide_id TEXT NOT NULL,
    slide_title TEXT NOT NULL,
    slide_order INTEGER NOT NULL,
    brochure_id TEXT NOT NULL,
    note_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meeting_slide_notes_meeting_id ON meeting_slide_notes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_slide_notes_slide_id ON meeting_slide_notes(slide_id);
CREATE INDEX IF NOT EXISTS idx_meeting_slide_notes_brochure_id ON meeting_slide_notes(brochure_id);

-- Add unique constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_meeting_slide_note'
    ) THEN
        ALTER TABLE meeting_slide_notes 
        ADD CONSTRAINT unique_meeting_slide_note 
        UNIQUE (meeting_id, slide_id);
    END IF;
END $$;

-- Function to add slide note to meeting
CREATE OR REPLACE FUNCTION add_slide_note_to_meeting(
    p_meeting_id UUID,
    p_slide_id TEXT,
    p_slide_title TEXT,
    p_slide_order INTEGER,
    p_brochure_id TEXT,
    p_note_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    note_id UUID;
BEGIN
    -- Validate meeting exists
    IF NOT EXISTS (SELECT 1 FROM meetings WHERE id = p_meeting_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;

    -- Insert or update slide note
    INSERT INTO meeting_slide_notes (
        meeting_id,
        slide_id,
        slide_title,
        slide_order,
        brochure_id,
        note_text,
        created_at,
        updated_at
    )
    VALUES (
        p_meeting_id,
        p_slide_id,
        p_slide_title,
        p_slide_order,
        p_brochure_id,
        p_note_text,
        NOW(),
        NOW()
    )
    ON CONFLICT (meeting_id, slide_id) 
    DO UPDATE SET
        note_text = EXCLUDED.note_text,
        updated_at = NOW()
    RETURNING id INTO note_id;

    -- Update meeting's last activity
    UPDATE meetings 
    SET updated_at = NOW() 
    WHERE id = p_meeting_id;

    RETURN jsonb_build_object(
        'success', true,
        'note_id', note_id,
        'message', 'Slide note saved successfully'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Function to get all meetings for MR with note counts
CREATE OR REPLACE FUNCTION get_mr_meetings_with_notes(
    p_mr_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    meetings_data JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'meeting_id', m.id,
            'title', m.title,
            'doctor_name', CONCAT(d.first_name, ' ', d.last_name),
            'doctor_specialty', d.specialty,
            'hospital', d.hospital,
            'profile_image_url', d.profile_image_url,
            'scheduled_date', m.scheduled_date,
            'duration_minutes', m.duration_minutes,
            'status', m.status,
            'purpose', m.notes,
            'brochure_title', COALESCE(m.presentation_slides->>'brochure_title', 'No Brochure'),
            'notes_count', COALESCE(note_stats.notes_count, 0),
            'last_note_date', note_stats.last_note_date,
            'follow_up_required', COALESCE(m.follow_up_required, false),
            'follow_up_date', m.follow_up_date,
            'follow_up_time', m.follow_up_time,
            'follow_up_notes', m.follow_up_notes,
            'created_at', m.created_at,
            'updated_at', m.updated_at
        )
        ORDER BY COALESCE(note_stats.last_note_date, m.updated_at) DESC
    ) INTO meetings_data
    FROM meetings m
    JOIN doctors d ON m.doctor_id = d.id
    LEFT JOIN (
        SELECT 
            meeting_slide_notes.meeting_id,
            COUNT(*) as notes_count,
            MAX(meeting_slide_notes.updated_at) as last_note_date
        FROM meeting_slide_notes
        GROUP BY meeting_slide_notes.meeting_id
    ) note_stats ON m.id = note_stats.meeting_id
    WHERE m.mr_id = p_mr_id;

    RETURN COALESCE(meetings_data, '[]'::jsonb);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Function to get meeting details with all slide notes
CREATE OR REPLACE FUNCTION get_meeting_details_with_notes(
    p_meeting_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    meeting_details JSONB;
    slide_notes JSONB;
BEGIN
    -- Get meeting details
    SELECT jsonb_build_object(
        'meeting_id', m.id,
        'title', m.title,
        'doctor_name', CONCAT(d.first_name, ' ', d.last_name),
        'doctor_specialty', d.specialty,
        'hospital', d.hospital,
        'scheduled_date', m.scheduled_date,
        'duration_minutes', m.duration_minutes,
        'status', m.status,
        'purpose', m.notes,
        'brochure_info', m.presentation_slides,
        'created_at', m.created_at,
        'updated_at', m.updated_at
    ) INTO meeting_details
    FROM meetings m
    JOIN doctors d ON m.doctor_id = d.id
    WHERE m.id = p_meeting_id;

    -- Get all slide notes for this meeting
    SELECT jsonb_agg(
        jsonb_build_object(
            'note_id', msn.id,
            'slide_id', msn.slide_id,
            'slide_title', msn.slide_title,
            'slide_order', msn.slide_order,
            'note_text', msn.note_text,
            'created_at', msn.created_at,
            'updated_at', msn.updated_at
        )
        ORDER BY msn.slide_order
    ) INTO slide_notes
    FROM meeting_slide_notes msn
    WHERE msn.meeting_id = p_meeting_id;

    -- Combine meeting details with slide notes
    IF meeting_details IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'meeting', meeting_details,
        'slide_notes', COALESCE(slide_notes, '[]'::jsonb)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Function to delete meeting and all associated notes
CREATE OR REPLACE FUNCTION delete_mr_meeting(
    p_meeting_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if meeting exists
    IF NOT EXISTS (SELECT 1 FROM meetings WHERE id = p_meeting_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;

    -- Delete all slide notes for this meeting (CASCADE will handle this, but explicit is better)
    DELETE FROM meeting_slide_notes WHERE meeting_id = p_meeting_id;
    
    -- Delete the meeting
    DELETE FROM meetings WHERE id = p_meeting_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Meeting deleted successfully'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Function to update meeting
CREATE OR REPLACE FUNCTION update_mr_meeting(
    p_meeting_id UUID,
    p_scheduled_date TIMESTAMP WITH TIME ZONE,
    p_duration_minutes INTEGER,
    p_presentation_id TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'scheduled',
    p_title TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if meeting exists
    IF NOT EXISTS (SELECT 1 FROM meetings WHERE id = p_meeting_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;

    -- Update the meeting
    UPDATE meetings 
    SET 
        title = COALESCE(p_title, title),
        scheduled_date = p_scheduled_date,
        duration_minutes = p_duration_minutes,
        notes = COALESCE(p_notes, notes),
        status = p_status::meeting_status,
        updated_at = NOW()
    WHERE id = p_meeting_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Meeting updated successfully'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_meeting_with_brochure(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION add_slide_note_to_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_details_with_notes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mr_meetings_with_notes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_mr_meeting(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_mr_meeting(UUID, TIMESTAMP WITH TIME ZONE, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Add follow-up columns to meetings table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meetings' AND column_name = 'follow_up_date') THEN
        ALTER TABLE meetings ADD COLUMN follow_up_date TIMESTAMP WITH TIME ZONE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meetings' AND column_name = 'follow_up_time') THEN
        ALTER TABLE meetings ADD COLUMN follow_up_time TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meetings' AND column_name = 'follow_up_notes') THEN
        ALTER TABLE meetings ADD COLUMN follow_up_notes TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meetings' AND column_name = 'follow_up_required') THEN
        ALTER TABLE meetings ADD COLUMN follow_up_required BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Function to update meeting follow-up
CREATE OR REPLACE FUNCTION update_meeting_followup(
    p_meeting_id UUID,
    p_follow_up_date TIMESTAMP WITH TIME ZONE,
    p_follow_up_time TEXT,
    p_follow_up_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if meeting exists
    IF NOT EXISTS (SELECT 1 FROM meetings WHERE id = p_meeting_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;

    -- Update the meeting follow-up info
    UPDATE meetings 
    SET 
        follow_up_date = p_follow_up_date,
        follow_up_time = p_follow_up_time,
        follow_up_notes = p_follow_up_notes,
        follow_up_required = TRUE,
        updated_at = NOW()
    WHERE id = p_meeting_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Follow-up updated successfully'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_slide_notes TO authenticated;
GRANT EXECUTE ON FUNCTION update_meeting_followup(UUID, TIMESTAMP WITH TIME ZONE, TEXT, TEXT) TO authenticated;
