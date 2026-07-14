/**
 * Offline-First Service
 * Provides offline-first CRUD operations for all entities
 * Automatically syncs with server when online
 */
import { LocalDatabaseService, LocalDoctor, LocalMeeting, LocalMeetingNote, LocalMeetingFollowUp, LocalDoctorAssignment, LocalSavedBrochure } from './localDatabaseService';
import { NetworkService } from './networkService';
import { AuthService } from './AuthService';
import type { MRDashboardStats, MRRecentActivity, MRUpcomingMeeting } from './MRService';

// Request/Response interfaces
export interface CreateDoctorRequest {
  mr_id: string;
  first_name: string;
  last_name: string;
  specialty: string;
  hospital: string;
  phone?: string;
  email?: string;
  location?: string;
  profile_image_url?: string;
  notes?: string;
}

export interface UpdateDoctorRequest {
  first_name?: string;
  last_name?: string;
  specialty?: string;
  hospital?: string;
  phone?: string;
  email?: string;
  location?: string;
  profile_image_url?: string;
  notes?: string;
  relationship_status?: string;
  meetings_count?: number;
  last_meeting_date?: string;
  next_appointment?: string;
}

export interface CreateDoctorAssignmentRequest {
  doctor_id: string;
  doctor_server_id?: string;
  mr_id: string;
  status?: string;
  assigned_by?: string;
  assigned_at?: string;
  transferred_at?: string;
  notes?: string;
}

export interface UpdateDoctorAssignmentRequest {
  status?: string;
  transferred_at?: string;
  notes?: string;
}

export interface CreateMeetingRequest {
  mr_id: string;
  doctor_id: string;
  doctor_server_id?: string;
  brochure_id?: string;
  title: string;
  scheduled_date: string;
  duration_minutes?: number;
  status?: string;
  location?: string;
  purpose?: string;
  notes?: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  follow_up_time?: string;
  follow_up_notes?: string;
  presentation_slides?: string;
  comments?: string;
}

export interface UpdateMeetingRequest {
  title?: string;
  scheduled_date?: string;
  duration_minutes?: number;
  status?: string;
  location?: string;
  purpose?: string;
  notes?: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  follow_up_time?: string;
  follow_up_notes?: string;
  presentation_slides?: string;
  comments?: string;
  brochure_id?: string;
}

export interface CreateMeetingNoteRequest {
  meeting_id: string;
  meeting_server_id?: string;
  slide_id: string;
  slide_title: string;
  slide_order: number;
  brochure_id: string;
  note_text: string;
  slide_image_uri?: string;
}

export interface UpdateMeetingNoteRequest {
  slide_id?: string;
  slide_title?: string;
  slide_order?: number;
  note_text?: string;
  slide_image_uri?: string;
  follow_up_id?: string;
}

export interface CreateMeetingFollowUpRequest {
  meeting_id: string;
  follow_up_date: string;
  follow_up_time: string;
  follow_up_notes?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
}

export interface UpdateMeetingFollowUpRequest {
  follow_up_date?: string;
  follow_up_time?: string;
  follow_up_notes?: string;
  status?: 'scheduled' | 'completed' | 'cancelled';
}

export interface CreateBrochureSyncRequest {
  mr_id: string;
  brochure_id: string;
  brochure_title?: string;
  brochure_data: string;
  last_modified?: string;
}

export interface UpdateBrochureSyncRequest {
  brochure_title?: string;
  brochure_data?: string;
  last_modified?: string;
}

export interface CreateSavedBrochureRequest {
  mr_id: string;
  brochure_id: string;
  brochure_title: string;
  custom_title: string;
  original_brochure_data: string;
  saved_at?: string;
  last_accessed?: string;
}

export interface UpdateSavedBrochureRequest {
  custom_title?: string;
  original_brochure_data?: string;
  last_accessed?: string;
}

// Response interfaces
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  isOffline?: boolean;
}

export class OfflineFirstService {
  // ==================== DOCTORS ====================

  static async createDoctor(payload: CreateDoctorRequest): Promise<ServiceResponse<{ id: string }>> {
    try {
      const id = await LocalDatabaseService.createDoctor({
        mr_id: payload.mr_id,
        first_name: payload.first_name,
        last_name: payload.last_name,
        specialty: payload.specialty,
        hospital: payload.hospital,
        phone: payload.phone,
        email: payload.email,
        location: payload.location,
        profile_image_url: payload.profile_image_url,
        notes: payload.notes,
        relationship_status: 'active',
        meetings_count: 0,
        created_by: payload.mr_id
      });

      const isOnline = await NetworkService.isOnline();
      // Sync queue + syncUpFull handles backup; do not pull server doctors on write.

      return { success: true, data: { id }, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create doctor' };
    }
  }

  static async updateDoctor(id: string, updates: UpdateDoctorRequest): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.updateDoctor(id, updates as Partial<LocalDoctor>);

      const isOnline = await NetworkService.isOnline();
      // Sync queue + syncUpFull handles backup.

      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update doctor' };
    }
  }

  static async deleteDoctor(
    id: string,
    deleteRelatedMeetings: boolean = false,
    checkOnly: boolean = false,
  ): Promise<ServiceResponse<{ hasMeetings: boolean; meetingCount: number }>> {
    try {
      const result = await LocalDatabaseService.deleteDoctor(id, deleteRelatedMeetings, checkOnly);
      
      if (!result.success) {
        return { 
          success: false, 
          error: result.error || 'Failed to delete doctor',
          data: { hasMeetings: result.hasMeetings, meetingCount: result.meetingCount }
        };
      }
      
      const isOnline = await NetworkService.isOnline();
      // Sync queue + syncUpFull handles backup.

      return { 
        success: true, 
        isOffline: !isOnline,
        data: { hasMeetings: result.hasMeetings, meetingCount: result.meetingCount }
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete doctor',
        data: { hasMeetings: false, meetingCount: 0 }
      };
    }
  }

  static async getDoctors(mrId: string): Promise<ServiceResponse<LocalDoctor[]>> {
    try {
      await LocalDatabaseService.ensureReady();

      // Always fetch from local DB first
      const localDoctors = await LocalDatabaseService.getDoctors(mrId);
      
      // The sync process is now handled by UnifiedSyncService, so we don't trigger it here
      // this.enqueueDoctorSync(mrId).catch(console.warn);

      return { success: true, data: localDoctors, isOffline: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load doctors' };
    }
  }

  static async getDoctorsForSelection(): Promise<ServiceResponse<LocalDoctor[]>> {
    try {
      const auth = await AuthService.getCurrentUser();
      if (!auth.success || !auth.user) {
        return { success: false, error: 'User not authenticated' };
      }
      return this.getDoctors(auth.user.id);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load doctors' };
    }
  }

  private static async enqueueDoctorSync(mrId: string) {
    try {
      // Use static import to avoid Metro bundler issues
      const { MRService } = require('./MRService');
      const serverDoctors = await MRService.getDoctors(mrId);
      if (serverDoctors.success && serverDoctors.data) {
        await LocalDatabaseService.mergeDoctors(mrId, serverDoctors.data);
      }
    } catch (error) {
      console.warn('OfflineFirst: background doctor sync failed', error);
    }
  }

  private static async enqueueDoctorSyncById(id: string) {
    try {
      const doctor = await LocalDatabaseService.getDoctorById(id);
      if (!doctor || !doctor.mr_id) return;
      await this.enqueueDoctorSync(doctor.mr_id);
    } catch (error) {
      console.warn('OfflineFirst: doctor sync by id failed', error);
    }
  }

  // ==================== DOCTOR ASSIGNMENTS ====================

  static async createDoctorAssignment(payload: CreateDoctorAssignmentRequest): Promise<ServiceResponse<{ id: string }>> {
    try {
      const id = await LocalDatabaseService.createDoctorAssignment({
        doctor_id: payload.doctor_id,
        doctor_server_id: payload.doctor_server_id,
        mr_id: payload.mr_id,
        status: payload.status || 'active',
        assigned_by: payload.assigned_by,
        assigned_at: payload.assigned_at,
        transferred_at: payload.transferred_at,
        notes: payload.notes,
        needs_sync: true
      });
      return { success: true, data: { id }, isOffline: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create doctor assignment' };
    }
  }

  static async updateDoctorAssignment(id: string, updates: UpdateDoctorAssignmentRequest): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.updateDoctorAssignment(id, updates as Partial<LocalDoctorAssignment>);
      return { success: true, isOffline: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update doctor assignment' };
    }
  }

  static async deleteDoctorAssignment(id: string): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.deleteDoctorAssignment(id);
      return { success: true, isOffline: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete doctor assignment' };
    }
  }

  static async getDoctorAssignments(mrId: string): Promise<ServiceResponse<LocalDoctorAssignment[]>> {
    try {
      await LocalDatabaseService.ensureReady();
      const assignments = await LocalDatabaseService.getDoctorAssignments(mrId);
      return { success: true, data: assignments, isOffline: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load assignments' };
    }
  }

  // ==================== MEETINGS ====================

  static async createMeeting(payload: CreateMeetingRequest): Promise<ServiceResponse<{ id: string }>> {
    try {
      const id = await LocalDatabaseService.createMeeting({
        mr_id: payload.mr_id,
        doctor_id: payload.doctor_id,
        doctor_server_id: payload.doctor_server_id,
        brochure_id: payload.brochure_id,
        title: payload.title,
        scheduled_date: payload.scheduled_date,
        duration_minutes: payload.duration_minutes || 30,
        status: payload.status || 'scheduled',
        location: payload.location,
        purpose: payload.purpose,
        notes: payload.notes,
        follow_up_required: payload.follow_up_required ?? false,
        follow_up_date: payload.follow_up_date,
        follow_up_time: payload.follow_up_time,
        follow_up_notes: payload.follow_up_notes,
        presentation_slides: payload.presentation_slides,
        comments: payload.comments
      });

      const isOnline = await NetworkService.isOnline();
      // Sync queue + syncUpFull handles backup; do not pull server meetings on write.

      return { success: true, data: { id }, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create meeting' };
    }
  }

  static async updateMeeting(id: string, updates: UpdateMeetingRequest): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.updateMeeting(id, updates as Partial<LocalMeeting>);

      const isOnline = await NetworkService.isOnline();
      // Sync queue + syncUpFull handles backup.

      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update meeting' };
    }
  }

  static async deleteMeeting(id: string): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.deleteMeeting(id);
      const isOnline = await NetworkService.isOnline();
      // Sync queue + syncUpFull handles backup.

      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete meeting' };
    }
  }

  static async getMeetings(mrId: string): Promise<ServiceResponse<LocalMeeting[]>> {
    try {
      await LocalDatabaseService.ensureReady();
      const meetings = await LocalDatabaseService.getMeetings(mrId);
      return { success: true, data: meetings, isOffline: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load meetings' };
    }
  }

  private static async enqueueMeetingSync(mrId: string) {
    try {
      // Use static import to avoid Metro bundler issues
      const { MRService } = require('./MRService');
      const serverMeetings = await MRService.getMeetings(mrId);
      if (serverMeetings.success && serverMeetings.data) {
        await LocalDatabaseService.mergeMeetings(mrId, serverMeetings.data);
      }
    } catch (error) {
      console.warn('OfflineFirst: background meeting sync failed', error);
    }
  }

  private static async enqueueMeetingSyncById(id: string) {
    try {
      const meeting = await LocalDatabaseService.getMeetingById(id);
      if (!meeting || !meeting.mr_id) return;
      await this.enqueueMeetingSync(meeting.mr_id);
    } catch (error) {
      console.warn('OfflineFirst: meeting sync by id failed', error);
    }
  }

  // ==================== MEETING NOTES ====================

  static async createMeetingNote(payload: CreateMeetingNoteRequest): Promise<ServiceResponse<{ id: string }>> {
    try {
      const id = await LocalDatabaseService.createMeetingNote({
        meeting_id: payload.meeting_id,
        meeting_server_id: payload.meeting_server_id,
        slide_id: payload.slide_id,
        slide_title: payload.slide_title,
        slide_order: payload.slide_order,
        brochure_id: payload.brochure_id,
        note_text: payload.note_text,
        slide_image_uri: payload.slide_image_uri
      });

      const isOnline = await NetworkService.isOnline();
      if (isOnline) {
        this.enqueueMeetingNoteSyncByMeeting(payload.meeting_id).catch(console.warn);
      }

      return { success: true, data: { id }, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create meeting note' };
    }
  }

  static async updateMeetingNote(id: string, updates: UpdateMeetingNoteRequest): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.updateMeetingNote(id, updates as Partial<LocalMeetingNote>);

      const isOnline = await NetworkService.isOnline();
      if (isOnline) {
        this.enqueueMeetingNoteSyncById(id).catch(console.warn);
      }

      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update meeting note' };
    }
  }

  static async deleteMeetingNote(id: string): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.deleteMeetingNote(id);
      const isOnline = await NetworkService.isOnline();
      if (isOnline) {
        this.enqueueMeetingNoteSyncById(id).catch(console.warn);
      }
      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete meeting note' };
    }
  }

  static async getMeetingNotes(meetingId: string): Promise<ServiceResponse<LocalMeetingNote[]>> {
    try {
      await LocalDatabaseService.ensureReady();
      const notes = await LocalDatabaseService.getMeetingNotes(meetingId);
      const isOnline = await NetworkService.isOnline();
      if (isOnline) {
        this.enqueueMeetingNoteSyncByMeeting(meetingId).catch(console.warn);
      }
      return { success: true, data: notes, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load meeting notes' };
    }
  }

  private static async enqueueMeetingNoteSyncByMeeting(meetingId: string) {
    try {
      const note = await LocalDatabaseService.getMeetingNotes(meetingId);
      // Placeholder for future server merge logic
      console.log('OfflineFirst: meeting note sync stub', note.length);
    } catch (error) {
      console.warn('OfflineFirst: meeting note sync failed', error);
    }
  }

  private static async enqueueMeetingNoteSyncById(id: string) {
    try {
      const note = await LocalDatabaseService.getMeetingNoteById(id);
      if (!note) return;
      await this.enqueueMeetingNoteSyncByMeeting(note.meeting_id);
    } catch (error) {
      console.warn('OfflineFirst: meeting note sync by id failed', error);
    }
  }

  // ==================== MEETING FOLLOW-UPS ====================

  static async createMeetingFollowUp(payload: CreateMeetingFollowUpRequest): Promise<ServiceResponse<{ id: string }>> {
    try {
      const id = await LocalDatabaseService.createMeetingFollowUp({
        meeting_id: payload.meeting_id,
        follow_up_date: payload.follow_up_date,
        follow_up_time: payload.follow_up_time,
        follow_up_notes: payload.follow_up_notes,
        status: payload.status || 'scheduled'
      });

      const isOnline = await NetworkService.isOnline();
      if (isOnline) {
        this.enqueueMeetingFollowUpSyncByMeeting(payload.meeting_id).catch(console.warn);
      }

      return { success: true, data: { id }, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create meeting follow-up' };
    }
  }

  static async updateMeetingFollowUp(id: string, updates: UpdateMeetingFollowUpRequest): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.updateMeetingFollowUp(id, updates as Partial<LocalMeetingFollowUp>);

      const isOnline = await NetworkService.isOnline();
      if (isOnline) {
        this.enqueueMeetingFollowUpSyncById(id).catch(console.warn);
      }

      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update meeting follow-up' };
    }
  }

  static async deleteMeetingFollowUp(id: string): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.deleteMeetingFollowUp(id);

      const isOnline = await NetworkService.isOnline();
      if (isOnline) {
        // Note: Deletion sync is handled by sync queue
      }

      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete meeting follow-up' };
    }
  }

  static async getMeetingFollowUps(meetingId: string): Promise<ServiceResponse<LocalMeetingFollowUp[]>> {
    try {
      await LocalDatabaseService.ensureReady();
      const followUps = await LocalDatabaseService.getMeetingFollowUps(meetingId);
      const isOnline = await NetworkService.isOnline();
      if (isOnline) {
        this.enqueueMeetingFollowUpSyncByMeeting(meetingId).catch(console.warn);
      }
      return { success: true, data: followUps, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load meeting follow-ups' };
    }
  }

  static async getLatestMeetingFollowUp(meetingId: string): Promise<ServiceResponse<LocalMeetingFollowUp | null>> {
    try {
      await LocalDatabaseService.ensureReady();
      const followUp = await LocalDatabaseService.getLatestMeetingFollowUp(meetingId);
      return { success: true, data: followUp };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load latest follow-up' };
    }
  }

  static async getFollowUpCount(meetingId: string): Promise<ServiceResponse<number>> {
    try {
      await LocalDatabaseService.ensureReady();
      const count = await LocalDatabaseService.getFollowUpCount(meetingId);
      return { success: true, data: count };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get follow-up count' };
    }
  }

  private static async enqueueMeetingFollowUpSyncByMeeting(meetingId: string) {
    try {
      const followUps = await LocalDatabaseService.getMeetingFollowUps(meetingId);
      // Follow-ups are already queued via addToSyncQueue in createMeetingFollowUp
      // This method is kept for future server merge logic if needed
      console.log(`OfflineFirst: Found ${followUps.length} follow-ups for meeting ${meetingId} (already queued for sync)`);
    } catch (error) {
      console.warn('OfflineFirst: meeting follow-up sync failed', error);
    }
  }

  private static async enqueueMeetingFollowUpSyncById(id: string) {
    try {
      const followUp = await LocalDatabaseService.getMeetingFollowUpById(id);
      if (!followUp) return;
      // Follow-ups are already queued via addToSyncQueue in createMeetingFollowUp
      console.log(`OfflineFirst: Found follow-up ${id} for meeting ${followUp.meeting_id} (already queued for sync)`);
    } catch (error) {
      console.warn('OfflineFirst: meeting follow-up sync by id failed', error);
    }
  }

  // ==================== BROCHURE CACHE ====================

  static async saveBrochure(payload: CreateSavedBrochureRequest): Promise<ServiceResponse<{ id: string }>> {
    try {
      const id = await LocalDatabaseService.createSavedBrochure({
        mr_id: payload.mr_id,
        brochure_id: payload.brochure_id,
        brochure_title: payload.brochure_title,
        custom_title: payload.custom_title,
        original_brochure_data: payload.original_brochure_data,
        saved_at: payload.saved_at,
        last_accessed: payload.last_accessed
      });
      const isOnline = await NetworkService.isOnline();
      return { success: true, data: { id }, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save brochure' };
    }
  }

  static async updateSavedBrochure(id: string, updates: UpdateSavedBrochureRequest): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.updateSavedBrochure(id, updates as Partial<LocalSavedBrochure>);
      const isOnline = await NetworkService.isOnline();
      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update saved brochure' };
    }
  }

  static async deleteSavedBrochure(id: string): Promise<ServiceResponse<void>> {
    try {
      await LocalDatabaseService.deleteSavedBrochure(id);
      const isOnline = await NetworkService.isOnline();
      return { success: true, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete saved brochure' };
    }
  }

  static async getSavedBrochures(mrId: string): Promise<ServiceResponse<LocalSavedBrochure[]>> {
    try {
      await LocalDatabaseService.ensureReady();
      const records = await LocalDatabaseService.getSavedBrochures(mrId);
      const isOnline = await NetworkService.isOnline();
      return { success: true, data: records, isOffline: !isOnline };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load saved brochures' };
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get sync statistics
   */
  static async getSyncStats(): Promise<ServiceResponse<{ pending: number; failed: number; completed: number; unbackedUp: number }>> {
    try {
      const userId = await this.getCurrentUserId();
      const queueStats = await LocalDatabaseService.getActionableSyncStats();
      const isOnline = await NetworkService.isOnline();

      let unbackedUp = queueStats.pending;
      if (userId) {
        await LocalDatabaseService.reconcileActivityLogSyncState(userId);
        const gaps = await LocalDatabaseService.getBackupGapCounts(userId);
        const entityTotal =
          gaps.saved_brochures +
          gaps.doctors +
          gaps.meetings +
          gaps.meeting_followups +
          gaps.meeting_notes +
          gaps.brochure_sync +
          gaps.activity_logs +
          gaps.doctor_photos;
        unbackedUp = Math.max(entityTotal, queueStats.pending);
      }
      
      return { 
        success: true, 
        data: {
          ...queueStats,
          unbackedUp,
        },
        isOffline: !isOnline
      };
    } catch (error) {
      console.error('OfflineFirst: Failed to get sync stats:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get sync stats'
      };
    }
  }

  /**
   * Check if app is in offline mode
   */
  static async isOfflineMode(): Promise<boolean> {
    return !(await NetworkService.isOnline());
  }

  /**
   * Get current user ID for database operations
   */
  static async getCurrentUserId(): Promise<string | null> {
    try {
      const userResult = await AuthService.getCurrentUser();
      return userResult.success && userResult.user ? userResult.user.id : null;
    } catch (error) {
      console.error('OfflineFirst: Failed to get current user ID:', error);
      return null;
    }
  }

  static async getDashboardStats(userId?: string): Promise<ServiceResponse<MRDashboardStats>> {
    try {
      // Get userId from parameter or AuthService
      let userIdToUse = userId;
      if (!userIdToUse) {
        const auth = await AuthService.getCurrentUser();
        if (!auth.success || !auth.user) {
          return { success: false, error: 'User not authenticated' };
        }
        userIdToUse = auth.user.id;
      }

      const localStats = await LocalDatabaseService.getDashboardStats(userIdToUse);
      
      // The UnifiedSyncService will handle triggering a background sync if needed
      // No direct network call here to ensure the UI is always fast and responsive.

      // Get brochures available count from local database stats
      // This is now included in localStats.brochures_available
      const brochuresAvailable = localStats.brochures_available || 0;
      console.log('🔍 DASHBOARD STATS DEBUG: Brochures available from local stats:', brochuresAvailable);
      
      return { 
        success: true, 
        data: {
          doctors_connected: localStats.doctors_connected,
          scheduled_meetings: localStats.scheduled_meetings,
          brochures_available: brochuresAvailable,
          active_presentations: localStats.active_presentations,
          monthly_meetings: localStats.monthly_meetings,
          completed_meetings: localStats.completed_meetings,
          brochures_uploaded: localStats.brochures_uploaded,
        },
        isOffline: true 
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load dashboard stats' };
    }
  }

  static async getRecentActivities(limit: number, userId?: string): Promise<ServiceResponse<MRRecentActivity[]>> {
    try {
      // Get userId from parameter or AuthService
      let userIdToUse = userId;
      if (!userIdToUse) {
        const auth = await AuthService.getCurrentUser();
        if (!auth.success || !auth.user) {
          return { success: false, error: 'User not authenticated' };
        }
        userIdToUse = auth.user.id;
      }
      const activities = await LocalDatabaseService.getRecentActivities(userIdToUse, limit);
      return { success: true, data: activities, isOffline: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load recent activities' };
    }
  }

  static async getUpcomingMeetings(limit: number, userId?: string): Promise<ServiceResponse<MRUpcomingMeeting[]>> {
    try {
      // Get userId from parameter or AuthService
      let userIdToUse = userId;
      if (!userIdToUse) {
        const auth = await AuthService.getCurrentUser();
        if (!auth.success || !auth.user) {
          return { success: false, error: 'User not authenticated' };
        }
        userIdToUse = auth.user.id;
      }
      const meetings = await LocalDatabaseService.getUpcomingMeetings(userIdToUse, limit);
      return { success: true, data: meetings, isOffline: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load upcoming meetings' };
    }
  }
}
