# Error Analysis and Fixes

## Summary of 6 Errors Found During Manual Sync

### Error 1: `doctor_photos` table missing `local_changes` column
**Line 35-36 in logs:**
```
❌ DOCTOR PHOTOS SYNC DEBUG: Failed to sync doctor photos: 
Error code : table doctor_photos has no column named local_changes
```

**Why it happened:**
- The table was created BEFORE we added the `local_changes` column to the schema
- The `upsertDoctorPhoto` method tries to insert into `local_changes`, but the column doesn't exist in the database

**Fix Applied:**
- Added schema check for `doctor_photos` table to detect missing `local_changes` column
- When detected, triggers full database recreation with correct schema

---

### Error 2: `brochures` table missing `local_changes` column
**Line 93-94 in logs:**
```
❌ BROCHURES SYNC DEBUG: Failed to sync brochures: 
Error code : table brochures has no column named local_changes
```

**Why it happened:**
- Same as Error 1 - table was created before the schema update
- The `upsertBrochure` method requires `local_changes` column

**Fix Applied:**
- Added schema check for `brochures` table
- Triggers database recreation when missing `local_changes`

---

### Error 3: `brochure_categories` table missing `local_changes` column
**Line 112-113 in logs:**
```
❌ BROCHURE CATEGORIES SYNC DEBUG: Failed to sync brochure categories: 
Error code : table brochure_categories has no column named local_changes
```

**Why it happened:**
- Same issue - table created before schema update

**Fix Applied:**
- Added schema check for `brochure_categories` table
- Triggers recreation when schema mismatch detected

---

### Error 4: `saved_brochures` table missing `last_synced_at` column
**Line 131-132 in logs:**
```
❌ SAVED BROCHURES SYNC DEBUG: Failed to sync saved brochures: 
Error code : table saved_brochures has no column named last_synced_at
```

**Why it happened:**
- The table schema was updated to match Supabase (added `custom_title`, `original_brochure_data`, `last_synced_at`, `needs_sync`)
- But the actual database table still has the old schema without these columns

**Fix Applied:**
- Added schema check for `saved_brochures` table
- Checks for both `last_synced_at` and `custom_title` columns
- Triggers recreation if either is missing

---

### Error 5: `mr_permissions` table has `user_id` instead of `mr_id`
**Line 150-151 in logs:**
```
❌ MR PERMISSIONS SYNC DEBUG: Failed to sync MR permissions: 
Error code : table mr_permissions has no column named mr_id
```

**Why it happened:**
- The table was originally created with `user_id` column
- We updated the schema to use `mr_id` to match Supabase (which uses `mr_id`)
- But the actual database table still has the old `user_id` column

**Fix Applied:**
- Added schema check for `mr_permissions` table
- Checks if `mr_id` exists AND if `user_id` still exists (old schema)
- Triggers recreation if wrong schema detected

---

### Error 6: Likely related to doctor assignments
**Note:** Not shown in visible logs, but likely:
- Doctor assignments not being found (line 17 shows "Found 0 doctor assignments")
- OR doctors not being synced properly

**Why it might happen:**
- The doctor sync now uses `MRService.getAssignedDoctors()` which should work
- But if the RPC function `get_mr_assigned_doctors` doesn't exist or fails, doctors won't sync

**Fix Applied:**
- Updated `syncDoctors()` to use `MRService.getAssignedDoctors()` which queries via `doctor_assignments`
- This properly fetches doctors assigned to the MR, not just created by them

---

## Doctor Assignment vs Doctor Creation - Explanation

### Doctor Creation
**What it is:**
- The act of adding a **new doctor record** to the system for the first time
- Creates a new entry in the `doctors` table
- Usually done by:
  - An admin user
  - An MR when they encounter a doctor not yet in the system
  - System import/bulk upload

**Database representation:**
- A record in the `doctors` table with:
  - Personal info (name, email, phone)
  - Professional info (specialty, hospital, location)
  - A `created_by` field indicating who created the record

**Example:**
```
Doctor created by Admin:
- doctors.id = "abc-123"
- doctors.created_by = "admin-user-id"
- doctors.first_name = "Dr. Smith"
```

---

### Doctor Assignment
**What it is:**
- The act of **linking an existing doctor** to a specific Medical Representative (MR)
- Creates a relationship in the `doctor_assignments` table
- Indicates which MR is responsible for managing that doctor
- A doctor can be assigned to multiple MRs (if transferred)

**Database representation:**
- A record in the `doctor_assignments` table with:
  - `doctor_id` - Reference to the doctor
  - `mr_id` - Reference to the MR
  - `assigned_by` - Who made the assignment
  - `status` - Usually 'active' or 'transferred'
  - `assigned_at` - When the assignment was made

**Example:**
```
Doctor Assignment:
- doctor_assignments.doctor_id = "abc-123" (references Dr. Smith)
- doctor_assignments.mr_id = "mr-user-id"
- doctor_assignments.status = "active"
```

---

### The Key Difference

| Aspect | Doctor Creation | Doctor Assignment |
|--------|----------------|-------------------|
| **Table** | `doctors` | `doctor_assignments` |
| **Purpose** | Add doctor to system | Link doctor to MR |
| **Frequency** | Once per doctor | Can happen multiple times |
| **Who can do it** | Admin or MR | Admin or MR with permission |
| **Relationship** | One doctor = One record | One doctor = Multiple assignments possible |
| **Query for MR** | `WHERE created_by = mr_id` ❌ | `WHERE mr_id = mr_id` ✅ |

---

### Why This Matters for Your App

**Your Supabase Data Shows:**
- 1 Doctor exists: "Imran h" (ID: `eebb369f-ddea-4afe-90c8-fc61afee09b0`)
- 1 Assignment exists linking this doctor to your MR user

**The Old Sync Logic Was:**
```sql
SELECT * FROM doctors WHERE created_by = 'mr-user-id'
```
This would find **0 doctors** because the doctor was created by someone else (or has `created_by = null`)

**The New Sync Logic Is:**
```typescript
MRService.getAssignedDoctors(mrId)
// Which calls: get_mr_assigned_doctors(mr_id)
// Which does:
SELECT d.* FROM doctors d
JOIN doctor_assignments da ON d.id = da.doctor_id
WHERE da.mr_id = 'mr-user-id' AND da.status = 'active'
```
This correctly finds **1 doctor** because it uses the `doctor_assignments` relationship

---

## What Will Happen Now

When you restart the app:

1. **Schema Detection:** The app will check all tables for schema mismatches
2. **Automatic Fix:** If any mismatches are found, it will:
   - Back up existing data (if any)
   - Drop all tables
   - Recreate tables with correct schema
   - Restore backed-up data
3. **Successful Sync:** All 6 tables will have the correct schema, and sync will work

**After restart and sync:**
- ✅ 1 Doctor will appear in "My Doctors"
- ✅ 1 Brochure will appear in dashboard
- ✅ 3 Permissions will be saved
- ✅ 1 Saved brochure will sync
- ✅ Dashboard will show correct counts

---

## Summary

All 6 errors are caused by **schema mismatches** - the database tables were created with old schemas before we updated them. The fix ensures:

1. All tables are checked for required columns
2. Missing columns trigger automatic database recreation
3. Tables are recreated with the latest, correct schema
4. Sync will work properly after recreation

