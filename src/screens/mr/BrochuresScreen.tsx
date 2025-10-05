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
import { FileStorageService, DownloadProgress } from "../../services/fileStorageService"
import SavedBrochureSyncStatus from "../../components/SavedBrochureSyncStatus"
import { savedBrochuresSyncService, SavedBrochureServerData } from "../../services/savedBrochuresSyncService"
import SyncStatusIndicator from "../../components/SyncStatusIndicator"

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
  const [activeTab, setActiveTab] = useState<'available' | 'saved'>('saved')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [brochureThumbnails, setBrochureThumbnails] = useState<{[key: string]: string}>({})
  
  // Download progress state
  const [downloadProgress, setDownloadProgress] = useState<{[key: string]: DownloadProgress}>({})
  const [downloadingBrochures, setDownloadingBrochures] = useState<Set<string>>(new Set())
  
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
      console.log('Loading saved brochures for user:', userId)
      // First, get saved brochures from server
      const serverResult = await savedBrochuresSyncService.getSavedBrochuresFromServer(userId)
      console.log('Server saved brochures result:', serverResult.success, serverResult.data?.length || 0)
      
      if (serverResult.success && serverResult.data) {
        // Convert server data to local format and verify files exist
        const validSaved: SavedBrochure[] = []
        
        for (const serverBrochure of serverResult.data) {
          // Check if file exists locally
          const downloadDir = FileSystem.documentDirectory + `mr_downloads/${userId}/`
          const expectedFiles = await FileSystem.readDirectoryAsync(downloadDir).catch(() => [])
          
          // Find matching local file by brochure ID (check both ZIP and data files)
          const matchingFile = expectedFiles.find(file => 
            file.includes(serverBrochure.brochure_id) || 
            file.includes(serverBrochure.custom_title.replace(/[^a-zA-Z0-9]/g, '_'))
          )
          
          // Also check if brochure data exists (more reliable than file check)
          const brochureDataExists = await BrochureManagementService.getBrochureData(serverBrochure.brochure_id)
          console.log('LoadSaved: Checking brochure:', serverBrochure.custom_title)
          console.log('LoadSaved: File match:', !!matchingFile)
          console.log('LoadSaved: Data exists:', brochureDataExists.success)
          
          if (matchingFile) {
            const localPath = downloadDir + matchingFile
            const fileInfo = await FileSystem.getInfoAsync(localPath)
            
            if (fileInfo.exists) {
              // Create local brochure object from server data
              const localBrochure: SavedBrochure = {
                ...serverBrochure.original_brochure_data,
                localId: `${serverBrochure.brochure_id}_server`,
                localPath,
                customTitle: serverBrochure.custom_title,
                downloadedAt: serverBrochure.saved_at,
                localViewCount: 0,
                localDownloadCount: 1
              }
              
              validSaved.push(localBrochure)
              console.log('LoadSaved: Found existing file for:', serverBrochure.custom_title, 'at', localPath)
            } else {
              // File exists but not accessible, mark for download but keep in list
              console.log('LoadSaved: File not accessible for:', serverBrochure.custom_title)
            }
          } else {
            // No matching file found, but still show in list (will download on view)
            console.log('LoadSaved: No local file found for:', serverBrochure.custom_title)
          }
          
          // Always add to saved list - use brochure data existence as primary indicator
          const savedBrochureEntry: SavedBrochure = {
            ...serverBrochure.original_brochure_data,
            localId: `${serverBrochure.brochure_id}_server`,
            localPath: (matchingFile && brochureDataExists.success) ? (downloadDir + matchingFile) : '', 
            customTitle: serverBrochure.custom_title,
            downloadedAt: serverBrochure.saved_at,
            localViewCount: 0,
            localDownloadCount: 1
          }
          
          // Only add if not already added above
          const alreadyAdded = validSaved.some(saved => 
            (saved.brochure_id || saved.id) === serverBrochure.brochure_id
          )
          
          if (!alreadyAdded) {
            validSaved.push(savedBrochureEntry)
            console.log('LoadSaved: Added to saved list:', serverBrochure.custom_title, 'hasLocalData:', brochureDataExists.success)
          }
        }
        
        console.log('Setting saved brochures:', validSaved.length, 'brochures')
        setSavedBrochures(validSaved)
        
        // Note: Server is the source of truth for saved brochures
      } else {
        // Fallback to local storage if server fails
        await loadSavedBrochuresFromLocal(userId)
      }
    } catch (error) {
      console.error('Error loading saved brochures from server:', error)
      // Fallback to local storage
      await loadSavedBrochuresFromLocal(userId)
    }
  }

  const loadSavedBrochuresFromLocal = async (userId: string) => {
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
      console.error('Error loading saved brochures from local:', error)
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
            const brochureId = brochure.brochure_id || brochure.id
            if (!brochureId) continue
            
            // Check if brochure data exists (was processed before)
            const result = await BrochureManagementService.getBrochureData(brochureId)
            if (result.success && result.data) {
              // Generate thumbnail if it doesn't exist
              if (!result.data.thumbnailUri) {
                const thumbnailResult = await BrochureManagementService.generateThumbnail(brochureId)
                if (thumbnailResult.success && thumbnailResult.thumbnailUri) {
                  thumbnails[brochureId] = thumbnailResult.thumbnailUri
                }
              } else {
                // Use existing thumbnail
                thumbnails[brochureId] = result.data.thumbnailUri
              }
            } else {
              // Brochure not processed yet for MR - skip thumbnail processing
              // MR users should not process ZIP files for thumbnails due to authentication issues
              // Admin should process and set thumbnail_url in database
              console.log('ZIP brochure not processed yet, skipping thumbnail generation for MR user')
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

      // Add to downloading set - use id or brochure_id, with title as fallback
      const brochureId = brochure.brochure_id || brochure.id
      const downloadKey = brochureId || brochure.title
      setDownloadingBrochures(prev => new Set([...prev, downloadKey]))

      // Create unique ID for this download
      const timestamp = Date.now()
      const localId = `${downloadKey}_${timestamp}`
      
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

      // Download file with progress tracking
      console.log('Downloading from:', brochure.file_url)
      console.log('Saving to:', localPath)
      
      if (brochure.file_url.startsWith('file://')) {
        // Local file copy (legacy support)
        await FileSystem.copyAsync({
          from: brochure.file_url,
          to: localPath
        })
      } else {
        // Download from Supabase Storage with progress
        const downloadResult = await FileStorageService.downloadFile(
          brochure.file_url,
          localPath,
          (progress) => {
            setDownloadProgress(prev => ({
              ...prev,
              [downloadKey]: progress
            }))
            console.log(`Download progress: ${progress.percentage}%`)
          }
        )

        if (!downloadResult.success) {
          throw new Error(downloadResult.error || 'Download failed')
        }
      }

      // Clear download progress
      setDownloadProgress(prev => {
        const updated = { ...prev }
        delete updated[downloadKey]
        return updated
      })

      // If it's a ZIP file, process it immediately for future viewing
      if (brochure.file_type?.includes('zip')) {
        console.log('Processing ZIP file for future viewing')
        try {
          if (brochureId) {
            // Check if brochure data already exists with modifications
            const existingResult = await BrochureManagementService.getBrochureData(brochureId)
            
            if (existingResult.success && existingResult.data && 
                (existingResult.data.isModified || existingResult.data.groups.length > 0)) {
              console.log('ZIP Processing: Found existing modified brochure, skipping ZIP processing to preserve changes')
              console.log('ZIP Processing: Existing groups:', existingResult.data.groups.map(g => g.name))
              console.log('ZIP Processing: Modified slides:', existingResult.data.slides.filter(s => s.title !== s.fileName).length)
            } else {
              await BrochureManagementService.processZipFile(
                brochureId,
                localPath,
                customTitle
              )
              console.log('ZIP file processed successfully')
            }
          }
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

      // Save to server first
      const serverResult = await savedBrochuresSyncService.saveBrochureToServer(
        currentUserId,
        brochureId,
        brochure.title,
        customTitle,
        brochure
      )

      if (serverResult.success) {
        console.log('Brochure saved to server successfully')
      } else {
        console.warn('Failed to save brochure to server:', serverResult.error)
      }

      // Add to local saved brochures
      const updatedSaved = [...savedBrochures, savedBrochure]
      setSavedBrochures(updatedSaved)

      // Note: Server is the source of truth for saved brochures

      // Track download (only if brochureId is valid)
      if (brochureId) {
        await MRService.trackBrochureDownload(brochureId)
      }
      
      // Log download activity
      try {
        await MRService.logActivity(currentUserId, 'brochure_download', `Downloaded ${customTitle}`)
      } catch (error) {
        console.log('Failed to log download activity:', error)
      }

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
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to download brochure")
    } finally {
      // Clean up download state
      setDownloadingBrochures(prev => {
        const updated = new Set(prev)
        const cleanupKey = brochure.brochure_id || brochure.id || brochure.title
        updated.delete(cleanupKey)
        return updated
      })
      setDownloadProgress(prev => {
        const updated = { ...prev }
        const cleanupKey = brochure.brochure_id || brochure.id || brochure.title
        delete updated[cleanupKey]
        return updated
      })
    }
  }

  const autoSyncBrochureOnView = async (brochureId: string, brochure: SavedBrochure) => {
    try {
      // Get local brochure data to find latest modification time
      const localResult = await BrochureManagementService.getBrochureData(brochureId)
      let localLastModified: string | undefined

      if (localResult.success && localResult.data) {
        // Find the most recent modification across all slides and groups
        const slideTimestamps = localResult.data.slides.map(s => s.updatedAt).filter(Boolean)
        const groupTimestamps = localResult.data.groups.map(g => g.updatedAt).filter(Boolean)
        const allTimestamps = [...slideTimestamps, ...groupTimestamps]
        
        if (allTimestamps.length > 0) {
          localLastModified = allTimestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        }
      }

      // Check sync status
      const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
        currentUserId,
        brochureId,
        localLastModified
      )

      if (statusResult.success && statusResult.data?.needsDownload) {
        console.log('Auto-sync: Downloading newer changes from server')
        
        // Download and apply changes automatically
        const downloadResult = await BrochureManagementService.downloadBrochureChanges(
          currentUserId,
          brochureId
        )

        if (downloadResult.success && downloadResult.data) {
          const applyResult = await BrochureManagementService.applyBrochureChanges(
            brochureId,
            downloadResult.data
          )

          if (applyResult.success) {
            console.log('Auto-sync: Changes downloaded and applied successfully')
          } else {
            console.warn('Auto-sync: Failed to apply changes:', applyResult.error)
          }
        } else {
          console.warn('Auto-sync: Failed to download changes:', downloadResult.error)
        }
      } else if (statusResult.success) {
        console.log('Auto-sync: Brochure is up to date')
      }
    } catch (error) {
      console.warn('Auto-sync error:', error)
      // Don't show error to user for background sync
    }
  }

  const ensureBrochureAvailableWithChanges = async (brochure: SavedBrochure, brochureId: string) => {
    try {
      // Check if we're already downloading this brochure
      if (downloadingBrochures.has(brochureId || brochure.title)) {
        console.log('View: Brochure already downloading, skipping duplicate download')
        return
      }

      // Check if brochure data exists locally
      const localBrochureResult = await BrochureManagementService.getBrochureData(brochureId)
      
      if (!localBrochureResult.success || !localBrochureResult.data) {
        console.log('View: Brochure data missing, need to download')
        
        // Find the original brochure in available brochures
        const originalBrochure = availableBrochures.find(
          available => (available.brochure_id || available.id) === brochureId
        )

        if (originalBrochure) {
          // Download the original brochure (this will create the brochure_data.json)
          await handleDownloadBrochure(originalBrochure)
          console.log('View: Brochure downloaded and processed')
        } else {
          console.warn('View: Original brochure not found in available brochures')
          return
        }
      } else {
        console.log('View: Local brochure data exists with', localBrochureResult.data.slides.length, 'slides and', localBrochureResult.data.groups.length, 'groups')
        console.log('View: Existing slide titles:', localBrochureResult.data.slides.slice(0, 3).map(s => s.title))
        console.log('View: Existing groups:', localBrochureResult.data.groups.map(g => g.name))
      }

      // Check for and apply server changes (for both newly downloaded and existing files)
      console.log('View: Checking for server changes to apply latest modifications')
      
      // Get local brochure data to find latest modification time
      const localResult = await BrochureManagementService.getBrochureData(brochureId)
      let localLastModified: string | undefined

      if (localResult.success && localResult.data) {
        // Find the most recent modification across all slides and groups
        const slideTimestamps = localResult.data.slides.map(s => s.updatedAt).filter(Boolean)
        const groupTimestamps = localResult.data.groups.map(g => g.updatedAt || g.createdAt).filter(Boolean)
        const allTimestamps = [...slideTimestamps, ...groupTimestamps]
        
        if (allTimestamps.length > 0) {
          localLastModified = allTimestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        }
      }

      // Check if server has newer changes
      const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
        currentUserId,
        brochureId,
        localLastModified
      )

      if (statusResult.success && statusResult.data?.needsDownload) {
        console.log('View: Server has newer changes, downloading and applying them')
        
        // Download and apply server changes
        const downloadResult = await BrochureManagementService.downloadBrochureChanges(
          currentUserId,
          brochureId
        )

        if (downloadResult.success && downloadResult.data) {
          const applyResult = await BrochureManagementService.applyBrochureChanges(
            brochureId,
            downloadResult.data
          )

          if (applyResult.success) {
            console.log('View: Latest changes applied successfully - brochure is now up to date')
          } else {
            console.warn('View: Failed to apply latest changes:', applyResult.error)
          }
        } else {
          console.warn('View: Failed to download latest changes:', downloadResult.error)
        }
      } else {
        console.log('View: Brochure is already up to date with latest changes')
      }

    } catch (error) {
      console.warn('Auto-download error:', error)
      // Don't show error to user - they can still try to view
    }
  }

  const handleViewBrochure = async (brochure: MRAssignedBrochure | SavedBrochure) => {
    try {
      console.log('Viewing brochure:', brochure.title)
      const brochureId = brochure.brochure_id || brochure.id
      console.log('Brochure ID:', brochureId)

      // For saved brochures, ensure file exists and has latest changes
      if ('localId' in brochure && brochureId) {
        await ensureBrochureAvailableWithChanges(brochure, brochureId)
      }

      // Track view
      if (brochureId) {
        await MRService.trackBrochureView(brochureId)
      }
      
      // Log view activity
      try {
        const brochureTitle = 'customTitle' in brochure ? brochure.customTitle : brochure.title
        await MRService.logActivity(currentUserId, 'brochure_view', `Viewed ${brochureTitle}`)
      } catch (error) {
        console.log('Failed to log view activity:', error)
      }
      
      // If it's a saved brochure, increment local view count and update server
      if ('localId' in brochure) {
        // Update server access time
        try {
          if (brochureId) {
            await savedBrochuresSyncService.updateSavedBrochureAccess(currentUserId, brochureId)
          }
        } catch (error) {
          console.warn('Failed to update server access time:', error)
        }

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
          if (brochureId) {
            const result = await BrochureManagementService.getBrochureData(brochureId)
            if (!result.success) {
              // Process the ZIP file first
              console.log('Processing downloaded ZIP file for viewing')
              const processResult = await BrochureManagementService.processZipFile(
                brochureId,
                (brochure as SavedBrochure).localPath,
                brochure.title
              )
              if (!processResult.success) {
                Alert.alert("Error", "Failed to process brochure for viewing")
                return
              }
            }
          }
        }
        
        navigation.navigate('AdminSlideManagement', { 
          brochureId: brochureId,
          brochureTitle: 'customTitle' in brochure ? brochure.customTitle : brochure.title,
          isOffline
        })
      } else {
        // For PDF and other files, use BrochureViewer which shows slides
        navigation.navigate('BrochureViewer', { 
          brochureId: brochureId,
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
      const brochureId = renameBrochure.brochure_id || renameBrochure.id

      // Update server first (only if brochureId is valid)
      if (brochureId) {
        const serverResult = await savedBrochuresSyncService.updateSavedBrochureTitle(
          currentUserId,
          brochureId,
          newTitle.trim()
        )

      }

      // Server update was handled above

      // Update the brochure title locally
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

              const brochureId = brochure.brochure_id || brochure.id

              // Remove from server first
              if (brochureId) {
                try {
                  const serverResult = await savedBrochuresSyncService.removeSavedBrochureFromServer(
                    currentUserId,
                    brochureId
                  )

                  if (serverResult.success) {
                    console.log('Brochure removed from server successfully')
                  } else {
                    console.warn('Failed to remove brochure from server:', serverResult.error)
                  }
                } catch (error) {
                  console.warn('Error removing brochure from server:', error)
                }
              }

              // Remove from local saved brochures
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
      
      {/* Sync Status Indicator */}
      <SyncStatusIndicator position="top-right" />
      
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
              const brochureId = brochure.brochure_id || brochure.id
              const uniqueKey = isSaved ? (brochure as SavedBrochure).localId : `${brochureId}_${index}`
              
            return (
                <View key={uniqueKey} style={styles.brochureCard}>
              <View style={styles.brochureContent}>
                    {(() => {
                      // Check for ZIP brochure thumbnail first
                      const zipThumbnail = brochureThumbnails[brochureId || 'default']
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
                        <View>
                          <Text style={styles.downloadDate}>
                            Downloaded: {new Date((brochure as SavedBrochure).downloadedAt).toLocaleDateString()}
                          </Text>
                          {!(brochure as SavedBrochure).localPath && (
                            <Text style={styles.needsDownloadText}>
                              📥 Will download with latest changes on view
                            </Text>
                          )}
                        </View>
                      )}
                      
                      {/* Background sync is handled automatically - no manual sync UI needed */}
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
                      <View style={styles.downloadSection}>
                        {downloadingBrochures.has(brochure.brochure_id || brochure.id || brochure.title) ? (
                          <View style={styles.downloadProgressContainer}>
                            <View style={styles.downloadProgressHeader}>
                              <ActivityIndicator size="small" color="#10b981" />
                              <Text style={styles.downloadProgressText}>
                                {downloadProgress[(brochureId || brochure.title) as string]?.percentage || 0}%
                              </Text>
                            </View>
                            <View style={styles.downloadProgressBar}>
                              <View 
                                style={[
                                  styles.downloadProgressFill, 
                                  { width: `${downloadProgress[brochure.brochure_id || brochure.id || brochure.title]?.percentage || 0}%` }
                                ]} 
                              />
                            </View>
                          </View>
                        ) : (
                      <TouchableOpacity 
                        style={styles.actionButton}
                            onPress={() => handleDownloadBrochure(brochure)}
                      >
                            <Ionicons name="download" size={16} color="#10b981" />
                            <Text style={styles.actionButtonText}>Download</Text>
                      </TouchableOpacity>
                        )}
                      </View>
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
  downloadSection: {
    flex: 1,
  },
  downloadProgressContainer: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  downloadProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    gap: 8,
  },
  downloadProgressText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10b981",
  },
  downloadProgressBar: {
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 2,
    overflow: "hidden",
  },
  downloadProgressFill: {
    height: "100%",
    backgroundColor: "#10b981",
    borderRadius: 2,
  },
  redownloadButton: {
    backgroundColor: "#f0f9ff",
    borderColor: "#bfdbfe",
  },
  needsDownloadText: {
    fontSize: 11,
    color: "#8b5cf6",
    fontStyle: "italic",
    marginTop: 2,
  },
})