/**
 * Sync Status Indicator Component
 * Shows sync status for individual items in lists
 */
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'error';

interface SyncStatusIndicatorProps {
  status: SyncStatus;
  size?: number;
  onPress?: () => void;
  showOnlySynced?: boolean; // Only show indicator when not synced
}

export default function SyncStatusIndicator({ 
  status, 
  size = 16, 
  onPress,
  showOnlySynced = true 
}: SyncStatusIndicatorProps) {
  
  // Don't show anything for synced items if showOnlySynced is true
  if (showOnlySynced && status === 'synced') {
    return null;
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: 'cloud-upload-outline',
          color: '#ffa726',
          backgroundColor: '#fff3e0',
        };
      case 'synced':
        return {
          icon: 'checkmark-circle',
          color: '#4caf50',
          backgroundColor: '#e8f5e8',
        };
      case 'conflict':
        return {
          icon: 'warning',
          color: '#ff5722',
          backgroundColor: '#ffebee',
        };
      case 'error':
        return {
          icon: 'alert-circle',
          color: '#f44336',
          backgroundColor: '#ffebee',
        };
      default:
        return {
          icon: 'help-circle',
          color: '#9e9e9e',
          backgroundColor: '#f5f5f5',
        };
    }
  };

  const config = getStatusConfig();

  const IndicatorContent = (
    <View style={[
      styles.container, 
      { backgroundColor: config.backgroundColor }
    ]}>
      <Ionicons 
        name={config.icon as any} 
        size={size} 
        color={config.color} 
      />
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.touchable}>
        {IndicatorContent}
      </TouchableOpacity>
    );
  }

  return IndicatorContent;
}

const styles = StyleSheet.create({
  container: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  touchable: {
    // Add some padding for better touch target
    padding: 4,
  },
});