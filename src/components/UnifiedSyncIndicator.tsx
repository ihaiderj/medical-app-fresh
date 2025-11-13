/**
 * Unified Sync Indicator Component
 * Top banner showing sync status with activity detection
 * Non-intrusive sync indicator that appears only when needed
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UnifiedSyncService, UnifiedSyncStatus, ActivityDetection } from '../services/unifiedSyncService';

interface UnifiedSyncIndicatorProps {
  onPress?: () => void;
  showActivityIndicator?: boolean;
}

const { width: screenWidth } = Dimensions.get('window');

export default function UnifiedSyncIndicator({ 
  onPress, 
  showActivityIndicator = true 
}: UnifiedSyncIndicatorProps) {
  const [syncStatus, setSyncStatus] = useState<UnifiedSyncStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncTime: 0,
    pendingOperations: 0,
    failedOperations: 0,
    hasConflicts: false,
    syncProgress: 100,
  });

  const [activity, setActivity] = useState<ActivityDetection>({
    isActive: true,
    lastActivityTime: Date.now(),
    idleTime: 0,
    shouldSync: false,
  });

  const [slideAnim] = useState(new Animated.Value(-100));
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    // Subscribe to sync status changes
    const unsubscribeSync = UnifiedSyncService.subscribeToSyncStatus(setSyncStatus);
    
    // Subscribe to activity changes
    const unsubscribeActivity = UnifiedSyncService.subscribeToActivity(setActivity);

    // Initial status load
    UnifiedSyncService.getSyncStatus().then(setSyncStatus);

    return () => {
      unsubscribeSync();
      unsubscribeActivity();
    };
  }, []);

  // Show/hide indicator based on status
  useEffect(() => {
    const shouldShow = shouldShowIndicator();
    
    if (shouldShow) {
      showIndicator();
    } else {
      hideIndicator();
    }
  }, [syncStatus, activity]);

  // Pulse animation for syncing
  useEffect(() => {
    if (syncStatus.isSyncing) {
      startPulseAnimation();
    } else {
      stopPulseAnimation();
    }
  }, [syncStatus.isSyncing]);

  const shouldShowIndicator = (): boolean => {
    // Only show if there are actual sync failures that need user attention
    if (syncStatus.failedOperations > 0) {
      return true;
    }

    // Don't show for normal operations
    return false;
  };

  const showIndicator = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const hideIndicator = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const startPulseAnimation = () => {
    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (syncStatus.isSyncing) {
          pulse();
        }
      });
    };
    pulse();
  };

  const stopPulseAnimation = () => {
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Default action: force sync
      UnifiedSyncService.forceSync();
    }
  };

  const getStatusConfig = () => {
    if (!syncStatus.isOnline) {
      return {
        icon: 'cloud-offline',
        color: '#ff6b6b',
        backgroundColor: '#ffebee',
        text: 'Offline Mode',
        subtext: 'Changes will sync when online',
      };
    }

    if (syncStatus.isSyncing) {
      return {
        icon: 'sync',
        color: '#4ecdc4',
        backgroundColor: '#e8f5f5',
        text: 'Syncing...',
        subtext: syncStatus.currentOperation || 'Updating data',
      };
    }

    if (syncStatus.failedOperations > 0) {
      return {
        icon: 'warning',
        color: '#ff5722',
        backgroundColor: '#ffebee',
        text: `${syncStatus.failedOperations} sync failed`,
        subtext: 'Tap to retry',
      };
    }

    if (syncStatus.pendingOperations > 0) {
      return {
        icon: 'cloud-upload-outline',
        color: '#ffa726',
        backgroundColor: '#fff3e0',
        text: `${syncStatus.pendingOperations} pending sync`,
        subtext: 'Will sync automatically',
      };
    }

    if (activity.shouldSync && showActivityIndicator) {
      return {
        icon: 'time-outline',
        color: '#9e9e9e',
        backgroundColor: '#f5f5f5',
        text: 'Idle sync ready',
        subtext: 'Will sync when idle',
      };
    }

    return null;
  };

  const config = getStatusConfig();
  if (!config) {
    return null;
  }

  return (
    <Animated.View 
      style={[
        styles.container,
        { 
          backgroundColor: config.backgroundColor,
          transform: [{ translateY: slideAnim }],
        }
      ]}
    >
      <TouchableOpacity 
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <Animated.View 
          style={[
            styles.iconContainer,
            { transform: [{ scale: pulseAnim }] }
          ]}
        >
          <Ionicons 
            name={config.icon as any} 
            size={20} 
            color={config.color}
          />
        </Animated.View>

        <View style={styles.textContainer}>
          <Text style={[styles.text, { color: config.color }]}>
            {config.text}
          </Text>
          <Text style={[styles.subtext, { color: config.color }]}>
            {config.subtext}
          </Text>
        </View>

        {/* Progress bar for syncing */}
        {syncStatus.isSyncing && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <Animated.View 
                style={[
                  styles.progressFill,
                  { 
                    width: `${syncStatus.syncProgress}%`,
                    backgroundColor: config.color,
                  }
                ]}
              />
            </View>
          </View>
        )}

        {/* Action indicator */}
        <Ionicons 
          name="chevron-forward" 
          size={16} 
          color={config.color}
          style={styles.chevron}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 44, // Account for status bar
    minHeight: 60,
  },
  iconContainer: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtext: {
    fontSize: 12,
    opacity: 0.8,
  },
  progressContainer: {
    marginLeft: 12,
    width: 60,
  },
  progressBar: {
    height: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  chevron: {
    marginLeft: 8,
    opacity: 0.6,
  },
});
