import * as FileSystem from 'expo-file-system'
import { apiClient, ApiError } from './apiClient'
import { resolveMediaUrl } from '../config/apiConfig'

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
  static async initializeBucket(): Promise<{ success: boolean; error?: string }> {
    try {
      await apiClient.get('/api/sync/status/')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof ApiError ? error.message : 'Backend unavailable',
      }
    }
  }

  static async recreateBucket(): Promise<{ success: boolean; error?: string }> {
    return this.initializeBucket()
  }

  static async uploadFile(
    localFilePath: string,
    fileName: string,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<UploadResult> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localFilePath)
      if (!fileInfo.exists) {
        return { success: false, error: 'File does not exist' }
      }

      const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024)
      const maxSizeMB = 10

      if (fileSizeMB > maxSizeMB) {
        return {
          success: false,
          error: `File size (${fileSizeMB.toFixed(1)}MB) exceeds maximum allowed size of ${maxSizeMB}MB.`,
        }
      }

      if (onProgress) {
        onProgress({ loaded: 0, total: fileInfo.size || 0, percentage: 0 })
      }

      const result = await apiClient.uploadFile(
        '/api/files/brochures/upload/',
        localFilePath,
        fileName,
      )

      if (onProgress) {
        onProgress({ loaded: fileInfo.size || 0, total: fileInfo.size || 0, percentage: 100 })
      }

      const publicUrl = resolveMediaUrl(result.file_url)
      return { success: true, publicUrl }
    } catch (error) {
      return {
        success: false,
        error: error instanceof ApiError ? error.message : 'Failed to upload file',
      }
    }
  }

  static async downloadFile(
    publicUrl: string,
    localPath: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const downloadUrl = resolveMediaUrl(publicUrl)
      const directory = localPath.substring(0, localPath.lastIndexOf('/'))
      const dirInfo = await FileSystem.getInfoAsync(directory)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        localPath,
        {},
        onProgress
          ? (downloadProgress) => {
              const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress
              const percentage =
                totalBytesExpectedToWrite > 0
                  ? Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
                  : 0
              onProgress({ totalBytesWritten, totalBytesExpectedToWrite, percentage })
            }
          : undefined,
      )

      const result = await downloadResumable.downloadAsync()
      if (result?.uri) {
        return { success: true }
      }
      return { success: false, error: 'Download failed' }
    } catch (error) {
      return { success: false, error: 'Failed to download file' }
    }
  }

  static async deleteFile(publicUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const parts = publicUrl.split('/')
      const fileId = parts[parts.length - 1]?.split('.')[0]
      if (!fileId) {
        return { success: false, error: 'Invalid file URL' }
      }
      await apiClient.delete(`/api/files/brochures/${fileId}/`)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof ApiError ? error.message : 'Failed to delete file',
      }
    }
  }

  static async getFileInfo(publicUrl: string): Promise<{ success: boolean; size?: number; error?: string }> {
    try {
      const response = await fetch(resolveMediaUrl(publicUrl), { method: 'HEAD' })
      const contentLength = response.headers.get('content-length')
      return { success: true, size: contentLength ? parseInt(contentLength, 10) : 0 }
    } catch (error) {
      return { success: false, error: 'Failed to get file info' }
    }
  }
}
