import React, { useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Image,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from "react-native"
import { TouchableOpacity } from "react-native"
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { Ionicons } from "@expo/vector-icons"
import { StatusBar } from "expo-status-bar"
import * as ScreenOrientation from 'expo-screen-orientation'
import { BrochureManagementService, BrochureSlide } from "../../services/brochureManagementService"
import { FilePathUtils } from "../../utils/filePathUtils"
import DoctorSelectionModal from "../../components/DoctorSelectionModal"
import SlideDeckPager from "../../components/SlideDeckPager"
import { MRService } from "../../services/MRService"
import { AuthService } from "../../services/AuthService"
import { OfflineFirstService } from "../../services/offlineFirstService"
import { LocalDatabaseService, LocalMeetingNote } from "../../services/localDatabaseService"
import { useModalQueue } from "../../hooks/useModalQueue"
import { useAppData } from "../../context/AppDataContext"
import { useGlobalForms } from "../../context/GlobalFormContext"
import { isTablet, getModalWidth, getModalMaxHeight, getModalPadding, getModalBorderRadius } from "../../utils/responsive"

interface DoctorGroupViewerScreenProps {
  navigation: any
  route: any
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

export default function DoctorGroupViewerScreen({ navigation, route }: DoctorGroupViewerScreenProps) {
  const { brochureId, brochureTitle, groupId, groupName, slideIds, doctorName } = route.params || {}
  
  // Modal queue for iOS-safe modal transitions
  const modalQueue = useModalQueue()
  
  // Global state management
  const { notifyDoctorChange, notifyMeetingChange, notifyActivityChange } = useAppData()
  const { showDoctorForm, showMeetingForm } = useGlobalForms()
  
  const [slides, setSlides] = useState<BrochureSlide[]>([])
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [currentOrientation, setCurrentOrientation] = useState<'portrait' | 'landscape'>('landscape')
  const [showControls, setShowControls] = useState(true)
  const [showSlideList, setShowSlideList] = useState(false)
  
  // Notes state
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [currentSlideForNotes, setCurrentSlideForNotes] = useState<BrochureSlide | null>(null)
  const [noteText, setNoteText] = useState('')
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null)
  const [showMeetingSelectionModal, setShowMeetingSelectionModal] = useState(false)
  const [availableMeetings, setAvailableMeetings] = useState<any[]>([])
  const [showNewMeetingForm, setShowNewMeetingForm] = useState(false)
  const [availableDoctors, setAvailableDoctors] = useState<any[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState<any | null>(null)
  const [showDoctorSelectionModal, setShowDoctorSelectionModal] = useState(false)
  const [doctorSelectionContext, setDoctorSelectionContext] = useState<'meeting' | null>(null)
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false)
  const [slideNotes, setSlideNotes] = useState<LocalMeetingNote[]>([])
  const [showManageNoteModal, setShowManageNoteModal] = useState(false)
  const [managingNote, setManagingNote] = useState<LocalMeetingNote | null>(null)
  const [manageNoteText, setManageNoteText] = useState('')
  const [isManageNoteEditing, setIsManageNoteEditing] = useState(false)
  const [isSavingManageNote, setIsSavingManageNote] = useState(false)
  const [meetingTitleById, setMeetingTitleById] = useState<Record<string, string>>({})
  const [newMeetingForm, setNewMeetingForm] = useState({
    doctor_id: '',
    title: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    duration_minutes: 30,
    purpose: '',
    notes: ''
  })

  useEffect(() => {
    loadGroupSlides()
    initializeOrientation()
    
    return () => {
      ScreenOrientation.unlockAsync()
    }
  }, [])

  const initializeOrientation = async () => {
    try {
      await ScreenOrientation.unlockAsync()
      const orientation = await ScreenOrientation.getOrientationAsync()
      updateOrientationFromEnum(orientation)
      ScreenOrientation.addOrientationChangeListener(handleOrientationChange)
    } catch (error) {
      console.log("Orientation initialization error:", error)
    }
  }

  const handleOrientationChange = (event: any) => {
    updateOrientationFromEnum(event.orientationInfo.orientation)
  }

  const updateOrientationFromEnum = (orientation: any) => {
    const isLandscape = orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || 
                       orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
    setCurrentOrientation(isLandscape ? 'landscape' : 'portrait')
  }

  const loadGroupSlides = async () => {
    try {
      setIsLoading(true)
      
      const result = await BrochureManagementService.getBrochureData(brochureId)
      
      if (result.success && result.data) {
        // Filter slides to only include those in the group
        const groupSlides = result.data.slides
          .filter(slide => slideIds.includes(slide.id))
          .sort((a, b) => a.order - b.order)
        
        console.log('DoctorGroupViewer: Filtered group slides:', groupSlides.length)
        
        // Fix image paths for current platform with safety checks
        const slidesWithFixedPaths = groupSlides.map(slide => {
          // Use the correct field names: imageUri or fileName
          let finalImagePath: string
          
          if (slide.fileName) {
            // Slide has fileName - use it
            finalImagePath = FilePathUtils.getSlideImagePath(brochureId, slide.fileName)
            console.log('DoctorGroupViewer: Using fileName:', slide.fileName)
          } else if (slide.imageUri) {
            // Slide has full imageUri - extract filename
            const fileName = slide.imageUri.includes('/') 
              ? slide.imageUri.split('/').pop() || `slide_${slide.order}.jpg`
              : slide.imageUri
            finalImagePath = FilePathUtils.getSlideImagePath(brochureId, fileName)
            console.log('DoctorGroupViewer: Extracted from imageUri:', fileName)
          } else {
            // Fallback - this shouldn't happen but handle it
            console.warn('DoctorGroupViewer: Slide missing both fileName and imageUri:', slide.id)
            finalImagePath = FilePathUtils.getSlideImagePath(brochureId, `slide_${slide.order}.jpg`)
          }
          
          return {
            ...slide,
            imageUri: finalImagePath // Store in imageUri for consistent access
          }
        })
        
        console.log('DoctorGroupViewer: Slides with fixed paths:', slidesWithFixedPaths.length)
        setSlides(slidesWithFixedPaths)
        await loadSlideNotesForSlides(slidesWithFixedPaths)
      }
    } catch (error) {
      console.error('Error loading group slides:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadSlideNotesForSlides = async (groupSlides: BrochureSlide[] = slides) => {
    try {
      await LocalDatabaseService.ensureReady()
      const ids = groupSlides.map((s) => s.id).filter(Boolean)
      const notes = await LocalDatabaseService.getMeetingNotesForBrochureSlides(
        brochureId,
        ids.length > 0 ? ids : (Array.isArray(slideIds) ? slideIds : []),
      )
      setSlideNotes(notes)

      const titles: Record<string, string> = {}
      const meetingIds = [...new Set(notes.map((n) => n.meeting_id).filter(Boolean))]
      for (const meetingId of meetingIds) {
        try {
          const meeting = await LocalDatabaseService.getMeetingById(meetingId)
          if (meeting) {
            titles[meetingId] =
              meeting.title ||
              `Meeting ${new Date(meeting.scheduled_date).toLocaleDateString()}`
          }
        } catch {
          // non-fatal
        }
      }
      setMeetingTitleById(titles)
    } catch (error) {
      console.warn('DoctorGroupViewer: Failed to load slide notes:', error)
      setSlideNotes([])
    }
  }

  const loadSlideNotes = async () => loadSlideNotesForSlides(slides)

  const notesForSlide = (slideId?: string | null) =>
    slideNotes.filter((n) => n.slide_id === slideId)

  const openManageNotesForSlide = (slide: BrochureSlide | null) => {
    if (!slide) return
    const notes = notesForSlide(slide.id)
    if (notes.length === 0) return
    const note = notes[0]
    setManagingNote(note)
    setManageNoteText(note.note_text || '')
    setIsManageNoteEditing(false)
    setShowManageNoteModal(true)
  }

  const handleUpdateManagedNote = async () => {
    if (!managingNote || !manageNoteText.trim()) {
      Alert.alert('Error', 'Please enter a note')
      return
    }
    setIsSavingManageNote(true)
    try {
      const result = await OfflineFirstService.updateMeetingNote(managingNote.id, {
        note_text: manageNoteText.trim(),
      })
      if (result.success) {
        notifyActivityChange()
        await loadSlideNotes()
        setIsManageNoteEditing(false)
        setManagingNote({ ...managingNote, note_text: manageNoteText.trim() })
        Alert.alert('Success', 'Note updated')
      } else {
        Alert.alert('Error', result.error || 'Failed to update note')
      }
    } catch (error) {
      console.error('DoctorGroupViewer: Failed to update note:', error)
      Alert.alert('Error', 'Failed to update note')
    } finally {
      setIsSavingManageNote(false)
    }
  }

  const handleDeleteManagedNote = () => {
    if (!managingNote) return
    Alert.alert(
      'Delete Note',
      `Delete the note for "${managingNote.slide_title || 'this slide'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsSavingManageNote(true)
            try {
              const result = await OfflineFirstService.deleteMeetingNote(managingNote.id)
              if (result.success) {
                notifyActivityChange()
                await loadSlideNotes()
                setShowManageNoteModal(false)
                setManagingNote(null)
                setManageNoteText('')
                setIsManageNoteEditing(false)
                Alert.alert('Success', 'Note deleted')
              } else {
                Alert.alert('Error', result.error || 'Failed to delete note')
              }
            } catch (error) {
              console.error('DoctorGroupViewer: Failed to delete note:', error)
              Alert.alert('Error', 'Failed to delete note')
            } finally {
              setIsSavingManageNote(false)
            }
          },
        },
      ],
    )
  }

  // Load available meetings for notes (offline-first: read from local DB only)
  const loadAvailableMeetings = async () => {
    try {
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success && userResult.user && userResult.user.role === 'mr') {
        // Load meetings from local DB only (offline-first architecture)
        const localMeetingsResult = await OfflineFirstService.getMeetings(userResult.user.id)
        
        let allMeetings: any[] = []
        
        // Collect local meetings
        if (localMeetingsResult.success && localMeetingsResult.data) {
          allMeetings = Array.isArray(localMeetingsResult.data) ? localMeetingsResult.data : []
        }
        
        // Deduplicate meetings to prevent multiplication
        // Group by unique key: server_id > id > (doctor_id + scheduled_date + title)
        const meetingsByKey = new Map<string, any[]>()
        const seenIds = new Set<string>()
        
        allMeetings.forEach(meeting => {
          // Skip deleted meetings
          if (meeting.is_deleted) return
          
          // Normalize and determine unique key for this meeting
          let key: string
          const serverId = String(meeting.server_id || '').trim()
          const localId = String(meeting.id || meeting.meeting_id || '').trim()
          
          if (serverId) {
            key = `server_${serverId}`
          } else if (localId) {
            key = `id_${localId}`
          } else {
            // Fallback: use doctor_id + scheduled_date + title (normalized)
            const doctorId = String(meeting.doctor_id || '').trim()
            const scheduledDate = String(meeting.scheduled_date || '').trim()
            const title = String(meeting.title || meeting.purpose || '').trim().toLowerCase()
            key = `composite_${doctorId}_${scheduledDate}_${title}`
          }
          
          // Additional check: if we've seen this exact ID before, skip it
          const uniqueId = serverId || localId
          if (uniqueId && seenIds.has(uniqueId)) {
            console.log(`🔴 MEETING_DEDUP: Skipping duplicate ID: ${uniqueId}`)
            return
          }
          if (uniqueId) {
            seenIds.add(uniqueId)
          }
          
          if (!meetingsByKey.has(key)) {
            meetingsByKey.set(key, [])
          }
          meetingsByKey.get(key)!.push(meeting)
        })
        
        // For each key, keep only the best meeting (prefer server_id, then most recent)
        const dedupedMeetings: any[] = []
        meetingsByKey.forEach((meetings, key) => {
          if (meetings.length === 1) {
            dedupedMeetings.push(meetings[0])
          } else {
            // Multiple meetings with same key - keep the best one
            // Priority: has server_id > most recent updated_at
            const bestMeeting = meetings.reduce((best, current) => {
              const bestHasServerId = Boolean(best.server_id)
              const currentHasServerId = Boolean(current.server_id)
              
              if (currentHasServerId && !bestHasServerId) return current
              if (!currentHasServerId && bestHasServerId) return best
              
              // Both have or don't have server_id - compare by date
              const bestDate = best.updated_at ? new Date(best.updated_at).getTime() : 0
              const currentDate = current.updated_at ? new Date(current.updated_at).getTime() : 0
              return currentDate > bestDate ? current : best
            })
            dedupedMeetings.push(bestMeeting)
            console.log(`🔴 MEETING_DEDUP: Found ${meetings.length} duplicate meetings for key "${key}", keeping best: ${bestMeeting.title || bestMeeting.id} (server_id: ${bestMeeting.server_id || 'none'})`)
          }
        })
        
        // Sort by scheduled_date (most recent first)
        dedupedMeetings.sort((a, b) => {
          const dateA = a.scheduled_date ? new Date(a.scheduled_date).getTime() : 0
          const dateB = b.scheduled_date ? new Date(b.scheduled_date).getTime() : 0
          return dateB - dateA
        })
        
        setAvailableMeetings(dedupedMeetings)
        console.log('DoctorGroupViewer: Loaded meetings from local DB:', allMeetings.length, '-> Deduplicated to:', dedupedMeetings.length)
        
        // Also load available doctors for new meeting creation (from local DB)
        console.log('DoctorGroupViewer: Loading doctors for notes modal...')
        const doctorsResult = await OfflineFirstService.getDoctors(userResult.user.id)
        console.log('DoctorGroupViewer: Doctors result:', doctorsResult)
        if (doctorsResult.success && doctorsResult.data) {
          console.log('DoctorGroupViewer: Doctors data:', doctorsResult.data)
          setAvailableDoctors(doctorsResult.data)
          console.log('DoctorGroupViewer: Set available doctors, count:', doctorsResult.data.length)
        } else {
          console.log('DoctorGroupViewer: Failed to load doctors:', doctorsResult.error)
          setAvailableDoctors([])
        }
      }
    } catch (error) {
      console.error('DoctorGroupViewer: Error loading meetings:', error)
    }
  }

  // Load available doctors for group creation (MR only)
  const loadAvailableDoctors = async () => {
    try {
      setIsLoadingDoctors(true)
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        console.log('DoctorGroupViewer: No user found for loading doctors')
        return
      }

      // Only load doctors for MR users
      if (userResult.user.role !== 'mr') {
        console.log('DoctorGroupViewer: Doctor selection not available for admin users')
        setAvailableDoctors([])
        return
      }

      // Use OfflineFirstService to get doctors from local database
      // This ensures consistency with My Doctors screen
      const doctorsResult = await OfflineFirstService.getDoctors(userResult.user.id)
      if (doctorsResult.success && doctorsResult.data) {
        const unique = new Map<string, any>();
        doctorsResult.data.forEach(doctor => {
          const key = doctor.server_id || doctor.id;
          if (!unique.has(key)) {
            unique.set(key, doctor);
          }
        });

        const sorted = Array.from(unique.values()).sort((a, b) => {
          const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
          const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
          return nameA.localeCompare(nameB);
        });

        setAvailableDoctors(sorted);
        console.log('DoctorGroupViewer: Loaded doctors for notes:', doctorsResult.data.length)
      } else {
        console.log('DoctorGroupViewer: Failed to load doctors:', doctorsResult.error)
        setAvailableDoctors([])
      }
    } catch (error) {
      console.error('DoctorGroupViewer: Error loading doctors:', error)
      setAvailableDoctors([])
    } finally {
      setIsLoadingDoctors(false)
    }
  }


  // Handle saving slide note
  const handleSaveSlideNote = async () => {
    try {
      if (!currentSlideForNotes || !noteText.trim()) {
        Alert.alert('Error', 'Please enter a note')
        return
      }

      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user || userResult.user.role !== 'mr') {
        Alert.alert('Error', 'Please log in as MR user')
        return
      }

      let meetingId = selectedMeeting?.meeting_id || selectedMeeting?.id || selectedMeeting
      
      // If meetingId is still an object, extract the id
      if (typeof meetingId === 'object' && meetingId !== null) {
        meetingId = meetingId.meeting_id || meetingId.id || null
      }
      
      // Ensure meetingId is a string, not an object
      if (typeof meetingId === 'object' && meetingId !== null) {
        meetingId = meetingId.meeting_id || meetingId.id || null
      }
      
      if (!meetingId) {
        Alert.alert('Error', 'Please select or create a meeting')
        return
      }

      // Save slide note
      console.log('=== SAVING SLIDE NOTE DEBUG ===')
      console.log('Meeting ID:', meetingId)
      console.log('Slide ID:', currentSlideForNotes.id)
      console.log('Slide Title:', currentSlideForNotes.title)
      console.log('Slide Order:', currentSlideForNotes.order)
      console.log('Note Text:', noteText.trim())
      console.log('Brochure ID:', brochureId)
      
      // Use OfflineFirstService to save note to local DB first (offline-first architecture)
      const noteResult = await OfflineFirstService.createMeetingNote({
        meeting_id: meetingId,
        slide_id: currentSlideForNotes.id,
        slide_title: currentSlideForNotes.title,
        slide_order: currentSlideForNotes.order,
        brochure_id: brochureId,
        note_text: noteText.trim(),
        slide_image_uri: currentSlideForNotes.imageUri
      })

      console.log('Note save result:', noteResult)

      if (noteResult.success) {
        notifyActivityChange()
        await loadSlideNotes()
        Alert.alert('Success', 'Note saved successfully!', [
          {
            text: 'OK',
            onPress: () => {
              // Reset form and return to brochure view
              setShowNotesModal(false)
              setNoteText('')
              setCurrentSlideForNotes(null)
              setSelectedMeeting(null)
              setSelectedDoctor(null)
              setShowNewMeetingForm(false)
              setShowDoctorSelectionModal(false)
              setShowMeetingSelectionModal(false)
              // Reset form
              setNewMeetingForm({
                doctor_id: '',
                title: '',
                scheduled_date: new Date().toISOString().split('T')[0],
                duration_minutes: 30,
                purpose: '',
                notes: ''
              })
            }
          }
        ])
      } else {
        Alert.alert('Error', noteResult.error || 'Failed to save note')
      }
    } catch (error) {
      console.error('Error saving slide note:', error)
      Alert.alert('Error', 'Failed to save note')
    }
  }


  // Keep handlers for programmatic next/prev if needed; paging is native FlatList.

  const getImageSource = (imagePath: string) => {
    if (!imagePath) {
      console.warn('DoctorGroupViewer: No image path provided')
      return require("../../../public/placeholder.jpg")
    }
    
    console.log('DoctorGroupViewer: Loading image from:', imagePath)
    
    // Always ensure file:// protocol
    if (!imagePath.startsWith('file://')) {
      imagePath = `file://${imagePath}`
    }
    
    return { uri: imagePath }
  }

  // Safety check for current slide
  const currentSlide = slides && slides.length > 0 ? slides[Math.min(currentSlideIndex, slides.length - 1)] : null
  const currentSlideNotes = notesForSlide(currentSlide?.id)
  const currentSlideHasNotes = currentSlideNotes.length > 0

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <StatusBar style="light" hidden />
        <SafeAreaView style={styles.safeArea}>
          
          {/* Minimal Header Overlay - Animated */}
          {showControls && (
            <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)} style={styles.headerOverlay}>
              <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={28} color="#ffffff" />
              </TouchableOpacity>
              
              <View style={styles.headerInfo}>
                <Text style={styles.doctorNameText}>{doctorName || 'Doctor'}</Text>
                <Text style={styles.groupNameText}>{groupName || 'Group'}</Text>
              </View>

              {/* Add Notes + existing-note badge - Absolute Center */}
              <View style={styles.headerCenterContainer}>
                <View style={styles.headerNotesRow}>
                  {currentSlideHasNotes && (
                    <TouchableOpacity
                      style={styles.headerViewNoteButton}
                      onPress={() => openManageNotesForSlide(currentSlide)}
                    >
                      <Ionicons name="document-text" size={22} color="#ffffff" />
                      <View style={styles.noteBadge}>
                        <Text style={styles.noteBadgeText}>
                          {currentSlideNotes.length > 9 ? '9+' : String(currentSlideNotes.length)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    style={styles.headerNotesButton} 
                    onPress={() => {
                      setCurrentSlideForNotes(currentSlide)
                      loadAvailableMeetings()
                      setShowNotesModal(true)
                    }}
                  >
                    <Ionicons name="create" size={24} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Spacer to balance layout */}
              <View style={styles.headerSpacer} />
            </Animated.View>
          )}

          {/* Floating Toggle Button - Always Visible */}
          <TouchableOpacity 
            style={[styles.floatingToggleButton, showControls && { top: 118 }]} 
            onPress={() => setShowControls(prev => !prev)}
          >
            <Ionicons name={showControls ? "eye-off" : "eye"} size={24} color="#ffffff" />
          </TouchableOpacity>

          {/* Floating Counter - Always Visible */}
          <TouchableOpacity 
            style={styles.floatingCounter} 
            onPress={() => setShowSlideList(true)}
          >
            <Ionicons name="list" size={16} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.floatingCounterText}>
              {currentSlideIndex + 1} / {slides.length}
            </Text>
          </TouchableOpacity>

          {/* Fullscreen Slide Display — native paging (swipe right→left = next) */}
          <View style={styles.slideContainer}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#8b5cf6" />
                <Text style={styles.loadingText}>Loading slides...</Text>
              </View>
            ) : slides.length > 0 ? (
              <>
                <SlideDeckPager
                  slides={slides.map((s) => ({ id: s.id, imageUri: s.imageUri, title: s.title }))}
                  initialIndex={currentSlideIndex}
                  advanceOnSwipeRight={false}
                  onIndexChange={setCurrentSlideIndex}
                  imageSource={(uri) => getImageSource(uri)}
                />

                {showControls && currentSlide?.title && (
                  <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)} style={styles.bottomControlsOverlay}>
                    <View style={styles.slideTitleOverlay}>
                      <Text style={styles.slideTitleText} numberOfLines={2}>{currentSlide.title}</Text>
                    </View>
                  </Animated.View>
                )}
              </>
            ) : (
              <View style={styles.noSlideContainer}>
                <Ionicons name="document-text" size={64} color="#9ca3af" />
                <Text style={styles.noSlideText}>No slides available</Text>
              </View>
            )}
          </View>

          {/* Navigation hints */}
          {slides.length > 1 && showControls && (
            <>
              {currentSlideIndex > 0 && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.navHintLeft}>
                  <Ionicons name="chevron-back" size={32} color="rgba(255, 255, 255, 0.3)" />
                </Animated.View>
              )}
              {currentSlideIndex < slides.length - 1 && (
                <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.navHintRight}>
                  <Ionicons name="chevron-forward" size={32} color="rgba(255, 255, 255, 0.3)" />
                </Animated.View>
              )}
            </>
          )}
        </SafeAreaView>

        {/* Slide List Modal */}
        <Modal visible={showSlideList} transparent animationType="slide">
          <View style={styles.slideListModalOverlay}>
            <View style={styles.slideListModalContent}>
              <View style={styles.slideListHeader}>
                <Text style={styles.slideListTitle}>All Slides ({slides.length})</Text>
                <TouchableOpacity onPress={() => setShowSlideList(false)}>
                  <Ionicons name="close" size={24} color="#1f2937" />
                </TouchableOpacity>
              </View>
              
              <FlatList
                data={slides}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                renderItem={({ item, index }) => (
                  <TouchableOpacity
                    style={[
                      styles.slideListItem,
                      currentSlideIndex === index && styles.slideListItemActive
                    ]}
                    onPress={() => {
                      setCurrentSlideIndex(index)
                      setShowSlideList(false)
                    }}
                  >
                    <Image 
                      source={getImageSource(item.imageUri)} 
                      style={styles.slideListThumbnail}
                      resizeMode="cover"
                    />
                    <View style={styles.slideListItemInfo}>
                      <Text style={styles.slideListItemTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.slideListItemOrder}>Slide #{index + 1}</Text>
                    </View>
                    {notesForSlide(item.id).length > 0 && (
                      <TouchableOpacity
                        style={styles.slideListNoteBadge}
                        onPress={() => {
                          setCurrentSlideIndex(index)
                          setShowSlideList(false)
                          openManageNotesForSlide(item)
                        }}
                      >
                        <Ionicons name="document-text" size={18} color="#10b981" />
                      </TouchableOpacity>
                    )}
                    {currentSlideIndex === index && (
                      <Ionicons name="checkmark-circle" size={24} color="#8b5cf6" />
                    )}
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </Modal>

        {/* Manage existing slide note (view / edit / delete) */}
        <Modal
          visible={showManageNoteModal}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setShowManageNoteModal(false)
            setManagingNote(null)
            setIsManageNoteEditing(false)
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {isManageNoteEditing ? 'Edit Slide Note' : 'Slide Note'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowManageNoteModal(false)
                    setManagingNote(null)
                    setIsManageNoteEditing(false)
                  }}
                >
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              {managingNote && (
                <ScrollView style={styles.modalBody}>
                  <View style={styles.slideInfoSection}>
                    <Text style={styles.inputLabel}>Slide</Text>
                    <Text style={styles.manageNoteSlideTitle}>
                      #{managingNote.slide_order} — {managingNote.slide_title || 'Untitled'}
                    </Text>
                    <Text style={styles.manageNoteMeta}>
                      Meeting:{' '}
                      {meetingTitleById[managingNote.meeting_id] ||
                        `${String(managingNote.meeting_id).slice(0, 8)}…`}
                    </Text>
                    {notesForSlide(managingNote.slide_id).length > 1 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.notePickerRow}
                      >
                        {notesForSlide(managingNote.slide_id).map((note) => (
                          <TouchableOpacity
                            key={note.id}
                            style={[
                              styles.notePickerChip,
                              managingNote.id === note.id && styles.notePickerChipActive,
                            ]}
                            onPress={() => {
                              setManagingNote(note)
                              setManageNoteText(note.note_text || '')
                              setIsManageNoteEditing(false)
                            }}
                          >
                            <Text
                              style={[
                                styles.notePickerChipText,
                                managingNote.id === note.id && styles.notePickerChipTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {meetingTitleById[note.meeting_id] || 'Note'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Note</Text>
                    {isManageNoteEditing ? (
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Enter your note..."
                        multiline
                        numberOfLines={5}
                        value={manageNoteText}
                        onChangeText={setManageNoteText}
                        placeholderTextColor="#9ca3af"
                        editable={!isSavingManageNote}
                      />
                    ) : (
                      <View style={styles.manageNoteReadonly}>
                        <Text style={styles.manageNoteReadonlyText}>
                          {managingNote.note_text || '(empty)'}
                        </Text>
                      </View>
                    )}
                  </View>
                </ScrollView>
              )}

              <View style={styles.modalActions}>
                {!isManageNoteEditing ? (
                  <>
                    <TouchableOpacity
                      style={styles.deleteNoteButton}
                      onPress={handleDeleteManagedNote}
                      disabled={isSavingManageNote}
                    >
                      <Text style={styles.deleteNoteButtonText}>Delete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveButton}
                      onPress={() => setIsManageNoteEditing(true)}
                      disabled={isSavingManageNote}
                    >
                      <Text style={styles.saveButtonText}>Edit</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        setIsManageNoteEditing(false)
                        setManageNoteText(managingNote?.note_text || '')
                      }}
                      disabled={isSavingManageNote}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveButton}
                      onPress={handleUpdateManagedNote}
                      disabled={isSavingManageNote}
                    >
                      <Text style={styles.saveButtonText}>
                        {isSavingManageNote ? 'Saving…' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* Slide Notes Modal */}
        <Modal visible={showNotesModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Slide Note</Text>
                <TouchableOpacity onPress={() => {
                  setShowNotesModal(false)
                  setNoteText('')
                  setCurrentSlideForNotes(null)
                  setSelectedMeeting(null)
                  setSelectedDoctor(null)
                  setShowNewMeetingForm(false)
                  setShowDoctorSelectionModal(false)
                  setShowMeetingSelectionModal(false)
                  // Reset form
                  setNewMeetingForm({
                    doctor_id: '',
                    title: '',
                    scheduled_date: new Date().toISOString().split('T')[0],
                    duration_minutes: 30,
                    purpose: '',
                    notes: ''
                  })
                }}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.modalBody}>
                {currentSlideForNotes && (
                  <View style={styles.slideInfoSection}>
                    <Text style={styles.inputLabel}>Slide Information</Text>
                    <View style={styles.slideInfoCard}>
                      <View style={styles.slideInfoContent}>
                        <Image 
                          source={getImageSource(currentSlideForNotes.imageUri)} 
                          style={styles.slideInfoThumbnail}
                          resizeMode="cover"
                        />
                        <View style={styles.slideInfoDetails}>
                          <Text style={styles.slideInfoTitle}>#{currentSlideForNotes.order} - {currentSlideForNotes.title}</Text>
                          <Text style={styles.slideInfoBrochure}>From: {brochureTitle}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Note</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Enter your note about this slide..."
                    multiline
                    numberOfLines={4}
                    value={noteText}
                    onChangeText={setNoteText}
                    placeholderTextColor="#9ca3af"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Meeting</Text>
                  
                  <TouchableOpacity
                    style={styles.selectionButton}
                    onPress={() => {
                      setShowNotesModal(false)
                      setTimeout(() => {
                        setShowMeetingSelectionModal(true)
                      }, 100)
                    }}
                  >
                    <View style={styles.selectionButtonContent}>
                      <Ionicons name="calendar" size={20} color="#8b5cf6" />
                      <View style={styles.selectionButtonText}>
                        {selectedMeeting ? (
                          <>
                            <Text style={styles.selectedItemTitle}>
                              {selectedMeeting.title || `Meeting with ${selectedMeeting.doctor_name}`}
                            </Text>
                            <Text style={styles.selectedItemSubtitle}>
                              {new Date(selectedMeeting.scheduled_date).toLocaleDateString()} - {selectedMeeting.doctor_name}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.placeholderText}>Select or create a meeting</Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                    </View>
                  </TouchableOpacity>
                </View>
              </ScrollView>
              
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowNotesModal(false)
                    setNoteText('')
                    setCurrentSlideForNotes(null)
                    setSelectedMeeting(null)
                    setSelectedDoctor(null)
                    setShowNewMeetingForm(false)
                    setShowDoctorSelectionModal(false)
                    setShowMeetingSelectionModal(false)
                    // Reset form
                    setNewMeetingForm({
                      doctor_id: '',
                      title: '',
                      scheduled_date: new Date().toISOString().split('T')[0],
                      duration_minutes: 30,
                      purpose: '',
                      notes: ''
                    })
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveSlideNote}
                >
                  <Text style={styles.saveButtonText}>Save Note</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Meeting Selection Modal */}
        <Modal visible={showMeetingSelectionModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Meeting</Text>
                <TouchableOpacity onPress={() => {
                  setShowMeetingSelectionModal(false)
                  setTimeout(() => {
                    setShowNotesModal(true)
                  }, 100)
                }}>
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                {availableMeetings.length > 0 ? (
                  availableMeetings.map((meeting, index) => {
                    const meetingKey = meeting.meeting_id || meeting.id || `meeting-${index}`
                    return (
                    <TouchableOpacity
                      key={meetingKey}
                      style={[
                        styles.meetingSelectionCard,
                        selectedMeeting?.meeting_id === meeting.meeting_id && styles.meetingSelectionCardSelected
                      ]}
                      onPress={() => {
                        setSelectedMeeting(meeting)
                        setShowMeetingSelectionModal(false)
                        setTimeout(() => {
                          setShowNotesModal(true)
                        }, 100)
                      }}
                    >
                      <View style={styles.meetingInfo}>
                        <Text style={styles.meetingTitle}>{meeting.title || `Meeting with ${meeting.doctor_name}`}</Text>
                        <Text style={styles.meetingDate}>{new Date(meeting.scheduled_date).toLocaleDateString()}</Text>
                        <Text style={styles.meetingDoctor}>{meeting.doctor_name} - {meeting.hospital}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    )
                  })
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
                    <Text style={styles.emptyStateText}>No meetings found</Text>
                    <Text style={styles.emptyStateSubtext}>Create a new meeting below</Text>
                  </View>
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.addNewButton}
                  onPress={() => {
                   setShowMeetingSelectionModal(false)
                   showMeetingForm(undefined, undefined, async (createdMeeting?: any) => {
                     // Reload meetings list to include the newly created meeting
                     await loadAvailableMeetings()
                     
                     // Get the updated meetings list directly
                     const userResult = await AuthService.getCurrentUser()
                     let updatedMeetings: any[] = []
                     if (userResult.success && userResult.user && userResult.user.role === 'mr') {
                       const meetingsResult = await OfflineFirstService.getMeetings(userResult.user.id)
                       if (meetingsResult.success && meetingsResult.data) {
                         updatedMeetings = Array.isArray(meetingsResult.data) ? meetingsResult.data : []
                       }
                     }
                     
                     // If a meeting was created, find it in the reloaded list and set it as selected
                     if (createdMeeting) {
                       // Try to find the meeting in the reloaded list by ID
                       const meetingId = createdMeeting.id || createdMeeting.meeting_id
                       const foundMeeting = updatedMeetings.find(m => 
                         (m.id === meetingId) || (m.meeting_id === meetingId)
                       )
                       
                       if (foundMeeting) {
                         // Transform LocalMeeting to match expected format (with meeting_id, doctor_name, hospital)
                         const doctorId = foundMeeting.doctor_id
                         let doctorName = ''
                         let hospital = ''
                         
                         // Try to get doctor info from availableDoctors or load it
                         const doctor = availableDoctors.find(d => 
                           (d.id === doctorId) || (d.server_id === doctorId)
                         )
                         
                         if (doctor) {
                           doctorName = `${doctor.first_name || ''} ${doctor.last_name || ''}`.trim()
                           hospital = doctor.hospital || ''
                         }
                         
                         const transformedMeeting = {
                           meeting_id: foundMeeting.id,
                           id: foundMeeting.id,
                           title: foundMeeting.title,
                           doctor_name: doctorName || createdMeeting.doctor_name || '',
                           hospital: hospital || createdMeeting.hospital || '',
                           scheduled_date: foundMeeting.scheduled_date,
                           purpose: foundMeeting.purpose,
                           doctor_id: foundMeeting.doctor_id
                         }
                         setSelectedMeeting(transformedMeeting)
                       } else {
                         // If not found in list yet, transform the createdMeeting to match expected format
                         const transformedMeeting = {
                           meeting_id: createdMeeting.id || createdMeeting.meeting_id,
                           id: createdMeeting.id || createdMeeting.meeting_id,
                           title: createdMeeting.title,
                           doctor_name: createdMeeting.doctor_name || '',
                           hospital: createdMeeting.hospital || '',
                           scheduled_date: createdMeeting.scheduled_date,
                           purpose: createdMeeting.purpose,
                           doctor_id: createdMeeting.doctor_id
                         }
                         setSelectedMeeting(transformedMeeting)
                       }
                     }
                     
                     // Return to notes modal with the meeting selected
                     setTimeout(() => {
                       setShowNotesModal(true)
                     }, 100)
                   })
                  }}
                >
                  <Ionicons name="add" size={20} color="#8b5cf6" />
                  <Text style={styles.addNewButtonText}>Create New Meeting</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Doctor Selection Modal */}
        <DoctorSelectionModal
          visible={showDoctorSelectionModal}
          onClose={() => {
            setShowDoctorSelectionModal(false)
            setDoctorSelectionContext(null)
            setTimeout(() => {
              setShowMeetingSelectionModal(true)
            }, 100)
          }}
          onSelectDoctor={(doctor) => {
            setSelectedDoctor(doctor)
            setShowDoctorSelectionModal(false)
            setDoctorSelectionContext(null)
            setTimeout(() => {
              setShowMeetingSelectionModal(true)
            }, 100)
          }}
          onAddDoctor={() => {
            const context = doctorSelectionContext
            showDoctorForm(undefined, async (newDoctor?: any) => {
              if (newDoctor) {
                await loadAvailableDoctors()
                setSelectedDoctor(newDoctor)
                setDoctorSelectionContext(null)
                setTimeout(() => {
                  setShowMeetingSelectionModal(true)
                }, 100)
              } else {
                setDoctorSelectionContext(context)
                setShowDoctorSelectionModal(true)
              }
            })
          }}
          availableDoctors={availableDoctors}
          isLoadingDoctors={isLoadingDoctors}
          selectedDoctorId={selectedDoctor?.id || selectedDoctor?.server_id}
        />
      </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  safeArea: {
    flex: 1,
    // On tablets, ensure we use full screen without unnecessary padding
    ...(isTablet() ? { paddingTop: 0, paddingBottom: 0 } : {}),
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: isTablet() ? 24 : 20,
    paddingVertical: isTablet() ? 12 : 16,
    paddingTop: isTablet() ? 20 : 50, // Less padding on tablets to maximize image space
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  closeButton: {
    padding: 8,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 20,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 16,
  },
  doctorNameText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  groupNameText: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 2,
  },
  headerCenterContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "box-none",  // Allow touches to pass through container
  },
  headerNotesButton: {
    padding: 10,
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    pointerEvents: "auto",  // Button itself captures touches
  },
  headerNotesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    pointerEvents: "auto",
  },
  headerViewNoteButton: {
    padding: 10,
    backgroundColor: "rgba(59, 130, 246, 0.95)",
    borderRadius: 24,
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  noteBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  noteBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  slideListNoteBadge: {
    marginRight: 8,
    padding: 6,
    backgroundColor: "#ecfdf5",
    borderRadius: 16,
  },
  manageNoteSlideTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
    marginTop: 4,
  },
  manageNoteMeta: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 6,
  },
  notePickerRow: {
    marginTop: 12,
  },
  notePickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    marginRight: 8,
    maxWidth: 160,
  },
  notePickerChipActive: {
    backgroundColor: "#8b5cf6",
  },
  notePickerChipText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  notePickerChipTextActive: {
    color: "#ffffff",
  },
  manageNoteReadonly: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
  },
  manageNoteReadonlyText: {
    fontSize: 15,
    color: "#1e293b",
    lineHeight: 22,
  },
  deleteNoteButton: {
    flex: 1,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginRight: 8,
  },
  deleteNoteButtonText: {
    color: "#dc2626",
    fontSize: 15,
    fontWeight: "600",
  },
  headerSpacer: {
    width: 48,  // Same width as close button to balance layout
  },
  slideContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    // On tablets, ensure we use absolute positioning to maximize space
    ...(isTablet() ? {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: "100%",
      height: "100%",
    } : {}),
  },
  slideImage: {
    width: "100%",
    height: "100%",
    // On tablets, ensure images take maximum available space
    ...(isTablet() ? {
      maxWidth: screenWidth,
      maxHeight: screenHeight,
    } : {}),
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#9ca3af",
  },
  noSlideContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  noSlideText: {
    fontSize: 16,
    color: "#9ca3af",
    marginTop: 12,
  },
  bottomControlsOverlay: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 100,  // Leave space for floating counter on the right
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 12,
  },
  slideCounterOverlay: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(139, 92, 246, 0.9)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  slideCounterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  slideTitleOverlay: {
    flex: 1,
  },
  slideTitleText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
  },
  navHintLeft: {
    position: "absolute",
    left: 20,
    top: "50%",
    marginTop: -16,
  },
  navHintRight: {
    position: "absolute",
    right: 20,
    top: "50%",
    marginTop: -16,
  },
  slideListModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  slideListModalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: getModalBorderRadius(),
    borderTopRightRadius: getModalBorderRadius(),
    maxHeight: getModalMaxHeight(70),
    paddingBottom: isTablet() ? 40 : 30,
  },
  slideListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: getModalPadding(),
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  slideListTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  slideListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  slideListItemActive: {
    backgroundColor: "#f0f9ff",
  },
  slideListThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    marginRight: 12,
  },
  slideListItemInfo: {
    flex: 1,
  },
  slideListItemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  slideListItemOrder: {
    fontSize: 12,
    color: "#8b5cf6",
    fontWeight: "500",
  },
  // Floating Action Buttons - Always Visible
  floatingToggleButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(139, 92, 246, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingCounter: {
    position: "absolute",
    bottom: 30,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "rgba(139, 92, 246, 0.7)",
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  floatingCounterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: getModalBorderRadius(),
    width: getModalWidth(90),
    maxHeight: getModalMaxHeight(80),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: getModalPadding(),
    paddingVertical: isTablet() ? 20 : 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  modalBody: {
    padding: getModalPadding(),
  },
  modalActions: {
    flexDirection: "row",
    paddingHorizontal: getModalPadding(),
    paddingVertical: isTablet() ? 20 : 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
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
    borderRadius: 8,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  createNewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#8b5cf6",
    borderStyle: "dashed",
    marginBottom: 20,
  },
  createNewButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8b5cf6",
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  meetingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
    marginBottom: 12,
  },
  meetingCardSelected: {
    borderColor: "#8b5cf6",
    backgroundColor: "#f3f4f6",
  },
  meetingCardContent: {
    flex: 1,
  },
  meetingCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  meetingCardDate: {
    fontSize: 14,
    color: "#8b5cf6",
    marginBottom: 2,
  },
  meetingCardDoctor: {
    fontSize: 12,
    color: "#6b7280",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1f2937",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  selectionButton: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
  },
  selectionButtonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectionButtonText: {
    flex: 1,
    marginLeft: 12,
  },
  selectedItemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  selectedItemSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  placeholderText: {
    fontSize: 14,
    color: "#9ca3af",
  },
  doctorCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
    marginBottom: 12,
  },
  doctorCardSelected: {
    borderColor: "#8b5cf6",
    backgroundColor: "#f3f4f6",
  },
  doctorCardContent: {
    flex: 1,
  },
  doctorCardName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  doctorCardSpecialty: {
    fontSize: 14,
    color: "#8b5cf6",
    marginBottom: 2,
  },
  doctorCardHospital: {
    fontSize: 12,
    color: "#6b7280",
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 8,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderLeftWidth: 4,
    borderLeftColor: "#8b5cf6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 14,
    color: "#1f2937",
    marginLeft: 8,
    lineHeight: 20,
  },
  slideInfoSection: {
    marginBottom: 16,
  },
  slideInfoCard: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  slideInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slideInfoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  slideInfoDetails: {
    flex: 1,
  },
  slideInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  slideInfoBrochure: {
    fontSize: 12,
    color: '#6b7280',
  },
  meetingSelectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meetingSelectionCardSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f3f4f6',
  },
  meetingInfo: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  meetingDate: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 2,
  },
  meetingDoctor: {
    fontSize: 12,
    color: '#6b7280',
  },
  addNewButton: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
    marginLeft: 8,
  },
})

