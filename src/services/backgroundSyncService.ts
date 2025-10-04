/**
 * Background Sync Service
 * Handles automatic synchronization of all user data across devices
 */
import { AppState, AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AuthService } from './AuthService'
import { savedBrochuresSyncService } from './savedBrochuresSyncService'
import { BrochureManagementService } from './brochureManagementService'

interface SyncConfig {
  intervalMinutes: number
  syncOnAppForeground: boolean
  syncOnAppBackground: boolean
}

export class BackgroundSyncService {
  private static syncInterval: NodeJS.Timeout | null = null
  private static appStateSubscription: any = null
  private static isInitialized = false
  private static lastSyncTime = 0
  private static isSyncing = false
  
  private static config: SyncConfig = {
    intervalMinutes: 10, // Sync every 10 minutes (less frequent)
    syncOnAppForeground: true,
    syncOnAppBackground: false, // Disable background sync to reduce conflicts
  }

  /**
   * Initialize background sync service
   */
  static async initialize() {
    if (this.isInitialized) return

    console.log('BackgroundSync: Initializing automatic sync service')
    
    // Start periodic sync
    this.startPeriodicSync()
    
    // Listen for app state changes
    this.setupAppStateListener()
    
    // Initial sync
    await this.performFullSync()
    
    this.isInitialized = true
  }

  /**
   * Stop background sync service
   */
  static stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove()
      this.appStateSubscription = null
    }
    
    this.isInitialized = false
    console.log('BackgroundSync: Service stopped')
  }

  /**
   * Start periodic sync timer
   */
  private static startPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }

    this.syncInterval = setInterval(async () => {
      await this.performFullSync()
    }, this.config.intervalMinutes * 60 * 1000)

    console.log(`BackgroundSync: Periodic sync started (every ${this.config.intervalMinutes} minutes)`)
  }

  /**
   * Setup app state listener for foreground/background sync
   */
  private static setupAppStateListener() {
    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && this.config.syncOnAppForeground) {
        console.log('BackgroundSync: App became active, performing sync')
        await this.performFullSync()
      } else if (nextAppState === 'background' && this.config.syncOnAppBackground) {
        console.log('BackgroundSync: App went to background, performing sync')
        await this.performFullSync()
      }
    })
  }

  /**
   * Perform full synchronization of all user data
   */
  static async performFullSync() {
    try {
      // Prevent concurrent syncs and debounce
      const now = Date.now()
      if (this.isSyncing || (now - this.lastSyncTime < 30000)) { // 30 second minimum between syncs
        console.log('BackgroundSync: Skipping sync (already syncing or too recent)')
        return
      }

      this.isSyncing = true
      this.lastSyncTime = now

      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        return // No user logged in
      }

      const userId = userResult.user.id
      console.log('BackgroundSync: Starting full sync for user:', userId)

      // Sync saved brochures
      await this.syncSavedBrochures(userId)
      
      // Sync brochure changes for all saved brochures
      await this.syncAllBrochureChanges(userId)

      console.log('BackgroundSync: Full sync completed')
    } catch (error) {
      console.warn('BackgroundSync: Full sync error:', error)
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Sync saved brochures list
   */
  private static async syncSavedBrochures(userId: string) {
    try {
      // Get local saved brochures
      const localKey = `mr_saved_brochures_${userId}`
      const localData = await AsyncStorage.getItem(localKey)
      const localBrochures = localData ? JSON.parse(localData) : []

      // Get server saved brochures
      const serverResult = await savedBrochuresSyncService.getSavedBrochuresFromServer(userId)
      
      if (serverResult.success && serverResult.data) {
        // Merge local and server data (server wins for conflicts)
        const mergedBrochures = [...localBrochures]
        
        for (const serverBrochure of serverResult.data) {
          const existingIndex = mergedBrochures.findIndex(
            local => (local.brochure_id || local.id) === serverBrochure.brochure_id
          )
          
          if (existingIndex >= 0) {
            // Update existing with server data
            mergedBrochures[existingIndex] = {
              ...mergedBrochures[existingIndex],
              customTitle: serverBrochure.custom_title,
              // Keep local file path and other local data
            }
          } else {
            // Add new brochure from server (if file exists locally)
            const brochureId = serverBrochure.brochure_id
            // This will be handled by the main load function
          }
        }

        // Upload any local brochures that aren't on server
        for (const localBrochure of localBrochures) {
          const brochureId = localBrochure.brochure_id || localBrochure.id
          if (!brochureId) continue

          const existsOnServer = serverResult.data.some(
            server => server.brochure_id === brochureId
          )

          if (!existsOnServer) {
            console.log('BackgroundSync: Uploading local brochure to server:', localBrochure.customTitle)
            await savedBrochuresSyncService.saveBrochureToServer(
              userId,
              brochureId,
              localBrochure.title,
              localBrochure.customTitle,
              localBrochure
            )
          }
        }
      }

      console.log('BackgroundSync: Saved brochures synced')
    } catch (error) {
      console.warn('BackgroundSync: Saved brochures sync error:', error)
    }
  }

  /**
   * Sync brochure changes for all saved brochures
   */
  private static async syncAllBrochureChanges(userId: string) {
    try {
      const localKey = `mr_saved_brochures_${userId}`
      const localData = await AsyncStorage.getItem(localKey)
      const localBrochures = localData ? JSON.parse(localData) : []

      for (const brochure of localBrochures) {
        const brochureId = brochure.brochure_id || brochure.id
        if (!brochureId) continue

        try {
          // Get local brochure data
          const localResult = await BrochureManagementService.getBrochureData(brochureId)
          if (!localResult.success || !localResult.data) continue

          // Upload local changes to server
          const uploadResult = await BrochureManagementService.syncBrochureToServer(
            userId,
            brochureId,
            brochure.customTitle || brochure.title,
            localResult.data.slides,
            localResult.data.groups
          )

          if (uploadResult.success) {
            console.log('BackgroundSync: Uploaded changes for brochure:', brochure.customTitle)
          }

          // Check for and download server changes
          const localLastModified = localResult.data.updatedAt
          const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
            userId,
            brochureId,
            localLastModified
          )

          if (statusResult.success && statusResult.data?.needsDownload) {
            console.log('BackgroundSync: Downloading server changes for brochure:', brochure.customTitle)
            
            const downloadResult = await BrochureManagementService.downloadBrochureChanges(
              userId,
              brochureId
            )

            if (downloadResult.success && downloadResult.data) {
              await BrochureManagementService.applyBrochureChanges(
                brochureId,
                downloadResult.data
              )
              console.log('BackgroundSync: Applied server changes for brochure:', brochure.customTitle)
            }
          }
        } catch (error) {
          console.warn(`BackgroundSync: Error syncing brochure ${brochure.customTitle}:`, error)
        }
      }

      console.log('BackgroundSync: All brochure changes synced')
    } catch (error) {
      console.warn('BackgroundSync: Brochure changes sync error:', error)
    }
  }

  /**
   * Force immediate sync (can be called manually)
   */
  static async forceSyncNow() {
    console.log('BackgroundSync: Force sync requested')
    await this.performFullSync()
  }

  /**
   * Update sync configuration
   */
  static updateConfig(newConfig: Partial<SyncConfig>) {
    this.config = { ...this.config, ...newConfig }
    
    // Restart periodic sync with new interval
    if (newConfig.intervalMinutes) {
      this.startPeriodicSync()
    }
    
    console.log('BackgroundSync: Configuration updated:', this.config)
  }
}
