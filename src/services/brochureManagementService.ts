import * as FileSystem from 'expo-file-system'
import { Platform } from 'react-native'
import { TokenStorage } from './tokenStorage'
// import { brochureSyncService, BrochureSyncData } from './brochureSyncService' // DELETED
// Define BrochureSyncData locally
interface BrochureSyncData {
  brochureId: string;
  brochureTitle?: string;
  title?: string;
  slides: any[];
  groups: any[];
  totalSlides?: number;
  lastModified: string;
}
import { FilePathUtils } from '../utils/filePathUtils'
import { FileStorageService } from './fileStorageService'
import { PDFConversionService } from './pdfConversionService'
import { PDFProcessingService } from './pdfProcessingService'
import { isPdfBrochure, isZipBrochure } from '../utils/brochureTypeUtils'
import { MRService } from './MRService'

// Conditionally import react-native-zip-archive only for native platforms
let unzip: any = null
if (Platform.OS !== 'web') {
  try {
    const zipArchive = require('react-native-zip-archive')
    unzip = zipArchive.unzip
  } catch (error) {
    console.warn('react-native-zip-archive not available:', error)
  }
}

export interface BrochureSlide {
  id: string
  title: string
  fileName: string
  imageUri: string
  order: number
  groupId?: string // Deprecated - kept for backward compatibility
  groupIds?: string[] // New: slides can belong to multiple groups
  createdAt: string
  updatedAt: string
}

export interface SlideGroup {
  id: string
  name: string
  color: string
  slideIds: string[]
  order: number
  createdAt: string
  updatedAt: string
  doctorId?: string  // Optional doctor ID for doctor-based groups
  server_id?: string // Server group id when synced from backend
}

export interface BrochureData {
  id: string
  title: string
  description?: string
  category: string
  slides: BrochureSlide[]
  groups: SlideGroup[]
  thumbnailUri?: string
  totalSlides: number
  createdAt: string
  updatedAt: string
  // Sync metadata
  lastSyncedAt?: string
  localLastModified: string
  needsSync: boolean
  isModified: boolean
}

export class BrochureManagementService {
  private static readonly STORAGE_DIR = FileSystem.documentDirectory + 'brochures/'

  /**
   * Initialize storage directory
   */
  static async initializeStorage(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.STORAGE_DIR)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.STORAGE_DIR, { intermediates: true })
      }
    } catch (error) {
      console.error('Failed to initialize storage:', error)
    }
  }

  /**
   * Fix slide image paths for current platform
   */
  private static async fixSlideImagePaths(brochureId: string, slides: BrochureSlide[]): Promise<BrochureSlide[]> {
    try {
      const slidesDir = FilePathUtils.getSlidesDirectory(brochureId)
      
      // Check if slides directory exists
      const dirExists = await FilePathUtils.fileExists(slidesDir)
      if (!dirExists) {
        console.log('BrochureManager: Slides directory does not exist:', slidesDir)
        return slides
      }

      // Get actual files in the directory
      const actualFiles = await FileSystem.readDirectoryAsync(slidesDir)
      console.log('BrochureManager: Actual files in slides directory:', actualFiles.length)

      // Fix each slide's imageUri
      const fixedSlides = slides.map(slide => {
        // Extract filename from current imageUri
        const currentPath = slide.imageUri
        const fileName = slide.fileName || currentPath.split('/').pop() || ''
        
        // Construct new path using current platform's file system
        const newImageUri = FilePathUtils.getSlideImagePath(brochureId, fileName)
        
        if (currentPath !== newImageUri) {
          console.log(`BrochureManager: Fixed path for ${slide.title}:`)
          console.log(`  Old: ${currentPath}`)
          console.log(`  New: ${newImageUri}`)
        }

        return {
          ...slide,
          imageUri: newImageUri
        }
      })

      return fixedSlides
    } catch (error) {
      console.error('BrochureManager: Error fixing slide paths:', error)
      return slides // Return original slides if fixing fails
    }
  }

  /**
   * Process ZIP file containing brochure slides
   */
  static async processZipFile(
    brochureId: string,
    zipUri: string,
    brochureTitle: string
  ): Promise<{ success: boolean; brochureData?: BrochureData; error?: string }> {
    try {
      await this.initializeStorage()
      
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const slidesDir = `${brochureDir}slides/`
      
      // Create directories
      await FileSystem.makeDirectoryAsync(brochureDir, { intermediates: true })
      await FileSystem.makeDirectoryAsync(slidesDir, { intermediates: true })
      
      // Extract ZIP file to get real images
      console.log('Processing ZIP file:', zipUri)
      
      let slides: BrochureSlide[] = []
      
      try {
        // Check if zipUri is a remote URL, download it first
        let localZipPath = zipUri
        
        if (zipUri.startsWith('http')) {
          console.log('Downloading ZIP file from remote URL...')
          const downloadPath = `${brochureDir}temp_brochure.zip`
          
          // Wait a moment for file to be available (sometimes there's a delay)
          console.log('Waiting for file to be available...')
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          let downloadResult
          let retries = 3
          
          while (retries > 0) {
            try {
              // Use FileSystem.downloadAsync with authentication headers
              const accessToken = await TokenStorage.getAccessToken()
              if (!accessToken) {
                throw new Error('User not authenticated')
              }

              downloadResult = await FileSystem.downloadAsync(zipUri, downloadPath, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Cache-Control': 'no-cache',
                },
              })
              
              console.log('Download result with auth:', downloadResult)
              
              if (downloadResult.status === 200) {
                console.log('File downloaded successfully with authentication')
                break // Success
              } else {
                console.log(`Download with auth failed: ${downloadResult.status}`)
                throw new Error(`Download failed with status: ${downloadResult.status}`)
              }
            } catch (downloadError) {
              console.error('Download error:', downloadError)
              retries--
              if (retries > 0) {
                console.log(`Retrying download, attempts left: ${retries}`)
                await new Promise(resolve => setTimeout(resolve, 1000))
              }
            }
          }
          
          if (!downloadResult || downloadResult.status !== 200) {
            console.error('All download attempts failed')
            throw new Error(`Failed to download ZIP file after retries: ${downloadResult?.status || 'unknown error'}`)
          }
          
          localZipPath = downloadResult.uri
          console.log('ZIP file downloaded to:', localZipPath)
        }
        
        // Extract ZIP file using react-native-zip-archive (native only)
        if (!unzip) {
          throw new Error('ZIP extraction not supported on this platform')
        }
        
        // Verify the downloaded file is a valid ZIP before extraction
        const zipFileInfo = await FileSystem.getInfoAsync(localZipPath)
        if (!zipFileInfo.exists || zipFileInfo.size === 0) {
          throw new Error('Downloaded ZIP file is empty or does not exist')
        }
        
        console.log('ZIP file size:', zipFileInfo.size, 'bytes')
        
        try {
          await unzip(localZipPath, slidesDir)
          console.log('ZIP extracted to:', slidesDir)
        } catch (zipError: unknown) {
          console.error('ZIP extraction failed:', zipError)
          // Check if the file is actually a ZIP by reading its header
          const fileData = await FileSystem.readAsStringAsync(localZipPath, { 
            encoding: FileSystem.EncodingType.Base64,
            length: 4 
          })
          console.log('File header (base64):', fileData)
          const errorMessage = zipError instanceof Error ? zipError.message : 'Unknown error'
          throw new Error(`ZIP extraction failed: ${errorMessage}. File may be corrupted or not a valid ZIP file.`)
        }
        
        // Read extracted files
        const extractedFiles = await FileSystem.readDirectoryAsync(slidesDir)
        console.log('Extracted files:', extractedFiles)
        
        // Filter image files
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
        const imageFiles = extractedFiles.filter(file => 
          file && imageExtensions.some(ext => file.toLowerCase().endsWith(ext))
        )
        
        console.log('Image files found:', imageFiles.length)
        
        for (let i = 0; i < imageFiles.length; i++) {
          const fileName = imageFiles[i]
          const slideId = `${brochureId}_slide_${i + 1}`
          const imageUri = `${slidesDir}${fileName}`
          
          // Verify file exists
          const fileInfo = await FileSystem.getInfoAsync(imageUri)
          if (fileInfo.exists) {
            slides.push({
              id: slideId,
              title: fileName.split('.')[0], // Remove extension for title
              fileName: fileName,
              imageUri: imageUri,
              order: i + 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            })
          }
        }
        
        console.log('Created slides from real ZIP:', slides.length)
      } catch (error) {
        console.error('ZIP extraction failed:', error)
        // Don't create fallback slides - return error instead
        return { success: false, error: 'Failed to extract ZIP file. File may be corrupted or inaccessible.' }
      }
      
      // If no slides were extracted, return error
      if (slides.length === 0) {
        return { success: false, error: 'No image files found in ZIP archive.' }
      }
      
      // Create brochure data with sync metadata
      const now = new Date().toISOString()
      const brochureData: BrochureData = {
        id: brochureId,
        title: brochureTitle,
        category: 'General',
        slides: slides,
        groups: [],
        thumbnailUri: slides[0]?.imageUri, // This will be the first extracted image
        totalSlides: slides.length,
        createdAt: now,
        updatedAt: now,
        // Sync metadata
        localLastModified: now,
        needsSync: false, // New brochures don't need sync initially
        isModified: false
      }
      
      // Save brochure metadata
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )
      
      // Clean up temporary ZIP file if it was downloaded
      if (zipUri.startsWith('http')) {
        try {
          const tempZipPath = `${brochureDir}temp_brochure.zip`
          const tempFileInfo = await FileSystem.getInfoAsync(tempZipPath)
          if (tempFileInfo.exists) {
            await FileSystem.deleteAsync(tempZipPath)
            console.log('Temporary ZIP file cleaned up')
          }
        } catch (cleanupError) {
          console.log('Could not clean up temporary ZIP file:', cleanupError)
          // Not critical, continue
        }
      }
      
      console.log(`Processed ZIP file: ${slides.length} slides extracted`)
      return { success: true, brochureData }
      
    } catch (error) {
      console.error('ZIP processing error:', error)
      return { success: false, error: 'Failed to process ZIP file' }
    }
  }

  /**
   * Process a PDF brochure: convert pages to images and generate a thumbnail.
   */
  static async processPdfFile(
    brochureId: string,
    pdfUri: string,
    brochureTitle: string,
  ): Promise<{ success: boolean; brochureData?: BrochureData; thumbnailUri?: string; error?: string }> {
    try {
      await this.initializeStorage()

      const presentationData = await PDFConversionService.convertPDFToImages(
        brochureId,
        brochureTitle,
        pdfUri,
      )

      const slides: BrochureSlide[] = presentationData.slides.map((slide, index) => ({
        id: `${brochureId}_page_${slide.pageNumber}`,
        title: slide.title,
        fileName: `page_${slide.pageNumber}.jpg`,
        imageUri: slide.imagePath,
        order: index + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))

      const thumbnailResult = await PDFProcessingService.generateThumbnail(brochureId, pdfUri)
      const now = new Date().toISOString()

      const brochureData: BrochureData = {
        id: brochureId,
        title: brochureTitle,
        category: 'General',
        slides,
        groups: [],
        thumbnailUri: thumbnailResult.thumbnailUri || slides[0]?.imageUri,
        totalSlides: slides.length,
        createdAt: now,
        updatedAt: now,
        localLastModified: now,
        needsSync: false,
        isModified: false,
      }

      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      await FileSystem.makeDirectoryAsync(brochureDir, { intermediates: true })
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2),
      )

      return {
        success: true,
        brochureData,
        thumbnailUri: brochureData.thumbnailUri,
      }
    } catch (error) {
      console.error('PDF processing error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process PDF file',
      }
    }
  }

  /**
   * Download brochure file (ZIP/PDF) from server
   */
  static async downloadBrochureFile(
    brochureId: string,
    fileUrl: string,
    userId: string,
    brochureTitle: string,
    onProgress?: (progress: { percentage: number; loaded: number; total: number }) => void
  ): Promise<{ success: boolean; localPath?: string; error?: string }> {
    try {
      console.log('BrochureManager: Downloading brochure file:', brochureTitle);
      console.log('BrochureManager: File URL:', fileUrl);
      
      if (!fileUrl) {
        return { success: false, error: 'No file URL provided' };
      }

      // Create download directory
      const downloadDir = FileSystem.documentDirectory + `mr_downloads/${userId}/`;
      const dirInfo = await FileSystem.getInfoAsync(downloadDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
      }

      // Generate filename
      const timestamp = Date.now();
      const extension = fileUrl.includes('.zip') ? 'zip' : 'pdf';
      const fileName = `${brochureTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.${extension}`;
      const localPath = downloadDir + fileName;

      console.log('BrochureManager: Downloading to:', localPath);

      // Download file
      if (fileUrl.startsWith('file://')) {
        // Local file copy
        await FileSystem.copyAsync({
          from: fileUrl,
          to: localPath
        });
      } else {
        // Download from Supabase Storage
        const downloadResult = await FileStorageService.downloadFile(
          fileUrl,
          localPath,
          onProgress ? (progress) => {
            // Convert DownloadProgress to expected format
            onProgress({
              percentage: progress.percentage,
              loaded: progress.totalBytesWritten,
              total: progress.totalBytesExpectedToWrite
            });
          } : undefined
        );

        if (!downloadResult.success) {
          throw new Error(downloadResult.error || 'Download failed');
        }
      }

      console.log('BrochureManager: File downloaded successfully to:', localPath);

      // Process ZIP or PDF after download
      if (isZipBrochure({ file_url: fileUrl }, localPath)) {
        console.log('BrochureManager: Processing ZIP file for brochure:', brochureId);
        try {
          await this.processZipFile(brochureId, localPath, brochureTitle);
          console.log('BrochureManager: ZIP file processed successfully');
        } catch (error) {
          console.warn('BrochureManager: ZIP processing failed, will process on first view:', error);
        }
      } else if (isPdfBrochure({ file_url: fileUrl }, localPath)) {
        console.log('BrochureManager: Processing PDF file for brochure:', brochureId);
        try {
          await this.processPdfFile(brochureId, localPath, brochureTitle);
          console.log('BrochureManager: PDF file processed successfully');
        } catch (error) {
          console.warn('BrochureManager: PDF processing failed, will process on first view:', error);
        }
      }

      return { success: true, localPath };
    } catch (error) {
      console.error('BrochureManager: Failed to download brochure file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download brochure file'
      };
    }
  }

  /**
   * Get brochure data
   */
  static async getBrochureData(brochureId: string): Promise<{ success: boolean; data?: BrochureData; error?: string }> {
    try {
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const dataPath = `${brochureDir}brochure_data.json`
      
      const fileInfo = await FileSystem.getInfoAsync(dataPath)
      if (!fileInfo.exists) {
        return { success: false, error: 'Brochure data not found' }
      }
      
      const dataString = await FileSystem.readAsStringAsync(dataPath)
      const brochureData = JSON.parse(dataString) as BrochureData
      
      console.log('BrochureManager: Loading brochure data for:', brochureId)
      console.log('BrochureManager: Raw data slides count:', brochureData.slides.length)
      console.log('BrochureManager: Raw data groups count:', brochureData.groups.length)
      console.log('BrochureManager: Raw slide titles:', brochureData.slides.slice(0, 5).map(s => s.title))
      
      // Fix image paths for current platform
      brochureData.slides = await this.fixSlideImagePaths(brochureId, brochureData.slides)
      
      // Migrate data to include new sync metadata and missing fields
      let needsSave = false
      const now = new Date().toISOString()
      
      // Migrate groups to include updatedAt if missing
      brochureData.groups.forEach(group => {
        if (!group.updatedAt) {
          group.updatedAt = group.createdAt || now
          needsSave = true
        }
      })
      
      // Migrate brochure data to include sync metadata if missing
      if (!brochureData.localLastModified) {
        brochureData.localLastModified = brochureData.updatedAt || now
        needsSave = true
      }
      
      if (brochureData.needsSync === undefined) {
        brochureData.needsSync = false
        needsSave = true
      }
      
      if (brochureData.isModified === undefined) {
        brochureData.isModified = false
        needsSave = true
      }
      
      // Save migrated data if needed
      if (needsSave) {
        console.log('BrochureManager: Migrating brochure data with sync metadata')
        await FileSystem.writeAsStringAsync(dataPath, JSON.stringify(brochureData, null, 2))
      }
      
      return { success: true, data: brochureData }
    } catch (error) {
      console.error('Get brochure data error:', error)
      return { success: false, error: 'Failed to load brochure data' }
    }
  }

  /**
   * Get user-specific brochure data (with user modifications)
   */
  static async getUserBrochureData(brochureId: string, userId: string): Promise<{ success: boolean; data?: BrochureData; error?: string }> {
    try {
      // First get the base brochure data
      const baseResult = await this.getBrochureData(brochureId)
      if (!baseResult.success || !baseResult.data) {
        return baseResult
      }

      const baseData = baseResult.data
      
      // Check if user has custom modifications
      const userDir = `${this.STORAGE_DIR}${brochureId}/users/${userId}/`
      const userDataPath = `${userDir}user_brochure_data.json`
      
      const userFileInfo = await FileSystem.getInfoAsync(userDataPath)
      if (!userFileInfo.exists) {
        // No user modifications, return base data
        return { success: true, data: baseData }
      }
      
      // Load user modifications
      const userDataString = await FileSystem.readAsStringAsync(userDataPath)
      const userModifications = JSON.parse(userDataString)
      
      // Apply user modifications to base data
      const userData: BrochureData = {
        ...baseData,
        slides: userModifications.slides || baseData.slides,
        groups: userModifications.groups || baseData.groups,
        updatedAt: userModifications.updatedAt || baseData.updatedAt
      }
      
      return { success: true, data: userData }
    } catch (error) {
      console.error('Get user brochure data error:', error)
      return { success: false, error: 'Failed to load user brochure data' }
    }
  }

  /**
   * Save user-specific brochure modifications
   */
  static async saveUserBrochureData(
    brochureId: string,
    userId: string,
    brochureData: BrochureData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userDir = `${this.STORAGE_DIR}${brochureId}/users/${userId}/`
      
      // Create user directory if it doesn't exist
      await FileSystem.makeDirectoryAsync(userDir, { intermediates: true })
      
      // Save user-specific data
      await FileSystem.writeAsStringAsync(
        `${userDir}user_brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )
      
      return { success: true }
    } catch (error) {
      console.error('Save user brochure data error:', error)
      return { success: false, error: 'Failed to save user brochure data' }
    }
  }

  /**
   * Update slide title (user-specific)
   */
  static async updateSlideTitle(
    brochureId: string,
    slideId: string,
    newTitle: string,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get brochure data (user-specific if userId provided)
      const { data: brochureData } = userId 
        ? await this.getUserBrochureData(brochureId, userId)
        : await this.getBrochureData(brochureId)
        
      if (!brochureData) {
        return { success: false, error: 'Brochure not found' }
      }
      
      // Update slide title
      const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
      if (slideIndex === -1) {
        return { success: false, error: 'Slide not found' }
      }
      
      const now = new Date().toISOString()
      brochureData.slides[slideIndex].title = newTitle
      brochureData.slides[slideIndex].updatedAt = now
      brochureData.updatedAt = now
      brochureData.localLastModified = now
      brochureData.isModified = true
      brochureData.needsSync = true
      
      // Save data (user-specific if userId provided)
      if (userId) {
        await this.saveUserBrochureData(brochureId, userId, brochureData)
      } else {
        const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
        await FileSystem.writeAsStringAsync(
          `${brochureDir}brochure_data.json`,
          JSON.stringify(brochureData, null, 2)
        )
      }
      
      // Queue changes for sync if userId provided
      if (userId) {
        try {
          // Use static import to avoid Metro bundler issues
          const { LocalDatabaseService } = require('./localDatabaseService');
          await LocalDatabaseService.addBrochureToSyncQueue(brochureId, userId, {
            brochureId,
            title: brochureData.title,
            slides: brochureData.slides,
            groups: brochureData.groups,
            lastModified: now
          });
        } catch (error) {
          console.warn('Failed to queue brochure changes:', error);
        }
      }
      
      return { success: true }
    } catch (error) {
      console.error('Update slide title error:', error)
      return { success: false, error: 'Failed to update slide title' }
    }
  }

  /**
   * Sort slides alphabetically
   */
  static async sortSlidesAlphabetically(brochureId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: brochureData } = await this.getBrochureData(brochureId)
      if (!brochureData) {
        return { success: false, error: 'Brochure not found' }
      }
      
      // Sort slides by title
      brochureData.slides.sort((a, b) => a.title.localeCompare(b.title))
      
      // Update order numbers
      brochureData.slides.forEach((slide, index) => {
        slide.order = index + 1
        slide.updatedAt = new Date().toISOString()
      })
      
      brochureData.updatedAt = new Date().toISOString()
      
      // Save updated data
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )
      
      return { success: true }
    } catch (error) {
      console.error('Sort slides error:', error)
      return { success: false, error: 'Failed to sort slides' }
    }
  }

  /**
   * Filter slides by starting letter
   */
  static async getSlidesByLetter(
    brochureId: string,
    letter: string
  ): Promise<{ success: boolean; slides?: BrochureSlide[]; error?: string }> {
    try {
      const { data: brochureData } = await this.getBrochureData(brochureId)
      if (!brochureData) {
        return { success: false, error: 'Brochure not found' }
      }
      
      const filteredSlides = brochureData.slides.filter(slide => 
        slide.title && slide.title.toLowerCase().startsWith(letter.toLowerCase())
      )
      
      return { success: true, slides: filteredSlides }
    } catch (error) {
      console.error('Filter slides error:', error)
      return { success: false, error: 'Failed to filter slides' }
    }
  }

  /**
   * Create slide group
   */
  static async createSlideGroup(
    brochureId: string,
    groupName: string,
    slideIds: string[],
    color: string = '#8b5cf6',
    doctorId?: string
  ): Promise<{ success: boolean; groupId?: string; error?: string }> {
    try {
      const { data: brochureData } = await this.getBrochureData(brochureId)
      if (!brochureData) {
        return { success: false, error: 'Brochure not found' }
      }
      
      const groupId = `${brochureId}_group_${Date.now()}`
      const newGroup: SlideGroup = {
        id: groupId,
        name: groupName,
        color: color,
        slideIds: slideIds,
        order: brochureData.groups.length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        doctorId: doctorId  // Store doctor ID if provided
      }
      
      brochureData.groups.push(newGroup)
      
      // Mark brochure as modified
      const now = new Date().toISOString()
      brochureData.updatedAt = now
      brochureData.localLastModified = now
      brochureData.isModified = true
      brochureData.needsSync = true
      
      // Update slides to include group reference (support multiple groups)
      slideIds.forEach(slideId => {
        const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
        if (slideIndex !== -1) {
          const slide = brochureData.slides[slideIndex]
          
          // Initialize groupIds array if it doesn't exist
          if (!slide.groupIds) {
            slide.groupIds = []
            // Migrate old groupId to groupIds if it exists
            if (slide.groupId) {
              slide.groupIds.push(slide.groupId)
            }
          }
          
          // Add to new group if not already included
          if (!slide.groupIds.includes(groupId)) {
            slide.groupIds.push(groupId)
          }
          
          // Keep backward compatibility
          slide.groupId = groupId // Last group assigned (for backward compatibility)
          slide.updatedAt = new Date().toISOString()
        }
      })
      
      brochureData.updatedAt = new Date().toISOString()
      
      // Save updated data
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )
      
      // Queue changes for sync (markBrochureAsModified will get userId from AuthService)
      await this.markBrochureAsModified(brochureId).catch(err => {
        console.warn('Failed to mark brochure as modified after group creation:', err);
      });
      
      return { success: true, groupId }
    } catch (error) {
      console.error('Create group error:', error)
      return { success: false, error: 'Failed to create group' }
    }
  }

  /**
   * Get slides by group
   */
  static async getSlidesByGroup(
    brochureId: string,
    groupId: string
  ): Promise<{ success: boolean; slides?: BrochureSlide[]; error?: string }> {
    try {
      const { data: brochureData } = await this.getBrochureData(brochureId)
      if (!brochureData) {
        return { success: false, error: 'Brochure not found' }
      }
      
      // Support both old and new group membership formats
      const groupSlides = brochureData.slides.filter(slide => {
        // Check new format first (groupIds array)
        if (slide.groupIds && slide.groupIds.includes(groupId)) {
          return true
        }
        // Fallback to old format (single groupId)
        return slide.groupId === groupId
      })
      
      return { success: true, slides: groupSlides }
    } catch (error) {
      console.error('Get group slides error:', error)
      return { success: false, error: 'Failed to get group slides' }
    }
  }

  /**
   * Delete slide
   */
  static async deleteSlide(
    brochureId: string,
    slideId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: brochureData } = await this.getBrochureData(brochureId)
      if (!brochureData) {
        return { success: false, error: 'Brochure not found' }
      }
      
      // Find and remove slide
      const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
      if (slideIndex === -1) {
        return { success: false, error: 'Slide not found' }
      }
      
      const slideToDelete = brochureData.slides[slideIndex]
      
      // Delete physical file
      const fileInfo = await FileSystem.getInfoAsync(slideToDelete.imageUri)
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(slideToDelete.imageUri)
      }
      
      // Remove from data
      brochureData.slides.splice(slideIndex, 1)
      
      // Update order numbers
      brochureData.slides.forEach((slide, index) => {
        slide.order = index + 1
        slide.updatedAt = new Date().toISOString()
      })
      
      brochureData.totalSlides = brochureData.slides.length
      brochureData.updatedAt = new Date().toISOString()
      
      // Save updated data
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )
      
      // Queue changes for sync (markBrochureAsModified will get userId from AuthService)
      await this.markBrochureAsModified(brochureId).catch(err => {
        console.warn('Failed to mark brochure as modified after slide deletion:', err);
      });
      
      return { success: true }
    } catch (error) {
      console.error('Delete slide error:', error)
      return { success: false, error: 'Failed to delete slide' }
    }
  }

  /**
   * Add new slide image
   */
  static async addSlideImage(
    brochureId: string,
    imageUri: string,
    title: string
  ): Promise<{ success: boolean; slideId?: string; error?: string }> {
    try {
      const { data: brochureData } = await this.getBrochureData(brochureId)
      if (!brochureData) {
        return { success: false, error: 'Brochure not found' }
      }
      
      const slideId = `${brochureId}_slide_${Date.now()}`
      const slidesDir = `${this.STORAGE_DIR}${brochureId}/slides/`
      const fileName = `slide_${brochureData.slides.length + 1}.jpg`
      const newImageUri = `${slidesDir}${fileName}`
      
      // Copy image to slides directory
      await FileSystem.copyAsync({
        from: imageUri,
        to: newImageUri
      })
      
      // Create new slide
      const newSlide: BrochureSlide = {
        id: slideId,
        title: title,
        fileName: fileName,
        imageUri: newImageUri,
        order: brochureData.slides.length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      brochureData.slides.push(newSlide)
      brochureData.totalSlides = brochureData.slides.length
      
      const now = new Date().toISOString()
      brochureData.updatedAt = now
      brochureData.localLastModified = now
      brochureData.isModified = true
      brochureData.needsSync = true
      
      console.log('BrochureManager: Adding slide to brochure')
      console.log('BrochureManager: New slides count:', brochureData.slides.length)
      console.log('BrochureManager: New slide title:', title)
      
      // Save updated data
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )
      
      console.log('BrochureManager: Slide added successfully, total slides now:', brochureData.slides.length)
      
      // Queue changes for sync (markBrochureAsModified will get userId from AuthService)
      await this.markBrochureAsModified(brochureId).catch(err => {
        console.warn('Failed to mark brochure as modified after slide addition:', err);
      });
      
      return { success: true, slideId }
    } catch (error) {
      console.error('Add slide error:', error)
      return { success: false, error: 'Failed to add slide' }
    }
  }

  /**
   * Clear old thumbnail and regenerate with correct paths
   */
  static async regenerateThumbnail(brochureId: string): Promise<{ success: boolean; thumbnailUri?: string; error?: string }> {
    try {
      // Remove old thumbnail if it exists
      const oldThumbnailPath = `${this.STORAGE_DIR}${brochureId}/thumbnail.jpg`
      const oldThumbnailExists = await FilePathUtils.fileExists(oldThumbnailPath)
      if (oldThumbnailExists) {
        await FileSystem.deleteAsync(oldThumbnailPath, { idempotent: true })
        console.log('RegenerateThumbnail: Removed old thumbnail')
      }
      
      // Generate new thumbnail
      return await this.generateThumbnail(brochureId)
    } catch (error) {
      console.error('Regenerate thumbnail error:', error)
      return { success: false, error: 'Failed to regenerate thumbnail' }
    }
  }

  /**
   * Generate thumbnail from first slide
   */
  static async generateThumbnail(brochureId: string): Promise<{ success: boolean; thumbnailUri?: string; error?: string }> {
    try {
      const { data: brochureData } = await this.getBrochureData(brochureId)
      if (!brochureData || brochureData.slides.length === 0) {
        return { success: false, error: 'No slides found' }
      }
      
      const firstSlide = brochureData.slides[0]
      const thumbnailPath = FilePathUtils.getThumbnailPath(brochureId)
      
      console.log('GenerateThumbnail: Source image:', firstSlide.imageUri)
      console.log('GenerateThumbnail: Target thumbnail:', thumbnailPath)
      
      // For local files, use them directly as thumbnail
      if (firstSlide.imageUri.startsWith('file://') || firstSlide.imageUri.startsWith('/')) {
        // Check if source file exists
        const sourceExists = await FilePathUtils.fileExists(firstSlide.imageUri)
        if (!sourceExists) {
          console.log('GenerateThumbnail: Source image does not exist:', firstSlide.imageUri)
          return { success: false, error: 'Source image file not found' }
        }
        
        // Copy first slide as thumbnail
        await FileSystem.copyAsync({
          from: firstSlide.imageUri,
          to: thumbnailPath
        })
        
        console.log('GenerateThumbnail: Thumbnail created successfully')
        
        // Update brochure data
        brochureData.thumbnailUri = thumbnailPath
        brochureData.updatedAt = new Date().toISOString()
        
        // Save updated data
        const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
        await FileSystem.writeAsStringAsync(
          `${brochureDir}brochure_data.json`,
          JSON.stringify(brochureData, null, 2)
        )
        
        return { success: true, thumbnailUri: thumbnailPath }
      } else {
        // For web URLs, return the URL directly
        return { success: true, thumbnailUri: firstSlide.imageUri }
      }
    } catch (error) {
      console.error('Generate thumbnail error:', error)
      return { success: false, error: 'Failed to generate thumbnail' }
    }
  }

  /**
   * Get alphabet filter options
   */
  static async getAlphabetFilters(brochureId: string): Promise<{ success: boolean; letters?: string[]; error?: string }> {
    try {
      const { data: brochureData } = await this.getBrochureData(brochureId)
      if (!brochureData) {
        return { success: false, error: 'Brochure not found' }
      }
      
      const letters = new Set<string>()
      brochureData.slides.forEach(slide => {
        const firstLetter = slide.title.charAt(0).toUpperCase()
        if (firstLetter.match(/[A-Z]/)) {
          letters.add(firstLetter)
        }
      })
      
      return { success: true, letters: Array.from(letters).sort() }
    } catch (error) {
      console.error('Get alphabet filters error:', error)
      return { success: false, error: 'Failed to get alphabet filters' }
    }
  }

  /**
   * Reassign doctor ID in all groups across all brochures
   * Called when a doctor is deleted to update group references
   */
  static async reassignDoctorInGroups(oldDoctorId: string, newDoctorId: string): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    try {
      let updatedCount = 0;
      
      // Get all brochure directories
      const dirInfo = await FileSystem.getInfoAsync(this.STORAGE_DIR);
      if (!dirInfo.exists) {
        return { success: true, updatedCount: 0 };
      }
      
      const brochureDirs = await FileSystem.readDirectoryAsync(this.STORAGE_DIR);
      
      for (const brochureDir of brochureDirs) {
        const brochureId = brochureDir;
        const brochureDataPath = `${this.STORAGE_DIR}${brochureId}/brochure_data.json`;
        
        try {
          // Check if brochure_data.json exists
          const fileInfo = await FileSystem.getInfoAsync(brochureDataPath);
          if (!fileInfo.exists) {
            continue;
          }
          
          // Read brochure data
          const brochureDataContent = await FileSystem.readAsStringAsync(brochureDataPath);
          const brochureData: BrochureData = JSON.parse(brochureDataContent);
          
          // Check if any groups reference the old doctor ID
          let hasChanges = false;
          if (brochureData.groups && brochureData.groups.length > 0) {
            for (const group of brochureData.groups) {
              if (group.doctorId === oldDoctorId) {
                group.doctorId = newDoctorId;
                group.updatedAt = new Date().toISOString();
                hasChanges = true;
                updatedCount++;
              }
            }
          }
          
          // Save updated data if changes were made
          if (hasChanges) {
            brochureData.updatedAt = new Date().toISOString();
            brochureData.localLastModified = new Date().toISOString();
            brochureData.isModified = true;
            brochureData.needsSync = true;
            
            await FileSystem.writeAsStringAsync(
              brochureDataPath,
              JSON.stringify(brochureData, null, 2)
            );
            
            console.log(`🔵 GROUP_DOCTOR_REASSIGN: Updated groups in brochure ${brochureId}`);
          }
        } catch (error) {
          console.warn(`🔵 GROUP_DOCTOR_REASSIGN: Failed to process brochure ${brochureId}:`, error);
          // Continue with next brochure
        }
      }
      
      console.log(`🔵 GROUP_DOCTOR_REASSIGN: Reassigned doctor ID in ${updatedCount} groups across all brochures`);
      return { success: true, updatedCount };
    } catch (error) {
      console.error('🔵 GROUP_DOCTOR_REASSIGN: Error reassigning doctor in groups:', error);
      return { success: false, updatedCount: 0, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Mark brochure as modified (for sync tracking)
   */
  static async markBrochureAsModified(brochureId: string, userId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Get userId from AuthService if not provided
      let finalUserId = userId;
      if (!finalUserId) {
        try {
          // Use static import to avoid Metro bundler issues
          const { AuthService } = require('./AuthService');
          const userResult = await AuthService.getCurrentUser();
          if (userResult.success && userResult.user) {
            finalUserId = userResult.user.id;
          }
        } catch (error) {
          console.warn('🔵 BROCHURE_SYNC: Could not get userId from AuthService:', error);
        }
      }

      const result = await this.getBrochureData(brochureId)
      if (!result.success || !result.data) {
        console.error('🔵 BROCHURE_SYNC: Cannot mark as modified - brochure not found:', brochureId)
        return { success: false, error: 'Brochure not found' }
      }

      const now = new Date().toISOString()
      const wasModified = result.data.isModified
      const wasNeedsSync = result.data.needsSync
      
      result.data.isModified = true
      result.data.needsSync = true
      result.data.localLastModified = now
      result.data.updatedAt = now

      console.log('🔵 BROCHURE_SYNC: Marking brochure as modified')
      console.log('🔵 BROCHURE_SYNC: - Brochure ID:', brochureId)
      console.log('🔵 BROCHURE_SYNC: - Was modified:', wasModified, '→ Now: true')
      console.log('🔵 BROCHURE_SYNC: - Was needsSync:', wasNeedsSync, '→ Now: true')
      console.log('🔵 BROCHURE_SYNC: - Local lastModified:', now)
      console.log('🔵 BROCHURE_SYNC: - Slides count:', result.data.slides.length)
      console.log('🔵 BROCHURE_SYNC: - Groups count:', result.data.groups.length)

      // Save updated metadata using cross-platform path
      const brochureDir = `${FileSystem.documentDirectory}brochures/${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(result.data, null, 2)
      )

      // Add to sync queue if userId available (always queue, even if already marked as needsSync)
      // This ensures all modifications are queued, including rapid successive changes
      if (finalUserId) {
        try {
          // Use static import to avoid Metro bundler issues
          const { LocalDatabaseService } = require('./localDatabaseService');
          await LocalDatabaseService.addBrochureToSyncQueue(brochureId, finalUserId, {
            brochureId,
            title: result.data.title,
            slides: result.data.slides,
            groups: result.data.groups,
            lastModified: now
          });
          console.log('🔵 BROCHURE_SYNC: Added brochure changes to sync queue');
        } catch (error) {
          console.warn('🔵 BROCHURE_SYNC: Failed to add to sync queue:', error);
          // Don't fail the operation if queue add fails
        }
      }

      console.log('🔵 BROCHURE_SYNC: Brochure marked as modified successfully')
      return { success: true }
    } catch (error) {
      console.error('🔵 BROCHURE_SYNC: Error marking brochure as modified:', error)
      return { success: false, error: 'Failed to mark brochure as modified' }
    }
  }

  /**
   * Mark brochure as synced
   */
  static async markBrochureAsSynced(brochureId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.getBrochureData(brochureId)
      if (!result.success || !result.data) {
        console.error('🔵 BROCHURE_SYNC: Cannot mark as synced - brochure not found:', brochureId)
        return { success: false, error: 'Brochure not found' }
      }

      const wasNeedsSync = result.data.needsSync
      const wasModified = result.data.isModified
      const syncTime = new Date().toISOString()
      
      result.data.needsSync = false
      result.data.isModified = false
      result.data.lastSyncedAt = syncTime

      console.log('🔵 BROCHURE_SYNC: Marking brochure as synced')
      console.log('🔵 BROCHURE_SYNC: - Brochure ID:', brochureId)
      console.log('🔵 BROCHURE_SYNC: - Was needsSync:', wasNeedsSync, '→ Now: false')
      console.log('🔵 BROCHURE_SYNC: - Was isModified:', wasModified, '→ Now: false')
      console.log('🔵 BROCHURE_SYNC: - Last synced at:', syncTime)
      console.log('🔵 BROCHURE_SYNC: - Slides count:', result.data.slides.length)
      console.log('🔵 BROCHURE_SYNC: - Groups count:', result.data.groups.length)

      // Save updated metadata using cross-platform path
      const brochureDir = `${FileSystem.documentDirectory}brochures/${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(result.data, null, 2)
      )

      console.log('🔵 BROCHURE_SYNC: Brochure marked as synced successfully')
      return { success: true }
    } catch (error) {
      console.error('🔵 BROCHURE_SYNC: Error marking brochure as synced:', error)
      return { success: false, error: 'Failed to mark brochure as synced' }
    }
  }

  /**
   * Get all modified brochures that need sync
   */
  static async getModifiedBrochures(): Promise<{ success: boolean; data?: string[]; error?: string }> {
    try {
      // Get all brochure directories
      const brochuresDir = this.STORAGE_DIR
      const dirInfo = await FileSystem.getInfoAsync(brochuresDir)
      
      if (!dirInfo.exists) {
        return { success: true, data: [] }
      }

      const brochureDirs = await FileSystem.readDirectoryAsync(brochuresDir)
      const modifiedBrochures: string[] = []

      for (const dir of brochureDirs) {
        const dataPath = `${brochuresDir}${dir}/brochure_data.json`
        const fileInfo = await FileSystem.getInfoAsync(dataPath)
        
        if (fileInfo.exists) {
          const dataString = await FileSystem.readAsStringAsync(dataPath)
          const brochureData = JSON.parse(dataString) as BrochureData
          
          if (brochureData.needsSync || brochureData.isModified) {
            modifiedBrochures.push(brochureData.id)
          }
        }
      }

      return { success: true, data: modifiedBrochures }
    } catch (error) {
      console.error('Get modified brochures error:', error)
      return { success: false, error: 'Failed to get modified brochures' }
    }
  }

  /**
   * Sync brochure changes to server
   */
  static async syncBrochureToServer(
    mrId: string,
    brochureId: string,
    brochureTitle: string,
    slides: BrochureSlide[],
    groups: SlideGroup[]
  ): Promise<{ success: boolean; error?: string; lastModified?: string }> {
    try {
      console.log('🔵 BROCHURE_SYNC: Starting sync to server')
      console.log('🔵 BROCHURE_SYNC: MR ID:', mrId)
      console.log('🔵 BROCHURE_SYNC: Brochure ID:', brochureId)
      console.log('🔵 BROCHURE_SYNC: Brochure Title:', brochureTitle)
      console.log('🔵 BROCHURE_SYNC: Slides count:', slides.length)
      console.log('🔵 BROCHURE_SYNC: Groups count:', groups.length)
      console.log('🔵 BROCHURE_SYNC: All slide titles:', slides.map(s => s.title))
      console.log('🔵 BROCHURE_SYNC: All slide IDs:', slides.map(s => s.id))
      console.log('🔵 BROCHURE_SYNC: All group names:', groups.map(g => g.name))
      console.log('🔵 BROCHURE_SYNC: All group IDs:', groups.map(g => g.id))
      console.log('🔵 BROCHURE_SYNC: Group details:', groups.map(g => ({
        id: g.id,
        name: g.name,
        color: g.color,
        slideIds: g.slideIds,
        slideCount: g.slideIds.length
      })))
      
      // TODO: Replace with SyncService when brochure sync RPCs are available
      // For now, brochure changes are queued and will be synced by SyncService.syncUp()
      console.warn('🔵 BROCHURE_SYNC: brochureSyncService deleted, changes are queued and will be synced by SyncService')
      const result = {
        success: false,
        error: 'Brochure sync service deleted. Changes are queued and will be synced by SyncService.syncUp()',
        lastModified: undefined
      }
      
      if (result.success) {
        console.log('🔵 BROCHURE_SYNC: Successfully uploaded brochure data')
        console.log('🔵 BROCHURE_SYNC: - Slides uploaded:', slides.length)
        console.log('🔵 BROCHURE_SYNC: - Groups uploaded:', groups.length)
        console.log('🔵 BROCHURE_SYNC: - Server lastModified:', result.lastModified)
      } else {
        console.error('🔵 BROCHURE_SYNC: Failed to upload brochure data:', result.error)
      }
      
      return result
    } catch (error) {
      console.error('🔵 BROCHURE_SYNC: Exception during sync:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync brochure'
      }
    }
  }

  /**
   * Check if brochure has server changes
   */
  static async checkBrochureSyncStatus(
    mrId: string,
    brochureId: string,
    localLastModified?: string
  ): Promise<{ 
    success: boolean; 
    data?: { 
      hasServerChanges: boolean; 
      needsDownload: boolean; 
      serverLastModified?: string; 
      localLastModified?: string; 
    }; 
    error?: string 
  }> {
    try {
      const result = await MRService.getBrochureSyncData(mrId, brochureId)
      if (!result.success || !result.data) {
        return {
          success: true,
          data: {
            hasServerChanges: false,
            needsDownload: false,
            localLastModified,
          },
        }
      }

      const syncRecord = result.data as {
        last_modified?: string
        brochure_data?: { last_modified?: string }
      }
      const serverLastModified =
        syncRecord.last_modified || syncRecord.brochure_data?.last_modified

      if (!serverLastModified) {
        return {
          success: true,
          data: {
            hasServerChanges: false,
            needsDownload: false,
            localLastModified,
          },
        }
      }

      const needsDownload =
        !localLastModified ||
        new Date(serverLastModified).getTime() > new Date(localLastModified).getTime()

      return {
        success: true,
        data: {
          hasServerChanges: needsDownload,
          needsDownload,
          serverLastModified,
          localLastModified,
        },
      }
    } catch (error) {
      console.error('Brochure sync status check error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check sync status'
      }
    }
  }

  /**
   * Download brochure changes from server
   */
  static async downloadBrochureChanges(
    mrId: string,
    brochureId: string
  ): Promise<{ 
    success: boolean; 
    data?: BrochureSyncData; 
    error?: string 
  }> {
    try {
      const result = await MRService.getBrochureSyncData(mrId, brochureId)
      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || 'No brochure sync data found',
        }
      }

      const syncRecord = result.data as {
        brochure_title?: string
        last_modified?: string
        brochure_data?: {
          slides?: BrochureSyncData['slides']
          groups?: BrochureSyncData['groups']
          total_slides?: number
          last_modified?: string
          title?: string
        }
      }

      const brochureData = syncRecord.brochure_data || {}
      const slides = brochureData.slides || []
      const groups = brochureData.groups || []
      const lastModified =
        syncRecord.last_modified ||
        brochureData.last_modified ||
        new Date().toISOString()

      return {
        success: true,
        data: {
          brochureId,
          brochureTitle: syncRecord.brochure_title || brochureData.title,
          title: brochureData.title,
          slides,
          groups,
          totalSlides: brochureData.total_slides || slides.length,
          lastModified,
        },
      }
    } catch (error) {
      console.error('Brochure download error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download brochure changes'
      }
    }
  }

  /**
   * Apply downloaded brochure changes to local storage (smart merge)
   */
  static async applyBrochureChanges(
    brochureId: string,
    syncData: BrochureSyncData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('BrochureSync: Applying downloaded changes')
      console.log('BrochureSync: Downloaded slides count:', syncData.slides.length)
      console.log('BrochureSync: Downloaded groups count:', syncData.groups.length)
      console.log('BrochureSync: Downloaded slide titles:', syncData.slides.slice(0, 3).map(s => s.title))
      console.log('BrochureSync: Downloaded group names:', syncData.groups.map(g => g.name))
      
      const brochureDir = `${FileSystem.documentDirectory}brochures/${brochureId}/`
      const now = new Date().toISOString()
      
      // Check if local brochure data exists and has local modifications
      const existingResult = await this.getBrochureData(brochureId)
      let localModifications = null
      
      if (existingResult.success && existingResult.data) {
        localModifications = {
          hasLocalChanges: existingResult.data.isModified || existingResult.data.needsSync,
          localTimestamp: existingResult.data.localLastModified,
          serverTimestamp: syncData.lastModified
        }
        
        console.log('BrochureSync: Local modifications check:', localModifications)
        
        // If local has newer changes, don't overwrite
        if (localModifications.hasLocalChanges && localModifications.localTimestamp) {
          const localTime = new Date(localModifications.localTimestamp).getTime()
          const serverTime = new Date(localModifications.serverTimestamp).getTime()
          
          if (localTime > serverTime) {
            console.log('BrochureSync: Local changes are newer, skipping server apply')
            return { success: true }
          }
        }
      }
      
      // Create updated brochure data with sync metadata
      const brochureData: BrochureData = {
        id: brochureId,
        title: syncData.brochureTitle || syncData.title || 'Brochure',
        category: 'General',
        slides: syncData.slides,
        groups: syncData.groups,
        thumbnailUri: syncData.slides[0]?.imageUri,
        totalSlides: syncData.totalSlides || syncData.slides.length,
        createdAt: existingResult.data?.createdAt || now,
        updatedAt: syncData.lastModified,
        // Sync metadata
        localLastModified: syncData.lastModified,
        lastSyncedAt: now,
        needsSync: false,
        isModified: false
      }

      // Save updated brochure data
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )

      console.log('BrochureSync: Successfully applied changes with', syncData.slides.length, 'slides and', syncData.groups.length, 'groups')
      return { success: true }
    } catch (error) {
      console.error('Apply brochure changes error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply brochure changes'
      }
    }
  }
}
