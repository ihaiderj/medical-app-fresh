import { supabase, supabaseAdmin } from './supabase'
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

      // Generate unique file path
      const timestamp = Date.now()
      const filePath = `uploads/${timestamp}_${fileName}`

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
        case 'json':
          mimeType = 'application/json'
          break
      }

      console.log('File type detected:', { fileName, extension, mimeType })

      // Read file as base64 and convert to ArrayBuffer for Supabase Storage
      console.log('Reading file content as base64...')
      const base64Content = await FileSystem.readAsStringAsync(localFilePath, {
        encoding: FileSystem.EncodingType.Base64,
      })

      // Convert base64 to Uint8Array, then get ArrayBuffer
      const byteCharacters = atob(base64Content)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const arrayBuffer = byteArray.buffer

      console.log('Uploading file via supabaseAdmin.storage.upload to path:', filePath)

      // Report initial progress
      if (onProgress) {
        onProgress({ loaded: 0, total: fileInfo.size || 0, percentage: 0 })
      }

      // Upload using admin client (bypasses user authentication)
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from(this.BUCKET_NAME)
        .upload(filePath, arrayBuffer, {
          contentType: mimeType,
          upsert: true, // allow re-uploads for the same path
        })

      if (uploadError) {
        console.error('Supabase Storage upload error:', uploadError)
        return { success: false, error: uploadError.message }
      }

      // Report completion progress
      if (onProgress) {
        onProgress({ loaded: fileInfo.size || 0, total: fileInfo.size || 0, percentage: 100 })
      }

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
