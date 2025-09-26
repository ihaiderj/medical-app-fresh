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
import { BrochureManagementService } from '../../services/brochureManagementService'


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

    setIsLoading(true)
    try {
      if (uploadType === 'zip' && selectedFile) {
        // First create brochure record in database to get the real brochure ID
        const result = await AdminService.createBrochure(
          formData.title,
          formData.category,
          formData.description || undefined,
          selectedFile.uri, // Keep original ZIP file URL
          selectedFile.fileName,
          'application/zip',
          undefined, // No thumbnail yet
          undefined, // Pages will be updated after processing
          `${Math.round(selectedFile.fileSize / 1024)}KB`,
          formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : undefined
        )
        
        if (result.success && result.data?.brochure_id) {
          // Now process ZIP file with the actual database brochure ID
          const brochureId = result.data.brochure_id
          const zipResult = await BrochureManagementService.processZipFile(
            brochureId,
            selectedFile.uri,
            formData.title
          )
          
          if (zipResult.success && zipResult.brochureData) {
            // Update brochure record with thumbnail and slide count
            const updateResult = await AdminService.updateBrochure(
              brochureId,
              undefined, // title
              undefined, // description
              undefined, // category
              undefined, // tags
              undefined, // isPublic
              zipResult.brochureData.thumbnailUri, // thumbnail
              zipResult.brochureData.totalSlides // pages
            )
            
            Alert.alert(
              'Success',
              `ZIP processed successfully! Created ${zipResult.brochureData.totalSlides} slides.`,
              [{ text: 'OK', onPress: () => navigation.navigate('ViewAllBrochures') }]
            )
          } else {
            Alert.alert('Error', zipResult.error || 'Failed to process ZIP file')
          }
        } else {
          Alert.alert('Error', result.error || 'Failed to create brochure record')
        }
      } else {
        // Handle single file upload (existing logic)
        const result = await AdminService.createBrochure(
          formData.title,
          formData.category,
          formData.description || undefined,
          selectedFile?.uri || undefined,
          selectedFile?.fileName || undefined,
          selectedFile?.mimeType ? selectedFile.mimeType.substring(0, 100) : undefined,
          selectedFile?.uri || undefined,
          undefined,
          selectedFile ? `${Math.round(selectedFile.fileSize / 1024)}KB` : undefined,
          formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : undefined
        )

        if (result.success) {
          Alert.alert(
            'Success',
            'Brochure created successfully!',
            [{ text: 'OK', onPress: () => navigation.navigate('ViewAllBrochures') }]
          )
        } else {
          Alert.alert('Error', result.error || 'Failed to create brochure')
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
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

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" size="small" />
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
})
