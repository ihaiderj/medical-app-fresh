/**
 * Sync Test Panel Component
 * A debugging panel to test sync functionality
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdvancedSyncService, SyncStatus } from '../services/advancedSyncService';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { NetworkService } from '../services/networkService';

export default function SyncTestPanel() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: false,
    isSyncing: false,
    lastSyncTime: 0,
    pendingOperations: 0,
    hasConflicts: false
  });
  const [isVisible, setIsVisible] = useState(false);
  const [manualOfflineMode, setManualOfflineMode] = useState(false);

  useEffect(() => {
    loadSyncStatus();
    
    // Listen for sync status changes
    const unsubscribe = AdvancedSyncService.addStatusListener((status) => {
      setSyncStatus(status);
    });

    return unsubscribe;
  }, []);

  const loadSyncStatus = async () => {
    const status = await AdvancedSyncService.getSyncStatus();
    setSyncStatus(status);
  };

  const handleForceSync = async () => {
    try {
      Alert.alert('Sync Started', 'Manual sync initiated...');
      const result = await AdvancedSyncService.forceSyncNow();
      
      const message = result.success 
        ? `Sync completed!\n✅ Synced: ${result.syncedOperations}\n❌ Failed: ${result.failedOperations}\n⚠️ Conflicts: ${result.conflicts.length}`
        : `Sync failed!\nErrors: ${result.errors.join(', ')}`;
        
      Alert.alert('Sync Result', message);
    } catch (error) {
      Alert.alert('Sync Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleClearQueue = async () => {
    Alert.alert(
      'Clear Sync Queue',
      'Are you sure you want to clear all pending sync operations? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await LocalDatabaseService.clearCompletedOperations();
              Alert.alert('Success', 'Sync queue cleared');
              loadSyncStatus();
            } catch (error) {
              Alert.alert('Error', 'Failed to clear sync queue');
            }
          }
        }
      ]
    );
  };

  const formatLastSync = (timestamp: number) => {
    if (timestamp === 0) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (!isVisible) {
    return (
      <TouchableOpacity 
        style={styles.toggleButton} 
        onPress={() => setIsVisible(true)}
      >
        <Ionicons name="bug" size={16} color="#8b5cf6" />
        <Text style={styles.toggleText}>Sync Debug</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Sync Debug Panel</Text>
        <TouchableOpacity onPress={() => setIsVisible(false)}>
          <Ionicons name="close" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Network Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Network Status</Text>
          <View style={styles.statusRow}>
            <Ionicons 
              name={syncStatus.isOnline ? "wifi" : "wifi-off"} 
              size={16} 
              color={syncStatus.isOnline ? "#10b981" : "#ef4444"} 
            />
            <Text style={styles.statusText}>
              {syncStatus.isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* Sync Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync Status</Text>
          <View style={styles.statusRow}>
            <Ionicons 
              name={syncStatus.isSyncing ? "sync" : "checkmark-circle"} 
              size={16} 
              color={syncStatus.isSyncing ? "#f59e0b" : "#10b981"} 
            />
            <Text style={styles.statusText}>
              {syncStatus.isSyncing ? 'Syncing...' : 'Idle'}
            </Text>
          </View>
          <Text style={styles.detailText}>
            Last sync: {formatLastSync(syncStatus.lastSyncTime)}
          </Text>
        </View>

        {/* Queue Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Queue Status</Text>
          <View style={styles.statusRow}>
            <Ionicons name="list" size={16} color="#6b7280" />
            <Text style={styles.statusText}>
              {syncStatus.pendingOperations} pending operations
            </Text>
          </View>
          {syncStatus.hasConflicts && (
            <View style={styles.statusRow}>
              <Ionicons name="warning" size={16} color="#ef4444" />
              <Text style={[styles.statusText, { color: '#ef4444' }]}>
                Has conflicts
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#8b5cf6' }]}
            onPress={handleForceSync}
            disabled={syncStatus.isSyncing || !syncStatus.isOnline}
          >
            <Ionicons name="sync" size={16} color="#ffffff" />
            <Text style={styles.actionButtonText}>Force Sync Now</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#ef4444' }]}
            onPress={handleClearQueue}
          >
            <Ionicons name="trash" size={16} color="#ffffff" />
            <Text style={styles.actionButtonText}>Clear Queue</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: '#6b7280' }]}
            onPress={loadSyncStatus}
          >
            <Ionicons name="refresh" size={16} color="#ffffff" />
            <Text style={styles.actionButtonText}>Refresh Status</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleButton: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
  },
  toggleText: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  panel: {
    position: 'absolute',
    top: 100,
    right: 20,
    width: 280,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
    maxHeight: 400,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  content: {
    maxHeight: 320,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 13,
    color: '#6b7280',
  },
  detailText: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
});
