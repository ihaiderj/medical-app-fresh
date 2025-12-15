-- ============================================
-- SERVER-SIDE CLEANUP SCRIPT
-- Removes duplicate and corrupt records from server database
-- ============================================
-- 
-- IMPORTANT: Replace 'YOUR_USER_ID' with actual user ID before running
-- Run this script in Supabase SQL Editor
--
-- ============================================

-- Set user ID (replace with actual user ID)
-- Example: SET user_id = '129b7224-2600-4023-af72-2ab7398f5e87';

-- ============================================
-- 1. DELETE CORRUPT MEETINGS (undefined/null IDs)
-- ============================================
DELETE FROM meetings 
WHERE (id IS NULL OR id = '' OR id::text = 'undefined')
  AND mr_id = 'YOUR_USER_ID';

-- ============================================
-- 2. DELETE ORPHANED MEETINGS (invalid doctor_id)
-- ============================================
DELETE FROM meetings m
WHERE m.mr_id = 'YOUR_USER_ID'
  AND m.doctor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM doctors d WHERE d.id = m.doctor_id
  );

-- ============================================
-- 3. DELETE DUPLICATE MEETINGS
-- Keep the most recent one, delete others
-- ============================================
WITH duplicate_meetings AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY doctor_id, scheduled_date, title 
      ORDER BY updated_at DESC, created_at DESC
    ) as rn
  FROM meetings
  WHERE mr_id = 'YOUR_USER_ID'
    AND id IS NOT NULL
    AND id != ''
)
DELETE FROM meetings
WHERE id IN (
  SELECT id FROM duplicate_meetings WHERE rn > 1
);

-- ============================================
-- 4. DELETE ORPHANED MEETING NOTES (invalid meeting_id)
-- ============================================
DELETE FROM meeting_slide_notes msn
WHERE EXISTS (
  SELECT 1 FROM meetings m 
  WHERE m.id = msn.meeting_id AND m.mr_id = 'YOUR_USER_ID'
)
AND NOT EXISTS (
  SELECT 1 FROM meetings m WHERE m.id = msn.meeting_id
);

-- ============================================
-- 5. DELETE ORPHANED FOLLOW-UPS (invalid meeting_id)
-- ============================================
DELETE FROM meeting_followups mf
WHERE EXISTS (
  SELECT 1 FROM meetings m 
  WHERE m.id = mf.meeting_id AND m.mr_id = 'YOUR_USER_ID'
)
AND NOT EXISTS (
  SELECT 1 FROM meetings m WHERE m.id = mf.meeting_id
);

-- ============================================
-- 6. DELETE ORPHANED SAVED BROCHURES (invalid brochure_id)
-- ============================================
DELETE FROM saved_brochures sb
WHERE sb.mr_id = 'YOUR_USER_ID'
  AND sb.brochure_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM brochures b WHERE b.id = sb.brochure_id
  );

-- ============================================
-- 7. DELETE DUPLICATE SAVED BROCHURES
-- Keep the most recent one, delete others
-- ============================================
WITH duplicate_saved_brochures AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY mr_id, brochure_id 
      ORDER BY saved_at DESC, created_at DESC
    ) as rn
  FROM saved_brochures
  WHERE mr_id = 'YOUR_USER_ID'
    AND id IS NOT NULL
    AND id != ''
)
DELETE FROM saved_brochures
WHERE id IN (
  SELECT id FROM duplicate_saved_brochures WHERE rn > 1
);

-- ============================================
-- 8. VERIFICATION QUERIES
-- Run these to verify cleanup results
-- ============================================

-- Check for remaining corrupt meetings
SELECT COUNT(*) as corrupt_meetings_count
FROM meetings
WHERE (id IS NULL OR id = '' OR id::text = 'undefined')
  AND mr_id = 'YOUR_USER_ID';

-- Check for remaining orphaned meetings
SELECT COUNT(*) as orphaned_meetings_count
FROM meetings m
WHERE m.mr_id = 'YOUR_USER_ID'
  AND m.doctor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM doctors d WHERE d.id = m.doctor_id
  );

-- Check for remaining duplicate meetings
SELECT doctor_id, scheduled_date, title, COUNT(*) as duplicate_count
FROM meetings
WHERE mr_id = 'YOUR_USER_ID'
  AND id IS NOT NULL
  AND id != ''
GROUP BY doctor_id, scheduled_date, title
HAVING COUNT(*) > 1;

-- Check for remaining orphaned notes
SELECT COUNT(*) as orphaned_notes_count
FROM meeting_slide_notes msn
WHERE EXISTS (
  SELECT 1 FROM meetings m 
  WHERE m.id = msn.meeting_id AND m.mr_id = 'YOUR_USER_ID'
)
AND NOT EXISTS (
  SELECT 1 FROM meetings m WHERE m.id = msn.meeting_id
);

-- Check for remaining orphaned follow-ups
SELECT COUNT(*) as orphaned_followups_count
FROM meeting_followups mf
WHERE EXISTS (
  SELECT 1 FROM meetings m 
  WHERE m.id = mf.meeting_id AND m.mr_id = 'YOUR_USER_ID'
)
AND NOT EXISTS (
  SELECT 1 FROM meetings m WHERE m.id = mf.meeting_id
);

-- Check for remaining orphaned saved brochures
SELECT COUNT(*) as orphaned_saved_brochures_count
FROM saved_brochures sb
WHERE sb.mr_id = 'YOUR_USER_ID'
  AND sb.brochure_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM brochures b WHERE b.id = sb.brochure_id
  );

-- ============================================
-- END OF CLEANUP SCRIPT
-- ============================================




