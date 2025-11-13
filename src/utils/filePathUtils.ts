/**
 * File Path Utilities
 * Handles cross-platform file path resolution
 */
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export class FilePathUtils {
  /**
   * Get the correct document directory for the current platform
   */
  static getDocumentDirectory(): string {
    return FileSystem.documentDirectory || '';
  }

  /**
   * Normalize file path for the current platform
   */
  static normalizePath(path: string): string {
    if (!path) return '';
    
    // Ensure the path uses the correct file:// protocol
    if (!path.startsWith('file://')) {
      return `file://${path}`;
    }
    
    return path;
  }

  /**
   * Get brochure directory path
   */
  static getBrochureDirectory(brochureId: string): string {
    const baseDir = this.getDocumentDirectory();
    return `${baseDir}brochures/${brochureId}/`;
  }

  /**
   * Get slides directory path
   */
  static getSlidesDirectory(brochureId: string): string {
    return `${this.getBrochureDirectory(brochureId)}slides/`;
  }

  /**
   * Get slide image path
   */
  static getSlideImagePath(brochureId: string, fileName: string): string {
    const slidesDir = this.getSlidesDirectory(brochureId);
    const fullPath = `${slidesDir}${fileName}`;
    return this.normalizePath(fullPath);
  }

  /**
   * Get thumbnail path for a brochure
   */
  static getThumbnailPath(brochureId: string): string {
    const brochureDir = this.getBrochureDirectory(brochureId);
    const fullPath = `${brochureDir}thumbnail.jpg`;
    return this.normalizePath(fullPath);
  }

  /**
   * Check if file exists at path
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      return info.exists;
    } catch (error) {
      console.warn('Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Debug file path information
   */
  static async debugFilePath(filePath: string): Promise<void> {
    console.log('=== FILE PATH DEBUG ===');
    console.log('Original path:', filePath);
    console.log('Normalized path:', this.normalizePath(filePath));
    
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      console.log('File exists:', info.exists);
      console.log('File info:', info);
    } catch (error) {
      console.log('File check error:', error);
    }
    
    // Also check the directory
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    try {
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      console.log('Directory exists:', dirInfo.exists);
      
      if (dirInfo.exists && dirInfo.isDirectory) {
        const contents = await FileSystem.readDirectoryAsync(dirPath);
        console.log('Directory contents:', contents);
      }
    } catch (error) {
      console.log('Directory check error:', error);
    }
    console.log('=== END DEBUG ===');
  }
}
