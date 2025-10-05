/**
 * Login Sync Service
 * Handles cross-device synchronization during login process
 */
import { BrochureManagementService } from './brochureManagementService'
import { savedBrochuresSyncService } from './savedBrochuresSyncService'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface LoginSyncProgress {
  step: string
  message: string
  progress: number
}

export class LoginSyncService {
  /**
   * Perform complete login sync process
   */
  static async performLoginSync(
    userId: string,
    onProgress: (progress: LoginSyncProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('LoginSync: Starting cross-device sync for user:', userId)

      // Step 1: Check saved brochures on server (0-25%)
      onProgress({
        step: 'Checking saved brochures',
        message: 'Looking for your saved brochures on server...',
        progress: 10
      })

      const serverBrochures = await savedBrochuresSyncService.getSavedBrochuresFromServer(userId)
      
      onProgress({
        step: 'Checking saved brochures',
        message: `Found ${serverBrochures.data?.length || 0} saved brochures`,
        progress: 25
      })

      // Step 2: Compare with local storage (25-50%)
      onProgress({
        step: 'Comparing with local data',
        message: 'Checking local storage...',
        progress: 30
      })

      const localKey = `mr_saved_brochures_${userId}`
      const localData = await AsyncStorage.getItem(localKey)
      const localBrochures = localData ? JSON.parse(localData) : []

      onProgress({
        step: 'Comparing with local data',
        message: `Found ${localBrochures.length} local brochures`,
        progress: 50
      })

      // Step 3: Sync brochure data (50-85%)
      if (serverBrochures.success && serverBrochures.data && serverBrochures.data.length > 0) {
        let processedCount = 0
        const totalBrochures = serverBrochures.data.length

        for (const serverBrochure of serverBrochures.data) {
          const brochureId = serverBrochure.brochure_id
          
          onProgress({
            step: 'Syncing brochure data',
            message: `Processing "${serverBrochure.custom_title}"...`,
            progress: 50 + (processedCount / totalBrochures) * 35
          })

          try {
            // Check if brochure exists locally
            const localResult = await BrochureManagementService.getBrochureData(brochureId)
            
            if (localResult.success && localResult.data) {
              // Brochure exists locally, check for server updates
              const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
                userId,
                brochureId,
                localResult.data.localLastModified
              )

              if (statusResult.success && statusResult.data?.needsDownload) {
                console.log('LoginSync: Downloading updates for:', serverBrochure.custom_title)
                
                const downloadResult = await BrochureManagementService.downloadBrochureChanges(
                  userId,
                  brochureId
                )

                if (downloadResult.success && downloadResult.data) {
                  await BrochureManagementService.applyBrochureChanges(
                    brochureId,
                    downloadResult.data
                  )
                  console.log('LoginSync: Applied updates for:', serverBrochure.custom_title)
                }
              }
            } else {
              // Brochure doesn't exist locally - will be handled when user views it
              console.log('LoginSync: Brochure not local, will download on view:', serverBrochure.custom_title)
            }
          } catch (error) {
            console.warn('LoginSync: Error processing brochure:', serverBrochure.custom_title, error)
          }

          processedCount++
        }
      }

      // Step 4: Finalize sync (85-100%)
      onProgress({
        step: 'Finalizing sync',
        message: 'Completing synchronization...',
        progress: 90
      })

      // Upload any local changes that haven't been synced
      const modifiedResult = await BrochureManagementService.getModifiedBrochures()
      if (modifiedResult.success && modifiedResult.data && modifiedResult.data.length > 0) {
        console.log('LoginSync: Uploading local changes for', modifiedResult.data.length, 'brochures')
        
        for (const brochureId of modifiedResult.data) {
          const brochureResult = await BrochureManagementService.getBrochureData(brochureId)
          if (brochureResult.success && brochureResult.data) {
            await BrochureManagementService.syncBrochureToServer(
              userId,
              brochureId,
              brochureResult.data.title,
              brochureResult.data.slides,
              brochureResult.data.groups
            )
            await BrochureManagementService.markBrochureAsSynced(brochureId)
          }
        }
      }

      onProgress({
        step: 'Complete',
        message: 'Sync completed successfully!',
        progress: 100
      })

      console.log('LoginSync: Cross-device sync completed successfully')
      return { success: true }
    } catch (error) {
      console.error('LoginSync: Cross-device sync error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed'
      }
    }
  }
}

