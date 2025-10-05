/**
 * Offline Sync Dialog
 * Handles sync conflicts when device comes back online
 */
import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface OfflineSyncDialogProps {
  visible: boolean
  hasLocalChanges: boolean
  hasServerChanges: boolean
  brochureTitle?: string
  onUploadLocal: () => void
  onDownloadServer: () => void
  onCancel: () => void
}

export default function OfflineSyncDialog({
  visible,
  hasLocalChanges,
  hasServerChanges,
  brochureTitle,
  onUploadLocal,
  onDownloadServer,
  onCancel
}: OfflineSyncDialogProps) {
  
  const getTitle = () => {
    if (hasLocalChanges && hasServerChanges) {
      return 'Sync Conflict Detected'
    } else if (hasLocalChanges) {
      return 'Upload Local Changes'
    } else if (hasServerChanges) {
      return 'Download Server Updates'
    }
    return 'Sync Options'
  }

  const getMessage = () => {
    if (hasLocalChanges && hasServerChanges) {
      return `You have local changes for "${brochureTitle}" and there are also newer changes on the server. What would you like to do?`
    } else if (hasLocalChanges) {
      return `You have local changes for "${brochureTitle}" that haven't been synced to the server. Would you like to upload them now?`
    } else if (hasServerChanges) {
      return `There are newer changes for "${brochureTitle}" on the server. Would you like to download them?`
    }
    return 'Choose your sync preference.'
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Ionicons 
              name={hasLocalChanges && hasServerChanges ? 'warning' : 'cloud-offline'} 
              size={32} 
              color={hasLocalChanges && hasServerChanges ? '#f59e0b' : '#8b5cf6'} 
            />
            <Text style={styles.title}>{getTitle()}</Text>
            <Text style={styles.message}>{getMessage()}</Text>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {hasLocalChanges && (
              <TouchableOpacity
                style={[styles.optionButton, styles.uploadButton]}
                onPress={onUploadLocal}
              >
                <Ionicons name="cloud-upload" size={20} color="#ffffff" />
                <Text style={styles.optionButtonText}>
                  Upload My Changes
                </Text>
                <Text style={styles.optionDescription}>
                  Send local changes to server
                </Text>
              </TouchableOpacity>
            )}

            {hasServerChanges && (
              <TouchableOpacity
                style={[styles.optionButton, styles.downloadButton]}
                onPress={onDownloadServer}
              >
                <Ionicons name="cloud-download" size={20} color="#ffffff" />
                <Text style={styles.optionButtonText}>
                  Download Server Version
                </Text>
                <Text style={styles.optionDescription}>
                  Get latest changes from server
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cancel */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
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
    maxWidth: 360,
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
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 12,
  },
  uploadButton: {
    backgroundColor: '#8b5cf6',
  },
  downloadButton: {
    backgroundColor: '#10b981',
  },
  optionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  optionDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
})

