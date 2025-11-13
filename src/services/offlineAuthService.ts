/**
 * Offline Authentication Service
 * Enables 100% offline authentication with local credential storage
 * Works completely offline after initial setup
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AuthService, UserProfile } from './AuthService';
import { NetworkService } from './networkService';

export interface OfflineCredentials {
  email: string;
  password: string;
  role: 'admin' | 'mr';
  userId: string;
  lastOnlineSync: number;
  isOfflineMode: boolean;
}

export interface OfflineAuthResult {
  success: boolean;
  user?: UserProfile;
  error?: string;
  isOfflineMode?: boolean;
}

export class OfflineAuthService {
  private static readonly OFFLINE_CREDENTIALS_KEY = 'offline_credentials';
  private static readonly OFFLINE_SESSION_KEY = 'offline_session';
  private static readonly CREDENTIALS_EXPIRY = 90 * 24 * 60 * 60 * 1000; // 90 days

  /**
   * Enable offline authentication for a user
   * This should be called when user first logs in online
   */
  static async enableOfflineAuth(
    email: string, 
    password: string, 
    user: UserProfile
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentials: OfflineCredentials = {
        email,
        password,
        role: user.role,
        userId: user.id,
        lastOnlineSync: Date.now(),
        isOfflineMode: false
      };

      // Store credentials securely
      await SecureStore.setItemAsync(
        this.OFFLINE_CREDENTIALS_KEY, 
        JSON.stringify(credentials)
      );

      // Store user profile for offline access
      await AsyncStorage.setItem(
        this.OFFLINE_SESSION_KEY,
        JSON.stringify(user)
      );

      console.log('OfflineAuth: Offline authentication enabled for', email);
      return { success: true };
    } catch (error) {
      console.error('OfflineAuth: Failed to enable offline auth:', error);
      return { success: false, error: 'Failed to enable offline authentication' };
    }
  }

  /**
   * Attempt offline login
   */
  static async attemptOfflineLogin(): Promise<OfflineAuthResult> {
    try {
      // Check if we have stored credentials
      const credentialsData = await SecureStore.getItemAsync(this.OFFLINE_CREDENTIALS_KEY);
      if (!credentialsData) {
        return { success: false, error: 'No offline credentials found' };
      }

      const credentials: OfflineCredentials = JSON.parse(credentialsData);
      
      // Check if credentials are expired
      if (Date.now() - credentials.lastOnlineSync > this.CREDENTIALS_EXPIRY) {
        console.log('OfflineAuth: Credentials expired, clearing...');
        await this.clearOfflineAuth();
        return { success: false, error: 'Offline credentials expired' };
      }

      // Get stored user profile
      const userData = await AsyncStorage.getItem(this.OFFLINE_SESSION_KEY);
      if (!userData) {
        return { success: false, error: 'No offline user data found' };
      }

      const user: UserProfile = JSON.parse(userData);

      // Set user in AuthService
      AuthService.setCurrentUser(user);

      console.log('OfflineAuth: Offline login successful for', user.email);
      return { 
        success: true, 
        user, 
        isOfflineMode: true 
      };
    } catch (error) {
      console.error('OfflineAuth: Offline login failed:', error);
      return { success: false, error: 'Offline login failed' };
    }
  }

  /**
   * Login with offline-first approach
   * Tries online first, falls back to offline
   */
  static async login(
    email: string, 
    password: string, 
    rememberMe: boolean = true
  ): Promise<OfflineAuthResult> {
    try {
      // First try online login
      const isOnline = await NetworkService.isOnline();
      
      if (isOnline) {
        console.log('OfflineAuth: Attempting online login...');
        const onlineResult = await AuthService.login(email, password, rememberMe);
        
        if (onlineResult.success && onlineResult.user) {
          // Enable offline auth for future use
          await this.enableOfflineAuth(email, password, onlineResult.user);
          
          return {
            success: true,
            user: onlineResult.user,
            isOfflineMode: false
          };
        }
      }

      // Fall back to offline login
      console.log('OfflineAuth: Falling back to offline login...');
      return await this.attemptOfflineLogin();
    } catch (error) {
      console.error('OfflineAuth: Login error:', error);
      
      // Try offline as last resort
      return await this.attemptOfflineLogin();
    }
  }

  /**
   * Check if user is authenticated (online or offline)
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      // First check if we have a current user in memory
      const currentUser = AuthService.getCurrentUserFromMemory();
      if (currentUser) {
        return true;
      }

      // Check offline credentials
      const credentialsData = await SecureStore.getItemAsync(this.OFFLINE_CREDENTIALS_KEY);
      if (!credentialsData) {
        return false;
      }

      const credentials: OfflineCredentials = JSON.parse(credentialsData);
      
      // Check if credentials are expired
      if (Date.now() - credentials.lastOnlineSync > this.CREDENTIALS_EXPIRY) {
        await this.clearOfflineAuth();
        return false;
      }

      return true;
    } catch (error) {
      console.error('OfflineAuth: Authentication check failed:', error);
      return false;
    }
  }

  /**
   * Get current user (online or offline)
   */
  static async getCurrentUser(): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
    try {
      // First check memory
      const currentUser = AuthService.getCurrentUserFromMemory();
      if (currentUser) {
        return { success: true, user: currentUser };
      }

      // Check offline storage
      const userData = await AsyncStorage.getItem(this.OFFLINE_SESSION_KEY);
      if (userData) {
        const user: UserProfile = JSON.parse(userData);
        AuthService.setCurrentUser(user); // Set in memory for consistency
        return { success: true, user };
      }

      return { success: false, error: 'No user found' };
    } catch (error) {
      console.error('OfflineAuth: Get current user failed:', error);
      return { success: false, error: 'Failed to get current user' };
    }
  }

  /**
   * Logout and clear all authentication data
   */
  static async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      // Clear memory
      AuthService.clearCurrentUser();
      
      // Clear offline storage
      await this.clearOfflineAuth();
      
      console.log('OfflineAuth: Logout successful');
      return { success: true };
    } catch (error) {
      console.error('OfflineAuth: Logout failed:', error);
      return { success: false, error: 'Logout failed' };
    }
  }

  /**
   * Update offline credentials (called when user changes password online)
   */
  static async updateOfflineCredentials(
    email: string, 
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const credentialsData = await SecureStore.getItemAsync(this.OFFLINE_CREDENTIALS_KEY);
      if (!credentialsData) {
        return { success: false, error: 'No offline credentials to update' };
      }

      const credentials: OfflineCredentials = JSON.parse(credentialsData);
      credentials.email = email;
      credentials.password = password;
      credentials.lastOnlineSync = Date.now();

      await SecureStore.setItemAsync(
        this.OFFLINE_CREDENTIALS_KEY,
        JSON.stringify(credentials)
      );

      console.log('OfflineAuth: Credentials updated for', email);
      return { success: true };
    } catch (error) {
      console.error('OfflineAuth: Failed to update credentials:', error);
      return { success: false, error: 'Failed to update credentials' };
    }
  }

  /**
   * Check if offline authentication is available
   */
  static async hasOfflineAuth(): Promise<boolean> {
    try {
      const credentialsData = await SecureStore.getItemAsync(this.OFFLINE_CREDENTIALS_KEY);
      return !!credentialsData;
    } catch (error) {
      console.error('OfflineAuth: Failed to check offline auth:', error);
      return false;
    }
  }

  /**
   * Clear all offline authentication data
   */
  private static async clearOfflineAuth(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.OFFLINE_CREDENTIALS_KEY);
      await AsyncStorage.removeItem(this.OFFLINE_SESSION_KEY);
      console.log('OfflineAuth: Offline authentication data cleared');
    } catch (error) {
      console.error('OfflineAuth: Failed to clear offline auth:', error);
    }
  }

  /**
   * Sync offline data when coming back online
   */
  static async syncOfflineData(): Promise<{ success: boolean; error?: string }> {
    try {
      const isOnline = await NetworkService.isOnline();
      if (!isOnline) {
        return { success: false, error: 'Not online' };
      }

      // Update last online sync time
      const credentialsData = await SecureStore.getItemAsync(this.OFFLINE_CREDENTIALS_KEY);
      if (credentialsData) {
        const credentials: OfflineCredentials = JSON.parse(credentialsData);
        credentials.lastOnlineSync = Date.now();
        credentials.isOfflineMode = false;

        await SecureStore.setItemAsync(
          this.OFFLINE_CREDENTIALS_KEY,
          JSON.stringify(credentials)
        );
      }

      console.log('OfflineAuth: Offline data synced');
      return { success: true };
    } catch (error) {
      console.error('OfflineAuth: Failed to sync offline data:', error);
      return { success: false, error: 'Failed to sync offline data' };
    }
  }
}
