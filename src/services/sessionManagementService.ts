/**
 * Session Management Service
 * Handles single-device login enforcement and session conflicts
 */
import { supabase } from './supabase'
import { AuthService } from './AuthService'

export interface ActiveSession {
  userId: string
  deviceId: string
  deviceInfo: string
  loginTime: string
  lastActivity: string
  isActive: boolean
}

export class SessionManagementService {
  private static currentDeviceId: string = ''

  /**
   * Initialize session management
   */
  static async initialize() {
    // Generate unique device ID
    this.currentDeviceId = await this.generateDeviceId()
    console.log('SessionManager: Device ID:', this.currentDeviceId)
  }

  /**
   * Register new session and check for conflicts
   */
  static async registerSession(userId: string): Promise<{
    success: boolean
    hasConflict: boolean
    conflictDevice?: string
    error?: string
  }> {
    try {
      const deviceInfo = await this.getDeviceInfo()
      
      // Check for existing active sessions
      const { data: existingSessions, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .neq('device_id', this.currentDeviceId)

      if (error) {
        console.error('SessionManager: Error checking existing sessions:', error)
        return { success: false, error: error.message, hasConflict: false }
      }

      // If there are active sessions on other devices, mark them as inactive
      if (existingSessions && existingSessions.length > 0) {
        console.log('SessionManager: Found active sessions on other devices, deactivating them')
        
        await supabase
          .from('user_sessions')
          .update({ is_active: false, ended_at: new Date().toISOString() })
          .eq('user_id', userId)
          .neq('device_id', this.currentDeviceId)

        // Return conflict info
        const conflictDevice = existingSessions[0].device_info || 'Unknown Device'
        return { 
          success: true, 
          hasConflict: true, 
          conflictDevice 
        }
      }

      // Register current session
      await supabase
        .from('user_sessions')
        .upsert({
          user_id: userId,
          device_id: this.currentDeviceId,
          device_info: deviceInfo,
          login_time: new Date().toISOString(),
          last_activity: new Date().toISOString(),
          is_active: true
        })

      console.log('SessionManager: Session registered successfully')
      return { success: true, hasConflict: false }
    } catch (error) {
      console.error('SessionManager: Session registration error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Session registration failed',
        hasConflict: false
      }
    }
  }

  /**
   * Update session activity
   */
  static async updateActivity(userId: string) {
    try {
      await supabase
        .from('user_sessions')
        .update({ last_activity: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('device_id', this.currentDeviceId)
    } catch (error) {
      console.warn('SessionManager: Activity update error:', error)
    }
  }

  /**
   * End current session
   */
  static async endSession(userId: string) {
    try {
      await supabase
        .from('user_sessions')
        .update({ 
          is_active: false, 
          ended_at: new Date().toISOString() 
        })
        .eq('user_id', userId)
        .eq('device_id', this.currentDeviceId)

      console.log('SessionManager: Session ended')
    } catch (error) {
      console.warn('SessionManager: End session error:', error)
    }
  }

  /**
   * Generate unique device ID
   */
  private static async generateDeviceId(): Promise<string> {
    try {
      const key = 'device_unique_id'
      let deviceId = await AsyncStorage.getItem(key)
      
      if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        await AsyncStorage.setItem(key, deviceId)
      }
      
      return deviceId
    } catch (error) {
      console.warn('SessionManager: Device ID generation error:', error)
      return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  }

  /**
   * Get device information
   */
  private static async getDeviceInfo(): Promise<string> {
    try {
      // You can enhance this with actual device info
      const platform = require('react-native').Platform
      return `${platform.OS} ${platform.Version}`
    } catch (error) {
      return 'Unknown Device'
    }
  }
}
