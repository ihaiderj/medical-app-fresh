# Sync Verification Guide

## Overview
The Sync Verification Service helps you verify what data was successfully synced to the server. This is crucial for debugging sync issues and ensuring data consistency across devices.

## How to Use

### Method 1: Automatic Verification (After Sync)
When you click the sync button on the dashboard, verification runs automatically after sync completes. Check the console logs for detailed results.

### Method 2: Manual Verification (Long Press Sync Button)
1. Go to Dashboard
2. **Long press** the sync button (cloud upload icon)
3. Confirm verification in the alert dialog
4. Check console logs for detailed results
5. An alert will show a summary

### Method 3: Programmatic Verification
```typescript
import { SyncVerificationService } from '../services/syncVerificationService';
import { AuthService } from '../services/AuthService';

const verifySync = async () => {
  const user = await AuthService.getCurrentUser();
  if (user.success && user.user) {
    const result = await SyncVerificationService.verifySyncStatus(user.user.id);
    console.log(result.summary);
    
    // Print detailed logs
    SyncVerificationService.printSyncLogs();
  }
};
```

## What Gets Verified

The service verifies:
1. **Doctors** - Local count vs Server count vs Synced logs
2. **Meetings** - Local count vs Server count vs Synced logs (also checks for undefined IDs)
3. **Meeting Follow-ups** - Local count vs Server count vs Synced logs
4. **Meeting Notes** - Local count vs Server count vs Synced logs
5. **Saved Brochures** - Local count vs Server count vs Synced logs
6. **Activity Logs** - Local count (typically don't sync to server)

## Understanding the Results

### Console Output
```
🔍 ========== SYNC VERIFICATION START ==========
User ID: 129b7224-2600-4023-af72-2ab7398f5e87

🔍 Verifying Doctors...
  Local: 1, Server: 1, Synced: 1, Queued: 0
🔍 Verifying Meetings...
  Local: 2, Server: 1, Synced: 1, Queued: 0
...

📊 ========== SYNC VERIFICATION SUMMARY ==========

DOCTORS:
  Local: 1
  Server: 1
  Synced to Server (logs): 1
  Queued: 0
  ✅ All synced correctly

MEETINGS:
  Local: 2
  Server: 1
  Synced to Server (logs): 1
  Queued: 0
  ⚠️ DISCREPANCIES:
    - Synced logs (1) != Server count (1)
    - 1 meetings on server have undefined IDs
```

### Discrepancy Types

1. **Synced logs != Server count**
   - Meaning: The sync debug logs say X items were synced, but server only has Y items
   - Possible causes:
     - Sync failed silently
     - Server rejected the data
     - Data was deleted after sync
     - Race condition in sync

2. **Queued > 0**
   - Meaning: Items are still in the sync queue
   - Action: Click sync button to upload pending changes

3. **Meetings with undefined IDs**
   - Meaning: Server returned meetings without IDs
   - Impact: Notes and follow-ups can't sync (they need meeting IDs)
   - Action: Check server database schema

4. **Local != Server**
   - Meaning: Different counts locally vs on server
   - Possible causes:
     - Not all local changes synced yet
     - Server has data from another device
     - Data was deleted on one side

## Manual SQL Verification

For deeper investigation, run these queries in Supabase SQL Editor:

```sql
-- Replace with your user ID
SET @user_id = '129b7224-2600-4023-af72-2ab7398f5e87';

-- 1. Check meetings on server
SELECT id, title, scheduled_date, status, doctor_id, mr_id
FROM meetings
WHERE mr_id = @user_id
ORDER BY created_at DESC;

-- 2. Check meeting follow-ups
SELECT mf.id, mf.meeting_id, mf.follow_up_date, mf.follow_up_time, m.title as meeting_title
FROM meeting_followups mf
INNER JOIN meetings m ON mf.meeting_id = m.id
WHERE m.mr_id = @user_id
ORDER BY mf.created_at DESC;

-- 3. Check meeting notes
SELECT msn.id, msn.meeting_id, msn.slide_id, msn.note_text, m.title as meeting_title
FROM meeting_slide_notes msn
INNER JOIN meetings m ON msn.meeting_id = m.id
WHERE m.mr_id = @user_id
ORDER BY msn.created_at DESC;

-- 4. Check saved brochures
SELECT id, brochure_id, custom_title, brochure_title, saved_at
FROM saved_brochures
WHERE mr_id = @user_id
ORDER BY saved_at DESC;

-- 5. Check doctors
SELECT d.id, d.first_name, d.last_name, da.mr_id
FROM doctors d
INNER JOIN doctor_assignments da ON d.id = da.doctor_id
WHERE da.mr_id = @user_id AND da.status = 'active';
```

## Troubleshooting

### If verification shows discrepancies:

1. **Check sync logs** - Look for errors during sync
2. **Check server logs** - Look for rejected operations
3. **Verify server schema** - Ensure tables and columns exist
4. **Check network** - Ensure device was online during sync
5. **Re-sync** - Try syncing again to catch any missed items

### Common Issues:

- **"Synced logs (5) != Server count (3)"**
  - Some items failed to sync
  - Check sync logs for error messages
  - Items may still be in queue

- **"Meetings with undefined IDs"**
  - Server RPC function returning wrong format
  - Check `get_mr_meetings_with_notes` function
  - Ensure it returns `id` field

- **"Queued > 0"**
  - Items waiting to sync
  - Click sync button to upload
  - Check for dependency issues (e.g., meeting needs doctor first)

## Best Practices

1. **Verify after every sync** - Especially after making important changes
2. **Check logs before switching devices** - Ensure data synced successfully
3. **Use SQL queries for deep debugging** - When console logs aren't enough
4. **Compare local vs server** - Understand what's different and why





