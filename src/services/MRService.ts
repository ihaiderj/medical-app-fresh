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
  brochure_id?: string  // Legacy field name
  id: string           // Actual field name from database
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
  id?: string  // Alias for meeting_id
  title: string
  doctor_id: string
  doctor_name: string
  doctor_first_name?: string
  doctor_last_name?: string
  doctor_specialty: string
  hospital: string
  scheduled_date: string
  meeting_date?: string  // Alias for scheduled_date
  duration_minutes: number
  status: string
  purpose?: string
  notes?: string
  brochure_title?: string
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
  created_at: string
  updated_at: string
}

export interface MeetingDetails {
  meeting: any
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
      console.log('🔍 SERVER DEBUG: Fetching assigned brochures from server for MR:', mrId);
      const { data, error } = await supabase.rpc('get_mr_assigned_brochures', { p_mr_id: mrId })

      if (error) {
        console.warn('❌ SERVER DEBUG: MRService.getAssignedBrochures rpc error:', error.message)
        throw error
      }

      console.log(`✅ SERVER DEBUG: Found ${data?.length || 0} assigned brochures on server:`, 
        data?.map(b => ({ id: b.id, title: b.title, category: b.category })));
      return { success: true, data }
    } catch (rpcError) {
      console.warn('⚠️ SERVER DEBUG: MRService.getAssignedBrochures falling back to direct query:', rpcError)

      try {
        console.log('🔍 SERVER DEBUG: Using fallback query for brochures...');
        const { data: brochures, error: fallbackError } = await supabase
          .from('brochures')
          .select('*')
          .eq('status', 'active')
          .or(`is_public.eq.true,uploaded_by.eq.${mrId}`)
          .order('created_at', { ascending: false })

        if (fallbackError) {
          console.error('❌ SERVER DEBUG: MRService.getAssignedBrochures fallback error:', fallbackError)
          return { success: false, error: fallbackError.message }
        }

        console.log(`✅ SERVER DEBUG: Fallback query found ${brochures?.length || 0} brochures:`, 
          brochures?.map(b => ({ id: b.id, title: b.title, category: b.category })));

        const uploaderIds = Array.from(new Set((brochures || []).map(b => b.uploaded_by).filter(Boolean)))
        let uploaderMap: Record<string, string> = {}

        if (uploaderIds.length > 0) {
          const { data: uploaders, error: uploaderError } = await supabase
            .from('users')
            .select('id, first_name, last_name, role')
            .in('id', uploaderIds)

          if (!uploaderError && uploaders) {
            uploaderMap = uploaders.reduce<Record<string, string>>((acc, user) => {
              const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim()
              acc[user.id] = fullName || (user.role === 'admin' ? 'Administrator' : 'Unknown')
              return acc
            }, {})
          }
        }

        const mapped = (brochures || []).map((item: any) => ({
          id: item.id,
          brochure_id: item.id,
          title: item.title,
          category: item.category,
          description: item.description,
          thumbnail_url: item.thumbnail_url,
          view_count: item.view_count ?? 0,
          download_count: item.download_count ?? 0,
          uploaded_by_name: uploaderMap[item.uploaded_by] || 'Unknown',
          created_at: item.created_at,
          file_url: item.file_url,
          file_name: item.file_name,
          file_type: item.file_type,
        })) as MRAssignedBrochure[]

        return { success: true, data: mapped }
      } catch (fallbackCatchError) {
        console.error('MRService.getAssignedBrochures final failure:', fallbackCatchError)
        return { success: false, error: 'Failed to fetch MR assigned brochures' }
      }
    }
  }

  static async getBrochureById(brochureId: string): Promise<MRAssignedBrochure | null> {
    try {
      const { data, error } = await supabase
        .from('brochures')
        .select('id, title, category, description, thumbnail_url, view_count, download_count, file_url, file_name, file_type, created_at, uploaded_by:profiles!brochures_uploaded_by_fkey(full_name)')
        .eq('id', brochureId)
        .single()

      if (error) {
        console.error('Error fetching brochure by ID:', error)
        return null
      }

      if (!data) {
        return null
      }

      // Transform the data to match MRAssignedBrochure interface
      return {
        id: data.id,
        brochure_id: data.id,
        title: data.title,
        category: data.category,
        description: data.description,
        thumbnail_url: data.thumbnail_url,
        view_count: data.view_count || 0,
        download_count: data.download_count || 0,
        file_url: data.file_url,
        file_name: data.file_name,
        file_type: data.file_type,
        created_at: data.created_at,
        uploaded_by_name: data.uploaded_by?.full_name || 'Unknown'
      }
    } catch (error) {
      console.error('Exception in getBrochureById:', error)
      return null
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
      console.log('🔍 SERVER DEBUG: Fetching assigned doctors from server for MR:', mrId);
      const { data, error } = await supabase.rpc('get_mr_assigned_doctors', { p_mr_id: mrId })

      if (error) {
        console.error('❌ SERVER DEBUG: Get assigned doctors error:', error);
        return { success: false, error: error.message }
      }

      // Debug: Log the actual response structure to understand the mapping
      console.log(`✅ SERVER DEBUG: Found ${data?.length || 0} assigned doctors on server`);
      if (data && data.length > 0) {
        console.log('🔍 SERVER DEBUG: First doctor object keys:', Object.keys(data[0]));
        console.log('🔍 SERVER DEBUG: First doctor object:', JSON.stringify(data[0], null, 2));
        console.log('🔍 SERVER DEBUG: First doctor doctor_id:', (data[0] as any).doctor_id);
        console.log('🔍 SERVER DEBUG: First doctor id:', (data[0] as any).id);
      }
      
      // Map the response to ensure doctor_id is available
      const mappedData = data?.map((d: any) => ({
        ...d,
        doctor_id: d.doctor_id || d.id, // Ensure doctor_id is set
        id: d.id || d.doctor_id // Also set id for compatibility
      }));
      
      return { success: true, data: mappedData }
    } catch (error) {
      console.error('❌ SERVER DEBUG: Failed to fetch MR assigned doctors:', error);
      return { success: false, error: 'Failed to fetch MR assigned doctors' }
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

  // Old createMeeting function removed - using the new one with brochure support

  static async updateMeeting(
    meetingId: string,
    scheduledDate: string,
    durationMinutes: number = 30,
    presentationId?: string,
    notes?: string,
    status: string = 'scheduled',
    title?: string,
    doctorId?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('=== MRService.updateMeeting DEBUG ===')
      console.log('Parameters:')
      console.log('- meetingId:', meetingId)
      console.log('- scheduledDate:', scheduledDate)
      console.log('- durationMinutes:', durationMinutes)
      console.log('- presentationId:', presentationId)
      console.log('- notes:', notes)
      console.log('- status:', status)
      console.log('- title:', title)
      console.log('- doctorId:', doctorId)
      
      const { data, error } = await supabase.rpc('update_mr_meeting', {
        p_meeting_id: meetingId,
        p_scheduled_date: scheduledDate,
        p_duration_minutes: durationMinutes,
        p_presentation_id: presentationId,
        p_notes: notes,
        p_status: status,
        p_title: title,
        p_doctor_id: doctorId
      })

      console.log('Supabase RPC result:')
      console.log('- data:', data)
      console.log('- error:', error)

      if (error) {
        console.log('Supabase error occurred:', error.message)
        return { success: false, error: error.message }
      }

      console.log('Update successful, returning success')
      return { success: true, data }
    } catch (error) {
      console.error('Exception in updateMeeting:', error)
      return { success: false, error: 'Failed to update meeting' }
    }
  }

  static async deleteMeeting(
    meetingId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('=== MRService.deleteMeeting DEBUG ===')
      console.log('meetingId:', meetingId)
      console.log('Calling supabase.rpc with delete_mr_meeting...')
      
      const { data, error } = await supabase.rpc('delete_mr_meeting', {
        p_meeting_id: meetingId
      })

      console.log('Supabase RPC result:')
      console.log('- data:', data)
      console.log('- error:', error)

      if (error) {
        console.log('Supabase error occurred:', error.message)
        return { success: false, error: error.message }
      }

      console.log('Delete successful, returning success')
      return { success: true, data }
    } catch (error) {
      console.error('Exception in deleteMeeting:', error)
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

  // Get all public brochures with category info
  static async getPublicBrochures(): Promise<{ success: boolean; data?: any[]; error?: string }> {
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
      console.log('🔍 SERVER DEBUG: Fetching MR profile from server...');
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        console.error('❌ SERVER DEBUG: User not authenticated for profile fetch');
        return { success: false, error: 'User not authenticated' }
      }

      console.log('🔍 SERVER DEBUG: Authenticated user ID:', user.id);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('❌ SERVER DEBUG: Get MR profile error:', error)
        return { success: false, error: error.message }
      }

      console.log('✅ SERVER DEBUG: MR profile fetched successfully:', data);
      return { success: true, data }
    } catch (error) {
      console.error('Get MR profile error:', error)
      return { success: false, error: 'Failed to load profile' }
    }
  }

  /**
   * Create new meeting
   */
  static async createMeeting(meetingData: {
    mr_id: string
    doctor_id: string
    brochure_id: string
    brochure_title: string
    title: string
    purpose: string
    scheduled_date?: string
    duration_minutes?: number
  }): Promise<{ success: boolean; data?: { meeting_id: string }; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('create_meeting_with_brochure', {
        p_mr_id: meetingData.mr_id,
        p_doctor_id: meetingData.doctor_id,
        p_brochure_id: meetingData.brochure_id,
        p_brochure_title: meetingData.brochure_title,
        p_title: meetingData.title,
        p_purpose: meetingData.purpose,
        p_scheduled_date: meetingData.scheduled_date || new Date().toISOString(),
        p_duration_minutes: meetingData.duration_minutes || 30
      })

      if (error) {
        console.error('Create meeting error:', error)
        return { success: false, error: error.message }
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to create meeting' }
      }

      return { 
        success: true, 
        data: { meeting_id: data.meeting_id }
      }
    } catch (error) {
      console.error('Create meeting error:', error)
      return { success: false, error: 'Failed to create meeting' }
    }
  }

  /**
   * Add slide note to meeting
   */
  static async addSlideNote(noteData: {
    meeting_id: string
    slide_id: string
    slide_title: string
    slide_order: number
    brochure_id: string
    note_text: string
    slide_image_uri?: string
    timestamp: string
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('add_slide_note_to_meeting', {
        p_meeting_id: noteData.meeting_id,
        p_slide_id: noteData.slide_id,
        p_slide_title: noteData.slide_title,
        p_slide_order: noteData.slide_order,
        p_brochure_id: noteData.brochure_id,
        p_note_text: noteData.note_text,
        p_slide_image_uri: noteData.slide_image_uri || null
      })

      if (error) {
        console.error('Add slide note error:', error)
        return { success: false, error: error.message }
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to add slide note' }
      }

      return { success: true }
    } catch (error) {
      console.error('Add slide note error:', error)
      return { success: false, error: 'Failed to add slide note' }
    }
  }

  /**
   * Get meetings for MR user
   */
  static async getMeetings(mrId: string, filter?: string): Promise<{ success: boolean; data?: MRMeeting[]; error?: string }> {
    try {
      console.log('🔍 SERVER DEBUG: Fetching meetings from server for MR:', mrId);
      const { data, error } = await supabase.rpc('get_mr_meetings_with_notes', {
        p_mr_id: mrId
      })

      if (error) {
        console.error('❌ SERVER DEBUG: Get meetings error:', error)
        return { success: false, error: error.message }
      }

      console.log(`✅ SERVER DEBUG: Found ${data?.length || 0} meetings on server:`, 
        data?.map(m => ({ id: m.id, title: m.title, scheduled_date: m.scheduled_date, status: m.status })));
      return { success: true, data: data || [] }
    } catch (error) {
      console.error('❌ SERVER DEBUG: Failed to get meetings:', error)
      return { success: false, error: 'Failed to get meetings' }
    }
  }

  static async getMeetingDetails(meetingId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_meeting_details_with_notes', {
        p_meeting_id: meetingId
      })

      if (error) {
        console.error('Get meeting details error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error: any) {
      console.error('Get meeting details error:', error)
      return { success: false, error: error.message || 'Failed to fetch meeting details' }
    }
  }

  /**
   * Get meeting details with all slide notes (legacy function)
   */
  static async updateMeetingFollowUp(followUpData: {
    meeting_id: string
    follow_up_date: string
    follow_up_time: string
    follow_up_notes: string
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('=== MRService.updateMeetingFollowUp DEBUG ===')
      console.log('followUpData:', followUpData)
      console.log('Calling supabase.rpc with update_meeting_followup...')
      
      const { data, error } = await supabase.rpc('update_meeting_followup', {
        p_meeting_id: followUpData.meeting_id,
        p_follow_up_date: followUpData.follow_up_date,
        p_follow_up_time: followUpData.follow_up_time,
        p_follow_up_notes: followUpData.follow_up_notes
      })

      console.log('Supabase RPC result:')
      console.log('- data:', data)
      console.log('- error:', error)

      if (error) {
        console.error('Update follow-up error:', error)
        return { success: false, error: error.message }
      }

      console.log('Follow-up update successful')
      return { success: true, data }
    } catch (error: any) {
      console.error('Exception in updateMeetingFollowUp:', error)
      return { success: false, error: error.message || 'Failed to update follow-up' }
    }
  }

  /**
   * Create a new meeting follow-up
   */
  static async createMeetingFollowUp(followUpData: {
    meeting_id: string
    follow_up_date: string
    follow_up_time: string
    follow_up_notes?: string
    status?: 'scheduled' | 'completed' | 'cancelled'
  }): Promise<{ success: boolean; data?: { follow_up_id: string }; error?: string }> {
    try {
      console.log('=== MRService.createMeetingFollowUp DEBUG ===')
      console.log('followUpData:', followUpData)
      
      const { data, error } = await supabase.rpc('create_meeting_followup', {
        p_meeting_id: followUpData.meeting_id,
        p_follow_up_date: followUpData.follow_up_date,
        p_follow_up_time: followUpData.follow_up_time,
        p_follow_up_notes: followUpData.follow_up_notes || null,
        p_status: followUpData.status || 'scheduled'
      })

      console.log('Supabase RPC result:')
      console.log('- data:', data)
      console.log('- error:', error)

      if (error) {
        console.error('Create follow-up error:', error)
        return { success: false, error: error.message }
      }

      console.log('Follow-up created successfully')
      return { success: true, data: { follow_up_id: data?.follow_up_id || data?.id } }
    } catch (error: any) {
      console.error('Exception in createMeetingFollowUp:', error)
      return { success: false, error: error.message || 'Failed to create follow-up' }
    }
  }

  /**
   * Update an existing meeting follow-up
   */
  static async updateMeetingFollowUpById(followUpId: string, followUpData: {
    follow_up_date?: string
    follow_up_time?: string
    follow_up_notes?: string
    status?: 'scheduled' | 'completed' | 'cancelled'
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('=== MRService.updateMeetingFollowUpById DEBUG ===')
      console.log('followUpId:', followUpId)
      console.log('followUpData:', followUpData)
      
      const { data, error } = await supabase.rpc('update_meeting_followup_by_id', {
        p_follow_up_id: followUpId,
        p_follow_up_date: followUpData.follow_up_date || null,
        p_follow_up_time: followUpData.follow_up_time || null,
        p_follow_up_notes: followUpData.follow_up_notes || null,
        p_status: followUpData.status || null
      })

      console.log('Supabase RPC result:')
      console.log('- data:', data)
      console.log('- error:', error)

      if (error) {
        console.error('Update follow-up error:', error)
        return { success: false, error: error.message }
      }

      console.log('Follow-up updated successfully')
      return { success: true, data }
    } catch (error: any) {
      console.error('Exception in updateMeetingFollowUpById:', error)
      return { success: false, error: error.message || 'Failed to update follow-up' }
    }
  }

  /**
   * Delete a meeting follow-up
   */
  static async deleteMeetingFollowUp(followUpId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('=== MRService.deleteMeetingFollowUp DEBUG ===')
      console.log('followUpId:', followUpId)
      
      const { data, error } = await supabase.rpc('delete_meeting_followup', {
        p_follow_up_id: followUpId
      })

      console.log('Supabase RPC result:')
      console.log('- data:', data)
      console.log('- error:', error)

      if (error) {
        console.error('Delete follow-up error:', error)
        return { success: false, error: error.message }
      }

      console.log('Follow-up deleted successfully')
      return { success: true }
    } catch (error: any) {
      console.error('Exception in deleteMeetingFollowUp:', error)
      return { success: false, error: error.message || 'Failed to delete follow-up' }
    }
  }

  /**
   * Get all follow-ups for a meeting
   */
  static async getMeetingFollowUps(meetingId: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      console.log('=== MRService.getMeetingFollowUps DEBUG ===')
      console.log('meetingId:', meetingId)
      
      const { data, error } = await supabase.rpc('get_meeting_followups', {
        p_meeting_id: meetingId
      })

      console.log('Supabase RPC result:')
      console.log('- data:', data)
      console.log('- error:', error)

      if (error) {
        console.error('Get follow-ups error:', error)
        return { success: false, error: error.message }
      }

      console.log('Follow-ups fetched successfully')
      return { success: true, data: data || [] }
    } catch (error: any) {
      console.error('Exception in getMeetingFollowUps:', error)
      return { success: false, error: error.message || 'Failed to get follow-ups' }
    }
  }

  static async updateSlideNote(noteId: string, noteText: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('update_slide_note', {
        p_note_id: noteId,
        p_note_text: noteText
      })

      if (error) {
        console.error('Update slide note error:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error: any) {
      console.error('Update slide note error:', error)
      return { success: false, error: error.message || 'Failed to update note' }
    }
  }

  static async deleteSlideNote(noteId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('delete_slide_note', {
        p_note_id: noteId
      })

      if (error) {
        console.error('Delete slide note error:', error)
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error: any) {
      console.error('Delete slide note error:', error)
      return { success: false, error: error.message || 'Failed to delete note' }
    }
  }

  static async getMeetingDetailsLegacy(meetingId: string): Promise<{ success: boolean; data?: MeetingDetails; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_meeting_details_with_notes', {
        p_meeting_id: meetingId
      })

      if (error) {
        console.error('Get meeting details error:', error)
        return { success: false, error: error.message }
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to get meeting details' }
      }

      return { 
        success: true, 
        data: {
          meeting: data.meeting,
          slide_notes: data.slide_notes || []
        }
      }
    } catch (error) {
      console.error('Get meeting details error:', error)
      return { success: false, error: 'Failed to get meeting details' }
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

  // Clear recent activities for a user
  static async clearRecentActivities(userId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('Clearing recent activities for user:', userId)
      const { data, error } = await supabase
        .from('activity_logs')
        .delete()
        .eq('user_id', userId)

      if (error) {
        console.error('Clear activities error:', error)
        return { success: false, error: error.message }
      }

      console.log('Activities cleared successfully:', data)
      return { success: true, data }
    } catch (error) {
      console.error('Clear activities error:', error)
      return { success: false, error: 'Failed to clear activities' }
    }
  }

  // Alias methods for doctor management to match DoctorsScreen expectations
  static async addDoctor(mrId: string, doctorData: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('create_mr_doctor_assignment', {
        p_mr_id: mrId,
        p_first_name: doctorData.first_name,
        p_last_name: doctorData.last_name,
        p_specialty: doctorData.specialty,
        p_hospital: doctorData.hospital,
        p_phone: doctorData.phone,
        p_email: doctorData.email,
        p_location: doctorData.location,
        p_notes: doctorData.notes,
        p_profile_image_url: doctorData.profile_image_url
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to create doctor assignment' }
    }
  }

  static async getDoctors(mrId: string): Promise<{ success: boolean; data?: MRAssignedDoctor[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_doctors', { p_mr_id: mrId })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch doctors' }
    }
  }

  static async updateDoctor(doctorId: string, doctorData: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('update_mr_doctor_assignment', {
        p_doctor_id: doctorId,
        p_first_name: doctorData.first_name,
        p_last_name: doctorData.last_name,
        p_specialty: doctorData.specialty,
        p_hospital: doctorData.hospital,
        p_phone: doctorData.phone,
        p_email: doctorData.email,
        p_location: doctorData.location,
        p_notes: doctorData.notes,
        p_profile_image_url: doctorData.profile_image_url
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to update doctor assignment' }
    }
  }

  static async deleteDoctor(doctorId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.rpc('delete_mr_doctor_assignment', {
        p_doctor_id: doctorId
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to delete doctor' };
    }
  }
}