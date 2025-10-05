/**
 * Login Sync Screen
 * Shows sync progress during login process
 */
import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface LoginSyncScreenProps {
  visible: boolean
  onSyncComplete: () => void
  onSyncError: (error: string) => void
  syncProgress: {
    step: string
    message: string
    progress: number
  }
}

export default function LoginSyncScreen({
  visible,
  onSyncComplete,
  onSyncError,
  syncProgress
}: LoginSyncScreenProps) {
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (syncProgress.progress >= 100) {
      // Small delay before completing to show 100%
      setTimeout(() => {
        onSyncComplete()
      }, 500)
    }
  }, [syncProgress.progress, onSyncComplete])

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="cloud-download" size={32} color="#8b5cf6" />
            <Text style={styles.title}>Syncing Your Account</Text>
            <Text style={styles.subtitle}>
              Please wait while we sync your data across devices
            </Text>
          </View>

          {/* Progress Section */}
          <View style={styles.progressSection}>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${syncProgress.progress}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round(syncProgress.progress)}%
              </Text>
            </View>

            <View style={styles.statusContainer}>
              <ActivityIndicator size="small" color="#8b5cf6" />
              <Text style={styles.currentStep}>
                {syncProgress.step}
              </Text>
            </View>

            <Text style={styles.statusMessage}>
              {syncProgress.message}
            </Text>
          </View>

          {/* Details Section */}
          <View style={styles.detailsSection}>
            <Text style={styles.detailsText}>
              🔄 Checking saved brochures{'\n'}
              📥 Downloading latest changes{'\n'}
              📱 Preparing cross-device experience
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    margin: 20,
    maxWidth: 320,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 12,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  progressSection: {
    marginBottom: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
    minWidth: 40,
    textAlign: 'right',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  currentStep: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  statusMessage: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  detailsSection: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  detailsText: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
})

