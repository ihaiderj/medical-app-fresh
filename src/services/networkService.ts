/**
 * Network Service
 * Handles network connectivity detection and monitoring
 */
import NetInfo from '@react-native-community/netinfo';

export interface NetworkState {
  isConnected: boolean;
  type: string;
  isInternetReachable: boolean;
}

export class NetworkService {
  private static listeners: ((state: NetworkState) => void)[] = [];
  private static currentState: NetworkState = {
    isConnected: false,
    type: 'unknown',
    isInternetReachable: false
  };

  /** NetInfo often reports null for isInternetReachable on Android while connected */
  private static isReachable(isInternetReachable: boolean | null | undefined): boolean {
    return isInternetReachable !== false;
  }

  private static isOnlineState(state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }): boolean {
    return (state.isConnected ?? false) && this.isReachable(state.isInternetReachable);
  }

  /**
   * Initialize network monitoring
   */
  static async initialize(): Promise<void> {
    try {
      // Get initial network state
      const state = await NetInfo.fetch();
      this.currentState = {
        isConnected: state.isConnected ?? false,
        type: state.type,
        isInternetReachable: this.isReachable(state.isInternetReachable)
      };

      // Set up network state listener
      NetInfo.addEventListener(state => {
        const newState: NetworkState = {
          isConnected: state.isConnected ?? false,
          type: state.type,
          isInternetReachable: this.isReachable(state.isInternetReachable)
        };

        const wasOnline = this.isOnlineState(this.currentState);
        const isNowOnline = this.isOnlineState(newState);

        this.currentState = newState;

        // Notify listeners
        this.listeners.forEach(listener => listener(newState));

        // Log network changes
        if (wasOnline !== isNowOnline) {
          console.log('Network: Connection changed -', isNowOnline ? 'ONLINE' : 'OFFLINE');
        }
      });

      console.log('Network: Service initialized -', this.currentState.isConnected ? 'ONLINE' : 'OFFLINE');
    } catch (error) {
      console.error('Network: Failed to initialize service:', error);
    }
  }

  /**
   * Check if device is online
   */
  static async isOnline(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return this.isOnlineState(state);
    } catch (error) {
      console.error('Network: Failed to check online status:', error);
      return false;
    }
  }

  /**
   * Get current network state
   */
  static getCurrentState(): NetworkState {
    return { ...this.currentState };
  }

  /**
   * Add network state listener
   */
  static addListener(listener: (state: NetworkState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Remove all listeners
   */
  static removeAllListeners(): void {
    this.listeners = [];
  }

  /**
   * Wait for network connection
   */
  static async waitForConnection(timeoutMs: number = 30000): Promise<boolean> {
    return new Promise((resolve) => {
      // Check if already online
      if (this.isOnlineState(this.currentState)) {
        resolve(true);
        return;
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        resolve(false);
      }, timeoutMs);

      // Listen for connection
      const unsubscribe = this.addListener((state) => {
        if (this.isOnlineState(state)) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  /**
   * Test internet connectivity by pinging a reliable server
   */
  static async testConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://www.google.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache'
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.log('Network: Connectivity test failed:', error);
      return false;
    }
  }
}
