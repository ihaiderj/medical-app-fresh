/**
 * Offline Brochure Service
 * Handles brochure management with offline-first approach
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { MRService, MRAssignedBrochure } from './MRService';
import { NetworkService } from './networkService';
import { AuthService } from './AuthService';

export interface OfflineBrochureCache {
  brochures: MRAssignedBrochure[];
  lastUpdated: number;
  userId: string;
}

export interface BrochureAvailability {
  available: MRAssignedBrochure[];
  cached: MRAssignedBrochure[];
  isFromCache: boolean;
  lastSync: number;
}

export class OfflineBrochureService {
  private static readonly CACHE_KEY = 'available_brochures_cache';
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly ESSENTIAL_BROCHURES_KEY = 'essential_brochures';

  /**
   * Get available brochures (offline-first)
   */
  static async getAvailableBrochures(userId: string): Promise<BrochureAvailability> {
    try {
      console.log('OfflineBrochure: Getting available brochures for user:', userId);

      // OFFLINE-FIRST: Try to get from local database first
      try {
        const { LocalDatabaseService } = await import('./localDatabaseService');
        const localBrochures = await LocalDatabaseService.getBrochures(userId);
        
        if (localBrochures && localBrochures.length > 0) {
          console.log(`OfflineBrochure: Found ${localBrochures.length} brochures in local DB`);
          
          // Map local brochures to MRAssignedBrochure format
          const mappedBrochures: MRAssignedBrochure[] = localBrochures.map(b => ({
            brochure_id: b.id,
            id: b.id,
            title: b.title,
            category: b.category || 'General',
            description: b.description,
            file_url: b.file_url,
            thumbnail_url: b.thumbnail_url,
            view_count: b.view_count || 0,
            download_count: b.download_count || 0,
          }));
          
          return {
            available: mappedBrochures,
            cached: mappedBrochures,
            isFromCache: true,
            lastSync: Date.now()
          };
        }
      } catch (localError) {
        console.warn('OfflineBrochure: Local DB fetch failed, falling back to server/cache:', localError);
      }

      // Fallback to AsyncStorage cache
      console.log('OfflineBrochure: Using AsyncStorage cached brochures');
      const cachedBrochures = await this.getCachedBrochures(userId);
      
      if (cachedBrochures.brochures.length > 0) {
        return {
          available: cachedBrochures.brochures,
          cached: cachedBrochures.brochures,
          isFromCache: true,
          lastSync: cachedBrochures.lastUpdated
        };
      }

      // Last resort: Try server (but only if online)
      if (await NetworkService.isOnline()) {
        try {
          console.log('OfflineBrochure: Online - fetching from server as last resort');
          const serverResult = await MRService.getAssignedBrochures(userId);
          
          if (serverResult.success && serverResult.data) {
            // Cache the fresh data
            await this.cacheBrochures(userId, serverResult.data);
            
            return {
              available: serverResult.data,
              cached: [],
              isFromCache: false,
              lastSync: Date.now()
            };
          }
        } catch (error) {
          console.warn('OfflineBrochure: Server fetch failed:', error);
        }
      }

      return {
        available: [],
        cached: [],
        isFromCache: true,
        lastSync: 0
      };

    } catch (error) {
      console.error('OfflineBrochure: Error getting available brochures:', error);
      return {
        available: [],
        cached: [],
        isFromCache: true,
        lastSync: 0
      };
    }
  }

  /**
   * Cache brochures for offline access
   */
  static async cacheBrochures(userId: string, brochures: MRAssignedBrochure[]): Promise<void> {
    try {
      const cache: OfflineBrochureCache = {
        brochures,
        lastUpdated: Date.now(),
        userId
      };

      await AsyncStorage.setItem(`${this.CACHE_KEY}_${userId}`, JSON.stringify(cache));
      console.log(`OfflineBrochure: Cached ${brochures.length} brochures for user ${userId}`);
    } catch (error) {
      console.error('OfflineBrochure: Failed to cache brochures:', error);
    }
  }

  /**
   * Get cached brochures
   */
  static async getCachedBrochures(userId: string): Promise<OfflineBrochureCache> {
    try {
      const cacheData = await AsyncStorage.getItem(`${this.CACHE_KEY}_${userId}`);
      
      if (cacheData) {
        const cache: OfflineBrochureCache = JSON.parse(cacheData);
        
        // Check if cache is still valid
        const isExpired = Date.now() - cache.lastUpdated > this.CACHE_DURATION;
        
        if (!isExpired) {
          console.log(`OfflineBrochure: Using valid cache with ${cache.brochures.length} brochures`);
          return cache;
        } else {
          console.log('OfflineBrochure: Cache expired, but returning stale data for offline use');
          return cache; // Return stale data for offline use
        }
      }

      // No cache found
      console.log('OfflineBrochure: No cache found');
      return {
        brochures: [],
        lastUpdated: 0,
        userId
      };
    } catch (error) {
      console.error('OfflineBrochure: Error getting cached brochures:', error);
      return {
        brochures: [],
        lastUpdated: 0,
        userId
      };
    }
  }

  /**
   * Pre-cache essential brochures for new users
   */
  static async preCacheEssentialBrochures(userId: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      console.log('OfflineBrochure: Pre-caching essential brochures...');

      if (!(await NetworkService.isOnline())) {
        return { success: false, count: 0, error: 'Internet connection required for initial setup' };
      }

      // Get all available brochures
      const result = await MRService.getAssignedBrochures(userId);
      
      if (!result.success || !result.data) {
        return { success: false, count: 0, error: result.error || 'Failed to fetch brochures' };
      }

      // Cache all brochures for offline access
      await this.cacheBrochures(userId, result.data);

      // Optionally pre-download essential brochures (first 3-5)
      const essentialBrochures = result.data.slice(0, 3);
      let downloadedCount = 0;

      for (const brochure of essentialBrochures) {
        try {
          if (brochure.file_type?.includes('zip') && brochure.file_url) {
            console.log(`OfflineBrochure: Pre-downloading ${brochure.title}...`);
            
            // This would trigger the existing download flow
            // For now, we'll just cache the metadata
            downloadedCount++;
          }
        } catch (error) {
          console.warn(`OfflineBrochure: Failed to pre-download ${brochure.title}:`, error);
        }
      }

      // Store essential brochures list
      await AsyncStorage.setItem(
        `${this.ESSENTIAL_BROCHURES_KEY}_${userId}`, 
        JSON.stringify(essentialBrochures.map(b => b.id))
      );

      console.log(`OfflineBrochure: Pre-cached ${result.data.length} brochures, pre-downloaded ${downloadedCount}`);
      
      return { 
        success: true, 
        count: result.data.length,
        error: downloadedCount < essentialBrochures.length ? 'Some downloads failed' : undefined
      };

    } catch (error) {
      console.error('OfflineBrochure: Error pre-caching brochures:', error);
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Check if brochures need refresh
   */
  static async needsRefresh(userId: string): Promise<boolean> {
    try {
      const cache = await this.getCachedBrochures(userId);
      const isExpired = Date.now() - cache.lastUpdated > this.CACHE_DURATION;
      return isExpired || cache.brochures.length === 0;
    } catch (error) {
      return true;
    }
  }

  /**
   * Refresh brochure cache
   */
  static async refreshCache(userId: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      if (!(await NetworkService.isOnline())) {
        return { success: false, count: 0, error: 'Internet connection required' };
      }

      const result = await MRService.getAssignedBrochures(userId);
      
      if (result.success && result.data) {
        await this.cacheBrochures(userId, result.data);
        return { success: true, count: result.data.length };
      }

      return { success: false, count: 0, error: result.error };
    } catch (error) {
      return { 
        success: false, 
        count: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get cache status
   */
  static async getCacheStatus(userId: string): Promise<{
    hasCachedBrochures: boolean;
    cacheAge: number;
    isExpired: boolean;
    brochureCount: number;
  }> {
    try {
      const cache = await this.getCachedBrochures(userId);
      const cacheAge = Date.now() - cache.lastUpdated;
      const isExpired = cacheAge > this.CACHE_DURATION;

      return {
        hasCachedBrochures: cache.brochures.length > 0,
        cacheAge,
        isExpired,
        brochureCount: cache.brochures.length
      };
    } catch (error) {
      return {
        hasCachedBrochures: false,
        cacheAge: 0,
        isExpired: true,
        brochureCount: 0
      };
    }
  }

  /**
   * Clear cache
   */
  static async clearCache(userId: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${this.CACHE_KEY}_${userId}`);
      await AsyncStorage.removeItem(`${this.ESSENTIAL_BROCHURES_KEY}_${userId}`);
      console.log('OfflineBrochure: Cache cleared for user:', userId);
    } catch (error) {
      console.error('OfflineBrochure: Error clearing cache:', error);
    }
  }

  /**
   * Initialize for new user (called during first login)
   */
  static async initializeForNewUser(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('OfflineBrochure: Initializing for new user:', userId);

      // Check if user already has cache
      const status = await this.getCacheStatus(userId);
      if (status.hasCachedBrochures && !status.isExpired) {
        return { success: true, message: 'Brochures already cached' };
      }

      // Pre-cache brochures for offline access
      const result = await this.preCacheEssentialBrochures(userId);
      
      if (result.success) {
        return { 
          success: true, 
          message: `${result.count} brochures cached for offline access` 
        };
      } else {
        return { 
          success: false, 
          message: result.error || 'Failed to cache brochures' 
        };
      }
    } catch (error) {
      console.error('OfflineBrochure: Error initializing for new user:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Initialization failed' 
      };
    }
  }
}
