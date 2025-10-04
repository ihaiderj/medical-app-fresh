import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Image,
  FlatList,
  Dimensions,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import * as ScreenOrientation from 'expo-screen-orientation'
import { BrochureManagementService, BrochureSlide, SlideGroup } from '../../services/brochureManagementService'
import { MRService } from '../../services/MRService'
import { AuthService } from '../../services/AuthService'
import BrochureSyncStatus from '../../components/BrochureSyncStatus'
import SyncStatusIndicator from '../../components/SyncStatusIndicator'
import { SmartSyncService } from '../../services/smartSyncService'

interface SlideManagementScreenProps {
  navigation: any
  route: any
}

export default function SlideManagementScreen({ navigation, route }: SlideManagementScreenProps) {
  const { brochureId, brochureTitle } = route.params || {}

  const [slides, setSlides] = useState<BrochureSlide[]>([])
  const [groups, setGroups] = useState<SlideGroup[]>([])
  const [selectedSlide, setSelectedSlide] = useState<BrochureSlide | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showRenameGroupModal, setShowRenameGroupModal] = useState(false)
  const [showAlphabetFilter, setShowAlphabetFilter] = useState(false)
  const [showGroupSelectionModal, setShowGroupSelectionModal] = useState(false)
  const [newSlideTitle, setNewSlideTitle] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedSlides, setSelectedSlides] = useState<string[]>([])
  const [currentFilter, setCurrentFilter] = useState<'all' | string>('all')
  const [alphabetFilters, setAlphabetFilters] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [showCheckboxes, setShowCheckboxes] = useState(false)
  const [isSlideListCollapsed, setIsSlideListCollapsed] = useState(false)

  // Doctor selection for group creation (MR only)
  const [availableDoctors, setAvailableDoctors] = useState<any[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null)
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false)
  const [groupCreationMode, setGroupCreationMode] = useState<'manual' | 'doctor'>('manual')
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'mr' | null>(null)
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('')
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false)

  // Doctor form for inline creation
  const [doctorForm, setDoctorForm] = useState({
    first_name: '',
    last_name: '',
    specialty: '',
    hospital: '',
    phone: '',
    email: '',
    location: '',
    notes: '',
  })

  // Orientation management
  const [currentOrientation, setCurrentOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [dimensions, setDimensions] = useState(Dimensions.get('window'))

  // UI controls visibility (landscape only)
  const [showControls, setShowControls] = useState(true)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [showSlideListInFullScreen, setShowSlideListInFullScreen] = useState(false)

  // Zoom functionality with reanimated
  const scale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedScale = useSharedValue(1)

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window')
  const imageSize = 360 // Base image size

  useEffect(() => {
    loadBrochureData()
    checkUserRole()
    initializeOrientation()
    
    // Set up dimension change listener
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window)
      updateOrientationState(window)
    })
    
    return () => {
      // Trigger exit sync when leaving the screen
      performExitSync()
      ScreenOrientation.unlockAsync()
      subscription?.remove()
    }
  }, [])

  // Perform sync when exiting view mode
  const performExitSync = async () => {
    try {
      console.log('SlideManagement: Exiting view mode, checking for changes to sync')
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success && userResult.user && userResult.user.role === 'mr') {
        // Check if current brochure needs sync
        const brochureResult = await BrochureManagementService.getBrochureData(brochureId)
        if (brochureResult.success && brochureResult.data && brochureResult.data.needsSync) {
          console.log('SlideManagement: Found changes to sync, uploading to server')
          
          const uploadResult = await BrochureManagementService.syncBrochureToServer(
            userResult.user.id,
            brochureId,
            brochureTitle,
            brochureResult.data.slides,
            brochureResult.data.groups
          )

          if (uploadResult.success) {
            await BrochureManagementService.markBrochureAsSynced(brochureId)
            console.log('SlideManagement: Changes synced successfully on exit')
          }
        }
      }
    } catch (error) {
      console.warn('SlideManagement: Exit sync error:', error)
    }
  }

  // Check current user role
  const checkUserRole = async () => {
    try {
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success && userResult.user) {
        setCurrentUserRole(userResult.user.role)
      }
    } catch (error) {
      console.error('Error checking user role:', error)
    }
  }

  // Initialize orientation
  const initializeOrientation = async () => {
    try {
      // Allow both orientations
      await ScreenOrientation.unlockAsync()

      // Get current orientation
      const orientation = await ScreenOrientation.getOrientationAsync()
      console.log('Initial orientation:', orientation)
      updateOrientationFromEnum(orientation)

      // Set up orientation change listener
      ScreenOrientation.addOrientationChangeListener(handleOrientationChange)
    } catch (error) {
      console.log("Orientation initialization error:", error)
    }
  }

  // Handle orientation changes
  const handleOrientationChange = (event: any) => {
    updateOrientationFromEnum(event.orientationInfo.orientation)
  }

  // Update orientation state from enum
  const updateOrientationFromEnum = (orientation: any) => {
    const isLandscape = orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
      orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
    const newOrientation = isLandscape ? 'landscape' : 'portrait'
    console.log('Orientation updated to:', newOrientation)
    setCurrentOrientation(newOrientation)
  }

  // Update orientation state from dimensions
  const updateOrientationState = (windowDimensions: any) => {
    const isLandscape = windowDimensions.width > windowDimensions.height
    const newOrientation = isLandscape ? 'landscape' : 'portrait'
    console.log('Orientation updated from dimensions to:', newOrientation)
    setCurrentOrientation(newOrientation)
  }

  // Pinch gesture
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      savedScale.value = scale.value
    })
    .onUpdate((event) => {
      'worklet';
      const newScale = savedScale.value * event.scale
      scale.value = Math.min(Math.max(newScale, 1), 4) // Limit scale between 1x and 4x
    })
    .onEnd(() => {
      'worklet';
      if (scale.value < 1) {
        scale.value = withSpring(1)
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
      }
      savedScale.value = scale.value
    })

  // Pan gesture for moving the image when zoomed
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      if (scale.value > 1) {
        const maxTranslateX = (imageSize * scale.value - imageSize) / 2
        const maxTranslateY = (imageSize * scale.value - imageSize) / 2

        translateX.value = Math.min(
          Math.max(event.translationX, -maxTranslateX),
          maxTranslateX
        )
        translateY.value = Math.min(
          Math.max(event.translationY, -maxTranslateY),
          maxTranslateY
        )
      }
    })

  // Double tap gesture
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event) => {
      'worklet';
      if (scale.value === 1) {
        // Zoom in to 2x at the tap position
        const tapX = event.x - imageSize / 2
        const tapY = event.y - imageSize / 2

        scale.value = withSpring(2)
        translateX.value = withSpring(-tapX * 0.5) // Adjust for centering
        translateY.value = withSpring(-tapY * 0.5)
        savedScale.value = 2
      } else {
        // Zoom out to 1x
        scale.value = withSpring(1)
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        savedScale.value = 1
      }
    })

  // Combine gestures
  const composedGestures = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    doubleTapGesture
  )

  // Animated style for the image
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    }
  })

  // Reset zoom function
  const resetZoom = () => {
    scale.value = withSpring(1)
    translateX.value = withSpring(0)
    translateY.value = withSpring(0)
    savedScale.value = 1
  }

  const loadBrochureData = async () => {
    setIsLoading(true)
    try {
      console.log('Loading brochure data for ID:', brochureId)
      const result = await BrochureManagementService.getBrochureData(brochureId)
      
      if (result.success && result.data) {
        console.log('Loaded brochure data:', result.data.slides.length, 'slides')
        setSlides(result.data.slides)
        setGroups(result.data.groups)
        if (result.data.slides.length > 0) {
          setSelectedSlide(result.data.slides[0])
        }
        
        // Generate alphabet filters from current slides
        const availableLetters = [...new Set(
          result.data.slides.map(slide => slide.title.charAt(0).toUpperCase())
        )].sort()
        setAlphabetFilters(availableLetters)
      } else {
        console.error('Failed to load brochure data:', result.error)
        Alert.alert('Error', result.error || 'Failed to load brochure data')
      }
    } catch (error) {
      console.error('Load brochure data error:', error)
      Alert.alert('Error', 'Failed to load brochure data')
    } finally {
      setIsLoading(false)
    }
  }

  // Helper function to sync brochure changes to server
  const syncBrochureChanges = async () => {
    try {
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user || userResult.user.role !== 'mr') {
        return // Only sync for MR users
      }

      await BrochureManagementService.syncBrochureToServer(
        userResult.user.id,
        brochureId,
        brochureTitle,
        slides,
        groups
      )
    } catch (error) {
      console.error('Sync error:', error)
      // Don't show error to user for background sync
    }
  }

  const handleRenameSlide = async () => {
    if (selectedSlides.length === 0 || !newSlideTitle.trim()) return

    try {
      let successCount = 0

      // Rename all selected slides
      for (let i = 0; i < selectedSlides.length; i++) {
        const slideId = selectedSlides[i]
        // If multiple slides selected, append number to make titles unique
        const finalTitle = selectedSlides.length > 1
          ? `${newSlideTitle.trim()} ${i + 1}`
          : newSlideTitle.trim()

        const result = await BrochureManagementService.updateSlideTitle(
          brochureId,
          slideId,
          finalTitle
        )

        if (result.success) {
          successCount++
        }
      }

      if (successCount > 0) {
        setShowRenameModal(false)
        setNewSlideTitle('')
        exitSelectionMode()
        loadBrochureData()
        
        // Mark brochure as modified for sync tracking
        await BrochureManagementService.markBrochureAsModified(brochureId)
        
        const message = successCount === 1 
          ? 'Slide renamed successfully'
          : `${successCount} slides renamed successfully`
        Alert.alert('Success', message)
      } else {
        Alert.alert('Error', 'Failed to rename slides')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to rename slides')
    }
  }

  const handleSortAlphabetically = async () => {
    try {
      const result = await BrochureManagementService.sortSlidesAlphabetically(brochureId)
      if (result.success) {
        loadBrochureData()
        Alert.alert('Success', 'Slides sorted alphabetically')
      } else {
        Alert.alert('Error', result.error || 'Failed to sort slides')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sort slides')
    }
  }

  const handleCreateGroup = async () => {
    // Determine group name based on creation mode
    let groupName = ''
    if (groupCreationMode === 'doctor' && selectedDoctor) {
      groupName = `${selectedDoctor.first_name} ${selectedDoctor.last_name}`.trim()
    } else {
      groupName = newGroupName.trim()
    }

    if (!groupName || selectedSlides.length === 0) {
      Alert.alert('Error', 'Please enter group name (or select doctor) and select slides')
      return
    }

    try {
      const result = await BrochureManagementService.createSlideGroup(
        brochureId,
        groupName,
        selectedSlides
      )

      if (result.success) {
        setShowGroupModal(false)
        setNewGroupName('')
        setSelectedDoctor(null)
        setGroupCreationMode('manual')
        setSelectedSlides([])
        loadBrochureData()
        
        // Mark brochure as modified for sync tracking
        await BrochureManagementService.markBrochureAsModified(brochureId)
        
        Alert.alert('Success', `Group "${groupName}" created successfully`)
      } else {
        Alert.alert('Error', result.error || 'Failed to create group')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create group')
    }
  }

  // Load available doctors for group creation (MR only)
  const loadAvailableDoctors = async () => {
    try {
      setIsLoadingDoctors(true)
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        console.log('No user found for loading doctors')
        return
      }

      // Only load doctors for MR users
      if (userResult.user.role !== 'mr') {
        console.log('Doctor selection not available for admin users')
        setAvailableDoctors([])
        return
      }

      const doctorsResult = await MRService.getAssignedDoctors(userResult.user.id)
      if (doctorsResult.success && doctorsResult.data) {
        setAvailableDoctors(doctorsResult.data)
        console.log('Loaded doctors for group creation:', doctorsResult.data.length)
      } else {
        console.log('Failed to load doctors:', doctorsResult.error)
        setAvailableDoctors([])
      }
    } catch (error) {
      console.error('Error loading doctors:', error)
      setAvailableDoctors([])
    } finally {
      setIsLoadingDoctors(false)
    }
  }

  // Handle doctor selection for group naming
  const handleDoctorSelection = (doctor: any) => {
    setSelectedDoctor(doctor)
    setGroupCreationMode('doctor')
    setNewGroupName('') // Clear manual name when doctor is selected
  }

  // Handle manual group name entry
  const handleManualGroupName = (name: string) => {
    setNewGroupName(name)
    if (name.trim()) {
      setGroupCreationMode('manual')
      setSelectedDoctor(null) // Clear doctor when manual name is entered
    }
  }

  // Handle adding new doctor from group creation (MR only)
  const handleAddNewDoctorFromGroup = async () => {
    try {
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        Alert.alert('Error', 'Please log in again')
        return
      }

      if (userResult.user.role !== 'mr') {
        Alert.alert('Info', 'Doctor management is only available for MR accounts')
        return
      }

      // Instead of navigating away, show an inline doctor creation form
      setShowAddDoctorModal(true)
    } catch (error) {
      console.error('Error opening add doctor modal:', error)
      Alert.alert('Error', 'Failed to open doctor creation')
    }
  }

  // Reset doctor form
  const resetDoctorForm = () => {
    setDoctorForm({
      first_name: '',
      last_name: '',
      specialty: '',
      hospital: '',
      phone: '',
      email: '',
      location: '',
      notes: '',
    })
  }

  // Handle saving new doctor
  const handleSaveNewDoctor = async () => {
    try {
      // Validate required fields
      if (!doctorForm.first_name.trim() || !doctorForm.last_name.trim()) {
        Alert.alert('Validation Error', 'Please enter both first and last name')
        return
      }

      if (!doctorForm.specialty.trim()) {
        Alert.alert('Validation Error', 'Please enter the doctor\'s specialty')
        return
      }

      if (!doctorForm.hospital.trim()) {
        Alert.alert('Validation Error', 'Please enter the hospital/clinic name')
        return
      }

      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        Alert.alert('Error', 'Please log in again')
        return
      }

      // Create doctor
      const result = await MRService.addDoctor(userResult.user.id, {
        first_name: doctorForm.first_name.trim(),
        last_name: doctorForm.last_name.trim(),
        specialty: doctorForm.specialty.trim(),
        hospital: doctorForm.hospital.trim(),
        phone: doctorForm.phone.trim(),
        email: doctorForm.email.trim(),
        location: doctorForm.location.trim(),
        notes: doctorForm.notes.trim(),
        profile_image_url: null, // No photo support in this flow
      })

      if (result.success) {
        Alert.alert('Success', 'Doctor added successfully!')

        // Close add doctor modal
        setShowAddDoctorModal(false)
        resetDoctorForm()

        // Store the new doctor info for auto-selection
        const newDoctorName = `${doctorForm.first_name.trim()} ${doctorForm.last_name.trim()}`

        // Reload doctors
        await loadAvailableDoctors()

        // Auto-select the newly added doctor
        // We need to use a more reliable method since availableDoctors might not be updated yet
        const tempDoctor = {
          doctor_id: `temp_${Date.now()}`, // Temporary ID until real data loads
          first_name: doctorForm.first_name.trim(),
          last_name: doctorForm.last_name.trim(),
          specialty: doctorForm.specialty.trim(),
          hospital: doctorForm.hospital.trim(),
          phone: doctorForm.phone.trim(),
          email: doctorForm.email.trim(),
          location: doctorForm.location.trim(),
          profile_image_url: null
        }

        // Immediately select the new doctor and switch to doctor mode
        setSelectedDoctor(tempDoctor)
        setGroupCreationMode('doctor')

        // Reload doctors in the background to get the real doctor ID
        setTimeout(async () => {
          await loadAvailableDoctors()
        }, 1000)

      } else {
        Alert.alert('Error', result.error || 'Failed to add doctor')
      }
    } catch (error) {
      console.error('Error adding doctor:', error)
      Alert.alert('Error', 'Failed to add doctor')
    }
  }

  const handleDeleteSlide = async (slide: BrochureSlide) => {
    Alert.alert(
      'Delete Slide',
      `Are you sure you want to delete "${slide.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await BrochureManagementService.deleteSlide(brochureId, slide.id)
            if (result.success) {
              loadBrochureData()
              Alert.alert('Success', 'Slide deleted successfully')
            } else {
              Alert.alert('Error', result.error || 'Failed to delete slide')
            }
          }
        }
      ]
    )
  }

  const getFilteredSlides = () => {
    if (selectedGroup) {
      // Support both old and new group membership formats
      return slides.filter(slide => {
        // Check new format first (groupIds array)
        if (slide.groupIds && slide.groupIds.includes(selectedGroup)) {
          return true
        }
        // Fallback to old format (single groupId)
        return slide.groupId === selectedGroup
      })
    }

    if (currentFilter === 'all') {
      return slides
    }

    return slides.filter(slide =>
      slide.title.toLowerCase().startsWith(currentFilter.toLowerCase())
    )
  }

  const toggleSlideSelection = (slideId: string) => {
    setSelectedSlides(prev =>
      prev.includes(slideId)
        ? prev.filter(id => id !== slideId)
        : [...prev, slideId]
    )
  }

  const handleSlideLongPress = (slide: BrochureSlide) => {
    setShowCheckboxes(true)
    toggleSlideSelection(slide.id)
  }

  const handleSlidePress = (slide: BrochureSlide) => {
    // Track user activity for idle detection
    SmartSyncService.trackActivity()
    
    if (showCheckboxes) {
      // If checkboxes are visible, clicking anywhere selects/deselects
      return
    } else {
      // Normal click - set as selected slide for preview
      setSelectedSlide(slide)
    }
  }

  const exitSelectionMode = () => {
    setShowCheckboxes(false)
    setSelectedSlides([])
  }

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return

    const group = groups.find(g => g.id === selectedGroup)
    if (!group) return

    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete the group "${group.name}"? Slides will remain in the brochure.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
              if (!brochureData) return

              // Remove group assignment from all slides in this group (support multiple groups)
              brochureData.slides.forEach(slide => {
                // Handle new format (groupIds array)
                if (slide.groupIds && slide.groupIds.includes(selectedGroup)) {
                  slide.groupIds = slide.groupIds.filter(id => id !== selectedGroup)

                  // If no more groups, clear groupIds
                  if (slide.groupIds.length === 0) {
                    delete slide.groupIds
                    delete slide.groupId
                  } else {
                    // Set groupId to the last remaining group for backward compatibility
                    slide.groupId = slide.groupIds[slide.groupIds.length - 1]
                  }

                  slide.updatedAt = new Date().toISOString()
                }
                // Handle old format (single groupId) - for backward compatibility
                else if (slide.groupId === selectedGroup) {
                  delete slide.groupId
                  slide.updatedAt = new Date().toISOString()
                }
              })

              // Remove group from groups array
              brochureData.groups = brochureData.groups.filter(g => g.id !== selectedGroup)
              brochureData.updatedAt = new Date().toISOString()

              // Save updated data
              const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
              await FileSystem.writeAsStringAsync(
                `${brochureDir}brochure_data.json`,
                JSON.stringify(brochureData, null, 2)
              )

              setSelectedGroup(null)
              loadBrochureData()
              Alert.alert('Success', 'Group deleted successfully')
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group')
            }
          }
        }
      ]
    )
  }

  const handleRenameGroup = async () => {
    if (!selectedGroup || !newGroupName.trim()) return

    try {
      const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
      if (!brochureData) return

      // Update group name
      const groupIndex = brochureData.groups.findIndex(g => g.id === selectedGroup)
      if (groupIndex !== -1) {
        brochureData.groups[groupIndex].name = newGroupName.trim()
        brochureData.updatedAt = new Date().toISOString()

        // Save updated data
        const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
        await FileSystem.writeAsStringAsync(
          `${brochureDir}brochure_data.json`,
          JSON.stringify(brochureData, null, 2)
        )

        setShowRenameGroupModal(false)
        setNewGroupName('')
        loadBrochureData()
        Alert.alert('Success', 'Group renamed successfully')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to rename group')
    }
  }

  const handleAddSlide = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      })

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        const slideTitle = `New Slide ${slides.length + 1}`

        const addResult = await BrochureManagementService.addSlideImage(
          brochureId,
          asset.uri,
          slideTitle
        )

        if (addResult.success) {
          loadBrochureData()
          
          // Sync changes to server
          syncBrochureChanges()
          
          Alert.alert('Success', 'Slide added successfully')
        } else {
          Alert.alert('Error', addResult.error || 'Failed to add slide')
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add slide')
    }
  }

  const handleAddToExistingGroup = async (groupId: string) => {
    try {
      const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
      if (!brochureData) return

      // Find the group
      const groupIndex = brochureData.groups.findIndex(g => g.id === groupId)
      if (groupIndex === -1) return

      // Add new slides to group (avoid duplicates)
      const newSlideIds = selectedSlides.filter(slideId =>
        !brochureData.groups[groupIndex].slideIds.includes(slideId)
      )

      brochureData.groups[groupIndex].slideIds.push(...newSlideIds)

      // Update slides with group assignment (support multiple groups)
      newSlideIds.forEach(slideId => {
        const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
        if (slideIndex !== -1) {
          const slide = brochureData.slides[slideIndex]

          // Initialize groupIds array if it doesn't exist
          if (!slide.groupIds) {
            slide.groupIds = []
            // Migrate old groupId to groupIds if it exists
            if (slide.groupId) {
              slide.groupIds.push(slide.groupId)
            }
          }

          // Add to new group if not already included
          if (!slide.groupIds.includes(groupId)) {
            slide.groupIds.push(groupId)
          }

          // Keep backward compatibility
          slide.groupId = groupId // Last group assigned (for backward compatibility)
          slide.updatedAt = new Date().toISOString()
        }
      })

      brochureData.updatedAt = new Date().toISOString()

      // Save updated data
      const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )

      setShowGroupSelectionModal(false)
      exitSelectionMode()
      loadBrochureData()
      Alert.alert('Success', `${newSlideIds.length} slides added to group`)
    } catch (error) {
      Alert.alert('Error', 'Failed to add slides to group')
    }
  }

  const handleDeleteSlides = async () => {
    if (selectedSlides.length === 0) {
      Alert.alert('Info', 'Select slides first by long pressing them')
      return
    }

    const slideCount = selectedSlides.length
    const slideText = slideCount === 1 ? 'slide' : 'slides'

    Alert.alert(
      'Delete Slides',
      `Are you sure you want to delete ${slideCount} ${slideText}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
              if (!brochureData) return

              let deletedCount = 0

              // Delete each selected slide
              for (const slideId of selectedSlides) {
                const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
                if (slideIndex !== -1) {
                  const slide = brochureData.slides[slideIndex]

                  // Remove slide file if it exists
                  try {
                    if (slide.imageUri && slide.imageUri.startsWith('file://')) {
                      await FileSystem.deleteAsync(slide.imageUri, { idempotent: true })
                    }
                  } catch (fileError) {
                    console.log('File deletion error (non-critical):', fileError)
                  }

                  // Remove from groups if it's in any group
                  brochureData.groups.forEach(group => {
                    group.slideIds = group.slideIds.filter(id => id !== slideId)
                  })

                  // Remove slide from slides array
                  brochureData.slides.splice(slideIndex, 1)
                  deletedCount++
                }
              }

              // Update slide orders
              brochureData.slides.forEach((slide, index) => {
                slide.order = index + 1
                slide.updatedAt = new Date().toISOString()
              })

              brochureData.totalSlides = brochureData.slides.length
              brochureData.updatedAt = new Date().toISOString()

              // Save updated data
              const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
              await FileSystem.writeAsStringAsync(
                `${brochureDir}brochure_data.json`,
                JSON.stringify(brochureData, null, 2)
              )

              exitSelectionMode()
              loadBrochureData()

              const message = deletedCount === 1
                ? 'Slide deleted successfully'
                : `${deletedCount} slides deleted successfully`
              Alert.alert('Success', message)
            } catch (error) {
              Alert.alert('Error', 'Failed to delete slides')
            }
          }
        }
      ]
    )
  }

  const handleRemoveFromGroup = async () => {
    if (selectedSlides.length === 0) {
      Alert.alert('Info', 'Select slides first to remove from group')
      return
    }

    Alert.alert(
      'Remove from Group',
      `Remove ${selectedSlides.length} slides from this group? They will remain in the brochure.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          onPress: async () => {
            try {
              // Remove group assignment from selected slides
              const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
              if (!brochureData) {
                Alert.alert('Error', 'Brochure not found')
                return
              }

              // Update slides to remove group assignment (support multiple groups)
              selectedSlides.forEach(slideId => {
                const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
                if (slideIndex !== -1) {
                  const slide = brochureData.slides[slideIndex]

                  // Handle new format (groupIds array)
                  if (slide.groupIds && selectedGroup && slide.groupIds.includes(selectedGroup)) {
                    slide.groupIds = slide.groupIds.filter(id => id !== selectedGroup)

                    // If no more groups, clear groupIds
                    if (slide.groupIds.length === 0) {
                      delete slide.groupIds
                      delete slide.groupId
                    } else {
                      // Set groupId to the last remaining group for backward compatibility
                      slide.groupId = slide.groupIds[slide.groupIds.length - 1]
                    }
                  }
                  // Handle old format (single groupId) - for backward compatibility
                  else if (slide.groupId === selectedGroup) {
                    delete slide.groupId
                  }

                  slide.updatedAt = new Date().toISOString()
                }
              })

              // Update group to remove slide IDs
              if (selectedGroup) {
                const groupIndex = brochureData.groups.findIndex(group => group.id === selectedGroup)
                if (groupIndex !== -1) {
                  brochureData.groups[groupIndex].slideIds = brochureData.groups[groupIndex].slideIds
                    .filter(slideId => !selectedSlides.includes(slideId))
                }
              }

              brochureData.updatedAt = new Date().toISOString()

              // Save updated data
              const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
              await FileSystem.writeAsStringAsync(
                `${brochureDir}brochure_data.json`,
                JSON.stringify(brochureData, null, 2)
              )

              Alert.alert('Success', 'Slides removed from group successfully')
              exitSelectionMode()
              loadBrochureData()
            } catch (error) {
              Alert.alert('Error', 'Failed to remove slides from group')
            }
          }
        }
      ]
    )
  }

  const filteredSlides = getFilteredSlides()

  return (
    <GestureHandlerRootView style={styles.container}>
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
            <Text style={styles.headerTitle} numberOfLines={1}>{brochureTitle}</Text>
          </View>
          <View style={styles.headerActions}>
             {/* Landscape Mode Buttons */}
             {currentOrientation === 'landscape' && (
               <>
                 {/* Manual Sync Button */}
                 <TouchableOpacity
                   style={styles.syncButton}
                   onPress={() => SmartSyncService.forceSyncNow()}
                 >
                   <Ionicons
                     name="cloud-upload"
                     size={18}
                     color="#8b5cf6"
                   />
                 </TouchableOpacity>

                 {/* Full Screen Toggle */}
                 <TouchableOpacity
                   style={styles.fullScreenButton}
                   onPress={() => {
                     setIsFullScreen(!isFullScreen)
                     // Reset slide list visibility when exiting full screen
                     if (isFullScreen) {
                       setShowSlideListInFullScreen(false)
                     }
                   }}
                 >
                   <Ionicons
                     name={isFullScreen ? 'contract' : 'expand'}
                     size={18}
                     color="#8b5cf6"
                   />
                 </TouchableOpacity>

                 {/* Show Slide List in Full Screen (only when in full screen) */}
                 {isFullScreen && (
                   <TouchableOpacity
                     style={styles.toggleSlideListButton}
                     onPress={() => setShowSlideListInFullScreen(!showSlideListInFullScreen)}
                   >
                     <Ionicons
                       name={showSlideListInFullScreen ? 'list' : 'list-outline'}
                       size={18}
                       color="#8b5cf6"
                     />
                   </TouchableOpacity>
                 )}

                 {/* Hide/Show Controls Button */}
                 <TouchableOpacity
                   style={styles.toggleControlsButton}
                   onPress={() => setShowControls(!showControls)}
                 >
                   <Ionicons
                     name={showControls ? 'eye-off' : 'eye'}
                     size={18}
                     color="#8b5cf6"
                   />
                 </TouchableOpacity>
               </>
             )}

            <TouchableOpacity
              style={styles.orientationIconButton}
              onPress={async () => {
                try {
                  console.log('Orientation button pressed, current:', currentOrientation)
                  if (currentOrientation === 'portrait') {
                    console.log('Switching to landscape...')
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
                  } else {
                    console.log('Switching to portrait...')
                    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT)
                  }
                } catch (error) {
                  console.log("Orientation change error:", error)
                }
              }}
            >
              <Ionicons
                name={currentOrientation === 'portrait' ? 'phone-landscape' : 'phone-portrait'}
                size={18}
                color="#8b5cf6"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => setShowAlphabetFilter(!showAlphabetFilter)}
            >
              <Ionicons name="filter" size={20} color="#8b5cf6" />
            </TouchableOpacity>
          </View>
         </View>

         {/* Sync Status Indicator */}
        <SyncStatusIndicator position="top-right" />

         {/* Conditional Controls Based on Orientation and Visibility */}
        {currentOrientation === 'landscape' ? (
          /* Landscape: Compact 2-column layout when controls are visible and not in full screen */
          showControls && !isFullScreen && (
            <View style={styles.landscapeControlsContainer}>
              {/* Left Column: Groups */}
              <View style={styles.landscapeGroupsColumn}>
                {groups.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compactGroupsFilter}>
                    <TouchableOpacity
                      style={[styles.compactGroupButton, !selectedGroup && styles.compactGroupButtonActive]}
                      onPress={() => {
                        setSelectedGroup(null)
                        setCurrentFilter('all')
                      }}
                    >
                      <Text style={[styles.compactGroupButtonText, !selectedGroup && styles.compactGroupButtonTextActive]}>
                        All Slides
                      </Text>
                    </TouchableOpacity>
                    {groups.map(group => (
                      <TouchableOpacity
                        key={group.id}
                        style={[styles.compactGroupButton, selectedGroup === group.id && styles.compactGroupButtonActive]}
                        onPress={() => {
                          setSelectedGroup(group.id)
                          setCurrentFilter('all')
                        }}
                      >
                        <Text style={[styles.compactGroupButtonText, selectedGroup === group.id && styles.compactGroupButtonTextActive]}>
                          {group.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* Right Column: Actions */}
              <View style={styles.landscapeActionsColumn}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compactActionBar}>
                  {!selectedGroup && (
                    <>
                      <TouchableOpacity style={styles.compactIconButton} onPress={handleSortAlphabetically}>
                        <Ionicons name="swap-vertical" size={16} color="#8b5cf6" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.compactIconButton} onPress={() => {
                        if (selectedSlides.length === 0) {
                          Alert.alert('Info', 'Select slides first by long pressing them')
                          return
                        }
                        setShowGroupSelectionModal(true)
                      }}>
                        <Ionicons name="albums" size={16} color="#8b5cf6" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.compactIconButton} onPress={handleAddSlide}>
                        <Ionicons name="add-circle" size={16} color="#8b5cf6" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.compactIconButton} onPress={() => {
                        if (selectedSlides.length === 0) {
                          Alert.alert('Info', 'Select slides first by long pressing them')
                          return
                        }
                        if (selectedSlides.length === 1) {
                          const slideToRename = slides.find(slide => slide.id === selectedSlides[0])
                          setNewSlideTitle(slideToRename?.title || '')
                        } else {
                          setNewSlideTitle('')
                        }
                        setShowRenameModal(true)
                      }}>
                        <Ionicons name="create" size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </>
                  )}

                  {selectedGroup ? (
                    <>
                      <TouchableOpacity style={styles.compactGroupActionButton} onPress={() => {
                        const group = groups.find(g => g.id === selectedGroup)
                        if (group) {
                          setNewGroupName(group.name)
                          setShowRenameGroupModal(true)
                        }
                      }}>
                        <Ionicons name="create" size={16} color="#8b5cf6" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.compactGroupActionButton} onPress={() => handleDeleteGroup()}>
                        <Ionicons name="trash" size={16} color="#ef4444" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.compactGroupActionButton} onPress={handleRemoveFromGroup}>
                        <Ionicons name="remove-circle" size={16} color="#f59e0b" />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity style={[styles.compactIconButton, styles.deleteIconButton]} onPress={handleDeleteSlides}>
                        <Ionicons name="trash" size={16} color="#ef4444" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.compactIconButton, isSlideListCollapsed && styles.showSlidesButton]}
                        onPress={() => setIsSlideListCollapsed(!isSlideListCollapsed)}
                      >
                        <Ionicons name={isSlideListCollapsed ? "list" : "eye-off"} size={16} color="#8b5cf6" />
                      </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              </View>
            </View>
          )
        ) : (
          /* Portrait: Original full-width layout */
          <>
            {/* Alphabet Filter */}
            {showAlphabetFilter && (
              <View style={styles.alphabetFilter}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    style={[styles.filterButton, currentFilter === 'all' && styles.filterButtonActive]}
                    onPress={() => {
                      setCurrentFilter('all')
                      setSelectedGroup(null)
                    }}
                  >
                    <Text style={[styles.filterButtonText, currentFilter === 'all' && styles.filterButtonTextActive]}>
                      All
                    </Text>
                  </TouchableOpacity>

                  {(() => {
                    const availableLetters = [...new Set(
                      slides.map(slide => slide.title.charAt(0).toUpperCase())
                    )].sort()

                    return availableLetters.map(letter => (
                      <TouchableOpacity
                        key={letter}
                        style={[styles.filterButton, currentFilter === letter && styles.filterButtonActive]}
                        onPress={() => {
                          setCurrentFilter(letter)
                          setSelectedGroup(null)
                        }}
                      >
                        <Text style={[styles.filterButtonText, currentFilter === letter && styles.filterButtonTextActive]}>
                          {letter}
                        </Text>
                      </TouchableOpacity>
                    ))
                  })()}
                </ScrollView>
              </View>
            )}

            {/* Groups Filter */}
            {groups.length > 0 && (
              <View style={styles.groupsFilter}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    style={[
                      styles.groupButton,
                      !selectedGroup && styles.groupButtonActive,
                      { backgroundColor: !selectedGroup ? '#8b5cf6' : '#f3f4f6' }
                    ]}
                    onPress={() => {
                      setSelectedGroup(null)
                      setCurrentFilter('all')
                    }}
                  >
                    <Text style={[styles.groupButtonText, !selectedGroup && styles.groupButtonTextActive]}>
                      All Slides
                    </Text>
                  </TouchableOpacity>
                  {groups.map(group => (
                    <TouchableOpacity
                      key={group.id}
                      style={[
                        styles.groupButton,
                        selectedGroup === group.id && styles.groupButtonActive,
                        { backgroundColor: selectedGroup === group.id ? group.color : '#f3f4f6' }
                      ]}
                      onPress={() => {
                        setSelectedGroup(group.id)
                        setCurrentFilter('all')
                      }}
                    >
                      <Text style={[styles.groupButtonText, selectedGroup === group.id && styles.groupButtonTextActive]}>
                        {group.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionBarContainer}>
              {showCheckboxes && (
                <TouchableOpacity
                  style={styles.exitSelectionButton}
                  onPress={exitSelectionMode}
                >
                  <Ionicons name="close" size={18} color="#6b7280" />
                  <Text style={styles.exitSelectionText}>Cancel</Text>
                </TouchableOpacity>
              )}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.actionBar}
                contentContainerStyle={styles.actionBarContent}
              >
                {!selectedGroup && (
                  <>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleSortAlphabetically}
                    >
                      <Ionicons name="swap-vertical" size={18} color="#8b5cf6" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => {
                        if (selectedSlides.length === 0) {
                          Alert.alert('Info', 'Select slides first by long pressing them')
                          return
                        }
                        setShowGroupSelectionModal(true)
                      }}
                    >
                      <Ionicons name="albums" size={18} color="#8b5cf6" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={handleAddSlide}
                    >
                      <Ionicons name="add-circle" size={18} color="#8b5cf6" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => {
                        if (selectedSlides.length === 0) {
                          Alert.alert('Info', 'Select slides first by long pressing them')
                          return
                        }
                        if (selectedSlides.length === 1) {
                          const slideToRename = slides.find(slide => slide.id === selectedSlides[0])
                          setNewSlideTitle(slideToRename?.title || '')
                        } else {
                          setNewSlideTitle('')
                        }
                        setShowRenameModal(true)
                      }}
                    >
                      <Ionicons name="create" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </>
                )}

                {selectedGroup ? (
                  <>
                    <TouchableOpacity
                      style={styles.groupActionButton}
                      onPress={() => {
                        const group = groups.find(g => g.id === selectedGroup)
                        if (group) {
                          setNewGroupName(group.name)
                          setShowRenameGroupModal(true)
                        }
                      }}
                    >
                      <Ionicons name="create" size={18} color="#8b5cf6" />
                      <Text style={styles.groupActionText}>Rename Group</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.groupActionButton}
                      onPress={() => handleDeleteGroup()}
                    >
                      <Ionicons name="trash" size={18} color="#ef4444" />
                      <Text style={[styles.groupActionText, styles.deleteGroupText]}>Delete Group</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.removeFromGroupTextButton}
                      onPress={handleRemoveFromGroup}
                    >
                      <Ionicons name="remove-circle" size={18} color="#f59e0b" />
                      <Text style={styles.removeFromGroupText}>Remove from Group</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.iconButton, styles.deleteIconButton]}
                      onPress={handleDeleteSlides}
                    >
                      <Ionicons name="trash" size={18} color="#ef4444" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.iconButton, isSlideListCollapsed && styles.showSlidesButton]}
                      onPress={() => setIsSlideListCollapsed(!isSlideListCollapsed)}
                    >
                      <Ionicons
                        name={isSlideListCollapsed ? "list" : "eye-off"}
                        size={18}
                        color="#8b5cf6"
                      />
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </>
        )}

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>Loading slides...</Text>
          </View>
        ) : (
          <View style={styles.content}>
             {/* Collapsible Slides List */}
             {!isSlideListCollapsed && !(currentOrientation === 'landscape' && isFullScreen && !showSlideListInFullScreen) ? (
              <View style={styles.slidesList}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    ({filteredSlides.length})
                  </Text>
                </View>
                <FlatList
                  data={filteredSlides}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.slideItem,
                        selectedSlide?.id === item.id && !showCheckboxes && styles.slideItemActive,
                        selectedSlides.includes(item.id) && styles.slideItemSelected
                      ]}
                      onPress={() => handleSlidePress(item)}
                      onLongPress={() => handleSlideLongPress(item)}
                    >
                      <View style={styles.slideItemContainer}>
                        <View style={styles.slideInfo}>
                          <Text style={styles.slideTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={styles.slideOrder}>#{item.order}</Text>
                        </View>

                        <View style={styles.slideContent}>
                          <Image source={{ uri: item.imageUri }} style={styles.slideThumb} />

                          {/* Checkbox and View overlay */}
                          {showCheckboxes && (
                            <View style={styles.overlayContainer}>
                              <TouchableOpacity
                                style={styles.viewIconContainer}
                                onPress={() => setSelectedSlide(item)}
                              >
                                <View style={styles.viewIcon}>
                                  <Ionicons name="eye" size={14} color="#8b5cf6" />
                                </View>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.checkboxContainer}
                                onPress={() => toggleSlideSelection(item.id)}
                              >
                                <View style={[
                                  styles.checkbox,
                                  selectedSlides.includes(item.id) && styles.checkboxSelected
                                ]}>
                                  {selectedSlides.includes(item.id) && (
                                    <Ionicons name="checkmark" size={16} color="#ffffff" />
                                  )}
                                </View>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : null}

             {/* Selected Slide Preview */}
             <View style={[
               styles.slidePreview,
               (isSlideListCollapsed || (currentOrientation === 'landscape' && isFullScreen && !showSlideListInFullScreen)) && styles.slidePreviewExpanded
             ]}>
              {selectedSlide ? (
                <>
                  {console.log('Selected slide:', selectedSlide.id, 'ImageURI:', selectedSlide.imageUri)}
                  <View style={styles.imageContainer}>
                    <GestureDetector gesture={composedGestures}>
                      <Animated.View style={styles.gestureContainer}>
                        <Animated.Image
                          source={{ uri: selectedSlide.imageUri }}
                          style={[styles.previewImage, animatedStyle]}
                          onError={(error) => console.log('Image load error:', error.nativeEvent)}
                          onLoad={() => console.log('Image loaded successfully for:', selectedSlide.imageUri)}
                        />
                      </Animated.View>
                    </GestureDetector>

                    {/* Slide Navigation Controls */}
                    <View style={styles.slideNavigationControls}>
                      {currentOrientation === 'landscape' ? (
                        /* Landscape: Optimized layout with stacked left controls */
                        <>
                          {/* Left side: Previous + Reset + Slide Info */}
                          <View style={styles.leftNavControls}>
                            <TouchableOpacity
                              style={[styles.navControlButton, selectedSlide.order === 1 && styles.navControlButtonDisabled]}
                              onPress={() => {
                                const currentIndex = slides.findIndex(s => s.id === selectedSlide.id)
                                if (currentIndex > 0) {
                                  setSelectedSlide(slides[currentIndex - 1])
                                }
                              }}
                              disabled={selectedSlide.order === 1}
                            >
                              <Ionicons name="chevron-back" size={20} color={selectedSlide.order === 1 ? "#9ca3af" : "#8b5cf6"} />
                              <Text style={[styles.navControlText, selectedSlide.order === 1 && styles.navControlTextDisabled]}>Previous</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.resetZoomButton}
                              onPress={resetZoom}
                            >
                              <Ionicons name="contract-outline" size={20} color="#8b5cf6" />
                              <Text style={styles.resetZoomText}>Reset</Text>
                            </TouchableOpacity>

                            {/* Slide Info Under Reset Button */}
                            <View style={styles.slideInfoUnderReset}>
                              <Text style={styles.compactSlideNumber}>#{selectedSlide.order}</Text>
                              <Text style={styles.compactSlideTitle} numberOfLines={3}>{selectedSlide.title}</Text>
                            </View>
                          </View>

                          {/* Right side: Next */}
                          <TouchableOpacity
                            style={[styles.navControlButton, selectedSlide.order === slides.length && styles.navControlButtonDisabled]}
                            onPress={() => {
                              const currentIndex = slides.findIndex(s => s.id === selectedSlide.id)
                              if (currentIndex < slides.length - 1) {
                                setSelectedSlide(slides[currentIndex + 1])
                              }
                            }}
                            disabled={selectedSlide.order === slides.length}
                          >
                            <Text style={[styles.navControlText, selectedSlide.order === slides.length && styles.navControlTextDisabled]}>Next</Text>
                            <Ionicons name="chevron-forward" size={20} color={selectedSlide.order === slides.length ? "#9ca3af" : "#8b5cf6"} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        /* Portrait: Original simple layout */
                        <>
                          <TouchableOpacity
                            style={[styles.navControlButton, selectedSlide.order === 1 && styles.navControlButtonDisabled]}
                            onPress={() => {
                              const currentIndex = slides.findIndex(s => s.id === selectedSlide.id)
                              if (currentIndex > 0) {
                                setSelectedSlide(slides[currentIndex - 1])
                              }
                            }}
                            disabled={selectedSlide.order === 1}
                          >
                            <Ionicons name="chevron-back" size={20} color={selectedSlide.order === 1 ? "#9ca3af" : "#8b5cf6"} />
                            <Text style={[styles.navControlText, selectedSlide.order === 1 && styles.navControlTextDisabled]}>Previous</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.resetZoomButton}
                            onPress={resetZoom}
                          >
                            <Ionicons name="contract-outline" size={20} color="#8b5cf6" />
                            <Text style={styles.resetZoomText}>Reset</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.navControlButton, selectedSlide.order === slides.length && styles.navControlButtonDisabled]}
                            onPress={() => {
                              const currentIndex = slides.findIndex(s => s.id === selectedSlide.id)
                              if (currentIndex < slides.length - 1) {
                                setSelectedSlide(slides[currentIndex + 1])
                              }
                            }}
                            disabled={selectedSlide.order === slides.length}
                          >
                            <Text style={[styles.navControlText, selectedSlide.order === slides.length && styles.navControlTextDisabled]}>Next</Text>
                            <Ionicons name="chevron-forward" size={20} color={selectedSlide.order === slides.length ? "#9ca3af" : "#8b5cf6"} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>

                  {/* Slide Info - Portrait Mode Only */}
                  {currentOrientation === 'portrait' && (
                    <View style={styles.slideInfoPortrait}>
                      <Text style={styles.previewSlideNumber}>Slide #{selectedSlide.order}</Text>
                      <Text style={styles.previewSlideTitle}>{selectedSlide.title}</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.noPreview}>
                  <Ionicons name="image-outline" size={48} color="#d1d5db" />
                  <Text style={styles.noPreviewText}>Select a slide to preview</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Rename Modal */}
        <Modal visible={showRenameModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {selectedSlides.length === 1 ? 'Rename Slide' : `Rename ${selectedSlides.length} Slides`}
                </Text>
                <TouchableOpacity onPress={() => setShowRenameModal(false)}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.inputLabel}>
                  {selectedSlides.length === 1
                    ? 'Slide Title'
                    : 'Base Title (numbers will be added automatically)'
                  }
                </Text>
                <TextInput
                  style={styles.input}
                  value={newSlideTitle}
                  onChangeText={setNewSlideTitle}
                  placeholder={selectedSlides.length === 1
                    ? "Enter slide title"
                    : "Enter base title"
                  }
                  autoFocus
                />
                {selectedSlides.length > 1 && (
                  <Text style={styles.helpText}>
                    Example: "Product" will become "Product 1", "Product 2", etc.
                  </Text>
                )}
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
                  onPress={handleRenameSlide}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Group Creation Modal */}
        <Modal visible={showGroupModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create Group</Text>
                <TouchableOpacity onPress={() => setShowGroupModal(false)}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <Text style={styles.groupSectionTitle}>Group Name</Text>

                {currentUserRole === 'admin' ? (
                  <View style={styles.namingOption}>
                    <Text style={styles.inputLabel}>Group Name</Text>
                    <TextInput
                      style={styles.input}
                      value={newGroupName}
                      onChangeText={setNewGroupName}
                      placeholder="Enter group name"
                      autoFocus
                    />
                  </View>
                ) : (
                  <View>
                    <View style={styles.namingOption}>
                      <View style={styles.optionHeader}>
                        <TouchableOpacity
                          style={[styles.radioButton, groupCreationMode === 'manual' && styles.radioButtonSelected]}
                          onPress={() => setGroupCreationMode('manual')}
                        >
                          <View style={[styles.radioInner, groupCreationMode === 'manual' && styles.radioInnerSelected]} />
                        </TouchableOpacity>
                        <Text style={styles.optionTitle}>Enter Custom Name</Text>
                      </View>
                      <TextInput
                        style={[styles.input, groupCreationMode !== 'manual' && styles.inputDisabled]}
                        value={newGroupName}
                        onChangeText={handleManualGroupName}
                        placeholder="Enter group name"
                        editable={groupCreationMode === 'manual'}
                      />
                    </View>

                    <View style={styles.namingOption}>
                      <View style={styles.optionHeader}>
                        <TouchableOpacity
                          style={[styles.radioButton, groupCreationMode === 'doctor' && styles.radioButtonSelected]}
                          onPress={() => setGroupCreationMode('doctor')}
                        >
                          <View style={[styles.radioInner, groupCreationMode === 'doctor' && styles.radioInnerSelected]} />
                        </TouchableOpacity>
                        <Text style={styles.optionTitle}>Name After Doctor</Text>
                      </View>

                      {groupCreationMode === 'doctor' && (
                        <View style={styles.doctorSelectionContainer}>
                          {isLoadingDoctors ? (
                            <View style={styles.groupLoadingContainer}>
                              <ActivityIndicator size="small" color="#8b5cf6" />
                              <Text style={styles.groupLoadingText}>Loading doctors...</Text>
                            </View>
                          ) : (
                            <View>
                              {availableDoctors.length > 0 ? (
                                <View>
                                  <View style={styles.searchContainer}>
                                    <Ionicons name="search" size={16} color="#6b7280" />
                                    <TextInput
                                      style={styles.searchInput}
                                      placeholder="Search doctors..."
                                      value={doctorSearchQuery}
                                      onChangeText={setDoctorSearchQuery}
                                      placeholderTextColor="#9ca3af"
                                    />
                                  </View>

                                  {selectedDoctor ? (
                                    <View style={styles.selectedDoctorCard}>
                                      <View style={styles.doctorInfo}>
                                        <View style={styles.doctorAvatar}>
                                          {selectedDoctor.profile_image_url ? (
                                            <Image source={{ uri: selectedDoctor.profile_image_url }} style={styles.doctorAvatarImage} />
                                          ) : (
                                            <Ionicons name="person" size={20} color="#8b5cf6" />
                                          )}
                                        </View>
                                        <View style={styles.doctorDetails}>
                                          <Text style={styles.selectedDoctorName}>
                                            {selectedDoctor.first_name} {selectedDoctor.last_name}
                                          </Text>
                                          <Text style={styles.selectedDoctorSpecialty}>{selectedDoctor.specialty}</Text>
                                          <Text style={styles.selectedDoctorHospital}>{selectedDoctor.hospital}</Text>
                                        </View>
                                      </View>
                                      <TouchableOpacity
                                        style={styles.changeButton}
                                        onPress={() => setSelectedDoctor(null)}
                                      >
                                        <Text style={styles.changeButtonText}>Change</Text>
                                      </TouchableOpacity>
                                    </View>
                                  ) : (
                                    <View style={styles.doctorDropdown}>
                                      {availableDoctors
                                        .filter(doctor => {
                                          const searchTerm = doctorSearchQuery.toLowerCase()
                                          const doctorName = `${doctor.first_name} ${doctor.last_name}`.toLowerCase()
                                          const specialty = doctor.specialty.toLowerCase()
                                          const hospital = doctor.hospital.toLowerCase()
                                          return doctorName.includes(searchTerm) ||
                                            specialty.includes(searchTerm) ||
                                            hospital.includes(searchTerm)
                                        })
                                        .slice(0, 5)
                                        .map((doctor) => (
                                          <TouchableOpacity
                                            key={doctor.doctor_id}
                                            style={styles.doctorDropdownItem}
                                            onPress={() => handleDoctorSelection(doctor)}
                                          >
                                            <View style={styles.doctorInfo}>
                                              <View style={styles.doctorAvatar}>
                                                {doctor.profile_image_url ? (
                                                  <Image source={{ uri: doctor.profile_image_url }} style={styles.doctorAvatarImage} />
                                                ) : (
                                                  <Ionicons name="person" size={16} color="#8b5cf6" />
                                                )}
                                              </View>
                                              <View style={styles.doctorDetails}>
                                                <Text style={styles.doctorName}>
                                                  {doctor.first_name} {doctor.last_name}
                                                </Text>
                                                <Text style={styles.doctorSpecialty}>{doctor.specialty}</Text>
                                                <Text style={styles.doctorHospital}>{doctor.hospital}</Text>
                                              </View>
                                            </View>
                                            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                                          </TouchableOpacity>
                                        ))}

                                      {doctorSearchQuery && availableDoctors.filter(doctor => {
                                        const searchTerm = doctorSearchQuery.toLowerCase()
                                        const doctorName = `${doctor.first_name} ${doctor.last_name}`.toLowerCase()
                                        return doctorName.includes(searchTerm)
                                      }).length === 0 && (
                                          <View style={styles.noResultsContainer}>
                                            <Text style={styles.noResultsText}>No doctors found matching "{doctorSearchQuery}"</Text>
                                          </View>
                                        )}
                                    </View>
                                  )}
                                </View>
                              ) : (
                                <View style={styles.emptyDoctors}>
                                  <Ionicons name="person-outline" size={32} color="#9ca3af" />
                                  <Text style={styles.emptyDoctorsText}>No doctors found</Text>
                                  <Text style={styles.emptyDoctorsSubtext}>Add doctors to enable doctor-based group naming</Text>
                                </View>
                              )}

                              <TouchableOpacity
                                style={styles.addDoctorButton}
                                onPress={handleAddNewDoctorFromGroup}
                              >
                                <Ionicons name="person-add" size={16} color="#8b5cf6" />
                                <Text style={styles.addDoctorButtonText}>Add New Doctor</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>

                    {selectedDoctor && (
                      <View style={styles.selectedDoctorPreview}>
                        <Text style={styles.previewLabel}>Group will be named:</Text>
                        <Text style={styles.previewName}>
                          {selectedDoctor.first_name} {selectedDoctor.last_name}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                <View style={styles.slidesInfo}>
                  <Text style={styles.inputLabel}>Selected Slides ({selectedSlides.length})</Text>
                  <Text style={styles.helpText}>
                    Long press slides in the main view to select them for grouping
                  </Text>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowGroupModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (currentUserRole === 'admin' ? !newGroupName.trim() :
                      (groupCreationMode === 'manual' ? !newGroupName.trim() : !selectedDoctor)) && styles.saveButtonDisabled
                  ]}
                  onPress={handleCreateGroup}
                  disabled={
                    currentUserRole === 'admin' ? !newGroupName.trim() :
                      (groupCreationMode === 'manual' ? !newGroupName.trim() : !selectedDoctor)
                  }
                >
                  <Text style={styles.saveButtonText}>Create Group</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Group Selection Modal */}
        <Modal visible={showGroupSelectionModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add to Group</Text>
                <TouchableOpacity onPress={() => setShowGroupSelectionModal(false)}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.inputLabel}>
                  {selectedSlides.length} slides selected
                </Text>

                <TouchableOpacity
                  style={styles.groupOptionButton}
                  onPress={() => {
                    setShowGroupSelectionModal(false)
                    setShowGroupModal(true)
                    loadAvailableDoctors() // Load doctors when opening group creation
                  }}
                >
                  <Ionicons name="add-circle" size={20} color="#8b5cf6" />
                  <Text style={styles.groupOptionText}>Create New Group</Text>
                </TouchableOpacity>

                {groups.length > 0 && (
                  <>
                    <Text style={styles.inputLabel}>Or add to existing group:</Text>
                    {groups.map(group => (
                      <TouchableOpacity
                        key={group.id}
                        style={styles.existingGroupButton}
                        onPress={() => handleAddToExistingGroup(group.id)}
                      >
                        <View
                          style={[styles.groupColorIndicator, { backgroundColor: group.color }]}
                        />
                        <Text style={styles.existingGroupText}>{group.name}</Text>
                        <Text style={styles.existingGroupCount}>
                          {group.slideIds.length} slides
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* Rename Group Modal */}
        <Modal visible={showRenameGroupModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Rename Group</Text>
                <TouchableOpacity onPress={() => setShowRenameGroupModal(false)}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.inputLabel}>Group Name</Text>
                <TextInput
                  style={styles.input}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  placeholder="Enter group name"
                  autoFocus
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowRenameGroupModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleRenameGroup}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Add Doctor Modal */}
        <Modal visible={showAddDoctorModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add New Doctor</Text>
                <TouchableOpacity onPress={() => {
                  setShowAddDoctorModal(false)
                  resetDoctorForm()
                }}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter doctor's first name"
                    placeholderTextColor="#9ca3af"
                    value={doctorForm.first_name}
                    onChangeText={(text) => setDoctorForm({ ...doctorForm, first_name: text })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Last Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter doctor's last name"
                    placeholderTextColor="#9ca3af"
                    value={doctorForm.last_name}
                    onChangeText={(text) => setDoctorForm({ ...doctorForm, last_name: text })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Specialty *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Cardiology, Neurology"
                    placeholderTextColor="#9ca3af"
                    value={doctorForm.specialty}
                    onChangeText={(text) => setDoctorForm({ ...doctorForm, specialty: text })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Hospital/Clinic *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter hospital or clinic name"
                    placeholderTextColor="#9ca3af"
                    value={doctorForm.hospital}
                    onChangeText={(text) => setDoctorForm({ ...doctorForm, hospital: text })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="+1 (555) 123-4567"
                    keyboardType="phone-pad"
                    placeholderTextColor="#9ca3af"
                    value={doctorForm.phone}
                    onChangeText={(text) => setDoctorForm({ ...doctorForm, phone: text })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="doctor@hospital.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor="#9ca3af"
                    value={doctorForm.email}
                    onChangeText={(text) => setDoctorForm({ ...doctorForm, email: text })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Location</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="City, State"
                    placeholderTextColor="#9ca3af"
                    value={doctorForm.location}
                    onChangeText={(text) => setDoctorForm({ ...doctorForm, location: text })}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Notes</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Any additional notes about the doctor..."
                    multiline
                    numberOfLines={3}
                    placeholderTextColor="#9ca3af"
                    value={doctorForm.notes}
                    onChangeText={(text) => setDoctorForm({ ...doctorForm, notes: text })}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddDoctorModal(false)
                    resetDoctorForm()
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveNewDoctor}
                >
                  <Text style={styles.saveButtonText}>Add Doctor</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
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
    paddingHorizontal: 16, // Reduced horizontal padding
    paddingVertical: 4, // Further reduced to minimal
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    minHeight: 40, // Smaller minimum height
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orientationIconButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  syncButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  fullScreenButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  toggleSlideListButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  toggleControlsButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  menuButton: {
    padding: 8,
  },
  alphabetFilter: {
    backgroundColor: '#f9fafb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterButtonActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  groupsFilter: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  groupButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  groupButtonActive: {
    borderColor: '#8b5cf6',
  },
  groupButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  groupButtonTextActive: {
    color: '#ffffff',
  },
  actionBar: {
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 8,
    maxHeight: 60,
  },
  actionBarContent: {
    paddingHorizontal: 20,
    gap: 8,
    alignItems: 'center',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  showSlidesButton: {
    backgroundColor: '#f0f9ff',
    borderColor: '#8b5cf6',
  },
  deleteIconButton: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  removeFromGroupButton: {
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
  },
  removeFromGroupTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
    gap: 6,
  },
  removeFromGroupText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f59e0b',
  },
  groupActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    gap: 4,
  },
  groupActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  deleteGroupText: {
    color: '#ef4444',
  },
  groupOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
    marginBottom: 16,
  },
  groupOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  existingGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
    gap: 12,
  },
  groupColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  existingGroupText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  existingGroupCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  actionBarContainer: {
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  exitSelectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 6,
  },
  exitSelectionText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    flexDirection: 'row', // Always side-by-side layout (works great in both orientations)
  },
  slidesList: {
    flex: 0.15, // 15% width - works well in both orientations
    backgroundColor: '#ffffff',
    minWidth: 70,
    maxWidth: 100,
  },
  collapsedSidePanel: {
    width: 60,
    backgroundColor: '#f9fafb',
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    paddingVertical: 16,
    alignItems: 'center',
  },
  showButton: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    gap: 4,
  },
  showButtonText: {
    fontSize: 10,
    color: '#8b5cf6',
    fontWeight: '600',
    textAlign: 'center',
  },
  slideCount: {
    fontSize: 8,
    color: '#6b7280',
    fontWeight: '400',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  collapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    gap: 4,
  },
  collapseButtonText: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    flex: 1,
  },
  slideItem: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  slideItemContainer: {
    flexDirection: 'column',
  },
  slideItemActive: {
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  slideItemSelected: {
    backgroundColor: '#fef3c7',
  },
  slideContent: {
    position: 'relative',
    alignItems: 'center',
    marginTop: 8,
  },
  overlayContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    gap: 6,
    zIndex: 1,
  },
  viewIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  viewIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  slideThumb: {
    width: 50,
    height: 35,
    borderRadius: 4,
    backgroundColor: '#f3f4f6',
    resizeMode: 'contain',
  },
  slideInfo: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  slideTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'left',
    marginBottom: 2,
    lineHeight: 12,
  },
  slideOrder: {
    fontSize: 8,
    color: '#6b7280',
    fontWeight: '500',
  },
  slidePreview: {
    flex: 0.85, // 85% width - gives more space for preview
    backgroundColor: '#f9fafb',
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
    padding: 8, // Reduced padding to maximize slide space
    alignItems: 'center',
    justifyContent: 'flex-start', // Align content to top
  },
  slidePreviewExpanded: {
    flex: 1,
    borderLeftWidth: 0,
  },
  previewBrochureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  previewSlideNumber: {
    fontSize: 16, // Restored for portrait mode
    fontWeight: 'bold',
    color: '#8b5cf6',
    marginBottom: 4,
    textAlign: 'center',
  },
  imageContainer: {
    width: '100%',
    flex: 1, // Use all available space
    marginTop: 0, // Remove top margin to maximize space
    marginBottom: 8, // Minimal bottom margin
    borderRadius: 8,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
    overflow: 'hidden',
  },
  gestureContainer: {
    width: '100%',
    flex: 1, // Use all available space in the container
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    resizeMode: 'contain', // Ensures slide fits completely without cutting
  },
  resetZoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resetZoomText: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  previewSlideTitle: {
    fontSize: 16, // Restored for portrait mode
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginTop: 4,
  },
  noPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noPreviewText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Enhanced group creation styles
  groupSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  namingOption: {
    marginBottom: 20,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    borderColor: '#8b5cf6',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  radioInnerSelected: {
    backgroundColor: '#8b5cf6',
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  inputDisabled: {
    backgroundColor: '#f9fafb',
    color: '#9ca3af',
  },
  doctorSelectionContainer: {
    marginTop: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  doctorDropdown: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    maxHeight: 200,
  },
  doctorDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  selectedDoctorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ede9fe',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#8b5cf6',
    marginBottom: 12,
  },
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  changeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  selectedDoctorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  selectedDoctorSpecialty: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 1,
  },
  selectedDoctorHospital: {
    fontSize: 12,
    color: '#6b7280',
  },
  noResultsContainer: {
    padding: 16,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  doctorDetails: {
    flex: 1,
    marginLeft: 8,
  },
  doctorHospital: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyDoctorsSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  doctorAvatar: {
    width: 32,
    height: 32,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  doctorAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    resizeMode: 'cover',
  },
  doctorName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 2,
  },
  doctorSpecialty: {
    fontSize: 10,
    color: '#8b5cf6',
    textAlign: 'center',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  emptyDoctors: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 12,
  },
  emptyDoctorsText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  addDoctorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 6,
  },
  addDoctorButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  selectedDoctorPreview: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  previewLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  previewName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  slidesInfo: {
    marginTop: 8,
  },
  groupLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  groupLoadingText: {
    fontSize: 12,
    color: '#6b7280',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  inputGroup: {
    marginBottom: 16,
  },
  // Slide navigation controls in preview
  slideNavigationControls: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start', // Align to top for stacked left controls
  },
  leftNavControls: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6, // Reduced gap to accommodate slide info
    maxWidth: 120, // Constrain width as requested
  },
  slideInfoUnderReset: {
    width: '100%',
    maxWidth: 80,
    height: 120,
    maxHeight: 120,// Same width as Previous button
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  compactSlideNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8b5cf6',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  compactSlideTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 13,
    letterSpacing: 0.2,
  },
  slideInfoPortrait: {
    alignItems: 'center',
    marginTop: 12,
  },
  navControlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  navControlButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  navControlText: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  navControlTextDisabled: {
    color: '#9ca3af',
  },
  // Landscape compact layout styles
  landscapeControlsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 12,
  },
  landscapeGroupsColumn: {
    flex: 1,
  },
  landscapeActionsColumn: {
    flex: 1,
  },
  compactGroupsFilter: {
    paddingVertical: 4,
  },
  compactActionBar: {
    paddingVertical: 4,
  },
  compactGroupButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  compactGroupButtonActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  compactGroupButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  compactGroupButtonTextActive: {
    color: '#ffffff',
  },
  compactIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  compactGroupActionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
})

