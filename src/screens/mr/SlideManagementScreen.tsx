import React, { useState, useEffect } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { StatusBar } from "expo-status-bar"
import { BrochureManagementService, BrochureData, BrochureSlide, SlideGroup } from "../../services/brochureManagementService"
import { AuthService } from "../../services/AuthService"

interface SlideManagementScreenProps {
  navigation: any
  route: any
}

interface Slide {
  id: string
  title: string
  image: string
  group: string
  order: number
}

interface Brochure {
  id: number
  title: string
  category: string
  slides: Slide[]
}

export default function SlideManagementScreen({ navigation, route }: SlideManagementScreenProps) {
  const { brochureId, brochureTitle } = route.params || {}
  
  const [brochureData, setBrochureData] = useState<BrochureData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSlide, setSelectedSlide] = useState<BrochureSlide | null>(null)
  const [showAddSlideModal, setShowAddSlideModal] = useState(false)
  const [showEditSlideModal, setShowEditSlideModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [newSlideTitle, setNewSlideTitle] = useState("")
  const [newSlideGroup, setNewSlideGroup] = useState("")
  const [editingSlide, setEditingSlide] = useState<BrochureSlide | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Load brochure data on component mount
  useEffect(() => {
    loadBrochureData()
  }, [brochureId])

  const loadBrochureData = async () => {
    if (!brochureId) {
      Alert.alert('Error', 'No brochure ID provided')
      navigation.goBack()
      return
    }

    setIsLoading(true)
    try {
      // Get current user ID
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        Alert.alert('Error', 'User not authenticated')
        navigation.goBack()
        return
      }
      
      setCurrentUserId(userResult.user.id)
      
      console.log('Loading user-specific brochure data for ID:', brochureId, 'User:', userResult.user.id)
      const result = await BrochureManagementService.getUserBrochureData(brochureId, userResult.user.id)
      
      if (result.success && result.data) {
        console.log('Loaded user brochure data:', result.data.slides.length, 'slides')
        setBrochureData(result.data)
        if (result.data.slides.length > 0) {
          setSelectedSlide(result.data.slides[0])
        }
      } else {
        console.error('Failed to load brochure data:', result.error)
        Alert.alert('Error', result.error || 'Failed to load brochure data')
        navigation.goBack()
      }
    } catch (error) {
      console.error('Load brochure data error:', error)
      Alert.alert('Error', 'Failed to load brochure data')
      navigation.goBack()
    } finally {
      setIsLoading(false)
    }
  }

  // Save user-specific brochure modifications
  const saveUserModifications = async (updatedData: BrochureData) => {
    if (!currentUserId || !brochureId) return
    
    try {
      await BrochureManagementService.saveUserBrochureData(brochureId, currentUserId, updatedData)
      console.log('User modifications saved successfully')
    } catch (error) {
      console.error('Failed to save user modifications:', error)
    }
  }

  // Mock brochure data with slides
  const [brochures, setBrochures] = useState<Brochure[]>([
    {
      id: 1,
      title: "CardioMax Pro Series",
      category: "Cardiology",
      slides: [
        {
          id: "1-1",
          title: "Introduction to CardioMax",
          image: "/medical-slide-cardio-intro.png",
          group: "Overview",
          order: 1,
        },
        {
          id: "1-2",
          title: "Treatment Options",
          image: "/medical-slide-treatment-options.png",
          group: "Overview",
          order: 2,
        },
        {
          id: "1-3",
          title: "Clinical Studies",
          image: "/medical-slide-clinical-studies.png",
          group: "Evidence",
          order: 3,
        },
        {
          id: "1-4",
          title: "Patient Benefits",
          image: "/medical-slide-patient-benefits.png",
          group: "Evidence",
          order: 4,
        },
        {
          id: "1-5",
          title: "Dosage Guidelines",
          image: "/medical-slide-dosage-guidelines.png",
          group: "Implementation",
          order: 5,
        },
      ],
    },
    {
      id: 4,
      title: "Visualet Fervid 23-080-2025",
      category: "Cardiology",
      slides: [
        {
          id: "4-1",
          title: "Visualet Fervid - Overview",
          image: "/medical-slide-cardio-intro.png",
          group: "Overview",
          order: 1,
        },
        {
          id: "4-2",
          title: "Clinical Benefits",
          image: "/medical-slide-patient-benefits.png",
          group: "Benefits",
          order: 2,
        },
        {
          id: "4-3",
          title: "Dosage Guidelines",
          image: "/medical-slide-dosage-guidelines.png",
          group: "Implementation",
          order: 3,
        },
        {
          id: "4-4",
          title: "Clinical Studies",
          image: "/medical-slide-clinical-studies.png",
          group: "Evidence",
          order: 4,
        },
        {
          id: "4-5",
          title: "Side Effects",
          image: "/medical-slide-side-effects.png",
          group: "Safety",
          order: 5,
        },
      ],
    },
  ])

  const currentBrochure = brochures.find(b => b.id === brochureId) || brochures[0]
  const [brochure, setBrochure] = useState<Brochure>(currentBrochure)

  const groups = Array.from(new Set(brochure.slides.map(slide => slide.group)))

  const handleAddSlide = () => {
    if (!newSlideTitle.trim()) {
      Alert.alert("Error", "Please enter a slide title")
      return
    }
    if (!newSlideGroup.trim()) {
      Alert.alert("Error", "Please enter a group name")
      return
    }

    const newSlide: Slide = {
      id: `${brochure.id}-${Date.now()}`,
      title: newSlideTitle,
      image: "/medical-slide-cardio-intro.png", // Default image
      group: newSlideGroup,
      order: brochure.slides.length + 1,
    }

    setBrochure(prev => ({
      ...prev,
      slides: [...prev.slides, newSlide].sort((a, b) => a.order - b.order)
    }))

    setNewSlideTitle("")
    setNewSlideGroup("")
    setShowAddSlideModal(false)
    Alert.alert("Success", "Slide added successfully!")
  }

  const handleEditSlide = () => {
    if (!editingSlide || !newSlideTitle.trim()) {
      Alert.alert("Error", "Please enter a slide title")
      return
    }

    setBrochure(prev => ({
      ...prev,
      slides: prev.slides.map(slide =>
        slide.id === editingSlide.id
          ? { ...slide, title: newSlideTitle, group: newSlideGroup || slide.group }
          : slide
      )
    }))

    setEditingSlide(null)
    setNewSlideTitle("")
    setNewSlideGroup("")
    setShowEditSlideModal(false)
    Alert.alert("Success", "Slide updated successfully!")
  }

  const handleDeleteSlide = (slide: Slide) => {
    Alert.alert(
      "Delete Slide",
      `Are you sure you want to delete "${slide.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setBrochure(prev => ({
              ...prev,
              slides: prev.slides.filter(s => s.id !== slide.id)
            }))
            Alert.alert("Success", "Slide deleted successfully!")
          }
        }
      ]
    )
  }

  const handleReorderSlides = (fromIndex: number, toIndex: number) => {
    const newSlides = [...brochure.slides]
    const [movedSlide] = newSlides.splice(fromIndex, 1)
    newSlides.splice(toIndex, 0, movedSlide)
    
    // Update order numbers
    const updatedSlides = newSlides.map((slide, index) => ({
      ...slide,
      order: index + 1
    }))

    setBrochure(prev => ({
      ...prev,
      slides: updatedSlides
    }))
  }

  const openEditModal = (slide: Slide) => {
    setEditingSlide(slide)
    setNewSlideTitle(slide.title)
    setNewSlideGroup(slide.group)
    setShowEditSlideModal(true)
  }

  const groupedSlides = brochure.slides.reduce((acc, slide) => {
    if (!acc[slide.group]) {
      acc[slide.group] = []
    }
    acc[slide.group].push(slide)
    return acc
  }, {} as Record<string, Slide[]>)

  if (isLoading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="dark" />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>Loading brochure...</Text>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  if (!brochureData) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="dark" />
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={60} color="#ef4444" />
            <Text style={styles.errorText}>Failed to load brochure</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadBrochureData}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Manage Slides</Text>
          <Text style={styles.headerSubtitle}>{brochureTitle || brochureData.title}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.convertButton} 
            onPress={() => navigation.navigate("PDFConversion", { brochureId: brochure.id })}
          >
            <Ionicons name="refresh" size={20} color="#8b5cf6" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddSlideModal(true)}>
            <Ionicons name="add" size={24} color="#8b5cf6" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Slides List */}
      <ScrollView style={styles.content}>
        {Object.entries(groupedSlides).map(([groupName, slides]) => (
          <View key={groupName} style={styles.groupContainer}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{groupName}</Text>
              <Text style={styles.groupCount}>{slides.length} slides</Text>
            </View>
            
            {slides.map((slide, index) => (
              <View key={slide.id} style={styles.slideCard}>
                <Image source={{ uri: slide.image }} style={styles.slideThumbnail} />
                <View style={styles.slideInfo}>
                  <Text style={styles.slideTitle}>{slide.title}</Text>
                  <Text style={styles.slideGroup}>{slide.group}</Text>
                  <Text style={styles.slideOrder}>Order: {slide.order}</Text>
                </View>
                <View style={styles.slideActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => openEditModal(slide)}
                  >
                    <Ionicons name="create-outline" size={20} color="#6b7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDeleteSlide(slide)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ))}

        {brochure.slides.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={60} color="#9ca3af" />
            <Text style={styles.emptyStateText}>No slides found</Text>
            <Text style={styles.emptyStateSubtext}>Add your first slide to get started</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Slide Modal */}
      <Modal visible={showAddSlideModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Slide</Text>
              <TouchableOpacity onPress={() => setShowAddSlideModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Slide Title</Text>
              <TextInput
                style={styles.textInput}
                value={newSlideTitle}
                onChangeText={setNewSlideTitle}
                placeholder="Enter slide title"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Group</Text>
              <TextInput
                style={styles.textInput}
                value={newSlideGroup}
                onChangeText={setNewSlideGroup}
                placeholder="Enter group name"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddSlideModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleAddSlide}
              >
                <Text style={styles.saveButtonText}>Add Slide</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Slide Modal */}
      <Modal visible={showEditSlideModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Slide</Text>
              <TouchableOpacity onPress={() => setShowEditSlideModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Slide Title</Text>
              <TextInput
                style={styles.textInput}
                value={newSlideTitle}
                onChangeText={setNewSlideTitle}
                placeholder="Enter slide title"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Group</Text>
              <TextInput
                style={styles.textInput}
                value={newSlideGroup}
                onChangeText={setNewSlideGroup}
                placeholder="Enter group name"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditSlideModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleEditSlide}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
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
    backgroundColor: "#f9fafb",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  convertButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
  },
  addButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  groupCount: {
    fontSize: 14,
    color: "#6b7280",
  },
  slideCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  slideThumbnail: {
    width: 60,
    height: 45,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  slideInfo: {
    flex: 1,
    marginLeft: 12,
  },
  slideTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1f2937",
    marginBottom: 4,
  },
  slideGroup: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  slideOrder: {
    fontSize: 12,
    color: "#9ca3af",
  },
  slideActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#f9fafb",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
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
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1f2937",
    backgroundColor: "#ffffff",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f3f4f6",
  },
  saveButton: {
    backgroundColor: "#8b5cf6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6b7280",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#ffffff",
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
    marginTop: 16,
    fontSize: 18,
    color: '#ef4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})


