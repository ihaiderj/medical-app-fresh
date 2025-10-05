import * as FileSystem from 'expo-file-system'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import { brochureSyncService, BrochureSyncData } from './brochureSyncService'

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
              const { data: { session } } = await supabase.auth.getSession()
              if (!session) {
                throw new Error('User not authenticated')
              }
              
              console.log('Downloading with authentication headers...')
              
              downloadResult = await FileSystem.downloadAsync(zipUri, downloadPath, {
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Cache-Control': 'no-cache',
                }
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
        await unzip(localZipPath, slidesDir)
        console.log('ZIP extracted to:', slidesDir)
        
        // Read extracted files
        const extractedFiles = await FileSystem.readDirectoryAsync(slidesDir)
        console.log('Extracted files:', extractedFiles)
        
        // Filter image files
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
        const imageFiles = extractedFiles.filter(file => 
          imageExtensions.some(ext => file.toLowerCase().endsWith(ext))
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
        slide.title.toLowerCase().startsWith(letter.toLowerCase())
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
    color: string = '#8b5cf6'
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
        updatedAt: new Date().toISOString()
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
      
      return { success: true, slideId }
    } catch (error) {
      console.error('Add slide error:', error)
      return { success: false, error: 'Failed to add slide' }
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
      const thumbnailPath = `${this.STORAGE_DIR}${brochureId}/thumbnail.jpg`
      
      // For local files, use them directly as thumbnail
      if (firstSlide.imageUri.startsWith('file://') || firstSlide.imageUri.startsWith('/')) {
        // Copy first slide as thumbnail
        await FileSystem.copyAsync({
          from: firstSlide.imageUri,
          to: thumbnailPath
        })
        
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
   * Mark brochure as modified (for sync tracking)
   */
  static async markBrochureAsModified(brochureId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.getBrochureData(brochureId)
      if (!result.success || !result.data) {
        return { success: false, error: 'Brochure not found' }
      }

      const now = new Date().toISOString()
      result.data.isModified = true
      result.data.needsSync = true
      result.data.localLastModified = now
      result.data.updatedAt = now

      // Save updated metadata
      const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(result.data, null, 2)
      )

      console.log('BrochureManager: Marked as modified:', brochureId)
      return { success: true }
    } catch (error) {
      console.error('Mark brochure modified error:', error)
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
        return { success: false, error: 'Brochure not found' }
      }

      result.data.needsSync = false
      result.data.isModified = false
      result.data.lastSyncedAt = new Date().toISOString()

      // Save updated metadata
      const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(result.data, null, 2)
      )

      console.log('BrochureManager: Marked as synced:', brochureId)
      return { success: true }
    } catch (error) {
      console.error('Mark brochure synced error:', error)
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
      console.log('BrochureSync: Uploading brochure data to server')
      console.log('BrochureSync: Slides count:', slides.length)
      console.log('BrochureSync: Groups count:', groups.length)
      console.log('BrochureSync: Sample slide titles:', slides.slice(0, 3).map(s => s.title))
      console.log('BrochureSync: Group names:', groups.map(g => g.name))
      
      const result = await brochureSyncService.syncBrochureToServer(
        mrId,
        brochureId,
        brochureTitle,
        slides,
        groups
      )
      
      if (result.success) {
        console.log('BrochureSync: Successfully uploaded brochure data with', slides.length, 'slides and', groups.length, 'groups')
      } else {
        console.error('BrochureSync: Failed to upload brochure data:', result.error)
      }
      
      return result
    } catch (error) {
      console.error('Brochure sync error:', error)
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
      return await brochureSyncService.checkBrochureSyncStatus(
        mrId,
        brochureId,
        localLastModified
      )
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
      return await brochureSyncService.downloadBrochureChanges(mrId, brochureId)
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
      
      const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
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
        title: syncData.brochureTitle,
        category: 'General',
        slides: syncData.slides,
        groups: syncData.groups,
        thumbnailUri: syncData.slides[0]?.imageUri,
        totalSlides: syncData.totalSlides,
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
