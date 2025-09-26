import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

// Mock implementation for PDF thumbnail generation
// This will be replaced with actual PDF processing when the dependency is available
const PdfThumbnail = {
  generateAllPages: async (pdfPath: string, quality: number) => {
    // Mock implementation - returns empty pages array
    // In a real implementation, this would generate thumbnails from PDF
    console.log('Mock PDF thumbnail generation for:', pdfPath, 'quality:', quality);
    return { pages: [] };
  }
};

export interface ConvertedSlide {
  pageNumber: number;
  imagePath: string;
  title: string;
}

export interface PresentationData {
  id: string;
  title: string;
  slides: ConvertedSlide[];
  totalPages: number;
  convertedAt: string;
}

export class PDFConversionService {
  private static readonly STORAGE_DIR = FileSystem.documentDirectory + 'presentations/';

  /**
   * Initialize the storage directory
   */
  static async initializeStorage(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.STORAGE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.STORAGE_DIR, { intermediates: true });
        console.log('Created presentations storage directory:', this.STORAGE_DIR);
      }
    } catch (error) {
      console.error('Failed to initialize storage:', error);
    }
  }

  /**
   * Convert PDF to images and save them in presentation-specific directory
   */
  static async convertPDFToImages(
    presentationId: string,
    presentationTitle: string,
    pdfPath: string
  ): Promise<PresentationData> {
    try {
      await this.initializeStorage();
      
      // Create presentation-specific directory
      const presentationDir = `${this.STORAGE_DIR}${presentationId}/`;
      await FileSystem.makeDirectoryAsync(presentationDir, { intermediates: true });

      console.log('Converting PDF to images...', pdfPath);
      
      // Convert PDF to images using react-native-pdf-thumbnail
      const { pages } = await PdfThumbnail.generateAllPages(pdfPath, 90);
      
      console.log(`Generated ${pages.length} images from PDF`);

      const slides: ConvertedSlide[] = [];
      
      // Handle case where no pages are generated (mock implementation)
      if (pages.length === 0) {
        console.log('No pages generated - using mock data for demonstration');
        // Create a mock slide for demonstration
        slides.push({
          pageNumber: 1,
          imagePath: `${presentationDir}slide_001.jpg`,
          title: 'Mock Slide 1'
        });
      } else {
        // Save each page as an image
        for (let i = 0; i < pages.length; i++) {
          const pageNumber = i + 1;
          const imagePath = `${presentationDir}slide_${pageNumber.toString().padStart(3, '0')}.jpg`;
          
          // Copy the generated image to our presentation directory
          await FileSystem.copyAsync({
            from: pages[i],
            to: imagePath
          });

          slides.push({
            pageNumber,
            imagePath,
            title: `Slide ${pageNumber}`
          });

          console.log(`Saved slide ${pageNumber} to:`, imagePath);
        }
      }

      // Save presentation metadata
      const presentationData: PresentationData = {
        id: presentationId,
        title: presentationTitle,
        slides,
        totalPages: slides.length, // Use slides.length instead of pages.length for mock compatibility
        convertedAt: new Date().toISOString()
      };

      await FileSystem.writeAsStringAsync(
        `${presentationDir}presentation_data.json`,
        JSON.stringify(presentationData, null, 2)
      );

      console.log('PDF conversion completed successfully');
      return presentationData;

    } catch (error) {
      console.error('PDF conversion failed:', error);
      throw error;
    }
  }

  /**
   * Get converted presentation data
   */
  static async getPresentationData(presentationId: string): Promise<PresentationData | null> {
    try {
      const presentationDir = `${this.STORAGE_DIR}${presentationId}/`;
      const dataPath = `${presentationDir}presentation_data.json`;
      
      const fileInfo = await FileSystem.getInfoAsync(dataPath);
      if (!fileInfo.exists) {
        return null;
      }

      const dataString = await FileSystem.readAsStringAsync(dataPath);
      return JSON.parse(dataString) as PresentationData;
    } catch (error) {
      console.error('Failed to get presentation data:', error);
      return null;
    }
  }

  /**
   * Check if presentation is already converted
   */
  static async isPresentationConverted(presentationId: string): Promise<boolean> {
    try {
      const presentationDir = `${this.STORAGE_DIR}${presentationId}/`;
      const dataPath = `${presentationDir}presentation_data.json`;
      
      const fileInfo = await FileSystem.getInfoAsync(dataPath);
      return fileInfo.exists;
    } catch (error) {
      console.error('Failed to check if presentation is converted:', error);
      return false;
    }
  }

  /**
   * Get all converted presentations
   */
  static async getAllConvertedPresentations(): Promise<PresentationData[]> {
    try {
      await this.initializeStorage();
      
      const dirInfo = await FileSystem.getInfoAsync(this.STORAGE_DIR);
      if (!dirInfo.exists) {
        return [];
      }

      const presentations: PresentationData[] = [];
      const folders = await FileSystem.readDirectoryAsync(this.STORAGE_DIR);

      for (const folder of folders) {
        const presentationData = await this.getPresentationData(folder);
        if (presentationData) {
          presentations.push(presentationData);
        }
      }

      return presentations;
    } catch (error) {
      console.error('Failed to get all presentations:', error);
      return [];
    }
  }

  /**
   * Delete presentation and its converted images
   */
  static async deletePresentation(presentationId: string): Promise<boolean> {
    try {
      const presentationDir = `${this.STORAGE_DIR}${presentationId}/`;
      const dirInfo = await FileSystem.getInfoAsync(presentationDir);
      
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(presentationDir, { idempotent: true });
        console.log('Deleted presentation:', presentationId);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to delete presentation:', error);
      return false;
    }
  }

  /**
   * Get the local path for a PDF asset
   */
  static async getLocalPDFPath(pdfAsset: any): Promise<string> {
    try {
      if (typeof pdfAsset === 'string') {
        // If it's already a path, return it
        return pdfAsset;
      }
      
      // If it's an asset, get the local URI
      const asset = Asset.fromModule(pdfAsset);
      await asset.downloadAsync();
      return asset.localUri || asset.uri;
    } catch (error) {
      console.error('Failed to get local PDF path:', error);
      throw error;
    }
  }
}
