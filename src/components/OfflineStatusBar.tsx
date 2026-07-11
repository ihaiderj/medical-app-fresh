/**
 * Offline Status Bar Component
 * Shows network status and sync information
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NetworkService, NetworkState } from '../services/networkService';
import { OfflineFirstService } from '../services/offlineFirstService';
// import { AdvancedSyncService } from '../services/advancedSyncService'; // DELETED
import { useAppData } from '../context/AppDataContext';
import { AuthService } from '../services/AuthService';
import { SyncService } from '../services/SyncService';

interface OfflineStatusBarProps {
  onSyncPress?: () => void;
  showSyncStats?: boolean;
}

// This will be defined inside the component to access context

export default function OfflineStatusBar({ onSyncPress, showSyncStats = true }: OfflineStatusBarProps) {
  const { user } = useAppData(); // Get user from context
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: false,
    type: 'unknown',
    isInternetReachable: false
  });
  const [syncStats, setSyncStats] = useState({ pending: 0, failed: 0, unbackedUp: 0 });

  const defaultSyncHandler = React.useCallback(async () => {
    try {
      console.log('OfflineStatusBar: Manual sync triggered');
      console.log('OfflineStatusBar: Current user from context:', user?.id);
      
      // Use userId from context or AuthService fallback
      let userId = user?.id;
      if (!userId) {
        console.log('OfflineStatusBar: User not in context, trying AuthService...');
        const userResult = await AuthService.getCurrentUser();
        if (userResult.success && userResult.user) {
          userId = userResult.user.id;
          console.log('OfflineStatusBar: Got userId from AuthService:', userId);
        }
      }
      
      if (!userId) {
        console.error('OfflineStatusBar: No user ID available for sync');
        Alert.alert('Error', 'Please log in to sync data');
        return;
      }
      
      console.log('OfflineStatusBar: Starting sync with userId:', userId);
      const result = await SyncService.syncUpFull();
      console.log('OfflineStatusBar: Sync result:', result);
      
      if (!result.success && result.errors && result.errors.length > 0) {
        console.error('OfflineStatusBar: Sync errors:', result.errors);
      }
    } catch (error) {
      console.error('OfflineStatusBar: Sync failed:', error);
      Alert.alert('Sync Error', error instanceof Error ? error.message : 'Failed to sync');
    }
  }, [user]);

  useEffect(() => {
    // Get initial network state
    setNetworkState(NetworkService.getCurrentState());

    // Listen for network changes
    const unsubscribe = NetworkService.addListener((state) => {
      setNetworkState(state);
    });

    // Load sync stats if enabled
    if (showSyncStats) {
      loadSyncStats();
      
      // Refresh sync stats every 30 seconds
      const statsInterval = setInterval(loadSyncStats, 30000);
      
      return () => {
        unsubscribe();
        clearInterval(statsInterval);
      };
    }

    return unsubscribe;
  }, [showSyncStats]);

  const loadSyncStats = async () => {
    try {
      const result = await OfflineFirstService.getSyncStats();
      if (result.success && result.data) {
        setSyncStats(result.data);
      }
    } catch (error) {
      console.error('Failed to load sync stats:', error);
    }
  };

  const isOnline = networkState.isConnected && networkState.isInternetReachable;
  const needsBackup = (syncStats.unbackedUp ?? syncStats.pending) > 0;
  const hasFailedSync = syncStats.failed > 0;

  if (isOnline && !needsBackup && !hasFailedSync) {
    // Don't show status bar when everything is normal
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Network Status */}
      {!isOnline && (
        <View style={styles.statusItem}>
          <Ionicons name="cloud-offline" size={16} color="#ff6b6b" />
          <Text style={styles.offlineText}>Offline Mode</Text>
        </View>
      )}

      {/* Sync Status */}
      {showSyncStats && (needsBackup || hasFailedSync) && (
        <TouchableOpacity 
          style={styles.statusItem} 
          onPress={onSyncPress || defaultSyncHandler}
        >
          {needsBackup && (
            <>
              <Ionicons 
                name={isOnline ? "sync" : "cloud-upload-outline"} 
                size={16} 
                color={isOnline ? "#4ecdc4" : "#ffa726"} 
              />
              <Text style={[styles.syncText, { color: isOnline ? "#4ecdc4" : "#ffa726" }]}>
                {syncStats.unbackedUp ?? syncStats.pending} need backup
              </Text>
            </>
          )}
          
          {hasFailedSync && (
            <>
              <Ionicons name="warning" size={16} color="#ff5722" />
              <Text style={[styles.syncText, { color: "#ff5722" }]}>
                {syncStats.failed} failed
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Connection Type */}
      {isOnline && networkState.type && (
        <View style={styles.connectionType}>
          <Text style={styles.connectionText}>
            {networkState.type.toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    justifyContent: 'space-between',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginHorizontal: 4,
  },
  offlineText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#ff6b6b',
  },
  syncText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  connectionType: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#e9ecef',
  },
  connectionText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#6c757d',
  },
});
