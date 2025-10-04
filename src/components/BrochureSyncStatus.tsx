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

interface BrochureSyncStatusProps {
  brochureId: string
  brochureTitle: string
  localLastModified?: string
  onSyncComplete?: () => void
}

export default function BrochureSyncStatus({
  brochureId,
  brochureTitle,
  localLastModified,
  onSyncComplete
}: BrochureSyncStatusProps) {
  const [syncStatus, setSyncStatus] = useState<{
    hasServerChanges: boolean
    needsDownload: boolean
    serverLastModified?: string
    localLastModified?: string
  } | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<number>(0)

  useEffect(() => {
    // Temporarily disabled to prevent sync loops
    // checkSyncStatusAndAutoSync()
  }, [brochureId, localLastModified])

  const checkSyncStatusAndAutoSync = async () => {
    try {
      // Prevent sync loops - don't sync if we just synced recently (within 10 seconds)
      const now = Date.now()
      if (now - lastSyncTime < 10000) {
        console.log('Background sync: Skipping sync (too recent)')
        return
      }

      setIsChecking(true)
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user || userResult.user.role !== 'mr') {
        return
      }

      setLastSyncTime(now)

      // First, automatically upload any local changes
      await autoUploadChanges(userResult.user.id)

      // Then check for server changes (with a small delay to avoid immediate conflicts)
      setTimeout(async () => {
        try {
          const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
            userResult.user.id,
            brochureId,
            localLastModified
          )

          if (statusResult.success && statusResult.data) {
            setSyncStatus(statusResult.data)
            
            // Only auto-download if there's a significant time difference (more than 5 seconds)
            if (statusResult.data.needsDownload && statusResult.data.serverLastModified && localLastModified) {
              const serverTime = new Date(statusResult.data.serverLastModified).getTime()
              const localTime = new Date(localLastModified).getTime()
              const timeDiff = Math.abs(serverTime - localTime)
              
              if (timeDiff > 5000) { // Only sync if difference is more than 5 seconds
                console.log('Background sync: Auto-downloading newer changes from server (significant difference)')
                await autoDownloadChanges(userResult.user.id)
              } else {
                console.log('Background sync: Skipping download (minor time difference)')
              }
            }
          }
        } catch (error) {
          console.warn('Background sync: Status check error:', error)
        }
      }, 2000) // 2 second delay
    }
    } catch (error) {
      console.error('Error checking sync status:', error)
    } finally {
      setIsChecking(false)
    }
  }

  const autoUploadChanges = async (userId: string) => {
    try {
      setIsUploading(true)
      
      // Get current brochure data
      const brochureResult = await BrochureManagementService.getBrochureData(brochureId)
      if (!brochureResult.success || !brochureResult.data) {
        return
      }

      // Upload changes to server silently
      const uploadResult = await BrochureManagementService.syncBrochureToServer(
        userId,
        brochureId,
        brochureTitle,
        brochureResult.data.slides,
        brochureResult.data.groups
      )

      if (uploadResult.success) {
        console.log('Background sync: Changes uploaded successfully')
      } else {
        console.warn('Background sync: Upload failed:', uploadResult.error)
      }
    } catch (error) {
      console.warn('Background sync: Upload error:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const autoDownloadChanges = async (userId: string) => {
    try {
      setIsDownloading(true)
      console.log('Background sync: Downloading changes from server')

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
          console.log('Background sync: Changes downloaded and applied successfully')
          onSyncComplete?.()
          // Re-check status after applying changes
          await checkSyncStatusAndAutoSync()
        } else {
          console.warn('Background sync: Failed to apply downloaded changes:', applyResult.error)
        }
      } else {
        console.warn('Background sync: Failed to download changes:', downloadResult.error)
      }
    } catch (error) {
      console.warn('Background sync: Download error:', error)
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

  const handleUploadChanges = async () => {
    try {
      setIsUploading(true)
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user || userResult.user.role !== 'mr') {
        Alert.alert('Error', 'Please log in again')
        return
      }

      // Get current brochure data
      const brochureResult = await BrochureManagementService.getBrochureData(brochureId)
      if (!brochureResult.success || !brochureResult.data) {
        Alert.alert('Error', 'Failed to get brochure data')
        return
      }

      const syncResult = await BrochureManagementService.syncBrochureToServer(
        userResult.user.id,
        brochureId,
        brochureTitle,
        brochureResult.data.slides,
        brochureResult.data.groups
      )

      if (syncResult.success) {
        Alert.alert(
          'Success',
          'Brochure changes uploaded successfully!',
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
        Alert.alert('Error', syncResult.error || 'Failed to upload changes')
      }
    } catch (error) {
      console.error('Upload error:', error)
      Alert.alert('Error', 'Failed to upload brochure changes')
    } finally {
      setIsUploading(false)
    }
  }

  if (isChecking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#8b5cf6" />
        <Text style={styles.checkingText}>Checking sync status...</Text>
      </View>
    )
  }

  if (!syncStatus) {
    return null
  }

  // Show minimal status indicator only when actively syncing
  if (isChecking || isUploading || isDownloading) {
    return (
      <View style={styles.statusIndicator}>
        <ActivityIndicator size="small" color="#8b5cf6" />
        <Text style={styles.statusText}>
          {isUploading ? 'Syncing...' : isDownloading ? 'Updating...' : 'Checking...'}
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  container: {
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  checkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  checkingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  downloadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  downloadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  downloadText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '500',
    flex: 1,
  },
  uploadContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  uploadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    color: '#6b21a8',
    fontWeight: '500',
    flex: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  downloadButton: {
    backgroundColor: '#f59e0b',
  },
  uploadButton: {
    backgroundColor: '#8b5cf6',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
})
