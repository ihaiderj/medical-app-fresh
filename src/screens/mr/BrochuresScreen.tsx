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
import { OfflineBrochureService } from "../../services/offlineBrochureService"
import { useAppData } from "../../context/AppDataContext"
import { useNavigation } from '@react-navigation/native'
import { generateUUID } from "../../utils/uuid"
import { getModalBorderRadius, getModalPadding, isTablet } from "../../utils/responsive"
import { NetworkService } from "../../services/networkService"

interface BrochuresScreenProps {
  navigation?: any
}

interface SavedBrochure extends MRAssignedBrochure {
  localId: string
  localPath: string
  customTitle: string
  downloadedAt: string
  localViewCount: number
  localDownloadCount: number
}

export default function BrochuresScreen(props: BrochuresScreenProps = {}) {
  const { navigation: navigationProp } = props;
  const navFromHook = useNavigation();
  const navigation = navigationProp || navFromHook;
  const { user, notifyBrochureChange } = useAppData();
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [availableBrochures, setAvailableBrochures] = useState<MRAssignedBrochure[]>([])
  const [savedBrochures, setSavedBrochures] = useState<SavedBrochure[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>(["All"])
  const [activeTab, setActiveTab] = useState<'available' | 'saved'>('saved')
  const [brochureThumbnails, setBrochureThumbnails] = useState<{[key: string]: string}>({})
  const [isFromCache, setIsFromCache] = useState(false)
  const [lastSync, setLastSync] = useState(0)
  
  // Download progress state
  const [downloadProgress, setDownloadProgress] = useState<{[key: string]: DownloadProgress}>({})
  const [downloadingBrochures, setDownloadingBrochures] = useState<Set<string>>(new Set())
  
  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameBrochure, setRenameBrochure] = useState<SavedBrochure | null>(null)
  const [newTitle, setNewTitle] = useState('')

  // Load data on component mount and when user becomes available
  useEffect(() => {
    if (user?.id) {
      loadAllData()
    }
  }, [user])

  const loadAllData = async () => {
    setIsLoading(true)
    try {
      // Get userId from context or AuthService
      let userId = user?.id;
      if (!userId) {
        const userResult = await AuthService.getCurrentUser()
        if (userResult.success && userResult.user) {
          userId = userResult.user.id
        } else {
          console.error('BrochuresScreen: No user ID available')
          setAvailableBrochures([])
          setSavedBrochures([])
          setIsLoading(false)
          return
        }
      }
      
      // Load available brochures from admin
      await loadAvailableBrochures(userId)
      
      // Load saved brochures from local storage
      await loadSavedBrochures(userId)
    } catch (error) {
      console.error('Error loading data:', error)
      setAvailableBrochures([])
      setSavedBrochures([])
    } finally {
      setIsLoading(false)
    }
  }

  const loadAvailableBrochures = async (userId: string) => {
    try {
      console.log('Loading available brochures for user (offline-first):', userId)
      
      // Use offline-first brochure service
      const result = await OfflineBrochureService.getAvailableBrochures(userId)
      
      console.log('Brochure result:', {
        count: result.available.length,
        isFromCache: result.isFromCache,
        lastSync: new Date(result.lastSync).toLocaleString()
      })
      
      setAvailableBrochures(result.available)
      setIsFromCache(result.isFromCache)
      setLastSync(result.lastSync)
      
      // Extract unique categories
      const uniqueCategories = ["All", ...new Set(result.available.map(b => b.category).filter(Boolean))]
      setCategories(uniqueCategories)
      
      // Load thumbnails for ZIP brochures
      await loadBrochureThumbnailsForBrochures(result.available)
      
      // Show cache status to user
      if (result.isFromCache && result.available.length > 0) {
        const cacheAge = Date.now() - result.lastSync
        const hoursAgo = Math.floor(cacheAge / (1000 * 60 * 60))
        console.log(`Using cached brochures from ${hoursAgo} hours ago`)
      }
      
    } catch (error) {
      console.error('Error loading available brochures:', error)
      setAvailableBrochures([])
    }
  }

  const loadSavedBrochures = async (userId: string) => {
    try {
      console.log('Loading saved brochures from local DB for user:', userId)
      
      // Load ONLY from local DB (offline-first principle)
      // NO server calls during app usage
      const { LocalDatabaseService } = await import('../../services/localDatabaseService')
      const localBrochures = await LocalDatabaseService.getSavedBrochures(userId)
      
      console.log('Local DB saved brochures:', localBrochures.length)
      
      // Convert local DB records to SavedBrochure[] format
      const validSaved: SavedBrochure[] = []
      
      for (const localBrochure of localBrochures) {
        try {
          // Parse original_brochure_data (it's a JSON string)
          let originalBrochureData: any = {}
          try {
            originalBrochureData = typeof localBrochure.original_brochure_data === 'string'
              ? JSON.parse(localBrochure.original_brochure_data)
              : localBrochure.original_brochure_data || {}
          } catch (parseError) {
            console.warn('Failed to parse original_brochure_data for brochure:', localBrochure.brochure_id, parseError)
            originalBrochureData = {}
          }
          
          // Check if file exists locally
          const downloadDir = FileSystem.documentDirectory + `mr_downloads/${userId}/`
          const expectedFiles = await FileSystem.readDirectoryAsync(downloadDir).catch(() => [])
          
          // Find matching local file by brochure ID
          const matchingFile = expectedFiles.find(file => 
            file.includes(localBrochure.brochure_id) || 
            file.includes(localBrochure.custom_title.replace(/[^a-zA-Z0-9]/g, '_'))
          )
          
          // Also check if brochure data exists (more reliable than file check)
          const brochureDataResult = await BrochureManagementService.getBrochureData(localBrochure.brochure_id)
          
          const localPath = matchingFile ? downloadDir + matchingFile : ''
          let hasLocalFile = false
          if (matchingFile) {
            const fileInfo = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }))
            hasLocalFile = fileInfo.exists
          }
          
          // If brochure data exists, the file is available
          if (brochureDataResult.success) {
            hasLocalFile = true
            // Try to find the actual file path from brochure data directory
            const brochureDir = FileSystem.documentDirectory + `brochures/${localBrochure.brochure_id}/`
            const brochureFiles = await FileSystem.readDirectoryAsync(brochureDir).catch(() => [])
            const zipFile = brochureFiles.find(f => f.endsWith('.zip'))
            if (zipFile) {
              // Use the brochure data directory file if found
            }
          }
          
          console.log('LoadSaved: Processing:', localBrochure.custom_title)
          console.log('  - Brochure ID:', localBrochure.brochure_id)
          console.log('  - File match:', !!matchingFile)
          console.log('  - File exists:', hasLocalFile)
          console.log('  - Data exists:', brochureDataResult.success)
          
          // Create saved brochure entry
          const savedBrochureEntry: SavedBrochure = {
            ...originalBrochureData,
            brochure_id: localBrochure.brochure_id,
            id: localBrochure.brochure_id,
            localId: localBrochure.id,
            localPath: hasLocalFile ? localPath : '',
            customTitle: localBrochure.custom_title || localBrochure.brochure_title || 'Untitled Brochure',
            downloadedAt: localBrochure.saved_at || localBrochure.created_at || new Date().toISOString(),
            localViewCount: 0,
            localDownloadCount: 1
          }
          
          validSaved.push(savedBrochureEntry)
          console.log('LoadSaved: Added:', localBrochure.custom_title, 'hasLocalData:', brochureDataResult.success)
        } catch (error) {
          console.error('Error processing local brochure:', localBrochure.brochure_id, error)
          // Continue with next brochure
        }
      }
      
      console.log('Setting saved brochures from local DB:', validSaved.length, 'brochures')
      setSavedBrochures(validSaved)
      
      // Load thumbnails for saved brochures
      await loadBrochureThumbnailsForSavedBrochures(validSaved)
      
      // Note: Local DB is the source of truth (offline-first mode)
      // Server sync happens only on login (if local DB is empty or outdated)
    } catch (error) {
      console.error('Error loading saved brochures from local DB:', error)
      // Fallback to AsyncStorage if local DB fails
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
              // Always regenerate thumbnail to ensure correct path for current device
              const thumbnailResult = await BrochureManagementService.regenerateThumbnail(brochureId)
              if (thumbnailResult.success && thumbnailResult.thumbnailUri) {
                thumbnails[brochureId] = thumbnailResult.thumbnailUri
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
      
      setBrochureThumbnails(prev => ({...prev, ...thumbnails}))
    } catch (error) {
      console.error('Error loading brochure thumbnails:', error)
    }
  }

  const loadBrochureThumbnailsForSavedBrochures = async (brochures: SavedBrochure[]) => {
    try {
      const thumbnails: {[key: string]: string} = {}
      
      for (const brochure of brochures) {
        try {
          const brochureId = brochure.brochure_id || brochure.id
          if (!brochureId) continue
          
          // Check if brochure data exists (was processed before)
          const result = await BrochureManagementService.getBrochureData(brochureId)
          if (result.success && result.data) {
            // Always regenerate thumbnail to ensure correct path for current device
            const thumbnailResult = await BrochureManagementService.regenerateThumbnail(brochureId)
            if (thumbnailResult.success && thumbnailResult.thumbnailUri) {
              thumbnails[brochureId] = thumbnailResult.thumbnailUri
              console.log('Regenerated thumbnail for saved brochure:', brochureId)
            }
          }
        } catch (error) {
          console.log('Could not load thumbnail for saved brochure:', brochure.brochure_id, error)
        }
      }
      
      setBrochureThumbnails(prev => ({...prev, ...thumbnails}))
    } catch (error) {
      console.error('Error loading saved brochure thumbnails:', error)
    }
  }

  const handleDownloadBrochure = async (brochure: MRAssignedBrochure) => {
    try {
      console.log('Downloading brochure:', brochure.title)

      // Get userId from context or AuthService
      let userId = user?.id;
      if (!userId) {
        const userResult = await AuthService.getCurrentUser();
        if (userResult.success && userResult.user) {
          userId = userResult.user.id;
        }
      }
      if (!userId) {
        Alert.alert('Error', 'User information not available');
        return;
      }

      // CRITICAL FIX: Create a UNIQUE brochure ID for each download
      // This ensures multiple downloads of the same brochure are treated as separate instances
      const originalBrochureId = brochure.brochure_id || brochure.id
      const timestamp = Date.now()
      const uniqueBrochureId = `${originalBrochureId}_${timestamp}` // Each download gets unique ID
      
      // Use original ID for UI tracking (so progress bar shows)
      // But use unique ID for actual storage
      const downloadKey = originalBrochureId || brochure.title
      
      console.log('=== DOWNLOAD DEBUG ===')
      console.log('Original brochure ID:', originalBrochureId)
      console.log('Unique brochure ID for this download:', uniqueBrochureId)
      console.log('Download key for UI:', downloadKey)
      console.log('This will create a NEW separate instance')
      
      setDownloadingBrochures(prev => new Set([...prev, downloadKey]))

      // Create unique ID for this download
      const localId = `${downloadKey}_${timestamp}`
      
      // Check if file already exists locally (from sync)
      const downloadDir = FileSystem.documentDirectory + `mr_downloads/${userId}/`
      const brochureDataResult = await BrochureManagementService.getBrochureData(originalBrochureId)
      
      let localPath = ''
      let fileExists = false
      
      // Check if brochure data exists (more reliable than file check)
      if (brochureDataResult.success && brochureDataResult.data) {
        // Brochure data exists, check for actual file
        const brochureDir = FileSystem.documentDirectory + `brochures/${originalBrochureId}/`
        const brochureFiles = await FileSystem.readDirectoryAsync(brochureDir).catch(() => [])
        const zipFile = brochureFiles.find(f => f.endsWith('.zip') || f.endsWith('.pdf'))
        if (zipFile) {
          localPath = brochureDir + zipFile
          const fileInfo = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }))
          fileExists = fileInfo.exists
        }
      }
      
      // Also check in mr_downloads directory
      if (!fileExists) {
        const expectedFiles = await FileSystem.readDirectoryAsync(downloadDir).catch(() => [])
        const matchingFile = expectedFiles.find(file => 
          file.includes(originalBrochureId) || 
          file.includes(brochure.title.replace(/[^a-zA-Z0-9]/g, '_'))
        )
        if (matchingFile) {
          localPath = downloadDir + matchingFile
          const fileInfo = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }))
          fileExists = fileInfo.exists
        }
      }
      
      if (!fileExists) {
        // File doesn't exist locally - check if online and download from server
        const isOnline = await NetworkService.isOnline();
        
        if (!isOnline) {
          // Offline and file not available - show error
          Alert.alert("Error", "File not available. Please connect to internet to download this brochure.")
          setDownloadingBrochures(prev => {
            const updated = new Set(prev)
            updated.delete(downloadKey)
            return updated
          })
          return
        }
        
        // Online - download from server
        if (!brochure.file_url) {
          // Try to get brochure details from server if file_url is not available
          try {
            const brochuresResult = await MRService.getAssignedBrochures(userId);
            if (brochuresResult.success && brochuresResult.data) {
              const brochureData = brochuresResult.data.find((b: any) => b.id === originalBrochureId);
              if (brochureData && brochureData.file_url) {
                brochure.file_url = brochureData.file_url;
              }
            }
          } catch (error) {
            console.warn('Failed to fetch brochure details:', error);
          }
        }
        
        if (!brochure.file_url) {
          Alert.alert("Error", "Brochure file URL not available. Please try again later.")
          setDownloadingBrochures(prev => {
            const updated = new Set(prev)
            updated.delete(downloadKey)
            return updated
          })
          return
        }
        
        // Download from server
        console.log('Downloading brochure from server:', brochure.title)
        try {
          const downloadResult = await BrochureManagementService.downloadBrochureFile(
            originalBrochureId,
            brochure.file_url,
            userId,
            brochure.title,
            (progress) => {
              // Could show progress here if needed
              console.log(`Download progress: ${progress.percentage}%`)
            }
          )
          
          if (downloadResult.success && downloadResult.localPath) {
            console.log('Brochure downloaded successfully from server:', downloadResult.localPath)
            localPath = downloadResult.localPath
            fileExists = true
          } else {
            Alert.alert("Error", downloadResult.error || "Failed to download brochure. Please try again.")
            setDownloadingBrochures(prev => {
              const updated = new Set(prev)
              updated.delete(downloadKey)
              return updated
            })
            return
          }
        } catch (error) {
          console.error('Error downloading brochure from server:', error)
          Alert.alert("Error", "Failed to download brochure. Please try again.")
          setDownloadingBrochures(prev => {
            const updated = new Set(prev)
            updated.delete(downloadKey)
            return updated
          })
          return
        }
      }
      
      // File exists locally - use it
      console.log('Using existing local file:', localPath)
      
      // Generate custom title with suffix
      const existingBrochuresWithSameTitle = savedBrochures.filter(b => 
        b.title === brochure.title
      ).length
      
      let customTitle = brochure.title
      if (existingBrochuresWithSameTitle > 0) {
        customTitle = `${brochure.title} (${existingBrochuresWithSameTitle + 1})`
      }

      // If it's a ZIP file, ensure it's processed
      if (brochure.file_type?.includes('zip')) {
        console.log('Processing ZIP file for future viewing')
        console.log('Using unique brochure ID:', uniqueBrochureId)
        try {
          // Process ZIP for new download instance
          await BrochureManagementService.processZipFile(
            uniqueBrochureId, // Use unique ID so it doesn't conflict with existing
            localPath,
            customTitle
          )
          console.log('ZIP file processed successfully as NEW instance')
        } catch (error) {
          console.log('ZIP processing failed, will process on first view:', error)
        }
      }

      // Create saved brochure record with unique brochure ID
      const savedBrochure: SavedBrochure = {
        ...brochure,
        brochure_id: uniqueBrochureId, // Use unique ID so each download is separate
        id: uniqueBrochureId,
        localId,
        localPath,
        customTitle,
        downloadedAt: new Date().toISOString(),
        localViewCount: 0,
        localDownloadCount: 1
      }

      // Save to local DB immediately (offline-first principle)
      const { LocalDatabaseService } = await import('../../services/localDatabaseService')
      await LocalDatabaseService.createSavedBrochure({
        server_id: undefined, // Will be set when synced to server
        mr_id: userId,
        brochure_id: uniqueBrochureId,
        brochure_title: brochure.title,
        custom_title: customTitle,
        original_brochure_data: JSON.stringify(brochure),
        saved_at: new Date().toISOString(),
        last_accessed: new Date().toISOString()
      })

      // Save activity to local DB with sync_status: 'pending'
      await LocalDatabaseService.createActivityLog({
        user_id: userId,
        mr_id: userId,
        activity_type: 'brochure_download',
        description: `Downloaded ${customTitle}`,
        metadata: JSON.stringify({ related_id: originalBrochureId, related_type: 'brochure' }),
        is_deleted: false
      })

      // Add to local saved brochures
      const updatedSaved = [...savedBrochures, savedBrochure]
      setSavedBrochures(updatedSaved)

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

      // Notify brochure change
      notifyBrochureChange()

      // Queue server calls for background sync (when user inactive or manual sync):
      // - savedBrochuresSyncService.saveBrochureToServer() - queue for background
      // - MRService.trackBrochureDownload() - queue for background
      // - MRService.logActivity() - already saved to local DB above
      
      console.log('✅ Brochure saved locally, queued for background sync')

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

      // Get userId from context or AuthService
      let userId = user?.id;
      if (!userId) {
        const userResult = await AuthService.getCurrentUser();
        if (userResult.success && userResult.user) {
          userId = userResult.user.id;
        }
      }
      if (!userId) {
        console.warn('Auto-download error: User information not available');
        return;
      }
      
      // Check sync status
      const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
        userId,
        brochureId,
        localLastModified
      )

      if (statusResult.success && statusResult.data?.needsDownload) {
        console.log('Auto-sync: Downloading newer changes from server')
        
        // Download and apply changes automatically
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
      
      // CRITICAL: Also check if actual image files exist, not just the JSON metadata
      let imageFilesExist = false
      if (localBrochureResult.success && localBrochureResult.data && localBrochureResult.data.slides.length > 0) {
        const firstSlide = localBrochureResult.data.slides[0]
        if (firstSlide.imageUri) {
          const fileInfo = await FileSystem.getInfoAsync(firstSlide.imageUri)
          imageFilesExist = fileInfo.exists
          console.log('View: First slide image exists?', imageFilesExist, 'Path:', firstSlide.imageUri)
        }
      }
      
      if (!localBrochureResult.success || !localBrochureResult.data || !imageFilesExist) {
        if (!imageFilesExist && localBrochureResult.data) {
          console.log('View: Brochure metadata exists but image files are missing - need to re-download ZIP')
        } else {
          console.log('View: Local brochure data missing completely')
        }
        
        // CRITICAL FIX: When image files are missing, we need the original ZIP file
        // Find the original brochure to get the file_url
        let originalBrochureId = brochureId
        
        // If brochureId has timestamp suffix (e.g., "id_123456"), extract original ID
        if (brochureId.includes('_')) {
          const parts = brochureId.split('_')
          // Check if last part is a timestamp (all digits)
          if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
            originalBrochureId = parts.slice(0, -1).join('_')
            console.log('View: Extracted original brochure ID:', originalBrochureId)
          }
        }
        
        // Try to find file_url from multiple sources
        let fileUrl: string | null = null
        
        // 1. First, check availableBrochures array
        const originalBrochure = availableBrochures.find(
          available => (available.brochure_id || available.id) === originalBrochureId
        )
        
        if (originalBrochure && originalBrochure.file_url) {
          fileUrl = originalBrochure.file_url
          console.log('View: Found file_url in availableBrochures')
        }
        
        // 2. If not found, check the saved brochure's file_url property
        if (!fileUrl && brochure.file_url) {
          fileUrl = brochure.file_url
          console.log('View: Found file_url in saved brochure data')
        }
        
        // 3. If still not found, try to fetch from server using brochure ID
        if (!fileUrl) {
          console.log('View: file_url not found locally, fetching brochure details from server')
          try {
            const brochureDetails = await MRService.getBrochureById(originalBrochureId)
            if (brochureDetails && brochureDetails.file_url) {
              fileUrl = brochureDetails.file_url
              console.log('View: Found file_url from server')
            }
          } catch (serverError) {
            console.error('View: Failed to fetch brochure from server:', serverError)
          }
        }

        if (fileUrl) {
          console.log('View: Downloading original ZIP file to get images')
          
          // Download the ZIP file to get actual image files
          const downloadDir = FileSystem.documentDirectory + `brochures/${brochureId}/`
          const dirInfo = await FileSystem.getInfoAsync(downloadDir)
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true })
          }

          const zipPath = downloadDir + 'temp.zip'
          
          try {
            const downloadResult = await FileStorageService.downloadFile(
              fileUrl,
              zipPath
            )

            if (downloadResult.success) {
              console.log('View: ZIP downloaded, processing...')
              await BrochureManagementService.processZipFile(
                brochureId,
                zipPath,
                brochure.title
              )
              console.log('View: ZIP processed successfully, images extracted')
              
              // Get userId from context or AuthService
              let userId = user?.id;
              if (!userId) {
                const userResult = await AuthService.getCurrentUser();
                if (userResult.success && userResult.user) {
                  userId = userResult.user.id;
                }
              }
              if (!userId) {
                console.warn('View error: User information not available');
                return;
              }
              
              // Now download and apply user's modifications (if any)
              const changesResult = await BrochureManagementService.downloadBrochureChanges(
                userId,
                brochureId
              )

              if (changesResult.success && changesResult.data) {
                console.log('View: Applying user modifications on top of fresh images')
                await BrochureManagementService.applyBrochureChanges(
                  brochureId,
                  changesResult.data
                )
              }
            } else {
              throw new Error(downloadResult.error || 'ZIP download failed')
            }
          } catch (zipError) {
            console.error('View: Failed to download/process ZIP:', zipError)
            Alert.alert('Error', 'Could not load brochure images')
            return
          }
        } else {
          console.error('View: Could not find original brochure to download')
          Alert.alert('Error', 'Could not load brochure data')
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

      // Get userId from context or AuthService
      let userId = user?.id;
      if (!userId) {
        const userResult = await AuthService.getCurrentUser();
        if (userResult.success && userResult.user) {
          userId = userResult.user.id;
        }
      }
      if (!userId) {
        console.warn('View error: User information not available');
        return;
      }
      
      // Check if server has newer changes
      const statusResult = await BrochureManagementService.checkBrochureSyncStatus(
        userId,
        brochureId,
        localLastModified
      )

      if (statusResult.success && statusResult.data?.needsDownload) {
        console.log('View: Server has newer changes, downloading and applying them')
        
        // Download and apply server changes
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
      
      // Get userId from context or AuthService
      let userId = user?.id;
      if (!userId) {
        const userResult = await AuthService.getCurrentUser();
        if (userResult.success && userResult.user) {
          userId = userResult.user.id;
        }
      }
      if (!userId) {
        Alert.alert('Error', 'User information not available');
        return;
      }

      // Save view tracking locally first (offline-first principle)
      // NO blocking server calls during app usage
      const brochureTitle = 'customTitle' in brochure ? brochure.customTitle : brochure.title
      
      // Update local brochure view count in local DB
      if (brochureId) {
        try {
          const { LocalDatabaseService } = await import('../../services/localDatabaseService')
          
          // Update local brochure view count
          // Get brochure from local DB and increment view count
          const localBrochure = await LocalDatabaseService.getSavedBrochureById(brochureId).catch(() => null)
          if (localBrochure) {
            // Update view count locally (could add a view_count field to saved_brochures table)
            // For now, just track in local state
          }
          
          // Save activity to local DB with sync_status: 'pending'
          await LocalDatabaseService.createActivityLog({
            user_id: userId,
            mr_id: userId,
            activity_type: 'brochure_view',
            description: `Viewed ${brochureTitle}`,
            metadata: JSON.stringify({ related_id: brochureId, related_type: 'brochure' }),
            is_deleted: false
          })
          
          // Queue server calls for background sync (when user inactive or manual sync):
          // - BrochureManagementService.checkBrochureSyncStatus() - queue for background
          // - savedBrochuresSyncService.updateSavedBrochureAccess() - queue for background
          // - MRService.trackBrochureView() - queue for background
          // - MRService.logActivity() - already saved to local DB above
          
          console.log('✅ View tracking saved locally, queued for background sync')
        } catch (error) {
          console.warn('Failed to save view tracking locally:', error)
          // Continue with viewing even if tracking fails
        }
      }
      
      // If it's a saved brochure, increment local view count
      if ('localId' in brochure) {
        const updatedSaved = savedBrochures.map(b => 
          b.localId === brochure.localId 
            ? { ...b, localViewCount: b.localViewCount + 1 }
            : b
        )
        setSavedBrochures(updatedSaved)
        
        // Save to AsyncStorage (userId is already validated above)
        const key = `mr_saved_brochures_${userId}`
        await AsyncStorage.setItem(key, JSON.stringify(updatedSaved)).catch(() => {})
      }

      // Determine file URL
      let fileUrl = brochure.file_url
      let isOffline = false
      
      if ('localPath' in brochure) {
        // This is a saved brochure, use local path
        fileUrl = brochure.localPath
        isOffline = true
      }

      // Proceed with viewing brochure
      await proceedWithViewing(brochure, brochureId, fileUrl, isOffline);
    } catch (error) {
      console.error('View error:', error)
      Alert.alert("Error", "Failed to view brochure")
    }
  }

  const proceedWithViewing = async (
    brochure: MRAssignedBrochure | SavedBrochure,
    brochureId: string,
    fileUrl: string | undefined,
    isOffline: boolean
  ) => {
    try {
      // Check if this is a saved brochure - saved brochures should always use SlideManagement
      const isSavedBrochure = 'localId' in brochure;
      
      if (isSavedBrochure) {
        // For saved brochures, always use SlideManagement screen (has all functionalities)
        // For saved brochures that are ZIP files, we need to process them first if not already processed
        if (isOffline && (brochure as SavedBrochure).localPath) {
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
        
        const brochureTitle = ('customTitle' in brochure && brochure.customTitle) 
          ? brochure.customTitle 
          : ('title' in brochure ? brochure.title : 'Untitled Brochure')
        
        navigation.navigate('SlideManagement', { 
          brochureId: brochureId,
          brochureTitle: brochureTitle,
          isOffline
        })
      } else {
        // For available brochures, navigate based on file type
        if (brochure.file_type?.includes('zip')) {
          // For ZIP files, use SlideManagement screen
          navigation.navigate('SlideManagement', { 
            brochureId: brochureId,
            brochureTitle: brochure.title,
            isOffline
          })
        } else {
          // For PDF and other files, use BrochureViewer which shows slides
          navigation.navigate('BrochureViewer', { 
            brochureId: brochureId,
            brochureTitle: brochure.title,
            brochureFile: fileUrl,
            isOffline
          })
        }
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

      // Get userId from context or AuthService
      let userId = user?.id;
      if (!userId) {
        const userResult = await AuthService.getCurrentUser();
        if (userResult.success && userResult.user) {
          userId = userResult.user.id;
        }
      }
      if (!userId) {
        Alert.alert('Error', 'User information not available');
        return;
      }

      // Update database entry if it exists (for sync queue)
      try {
        const { LocalDatabaseService } = await import('../../services/localDatabaseService');
        const savedBrochure = await LocalDatabaseService.getSavedBrochureById(renameBrochure.localId);
        if (savedBrochure) {
          // Update in database and queue for sync (don't skip sync queue)
          await LocalDatabaseService.updateSavedBrochure(renameBrochure.localId, {
            custom_title: newTitle.trim(),
            sync_status: 'pending'
          }, false); // false = don't skip sync queue
        }
      } catch (dbError) {
        console.warn('Failed to update saved brochure in database:', dbError);
        // Continue with AsyncStorage update
      }

      // Update server if online (only if brochureId is valid)
      if (brochureId) {
        const serverResult = await savedBrochuresSyncService.updateSavedBrochureTitle(
          userId,
          brochureId,
          newTitle.trim()
        )
        // If server update succeeds, mark as synced
        if (serverResult.success) {
          try {
            const { LocalDatabaseService } = await import('../../services/localDatabaseService');
            await LocalDatabaseService.updateSavedBrochure(renameBrochure.localId, {
              sync_status: 'synced'
            }, true); // true = skip sync queue since already synced
          } catch (dbError) {
            console.warn('Failed to mark brochure as synced:', dbError);
          }
        }
      }

      // Update the brochure title locally (for UI)
      const updatedSaved = savedBrochures.map(b => 
        b.localId === renameBrochure.localId 
          ? { ...b, customTitle: newTitle.trim() }
          : b
      )
      
      setSavedBrochures(updatedSaved)
      
      // Save to AsyncStorage (for backward compatibility)
      const key = `mr_saved_brochures_${userId}`
      await AsyncStorage.setItem(key, JSON.stringify(updatedSaved))
      
      setShowRenameModal(false)
      setRenameBrochure(null)
      setNewTitle('')
      
      // Notify brochure change
      notifyBrochureChange()
      
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
              
              // Get userId from context or AuthService
              let userId = user?.id;
              if (!userId) {
                const userResult = await AuthService.getCurrentUser();
                if (userResult.success && userResult.user) {
                  userId = userResult.user.id;
                }
              }
              if (!userId) {
                Alert.alert('Error', 'User information not available');
                return;
              }

              // Remove from server first (removes both saved_brochures and brochure_sync records)
              if (brochureId) {
                try {
                  console.log('=== DELETING BROCHURE FROM SERVER ===')
                  console.log('Brochure ID:', brochureId)
                  console.log('This will delete:')
                  console.log('  1. Saved brochure record from saved_brochures table')
                  console.log('  2. All modifications from brochure_sync table (groups, renamed slides, etc.)')
                  
                  const serverResult = await savedBrochuresSyncService.removeSavedBrochureFromServer(
                    userId,
                    brochureId
                  )

                  if (serverResult.success) {
                    console.log('✅ Brochure and all modifications removed from server successfully')
                  } else {
                    console.warn('❌ Failed to remove brochure from server:', serverResult.error)
                  }
                } catch (error) {
                  console.warn('❌ Error removing brochure from server:', error)
                }
              }

              // Remove from local saved brochures using unique brochure_id
              // This ensures we only remove the specific brochure, not all with same localId
              const brochureIdToDelete = brochure.brochure_id || brochure.id
              const updatedSaved = savedBrochures.filter(b => 
                (b.brochure_id || b.id) !== brochureIdToDelete
              )
              
              console.log('Removing brochure with ID:', brochureIdToDelete)
              console.log('Before delete:', savedBrochures.length, 'brochures')
              console.log('After delete:', updatedSaved.length, 'brochures')
              
              setSavedBrochures(updatedSaved)

              // Update AsyncStorage (userId already defined above)
              const key = `mr_saved_brochures_${userId}`
              await AsyncStorage.setItem(key, JSON.stringify(updatedSaved))

              // Notify brochure change
              notifyBrochureChange()

              // Log delete activity
              try {
                // Save activity to local DB with sync_status: 'pending'
                const { LocalDatabaseService } = await import('../../services/localDatabaseService')
                await LocalDatabaseService.createActivityLog({
                  user_id: userId,
                  mr_id: userId,
                  activity_type: 'brochure_delete',
                  description: `Deleted ${brochure.customTitle}`,
                  metadata: JSON.stringify({ related_id: brochure.brochure_id || brochure.id, related_type: 'brochure' }),
                  is_deleted: false
                })
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
        return title && title.toLowerCase().includes(searchQuery.toLowerCase())
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
      <SyncStatusIndicator status="synced" />
      
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
            <View style={styles.tabContent}>
              <View style={styles.tabHeader}>
                <Ionicons 
                  name={isFromCache ? "cloud-offline" : "cloud-outline"} 
                  size={20} 
                  color={activeTab === 'available' ? '#3b82f6' : '#6b7280'} 
                />
                <Text style={[styles.tabText, activeTab === 'available' && styles.activeTabText]}>
                  Available ({availableBrochures.length})
                </Text>
              </View>
              {isFromCache && activeTab === 'available' && (
                <Text style={styles.cacheIndicator}>
                  📱 Offline • {lastSync > 0 ? `${Math.floor((Date.now() - lastSync) / (1000 * 60 * 60))}h ago` : 'Cached'}
                </Text>
              )}
            </View>
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
              // Use a truly unique key that includes timestamp to prevent duplicates
              const uniqueKey = isSaved 
                ? `${(brochure as SavedBrochure).localId}_${index}` 
                : `${brochureId}_${index}`
              
            return (
                <View key={uniqueKey} style={styles.brochureCard}>
              <View style={styles.brochureContent}>
                    {(() => {
                      // Check for ZIP brochure thumbnail first (for downloaded/processed brochures)
                      // For saved brochures, use the actual brochure_id (which might include timestamp)
                      const thumbnailKey = isSaved ? brochureId : brochureId
                      const zipThumbnail = brochureThumbnails[thumbnailKey || 'default']
                      
                      if (zipThumbnail) {
                        return (
                <Image 
                            source={{ uri: zipThumbnail }}
                            style={styles.brochureImage}
                            onError={() => console.log('Failed to load ZIP thumbnail:', zipThumbnail, 'for key:', thumbnailKey)}
                          />
                        )
                      }
                      
                      // Then check for database thumbnail_url (for available brochures)
                      if (brochure.thumbnail_url) {
                        return (
                <Image 
                            source={{ uri: brochure.thumbnail_url }}
                            style={styles.brochureImage}
                            onError={(e) => {
                              console.log('Failed to load database thumbnail:', brochure.thumbnail_url)
                              console.log('Error:', e.nativeEvent.error)
                            }}
                            onLoad={() => console.log('Thumbnail loaded successfully:', brochure.title)}
                          />
                        )
                      }
                      
                      // Show placeholder
                      console.log('No thumbnail available for:', brochure.title, 'ID:', brochureId)
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
  tabContent: {
    alignItems: "center",
  },
  tabHeader: {
    flexDirection: "row",
    alignItems: "center",
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
  cacheIndicator: {
    fontSize: 10,
    color: "#f59e0b",
    marginTop: 2,
    fontWeight: "500",
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
    borderTopLeftRadius: getModalBorderRadius(),
    borderTopRightRadius: getModalBorderRadius(),
    paddingHorizontal: getModalPadding(),
    paddingTop: isTablet() ? 24 : 20,
    paddingBottom: isTablet() ? 50 : 40,
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