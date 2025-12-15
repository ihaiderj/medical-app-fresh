import { useState, useEffect } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { UnifiedDataService } from "../../services/UnifiedDataService"
import { useGlobalForms } from "../../context/GlobalFormContext"
import { safeString, safeToLowerCase, safeIncludes } from "../../utils/errorHandler"
import OfflineStatusBar from "../../components/OfflineStatusBar"
import SyncStatusIndicator from "../../components/SyncStatusIndicator"
import OfflineSessionWarning from "../../components/OfflineSessionWarning"
import { useAppData } from "../../context/AppDataContext"
import { SafeAreaView } from "react-native-safe-area-context"

interface DoctorsScreenProps {
  navigation: any
  route?: any
}

export default function DoctorsScreen({ navigation, route }: DoctorsScreenProps) {
  const { showDoctorForm } = useGlobalForms()
  const { user, onDoctorChange } = useAppData();
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSpecialty, setSelectedSpecialty] = useState("All")
  const [doctors, setDoctors] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [specialties, setSpecialties] = useState<string[]>(["All"])
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  // Subscribe to doctor changes from AppDataContext
  // This ensures the screen refreshes when doctors are created/updated from anywhere in the app
  useEffect(() => {
    console.log('🟢 DOCTOR_REFRESH: DoctorsScreen subscribing to doctor changes');
    const unsubscribe = onDoctorChange(() => {
      console.log('🟢 DOCTOR_REFRESH: Doctor change detected, refreshing DoctorsScreen');
      setRefreshTrigger(prev => prev + 1);
    });
    
    return () => {
      console.log('🟢 DOCTOR_REFRESH: DoctorsScreen unsubscribing from doctor changes');
      unsubscribe();
    };
  }, [onDoctorChange]);

  // Load doctors on component mount, when refresh is triggered, or when user becomes available
  useEffect(() => {
    if (user?.id) {
      loadDoctors()
    }
    
    // Check if we should open add modal (from group creation flow)
    // Using global forms now
    // if (route?.params?.openAddModal) {
    //   setShowAddModal(true)
    // }
  }, [refreshTrigger, user])

  // Handle successful doctor addition from group creation flow
  useEffect(() => {
    if (route?.params?.returnToGroup) {
      // Return to brochure viewer after doctor is added
      const { brochureId, brochureTitle } = route.params
      navigation.navigate('BrochureViewer', {
        brochureId,
        brochureTitle,
        newDoctorAdded: true
      })
    }
  }, [route?.params])

  const loadDoctors = async () => {
    if (hasLoadedOnce) {
    setIsLoading(true)
    }
    try {
      const userId = user?.id;
      const result = await UnifiedDataService.getDoctors(userId)

      if (!result.success || !result.data) {
        console.log('DoctorsScreen: getDoctors returned empty, using empty list')
        setDoctors([])
        setSpecialties(["All"])
      } else {
        const sanitizedDoctors = result.data.map(doctor => ({
            ...doctor,
            first_name: safeString(doctor.first_name),
            last_name: safeString(doctor.last_name),
            specialty: safeString(doctor.specialty),
            hospital: safeString(doctor.hospital),
            phone: safeString(doctor.phone),
            email: safeString(doctor.email),
            location: safeString(doctor.location),
          }))
          setDoctors(sanitizedDoctors)
        const uniqueSpecialties = [
          "All",
          ...new Set(
            sanitizedDoctors
              .map(d => safeString(d.specialty))
              .filter(specialty => specialty && specialty.trim())
          )
        ]
          setSpecialties(uniqueSpecialties)
      }
    } catch (error) {
      console.error('Error loading doctors:', error)
      Alert.alert("Error", "Failed to load doctors")
    } finally {
      setIsLoading(false)
      setHasLoadedOnce(true)
    }
  }

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

  const filteredDoctors = doctors.filter(doctor => {
    const matchesSearch =
      safeIncludes(safeToLowerCase(doctor.first_name), safeToLowerCase(searchQuery)) ||
      safeIncludes(safeToLowerCase(doctor.last_name), safeToLowerCase(searchQuery)) ||
      safeIncludes(safeToLowerCase(doctor.hospital), safeToLowerCase(searchQuery))
    const matchesSpecialty = selectedSpecialty === "All" || safeString(doctor.specialty) === selectedSpecialty
    return matchesSearch && matchesSpecialty
  })

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




  const handleCreateDoctor = () => {
    showDoctorForm(undefined, () => {
      setRefreshTrigger(prev => prev + 1)
    })
  }

  const handleEditDoctor = (doctor: any) => {
    showDoctorForm(doctor, () => {
      setRefreshTrigger(prev => prev + 1)
    })
  }

  const handleDeleteDoctor = async (doctor: any) => {
    try {
      // First check if doctor has meetings
      const checkResult = await UnifiedDataService.deleteDoctor(doctor.id, false);
      
      if (!checkResult.success && checkResult.hasMeetings && checkResult.meetingCount) {
        // Doctor has meetings - show warning with options
        Alert.alert(
          "Cannot Delete Doctor",
          `Dr. ${safeString(doctor.first_name)} ${safeString(doctor.last_name)} has ${checkResult.meetingCount} meeting(s) associated.\n\nWhat would you like to do?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: `Delete Doctor & ${checkResult.meetingCount} Meeting(s)`,
              style: "destructive",
              onPress: async () => {
                try {
                  const deleteResult = await UnifiedDataService.deleteDoctor(doctor.id, true);
                  if (deleteResult.success) {
                    Alert.alert(
                      "Success", 
                      `Doctor and ${checkResult.meetingCount} meeting(s) deleted successfully!`
                    );
                    loadDoctors();
                  } else {
                    Alert.alert("Error", deleteResult.error || "Failed to delete doctor and meetings");
                  }
                } catch (error) {
                  console.error('Error deleting doctor with meetings:', error);
                  Alert.alert("Error", "Failed to delete doctor and meetings");
                }
              }
            }
          ]
        );
      } else {
        // No meetings - proceed with normal deletion
    Alert.alert(
      "Delete Doctor",
      `Are you sure you want to delete Dr. ${safeString(doctor.first_name)} ${safeString(doctor.last_name)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
                  const result = await UnifiedDataService.deleteDoctor(doctor.id, false);
                if (result.success) {
                    Alert.alert("Success", "Doctor deleted successfully!");
                    loadDoctors();
                } else {
                    Alert.alert("Error", result.error || "Failed to delete doctor");
              }
            } catch (error) {
                  console.error('Error deleting doctor:', error);
                  Alert.alert("Error", "Failed to delete doctor");
            }
          }
        }
      ]
        );
      }
    } catch (error) {
      console.error('Error checking doctor meetings:', error);
      Alert.alert("Error", "Failed to check doctor information");
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      
      {/* Offline Status Bar */}
      <OfflineStatusBar />
      
      {/* Offline Session Warning */}
      <OfflineSessionWarning />
      
      {/* Static Header Section */}
      <View style={styles.staticHeader}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Doctors</Text>
          <TouchableOpacity style={styles.addButton} onPress={handleCreateDoctor}>
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
                  onPress={handleCreateDoctor}
                >
                  <Text style={styles.emptyActionText}>Add Your First Doctor</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredDoctors.map((doctor) => (
          <View key={doctor.id || doctor.doctor_id} style={styles.doctorCard}>
            <View style={styles.doctorHeader}>
              <View style={styles.doctorAvatar}>
                {(doctor as any).profile_image_url ? (
                  <Image 
                    source={{ uri: (doctor as any).profile_image_url }} 
                    style={styles.doctorAvatarImage}
                  />
                ) : (
                <Ionicons name="person" size={24} color="#8b5cf6" />
                )}
              </View>
              <View style={styles.doctorInfo}>
                <Text style={styles.doctorName}>
                  {safeString(doctor.first_name)} {safeString(doctor.last_name)}
                </Text>
                <Text style={styles.doctorSpecialty}>{safeString(doctor.specialty)}</Text>
                <Text style={styles.doctorHospital}>{safeString(doctor.hospital)}</Text>
              </View>
              <View style={styles.cardHeaderRight}>
                {/* Only show sync icon if doctor has pending changes (not for server-synced doctors) */}
                {doctor.sync_status === 'pending' && !doctor.server_id && (
                  <SyncStatusIndicator 
                    status={doctor.sync_status} 
                    size={14}
                  />
                )}
                <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(safeString(doctor.relationship_status || 'active'))}20` }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(safeString(doctor.relationship_status || 'active')) }]}>
                    {safeString(doctor.relationship_status || 'active').charAt(0).toUpperCase() + safeString(doctor.relationship_status || 'active').slice(1)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.doctorDetails}>
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={16} color="#6b7280" />
                <Text style={styles.detailText}>{safeString(doctor.location) || 'No location specified'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={16} color="#6b7280" />
                <Text style={styles.detailText}>
                  Last meeting: {doctor.last_meeting_date ? new Date(doctor.last_meeting_date).toLocaleDateString() : 'Never'}
                </Text>
              </View>
            </View>

            <View style={styles.doctorActions}>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => {
                  navigation.navigate('DoctorBrochures', {
                    doctorId: doctor.id,
                    doctorName: `${doctor.first_name} ${doctor.last_name}`
                  })
                }}
              >
                <Ionicons name="albums-outline" size={16} color="#8b5cf6" />
                <Text style={styles.actionButtonText}>View Slides</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleEditDoctor(doctor)}
              >
                <Ionicons name="create-outline" size={16} color="#8b5cf6" />
                <Text style={styles.actionButtonText}>Edit</Text>
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

      {/* Add Doctor Modal - Now using global forms */}

      {/* Edit Doctor Modal */}
      {/* This modal is no longer needed as editing is handled by showDoctorForm */}
      </SafeAreaView>
    </View>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
  },
  addButton: {
    backgroundColor: "#8b5cf6",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#1f2937",
  },
  specialtyContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  specialtyChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginRight: 8,
  },
  specialtyChipActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  specialtyText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  specialtyTextActive: {
    color: "#ffffff",
  },
  staticHeader: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  scrollView: {
    flexGrow: 1,
  },
  contentContainer: {
    paddingVertical: 12,
  },
  doctorsList: {
    paddingVertical: 8,
  },
  doctorCard: {
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  doctorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  doctorAvatar: {
    width: 48,
    height: 48,
    backgroundColor: "#f3f4f6",
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  doctorAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  doctorSpecialty: {
    fontSize: 14,
    color: "#8b5cf6",
    fontWeight: "500",
    marginBottom: 2,
  },
  doctorHospital: {
    fontSize: 13,
    color: "#6b7280",
  },
  doctorDetail: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 2,
  },
  cardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  doctorDetails: {
    marginBottom: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: "#6b7280",
  },
  doctorActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#8b5cf6",
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    width: "90%",
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  formContainer: {
    padding: 20,
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
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1f2937",
    backgroundColor: "#ffffff",
  },
  textInputError: {
    borderColor: "#ef4444",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 4,
  },
  photoContainer: {
    alignItems: "center",
    marginBottom: 16,
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
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
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
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
