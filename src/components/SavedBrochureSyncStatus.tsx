import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BrochureManagementService } from '../services/brochureManagementService'
import { AuthService } from '../services/AuthService'

interface SavedBrochureSyncStatusProps {
  brochureId: string
  brochureTitle: string
  onSyncComplete?: () => void
}

export default function SavedBrochureSyncStatus({
  brochureId,
  brochureTitle,
  onSyncComplete
}: SavedBrochureSyncStatusProps) {
  const [syncStatus, setSyncStatus] = useState<{
    hasServerChanges: boolean
    needsDownload: boolean
    serverLastModified?: string
  } | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    // Temporarily disabled to prevent sync loops
    // checkSyncStatus()
  }, [brochureId])

  const checkSyncStatus = async () => {
    try {
      setIsChecking(true)
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user || userResult.user.role !== 'mr') {
        return
      }

      // Get local brochure data to check last modified
      const localResult = await BrochureManagementService.getBrochureData(brochureId)
      const localLastModified = localResult.success && localResult.data 
        ? localResult.data.updatedAt 
        : undefined

      const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
        userResult.user.id,
        brochureId,
        localLastModified
      )

      if (statusResult.success && statusResult.data) {
        setSyncStatus(statusResult.data)
        
        // Auto-download if server has newer changes
        if (statusResult.data.needsDownload) {
          console.log('Auto-sync: Auto-downloading newer changes for saved brochure')
          await autoDownloadChanges(userResult.user.id)
        }
      }
    } catch (error) {
      console.error('Error checking sync status:', error)
    } finally {
      setIsChecking(false)
    }
  }

  const autoDownloadChanges = async (userId: string) => {
    try {
      setIsDownloading(true)
      console.log('Auto-sync: Downloading changes for saved brochure')

      const downloadResult = await BrochureManagementService.downloadBrochureChanges(
        userId,
        brochureId
      )

      if (downloadResult.success && downloadResult.data) {
        const applyResult = await BrochureManagementService.applyBrochureChanges(
          brochureId,
          downloadResult.data
        )

        if (applyResult.success) {
          console.log('Auto-sync: Saved brochure updated successfully')
          onSyncComplete?.()
          // Re-check status after applying changes
          await checkSyncStatus()
        } else {
          console.warn('Auto-sync: Failed to apply changes:', applyResult.error)
        }
      } else {
        console.warn('Auto-sync: Failed to download changes:', downloadResult.error)
      }
    } catch (error) {
      console.warn('Auto-sync: Download error:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDownloadChanges = async () => {
    try {
      setIsDownloading(true)
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user || userResult.user.role !== 'mr') {
        Alert.alert('Error', 'Please log in again')
        return
      }

      const downloadResult = await BrochureManagementService.downloadBrochureChanges(
        userResult.user.id,
        brochureId
      )

      if (downloadResult.success && downloadResult.data) {
        const applyResult = await BrochureManagementService.applyBrochureChanges(
          brochureId,
          downloadResult.data
        )

        if (applyResult.success) {
          Alert.alert(
            'Success',
            'Brochure changes downloaded successfully!',
            [
              {
                text: 'OK',
                onPress: () => {
                  onSyncComplete?.()
                  checkSyncStatus()
                }
              }
            ]
          )
        } else {
          Alert.alert('Error', applyResult.error || 'Failed to apply changes')
        }
      } else {
        Alert.alert('Error', downloadResult.error || 'Failed to download changes')
      }
    } catch (error) {
      console.error('Download error:', error)
      Alert.alert('Error', 'Failed to download brochure changes')
    } finally {
      setIsDownloading(false)
    }
  }

  // Show minimal indicator only when actively syncing
  if (isChecking || isDownloading) {
    return (
      <View style={styles.statusIndicator}>
        <ActivityIndicator size="small" color="#8b5cf6" />
        <Text style={styles.statusText}>
          {isDownloading ? 'Updating...' : 'Checking...'}
        </Text>
      </View>
    )
  }

  // Don't show anything when sync is complete
  return null
}

const styles = StyleSheet.create({
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 6,
  },
  statusText: {
    fontSize: 10,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fbbf24',
    marginTop: 4,
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  checkingText: {
    fontSize: 12,
    color: '#6b7280',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
  },
  downloadButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
