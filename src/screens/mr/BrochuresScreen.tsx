import { useState, useEffect } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import * as FileSystem from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AuthService } from "../../services/AuthService"
import { MRService, MRAssignedBrochure } from "../../services/MRService"
import { BrochureManagementService } from "../../services/brochureManagementService"

interface BrochuresScreenProps {
  navigation: any
}

interface SavedBrochure extends MRAssignedBrochure {
  localId: string
  localPath: string
  customTitle: string
  downloadedAt: string
  localViewCount: number
  localDownloadCount: number
}

export default function BrochuresScreen({ navigation }: BrochuresScreenProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [availableBrochures, setAvailableBrochures] = useState<MRAssignedBrochure[]>([])
  const [savedBrochures, setSavedBrochures] = useState<SavedBrochure[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>(["All"])
  const [activeTab, setActiveTab] = useState<'available' | 'saved'>('available')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [brochureThumbnails, setBrochureThumbnails] = useState<{[key: string]: string}>({})
  
  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameBrochure, setRenameBrochure] = useState<SavedBrochure | null>(null)
  const [newTitle, setNewTitle] = useState('')

  // Load data on component mount
  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setIsLoading(true)
    try {
      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success && userResult.user) {
        setCurrentUserId(userResult.user.id)
        
        // Load available brochures from admin
        await loadAvailableBrochures(userResult.user.id)
        
        // Load saved brochures from local storage
        await loadSavedBrochures(userResult.user.id)
      }
    } catch (error) {
      console.error('Error loading data:', error)
      Alert.alert("Error", "Failed to load brochures")
    } finally {
      setIsLoading(false)
    }
  }

  const loadAvailableBrochures = async (userId: string) => {
    try {
      console.log('Loading available brochures for user:', userId)
      const result = await MRService.getAssignedBrochures(userId)
      
      if (result.success && result.data) {
        console.log('Loaded brochures:', result.data.length)
        setAvailableBrochures(result.data)
        
        // Extract unique categories
        const uniqueCategories = ["All", ...new Set(result.data.map(b => b.category).filter(Boolean))]
        setCategories(uniqueCategories)
        
        // Load thumbnails for ZIP brochures
        await loadBrochureThumbnailsForBrochures(result.data)
      } else {
        console.log('No brochures found or error:', result.error)
        setAvailableBrochures([])
      }
    } catch (error) {
      console.error('Error loading available brochures:', error)
      setAvailableBrochures([])
    }
  }

  const loadSavedBrochures = async (userId: string) => {
    try {
      const key = `mr_saved_brochures_${userId}`
      const savedData = await AsyncStorage.getItem(key)
      
      if (savedData) {
        const saved: SavedBrochure[] = JSON.parse(savedData)
        
        // Verify files still exist
        const validSaved: SavedBrochure[] = []
        for (const brochure of saved) {
          const fileInfo = await FileSystem.getInfoAsync(brochure.localPath)
          if (fileInfo.exists) {
            validSaved.push(brochure)
          }
        }
        
        setSavedBrochures(validSaved)
        
        // Update storage if some files were missing
        if (validSaved.length !== saved.length) {
          await AsyncStorage.setItem(key, JSON.stringify(validSaved))
        }
      } else {
        setSavedBrochures([])
      }
    } catch (error) {
      console.error('Error loading saved brochures:', error)
      setSavedBrochures([])
    }
  }

  const loadBrochureThumbnailsForBrochures = async (brochures: MRAssignedBrochure[]) => {
    try {
      const thumbnails: {[key: string]: string} = {}
      
      for (const brochure of brochures) {
        // Only load thumbnails for ZIP files
        if (brochure.file_type?.includes('zip')) {
          try {
            // Check if brochure data exists (was processed before)
            const result = await BrochureManagementService.getBrochureData(brochure.brochure_id)
            if (result.success && result.data) {
              // Generate thumbnail if it doesn't exist
              if (!result.data.thumbnailUri) {
                const thumbnailResult = await BrochureManagementService.generateThumbnail(brochure.brochure_id)
                if (thumbnailResult.success && thumbnailResult.thumbnailUri) {
                  thumbnails[brochure.brochure_id] = thumbnailResult.thumbnailUri
                }
              } else {
                // Use existing thumbnail
                thumbnails[brochure.brochure_id] = result.data.thumbnailUri
              }
            } else {
              // Brochure not processed yet, process it to get thumbnail
              console.log('Processing new ZIP brochure for thumbnail:', brochure.title)
              if (brochure.file_url) {
                const processResult = await BrochureManagementService.processZipFile(
                  brochure.brochure_id,
                  brochure.file_url,
                  brochure.title
                )
                if (processResult.success) {
                  // Now try to generate thumbnail
                  const thumbnailResult = await BrochureManagementService.generateThumbnail(brochure.brochure_id)
                  if (thumbnailResult.success && thumbnailResult.thumbnailUri) {
                    thumbnails[brochure.brochure_id] = thumbnailResult.thumbnailUri
                  }
                }
              }
            }
          } catch (error) {
            console.log('Could not load thumbnail for brochure:', brochure.brochure_id, error)
          }
        }
      }
      
      setBrochureThumbnails(thumbnails)
    } catch (error) {
      console.error('Error loading brochure thumbnails:', error)
    }
  }

  const handleDownloadBrochure = async (brochure: MRAssignedBrochure) => {
    try {
      if (!brochure.file_url) {
        Alert.alert("Error", "No file available for download")
        return
      }

      console.log('Downloading brochure:', brochure.title)

      // Create unique ID for this download
      const timestamp = Date.now()
      const localId = `${brochure.brochure_id}_${timestamp}`
      
      // Create download directory
      const downloadDir = FileSystem.documentDirectory + `mr_downloads/${currentUserId}/`
      const dirInfo = await FileSystem.getInfoAsync(downloadDir)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true })
      }

      // Generate unique filename
      const baseFileName = brochure.file_name || `${brochure.title}.pdf`
      const extension = baseFileName.split('.').pop() || 'pdf'
      const fileName = `${brochure.title}_${timestamp}.${extension}`
      const localPath = downloadDir + fileName
      
      // Generate custom title with suffix
      const existingBrochuresWithSameTitle = savedBrochures.filter(b => 
        b.title === brochure.title
      ).length
      
      let customTitle = brochure.title
      if (existingBrochuresWithSameTitle > 0) {
        customTitle = `${brochure.title} (${existingBrochuresWithSameTitle + 1})`
      }

      // Download file
      console.log('Downloading from:', brochure.file_url)
      console.log('Saving to:', localPath)
      
      if (brochure.file_url.startsWith('file://')) {
        await FileSystem.copyAsync({
          from: brochure.file_url,
          to: localPath
        })
      } else {
        await FileSystem.downloadAsync(brochure.file_url, localPath)
      }

      // If it's a ZIP file, process it immediately for future viewing
      if (brochure.file_type?.includes('zip')) {
        console.log('Processing ZIP file for future viewing')
        try {
          await BrochureManagementService.processZipFile(
            brochure.brochure_id,
            localPath,
            customTitle
          )
          console.log('ZIP file processed successfully')
        } catch (error) {
          console.log('ZIP processing failed, will process on first view:', error)
        }
      }

      // Create saved brochure record
      const savedBrochure: SavedBrochure = {
        ...brochure,
        localId,
        localPath,
        customTitle,
        downloadedAt: new Date().toISOString(),
        localViewCount: 0,
        localDownloadCount: 1
      }

      // Add to saved brochures
      const updatedSaved = [...savedBrochures, savedBrochure]
      setSavedBrochures(updatedSaved)

      // Save to AsyncStorage
      const key = `mr_saved_brochures_${currentUserId}`
      await AsyncStorage.setItem(key, JSON.stringify(updatedSaved))

      // Track download
      await MRService.trackBrochureDownload(brochure.brochure_id)

      // Update the download count in the available brochures list
      console.log('Updating download count for brochure ID:', brochure.brochure_id)
      const updatedAvailable = availableBrochures.map(b => {
        const shouldUpdate = b.brochure_id === brochure.brochure_id
        console.log(`Brochure ${b.title} (${b.brochure_id}): ${shouldUpdate ? 'UPDATING' : 'NOT UPDATING'}`)
        return shouldUpdate 
          ? { ...b, download_count: (b.download_count || 0) + 1 }
          : b
      })
      setAvailableBrochures(updatedAvailable)

      // Switch to saved tab
      setActiveTab('saved')

      Alert.alert("Success", "Brochure downloaded successfully!")
    } catch (error) {
      console.error('Download error:', error)
      Alert.alert("Error", "Failed to download brochure")
    }
  }

  const handleViewBrochure = async (brochure: MRAssignedBrochure | SavedBrochure) => {
    try {
      console.log('Viewing brochure:', brochure.title)
      console.log('Brochure ID:', brochure.brochure_id)

      // Track view
      await MRService.trackBrochureView(brochure.brochure_id)
      
      // If it's a saved brochure, increment local view count
      if ('localId' in brochure) {
        const updatedSaved = savedBrochures.map(b => 
          b.localId === brochure.localId 
            ? { ...b, localViewCount: b.localViewCount + 1 }
            : b
        )
        setSavedBrochures(updatedSaved)
        
        // Save to AsyncStorage
        const key = `mr_saved_brochures_${currentUserId}`
        await AsyncStorage.setItem(key, JSON.stringify(updatedSaved))
      }

      // Determine file URL
      let fileUrl = brochure.file_url
      let isOffline = false
      
      if ('localPath' in brochure) {
        // This is a saved brochure, use local path
        fileUrl = brochure.localPath
        isOffline = true
      }

      // Navigate to appropriate viewer based on file type
      if (brochure.file_type?.includes('zip')) {
        // For ZIP files, use AdminSlideManagement screen
        // For saved brochures that are ZIP files, we need to process them first if not already processed
        if (isOffline) {
          // Check if ZIP was already processed, if not, process it
          const result = await BrochureManagementService.getBrochureData(brochure.brochure_id)
          if (!result.success) {
            // Process the ZIP file first
            console.log('Processing downloaded ZIP file for viewing')
            const processResult = await BrochureManagementService.processZipFile(
              brochure.brochure_id,
              (brochure as SavedBrochure).localPath,
              brochure.title
            )
            if (!processResult.success) {
              Alert.alert("Error", "Failed to process brochure for viewing")
              return
            }
          }
        }
        
        navigation.navigate('AdminSlideManagement', { 
          brochureId: brochure.brochure_id,
          brochureTitle: 'customTitle' in brochure ? brochure.customTitle : brochure.title,
          isOffline
        })
      } else {
        // For PDF and other files, use BrochureViewer which shows slides
        navigation.navigate('BrochureViewer', { 
          brochureId: brochure.brochure_id,
          brochureTitle: 'customTitle' in brochure ? brochure.customTitle : brochure.title,
          brochureFile: fileUrl,
          isOffline
        })
      }
    } catch (error) {
      console.error('View error:', error)
      Alert.alert("Error", "Failed to view brochure")
    }
  }

  const handleRenameBrochure = (brochure: SavedBrochure) => {
    setRenameBrochure(brochure)
    setNewTitle(brochure.customTitle)
    setShowRenameModal(true)
  }

  const handleConfirmRename = async () => {
    if (!renameBrochure || !newTitle.trim()) {
      return
    }

    try {
      // Update the brochure title
      const updatedSaved = savedBrochures.map(b => 
        b.localId === renameBrochure.localId 
          ? { ...b, customTitle: newTitle.trim() }
          : b
      )
      
      setSavedBrochures(updatedSaved)
      
      // Save to AsyncStorage
      const key = `mr_saved_brochures_${currentUserId}`
      await AsyncStorage.setItem(key, JSON.stringify(updatedSaved))
      
      setShowRenameModal(false)
      setRenameBrochure(null)
      setNewTitle('')
      
      Alert.alert("Success", "Brochure renamed successfully!")
    } catch (error) {
      console.error('Rename error:', error)
      Alert.alert("Error", "Failed to rename brochure")
    }
  }

  const handleDeleteBrochure = (brochure: SavedBrochure) => {
    Alert.alert(
      "Delete Brochure",
      `Are you sure you want to delete "${brochure.customTitle}"? This will permanently remove the file from your device.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete local file
              const fileInfo = await FileSystem.getInfoAsync(brochure.localPath)
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(brochure.localPath)
              }

              // Remove from saved brochures
              const updatedSaved = savedBrochures.filter(b => b.localId !== brochure.localId)
              setSavedBrochures(updatedSaved)

              // Update AsyncStorage
              const key = `mr_saved_brochures_${currentUserId}`
              await AsyncStorage.setItem(key, JSON.stringify(updatedSaved))

              // Log delete activity
              try {
                await MRService.logActivity(currentUserId, 'brochure_delete', `Deleted ${brochure.customTitle}`)
              } catch (error) {
                console.log('Failed to log delete activity:', error)
              }

              Alert.alert("Success", "Brochure deleted successfully")
            } catch (error) {
              console.error('Delete error:', error)
              Alert.alert("Error", "Failed to delete brochure")
            }
          }
        }
      ]
    )
  }

  const getFilteredBrochures = () => {
    const brochuresToFilter = activeTab === 'available' ? availableBrochures : savedBrochures
    
    let filtered = brochuresToFilter

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(brochure => {
        const title = activeTab === 'available' ? brochure.title : (brochure as SavedBrochure).customTitle
        return title.toLowerCase().includes(searchQuery.toLowerCase())
      })
    }

    // Filter by category
    if (selectedCategory !== "All") {
      filtered = filtered.filter(brochure => brochure.category === selectedCategory)
    }

    return filtered
  }

  const filteredBrochures = getFilteredBrochures()

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading brochures...</Text>
      </View>
    )
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
            <Text style={styles.headerTitle}>My Brochures</Text>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilterModal(true)}
          >
            <Ionicons name="filter" size={24} color="#8b5cf6" />
          </TouchableOpacity>
          </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'available' && styles.activeTab]}
            onPress={() => setActiveTab('available')}
          >
            <Ionicons 
              name="cloud-outline" 
              size={20} 
              color={activeTab === 'available' ? '#3b82f6' : '#6b7280'} 
            />
            <Text style={[styles.tabText, activeTab === 'available' && styles.activeTabText]}>
              Available ({availableBrochures.length})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, activeTab === 'saved' && styles.activeTab]}
            onPress={() => setActiveTab('saved')}
          >
            <Ionicons 
              name="download-outline" 
              size={20} 
              color={activeTab === 'saved' ? '#3b82f6' : '#6b7280'} 
            />
            <Text style={[styles.tabText, activeTab === 'saved' && styles.activeTabText]}>
              Saved ({savedBrochures.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search brochures..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Brochures List */}
        <ScrollView style={styles.brochuresList}>
          {filteredBrochures.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyStateText}>
                {activeTab === 'available' 
                  ? availableBrochures.length === 0 
                    ? 'No brochures have been uploaded by administrator yet'
                    : 'No brochures match your search'
                  : savedBrochures.length === 0
                    ? 'No saved brochures yet. Download some from Available tab!'
                    : 'No saved brochures match your search'
                }
              </Text>
            </View>
          ) : (
            filteredBrochures.map((brochure, index) => {
              const displayTitle = activeTab === 'available' ? brochure.title : (brochure as SavedBrochure).customTitle
              const isSaved = activeTab === 'saved'
              const uniqueKey = isSaved ? (brochure as SavedBrochure).localId : `${brochure.brochure_id}_${index}`
              
            return (
                <View key={uniqueKey} style={styles.brochureCard}>
              <View style={styles.brochureContent}>
                    {(() => {
                      // Check for ZIP brochure thumbnail first
                      const zipThumbnail = brochureThumbnails[brochure.brochure_id]
                      if (zipThumbnail) {
                        return (
                          <Image
                            source={{ uri: zipThumbnail }}
                            style={styles.brochureImage}
                          />
                        )
                      }
                      
                      // Then check for database thumbnail_url
                      if (brochure.thumbnail_url) {
                        return (
                <Image 
                            source={{ uri: brochure.thumbnail_url }}
                            style={styles.brochureImage}
                          />
                        )
                      }
                      
                      // Show placeholder
                      return (
                        <View style={[styles.brochureImage, styles.placeholderImage]}>
                          <Ionicons name="document-text" size={32} color="#9ca3af" />
                        </View>
                      )
                    })()}
                <View style={styles.brochureInfo}>
                      <Text style={styles.brochureTitle} numberOfLines={2}>
                        {displayTitle}
                      </Text>
                      <Text style={styles.brochureCategory}>
                        {brochure.category || 'Uncategorized'}
                      </Text>
                      <Text style={styles.brochureUploader}>
                        By: {brochure.uploaded_by_name || 'Administrator'}
                      </Text>
                      <View style={styles.brochureStats}>
                        {isSaved && (
                          <Text style={styles.brochureStat}>
                            <Ionicons name="eye" size={14} color="#6b7280" /> {(brochure as SavedBrochure).localViewCount || 0}
                          </Text>
                        )}
                        <Text style={styles.brochureStat}>
                          <Ionicons name="download" size={14} color="#6b7280" /> {
                            isSaved 
                              ? (brochure as SavedBrochure).localDownloadCount || 0
                              : brochure.download_count || 0
                          }
                        </Text>
                  </View>
                      {isSaved && (
                        <Text style={styles.downloadDate}>
                          Downloaded: {new Date((brochure as SavedBrochure).downloadedAt).toLocaleDateString()}
                        </Text>
                      )}
              </View>
                  </View>
                  
                  <View style={styles.brochureActions}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleViewBrochure(brochure)}
                    >
                      <Ionicons name="eye" size={16} color="#8b5cf6" />
                      <Text style={styles.actionButtonText}>View</Text>
                    </TouchableOpacity>
                    
                    {activeTab === 'available' && (
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => handleDownloadBrochure(brochure)}
                      >
                        <Ionicons name="download" size={16} color="#10b981" />
                        <Text style={styles.actionButtonText}>Download</Text>
                      </TouchableOpacity>
                    )}
                    
                    {activeTab === 'saved' && (
                      <>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleRenameBrochure(brochure as SavedBrochure)}
                        >
                          <Ionicons name="create" size={16} color="#f59e0b" />
                          <Text style={styles.actionButtonText}>Rename</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleDeleteBrochure(brochure as SavedBrochure)}
                        >
                          <Ionicons name="trash" size={16} color="#ef4444" />
                          <Text style={styles.actionButtonText}>Delete</Text>
                    </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
            )
          })
          )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal visible={showFilterModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Brochures</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Category</Text>
              {categories.map((category) => (
                <TouchableOpacity
                  key={category}
                  style={styles.filterOption}
                  onPress={() => {
                    setSelectedCategory(category)
                    setShowFilterModal(false)
                  }}
                >
                  <Text style={styles.filterOptionText}>{category}</Text>
                  {selectedCategory === category && <Ionicons name="checkmark" size={20} color="#8b5cf6" />}
                </TouchableOpacity>
              ))}
            </View>
            </View>
          </View>
        </Modal>

        {/* Rename Modal */}
        <Modal visible={showRenameModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Rename Brochure</Text>
                <TouchableOpacity onPress={() => setShowRenameModal(false)}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.renameSection}>
                <Text style={styles.inputLabel}>New Title</Text>
                <TextInput
                  style={styles.textInput}
                  value={newTitle}
                  onChangeText={setNewTitle}
                  placeholder="Enter new title"
                  autoFocus
                />
            </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowRenameModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleConfirmRename}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    top: 20,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  filterButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  activeTab: {
    backgroundColor: "#eff6ff",
  },
  tabText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  activeTabText: {
    color: "#3b82f6",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: "#1f2937",
  },
  brochuresList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  brochureCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  brochureContent: {
    flexDirection: "row",
    marginBottom: 12,
  },
  brochureImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    resizeMode: "contain",
  },
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  brochureInfo: {
    flex: 1,
    marginLeft: 12,
  },
  brochureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  brochureCategory: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  brochureUploader: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 8,
  },
  brochureStats: {
    flexDirection: "row",
    gap: 16,
  },
  brochureStat: {
    fontSize: 12,
    color: "#6b7280",
    flexDirection: "row",
    alignItems: "center",
  },
  downloadDate: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 4,
  },
  brochureActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  actionButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 12,
  },
  filterOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  filterOptionText: {
    fontSize: 14,
    color: "#374151",
  },
  renameSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1f2937",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
})