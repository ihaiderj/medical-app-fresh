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
  Alert,
  Image,
  ActivityIndicator,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { AuthService } from "../../services/AuthService"
import { MRService, MRAssignedDoctor } from "../../services/MRService"

interface DoctorsScreenProps {
  navigation: any
}

export default function DoctorsScreen({ navigation }: DoctorsScreenProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSpecialty, setSelectedSpecialty] = useState("All")
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null)
  const [doctorPhoto, setDoctorPhoto] = useState<string | null>(null)
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
  const [doctors, setDoctors] = useState<MRAssignedDoctor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [specialties, setSpecialties] = useState<string[]>(["All"])

  // Load doctors on component mount
  useEffect(() => {
    loadDoctors()
  }, [])

  const loadDoctors = async () => {
    setIsLoading(true)
    try {
      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        // Get assigned doctors for this MR
        const doctorsResult = await MRService.getAssignedDoctors(userResult.user.id)
        if (doctorsResult.success && doctorsResult.data) {
          setDoctors(doctorsResult.data)
          
          // Extract unique specialties
          const uniqueSpecialties = ["All", ...new Set(doctorsResult.data.map(d => d.specialty).filter(Boolean))]
          setSpecialties(uniqueSpecialties)
        }
      }
    } catch (error) {
      console.error('Error loading doctors:', error)
      Alert.alert("Error", "Failed to load doctors")
    } finally {
      setIsLoading(false)
    }
  }

  // Helper function to format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never'
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours} hours ago`
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays} days ago`
    return date.toLocaleDateString()
  }

  const filteredDoctors = doctors?.filter((doctor) => {
    const matchesSearch = `${doctor.first_name} ${doctor.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doctor.hospital.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSpecialty = selectedSpecialty === "All" || doctor.specialty === selectedSpecialty
    return matchesSearch && matchesSpecialty
  }) || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "#10b981"
      case "pending":
        return "#d97706"
      case "inactive":
        return "#6b7280"
      default:
        return "#6b7280"
    }
  }

  const handleScheduleMeeting = (doctor: any) => {
    setSelectedDoctor(doctor)
    setShowScheduleModal(true)
  }

  const handleCall = (phone: string) => {
    Alert.alert("Call Doctor", `Would you like to call ${phone}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Call", onPress: () => console.log("Calling:", phone) },
    ])
  }

  const handlePhotoSelection = () => {
    Alert.alert(
      "Select Photo",
      "Choose how you want to add a photo",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Camera", onPress: () => console.log("Open camera") },
        { text: "Gallery", onPress: () => console.log("Open gallery") },
      ]
    )
  }

  const handleRemovePhoto = () => {
    setDoctorPhoto(null)
  }

  const handleAddDoctor = async () => {
    try {
      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        // Create doctor assignment
        const result = await MRService.createDoctorAssignment(
          userResult.user.id,
          doctorForm.first_name,
          doctorForm.last_name,
          doctorForm.specialty,
          doctorForm.hospital,
          doctorForm.phone,
          doctorForm.email,
          doctorForm.location,
          doctorForm.notes
        )
        
        if (result.success) {
          Alert.alert("Success", "Doctor added successfully!")
          setShowAddModal(false)
          resetForm()
          loadDoctors()
        } else {
          Alert.alert("Error", result.error || "Failed to add doctor")
        }
      }
    } catch (error) {
      console.error('Error adding doctor:', error)
      Alert.alert("Error", "Failed to add doctor")
    }
  }

  const handleEditDoctor = (doctor: MRAssignedDoctor) => {
    setSelectedDoctor(doctor)
    setDoctorForm({
      first_name: doctor.first_name,
      last_name: doctor.last_name,
      specialty: doctor.specialty,
      hospital: doctor.hospital,
      phone: doctor.phone || '',
      email: doctor.email || '',
      location: doctor.location || '',
      notes: doctor.notes || '',
    })
    setShowEditModal(true)
  }

  const handleUpdateDoctor = async () => {
    if (!selectedDoctor) return
    
    try {
      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        // Update doctor assignment
        const result = await MRService.updateDoctorAssignment(
          selectedDoctor.id,
          doctorForm.first_name,
          doctorForm.last_name,
          doctorForm.specialty,
          doctorForm.hospital,
          doctorForm.phone,
          doctorForm.email,
          doctorForm.location,
          doctorForm.notes
        )
        
        if (result.success) {
          Alert.alert("Success", "Doctor updated successfully!")
          setShowEditModal(false)
          resetForm()
          loadDoctors()
        } else {
          Alert.alert("Error", result.error || "Failed to update doctor")
        }
      }
    } catch (error) {
      console.error('Error updating doctor:', error)
      Alert.alert("Error", "Failed to update doctor")
    }
  }

  const handleDeleteDoctor = (doctor: MRAssignedDoctor) => {
    Alert.alert(
      "Delete Doctor",
      `Are you sure you want to delete ${doctor.first_name} ${doctor.last_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Get current user
              const userResult = await AuthService.getCurrentUser()
              if (userResult.success) {
                // Delete doctor assignment
                const result = await MRService.deleteDoctorAssignment(doctor.id)
                
                if (result.success) {
                  Alert.alert("Success", "Doctor deleted successfully!")
                  loadDoctors()
                } else {
                  Alert.alert("Error", result.error || "Failed to delete doctor")
                }
              }
            } catch (error) {
              console.error('Error deleting doctor:', error)
              Alert.alert("Error", "Failed to delete doctor")
            }
          }
        }
      ]
    )
  }

  const resetForm = () => {
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
    setDoctorPhoto(null)
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      
      {/* Static Header Section */}
      <View style={styles.staticHeader}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Doctors</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <Ionicons name="add" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6b7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search doctors or hospitals..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Specialty Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.specialtyContainer}>
          {specialties.map((specialty) => (
            <TouchableOpacity
              key={specialty}
              style={[styles.specialtyChip, selectedSpecialty === specialty && styles.specialtyChipActive]}
              onPress={() => setSelectedSpecialty(specialty)}
            >
              <Text style={[styles.specialtyText, selectedSpecialty === specialty && styles.specialtyTextActive]}>
                {specialty}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.doctorsList}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Loading doctors...</Text>
            </View>
          ) : filteredDoctors.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="person-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No Doctors Found</Text>
              <Text style={styles.emptyMessage}>
                {searchQuery || selectedSpecialty !== "All" 
                  ? "No doctors match your current filters" 
                  : "You haven't added any doctors yet"}
              </Text>
              {!searchQuery && selectedSpecialty === "All" && (
                <TouchableOpacity 
                  style={styles.emptyActionButton} 
                  onPress={() => setShowAddModal(true)}
                >
                  <Text style={styles.emptyActionText}>Add Your First Doctor</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredDoctors.map((doctor) => (
          <View key={doctor.id} style={styles.doctorCard}>
            <View style={styles.doctorHeader}>
              <View style={styles.doctorAvatar}>
                <Ionicons name="person" size={24} color="#8b5cf6" />
              </View>
              <View style={styles.doctorInfo}>
                <Text style={styles.doctorName}>{doctor.name}</Text>
                <Text style={styles.doctorSpecialty}>{doctor.specialty}</Text>
                <Text style={styles.doctorHospital}>{doctor.hospital}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(doctor.relationshipStatus)}20` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(doctor.relationshipStatus) }]}>
                  {doctor.relationshipStatus.charAt(0).toUpperCase() + doctor.relationshipStatus.slice(1)}
                </Text>
              </View>
            </View>

            <View style={styles.doctorDetails}>
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={16} color="#6b7280" />
                <Text style={styles.detailText}>{doctor.location}</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="calendar-outline" size={16} color="#6b7280" />
                <Text style={styles.detailText}>
                  {doctor.nextAppointment ? `Next: ${doctor.nextAppointment}` : "No upcoming appointments"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={16} color="#6b7280" />
                <Text style={styles.detailText}>Last meeting: {doctor.lastMeeting}</Text>
              </View>
            </View>

            <View style={styles.doctorActions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleCall(doctor.phone)}>
                <Ionicons name="call" size={16} color="#10b981" />
                <Text style={[styles.actionButtonText, { color: "#10b981" }]}>Call</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton} onPress={() => handleScheduleMeeting(doctor)}>
                <Ionicons name="calendar" size={16} color="#8b5cf6" />
                <Text style={styles.actionButtonText}>Schedule</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("Meetings", { doctorId: doctor.id })}
              >
                <Ionicons name="document-text" size={16} color="#d97706" />
                <Text style={[styles.actionButtonText, { color: "#d97706" }]}>History</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleEditDoctor(doctor)}
              >
                <Ionicons name="create-outline" size={16} color="#6b7280" />
                <Text style={[styles.actionButtonText, { color: "#6b7280" }]}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleDeleteDoctor(doctor)}
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

      {/* Add Doctor Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Doctor</Text>
              <TouchableOpacity onPress={() => {
                setShowAddModal(false)
                setDoctorPhoto(null)
              }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              {/* Photo Section */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Doctor Photo</Text>
                <View style={styles.photoContainer}>
                  {doctorPhoto ? (
                    <View style={styles.photoPreview}>
                      <Image source={{ uri: doctorPhoto }} style={styles.photoImage} />
                      <TouchableOpacity style={styles.removePhotoButton} onPress={handleRemovePhoto}>
                        <Ionicons name="close-circle" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addPhotoButton} onPress={handlePhotoSelection}>
                      <Ionicons name="camera" size={24} color="#8b5cf6" />
                      <Text style={styles.addPhotoText}>Add Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>First Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter doctor's first name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.first_name}
                  onChangeText={(text) => setDoctorForm({...doctorForm, first_name: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter doctor's last name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.last_name}
                  onChangeText={(text) => setDoctorForm({...doctorForm, last_name: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Specialty</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Cardiology, Neurology"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.specialty}
                  onChangeText={(text) => setDoctorForm({...doctorForm, specialty: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Hospital/Clinic</Text>
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
                setShowAddModal(false)
                resetForm()
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

      {/* Edit Doctor Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Doctor</Text>
              <TouchableOpacity onPress={() => {
                setShowEditModal(false)
                resetForm()
              }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>First Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter doctor's first name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.first_name}
                  onChangeText={(text) => setDoctorForm({...doctorForm, first_name: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter doctor's last name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.last_name}
                  onChangeText={(text) => setDoctorForm({...doctorForm, last_name: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Specialty</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Cardiology, Neurology"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.specialty}
                  onChangeText={(text) => setDoctorForm({...doctorForm, specialty: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Hospital/Clinic</Text>
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
                setShowEditModal(false)
                resetForm()
              }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleUpdateDoctor}>
                <Text style={styles.saveButtonText}>Update Doctor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Schedule Meeting Modal */}
      <Modal visible={showScheduleModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Meeting</Text>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {selectedDoctor && (
              <View style={styles.doctorSummary}>
                <Text style={styles.doctorSummaryName}>{selectedDoctor.name}</Text>
                <Text style={styles.doctorSummaryInfo}>
                  {selectedDoctor.specialty} • {selectedDoctor.hospital}
                </Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Meeting Date</Text>
              <TouchableOpacity style={styles.dateInput}>
                <Ionicons name="calendar-outline" size={20} color="#6b7280" />
                <Text style={styles.dateInputText}>Select date</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Meeting Time</Text>
              <TouchableOpacity style={styles.dateInput}>
                <Ionicons name="time-outline" size={20} color="#6b7280" />
                <Text style={styles.dateInputText}>Select time</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Meeting Purpose</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Product presentation, Follow-up discussion"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowScheduleModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => setShowScheduleModal(false)}>
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
  addButton: {
    width: 36,
    height: 36,
    backgroundColor: "#8b5cf6",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
  specialtyContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 8,
  },
  specialtyChip: {
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
  specialtyChipActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  specialtyText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  specialtyTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  doctorsList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  doctorCard: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  doctorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  doctorAvatar: {
    width: 48,
    height: 48,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 2,
  },
  doctorSpecialty: {
    fontSize: 14,
    color: "#8b5cf6",
    fontWeight: "500",
    marginBottom: 2,
  },
  doctorHospital: {
    fontSize: 12,
    color: "#6b7280",
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
  doctorDetails: {
    marginBottom: 16,
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 12,
    color: "#6b7280",
  },
  doctorActions: {
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
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "90%",
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
  formContainer: {
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1f2937",
    backgroundColor: "#ffffff",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  photoContainer: {
    alignItems: "center",
    marginBottom: 8,
  },
  addPhotoButton: {
    width: 120,
    height: 120,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 8,
  },
  addPhotoText: {
    fontSize: 14,
    color: "#8b5cf6",
    fontWeight: "500",
    marginTop: 8,
  },
  photoPreview: {
    position: "relative",
    marginVertical: 8,
  },
  photoImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  removePhotoButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 2,
  },
  doctorSummary: {
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  doctorSummaryName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 2,
  },
  doctorSummaryInfo: {
    fontSize: 12,
    color: "#6b7280",
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
    color: "#9ca3af",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
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
  emptyActionButton: {
    marginTop: 20,
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyActionText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
})
