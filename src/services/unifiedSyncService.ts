/**
 * Unified Sync Service
 * Centralized sync management with activity detection and smart scheduling
 * Integrates all existing sync services into a single, efficient system
 */
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { AuthService } from './AuthService';
import { SmartSyncService, SyncStatus } from './smartSyncService';
import { AdvancedSyncService } from './advancedSyncService';
import { OfflineFirstService } from './offlineFirstService';
import { NetworkService } from './networkService';

export interface UnifiedSyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: number;
  pendingOperations: number;
  failedOperations: number;
  hasConflicts: boolean;
  syncProgress: number;
  currentOperation?: string;
}

export interface ActivityDetection {
  isActive: boolean;
  lastActivityTime: number;
  idleTime: number;
  shouldSync: boolean;
}

export class UnifiedSyncService {
  private static isInitialized = false;
  private static isSyncing = false;
  private static lastSyncTime = 0;
  private static lastActivityTime = 0;
  private static syncStatusListeners: ((status: UnifiedSyncStatus) => void)[] = [];
  private static activityListeners: ((activity: ActivityDetection) => void)[] = [];
  private static syncTimer: NodeJS.Timeout | null = null;
  private static activityTimer: NodeJS.Timeout | null = null;
  private static currentAppState: AppStateStatus = 'active';

  /**
   * Initialize the unified sync service
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('UnifiedSync: Already initialized');
      return;
    }

    console.log('UnifiedSync: Initializing unified sync service...');

    try {
      // Initialize underlying services
      await SmartSyncService.initialize();
      await AdvancedSyncService.initialize();

      // Set up activity detection
      this.setupActivityDetection();

      // Set up app state monitoring
      this.setupAppStateMonitoring();

      // Set up network monitoring
      this.setupNetworkMonitoring();

      // Start smart sync scheduling
      this.startSmartSyncScheduling();

      this.isInitialized = true;
      console.log('UnifiedSync: Service initialized successfully');
    } catch (error) {
      console.error('UnifiedSync: Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Track user activity (call this on any user interaction)
   */
  static trackActivity(): void {
    this.lastActivityTime = Date.now();
    this.notifyActivityListeners();
    
    // Cancel any pending sync if user is active
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    // Schedule sync for when user becomes idle
    this.scheduleIdleSync();
  }

  /**
   * Force immediate sync
   */
  static async forceSync(): Promise<boolean> {
    if (this.isSyncing) {
      console.log('UnifiedSync: Sync already in progress');
      return false;
    }

    if (!(await NetworkService.isOnline())) {
      console.log('UnifiedSync: Cannot sync - offline');
      return false;
    }

    this.isSyncing = true;
    this.notifyStatusListeners();

    try {
      console.log('UnifiedSync: Starting forced sync...');
      
      // Use advanced sync for comprehensive synchronization
      const result = await AdvancedSyncService.performFullSync();
      
      if (result.success) {
        this.lastSyncTime = Date.now();
        console.log('UnifiedSync: Forced sync completed successfully');
        return true;
      } else {
        console.error('UnifiedSync: Forced sync failed:', result.errors);
        return false;
      }
    } catch (error) {
      console.error('UnifiedSync: Forced sync error:', error);
      return false;
    } finally {
      this.isSyncing = false;
      this.notifyStatusListeners();
    }
  }

  /**
   * Get current sync status
   */
  static async getSyncStatus(): Promise<UnifiedSyncStatus> {
    const isOnline = await NetworkService.isOnline();
    const now = Date.now();
    const idleTime = now - this.lastActivityTime;

    // Get sync stats from offline-first service
    const syncStats = await OfflineFirstService.getSyncStats();
    const pendingOps = syncStats.success ? syncStats.data?.pending || 0 : 0;
    const failedOps = syncStats.success ? syncStats.data?.failed || 0 : 0;

    return {
      isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      pendingOperations: pendingOps,
      failedOperations: failedOps,
      hasConflicts: false, // TODO: Implement conflict detection
      syncProgress: this.isSyncing ? 50 : 100, // TODO: Implement real progress tracking
      currentOperation: this.isSyncing ? 'Syncing data...' : undefined,
    };
  }

  /**
   * Subscribe to sync status changes
   */
  static subscribeToSyncStatus(callback: (status: UnifiedSyncStatus) => void): () => void {
    this.syncStatusListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.syncStatusListeners.indexOf(callback);
      if (index > -1) {
        this.syncStatusListeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to activity detection changes
   */
  static subscribeToActivity(callback: (activity: ActivityDetection) => void): () => void {
    this.activityListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.activityListeners.indexOf(callback);
      if (index > -1) {
        this.activityListeners.splice(index, 1);
      }
    };
  }

  /**
   * Set up activity detection
   */
  private static setupActivityDetection(): void {
    // Track activity every 5 seconds
    this.activityTimer = setInterval(() => {
      this.notifyActivityListeners();
    }, 5000);
  }

  /**
   * Set up app state monitoring
   */
  private static setupAppStateMonitoring(): void {
    AppState.addEventListener('change', (nextAppState) => {
      this.currentAppState = nextAppState;
      
      if (nextAppState === 'active') {
        // App became active, check if we need to sync
        this.handleAppBecameActive();
      } else if (nextAppState === 'background') {
        // App went to background, cancel any pending syncs
        this.handleAppWentToBackground();
      }
    });
  }

  /**
   * Set up network monitoring
   */
  private static setupNetworkMonitoring(): void {
    NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        // Network came back online, trigger sync
        this.handleNetworkCameOnline();
      }
    });
  }

  /**
   * Start smart sync scheduling
   */
  private static startSmartSyncScheduling(): void {
    // Perform initial sync
    this.scheduleInitialSync();
  }

  /**
   * Schedule initial sync
   */
  private static async scheduleInitialSync(): Promise<void> {
    // Wait 2 seconds after app start before initial sync
    setTimeout(async () => {
      if (this.currentAppState === 'active') {
        await this.performSmartSync();
      }
    }, 2000);
  }

  /**
   * Schedule sync for when user becomes idle
   */
  private static scheduleIdleSync(): void {
    // Clear existing timer
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    // Schedule sync for 30 seconds of inactivity
    this.syncTimer = setTimeout(async () => {
      if (this.currentAppState === 'active') {
        await this.performSmartSync();
      }
    }, 30000);
  }

  /**
   * Perform smart sync based on current conditions
   */
  private static async performSmartSync(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    if (!(await NetworkService.isOnline())) {
      console.log('UnifiedSync: Skipping sync - offline');
      return;
    }

    const userResult = await AuthService.getCurrentUser();
    if (!userResult.success || !userResult.user) {
      console.log('UnifiedSync: Skipping sync - no user');
      return;
    }

    this.isSyncing = true;
    this.notifyStatusListeners();

    try {
      console.log('UnifiedSync: Performing smart sync...');
      
      // Use smart sync service for intelligent synchronization
      await SmartSyncService.performIdleSync();
      
      this.lastSyncTime = Date.now();
      console.log('UnifiedSync: Smart sync completed');
    } catch (error) {
      console.error('UnifiedSync: Smart sync error:', error);
    } finally {
      this.isSyncing = false;
      this.notifyStatusListeners();
    }
  }

  /**
   * Handle app became active
   */
  private static async handleAppBecameActive(): Promise<void> {
    console.log('UnifiedSync: App became active');
    
    // Check if we need to sync (e.g., if we've been offline)
    if (await NetworkService.isOnline()) {
      // Small delay to let the app fully activate
      setTimeout(() => {
        this.performSmartSync();
      }, 1000);
    }
  }

  /**
   * Handle app went to background
   */
  private static handleAppWentToBackground(): void {
    console.log('UnifiedSync: App went to background');
    
    // Cancel any pending syncs
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Handle network came online
   */
  private static async handleNetworkCameOnline(): Promise<void> {
    console.log('UnifiedSync: Network came online');
    
    // Wait a moment for network to stabilize
    setTimeout(async () => {
      if (this.currentAppState === 'active') {
        await this.performSmartSync();
      }
    }, 2000);
  }

  /**
   * Notify sync status listeners
   */
  private static async notifyStatusListeners(): Promise<void> {
    const status = await this.getSyncStatus();
    this.syncStatusListeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('UnifiedSync: Error in status listener:', error);
      }
    });
  }

  /**
   * Notify activity listeners
   */
  private static notifyActivityListeners(): void {
    const now = Date.now();
    const idleTime = now - this.lastActivityTime;
    const isActive = idleTime < 30000; // Active if less than 30 seconds idle

    const activity: ActivityDetection = {
      isActive,
      lastActivityTime: this.lastActivityTime,
      idleTime,
      shouldSync: !isActive && idleTime > 30000, // Should sync if idle for more than 30 seconds
    };

    this.activityListeners.forEach(callback => {
      try {
        callback(activity);
      } catch (error) {
        console.error('UnifiedSync: Error in activity listener:', error);
      }
    });
  }

  /**
   * Cleanup resources
   */
  static cleanup(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }

    this.syncStatusListeners = [];
    this.activityListeners = [];
    this.isInitialized = false;
  }
}
