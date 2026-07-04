/**
 * Session Management Service
 * Handles single-device login enforcement via Django REST API
 */
import { apiClient } from './apiClient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LocalDatabaseService } from './localDatabaseService'

export interface ActiveSession {
  userId: string
  deviceId: string
  deviceInfo: string
  loginTime: string
  lastActivity: string
  isActive: boolean
}

interface SessionRegisterResponse {
  session_id?: string
  created_at?: string
  conflict?: boolean
  conflict_device?: string
}

export class SessionManagementService {
  private static currentDeviceId: string = ''

  static async initialize() {
    if (!this.currentDeviceId) {
      this.currentDeviceId = await this.generateDeviceId()
    }
  }

  static async registerSession(userId: string): Promise<{
    success: boolean
    hasConflict: boolean
    conflictDevice?: string
    error?: string
  }> {
    return this.registerSessionWithConflictCheck(userId)
  }

  static async updateActivity(_userId: string) {
    // Server tracks session activity on register; no separate endpoint required
  }

  static async endSession(_userId: string) {
    // Session ends client-side on logout
  }

  private static async generateDeviceId(): Promise<string> {
    try {
      const key = 'device_unique_id'
      let deviceId = await AsyncStorage.getItem(key)

      if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        await AsyncStorage.setItem(key, deviceId)
      }

      return deviceId
    } catch {
      return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  }

  private static async getDeviceInfo(): Promise<string> {
    try {
      const { Platform } = require('react-native')
      return `${Platform.OS} ${Platform.Version}`
    } catch {
      return 'Unknown Device'
    }
  }

  static async recordLocalSession(userId: string, isActive: boolean = true) {
    await this.initialize()
    const now = new Date().toISOString()
    await LocalDatabaseService.upsertSession({
      id: `${userId}_${this.currentDeviceId}`,
      user_id: userId,
      device_id: this.currentDeviceId,
      is_active: isActive,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    })
  }

  static async registerSessionWithConflictCheck(userId: string): Promise<{
    success: boolean
    hasConflict: boolean
    conflictDevice?: string
    error?: string
  }> {
    try {
      await this.initialize()
      const deviceInfo = await this.getDeviceInfo()

      const data = await apiClient.post<SessionRegisterResponse>('/api/sessions/register/', {
        device_id: this.currentDeviceId,
        device_info: deviceInfo,
      })

      await LocalDatabaseService.upsertSession({
        id: data.session_id || `${userId}_${this.currentDeviceId}`,
        user_id: userId,
        device_id: this.currentDeviceId,
        is_active: true,
        last_seen_at: new Date().toISOString(),
        created_at: data.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sync_status: 'synced',
        local_changes: null,
      })

      return {
        success: true,
        hasConflict: !!data.conflict,
        conflictDevice: data.conflict_device,
      }
    } catch (error) {
      console.error('SessionManager: Session registration error:', error)
      await this.recordLocalSession(userId)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session registration failed',
        hasConflict: false,
      }
    }
  }
}
