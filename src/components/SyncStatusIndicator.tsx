/**
 * Sync Status Indicator
 * Shows sync progress and status in corner of screen
 */
import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SmartSyncService, SyncStatus } from '../services/smartSyncService'

interface SyncStatusIndicatorProps {
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left'
}

export default function SyncStatusIndicator({ 
  position = 'top-right' 
}: SyncStatusIndicatorProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncTime: 0,
    pendingOperations: 0,
    hasConflicts: false
  })
  const [isVisible, setIsVisible] = useState(false)
  const fadeAnim = useState(new Animated.Value(0))[0]

  useEffect(() => {
    // Listen for sync status updates
    const handleStatusUpdate = (status: SyncStatus) => {
      setSyncStatus(status)
      
      // Show indicator when syncing or when there are pending operations
      const shouldShow = status.isSyncing || status.pendingOperations > 0 || !status.isOnline
      
      if (shouldShow !== isVisible) {
        setIsVisible(shouldShow)
        
        Animated.timing(fadeAnim, {
          toValue: shouldShow ? 1 : 0,
          duration: 300,
          useNativeDriver: true,
        }).start()
      }
    }

    SmartSyncService.addStatusListener(handleStatusUpdate)

    return () => {
      SmartSyncService.removeStatusListener(handleStatusUpdate)
    }
  }, [isVisible, fadeAnim])

  const getStatusText = () => {
    if (!syncStatus.isOnline) {
      return 'Offline'
    } else if (syncStatus.isSyncing) {
      return 'Syncing...'
    } else if (syncStatus.pendingOperations > 0) {
      return `${syncStatus.pendingOperations} pending`
    }
    return 'Synced'
  }

  const getStatusIcon = () => {
    if (!syncStatus.isOnline) {
      return 'cloud-offline'
    } else if (syncStatus.isSyncing) {
      return null // Will show activity indicator
    } else if (syncStatus.pendingOperations > 0) {
      return 'cloud-upload'
    }
    return 'cloud-done'
  }

  const getStatusColor = () => {
    if (!syncStatus.isOnline) {
      return '#ef4444'
    } else if (syncStatus.isSyncing) {
      return '#8b5cf6'
    } else if (syncStatus.pendingOperations > 0) {
      return '#f59e0b'
    }
    return '#10b981'
  }

  if (!isVisible) {
    return null
  }

  return (
    <Animated.View 
      style={[
        styles.container,
        styles[position],
        { opacity: fadeAnim }
      ]}
    >
      <View style={[styles.indicator, { borderColor: getStatusColor() }]}>
        {syncStatus.isSyncing ? (
          <ActivityIndicator size="small" color={getStatusColor()} />
        ) : (
          <Ionicons 
            name={getStatusIcon() as any} 
            size={14} 
            color={getStatusColor()} 
          />
        )}
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1000,
  },
  'top-right': {
    top: 50,
    right: 16,
  },
  'bottom-right': {
    bottom: 80,
    right: 16,
  },
  'top-left': {
    top: 50,
    left: 16,
  },
  'bottom-left': {
    bottom: 80,
    left: 16,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
})
