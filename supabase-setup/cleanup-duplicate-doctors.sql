-- Cleanup Duplicate Doctors Script
-- This script removes all duplicate doctors and keeps only the first occurrence

-- Step 1: Create a temporary table with unique doctors
CREATE TEMP TABLE temp_unique_doctors AS
SELECT DISTINCT ON (LOWER(first_name), LOWER(last_name), LOWER(hospital))
  id,
  mr_id,
  first_name,
  last_name,
  specialty,
  hospital,
  phone,
  email,
  location,
  created_at,
  updated_at
FROM local_doctors
WHERE is_deleted = false
ORDER BY LOWER(first_name), LOWER(last_name), LOWER(hospital), created_at ASC;

-- Step 2: Delete all doctors from local_doctors table
DELETE FROM local_doctors;

-- Step 3: Insert unique doctors back
INSERT INTO local_doctors (
  id,
  mr_id,
  first_name,
  last_name,
  specialty,
  hospital,
  phone,
  email,
  location,
  created_at,
  updated_at,
  is_deleted,
  sync_status,
  server_id,
  local_changes,
  last_modified,
  version
)
SELECT 
  id,
  mr_id,
  first_name,
  last_name,
  specialty,
  hospital,
  phone,
  email,
  location,
  created_at,
  updated_at,
  false,
  'pending',
  null,
  null,
  null,
  1
FROM temp_unique_doctors;

-- Step 4: Clean up temporary table
DROP TABLE temp_unique_doctors;

-- Step 5: Show final count
SELECT COUNT(*) as total_doctors FROM local_doctors WHERE is_deleted = false;
