import { apiClient, ApiError } from './apiClient'
import { resolveMediaUrl } from '../config/apiConfig'
import { AuthService } from './AuthService'
import { NetworkService } from './networkService'
import { resolveServerBrochureId } from '../utils/brochureTypeUtils'
import * as FileSystem from 'expo-file-system'

export interface MRDashboardStats {
  active_presentations: number
  scheduled_meetings: number
  doctors_connected: number
  monthly_meetings: number
  completed_meetings: number
  brochures_uploaded: number
  brochures_available: number
}

export interface MRRecentActivity {
  id: string
  activity_type: string
  description: string
  created_at: string
}

export interface MRAssignedBrochure {
  brochure_id?: string
  id: string
  title: string
  category: string
  description?: string
  thumbnail_url?: string
  view_count: number
  download_count: number
  uploaded_by_name: string
  created_at: string
  updated_at?: string
  file_url?: string
  file_name?: string
  file_type?: string
}

export interface MRUpcomingMeeting {
  meeting_id: string
  doctor_name: string
  hospital: string
  scheduled_date: string
  status: string
  notes?: string
}

export interface MRPerformanceSummary {
  total_meetings_this_month: number
  completed_meetings_this_month: number
  total_doctors_assigned: number
  brochures_uploaded_this_month: number
  completion_rate: number
}

export interface MRAssignedDoctor {
  doctor_id: string
  first_name: string
  last_name: string
  specialty: string
  hospital: string
  phone?: string
  email?: string
  location?: string
  relationship_status: string
  meetings_count: number
  last_meeting_date?: string
  next_meeting_date?: string
  notes?: string
  created_at: string
  profile_image_url?: string
}

export interface MRMeeting {
  meeting_id: string
  id?: string
  title: string
  doctor_id: string
  doctor_name: string
  doctor_first_name?: string
  doctor_last_name?: string
  doctor_specialty: string
  hospital: string
  scheduled_date: string
  meeting_date?: string
  duration_minutes: number
  status: string
  purpose?: string
  notes?: string
  brochure_title?: string
  brochure_id?: string
  notes_count: number
  last_note_date?: string
  follow_up_required?: boolean
  follow_up_date?: string | null
  follow_up_time?: string | null
  follow_up_notes?: string | null
  profile_image_url?: string | null
  created_at: string
  updated_at: string
}

export interface SlideNote {
  note_id: string
  slide_id: string
  slide_title: string
  slide_order: number
  note_text: string
  brochure_id?: string
  brochure_title?: string
  slide_image_uri?: string
  follow_up_id?: string
  created_at: string
  updated_at: string
}

export interface MeetingDetails {
  meeting: MRMeeting
  slide_notes: SlideNote[]
}

export interface MRPresentation {
  presentation_id: string
  title: string
  category: string
  description?: string
  thumbnail_url?: string
  total_slides: number
  times_used: number
  last_used_date?: string
  view_count: number
  download_count: number
  created_at: string
}

function serviceError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

export class MRService {
  static async getDashboardStats(_mrId: string): Promise<{ success: boolean; data?: MRDashboardStats; error?: string }> {
    try {
      const data = await apiClient.get<MRDashboardStats>('/api/mr/dashboard/stats/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch MR dashboard stats') }
    }
  }

  static async getRecentActivities(_mrId: string, limit: number = 5): Promise<{ success: boolean; data?: MRRecentActivity[]; error?: string }> {
    try {
      const data = await apiClient.get<MRRecentActivity[]>('/api/mr/dashboard/activities/', { query: { limit } })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch MR recent activities') }
    }
  }

  /** Server activity log ids for reconciliation (local is source of truth on sync-up). */
  static async listActivityLogIds(
    _mrId: string,
    limit: number = 500,
  ): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const result = await this.getRecentActivities(_mrId, limit)
    if (!result.success) {
      return { success: false, error: result.error }
    }
    const ids = (result.data || [])
      .map((row) => String(row.id || '').trim())
      .filter(Boolean)
    return { success: true, data: ids }
  }

  /** Server follow-up ids for reconciliation across all MR meetings. */
  static async listServerFollowUpIds(
    mrId: string,
  ): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const meetingsResult = await this.getMeetings(mrId)
    if (!meetingsResult.success) {
      return { success: false, error: meetingsResult.error || 'Failed to fetch meetings' }
    }

    const ids: string[] = []
    for (const meeting of meetingsResult.data || []) {
      const meetingId = String(meeting.meeting_id || meeting.id || '')
      if (!meetingId) continue

      const followUpsResult = await this.getMeetingFollowUps(meetingId)
      if (!followUpsResult.success || !followUpsResult.data) continue

      for (const row of followUpsResult.data as Array<{ follow_up_id?: string; followup_id?: string; id?: string }>) {
        const followUpId = String(row.follow_up_id || row.followup_id || row.id || '').trim()
        if (followUpId) ids.push(followUpId)
      }
    }

    return { success: true, data: ids }
  }

  /** Server meeting note ids for reconciliation across all MR meetings. */
  static async listServerMeetingNoteIds(
    mrId: string,
  ): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const meetingsResult = await this.getMeetings(mrId)
    if (!meetingsResult.success) {
      return { success: false, error: meetingsResult.error || 'Failed to fetch meetings' }
    }

    const ids: string[] = []
    for (const meeting of meetingsResult.data || []) {
      const meetingId = String(meeting.meeting_id || meeting.id || '')
      if (!meetingId) continue

      const detailsResult = await this.getMeetingDetails(meetingId)
      if (!detailsResult.success || !detailsResult.data?.slide_notes) continue

      for (const note of detailsResult.data.slide_notes) {
        const noteId = String(
          (note as any).note_id || (note as any).id || '',
        ).trim()
        if (noteId) ids.push(noteId)
      }
    }

    return { success: true, data: ids }
  }

  static async getAssignedBrochures(_mrId: string): Promise<{ success: boolean; data?: MRAssignedBrochure[]; error?: string }> {
    try {
      const data = await apiClient.get<MRAssignedBrochure[]>('/api/mr/brochures/')
      const brochures = (data || []).map((brochure) => ({
        ...brochure,
        file_url: brochure.file_url ? resolveMediaUrl(brochure.file_url) : brochure.file_url,
        thumbnail_url: brochure.thumbnail_url ? resolveMediaUrl(brochure.thumbnail_url) : brochure.thumbnail_url,
      }))
      return { success: true, data: brochures }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch assigned brochures') }
    }
  }

  static async getBrochureById(brochureId: string): Promise<MRAssignedBrochure | null> {
    try {
      const result = await this.getAssignedBrochures('')
      const brochures = result.data || []
      return brochures.find((b) => b.id === brochureId || b.brochure_id === brochureId) || null
    } catch {
      return null
    }
  }

  /**
   * After backend migration, local copies may still reference an old catalog UUID.
   * Resolve a live catalog id by exact id first, then by normalized title.
   */
  static async resolveCatalogBrochureId(options: {
    brochureId?: string | null
    title?: string | null
  }): Promise<{ id: string; title: string } | null> {
    const result = await this.getAssignedBrochures('')
    if (!result.success || !result.data?.length) {
      return null
    }

    const catalog = result.data
    const wantedId = resolveServerBrochureId(options.brochureId || '')
    if (wantedId) {
      const byId = catalog.find(
        (b) => String(b.id) === wantedId || String(b.brochure_id || '') === wantedId,
      )
      if (byId) {
        return { id: String(byId.id || byId.brochure_id), title: byId.title || '' }
      }
    }

    const norm = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    const wantedTitle = norm(options.title)
    if (!wantedTitle) {
      return null
    }

    const byTitle = catalog.find((b) => norm(b.title) === wantedTitle)
    if (!byTitle) {
      return null
    }
    return { id: String(byTitle.id || byTitle.brochure_id), title: byTitle.title || '' }
  }

  static async getUpcomingMeetings(_mrId: string, limit: number = 5): Promise<{ success: boolean; data?: MRUpcomingMeeting[]; error?: string }> {
    try {
      const data = await apiClient.get<MRUpcomingMeeting[]>('/api/mr/meetings/upcoming/', { query: { limit } })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch upcoming meetings') }
    }
  }

  static async getPerformanceSummary(_mrId: string): Promise<{ success: boolean; data?: MRPerformanceSummary; error?: string }> {
    try {
      const data = await apiClient.get<MRPerformanceSummary>('/api/mr/dashboard/performance/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch performance summary') }
    }
  }

  static async getAssignedDoctors(_mrId: string): Promise<{ success: boolean; data?: MRAssignedDoctor[]; error?: string }> {
    try {
      const data = await apiClient.get<MRAssignedDoctor[]>('/api/mr/doctors/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch assigned doctors') }
    }
  }

  static async getPresentations(_mrId: string): Promise<{ success: boolean; data?: MRPresentation[]; error?: string }> {
    try {
      const data = await apiClient.get<MRPresentation[]>('/api/mr/presentations/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch presentations') }
    }
  }

  static async createDoctorAssignment(
    _mrId: string,
    firstName: string,
    lastName: string,
    specialty: string,
    hospital: string,
    phone?: string,
    email?: string,
    location?: string,
    notes?: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return this.addDoctor('', {
      first_name: firstName,
      last_name: lastName,
      specialty,
      hospital,
      phone,
      email,
      location,
      notes,
    })
  }

  static async updateDoctorAssignment(
    doctorId: string,
    firstName: string,
    lastName: string,
    specialty: string,
    hospital: string,
    phone?: string,
    email?: string,
    location?: string,
    notes?: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return this.updateDoctor(doctorId, {
      first_name: firstName,
      last_name: lastName,
      specialty,
      hospital,
      phone,
      email,
      location,
      notes,
    })
  }

  static async deleteDoctorAssignment(doctorId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return this.deleteDoctor(doctorId)
  }

  static async updateMeeting(
    meetingId: string,
    scheduledDateOrUpdates: string | Record<string, unknown>,
    durationMinutes: number = 30,
    _presentationId?: string,
    notes?: string,
    status: string = 'scheduled',
    title?: string,
    doctorId?: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const body =
        typeof scheduledDateOrUpdates === 'object'
          ? scheduledDateOrUpdates
          : {
              scheduled_date: scheduledDateOrUpdates,
              duration_minutes: durationMinutes,
              notes,
              status,
              title,
              doctor_id: doctorId,
            }

      const data = await apiClient.patch(`/api/mr/meetings/${meetingId}/`, body)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update meeting') }
    }
  }

  static async deleteMeeting(meetingId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.delete(`/api/mr/meetings/${meetingId}/`)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to delete meeting') }
    }
  }

  static async createBrochure(
    title: string,
    category: string,
    description?: string,
    fileUrl?: string,
    fileName?: string,
    fileType?: string,
    thumbnailUrl?: string,
    pages?: number,
    fileSize?: string,
    tags?: string[],
  ): Promise<{ success: boolean; data?: { brochure_id?: string; id?: string }; error?: string }> {
    try {
      const data = await apiClient.post<{ brochure_id?: string; id?: string }>('/api/mr/brochures/upload/', {
        title,
        category: category?.trim() || 'General',
        description,
        file_url: fileUrl ? resolveMediaUrl(fileUrl) : fileUrl,
        file_name: fileName,
        file_type: fileType ? fileType.substring(0, 100) : undefined,
        thumbnail_url: thumbnailUrl,
        pages,
        file_size: fileSize,
        tags,
        is_public: true,
      })
      const brochureId = data?.brochure_id || data?.id
      return { success: true, data: { ...data, brochure_id: brochureId } }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to create brochure') }
    }
  }

  /**
   * Backend expects multipart on POST /api/mr/brochures/upload/
   * (file + brochure fields) — not a separate /api/files/... call + JSON body.
   */
  static async uploadBrochureMultipart(params: {
    localFilePath: string
    fileName: string
    mimeType?: string
    title: string
    category?: string
    description?: string
    tags?: string[]
    fileSize?: string
  }): Promise<{
    success: boolean
    data?: { brochure_id?: string; id?: string; file_url?: string }
    error?: string
  }> {
    try {
      const extraFields: Record<string, string> = {
        title: params.title.trim(),
        category: (params.category || 'General').trim() || 'General',
        is_public: 'true',
      }
      if (params.description) extraFields.description = params.description
      if (params.fileSize) extraFields.file_size = params.fileSize
      if (params.tags?.length) extraFields.tags = params.tags.join(',')
      if (params.mimeType) extraFields.file_type = params.mimeType.substring(0, 100)
      if (params.fileName) extraFields.file_name = params.fileName

      const data = await apiClient.uploadFile(
        '/api/mr/brochures/upload/',
        params.localFilePath,
        params.fileName,
        extraFields,
        params.mimeType,
      )

      // uploadFile normally returns file_url shape; MR endpoint may return brochure fields
      const anyData = data as unknown as {
        brochure_id?: string
        id?: string
        file_url?: string
        file_name?: string
        file_type?: string
        file_size?: string
      }
      const brochureId = anyData.brochure_id || anyData.id
      return {
        success: true,
        data: {
          brochure_id: brochureId,
          id: brochureId,
          file_url: anyData.file_url ? resolveMediaUrl(anyData.file_url) : anyData.file_url,
        },
      }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to upload brochure') }
    }
  }

  static async getPublicBrochures(): Promise<{ success: boolean; data?: MRAssignedBrochure[]; error?: string }> {
    return this.getAssignedBrochures('')
  }

  static async hasBrochureUploadPermission(): Promise<{ success: boolean; hasPermission?: boolean; error?: string }> {
    try {
      const refreshed = await AuthService.refreshPermissions()
      if (refreshed) {
        return { success: true, hasPermission: !!refreshed.can_upload_brochures }
      }

      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'User not authenticated' }
      }
      const withPerms = await AuthService.attachLocalPermissions(userResult.user)
      return { success: true, hasPermission: !!withPerms.can_upload_brochures }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to check permission') }
    }
  }

  static async getMRProfile(): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.get('/api/auth/me/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to load profile') }
    }
  }

  static async createMeeting(meetingData: {
    mr_id: string
    doctor_id: string
    brochure_id: string
    brochure_title: string
    title: string
    purpose: string
    scheduled_date?: string
    duration_minutes?: number
    location?: string
    notes?: string
  }): Promise<{ success: boolean; data?: { meeting_id: string }; error?: string }> {
    try {
      const data = await apiClient.post<{ meeting_id: string }>('/api/mr/meetings/', {
        doctor_id: meetingData.doctor_id,
        brochure_id: meetingData.brochure_id || undefined,
        brochure_title: meetingData.brochure_title,
        title: meetingData.title,
        purpose: meetingData.purpose,
        scheduled_date: meetingData.scheduled_date || new Date().toISOString(),
        duration_minutes: meetingData.duration_minutes || 30,
        location: meetingData.location,
        notes: meetingData.notes,
      })
      return { success: true, data: { meeting_id: data.meeting_id } }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to create meeting') }
    }
  }

  static async addSlideNote(noteData: {
    meeting_id: string
    slide_id: string
    slide_title?: string
    slide_order?: number
    brochure_id?: string
    brochure_title?: string
    note_text: string
    slide_image_uri?: string
    follow_up_id?: string
    timestamp?: string
  }): Promise<{ success: boolean; data?: { note_id: string }; error?: string }> {
    try {
      const data = await apiClient.post<any>(`/api/mr/meetings/${noteData.meeting_id}/notes/`, {
        slide_id: noteData.slide_id,
        slide_title: noteData.slide_title,
        slide_order: noteData.slide_order ?? 0,
        brochure_id: noteData.brochure_id,
        brochure_title: noteData.brochure_title,
        note_text: noteData.note_text,
        follow_up_id: noteData.follow_up_id,
      })
      const noteId = data?.note_id || data?.id
      if (!noteId) {
        return { success: false, error: 'Note created but server returned no id' }
      }
      return { success: true, data: { note_id: String(noteId) } }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to add slide note') }
    }
  }

  static async getMeetings(_mrId: string, _filter?: string): Promise<{ success: boolean; data?: MRMeeting[]; error?: string }> {
    try {
      const data = await apiClient.get<MRMeeting[]>('/api/mr/meetings/')
      return { success: true, data: data || [] }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to get meetings') }
    }
  }

  static async getMeetingDetails(meetingId: string): Promise<{ success: boolean; data?: MeetingDetails; error?: string }> {
    try {
      const data = await apiClient.get<MeetingDetails>(`/api/mr/meetings/${meetingId}/`)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch meeting details') }
    }
  }

  static async updateMeetingFollowUp(followUpData: {
    meeting_id: string
    follow_up_date: string
    follow_up_time: string
    follow_up_notes: string
  }): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.patch(`/api/mr/meetings/${followUpData.meeting_id}/followup/`, {
        follow_up_date: followUpData.follow_up_date,
        follow_up_time: followUpData.follow_up_time,
        follow_up_notes: followUpData.follow_up_notes,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update follow-up') }
    }
  }

  static async createMeetingFollowUp(followUpData: {
    meeting_id: string
    follow_up_date: string
    follow_up_time: string
    follow_up_notes?: string
    status?: 'scheduled' | 'completed' | 'cancelled'
  }): Promise<{ success: boolean; data?: { follow_up_id: string }; error?: string }> {
    try {
      const data = await apiClient.post<any>(
        `/api/mr/meetings/${followUpData.meeting_id}/followups/`,
        {
          follow_up_date: followUpData.follow_up_date,
          follow_up_time: followUpData.follow_up_time,
          follow_up_notes: followUpData.follow_up_notes,
          status: followUpData.status || 'scheduled',
        },
      )
      const followUpId = data?.follow_up_id || data?.followup_id || data?.id
      if (!followUpId) {
        return { success: false, error: 'Follow-up created but server returned no id' }
      }
      return { success: true, data: { follow_up_id: String(followUpId) } }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to create follow-up') }
    }
  }

  static async updateMeetingFollowUpById(
    followUpId: string,
    followUpData: {
      follow_up_date?: string
      follow_up_time?: string
      follow_up_notes?: string
      status?: string
    },
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.patch(`/api/mr/followups/${followUpId}/`, followUpData)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update follow-up') }
    }
  }

  static async deleteMeetingFollowUp(followUpId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.delete(`/api/mr/followups/${followUpId}/`)
      return { success: true }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to delete follow-up') }
    }
  }

  static async getMeetingFollowUps(meetingId: string): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    try {
      const data = await apiClient.get<unknown[]>(`/api/mr/meetings/${meetingId}/followups/`)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch follow-ups') }
    }
  }

  static async updateSlideNote(
    noteId: string,
    noteText: string,
    meetingId?: string,
    brochureTitle?: string,
    slideTitle?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!meetingId) {
        return { success: false, error: 'Meeting ID required for slide note update' }
      }
      const payload: { note_text: string; brochure_title?: string; slide_title?: string } = {
        note_text: noteText,
      }
      if (brochureTitle !== undefined) {
        payload.brochure_title = brochureTitle
      }
      if (slideTitle !== undefined) {
        payload.slide_title = slideTitle
      }
      await apiClient.patch(`/api/mr/meetings/${meetingId}/notes/${noteId}/`, payload)
      return { success: true }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update slide note') }
    }
  }

  static async deleteSlideNote(noteId: string, meetingId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!meetingId) {
        return { success: false, error: 'Meeting ID required for slide note delete' }
      }
      await apiClient.delete(`/api/mr/meetings/${meetingId}/notes/${noteId}/`)
      return { success: true }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to delete slide note') }
    }
  }

  // ==================== GENERAL MEETING NOTES ====================

  static async addGeneralNote(noteData: {
    meeting_id: string
    title?: string
    notes: string
  }): Promise<{ success: boolean; data?: { note_id: string }; error?: string }> {
    try {
      const data = await apiClient.post<any>(`/api/mr/meetings/${noteData.meeting_id}/general-notes/`, {
        title: noteData.title || '',
        notes: noteData.notes,
      })
      const noteId = data?.note_id || data?.id
      if (!noteId) {
        return { success: false, error: 'General note created but server returned no id' }
      }
      return { success: true, data: { note_id: String(noteId) } }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to add general note') }
    }
  }

  static async updateGeneralNote(
    noteId: string,
    updates: { title?: string; notes?: string },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.patch(`/api/mr/general-notes/${noteId}/`, updates)
      return { success: true }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update general note') }
    }
  }

  static async deleteGeneralNote(noteId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.delete(`/api/mr/general-notes/${noteId}/`)
      return { success: true }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to delete general note') }
    }
  }

  static async getGeneralNotes(meetingId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const data = await apiClient.get<any[]>(`/api/mr/meetings/${meetingId}/general-notes/`)
      return { success: true, data: data || [] }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch general notes') }
    }
  }

  static async getMeetingDetailsLegacy(meetingId: string): Promise<{ success: boolean; data?: MeetingDetails; error?: string }> {
    return this.getMeetingDetails(meetingId)
  }

  static async trackBrochureView(brochureId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      await apiClient.get(`/api/files/brochures/${brochureId}/download/`)
      return { success: true }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to track brochure view') }
    }
  }

  static async trackBrochureDownload(brochureId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return this.trackBrochureView(brochureId)
  }

  static async logActivity(
    _userId: string,
    activityType: string,
    description: string,
    metadata?: unknown,
    extras?: {
      entity_type?: string
      entity_id?: string
      details?: string
    },
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      let parsedMeta: Record<string, unknown> | undefined
      if (typeof metadata === 'string') {
        try {
          parsedMeta = JSON.parse(metadata)
        } catch {
          parsedMeta = { raw: metadata }
        }
      } else if (metadata && typeof metadata === 'object') {
        parsedMeta = metadata as Record<string, unknown>
      }

      const data = await apiClient.post('/api/activity-logs/', {
        activity_type: activityType,
        action: activityType,
        description,
        details: extras?.details || description,
        entity_type: extras?.entity_type,
        entity_id: extras?.entity_id || parsedMeta?.server_id || parsedMeta?.entity_id,
        metadata: parsedMeta ?? metadata,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to log activity') }
    }
  }

  static async clearRecentActivities(userId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const { LocalDatabaseService } = await import('./localDatabaseService')
      const cleared = await LocalDatabaseService.clearActivityLogsForMr(userId)
      return { success: true, data: { cleared } }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to clear recent activities') }
    }
  }

  static async addDoctor(_mrId: string, doctorData: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.post('/api/mr/doctor-assignments/', doctorData)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to create doctor assignment') }
    }
  }

  static async getDoctors(_mrId: string): Promise<{ success: boolean; data?: MRAssignedDoctor[]; error?: string }> {
    return this.getAssignedDoctors(_mrId)
  }

  static async updateDoctor(doctorId: string, doctorData: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.patch(`/api/mr/doctor-assignments/${doctorId}/`, doctorData)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update doctor assignment') }
    }
  }

  static async deleteDoctor(
    doctorId: string,
  ): Promise<{ success: boolean; notFound?: boolean; error?: string }> {
    try {
      await apiClient.delete(`/api/mr/doctor-assignments/${doctorId}/`)
      console.log(`MRService: DELETE doctor-assignment ${doctorId} succeeded`)
      return { success: true }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        console.log(
          `MRService: DELETE doctor-assignment ${doctorId} returned 404 (assignment may already be removed)`,
        )
        return { success: true, notFound: true }
      }
      return { success: false, error: serviceError(error, 'Failed to delete doctor') }
    }
  }

  static async saveBrochureForMr(
    _mrId: string,
    brochureId: string,
    customTitle: string,
  ): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
    try {
      const resolvedBrochureId = resolveServerBrochureId(brochureId)
      const brochure = await this.getBrochureById(resolvedBrochureId)
      if (!brochure) {
        return { success: false, error: 'Brochure not found' }
      }

      const data = await apiClient.post<{ id: string }>('/api/mr/saved-brochures/', {
        brochure_id: resolvedBrochureId,
        brochure_title: brochure.title,
        custom_title: customTitle,
        original_brochure_data: {
          id: brochure.id,
          title: brochure.title,
          category: brochure.category,
          description: brochure.description,
          thumbnail_url: brochure.thumbnail_url,
        },
      })
      return { success: true, data: { id: data.id } }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to save brochure') }
    }
  }

  static async saveOrGetSavedBrochureForMr(
    mrId: string,
    brochureId: string,
    customTitle: string,
  ): Promise<{ success: boolean; data?: { id: string }; alreadyExists?: boolean; error?: string }> {
    const result = await this.saveBrochureForMr(mrId, brochureId, customTitle)
    if (!result.success || !result.data) {
      return result
    }
    return { ...result, alreadyExists: false }
  }

  /** @deprecated Server now dedupes; kept for legacy cleanup after migration */
  static async pruneDuplicateSavedBrochuresOnServer(
    mrId: string,
    canonicalBrochureId: string,
    keepServerId?: string,
  ): Promise<void> {
    const resolved = resolveServerBrochureId(canonicalBrochureId)
    const list = await this.getSavedBrochuresForMr(mrId)
    if (!list.success || !list.data) return

    const matches = (list.data as Array<{ id: string; brochure_id: string }>).filter(
      (item) => resolveServerBrochureId(item.brochure_id) === resolved,
    )

    if (matches.length <= 1) return

    const keeper = keepServerId
      ? matches.find((item) => item.id === keepServerId)
      : matches.find((item) => item.brochure_id === resolved)

    const keepId = keeper?.id || matches[0].id

    for (const item of matches) {
      if (item.id !== keepId) {
        await this.removeSavedBrochureWithIdentifiers({
          server_id: item.id,
          brochure_id: item.brochure_id,
        })
      }
    }
  }

  static async getSavedBrochuresForMr(_mrId: string): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    try {
      const data = await apiClient.get<unknown[]>('/api/mr/saved-brochures/')
      const transformedData =
        data
          ?.map((item: Record<string, unknown>) => {
            if (!item.id) {
              console.warn(
                '⚠️ Saved brochure from server missing id — skipped (reconcile by server id only)',
                item.brochure_id,
              )
              return null
            }
            return {
              id: String(item.id),
              brochure_id: item.brochure_id,
              brochure_title: item.brochure_title,
              custom_title: item.custom_title,
              original_brochure_data: item.original_brochure_data,
              saved_at: item.saved_at || item.created_at,
              last_accessed: item.last_accessed,
            }
          })
          .filter((row): row is NonNullable<typeof row> => row !== null) || []
      return { success: true, data: transformedData }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch saved brochures') }
    }
  }

  static async updateSavedBrochureTitle(
    _mrId: string,
    brochureOrSavedId: string,
    customTitle: string,
  ): Promise<{ success: boolean; error?: string; notFound?: boolean }> {
    try {
      await apiClient.patch(`/api/mr/saved-brochures/${brochureOrSavedId}/`, { custom_title: customTitle })
      return { success: true }
    } catch (error) {
      const notFound =
        error instanceof ApiError &&
        (error.status === 404 || error.message.toLowerCase().includes('not found'))
      return {
        success: false,
        error: serviceError(error, 'Failed to update saved brochure title'),
        notFound,
      }
    }
  }

  static async removeSavedBrochureForMr(
    _mrId: string,
    brochureOrSavedId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return this.removeSavedBrochureWithIdentifiers({
      brochure_id: brochureOrSavedId,
    })
  }

  static async removeSavedBrochureWithIdentifiers(
    identifiers: { server_id?: string | null; brochure_id?: string | null },
  ): Promise<{ success: boolean; error?: string }> {
    const candidates = [
      identifiers.server_id,
      identifiers.brochure_id,
      identifiers.brochure_id ? resolveServerBrochureId(identifiers.brochure_id) : undefined,
    ].filter((id): id is string => !!id)
      .filter((id, index, all) => all.indexOf(id) === index)

    if (candidates.length === 0) {
      return { success: false, error: 'No saved brochure identifier available' }
    }

    let lastError = 'Failed to remove saved brochure'
    for (const id of candidates) {
      try {
        await apiClient.delete(`/api/mr/saved-brochures/${encodeURIComponent(id)}/`)
        return { success: true }
      } catch (error) {
        lastError = serviceError(error, 'Failed to remove saved brochure')
        if (error instanceof ApiError && error.status === 404) {
          continue
        }
      }
    }

    if (lastError.toLowerCase().includes('not found')) {
      return { success: true }
    }

    return { success: false, error: lastError }
  }

  static async saveBrochureChanges(params: {
    mr_id: string
    brochure_id: string
    brochure_title: string
    brochure_data?: {
      slides?: unknown[]
      groups?: unknown[]
      totalSlides?: number
      brochure_data_url?: string
    }
    /** @deprecated prefer brochure_data.slides/groups — kept for older callers */
    brochure_data_url?: string
    last_modified: string
  }): Promise<{ success: boolean; data?: { id?: string; last_modified?: string }; error?: string }> {
    try {
      const provided = params.brochure_data || {}
      let slides = provided.slides
      let groups = provided.groups
      let totalSlides = provided.totalSlides

      // Fallback: read local file if caller still only passes a URL / no structured data.
      if ((!slides || !groups) && !provided.brochure_data_url && !params.brochure_data_url) {
        try {
          const brochureDataPath = `${FileSystem.documentDirectory}brochures/${params.brochure_id}/brochure_data.json`
          const fileInfo = await FileSystem.getInfoAsync(brochureDataPath)
          if (fileInfo.exists) {
            const fileContent = await FileSystem.readAsStringAsync(brochureDataPath)
            const parsed = JSON.parse(fileContent)
            slides = slides || parsed.slides || []
            groups = groups || parsed.groups || []
            totalSlides = totalSlides || parsed.totalSlides || (slides as unknown[])?.length || 0
          }
        } catch (fileError) {
          console.warn('Could not read local brochure data file:', fileError)
        }
      }

      const brochureDataUrl = provided.brochure_data_url || params.brochure_data_url

      const data = await apiClient.put<{ id?: string; last_modified?: string }>('/api/mr/brochure-sync/', {
        brochure_id: params.brochure_id,
        brochure_title: params.brochure_title,
        brochure_data: {
          ...(brochureDataUrl ? { brochure_data_url: resolveMediaUrl(brochureDataUrl) } : {}),
          slides: slides || [],
          groups: groups || [],
          last_modified: params.last_modified,
          total_slides: totalSlides || (slides as unknown[])?.length || 0,
        },
      })

      return {
        success: true,
        data: { id: data.id, last_modified: data.last_modified || params.last_modified },
      }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to save brochure changes') }
    }
  }

  static async getBrochureChangesForMr(_mrId: string): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    try {
      const data = await apiClient.get<unknown[] | { data: unknown[] }>('/api/mr/brochure-sync/')
      const list = Array.isArray(data) ? data : (data as { data: unknown[] }).data || []
      return { success: true, data: list }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch brochure changes') }
    }
  }

  static async getBrochureSyncData(
    _mrId: string,
    brochureId: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.get<unknown>('/api/mr/brochure-sync/', { query: { brochure_id: brochureId } })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch brochure sync data') }
    }
  }

  static async deleteBrochureSync(_mrId: string, brochureId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.delete(`/api/mr/brochure-sync/${brochureId}/`)
      return { success: true }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to delete brochure sync') }
    }
  }
}
