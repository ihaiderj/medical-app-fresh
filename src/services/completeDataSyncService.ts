/**
 * Complete Data Sync Service
 * Downloads all user data from Supabase on first login and stores locally
 */
import { LocalDatabaseService } from './localDatabaseService';
import { MRService } from './MRService';
import { NetworkService } from './networkService';
import { savedBrochuresSyncService } from './savedBrochuresSyncService';
import { BrochureManagementService } from './brochureManagementService';

export interface SyncProgress {
  step: string;
  message: string;
  progress: number;
  total: number;
  current: number;
}

export interface BrochureSyncResult {
  savedBrochuresToUpdate: Array<{
    brochureId: string;
    brochureTitle: string;
    serverLastModified: string;
    localLastModified?: string;
  }>;
  savedBrochuresToDownload: Array<{
    brochureId: string;
    brochureTitle: string;
    fileUrl?: string;
  }>;
  newAvailableBrochures: Array<{
    id: string;
    title: string;
    category: string;
  }>;
}

export class CompleteDataSyncService {
  private static onProgressCallback?: (progress: SyncProgress) => void;
  private static brochureSyncResult: BrochureSyncResult = {
    savedBrochuresToUpdate: [],
    savedBrochuresToDownload: [],
    newAvailableBrochures: []
  };

  static setProgressCallback(callback: (progress: SyncProgress) => void) {
    this.onProgressCallback = callback;
  }

  static getBrochureSyncResult(): BrochureSyncResult {
    return this.brochureSyncResult;
  }

  static clearBrochureSyncResult(): void {
    this.brochureSyncResult = {
      savedBrochuresToUpdate: [],
      savedBrochuresToDownload: [],
      newAvailableBrochures: []
    };
  }

  private static updateProgress(step: string, message: string, current: number, total: number) {
    const progress: SyncProgress = {
      step,
      message,
      progress: Math.round((current / total) * 100),
      total,
      current
    };
    
    if (this.onProgressCallback) {
      this.onProgressCallback(progress);
    }
    
    console.log(`Sync Progress: ${step} - ${message} (${current}/${total})`);
  }

  /**
   * Perform complete data sync for a user
   */
  static async performCompleteSync(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🚀 COMPLETE SYNC DEBUG: Starting complete data sync for user:', userId);
      
      // Check if user is online
      const isOnline = await NetworkService.isOnline();
      console.log('🔍 COMPLETE SYNC DEBUG: Network status - Online:', isOnline);
      
      if (!isOnline) {
        console.log('⚠️ COMPLETE SYNC DEBUG: User is offline, skipping sync');
        return { success: true };
      }

      // Check current local data before sync
      console.log('🔍 COMPLETE SYNC DEBUG: Checking current local data...');
      const localUser = await LocalDatabaseService.getUserById(userId);
      const localDoctors = await LocalDatabaseService.getDoctors(userId);
      const localMeetings = await LocalDatabaseService.getMeetings(userId);
      const localBrochures = await LocalDatabaseService.getSavedBrochures(userId);
      
      console.log('📊 COMPLETE SYNC DEBUG: Current local data summary:');
      console.log('  - User profile:', localUser ? `${localUser.first_name} ${localUser.last_name} (${localUser.email})` : 'Not found');
      console.log('  - Doctors:', localDoctors.length, 'records');
      console.log('  - Meetings:', localMeetings.length, 'records');
      console.log('  - Brochures:', localBrochures.length, 'records');

      const totalSteps = 5;
      let currentStep = 0;

      // Step 1: Sync user profile
      this.updateProgress('Profile', 'Syncing user profile...', ++currentStep, totalSteps);
      await this.syncUserProfile(userId);

      // Step 2: Sync doctors
      this.updateProgress('Doctors', 'Syncing doctors...', ++currentStep, totalSteps);
      await this.syncDoctors(userId);

      // Step 3: Sync meetings
      this.updateProgress('Meetings', 'Syncing meetings...', ++currentStep, totalSteps);
      await this.syncMeetings(userId);

      // Step 4: Sync available brochures
      this.updateProgress('Brochures', 'Syncing brochures...', ++currentStep, totalSteps);
      await this.syncBrochures(userId);

      // Step 5: Sync saved brochures
      this.updateProgress('Saved Brochures', 'Syncing saved brochures...', ++currentStep, totalSteps);
      await this.syncSavedBrochures(userId);

      // Final verification - check what we have after sync
      console.log('🔍 COMPLETE SYNC DEBUG: Final verification after sync...');
      const finalUser = await LocalDatabaseService.getUserById(userId);
      const finalDoctors = await LocalDatabaseService.getDoctors(userId);
      const finalMeetings = await LocalDatabaseService.getMeetings(userId);
      const finalBrochures = await LocalDatabaseService.getSavedBrochures(userId);
      
      console.log('📊 COMPLETE SYNC DEBUG: Final local data summary:');
      console.log('  - User profile:', finalUser ? `${finalUser.first_name} ${finalUser.last_name} (${finalUser.email})` : 'Not found');
      console.log('  - Doctors:', finalDoctors.length, 'records');
      console.log('  - Meetings:', finalMeetings.length, 'records');
      console.log('  - Brochures:', finalBrochures.length, 'records');

      this.updateProgress('Complete', 'Data sync completed successfully!', totalSteps, totalSteps);
      
      console.log('✅ COMPLETE SYNC DEBUG: Complete data sync finished successfully');
      return { success: true };

    } catch (error) {
      console.error('❌ COMPLETE SYNC DEBUG: Complete data sync failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Sync user profile
   */
  private static async syncUserProfile(userId: string): Promise<void> {
    try {
      console.log('🔍 PROFILE SYNC DEBUG: Starting user profile sync for user:', userId);
      const profileResult = await MRService.getMRProfile();
      console.log('🔍 PROFILE SYNC DEBUG: Server profile result:', profileResult);
      
      if (profileResult.success && profileResult.data) {
        const profileData = {
          id: profileResult.data.id,
          email: profileResult.data.email,
          role: profileResult.data.role,
          first_name: profileResult.data.first_name,
          last_name: profileResult.data.last_name,
          phone: profileResult.data.phone,
          profile_image_url: profileResult.data.profile_image_url,
          is_active: profileResult.data.is_active,
          created_at: profileResult.data.created_at,
          updated_at: profileResult.data.updated_at,
          sync_status: 'synced' as const,
          local_changes: undefined
        };
        
        console.log('🔍 PROFILE SYNC DEBUG: Saving profile to local DB:', profileData);
        await LocalDatabaseService.upsertUser(profileData);
        
        // Verify the profile was saved
        const savedProfile = await LocalDatabaseService.getUserById(userId);
        if (savedProfile) {
          console.log('✅ PROFILE SYNC DEBUG: Profile successfully saved and verified in local DB:', savedProfile);
        } else {
          console.error('❌ PROFILE SYNC DEBUG: Profile save verification failed - profile not found in local DB');
        }
      } else {
        console.error('❌ PROFILE SYNC DEBUG: Failed to get profile from server:', profileResult.error);
      }
    } catch (error) {
      console.error('❌ PROFILE SYNC DEBUG: Failed to sync user profile:', error);
    }
  }

  /**
   * Sync doctors
   */
  private static async syncDoctors(userId: string): Promise<void> {
    try {
      console.log('🔍 DOCTORS SYNC DEBUG: Starting doctors sync for user:', userId);
      const doctorsResult = await MRService.getAssignedDoctors(userId);
      console.log('🔍 DOCTORS SYNC DEBUG: Server doctors result:', doctorsResult);
      
      if (doctorsResult.success && doctorsResult.data) {
        console.log(`🔍 DOCTORS SYNC DEBUG: Found ${doctorsResult.data.length} doctors on server:`, 
          doctorsResult.data.map(d => ({ doctor_id: d.doctor_id, first_name: d.first_name, last_name: d.last_name, hospital: d.hospital })));
        
        for (const doctor of doctorsResult.data) {
          console.log('🔍 DOCTORS SYNC DEBUG: Saving doctor to local DB:', doctor.first_name, doctor.last_name, doctor.hospital);
          // Check if doctor already exists locally
          const existing = await LocalDatabaseService.getDoctorByServerId(doctor.doctor_id);
          
          if (existing) {
            // Update existing doctor (skip sync queue for server sync)
            await LocalDatabaseService.updateDoctor(existing.id, {
              first_name: doctor.first_name,
              last_name: doctor.last_name,
              specialty: doctor.specialty,
              hospital: doctor.hospital,
              phone: doctor.phone,
              email: doctor.email,
              location: doctor.location,
              notes: doctor.notes,
              relationship_status: doctor.relationship_status,
              meetings_count: doctor.meetings_count || 0,
              last_meeting_date: doctor.last_meeting_date,
              next_appointment: doctor.next_meeting_date,
              last_modified: doctor.created_at,
              sync_status: 'synced',
              skipSyncQueue: true
            });
          } else {
            // Create new doctor (skip sync queue for server sync)
            await LocalDatabaseService.createDoctor({
              server_id: doctor.doctor_id,
              mr_id: userId,
              first_name: doctor.first_name,
              last_name: doctor.last_name,
              specialty: doctor.specialty,
              hospital: doctor.hospital,
              phone: doctor.phone,
              email: doctor.email,
              location: doctor.location,
              notes: doctor.notes,
              relationship_status: doctor.relationship_status,
              meetings_count: doctor.meetings_count || 0,
              last_meeting_date: doctor.last_meeting_date,
              next_appointment: doctor.next_meeting_date,
              last_modified: doctor.created_at,
              skipSyncQueue: true
            });
          }
        }
        
        // Verify doctors were saved locally
        const localDoctors = await LocalDatabaseService.getDoctors(userId);
        console.log(`✅ DOCTORS SYNC DEBUG: Verification - ${localDoctors.length} doctors now in local DB:`, 
          localDoctors.map(d => ({ id: d.id, first_name: d.first_name, last_name: d.last_name, hospital: d.hospital, sync_status: d.sync_status })));
      } else {
        console.error('❌ DOCTORS SYNC DEBUG: Failed to get doctors from server:', doctorsResult.error);
      }
    } catch (error) {
      console.error('❌ DOCTORS SYNC DEBUG: Failed to sync doctors:', error);
    }
  }

  /**
   * Sync meetings
   */
  private static async syncMeetings(userId: string): Promise<void> {
    try {
      console.log('🔴 MEETING_SYNC: Starting meetings sync for user:', userId);
      const meetingsResult = await MRService.getMeetings(userId);
      console.log('🔴 MEETING_SYNC: Server meetings result:', meetingsResult);
      
      if (meetingsResult.success && meetingsResult.data) {
        console.log(`🔴 MEETING_SYNC: Found ${meetingsResult.data.length} meetings on server`);
        console.log('🔴 MEETING_SYNC: Server meetings:', 
          meetingsResult.data.map(m => ({ meeting_id: m.meeting_id || m.id, title: m.title, scheduled_date: m.scheduled_date || m.meeting_date, status: m.status })));
        
        // Get existing local meetings to check for duplicates
        const existingLocalMeetings = await LocalDatabaseService.getMeetings(userId);
        console.log(`🔴 MEETING_SYNC: Found ${existingLocalMeetings.length} existing meetings in local DB`);
        
        for (const meeting of meetingsResult.data) {
          const serverMeetingId = meeting.meeting_id || meeting.id || ''
          console.log('🔴 MEETING_SYNC: Processing meeting:', {
            server_id: serverMeetingId,
            title: meeting.title,
            scheduled_date: meeting.scheduled_date || meeting.meeting_date
          });
          
          // Check if meeting already exists locally
          const existingMeeting = existingLocalMeetings.find(m => m.server_id === serverMeetingId);
          
          if (existingMeeting) {
            console.log(`🔴 MEETING_SYNC: Meeting already exists locally (ID: ${existingMeeting.id}), updating instead of creating duplicate`);
          } else {
            console.log('🔴 MEETING_SYNC: New meeting, will create in local DB');
          }
          
          // Use upsertMeeting to prevent duplicates - it will update if exists, create if not
          await LocalDatabaseService.upsertMeeting({
            id: existingMeeting?.id || '', // Use existing ID if found, empty string will generate new UUID
            server_id: serverMeetingId,
            mr_id: userId,
            doctor_id: meeting.doctor_id || '',
            doctor_server_id: meeting.doctor_id || '',
            title: meeting.title || '',
            scheduled_date: meeting.scheduled_date || meeting.meeting_date || new Date().toISOString(),
            duration_minutes: meeting.duration_minutes || 30,
            status: meeting.status || 'scheduled',
            purpose: meeting.purpose || undefined,
            notes: meeting.notes || undefined,
            follow_up_required: meeting.follow_up_required || false,
            follow_up_date: meeting.follow_up_date || undefined,
            follow_up_time: meeting.follow_up_time || undefined,
            follow_up_notes: meeting.follow_up_notes || undefined,
            created_at: existingMeeting?.created_at || new Date().toISOString(),
            updated_at: meeting.updated_at || meeting.created_at || new Date().toISOString(),
            last_modified: meeting.updated_at || meeting.created_at,
            version: existingMeeting?.version || 1,
            sync_status: 'synced',
            is_deleted: false,
            local_changes: null
          });
          
          console.log(`🔴 MEETING_SYNC: Meeting ${existingMeeting ? 'updated' : 'created'} successfully`);
        }
        
        // Verify meetings were saved locally
        const localMeetings = await LocalDatabaseService.getMeetings(userId);
        console.log(`🔴 MEETING_SYNC: Verification - ${localMeetings.length} meetings now in local DB`);
        console.log('🔴 MEETING_SYNC: Local meetings:', 
          localMeetings.map(m => ({ id: m.id, server_id: m.server_id, title: m.title, scheduled_date: m.scheduled_date, status: m.status, sync_status: m.sync_status })));
        
        // Check for duplicates
        const serverIds = localMeetings.map(m => m.server_id).filter(id => id);
        const duplicateServerIds = serverIds.filter((id, index) => serverIds.indexOf(id) !== index);
        if (duplicateServerIds.length > 0) {
          console.error(`🔴 MEETING_SYNC: WARNING - Found ${duplicateServerIds.length} duplicate server IDs:`, duplicateServerIds);
        } else {
          console.log('🔴 MEETING_SYNC: No duplicates detected - all server IDs are unique');
        }
      } else {
        console.error('🔴 MEETING_SYNC: Failed to get meetings from server:', meetingsResult.error);
      }
    } catch (error) {
      console.error('🔴 MEETING_SYNC: Failed to sync meetings:', error);
    }
  }

  /**
   * Sync brochures (available brochures)
   */
  private static async syncBrochures(userId: string): Promise<void> {
    try {
      console.log('🔍 BROCHURES SYNC DEBUG: Starting brochures sync for user:', userId);
      const brochuresResult = await MRService.getAssignedBrochures(userId);
      console.log('🔍 BROCHURES SYNC DEBUG: Server brochures result:', brochuresResult);
      
      if (brochuresResult.success && brochuresResult.data) {
        console.log(`🔍 BROCHURES SYNC DEBUG: Found ${brochuresResult.data.length} brochures on server:`, 
          brochuresResult.data.map(b => ({ id: b.id, title: b.title, category: b.category })));
        
        // Get local brochures for comparison
        const localBrochures = await LocalDatabaseService.getBrochures(userId);
        const localBrochureIds = new Set(localBrochures.map(b => b.id));
        
        // Detect new brochures
        const newBrochures = brochuresResult.data.filter(b => !localBrochureIds.has(b.id));
        if (newBrochures.length > 0) {
          console.log(`🔍 BROCHURES SYNC DEBUG: Found ${newBrochures.length} new brochures:`, 
            newBrochures.map(b => ({ id: b.id, title: b.title })));
          this.brochureSyncResult.newAvailableBrochures = newBrochures.map(b => ({
            id: b.id,
            title: b.title,
            category: b.category || 'General'
          }));
        }
        
        // Save all brochures to local DB
        for (const brochure of brochuresResult.data) {
          console.log('🔍 BROCHURES SYNC DEBUG: Saving brochure to local DB:', brochure.title);
          
          // Save to brochure_sync table (MR-specific assignment)
          await LocalDatabaseService.upsertBrochureSync({
            id: `brochure_${brochure.id}`,
            server_id: brochure.id,
            mr_id: userId,
            brochure_id: brochure.id,
            brochure_title: brochure.title,
            brochure_data: JSON.stringify(brochure),
            last_modified: brochure.created_at || new Date().toISOString(),
            created_at: brochure.created_at || new Date().toISOString(),
            version: 1,
            sync_status: 'synced',
            local_changes: undefined
          });
          
          // ALSO save to brochures table (for dashboard stats and public brochures)
          await LocalDatabaseService.upsertBrochure({
            id: brochure.id,
            title: brochure.title,
            category: brochure.category || 'General',
            description: brochure.description,
            file_url: brochure.file_url || '',
            thumbnail_url: brochure.thumbnail_url,
            pages: undefined, // Not available in MRAssignedBrochure
            file_size: undefined, // Not available in MRAssignedBrochure
            status: 'active', // Default status
            assigned_by: undefined, // Not available in MRAssignedBrochure
            download_count: brochure.download_count || 0,
            view_count: brochure.view_count || 0,
            created_at: brochure.created_at || new Date().toISOString(),
            updated_at: brochure.created_at || new Date().toISOString(), // Use created_at as fallback
            file_name: brochure.file_name,
            file_type: brochure.file_type,
            uploaded_by: undefined, // Not available in MRAssignedBrochure
            is_public: false, // Default to false for MR-assigned brochures
            tags: undefined, // Not available in MRAssignedBrochure
            version: '1', // Default version as string
            category_id: undefined, // Not available in MRAssignedBrochure
            sync_status: 'synced',
            local_changes: null,
            last_synced_at: new Date().toISOString(),
            needs_sync: false
          });
        }
        
        console.log(`✅ BROCHURES SYNC DEBUG: Saved ${brochuresResult.data.length} brochures to local DB (both brochure_sync and brochures tables)`);
      } else {
        console.error('❌ BROCHURES SYNC DEBUG: Failed to get brochures from server:', brochuresResult.error);
      }
    } catch (error) {
      console.error('❌ BROCHURES SYNC DEBUG: Failed to sync brochures:', error);
    }
  }

  /**
   * Sync saved brochures
   */
  private static async syncSavedBrochures(userId: string): Promise<void> {
    try {
      console.log('🔍 SAVED BROCHURES SYNC DEBUG: Starting saved brochures sync for user:', userId);
      
      // Get saved brochures from server
      const serverResult = await savedBrochuresSyncService.getSavedBrochuresFromServer(userId);
      console.log('🔍 SAVED BROCHURES SYNC DEBUG: Server saved brochures result:', serverResult);
      
      if (!serverResult.success || !serverResult.data) {
        console.error('❌ SAVED BROCHURES SYNC DEBUG: Failed to get saved brochures from server:', serverResult.error);
        return;
      }
      
      console.log(`🔍 SAVED BROCHURES SYNC DEBUG: Found ${serverResult.data.length} saved brochures on server`);
      
      // Get local saved brochures
      const localSavedBrochures = await LocalDatabaseService.getSavedBrochures(userId);
      const localBrochureMap = new Map(localSavedBrochures.map(b => [b.brochure_id, b]));
      
      // Process each server saved brochure
      for (const serverBrochure of serverResult.data) {
        const localBrochure = localBrochureMap.get(serverBrochure.brochure_id);
        
        if (!localBrochure) {
          // Brochure exists on server but not locally - need to download
          console.log(`🔍 SAVED BROCHURES SYNC DEBUG: Brochure "${serverBrochure.custom_title}" not found locally - will download`);
          
          // Get file URL from original brochure data
          const originalBrochure = serverBrochure.original_brochure_data;
          const fileUrl = originalBrochure?.file_url;
          
          this.brochureSyncResult.savedBrochuresToDownload.push({
            brochureId: serverBrochure.brochure_id,
            brochureTitle: serverBrochure.custom_title || serverBrochure.brochure_title,
            fileUrl: fileUrl
          });
        } else {
          // Brochure exists both locally and on server - compare timestamps
          console.log(`🔍 SAVED BROCHURES SYNC DEBUG: Comparing "${serverBrochure.custom_title}" - local vs server`);
          
          // Check if server has newer version
          const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
            userId,
            serverBrochure.brochure_id,
            localBrochure.saved_at || localBrochure.created_at
          );
          
          if (statusResult.success && statusResult.data?.needsDownload) {
            console.log(`🔍 SAVED BROCHURES SYNC DEBUG: Server version is newer for "${serverBrochure.custom_title}"`);
            this.brochureSyncResult.savedBrochuresToUpdate.push({
              brochureId: serverBrochure.brochure_id,
              brochureTitle: serverBrochure.custom_title || serverBrochure.brochure_title,
              serverLastModified: statusResult.data.serverLastModified || new Date().toISOString(),
              localLastModified: statusResult.data.localLastModified || localBrochure.saved_at
            });
          } else {
            console.log(`🔍 SAVED BROCHURES SYNC DEBUG: Local version is up to date or newer for "${serverBrochure.custom_title}"`);
          }
        }
      }
      
      // Save metadata to local DB (even if files need to be downloaded)
      for (const serverBrochure of serverResult.data) {
        await LocalDatabaseService.upsertSavedBrochure({
          id: serverBrochure.brochure_id,
          mr_id: userId,
          brochure_id: serverBrochure.brochure_id,
          brochure_title: serverBrochure.brochure_title,
          custom_title: serverBrochure.custom_title,
          original_brochure_data: JSON.stringify(serverBrochure.original_brochure_data),
          saved_at: serverBrochure.saved_at,
          last_accessed: serverBrochure.last_accessed,
          created_at: serverBrochure.saved_at,
          version: 1,
          sync_status: 'synced',
          local_changes: undefined
        });
      }
      
      console.log(`✅ SAVED BROCHURES SYNC DEBUG: Sync complete - ${this.brochureSyncResult.savedBrochuresToDownload.length} to download, ${this.brochureSyncResult.savedBrochuresToUpdate.length} to update`);
    } catch (error) {
      console.error('❌ SAVED BROCHURES SYNC DEBUG: Failed to sync saved brochures:', error);
    }
  }

  /**
   * Sync doctor assignments
   */
  private static async syncDoctorAssignments(userId: string): Promise<void> {
    try {
      // Skip doctor assignments for now - not available in MRService
      console.log('CompleteDataSync: Skipping doctor assignments sync - method not available');
    } catch (error) {
      console.error('CompleteDataSync: Failed to sync doctor assignments:', error);
    }
  }

  /**
   * Sync activity logs
   */
  private static async syncActivityLogs(userId: string): Promise<void> {
    try {
      const activitiesResult = await MRService.getRecentActivities(userId, 100);
      if (activitiesResult.success && activitiesResult.data) {
        for (const activity of activitiesResult.data) {
          await LocalDatabaseService.createActivityLog({
            server_id: activity.id,
            user_id: userId,
            mr_id: userId,
            activity_type: activity.activity_type,
            description: activity.description,
            metadata: undefined,
            is_deleted: false
          });
        }
      }
    } catch (error) {
      console.error('CompleteDataSync: Failed to sync activity logs:', error);
    }
  }

  /**
   * Sync permissions
   */
  private static async syncPermissions(userId: string): Promise<void> {
    try {
      // Skip permissions for now - not available in MRService
      console.log('CompleteDataSync: Skipping permissions sync - method not available');
    } catch (error) {
      console.error('CompleteDataSync: Failed to sync permissions:', error);
    }
  }
}
