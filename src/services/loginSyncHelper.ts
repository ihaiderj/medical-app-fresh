/**
 * Login Sync Helper
 * Helper functions to determine if comprehensive sync should be performed on login
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalDatabaseService } from './localDatabaseService';
import { supabase } from './supabase';

export interface SyncDecision {
  shouldSync: boolean;
  reason: 'empty' | 'outdated' | 'up-to-date';
}

/**
 * Check if local DB is empty for a user
 */
export async function checkIfLocalDBIsEmpty(userId: string): Promise<boolean> {
  try {
    console.log('🔍 LOGIN SYNC HELPER: Checking if local DB is empty for user:', userId);
    
    // Check all key tables for this user
    const [doctors, meetings, brochures, savedBrochures] = await Promise.all([
      LocalDatabaseService.getDoctors(userId),
      LocalDatabaseService.getMeetings(userId),
      LocalDatabaseService.getBrochures(userId),
      LocalDatabaseService.getSavedBrochures(userId)
    ]);
    
    const isEmpty = doctors.length === 0 && 
                    meetings.length === 0 && 
                    brochures.length === 0 && 
                    savedBrochures.length === 0;
    
    console.log('🔍 LOGIN SYNC HELPER: Local DB check - Doctors:', doctors.length, 'Meetings:', meetings.length, 'Brochures:', brochures.length, 'Saved:', savedBrochures.length, 'IsEmpty:', isEmpty);
    
    return isEmpty;
  } catch (error) {
    console.error('❌ LOGIN SYNC HELPER: Error checking if local DB is empty:', error);
    // On error, assume empty to trigger sync
    return true;
  }
}

/**
 * Check if local DB is outdated compared to server
 */
export async function checkIfLocalDBIsOutdated(userId: string): Promise<boolean> {
  try {
    console.log('🔍 LOGIN SYNC HELPER: Checking if local DB is outdated for user:', userId);
    
    // Get last sync time from AsyncStorage
    let lastSyncTime = 0;
    try {
      const lastSyncTimeStr = await AsyncStorage.getItem(`last_sync_time_${userId}`);
      lastSyncTime = lastSyncTimeStr ? parseInt(lastSyncTimeStr, 10) : 0;
    } catch (error) {
      console.warn('⚠️ LOGIN SYNC HELPER: Failed to get last sync time:', error);
      lastSyncTime = 0;
    }
    
    const now = Date.now();
    const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    const RECENT_SYNC_THRESHOLD = 60 * 60 * 1000; // 1 hour - don't check server if sync was recent
    const timeSinceLastSync = now - lastSyncTime;
    
    // If sync was very recent (less than 1 hour), don't sync unless DB is empty
    if (lastSyncTime > 0 && timeSinceLastSync < RECENT_SYNC_THRESHOLD) {
      console.log('🔍 LOGIN SYNC HELPER: Recent sync detected - Last sync:', `${Math.round(timeSinceLastSync / (1000 * 60))} minutes ago, skipping sync check`);
      return false;
    }
    
    // If last sync was more than 24 hours ago, consider outdated
    if (lastSyncTime === 0 || timeSinceLastSync > SYNC_INTERVAL) {
      console.log('🔍 LOGIN SYNC HELPER: Local DB is outdated - Last sync:', lastSyncTime > 0 ? `${Math.round(timeSinceLastSync / (1000 * 60 * 60))} hours ago` : 'never');
      return true;
    }
    
    // Check if server has newer data by comparing timestamps (only if sync was more than 1 hour ago)
    if (timeSinceLastSync >= RECENT_SYNC_THRESHOLD) {
      try {
        // Get server's last modified timestamps for user's data
        const [serverDoctorsResult, serverMeetingsResult] = await Promise.all([
          supabase
            .from('doctors')
            .select('updated_at')
            .eq('mr_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('meetings')
            .select('updated_at')
            .eq('mr_id', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        ]);
        
        // Check if queries succeeded (not network errors)
        if (serverDoctorsResult.error || serverMeetingsResult.error) {
          // Network or query errors - don't trigger sync, assume local DB is fine
          console.warn('⚠️ LOGIN SYNC HELPER: Server query error (network/connection issue), assuming local DB is up-to-date:', serverDoctorsResult.error || serverMeetingsResult.error);
          console.log('🔍 LOGIN SYNC HELPER: Local DB is up-to-date (offline-first: skipping sync on network errors)');
          return false;
        }
        
        // Get local DB's last modified timestamps
        const localDoctors = await LocalDatabaseService.getDoctors(userId);
        const localMeetings = await LocalDatabaseService.getMeetings(userId);
        
        const localLastDoctorUpdate = localDoctors.length > 0 
          ? Math.max(...localDoctors.map(d => new Date(d.updated_at || d.created_at).getTime()))
          : 0;
        
        const localLastMeetingUpdate = localMeetings.length > 0
          ? Math.max(...localMeetings.map(m => new Date(m.updated_at || m.created_at).getTime()))
          : 0;
        
        // Compare with server timestamps
        const serverLastDoctorUpdate = serverDoctorsResult.data?.updated_at 
          ? new Date(serverDoctorsResult.data.updated_at).getTime()
          : 0;
        
        const serverLastMeetingUpdate = serverMeetingsResult.data?.updated_at
          ? new Date(serverMeetingsResult.data.updated_at).getTime()
          : 0;
        
        const serverHasNewerData = serverLastDoctorUpdate > localLastDoctorUpdate || 
                                    serverLastMeetingUpdate > localLastMeetingUpdate;
        
        if (serverHasNewerData) {
          console.log('🔍 LOGIN SYNC HELPER: Server has newer data - Server doctor update:', serverLastDoctorUpdate, 'Local:', localLastDoctorUpdate, 'Server meeting update:', serverLastMeetingUpdate, 'Local:', localLastMeetingUpdate);
          return true;
        }
        
        console.log('🔍 LOGIN SYNC HELPER: Local DB is up-to-date - Last sync:', `${Math.round(timeSinceLastSync / (1000 * 60 * 60))} hours ago`);
        return false;
      } catch (error) {
        // Network errors or other exceptions - don't trigger sync, assume local DB is fine (offline-first)
        console.warn('⚠️ LOGIN SYNC HELPER: Error comparing with server (likely network issue), assuming local DB is up-to-date (offline-first):', error);
        // On error comparing with server, assume up-to-date (offline-first principle)
        return false;
      }
    } else {
      // Sync was recent, no need to check server
      console.log('🔍 LOGIN SYNC HELPER: Local DB is up-to-date (recent sync) - Last sync:', `${Math.round(timeSinceLastSync / (1000 * 60))} minutes ago`);
      return false;
    }
  } catch (error) {
    console.error('❌ LOGIN SYNC HELPER: Error checking if local DB is outdated:', error);
    // On error, assume up-to-date (offline-first principle - don't trigger sync on errors)
    console.log('🔍 LOGIN SYNC HELPER: Assuming local DB is up-to-date due to error (offline-first)');
    return false;
  }
}

/**
 * Determine if comprehensive sync should be performed
 */
export async function shouldPerformComprehensiveSync(userId: string): Promise<SyncDecision> {
  try {
    console.log('🔍 LOGIN SYNC HELPER: Determining if comprehensive sync should be performed for user:', userId);
    
    // Check if local DB is empty
    const isEmpty = await checkIfLocalDBIsEmpty(userId);
    if (isEmpty) {
      console.log('✅ LOGIN SYNC HELPER: Should sync - Local DB is empty');
      return { shouldSync: true, reason: 'empty' };
    }
    
    // Check if local DB is outdated
    const isOutdated = await checkIfLocalDBIsOutdated(userId);
    if (isOutdated) {
      console.log('✅ LOGIN SYNC HELPER: Should sync - Local DB is outdated');
      return { shouldSync: true, reason: 'outdated' };
    }
    
    console.log('✅ LOGIN SYNC HELPER: Should NOT sync - Local DB is up-to-date');
    return { shouldSync: false, reason: 'up-to-date' };
  } catch (error) {
    console.error('❌ LOGIN SYNC HELPER: Error determining sync decision:', error);
    // On error, trigger sync to be safe
    return { shouldSync: true, reason: 'outdated' };
  }
}


