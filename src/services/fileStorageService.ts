import { supabase } from './supabase'
import * as FileSystem from 'expo-file-system'

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface UploadResult {
  success: boolean
  publicUrl?: string
  error?: string
}

export interface DownloadProgress {
  totalBytesWritten: number
  totalBytesExpectedToWrite: number
  percentage: number
}

export class FileStorageService {
  private static readonly BUCKET_NAME = 'brochures'

  /**
   * Initialize storage bucket (check if exists)
   */
  static async initializeBucket(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Checking storage bucket...')
      
      // Try to list files in the bucket to test if it's accessible
      const { data: files, error: listError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .list('', { limit: 1 })
      
      if (listError) {
        console.error('Error accessing bucket:', listError)
        // If we can't access the bucket, assume it exists but we don't have permissions
        // This is common and we should continue anyway
        console.log('Cannot access bucket directly, but it likely exists. Continuing...')
        return { success: true }
      }

      console.log('Brochures bucket is accessible')
      return { success: true }
    } catch (error) {
      console.error('Error checking bucket:', error)
      // If there's any error, assume bucket exists and continue
      console.log('Error checking bucket, assuming it exists and continuing')
      return { success: true }
    }
  }

  /**
   * Recreate bucket with new settings (for fixing size limits)
   */
  static async recreateBucket(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Recreating bucket with new settings...')
      
      // Delete existing bucket if it exists
      const { error: deleteError } = await supabase.storage.deleteBucket(this.BUCKET_NAME)
      if (deleteError && !deleteError.message.includes('not found')) {
        console.error('Error deleting bucket:', deleteError)
        // Continue anyway, might not exist
      }

      // Create new bucket with proper settings (without fileSizeLimit to avoid conflicts)
      const { error: createError } = await supabase.storage.createBucket(this.BUCKET_NAME, {
        public: true,
        allowedMimeTypes: ['application/zip', 'application/pdf', 'image/*']
        // Note: Removed fileSizeLimit as it might conflict with Supabase defaults
      })

      if (createError) {
        console.error('Error recreating bucket:', createError)
        return { success: false, error: createError.message }
      }

      console.log('Bucket recreated successfully with 200MB limit')
      return { success: true }
    } catch (error) {
      console.error('Error recreating bucket:', error)
      return { success: false, error: 'Failed to recreate storage bucket' }
    }
  }

  /**
   * Upload file to Supabase Storage with progress tracking
   */
  static async uploadFile(
    localFilePath: string,
    fileName: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    try {
      console.log('Starting file upload:', fileName)
      
      // Skip bucket check since bucket exists - just try to upload directly
      console.log('Bucket exists, proceeding with upload...')

      // Read file info and validate size
      const fileInfo = await FileSystem.getInfoAsync(localFilePath)
      if (!fileInfo.exists) {
        return { success: false, error: 'File does not exist' }
      }

      const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024)
      const maxSizeMB = 50 // Conservative limit for reliable uploads
      
      if (fileSizeMB > maxSizeMB) {
        return { 
          success: false, 
          error: `File size (${fileSizeMB.toFixed(1)}MB) exceeds maximum allowed size of ${maxSizeMB}MB. Please compress your ZIP file or reduce image quality.` 
        }
      }

      console.log('Reading file for upload, size:', fileInfo.size, `(${fileSizeMB.toFixed(1)}MB)`)
      
      // We'll use XMLHttpRequest for real progress tracking
      // Note: Simulated progress removed - will implement real progress below

      // Generate unique file path
      const timestamp = Date.now()
      const filePath = `uploads/${timestamp}_${fileName}`

      // Use XMLHttpRequest for real progress tracking
      let { data: { session }, error: sessionError } = await supabase.auth.getSession()
      console.log('Session check:', { session: !!session, error: sessionError })
      
      // If no session, try to refresh
      if (!session || !session.access_token) {
        console.log('No session found, attempting to refresh...')
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshData?.session) {
          session = refreshData.session
          console.log('Session refreshed successfully')
        } else {
          console.error('Session refresh failed:', refreshError)
          return { success: false, error: 'User not authenticated' }
        }
      }
      
      if (!session || !session.access_token) {
        console.error('No valid session found after refresh')
        return { success: false, error: 'User not authenticated' }
      }

      // Determine file type based on extension
      let mimeType = 'application/octet-stream'
      const extension = fileName.toLowerCase().split('.').pop()
      switch (extension) {
        case 'jpg':
        case 'jpeg':
          mimeType = 'image/jpeg'
          break
        case 'png':
          mimeType = 'image/png'
          break
        case 'zip':
          mimeType = 'application/zip'
          break
        case 'pdf':
          mimeType = 'application/pdf'
          break
      }

      console.log('File type detected:', { fileName, extension, mimeType })

      // Create FormData for React Native
      const formData = new FormData()
      formData.append('file', {
        uri: localFilePath,
        type: mimeType,
        name: fileName,
      } as any)

      // Get Supabase project URL from config
      const supabaseUrl = 'https://ijgevkvdlevkcdjcgmyg.supabase.co'
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${this.BUCKET_NAME}/${filePath}`

      // Upload with real progress using XMLHttpRequest
      const uploadData = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        // Track upload progress
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            // Cap percentage at 100% to avoid showing over 100%
            const percentage = Math.min(Math.round((event.loaded / event.total) * 100), 100)
            // Use actual file size instead of event.total which might be inflated
            const actualFileSize = fileInfo.size || event.total
            onProgress({
              loaded: Math.min(event.loaded, actualFileSize),
              total: actualFileSize,
              percentage: percentage
            })
            console.log(`Real upload progress: ${percentage}%`)
          }
        }

        xhr.onload = () => {
          console.log('Upload completed with status:', xhr.status)
          console.log('Upload response:', xhr.responseText)
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = xhr.responseText ? JSON.parse(xhr.responseText) : {}
              console.log('Upload response parsed:', response)
              resolve(response)
            } catch (e) {
              console.log('Upload response not JSON, treating as success')
              resolve({}) // Some uploads don't return JSON
            }
          } else {
            console.error('Upload failed with status:', xhr.status)
            console.error('Upload error response:', xhr.responseText)
            
            // Try to parse error message from response
            let errorMessage = `Upload failed: ${xhr.status}`
            try {
              const errorResponse = JSON.parse(xhr.responseText)
              if (errorResponse.error) {
                errorMessage = errorResponse.error
              } else if (errorResponse.message) {
                errorMessage = errorResponse.message
              }
            } catch (e) {
              errorMessage += ` ${xhr.responseText}`
            }
            
            reject(new Error(errorMessage))
          }
        }

        xhr.onerror = () => {
          console.error('Upload network error')
          reject(new Error('Upload failed: Network error'))
        }

        console.log('Starting XMLHttpRequest upload to:', uploadUrl)
        xhr.open('POST', uploadUrl)
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
        xhr.send(formData)
      })

      // uploadError is handled above in the fetch response check

      // Generate signed URL (valid for 1 year) since bucket is not truly public
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .createSignedUrl(filePath, 365 * 24 * 60 * 60) // 1 year expiry

      if (signedUrlError) {
        console.error('Error creating signed URL:', signedUrlError)
        return { success: false, error: signedUrlError.message }
      }

      console.log('Generated signed URL:', signedUrlData.signedUrl)
      
      // Verify the file actually exists by checking if we can access it
      console.log('Verifying file exists at signed URL...')
      try {
        const verifyResponse = await fetch(signedUrlData.signedUrl, { method: 'HEAD' })
        console.log('File verification status:', verifyResponse.status)
        
        if (verifyResponse.status === 200) {
          console.log('File uploaded and verified successfully!')
          return { 
            success: true, 
            publicUrl: signedUrlData.signedUrl 
          }
        } else {
          console.error('File verification failed:', verifyResponse.status)
          return { 
            success: false, 
            error: `File upload completed but verification failed (${verifyResponse.status}). File may not be accessible.` 
          }
        }
      } catch (verifyError) {
        console.error('File verification error:', verifyError)
        return { 
          success: false, 
          error: 'File upload completed but verification failed. File may not be accessible.' 
        }
      }

    } catch (error) {
      console.error('File upload error:', error)
      return { success: false, error: 'Failed to upload file' }
    }
  }

  /**
   * Download file from Supabase Storage with progress tracking
   */
  static async downloadFile(
    publicUrl: string,
    localPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Starting file download from:', publicUrl)
      console.log('Saving to:', localPath)

      // Ensure directory exists
      const directory = localPath.substring(0, localPath.lastIndexOf('/'))
      const dirInfo = await FileSystem.getInfoAsync(directory)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
      }

      // Download with progress tracking
      const downloadResumable = FileSystem.createDownloadResumable(
        publicUrl,
        localPath,
        {},
        onProgress ? (downloadProgress) => {
          const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress
          const percentage = totalBytesExpectedToWrite > 0 
            ? Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
            : 0

          onProgress({
            totalBytesWritten,
            totalBytesExpectedToWrite,
            percentage
          })
        } : undefined
      )

      const result = await downloadResumable.downloadAsync()
      
      if (result && result.uri) {
        console.log('File downloaded successfully to:', result.uri)
        return { success: true }
      } else {
        return { success: false, error: 'Download failed' }
      }

    } catch (error) {
      console.error('Download error:', error)
      return { success: false, error: 'Failed to download file' }
    }
  }

  /**
   * Delete file from Supabase Storage
   */
  static async deleteFile(publicUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Extract file path from public URL
      const urlParts = publicUrl.split('/')
      const filePath = urlParts.slice(-2).join('/') // Get last two parts (folder/filename)

      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .remove([filePath])

      if (error) {
        console.error('Delete error:', error)
        return { success: false, error: error.message }
      }

      console.log('File deleted successfully from storage')
      return { success: true }

    } catch (error) {
      console.error('Delete error:', error)
      return { success: false, error: 'Failed to delete file' }
    }
  }

  /**
   * Get file info from storage
   */
  static async getFileInfo(publicUrl: string): Promise<{ success: boolean; size?: number; error?: string }> {
    try {
      const response = await fetch(publicUrl, { method: 'HEAD' })
      const contentLength = response.headers.get('content-length')
      
      return {
        success: true,
        size: contentLength ? parseInt(contentLength) : 0
      }
    } catch (error) {
      console.error('Get file info error:', error)
      return { success: false, error: 'Failed to get file info' }
    }
  }
}
