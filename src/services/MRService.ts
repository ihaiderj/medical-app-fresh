import { supabase } from './supabase'
import { AuthService } from './AuthService'

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
  brochure_id: string
  title: string
  category: string
  description?: string
  thumbnail_url?: string
  view_count: number
  download_count: number
  uploaded_by_name: string
  created_at: string
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
}

export interface MRMeeting {
  meeting_id: string
  doctor_name: string
  doctor_specialty: string
  hospital: string
  scheduled_date: string
  duration_minutes: number
  presentation_title: string
  status: string
  follow_up_required: boolean
  follow_up_date?: string
  notes?: string
  slides_discussed: string[]
  created_at: string
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

export class MRService {
  /**
   * MR Dashboard Methods
   */
  
  static async getDashboardStats(mrId: string): Promise<{ success: boolean; data?: MRDashboardStats; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_dashboard_stats', { p_mr_id: mrId })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR dashboard stats' }
    }
  }

  static async getRecentActivities(mrId: string, limit: number = 5): Promise<{ success: boolean; data?: MRRecentActivity[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_recent_activities', { 
        p_mr_id: mrId, 
        limit_count: limit 
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR recent activities' }
    }
  }

  static async getAssignedBrochures(mrId: string): Promise<{ success: boolean; data?: MRAssignedBrochure[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_assigned_brochures', { p_mr_id: mrId })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR assigned brochures' }
    }
  }

  static async getUpcomingMeetings(mrId: string, limit: number = 5): Promise<{ success: boolean; data?: MRUpcomingMeeting[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_upcoming_meetings', { 
        p_mr_id: mrId, 
        limit_count: limit 
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR upcoming meetings' }
    }
  }

  static async getPerformanceSummary(mrId: string): Promise<{ success: boolean; data?: MRPerformanceSummary; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_performance_summary', { p_mr_id: mrId })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR performance summary' }
    }
  }

  static async getAssignedDoctors(mrId: string): Promise<{ success: boolean; data?: MRAssignedDoctor[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_assigned_doctors', { p_mr_id: mrId })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR assigned doctors' }
    }
  }

  static async getMeetings(mrId: string, filter: string = 'All'): Promise<{ success: boolean; data?: MRMeeting[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_meetings', { 
        p_mr_id: mrId, 
        p_filter: filter 
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR meetings' }
    }
  }

  static async getPresentations(mrId: string): Promise<{ success: boolean; data?: MRPresentation[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_presentations', { p_mr_id: mrId })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR presentations' }
    }
  }

  static async createDoctorAssignment(
    mrId: string,
    firstName: string,
    lastName: string,
    specialty: string,
    hospital: string,
    phone?: string,
    email?: string,
    location?: string,
    notes?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('create_mr_doctor_assignment', {
        p_mr_id: mrId,
        p_first_name: firstName,
        p_last_name: lastName,
        p_specialty: specialty,
        p_hospital: hospital,
        p_phone: phone,
        p_email: email,
        p_location: location,
        p_notes: notes
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to create doctor assignment' }
    }
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
    notes?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('update_mr_doctor_assignment', {
        p_doctor_id: doctorId,
        p_first_name: firstName,
        p_last_name: lastName,
        p_specialty: specialty,
        p_hospital: hospital,
        p_phone: phone,
        p_email: email,
        p_location: location,
        p_notes: notes
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to update doctor assignment' }
    }
  }

  static async deleteDoctorAssignment(
    doctorId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('delete_mr_doctor_assignment', {
        p_doctor_id: doctorId
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to delete doctor assignment' }
    }
  }

  static async createMeeting(
    mrId: string,
    doctorId: string,
    scheduledDate: string,
    durationMinutes: number = 30,
    presentationId?: string,
    notes?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('create_mr_meeting', {
        p_mr_id: mrId,
        p_doctor_id: doctorId,
        p_scheduled_date: scheduledDate,
        p_duration_minutes: durationMinutes,
        p_presentation_id: presentationId,
        p_notes: notes
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to create meeting' }
    }
  }

  static async updateMeeting(
    meetingId: string,
    scheduledDate: string,
    durationMinutes: number = 30,
    presentationId?: string,
    notes?: string,
    status: string = 'scheduled'
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('update_mr_meeting', {
        p_meeting_id: meetingId,
        p_scheduled_date: scheduledDate,
        p_duration_minutes: durationMinutes,
        p_presentation_id: presentationId,
        p_notes: notes,
        p_status: status
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to update meeting' }
    }
  }

  static async deleteMeeting(
    meetingId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('delete_mr_meeting', {
        p_meeting_id: meetingId
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to delete meeting' }
    }
  }

  /**
   * MR-specific brochure management methods
   */

  // Create brochure (for MRs with permission)
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
    tags?: string[]
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Default to "General" category if none specified
      const categoryName = category && category.trim() ? category.trim() : 'General'
      
      // First, try to find or create the category
      let categoryId = null
      
      // Try to find existing category by name
      const { data: existingCategory } = await supabase
        .from('brochure_categories')
        .select('id')
        .eq('name', categoryName)
        .single()

      if (existingCategory) {
        categoryId = existingCategory.id
      } else {
        // Create new category if it doesn't exist
        const { data: newCategory, error: categoryError } = await supabase
          .from('brochure_categories')
          .insert({
            name: categoryName,
            description: `Category for ${categoryName} brochures`,
            color: categoryName === 'General' ? '#6b7280' : '#8b5cf6',
            is_active: true
          })
          .select('id')
          .single()

        if (categoryError) {
          console.error('Create category error:', categoryError)
          return { success: false, error: 'Failed to create category' }
        }
        
        categoryId = newCategory.id
      }

      // Now create the brochure with the category ID
          const { data, error } = await supabase.rpc('create_brochure_with_category', {
            p_title: title,
            p_category_id: categoryId,
            p_description: description,
            p_file_url: fileUrl,
            p_file_name: fileName,
            p_file_type: fileType ? fileType.substring(0, 100) : null, // Truncate long MIME types
            p_thumbnail_url: thumbnailUrl,
            p_pages: pages,
            p_file_size: fileSize,
            p_tags: tags,
            p_is_public: true
          })

      if (error) {
        console.error('Create brochure error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      console.error('Create brochure error:', error)
      return { success: false, error: 'Failed to create brochure' }
    }
  }

  // Get MR's assigned brochures
  static async getAssignedBrochures(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('brochures')
        .select(`
          *,
          brochure_categories (
            name,
            color
          )
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Get assigned brochures error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data: data || [] }
    } catch (error) {
      console.error('Get assigned brochures error:', error)
      return { success: false, error: 'Failed to load brochures' }
    }
  }

  // Check if MR has brochure upload permission
  static async hasBrochureUploadPermission(): Promise<{ success: boolean; hasPermission?: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { success: false, error: 'User not authenticated' }
      }

      const { data, error } = await supabase
        .from('users')
        .select('can_upload_brochures')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Check permission error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, hasPermission: data?.can_upload_brochures || false }
    } catch (error) {
      console.error('Check permission error:', error)
      return { success: false, error: 'Failed to check permission' }
    }
  }

  // Get MR profile with permissions
  static async getMRProfile(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        return { success: false, error: 'User not authenticated' }
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Get MR profile error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      console.error('Get MR profile error:', error)
      return { success: false, error: 'Failed to load profile' }
    }
  }

  /**
   * Track brochure download - DIRECT SQL APPROACH
   */
  static async trackBrochureDownload(
    brochureId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Get current download count
      const { data: currentData, error: fetchError } = await supabase
        .from('brochures')
        .select('download_count')
        .eq('id', brochureId)
        .single()

      if (fetchError) {
        return { success: false, error: fetchError.message }
      }

      // Update with new count
      const newCount = (currentData?.download_count || 0) + 1
      console.log('Updating download count from', currentData?.download_count, 'to', newCount)
      
      const { data, error } = await supabase
        .from('brochures')
        .update({ 
          download_count: newCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', brochureId)

      if (error) {
        console.error('Download count update error:', error)
        return { success: false, error: error.message }
      }

      console.log('Download count updated successfully:', data)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to track download' }
    }
  }

  /**
   * Track brochure view - DIRECT SQL APPROACH
   */
  static async trackBrochureView(
    brochureId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Get current view count
      const { data: currentData, error: fetchError } = await supabase
        .from('brochures')
        .select('view_count')
        .eq('id', brochureId)
        .single()

      if (fetchError) {
        return { success: false, error: fetchError.message }
      }

      // Update with new count
      const newCount = (currentData?.view_count || 0) + 1
      console.log('Updating view count from', currentData?.view_count, 'to', newCount)
      
      const { data, error } = await supabase
        .from('brochures')
        .update({ 
          view_count: newCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', brochureId)

      if (error) {
        console.error('View count update error:', error)
        return { success: false, error: error.message }
      }

      console.log('View count updated successfully:', data)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to track view' }
    }
  }

  // Track brochure download
  static async trackBrochureDownload(brochureId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('brochures')
        .update({ 
          download_count: supabase.sql`download_count + 1`,
          updated_at: new Date().toISOString()
        })
        .eq('id', brochureId)
        .select()

      if (error) {
        console.error('Download count update error:', error)
        return { success: false, error: error.message }
      }

      console.log('Download count updated successfully:', data)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to track download' }
    }
  }

  // Track brochure view
  static async trackBrochureView(brochureId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('brochures')
        .update({ 
          view_count: supabase.sql`view_count + 1`,
          updated_at: new Date().toISOString()
        })
        .eq('id', brochureId)
        .select()

      if (error) {
        console.error('View count update error:', error)
        return { success: false, error: error.message }
      }

      // Log activity
      try {
        const userResult = await AuthService.getCurrentUser()
        if (userResult.success && userResult.user) {
          const brochureTitle = data?.[0]?.title || 'Unknown brochure'
          await this.logActivity(userResult.user.id, 'brochure_view', `Viewed ${brochureTitle}`)
        }
      } catch (activityError) {
        console.log('Failed to log activity:', activityError)
      }

      console.log('View count updated successfully:', data)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to track view' }
    }
  }

  // Track brochure download
  static async trackBrochureDownload(brochureId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('brochures')
        .update({ 
          download_count: supabase.sql`download_count + 1`,
          updated_at: new Date().toISOString()
        })
        .eq('id', brochureId)
        .select()

      if (error) {
        console.error('Download count update error:', error)
        return { success: false, error: error.message }
      }

      // Log activity
      try {
        const userResult = await AuthService.getCurrentUser()
        if (userResult.success && userResult.user) {
          const brochureTitle = data?.[0]?.title || 'Unknown brochure'
          await this.logActivity(userResult.user.id, 'brochure_download', `Downloaded ${brochureTitle}`)
        }
      } catch (activityError) {
        console.log('Failed to log activity:', activityError)
      }

      console.log('Download count updated successfully:', data)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to track download' }
    }
  }

  // Log activity function
  static async logActivity(userId: string, activityType: string, description: string, metadata?: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('Attempting to log activity:', { userId, activityType, description })
      const { data, error } = await supabase.rpc('log_activity', {
        p_user_id: userId,
        p_activity_type: activityType,
        p_description: description,
        p_metadata: metadata || null
      })

      if (error) {
        console.error('Activity log error:', error)
        return { success: false, error: error.message }
      }

      console.log('Activity logged successfully:', data)
      return { success: true, data }
    } catch (error) {
      console.error('Activity log error:', error)
      return { success: false, error: 'Failed to log activity' }
    }
  }
}