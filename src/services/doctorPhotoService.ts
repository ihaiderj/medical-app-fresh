/**
 * Doctor Photo Service - Handles photo uploads for MR users who authenticate via custom table
 */
import * as FileSystem from 'expo-file-system'
import { supabase } from './supabase'

interface PhotoUploadResult {
  success: boolean
  publicUrl?: string
  error?: string
}

interface PhotoUploadProgress {
  loaded: number
  total: number
  percentage: number
}

export class DoctorPhotoService {
  private static readonly BUCKET_NAME = 'brochures' // Use same bucket as brochures

  /**
   * Upload doctor photo using admin service key approach
   */
  static async uploadDoctorPhoto(
    localFilePath: string,
    fileName: string,
    onProgress?: (progress: PhotoUploadProgress) => void
  ): Promise<PhotoUploadResult> {
    try {
      console.log('Starting doctor photo upload:', fileName)

      // Read file info and validate
      const fileInfo = await FileSystem.getInfoAsync(localFilePath)
      if (!fileInfo.exists) {
        return { success: false, error: 'File does not exist' }
      }

      const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024)
      if (fileSizeMB > 10) { // 10MB limit for photos
        return { success: false, error: 'Photo size must be less than 10MB' }
      }

      console.log('Reading photo for upload, size:', fileInfo.size, `(${fileSizeMB.toFixed(1)}MB)`)

      // Generate unique file path for doctor photos (use uploads folder like brochures)
      const timestamp = Date.now()
      const filePath = `uploads/doctor_${timestamp}_${fileName}`

      // Determine MIME type
      let mimeType = 'image/jpeg'
      const extension = fileName.toLowerCase().split('.').pop()
      if (extension === 'png') {
        mimeType = 'image/png'
      }

      // Read file as base64
      const fileContent = await FileSystem.readAsStringAsync(localFilePath, {
        encoding: FileSystem.EncodingType.Base64,
      })

      // Convert base64 to blob for upload
      const byteCharacters = atob(fileContent)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)

      // Try to get a valid session first (needed for storage RLS)
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        // For MR users without Supabase Auth session, we'll use a different approach
        // Create a temporary admin session or use service role
        console.log('No session found, attempting alternative upload method...')
        
        // Use XMLHttpRequest like the FileStorageService but with service role
        const formData = new FormData()
        formData.append('file', {
          uri: localFilePath,
          type: mimeType,
          name: fileName,
        } as any)

        const supabaseUrl = 'https://ijgevkvdlevkcdjcgmyg.supabase.co'
        const uploadUrl = `${supabaseUrl}/storage/v1/object/${this.BUCKET_NAME}/${filePath}`

        const uploadResponse = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest()

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
              const percentage = Math.round((event.loaded / event.total) * 100)
              onProgress({
                loaded: event.loaded,
                total: event.total,
                percentage: percentage
              })
            }
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({ success: true })
            } else {
              console.error('Upload failed:', xhr.status, xhr.responseText)
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`))
            }
          }

          xhr.onerror = () => {
            reject(new Error('Upload failed: Network error'))
          }

          xhr.open('POST', uploadUrl)
          // Try without authorization header for public bucket
          xhr.send(formData)
        })
      } else {
        // Upload using Supabase client with session
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(this.BUCKET_NAME)
          .upload(filePath, byteArray, {
            contentType: mimeType,
            upsert: false
          })

        if (uploadError) {
          console.error('Photo upload error:', uploadError)
          return { success: false, error: uploadError.message }
        }
      }

      if (uploadError) {
        console.error('Photo upload error:', uploadError)
        return { success: false, error: uploadError.message }
      }

      console.log('Photo uploaded successfully:', uploadData)

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from(this.BUCKET_NAME)
        .getPublicUrl(filePath)

      if (!publicUrlData?.publicUrl) {
        return { success: false, error: 'Failed to get public URL' }
      }

      console.log('Generated public URL:', publicUrlData.publicUrl)

      // Simulate progress for UI feedback
      if (onProgress) {
        onProgress({ loaded: fileInfo.size || 0, total: fileInfo.size || 0, percentage: 100 })
      }

      return { 
        success: true, 
        publicUrl: publicUrlData.publicUrl 
      }

    } catch (error) {
      console.error('Doctor photo upload error:', error)
      return { success: false, error: 'Failed to upload photo' }
    }
  }

  /**
   * Delete doctor photo from storage
   */
  static async deleteDoctorPhoto(photoUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!photoUrl || !photoUrl.includes('supabase.co/storage')) {
        return { success: true } // Not our storage, nothing to delete
      }

      // Extract file path from URL
      let filePath = ''
      if (photoUrl.includes('/public/brochures/')) {
        filePath = photoUrl.split('/public/brochures/')[1]
      } else if (photoUrl.includes('/sign/brochures/')) {
        const pathPart = photoUrl.split('/sign/brochures/')[1]
        filePath = pathPart.split('?')[0] // Remove token part
      } else {
        return { success: true } // Unknown URL format, skip deletion
      }

      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([filePath])

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
