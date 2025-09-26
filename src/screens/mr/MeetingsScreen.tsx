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
import { AuthService } from "../../services/AuthService"
import { MRService, MRMeeting } from "../../services/MRService"

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
  const [followUpRequired, setFollowUpRequired] = useState(false)
  const [followUpDate, setFollowUpDate] = useState("")
  const [meetingForm, setMeetingForm] = useState({
    doctor_id: '',
    scheduled_date: '',
    duration_minutes: 30,
    purpose: '',
    notes: '',
  })
  const [meetings, setMeetings] = useState<MRMeeting[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const filters = ["All", "This Week", "This Month", "Follow-up Required", "Completed"]

  // Load meetings on component mount
  useEffect(() => {
    loadMeetings()
  }, [])

  const loadMeetings = async () => {
    setIsLoading(true)
    try {
      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        // Get meetings for this MR
        const meetingsResult = await MRService.getMeetings(userResult.user.id, selectedFilter)
        if (meetingsResult.success && meetingsResult.data) {
          setMeetings(meetingsResult.data)
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

  const filteredMeetings = meetings?.filter((meeting) => {
    const matchesSearch = `${meeting.doctor_first_name} ${meeting.doctor_last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         meeting.hospital?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         meeting.purpose?.toLowerCase().includes(searchQuery.toLowerCase())
    
    let matchesFilter = true
    if (selectedFilter === "This Week") {
      const meetingDate = new Date(meeting.meeting_date)
      const now = new Date()
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      matchesFilter = meetingDate >= now && meetingDate <= weekFromNow
    } else if (selectedFilter === "This Month") {
      const meetingDate = new Date(meeting.meeting_date)
      const now = new Date()
      const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      matchesFilter = meetingDate >= now && meetingDate <= monthFromNow
    } else if (selectedFilter === "Follow-up Required") {
      matchesFilter = meeting.follow_up_required || false
    } else if (selectedFilter === "Completed") {
      matchesFilter = meeting.status === "completed"
    }
    
    return matchesSearch && matchesFilter
  }) || []

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
    setSelectedMeeting(meeting)
    setFollowUpRequired(meeting.followUpRequired)
    setFollowUpDate(meeting.followUpDate || "")
    setShowEditModal(true)
  }

  const handleSaveEdit = () => {
    // Save edit logic here
    Alert.alert("Success", "Meeting updated successfully!")
    setShowEditModal(false)
  }

  const handleViewSlideFullScreen = (slide: any) => {
    Alert.alert("View Slide", `Viewing: ${slide.title}`)
    // Implement full-screen slide view
  }

  const handleAddMeeting = async () => {
    try {
      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        // Create meeting
        const result = await MRService.createMeeting(
          userResult.user.id,
          meetingForm.doctor_id,
          meetingForm.scheduled_date,
          meetingForm.duration_minutes,
          undefined, // presentation_id
          meetingForm.notes
        )
        
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

  const handleDeleteMeeting = (meeting: MRMeeting) => {
    Alert.alert(
      "Delete Meeting",
      `Are you sure you want to delete this meeting?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await MRService.deleteMeeting(meeting.id)
              
              if (result.success) {
                Alert.alert("Success", "Meeting deleted successfully!")
                loadMeetings()
              } else {
                Alert.alert("Error", result.error || "Failed to delete meeting")
              }
            } catch (error) {
              console.error('Error deleting meeting:', error)
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
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
            filteredMeetings.map((meeting) => (
            <View key={meeting.id} style={styles.meetingCard}>
              <View style={styles.meetingHeader}>
                <View style={styles.meetingInfo}>
                  <Text style={styles.doctorName}>{meeting.doctor_first_name} {meeting.doctor_last_name}</Text>
                  <Text style={styles.doctorDetails}>
                    {meeting.doctor_specialty} • {meeting.hospital}
                  </Text>
                  <Text style={styles.meetingDate}>
                    {formatDate(meeting.meeting_date)} • {meeting.duration || 'No duration'}
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

              {meeting.follow_up_required && (
                <View style={styles.followUpInfo}>
                  <Ionicons name="calendar" size={14} color="#d97706" />
                  <Text style={styles.followUpText}>Follow-up: {formatDate(meeting.follow_up_date)}</Text>
                </View>
              )}

              <View style={styles.meetingActions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => handleViewMeeting(meeting)}>
                  <Ionicons name="eye" size={16} color="#8b5cf6" />
                  <Text style={styles.actionButtonText}>View</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton} onPress={() => handleEditMeeting(meeting)}>
                  <Ionicons name="create" size={16} color="#6b7280" />
                  <Text style={[styles.actionButtonText, { color: "#6b7280" }]}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => handleDeleteMeeting(meeting)}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={[styles.actionButtonText, { color: "#ef4444" }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
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
                  <Text style={styles.sectionTitle}>Slides Discussed</Text>
                  {selectedMeeting.slidesDiscussed.map((slide: any) => (
                    <View key={slide.id} style={styles.slideItem}>
                      <TouchableOpacity onPress={() => handleViewSlideFullScreen(slide)}>
                        <Image source={{ uri: slide.thumbnail }} style={styles.slideThumbnail} />
                      </TouchableOpacity>
                      <View style={styles.slideContent}>
                        <Text style={styles.slideTitle}>{slide.title}</Text>
                        <Text style={styles.slideComments}>{slide.comments}</Text>
                      </View>
                    </View>
                  ))}
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
          <View style={styles.editModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Meeting</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {selectedMeeting && (
              <View style={styles.editContent}>
                <View style={styles.editMeetingInfo}>
                  <Text style={styles.editDoctorName}>{selectedMeeting.doctorName}</Text>
                  <Text style={styles.editMeetingDate}>
                    {selectedMeeting.date} at {selectedMeeting.time}
                  </Text>
                </View>

                <View style={styles.followUpEditSection}>
                  <Text style={styles.inputLabel}>Follow-up Required?</Text>
                  <View style={styles.followUpToggle}>
                    <TouchableOpacity
                      style={[styles.toggleButton, !followUpRequired && styles.toggleButtonActive]}
                      onPress={() => setFollowUpRequired(false)}
                    >
                      <Text style={[styles.toggleButtonText, !followUpRequired && styles.toggleButtonTextActive]}>
                        No
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleButton, followUpRequired && styles.toggleButtonActive]}
                      onPress={() => setFollowUpRequired(true)}
                    >
                      <Text style={[styles.toggleButtonText, followUpRequired && styles.toggleButtonTextActive]}>
                        Yes
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {followUpRequired && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Follow-up Date</Text>
                    <TouchableOpacity style={styles.dateInput}>
                      <Ionicons name="calendar-outline" size={20} color="#6b7280" />
                      <Text style={styles.dateInputText}>{followUpDate || "Select date"}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setShowEditModal(false)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit}>
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
                <TextInput
                  style={styles.textInput}
                  placeholder="Select doctor"
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.doctor_id}
                  onChangeText={(text) => setMeetingForm({...meetingForm, doctor_id: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Date & Time</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="YYYY-MM-DD HH:MM"
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.scheduled_date}
                  onChangeText={(text) => setMeetingForm({...meetingForm, scheduled_date: text})}
                />
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
  meetingInfo: {
    flex: 1,
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
})
