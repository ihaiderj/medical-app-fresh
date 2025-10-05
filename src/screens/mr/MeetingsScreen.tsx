import React, { useState, useEffect } from "react"
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
  Platform,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import DateTimePicker from '@react-native-community/datetimepicker'
import { AuthService } from "../../services/AuthService"
import { MRService, MRMeeting } from "../../services/MRService"
import MeetingDetailsModal from "../../components/MeetingDetailsModal"

interface MeetingsScreenProps {
  navigation: any
  route?: any
}

export default function MeetingsScreen({ navigation, route }: MeetingsScreenProps) {
  const { doctorId } = route?.params || {}

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState("All")
  const [showMeetingDetails, setShowMeetingDetails] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null)
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [followUpRequired, setFollowUpRequired] = useState(false)
  const [followUpDate, setFollowUpDate] = useState("")
  const [followUpTime, setFollowUpTime] = useState("")
  const [followUpNotes, setFollowUpNotes] = useState("")
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [showDoctorSelectionModal, setShowDoctorSelectionModal] = useState(false)
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false)
  
  // Date/Time picker states
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTime, setSelectedTime] = useState(new Date())
  const [datePickerMode, setDatePickerMode] = useState<'edit' | 'followup'>('edit')
  const [meetingForm, setMeetingForm] = useState({
    doctor_id: '',
    scheduled_date: '',
    duration_minutes: 30,
    purpose: '',
    notes: '',
  })
  const [meetings, setMeetings] = useState<MRMeeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [availableDoctors, setAvailableDoctors] = useState<any[]>([])
  
  // Doctor form state for inline creation
  const [doctorForm, setDoctorForm] = useState({
    first_name: '',
    last_name: '',
    specialty: '',
    hospital: '',
    phone: '',
    email: '',
    location: '',
    notes: ''
  })
  
  // Initialize meetings as empty array to prevent map errors
  React.useEffect(() => {
    if (!meetings) {
      setMeetings([])
    }
  }, [])

  const filters = ["All", "This Week", "This Month", "Follow-up Required", "Completed"]

  // Load meetings and doctors on component mount
  useEffect(() => {
    loadMeetings()
    loadAvailableDoctors()
  }, [])

  const loadAvailableDoctors = async () => {
    try {
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success && userResult.user) {
        const doctorsResult = await MRService.getAssignedDoctors(userResult.user.id)
        if (doctorsResult.success && doctorsResult.data) {
          setAvailableDoctors(doctorsResult.data)
        }
      }
    } catch (error) {
      console.error('Error loading doctors:', error)
    }
  }

  const loadMeetings = async () => {
    setIsLoading(true)
    try {
      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        // Get meetings for this MR
        const meetingsResult = await MRService.getMeetings(userResult.user.id, selectedFilter)
        
        console.log('Meetings result:', meetingsResult)
        
        if (meetingsResult.success && meetingsResult.data) {
          const meetingsData = Array.isArray(meetingsResult.data) ? meetingsResult.data : []
          console.log('Setting meetings data:', meetingsData)
          setMeetings(meetingsData)
        } else {
          console.error('Failed to load meetings:', meetingsResult.error)
          setMeetings([]) // Ensure it's always an array
        }
      }
    } catch (error) {
      console.error('Error loading meetings:', error)
      Alert.alert("Error", "Failed to load meetings")
    } finally {
      setIsLoading(false)
    }
  }

  // Reload meetings when filter changes
  useEffect(() => {
    if (!isLoading) {
      loadMeetings()
    }
  }, [selectedFilter])

  // Helper function to format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No date'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const filteredMeetings = React.useMemo(() => {
    if (!meetings || !Array.isArray(meetings)) {
      console.log('Meetings data is not an array:', meetings)
      return []
    }

    return meetings.map((meeting) => {
      // Auto-complete meetings if date has passed
      const now = new Date()
      now.setHours(0, 0, 0, 0) // Reset to start of day for comparison
      
      // Check if meeting should be auto-completed
      let autoCompletedStatus = meeting.status
      if (meeting.status !== 'completed' && meeting.status !== 'cancelled') {
        // Priority 1: Check if follow-up date/time has passed
        if (meeting.follow_up_date && meeting.follow_up_time) {
          const followUpDateTime = new Date(meeting.follow_up_date)
          const [hours, minutes] = meeting.follow_up_time.split(':')
          followUpDateTime.setHours(parseInt(hours), parseInt(minutes))
          
          if (followUpDateTime < new Date()) {
            autoCompletedStatus = 'completed'
          }
        }
        // Priority 2: If no follow-up, check scheduled date/time
        else if (meeting.scheduled_date) {
          const meetingDateTime = new Date(meeting.scheduled_date)
          if (meetingDateTime < new Date()) {
            autoCompletedStatus = 'completed'
          }
        }
      }
      
      return {
        ...meeting,
        status: autoCompletedStatus
      }
    }).filter((meeting) => {
      if (!meeting) return false
      
      const doctorName = meeting.doctor_name || `${meeting.doctor_first_name || ''} ${meeting.doctor_last_name || ''}`.trim()
      const matchesSearch = doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           meeting.hospital?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           meeting.purpose?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           meeting.title?.toLowerCase().includes(searchQuery.toLowerCase())

      let matchesFilter = true
      const meetingDate = new Date(meeting.scheduled_date || meeting.meeting_date)
      
      if (selectedFilter === "This Week") {
        const now = new Date()
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()))
        const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 7))
        matchesFilter = meetingDate >= weekStart && meetingDate <= weekEnd
      } else if (selectedFilter === "This Month") {
        const now = new Date()
        matchesFilter = meetingDate.getMonth() === now.getMonth() && 
                       meetingDate.getFullYear() === now.getFullYear()
      } else if (selectedFilter === "Follow-up Required") {
        matchesFilter = meeting.follow_up_required === true
      } else if (selectedFilter === "Completed") {
        matchesFilter = meeting.status === "completed"
      }

      return matchesSearch && matchesFilter
    })
  }, [meetings, searchQuery, selectedFilter])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#10b981"
      case "follow-up-scheduled":
        return "#d97706"
      case "cancelled":
        return "#ef4444"
      default:
        return "#6b7280"
    }
  }

  const handleViewMeeting = (meeting: any) => {
    setSelectedMeeting(meeting)
    setShowMeetingDetails(true)
  }

  const handleEditMeeting = (meeting: any) => {
    console.log('Editing meeting:', meeting)
    setSelectedMeeting(meeting)
    
    // Find the doctor_id from the doctor name
    const doctor = availableDoctors.find(d => 
      `${d.first_name} ${d.last_name}` === meeting.doctor_name
    )
    
    setMeetingForm({
      doctor_id: doctor?.doctor_id || meeting.doctor_id || '',
      scheduled_date: meeting.scheduled_date || '',
      duration_minutes: meeting.duration_minutes || 30,
      purpose: meeting.title || meeting.purpose || '',
      notes: meeting.purpose || meeting.notes || ''
    })
    setFollowUpRequired(meeting.follow_up_required || false)
    setFollowUpDate(meeting.follow_up_date || "")
    setShowEditModal(true)
  }

  const handleFollowUp = (meeting: any) => {
    setSelectedMeeting(meeting)
    setFollowUpDate(meeting.follow_up_date || new Date().toISOString().split('T')[0])
    setFollowUpTime(meeting.follow_up_time || '09:00')
    setFollowUpNotes(meeting.follow_up_notes || '')
    setShowFollowUpModal(true)
  }

  const handleSaveEdit = async () => {
    try {
      console.log('=== EDIT MEETING DEBUG ===')
      console.log('selectedMeeting:', selectedMeeting)
      console.log('meetingForm:', meetingForm)
      
      if (!selectedMeeting) {
        console.log('ERROR: No selected meeting')
        return
      }

      console.log('Calling MRService.updateMeeting with params:')
      console.log('- meeting_id:', selectedMeeting.meeting_id)
      console.log('- scheduled_date:', meetingForm.scheduled_date)
      console.log('- duration_minutes:', meetingForm.duration_minutes)
      console.log('- notes:', meetingForm.notes)

      const result = await MRService.updateMeeting(
        selectedMeeting.meeting_id,
        meetingForm.scheduled_date,
        meetingForm.duration_minutes,
        undefined, // presentationId
        meetingForm.notes,
        'scheduled', // status
        meetingForm.purpose, // title
        meetingForm.doctor_id || undefined // doctorId
      )
      
      console.log('Update meeting result:', result)
      
      if (result.success) {
        console.log('SUCCESS: Meeting updated successfully')
        Alert.alert("Success", "Meeting updated successfully!")
        setShowEditModal(false)
        loadMeetings() // Refresh the meetings list
      } else {
        console.log('ERROR: Update failed:', result.error)
        Alert.alert("Error", result.error || "Failed to update meeting")
      }
    } catch (error) {
      console.error('EXCEPTION in handleSaveEdit:', error)
      Alert.alert("Error", "Failed to update meeting")
    }
  }

  const handleSaveFollowUp = async () => {
    try {
      console.log('=== FOLLOW-UP SAVE DEBUG ===')
      console.log('selectedMeeting:', selectedMeeting)
      console.log('followUpDate:', followUpDate)
      console.log('followUpTime:', followUpTime)
      console.log('followUpNotes:', followUpNotes)
      
      if (!selectedMeeting) {
        console.log('ERROR: No selected meeting')
        return
      }

      const followUpData = {
        meeting_id: selectedMeeting.meeting_id,
        follow_up_date: followUpDate,
        follow_up_time: followUpTime,
        follow_up_notes: followUpNotes
      }

      console.log('Calling updateMeetingFollowUp with:', followUpData)

      const result = await MRService.updateMeetingFollowUp(followUpData)
      
      console.log('Follow-up result:', result)
      
      if (result.success) {
        console.log('SUCCESS: Follow-up saved successfully')
        Alert.alert("Success", "Follow-up saved successfully!")
        setShowFollowUpModal(false)
        loadMeetings() // Refresh the meetings list
      } else {
        console.log('ERROR: Follow-up save failed:', result.error)
        Alert.alert("Error", result.error || "Failed to save follow-up")
      }
    } catch (error) {
      console.error('EXCEPTION in handleSaveFollowUp:', error)
      Alert.alert("Error", "Failed to save follow-up")
    }
  }

  // Date/Time picker handlers
  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false)
    if (selectedDate) {
      if (datePickerMode === 'edit') {
        const currentTime = meetingForm.scheduled_date ? new Date(meetingForm.scheduled_date) : new Date()
        const newDateTime = new Date(selectedDate)
        newDateTime.setHours(currentTime.getHours(), currentTime.getMinutes())
        setMeetingForm({...meetingForm, scheduled_date: newDateTime.toISOString()})
      } else {
        setFollowUpDate(selectedDate.toISOString().split('T')[0])
      }
    }
  }

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false)
    if (selectedTime) {
      if (datePickerMode === 'edit') {
        const currentDate = meetingForm.scheduled_date ? new Date(meetingForm.scheduled_date) : new Date()
        const newDateTime = new Date(currentDate)
        newDateTime.setHours(selectedTime.getHours(), selectedTime.getMinutes())
        setMeetingForm({...meetingForm, scheduled_date: newDateTime.toISOString()})
      } else {
        setFollowUpTime(selectedTime.toTimeString().slice(0, 5))
      }
    }
  }

  const handleViewSlideFullScreen = (slide: any) => {
    Alert.alert("View Slide", `Viewing: ${slide.title}`)
    // Implement full-screen slide view
  }

  const handleAddMeeting = async () => {
    try {
      if (!meetingForm.doctor_id || !meetingForm.purpose.trim()) {
        Alert.alert("Error", "Please select a doctor and enter meeting purpose")
        return
      }

      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success && userResult.user) {
        // Create meeting with brochure association (no specific brochure for now)
        const result = await MRService.createMeeting({
          mr_id: userResult.user.id,
          doctor_id: meetingForm.doctor_id,
          brochure_id: '', // Will be set when notes are added
          brochure_title: '',
          title: `Meeting with ${availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.first_name || 'Doctor'}`,
          purpose: meetingForm.purpose,
          scheduled_date: meetingForm.scheduled_date || new Date().toISOString(),
          duration_minutes: meetingForm.duration_minutes
        })
        
        if (result.success) {
          Alert.alert("Success", "Meeting scheduled successfully!")
          setShowAddModal(false)
          resetMeetingForm()
          loadMeetings()
        } else {
          Alert.alert("Error", result.error || "Failed to schedule meeting")
        }
      }
    } catch (error) {
      console.error('Error scheduling meeting:', error)
      Alert.alert("Error", "Failed to schedule meeting")
    }
  }

  const handleUpdateMeeting = async () => {
    if (!selectedMeeting) return
    
    try {
      // Update meeting
      const result = await MRService.updateMeeting(
        selectedMeeting.id,
        meetingForm.scheduled_date,
        meetingForm.duration_minutes,
        undefined, // presentation_id
        meetingForm.notes,
        selectedMeeting.status
      )
      
      if (result.success) {
        Alert.alert("Success", "Meeting updated successfully!")
        setShowEditModal(false)
        resetMeetingForm()
        loadMeetings()
      } else {
        Alert.alert("Error", result.error || "Failed to update meeting")
      }
    } catch (error) {
      console.error('Error updating meeting:', error)
      Alert.alert("Error", "Failed to update meeting")
    }
  }

  const handleDeleteMeeting = (meeting: any) => {
    console.log('=== DELETE MEETING DEBUG ===')
    console.log('Meeting to delete:', meeting)
    console.log('Meeting ID (meeting.meeting_id):', meeting.meeting_id)
    console.log('Meeting ID (meeting.id):', meeting.id)
    
    Alert.alert(
      "Delete Meeting",
      `Are you sure you want to delete the meeting "${meeting.title || meeting.purpose}"?\\n\\nThis action cannot be undone and will remove all associated slide notes.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const meetingId = meeting.meeting_id || meeting.id
              console.log('Attempting to delete meeting with ID:', meetingId)
              console.log('Calling MRService.deleteMeeting...')
              
              const result = await MRService.deleteMeeting(meetingId)
              
              console.log('Delete result:', result)
              
              if (result.success) {
                console.log('SUCCESS: Meeting deleted successfully')
                Alert.alert("Success", "Meeting deleted successfully!")
                loadMeetings() // Refresh the meetings list
              } else {
                console.log('ERROR: Delete failed:', result.error)
                Alert.alert("Error", result.error || "Failed to delete meeting")
              }
            } catch (error) {
              console.error('EXCEPTION in handleDeleteMeeting:', error)
              Alert.alert("Error", "Failed to delete meeting")
            }
          }
        }
      ]
    )
  }

  const resetMeetingForm = () => {
    setMeetingForm({
      doctor_id: '',
      scheduled_date: '',
      duration_minutes: 30,
      purpose: '',
      notes: '',
    })
  }

  const resetDoctorForm = () => {
    setDoctorForm({
      first_name: '',
      last_name: '',
      specialty: '',
      hospital: '',
      phone: '',
      email: '',
      location: '',
      notes: ''
    })
  }

  const handleAddDoctor = async () => {
    try {
      // Validate required fields
      if (!doctorForm.first_name.trim() || !doctorForm.last_name.trim() || 
          !doctorForm.specialty.trim() || !doctorForm.hospital.trim()) {
        Alert.alert('Error', 'Please fill in all required fields (Name, Specialty, Hospital)')
        return
      }

      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        Alert.alert('Error', 'Please log in to add doctors')
        return
      }

      const doctorData = {
        first_name: doctorForm.first_name.trim(),
        last_name: doctorForm.last_name.trim(),
        specialty: doctorForm.specialty.trim(),
        hospital: doctorForm.hospital.trim(),
        phone: doctorForm.phone.trim(),
        email: doctorForm.email.trim(),
        location: doctorForm.location.trim(),
        notes: doctorForm.notes.trim(),
        profile_image_url: null
      }

      const result = await MRService.addDoctor(userResult.user.id, doctorData)
      
      if (result.success) {
        Alert.alert('Success', 'Doctor added successfully!', [
          {
            text: 'OK',
            onPress: async () => {
              setShowAddDoctorModal(false)
              resetDoctorForm()
              
              // Reload doctors
              await loadAvailableDoctors()
              
              // Return to doctor selection modal
              setShowDoctorSelectionModal(true)
            }
          }
        ])
      } else {
        Alert.alert('Error', result.error || 'Failed to add doctor')
      }
    } catch (error) {
      console.error('Error adding doctor:', error)
      Alert.alert('Error', 'Failed to add doctor')
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      
      {/* Static Header Section */}
      <View style={styles.staticHeader}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Meeting Records</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={20} color="#ffffff" />
            </TouchableOpacity>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="filter" size={20} color="#8b5cf6" />
          </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6b7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search meetings..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Filter Chips */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContentContainer}
        >
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, selectedFilter === filter && styles.filterChipActive]}
              onPress={() => setSelectedFilter(filter)}
            >
              <Text style={[styles.filterText, selectedFilter === filter && styles.filterTextActive]}>{filter}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.meetingsList}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Loading meetings...</Text>
            </View>
          ) : filteredMeetings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No Meetings Found</Text>
              <Text style={styles.emptyMessage}>
                {searchQuery || selectedFilter !== "All" 
                  ? "No meetings match your current filters" 
                  : "You don't have any meetings scheduled yet"}
              </Text>
            </View>
          ) : (
            filteredMeetings && filteredMeetings.length > 0 ? filteredMeetings.map((meeting) => (
            <TouchableOpacity 
              key={meeting.meeting_id} 
              style={styles.meetingCard}
              onPress={() => navigation.navigate('MeetingDetails', { meetingId: meeting.meeting_id })}
            >
            <View style={styles.meetingHeader}>
              <View style={styles.doctorImageContainer}>
                {meeting.profile_image_url ? (
                  <Image
                    source={{ uri: meeting.profile_image_url }}
                    style={styles.doctorImage}
                    onError={() => console.log('Failed to load doctor image')}
                  />
                ) : (
                  <View style={[styles.doctorImage, styles.defaultDoctorImage]}>
                    <Ionicons name="person" size={24} color="#8b5cf6" />
                  </View>
                )}
              </View>
              <View style={styles.meetingInfo}>
                  <Text style={styles.meetingTitle}>{meeting.title || meeting.purpose || 'Untitled Meeting'}</Text>
                  <Text style={styles.doctorName}>{meeting.doctor_name || `${meeting.doctor_first_name} ${meeting.doctor_last_name}`}</Text>
                <Text style={styles.doctorDetails}>
                    {meeting.doctor_specialty} • {meeting.hospital}
                </Text>
                <Text style={styles.meetingDate}>
                    {formatDate(meeting.scheduled_date)} • {meeting.duration_minutes} min
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(meeting.status)}20` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(meeting.status) }]}>
                  {meeting.status.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </Text>
              </View>
            </View>

            <View style={styles.presentationInfo}>
              <Ionicons name="play-circle" size={16} color="#8b5cf6" />
                <Text style={styles.presentationTitle}>{meeting.purpose || 'No purpose specified'}</Text>
            </View>

              {meeting.follow_up_required && meeting.follow_up_date && (
              <View style={styles.followUpInfo}>
                <Ionicons name="calendar" size={14} color="#d97706" />
                  <Text style={styles.followUpText}>
                    Follow-up: {formatDate(meeting.follow_up_date)}
                    {meeting.follow_up_time && ` at ${meeting.follow_up_time}`}
                  </Text>
              </View>
            )}

            <View style={styles.meetingActions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleEditMeeting(meeting)}>
                <Ionicons name="create" size={16} color="#6b7280" />
                <Text style={[styles.actionButtonText, { color: "#6b7280" }]}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={() => handleFollowUp(meeting)}
              >
                <Ionicons name="calendar" size={16} color="#d97706" />
                <Text style={[styles.actionButtonText, { color: "#d97706" }]}>
                  {meeting.follow_up_date ? 'Edit Follow Up' : 'Follow Up'}
                </Text>
              </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => handleDeleteMeeting(meeting)}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={[styles.actionButtonText, { color: "#ef4444" }]}>Delete</Text>
              </TouchableOpacity>
            </View>
            </TouchableOpacity>
          )) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No Meetings Found</Text>
              <Text style={styles.emptyMessage}>No meetings available</Text>
            </View>
          )
          )}
        </View>
      </ScrollView>

      {/* Meeting Details Modal */}
      <Modal visible={showMeetingDetails} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.detailsModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Meeting Details</Text>
              <TouchableOpacity onPress={() => setShowMeetingDetails(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {selectedMeeting && (
              <ScrollView style={styles.detailsContent}>
                <View style={styles.meetingOverview}>
                  <Text style={styles.detailsDoctorName}>{selectedMeeting.doctorName}</Text>
                  <Text style={styles.detailsDoctorInfo}>
                    {selectedMeeting.doctorSpecialty} • {selectedMeeting.hospital}
                  </Text>
                  <Text style={styles.detailsDateTime}>
                    {selectedMeeting.date} at {selectedMeeting.time} • Duration: {selectedMeeting.duration}
                  </Text>
                  <Text style={styles.detailsPresentation}>Presentation: {selectedMeeting.presentation}</Text>
                </View>

                <View style={styles.slidesSection}>
                  <Text style={styles.sectionTitle}>Meeting Notes</Text>
                  <Text style={styles.notesCount}>
                    {selectedMeeting.notes_count || 0} slide notes recorded
                  </Text>
                  {selectedMeeting.brochure_title && (
                    <View style={styles.brochureInfo}>
                      <Ionicons name="document-text" size={16} color="#8b5cf6" />
                      <Text style={styles.brochureTitle}>Brochure: {selectedMeeting.brochure_title}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.notesSection}>
                  <Text style={styles.sectionTitle}>Overall Notes</Text>
                  <Text style={styles.overallNotes}>{selectedMeeting.overallNotes}</Text>
                </View>

                {selectedMeeting.followUpRequired && (
                  <View style={styles.followUpSection}>
                    <Text style={styles.sectionTitle}>Follow-up</Text>
                    <Text style={styles.followUpDetails}>Scheduled for: {selectedMeeting.followUpDate}</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Meeting Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.largeModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Meeting</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Doctor</Text>
                <TouchableOpacity
                  style={styles.doctorSelectionButton}
                  onPress={() => setShowDoctorSelectionModal(true)}
                >
                  {meetingForm.doctor_id ? (
                    <View style={styles.selectedDoctorInfo}>
                      <Text style={styles.selectedDoctorName}>
                        {availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.first_name} {availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.last_name}
                      </Text>
                      <Text style={styles.selectedDoctorDetails}>
                        {availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.specialty} • {availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.hospital}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.placeholderText}>
                      {selectedMeeting?.doctor_name || 'Select Doctor'}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Title</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter meeting title"
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.purpose}
                  onChangeText={(text) => setMeetingForm({...meetingForm, purpose: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Date</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setDatePickerMode('edit')
                    setSelectedDate(new Date(meetingForm.scheduled_date || Date.now()))
                    setShowDatePicker(true)
                  }}
                >
                  <Ionicons name="calendar" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {meetingForm.scheduled_date ? 
                      new Date(meetingForm.scheduled_date).toLocaleDateString() : 
                      'Select Date'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Time</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setDatePickerMode('edit')
                    setSelectedTime(new Date(meetingForm.scheduled_date || Date.now()))
                    setShowTimePicker(true)
                  }}
                >
                  <Ionicons name="time" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {meetingForm.scheduled_date ? 
                      new Date(meetingForm.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
                      'Select Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Duration (minutes)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="30"
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.duration_minutes?.toString()}
                  onChangeText={(text) => setMeetingForm({...meetingForm, duration_minutes: parseInt(text) || 30})}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter meeting notes..."
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.notes}
                  onChangeText={(text) => setMeetingForm({...meetingForm, notes: text})}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowEditModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Meeting Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule New Meeting</Text>
              <TouchableOpacity onPress={() => {
                setShowAddModal(false)
                resetMeetingForm()
              }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Doctor</Text>
                <TouchableOpacity
                  style={styles.doctorSelectionButton}
                  onPress={() => setShowDoctorSelectionModal(true)}
                >
                  {meetingForm.doctor_id ? (
                    <View style={styles.selectedDoctorInfo}>
                      <Text style={styles.selectedDoctorName}>
                        {availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.first_name} {availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.last_name}
                      </Text>
                      <Text style={styles.selectedDoctorDetails}>
                        {availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.specialty} • {availableDoctors.find(d => d.doctor_id === meetingForm.doctor_id)?.hospital}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.placeholderText}>Select Doctor</Text>
                  )}
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Date</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setDatePickerMode('edit')
                    setSelectedDate(new Date(meetingForm.scheduled_date || Date.now()))
                    setShowDatePicker(true)
                  }}
                >
                  <Ionicons name="calendar" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {meetingForm.scheduled_date ? 
                      new Date(meetingForm.scheduled_date).toLocaleDateString() : 
                      'Select Date'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Time</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setDatePickerMode('edit')
                    setSelectedTime(new Date(meetingForm.scheduled_date || Date.now()))
                    setShowTimePicker(true)
                  }}
                >
                  <Ionicons name="time" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {meetingForm.scheduled_date ? 
                      new Date(meetingForm.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
                      'Select Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Duration (minutes)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="30"
                  keyboardType="numeric"
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.duration_minutes.toString()}
                  onChangeText={(text) => setMeetingForm({...meetingForm, duration_minutes: parseInt(text) || 30})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Purpose</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Meeting purpose"
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.purpose}
                  onChangeText={(text) => setMeetingForm({...meetingForm, purpose: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Additional notes..."
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.notes}
                  onChangeText={(text) => setMeetingForm({...meetingForm, notes: text})}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => {
                setShowAddModal(false)
                resetMeetingForm()
              }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleAddMeeting}>
                <Text style={styles.saveButtonText}>Schedule Meeting</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Follow-up Modal */}
      <Modal visible={showFollowUpModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedMeeting?.follow_up_date ? 'Edit Follow-up' : 'Schedule Follow-up'}
              </Text>
              <TouchableOpacity onPress={() => setShowFollowUpModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Date</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setDatePickerMode('followup')
                    setSelectedDate(new Date(followUpDate || Date.now()))
                    setShowDatePicker(true)
                  }}
                >
                  <Ionicons name="calendar" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {followUpDate ? 
                      new Date(followUpDate).toLocaleDateString() : 
                      'Select Date'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Time</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setDatePickerMode('followup')
                    const timeDate = new Date()
                    if (followUpTime) {
                      const [hours, minutes] = followUpTime.split(':')
                      timeDate.setHours(parseInt(hours), parseInt(minutes))
                    }
                    setSelectedTime(timeDate)
                    setShowTimePicker(true)
                  }}
                >
                  <Ionicons name="time" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {followUpTime || 'Select Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter follow-up notes..."
                  placeholderTextColor="#9ca3af"
                  value={followUpNotes}
                  onChangeText={setFollowUpNotes}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowFollowUpModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveFollowUp}>
                <Text style={styles.saveButtonText}>Save Follow-up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Doctor Selection Modal for New Meeting */}
      <Modal visible={showDoctorSelectionModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Doctor</Text>
              <TouchableOpacity onPress={() => setShowDoctorSelectionModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {availableDoctors && availableDoctors.length > 0 ? (
                availableDoctors.map(doctor => (
                  <TouchableOpacity
                    key={doctor.doctor_id}
                    style={[
                      styles.doctorSelectionCard,
                      meetingForm.doctor_id === doctor.doctor_id && styles.doctorSelectionCardSelected
                    ]}
                    onPress={() => {
                      setMeetingForm({...meetingForm, doctor_id: doctor.doctor_id})
                      setShowDoctorSelectionModal(false)
                    }}
                  >
                    <View style={styles.doctorInfo}>
                      <View style={styles.doctorAvatar}>
                        {doctor.profile_image_url ? (
                          <Image source={{ uri: doctor.profile_image_url }} style={styles.doctorAvatarImage} />
                        ) : (
                          <Ionicons name="person" size={20} color="#8b5cf6" />
                        )}
                      </View>
                      <View style={styles.doctorDetails}>
                        <Text style={styles.doctorName}>{doctor.first_name} {doctor.last_name}</Text>
                        <Text style={styles.doctorSpecialty}>{doctor.specialty}</Text>
                        <Text style={styles.doctorHospital}>{doctor.hospital}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="person-outline" size={48} color="#9ca3af" />
                  <Text style={styles.emptyStateText}>No doctors available</Text>
                  <Text style={styles.emptyStateSubtext}>Add doctors first to create meetings</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.addNewButton}
                onPress={() => {
                  setShowDoctorSelectionModal(false)
                  setShowAddDoctorModal(true)
                }}
              >
                <Ionicons name="add" size={20} color="#8b5cf6" />
                <Text style={styles.addNewButtonText}>Add New Doctor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Doctor Modal */}
      <Modal visible={showAddDoctorModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.largeModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Doctor</Text>
              <TouchableOpacity onPress={() => {
                setShowAddDoctorModal(false)
                resetDoctorForm()
              }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>First Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter doctor's first name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.first_name}
                  onChangeText={(text) => setDoctorForm({...doctorForm, first_name: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last Name *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter doctor's last name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.last_name}
                  onChangeText={(text) => setDoctorForm({...doctorForm, last_name: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Specialty *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Cardiology, Neurology"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.specialty}
                  onChangeText={(text) => setDoctorForm({...doctorForm, specialty: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Hospital/Clinic *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter hospital or clinic name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.hospital}
                  onChangeText={(text) => setDoctorForm({...doctorForm, hospital: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="+1 (555) 123-4567"
                  keyboardType="phone-pad"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.phone}
                  onChangeText={(text) => setDoctorForm({...doctorForm, phone: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="doctor@hospital.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.email}
                  onChangeText={(text) => setDoctorForm({...doctorForm, email: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location</Text>
                <TextInput 
                  style={styles.textInput} 
                  placeholder="City, State" 
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.location}
                  onChangeText={(text) => setDoctorForm({...doctorForm, location: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Any additional notes about the doctor..."
                  multiline
                  numberOfLines={3}
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.notes}
                  onChangeText={(text) => setDoctorForm({...doctorForm, notes: text})}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => {
                setShowAddDoctorModal(false)
                resetDoctorForm()
              }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleAddDoctor}>
                <Text style={styles.saveButtonText}>Add Doctor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Meeting Details Modal */}
      <MeetingDetailsModal
        visible={showMeetingDetails}
        meetingId={selectedMeetingId}
        onClose={() => {
          setShowMeetingDetails(false)
          setSelectedMeetingId(null)
        }}
      />

      {/* Date/Time Pickers */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={selectedTime}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
        />
      )}
    </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  safeArea: {
    flex: 1,
  },
  staticHeader: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  addButton: {
    width: 36,
    height: 36,
    backgroundColor: "#8b5cf6",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButton: {
    padding: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#1f2937",
  },
  filterContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 8,
  },
  filterContentContainer: {
    paddingRight: 20, // Add padding to the right so last item isn't cut off
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  filterTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  meetingsList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  meetingCard: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  meetingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  doctorImageContainer: {
    marginRight: 12,
  },
  doctorImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f3f4f6',
  },
  defaultDoctorImage: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  meetingInfo: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 2,
  },
  doctorDetails: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  meetingDate: {
    fontSize: 12,
    color: "#9ca3af",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "500",
  },
  presentationInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  presentationTitle: {
    fontSize: 14,
    color: "#8b5cf6",
    fontWeight: "500",
  },
  followUpInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 6,
  },
  followUpText: {
    fontSize: 12,
    color: "#d97706",
    fontWeight: "500",
  },
  meetingActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#8b5cf6",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  detailsModal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "90%",
  },
  editModal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  detailsContent: {
    maxHeight: 500,
  },
  meetingOverview: {
    backgroundColor: "#f1f5f9",
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  detailsDoctorName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  detailsDoctorInfo: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  detailsDateTime: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 8,
  },
  detailsPresentation: {
    fontSize: 14,
    color: "#8b5cf6",
    fontWeight: "500",
  },
  slidesSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 12,
  },
  slideItem: {
    flexDirection: "row",
    marginBottom: 16,
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  slideThumbnail: {
    width: 60,
    height: 45,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
    marginRight: 12,
  },
  slideContent: {
    flex: 1,
  },
  slideTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  slideComments: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 16,
  },
  notesSection: {
    marginBottom: 20,
  },
  overallNotes: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  followUpSection: {
    marginBottom: 20,
  },
  followUpDetails: {
    fontSize: 14,
    color: "#d97706",
    fontWeight: "500",
  },
  editContent: {
    gap: 20,
  },
  editMeetingInfo: {
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 8,
  },
  editDoctorName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 2,
  },
  editMeetingDate: {
    fontSize: 12,
    color: "#6b7280",
  },
  followUpEditSection: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  followUpToggle: {
    flexDirection: "row",
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  toggleButtonActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  toggleButtonTextActive: {
    color: "#ffffff",
  },
  inputGroup: {
    gap: 8,
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    gap: 8,
  },
  dateInputText: {
    fontSize: 14,
    color: "#374151",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  // Modal styles (missing - causing invisible modal)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    margin: 20,
    maxWidth: 400,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  formContainer: {
    maxHeight: 400,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
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
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Doctor selection styles
  doctorSelection: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  doctorCard: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    borderRadius: 8,
    margin: 4,
  },
  doctorCardSelected: {
    backgroundColor: '#ede9fe',
    borderColor: '#8b5cf6',
    borderWidth: 1,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  doctorSpecialty: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 1,
  },
  doctorHospital: {
    fontSize: 12,
    color: '#6b7280',
  },
  noDoctorsText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  doctorSelectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  selectedDoctorInfo: {
    flex: 1,
  },
  selectedDoctorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  selectedDoctorDetails: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  placeholderText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  doctorSelectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  doctorSelectionCardSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f3f4f6',
  },
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  doctorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  doctorAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  addNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  addNewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
    marginLeft: 8,
  },
  largeModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    margin: 20,
    width: '95%',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  dateTimeButtonText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  readOnlyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  brochureInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  brochureTitle: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
  notesCount: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
})
