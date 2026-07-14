import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  SafeAreaView,
  TextInput
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { MRService } from '../../services/MRService'
import { OfflineFirstService } from '../../services/offlineFirstService'
import { LocalDatabaseService, LocalMeetingFollowUp, LocalMeetingNote } from '../../services/localDatabaseService'
import { getModalWidth, getModalMaxHeight, getModalPadding, getModalBorderRadius, isTablet } from '../../utils/responsive'
import BottomSheetDatePicker from '../../components/BottomSheetDatePicker'
import { useBottomSheetDatePicker, DatePickerResult } from '../../hooks/useBottomSheetDatePicker'

interface MeetingDetails {
  meeting_id: string
  title: string
  doctor_name: string
  doctor_specialty: string
  hospital: string
  scheduled_date: string
  duration_minutes: number
  status: string
  purpose: string
  brochure_info: {
    brochure_id: string
    brochure_title: string
  }
  created_at: string
  updated_at: string
}

interface SlideNote {
  note_id: string
  slide_id: string
  slide_title: string
  slide_order: number
  note_text: string
  slide_image_uri?: string
  created_at: string
  updated_at: string
  follow_up_id?: string
}

const MeetingDetailsScreen = () => {
  const navigation = useNavigation()
  const route = useRoute()
  const { meetingId } = route.params as { meetingId: string }

  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null)
  const [slideNotes, setSlideNotes] = useState<SlideNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSlide, setSelectedSlide] = useState<SlideNote | null>(null)
  const [showSlideModal, setShowSlideModal] = useState(false)
  const [showAddNoteModal, setShowAddNoteModal] = useState(false)
  const [showEditNoteModal, setShowEditNoteModal] = useState(false)
  const [editingNote, setEditingNote] = useState<SlideNote | null>(null)
  const [newNoteText, setNewNoteText] = useState('')
  const [showFullImageModal, setShowFullImageModal] = useState(false)
  const [fullImageSlide, setFullImageSlide] = useState<SlideNote | null>(null)
  const [followUps, setFollowUps] = useState<LocalMeetingFollowUp[]>([])
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [showEditFollowUpModal, setShowEditFollowUpModal] = useState(false)
  const [selectedFollowUp, setSelectedFollowUp] = useState<LocalMeetingFollowUp | null>(null)
  const [followUpForm, setFollowUpForm] = useState({
    follow_up_date: '',
    follow_up_time: '',
    follow_up_notes: '',
    status: 'scheduled' as 'scheduled' | 'completed' | 'cancelled'
  })
  const datePicker = useBottomSheetDatePicker()

  useEffect(() => {
    loadMeetingDetails()
  }, [meetingId])

  const loadMeetingDetails = async () => {
    try {
      setIsLoading(true)
      console.log('=== LOADING MEETING DETAILS ===')
      console.log('Meeting ID:', meetingId)
      
      // Try to load from local database first (for offline-first meetings)
      try {
        const localMeeting = await LocalDatabaseService.getMeetingById(meetingId)
        
        if (localMeeting) {
          console.log('MeetingDetailsScreen: Loading local meeting')
          
          // Load doctor details
          const doctor = await LocalDatabaseService.getDoctorById(localMeeting.doctor_id)
          
          // Load meeting notes and follow-ups
          const [notes, followUpsData] = await Promise.all([
            LocalDatabaseService.getMeetingNotes(meetingId),
            LocalDatabaseService.getMeetingFollowUps(meetingId).catch((error) => {
              console.warn('MeetingDetailsScreen: Failed to load follow-ups:', error);
              return []; // Return empty array on error
            })
          ])
          
          // Format to match MeetingDetails interface
          const formattedDetails: MeetingDetails = {
            meeting_id: localMeeting.id,
            title: localMeeting.title,
            doctor_name: doctor ? `${doctor.first_name} ${doctor.last_name}` : 'Unknown Doctor',
            doctor_specialty: doctor?.specialty || 'N/A',
            hospital: doctor?.hospital || 'N/A',
            scheduled_date: localMeeting.scheduled_date,
            duration_minutes: localMeeting.duration_minutes,
            status: localMeeting.status,
            purpose: localMeeting.purpose || '',
            brochure_info: {
              brochure_id: '',
              brochure_title: ''
            },
            created_at: localMeeting.created_at,
            updated_at: localMeeting.updated_at,
          }
          
          const formattedNotes: SlideNote[] = notes.map(note => ({
            note_id: note.id,
            slide_id: note.slide_id || '',
            slide_title: note.slide_title || '',
            slide_order: note.slide_order,
            note_text: note.note_text,
            slide_image_uri: note.slide_image_uri,
            created_at: note.created_at,
            updated_at: note.updated_at || note.created_at,
            follow_up_id: note.follow_up_id // Add follow_up_id for grouping
          } as SlideNote & { follow_up_id?: string }))
          
          console.log('Meeting data (local):', formattedDetails)
          console.log('Slide notes count (local):', formattedNotes.length)
          console.log('Follow-ups count (local):', followUpsData.length)
          
          setMeetingDetails(formattedDetails)
          setSlideNotes(formattedNotes)
          setFollowUps(followUpsData)
          return
        }
      } catch (localError) {
        console.log('MeetingDetailsScreen: Not a local meeting, trying server...', localError)
      }
      
      // Fallback to server (for synced meetings)
      const result = await MRService.getMeetingDetails(meetingId)
      
      console.log('Meeting details result (server):', result)
      
      if (result.success && result.data) {
        console.log('Meeting data (server):', result.data.meeting)
        console.log('Slide notes count (server):', result.data.slide_notes?.length || 0)
        
        setMeetingDetails(result.data.meeting)
        setSlideNotes(result.data.slide_notes || [])
      } else {
        console.error('Failed to load meeting details:', result.error)
        Alert.alert('Error', result.error || 'Failed to load meeting details')
      }
    } catch (error) {
      console.error('Exception in loadMeetingDetails:', error)
      Alert.alert('Error', 'Failed to load meeting details')
    } finally {
      setIsLoading(false)
    }
  }

  const openSlideModal = (slideNote: SlideNote) => {
    setSelectedSlide(slideNote)
    setShowSlideModal(true)
  }

  const openFullImageModal = (slideNote: SlideNote) => {
    setFullImageSlide(slideNote)
    setShowFullImageModal(true)
  }

  const handleEditNote = (slideNote: SlideNote) => {
    setEditingNote(slideNote)
    setNewNoteText(slideNote.note_text)
    setShowEditNoteModal(true)
  }

  const handleDeleteNote = (slideNote: SlideNote) => {
    Alert.alert(
      'Delete Note',
      `Are you sure you want to delete the note for "${slideNote.slide_title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await OfflineFirstService.deleteMeetingNote(slideNote.note_id)
              if (result.success) {
                Alert.alert('Success', 'Note deleted successfully')
                loadMeetingDetails()
              } else {
                Alert.alert('Error', result.error || 'Failed to delete note')
              }
            } catch (error) {
              console.error('MeetingDetailsScreen: Error deleting note:', error)
              Alert.alert('Error', 'Failed to delete note')
            }
          }
        }
      ]
    )
  }

  const handleSaveEditNote = async () => {
    try {
      if (!editingNote || !newNoteText.trim()) {
        Alert.alert('Error', 'Please enter a note')
        return
      }

      const result = await OfflineFirstService.updateMeetingNote(editingNote.note_id, {
        note_text: newNoteText.trim()
      })
      
      if (result.success) {
        Alert.alert('Success', 'Note updated successfully')
        setShowEditNoteModal(false)
        setNewNoteText('')
        setEditingNote(null)
        loadMeetingDetails()
      } else {
        Alert.alert('Error', result.error || 'Failed to update note')
      }
    } catch (error) {
      console.error('MeetingDetailsScreen: Error updating note:', error)
      Alert.alert('Error', 'Failed to update note')
    }
  }

  const handleAddNote = async () => {
    try {
      if (!newNoteText.trim()) {
        Alert.alert('Error', 'Please enter a note')
        return
      }

      console.log('MeetingDetailsScreen: Attempting to add general meeting note (offline-first)')
      console.log('MeetingDetailsScreen: Meeting ID:', meetingId)

      // Get meeting to check if it has server_id
      const localMeeting = await LocalDatabaseService.getMeetingById(meetingId)
      const meetingServerId = localMeeting?.server_id

      // Add a generic meeting note (not tied to a specific slide) using offline-first approach
      // We'll use slide_order 0 to indicate it's a general meeting note
      // Associate with selected follow-up if one is selected
      const result = await OfflineFirstService.createMeetingNote({
        meeting_id: meetingId,
        meeting_server_id: meetingServerId,
        slide_id: `meeting_note_${Date.now()}`, // Generate unique ID for general note
        slide_title: 'General Meeting Note',
        slide_order: 0, // 0 indicates general note, not slide-specific
        brochure_id: meetingDetails?.brochure_info?.brochure_id || '',
        note_text: newNoteText.trim(),
        slide_image_uri: undefined,
        follow_up_id: selectedFollowUp?.id // Associate with follow-up if selected
      })
      
      if (result.success) {
        console.log('MeetingDetailsScreen: Note added successfully to local DB')
        Alert.alert('Success', 'Note added successfully')
        setShowAddNoteModal(false)
        setNewNoteText('')
        setSelectedFollowUp(null) // Clear selected follow-up
        loadMeetingDetails()
      } else {
        console.error('MeetingDetailsScreen: Failed to add note:', result.error)
        Alert.alert('Error', result.error || 'Failed to add note')
      }
    } catch (error) {
      console.error('MeetingDetailsScreen: Error adding note:', error)
      Alert.alert('Error', 'Failed to add note')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateOnly = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Group notes by follow-up
  const groupNotesByFollowUp = () => {
    const notesByFollowUp = new Map<string | null, SlideNote[]>()
    
    // Initialize with null for original meeting notes
    notesByFollowUp.set(null, [])
    
    // Group notes by follow_up_id
    slideNotes.forEach(note => {
      const followUpId = note.follow_up_id || null
      if (!notesByFollowUp.has(followUpId)) {
        notesByFollowUp.set(followUpId, [])
      }
      notesByFollowUp.get(followUpId)!.push(note)
    })
    
    return notesByFollowUp
  }

  // Handle create follow-up
  const handleCreateFollowUp = async () => {
    try {
      if (!followUpForm.follow_up_date || !followUpForm.follow_up_time) {
        Alert.alert('Error', 'Please select both date and time')
        return
      }

      // Follow-up must be today or later
      const fuDate = new Date(followUpForm.follow_up_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      fuDate.setHours(0, 0, 0, 0)
      if (fuDate < today) {
        Alert.alert('Invalid Date', 'Follow-up date cannot be in the past.')
        return
      }

      // Follow-up must be on or after the meeting date
      if (meetingDetails?.scheduled_date) {
        const meetDate = new Date(meetingDetails.scheduled_date)
        meetDate.setHours(0, 0, 0, 0)
        if (fuDate < meetDate) {
          Alert.alert('Invalid Date', 'Follow-up date must be on or after the meeting date.')
          return
        }
      }

      const result = await OfflineFirstService.createMeetingFollowUp({
        meeting_id: meetingId,
        follow_up_date: followUpForm.follow_up_date,
        follow_up_time: followUpForm.follow_up_time,
        follow_up_notes: followUpForm.follow_up_notes || undefined,
        status: followUpForm.status
      })

      if (result.success) {
        Alert.alert('Success', 'Follow-up created successfully')
        setShowFollowUpModal(false)
        setFollowUpForm({
          follow_up_date: '',
          follow_up_time: '',
          follow_up_notes: '',
          status: 'scheduled'
        })
        loadMeetingDetails()
      } else {
        Alert.alert('Error', result.error || 'Failed to create follow-up')
      }
    } catch (error) {
      console.error('Error creating follow-up:', error)
      Alert.alert('Error', 'Failed to create follow-up')
    }
  }

  // Handle edit follow-up
  const handleEditFollowUp = (followUp: LocalMeetingFollowUp) => {
    setSelectedFollowUp(followUp)
    setFollowUpForm({
      follow_up_date: followUp.follow_up_date,
      follow_up_time: followUp.follow_up_time,
      follow_up_notes: followUp.follow_up_notes || '',
      status: followUp.status
    })
    setShowEditFollowUpModal(true)
  }

  const handleUpdateFollowUp = async () => {
    if (!selectedFollowUp) return

    try {
      // Follow-up must be today or later
      if (followUpForm.follow_up_date) {
        const fuDate = new Date(followUpForm.follow_up_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        fuDate.setHours(0, 0, 0, 0)
        if (fuDate < today) {
          Alert.alert('Invalid Date', 'Follow-up date cannot be in the past.')
          return
        }
        if (meetingDetails?.scheduled_date) {
          const meetDate = new Date(meetingDetails.scheduled_date)
          meetDate.setHours(0, 0, 0, 0)
          if (fuDate < meetDate) {
            Alert.alert('Invalid Date', 'Follow-up date must be on or after the meeting date.')
            return
          }
        }
      }

      const result = await OfflineFirstService.updateMeetingFollowUp(selectedFollowUp.id, {
        follow_up_date: followUpForm.follow_up_date,
        follow_up_time: followUpForm.follow_up_time,
        follow_up_notes: followUpForm.follow_up_notes || undefined,
        status: followUpForm.status
      })

      if (result.success) {
        Alert.alert('Success', 'Follow-up updated successfully')
        setShowEditFollowUpModal(false)
        setSelectedFollowUp(null)
        loadMeetingDetails()
      } else {
        Alert.alert('Error', result.error || 'Failed to update follow-up')
      }
    } catch (error) {
      console.error('Error updating follow-up:', error)
      Alert.alert('Error', 'Failed to update follow-up')
    }
  }

  // Handle delete follow-up
  const handleDeleteFollowUp = (followUp: LocalMeetingFollowUp) => {
    Alert.alert(
      'Delete Follow-up',
      `Are you sure you want to delete Follow-up #${followUp.sequence_number}? This will also delete all notes associated with this follow-up.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await OfflineFirstService.deleteMeetingFollowUp(followUp.id)
              if (result.success) {
                Alert.alert('Success', 'Follow-up deleted successfully')
                loadMeetingDetails()
              } else {
                Alert.alert('Error', result.error || 'Failed to delete follow-up')
              }
            } catch (error) {
              console.error('Error deleting follow-up:', error)
              Alert.alert('Error', 'Failed to delete follow-up')
            }
          }
        }
      ]
    )
  }

  // Handle add notes to follow-up
  const handleAddNotesToFollowUp = (followUp: LocalMeetingFollowUp) => {
    // Navigate to note creation with follow-up context
    // For now, we'll use the existing add note modal but associate with follow-up
    setSelectedFollowUp(followUp)
    setShowAddNoteModal(true)
  }

  // Get notes count for a follow-up
  const getFollowUpNotesCount = (followUpId: string | null) => {
    if (followUpId === null) {
      return slideNotes.filter(n => !n.follow_up_id).length
    }
    return slideNotes.filter(n => n.follow_up_id === followUpId).length
  }

  // Check if follow-up date/time has passed
  const isFollowUpPast = (followUp: LocalMeetingFollowUp) => {
    const followUpDateTime = new Date(followUp.follow_up_date)
    const [hours, minutes] = followUp.follow_up_time.split(':')
    followUpDateTime.setHours(parseInt(hours), parseInt(minutes))
    return followUpDateTime < new Date()
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading meeting details...</Text>
      </View>
    )
  }

  if (!meetingDetails) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorText}>Meeting not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backIconButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meeting Details</Text>
        <TouchableOpacity
          style={styles.headerAddButton}
          onPress={() => setShowAddNoteModal(true)}
        >
          <Ionicons name="add" size={24} color="#8b5cf6" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer}>
        {/* Meeting Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={24} color="#8b5cf6" />
            <Text style={styles.cardTitle}>Meeting Information</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Title:</Text>
            <Text style={styles.infoValue}>{meetingDetails.title}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Doctor:</Text>
            <Text style={styles.infoValue}>{meetingDetails.doctor_name}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Specialty:</Text>
            <Text style={styles.infoValue}>{meetingDetails.doctor_specialty}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hospital:</Text>
            <Text style={styles.infoValue}>{meetingDetails.hospital}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Scheduled:</Text>
            <Text style={styles.infoValue}>{formatDate(meetingDetails.scheduled_date)}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Duration:</Text>
            <Text style={styles.infoValue}>{meetingDetails.duration_minutes} minutes</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Purpose:</Text>
            <Text style={styles.infoValue}>{meetingDetails.purpose}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Brochure:</Text>
            <Text style={styles.infoValue}>{meetingDetails.brochure_info.brochure_title}</Text>
          </View>
        </View>

        {/* Follow-ups Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="repeat" size={24} color="#d97706" />
            <Text style={styles.cardTitle}>Follow-ups ({followUps.length})</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                setFollowUpForm({
                  follow_up_date: new Date().toISOString().split('T')[0],
                  follow_up_time: new Date().toTimeString().slice(0, 5),
                  follow_up_notes: '',
                  status: 'scheduled'
                })
                setShowFollowUpModal(true)
              }}
            >
              <Ionicons name="add-circle" size={20} color="#d97706" />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
          
          {followUps.length > 0 ? (
            followUps.map((followUp) => {
              const notesCount = getFollowUpNotesCount(followUp.id)
              const isPast = isFollowUpPast(followUp)
              
              return (
                <View key={followUp.id} style={[styles.followUpCard, isPast && notesCount === 0 && styles.followUpCardPast]}>
                  <View style={styles.followUpHeader}>
                    <View style={styles.followUpTitleRow}>
                      <View style={styles.followUpBadge}>
                        <Text style={styles.followUpBadgeText}>#{followUp.sequence_number}</Text>
                      </View>
                      <View style={styles.followUpInfo}>
                        <Text style={styles.followUpDate}>
                          {formatDateOnly(followUp.follow_up_date)} at {followUp.follow_up_time}
                        </Text>
                        <View style={styles.followUpMeta}>
                          <View style={[styles.statusBadge, { backgroundColor: followUp.status === 'completed' ? '#10b98120' : followUp.status === 'cancelled' ? '#ef444420' : '#d9770620' }]}>
                            <Text style={[styles.statusText, { color: followUp.status === 'completed' ? '#10b981' : followUp.status === 'cancelled' ? '#ef4444' : '#d97706' }]}>
                              {followUp.status.charAt(0).toUpperCase() + followUp.status.slice(1)}
                            </Text>
                          </View>
                          <Text style={styles.notesCountText}>{notesCount} {notesCount === 1 ? 'note' : 'notes'}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  
                  {followUp.follow_up_notes && (
                    <Text style={styles.followUpNotesText}>{followUp.follow_up_notes}</Text>
                  )}
                  
                  {isPast && notesCount === 0 && (
                    <View style={styles.pastFollowUpWarning}>
                      <Ionicons name="time-outline" size={16} color="#d97706" />
                      <Text style={styles.pastFollowUpWarningText}>Past follow-up with no notes</Text>
                    </View>
                  )}
                  
                  <View style={styles.followUpActions}>
                    <TouchableOpacity
                      style={styles.followUpActionButton}
                      onPress={() => handleAddNotesToFollowUp(followUp)}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#8b5cf6" />
                      <Text style={[styles.followUpActionText, { color: '#8b5cf6' }]}>Add Notes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.followUpActionButton}
                      onPress={() => handleEditFollowUp(followUp)}
                    >
                      <Ionicons name="create-outline" size={16} color="#6b7280" />
                      <Text style={[styles.followUpActionText, { color: '#6b7280' }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.followUpActionButton}
                      onPress={() => handleDeleteFollowUp(followUp)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      <Text style={[styles.followUpActionText, { color: '#ef4444' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="repeat-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>No follow-ups yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Click &quot;Add&quot; to create a follow-up for this meeting
              </Text>
            </View>
          )}
        </View>

        {/* Slide Notes - Grouped by Follow-up */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text" size={24} color="#8b5cf6" />
            <Text style={styles.cardTitle}>Slide Notes ({slideNotes.length})</Text>
          </View>
          
          {slideNotes.length > 0 ? (
            (() => {
              const notesByFollowUp = groupNotesByFollowUp()
              const sections: Array<{ title: string; followUpId: string | null; notes: SlideNote[] }> = []
              
              // Add original meeting notes section
              const originalNotes = notesByFollowUp.get(null) || []
              if (originalNotes.length > 0) {
                sections.push({ title: 'Original Meeting Notes', followUpId: null, notes: originalNotes })
              }
              
              // Add follow-up sections
              followUps.forEach(followUp => {
                const followUpNotes = notesByFollowUp.get(followUp.id) || []
                if (followUpNotes.length > 0) {
                  sections.push({ 
                    title: `Follow-up #${followUp.sequence_number} Notes`, 
                    followUpId: followUp.id, 
                    notes: followUpNotes 
                  })
                }
              })
              
              return sections.map((section, sectionIndex) => (
                <View key={section.followUpId || 'original'} style={sectionIndex > 0 ? styles.notesSectionDivider : null}>
                  <Text style={styles.notesSectionTitle}>{section.title} ({section.notes.length})</Text>
                  {section.notes
                    .sort((a, b) => a.slide_order - b.slide_order)
                    .map((slideNote) => (
                <View
                  key={slideNote.note_id}
                  style={styles.slideNoteCard}
                >
                  <TouchableOpacity
                    style={styles.slideNoteContent}
                    onPress={() => openFullImageModal(slideNote)}
                  >
                    {/* Slide Thumbnail */}
                    <View style={styles.slideThumbnailContainer}>
                      {slideNote.slide_image_uri ? (
                        <Image
                          source={{ uri: slideNote.slide_image_uri }}
                          style={styles.slideThumbnail}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.slideThumbnailPlaceholder}>
                          <Ionicons name="image" size={24} color="#8b5cf6" />
                          <Text style={styles.slideOrderBadge}>#{slideNote.slide_order}</Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.slideNoteInfo}>
                      <Text style={styles.slideTitle}>
                        {slideNote.slide_title}
                      </Text>
                      <Text style={styles.slideTimestamp}>
                        {formatDate(slideNote.created_at)}
                      </Text>
                      <Text style={styles.slideNotePreview} numberOfLines={2}>
                        {slideNote.note_text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  
                  <View style={styles.noteActions}>
                    <TouchableOpacity
                      style={styles.noteActionButton}
                      onPress={() => handleEditNote(slideNote)}
                    >
                      <Ionicons name="create-outline" size={18} color="#6b7280" />
                      <Text style={styles.noteActionText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.noteActionButton}
                      onPress={() => handleDeleteNote(slideNote)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      <Text style={[styles.noteActionText, {color: '#ef4444'}]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                    ))
                  }
                </View>
              ))
            })()
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>No slide notes found</Text>
              <Text style={styles.emptyStateSubtext}>
                Click &quot;Add Note&quot; to add notes to this meeting
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Slide Detail Modal */}
      <Modal
        visible={showSlideModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSlideModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Slide Note</Text>
              <TouchableOpacity onPress={() => setShowSlideModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            {selectedSlide && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.slideDetailInfo}>
                  <Text style={styles.slideDetailTitle}>
                    #{selectedSlide.slide_order} - {selectedSlide.slide_title}
                  </Text>
                  <Text style={styles.slideDetailTimestamp}>
                    {formatDate(selectedSlide.created_at)}
                  </Text>
                </View>
                
                <View style={styles.noteTextContainer}>
                  <Text style={styles.noteLabel}>Note:</Text>
                  <Text style={styles.noteText}>{selectedSlide.note_text}</Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Full Image Modal */}
      <Modal
        visible={showFullImageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFullImageModal(false)}
      >
        <View style={styles.fullImageOverlay}>
          <TouchableOpacity
            style={styles.closeFullImageButton}
            onPress={() => setShowFullImageModal(false)}
          >
            <Ionicons name="close" size={32} color="#ffffff" />
          </TouchableOpacity>
          
          {fullImageSlide && (
            <View style={styles.fullImageContainer}>
              {/* Full Slide Image */}
              {fullImageSlide.slide_image_uri ? (
                <Image
                  source={{ uri: fullImageSlide.slide_image_uri }}
                  style={styles.fullSlideImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.fullImagePlaceholder}>
                  <Ionicons name="image" size={64} color="#8b5cf6" />
                  <Text style={styles.fullImageText}>
                    Slide #{fullImageSlide.slide_order}
                  </Text>
                  <Text style={styles.fullImageTitle}>
                    {fullImageSlide.slide_title}
                  </Text>
                </View>
              )}
              
              <View style={styles.fullImageNoteContainer}>
                <Text style={styles.fullImageNoteLabel}>Note:</Text>
                <Text style={styles.fullImageNoteText}>{fullImageSlide.note_text}</Text>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Edit Note Modal */}
      <Modal
        visible={showEditNoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditNoteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Slide Note</Text>
              <TouchableOpacity onPress={() => setShowEditNoteModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            {editingNote && (
              <View style={styles.modalBody}>
                <View style={styles.slideDetailInfo}>
                  <Text style={styles.slideDetailTitle}>
                    #{editingNote.slide_order} - {editingNote.slide_title}
                  </Text>
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Note:</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Enter your note..."
                    placeholderTextColor="#9ca3af"
                    value={newNoteText}
                    onChangeText={setNewNoteText}
                    multiline
                    numberOfLines={6}
                  />
                </View>
                
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowEditNoteModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveEditNote}
                  >
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Notes Modal */}
      <Modal
        visible={showAddNoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowAddNoteModal(false)
          setSelectedFollowUp(null)
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedFollowUp ? `Add Notes to Follow-up #${selectedFollowUp.sequence_number}` : 'Add Notes'}
              </Text>
              <TouchableOpacity onPress={() => {
                setShowAddNoteModal(false)
                setSelectedFollowUp(null)
              }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            {selectedFollowUp && (
              <View style={styles.followUpContext}>
                <Ionicons name="calendar" size={16} color="#d97706" />
                <Text style={styles.followUpContextText}>
                  {formatDateOnly(selectedFollowUp.follow_up_date)} at {selectedFollowUp.follow_up_time}
                </Text>
              </View>
            )}
            
            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Note:</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter your meeting notes..."
                  placeholderTextColor="#9ca3af"
                  value={newNoteText}
                  onChangeText={setNewNoteText}
                  multiline
                  numberOfLines={6}
                />
              </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddNoteModal(false)
                    setNewNoteText('')
                    setSelectedFollowUp(null)
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleAddNote}
                >
                  <Text style={styles.saveButtonText}>Add Note</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Follow-up Modal */}
      <Modal
        visible={showFollowUpModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFollowUpModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Follow-up</Text>
              <TouchableOpacity onPress={() => setShowFollowUpModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Date:</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    const initialDate = followUpForm.follow_up_date 
                      ? new Date(followUpForm.follow_up_date)
                      : new Date()
                    const minDate = meetingDetails?.scheduled_date
                      ? new Date(Math.max(new Date(meetingDetails.scheduled_date).getTime(), new Date().setHours(0,0,0,0)))
                      : new Date()
                    datePicker.showDate(initialDate, { mode: 'date', minimumDate: minDate }, (result: DatePickerResult) => {
                      if (!result.cancelled && result.date) {
                        setFollowUpForm({ ...followUpForm, follow_up_date: result.date.toISOString().split('T')[0] })
                      }
                    })
                  }}
                >
                  <Text style={styles.dateTimeButtonText}>
                    {followUpForm.follow_up_date || 'Select Date'}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color="#8b5cf6" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Time:</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    const currentTime = followUpForm.follow_up_time 
                      ? new Date(`2000-01-01T${followUpForm.follow_up_time}`)
                      : new Date()
                    datePicker.showTime(currentTime, { mode: 'time' }, (result: DatePickerResult) => {
                      if (!result.cancelled && result.date) {
                        setFollowUpForm({ ...followUpForm, follow_up_time: result.date.toTimeString().slice(0, 5) })
                      }
                    })
                  }}
                >
                  <Text style={styles.dateTimeButtonText}>
                    {followUpForm.follow_up_time || 'Select Time'}
                  </Text>
                  <Ionicons name="time-outline" size={20} color="#8b5cf6" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Notes (Optional):</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter follow-up notes..."
                  placeholderTextColor="#9ca3af"
                  value={followUpForm.follow_up_notes}
                  onChangeText={(text) => setFollowUpForm({ ...followUpForm, follow_up_notes: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Status:</Text>
                <View style={styles.statusButtons}>
                  {(['scheduled', 'completed', 'cancelled'] as const).map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusButton,
                        followUpForm.status === status && styles.statusButtonActive
                      ]}
                      onPress={() => setFollowUpForm({ ...followUpForm, status })}
                    >
                      <Text style={[
                        styles.statusButtonText,
                        followUpForm.status === status && styles.statusButtonTextActive
                      ]}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowFollowUpModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleCreateFollowUp}
                >
                  <Text style={styles.saveButtonText}>Create Follow-up</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Follow-up Modal */}
      <Modal
        visible={showEditFollowUpModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowEditFollowUpModal(false)
          setSelectedFollowUp(null)
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Follow-up #{selectedFollowUp?.sequence_number}</Text>
              <TouchableOpacity onPress={() => {
                setShowEditFollowUpModal(false)
                setSelectedFollowUp(null)
              }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Date:</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    const initialDate = followUpForm.follow_up_date 
                      ? new Date(followUpForm.follow_up_date)
                      : new Date()
                    const minDate = meetingDetails?.scheduled_date
                      ? new Date(Math.max(new Date(meetingDetails.scheduled_date).getTime(), new Date().setHours(0,0,0,0)))
                      : new Date()
                    datePicker.showDate(initialDate, { mode: 'date', minimumDate: minDate }, (result: DatePickerResult) => {
                      if (!result.cancelled && result.date) {
                        setFollowUpForm({ ...followUpForm, follow_up_date: result.date.toISOString().split('T')[0] })
                      }
                    })
                  }}
                >
                  <Text style={styles.dateTimeButtonText}>
                    {followUpForm.follow_up_date || 'Select Date'}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color="#8b5cf6" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Time:</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    const currentTime = followUpForm.follow_up_time 
                      ? new Date(`2000-01-01T${followUpForm.follow_up_time}`)
                      : new Date()
                    datePicker.showTime(currentTime, { mode: 'time' }, (result: DatePickerResult) => {
                      if (!result.cancelled && result.date) {
                        setFollowUpForm({ ...followUpForm, follow_up_time: result.date.toTimeString().slice(0, 5) })
                      }
                    })
                  }}
                >
                  <Text style={styles.dateTimeButtonText}>
                    {followUpForm.follow_up_time || 'Select Time'}
                  </Text>
                  <Ionicons name="time-outline" size={20} color="#8b5cf6" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Notes (Optional):</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter follow-up notes..."
                  placeholderTextColor="#9ca3af"
                  value={followUpForm.follow_up_notes}
                  onChangeText={(text) => setFollowUpForm({ ...followUpForm, follow_up_notes: text })}
                  multiline
                  numberOfLines={4}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Status:</Text>
                <View style={styles.statusButtons}>
                  {(['scheduled', 'completed', 'cancelled'] as const).map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusButton,
                        followUpForm.status === status && styles.statusButtonActive
                      ]}
                      onPress={() => setFollowUpForm({ ...followUpForm, status })}
                    >
                      <Text style={[
                        styles.statusButtonText,
                        followUpForm.status === status && styles.statusButtonTextActive
                      ]}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowEditFollowUpModal(false)
                    setSelectedFollowUp(null)
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleUpdateFollowUp}
                >
                  <Text style={styles.saveButtonText}>Update Follow-up</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bottom Sheet Date Picker */}
      <BottomSheetDatePicker
        visible={datePicker.visible}
        value={datePicker.value}
        mode={datePicker.config.mode}
        onConfirm={datePicker.handleConfirm}
        onCancel={datePicker.handleCancel}
        title={datePicker.config.title}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingTop: 20, // Add padding to prevent status bar overlap
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backIconButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  headerAddButton: {
    padding: 8,
  },
  placeholder: {
    width: 40,
  },
  scrollContainer: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d9770620',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d97706',
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    width: 100,
  },
  infoValue: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  slideNoteCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  slideNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  slideInfo: {
    flex: 1,
  },
  slideTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  slideTimestamp: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  slideNotePreview: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: getModalBorderRadius(),
    width: getModalWidth(90),
    maxHeight: getModalMaxHeight(80),
    padding: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: getModalPadding(),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  modalBody: {
    padding: getModalPadding(),
  },
  slideDetailInfo: {
    marginBottom: 16,
  },
  slideDetailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  slideDetailTimestamp: {
    fontSize: 14,
    color: '#6b7280',
  },
  noteTextContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  // New styles for Phase 2
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  addNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addNoteButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  slideNoteContent: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  slideThumbnailContainer: {
    marginRight: 12,
  },
  slideThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  slideThumbnailPlaceholder: {
    width: 80,
    height: 60,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  slideOrderBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8b5cf6',
    marginTop: 4,
  },
  slideNoteInfo: {
    flex: 1,
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  noteActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f9fafb',
  },
  noteActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginLeft: 4,
  },
  fullImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFullImageButton: {
    position: 'absolute',
    top: isTablet() ? 40 : 50,
    right: isTablet() ? 24 : 20,
    zIndex: 10,
  },
  fullImageContainer: {
    width: getModalWidth(90),
    maxHeight: getModalMaxHeight(80),
  },
  fullSlideImage: {
    width: '100%',
    height: isTablet() ? 600 : 400, // Larger height on tablets
    backgroundColor: '#ffffff',
    borderRadius: getModalBorderRadius(),
    marginBottom: isTablet() ? 24 : 20,
  },
  fullImagePlaceholder: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    marginBottom: 20,
  },
  fullImageText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  fullImageTitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  fullImageNoteContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  fullImageNoteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  fullImageNoteText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
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
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#374151',
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cancelButtonText: {
    fontSize: 14,
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
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  followUpCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  followUpCardPast: {
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
  },
  followUpHeader: {
    marginBottom: 8,
  },
  followUpTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  followUpBadge: {
    backgroundColor: '#d97706',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  followUpBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  followUpInfo: {
    flex: 1,
  },
  followUpDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  followUpMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  notesCountText: {
    fontSize: 12,
    color: '#6b7280',
  },
  followUpNotesText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  pastFollowUpWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    gap: 6,
  },
  pastFollowUpWarningText: {
    fontSize: 12,
    color: '#d97706',
    fontWeight: '500',
  },
  followUpActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  followUpActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  followUpActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  followUpContext: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    gap: 8,
  },
  followUpContextText: {
    fontSize: 13,
    color: '#d97706',
    fontWeight: '500',
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
    marginTop: 8,
  },
  dateTimeButtonText: {
    fontSize: 14,
    color: '#374151',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  statusButtonActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  statusButtonTextActive: {
    color: '#ffffff',
  },
  notesSectionDivider: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  notesSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
})

export default MeetingDetailsScreen
