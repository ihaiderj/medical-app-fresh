import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalDatabaseService } from './localDatabaseService';

export interface FirstTimeLoginInfo {
  isFirstTime: boolean;
  deviceId: string;
  firstLoginAt: string;
  lastSyncAt?: string;
}

export class FirstTimeLoginService {
  private static readonly DEVICE_ID_KEY = 'device_id';
  private static readonly FIRST_LOGIN_KEY = 'first_login_info';
  private static readonly LAST_SYNC_KEY = 'last_sync_timestamp';

  /**
   * Generate or retrieve device ID
   */
  static async getOrCreateDeviceId(): Promise<string> {
    try {
      let deviceId = await AsyncStorage.getItem(this.DEVICE_ID_KEY);
      
      if (!deviceId) {
        // Generate a unique device ID
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem(this.DEVICE_ID_KEY, deviceId);
        console.log('🔍 FIRST LOGIN DEBUG: Generated new device ID:', deviceId);
      } else {
        console.log('🔍 FIRST LOGIN DEBUG: Retrieved existing device ID:', deviceId);
      }
      
      return deviceId;
    } catch (error) {
      console.error('❌ FIRST LOGIN DEBUG: Failed to get/create device ID:', error);
      // Fallback device ID
      return `device_fallback_${Date.now()}`;
    }
  }

  /**
   * Check if this is the first time login on this device
   */
  static async isFirstTimeLogin(userId: string): Promise<FirstTimeLoginInfo> {
    try {
      console.log('🔍 FIRST LOGIN DEBUG: Checking first time login for user:', userId);
      
      const deviceId = await this.getOrCreateDeviceId();
      const firstLoginInfo = await AsyncStorage.getItem(this.FIRST_LOGIN_KEY);
      
      if (!firstLoginInfo) {
        // No previous login info - this is first time
        const info: FirstTimeLoginInfo = {
          isFirstTime: true,
          deviceId,
          firstLoginAt: new Date().toISOString()
        };
        
        await AsyncStorage.setItem(this.FIRST_LOGIN_KEY, JSON.stringify(info));
        console.log('✅ FIRST LOGIN DEBUG: First time login detected');
        return info;
      }
      
      const parsedInfo: FirstTimeLoginInfo = JSON.parse(firstLoginInfo);
      parsedInfo.deviceId = deviceId; // Update device ID in case it changed
      
      // Check if local database is empty (another indicator of first time)
      const isLocalDbEmpty = await this.isLocalDatabaseEmpty();
      
      if (isLocalDbEmpty) {
        console.log('✅ FIRST LOGIN DEBUG: Local database is empty - treating as first time login');
        parsedInfo.isFirstTime = true;
        parsedInfo.firstLoginAt = new Date().toISOString();
        await AsyncStorage.setItem(this.FIRST_LOGIN_KEY, JSON.stringify(parsedInfo));
        return parsedInfo;
      }
      
      console.log('🔍 FIRST LOGIN DEBUG: Not first time login - local database has data');
      parsedInfo.isFirstTime = false;
      return parsedInfo;
      
    } catch (error) {
      console.error('❌ FIRST LOGIN DEBUG: Error checking first time login:', error);
      // Default to first time login on error
      return {
        isFirstTime: true,
        deviceId: await this.getOrCreateDeviceId(),
        firstLoginAt: new Date().toISOString()
      };
    }
  }

  /**
   * Check if local database is empty (no user data)
   */
  private static async isLocalDatabaseEmpty(): Promise<boolean> {
    try {
      console.log('🔍 FIRST LOGIN DEBUG: Checking if local database is empty...');
      
      // Check if we're using AsyncStorage
      if (LocalDatabaseService.isUsingAsyncStorage()) {
        const doctorsData = await AsyncStorage.getItem('doctors');
        const meetingsData = await AsyncStorage.getItem('meetings');
        const usersData = await AsyncStorage.getItem('user_profile');
        const savedBrochuresData = await AsyncStorage.getItem('saved_brochures');
        const activityLogsData = await AsyncStorage.getItem('activity_logs');
        
        const hasDoctors = doctorsData && JSON.parse(doctorsData).length > 0;
        const hasMeetings = meetingsData && JSON.parse(meetingsData).length > 0;
        const hasSavedBrochures = savedBrochuresData && JSON.parse(savedBrochuresData).length > 0;
        const hasActivityLogs = activityLogsData && JSON.parse(activityLogsData).length > 0;
        // NOTE: intentionally do NOT count the `users`/`user_profile` entry — the
        // current user's own profile is written during login before this check,
        // so it must not be treated as "synced data already exists".
        void usersData;

        const isEmpty = !hasDoctors && !hasMeetings && !hasSavedBrochures && !hasActivityLogs;
        console.log('🔍 FIRST LOGIN DEBUG: AsyncStorage check - hasDoctors:', hasDoctors, 'hasMeetings:', hasMeetings, 'hasSavedBrochures:', hasSavedBrochures, 'hasActivityLogs:', hasActivityLogs, 'isEmpty:', isEmpty);
        return isEmpty;
      }
      
      // Check SQLite database
      const doctorsCount = await LocalDatabaseService.executeSelectFirst(
        'SELECT COUNT(*) as count FROM doctors',
        []
      );
      
      const meetingsCount = await LocalDatabaseService.executeSelectFirst(
        'SELECT COUNT(*) as count FROM meetings',
        []
      );
      
      const savedBrochuresCount = await LocalDatabaseService.executeSelectFirst(
        'SELECT COUNT(*) as count FROM saved_brochures WHERE is_deleted = 0',
        []
      );

      const activityLogsCount = await LocalDatabaseService.executeSelectFirst(
        'SELECT COUNT(*) as count FROM activity_logs WHERE is_deleted = 0',
        []
      );
      
      // NOTE: intentionally do NOT count the `users` table — the current user's
      // own profile is upserted during login before this check runs, so counting
      // it would always make the DB look "non-empty" and skip the initial
      // sync-down. Emptiness is based on actual synced content only.
      const isEmpty = (doctorsCount?.count || 0) === 0 && 
                     (meetingsCount?.count || 0) === 0 && 
                     (savedBrochuresCount?.count || 0) === 0 &&
                     (activityLogsCount?.count || 0) === 0;
      
      console.log('🔍 FIRST LOGIN DEBUG: SQLite check - doctors:', doctorsCount?.count, 'meetings:', meetingsCount?.count, 'savedBrochures:', savedBrochuresCount?.count, 'activityLogs:', activityLogsCount?.count, 'isEmpty:', isEmpty);
      return isEmpty;
      
    } catch (error) {
      console.error('❌ FIRST LOGIN DEBUG: Error checking local database:', error);
      // Assume empty on error
      return true;
    }
  }

  /**
   * Mark first time login as completed
   */
  static async markFirstTimeLoginCompleted(userId: string): Promise<void> {
    try {
      const deviceId = await this.getOrCreateDeviceId();
      const info: FirstTimeLoginInfo = {
        isFirstTime: false,
        deviceId,
        firstLoginAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString()
      };
      
      await AsyncStorage.setItem(this.FIRST_LOGIN_KEY, JSON.stringify(info));
      await AsyncStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
      
      console.log('✅ FIRST LOGIN DEBUG: Marked first time login as completed');
    } catch (error) {
      console.error('❌ FIRST LOGIN DEBUG: Error marking first time login completed:', error);
    }
  }

  /**
   * Get last sync timestamp
   */
  static async getLastSyncTimestamp(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.LAST_SYNC_KEY);
    } catch (error) {
      console.error('❌ FIRST LOGIN DEBUG: Error getting last sync timestamp:', error);
      return null;
    }
  }

  /**
   * Update last sync timestamp
   */
  static async updateLastSyncTimestamp(): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      await AsyncStorage.setItem(this.LAST_SYNC_KEY, timestamp);
      console.log('✅ FIRST LOGIN DEBUG: Updated last sync timestamp:', timestamp);
    } catch (error) {
      console.error('❌ FIRST LOGIN DEBUG: Error updating last sync timestamp:', error);
    }
  }

  /**
   * Reset first time login status (for testing)
   */
  static async resetFirstTimeLoginStatus(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.FIRST_LOGIN_KEY);
      await AsyncStorage.removeItem(this.LAST_SYNC_KEY);
      console.log('✅ FIRST LOGIN DEBUG: Reset first time login status');
    } catch (error) {
      console.error('❌ FIRST LOGIN DEBUG: Error resetting first time login status:', error);
    }
  }
}

