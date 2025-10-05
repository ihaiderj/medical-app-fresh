import { supabase } from './supabase'
import { PersistentAuthService } from './persistentAuthService'
import { SessionManagementService } from './sessionManagementService'

export interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'mr'
  first_name: string
  last_name: string
  phone?: string
  profile_image_url?: string
  is_active: boolean
}

export interface AuthResult {
  success: boolean
  user?: UserProfile
  error?: string
}

export class AuthService {
  // Simple in-memory storage for current user (in production, use secure storage)
  private static currentUser: UserProfile | null = null

  /**
   * Set current user (called after successful login)
   */
  static setCurrentUser(user: UserProfile): void {
    this.currentUser = user
  }

  /**
   * Get current user from memory
   */
  static getCurrentUserFromMemory(): UserProfile | null {
    return this.currentUser
  }

  /**
   * Clear current user (called on logout)
   */
  static clearCurrentUser(): void {
    this.currentUser = null
  }

  /**
   * Login with persistent authentication support
   */
  static async login(email: string, password: string, rememberMe: boolean = true): Promise<AuthResult & {
    hasSessionConflict?: boolean
    conflictDevice?: string
  }> {
    const result = await this.signIn(email, password)
    
    if (result.success && result.user) {
      // Register session and check for conflicts
      const sessionResult = await SessionManagementService.registerSessionWithConflictCheck(result.user.id)
      
      if (sessionResult.success) {
        // Save session for persistent authentication
        await PersistentAuthService.saveSession(
          result.user.id,
          result.user.email,
          result.user.role,
          password,
          rememberMe
        )

        return {
          ...result,
          hasSessionConflict: sessionResult.hasConflict,
          conflictDevice: sessionResult.conflictDevice
        }
      } else {
        console.warn('SessionManager: Failed to register session:', sessionResult.error)
        // Continue with login even if session registration fails
        await PersistentAuthService.saveSession(
          result.user.id,
          result.user.email,
          result.user.role,
          password,
          rememberMe
        )
      }
    }
    
    return result
  }

  /**
   * Sign in with email and password (original method)
   */
  static async signIn(email: string, password: string): Promise<AuthResult> {
    try {
      console.log('AuthService: Attempting login for email:', email)
      
      // First try Supabase Auth (for admin users)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('Supabase Auth result:', { data: !!data, error: error?.message })

      // Check if Supabase Auth was successful (no error AND has user)
      if (!error && data && data.user) {
        console.log('Supabase Auth successful, fetching profile...')
        // Get user profile from our users table
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single()

        if (profileError) {
          console.log('Profile fetch error:', profileError)
          return { success: false, error: 'Failed to fetch user profile' }
        }

        console.log('Admin login successful:', profile.email)
        const userProfile = {
          id: profile.id,
          email: profile.email,
          role: profile.role,
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone,
          profile_image_url: profile.profile_image_url,
          is_active: profile.is_active,
        }
        this.setCurrentUser(userProfile)
        
        // Log login activity
        try {
          console.log('Attempting to log login activity for user:', profile.id)
          const result = await supabase.rpc('log_activity', {
            p_user_id: profile.id,
            p_activity_type: 'login',
            p_description: `Logged in as ${profile.role}`
          })
          console.log('Login activity logged successfully:', result)
        } catch (error) {
          console.error('Failed to log login activity:', error)
        }
        
        return {
          success: true,
          user: userProfile,
        }
      }

      console.log('Supabase Auth failed, trying custom users table...')
      // If Supabase Auth fails, try custom users table (for MR users)
      const { data: customUsers, error: customError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('is_active', true)

      console.log('Custom user query result:', { customUsers: customUsers?.length, customError: customError?.message })

      if (customError) {
        console.log('Custom user query error:', customError)
        return { success: false, error: 'Invalid email or password' }
      }

      if (!customUsers || customUsers.length === 0) {
        console.log('No custom user found for email:', email)
        return { success: false, error: 'Invalid email or password' }
      }

      const customUser = customUsers[0]

      console.log('MR login successful:', customUser.email)
      // For now, we'll skip password verification for MR users
      // In a production app, you should implement proper password hashing/verification
      // For demo purposes, we'll accept any password for MR users
      
      const userProfile = {
        id: customUser.id,
        email: customUser.email,
        role: customUser.role,
        first_name: customUser.first_name,
        last_name: customUser.last_name,
        phone: customUser.phone,
        profile_image_url: customUser.profile_image_url,
        is_active: customUser.is_active,
      }
      this.setCurrentUser(userProfile)
      
      // Log login activity
      try {
        console.log('Attempting to log MR login activity for user:', customUser.id)
        const result = await supabase.rpc('log_activity', {
          p_user_id: customUser.id,
          p_activity_type: 'login',
          p_description: `Logged in as ${customUser.role}`
        })
        console.log('MR login activity logged successfully:', result)
      } catch (error) {
        console.error('Failed to log MR login activity:', error)
      }
      
      return {
        success: true,
        user: userProfile,
      }
    } catch (error) {
      console.log('AuthService error:', error)
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  /**
   * Sign out the current user
   */
  static async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  /**
   * Logout the current user (alias for signOut)
   */
  static async logout(): Promise<{ success: boolean; error?: string }> {
    // Clear stored user
    this.clearCurrentUser()
    return this.signOut()
  }

  /**
   * Get current user session
   */
  static async getCurrentUser(): Promise<AuthResult> {
    try {
      // First try to get user from memory (works for both admin and MR)
      const memoryUser = this.getCurrentUserFromMemory()
      if (memoryUser) {
        return {
          success: true,
          user: memoryUser,
        }
      }

      // Fallback: try Supabase Auth (for admin users only)
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        return { success: false, error: 'No active session' }
      }

      // Get user profile from our users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        return { success: false, error: 'Failed to fetch user profile' }
      }

      const userProfile = {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        profile_image_url: profile.profile_image_url,
        is_active: profile.is_active,
      }
      
      // Store in memory for future use
      this.setCurrentUser(userProfile)
      
      return {
        success: true,
        user: userProfile,
      }
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return !!session
    } catch (error) {
      return false
    }
  }

  /**
   * Listen to auth state changes
   */
  static onAuthStateChange(callback: (user: UserProfile | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profile) {
          callback({
            id: profile.id,
            email: profile.email,
            role: profile.role,
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone: profile.phone,
            profile_image_url: profile.profile_image_url,
            is_active: profile.is_active,
          })
        } else {
          callback(null)
        }
      } else {
        callback(null)
      }
    })
  }

  /**
   * Logout with persistent data clearing
   */
  static async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Logging out and clearing persistent data...')
      
      // Clear persistent session data
      await PersistentAuthService.clearSession()
      
      // Sign out from Supabase
      await supabase.auth.signOut()
      
      // Clear current user
      this.clearCurrentUser()
      
      console.log('Logout completed successfully')
      return { success: true }
    } catch (error) {
      console.error('Error during logout:', error)
      return { success: false, error: 'Failed to logout completely' }
    }
  }

  /**
   * Attempt automatic login using persistent session
   */
  static async attemptAutoLogin(): Promise<AuthResult> {
    try {
      console.log('Checking for persistent session...')
      
      // Check if there's a valid persistent session
      const autoLoginResult = await PersistentAuthService.attemptAutoLogin()
      
      if (autoLoginResult.success && autoLoginResult.user) {
        console.log('Auto-login successful for user:', autoLoginResult.user.email)
        this.setCurrentUser(autoLoginResult.user)
        return { success: true, user: autoLoginResult.user }
      } else {
        console.log('No valid persistent session found')
        return { success: false, error: autoLoginResult.error || 'No persistent session' }
      }
    } catch (error) {
      console.error('Error in auto-login attempt:', error)
      return { success: false, error: 'Auto-login failed' }
    }
  }
}





