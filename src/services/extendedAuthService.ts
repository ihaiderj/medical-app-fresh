/**
 * Extended Authentication Service
 * Provides extended offline authentication capabilities
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AuthService } from './AuthService';
import { NetworkService } from './networkService';

export interface ExtendedSession {
  userId: string;
  email: string;
  role: 'admin' | 'mr';
  fullName: string;
  createdAt: number;
  expiresAt: number;
  lastOnlineSync: number;
  offlineMode: boolean;
  deviceId: string;
}

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    role: 'admin' | 'mr';
    full_name: string;
  };
  error?: string;
  isOfflineAuth?: boolean;
}

export class ExtendedAuthService {
  private static readonly EXTENDED_SESSION_KEY = 'extended_offline_session';
  private static readonly OFFLINE_SESSION_DURATION = 90 * 24 * 60 * 60 * 1000; // 90 days
  private static readonly WARNING_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days before expiry

  /**
   * Enable extended offline mode for current user
   */
  static async enableExtendedOfflineMode(password?: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('ExtendedAuth: Enabling extended offline mode...');

      // Get current user
      const userResult = await AuthService.getCurrentUser();
      if (!userResult.success || !userResult.user) {
        return { success: false, error: 'No authenticated user found' };
      }

      // Verify credentials if password provided
      if (password) {
        console.log('ExtendedAuth: Verifying credentials...');
        const authResult = await AuthService.login(userResult.user.email, password);
        if (!authResult.success) {
          return { success: false, error: 'Invalid credentials' };
        }
      }

      // Create extended session
      const deviceId = await this.getOrCreateDeviceId();
      const now = Date.now();
      
      const extendedSession: ExtendedSession = {
        userId: userResult.user.id,
        email: userResult.user.email,
        role: userResult.user.role,
        fullName: userResult.user.full_name || '',
        createdAt: now,
        expiresAt: now + this.OFFLINE_SESSION_DURATION,
        lastOnlineSync: now,
        offlineMode: true,
        deviceId
      };

      // Store extended session securely
      await SecureStore.setItemAsync(this.EXTENDED_SESSION_KEY, JSON.stringify(extendedSession));
      
      // Also store in AsyncStorage as backup (less secure but more reliable)
      await AsyncStorage.setItem(`${this.EXTENDED_SESSION_KEY}_backup`, JSON.stringify(extendedSession));

      console.log('ExtendedAuth: Extended offline mode enabled for 90 days');
      return { success: true };

    } catch (error) {
      console.error('ExtendedAuth: Failed to enable extended offline mode:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to enable offline mode' 
      };
    }
  }

  /**
   * Attempt authentication (online first, offline fallback)
   */
  static async authenticate(email: string, password: string): Promise<AuthResult> {
    try {
      console.log('ExtendedAuth: Attempting authentication...');

      // Try online authentication first
      if (await NetworkService.isOnline()) {
        console.log('ExtendedAuth: Online - attempting server authentication');
        const onlineResult = await AuthService.login(email, password);
        
        if (onlineResult.success && onlineResult.user) {
          // Enable extended offline mode automatically on successful online login
          await this.enableExtendedOfflineMode();
          
          return {
            success: true,
            user: onlineResult.user,
            isOfflineAuth: false
          };
        }
      }

      // Fallback to offline authentication
      console.log('ExtendedAuth: Attempting offline authentication');
      return await this.authenticateOffline(email, password);

    } catch (error) {
      console.error('ExtendedAuth: Authentication error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    }
  }

  /**
   * Authenticate using offline session
   */
  static async authenticateOffline(email: string, password: string): Promise<AuthResult> {
    try {
      const session = await this.getExtendedSession();
      
      if (!session) {
        return { success: false, error: 'No offline session available' };
      }

      // Check if session is expired
      if (Date.now() > session.expiresAt) {
        await this.clearExtendedSession();
        return { success: false, error: 'Offline session expired' };
      }

      // Verify email matches
      if (session.email.toLowerCase() !== email.toLowerCase()) {
        return { success: false, error: 'Email does not match offline session' };
      }

      // For offline auth, we'll use a simple password verification
      // In a production app, you'd store a hashed password or use biometric auth
      const storedPasswordHash = await SecureStore.getItemAsync(`password_hash_${session.userId}`);
      if (storedPasswordHash) {
        const passwordHash = await this.hashPassword(password);
        if (passwordHash !== storedPasswordHash) {
          return { success: false, error: 'Invalid password' };
        }
      } else {
        // First time offline auth - store password hash
        const passwordHash = await this.hashPassword(password);
        await SecureStore.setItemAsync(`password_hash_${session.userId}`, passwordHash);
      }

      // Update last access time
      session.lastOnlineSync = Date.now();
      await SecureStore.setItemAsync(this.EXTENDED_SESSION_KEY, JSON.stringify(session));

      console.log('ExtendedAuth: Offline authentication successful');
      return {
        success: true,
        user: {
          id: session.userId,
          email: session.email,
          role: session.role,
          full_name: session.fullName
        },
        isOfflineAuth: true
      };

    } catch (error) {
      console.error('ExtendedAuth: Offline authentication error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Offline authentication failed'
      };
    }
  }

  /**
   * Check if user has valid offline session
   */
  static async hasValidOfflineSession(): Promise<boolean> {
    try {
      const session = await this.getExtendedSession();
      return session !== null && Date.now() < session.expiresAt;
    } catch (error) {
      console.error('ExtendedAuth: Error checking offline session:', error);
      return false;
    }
  }

  /**
   * Get current extended session
   */
  static async getExtendedSession(): Promise<ExtendedSession | null> {
    try {
      // Try SecureStore first
      let sessionData = await SecureStore.getItemAsync(this.EXTENDED_SESSION_KEY);
      
      // Fallback to AsyncStorage backup
      if (!sessionData) {
        sessionData = await AsyncStorage.getItem(`${this.EXTENDED_SESSION_KEY}_backup`);
      }

      if (!sessionData) {
        return null;
      }

      const session: ExtendedSession = JSON.parse(sessionData);
      
      // Validate session structure
      if (!session.userId || !session.email || !session.expiresAt) {
        console.warn('ExtendedAuth: Invalid session structure, clearing...');
        await this.clearExtendedSession();
        return null;
      }

      return session;
    } catch (error) {
      console.error('ExtendedAuth: Error getting extended session:', error);
      return null;
    }
  }

  /**
   * Get session expiry warning
   */
  static async getSessionExpiryWarning(): Promise<{ hasWarning: boolean; daysLeft: number; message?: string }> {
    try {
      const session = await this.getExtendedSession();
      
      if (!session) {
        return { hasWarning: false, daysLeft: 0 };
      }

      const now = Date.now();
      const timeLeft = session.expiresAt - now;
      const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));

      if (timeLeft <= this.WARNING_THRESHOLD) {
        return {
          hasWarning: true,
          daysLeft,
          message: `Your offline session will expire in ${daysLeft} days. Please connect to the internet to renew.`
        };
      }

      return { hasWarning: false, daysLeft };
    } catch (error) {
      console.error('ExtendedAuth: Error checking session expiry:', error);
      return { hasWarning: false, daysLeft: 0 };
    }
  }

  /**
   * Renew extended session (requires online connection)
   */
  static async renewExtendedSession(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!(await NetworkService.isOnline())) {
        return { success: false, error: 'Internet connection required to renew session' };
      }

      const session = await this.getExtendedSession();
      if (!session) {
        return { success: false, error: 'No session to renew' };
      }

      // Verify current session with server
      const userResult = await AuthService.getCurrentUser();
      if (!userResult.success) {
        return { success: false, error: 'Unable to verify current session' };
      }

      // Extend the session
      const now = Date.now();
      session.expiresAt = now + this.OFFLINE_SESSION_DURATION;
      session.lastOnlineSync = now;

      await SecureStore.setItemAsync(this.EXTENDED_SESSION_KEY, JSON.stringify(session));
      await AsyncStorage.setItem(`${this.EXTENDED_SESSION_KEY}_backup`, JSON.stringify(session));

      console.log('ExtendedAuth: Session renewed for another 90 days');
      return { success: true };

    } catch (error) {
      console.error('ExtendedAuth: Error renewing session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to renew session'
      };
    }
  }

  /**
   * Clear extended session
   */
  static async clearExtendedSession(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(this.EXTENDED_SESSION_KEY);
      await AsyncStorage.removeItem(`${this.EXTENDED_SESSION_KEY}_backup`);
      console.log('ExtendedAuth: Extended session cleared');
    } catch (error) {
      console.error('ExtendedAuth: Error clearing extended session:', error);
    }
  }

  /**
   * Get or create device ID
   */
  private static async getOrCreateDeviceId(): Promise<string> {
    try {
      let deviceId = await AsyncStorage.getItem('device_id');
      
      if (!deviceId) {
        // Generate a simple device ID
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem('device_id', deviceId);
      }

      return deviceId;
    } catch (error) {
      console.error('ExtendedAuth: Error with device ID:', error);
      return `fallback_${Date.now()}`;
    }
  }

  /**
   * Simple password hashing (for offline verification)
   */
  private static async hashPassword(password: string): Promise<string> {
    // This is a simple hash for demo purposes
    // In production, use a proper cryptographic hash function
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Check if current authentication is offline
   */
  static async isOfflineAuthentication(): Promise<boolean> {
    try {
      const session = await this.getExtendedSession();
      return session !== null && session.offlineMode;
    } catch (error) {
      return false;
    }
  }
}
