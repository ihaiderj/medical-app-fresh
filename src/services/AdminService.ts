import { supabase } from './supabase'
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

export class AdminService {
  /**
   * Get dashboard statistics
   */
  static async getDashboardStats(): Promise<{ success: boolean; data?: DashboardStats; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_admin_dashboard_stats')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch dashboard stats' }
    }
  }

  static async getRecentActivities(limit: number = 5): Promise<{ success: boolean; data?: RecentActivity[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_recent_activities', { limit_count: limit })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch recent activities' }
    }
  }

  static async getSystemStatus(): Promise<{ success: boolean; data?: SystemStatus; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_system_status')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch system status' }
    }
  }

  static async getMRPerformanceStats(): Promise<{ success: boolean; data?: MRPerformance[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_performance_stats')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MR performance stats' }
    }
  }

  static async getBrochureAnalytics(): Promise<{ success: boolean; data?: BrochureAnalytics[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_brochure_analytics')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch brochure analytics' }
    }
  }

  /**
   * Get all medical representatives
   */
  static async getAllMRs(): Promise<{ success: boolean; data?: MRData[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_all_mrs')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MRs' }
    }
  }

  /**
   * Create new medical representative
   */
  static async createMR(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    phone?: string,
    profileImageUrl?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // First create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (authError) {
        return { success: false, error: authError.message }
      }

      if (!authData.user) {
        return { success: false, error: 'Failed to create user' }
      }

      // Then create user profile
      const { data, error } = await supabase.rpc('create_mr', {
        p_email: email,
        p_password_hash: '', // Password is handled by Supabase Auth
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: phone,
        p_profile_image_url: profileImageUrl,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to create MR' }
    }
  }

  /**
   * Get all brochures
   */
  static async getAllBrochures(): Promise<{ success: boolean; data?: BrochureData[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_all_brochures')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch brochures' }
    }
  }

  /**
   * Create new brochure
   */
  static async createBrochure(
    title: string,
    category: string,
    fileUrl: string,
    description?: string,
    thumbnailUrl?: string,
    pages?: number,
    fileSize?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('create_brochure', {
        p_title: title,
        p_category: category,
        p_description: description,
        p_file_url: fileUrl,
        p_thumbnail_url: thumbnailUrl,
        p_pages: pages,
        p_file_size: fileSize,
        p_assigned_by: null, // Will be set by the function
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to create brochure' }
    }
  }

  /**
   * Get all doctors
   */
  static async getAllDoctors(): Promise<{ success: boolean; data?: DoctorData[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_all_doctors')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch doctors' }
    }
  }

  /**
   * Create new doctor
   */
  static async createDoctor(
    firstName: string,
    lastName: string,
    specialty: string,
    hospital: string,
    email?: string,
    phone?: string,
    location?: string,
    profileImageUrl?: string,
    notes?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('create_doctor', {
        p_first_name: firstName,
        p_last_name: lastName,
        p_email: email,
        p_phone: phone,
        p_specialty: specialty,
        p_hospital: hospital,
        p_location: location,
        p_profile_image_url: profileImageUrl,
        p_notes: notes,
        p_created_by: null, // Will be set by the function
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to create doctor' }
    }
  }

  /**
   * Assign doctor to MR
   */
  static async assignDoctorToMR(
    doctorId: string,
    mrId: string,
    notes?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('assign_doctor_to_mr', {
        p_doctor_id: doctorId,
        p_mr_id: mrId,
        p_assigned_by: null, // Will be set by the function
        p_notes: notes,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to assign doctor to MR' }
    }
  }

  /**
   * Get all meetings
   */
  static async getAllMeetings(): Promise<{ success: boolean; data?: MeetingData[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_all_meetings')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch meetings' }
    }
  }

  /**
   * Create MR with permissions
   */
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
    canScheduleMeetings: boolean = true
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('create_mr_with_permissions', {
        p_email: email,
        p_password_hash: password, // This will be hashed by Supabase Auth
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: phone,
        p_address: address,
        p_profile_image_url: profileImageUrl,
        p_can_upload_brochures: canUploadBrochures,
        p_can_manage_doctors: canManageDoctors,
        p_can_schedule_meetings: canScheduleMeetings,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to create MR' }
    }
  }

  /**
   * Get all MRs with permissions
   */
  static async getAllMRsWithPermissions(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_all_mrs_with_permissions')

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to fetch MRs' }
    }
  }

  /**
   * Update MR permissions
   */
  static async updateMRPermissions(
    mrId: string,
    canUploadBrochures?: boolean,
    canManageDoctors?: boolean,
    canScheduleMeetings?: boolean
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('update_mr_permissions', {
        p_mr_id: mrId,
        p_can_upload_brochures: canUploadBrochures,
        p_can_manage_doctors: canManageDoctors,
        p_can_schedule_meetings: canScheduleMeetings,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to update MR permissions' }
    }
  }

  /**
   * Update MR profile
   */
  static async updateMRProfile(
    mrId: string,
    firstName?: string,
    lastName?: string,
    phone?: string,
    address?: string,
    profileImageUrl?: string,
    isActive?: boolean
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('update_mr_profile', {
        p_mr_id: mrId,
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: phone,
        p_address: address,
        p_profile_image_url: profileImageUrl,
        p_is_active: isActive,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to update MR profile' }
    }
  }

  /**
   * Deactivate MR (soft delete - keeps data but makes inactive)
   */
  static async deactivateMR(mrId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('deactivate_mr', {
        p_mr_id: mrId,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to deactivate MR' }
    }
  }

  /**
   * Delete MR (hard delete - permanently removes from database)
   */
  static async deleteMR(mrId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('hard_delete_mr', {
        p_mr_id: mrId,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      return { success: false, error: 'Failed to delete MR' }
    }
  }

  /**
   * Log activity
   */
  static async logActivity(
    action: string,
    entityType: string,
    entityId?: string,
    details?: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.rpc('log_activity', {
        p_user_id: null, // Will be set by the function
        p_action: action,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_details: details,
        p_ip_address: null,
        p_user_agent: null,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: 'Failed to log activity' }
    }
  }

  /**
   * Brochure Management Methods
   */

  // Create new brochure
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

      // Use provided thumbnail or generate based on file type
      let finalThumbnailUrl = thumbnailUrl
      
      if (!finalThumbnailUrl) {
        if (fileType?.includes('pdf') && fileUrl) {
          // For PDFs, create a placeholder thumbnail
          finalThumbnailUrl = 'https://picsum.photos/300/200?random=' + Date.now()
        } else if (fileType?.includes('image') && fileUrl) {
          // For images, use the image itself as thumbnail
          finalThumbnailUrl = fileUrl
        } else {
          // Default placeholder
          finalThumbnailUrl = 'https://picsum.photos/300/200?random=' + Date.now()
        }
      }

      // Now create the brochure with the category ID
      const { data, error } = await supabase.rpc('create_brochure_with_category', {
        p_title: title,
        p_category_id: categoryId,
        p_description: description,
        p_file_url: fileUrl,
        p_file_name: fileName,
        p_file_type: fileType ? fileType.substring(0, 100) : null, // Truncate long MIME types
        p_thumbnail_url: finalThumbnailUrl,
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

  // Get all brochures with categories
  static async getAllBrochuresWithCategories(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_all_brochures_with_categories')

      if (error) {
        console.error('Get brochures error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data: data || [] }
    } catch (error) {
      console.error('Get brochures error:', error)
      return { success: false, error: 'Failed to load brochures' }
    }
  }

  // Get brochure categories
  static async getBrochureCategories(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_brochure_categories')

      if (error) {
        console.error('Get categories error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data: data || [] }
    } catch (error) {
      console.error('Get categories error:', error)
      return { success: false, error: 'Failed to load categories' }
    }
  }

  // Update brochure
  static async updateBrochure(
    brochureId: string,
    title?: string,
    description?: string,
    category?: string,
    tags?: string[],
    isPublic?: boolean,
    thumbnailUrl?: string,
    pages?: number
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const updateData: any = {}
      
      if (title !== undefined) updateData.title = title
      if (description !== undefined) updateData.description = description
      if (tags !== undefined) updateData.tags = tags
      if (isPublic !== undefined) updateData.is_public = isPublic
      if (thumbnailUrl !== undefined) updateData.thumbnail_url = thumbnailUrl
      if (pages !== undefined) updateData.pages = pages
      
      const { data, error } = await supabase
        .from('brochures')
        .update(updateData)
        .eq('id', brochureId)
        .select()

      if (error) {
        console.error('Update brochure error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      console.error('Update brochure error:', error)
      return { success: false, error: 'Failed to update brochure' }
    }
  }

  // Delete brochure
  static async deleteBrochure(brochureId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('brochures')
        .delete()
        .eq('id', brochureId)

      if (error) {
        console.error('Delete brochure error:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data }
    } catch (error) {
      console.error('Delete brochure error:', error)
      return { success: false, error: 'Failed to delete brochure' }
    }
  }
}

