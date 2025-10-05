-- Meeting Notes System
-- Integrated meeting and slide notes functionality

-- Create meeting_slide_notes table for slide-specific notes
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

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_meeting_slide_notes_meeting_id ON meeting_slide_notes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_slide_notes_slide_id ON meeting_slide_notes(slide_id);
CREATE INDEX IF NOT EXISTS idx_meeting_slide_notes_brochure_id ON meeting_slide_notes(brochure_id);

-- Function to create a new meeting
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
    -- Validate MR user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_mr_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MR user not found'
        );
    END IF;

    -- Validate doctor exists and is assigned to this MR
    IF NOT EXISTS (
        SELECT 1 FROM doctors d 
        JOIN doctor_assignments da ON d.id = da.doctor_id 
        WHERE d.id = p_doctor_id AND da.mr_id = p_mr_id AND da.status = 'active'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Doctor not found or not assigned to this MR'
        );
    END IF;

    -- Create new meeting
    INSERT INTO meetings (
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
        p_mr_id,
        p_doctor_id,
        p_title,
        p_scheduled_date,
        p_duration_minutes,
        'active',
        p_purpose,
        jsonb_build_object('brochure_id', p_brochure_id, 'brochure_title', p_brochure_title),
        NOW(),
        NOW()
    )
    RETURNING id INTO new_meeting_id;

    RETURN jsonb_build_object(
        'success', true,
        'meeting_id', new_meeting_id,
        'message', 'Meeting created successfully'
    );
END;
$$;

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
END;
$$;

-- Function to get all meetings for MR with note counts
CREATE OR REPLACE FUNCTION get_mr_meetings_with_notes(
    p_mr_id UUID
)
RETURNS TABLE (
    meeting_id UUID,
    title TEXT,
    doctor_name TEXT,
    doctor_specialty TEXT,
    hospital TEXT,
    scheduled_date TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    status TEXT,
    purpose TEXT,
    brochure_title TEXT,
    notes_count BIGINT,
    last_note_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id as meeting_id,
        m.title,
        CONCAT(d.first_name, ' ', d.last_name) as doctor_name,
        d.specialty as doctor_specialty,
        d.hospital,
        m.scheduled_date,
        m.duration_minutes,
        m.status,
        m.notes as purpose,
        COALESCE(m.presentation_slides->>'brochure_title', 'No Brochure') as brochure_title,
        COALESCE(note_stats.notes_count, 0) as notes_count,
        note_stats.last_note_date,
        m.created_at,
        m.updated_at
    FROM meetings m
    JOIN doctors d ON m.doctor_id = d.id
    LEFT JOIN (
        SELECT 
            meeting_id,
            COUNT(*) as notes_count,
            MAX(updated_at) as last_note_date
        FROM meeting_slide_notes
        GROUP BY meeting_id
    ) note_stats ON m.id = note_stats.meeting_id
    WHERE m.mr_id = p_mr_id
    ORDER BY COALESCE(note_stats.last_note_date, m.updated_at) DESC;
END;
$$;

-- Add unique constraint to prevent duplicate slide notes per meeting
ALTER TABLE meeting_slide_notes 
ADD CONSTRAINT unique_meeting_slide_note 
UNIQUE (meeting_id, slide_id);

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION create_meeting_with_brochure(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMP WITH TIME ZONE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION add_slide_note_to_meeting(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_details_with_notes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mr_meetings_with_notes(UUID) TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_slide_notes TO authenticated;

