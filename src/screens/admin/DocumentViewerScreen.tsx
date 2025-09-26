import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

interface DocumentViewerScreenProps {
  navigation: any
  route: any
}

export default function DocumentViewerScreen({ navigation, route }: DocumentViewerScreenProps) {
  const { brochureId, brochureTitle, brochureUrl, fileName, fileType } = route.params || {}

  const handleDownload = async () => {
    try {
      if (brochureUrl) {
        const supported = await Linking.canOpenURL(brochureUrl)
        if (supported) {
          await Linking.openURL(brochureUrl)
        } else {
          Alert.alert('Error', 'Cannot open this file type')
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open file')
    }
  }

  const getFileIcon = (fileType?: string) => {
    if (!fileType) return 'document-outline'
    
    if (fileType.includes('pdf')) return 'document-text'
    if (fileType.includes('word')) return 'document'
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return 'easel'
    if (fileType.includes('image')) return 'image'
    return 'document-outline'
  }

  const getFileColor = (fileType?: string) => {
    if (!fileType) return '#6b7280'
    
    if (fileType.includes('pdf')) return '#ef4444'
    if (fileType.includes('word')) return '#2563eb'
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '#d97706'
    if (fileType.includes('image')) return '#10b981'
    return '#6b7280'
  }

  const canPreview = (fileType?: string, fileUrl?: string) => {
    if (!fileType || !fileUrl) return false
    // Only preview if it's a web URL, not a local file
    const isWebUrl = fileUrl.startsWith('http://') || fileUrl.startsWith('https://')
    return isWebUrl && (fileType.includes('pdf') || fileType.includes('image'))
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
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {brochureTitle || fileName || 'Document'}
          </Text>
          <Text style={styles.headerSubtitle}>{fileType || 'Unknown type'}</Text>
        </View>
        <TouchableOpacity
          style={styles.downloadButton}
          onPress={handleDownload}
        >
          <Ionicons name="download-outline" size={24} color="#8b5cf6" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {canPreview(fileType, brochureUrl) ? (
          <WebView
            source={{ uri: brochureUrl }}
            style={styles.webView}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <Ionicons name="document-text" size={48} color="#8b5cf6" />
                <Text style={styles.loadingText}>Loading document...</Text>
              </View>
            )}
          />
        ) : (
          <View style={styles.previewContainer}>
            <View style={styles.fileIconContainer}>
              <Ionicons 
                name={getFileIcon(fileType)} 
                size={80} 
                color={getFileColor(fileType)} 
              />
            </View>
            <Text style={styles.fileName}>{fileName || 'Document'}</Text>
            <Text style={styles.fileTypeText}>{fileType || 'Unknown file type'}</Text>
            
            <TouchableOpacity style={styles.openButton} onPress={handleDownload}>
              <Ionicons name="open-outline" size={20} color="#ffffff" />
              <Text style={styles.openButtonText}>Open File</Text>
            </TouchableOpacity>
            
            <Text style={styles.helpText}>
              {brochureUrl?.startsWith('file://') 
                ? 'Local file selected. Tap "Open File" to view it with your device\'s default app.'
                : 'This file type cannot be previewed in the app. Tap "Open File" to view it.'
              }
            </Text>
          </View>
        )}
      </View>
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
    backgroundColor: '#ffffff',
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  downloadButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  fileIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  fileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  fileTypeText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 32,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 24,
  },
  openButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  helpText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  },
})
