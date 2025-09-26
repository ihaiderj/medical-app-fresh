// React Native Integration for Supabase
// Install: npm install @supabase/supabase-js react-native-url-polyfill

import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Replace with your Supabase URL and anon key
const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY'

// Create Supabase client with AsyncStorage for session persistence
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Auth Service for React Native
export class AuthService {
  // Sign in user
  static async signIn(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      if (error) throw error
      
      // Get user profile
      const profile = await this.getUserProfile(data.user.id)
      
      return {
        success: true,
        user: data.user,
        profile: profile.data
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Sign up new user
  static async signUp(email, password, userData) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      })
      
      if (error) throw error
      
      return {
        success: true,
        user: data.user
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Sign out
  static async signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Get current user
  static async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      
      if (user) {
        const profile = await this.getUserProfile(user.id)
        return {
          success: true,
          user,
          profile: profile.data
        }
      }
      
      return { success: false, user: null }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Get user profile
  static async getUserProfile(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    
    return { data, error }
  }

  // Check if user is admin
  static async isAdmin() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false
      
      const { data: profile } = await this.getUserProfile(user.id)
      return profile?.role === 'admin'
    } catch (error) {
      return false
    }
  }
}

// Admin Service
export class AdminService {
  // Get dashboard statistics
  static async getDashboardStats() {
    try {
      const { data, error } = await supabase.rpc('get_admin_dashboard_stats')
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Get all MRs
  static async getAllMRs() {
    try {
      const { data, error } = await supabase.rpc('get_all_mrs')
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Create new MR
  static async createMR(mrData) {
    try {
      // Hash password (you should use a proper hashing library)
      const password_hash = await this.hashPassword(mrData.password)
      
      const { data, error } = await supabase.rpc('create_mr', {
        p_email: mrData.email,
        p_password_hash: password_hash,
        p_first_name: mrData.first_name,
        p_last_name: mrData.last_name,
        p_phone: mrData.phone,
        p_profile_image_url: mrData.profile_image_url
      })
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Get all brochures
  static async getAllBrochures() {
    try {
      const { data, error } = await supabase.rpc('get_all_brochures')
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Create new brochure
  static async createBrochure(brochureData) {
    try {
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
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Get all doctors
  static async getAllDoctors() {
    try {
      const { data, error } = await supabase.rpc('get_all_doctors')
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Create new doctor
  static async createDoctor(doctorData) {
    try {
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
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Assign doctor to MR
  static async assignDoctorToMR(doctorId, mrId, assignedBy, notes = null) {
    try {
      const { data, error } = await supabase.rpc('assign_doctor_to_mr', {
        p_doctor_id: doctorId,
        p_mr_id: mrId,
        p_assigned_by: assignedBy,
        p_notes: notes
      })
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Get all meetings
  static async getAllMeetings() {
    try {
      const { data, error } = await supabase.rpc('get_all_meetings')
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Simple password hashing (use bcrypt in production)
  static async hashPassword(password) {
    // This is a simple example - use proper hashing in production
    return btoa(password) // Base64 encoding (not secure for production)
  }
}

// MR Service
export class MRService {
  // Get MR's assigned doctors
  static async getAssignedDoctors(mrId) {
    try {
      const { data, error } = await supabase.rpc('get_mr_doctors', {
        p_mr_id: mrId
      })
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Get MR's meetings
  static async getMeetings(mrId) {
    try {
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
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Create meeting
  static async createMeeting(meetingData) {
    try {
      const { data, error } = await supabase
        .from('meetings')
        .insert(meetingData)
        .select()
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Update doctor
  static async updateDoctor(doctorId, updateData) {
    try {
      const { data, error } = await supabase
        .from('doctors')
        .update(updateData)
        .eq('id', doctorId)
      
      if (error) throw error
      
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

// File Upload Service
export class FileUploadService {
  // Upload brochure file
  static async uploadBrochure(file, fileName) {
    try {
      const fileExt = fileName.split('.').pop()
      const filePath = `brochures/${Date.now()}.${fileExt}`
      
      const { data, error } = await supabase.storage
        .from('brochures')
        .upload(filePath, file)
      
      if (error) throw error
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('brochures')
        .getPublicUrl(filePath)
      
      return {
        success: true,
        filePath,
        publicUrl: urlData.publicUrl
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Upload profile image
  static async uploadProfileImage(file, fileName) {
    try {
      const fileExt = fileName.split('.').pop()
      const filePath = `profiles/${Date.now()}.${fileExt}`
      
      const { data, error } = await supabase.storage
        .from('profiles')
        .upload(filePath, file)
      
      if (error) throw error
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath)
      
      return {
        success: true,
        filePath,
        publicUrl: urlData.publicUrl
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }
}

// Real-time Service
export class RealtimeService {
  // Subscribe to meetings updates
  static subscribeToMeetings(mrId, callback) {
    return supabase
      .channel('meetings')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'meetings',
          filter: `mr_id=eq.${mrId}`
        }, 
        callback
      )
      .subscribe()
  }

  // Subscribe to doctors updates
  static subscribeToDoctors(mrId, callback) {
    return supabase
      .channel('doctors')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'doctors'
        }, 
        callback
      )
      .subscribe()
  }

  // Subscribe to brochures updates
  static subscribeToBrochures(callback) {
    return supabase
      .channel('brochures')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'brochures'
        }, 
        callback
      )
      .subscribe()
  }
}

export default supabase

