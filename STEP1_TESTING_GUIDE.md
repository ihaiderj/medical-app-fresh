# Step 1 Testing Guide

This guide will help you test all Step 1 functionality before moving to Step 2.

## Prerequisites

1. **Ensure you're logged in as an MR user**
2. **Have network connectivity** (for sync up/down tests)
3. **Check console logs** - All sync operations have comprehensive debug logging

## Testing Checklist

### ✅ Test 1: Queueing Operations (Local)

Test that all operations are correctly queued when performed locally.

#### 1.1 Doctors CRUD Queueing
- [ ] **Add Doctor**: Go to Doctors screen → Add a new doctor
  - **Expected**: Check logs for `🔄 SYNC QUEUE DEBUG: Adding to sync queue - Operation: create Table: doctors`
  - **Verify**: Dashboard sync button should show pending count increment
  
- [ ] **Edit Doctor**: Edit an existing doctor's details
  - **Expected**: Logs show `Operation: update Table: doctors`
  - **Verify**: Pending count increases
  
- [ ] **Delete Doctor**: Delete a doctor
  - **Expected**: Logs show `Operation: delete Table: doctors`
  - **Verify**: Pending count increases

#### 1.2 Meetings CRUD Queueing
- [ ] **Add Meeting**: Create a new meeting
  - **Expected**: Logs show `Operation: create Table: meetings`
  
- [ ] **Edit Meeting**: Update meeting details
  - **Expected**: Logs show `Operation: update Table: meetings`
  
- [ ] **Delete Meeting**: Delete a meeting
  - **Expected**: Logs show `Operation: delete Table: meetings`

#### 1.3 Meeting Notes Queueing
- [ ] **Add Note**: Add a note to a slide in a meeting
  - **Expected**: Logs show `Operation: create Table: meeting_notes`
  
- [ ] **Edit Note**: Edit an existing note
  - **Expected**: Logs show `Operation: update Table: meeting_notes`
  
- [ ] **Delete Note**: Delete a note
  - **Expected**: Logs show `Operation: delete Table: meeting_notes`

#### 1.4 Meeting Follow-ups Queueing
- [ ] **Add Follow-up**: Add a follow-up to a meeting
  - **Expected**: Logs show `Operation: create Table: meeting_followups`
  
- [ ] **Edit Follow-up**: Edit a follow-up
  - **Expected**: Logs show `Operation: update Table: meeting_followups`
  
- [ ] **Delete Follow-up**: Delete a follow-up
  - **Expected**: Logs show `Operation: delete Table: meeting_followups`

#### 1.5 Brochure Modifications Queueing
- [ ] **Add Slide**: Open a brochure → Add a new slide
  - **Expected**: Logs show `🔵 BROCHURE_SYNC: Added brochure changes to sync queue`
  - **Expected**: Logs show `🔄 LocalDB: Adding brochure to sync queue`
  - **Verify**: Pending count on dashboard increases
  
- [ ] **Rename Slide**: Rename a slide title
  - **Expected**: Brochure sync record updated and queued
  
- [ ] **Delete Slide**: Delete a slide
  - **Expected**: Brochure sync record updated and queued
  
- [ ] **Create Group**: Create a slide group
  - **Expected**: Brochure sync record updated and queued
  
- [ ] **Rename Brochure**: Change brochure custom title
  - **Expected**: Logs show `Operation: update Table: saved_brochures`

#### 1.6 Activity Logs Queueing
- [ ] **View Brochure**: Open a brochure
  - **Expected**: Logs show `Operation: create Table: activity_logs`
  - **Verify**: Activity appears in dashboard

### ✅ Test 2: Sync Up (Upload to Server)

Test that queued operations are successfully uploaded to the server.

#### 2.1 Manual Sync Button
- [ ] **Click Sync Button**: On MR Dashboard, click the sync button (cloud upload icon)
  - **Expected**: Progress indicator shows "Syncing: Processing sync queue..."
  - **Expected**: Logs show `🔄 SYNC UP: Starting sync up process...`
  - **Expected**: Logs show `🔄 SYNC UP: Processing operation...` for each queued item
  - **Expected**: Success message shows "Synced: X, Failed: Y"
  - **Verify**: Pending count on dashboard decreases to 0 (if all successful)

#### 2.2 Individual Entity Sync
- [ ] **Doctors Sync**: After queuing doctor operations, click sync
  - **Expected**: Logs show `🔄 SYNC DOCTOR: create/update/delete`
  - **Expected**: Logs show `✅ SYNC UP: Successfully synced operation`
  - **Verify**: Doctor appears/updates on server (check Supabase dashboard)
  
- [ ] **Meetings Sync**: After queuing meeting operations, click sync
  - **Expected**: Logs show `🔄 SYNC MEETING: create/update/delete`
  - **Verify**: Meeting appears/updates on server
  
- [ ] **Notes Sync**: After queuing note operations, click sync
  - **Expected**: Logs show `🔄 SYNC NOTE: create/update/delete`
  - **Verify**: Notes appear/update on server
  
- [ ] **Follow-ups Sync**: After queuing follow-up operations, click sync
  - **Expected**: Logs show `🔄 SYNC FOLLOW-UP: create/update/delete`
  - **Verify**: Follow-ups appear/update on server
  
- [ ] **Brochure Changes Sync**: After queuing brochure modifications, click sync
  - **Expected**: Logs show `🔄 SYNC BROCHURE CHANGES: create/update`
  - **Expected**: Logs show `🔄 SYNC BROCHURE CHANGES: Uploading slide image...`
  - **Expected**: Logs show `🔄 SYNC BROCHURE CHANGES: Uploading brochure_data.json...`
  - **Expected**: Logs show `✅ SYNC BROCHURE CHANGES: Successfully synced brochure`
  - **Verify**: Files uploaded to Supabase Storage
  - **Verify**: Brochure sync data saved to server

#### 2.3 Error Handling
- [ ] **Network Error**: Turn off network, queue operations, try to sync
  - **Expected**: Logs show `❌ SYNC UP: Failed to sync operation`
  - **Expected**: Operations marked as failed with error message
  - **Expected**: Failed count increases
  - **Verify**: Operations remain in queue for retry

- [ ] **Auth Error**: Logout, then try to sync (if possible)
  - **Expected**: Error message about authentication
  - **Expected**: Operations remain in queue

### ✅ Test 3: Sync Down (Download from Server)

Test that data is correctly downloaded from server to local DB.

#### 3.1 Initial Sync on Login
- [ ] **Fresh Install Simulation**: 
  - Clear app data or use a different device
  - Login as MR user
  - **Expected**: `SyncService.syncDown()` should be called (if implemented in login flow)
  - **Expected**: Logs show `⬇️ SYNC DOWN: Starting sync down process...`
  - **Expected**: Logs show `⬇️ SYNC DOWN: Downloading doctors...`
  - **Expected**: Logs show `⬇️ SYNC DOWN: Downloading meetings...`
  - **Expected**: Logs show `⬇️ SYNC DOWN: Downloading saved brochures...`
  - **Expected**: Logs show `⬇️ SYNC DOWN: Downloading brochure sync data...`
  - **Verify**: All data appears in local screens

#### 3.2 Manual Sync Down (if implemented)
- [ ] **Pull from Server**: If there's a "Refresh from Server" button
  - **Expected**: All server data downloaded to local DB
  - **Verify**: Local screens show server data

### ✅ Test 4: Brochure File Uploads

Test that brochure files are correctly uploaded to Supabase Storage.

#### 4.1 Slide Image Upload
- [ ] **Add Slide with Image**: Add a new slide with an image
  - **Expected**: Logs show `🔄 SYNC BROCHURE CHANGES: Uploading slide image...`
  - **Expected**: Logs show `✅ SYNC BROCHURE CHANGES: Slide image uploaded successfully`
  - **Verify**: Image appears in Supabase Storage at path: `{mrId}/{brochureId}/slides/{slideId}.jpg`

#### 4.2 Brochure Data JSON Upload
- [ ] **Sync Brochure Changes**: After modifying brochure, sync
  - **Expected**: Logs show `🔄 SYNC BROCHURE CHANGES: Uploading brochure_data.json...`
  - **Expected**: Logs show `✅ SYNC BROCHURE CHANGES: brochure_data.json uploaded successfully`
  - **Verify**: JSON file appears in Supabase Storage

#### 4.3 Auth Session Handling
- [ ] **Session Refresh**: If session expires during upload
  - **Expected**: Logs show session refresh attempts
  - **Expected**: Upload continues after refresh
  - **Verify**: Files uploaded successfully

### ✅ Test 5: Deduplication Logic

Test that duplicate queue entries are prevented.

#### 5.1 Rapid Updates
- [ ] **Multiple Rapid Edits**: Edit the same doctor 3 times quickly
  - **Expected**: Only one update operation in queue (deduplication)
  - **Expected**: Logs show `🔄 SYNC QUEUE DEBUG: Found existing pending update operation, updating with latest data`
  
- [ ] **Create then Update**: Create a doctor, then immediately update it
  - **Expected**: Only create operation in queue (update merged into create)
  - **Expected**: Logs show `🔄 SYNC QUEUE DEBUG: Found existing pending create operation, updating its data`

#### 5.2 Brochure Sync Deduplication
- [ ] **Multiple Slide Changes**: Add/rename/delete multiple slides quickly
  - **Expected**: Only one brochure_sync update in queue
  - **Expected**: Latest changes are preserved

### ✅ Test 6: Queue Status Display

Test that queue status is correctly displayed.

#### 6.1 Pending Count Badge
- [ ] **Check Badge**: On dashboard, verify pending count badge appears
  - **Expected**: Badge shows correct number of pending operations
  - **Expected**: Badge updates after operations are queued
  - **Expected**: Badge disappears when queue is empty

#### 6.2 Sync Progress Indicator
- [ ] **During Sync**: Click sync button, watch progress
  - **Expected**: Progress indicator shows current step
  - **Expected**: Progress bar updates
  - **Expected**: Success/error message displayed

### ✅ Test 7: Error Recovery

Test that failed operations can be retried.

#### 7.1 Retry Failed Operations
- [ ] **Fix Network**: After network error, fix network and sync again
  - **Expected**: Previously failed operations are retried
  - **Expected**: Operations succeed on retry
  - **Verify**: Failed count decreases

#### 7.2 Error Messages
- [ ] **Check Error Details**: View failed operations
  - **Expected**: Error messages are descriptive
  - **Expected**: Error messages help identify the issue

## Testing Tools

### Console Log Patterns to Watch For

**Queueing:**
- `🔄 SYNC QUEUE DEBUG: Adding to sync queue`
- `✅ SYNC QUEUE DEBUG: Successfully added to SQLite sync queue`

**Sync Up:**
- `🔄 SYNC UP: Starting sync up process...`
- `🔄 SYNC UP: Processing operation`
- `✅ SYNC UP: Successfully synced operation`
- `❌ SYNC UP: Failed to sync operation`

**Sync Down:**
- `⬇️ SYNC DOWN: Starting sync down process...`
- `⬇️ SYNC DOWN: Downloading...`
- `✅ SYNC DOWN: Downloaded X items`

**Brochure Sync:**
- `🔵 BROCHURE_SYNC: Added brochure changes to sync queue`
- `🔄 SYNC BROCHURE CHANGES: Processing X slides, Y groups`
- `🔄 SYNC BROCHURE CHANGES: Uploading slide image...`
- `✅ SYNC BROCHURE CHANGES: Successfully synced brochure`

### Manual Verification Steps

1. **Check Supabase Dashboard**:
   - Go to Supabase → Table Editor
   - Verify data appears in: `mr_doctor_assignments`, `meetings`, `meeting_notes`, `meeting_followups`, `saved_brochures`, `brochure_sync`

2. **Check Supabase Storage**:
   - Go to Supabase → Storage → `brochures` bucket
   - Verify files uploaded at: `{mrId}/{brochureId}/slides/` and `{mrId}/{brochureId}/brochure_data.json`

3. **Check Local Database**:
   - Use a SQLite browser or check logs
   - Verify `sync_operations` table has correct entries
   - Verify operations marked as 'completed' after successful sync

## Common Issues & Solutions

### Issue: Queue count not incrementing
- **Check**: Are operations calling `addToSyncQueue()`?
- **Check**: Are logs showing queue additions?
- **Solution**: Verify `LocalDatabaseService.addToSyncQueue()` is being called

### Issue: Sync button does nothing
- **Check**: Is `SyncService.syncUp()` being called?
- **Check**: Are there any errors in console?
- **Solution**: Verify sync button handler is updated

### Issue: Brochure files not uploading
- **Check**: Is user authenticated? (Check session)
- **Check**: Are file paths correct?
- **Check**: Is Supabase Storage bucket configured correctly?
- **Solution**: Verify `FileStorageService.uploadFile()` is working

### Issue: Operations stuck in queue
- **Check**: Are there network errors?
- **Check**: Are RPC calls failing?
- **Check**: Are error messages descriptive?
- **Solution**: Check Supabase RPC functions are deployed correctly

## Success Criteria

✅ **Step 1 is complete when:**
1. All CRUD operations queue correctly
2. Sync button successfully processes queue
3. Operations are uploaded to server
4. Brochure files are uploaded to Supabase Storage
5. Error handling works correctly
6. Queue status displays correctly
7. Deduplication prevents duplicate entries

## Next Steps After Testing

Once all tests pass:
- ✅ Move to Step 2: Add missing RPC wrappers (if any)
- ✅ Move to Step 3: Fix LocalDatabaseService sync operation methods
- ✅ Move to Step 4: Fix brochure queueing in BrochureManagementService
- ✅ Move to Step 5: Update screens to use new SyncService

## Notes

- **Network Required**: Most tests require network connectivity
- **Supabase Access**: You'll need access to Supabase dashboard for verification
- **Logs are Key**: All operations have comprehensive logging - watch the console!
- **Test Incrementally**: Test one entity type at a time for easier debugging

