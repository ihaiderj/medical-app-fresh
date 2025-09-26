import React, { useState, useRef, useEffect } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  ScrollView,
  Image,
  Dimensions,
  Alert,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { PDFConversionService, PresentationData } from "../../services/pdfConversionService"

interface PresentationModeScreenProps {
  navigation: any
  route: any
}

const { width: screenWidth, height: screenHeight } = Dimensions.get("window")

export default function PresentationModeScreen({ navigation, route }: PresentationModeScreenProps) {
  const { presentationId, brochureId, brochureTitle, brochureFile, isPDF, isConverted } = route.params || {}

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [showSlideIndex, setShowSlideIndex] = useState(false)
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [showEndMeetingModal, setShowEndMeetingModal] = useState(false)
  const [selectedDoctor, setSelectedDoctor] = useState("")
  const [comment, setComment] = useState("")
  const [meetingTimer, setMeetingTimer] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(true)
  const [presentation, setPresentation] = useState<any>(null)
  const [convertedPresentation, setConvertedPresentation] = useState<PresentationData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Mock brochure data - in real app, this would come from API
  const mockBrochures = [
    {
      id: 1,
      title: "CardioMax Pro Series",
      category: "Cardiology",
      fileUrl: "/medical-slide-cardio-intro.png",
      slides: [
        {
          id: 1,
          title: "Introduction to CardioMax",
          image: "/medical-slide-cardio-intro.png",
          group: "Overview",
        },
        {
          id: 2,
          title: "Treatment Options",
          image: "/medical-slide-treatment-options.png",
          group: "Overview",
        },
        {
          id: 3,
          title: "Clinical Studies",
          image: "/medical-slide-clinical-studies.png",
          group: "Evidence",
        },
        {
          id: 4,
          title: "Patient Benefits",
          image: "/medical-slide-patient-benefits.png",
          group: "Evidence",
        },
        {
          id: 5,
          title: "Dosage Guidelines",
          image: "/medical-slide-dosage-guidelines.png",
          group: "Implementation",
        },
      ],
    },
    {
      id: 4,
      title: "Visualet Fervid 23-080-2025",
      category: "Cardiology",
      fileUrl: "/visualet-fervid-23-080-2025.pdf",
      isPDF: true,
      slides: [
        {
          id: 1,
          title: "Visualet Fervid - Overview",
          image: "/medical-slide-cardio-intro.png",
          group: "Overview",
        },
        {
          id: 2,
          title: "Clinical Benefits",
          image: "/medical-slide-patient-benefits.png",
          group: "Benefits",
        },
        {
          id: 3,
          title: "Dosage Guidelines",
          image: "/medical-slide-dosage-guidelines.png",
          group: "Implementation",
        },
        {
          id: 4,
          title: "Clinical Studies",
          image: "/medical-slide-clinical-studies.png",
          group: "Evidence",
        },
        {
          id: 5,
          title: "Side Effects",
          image: "/medical-slide-side-effects.png",
          group: "Safety",
        },
      ],
    },
  ]

  // Load presentation data based on presentationId
  useEffect(() => {
    const loadPresentation = async () => {
      try {
        setIsLoading(true)
        
        if (isConverted || isPDF) {
          // Handle converted presentation - load converted images
          console.log('Loading converted presentation:', presentationId)
          const convertedData = await PDFConversionService.getPresentationData(presentationId.toString())
          
          if (convertedData) {
            console.log('Found converted presentation:', convertedData)
            setConvertedPresentation(convertedData)
            setPresentation({
              id: presentationId,
              title: convertedData.title,
              slides: convertedData.slides.map(slide => ({
                id: slide.pageNumber,
                title: slide.title,
                image: slide.imagePath,
                group: `Page ${slide.pageNumber}`
              })),
              isConverted: true,
              totalPages: convertedData.totalPages
            })
          } else {
            console.log('No converted presentation found, using fallback')
            setPresentation({
              id: presentationId,
              title: brochureTitle || "Visualet Fervid 23-080-2025",
              isConverted: true,
              slides: []
            })
          }
        } else {
          // Handle regular presentation
          const brochure = mockBrochures.find(b => b.id === presentationId)
          if (brochure) {
            setPresentation(brochure)
          } else {
            // Fallback to default presentation
            setPresentation({
              id: presentationId || 1,
              title: brochureTitle || "CardioMax Pro Series",
              slides: mockBrochures[0].slides,
            })
          }
        }
      } catch (error) {
        console.error('Failed to load presentation:', error)
        Alert.alert("Error", "Failed to load presentation")
      } finally {
        setIsLoading(false)
      }
    }

    loadPresentation()
  }, [presentationId, brochureTitle, brochureFile, isPDF, isConverted])

  const doctors = [
    { id: 1, name: "Dr. Michael Smith" },
    { id: 2, name: "Dr. Sarah Johnson" },
    { id: 3, name: "Dr. Robert Chen" },
  ]

  // Timer effect
  React.useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setMeetingTimer((prev) => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isTimerRunning])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handlePreviousSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1)
    }
  }

  const handleNextSlide = () => {
    if (presentation?.slides && currentSlideIndex < presentation.slides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1)
    }
  }

  const handleSlideSelect = (index: number) => {
    setCurrentSlideIndex(index)
    setShowSlideIndex(false)
  }

  const handleAddComment = () => {
    if (!selectedDoctor || !comment.trim()) {
      Alert.alert("Error", "Please select a doctor and enter a comment")
      return
    }

    // Save comment logic here
    Alert.alert("Success", "Comment added successfully!")
    setShowCommentModal(false)
    setComment("")
    setSelectedDoctor("")
  }

  const handleEndMeeting = (followUpRequired: boolean, followUpDate?: string) => {
    setIsTimerRunning(false)
    // Save meeting data logic here
    Alert.alert("Meeting Ended", "Meeting data has been saved successfully!", [
      {
        text: "OK",
        onPress: () => navigation.goBack(),
      },
    ])
  }

  const currentSlide = presentation?.slides?.[currentSlideIndex] || { title: "Loading...", image: "" }
  
  // Helper function to get image source for converted slides
  const getImageSource = (imagePath: string) => {
    if (!imagePath) {
      return require("../../../public/placeholder.jpg")
    }
    
    // For converted images, use file URI
    if (imagePath.startsWith('file://') || imagePath.includes('DocumentDirectory')) {
      return { uri: imagePath }
    }
    
    // For regular images, use require or URI
    if (imagePath.startsWith('/')) {
      return { uri: imagePath }
    }
    
    return { uri: imagePath }
  }
  const groupedSlides = presentation?.slides?.reduce(
    (acc: Record<string, any[]>, slide: any, index: number) => {
      if (!acc[slide.group]) {
        acc[slide.group] = []
      }
      acc[slide.group].push({ ...slide, index })
      return acc
    },
    {} as Record<string, any[]>,
  ) || {}

  // Show loading state if presentation is not loaded yet
  if (isLoading || !presentation) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
          <View style={styles.loadingIcon}>
            <Ionicons name="document-text" size={60} color="#8b5cf6" />
          </View>
          <Text style={styles.loadingText}>
            {isConverted ? "Loading Converted Images..." : "Loading Presentation..."}
          </Text>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {/* Header Controls */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color="#ffffff" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.presentationTitle}>{presentation.title}</Text>
          <Text style={styles.timerText}>{formatTime(meetingTimer)}</Text>
        </View>

        <TouchableOpacity style={styles.headerButton} onPress={() => setShowSlideIndex(true)}>
          <Ionicons name="list" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Main Slide Display */}
      <View style={styles.slideContainer}>
        {presentation?.isPDF && !presentation?.slides ? (
          // PDF Display (for PDFs without slides)
          <View style={styles.pdfContainer}>
            <View style={styles.pdfIconContainer}>
              <Ionicons name="document-text" size={80} color="#8b5cf6" />
            </View>
            <Text style={styles.pdfTitle}>{presentation.title}</Text>
            <Text style={styles.pdfSubtitle}>PDF Document</Text>
            <TouchableOpacity 
              style={styles.openPdfButton}
              onPress={() => {
                Alert.alert(
                  "Open PDF",
                  "This would open the PDF in a PDF viewer. In a real app, you would integrate with react-native-pdf or similar library.",
                  [
                    { text: "OK", style: "default" }
                  ]
                )
              }}
            >
              <Ionicons name="open-outline" size={20} color="#ffffff" />
              <Text style={styles.openPdfButtonText}>Open PDF</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Slide Display (for both regular slides and PDFs with slides)
          <>
            <Image 
              source={getImageSource(currentSlide.image)} 
              style={styles.slideImage} 
              resizeMode="contain"
              onError={(error) => console.log('Image load error:', error)}
              onLoad={() => console.log('Image loaded successfully')}
            />

            {/* Slide Navigation Overlay */}
            <View style={styles.slideNavigation}>
              <TouchableOpacity
                style={[styles.navButton, currentSlideIndex === 0 && styles.navButtonDisabled]}
                onPress={handlePreviousSlide}
                disabled={currentSlideIndex === 0}
              >
                <Ionicons name="chevron-back" size={32} color={currentSlideIndex === 0 ? "#9ca3af" : "#ffffff"} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navButton, currentSlideIndex === (presentation.slides?.length || 0) - 1 && styles.navButtonDisabled]}
                onPress={handleNextSlide}
                disabled={currentSlideIndex === (presentation.slides?.length || 0) - 1}
              >
                <Ionicons
                  name="chevron-forward"
                  size={32}
                  color={currentSlideIndex === (presentation.slides?.length || 0) - 1 ? "#9ca3af" : "#ffffff"}
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <View style={styles.slideInfo}>
          <Text style={styles.slideTitle}>
            {presentation?.isPDF && !presentation?.slides ? presentation.title : currentSlide.title}
          </Text>
          <Text style={styles.slideCounter}>
            {presentation?.isPDF && !presentation?.slides ? "PDF Document" : `${currentSlideIndex + 1} of ${presentation.slides?.length || 0}`}
          </Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={() => setShowCommentModal(true)}>
            <Ionicons name="chatbubble" size={20} color="#8b5cf6" />
            <Text style={styles.actionButtonText}>Add Comment</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setShowEndMeetingModal(true)}>
            <Ionicons name="stop-circle" size={20} color="#ef4444" />
            <Text style={[styles.actionButtonText, { color: "#ef4444" }]}>End Meeting</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Slide Index Modal */}
      <Modal visible={showSlideIndex} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.slideIndexModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Slide Navigation</Text>
              <TouchableOpacity onPress={() => setShowSlideIndex(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.slideIndexList}>
              {presentation?.isPDF && !presentation?.slides ? (
                <View style={styles.pdfInfoContainer}>
                  <View style={styles.pdfInfoIcon}>
                    <Ionicons name="document-text" size={40} color="#8b5cf6" />
                  </View>
                  <Text style={styles.pdfInfoTitle}>{presentation.title}</Text>
                  <Text style={styles.pdfInfoSubtitle}>PDF Document</Text>
                  <Text style={styles.pdfInfoDescription}>
                    This is a PDF brochure. Tap "Open PDF" in the presentation view to view the document.
                  </Text>
                </View>
              ) : (
                Object.entries(groupedSlides).map(([groupName, slides]) => (
                  <View key={groupName} style={styles.slideGroup}>
                    <Text style={styles.slideGroupTitle}>{groupName}</Text>
                    {(slides as any[]).map((slide: any) => (
                      <TouchableOpacity
                        key={slide.id}
                        style={[styles.slideIndexItem, slide.index === currentSlideIndex && styles.slideIndexItemActive]}
                        onPress={() => handleSlideSelect(slide.index)}
                      >
                        <Image source={getImageSource(slide.image)} style={styles.slideIndexThumbnail} />
                        <View style={styles.slideIndexInfo}>
                          <Text style={styles.slideIndexTitle}>{slide.title}</Text>
                          <Text style={styles.slideIndexNumber}>Slide {slide.index + 1}</Text>
                        </View>
                        {slide.index === currentSlideIndex && (
                          <Ionicons name="checkmark-circle" size={20} color="#8b5cf6" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Comment Modal */}
      <Modal visible={showCommentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.commentModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Comment</Text>
              <TouchableOpacity onPress={() => setShowCommentModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.currentSlideInfo}>
              {presentation?.isPDF && !presentation?.slides ? (
                <View style={styles.pdfThumbnailContainer}>
                  <Ionicons name="document-text" size={24} color="#8b5cf6" />
                </View>
              ) : (
                <Image source={getImageSource(currentSlide.image)} style={styles.commentSlideThumbnail} />
              )}
              <Text style={styles.commentSlideTitle}>
                {presentation?.isPDF && !presentation?.slides ? presentation.title : currentSlide.title}
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Select Doctor</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.doctorSelector}>
                {doctors.map((doctor) => (
                  <TouchableOpacity
                    key={doctor.id}
                    style={[styles.doctorChip, selectedDoctor === doctor.name && styles.doctorChipSelected]}
                    onPress={() => setSelectedDoctor(doctor.name)}
                  >
                    <Text
                      style={[styles.doctorChipText, selectedDoctor === doctor.name && styles.doctorChipTextSelected]}
                    >
                      {doctor.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Comment</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="Enter your comment about this slide..."
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={4}
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCommentModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleAddComment}>
                <Text style={styles.saveButtonText}>Add Comment</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* End Meeting Modal */}
      <Modal visible={showEndMeetingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.endMeetingModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>End Meeting</Text>
              <TouchableOpacity onPress={() => setShowEndMeetingModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.meetingSummary}>
              <Text style={styles.summaryText}>Meeting Duration: {formatTime(meetingTimer)}</Text>
              <Text style={styles.summaryText}>Slides Presented: {presentation?.slides?.length || 0}</Text>
            </View>

            <View style={styles.followUpSection}>
              <Text style={styles.inputLabel}>Follow-up Required?</Text>
              <View style={styles.followUpButtons}>
                <TouchableOpacity style={styles.followUpButton} onPress={() => handleEndMeeting(false)}>
                  <Text style={styles.followUpButtonText}>No Follow-up</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.followUpButton, styles.followUpButtonPrimary]}
                  onPress={() => handleEndMeeting(true, "Next week")}
                >
                  <Text style={[styles.followUpButtonText, styles.followUpButtonTextPrimary]}>Schedule Follow-up</Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: "#000000",
  },
  safeArea: {
    flex: 1,
    paddingTop: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    marginTop: 10,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 22,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 16,
  },
  presentationTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
  },
  timerText: {
    fontSize: 14,
    color: "#d97706",
    marginTop: 2,
  },
  slideContainer: {
    flex: 1,
    position: "relative",
    marginHorizontal: 10,
    marginVertical: 10,
  },
  slideImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1f2937",
    borderRadius: 8,
  },
  slideNavigation: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  navButton: {
    width: 60,
    height: 60,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonDisabled: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  bottomControls: {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 10,
    marginBottom: 10,
    borderRadius: 8,
  },
  slideInfo: {
    marginBottom: 16,
  },
  slideTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 4,
  },
  slideCounter: {
    fontSize: 14,
    color: "#9ca3af",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8b5cf6",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  slideIndexModal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    maxHeight: "80%",
    padding: 20,
  },
  commentModal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
  },
  endMeetingModal: {
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
  slideIndexList: {
    maxHeight: 400,
  },
  slideGroup: {
    marginBottom: 20,
  },
  slideGroupTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#8b5cf6",
    marginBottom: 8,
  },
  slideIndexItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  slideIndexItemActive: {
    backgroundColor: "#f1f5f9",
  },
  slideIndexThumbnail: {
    width: 40,
    height: 30,
    borderRadius: 4,
    backgroundColor: "#e5e7eb",
    marginRight: 12,
  },
  slideIndexInfo: {
    flex: 1,
  },
  slideIndexTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1f2937",
  },
  slideIndexNumber: {
    fontSize: 12,
    color: "#6b7280",
  },
  currentSlideInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  commentSlideThumbnail: {
    width: 60,
    height: 45,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
    marginRight: 12,
  },
  commentSlideTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
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
  doctorSelector: {
    flexDirection: "row",
  },
  doctorChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  doctorChipSelected: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  doctorChipText: {
    fontSize: 12,
    color: "#6b7280",
  },
  doctorChipTextSelected: {
    color: "#ffffff",
  },
  commentInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1f2937",
    backgroundColor: "#ffffff",
    textAlignVertical: "top",
    height: 100,
  },
  meetingSummary: {
    backgroundColor: "#f1f5f9",
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  summaryText: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  followUpSection: {
    marginBottom: 20,
  },
  followUpButtons: {
    flexDirection: "row",
    gap: 12,
  },
  followUpButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  followUpButtonPrimary: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  followUpButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  followUpButtonTextPrimary: {
    color: "#ffffff",
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
  pdfContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  pdfIconContainer: {
    width: 120,
    height: 120,
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  pdfTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 8,
  },
  pdfSubtitle: {
    fontSize: 16,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 32,
  },
  openPdfButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8b5cf6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  openPdfButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  pdfInfoContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  pdfInfoIcon: {
    width: 80,
    height: 80,
    backgroundColor: "#f1f5f9",
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  pdfInfoTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
    textAlign: "center",
    marginBottom: 8,
  },
  pdfInfoSubtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 16,
  },
  pdfInfoDescription: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  pdfThumbnailContainer: {
    width: 60,
    height: 45,
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1f2937",
  },
  loadingIcon: {
    width: 100,
    height: 100,
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    textAlign: "center",
  },
})
