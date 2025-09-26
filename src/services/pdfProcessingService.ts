import * as FileSystem from 'expo-file-system'

export interface PDFPage {
  pageNumber: number
  imageUri: string
  width: number
  height: number
}

export interface PDFProcessingResult {
  success: boolean
  pages?: PDFPage[]
  thumbnailUri?: string
  totalPages?: number
  error?: string
}

export class PDFProcessingService {
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
   * Generate thumbnail from first page of PDF
   */
  static async generateThumbnail(
    brochureId: string,
    pdfUri: string
  ): Promise<{ success: boolean; thumbnailUri?: string; error?: string }> {
    try {
      await this.initializeStorage()
      
      // For now, create a mock thumbnail
      // In a real implementation, you'd use a PDF library to extract the first page
      const thumbnailPath = `${this.STORAGE_DIR}${brochureId}_thumbnail.jpg`
      
      // Create a local thumbnail using base64 encoded image
      const base64Thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGArEkAAAAAElFTkSuQmCC'
      
      // Save the base64 image as a local file
      await FileSystem.writeAsStringAsync(thumbnailPath, base64Thumbnail, {
        encoding: FileSystem.EncodingType.Base64,
      })
      
      return { 
        success: true, 
        thumbnailUri: thumbnailPath 
      }
    } catch (error) {
      console.error('Thumbnail generation error:', error)
      return { 
        success: false, 
        error: 'Failed to generate thumbnail' 
      }
    }
  }

  /**
   * Convert PDF to images for slide presentation
   */
  static async convertPDFToSlides(
    brochureId: string,
    pdfUri: string
  ): Promise<PDFProcessingResult> {
    try {
      await this.initializeStorage()
      
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      await FileSystem.makeDirectoryAsync(brochureDir, { intermediates: true })
      
      // For demo purposes, create mock slides
      // In a real implementation, you'd use a PDF library to convert each page
      const mockPages: PDFPage[] = []
      const totalPages = Math.floor(Math.random() * 10) + 3 // 3-12 pages
      
      for (let i = 1; i <= totalPages; i++) {
        const localPagePath = `${brochureDir}page_${i.toString().padStart(3, '0')}.jpg`
        
        // Create a local page image using base64
        const base64PageImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGArEkAAAAAElFTkSuQmCC'
        
        // Save the base64 image as a local file
        await FileSystem.writeAsStringAsync(localPagePath, base64PageImage, {
          encoding: FileSystem.EncodingType.Base64,
        })
        
        mockPages.push({
          pageNumber: i,
          imageUri: localPagePath,
          width: 800,
          height: 600
        })
      }
      
      // Save conversion metadata
      const conversionData = {
        brochureId,
        totalPages: mockPages.length,
        convertedAt: new Date().toISOString(),
        pages: mockPages
      }
      
      await FileSystem.writeAsStringAsync(
        `${brochureDir}conversion_data.json`,
        JSON.stringify(conversionData, null, 2)
      )
      
      return {
        success: true,
        pages: mockPages,
        totalPages: mockPages.length,
        thumbnailUri: mockPages[0]?.imageUri
      }
    } catch (error) {
      console.error('PDF conversion error:', error)
      return {
        success: false,
        error: 'Failed to convert PDF to slides'
      }
    }
  }

  /**
   * Get converted slides if they exist
   */
  static async getConvertedSlides(brochureId: string): Promise<PDFProcessingResult> {
    try {
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const dataPath = `${brochureDir}conversion_data.json`
      
      const fileInfo = await FileSystem.getInfoAsync(dataPath)
      if (!fileInfo.exists) {
        return { success: false, error: 'No converted slides found' }
      }
      
      const dataString = await FileSystem.readAsStringAsync(dataPath)
      const conversionData = JSON.parse(dataString)
      
      return {
        success: true,
        pages: conversionData.pages,
        totalPages: conversionData.totalPages,
        thumbnailUri: conversionData.pages[0]?.imageUri
      }
    } catch (error) {
      console.error('Get converted slides error:', error)
      return {
        success: false,
        error: 'Failed to load converted slides'
      }
    }
  }

  /**
   * Check if brochure has been converted
   */
  static async isConverted(brochureId: string): Promise<boolean> {
    try {
      const brochureDir = `${this.STORAGE_DIR}${brochureId}/`
      const dataPath = `${brochureDir}conversion_data.json`
      
      const fileInfo = await FileSystem.getInfoAsync(dataPath)
      return fileInfo.exists
    } catch (error) {
      return false
    }
  }
}
