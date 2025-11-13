/**
 * Offline Session Warning Component
 * Shows warnings about offline session expiry
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExtendedAuthService } from '../services/extendedAuthService';
import { NetworkService } from '../services/networkService';

export default function OfflineSessionWarning() {
  const [warning, setWarning] = useState<{ hasWarning: boolean; daysLeft: number; message?: string }>({
    hasWarning: false,
    daysLeft: 0
  });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    checkSessionExpiry();
    
    // Check every hour
    const interval = setInterval(checkSessionExpiry, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const checkSessionExpiry = async () => {
    try {
      const warningInfo = await ExtendedAuthService.getSessionExpiryWarning();
      setWarning(warningInfo);
      setIsVisible(warningInfo.hasWarning);
    } catch (error) {
      console.error('OfflineSessionWarning: Error checking session expiry:', error);
    }
  };

  const handleRenewSession = async () => {
    try {
      if (!(await NetworkService.isOnline())) {
        Alert.alert(
          'Internet Required',
          'Please connect to the internet to renew your offline session.',
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await ExtendedAuthService.renewExtendedSession();
      
      if (result.success) {
        Alert.alert(
          'Session Renewed',
          'Your offline session has been renewed for another 90 days.',
          [{ text: 'OK' }]
        );
        setIsVisible(false);
        checkSessionExpiry(); // Refresh warning status
      } else {
        Alert.alert(
          'Renewal Failed',
          result.error || 'Failed to renew session. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        'An error occurred while renewing your session.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    // Show again in 24 hours
    setTimeout(() => {
      checkSessionExpiry();
    }, 24 * 60 * 60 * 1000);
  };

  if (!isVisible || !warning.hasWarning) {
    return null;
  }

  const getWarningColor = () => {
    if (warning.daysLeft <= 1) return '#ef4444'; // Red
    if (warning.daysLeft <= 3) return '#f59e0b'; // Orange
    return '#eab308'; // Yellow
  };

  const getWarningIcon = () => {
    if (warning.daysLeft <= 1) return 'warning';
    if (warning.daysLeft <= 3) return 'alert-circle';
    return 'information-circle';
  };

  return (
    <View style={[styles.container, { backgroundColor: `${getWarningColor()}20` }]}>
      <View style={styles.content}>
        <Ionicons 
          name={getWarningIcon()} 
          size={20} 
          color={getWarningColor()} 
          style={styles.icon}
        />
        
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {warning.daysLeft <= 1 ? 'Session Expiring Soon' : 'Session Renewal Available'}
          </Text>
          <Text style={styles.message}>
            {warning.message}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.button, styles.renewButton, { backgroundColor: getWarningColor() }]}
          onPress={handleRenewSession}
        >
          <Text style={styles.renewButtonText}>Renew Now</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.dismissButton]}
          onPress={handleDismiss}
        >
          <Text style={styles.dismissButtonText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  icon: {
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renewButton: {
    flex: 1,
  },
  renewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  dismissButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
});
