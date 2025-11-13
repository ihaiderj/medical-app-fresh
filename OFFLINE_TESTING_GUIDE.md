# Offline Testing Guide

## Problem
When you disconnect the emulator from the internet, it loses connection to the Expo dev server, so the app can't run.

## Solution: Build a Standalone APK

### Option 1: Build APK with EAS Build (Recommended)

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g eas-cli
   ```

2. **Login to EAS**:
   ```bash
   eas login
   ```

3. **Configure EAS** (if not already done):
   ```bash
   eas build:configure
   ```

4. **Build APK for Android**:
   ```bash
   eas build --platform android --profile development
   ```
   
   Or for a production build:
   ```bash
   eas build --platform android --profile production
   ```

5. **Download and Install APK**:
   - After build completes, download the APK
   - Install it on your emulator: `adb install path/to/app.apk`
   - Now you can disconnect internet and test offline!

### Option 2: Build APK Locally (Faster for Testing)

1. **Install Android Build Tools**:
   - Make sure you have Android Studio installed
   - Set up Android SDK

2. **Build APK**:
   ```bash
   npx expo prebuild
   cd android
   ./gradlew assembleDebug
   ```

3. **Find APK**:
   - APK will be at: `android/app/build/outputs/apk/debug/app-debug.apk`

4. **Install on Emulator**:
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

### Option 3: Use Airplane Mode (Quick Test)

1. **Keep Dev Server Running** (on your computer)
2. **Enable Airplane Mode on Emulator**:
   - Open emulator settings
   - Enable Airplane Mode
   - This blocks internet but keeps localhost connection to dev server

3. **Test Offline Functionality**:
   - App should still connect to dev server (localhost)
   - But `NetworkService.isOnline()` will return `false`
   - This simulates offline mode

## Verification Steps

Based on your logs, the app IS storing data locally. Here's how to verify:

### 1. Check Local Database Storage

After sync completes, you should see:
```
✅ BROCHURES VERIFICATION: {
  "availableBrochures": { "count": 1, ... },
  "savedBrochures": { "count": 1, ... },
  "brochureSyncEntries": { "count": 1, ... },
  "brochuresTableEntries": { "count": 1, ... }
}
```

### 2. Test Offline Access

Once you have a standalone APK installed:

1. **Login while online** (to sync data)
2. **Disconnect internet** (or enable airplane mode)
3. **Test these features**:
   - ✅ View dashboard (should show stats from local DB)
   - ✅ View "My Doctors" (should show doctors from local DB)
   - ✅ View "My Brochures" (should show brochures from local DB)
   - ✅ View saved brochures (should open instantly from local DB)
   - ✅ Create new doctor (should save locally, show in sync queue)
   - ✅ Create new meeting (should save locally, show in sync queue)
   - ✅ View activity logs (should show from local DB)

### 3. Test Sync Queue

1. **While offline**, create a new doctor or meeting
2. **Check sync status** - should show "X pending" in sync indicator
3. **Reconnect internet**
4. **Sync should automatically run** (or manually trigger)
5. **Verify data appears on server**

## Current Status

Based on your logs, the app is **already working correctly**:

✅ **Data is being stored locally**:
- 1 available brochure in `brochures` table
- 1 saved brochure in `saved_brochures` table
- 1 brochure sync entry in `brochure_sync` table

✅ **Sync is working**:
- Brochures are saved to both `brochure_sync` and `brochures` tables
- Saved brochures are synced from server
- All data is stored in local SQLite database

## Quick Test Without Building APK

If you want to quickly test offline behavior:

1. **Keep dev server running** on your computer
2. **Enable airplane mode** on emulator
3. **The app will still work** because it connects to localhost
4. **But `NetworkService.isOnline()` will return `false`**
5. **This simulates offline mode** for testing

## Expected Offline Behavior

When offline, the app should:

- ✅ **Load data from local DB** (doctors, meetings, brochures)
- ✅ **Show dashboard stats** from local DB
- ✅ **Allow creating/editing** (saves locally, queues for sync)
- ✅ **Show sync queue status** ("X pending" indicator)
- ✅ **Open saved brochures instantly** (from local files)
- ✅ **Auto-sync when back online** (if configured)

## Troubleshooting

If offline doesn't work:

1. **Check local database**:
   ```javascript
   // Add this to a test screen
   const verification = await LocalDatabaseService.verifyBrochureStorage(userId);
   console.log('Verification:', verification);
   ```

2. **Check network status**:
   ```javascript
   const isOnline = await NetworkService.isOnline();
   console.log('Is online:', isOnline);
   ```

3. **Check sync queue**:
   ```javascript
   const pending = await LocalDatabaseService.getPendingSyncOperations(userId);
   console.log('Pending sync operations:', pending.length);
   ```



