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
      console.log('Starting server-side doctor photo upload:', fileName)

      // Read file info and validate
      const fileInfo = await FileSystem.getInfoAsync(localFilePath)
      if (!fileInfo.exists) {
        return { success: false, error: 'File does not exist' }
      }

      const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024)
      if (fileSizeMB > 5) { // 5MB limit for photos
        return { success: false, error: 'Photo size must be less than 5MB' }
      }

      console.log('Reading photo for upload, size:', fileInfo.size, `(${fileSizeMB.toFixed(1)}MB)`)

      // Simulate progress for UI feedback
      if (onProgress) {
        onProgress({ loaded: 0, total: fileInfo.size || 0, percentage: 0 })
      }

      // Read file as base64
      const photoData = await FileSystem.readAsStringAsync(localFilePath, {
        encoding: FileSystem.EncodingType.Base64,
      })

      if (onProgress) {
        onProgress({ loaded: fileInfo.size || 0, total: fileInfo.size || 0, percentage: 50 })
      }

      // Determine MIME type
      let mimeType = 'image/jpeg'
      const extension = fileName.toLowerCase().split('.').pop()
      if (extension === 'png') {
        mimeType = 'image/png'
      }

      // Upload using server-side function
      const { data, error } = await supabase.rpc('upload_doctor_photo', {
        p_user_id: userId,
        p_photo_data: photoData,
        p_file_name: fileName,
        p_mime_type: mimeType
      })

      if (onProgress) {
        onProgress({ loaded: fileInfo.size || 0, total: fileInfo.size || 0, percentage: 100 })
      }

      if (error) {
        console.error('Server-side photo upload error:', error)
        return { success: false, error: error.message }
      }

      if (!data || !data.success) {
        console.error('Photo upload failed:', data)
        return { success: false, error: data?.error || 'Upload failed' }
      }

      console.log('Photo uploaded successfully via server function:', data.photo_url)
      return { 
        success: true, 
        photoUrl: data.photo_url 
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
