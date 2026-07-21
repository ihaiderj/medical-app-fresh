import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as DocumentPicker from 'expo-document-picker'
import { AdminService } from '../../services/AdminService'
import { MRService } from '../../services/MRService'
import { AuthService } from '../../services/AuthService'
import { FileStorageService, UploadProgress } from '../../services/fileStorageService'
import { BrochureManagementService } from '../../services/brochureManagementService'
import { LocalDatabaseService } from '../../services/localDatabaseService'
import { BrochureRefreshService } from '../../services/brochureRefreshService'
import { fixStorageBucket } from '../../utils/fixStorageBucket'


interface AddBrochureScreenProps {
  navigation: any
}

export default function AddBrochureScreen({ navigation }: AddBrochureScreenProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    tags: '',
  })
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  } | null>(null)
  const [uploadType, setUploadType] = useState<'single' | 'zip'>('single')
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showStorageFix, setShowStorageFix] = useState(false)
  const [isFixingStorage, setIsFixingStorage] = useState(false)

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Brochure title is required')
      return false
    }
    // Category is now optional - will default to "General" if not provided
    return true
  }

  const pickFile = async () => {
    try {
      const fileType = uploadType === 'zip' ? 'application/zip' : '*/*'
      
      const result = await DocumentPicker.getDocumentAsync({
        type: fileType,
        copyToCacheDirectory: true,
        multiple: false,
      })

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0]
        
        // Validate ZIP file if ZIP upload type is selected
        if (uploadType === 'zip' && !asset.name?.toLowerCase().endsWith('.zip')) {
          Alert.alert('Error', 'Please select a ZIP file for slide upload')
          return
        }
        
        setSelectedFile({
          uri: asset.uri,
          fileName: asset.name || 'brochure-file',
          fileSize: asset.size || 0,
          mimeType: asset.mimeType || 'application/octet-stream'
        })
        
        const uploadTypeText = uploadType === 'zip' ? 'ZIP file with slides' : 'single file'
        Alert.alert(
          'File Selected', 
          `File: ${asset.name}\nSize: ${Math.round((asset.size || 0) / 1024)}KB\nType: ${uploadTypeText}`
        )
      }
    } catch (error) {
      console.error('Error picking file:', error)
      Alert.alert('Error', 'Failed to pick file. Please try again.')
    }
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a file first')
      return
    }

    const fileSizeMB = selectedFile.fileSize / (1024 * 1024)
    const maxSizeMB = 50
    if (fileSizeMB > maxSizeMB) {
      Alert.alert(
        'File Too Large',
        `The selected file (${fileSizeMB.toFixed(1)}MB) exceeds the maximum allowed size of ${maxSizeMB}MB.\n\nPlease:\n• Compress your ZIP file\n• Reduce image quality\n• Remove unnecessary files\n\nTip: Use online ZIP compressors or reduce image resolution to under ${maxSizeMB}MB.`,
        [{ text: 'OK' }]
      )
      return
    }

    setIsLoading(true)
    setIsUploading(true)
    setUploadProgress(null)

    try {
      const userResult = await AuthService.getCurrentUser()
      const isMr = userResult.success && userResult.user?.role === 'mr'
      if (isMr) {
        const perm = await MRService.hasBrochureUploadPermission()
        if (!perm.success || !perm.hasPermission) {
          Alert.alert('Permission Denied', 'You do not have permission to upload brochures.')
          return
        }
      }

      const goAfterSuccess = () => {
        if (isMr) {
          navigation.navigate('MRTabs', { screen: 'Brochures' })
        } else {
          navigation.navigate('ViewAllBrochures')
        }
      }

      if (uploadType === 'zip' && selectedFile) {
        console.log('Uploading file...', { isMr, fileName: selectedFile.fileName, mimeType: selectedFile.mimeType })

        let brochureId: string | undefined
        let remoteFileUrl: string | undefined

        if (isMr) {
          // Backend: multipart POST /api/mr/brochures/upload/ (file + fields).
          // Do not use /api/files/brochures/upload/ then JSON create — that causes 415.
          setUploadProgress({
            loaded: 0,
            total: selectedFile.fileSize || 0,
            percentage: 10,
          })
          const mrUpload = await MRService.uploadBrochureMultipart({
            localFilePath: selectedFile.uri,
            fileName: selectedFile.fileName,
            mimeType: selectedFile.mimeType || 'application/zip',
            title: formData.title,
            category: formData.category,
            description: formData.description || undefined,
            tags: formData.tags
              ? formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
              : undefined,
            fileSize: `${Math.round(selectedFile.fileSize / 1024)}KB`,
          })
          setUploadProgress({
            loaded: selectedFile.fileSize || 0,
            total: selectedFile.fileSize || 0,
            percentage: 100,
          })

          if (!mrUpload.success || !(mrUpload.data?.brochure_id || mrUpload.data?.id)) {
            throw new Error(mrUpload.error || 'Failed to upload brochure')
          }

          brochureId = mrUpload.data?.brochure_id || mrUpload.data?.id
          remoteFileUrl = mrUpload.data?.file_url
        } else {
          const uploadResult = await FileStorageService.uploadFile(
            selectedFile.uri,
            selectedFile.fileName,
            (progress) => setUploadProgress(progress),
          )

          if (!uploadResult.success || !uploadResult.publicUrl) {
            throw new Error(uploadResult.error || 'Failed to upload file')
          }

          remoteFileUrl = uploadResult.publicUrl

          const result = await AdminService.createBrochure(
            formData.title,
            formData.category,
            formData.description || undefined,
            uploadResult.publicUrl,
            selectedFile.fileName,
            selectedFile.mimeType || 'application/zip',
            undefined,
            undefined,
            `${Math.round(selectedFile.fileSize / 1024)}KB`,
            formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : undefined,
          )

          brochureId =
            (result.data as { brochure_id?: string; id?: string } | undefined)?.brochure_id ||
            (result.data as { id?: string } | undefined)?.id

          if (!result.success || !brochureId) {
            Alert.alert('Error', result.error || 'Failed to create brochure record')
            return
          }
        }

        setUploadProgress(null)
        setIsUploading(false)
        setIsProcessing(true)

        if (brochureId) {
          // Prefer local ZIP URI for extraction (avoids re-download).
          const zipSource = selectedFile.uri.startsWith('file')
            ? selectedFile.uri
            : remoteFileUrl || selectedFile.uri

          const zipResult = await BrochureManagementService.processZipFile(
            brochureId,
            zipSource,
            formData.title,
          )

          if (zipResult.success && zipResult.brochureData) {
            let thumbnailUrl = zipResult.brochureData.thumbnailUri

            if (thumbnailUrl && thumbnailUrl.startsWith('file://')) {
              try {
                const thumbnailUploadResult = await FileStorageService.uploadFile(
                  thumbnailUrl,
                  `thumbnail_${brochureId}.jpg`,
                )
                if (thumbnailUploadResult.success && thumbnailUploadResult.publicUrl) {
                  thumbnailUrl = thumbnailUploadResult.publicUrl
                }
              } catch (thumbnailError) {
                console.log('Thumbnail upload error:', thumbnailError)
              }
            }

            if (!isMr) {
              await AdminService.updateBrochure(
                brochureId,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                thumbnailUrl,
                zipResult.brochureData.totalSlides,
              )
            } else if (userResult.user) {
              const now = new Date().toISOString()
              await LocalDatabaseService.upsertBrochure({
                id: brochureId,
                title: formData.title,
                category: formData.category?.trim() || 'General',
                description: formData.description || '',
                file_url: remoteFileUrl || '',
                thumbnail_url: thumbnailUrl || '',
                pages: zipResult.brochureData.totalSlides || 0,
                file_size: `${Math.round(selectedFile.fileSize / 1024)}KB`,
                status: 'active',
                assigned_by: userResult.user.id,
                download_count: 0,
                view_count: 0,
                created_at: now,
                updated_at: now,
                file_name: selectedFile.fileName,
                file_type: selectedFile.mimeType || 'application/zip',
                uploaded_by: userResult.user.id,
                is_public: true,
                tags: formData.tags || '',
                version: 1,
                sync_status: 'synced',
                local_changes: null,
                last_synced_at: now,
                needs_sync: false,
              } as any)
              try {
                await BrochureRefreshService.refreshFromServer(userResult.user.id)
              } catch {
                // local upsert is enough for Available tab
              }
            }

            Alert.alert(
              'Success',
              `ZIP processed successfully! Created ${zipResult.brochureData.totalSlides} slides.`,
              [{ text: 'OK', onPress: goAfterSuccess }],
            )
          } else {
            Alert.alert('Error', zipResult.error || 'Failed to process ZIP file')
          }
        }
      } else {
        const createBrochure = isMr
          ? MRService.createBrochure.bind(MRService)
          : AdminService.createBrochure.bind(AdminService)
        const result = await createBrochure(
          formData.title,
          formData.category,
          formData.description || undefined,
          selectedFile?.uri || undefined,
          selectedFile?.fileName || undefined,
          selectedFile?.mimeType ? selectedFile.mimeType.substring(0, 100) : undefined,
          selectedFile?.uri || undefined,
          undefined,
          selectedFile ? `${Math.round(selectedFile.fileSize / 1024)}KB` : undefined,
          formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : undefined,
        )

        if (result.success) {
          if (isMr && userResult.user) {
            try {
              await BrochureRefreshService.refreshFromServer(userResult.user.id)
            } catch {
              // non-fatal
            }
          }
          Alert.alert('Success', 'Brochure created successfully!', [
            { text: 'OK', onPress: goAfterSuccess },
          ])
        } else {
          Alert.alert('Error', result.error || 'Failed to create brochure')
        }
      }
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      if (errorMessage.includes('exceeded the maximum allowed size')) {
        setShowStorageFix(true)
        Alert.alert(
          'Upload Failed',
          'File size limit exceeded. This might be a storage bucket configuration issue.\n\nTry the "Fix Storage" button below to reset the storage bucket.',
          [{ text: 'OK' }],
        )
      } else {
        Alert.alert('Error', errorMessage)
      }
    } finally {
      setIsLoading(false)
      setIsUploading(false)
      setIsProcessing(false)
      setUploadProgress(null)
    }
  }

  const handleFixStorage = async () => {
    setIsFixingStorage(true)
    try {
      console.log('Attempting to fix storage bucket...')
      const result = await fixStorageBucket()
      
      if (result.success) {
        Alert.alert(
          'Storage Fixed!',
          'Storage bucket has been reset successfully. You can now try uploading your file again.',
          [{ text: 'OK', onPress: () => setShowStorageFix(false) }]
        )
      } else {
        Alert.alert('Fix Failed', result.error || 'Could not fix storage bucket')
      }
    } catch (error) {
      console.error('Storage fix error:', error)
      Alert.alert('Fix Failed', 'An error occurred while fixing storage')
    } finally {
      setIsFixingStorage(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add New Brochure</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Brochure Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Brochure Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              value={formData.title}
              onChangeText={(value) => handleInputChange('title', value)}
              placeholder="Enter brochure title"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Category (Optional)</Text>
            <TextInput
              style={styles.input}
              value={formData.category}
              onChangeText={(value) => handleInputChange('category', value)}
              placeholder="e.g., Cardiology, Neurology, Oncology (defaults to General)"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.description}
              onChangeText={(value) => handleInputChange('description', value)}
              placeholder="Enter brochure description"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Tags</Text>
            <TextInput
              style={styles.input}
              value={formData.tags}
              onChangeText={(value) => handleInputChange('tags', value)}
              placeholder="Enter tags separated by commas"
              placeholderTextColor="#9ca3af"
            />
            <Text style={styles.helpText}>e.g., heart disease, treatment, prevention</Text>
          </View>
        </View>

        {/* Upload Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Type</Text>
          <View style={styles.uploadTypeContainer}>
            <TouchableOpacity
              style={[styles.uploadTypeButton, uploadType === 'single' && styles.uploadTypeButtonActive]}
              onPress={() => {
                setUploadType('single')
                setSelectedFile(null)
              }}
            >
              <Ionicons name="document" size={24} color={uploadType === 'single' ? '#ffffff' : '#6b7280'} />
              <Text style={[styles.uploadTypeText, uploadType === 'single' && styles.uploadTypeTextActive]}>
                Single File
              </Text>
              <Text style={[styles.uploadTypeSubtext, uploadType === 'single' && styles.uploadTypeSubtextActive]}>
                PDF, DOC, PPT, Image
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.uploadTypeButton, uploadType === 'zip' && styles.uploadTypeButtonActive]}
              onPress={() => {
                setUploadType('zip')
                setSelectedFile(null)
              }}
            >
              <Ionicons name="albums" size={24} color={uploadType === 'zip' ? '#ffffff' : '#6b7280'} />
              <Text style={[styles.uploadTypeText, uploadType === 'zip' && styles.uploadTypeTextActive]}>
                ZIP Slides
              </Text>
              <Text style={[styles.uploadTypeSubtext, uploadType === 'zip' && styles.uploadTypeSubtextActive]}>
                ZIP with slide images
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* File Upload */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {uploadType === 'zip' ? 'ZIP File with Slides' : 'Brochure File'}
          </Text>
          
          <TouchableOpacity style={styles.uploadButton} onPress={pickFile}>
            {selectedFile ? (
              <View style={styles.filePreview}>
                <View style={styles.fileInfo}>
                  <Ionicons 
                    name={selectedFile.mimeType?.includes('pdf') ? 'document-text' : 
                          selectedFile.mimeType?.includes('image') ? 'image' :
                          selectedFile.mimeType?.includes('word') ? 'document' :
                          selectedFile.mimeType?.includes('powerpoint') ? 'easel' :
                          'document-outline'} 
                    size={48} 
                    color="#8b5cf6" 
                  />
                  <View style={styles.fileDetails}>
                    <Text style={styles.fileName}>{selectedFile.fileName}</Text>
                    <Text style={styles.fileSize}>{Math.round(selectedFile.fileSize / 1024)}KB</Text>
                    <Text style={styles.fileType}>{selectedFile.mimeType}</Text>
                  </View>
                </View>
                <View style={styles.fileOverlay}>
                  <Ionicons name="document-outline" size={24} color="#ffffff" />
                  <Text style={styles.overlayText}>Select Different File</Text>
                </View>
              </View>
            ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="document-outline" size={48} color="#8b5cf6" />
                    <Text style={styles.uploadText}>Select Brochure File</Text>
                    <Text style={styles.uploadSubtext}>Tap to browse and select any file from your device</Text>
                  </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Upload Progress */}
        {isUploading && uploadProgress && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Uploading to server... {uploadProgress.percentage}%
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${uploadProgress.percentage}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressSize}>
              {Math.round(uploadProgress.loaded / 1024)} KB / {Math.round(uploadProgress.total / 1024)} KB
            </Text>
          </View>
        )}

        {/* Processing Message */}
        {isProcessing && (
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.processingText}>
              Please wait while we are processing the build
            </Text>
            <Text style={styles.processingSubtext}>
              Extracting slides and generating thumbnails...
            </Text>
          </View>
        )}

        {/* Fix Storage Button (shows when upload fails due to size limits) */}
        {showStorageFix && (
          <TouchableOpacity
            style={[styles.fixStorageButton, isFixingStorage && styles.submitButtonDisabled]}
            onPress={handleFixStorage}
            disabled={isFixingStorage}
          >
            {isFixingStorage ? (
              <>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.fixStorageButtonText}>Fixing Storage...</Text>
              </>
            ) : (
              <>
                <Ionicons name="build" size={20} color="#ffffff" />
                <Text style={styles.fixStorageButtonText}>Fix Storage Bucket</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <ActivityIndicator color="#ffffff" size="small" />
              <Text style={styles.submitButtonText}>
                {isUploading ? 'Uploading...' : isProcessing ? 'Processing...' : 'Creating...'}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color="#ffffff" />
              <Text style={styles.submitButtonText}>Create Brochure</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  uploadTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  uploadTypeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  uploadTypeButtonActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  uploadTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  uploadTypeTextActive: {
    color: '#ffffff',
  },
  uploadTypeSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
    textAlign: 'center',
  },
  uploadTypeSubtextActive: {
    color: '#e0e7ff',
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  uploadPlaceholder: {
    alignItems: 'center',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8b5cf6',
    marginTop: 8,
  },
  uploadSubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  filePreview: {
    position: 'relative',
    width: '100%',
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderStyle: 'solid',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileDetails: {
    marginLeft: 16,
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  fileType: {
    fontSize: 12,
    color: '#9ca3af',
  },
  fileOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(139, 92, 246, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  overlayText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 32,
    marginBottom: 32,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  progressContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 4,
  },
  progressSize: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  processingContainer: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 20,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
  },
  processingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  processingSubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  fixStorageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f59e0b',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 16,
    gap: 8,
  },
  fixStorageButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
})
