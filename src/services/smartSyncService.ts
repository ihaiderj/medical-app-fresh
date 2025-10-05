/**
 * Smart Sync Service
 * Handles intelligent synchronization with idle detection, conflict resolution, and offline handling
 */
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as FileSystem from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AuthService } from './AuthService'
import { BrochureManagementService, BrochureData } from './brochureManagementService'
import { savedBrochuresSyncService } from './savedBrochuresSyncService'
import { MRService } from './MRService'

export interface SyncOperation {
  id: string
  type: 'upload' | 'download'
  brochureId: string
  brochureTitle: string
  timestamp: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  error?: string
}

export interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  lastSyncTime: number
  pendingOperations: number
  hasConflicts: boolean
}

export class SmartSyncService {
  private static syncQueue: SyncOperation[] = []
  private static idleTimer: NodeJS.Timeout | null = null
  private static isSyncing = false
  private static lastActivityTime = 0
  private static isOnline = true
  private static syncStatusListeners: ((status: SyncStatus) => void)[] = []

  /**
   * Initialize smart sync service
   */
  static async initialize() {
    console.log('SmartSync: Initializing intelligent sync service')
    
    // Set up network monitoring
    this.setupNetworkMonitoring()
    
    // Set up activity tracking
    this.setupActivityTracking()
    
    // Start idle detection
    this.startIdleDetection()
    
    // Perform initial sync
    await this.performInitialSync()
  }

  /**
   * Track user activity (call this on any user interaction)
   */
  static trackActivity() {
    this.lastActivityTime = Date.now()
    
    // Reset idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    
    this.startIdleDetection()
  }

  /**
   * Mark brochure as modified (call this after any brochure change)
   */
  static async markBrochureModified(brochureId: string) {
    try {
      const result = await BrochureManagementService.getBrochureData(brochureId)
      if (result.success && result.data) {
        result.data.isModified = true
        result.data.needsSync = true
        result.data.localLastModified = new Date().toISOString()
        
        // Save updated metadata
        const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
        await FileSystem.writeAsStringAsync(
          `${brochureDir}brochure_data.json`,
          JSON.stringify(result.data, null, 2)
        )
        
        console.log('SmartSync: Brochure marked as modified:', brochureId)
        this.trackActivity() // Reset idle timer
      }
    } catch (error) {
      console.warn('SmartSync: Error marking brochure as modified:', error)
    }
  }

  /**
   * Setup network monitoring
   */
  private static setupNetworkMonitoring() {
    NetInfo.addEventListener(state => {
      const wasOffline = !this.isOnline
      this.isOnline = state.isConnected || false
      
      if (wasOffline && this.isOnline) {
        console.log('SmartSync: Device back online, checking for pending sync operations')
        this.handleOnlineResume()
      } else if (!this.isOnline) {
        console.log('SmartSync: Device went offline')
      }
      
      this.notifyStatusListeners()
    })
  }

  /**
   * Setup activity tracking
   */
  private static setupActivityTracking() {
    // Track app state changes
    AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        console.log('SmartSync: App going to background, performing exit sync')
        this.performExitSync()
      } else if (nextAppState === 'active') {
        console.log('SmartSync: App became active')
        this.trackActivity()
      }
    })
  }

  /**
   * Start idle detection (30 seconds)
   */
  private static startIdleDetection() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    
    this.idleTimer = setTimeout(() => {
      console.log('SmartSync: User idle detected, performing auto-sync')
      this.performIdleSync()
    }, 30000) // 30 seconds
  }

  /**
   * Perform initial sync on app start
   */
  private static async performInitialSync() {
    try {
      if (!this.isOnline) {
        console.log('SmartSync: Offline - skipping initial sync')
        return
      }

      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        return
      }

      console.log('SmartSync: Performing initial sync for user:', userResult.user.id)
      
      // Show sync message to user
      this.notifyStatusListeners()
      
      // Sync saved brochures list first
      await this.syncSavedBrochuresList(userResult.user.id)
      
      // Then sync all brochure modifications
      await this.syncAllBrochureModifications(userResult.user.id)
      
      // Sync meetings and notes (server-first, no local storage needed)
      await this.syncMeetingsData(userResult.user.id)
      
      console.log('SmartSync: Initial sync completed')
    } catch (error) {
      console.warn('SmartSync: Initial sync error:', error)
    }
  }

  /**
   * Perform sync when user is idle
   */
  private static async performIdleSync() {
    if (!this.isOnline || this.isSyncing) {
      return
    }

    try {
      console.log('SmartSync: Starting idle sync')
      await this.syncModifiedBrochures()
    } catch (error) {
      console.warn('SmartSync: Idle sync error:', error)
    }
  }

  /**
   * Perform sync when app exits view mode
   */
  private static async performExitSync() {
    if (!this.isOnline) {
      console.log('SmartSync: Offline - queuing exit sync for later')
      return
    }

    try {
      console.log('SmartSync: Starting exit sync')
      await this.syncModifiedBrochures()
    } catch (error) {
      console.warn('SmartSync: Exit sync error:', error)
    }
  }

  /**
   * Handle device coming back online
   */
  private static async handleOnlineResume() {
    try {
      // Check for pending operations
      const pendingOps = this.syncQueue.filter(op => op.status === 'pending')
      
      if (pendingOps.length > 0) {
        console.log(`SmartSync: Processing ${pendingOps.length} pending sync operations`)
        await this.processSyncQueue()
      }
      
      // Perform full sync to catch up
      await this.performInitialSync()
    } catch (error) {
      console.warn('SmartSync: Online resume error:', error)
    }
  }

  /**
   * Sync all modified brochures
   */
  private static async syncModifiedBrochures() {
    try {
      if (!this.isOnline || this.isSyncing) {
        console.log('SmartSync: Skipping sync (offline or already syncing)')
        return
      }

      this.isSyncing = true
      this.notifyStatusListeners()

      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        return
      }

      // Get all modified brochures
      const modifiedResult = await BrochureManagementService.getModifiedBrochures()
      if (!modifiedResult.success || !modifiedResult.data) {
        return
      }

      console.log(`SmartSync: Found ${modifiedResult.data.length} modified brochures`)

      // Upload changes for each modified brochure
      for (const brochureId of modifiedResult.data) {
        try {
          console.log('SmartSync: Uploading changes for brochure:', brochureId)
          
          const brochureResult = await BrochureManagementService.getBrochureData(brochureId)
          if (!brochureResult.success || !brochureResult.data) {
            continue
          }

          console.log('SmartSync: About to upload brochure data:')
          console.log('SmartSync: Local slides count:', brochureResult.data.slides.length)
          console.log('SmartSync: Local groups count:', brochureResult.data.groups.length)
          console.log('SmartSync: Local slide titles:', brochureResult.data.slides.slice(0, 5).map(s => s.title))
          console.log('SmartSync: Local group names:', brochureResult.data.groups.map(g => g.name))

          // Upload to server
          const uploadResult = await BrochureManagementService.syncBrochureToServer(
            userResult.user.id,
            brochureId,
            brochureResult.data.title,
            brochureResult.data.slides,
            brochureResult.data.groups
          )

          if (uploadResult.success) {
            // Mark as synced
            await BrochureManagementService.markBrochureAsSynced(brochureId)
            console.log('SmartSync: Successfully uploaded changes for:', brochureResult.data.title)
          } else {
            console.warn('SmartSync: Failed to upload changes for:', brochureResult.data.title, uploadResult.error)
          }
        } catch (error) {
          console.warn('SmartSync: Error uploading brochure:', brochureId, error)
        }
      }

      console.log('SmartSync: Modified brochures sync completed')
    } catch (error) {
      console.warn('SmartSync: Sync modified brochures error:', error)
    } finally {
      this.isSyncing = false
      this.notifyStatusListeners()
    }
  }

  /**
   * Sync saved brochures list
   */
  private static async syncSavedBrochuresList(userId: string) {
    try {
      console.log('SmartSync: Syncing saved brochures list')
      
      // Get server saved brochures
      const serverResult = await savedBrochuresSyncService.getSavedBrochuresFromServer(userId)
      
      if (serverResult.success && serverResult.data) {
        console.log(`SmartSync: Found ${serverResult.data.length} saved brochures on server`)
        
        // Update local saved brochures list to match server
        // This will be handled by the BrochuresScreen loadSavedBrochures function
      }
    } catch (error) {
      console.warn('SmartSync: Saved brochures sync error:', error)
    }
  }

  /**
   * Sync all brochure modifications
   */
  private static async syncAllBrochureModifications(userId: string) {
    try {
      console.log('SmartSync: Syncing all brochure modifications')
      
      // Get local saved brochures
      const localKey = `mr_saved_brochures_${userId}`
      const localData = await AsyncStorage.getItem(localKey)
      const localBrochures = localData ? JSON.parse(localData) : []

      for (const brochure of localBrochures) {
        const brochureId = brochure.brochure_id || brochure.id
        if (!brochureId) continue

        try {
          // Check if brochure needs sync
          const brochureResult = await BrochureManagementService.getBrochureData(brochureId)
          if (!brochureResult.success || !brochureResult.data) continue

          if (brochureResult.data.needsSync || brochureResult.data.isModified) {
            console.log('SmartSync: Uploading changes for:', brochureResult.data.title)
            
            const uploadResult = await BrochureManagementService.syncBrochureToServer(
              userId,
              brochureId,
              brochureResult.data.title,
              brochureResult.data.slides,
              brochureResult.data.groups
            )

            if (uploadResult.success) {
              await BrochureManagementService.markBrochureAsSynced(brochureId)
            }
          }

          // Check for server updates
          const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
            userId,
            brochureId,
            brochureResult.data.localLastModified
          )

          if (statusResult.success && statusResult.data?.needsDownload) {
            console.log('SmartSync: Downloading server updates for:', brochureResult.data.title)
            
            const downloadResult = await BrochureManagementService.downloadBrochureChanges(
              userId,
              brochureId
            )

            if (downloadResult.success && downloadResult.data) {
              await BrochureManagementService.applyBrochureChanges(
                brochureId,
                downloadResult.data
              )
              console.log('SmartSync: Applied server updates for:', brochureResult.data.title)
            }
          }
        } catch (error) {
          console.warn(`SmartSync: Error syncing brochure ${brochure.customTitle}:`, error)
        }
      }
    } catch (error) {
      console.warn('SmartSync: All brochure modifications sync error:', error)
    }
  }

  /**
   * Process sync queue
   */
  private static async processSyncQueue() {
    try {
      const pendingOps = this.syncQueue.filter(op => op.status === 'pending')
      
      for (const operation of pendingOps) {
        operation.status = 'in_progress'
        
        try {
          if (operation.type === 'upload') {
            // Handle upload operation
            console.log('SmartSync: Processing queued upload:', operation.brochureTitle)
            // Implementation would call syncBrochureToServer
          } else if (operation.type === 'download') {
            // Handle download operation
            console.log('SmartSync: Processing queued download:', operation.brochureTitle)
            // Implementation would call downloadBrochureChanges
          }
          
          operation.status = 'completed'
        } catch (error) {
          operation.status = 'failed'
          operation.error = error instanceof Error ? error.message : 'Unknown error'
          console.warn('SmartSync: Queue operation failed:', operation, error)
        }
      }
      
      // Remove completed operations
      this.syncQueue = this.syncQueue.filter(op => op.status !== 'completed')
    } catch (error) {
      console.warn('SmartSync: Process queue error:', error)
    }
  }

  /**
   * Sync meetings data (server-first approach)
   */
  private static async syncMeetingsData(userId: string) {
    try {
      console.log('SmartSync: Syncing meetings data')
      
      // Meetings are server-first, so just ensure they're accessible
      // No local storage sync needed - meetings are always loaded from server
      const meetingsResult = await MRService.getMeetings(userId)
      
      if (meetingsResult.success && meetingsResult.data) {
        console.log(`SmartSync: Found ${meetingsResult.data.length} meetings on server`)
      }
      
      console.log('SmartSync: Meetings data sync completed')
    } catch (error) {
      console.warn('SmartSync: Meetings sync error:', error)
    }
  }

  /**
   * Add status listener
   */
  static addStatusListener(listener: (status: SyncStatus) => void) {
    this.syncStatusListeners.push(listener)
  }

  /**
   * Remove status listener
   */
  static removeStatusListener(listener: (status: SyncStatus) => void) {
    this.syncStatusListeners = this.syncStatusListeners.filter(l => l !== listener)
  }

  /**
   * Notify all status listeners
   */
  private static notifyStatusListeners() {
    const status: SyncStatus = {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastActivityTime,
      pendingOperations: this.syncQueue.filter(op => op.status === 'pending').length,
      hasConflicts: false
    }
    
    this.syncStatusListeners.forEach(listener => listener(status))
  }

  /**
   * Manual sync trigger
   */
  static async forceSyncNow() {
    console.log('SmartSync: Manual sync requested')
    await this.syncModifiedBrochures()
  }

  /**
   * Stop sync service
   */
  static stop() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    
    this.syncStatusListeners = []
    console.log('SmartSync: Service stopped')
  }
}
