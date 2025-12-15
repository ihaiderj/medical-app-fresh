/**
 * Unified Data Service
 * Single source of truth for all data operations (doctors, meetings, notes)
 * Handles both online and offline scenarios with automatic sync
 */
import { AuthService } from './AuthService';
import { LocalDatabaseService } from './localDatabaseService';
import { OfflineFirstService } from './offlineFirstService';

export interface UnifiedDoctor {
  id: string;
  server_id?: string;
  first_name: string;
  last_name: string;
  specialty: string;
  hospital: string;
  phone?: string;
  email?: string;
  location?: string;
  profile_image_url?: string;
  created_at: string;
  updated_at: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  is_deleted: boolean;
}

export interface UnifiedMeeting {
  id: string;
  server_id?: string;
  title: string;
  purpose: string;
  scheduled_date: string;
  time: string;
  duration_minutes: number;
  doctor_id: string;
  doctor_name?: string;
  notes?: string;
  status: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  follow_up_time?: string;
  follow_up_notes?: string;
  created_at: string;
  updated_at: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  is_deleted: boolean;
}

const deriveMeetingTime = (scheduledDate?: string): string => {
  if (!scheduledDate) {
    return '';
  }
  const parsed = new Date(scheduledDate);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return `${parsed.getHours().toString().padStart(2, '0')}:${parsed.getMinutes().toString().padStart(2, '0')}`;
};

const parseTimestamp = (value?: string): number => {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const doctorKey = (doctor: UnifiedDoctor): string => {
  const normalizedServerId = doctor.server_id?.trim();
  if (normalizedServerId) {
    return normalizedServerId;
  }

  return doctor.id;
};

const mergeDoctorRecords = (primary: UnifiedDoctor, secondary: UnifiedDoctor): UnifiedDoctor => {
  const primaryUpdated = parseTimestamp(primary.updated_at);
  const secondaryUpdated = parseTimestamp(secondary.updated_at);

  const preferred = primaryUpdated >= secondaryUpdated ? primary : secondary;
  const fallback = preferred === primary ? secondary : primary;

  const hasPending = primary.sync_status === 'pending' || secondary.sync_status === 'pending';

  return {
    ...fallback,
    ...preferred,
    id: preferred.id,
    server_id: preferred.server_id || fallback.server_id,
    phone: preferred.phone || fallback.phone,
    email: preferred.email || fallback.email,
    location: preferred.location || fallback.location,
    profile_image_url: preferred.profile_image_url || fallback.profile_image_url,
    sync_status: hasPending ? 'pending' : preferred.sync_status,
    created_at: parseTimestamp(preferred.created_at) <= parseTimestamp(fallback.created_at)
      ? preferred.created_at
      : fallback.created_at,
    updated_at: preferred.updated_at || fallback.updated_at,
    is_deleted: preferred.is_deleted && fallback.is_deleted,
  };
};

const dedupeDoctors = (doctors: UnifiedDoctor[]): UnifiedDoctor[] => {
  const map = new Map<string, UnifiedDoctor>();

  doctors.forEach((doctor) => {
    const key = doctorKey(doctor);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, doctor);
    } else {
      const merged = mergeDoctorRecords(existing, doctor);
      map.set(key, merged);
    }
  });

  return Array.from(map.values());
};

const meetingKey = (meeting: UnifiedMeeting): string => {
  const normalizedServerId = meeting.server_id?.trim();
  if (normalizedServerId) {
    return `server_${normalizedServerId}`;
  }

  // For local meetings without server_id, use doctor_id + scheduled_date + title
  // This matches the cleanupDuplicateMeetings logic
  const doctorId = meeting.doctor_id || '';
  const scheduledDate = meeting.scheduled_date || '';
  const title = meeting.title || '';
  return `local_${doctorId}_${scheduledDate}_${title}`;
};

const mergeMeetingRecords = (primary: UnifiedMeeting, secondary: UnifiedMeeting): UnifiedMeeting => {
  const primaryUpdated = parseTimestamp(primary.updated_at);
  const secondaryUpdated = parseTimestamp(secondary.updated_at);
  const preferred = primaryUpdated >= secondaryUpdated ? primary : secondary;
  const fallback = preferred === primary ? secondary : primary;
  const hasPending = primary.sync_status === 'pending' || secondary.sync_status === 'pending';

  return {
    ...fallback,
    ...preferred,
    id: preferred.id,
    server_id: preferred.server_id || fallback.server_id,
    doctor_id: preferred.doctor_id || fallback.doctor_id,
    doctor_name: preferred.doctor_name || fallback.doctor_name,
    purpose: preferred.purpose || fallback.purpose,
    notes: preferred.notes || fallback.notes,
    status: preferred.status || fallback.status,
    scheduled_date: preferred.scheduled_date || fallback.scheduled_date,
    duration_minutes: preferred.duration_minutes || fallback.duration_minutes,
    created_at: parseTimestamp(preferred.created_at) <= parseTimestamp(fallback.created_at)
      ? preferred.created_at
      : fallback.created_at,
    updated_at: preferred.updated_at || fallback.updated_at,
    sync_status: hasPending ? 'pending' : preferred.sync_status,
    is_deleted: preferred.is_deleted && fallback.is_deleted,
    time: deriveMeetingTime(preferred.scheduled_date || fallback.scheduled_date),
  };
};

const dedupeMeetings = (meetings: UnifiedMeeting[]): UnifiedMeeting[] => {
  const map = new Map<string, UnifiedMeeting>();

  meetings.forEach((meeting) => {
    const key = meetingKey(meeting);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, meeting);
    } else {
      const merged = mergeMeetingRecords(existing, meeting);
      map.set(key, merged);
    }
  });

  return Array.from(map.values());
};

export class UnifiedDataService {
  /**
   * Get all doctors for current user (unified from local DB)
   */
  static async getDoctors(userId?: string): Promise<{ success: boolean; data?: UnifiedDoctor[]; error?: string }> {
    try {
      // Get userId from parameter or AuthService
      let userIdToUse = userId;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return { success: false, error: 'User not authenticated' };
        }
        userIdToUse = userResult.user.id;
      }

      // Always use local database as source of truth
      const localDoctors = await LocalDatabaseService.getDoctors(userIdToUse);

      // Transform local data to unified format
      const unifiedDoctors: UnifiedDoctor[] = localDoctors.map(doctor => ({
        id: doctor.id,
        server_id: doctor.server_id,
        first_name: doctor.first_name,
        last_name: doctor.last_name,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
        phone: doctor.phone,
        email: doctor.email,
        location: doctor.location,
        profile_image_url: doctor.profile_image_url,
        created_at: doctor.created_at,
        updated_at: doctor.updated_at,
        sync_status: doctor.sync_status,
        is_deleted: doctor.is_deleted
      }));

      const dedupedDoctors = dedupeDoctors(unifiedDoctors);

      return { success: true, data: dedupedDoctors };
    } catch (error) {
      console.error('UnifiedDataService.getDoctors error:', error);
      return { success: false, error: 'Failed to load doctors' };
    }
  }

  /**
   * Get all meetings for current user (unified from local DB)
   */
  static async getMeetings(userId?: string): Promise<{ success: boolean; data?: UnifiedMeeting[]; error?: string }> {
    try {
      // Get userId from parameter or AuthService
      let userIdToUse = userId;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return { success: false, error: 'User not authenticated' };
        }
        userIdToUse = userResult.user.id;
      }

      // Always use local database as source of truth
      const localMeetings = await LocalDatabaseService.getMeetings(userIdToUse);

      // Filter out deleted meetings first
      const activeMeetings = localMeetings.filter(meeting => !meeting.is_deleted);

      // Transform local data to unified format
      const unifiedMeetings: UnifiedMeeting[] = activeMeetings.map(meeting => ({
        id: meeting.id,
        server_id: meeting.server_id,
        title: meeting.title,
        purpose: meeting.purpose || '',
        scheduled_date: meeting.scheduled_date,
        time: deriveMeetingTime(meeting.scheduled_date),
        duration_minutes: meeting.duration_minutes,
        doctor_id: meeting.doctor_id,
        doctor_name: (meeting as any).doctor_name,
        notes: meeting.notes,
        status: meeting.status,
        follow_up_required: meeting.follow_up_required,
        follow_up_date: meeting.follow_up_date,
        follow_up_time: meeting.follow_up_time,
        follow_up_notes: meeting.follow_up_notes,
        created_at: meeting.created_at,
        updated_at: meeting.updated_at,
        sync_status: meeting.sync_status,
        is_deleted: meeting.is_deleted
      }));

      const dedupedMeetings = dedupeMeetings(unifiedMeetings);

      return { success: true, data: dedupedMeetings };
    } catch (error) {
      console.error('UnifiedDataService.getMeetings error:', error);
      return { success: false, error: 'Failed to load meetings' };
    }
  }

  /**
   * Create a new doctor (unified operation)
   */
  static async createDoctor(doctorData: {
    first_name: string;
    last_name: string;
    specialty: string;
    hospital: string;
    phone?: string;
    email?: string;
    location?: string;
    profile_image_url?: string;
  }, userId?: string): Promise<{ success: boolean; data?: UnifiedDoctor; error?: string }> {
    try {
      // Get userId from parameter or AuthService
      let userIdToUse = userId;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return { success: false, error: 'User not authenticated' };
        }
        userIdToUse = userResult.user.id;
      }

      // Use offline-first service for creation
      const result = await OfflineFirstService.createDoctor({
        ...doctorData,
        mr_id: userIdToUse
      });

      if (result.success && result.data?.id) {
        const doctorRecord = await LocalDatabaseService.getDoctorById(result.data.id);
        if (!doctorRecord) {
          return { success: false, error: 'Doctor saved locally but could not be loaded' };
        }
        // Transform to unified format
        const unifiedDoctor: UnifiedDoctor = {
          id: doctorRecord.id,
          server_id: doctorRecord.server_id,
          first_name: doctorRecord.first_name,
          last_name: doctorRecord.last_name,
          specialty: doctorRecord.specialty,
          hospital: doctorRecord.hospital,
          phone: doctorRecord.phone,
          email: doctorRecord.email,
          location: doctorRecord.location,
          profile_image_url: doctorRecord.profile_image_url,
          created_at: doctorRecord.created_at,
          updated_at: doctorRecord.updated_at,
          sync_status: doctorRecord.sync_status,
          is_deleted: doctorRecord.is_deleted
        };

        return { success: true, data: unifiedDoctor };
      }

      return { success: false, error: result.error || 'Failed to create doctor' };
    } catch (error) {
      console.error('UnifiedDataService.createDoctor error:', error);
      return { success: false, error: 'Failed to create doctor' };
    }
  }

  /**
   * Create a new meeting (unified operation)
   */
  static async createMeeting(meetingData: {
    title: string;
    purpose: string;
    scheduled_date: string;
    time: string;
    duration_minutes: number;
    doctor_id: string;
    notes?: string;
  }, userId?: string): Promise<{ success: boolean; data?: UnifiedMeeting; error?: string }> {
    try {
      // Get userId from parameter or AuthService
      let userIdToUse = userId;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return { success: false, error: 'User not authenticated' };
        }
        userIdToUse = userResult.user.id;
      }

      // Use offline-first service for creation
      const { time: _time, ...meetingPayload } = meetingData;

      const result = await OfflineFirstService.createMeeting({
        ...meetingPayload,
        mr_id: userIdToUse
      });

      if (result.success && result.data?.id) {
        const meetingRecord = await LocalDatabaseService.getMeetingById(result.data.id);
        if (!meetingRecord) {
          return { success: false, error: 'Meeting saved locally but could not be loaded' };
        }
        // Transform to unified format
        const unifiedMeeting: UnifiedMeeting = {
          id: meetingRecord.id,
          server_id: meetingRecord.server_id,
          title: meetingRecord.title,
          purpose: meetingRecord.purpose || '',
          scheduled_date: meetingRecord.scheduled_date,
          time: deriveMeetingTime(meetingRecord.scheduled_date),
          duration_minutes: meetingRecord.duration_minutes,
          doctor_id: meetingRecord.doctor_id,
          doctor_name: (meetingRecord as any).doctor_name,
          notes: meetingRecord.notes,
          status: meetingRecord.status,
          created_at: meetingRecord.created_at,
          updated_at: meetingRecord.updated_at,
          sync_status: meetingRecord.sync_status,
          is_deleted: meetingRecord.is_deleted
        };

        return { success: true, data: unifiedMeeting };
      }

      return { success: false, error: result.error || 'Failed to create meeting' };
    } catch (error) {
      console.error('UnifiedDataService.createMeeting error:', error);
      return { success: false, error: 'Failed to create meeting' };
    }
  }

  /**
   * Delete a doctor (unified operation)
   * Returns information about related meetings if they exist
   */
  static async deleteDoctor(doctorId: string, deleteRelatedMeetings: boolean = false): Promise<{ 
    success: boolean; 
    error?: string;
    hasMeetings?: boolean;
    meetingCount?: number;
  }> {
    try {
      const userResult = await AuthService.getCurrentUser();
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Use offline-first service for deletion
      const result = await OfflineFirstService.deleteDoctor(doctorId, deleteRelatedMeetings);
      
      if (result.success && result.data) {
        return { 
          success: true,
          hasMeetings: result.data.hasMeetings,
          meetingCount: result.data.meetingCount
        };
      }
      
      return { 
        success: false, 
        error: result.error || 'Failed to delete doctor',
        hasMeetings: result.data?.hasMeetings,
        meetingCount: result.data?.meetingCount
      };
    } catch (error) {
      console.error('UnifiedDataService.deleteDoctor error:', error);
      return { success: false, error: 'Failed to delete doctor' };
    }
  }

  /**
   * Delete a meeting (unified operation)
   */
  static async deleteMeeting(meetingId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const userResult = await AuthService.getCurrentUser();
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Use offline-first service for deletion
      const result = await OfflineFirstService.deleteMeeting(meetingId);
      return result;
    } catch (error) {
      console.error('UnifiedDataService.deleteMeeting error:', error);
      return { success: false, error: 'Failed to delete meeting' };
    }
  }

  /**
   * Update an existing doctor (unified operation)
   */
  static async updateDoctor(doctorId: string, doctorData: {
    first_name?: string;
    last_name?: string;
    specialty?: string;
    hospital?: string;
    phone?: string;
    email?: string;
    location?: string;
    profile_image_url?: string;
  }): Promise<{ success: boolean; data?: UnifiedDoctor; error?: string }> {
    try {
      const userResult = await AuthService.getCurrentUser();
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'User not authenticated' };
      }

      // Use offline-first service for update
      const result = await OfflineFirstService.updateDoctor(doctorId, doctorData);

      if (result.success) {
        const doctorRecord = await LocalDatabaseService.getDoctorById(doctorId);
        if (!doctorRecord) {
          return { success: false, error: 'Doctor updated but could not be loaded' };
        }
        // Transform to unified format
        const unifiedDoctor: UnifiedDoctor = {
          id: doctorRecord.id,
          server_id: doctorRecord.server_id,
          first_name: doctorRecord.first_name,
          last_name: doctorRecord.last_name,
          specialty: doctorRecord.specialty,
          hospital: doctorRecord.hospital,
          phone: doctorRecord.phone,
          email: doctorRecord.email,
          location: doctorRecord.location,
          profile_image_url: doctorRecord.profile_image_url,
          created_at: doctorRecord.created_at,
          updated_at: doctorRecord.updated_at,
          sync_status: doctorRecord.sync_status,
          is_deleted: doctorRecord.is_deleted
        };

        return { success: true, data: unifiedDoctor };
      }

      return { success: false, error: result.error || 'Failed to update doctor' };
    } catch (error) {
      console.error('UnifiedDataService.updateDoctor error:', error);
      return { success: false, error: 'Failed to update doctor' };
    }
  }

  /**
   * Update an existing meeting (unified operation)
   */
  static async updateMeeting(meetingId: string, meetingData: {
    title?: string;
    purpose?: string;
    scheduled_date?: string;
    time?: string;
    duration_minutes?: number;
    doctor_id?: string;
    notes?: string;
  }, userId?: string): Promise<{ success: boolean; data?: UnifiedMeeting; error?: string }> {
    try {
      // Get userId from parameter or AuthService
      let userIdToUse = userId;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return { success: false, error: 'User not authenticated' };
        }
        userIdToUse = userResult.user.id;
      }

      // Use offline-first service for update
      const { time: _time, ...meetingPayload } = meetingData;
      const result = await OfflineFirstService.updateMeeting(meetingId, meetingPayload);

      if (result.success) {
        const meetingRecord = await LocalDatabaseService.getMeetingById(meetingId);
        if (!meetingRecord) {
          return { success: false, error: 'Meeting updated but could not be loaded' };
        }
        // Transform to unified format
        const unifiedMeeting: UnifiedMeeting = {
          id: meetingRecord.id,
          server_id: meetingRecord.server_id,
          title: meetingRecord.title,
          purpose: meetingRecord.purpose || '',
          scheduled_date: meetingRecord.scheduled_date,
          time: deriveMeetingTime(meetingRecord.scheduled_date),
          duration_minutes: meetingRecord.duration_minutes,
          doctor_id: meetingRecord.doctor_id,
          doctor_name: (meetingRecord as any).doctor_name,
          notes: meetingRecord.notes,
          status: meetingRecord.status,
          created_at: meetingRecord.created_at,
          updated_at: meetingRecord.updated_at,
          sync_status: meetingRecord.sync_status,
          is_deleted: meetingRecord.is_deleted
        };

        return { success: true, data: unifiedMeeting };
      }

      return { success: false, error: result.error || 'Failed to update meeting' };
    } catch (error) {
      console.error('UnifiedDataService.updateMeeting error:', error);
      return { success: false, error: 'Failed to update meeting' };
    }
  }

  /**
   * Get doctors for selection (used in forms)
   */
  static async getDoctorsForSelection(userId?: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const result = await this.getDoctors(userId);
      if (result.success && result.data) {
        const seen = new Set<string>();
        const doctorsForSelection = result.data
          .filter(doctor => !doctor.is_deleted)
          .filter(doctor => {
            const key = doctor.server_id || doctor.id;
            if (seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          })
          .map(doctor => ({
            id: doctor.id,
            first_name: doctor.first_name,
            last_name: doctor.last_name,
            specialty: doctor.specialty,
            hospital: doctor.hospital,
            profile_image_url: doctor.profile_image_url,
            name: `${doctor.first_name} ${doctor.last_name}`.trim()
          }));
        
        return { success: true, data: doctorsForSelection };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('UnifiedDataService.getDoctorsForSelection error:', error);
      return { success: false, error: 'Failed to load doctors for selection' };
    }
  }
}
