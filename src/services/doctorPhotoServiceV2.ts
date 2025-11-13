/**
 * Doctor Photo Service V2 - Server-side photo storage using database
 * This bypasses Supabase Storage authentication issues
 */
import * as FileSystem from 'expo-file-system'
import { supabase } from './supabase'

interface PhotoUploadResult {
  success: boolean
  photoUrl?: string
  error?: string
}

interface PhotoUploadProgress {
  loaded: number
  total: number
  percentage: number
}

export class DoctorPhotoServiceV2 {
  /**
   * Upload doctor photo using server-side function
   */
  static async uploadDoctorPhoto(
    localFilePath: string,
    fileName: string,
    userId: string,
    onProgress?: (progress: PhotoUploadProgress) => void
  ): Promise<PhotoUploadResult> {
    try {
      console.log('Starting doctor photo upload (offline-first):', fileName)

      // Read file info and validate
      const fileInfo = await FileSystem.getInfoAsync(localFilePath)
      if (!fileInfo.exists) {
        return { success: false, error: 'File does not exist' }
      }

      const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024)
      if (fileSizeMB > 5) { // 5MB limit for photos
        return { success: false, error: 'Photo size must be less than 5MB' }
      }

      console.log('Reading photo for local storage, size:', fileInfo.size, `(${fileSizeMB.toFixed(1)}MB)`)

      // Simulate progress for UI feedback
      if (onProgress) {
        onProgress({ loaded: 0, total: fileInfo.size || 0, percentage: 0 })
      }

      // ALWAYS save to local storage first (offline-first principle)
      const photoDir = FileSystem.documentDirectory + `doctor_photos/${userId}/`
      const dirInfo = await FileSystem.getInfoAsync(photoDir)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(photoDir, { intermediates: true })
      }

      // Generate local file path
      const timestamp = Date.now()
      const extension = fileName.toLowerCase().split('.').pop() || 'jpg'
      const localFileName = `photo_${timestamp}.${extension}`
      const localPhotoPath = photoDir + localFileName

      // Copy file to local storage
      await FileSystem.copyAsync({
        from: localFilePath,
        to: localPhotoPath
      })

      if (onProgress) {
        onProgress({ loaded: fileInfo.size || 0, total: fileInfo.size || 0, percentage: 50 })
      }

      // Determine MIME type
      let mimeType = 'image/jpeg'
      if (extension === 'png') {
        mimeType = 'image/png'
      }

      // Store photo in local DB with sync_status: 'pending'
      const { LocalDatabaseService } = await import('./localDatabaseService')
      const { generateUUID } = await import('../utils/uuid')
      
      await LocalDatabaseService.upsertDoctorPhoto({
        id: generateUUID(),
        user_id: userId,
        file_name: fileName,
        file_path: localPhotoPath,
        mime_type: mimeType,
        created_at: new Date().toISOString(),
        sync_status: 'pending',
        local_changes: null
      })

      if (onProgress) {
        onProgress({ loaded: fileInfo.size || 0, total: fileInfo.size || 0, percentage: 100 })
      }

      console.log('Photo saved locally:', localPhotoPath)

      // If online, queue server upload for background sync (when user inactive or manual sync)
      const { NetworkService } = await import('./networkService')
      const isOnline = await NetworkService.isOnline()
      
      if (isOnline) {
        // Queue server upload for background sync
        // This will be handled by the sync service when user is inactive or manually syncs
        console.log('Photo queued for background server upload')
      } else {
        console.log('Device is offline, photo saved locally only')
      }

      // Return success with local file path (not server URL)
      return { 
        success: true, 
        photoUrl: localPhotoPath // Return local path, not server URL
      }

    } catch (error) {
      console.error('Doctor photo upload error:', error)
      return { success: false, error: 'Failed to upload photo' }
    }
  }

  /**
   * Delete doctor photo (remove from database)
   */
  static async deleteDoctorPhoto(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!filePath) {
        return { success: true } // Nothing to delete
      }

      // Delete from database
      const { error } = await supabase
        .from('doctor_photos')
        .delete()
        .eq('file_path', filePath)

      if (error) {
        console.error('Error deleting doctor photo:', error)
        return { success: false, error: error.message }
      }

      console.log('Doctor photo deleted successfully')
      return { success: true }
    } catch (error) {
      console.error('Doctor photo deletion error:', error)
      return { success: false, error: 'Failed to delete photo' }
    }
  }
}
