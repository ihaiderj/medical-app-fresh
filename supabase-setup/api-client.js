// Supabase API Client for Medical Representative App
// Install: npm install @supabase/supabase-js

import { createClient } from '@supabase/supabase-js'

// Replace with your Supabase URL and anon key
const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Auth functions
export const authAPI = {
  // Sign in user
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  // Sign up new user
  async signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData
      }
    })
    return { data, error }
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // Get current user
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  }
}

// Admin Dashboard API
export const adminAPI = {
  // Get dashboard statistics
  async getDashboardStats() {
    const { data, error } = await supabase.rpc('get_admin_dashboard_stats')
    return { data, error }
  },

  // Get all MRs
  async getAllMRs() {
    const { data, error } = await supabase.rpc('get_all_mrs')
    return { data, error }
  },

  // Create new MR
  async createMR(mrData) {
    const { data, error } = await supabase.rpc('create_mr', {
      p_email: mrData.email,
      p_password_hash: mrData.password_hash,
      p_first_name: mrData.first_name,
      p_last_name: mrData.last_name,
      p_phone: mrData.phone,
      p_profile_image_url: mrData.profile_image_url
    })
    return { data, error }
  },

  // Update MR
  async updateMR(mrId, updateData) {
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', mrId)
      .eq('role', 'mr')
    return { data, error }
  },

  // Delete MR
  async deleteMR(mrId) {
    const { data, error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', mrId)
      .eq('role', 'mr')
    return { data, error }
  }
}

// Brochure Management API
export const brochureAPI = {
  // Get all brochures
  async getAllBrochures() {
    const { data, error } = await supabase.rpc('get_all_brochures')
    return { data, error }
  },

  // Create new brochure
  async createBrochure(brochureData) {
    const { data, error } = await supabase.rpc('create_brochure', {
      p_title: brochureData.title,
      p_category: brochureData.category,
      p_description: brochureData.description,
      p_file_url: brochureData.file_url,
      p_thumbnail_url: brochureData.thumbnail_url,
      p_pages: brochureData.pages,
      p_file_size: brochureData.file_size,
      p_assigned_by: brochureData.assigned_by
    })
    return { data, error }
  },

  // Update brochure
  async updateBrochure(brochureId, updateData) {
    const { data, error } = await supabase
      .from('brochures')
      .update(updateData)
      .eq('id', brochureId)
    return { data, error }
  },

  // Delete brochure
  async deleteBrochure(brochureId) {
    const { data, error } = await supabase
      .from('brochures')
      .update({ status: 'archived' })
      .eq('id', brochureId)
    return { data, error }
  },

  // Increment download count
  async incrementDownloadCount(brochureId) {
    const { data, error } = await supabase.rpc('increment_download_count', {
      brochure_id: brochureId
    })
    return { data, error }
  },

  // Increment view count
  async incrementViewCount(brochureId) {
    const { data, error } = await supabase.rpc('increment_view_count', {
      brochure_id: brochureId
    })
    return { data, error }
  }
}

// Doctor Management API
export const doctorAPI = {
  // Get all doctors
  async getAllDoctors() {
    const { data, error } = await supabase.rpc('get_all_doctors')
    return { data, error }
  },

  // Create new doctor
  async createDoctor(doctorData) {
    const { data, error } = await supabase.rpc('create_doctor', {
      p_first_name: doctorData.first_name,
      p_last_name: doctorData.last_name,
      p_email: doctorData.email,
      p_phone: doctorData.phone,
      p_specialty: doctorData.specialty,
      p_hospital: doctorData.hospital,
      p_location: doctorData.location,
      p_profile_image_url: doctorData.profile_image_url,
      p_notes: doctorData.notes,
      p_created_by: doctorData.created_by
    })
    return { data, error }
  },

  // Update doctor
  async updateDoctor(doctorId, updateData) {
    const { data, error } = await supabase
      .from('doctors')
      .update(updateData)
      .eq('id', doctorId)
    return { data, error }
  },

  // Delete doctor
  async deleteDoctor(doctorId) {
    const { data, error } = await supabase
      .from('doctors')
      .delete()
      .eq('id', doctorId)
    return { data, error }
  },

  // Assign doctor to MR
  async assignDoctorToMR(doctorId, mrId, assignedBy, notes = null) {
    const { data, error } = await supabase.rpc('assign_doctor_to_mr', {
      p_doctor_id: doctorId,
      p_mr_id: mrId,
      p_assigned_by: assignedBy,
      p_notes: notes
    })
    return { data, error }
  },

  // Get MR's assigned doctors
  async getMRDoctors(mrId) {
    const { data, error } = await supabase.rpc('get_mr_doctors', {
      p_mr_id: mrId
    })
    return { data, error }
  }
}

// Meeting Management API
export const meetingAPI = {
  // Get all meetings
  async getAllMeetings() {
    const { data, error } = await supabase.rpc('get_all_meetings')
    return { data, error }
  },

  // Get MR's meetings
  async getMRMeetings(mrId) {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        doctors:doctor_id (
          first_name,
          last_name,
          hospital,
          specialty
        ),
        brochures:brochure_id (
          title,
          category
        )
      `)
      .eq('mr_id', mrId)
      .order('scheduled_date', { ascending: false })
    return { data, error }
  },

  // Create meeting
  async createMeeting(meetingData) {
    const { data, error } = await supabase
      .from('meetings')
      .insert(meetingData)
      .select()
    return { data, error }
  },

  // Update meeting
  async updateMeeting(meetingId, updateData) {
    const { data, error } = await supabase
      .from('meetings')
      .update(updateData)
      .eq('id', meetingId)
    return { data, error }
  },

  // Delete meeting
  async deleteMeeting(meetingId) {
    const { data, error } = await supabase
      .from('meetings')
      .delete()
      .eq('id', meetingId)
    return { data, error }
  },

  // Get meetings by status
  async getMeetingsByStatus(status) {
    const { data, error } = await supabase
      .from('meetings')
      .select(`
        *,
        doctors:doctor_id (
          first_name,
          last_name,
          hospital
        ),
        users:mr_id (
          first_name,
          last_name
        )
      `)
      .eq('status', status)
      .order('scheduled_date', { ascending: false })
    return { data, error }
  }
}

// System Settings API
export const settingsAPI = {
  // Get all system settings
  async getSystemSettings() {
    const { data, error } = await supabase.rpc('get_system_settings')
    return { data, error }
  },

  // Update system setting
  async updateSystemSetting(key, value, updatedBy) {
    const { data, error } = await supabase.rpc('update_system_setting', {
      p_setting_key: key,
      p_setting_value: value,
      p_updated_by: updatedBy
    })
    return { data, error }
  }
}

// Activity Logging API
export const activityAPI = {
  // Log activity
  async logActivity(activityData) {
    const { data, error } = await supabase.rpc('log_activity', {
      p_user_id: activityData.user_id,
      p_action: activityData.action,
      p_entity_type: activityData.entity_type,
      p_entity_id: activityData.entity_id,
      p_details: activityData.details,
      p_ip_address: activityData.ip_address,
      p_user_agent: activityData.user_agent
    })
    return { data, error }
  },

  // Get user activity logs
  async getUserActivityLogs(userId, limit = 50) {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return { data, error }
  },

  // Get all activity logs (admin only)
  async getAllActivityLogs(limit = 100) {
    const { data, error } = await supabase
      .from('activity_logs')
      .select(`
        *,
        users:user_id (
          first_name,
          last_name,
          email
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)
    return { data, error }
  }
}

// File Upload API (using Supabase Storage)
export const storageAPI = {
  // Upload file to storage
  async uploadFile(bucket, filePath, file) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file)
    return { data, error }
  },

  // Get public URL for file
  getPublicUrl(bucket, filePath) {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)
    return data.publicUrl
  },

  // Delete file from storage
  async deleteFile(bucket, filePath) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .remove([filePath])
    return { data, error }
  }
}

// Real-time subscriptions
export const realtimeAPI = {
  // Subscribe to meetings changes
  subscribeToMeetings(callback) {
    return supabase
      .channel('meetings')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'meetings' }, 
        callback
      )
      .subscribe()
  },

  // Subscribe to doctors changes
  subscribeToDoctors(callback) {
    return supabase
      .channel('doctors')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'doctors' }, 
        callback
      )
      .subscribe()
  },

  // Subscribe to brochures changes
  subscribeToBrochures(callback) {
    return supabase
      .channel('brochures')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'brochures' }, 
        callback
      )
      .subscribe()
  }
}

export default supabase

