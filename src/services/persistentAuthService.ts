/**
 * Persistent Authentication Service
 * Handles automatic login, session persistence, and auto-logout
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { LocalDatabaseService } from './localDatabaseService'
import { SessionManagementService } from './sessionManagementService'
import { ExtendedAuthService } from './extendedAuthService'

interface PersistentSession {
  userId: string
  email: string
  role: 'admin' | 'mr'
  loginTime: number
  lastActivity: number
  rememberMe: boolean
}

export class PersistentAuthService {
  private static readonly SESSION_KEY = 'medical_app_session'
  private static readonly CREDENTIALS_KEY = 'medical_app_credentials'
  private static readonly SESSION_DURATION = 365 * 24 * 60 * 60 * 1000 // 1 year in milliseconds (effectively indefinite)
  private static readonly ACTIVITY_CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes

  /**
   * Save user session for persistent login
   */
  static async saveSession(
    userId: string, 
    email: string, 
    role: 'admin' | 'mr',
    password?: string,
    rememberMe: boolean = true,
    passwordIsHashed: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const now = Date.now()
      const session: PersistentSession = {
        userId,
        email,
        role,
        loginTime: now,
        lastActivity: now,
        rememberMe
      }

      // Save session data
      await AsyncStorage.setItem(this.SESSION_KEY, JSON.stringify(session))
      
      // Save credentials securely if rememberMe is true and password provided
      if (rememberMe && password) {
        const credentials = { email, password, isHashed: passwordIsHashed }
        await SecureStore.setItemAsync(this.CREDENTIALS_KEY, JSON.stringify(credentials))
      }

      console.log('Session saved successfully:', { userId, email, role, rememberMe })
      return { success: true }
    } catch (error) {
      console.error('Error saving session:', error)
      return { success: false, error: 'Failed to save session' }
    }
  }

  /**
   * Get current persistent session
   */
  static async getSession(): Promise<{ session?: PersistentSession; isValid: boolean }> {
    try {
      const sessionData = await AsyncStorage.getItem(this.SESSION_KEY)
      if (!sessionData) {
        return { isValid: false }
      }

      const session: PersistentSession = JSON.parse(sessionData)
      const now = Date.now()

      // Check if session has expired (30 days)
      if (now - session.loginTime > this.SESSION_DURATION) {
        console.log('Session expired, removing...')
        await this.clearSession()
        return { isValid: false }
      }

      // Check if user has been inactive too long (could add shorter inactivity timeout)
      // For now, we'll just update last activity
      session.lastActivity = now
      await AsyncStorage.setItem(this.SESSION_KEY, JSON.stringify(session))

      console.log('Valid session found:', { userId: session.userId, email: session.email, role: session.role })
      return { session, isValid: true }
    } catch (error) {
      console.error('Error getting session:', error)
      return { isValid: false }
    }
  }

  /**
   * Update last activity timestamp
   */
  static async updateActivity(): Promise<void> {
    try {
      const sessionData = await AsyncStorage.getItem(this.SESSION_KEY)
      if (sessionData) {
        const session: PersistentSession = JSON.parse(sessionData)
        session.lastActivity = Date.now()
        await AsyncStorage.setItem(this.SESSION_KEY, JSON.stringify(session))
      }
    } catch (error) {
      console.error('Error updating activity:', error)
    }
  }

  /**
   * Attempt automatic login using saved credentials
   */
  static async attemptAutoLogin(): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      console.log('Attempting automatic login...')
      
      // Get saved session
      const { session, isValid } = await this.getSession()
      if (!isValid || !session) {
        const extendedRestore = await this.tryRestoreFromExtendedSession()
        if (extendedRestore.success) {
          return extendedRestore
        }
        console.log('No valid session found')
        return { success: false, error: 'No valid session' }
      }

      // Try to get saved credentials
      const credentialsData = await SecureStore.getItemAsync(this.CREDENTIALS_KEY)
      if (!credentialsData) {
        const extendedRestore = await this.tryRestoreFromExtendedSession()
        if (extendedRestore.success) {
          return extendedRestore
        }
        console.log('No saved credentials found')
        return { success: false, error: 'No saved credentials' }
      }

      const credentials = JSON.parse(credentialsData)
      
      if (credentials.isHashed) {
        let localResult = await LocalDatabaseService.getUserCredentialsByEmail(credentials.email)
        if (!localResult) {
          await LocalDatabaseService.ensureReady()
          localResult = await LocalDatabaseService.getUserCredentialsByEmail(credentials.email)
        }

        if (!localResult || localResult.password_hash !== credentials.password) {
          console.warn('PersistentAuth: Stored credentials mismatch or lookup failed')
          const extendedRestore = await this.tryRestoreFromExtendedSession()
          if (extendedRestore.success) {
            return extendedRestore
          }
          await this.clearSession()
          return { success: false, error: 'Stored credentials mismatch' }
        }

        const localUser = await LocalDatabaseService.getUserById(localResult.user_id)
        if (!localUser) {
          const extendedRestore = await this.tryRestoreFromExtendedSession()
          if (extendedRestore.success) {
            return extendedRestore
          }
          await this.clearSession()
          return { success: false, error: 'Offline profile not found' }
        }

        const userProfile = {
          id: localUser.id,
          email: localUser.email,
          role: localUser.role,
          first_name: localUser.first_name,
          last_name: localUser.last_name,
          phone: localUser.phone,
          profile_image_url: localUser.profile_image_url,
          is_active: localUser.is_active,
        }

        await SessionManagementService.recordLocalSession(userProfile.id)
        // Import AuthService statically to avoid Metro bundler issues
        const { AuthService } = require('./AuthService')
        const withPerms = await AuthService.attachLocalPermissions(userProfile)
        AuthService.setCurrentUser(withPerms)

        console.log('Auto-login succeeded using local credentials')
        return { success: true, user: withPerms }
      }

      // Attempt login with saved credentials
      console.log('Attempting auto-login for:', credentials.email)
      // Import AuthService statically to avoid Metro bundler issues
      const { AuthService } = require('./AuthService')
      const loginResult = await AuthService.signIn(credentials.email, credentials.password)
      
      if (loginResult.success) {
        console.log('Auto-login successful')
        // Update session activity
        await this.updateActivity()
        return { success: true, user: loginResult.user }
      } else {
        console.log('Auto-login failed, clearing saved data')
        await this.clearSession()
        return { success: false, error: 'Auto-login failed' }
      }
    } catch (error) {
      console.error('Error in auto-login:', error)
      const extendedRestore = await this.tryRestoreFromExtendedSession()
      if (extendedRestore.success) {
        return extendedRestore
      }
      return { success: false, error: 'Auto-login error' }
    }
  }

  private static async tryRestoreFromExtendedSession(): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const extended = await ExtendedAuthService.getExtendedSession()
      if (!extended || Date.now() >= extended.expiresAt) {
        return { success: false, error: 'No extended session' }
      }

      await LocalDatabaseService.ensureReady()
      const localUser = await LocalDatabaseService.getUserById(extended.userId)
      if (!localUser) {
        return { success: false, error: 'Extended session user not in local DB' }
      }

      const userProfile = {
        id: localUser.id,
        email: localUser.email,
        role: localUser.role,
        first_name: localUser.first_name,
        last_name: localUser.last_name,
        phone: localUser.phone,
        profile_image_url: localUser.profile_image_url,
        is_active: localUser.is_active,
      }

      await SessionManagementService.recordLocalSession(userProfile.id)
      const { AuthService } = require('./AuthService')
      const withPerms = await AuthService.attachLocalPermissions(userProfile)
      AuthService.setCurrentUser(withPerms)
      await this.saveSession(extended.userId, extended.email, extended.role, undefined, true)

      console.log('Auto-login succeeded using extended offline session')
      return { success: true, user: withPerms }
    } catch (error) {
      console.warn('PersistentAuth: Extended session restore failed:', error)
      return { success: false, error: 'Extended session restore failed' }
    }
  }

  /**
   * Clear all persistent session data (logout)
   */
  static async clearSession(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Clearing persistent session...')
      await AsyncStorage.removeItem(this.SESSION_KEY)
      await SecureStore.deleteItemAsync(this.CREDENTIALS_KEY)
      console.log('Session cleared successfully')
      return { success: true }
    } catch (error) {
      console.error('Error clearing session:', error)
      return { success: false, error: 'Failed to clear session' }
    }
  }

  /**
   * Check if user should be automatically logged out due to inactivity
   */
  static async checkInactivityLogout(): Promise<{ shouldLogout: boolean; reason?: string }> {
    try {
      const { session, isValid } = await this.getSession()
      if (!isValid || !session) {
        return { shouldLogout: false }
      }

      const now = Date.now()
      const inactivityDuration = now - session.lastActivity

      // Auto-logout after 30 days of total inactivity
      if (inactivityDuration > this.SESSION_DURATION) {
        await this.clearSession()
        return { shouldLogout: true, reason: 'Session expired due to inactivity' }
      }

      return { shouldLogout: false }
    } catch (error) {
      console.error('Error checking inactivity:', error)
      return { shouldLogout: false }
    }
  }

  /**
   * Get session info for debugging
   */
  static async getSessionInfo(): Promise<any> {
    try {
      const sessionData = await AsyncStorage.getItem(this.SESSION_KEY)
      if (!sessionData) return null

      const session: PersistentSession = JSON.parse(sessionData)
      const now = Date.now()
      
      return {
        ...session,
        sessionAge: Math.floor((now - session.loginTime) / (1000 * 60 * 60 * 24)), // days
        lastActivityAge: Math.floor((now - session.lastActivity) / (1000 * 60)), // minutes
        isExpired: (now - session.loginTime) > this.SESSION_DURATION
      }
    } catch (error) {
      console.error('Error getting session info:', error)
      return null
    }
  }
}
