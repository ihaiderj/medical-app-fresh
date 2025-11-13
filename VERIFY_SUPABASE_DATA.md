# Supabase Data Verification Queries

Run these queries in your Supabase SQL Editor to verify what data exists for user `81ee18d8-6739-4a4b-a50a-bfa416e18298` (atul@gmail.com).

## 1. Check User Profile

```sql
SELECT 
  id, 
  email, 
  first_name, 
  last_name, 
  role, 
  is_active,
  created_at,
  updated_at
FROM users 
WHERE id = '81ee18d8-6739-4a4b-a50a-bfa416e18298';
```

## 2. Check Doctors Assigned to This MR

```sql
SELECT 
  d.id,
  d.first_name,
  d.last_name,
  d.email,
  d.phone,
  d.specialty,
  d.hospital,
  da.id as assignment_id,
  da.assigned_at,
  da.status as assignment_status
FROM doctors d
INNER JOIN doctor_assignments da ON d.id = da.doctor_id
WHERE da.mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
  AND da.status = 'active'
ORDER BY da.assigned_at DESC;
```

## 3. Check Meetings for This MR

```sql
SELECT 
  id,
  title,
  scheduled_date,
  status,
  doctor_id,
  brochure_id,
  location,
  notes,
  created_at,
  updated_at
FROM meetings
WHERE mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
ORDER BY scheduled_date DESC;
```

## 4. Check Assigned Brochures

```sql
-- Method 1: Using brochure_assignments (if exists)
SELECT 
  b.id,
  b.title,
  b.category,
  b.file_url,
  b.status,
  ba.assigned_at,
  ba.assigned_by
FROM brochures b
INNER JOIN brochure_assignments ba ON b.id = ba.brochure_id
WHERE ba.mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
  AND b.status = 'active'
ORDER BY ba.assigned_at DESC;

-- Method 2: Direct query (if no assignment table)
SELECT 
  id,
  title,
  category,
  description,
  file_url,
  thumbnail_url,
  status,
  assigned_by,
  created_at,
  updated_at
FROM brochures
WHERE assigned_by = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
   OR status = 'active'  -- Public brochures
ORDER BY created_at DESC;
```

## 5. Check Saved Brochures

```sql
SELECT 
  id,
  mr_id,
  brochure_id,
  brochure_title,
  custom_title,
  saved_at,
  last_accessed,
  original_brochure_data
FROM saved_brochures
WHERE mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
ORDER BY last_accessed DESC;
```

## 6. Check Doctor Assignments

```sql
SELECT 
  id,
  doctor_id,
  mr_id,
  assigned_by,
  status,
  assigned_at,
  transferred_at,
  notes
FROM doctor_assignments
WHERE mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
ORDER BY assigned_at DESC;
```

## 7. Check MR Permissions

```sql
SELECT 
  id,
  mr_id,
  permission_type,
  is_granted,
  granted_by,
  granted_at
FROM mr_permissions
WHERE mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298';
```

## 8. Check Activity Logs

```sql
SELECT 
  id,
  user_id,
  activity_type,
  description,
  metadata,
  brochure_id,
  created_at
FROM activity_logs
WHERE user_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
ORDER BY created_at DESC
LIMIT 50;
```

## 9. Check Meeting Slide Notes

```sql
SELECT 
  msn.id,
  msn.meeting_id,
  msn.slide_id,
  msn.slide_title,
  msn.note_text,
  m.mr_id,
  m.title as meeting_title
FROM meeting_slide_notes msn
INNER JOIN meetings m ON msn.meeting_id = m.id
WHERE m.mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
ORDER BY msn.created_at DESC;
```

## 10. Summary Query - All Data Counts

```sql
SELECT 
  'Users' as table_name,
  COUNT(*) as count
FROM users
WHERE id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'

UNION ALL

SELECT 
  'Doctors (Assigned)' as table_name,
  COUNT(DISTINCT da.doctor_id) as count
FROM doctor_assignments da
WHERE da.mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'
  AND da.status = 'active'

UNION ALL

SELECT 
  'Meetings' as table_name,
  COUNT(*) as count
FROM meetings
WHERE mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'

UNION ALL

SELECT 
  'Saved Brochures' as table_name,
  COUNT(*) as count
FROM saved_brochures
WHERE mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'

UNION ALL

SELECT 
  'MR Permissions' as table_name,
  COUNT(*) as count
FROM mr_permissions
WHERE mr_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298'

UNION ALL

SELECT 
  'Activity Logs' as table_name,
  COUNT(*) as count
FROM activity_logs
WHERE user_id = '81ee18d8-6739-4a4b-a50a-bfa416e18298';
```

## Notes

- Replace `'81ee18d8-6739-4a4b-a50a-bfa416e18298'` with the actual user ID if needed
- Check the table names match your Supabase schema exactly
- Some queries assume certain tables/columns exist - adjust if your schema is different

