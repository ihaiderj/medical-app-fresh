import { supabase } from './supabase';
import { LocalDatabaseService, LocalMeeting, LocalSavedBrochure, LocalDoctor } from './localDatabaseService';
import { NetworkService } from './networkService';
import { MRService } from './MRService';
import { generateUUID } from '../utils/uuid';
import * as FileSystem from 'expo-file-system';
import { BrochureManagementService } from './brochureManagementService';

export interface SyncProgress {
  step: string;
  message: string;
  progress: number;
  currentItem?: number;
  totalItems?: number;
}

export class ComprehensiveServerSyncService {
  private static onProgressCallback?: (progress: SyncProgress) => void;

  /**
   * Set progress callback for UI updates
   */
  static setProgressCallback(callback: (progress: SyncProgress) => void) {
    this.onProgressCallback = callback;
  }

  /**
   * Update progress and notify callback
   */
  private static updateProgress(step: string, message: string, progress: number, currentItem?: number, totalItems?: number) {
    const progressData: SyncProgress = {
      step,
      message,
      progress,
      currentItem,
      totalItems
    };
    
    console.log(`🔍 COMPREHENSIVE SYNC DEBUG: ${step} - ${message} (${progress}%)`);
    if (currentItem && totalItems) {
      console.log(`🔍 COMPREHENSIVE SYNC DEBUG: Progress: ${currentItem}/${totalItems} items`);
    }
    
    this.onProgressCallback?.(progressData);
  }

  /**
   * Perform comprehensive sync of all user data from server
   */
  static async performComprehensiveSync(userId: string): Promise<{ success: boolean; error?: string; syncedTables: string[] }> {
    try {
      console.log('🚀 COMPREHENSIVE SYNC DEBUG: Starting comprehensive server sync for user:', userId);
      
      // Check if user is online
      const isOnline = await NetworkService.isOnline();
      if (!isOnline) {
        console.log('⚠️ COMPREHENSIVE SYNC DEBUG: User is offline, skipping sync');
        return { success: true, syncedTables: [] };
      }

      const syncedTables: string[] = [];
      const totalSteps = 10;
      let currentStep = 0;

      // Step 1: Sync user profile
      currentStep++;
      this.updateProgress('User Profile', 'Syncing user profile...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncUserProfile(userId);
      syncedTables.push('users');

      // Step 2: Sync doctors
      currentStep++;
      this.updateProgress('Doctors', 'Downloading doctors...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncDoctors(userId);
      syncedTables.push('doctors');

      // Step 3: Sync doctor assignments
      currentStep++;
      this.updateProgress('Doctor Assignments', 'Syncing doctor assignments...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncDoctorAssignments(userId);
      syncedTables.push('doctor_assignments');

      // Step 4: Sync doctor photos
      currentStep++;
      this.updateProgress('Doctor Photos', 'Syncing doctor photos...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncDoctorPhotos(userId);
      syncedTables.push('doctor_photos');

      // Step 5: Sync meetings
      currentStep++;
      this.updateProgress('Meetings', 'Downloading meetings...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncMeetings(userId);
      syncedTables.push('meetings');

      // Step 6: Sync meeting slide notes
      currentStep++;
      this.updateProgress('Meeting Notes', 'Downloading meeting notes...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncMeetingSlideNotes(userId);
      syncedTables.push('meeting_slide_notes');

      // Step 7: Sync brochures
      currentStep++;
      this.updateProgress('Brochures', 'Downloading available brochures...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncBrochures(userId);
      syncedTables.push('brochures');

      // Step 8: Sync brochure categories
      currentStep++;
      this.updateProgress('Brochure Categories', 'Syncing brochure categories...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncBrochureCategories();
      syncedTables.push('brochure_categories');

      // Step 9: Sync saved brochures
      currentStep++;
      this.updateProgress('Saved Brochures', 'Downloading saved brochures...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncSavedBrochures(userId);
      syncedTables.push('saved_brochures');
      
      // Verify brochure storage after sync
      console.log('🔍 BROCHURES VERIFICATION: Verifying brochure storage in local DB...');
      const verification = await LocalDatabaseService.verifyBrochureStorage(userId);
      console.log('✅ BROCHURES VERIFICATION:', JSON.stringify(verification, null, 2));

      // Step 10: Sync MR permissions
      currentStep++;
      this.updateProgress('Permissions', 'Syncing permissions...', Math.round((currentStep / totalSteps) * 100), currentStep, totalSteps);
      await this.syncMRPermissions(userId);
      syncedTables.push('mr_permissions');

      this.updateProgress('Complete', 'Comprehensive sync completed successfully!', 100, totalSteps, totalSteps);
      
      console.log('✅ COMPREHENSIVE SYNC DEBUG: Comprehensive sync completed successfully');
      console.log('📊 COMPREHENSIVE SYNC DEBUG: Synced tables:', syncedTables);
      
      return { success: true, syncedTables };
      
    } catch (error) {
      console.error('❌ COMPREHENSIVE SYNC DEBUG: Comprehensive sync failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        syncedTables: []
      };
    }
  }

  /**
   * Sync user profile
   */
  private static async syncUserProfile(userId: string): Promise<void> {
    try {
      console.log('🔍 USER PROFILE SYNC DEBUG: Starting user profile sync');
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('❌ USER PROFILE SYNC DEBUG: Server error:', error);
        return;
      }

      if (data) {
        console.log('✅ USER PROFILE SYNC DEBUG: User profile fetched from server:', data);
        
        await LocalDatabaseService.upsertUser({
          id: data.id,
          email: data.email,
          role: data.role,
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          phone: data.phone,
          profile_image_url: data.profile_image_url,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: data.updated_at,
          sync_status: 'synced',
          local_changes: null
        });
        
        console.log('✅ USER PROFILE SYNC DEBUG: User profile saved to local database');
      }
    } catch (error) {
      console.error('❌ USER PROFILE SYNC DEBUG: Failed to sync user profile:', error);
    }
  }

  /**
   * Sync doctors assigned to the user
   */
  private static async syncDoctors(userId: string): Promise<void> {
    try {
      console.log('🔍 DOCTORS SYNC DEBUG: Starting doctors sync for user:', userId);
      
      // Use MRService.getAssignedDoctors to get doctors assigned to this MR
      const doctorsResult = await MRService.getAssignedDoctors(userId);
      
      if (!doctorsResult.success || !doctorsResult.data) {
        console.error('❌ DOCTORS SYNC DEBUG: Failed to get assigned doctors:', doctorsResult.error);
        return;
      }
      
      const data = doctorsResult.data;
      console.log(`✅ DOCTORS SYNC DEBUG: Found ${data?.length || 0} doctors on server`);

      if (data && data.length > 0) {
        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;
        
        for (const doctor of data) {
          // Debug: Log the actual structure of the doctor object
          console.log('🔍 DOCTORS SYNC DEBUG: Doctor object from server:', JSON.stringify(doctor, null, 2));
          
          // The server RPC returns doctor_id, but the response might have it as id or doctor_id
          // Check both fields to handle different response formats
          const serverId = (doctor as any).doctor_id || (doctor as any).id || doctor.doctor_id;
          
          // Skip if no server ID available - this causes duplicates
          if (!serverId) {
            console.warn(`⚠️ DOCTORS SYNC DEBUG: Skipping doctor with no ID: ${doctor.first_name} ${doctor.last_name}`);
            console.warn('⚠️ DOCTORS SYNC DEBUG: Doctor object keys:', Object.keys(doctor));
            console.warn('⚠️ DOCTORS SYNC DEBUG: Doctor object:', doctor);
            skippedCount++;
            continue;
          }
          
          console.log(`✅ DOCTORS SYNC DEBUG: Processing doctor: ${doctor.first_name} ${doctor.last_name} with server_id: ${serverId}`);
          
          // Check if doctor already exists by server_id
          const existing = await LocalDatabaseService.getDoctorByServerId(serverId);
          
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
              profile_image_url: doctor.profile_image_url,
              notes: doctor.notes,
              relationship_status: doctor.relationship_status,
              meetings_count: doctor.meetings_count || 0,
              last_meeting_date: doctor.last_meeting_date,
              next_appointment: doctor.next_appointment,
              last_modified: doctor.updated_at || doctor.created_at,
              sync_status: 'synced',
              skipSyncQueue: true
            });
            updatedCount++;
          } else {
            // Check if there's a matching local doctor without server_id (to avoid duplicates)
            try {
              const matchingLocal = await LocalDatabaseService.findMatchingLocalDoctor(userId, doctor, undefined);
              if (matchingLocal) {
                console.log(`🔗 DOCTORS SYNC DEBUG: Found matching local doctor without server_id: ${matchingLocal.id}, linking to server_id: ${serverId}`);
                
                // Update the local doctor with server_id and server data
                await LocalDatabaseService.updateDoctor(matchingLocal.id, {
                  server_id: serverId,
                  first_name: doctor.first_name,
                  last_name: doctor.last_name,
                  specialty: doctor.specialty,
                  hospital: doctor.hospital,
                  phone: doctor.phone,
                  email: doctor.email,
                  location: doctor.location,
                  profile_image_url: doctor.profile_image_url,
                  notes: doctor.notes,
                  relationship_status: doctor.relationship_status,
                  meetings_count: doctor.meetings_count || 0,
                  last_meeting_date: doctor.last_meeting_date,
                  next_appointment: doctor.next_appointment,
                  last_modified: doctor.updated_at || doctor.created_at,
                  sync_status: 'synced',
                  skipSyncQueue: true
                });
                updatedCount++;
                continue; // Skip creating new doctor
              }
            } catch (error) {
              console.warn('⚠️ DOCTORS SYNC DEBUG: Error finding matching local doctor:', error);
              // Continue to create new doctor if matching fails
            }
            
            // Create new doctor only if no match found
            await LocalDatabaseService.createDoctor({
              id: generateUUID(), // Generate local ID (don't use server_id as local id to avoid conflicts)
              server_id: serverId, // Store server_id separately
              mr_id: userId,
              first_name: doctor.first_name,
              last_name: doctor.last_name,
              specialty: doctor.specialty,
              hospital: doctor.hospital,
              phone: doctor.phone,
              email: doctor.email,
              location: doctor.location,
              profile_image_url: doctor.profile_image_url,
              notes: doctor.notes,
              relationship_status: doctor.relationship_status,
              meetings_count: doctor.meetings_count || 0,
              last_meeting_date: doctor.last_meeting_date,
              next_appointment: doctor.next_meeting_date || doctor.next_appointment, // Use next_meeting_date from server
              created_by: doctor.created_by,
              created_at: doctor.created_at,
              updated_at: doctor.updated_at || doctor.created_at,
              last_modified: doctor.updated_at || doctor.created_at,
              version: 1,
              sync_status: 'synced',
              is_deleted: false,
              local_changes: null,
              skipSyncQueue: true
            });
            createdCount++;
          }
        }
        
        console.log(`✅ DOCTORS SYNC DEBUG: Doctors sync completed - ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped`);
        
        // Clean up any remaining duplicates by name/hospital after sync
        try {
          await this.cleanupDuplicateDoctorsByName(userId);
        } catch (cleanupError) {
          console.warn('⚠️ DOCTORS SYNC DEBUG: Error cleaning up duplicates:', cleanupError);
        }
      }
    } catch (error) {
      console.error('❌ DOCTORS SYNC DEBUG: Failed to sync doctors:', error);
    }
  }

  /**
   * Clean up duplicate doctors by name/hospital (keep the one with server_id if available)
   * Can be called independently to clean up existing duplicates
   */
  static async cleanupDuplicateDoctorsByName(userId: string): Promise<void> {
    try {
      console.log('🔍 DOCTORS SYNC DEBUG: Cleaning up duplicate doctors by name/hospital...');
      
      const allDoctors = await LocalDatabaseService.getDoctors(userId);
      
      // Group doctors by normalized name + hospital
      const doctorGroups = new Map<string, LocalDoctor[]>();
      
      allDoctors.forEach(doctor => {
        const normalizedName = `${(doctor.first_name || '').toLowerCase().trim()} ${(doctor.last_name || '').toLowerCase().trim()}`.trim();
        const normalizedHospital = (doctor.hospital || '').toLowerCase().trim();
        const key = `${normalizedName}|${normalizedHospital}`;
        
        if (!doctorGroups.has(key)) {
          doctorGroups.set(key, []);
        }
        doctorGroups.get(key)!.push(doctor);
      });
      
      // Find duplicates and merge them
      let duplicatesRemoved = 0;
      for (const [key, doctors] of doctorGroups.entries()) {
        if (doctors.length > 1) {
          console.log(`🔍 DOCTORS SYNC DEBUG: Found ${doctors.length} duplicate doctors for: ${key}`);
          
          // Sort: prefer doctor with server_id, then by created_at (oldest first)
          doctors.sort((a, b) => {
            if (a.server_id && !b.server_id) return -1;
            if (!a.server_id && b.server_id) return 1;
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          });
          
          const keepDoctor = doctors[0]; // Keep the first one (preferred)
          const duplicates = doctors.slice(1); // Remove the rest
          
          // Transfer any meetings/assignments from duplicates to the kept doctor
          for (const duplicate of duplicates) {
            try {
              // Reassign meetings and assignments to the kept doctor
              await LocalDatabaseService.reassignDoctorReferences(
                duplicate.id, 
                keepDoctor.id, 
                keepDoctor.server_id || undefined
              );
              
              // Soft delete the duplicate
              await LocalDatabaseService.updateDoctor(duplicate.id, {
                is_deleted: true,
                sync_status: 'synced',
                skipSyncQueue: true
              });
              
              duplicatesRemoved++;
              console.log(`✅ DOCTORS SYNC DEBUG: Removed duplicate doctor: ${duplicate.id} (kept: ${keepDoctor.id})`);
            } catch (error) {
              console.warn(`⚠️ DOCTORS SYNC DEBUG: Error removing duplicate doctor ${duplicate.id}:`, error);
            }
          }
        }
      }
      
      if (duplicatesRemoved > 0) {
        console.log(`✅ DOCTORS SYNC DEBUG: Cleanup completed - removed ${duplicatesRemoved} duplicate doctors`);
      } else {
        console.log('✅ DOCTORS SYNC DEBUG: No duplicates found');
      }
    } catch (error) {
      console.error('❌ DOCTORS SYNC DEBUG: Error cleaning up duplicate doctors:', error);
    }
  }

  /**
   * Sync doctor assignments
   */
  private static async syncDoctorAssignments(userId: string): Promise<void> {
    try {
      console.log('🔍 DOCTOR ASSIGNMENTS SYNC DEBUG: Starting doctor assignments sync');
      
      const { data, error } = await supabase
        .from('doctor_assignments')
        .select('*')
        .eq('mr_id', userId);

      if (error) {
        console.error('❌ DOCTOR ASSIGNMENTS SYNC DEBUG: Server error:', error);
        return;
      }

      console.log(`✅ DOCTOR ASSIGNMENTS SYNC DEBUG: Found ${data?.length || 0} doctor assignments on server`);

      if (data && data.length > 0) {
        for (const assignment of data) {
          await LocalDatabaseService.upsertDoctorAssignment({
            id: assignment.id,
            doctor_id: assignment.doctor_id,
            mr_id: assignment.mr_id,
            assigned_by: assignment.assigned_by,
            status: assignment.status,
            assigned_at: assignment.assigned_at,
            transferred_at: assignment.transferred_at,
            notes: assignment.notes,
            sync_status: 'synced',
            local_changes: null
          });
        }
        
        console.log('✅ DOCTOR ASSIGNMENTS SYNC DEBUG: Doctor assignments saved to local database');
      }
    } catch (error) {
      console.error('❌ DOCTOR ASSIGNMENTS SYNC DEBUG: Failed to sync doctor assignments:', error);
    }
  }

  /**
   * Sync doctor photos
   */
  private static async syncDoctorPhotos(userId: string): Promise<void> {
    try {
      console.log('🔍 DOCTOR PHOTOS SYNC DEBUG: Starting doctor photos sync');
      
      // Only fetch metadata columns, not photo_data (can be very large base64)
      // Note: doctor_photos table doesn't have updated_at column, only created_at
      const { data, error } = await supabase
        .from('doctor_photos')
        .select('id, user_id, file_name, file_path, mime_type, created_at')
        .eq('user_id', userId)
        .limit(100); // Add limit to prevent hanging on large datasets

      if (error) {
        console.error('❌ DOCTOR PHOTOS SYNC DEBUG: Server error:', error);
        return;
      }

      console.log(`✅ DOCTOR PHOTOS SYNC DEBUG: Found ${data?.length || 0} doctor photos on server`);

      if (data && data.length > 0) {
        // Check which photos already exist locally to avoid unnecessary syncs
        const existingPhotos = await LocalDatabaseService.getDoctorPhotos(userId);
        const existingPhotoIds = new Set(existingPhotos.map(p => p.id));
        
        const photosToSync = data.filter(photo => !existingPhotoIds.has(photo.id));
        const photosToSkip = data.length - photosToSync.length;
        
        if (photosToSkip > 0) {
          console.log(`⏭️ DOCTOR PHOTOS SYNC DEBUG: Skipping ${photosToSkip} photos that already exist locally`);
        }
        
        if (photosToSync.length === 0) {
          console.log('✅ DOCTOR PHOTOS SYNC DEBUG: All photos already synced, skipping');
          return;
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        // Batch process photos (max 5 at a time to avoid blocking)
        const batchSize = 5;
        for (let i = 0; i < photosToSync.length; i += batchSize) {
          const batch = photosToSync.slice(i, i + batchSize);
          const batchPromises = batch.map(async (photo, batchIndex) => {
            try {
              const globalIndex = i + batchIndex + 1;
              console.log(`🔍 DOCTOR PHOTOS SYNC DEBUG: Processing photo ${globalIndex}/${photosToSync.length}: ${photo.file_name || photo.id}`);
              
              // Only sync metadata, not the actual photo data (to avoid large base64 strings)
              await LocalDatabaseService.upsertDoctorPhoto({
                id: photo.id,
                user_id: photo.user_id,
                file_name: photo.file_name,
                file_path: photo.file_path,
                photo_data: undefined, // Don't sync large base64 data - it can be fetched on demand
                mime_type: photo.mime_type,
                created_at: photo.created_at,
                sync_status: 'synced',
                local_changes: null,
                last_synced_at: new Date().toISOString(),
                needs_sync: false
              });
              
              successCount++;
              return true;
            } catch (photoError) {
              errorCount++;
              console.error(`❌ DOCTOR PHOTOS SYNC DEBUG: Failed to sync photo:`, photoError);
              return false;
            }
          });
          
          // Wait for batch to complete before processing next batch
          await Promise.all(batchPromises);
        }
        
        console.log(`✅ DOCTOR PHOTOS SYNC DEBUG: Doctor photos sync completed - ${successCount} synced, ${photosToSkip} skipped, ${errorCount} failed`);
      }
    } catch (error) {
      console.error('❌ DOCTOR PHOTOS SYNC DEBUG: Failed to sync doctor photos:', error);
    }
  }

  /**
   * Sync meetings
   */
  private static async syncMeetings(userId: string): Promise<void> {
    try {
      console.log('🔴 MEETING_SYNC: Starting meetings sync');
      
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('mr_id', userId);

      if (error) {
        console.error('🔴 MEETING_SYNC: Server error:', error);
        return;
      }

      console.log(`🔴 MEETING_SYNC: Found ${data?.length || 0} meetings on server`);

      if (data && data.length > 0) {
        // Get existing local meetings to check for duplicates
        const existingLocalMeetings = await LocalDatabaseService.getMeetings(userId);
        console.log(`🔴 MEETING_SYNC: Found ${existingLocalMeetings.length} existing meetings in local DB`);
        
        for (const meeting of data) {
          const existingMeeting = existingLocalMeetings.find(m => m.server_id === meeting.id);
          
          console.log('🔴 MEETING_SYNC: Processing meeting:', {
            server_id: meeting.id,
            title: meeting.title,
            scheduled_date: meeting.scheduled_date,
            exists_locally: !!existingMeeting
          });
          
          if (existingMeeting) {
            console.log(`🔴 MEETING_SYNC: Meeting already exists locally (ID: ${existingMeeting.id}), will update`);
          } else {
            console.log('🔴 MEETING_SYNC: New meeting, will create in local DB');
          }
          
          await LocalDatabaseService.upsertMeeting({
            id: existingMeeting?.id || meeting.id || '', // Use existing ID if found
            server_id: meeting.id,
            mr_id: meeting.mr_id,
            doctor_id: meeting.doctor_id,
            doctor_server_id: meeting.doctor_id,
            brochure_id: meeting.brochure_id,
            title: meeting.title,
            scheduled_date: meeting.scheduled_date,
            duration_minutes: meeting.duration_minutes || 30,
            status: meeting.status,
            location: meeting.location,
            purpose: meeting.purpose || '',
            notes: meeting.notes,
            follow_up_required: meeting.follow_up_required || false,
            follow_up_date: meeting.follow_up_date,
            follow_up_time: meeting.follow_up_time,
            follow_up_notes: meeting.follow_up_notes,
            presentation_slides: meeting.presentation_slides,
            comments: meeting.comments,
            created_at: existingMeeting?.created_at || meeting.created_at,
            updated_at: meeting.updated_at,
            last_modified: meeting.updated_at,
            version: existingMeeting?.version || 1,
            sync_status: 'synced',
            is_deleted: false,
            local_changes: null
          });
          
          console.log(`🔴 MEETING_SYNC: Meeting ${existingMeeting ? 'updated' : 'created'} successfully`);
        }
        
        console.log('🔴 MEETING_SYNC: Meetings saved to local database');
        
        // Verify no duplicates were created
        const localMeetings = await LocalDatabaseService.getMeetings(userId);
        const serverIds = localMeetings.map(m => m.server_id).filter(id => id);
        const duplicateServerIds = serverIds.filter((id, index) => serverIds.indexOf(id) !== index);
        if (duplicateServerIds.length > 0) {
          console.error(`🔴 MEETING_SYNC: WARNING - Found ${duplicateServerIds.length} duplicate server IDs:`, duplicateServerIds);
        } else {
          console.log('🔴 MEETING_SYNC: No duplicates detected - all server IDs are unique');
        }
        
        // Clean up any remaining duplicates after sync
        try {
          await this.cleanupDuplicateMeetings(userId);
        } catch (cleanupError) {
          console.warn('🔴 MEETING_SYNC: Error cleaning up duplicates:', cleanupError);
        }
      }
    } catch (error) {
      console.error('🔴 MEETING_SYNC: Failed to sync meetings:', error);
    }
  }

  /**
   * Clean up duplicate meetings by doctor_id + scheduled_date + title
   */
  static async cleanupDuplicateMeetings(userId: string): Promise<void> {
    try {
      console.log('🔍 MEETINGS SYNC DEBUG: Cleaning up duplicate meetings...');
      
      const allMeetings = await LocalDatabaseService.getMeetings(userId);
      
      // Group meetings by doctor_id + scheduled_date + title
      const meetingGroups = new Map<string, LocalMeeting[]>();
      
      for (const meeting of allMeetings) {
        const key = `${meeting.doctor_id}_${meeting.scheduled_date}_${meeting.title}`;
        if (!meetingGroups.has(key)) {
          meetingGroups.set(key, []);
        }
        meetingGroups.get(key)!.push(meeting);
      }
      
      let duplicatesRemoved = 0;
      
      for (const [key, meetings] of meetingGroups) {
        if (meetings.length <= 1) continue;
        
        // Keep the one with server_id, or the most recent one
        const keepMeeting = meetings.find(m => m.server_id) || 
                           meetings.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
        const duplicates = meetings.filter(m => m.id !== keepMeeting.id);
        
        for (const duplicate of duplicates) {
          try {
            // Soft delete the duplicate
            await LocalDatabaseService.updateMeeting(duplicate.id, {
              is_deleted: true,
              sync_status: 'synced',
              skipSyncQueue: true
            });
            
            duplicatesRemoved++;
            console.log(`✅ MEETINGS SYNC DEBUG: Removed duplicate meeting: ${duplicate.id} (kept: ${keepMeeting.id})`);
          } catch (error) {
            console.warn(`⚠️ MEETINGS SYNC DEBUG: Error removing duplicate meeting ${duplicate.id}:`, error);
          }
        }
      }
      
      if (duplicatesRemoved > 0) {
        console.log(`✅ MEETINGS SYNC DEBUG: Cleanup complete - removed ${duplicatesRemoved} duplicate meetings`);
      }
    } catch (error) {
      console.error('❌ MEETINGS SYNC DEBUG: Error cleaning up duplicate meetings:', error);
      throw error;
    }
  }

  /**
   * Sync meeting slide notes
   */
  private static async syncMeetingSlideNotes(userId: string): Promise<void> {
    try {
      console.log('🔍 MEETING SLIDE NOTES SYNC DEBUG: Starting meeting slide notes sync');
      
      // Get meetings for this user first
      const { data: meetings, error: meetingsError } = await supabase
        .from('meetings')
        .select('id')
        .eq('mr_id', userId);

      if (meetingsError) {
        console.error('❌ MEETING SLIDE NOTES SYNC DEBUG: Error getting meetings:', meetingsError);
        return;
      }

      if (!meetings || meetings.length === 0) {
        console.log('🔍 MEETING SLIDE NOTES SYNC DEBUG: No meetings found for user');
        return;
      }

      const meetingIds = meetings.map(m => m.id);
      
      const { data, error } = await supabase
        .from('meeting_slide_notes')
        .select('*')
        .in('meeting_id', meetingIds);

      if (error) {
        console.error('❌ MEETING SLIDE NOTES SYNC DEBUG: Server error:', error);
        return;
      }

      console.log(`✅ MEETING SLIDE NOTES SYNC DEBUG: Found ${data?.length || 0} meeting slide notes on server`);

      if (data && data.length > 0) {
        for (const note of data) {
          await LocalDatabaseService.upsertMeetingSlideNote({
            id: note.id,
            meeting_id: note.meeting_id,
            slide_id: note.slide_id,
            slide_title: note.slide_title,
            slide_order: note.slide_order,
            brochure_id: note.brochure_id,
            note_text: note.note_text,
            created_at: note.created_at,
            updated_at: note.updated_at,
            slide_image_uri: note.slide_image_uri,
            sync_status: 'synced',
            local_changes: null,
            last_synced_at: note.updated_at || note.created_at,
            needs_sync: false
          });
        }
        
        console.log('✅ MEETING SLIDE NOTES SYNC DEBUG: Meeting slide notes saved to local database');
        
        // Clean up any remaining duplicates after sync
        try {
          await this.cleanupDuplicateMeetingSlideNotes(userId);
        } catch (cleanupError) {
          console.warn('⚠️ MEETING SLIDE NOTES SYNC DEBUG: Error cleaning up duplicates:', cleanupError);
        }
      }
    } catch (error) {
      console.error('❌ MEETING SLIDE NOTES SYNC DEBUG: Failed to sync meeting slide notes:', error);
    }
  }

  /**
   * Clean up duplicate meeting slide notes by meeting_id + slide_id
   */
  static async cleanupDuplicateMeetingSlideNotes(userId: string): Promise<void> {
    try {
      console.log('🔍 MEETING SLIDE NOTES SYNC DEBUG: Cleaning up duplicate meeting slide notes...');
      
      // Get all meetings for this user
      const meetings = await LocalDatabaseService.getMeetings(userId);
      const meetingIds = meetings.map(m => m.id);
      
      if (meetingIds.length === 0) return;
      
      // Get all notes for these meetings
      const allNotes: any[] = [];
      for (const meetingId of meetingIds) {
        const notes = await LocalDatabaseService.getMeetingNotes(meetingId);
        allNotes.push(...notes);
      }
      
      // Group notes by meeting_id + slide_id
      const noteGroups = new Map<string, any[]>();
      
      for (const note of allNotes) {
        const key = `${note.meeting_id}_${note.slide_id}`;
        if (!noteGroups.has(key)) {
          noteGroups.set(key, []);
        }
        noteGroups.get(key)!.push(note);
      }
      
      let duplicatesRemoved = 0;
      
      for (const [key, notes] of noteGroups) {
        if (notes.length <= 1) continue;
        
        // Keep the one with server_id (synced), or the most recent one
        const keepNote = notes.find((n: any) => n.sync_status === 'synced') || 
                        notes.sort((a: any, b: any) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())[0];
        const duplicates = notes.filter((n: any) => n.id !== keepNote.id);
        
        for (const duplicate of duplicates) {
          try {
            // Soft delete the duplicate
            await LocalDatabaseService.updateMeetingNote(duplicate.id, {
              is_deleted: true,
              sync_status: 'synced'
            });
            
            duplicatesRemoved++;
            console.log(`✅ MEETING SLIDE NOTES SYNC DEBUG: Removed duplicate note: ${duplicate.id} (kept: ${keepNote.id})`);
          } catch (error) {
            console.warn(`⚠️ MEETING SLIDE NOTES SYNC DEBUG: Error removing duplicate note ${duplicate.id}:`, error);
          }
        }
      }
      
      if (duplicatesRemoved > 0) {
        console.log(`✅ MEETING SLIDE NOTES SYNC DEBUG: Cleanup complete - removed ${duplicatesRemoved} duplicate notes`);
      }
    } catch (error) {
      console.error('❌ MEETING SLIDE NOTES SYNC DEBUG: Error cleaning up duplicate notes:', error);
      throw error;
    }
  }

  /**
   * Sync brochures (available brochures)
   * Saves to both brochure_sync table (MR-specific assignments) and brochures table (for dashboard stats)
   */
  private static async syncBrochures(userId: string): Promise<void> {
    try {
      console.log('🔍 BROCHURES SYNC DEBUG: Starting brochures sync for user:', userId);
      
      // Use MRService to get assigned brochures (MR-specific assignments)
      const { MRService } = await import('./MRService');
      const brochuresResult = await MRService.getAssignedBrochures(userId);
      
      if (!brochuresResult.success || !brochuresResult.data) {
        console.error('❌ BROCHURES SYNC DEBUG: Failed to get brochures from server:', brochuresResult.error);
        return;
      }

      console.log(`✅ BROCHURES SYNC DEBUG: Found ${brochuresResult.data.length} brochures on server`);

      if (brochuresResult.data.length > 0) {
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
            local_changes: undefined,
            is_deleted: false
          });
          
          // ALSO save to brochures table (for dashboard stats and public brochures)
          await LocalDatabaseService.upsertBrochure({
            id: brochure.id,
            title: brochure.title,
            category: brochure.category || 'General',
            description: brochure.description,
            file_url: brochure.file_url,
            thumbnail_url: brochure.thumbnail_url,
            pages: brochure.pages,
            file_size: brochure.file_size,
            status: brochure.status || 'active',
            assigned_by: brochure.assigned_by,
            download_count: brochure.download_count || 0,
            view_count: brochure.view_count || 0,
            created_at: brochure.created_at || new Date().toISOString(),
            updated_at: brochure.updated_at || new Date().toISOString(),
            file_name: brochure.file_name,
            file_type: brochure.file_type,
            uploaded_by: brochure.uploaded_by,
            is_public: brochure.is_public || false,
            tags: brochure.tags ? JSON.stringify(brochure.tags) : null,
            version: brochure.version || 1,
            category_id: brochure.category_id,
            sync_status: 'synced',
            local_changes: null,
            last_synced_at: new Date().toISOString(),
            needs_sync: false
          });
          
          // Download actual brochure file if not already downloaded
          if (brochure.file_url) {
            try {
              // Check if file already exists locally
              const downloadDir = FileSystem.documentDirectory + `mr_downloads/${userId}/`;
              const brochureDataResult = await BrochureManagementService.getBrochureData(brochure.id);
              
              let fileExists = false;
              if (brochureDataResult.success && brochureDataResult.data?.filePath) {
                const fileInfo = await FileSystem.getInfoAsync(brochureDataResult.data.filePath);
                fileExists = fileInfo.exists;
              }
              
              if (!fileExists) {
                console.log(`📥 BROCHURES SYNC DEBUG: Downloading brochure file: ${brochure.title}`);
                this.updateProgress('Brochures', `Downloading ${brochure.title}...`, 0, undefined, undefined);
                
                const downloadResult = await BrochureManagementService.downloadBrochureFile(
                  brochure.id,
                  brochure.file_url,
                  userId,
                  brochure.title,
                  (progress) => {
                    this.updateProgress('Brochures', `Downloading ${brochure.title}...`, progress.percentage, undefined, undefined);
                  }
                );
                
                if (downloadResult.success) {
                  console.log(`✅ BROCHURES SYNC DEBUG: Downloaded brochure file: ${brochure.title}`);
                } else {
                  console.warn(`⚠️ BROCHURES SYNC DEBUG: Failed to download brochure file: ${brochure.title} - ${downloadResult.error}`);
                  // Don't fail entire sync if one file download fails
                }
              } else {
                console.log(`⏭️ BROCHURES SYNC DEBUG: Brochure file already exists locally: ${brochure.title}`);
              }
            } catch (error) {
              console.warn(`⚠️ BROCHURES SYNC DEBUG: Error downloading brochure file: ${brochure.title} -`, error);
              // Don't fail entire sync if one file download fails
            }
          }
        }
        
        console.log(`✅ BROCHURES SYNC DEBUG: Saved ${brochuresResult.data.length} brochures to local DB (both brochure_sync and brochures tables)`);
      }
    } catch (error) {
      console.error('❌ BROCHURES SYNC DEBUG: Failed to sync brochures:', error);
    }
  }

  /**
   * Sync brochure categories
   */
  private static async syncBrochureCategories(): Promise<void> {
    try {
      console.log('🔍 BROCHURE CATEGORIES SYNC DEBUG: Starting brochure categories sync');
      
      const { data, error } = await supabase
        .from('brochure_categories')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('❌ BROCHURE CATEGORIES SYNC DEBUG: Server error:', error);
        return;
      }

      console.log(`✅ BROCHURE CATEGORIES SYNC DEBUG: Found ${data?.length || 0} brochure categories on server`);

      if (data && data.length > 0) {
        for (const category of data) {
          await LocalDatabaseService.upsertBrochureCategory({
            id: category.id,
            name: category.name,
            description: category.description,
            color: category.color,
            is_active: category.is_active,
            created_at: category.created_at,
            sync_status: 'synced',
            local_changes: null
          });
        }
        
        console.log('✅ BROCHURE CATEGORIES SYNC DEBUG: Brochure categories saved to local database');
      }
    } catch (error) {
      console.error('❌ BROCHURE CATEGORIES SYNC DEBUG: Failed to sync brochure categories:', error);
    }
  }

  /**
   * Sync saved brochures
   */
  private static async syncSavedBrochures(userId: string): Promise<void> {
    try {
      console.log('🔍 SAVED BROCHURES SYNC DEBUG: Starting saved brochures sync');
      
      const { data, error } = await supabase
        .from('saved_brochures')
        .select('*')
        .eq('mr_id', userId);

      if (error) {
        console.error('❌ SAVED BROCHURES SYNC DEBUG: Server error:', error);
        return;
      }

      console.log(`✅ SAVED BROCHURES SYNC DEBUG: Found ${data?.length || 0} saved brochures on server`);

      if (data && data.length > 0) {
        const totalBrochures = data.length;
        for (let index = 0; index < data.length; index++) {
          const savedBrochure = data[index];
          const currentItem = index + 1;
          
          await LocalDatabaseService.upsertSavedBrochure({
            id: savedBrochure.id,
            server_id: savedBrochure.id,
            mr_id: savedBrochure.mr_id,
            brochure_id: savedBrochure.brochure_id,
            brochure_title: savedBrochure.brochure_title || savedBrochure.custom_title || 'Untitled Brochure',
            custom_title: savedBrochure.custom_title || savedBrochure.brochure_title || 'Untitled Brochure',
            original_brochure_data: savedBrochure.brochure_data || savedBrochure.original_brochure_data || '{}',
            saved_at: savedBrochure.saved_at || savedBrochure.created_at,
            last_accessed: savedBrochure.last_accessed,
            version: savedBrochure.version || 1,
            sync_status: 'synced',
            local_changes: null
          });
          
          // Download actual brochure file if not already downloaded
          try {
            // Extract file_url from original_brochure_data
            let fileUrl: string | null = null;
            try {
              const brochureData = typeof savedBrochure.brochure_data === 'string' 
                ? JSON.parse(savedBrochure.brochure_data) 
                : savedBrochure.brochure_data;
              fileUrl = brochureData?.file_url || brochureData?.fileUrl || null;
            } catch (parseError) {
              console.warn('⚠️ SAVED BROCHURES SYNC DEBUG: Failed to parse brochure_data:', parseError);
            }
            
            // Also check original_brochure_data if file_url not found
            if (!fileUrl && savedBrochure.original_brochure_data) {
              try {
                const originalData = typeof savedBrochure.original_brochure_data === 'string'
                  ? JSON.parse(savedBrochure.original_brochure_data)
                  : savedBrochure.original_brochure_data;
                fileUrl = originalData?.file_url || originalData?.fileUrl || null;
              } catch (parseError) {
                console.warn('⚠️ SAVED BROCHURES SYNC DEBUG: Failed to parse original_brochure_data:', parseError);
              }
            }
            
            if (fileUrl) {
              // Check if file already exists locally
              const downloadDir = FileSystem.documentDirectory + `mr_downloads/${userId}/`;
              const brochureDataResult = await BrochureManagementService.getBrochureData(savedBrochure.brochure_id);
              
              let fileExists = false;
              if (brochureDataResult.success && brochureDataResult.data?.filePath) {
                const fileInfo = await FileSystem.getInfoAsync(brochureDataResult.data.filePath);
                fileExists = fileInfo.exists;
              }
              
              if (!fileExists) {
                const brochureTitle = savedBrochure.brochure_title || savedBrochure.custom_title || 'Untitled Brochure';
                console.log(`📥 SAVED BROCHURES SYNC DEBUG: Downloading saved brochure file: ${brochureTitle} (${currentItem}/${totalBrochures})`);
                this.updateProgress('SavedBrochures', `Downloading ${brochureTitle}...`, 0, currentItem, totalBrochures);
                
                const downloadResult = await BrochureManagementService.downloadBrochureFile(
                  savedBrochure.brochure_id,
                  fileUrl,
                  userId,
                  brochureTitle,
                  (progress) => {
                    // Calculate overall progress: (currentItem - 1) / totalBrochures * 100 + (progress.percentage / totalBrochures)
                    const baseProgress = ((currentItem - 1) / totalBrochures) * 100;
                    const itemProgress = (progress.percentage / totalBrochures);
                    const overallProgress = Math.min(Math.round(baseProgress + itemProgress), 100);
                    this.updateProgress('SavedBrochures', `Downloading ${brochureTitle}...`, overallProgress, currentItem, totalBrochures);
                  }
                );
                
                if (downloadResult.success) {
                  console.log(`✅ SAVED BROCHURES SYNC DEBUG: Downloaded saved brochure file: ${brochureTitle}`);
                } else {
                  console.warn(`⚠️ SAVED BROCHURES SYNC DEBUG: Failed to download saved brochure file: ${brochureTitle} - ${downloadResult.error}`);
                  // Don't fail entire sync if one file download fails
                }
              } else {
                const brochureTitle = savedBrochure.brochure_title || savedBrochure.custom_title || 'Untitled Brochure';
                console.log(`⏭️ SAVED BROCHURES SYNC DEBUG: Saved brochure file already exists locally: ${brochureTitle}`);
                // Update progress even for skipped items
                const skipProgress = Math.round((currentItem / totalBrochures) * 100);
                this.updateProgress('SavedBrochures', `Processing ${brochureTitle}...`, skipProgress, currentItem, totalBrochures);
              }
            } else {
              console.warn('⚠️ SAVED BROCHURES SYNC DEBUG: No file_url found in saved brochure data');
            }
          } catch (error) {
            console.warn(`⚠️ SAVED BROCHURES SYNC DEBUG: Error downloading saved brochure file:`, error);
            // Don't fail entire sync if one file download fails
          }
        }
        
        console.log('✅ SAVED BROCHURES SYNC DEBUG: Saved brochures saved to local database');
        
        // Clean up any remaining duplicates after sync
        try {
          await this.cleanupDuplicateSavedBrochures(userId);
        } catch (cleanupError) {
          console.warn('⚠️ SAVED BROCHURES SYNC DEBUG: Error cleaning up duplicates:', cleanupError);
        }
      }
    } catch (error) {
      console.error('❌ SAVED BROCHURES SYNC DEBUG: Failed to sync saved brochures:', error);
    }
  }

  /**
   * Clean up duplicate saved brochures by brochure_id
   */
  static async cleanupDuplicateSavedBrochures(userId: string): Promise<void> {
    try {
      console.log('🔍 SAVED BROCHURES SYNC DEBUG: Cleaning up duplicate saved brochures...');
      
      const allSavedBrochures = await LocalDatabaseService.getSavedBrochures(userId);
      
      // Group saved brochures by brochure_id
      const brochureGroups = new Map<string, LocalSavedBrochure[]>();
      
      for (const brochure of allSavedBrochures) {
        const key = brochure.brochure_id;
        if (!brochureGroups.has(key)) {
          brochureGroups.set(key, []);
        }
        brochureGroups.get(key)!.push(brochure);
      }
      
      let duplicatesRemoved = 0;
      
      for (const [key, brochures] of brochureGroups) {
        if (brochures.length <= 1) continue;
        
        // Keep the one with server_id, or the most recent one
        const keepBrochure = brochures.find(b => b.server_id) || 
                            brochures.sort((a, b) => new Date(b.saved_at || b.created_at || '').getTime() - new Date(a.saved_at || a.created_at || '').getTime())[0];
        const duplicates = brochures.filter(b => b.id !== keepBrochure.id);
        
        for (const duplicate of duplicates) {
          try {
            // Soft delete the duplicate by updating it
            const duplicateBrochure = await LocalDatabaseService.getSavedBrochureById(duplicate.id);
            if (duplicateBrochure) {
              await LocalDatabaseService.upsertSavedBrochure({
                ...duplicateBrochure,
                is_deleted: true,
                sync_status: 'synced'
              });
            }
            
            duplicatesRemoved++;
            console.log(`✅ SAVED BROCHURES SYNC DEBUG: Removed duplicate saved brochure: ${duplicate.id} (kept: ${keepBrochure.id})`);
          } catch (error) {
            console.warn(`⚠️ SAVED BROCHURES SYNC DEBUG: Error removing duplicate saved brochure ${duplicate.id}:`, error);
          }
        }
      }
      
      if (duplicatesRemoved > 0) {
        console.log(`✅ SAVED BROCHURES SYNC DEBUG: Cleanup complete - removed ${duplicatesRemoved} duplicate saved brochures`);
      }
    } catch (error) {
      console.error('❌ SAVED BROCHURES SYNC DEBUG: Error cleaning up duplicate saved brochures:', error);
      throw error;
    }
  }

  /**
   * Sync MR permissions
   */
  private static async syncMRPermissions(userId: string): Promise<void> {
    try {
      console.log('🔍 MR PERMISSIONS SYNC DEBUG: Starting MR permissions sync');
      
      const { data, error } = await supabase
        .from('mr_permissions')
        .select('*')
        .eq('mr_id', userId);

      if (error) {
        console.error('❌ MR PERMISSIONS SYNC DEBUG: Server error:', error);
        return;
      }

      console.log(`✅ MR PERMISSIONS SYNC DEBUG: Found ${data?.length || 0} MR permissions on server`);

      if (data && data.length > 0) {
        for (const permission of data) {
          // Map server schema to local schema:
          // - permission_type (server) -> permission_key (local)
          // - is_granted (server) -> value (local)
          await LocalDatabaseService.upsertPermission({
            id: permission.id,
            user_id: permission.mr_id || permission.user_id,
            permission_key: permission.permission_type || permission.permission_key,
            value: permission.is_granted !== undefined ? String(permission.is_granted) : (permission.value || 'false'),
            created_at: permission.created_at || permission.granted_at || new Date().toISOString(),
            updated_at: permission.updated_at || permission.granted_at || new Date().toISOString(),
            sync_status: 'synced',
            local_changes: null
          });
        }
        
        console.log('✅ MR PERMISSIONS SYNC DEBUG: MR permissions saved to local database');
      }
    } catch (error) {
      console.error('❌ MR PERMISSIONS SYNC DEBUG: Failed to sync MR permissions:', error);
    }
  }
}

