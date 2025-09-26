// Image Storage Service
// Handles local storage of converted PDF images

import * as FileSystem from 'expo-file-system'
import { Asset } from 'expo-asset'

export interface StoredImage {
  id: string
  fileName: string
  localPath: string
  pageNumber: number
  title: string
  brochureId: string
  createdAt: Date
}

export class ImageStorageService {
  private static readonly STORAGE_DIR = `${FileSystem.documentDirectory}converted_slides/`
  
  /**
   * Initialize storage directory
   */
  static async initializeStorage(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.STORAGE_DIR)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.STORAGE_DIR, { intermediates: true })
        console.log('Created storage directory:', this.STORAGE_DIR)
      }
    } catch (error) {
      console.error('Failed to initialize storage:', error)
    }
  }

  /**
   * Create brochure-specific folder structure
   */
  static async createBrochureFolder(brochureId: string, brochureTitle: string): Promise<string> {
    try {
      await this.initializeStorage()
      
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const dirInfo = await FileSystem.getInfoAsync(brochureDir)
      
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(brochureDir, { intermediates: true })
        
        // Create brochure info file
        const infoContent = `Brochure ID: ${brochureId}
Title: ${brochureTitle}
Created: ${new Date().toISOString()}
Status: Converted
Pages: 42`
        
        await FileSystem.writeAsStringAsync(`${brochureDir}brochure_info.txt`, infoContent)
        console.log('Created brochure folder:', brochureDir)
      }
      
      return brochureDir
    } catch (error) {
      console.error('Failed to create brochure folder:', error)
      return ''
    }
  }

  /**
   * Save converted PDF images locally
   */
  static async saveConvertedImages(
    brochureId: string,
    brochureTitle: string,
    images: Array<{ pageNumber: number; title: string; imageData: string }>
  ): Promise<StoredImage[]> {
    try {
      // Create brochure-specific folder
      const brochureDir = await this.createBrochureFolder(brochureId, brochureTitle)
      
      if (!brochureDir) {
        throw new Error('Failed to create brochure folder')
      }

      const storedImages: StoredImage[] = []

      for (const image of images) {
        const fileName = `page_${image.pageNumber}.txt`
        const localPath = `${brochureDir}${fileName}`
        
        // Create a detailed info file for each page
        const imageInfo = `Page ${image.pageNumber} - ${image.title}
Brochure ID: ${brochureId}
Brochure Title: ${brochureTitle}
Image Data: ${image.imageData}
Created: ${new Date().toISOString()}
Status: Converted from PDF`
        
        await FileSystem.writeAsStringAsync(localPath, imageInfo)

        const storedImage: StoredImage = {
          id: `${brochureId}_${image.pageNumber}`,
          fileName,
          localPath,
          pageNumber: image.pageNumber,
          title: image.title,
          brochureId,
          createdAt: new Date()
        }

        storedImages.push(storedImage)
        console.log('Saved page info:', localPath)
      }

      // Create a summary file
      const summaryContent = `Brochure Conversion Summary
============================
Brochure ID: ${brochureId}
Brochure Title: ${brochureTitle}
Total Pages: ${images.length}
Conversion Date: ${new Date().toISOString()}
Status: Complete

Pages:
${images.map(img => `- Page ${img.pageNumber}: ${img.title}`).join('\n')}`
      
      await FileSystem.writeAsStringAsync(`${brochureDir}conversion_summary.txt`, summaryContent)
      console.log('Created conversion summary for brochure:', brochureId)

      return storedImages
    } catch (error) {
      console.error('Failed to save converted images:', error)
      return []
    }
  }


  /**
   * Get stored images for a brochure
   */
  static async getStoredImages(brochureId: string): Promise<StoredImage[]> {
    try {
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const dirInfo = await FileSystem.getInfoAsync(brochureDir)
      
      if (!dirInfo.exists) {
        return []
      }

      const files = await FileSystem.readDirectoryAsync(brochureDir)
      const storedImages: StoredImage[] = []

      for (const file of files) {
        if (file.endsWith('.png') || file.endsWith('.txt')) {
          // Extract page number from filename
          const pageNumberStr = file.replace('page_', '').replace('.png', '').replace('.txt', '')
          const pageNumber = parseInt(pageNumberStr)
          
          // Skip if page number is invalid
          if (isNaN(pageNumber)) {
            console.log('Skipping invalid file:', file, 'pageNumber:', pageNumberStr)
            continue
          }
          
          const storedImage: StoredImage = {
            id: `${brochureId}_${pageNumber}`,
            fileName: file,
            localPath: `${brochureDir}${file}`,
            pageNumber,
            title: `Page ${pageNumber} - Visualet Fervid Content`,
            brochureId,
            createdAt: new Date()
          }
          storedImages.push(storedImage)
          console.log('Loaded stored image:', file, 'pageNumber:', pageNumber)
        }
      }

      return storedImages.sort((a, b) => a.pageNumber - b.pageNumber)
    } catch (error) {
      console.error('Failed to get stored images:', error)
      return []
    }
  }

  /**
   * Check if brochure images are already converted
   */
  static async hasConvertedImages(brochureId: string): Promise<boolean> {
    try {
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const dirInfo = await FileSystem.getInfoAsync(brochureDir)
      
      if (!dirInfo.exists) {
        return false
      }

      const files = await FileSystem.readDirectoryAsync(brochureDir)
      return files.some(file => file.endsWith('.txt') || file.endsWith('.png'))
    } catch (error) {
      console.error('Failed to check converted images:', error)
      return false
    }
  }

  /**
   * Delete converted images for a brochure
   */
  static async deleteConvertedImages(brochureId: string): Promise<boolean> {
    try {
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const dirInfo = await FileSystem.getInfoAsync(brochureDir)
      
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(brochureDir)
        console.log('Deleted converted images for brochure:', brochureId)
        return true
      }
      
      return false
    } catch (error) {
      console.error('Failed to delete converted images:', error)
      return false
    }
  }

  /**
   * List all brochure folders
   */
  static async listBrochureFolders(): Promise<Array<{
    brochureId: string
    brochureTitle: string
    pageCount: number
    createdAt: Date
    folderPath: string
  }>> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.STORAGE_DIR)
      
      if (!dirInfo.exists) {
        return []
      }

      const brochures = await FileSystem.readDirectoryAsync(this.STORAGE_DIR)
      const brochureList = []

      for (const brochure of brochures) {
        const brochureDir = `${this.STORAGE_DIR}${brochure}/`
        const brochureInfo = await FileSystem.getInfoAsync(brochureDir)
        
        if (brochureInfo.exists && brochureInfo.isDirectory) {
          const files = await FileSystem.readDirectoryAsync(brochureDir)
          const pageFiles = files.filter(file => file.startsWith('page_'))
          
          // Try to read brochure info
          let brochureTitle = `Brochure ${brochure}`
          try {
            const infoPath = `${brochureDir}brochure_info.txt`
            const infoExists = await FileSystem.getInfoAsync(infoPath)
            if (infoExists.exists) {
              const infoContent = await FileSystem.readAsStringAsync(infoPath)
              const titleMatch = infoContent.match(/Title: (.+)/)
              if (titleMatch) {
                brochureTitle = titleMatch[1]
              }
            }
          } catch (error) {
            console.log('Could not read brochure info:', error)
          }

          brochureList.push({
            brochureId: brochure,
            brochureTitle,
            pageCount: pageFiles.length,
            createdAt: brochureInfo.modificationTime ? new Date(brochureInfo.modificationTime * 1000) : new Date(),
            folderPath: brochureDir
          })
        }
      }

      return brochureList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } catch (error) {
      console.error('Failed to list brochure folders:', error)
      return []
    }
  }

  /**
   * Get storage info
   */
  static async getStorageInfo(): Promise<{
    totalSize: number
    brochureCount: number
    imageCount: number
  }> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.STORAGE_DIR)
      
      if (!dirInfo.exists) {
        return { totalSize: 0, brochureCount: 0, imageCount: 0 }
      }

      const brochures = await FileSystem.readDirectoryAsync(this.STORAGE_DIR)
      let totalSize = 0
      let imageCount = 0

      for (const brochure of brochures) {
        const brochureDir = `${this.STORAGE_DIR}${brochure}/`
        const brochureInfo = await FileSystem.getInfoAsync(brochureDir)
        
        if (brochureInfo.exists && brochureInfo.isDirectory) {
          const files = await FileSystem.readDirectoryAsync(brochureDir)
          imageCount += files.filter(file => file.endsWith('.png') || file.endsWith('.txt')).length
          
          for (const file of files) {
            const fileInfo = await FileSystem.getInfoAsync(`${brochureDir}${file}`)
            if (fileInfo.exists && fileInfo.size) {
              totalSize += fileInfo.size
            }
          }
        }
      }

      return {
        totalSize,
        brochureCount: brochures.length,
        imageCount
      }
    } catch (error) {
      console.error('Failed to get storage info:', error)
      return { totalSize: 0, brochureCount: 0, imageCount: 0 }
    }
  }

  /**
   * Clear stored images for a specific brochure
   */
  static async clearBrochureStorage(brochureId: string): Promise<boolean> {
    try {
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const dirInfo = await FileSystem.getInfoAsync(brochureDir)
      
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(brochureDir, { idempotent: true })
        console.log('Cleared brochure storage:', brochureDir)
      }
      
      return true
    } catch (error) {
      console.error('Failed to clear brochure storage:', error)
      return false
    }
  }
}

// Export service functions
export const imageStorageService = ImageStorageService
