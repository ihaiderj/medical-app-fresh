/**
 * Offline Brochure Service
 * Handles brochure management with offline-first approach
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MRService, MRAssignedBrochure } from './MRService';
import { NetworkService } from './networkService';

export interface OfflineBrochureCache {
  brochures: MRAssignedBrochure[];
  lastUpdated: number;
  userId: string;
}

export interface BrochureAvailability {
  available: MRAssignedBrochure[];
  cached: MRAssignedBrochure[];
  isFromCache: boolean;
  isDeviceOffline: boolean;
  lastSync: number;
}

export class OfflineBrochureService {
  private static readonly CACHE_KEY = 'available_brochures_cache';
  private static readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly ESSENTIAL_BROCHURES_KEY = 'essential_brochures';

  private static mapLocalBrochure(b: {
    id: string;
    title: string;
    category?: string;
    description?: string;
    file_url?: string;
    thumbnail_url?: string;
    file_name?: string;
    file_type?: string;
    view_count?: number;
    download_count?: number;
    uploaded_by?: string;
    created_at?: string;
    updated_at?: string;
  }): MRAssignedBrochure {
    return {
      brochure_id: b.id,
      id: b.id,
      title: b.title,
      category: b.category || 'General',
      description: b.description,
      file_url: b.file_url,
      thumbnail_url: b.thumbnail_url,
      file_name: b.file_name,
      file_type: b.file_type,
      view_count: b.view_count || 0,
      download_count: b.download_count || 0,
      uploaded_by_name: b.uploaded_by || 'Administrator',
      created_at: b.created_at || new Date().toISOString(),
      updated_at: b.updated_at,
    };
  }

  /**
   * Get available brochures — refresh from server when online, otherwise use cache.
   */
  static async getAvailableBrochures(userId: string): Promise<BrochureAvailability> {
    try {
      console.log('OfflineBrochure: Getting available brochures for user:', userId);
      const isDeviceOffline = !(await NetworkService.isOnline());

      if (!isDeviceOffline) {
        try {
          const serverResult = await MRService.getAssignedBrochures(userId);
          if (serverResult.success) {
            const brochures = serverResult.data || [];
            console.log(`OfflineBrochure: Fetched ${brochures.length} brochures from server`);

            const { LocalDatabaseService } = await import('./localDatabaseService');
            await LocalDatabaseService.syncBrochuresFromServer(brochures);
            await this.cacheBrochures(userId, brochures);

            return {
              available: brochures,
              cached: brochures,
              isFromCache: false,
              isDeviceOffline: false,
              lastSync: Date.now(),
            };
          }
        } catch (error) {
          console.warn('OfflineBrochure: Server fetch failed, falling back to cache:', error);
        }
      }

      // Offline or server failed — use local database
      try {
        const { LocalDatabaseService } = await import('./localDatabaseService');
        const localBrochures = await LocalDatabaseService.getBrochures(userId);

        if (localBrochures.length > 0) {
          const mappedBrochures = localBrochures.map((b) => this.mapLocalBrochure(b));
          const cache = await this.getCachedBrochures(userId);

          return {
            available: mappedBrochures,
            cached: mappedBrochures,
            isFromCache: true,
            isDeviceOffline,
            lastSync: cache.lastUpdated || Date.now(),
          };
        }
      } catch (localError) {
        console.warn('OfflineBrochure: Local DB fetch failed:', localError);
      }

      // Fallback to AsyncStorage cache
      const cachedBrochures = await this.getCachedBrochures(userId);
      if (cachedBrochures.brochures.length > 0) {
        return {
          available: cachedBrochures.brochures,
          cached: cachedBrochures.brochures,
          isFromCache: true,
          isDeviceOffline,
          lastSync: cachedBrochures.lastUpdated,
        };
      }

      return {
        available: [],
        cached: [],
        isFromCache: true,
        isDeviceOffline,
        lastSync: 0,
      };
    } catch (error) {
      console.error('OfflineBrochure: Error getting available brochures:', error);
      return {
        available: [],
        cached: [],
        isFromCache: true,
        isDeviceOffline: true,
        lastSync: 0,
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
        userId,
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
        const isExpired = Date.now() - cache.lastUpdated > this.CACHE_DURATION;

        if (!isExpired) {
          console.log(`OfflineBrochure: Using valid cache with ${cache.brochures.length} brochures`);
          return cache;
        }

        console.log('OfflineBrochure: Cache expired, returning stale data for offline use');
        return cache;
      }

      console.log('OfflineBrochure: No cache found');
      return {
        brochures: [],
        lastUpdated: 0,
        userId,
      };
    } catch (error) {
      console.error('OfflineBrochure: Error getting cached brochures:', error);
      return {
        brochures: [],
        lastUpdated: 0,
        userId,
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

      const result = await MRService.getAssignedBrochures(userId);

      if (!result.success || !result.data) {
        return { success: false, count: 0, error: result.error || 'Failed to fetch brochures' };
      }

      const { LocalDatabaseService } = await import('./localDatabaseService');
      await LocalDatabaseService.syncBrochuresFromServer(result.data);
      await this.cacheBrochures(userId, result.data);

      const essentialBrochures = result.data.slice(0, 3);
      await AsyncStorage.setItem(
        `${this.ESSENTIAL_BROCHURES_KEY}_${userId}`,
        JSON.stringify(essentialBrochures.map((b) => b.id)),
      );

      console.log(`OfflineBrochure: Pre-cached ${result.data.length} brochures`);

      return {
        success: true,
        count: result.data.length,
      };
    } catch (error) {
      console.error('OfflineBrochure: Error pre-caching brochures:', error);
      return {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
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
    } catch {
      return true;
    }
  }

  /**
   * Refresh brochure cache from server
   */
  static async refreshCache(userId: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      if (!(await NetworkService.isOnline())) {
        return { success: false, count: 0, error: 'Internet connection required' };
      }

      const result = await MRService.getAssignedBrochures(userId);

      if (result.success && result.data) {
        const { LocalDatabaseService } = await import('./localDatabaseService');
        await LocalDatabaseService.syncBrochuresFromServer(result.data);
        await this.cacheBrochures(userId, result.data);
        return { success: true, count: result.data.length };
      }

      return { success: false, count: 0, error: result.error };
    } catch (error) {
      return {
        success: false,
        count: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
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
        brochureCount: cache.brochures.length,
      };
    } catch {
      return {
        hasCachedBrochures: false,
        cacheAge: 0,
        isExpired: true,
        brochureCount: 0,
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

      const status = await this.getCacheStatus(userId);
      if (status.hasCachedBrochures && !status.isExpired) {
        return { success: true, message: 'Brochures already cached' };
      }

      const result = await this.preCacheEssentialBrochures(userId);

      if (result.success) {
        return {
          success: true,
          message: `${result.count} brochures cached for offline access`,
        };
      }

      return {
        success: false,
        message: result.error || 'Failed to cache brochures',
      };
    } catch (error) {
      console.error('OfflineBrochure: Error initializing for new user:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Initialization failed',
      };
    }
  }
}
