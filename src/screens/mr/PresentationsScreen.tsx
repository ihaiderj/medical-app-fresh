import { useState, useEffect } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { PDFConversionService, PresentationData } from "../../services/pdfConversionService"
import { AuthService } from "../../services/AuthService"
import { MRService, MRPresentation } from "../../services/MRService"

interface PresentationsScreenProps {
  navigation: any
}

export default function PresentationsScreen({ navigation }: PresentationsScreenProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [presentationName, setPresentationName] = useState("")
  const [selectedBrochures, setSelectedBrochures] = useState<number[]>([])
  const [convertedPresentations, setConvertedPresentations] = useState<PresentationData[]>([])
  const [isConverting, setIsConverting] = useState(false)
  const [presentations, setPresentations] = useState<MRPresentation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load presentations on component mount
  useEffect(() => {
    loadPresentations()
  }, [])

  const loadPresentations = async () => {
    setIsLoading(true)
    try {
      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        // Get presentations for this MR
        const presentationsResult = await MRService.getPresentations(userResult.user.id)
        if (presentationsResult.success && presentationsResult.data) {
          setPresentations(presentationsResult.data)
        }
      }
    } catch (error) {
      console.error('Error loading presentations:', error)
      Alert.alert("Error", "Failed to load presentations")
    } finally {
      setIsLoading(false)
    }
  }

  // Helper function to format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No date'
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours} hours ago`
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays} days ago`
    return date.toLocaleDateString()
  }

  // Convert presentations to display format
  const getDisplayPresentations = () => {
    const convertedDisplayPresentations = convertedPresentations.map(presentation => ({
      id: presentation.id,
      title: presentation.title,
      description: `Converted presentation with ${presentation.totalPages} slides`,
      slides: presentation.totalPages,
      lastModified: new Date(presentation.convertedAt).toLocaleDateString(),
      status: "ready",
      category: "Converted",
      isConverted: true,
    }))
    
    // Convert real presentations from database
    const realPresentations = presentations.map(presentation => ({
      id: presentation.id,
      title: presentation.brochure_title || 'Untitled Presentation',
      description: `Presentation with ${presentation.slides_used || 0} slides`,
      slides: presentation.slides_used || 0,
      lastModified: formatDate(presentation.created_at),
      status: presentation.status || 'ready',
      category: presentation.brochure_category || 'General',
      isConverted: false,
      meetingId: presentation.meeting_id,
      doctorName: presentation.doctor_name,
    }))
    
    return [...convertedDisplayPresentations, ...realPresentations]
  }
  
  const displayPresentations = getDisplayPresentations()

  // Load converted presentations on component mount
  useEffect(() => {
    loadConvertedPresentations()
  }, [])

  const loadConvertedPresentations = async () => {
    try {
      const converted = await PDFConversionService.getAllConvertedPresentations()
      setConvertedPresentations(converted)
      console.log('Loaded converted presentations:', converted.length)
    } catch (error) {
      console.error('Failed to load converted presentations:', error)
    }
  }


  const availableBrochures = [
    { id: 1, title: "CardioMax Pro Series", pages: 24 },
    { id: 2, title: "NeuroAdvance Treatment Guide", pages: 18 },
    { id: 3, title: "Diabetes Care Protocol", pages: 20 },
    { id: 4, title: "Visualet Fervid 23-080-2025", pages: 42 },
  ]

  const handleCreatePresentation = async () => {
    if (!presentationName.trim()) {
      Alert.alert("Error", "Please enter a presentation name")
      return
    }
    if (selectedBrochures.length === 0) {
      Alert.alert("Error", "Please select at least one brochure")
      return
    }

    try {
      setIsConverting(true)
      
      // Get selected brochures data
      const selectedBrochureData = availableBrochures.filter(brochure => 
        selectedBrochures.includes(brochure.id)
      )
      
      console.log('Creating presentation with brochures:', selectedBrochureData)
      
      // Convert each selected brochure to images
      for (const brochure of selectedBrochureData) {
        console.log('Converting brochure:', brochure.title)
        
        // Check if it's a PDF brochure that needs conversion
        if (brochure.title === "Visualet Fervid 23-080-2025") {
          const presentationId = `presentation_${Date.now()}_${brochure.id}`
          
          // Convert PDF to images
          await PDFConversionService.convertPDFToImages(
            presentationId,
            `${presentationName} - ${brochure.title}`,
            "/visualet-fervid-23-080-2025.pdf"
          )
          
          console.log('PDF conversion completed for:', brochure.title)
        } else {
          // For non-PDF brochures, create mock slides (in real app, these would be actual images)
          console.log('Non-PDF brochure, creating mock slides for:', brochure.title)
        }
      }
      
      // Close modal and reset state
      setShowCreateModal(false)
      setPresentationName("")
      setSelectedBrochures([])
      
      // Reload converted presentations
      await loadConvertedPresentations()
      
      Alert.alert(
        "Success", 
        `Presentation "${presentationName}" created successfully with ${selectedBrochureData.length} brochure(s) converted to images!`
      )
      
    } catch (error) {
      console.error('Failed to create presentation:', error)
      Alert.alert("Error", "Failed to create presentation. Please try again.")
    } finally {
      setIsConverting(false)
    }
  }

  const toggleBrochureSelection = (brochureId: number) => {
    setSelectedBrochures((prev) =>
      prev.includes(brochureId) ? prev.filter((id) => id !== brochureId) : [...prev, brochureId],
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "#10b981"
      case "draft":
        return "#d97706"
      default:
        return "#6b7280"
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Presentations</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={20} color="#ffffff" />
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* Presentations List */}
      <ScrollView style={styles.presentationsList} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>Loading presentations...</Text>
          </View>
        ) : displayPresentations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No Presentations Found</Text>
            <Text style={styles.emptyMessage}>
              You don't have any presentations yet. Create one by converting brochures or start a new presentation.
            </Text>
            <TouchableOpacity 
              style={styles.emptyActionButton} 
              onPress={() => setShowCreateModal(true)}
            >
              <Text style={styles.emptyActionText}>Create Your First Presentation</Text>
            </TouchableOpacity>
          </View>
        ) : (
          displayPresentations.map((presentation) => (
          <View key={presentation.id} style={styles.presentationCard}>
            <View style={styles.presentationHeader}>
              <View style={styles.presentationInfo}>
                <View style={styles.titleRow}>
                  <Text style={styles.presentationTitle}>{presentation.title}</Text>
                  {presentation.isConverted && (
                    <View style={styles.convertedBadge}>
                      <Ionicons name="image" size={12} color="#10b981" />
                      <Text style={styles.convertedBadgeText}>Images</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.presentationDescription}>{presentation.description}</Text>
                <View style={styles.presentationMeta}>
                  <Text style={styles.presentationMetaText}>{presentation.slides} slides</Text>
                  <Text style={styles.presentationMetaText}>•</Text>
                  <Text style={styles.presentationMetaText}>{presentation.lastModified}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(presentation.status)}20` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(presentation.status) }]}>
                  {presentation.status.charAt(0).toUpperCase() + presentation.status.slice(1)}
                </Text>
              </View>
            </View>

            <View style={styles.presentationActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  if (presentation.isConverted) {
                    // Navigate to presentation viewer with converted images
                    navigation.navigate("PresentationMode", { 
                      presentationId: presentation.id,
                      presentationTitle: presentation.title,
                      isConverted: true
                    })
                  } else {
                    // Open regular presentation
                    navigation.navigate("PresentationMode", { presentationId: presentation.id })
                  }
                }}
              >
                <Ionicons name="play" size={16} color="#8b5cf6" />
                <Text style={styles.actionButtonText}>Present</Text>
              </TouchableOpacity>

              {!presentation.isConverted && (
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="create" size={16} color="#6b7280" />
                  <Text style={[styles.actionButtonText, { color: "#6b7280" }]}>Edit</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="share" size={16} color="#6b7280" />
                <Text style={[styles.actionButtonText, { color: "#6b7280" }]}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionButton}>
                <Ionicons name="ellipsis-horizontal" size={16} color="#6b7280" />
              </TouchableOpacity>
            </View>
          </View>
        ))
        )}
      </ScrollView>

      {/* Create Presentation Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Presentation</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Presentation Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter presentation name..."
                value={presentationName}
                onChangeText={setPresentationName}
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.brochureSection}>
              <Text style={styles.inputLabel}>Select Brochures</Text>
              {availableBrochures.map((brochure) => (
                <TouchableOpacity
                  key={brochure.id}
                  style={styles.brochureOption}
                  onPress={() => toggleBrochureSelection(brochure.id)}
                >
                  <View style={styles.brochureOptionContent}>
                    <Text style={styles.brochureOptionTitle}>{brochure.title}</Text>
                    <Text style={styles.brochureOptionPages}>{brochure.pages} pages</Text>
                  </View>
                  <View style={[styles.checkbox, selectedBrochures.includes(brochure.id) && styles.checkboxSelected]}>
                    {selectedBrochures.includes(brochure.id) && <Ionicons name="checkmark" size={16} color="#ffffff" />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.createPresentationButton, isConverting && styles.createPresentationButtonDisabled]} 
                onPress={handleCreatePresentation}
                disabled={isConverting}
              >
                <Text style={[styles.createPresentationButtonText, isConverting && styles.createPresentationButtonTextDisabled]}>
                  {isConverting ? "Converting..." : "Create Presentation"}
                </Text>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 40,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  createButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  presentationsList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  presentationCard: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  presentationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  presentationInfo: {
    flex: 1,
    marginRight: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
    gap: 8,
  },
  presentationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    flex: 1,
  },
  convertedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  convertedBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#10b981",
  },
  presentationDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
  },
  presentationMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  presentationMetaText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  presentationActions: {
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
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonTextDisabled: {
    color: "#9ca3af",
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
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1f2937",
    backgroundColor: "#ffffff",
  },
  brochureSection: {
    marginBottom: 24,
  },
  brochureOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  brochureOptionContent: {
    flex: 1,
  },
  brochureOptionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1f2937",
    marginBottom: 2,
  },
  brochureOptionPages: {
    fontSize: 12,
    color: "#6b7280",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
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
  createPresentationButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
  },
  createPresentationButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  createPresentationButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  createPresentationButtonTextDisabled: {
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
    marginBottom: 20,
  },
  emptyActionButton: {
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
