import { apiClient, ApiError } from './apiClient'
import { resolveMediaUrl } from '../config/apiConfig'
import { PDFProcessingService } from './pdfProcessingService'

export interface DashboardStats {
  total_mrs: number
  active_brochures: number
  total_doctors: number
  monthly_meetings: number
}

export interface RecentActivity {
  id: string
  activity_type: string
  description: string
  user_name: string
  created_at: string
}

export interface SystemStatus {
  server_status: string
  database_status: string
  total_users: number
  active_users: number
  storage_used_mb: number
  storage_percentage: number
  last_backup: string
  uptime_hours: number
}

export interface MRPerformance {
  mr_id: string
  mr_name: string
  total_meetings: number
  completed_meetings: number
  total_doctors: number
  brochures_uploaded: number
  last_activity: string
}

export interface BrochureAnalytics {
  brochure_id: string
  title: string
  category: string
  total_views: number
  total_downloads: number
  last_viewed: string
  created_at: string
}

export interface MRData {
  id: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  profile_image_url?: string
  is_active: boolean
  doctors_count: number
  meetings_count: number
  created_at: string
}

export interface BrochureData {
  id: string
  title: string
  category: string
  description?: string
  file_url: string
  thumbnail_url?: string
  pages?: number
  file_size?: string
  status: 'active' | 'inactive' | 'archived'
  download_count: number
  view_count: number
  assigned_by_name?: string
  created_at: string
}

export interface DoctorData {
  id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  specialty: string
  hospital: string
  location?: string
  profile_image_url?: string
  relationship_status: string
  meetings_count: number
  last_meeting_date?: string
  next_appointment?: string
  assigned_mr_name?: string
  created_at: string
}

export interface MeetingData {
  id: string
  title: string
  mr_name: string
  doctor_name: string
  hospital: string
  scheduled_date: string
  duration_minutes: number
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
  location?: string
  follow_up_required: boolean
  brochure_title?: string
  created_at: string
}

function serviceError(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback
}

export class AdminService {
  static async getDashboardStats(): Promise<{ success: boolean; data?: DashboardStats; error?: string }> {
    try {
      const data = await apiClient.get<DashboardStats>('/api/admin/dashboard/stats/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch dashboard stats') }
    }
  }

  static async getRecentActivities(limit: number = 5): Promise<{ success: boolean; data?: RecentActivity[]; error?: string }> {
    try {
      const data = await apiClient.get<RecentActivity[]>('/api/admin/dashboard/activities/', { query: { limit } })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch recent activities') }
    }
  }

  static async getSystemStatus(): Promise<{ success: boolean; data?: SystemStatus; error?: string }> {
    try {
      const data = await apiClient.get<SystemStatus>('/api/admin/system/status/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch system status') }
    }
  }

  static async getMRPerformanceStats(): Promise<{ success: boolean; data?: MRPerformance[]; error?: string }> {
    try {
      const data = await apiClient.get<MRPerformance[]>('/api/admin/analytics/mr-performance/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch MR performance stats') }
    }
  }

  static async getBrochureAnalytics(): Promise<{ success: boolean; data?: BrochureAnalytics[]; error?: string }> {
    try {
      const data = await apiClient.get<BrochureAnalytics[]>('/api/admin/analytics/brochures/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch brochure analytics') }
    }
  }

  static async getAllMRs(): Promise<{ success: boolean; data?: MRData[]; error?: string }> {
    try {
      const data = await apiClient.get<MRData[]>('/api/admin/mrs/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch MRs') }
    }
  }

  static async createMR(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string,
    profileImageUrl?: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    return this.createMRWithPermissions(
      email,
      password,
      firstName,
      lastName,
      phone,
      undefined,
      profileImageUrl,
    )
  }

  static async getAllBrochures(): Promise<{ success: boolean; data?: BrochureData[]; error?: string }> {
    try {
      const data = await apiClient.get<BrochureData[]>('/api/admin/brochures/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch brochures') }
    }
  }

  static async getAllDoctors(): Promise<{ success: boolean; data?: DoctorData[]; error?: string }> {
    try {
      const data = await apiClient.get<DoctorData[]>('/api/admin/doctors/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch doctors') }
    }
  }

  static async createDoctor(
    firstName: string,
    lastName: string,
    specialty: string,
    hospital: string,
    email?: string,
    phone?: string,
    location?: string,
    profileImageUrl?: string,
    notes?: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.post('/api/admin/doctors/', {
        first_name: firstName,
        last_name: lastName,
        specialty,
        hospital,
        email,
        phone,
        location,
        profile_image_url: profileImageUrl,
        notes,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to create doctor') }
    }
  }

  static async assignDoctorToMR(
    doctorId: string,
    mrId: string,
    notes?: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.post('/api/admin/doctor-assignments/', {
        doctor_id: doctorId,
        mr_id: mrId,
        notes,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to assign doctor to MR') }
    }
  }

  static async getAllMeetings(): Promise<{ success: boolean; data?: MeetingData[]; error?: string }> {
    try {
      const data = await apiClient.get<MeetingData[]>('/api/admin/meetings/')
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch meetings') }
    }
  }

  static async createMRWithPermissions(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string,
    address?: string,
    profileImageUrl?: string,
    canUploadBrochures: boolean = false,
    canManageDoctors: boolean = false,
    canScheduleMeetings: boolean = true,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.post('/api/admin/mrs/', {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        phone,
        address,
        profile_image_url: profileImageUrl,
        can_upload_brochures: canUploadBrochures,
        can_manage_doctors: canManageDoctors,
        can_schedule_meetings: canScheduleMeetings,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to create MR') }
    }
  }

  static async getAllMRsWithPermissions(): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    try {
      const data = await apiClient.get<unknown[]>('/api/admin/mrs/', { query: { include_permissions: true } })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to fetch MRs') }
    }
  }

  static async updateMRPermissions(
    mrId: string,
    canUploadBrochures?: boolean,
    canManageDoctors?: boolean,
    canScheduleMeetings?: boolean,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.patch(`/api/admin/mrs/${mrId}/permissions/`, {
        can_upload_brochures: canUploadBrochures,
        can_manage_doctors: canManageDoctors,
        can_schedule_meetings: canScheduleMeetings,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update MR permissions') }
    }
  }

  static async updateMRProfile(
    mrId: string,
    firstName?: string,
    lastName?: string,
    phone?: string,
    address?: string,
    profileImageUrl?: string,
    isActive?: boolean,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.patch(`/api/admin/mrs/${mrId}/`, {
        first_name: firstName,
        last_name: lastName,
        phone,
        address,
        profile_image_url: profileImageUrl,
        is_active: isActive,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update MR profile') }
    }
  }

  static async deactivateMR(mrId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.post(`/api/admin/mrs/${mrId}/deactivate/`)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to deactivate MR') }
    }
  }

  static async deleteMR(mrId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.delete(`/api/admin/mrs/${mrId}/`)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to delete MR') }
    }
  }

  static async logActivity(
    action: string,
    entityType: string,
    entityId?: string,
    details?: unknown,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.post('/api/activity-logs/', {
        action,
        activity_type: action,
        entity_type: entityType,
        entity_id: entityId,
        description: action,
        details,
        metadata: details,
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to log activity') }
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
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const categoryName = category?.trim() || 'General'
      let finalThumbnailUrl = thumbnailUrl

      if (!finalThumbnailUrl) {
        if (fileType?.includes('pdf') && fileUrl) {
          finalThumbnailUrl = 'https://picsum.photos/300/200?random=' + Date.now()
        } else if (fileType?.includes('image') && fileUrl) {
          finalThumbnailUrl = fileUrl
        } else {
          finalThumbnailUrl = 'https://picsum.photos/300/200?random=' + Date.now()
        }
      }

      const data = await apiClient.post('/api/admin/brochures/', {
        title,
        category: categoryName,
        description,
        file_url: fileUrl ? resolveMediaUrl(fileUrl) : fileUrl,
        file_name: fileName,
        file_type: fileType ? fileType.substring(0, 100) : undefined,
        thumbnail_url: finalThumbnailUrl,
        pages,
        file_size: fileSize,
        tags,
        is_public: true,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to create brochure') }
    }
  }

  static async getAllBrochuresWithCategories(): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    try {
      const result = await apiClient.get<{ brochures: unknown[]; categories: unknown[] }>(
        '/api/admin/brochures/',
        { query: { with_categories: true } },
      )
      return { success: true, data: result.brochures || [] }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to load brochures') }
    }
  }

  static async getBrochureCategories(): Promise<{ success: boolean; data?: unknown[]; error?: string }> {
    try {
      const data = await apiClient.get<unknown[]>('/api/admin/brochure-categories/')
      return { success: true, data: data || [] }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to load categories') }
    }
  }

  static async updateBrochure(
    brochureId: string,
    title?: string,
    description?: string,
    _category?: string,
    tags?: string[],
    isPublic?: boolean,
    thumbnailUrl?: string,
    pages?: number,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.patch(`/api/admin/brochures/${brochureId}/`, {
        title,
        description,
        tags,
        is_public: isPublic,
        thumbnail_url: thumbnailUrl,
        pages,
      })
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to update brochure') }
    }
  }

  static async deleteBrochure(brochureId: string): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const data = await apiClient.delete(`/api/admin/brochures/${brochureId}/`)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: serviceError(error, 'Failed to delete brochure') }
    }
  }
}
