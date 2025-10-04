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
import * as ImagePicker from 'expo-image-picker'
import { AuthService } from "../../services/AuthService"
import { MRService, MRAssignedDoctor } from "../../services/MRService"
import { DoctorPhotoServiceV2 } from "../../services/doctorPhotoServiceV2"
import { safeString, safeToLowerCase, safeIncludes } from "../../utils/errorHandler"
import { DoctorValidation, DoctorFormData } from "../../utils/doctorValidation"

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
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({})
  const [isValidating, setIsValidating] = useState(false)
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
      if (userResult.success && userResult.user) {
        // Get assigned doctors for this MR
        console.log('Loading doctors for MR:', userResult.user.id)
        const doctorsResult = await MRService.getAssignedDoctors(userResult.user.id)
        console.log('Doctors result:', doctorsResult)
        
        if (doctorsResult.success && doctorsResult.data) {
          console.log('Doctors data:', doctorsResult.data)
          // Ensure all doctor data has proper defaults to prevent charAt errors
          const sanitizedDoctors = doctorsResult.data.map(doctor => ({
            ...doctor,
            first_name: safeString(doctor.first_name),
            last_name: safeString(doctor.last_name),
            specialty: safeString(doctor.specialty),
            hospital: safeString(doctor.hospital),
            phone: safeString(doctor.phone),
            email: safeString(doctor.email),
            location: safeString(doctor.location),
            notes: safeString(doctor.notes),
            relationship_status: safeString(doctor.relationship_status) || 'active'
          }))
          setDoctors(sanitizedDoctors)
          
          // Extract unique specialties with safe operations
          const uniqueSpecialties = ["All", ...new Set(
            sanitizedDoctors
              .map(d => safeString(d.specialty))
              .filter(specialty => specialty && specialty.trim())
          )]
          setSpecialties(uniqueSpecialties)
        } else {
          console.log('Failed to load doctors:', doctorsResult.error)
        }
      } else {
        console.log('Failed to get current user:', userResult.error)
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

  // Photo selection handler
  const handlePhotoSelection = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to add doctor photos.')
        return
      }

      // Show action sheet to choose camera or gallery
      Alert.alert(
        'Select Photo',
        'Choose how you want to add a photo',
        [
          {
            text: 'Camera',
            onPress: openCamera,
          },
          {
            text: 'Photo Library',
            onPress: openImagePicker,
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      )
    } catch (error) {
      console.error('Error requesting permissions:', error)
      Alert.alert('Error', 'Failed to request permissions')
    }
  }

  // Open camera
  const openCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow camera access to take photos.')
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        setDoctorPhoto(result.assets[0].uri)
      }
    } catch (error) {
      console.error('Error opening camera:', error)
      Alert.alert('Error', 'Failed to open camera')
    }
  }

  // Open image picker
  const openImagePicker = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        setDoctorPhoto(result.assets[0].uri)
      }
    } catch (error) {
      console.error('Error opening image picker:', error)
      Alert.alert('Error', 'Failed to open photo library')
    }
  }

  // Remove photo handler
  const handleRemovePhoto = () => {
    setDoctorPhoto(null)
  }

  // Reset form handler
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
    setFormErrors({})
    setIsValidating(false)
  }

  // Real-time field validation
  const validateField = (fieldName: string, value: string) => {
    const newErrors = { ...formErrors }

    switch (fieldName) {
      case 'email':
        if (value.trim()) {
          const emailValidation = DoctorValidation.validateEmail(value)
          if (!emailValidation.isValid && emailValidation.error) {
            newErrors.email = emailValidation.error
          } else {
            delete newErrors.email
          }
        } else {
          delete newErrors.email
        }
        break

      case 'phone':
        if (value.trim()) {
          const phoneValidation = DoctorValidation.validatePhone(value)
          if (!phoneValidation.isValid && phoneValidation.error) {
            newErrors.phone = phoneValidation.error
          } else {
            delete newErrors.phone
          }
        } else {
          delete newErrors.phone
        }
        break

      case 'first_name':
        if (!value.trim()) {
          newErrors.first_name = 'First name is required'
        } else if (value.trim().length > 50) {
          newErrors.first_name = 'First name must be less than 50 characters'
        } else {
          delete newErrors.first_name
        }
        break

      case 'last_name':
        if (!value.trim()) {
          newErrors.last_name = 'Last name is required'
        } else if (value.trim().length > 50) {
          newErrors.last_name = 'Last name must be less than 50 characters'
        } else {
          delete newErrors.last_name
        }
        break

      case 'specialty':
        if (!value.trim()) {
          newErrors.specialty = 'Specialty is required'
        } else if (value.trim().length > 100) {
          newErrors.specialty = 'Specialty must be less than 100 characters'
        } else {
          delete newErrors.specialty
        }
        break

      case 'hospital':
        if (!value.trim()) {
          newErrors.hospital = 'Hospital/Clinic is required'
        } else if (value.trim().length > 200) {
          newErrors.hospital = 'Hospital name must be less than 200 characters'
        } else {
          delete newErrors.hospital
        }
        break
    }

    setFormErrors(newErrors)
  }

  // Enhanced form update handler
  const updateFormField = (fieldName: string, value: string) => {
    // Format phone number as user types
    if (fieldName === 'phone') {
      value = DoctorValidation.formatPhone(value)
    }

    setDoctorForm({ ...doctorForm, [fieldName]: value })
    validateField(fieldName, value)
  }

  // Add doctor handler
  const handleAddDoctor = async () => {
    try {
      // Comprehensive validation
      const validation = DoctorValidation.validateAll(doctorForm as DoctorFormData)
      if (!validation.isValid) {
        Alert.alert('Validation Error', validation.errors.join('\n'))
        return
      }

      // Check for duplicates
      const duplicateCheck = DoctorValidation.checkForDuplicates(
        doctorForm as DoctorFormData, 
        doctors
      )
      
      if (duplicateCheck.isDuplicate) {
        Alert.alert(
          'Duplicate Doctor Found', 
          duplicateCheck.warnings.join('\n') + '\n\nDo you want to add anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Anyway', onPress: () => proceedWithAddDoctor() }
          ]
        )
        return
      }

      // If warnings but not duplicates, show warnings and proceed
      if (duplicateCheck.warnings.length > 0) {
        Alert.alert(
          'Similar Doctor Found',
          duplicateCheck.warnings.join('\n') + '\n\nDo you want to continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => proceedWithAddDoctor() }
          ]
        )
        return
      }

      // No issues, proceed directly
      await proceedWithAddDoctor()

    } catch (error) {
      console.error('Error in handleAddDoctor:', error)
      Alert.alert('Error', 'Failed to add doctor')
    }
  }

  // Separate function for actual doctor addition
  const proceedWithAddDoctor = async () => {
    try {

      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        Alert.alert('Error', 'Please log in again')
        return
      }

      // Upload photo using server-side approach
      let photoUrl = null
      if (doctorPhoto) {
        try {
          console.log('Uploading doctor photo via server function...')
          const timestamp = Date.now()
          const fileName = `doctor_${userResult.user.id}_${timestamp}.jpg`
          
          const uploadResult = await DoctorPhotoServiceV2.uploadDoctorPhoto(
            doctorPhoto,
            fileName,
            userResult.user.id,
            (progress) => {
              console.log('Photo upload progress:', progress.percentage + '%')
            }
          )
          
          if (uploadResult.success && uploadResult.photoUrl) {
            photoUrl = uploadResult.photoUrl
            console.log('Photo uploaded successfully via server function:', photoUrl)
          } else {
            console.error('Photo upload failed:', uploadResult.error)
            Alert.alert('Warning', 'Failed to upload photo, but doctor will be saved without photo')
          }
        } catch (error) {
          console.error('Photo upload error:', error)
          Alert.alert('Warning', 'Failed to upload photo, but doctor will be saved without photo')
        }
      }

      // Prepare doctor data
      const doctorData = {
        first_name: doctorForm.first_name.trim(),
        last_name: doctorForm.last_name.trim(),
        specialty: doctorForm.specialty.trim(),
        hospital: doctorForm.hospital.trim(),
        phone: doctorForm.phone.trim(),
        email: doctorForm.email.trim(),
        location: doctorForm.location.trim(),
        notes: doctorForm.notes.trim(),
        profile_image_url: photoUrl, // Server photo URL
      }

      // Add doctor to server
      const result = await MRService.addDoctor(userResult.user.id, doctorData)
      
      if (result.success) {
        Alert.alert('Success', 'Doctor added successfully')
        
        // Log activity
        await MRService.logActivity(userResult.user.id, 'doctor_added', `Added Dr. ${doctorForm.first_name} ${doctorForm.last_name}`)
        
        // Close modal and reset form
        setShowAddModal(false)
        resetForm()
        
        // Reload doctors list
        await loadDoctors()
      } else {
        Alert.alert('Error', result.error || 'Failed to add doctor')
      }
    } catch (error) {
      console.error('Error adding doctor:', error)
      Alert.alert('Error', 'Failed to add doctor')
    }
  }

  // Update doctor handler
  const handleUpdateDoctor = async () => {
    try {
      if (!selectedDoctor) return

      // Comprehensive validation
      const validation = DoctorValidation.validateAll(doctorForm as DoctorFormData)
      if (!validation.isValid) {
        Alert.alert('Validation Error', validation.errors.join('\n'))
        return
      }

      // Check for duplicates (excluding current doctor)
      const duplicateCheck = DoctorValidation.checkForDuplicates(
        doctorForm as DoctorFormData, 
        doctors,
        selectedDoctor.doctor_id
      )
      
      if (duplicateCheck.isDuplicate) {
        Alert.alert(
          'Duplicate Doctor Found', 
          duplicateCheck.warnings.join('\n') + '\n\nDo you want to update anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Update Anyway', onPress: () => proceedWithUpdateDoctor() }
          ]
        )
        return
      }

      // If warnings but not duplicates, show warnings and proceed
      if (duplicateCheck.warnings.length > 0) {
        Alert.alert(
          'Similar Doctor Found',
          duplicateCheck.warnings.join('\n') + '\n\nDo you want to continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue', onPress: () => proceedWithUpdateDoctor() }
          ]
        )
        return
      }

      // No issues, proceed directly
      await proceedWithUpdateDoctor()

    } catch (error) {
      console.error('Error in handleUpdateDoctor:', error)
      Alert.alert('Error', 'Failed to update doctor')
    }
  }

  // Separate function for actual doctor update
  const proceedWithUpdateDoctor = async () => {
    try {

      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        Alert.alert('Error', 'Please log in again')
        return
      }

      // Upload photo if it's a new local image
      let photoUrl = doctorPhoto // Keep existing URL if no change
      if (doctorPhoto && doctorPhoto.startsWith('file://')) {
        try {
          console.log('Uploading updated doctor photo via server function...')
          const timestamp = Date.now()
          const fileName = `doctor_${userResult.user.id}_${timestamp}_updated.jpg`
          
          const uploadResult = await DoctorPhotoServiceV2.uploadDoctorPhoto(
            doctorPhoto,
            fileName,
            userResult.user.id,
            (progress) => {
              console.log('Photo update progress:', progress.percentage + '%')
            }
          )
          
          if (uploadResult.success && uploadResult.photoUrl) {
            photoUrl = uploadResult.photoUrl
            console.log('Updated photo uploaded successfully via server function:', photoUrl)
          } else {
            console.error('Photo upload failed:', uploadResult.error)
            Alert.alert('Warning', 'Failed to upload new photo, keeping existing photo')
            photoUrl = (selectedDoctor as any).profile_image_url // Keep original
          }
        } catch (error) {
          console.error('Photo upload error:', error)
          Alert.alert('Warning', 'Failed to upload new photo, keeping existing photo')
          photoUrl = (selectedDoctor as any).profile_image_url // Keep original
        }
      }

      // Prepare updated doctor data
      const updatedData = {
        first_name: doctorForm.first_name.trim(),
        last_name: doctorForm.last_name.trim(),
        specialty: doctorForm.specialty.trim(),
        hospital: doctorForm.hospital.trim(),
        phone: doctorForm.phone.trim(),
        email: doctorForm.email.trim(),
        location: doctorForm.location.trim(),
        notes: doctorForm.notes.trim(),
        profile_image_url: photoUrl,
      }

      // Update doctor on server
      const result = await MRService.updateDoctor(selectedDoctor.doctor_id, updatedData)
      
      if (result.success) {
        Alert.alert('Success', 'Doctor updated successfully')
        
        // Log activity
        await MRService.logActivity(userResult.user.id, 'doctor_updated', `Updated Dr. ${doctorForm.first_name} ${doctorForm.last_name}`)
        
        // Close modal and reset form
        setShowEditModal(false)
        resetForm()
        setSelectedDoctor(null)
        
        // Reload doctors list
        await loadDoctors()
      } else {
        Alert.alert('Error', result.error || 'Failed to update doctor')
      }
    } catch (error) {
      console.error('Error updating doctor:', error)
      Alert.alert('Error', 'Failed to update doctor')
    }
  }

  const filteredDoctors = doctors?.filter((doctor) => {
    // Use safe string operations to prevent 'charAt' of undefined errors
    const doctorName = safeToLowerCase(`${safeString(doctor.first_name)} ${safeString(doctor.last_name)}`)
    const hospitalName = safeToLowerCase(doctor.hospital)
    const searchTerm = safeToLowerCase(searchQuery)
    
    const matchesSearch = safeIncludes(doctorName, searchTerm) || safeIncludes(hospitalName, searchTerm)
    const matchesSpecialty = selectedSpecialty === "All" || safeString(doctor.specialty) === selectedSpecialty
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
    // Set the current doctor photo if available
    setDoctorPhoto((doctor as any).profile_image_url || null)
    setShowEditModal(true)
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
                const result = await MRService.deleteDoctorAssignment(doctor.doctor_id)
                
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
          <View key={doctor.doctor_id} style={styles.doctorCard}>
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
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(safeString(doctor.relationship_status))}20` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(safeString(doctor.relationship_status)) }]}>
                  {safeString(doctor.relationship_status).charAt(0).toUpperCase() + safeString(doctor.relationship_status).slice(1)}
                </Text>
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
                  onChangeText={(text) => updateFormField('first_name', text)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter doctor's last name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.last_name}
                  onChangeText={(text) => updateFormField('last_name', text)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Specialty</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Cardiology, Neurology"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.specialty}
                  onChangeText={(text) => updateFormField('specialty', text)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Hospital/Clinic</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter hospital or clinic name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.hospital}
                  onChangeText={(text) => updateFormField('hospital', text)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={[styles.textInput, formErrors.phone && styles.textInputError]}
                  placeholder="+1 (555) 123-4567"
                  keyboardType="phone-pad"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.phone}
                  onChangeText={(text) => updateFormField('phone', text)}
                />
                {formErrors.phone && (
                  <Text style={styles.errorText}>{formErrors.phone}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={[styles.textInput, formErrors.email && styles.textInputError]}
                  placeholder="doctor@hospital.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.email}
                  onChangeText={(text) => updateFormField('email', text)}
                />
                {formErrors.email && (
                  <Text style={styles.errorText}>{formErrors.email}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location</Text>
                <TextInput 
                  style={styles.textInput} 
                  placeholder="City, State" 
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.location}
                  onChangeText={(text) => updateFormField('location', text)}
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
                  onChangeText={(text) => updateFormField('notes', text)}
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
                  onChangeText={(text) => updateFormField('first_name', text)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter doctor's last name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.last_name}
                  onChangeText={(text) => updateFormField('last_name', text)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Specialty</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Cardiology, Neurology"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.specialty}
                  onChangeText={(text) => updateFormField('specialty', text)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Hospital/Clinic</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter hospital or clinic name"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.hospital}
                  onChangeText={(text) => updateFormField('hospital', text)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={[styles.textInput, formErrors.phone && styles.textInputError]}
                  placeholder="+1 (555) 123-4567"
                  keyboardType="phone-pad"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.phone}
                  onChangeText={(text) => updateFormField('phone', text)}
                />
                {formErrors.phone && (
                  <Text style={styles.errorText}>{formErrors.phone}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={[styles.textInput, formErrors.email && styles.textInputError]}
                  placeholder="doctor@hospital.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.email}
                  onChangeText={(text) => updateFormField('email', text)}
                />
                {formErrors.email && (
                  <Text style={styles.errorText}>{formErrors.email}</Text>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location</Text>
                <TextInput 
                  style={styles.textInput} 
                  placeholder="City, State" 
                  placeholderTextColor="#9ca3af"
                  value={doctorForm.location}
                  onChangeText={(text) => updateFormField('location', text)}
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
                  onChangeText={(text) => updateFormField('notes', text)}
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
  doctorAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    resizeMode: 'cover',
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
  textInputError: {
    borderColor: "#ef4444",
    backgroundColor: "#fef2f2",
  },
  errorText: {
    fontSize: 12,
    color: "#ef4444",
    marginTop: 4,
    marginLeft: 4,
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
