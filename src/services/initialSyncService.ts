/**
 * Initial Sync Service
 * Performs comprehensive data sync from server to local database on app startup
 * Ensures all data is available locally before user starts using the app
 */
import { LocalDatabaseService } from './localDatabaseService';
import { NetworkService } from './networkService';
import { AuthService } from './AuthService';
import { MRService } from './MRService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncProgress {
  stage: 'doctors' | 'meetings' | 'brochures' | 'complete';
  progress: number; // 0-100
  message: string;
}

export class InitialSyncService {
  private static isSyncing = false;
  private static lastSyncTime = 0;
  private static readonly SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private static progressListeners: ((progress: SyncProgress) => void)[] = [];

  /**
   * Perform initial sync on app startup
   * Downloads all server data to local database
   */
  static async performInitialSync(): Promise<{ success: boolean; error?: string }> {
    // Prevent multiple simultaneous syncs
    if (this.isSyncing) {
      console.log('InitialSync: Sync already in progress');
      return { success: false, error: 'Sync already in progress' };
    }

    // Check if online
    const isOnline = await NetworkService.isOnline();
    if (!isOnline) {
      console.log('InitialSync: Offline - skipping initial sync');
      return { success: false, error: 'Device is offline' };
    }

    // Check if we recently synced (avoid excessive syncing)
    const now = Date.now();
    if (now - this.lastSyncTime < this.SYNC_INTERVAL) {
      console.log('InitialSync: Recently synced, skipping');
      return { success: true }; // Not an error, just skipping
    }

    this.isSyncing = true;

    try {
      console.log('InitialSync: Starting comprehensive sync...');
      
      // Get current user
      const userResult = await AuthService.getCurrentUser();
      if (!userResult.success || !userResult.user) {
        throw new Error('User not authenticated');
      }

      const userId = userResult.user.id;
      const userRole = userResult.user.role;

      // Only sync for MR users (admin users work differently)
      if (userRole !== 'mr') {
        console.log('InitialSync: User is admin, skipping MR data sync');
        return { success: true };
      }

      // Step 1: Sync Doctors
      this.notifyProgress({
        stage: 'doctors',
        progress: 0,
        message: 'Syncing doctors...'
      });
      
      await this.syncDoctors(userId);
      
      this.notifyProgress({
        stage: 'doctors',
        progress: 33,
        message: 'Doctors synced'
      });

      // Step 2: Sync Meetings
      this.notifyProgress({
        stage: 'meetings',
        progress: 33,
        message: 'Syncing meetings...'
      });
      
      await this.syncMeetings(userId);
      
      this.notifyProgress({
        stage: 'meetings',
        progress: 66,
        message: 'Meetings synced'
      });

      // Step 3: Sync Brochures metadata (not files)
      this.notifyProgress({
        stage: 'brochures',
        progress: 66,
        message: 'Syncing brochures...'
      });
      
      await this.syncBrochures(userId);
      
      this.notifyProgress({
        stage: 'complete',
        progress: 100,
        message: 'Sync complete'
      });

      this.lastSyncTime = Date.now();
      console.log('InitialSync: Comprehensive sync completed successfully');
      
      return { success: true };
    } catch (error) {
      console.error('InitialSync: Sync failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Sync failed' 
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync all doctors from server to local database
   */
  private static async syncDoctors(mrId: string): Promise<void> {
    try {
      console.log('InitialSync: Syncing doctors for MR:', mrId);
      
      // Get doctors from server
      const serverResult = await MRService.getDoctors(mrId);
      
      if (!serverResult.success || !serverResult.data) {
        console.warn('InitialSync: Failed to get doctors from server');
        return;
      }

      console.log(`InitialSync: Found ${serverResult.data.length} doctors on server`);
      
      // Get existing local doctors
      const localDoctors = await LocalDatabaseService.getDoctors(mrId);
      const localDoctorMap = new Map(
        localDoctors.map(d => [d.server_id, d])
      );

      // Sync each doctor
      for (const serverDoctor of serverResult.data) {
        try {
          const existingDoctor = localDoctorMap.get(serverDoctor.doctor_id);
          
          if (!existingDoctor) {
            // Create new local doctor
            console.log('InitialSync: Creating local doctor:', serverDoctor.doctor_id);
            await LocalDatabaseService.createDoctor({
              server_id: serverDoctor.doctor_id,
              mr_id: mrId,
              first_name: serverDoctor.first_name || '',
              last_name: serverDoctor.last_name || '',
              specialty: serverDoctor.specialty || '',
              hospital: serverDoctor.hospital || '',
              phone: serverDoctor.phone || '',
              email: serverDoctor.email || '',
              location: serverDoctor.location || '',
            });
          } else {
            // Update existing doctor if server data is newer
            console.log('InitialSync: Updating local doctor:', serverDoctor.doctor_id);
            await LocalDatabaseService.updateDoctor(existingDoctor.id, {
              first_name: serverDoctor.first_name || existingDoctor.first_name,
              last_name: serverDoctor.last_name || existingDoctor.last_name,
              specialty: serverDoctor.specialty || existingDoctor.specialty,
              hospital: serverDoctor.hospital || existingDoctor.hospital,
              phone: serverDoctor.phone || existingDoctor.phone,
              email: serverDoctor.email || existingDoctor.email,
              location: serverDoctor.location || existingDoctor.location,
            });
          }
        } catch (error) {
          console.error('InitialSync: Failed to sync doctor:', error);
        }
      }

      console.log('InitialSync: Doctors sync complete');
    } catch (error) {
      console.error('InitialSync: Failed to sync doctors:', error);
      throw error;
    }
  }

  /**
   * Sync all meetings from server to local database
   */
  private static async syncMeetings(mrId: string): Promise<void> {
    try {
      console.log('🔴 MEETING_SYNC: Syncing meetings for MR:', mrId);
      
      // Get meetings from server
      const serverResult = await MRService.getMeetings(mrId);
      
      if (!serverResult.success || !serverResult.data) {
        console.warn('🔴 MEETING_SYNC: Failed to get meetings from server');
        return;
      }

      console.log(`🔴 MEETING_SYNC: Found ${serverResult.data.length} meetings on server`);
      
      // Get existing local meetings
      const localMeetings = await LocalDatabaseService.getMeetings(mrId);
      console.log(`🔴 MEETING_SYNC: Found ${localMeetings.length} existing meetings in local DB`);
      const localMeetingMap = new Map(
        localMeetings.map(m => [m.server_id, m])
      );

      // Sync each meeting using upsertMeeting to prevent duplicates
      for (const serverMeeting of serverResult.data) {
        try {
          const existingMeeting = localMeetingMap.get(serverMeeting.meeting_id);
          
          console.log('🔴 MEETING_SYNC: Processing meeting:', {
            server_id: serverMeeting.meeting_id,
            title: serverMeeting.title,
            scheduled_date: serverMeeting.scheduled_date,
            exists_locally: !!existingMeeting
          });
          
          if (!existingMeeting) {
            // Use upsertMeeting instead of createMeeting to prevent duplicates
            console.log('🔴 MEETING_SYNC: New meeting, creating in local DB');
            await LocalDatabaseService.upsertMeeting({
              id: '', // Will generate new UUID
              server_id: serverMeeting.meeting_id,
              mr_id: mrId,
              doctor_id: serverMeeting.doctor_id,
              doctor_server_id: serverMeeting.doctor_id,
              title: serverMeeting.title || '',
              scheduled_date: serverMeeting.scheduled_date || new Date().toISOString(),
              duration_minutes: serverMeeting.duration_minutes || 30,
              status: serverMeeting.status || 'scheduled',
              purpose: serverMeeting.purpose || '',
              notes: serverMeeting.notes || '',
              created_at: new Date().toISOString(),
              updated_at: serverMeeting.updated_at || serverMeeting.created_at || new Date().toISOString(),
              last_modified: serverMeeting.updated_at || serverMeeting.created_at,
              version: 1,
              sync_status: 'synced',
              is_deleted: false,
              local_changes: null
            });
          } else {
            // Update existing meeting if server data is newer
            console.log('🔴 MEETING_SYNC: Meeting exists locally, updating:', existingMeeting.id);
            await LocalDatabaseService.upsertMeeting({
              id: existingMeeting.id,
              server_id: serverMeeting.meeting_id,
              mr_id: mrId,
              doctor_id: serverMeeting.doctor_id,
              doctor_server_id: serverMeeting.doctor_id,
              title: serverMeeting.title || existingMeeting.title,
              scheduled_date: serverMeeting.scheduled_date || existingMeeting.scheduled_date,
              duration_minutes: serverMeeting.duration_minutes || existingMeeting.duration_minutes,
              status: serverMeeting.status || existingMeeting.status,
              purpose: serverMeeting.purpose || existingMeeting.purpose,
              notes: serverMeeting.notes || existingMeeting.notes,
              created_at: existingMeeting.created_at,
              updated_at: serverMeeting.updated_at || serverMeeting.created_at || existingMeeting.updated_at,
              last_modified: serverMeeting.updated_at || serverMeeting.created_at,
              version: existingMeeting.version || 1,
              sync_status: 'synced',
              is_deleted: false,
              local_changes: null
            });
          }
          
          console.log(`🔴 MEETING_SYNC: Meeting ${existingMeeting ? 'updated' : 'created'} successfully`);
        } catch (error) {
          console.error('🔴 MEETING_SYNC: Failed to sync meeting:', error);
        }
      }

      // Verify no duplicates were created
      const finalLocalMeetings = await LocalDatabaseService.getMeetings(mrId);
      const serverIds = finalLocalMeetings.map(m => m.server_id).filter(id => id);
      const duplicateServerIds = serverIds.filter((id, index) => serverIds.indexOf(id) !== index);
      if (duplicateServerIds.length > 0) {
        console.error(`🔴 MEETING_SYNC: WARNING - Found ${duplicateServerIds.length} duplicate server IDs:`, duplicateServerIds);
      } else {
        console.log('🔴 MEETING_SYNC: No duplicates detected - all server IDs are unique');
      }

      console.log('🔴 MEETING_SYNC: Meetings sync complete');
    } catch (error) {
      console.error('🔴 MEETING_SYNC: Failed to sync meetings:', error);
      throw error;
    }
  }

  /**
   * Sync brochures metadata and saved brochures
   */
  private static async syncBrochures(mrId: string): Promise<void> {
    try {
      console.log('InitialSync: Syncing brochures and saved brochures...');

      // Sync saved brochures from server
      await this.syncSavedBrochures(mrId);

      console.log('InitialSync: Brochures sync complete');
    } catch (error) {
      console.error('InitialSync: Failed to sync brochures:', error);
      // Don't throw - brochures are not critical for initial sync
    }
  }

  /**
   * Sync saved brochures from server to local storage
   */
  private static async syncSavedBrochures(mrId: string): Promise<void> {
    try {
      console.log('InitialSync: Syncing saved brochures for MR:', mrId);

      // Import savedBrochuresSyncService dynamically
      const { savedBrochuresSyncService } = await import('./savedBrochuresSyncService');

      // Get saved brochures from server
      const serverResult = await savedBrochuresSyncService.getSavedBrochuresFromServer(mrId);

      if (serverResult.success && serverResult.data) {
        console.log(`InitialSync: Found ${serverResult.data.length} saved brochures on server`);

        // Save each brochure to local storage
        for (const serverBrochure of serverResult.data) {
          try {
            // Save to AsyncStorage
            const key = `mr_saved_brochures_${mrId}`;
            const existingData = await AsyncStorage.getItem(key);
            let savedBrochures = existingData ? JSON.parse(existingData) : [];

            // Check if already exists
            const exists = savedBrochures.some((b: any) =>
              b.brochure_id === serverBrochure.brochure_id
            );

            if (!exists) {
              // Add to local storage
              savedBrochures.push({
                brochure_id: serverBrochure.brochure_id,
                title: serverBrochure.brochure_title,
                customTitle: serverBrochure.custom_title,
                original_brochure_data: serverBrochure.original_brochure_data,
                saved_at: serverBrochure.saved_at,
                last_accessed: serverBrochure.last_accessed,
                localId: `local_${serverBrochure.brochure_id}_${Date.now()}`
              });

              await AsyncStorage.setItem(key, JSON.stringify(savedBrochures));
              console.log('InitialSync: Saved brochure to local storage:', serverBrochure.brochure_title);
            }
          } catch (error) {
            console.error('InitialSync: Failed to save individual brochure:', error);
          }
        }

        console.log('InitialSync: Saved brochures sync complete');
      }
    } catch (error) {
      console.error('InitialSync: Failed to sync saved brochures:', error);
    }
  }

  /**
   * Extract time from ISO date string
   */
  private static extractTime(isoDate?: string): string {
    if (!isoDate) return '09:00';
    
    try {
      const date = new Date(isoDate);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch {
      return '09:00';
    }
  }

  /**
   * Subscribe to sync progress updates
   */
  static onProgress(callback: (progress: SyncProgress) => void): () => void {
    this.progressListeners.push(callback);
    
    return () => {
      const index = this.progressListeners.indexOf(callback);
      if (index > -1) {
        this.progressListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify progress listeners
   */
  private static notifyProgress(progress: SyncProgress): void {
    this.progressListeners.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('InitialSync: Error in progress listener:', error);
      }
    });
  }

  /**
   * Force a fresh sync (ignore time interval)
   */
  static async forceFreshSync(): Promise<{ success: boolean; error?: string }> {
    this.lastSyncTime = 0; // Reset last sync time
    return this.performInitialSync();
  }

  /**
   * Check if currently syncing
   */
  static isSyncInProgress(): boolean {
    return this.isSyncing;
  }
}




