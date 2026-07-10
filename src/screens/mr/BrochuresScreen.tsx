import { useState, useCallback, useEffect, useRef } from "react"
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
  AppState,
  RefreshControl,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import * as FileSystem from 'expo-file-system'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AuthService } from "../../services/AuthService"
import { MRService, MRAssignedBrochure } from "../../services/MRService"
import { BrochureManagementService } from "../../services/brochureManagementService"
import { FileStorageService, DownloadProgress } from "../../services/fileStorageService"
// import SavedBrochureSyncStatus from "../../components/SavedBrochureSyncStatus" // DELETED
// import { savedBrochuresSyncService, SavedBrochureServerData } from "../../services/savedBrochuresSyncService" // DELETED
// import SyncStatusIndicator from "../../components/SyncStatusIndicator" // DELETED
import { OfflineBrochureService } from "../../services/offlineBrochureService"
import { NetworkService } from "../../services/networkService"
import { useAppData } from "../../context/AppDataContext"
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { generateUUID } from "../../utils/uuid"
import { getModalBorderRadius, getModalPadding, isTablet } from "../../utils/responsive"
import { resolveMediaUrl } from "../../config/apiConfig"
import { isPdfBrochure, isZipBrochure } from "../../utils/brochureTypeUtils"
import { PDFConversionService } from "../../services/pdfConversionService"
import { BrochureRefreshService } from "../../services/brochureRefreshService"
import { ConnectionMode, NetworkAlerts, getConnectionBanner } from "../../utils/networkAlerts"

interface BrochurePrepareResult {
  success: boolean
  adminFileRefreshed?: boolean
  offlineBlocked?: boolean
  error?: string
}

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
  const [isDeviceOffline, setIsDeviceOffline] = useState(false)
  const [lastSync, setLastSync] = useState(0)
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('online')
  const [connectionDetail, setConnectionDetail] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [isPreparingView, setIsPreparingView] = useState(false)
  const wasOnlineRef = useRef<boolean | null>(null)
  
  // Download progress state
  const [downloadProgress, setDownloadProgress] = useState<{[key: string]: DownloadProgress}>({})
  const [downloadingBrochures, setDownloadingBrochures] = useState<Set<string>>(new Set())
  
  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameBrochure, setRenameBrochure] = useState<SavedBrochure | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const formatSyncAge = (syncTime: number): string => {
    if (!syncTime) return 'cached'
    const minutes = Math.floor((Date.now() - syncTime) / (1000 * 60))
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  // Refresh when screen is focused (mount and when returning from other screens)
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadAllData(false)
      }
    }, [user?.id]),
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && user?.id) {
        loadAllData(false)
      }
    })
    return () => subscription.remove()
  }, [user?.id])

  useEffect(() => {
    const unsubscribe = NetworkService.addListener((state) => {
      const online = state.isConnected && state.isInternetReachable
      if (wasOnlineRef.current === true && !online) {
        setConnectionMode('offline')
        setConnectionDetail('You are offline. Cached and saved brochures remain available.')
        setIsDeviceOffline(true)
        NetworkAlerts.wentOffline()
      } else if (wasOnlineRef.current === false && online) {
        NetworkAlerts.backOnline()
        if (user?.id) {
          loadAllData(false)
        }
      }
      wasOnlineRef.current = online
    })
    return unsubscribe
  }, [user?.id])

  const applyConnectionState = (
    mode: ConnectionMode,
    detail: string,
    syncTime: number,
    fromCache: boolean,
    deviceOffline: boolean,
  ) => {
    setConnectionMode(mode)
    setConnectionDetail(detail)
    setLastSync(syncTime)
    setIsFromCache(fromCache)
    setIsDeviceOffline(deviceOffline)
  }

  const loadAllData = async (showRefreshAlert = false) => {
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
      
      // Load available brochures from admin (refresh from server when online)
      const isOnline = await NetworkService.isOnline()
      wasOnlineRef.current = isOnline

      if (isOnline) {
        const refreshResult = await BrochureRefreshService.refreshFromServer(userId)
        if (refreshResult.success) {
          const syncTime = Date.now()
          setAvailableBrochures(refreshResult.brochures)
          const detail =
            refreshResult.filesInvalidated && refreshResult.filesInvalidated > 0
              ? `Synced just now • ${refreshResult.filesInvalidated} saved brochure(s) updated on server`
              : `Synced ${formatSyncAge(syncTime)}`
          applyConnectionState('online', detail, syncTime, false, false)
          const uniqueCategories = ["All", ...new Set(refreshResult.brochures.map((b) => b.category).filter(Boolean))]
          setCategories(uniqueCategories)
          await loadBrochureThumbnailsForBrochures(refreshResult.brochures)
          if (showRefreshAlert) {
            NetworkAlerts.refreshSuccess(refreshResult.brochures.length)
          }
        } else {
          await loadAvailableBrochures(userId)
          applyConnectionState(
            'sync_failed',
            refreshResult.error || 'Could not reach server. Showing cached brochures.',
            lastSync,
            true,
            false,
          )
          if (showRefreshAlert) {
            NetworkAlerts.refreshFailed()
          }
        }
      } else {
        await loadAvailableBrochures(userId)
        applyConnectionState(
          'offline',
          `Offline • last sync ${formatSyncAge(lastSync)}`,
          lastSync,
          true,
          true,
        )
        if (showRefreshAlert) {
          NetworkAlerts.refreshOffline()
        }
      }
      
      // Load saved brochures from local storage (metadata already merged when online)
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
      const syncTime = result.lastSync || Date.now()
      if (result.isDeviceOffline) {
        applyConnectionState(
          'offline',
          `Offline • last sync ${formatSyncAge(syncTime)}`,
          syncTime,
          true,
          true,
        )
      } else if (result.isFromCache) {
        applyConnectionState(
          'cached',
          `Using cached data • ${formatSyncAge(syncTime)}`,
          syncTime,
          true,
          false,
        )
      } else {
        applyConnectionState('online', `Synced ${formatSyncAge(syncTime)}`, syncTime, false, false)
      }
      
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

      const key = `mr_saved_brochures_${userId}`
      await AsyncStorage.setItem(key, JSON.stringify(validSaved))
      
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
        try {
          const brochureId = brochure.brochure_id || brochure.id
          if (!brochureId) continue

          if (isZipBrochure(brochure)) {
            const result = await BrochureManagementService.getBrochureData(brochureId)
            if (result.success && result.data) {
              const thumbnailResult = await BrochureManagementService.regenerateThumbnail(brochureId)
              if (thumbnailResult.success && thumbnailResult.thumbnailUri) {
                thumbnails[brochureId] = thumbnailResult.thumbnailUri
              }
            }
          } else if (isPdfBrochure(brochure)) {
            const result = await BrochureManagementService.getBrochureData(brochureId)
            if (result.success && result.data?.thumbnailUri) {
              thumbnails[brochureId] = result.data.thumbnailUri
            } else if (brochure.thumbnail_url) {
              thumbnails[brochureId] = resolveMediaUrl(brochure.thumbnail_url)
            }
          }
        } catch (error) {
          console.log('Could not load thumbnail for brochure:', brochure.brochure_id, error)
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

          const result = await BrochureManagementService.getBrochureData(brochureId)
          if (result.success && result.data) {
            if (isZipBrochure(brochure, brochure.localPath)) {
              const thumbnailResult = await BrochureManagementService.regenerateThumbnail(brochureId)
              if (thumbnailResult.success && thumbnailResult.thumbnailUri) {
                thumbnails[brochureId] = thumbnailResult.thumbnailUri
              }
            } else if (result.data.thumbnailUri) {
              thumbnails[brochureId] = result.data.thumbnailUri
            }
          } else if (isPdfBrochure(brochure, brochure.localPath) && brochure.localPath) {
            const processResult = await BrochureManagementService.processPdfFile(
              brochureId,
              brochure.localPath,
              brochure.customTitle || brochure.title,
            )
            if (processResult.success && processResult.thumbnailUri) {
              thumbnails[brochureId] = processResult.thumbnailUri
            }
          } else if (brochure.thumbnail_url) {
            thumbnails[brochureId] = resolveMediaUrl(brochure.thumbnail_url)
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

  const handleManualRefresh = async () => {
    if (!user?.id) return
    setRefreshing(true)
    try {
      const isOnline = await NetworkService.isOnline()
      if (!isOnline) {
        NetworkAlerts.refreshOffline()
        return
      }
      await loadAllData(true)
    } finally {
      setRefreshing(false)
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

      // Use the server brochure ID for storage and sync; local DB row id stays unique.
      const originalBrochureId = brochure.brochure_id || brochure.id
      const downloadKey = originalBrochureId || brochure.title
      
      console.log('=== DOWNLOAD DEBUG ===')
      console.log('Brochure ID for storage/sync:', originalBrochureId)
      console.log('Download key for UI:', downloadKey)
      
      setDownloadingBrochures(prev => new Set([...prev, downloadKey]))

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
          NetworkAlerts.offlineDownloadBlocked()
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

      // Process by file type after download
      if (isZipBrochure(brochure, localPath)) {
        console.log('Processing ZIP file for future viewing')
        try {
          const zipResult = await BrochureManagementService.processZipFile(
            originalBrochureId,
            localPath,
            customTitle,
          )
          if (zipResult.success && zipResult.brochureData?.thumbnailUri) {
            setBrochureThumbnails(prev => ({
              ...prev,
              [originalBrochureId]: zipResult.brochureData!.thumbnailUri!,
            }))
          }
          console.log('ZIP file processed successfully')
        } catch (error) {
          console.log('ZIP processing failed, will process on first view:', error)
        }
      } else if (isPdfBrochure(brochure, localPath)) {
        console.log('Processing PDF file for future viewing')
        try {
          const pdfResult = await BrochureManagementService.processPdfFile(
            originalBrochureId,
            localPath,
            customTitle,
          )
          if (pdfResult.success && pdfResult.thumbnailUri) {
            setBrochureThumbnails(prev => ({
              ...prev,
              [originalBrochureId]: pdfResult.thumbnailUri!,
            }))
          }
          console.log('PDF file processed successfully')
        } catch (error) {
          console.log('PDF processing failed, will process on first view:', error)
        }
      }

      // Save to local DB immediately (offline-first principle)
      const { LocalDatabaseService } = await import('../../services/localDatabaseService')
      const savedBrochureDbId = await LocalDatabaseService.createSavedBrochure({
        server_id: undefined, // Will be set when synced to server
        mr_id: userId,
        brochure_id: originalBrochureId,
        brochure_title: brochure.title,
        custom_title: customTitle,
        original_brochure_data: JSON.stringify(brochure),
        saved_at: new Date().toISOString(),
        last_accessed: new Date().toISOString()
      })

      // Create saved brochure record
      const savedBrochure: SavedBrochure = {
        ...brochure,
        brochure_id: originalBrochureId,
        id: savedBrochureDbId,
        localId: savedBrochureDbId,
        localPath,
        customTitle,
        downloadedAt: new Date().toISOString(),
        localViewCount: 0,
        localDownloadCount: 1
      }

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

  const ensureBrochureAvailableWithChanges = async (
    brochure: SavedBrochure,
    brochureId: string,
  ): Promise<BrochurePrepareResult> => {
    try {
      let userId = user?.id
      if (!userId) {
        const userResult = await AuthService.getCurrentUser()
        if (userResult.success && userResult.user) {
          userId = userResult.user.id
        }
      }
      if (!userId) {
        return { success: false, error: 'User information not available' }
      }

      const serverBrochure = availableBrochures.find(
        (item) => (item.brochure_id || item.id) === brochureId,
      )
      const refreshResult = await BrochureRefreshService.ensureLatestAdminFile(userId, brochureId, serverBrochure)
      const adminFileRefreshed = refreshResult.refreshed
      if (refreshResult.error && !refreshResult.refreshed) {
        return { success: false, adminFileRefreshed, error: refreshResult.error }
      }

      // Check if we're already downloading this brochure
      if (downloadingBrochures.has(brochureId || brochure.title)) {
        console.log('View: Brochure already downloading, skipping duplicate download')
        return { success: true, adminFileRefreshed }
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
            return {
              success: false,
              adminFileRefreshed,
              error: zipError instanceof Error ? zipError.message : 'Could not load brochure images',
            }
          }
        } else {
          const isOnline = await NetworkService.isOnline()
          if (!isOnline) {
            return { success: false, offlineBlocked: true, adminFileRefreshed }
          }
          return { success: false, adminFileRefreshed, error: 'Could not load brochure data from server' }
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

      return { success: true, adminFileRefreshed }
    } catch (error) {
      console.warn('Auto-download error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare brochure',
      }
    }
  }

  const handleViewBrochure = async (brochure: MRAssignedBrochure | SavedBrochure) => {
    setIsPreparingView(true)
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

      const isOnline = await NetworkService.isOnline()
      let adminFileRefreshed = false

      // When online, pull the latest admin file and MR slide edits before viewing
      if (isOnline && 'localId' in brochure) {
        const prepResult = await ensureBrochureAvailableWithChanges(brochure as SavedBrochure, brochureId)
        if (prepResult.offlineBlocked) {
          NetworkAlerts.viewOfflineNoFile()
          return
        }
        if (!prepResult.success && prepResult.error) {
          NetworkAlerts.updateFailedUseLocal(prepResult.error)
        }
        adminFileRefreshed = prepResult.adminFileRefreshed || false
      } else if (isOnline) {
        const refreshResult = await BrochureRefreshService.ensureLatestAdminFile(userId, brochureId, brochure)
        adminFileRefreshed = refreshResult.refreshed
        if (refreshResult.error && !refreshResult.refreshed) {
          NetworkAlerts.updateFailedUseLocal(refreshResult.error)
        }
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
      
      if ('localId' in brochure) {
        const downloadDir = FileSystem.documentDirectory + `mr_downloads/${userId}/`
        const downloadFiles = await FileSystem.readDirectoryAsync(downloadDir).catch(() => [])
        const matchingDownload = downloadFiles.find((file) => file.includes(brochureId))
        if (matchingDownload) {
          fileUrl = downloadDir + matchingDownload
          isOffline = true
        } else {
          const brochureDir = FileSystem.documentDirectory + `brochures/${brochureId}/`
          const brochureFiles = await FileSystem.readDirectoryAsync(brochureDir).catch(() => [])
          const brochureFile = brochureFiles.find((file) => file.endsWith('.zip') || file.endsWith('.pdf'))
          if (brochureFile) {
            fileUrl = brochureDir + brochureFile
            isOffline = true
          } else if ((brochure as SavedBrochure).localPath) {
            const fileInfo = await FileSystem.getInfoAsync((brochure as SavedBrochure).localPath).catch(() => ({ exists: false }))
            if (fileInfo.exists) {
              fileUrl = (brochure as SavedBrochure).localPath
              isOffline = true
            }
          }
        }

        const serverBrochure = availableBrochures.find(
          (item) => (item.brochure_id || item.id) === brochureId,
        )
        if (serverBrochure?.file_url) {
          brochure.file_url = serverBrochure.file_url
        }
      }

      if (!fileUrl) {
        if (!isOnline) {
          NetworkAlerts.viewOfflineNoFile()
        } else if ('localId' in brochure) {
          NetworkAlerts.viewOfflineNoFile()
        } else {
          NetworkAlerts.downloadRequired()
        }
        return
      }

      if (adminFileRefreshed) {
        NetworkAlerts.fileUpdated()
      }

      // Proceed with viewing brochure
      await proceedWithViewing(brochure, brochureId, fileUrl, isOffline);
    } catch (error) {
      console.error('View error:', error)
      Alert.alert("Error", "Failed to view brochure")
    } finally {
      setIsPreparingView(false)
    }
  }

  const proceedWithViewing = async (
    brochure: MRAssignedBrochure | SavedBrochure,
    brochureId: string,
    fileUrl: string | undefined,
    isOffline: boolean
  ) => {
    try {
      const isSavedBrochure = 'localId' in brochure
      const localPath = isSavedBrochure ? (brochure as SavedBrochure).localPath : fileUrl
      const brochureTitle = ('customTitle' in brochure && brochure.customTitle)
        ? brochure.customTitle
        : brochure.title

      const zipBrochure = isZipBrochure(brochure, localPath)
      const pdfBrochure = isPdfBrochure(brochure, localPath)

      if (zipBrochure) {
        if (isOffline && localPath && brochureId) {
          const result = await BrochureManagementService.getBrochureData(brochureId)
          if (!result.success) {
            const processResult = await BrochureManagementService.processZipFile(
              brochureId,
              localPath,
              brochureTitle,
            )
            if (!processResult.success) {
              Alert.alert('Error', processResult.error || 'Failed to process brochure for viewing')
              return
            }
          }
        }

        navigation.navigate('SlideManagement', {
          brochureId,
          brochureTitle,
          isOffline,
        })
        return
      }

      if (pdfBrochure) {
        if (isOffline && localPath && brochureId) {
          const converted = await PDFConversionService.isPresentationConverted(brochureId)
          if (!converted) {
            const processResult = await BrochureManagementService.processPdfFile(
              brochureId,
              localPath,
              brochureTitle,
            )
            if (!processResult.success) {
              console.warn('PDF processing failed, opening raw PDF viewer:', processResult.error)
            }
          }
        }

        navigation.navigate('BrochureViewer', {
          brochureId,
          brochureTitle,
          brochureFile: localPath || fileUrl,
          isOffline,
        })
        return
      }

      navigation.navigate('BrochureViewer', {
        brochureId,
        brochureTitle,
        brochureFile: fileUrl,
        isOffline,
      })
    } catch (error) {
      console.error('View error:', error)
      Alert.alert('Error', 'Failed to view brochure')
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
            sync_status: 'pending',
          });
        }
      } catch (dbError) {
        console.warn('Failed to update saved brochure in database:', dbError);
        // Continue with AsyncStorage update
      }

      // Update server if online (only if brochureId is valid)
      if (brochureId) {
        // TODO: Queue saved brochure title update for sync
        // const serverResult = await savedBrochuresSyncService.updateSavedBrochureTitle(
        //   userId,
        //   brochureId,
        //   newTitle.trim()
        // )
        const serverResult = { success: true } // Placeholder - changes are queued
        // If server update succeeds, mark as synced
        if (serverResult.success) {
          try {
            const { LocalDatabaseService } = await import('../../services/localDatabaseService');
            await LocalDatabaseService.updateSavedBrochure(renameBrochure.localId, {
              sync_status: 'synced',
              skipSyncQueue: true,
            });
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

              const { LocalDatabaseService } = await import('../../services/localDatabaseService')

              const localRecord = brochure.localId
                ? await LocalDatabaseService.getSavedBrochureRecordById(brochure.localId)
                : null

              // Delete local file(s)
              if (brochure.localPath) {
                const fileInfo = await FileSystem.getInfoAsync(brochure.localPath)
                if (fileInfo.exists) {
                  await FileSystem.deleteAsync(brochure.localPath, { idempotent: true })
                }
              }

              if (brochureId) {
                const brochureDir = `${FileSystem.documentDirectory}brochures/${brochureId}/`
                const dirInfo = await FileSystem.getInfoAsync(brochureDir)
                if (dirInfo.exists) {
                  await FileSystem.deleteAsync(brochureDir, { idempotent: true })
                }
              }

              // Soft-delete from local SQLite (source of truth on restart)
              if (brochure.localId) {
                await LocalDatabaseService.deleteSavedBrochure(brochure.localId)
              } else if (brochureId) {
                await LocalDatabaseService.deleteSavedBrochureByMrAndBrochure(userId, brochureId)
              }

              const isOnline = await NetworkService.isOnline()
              let serverDeleteSucceeded = false

              // Remove from server when online
              if (isOnline) {
                try {
                  const serverResult = await MRService.removeSavedBrochureWithIdentifiers({
                    server_id: localRecord?.server_id,
                    brochure_id: brochureId,
                  })
                  serverDeleteSucceeded = !!serverResult.success
                  if (serverDeleteSucceeded && brochure.localId) {
                    await LocalDatabaseService.updateSavedBrochure(brochure.localId, {
                      sync_status: 'synced',
                      skipSyncQueue: true,
                    })
                  }
                } catch (error) {
                  console.warn('Server saved brochure delete failed (queued locally):', error)
                }
              }

              const updatedSaved = savedBrochures.filter(
                (b) => b.localId !== brochure.localId && (b.brochure_id || b.id) !== brochureId,
              )

              setSavedBrochures(updatedSaved)

              const key = `mr_saved_brochures_${userId}`
              await AsyncStorage.setItem(key, JSON.stringify(updatedSaved))

              notifyBrochureChange()

              try {
                await LocalDatabaseService.createActivityLog({
                  user_id: userId,
                  mr_id: userId,
                  activity_type: 'brochure_delete',
                  description: `Deleted ${brochure.customTitle}`,
                  metadata: JSON.stringify({ related_id: brochureId, related_type: 'brochure' }),
                  is_deleted: false
                })
              } catch (error) {
                console.log('Failed to log delete activity:', error)
              }

              if (!isOnline) {
                NetworkAlerts.offlineDeletedLocally()
              } else if (serverDeleteSucceeded) {
                NetworkAlerts.deletedOnline()
              } else {
                Alert.alert(
                  'Deleted Locally',
                  'Removed from this device. Server delete will retry when you sync again.',
                )
              }
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
  const connectionBanner = getConnectionBanner(connectionMode, connectionDetail)

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
      {/* <SyncStatusIndicator status="synced" /> DELETED - component removed */}
      
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
                  name={isDeviceOffline ? "cloud-offline" : "cloud-outline"} 
                  size={20} 
                  color={activeTab === 'available' ? '#3b82f6' : '#6b7280'} 
                />
                <Text style={[styles.tabText, activeTab === 'available' && styles.activeTabText]}>
                  Available ({availableBrochures.length})
                </Text>
              </View>
              {activeTab === 'available' && isDeviceOffline && (
                <Text style={styles.cacheIndicator}>
                  Offline • {formatSyncAge(lastSync)}
                </Text>
              )}
              {activeTab === 'available' && !isDeviceOffline && isFromCache && (
                <Text style={styles.cacheIndicator}>
                  Cached • {formatSyncAge(lastSync)}
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

        <View style={[styles.connectionBanner, styles[`connectionBanner_${connectionBanner.tone}`]]}>
          <Ionicons
            name={
              connectionMode === 'online'
                ? 'cloud-done-outline'
                : connectionMode === 'offline'
                  ? 'cloud-offline-outline'
                  : connectionMode === 'sync_failed'
                    ? 'warning-outline'
                    : 'cloud-outline'
            }
            size={16}
            color={
              connectionBanner.tone === 'success'
                ? '#047857'
                : connectionBanner.tone === 'error'
                  ? '#b91c1c'
                  : '#b45309'
            }
          />
          <Text style={[styles.connectionBannerText, styles[`connectionBannerText_${connectionBanner.tone}`]]}>
            {connectionBanner.text}
          </Text>
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
        <ScrollView
          style={styles.brochuresList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleManualRefresh} colors={['#8b5cf6']} />
          }
        >
          {filteredBrochures.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyStateText}>
                {activeTab === 'available' 
                  ? availableBrochures.length === 0 
                    ? isDeviceOffline
                      ? 'No cached brochures on this device. Connect to the internet to load brochures from the server.'
                      : 'No brochures have been uploaded by administrator yet'
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
                        const thumbnailUri = resolveMediaUrl(brochure.thumbnail_url)
                        return (
                <Image 
                            source={{ uri: thumbnailUri }}
                            style={styles.brochureImage}
                            onError={(e) => {
                              console.log('Failed to load database thumbnail:', thumbnailUri)
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

      {isPreparingView && (
        <View style={styles.preparingOverlay}>
          <View style={styles.preparingCard}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.preparingText}>Preparing brochure...</Text>
            <Text style={styles.preparingSubtext}>
              Checking for the latest version from the server
            </Text>
          </View>
        </View>
      )}
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
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  connectionBanner_success: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  connectionBanner_warning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  connectionBanner_error: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  connectionBanner_info: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  connectionBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  connectionBannerText_success: {
    color: '#047857',
  },
  connectionBannerText_warning: {
    color: '#b45309',
  },
  connectionBannerText_error: {
    color: '#b91c1c',
  },
  connectionBannerText_info: {
    color: '#1d4ed8',
  },
  preparingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  preparingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
  },
  preparingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  preparingSubtext: {
    marginTop: 8,
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
})