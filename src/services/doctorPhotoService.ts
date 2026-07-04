/**
 * Doctor Photo Service — uploads via Django REST API
 */
import * as FileSystem from 'expo-file-system'
import { apiClient, ApiError } from './apiClient'
import { resolveMediaUrl } from '../config/apiConfig'

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
  static async uploadDoctorPhoto(
    localFilePath: string,
    fileName: string,
    onProgress?: (progress: PhotoUploadProgress) => void,
  ): Promise<PhotoUploadResult> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localFilePath)
      if (!fileInfo.exists) {
        return { success: false, error: 'File does not exist' }
      }

      const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024)
      if (fileSizeMB > 10) {
        return { success: false, error: 'Photo size must be less than 10MB' }
      }

      if (onProgress) {
        onProgress({ loaded: 0, total: fileInfo.size || 0, percentage: 0 })
      }

      const result = await apiClient.uploadFile(
        '/api/files/doctor-photos/upload/',
        localFilePath,
        fileName,
      )

      if (onProgress) {
        onProgress({ loaded: fileInfo.size || 0, total: fileInfo.size || 0, percentage: 100 })
      }

      return { success: true, publicUrl: resolveMediaUrl(result.file_url) }
    } catch (error) {
      return {
        success: false,
        error: error instanceof ApiError ? error.message : 'Failed to upload photo',
      }
    }
  }

  static async deleteDoctorPhoto(_filePath: string): Promise<{ success: boolean; error?: string }> {
    return { success: true }
  }
}
