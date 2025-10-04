import React, { useState, useEffect, useRef } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  Dimensions,
  Alert,
  Animated,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native"
import { PinchGestureHandler, State } from 'react-native-gesture-handler'
import { Ionicons } from "@expo/vector-icons"
import { StatusBar } from "expo-status-bar"
import * as ScreenOrientation from 'expo-screen-orientation'
import { PDFConversionService, PresentationData } from "../../services/pdfConversionService"

interface BrochureViewerScreenProps {
  navigation: any
  route: any
}

interface Slide {
  id: string
  title: string
  image: string
  pageNumber: number
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

export default function BrochureViewerScreen({ navigation, route }: BrochureViewerScreenProps) {
  const { brochureId, brochureTitle, brochureFile } = route.params || {}
  
  const [slides, setSlides] = useState<Slide[]>([])
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [convertedPresentation, setConvertedPresentation] = useState<PresentationData | null>(null)
  
  
  // Zoom functionality
  const scale = useRef(new Animated.Value(1)).current
  const lastScale = useRef(1)

  // Initialize with flexible orientation support
  useEffect(() => {
    console.log("BrochureViewer mounted with:", { brochureId, brochureTitle, brochureFile })
    
    // Start with landscape but allow switching
    initializeOrientation()
    
    // Load converted PDF images
    loadConvertedPresentation()
    
    // Set up dimension change listener
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window)
      updateOrientationState(window)
    })
    
    // Cleanup: unlock orientation when component unmounts
    return () => {
      ScreenOrientation.unlockAsync()
      subscription?.remove()
    }
  }, [])

  // Initialize orientation
  const initializeOrientation = async () => {
    try {
      // Allow both orientations
      await ScreenOrientation.unlockAsync()
      
      // Get current orientation
      const orientation = await ScreenOrientation.getOrientationAsync()
      console.log('Initial orientation:', orientation)
      updateOrientationFromEnum(orientation)
      
      // Set up orientation change listener
      ScreenOrientation.addOrientationChangeListener(handleOrientationChange)
    } catch (error) {
      console.log("Orientation initialization error:", error)
    }
  }

  // Handle orientation changes
  const handleOrientationChange = (event: any) => {
    updateOrientationFromEnum(event.orientationInfo.orientation)
  }

  // Update orientation state from enum
  const updateOrientationFromEnum = (orientation: any) => {
    const isLandscape = orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || 
                       orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
    const newOrientation = isLandscape ? 'landscape' : 'portrait'
    console.log('Orientation updated to:', newOrientation)
    setCurrentOrientation(newOrientation)
  }

  // Update orientation state from dimensions
  const updateOrientationState = (windowDimensions: any) => {
    const isLandscape = windowDimensions.width > windowDimensions.height
    setCurrentOrientation(isLandscape ? 'landscape' : 'portrait')
  }

  const loadConvertedPresentation = async () => {
    try {
      setIsLoading(true)
      console.log('Loading converted presentation for brochure:', brochureId)
      
      const presentationData = await PDFConversionService.getPresentationData(brochureId.toString())
      
      if (presentationData) {
        console.log('Found converted presentation:', presentationData)
        setConvertedPresentation(presentationData)
        
        // Convert to slides format
        const convertedSlides: Slide[] = presentationData.slides.map(slide => ({
          id: `slide-${slide.pageNumber}`,
          title: slide.title,
          image: slide.imagePath,
          pageNumber: slide.pageNumber
        }))
        
        setSlides(convertedSlides)
        console.log('Loaded slides:', convertedSlides.length)
      } else {
        console.log('No converted presentation found, creating fallback slides')
        createFallbackSlides()
      }
    } catch (error) {
      console.error('Failed to load converted presentation:', error)
      createFallbackSlides()
    } finally {
      setIsLoading(false)
    }
  }

  const createFallbackSlides = () => {
    // Create fallback slides if conversion is not available
    const fallbackSlides: Slide[] = [
      {
        id: "slide-1",
        title: "Visualet Fervid - Product Overview",
        image: require("../../../public/medical-slide-cardio-intro.png"),
        pageNumber: 1
      },
      {
        id: "slide-2", 
        title: "Clinical Benefits & Efficacy",
        image: require("../../../public/medical-slide-patient-benefits.png"),
        pageNumber: 2
      },
      {
        id: "slide-3",
        title: "Dosage Guidelines & Administration",
        image: require("../../../public/medical-slide-dosage-guidelines.png"),
        pageNumber: 3
      },
      {
        id: "slide-4",
        title: "Clinical Study Results",
        image: require("../../../public/medical-slide-clinical-studies.png"),
        pageNumber: 4
      },
      {
        id: "slide-5",
        title: "Safety Profile & Side Effects",
        image: require("../../../public/medical-slide-side-effects.png"),
        pageNumber: 5
      },
      {
        id: "slide-6",
        title: "Treatment Options & Indications",
        image: require("../../../public/medical-slide-treatment-options.png"),
        pageNumber: 6
      }
    ]
    
    setSlides(fallbackSlides)
  }

  const handlePreviousSlide = () => {
    if (selectedSlideIndex > 0) {
      setSelectedSlideIndex(selectedSlideIndex - 1)
    }
  }

  const handleNextSlide = () => {
    if (selectedSlideIndex < slides.length - 1) {
      setSelectedSlideIndex(selectedSlideIndex + 1)
    }
  }

  const handleSlideSelect = (index: number) => {
    setSelectedSlideIndex(index)
    console.log('Selected slide:', slides[index]?.id, 'ImageURI:', slides[index]?.image)
  }

  // Add keyboard navigation support (for accessibility)
  useEffect(() => {
    const handleKeyPress = (event: any) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        handlePreviousSlide()
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        handleNextSlide()
      }
    }

    // Only add keyboard listener on web platform
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyPress)
      return () => window.removeEventListener('keydown', handleKeyPress)
    }
  }, [selectedSlideIndex, slides.length])

  const getImageSource = (imagePath: any) => {
    if (!imagePath) {
      return require("../../../public/placeholder.jpg")
    }
    
    // If it's already a require() object, return it
    if (typeof imagePath === 'number') {
      return imagePath
    }
    
    // For converted images, use file URI
    if (typeof imagePath === 'string' && (imagePath.startsWith('file://') || imagePath.includes('DocumentDirectory'))) {
      return { uri: imagePath }
    }
    
    // For regular images, use require or URI
    if (typeof imagePath === 'string' && imagePath.startsWith('/')) {
      return { uri: imagePath }
    }
    
    return { uri: imagePath }
  }


  const currentSlide = slides[selectedSlideIndex]

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{brochureTitle || "Visualet Fervid 23-080-2025"}</Text>
          <Text style={styles.headerSubtitle}>
            {slides.length > 0 ? `Page ${selectedSlideIndex + 1} of ${slides.length}` : "Loading..."} • {currentOrientation}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.orientationButton}
            onPress={async () => {
              try {
                console.log('Orientation button pressed, current:', currentOrientation)
                if (currentOrientation === 'portrait') {
                  console.log('Switching to landscape...')
                  await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
                } else {
                  console.log('Switching to portrait...')
                  await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT)
                }
              } catch (error) {
                console.log("Orientation change error:", error)
              }
            }}
          >
            <Ionicons 
              name={currentOrientation === 'portrait' ? 'phone-landscape' : 'phone-portrait'} 
              size={20} 
              color="#ffffff" 
            />
            <Text style={styles.orientationButtonText}>
              {currentOrientation === 'portrait' ? 'Landscape' : 'Portrait'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content - Responsive Layout */}
      <View style={[
        styles.contentContainer,
        currentOrientation === 'portrait' ? styles.contentContainerPortrait : styles.contentContainerLandscape
      ]}>
        {/* Slide List - Responsive Position */}
        <View style={[
          styles.slideListContainer,
          currentOrientation === 'portrait' ? styles.slideListContainerPortrait : styles.slideListContainerLandscape
        ]}>
          <ScrollView 
            style={styles.slideList} 
            horizontal={currentOrientation === 'portrait'}
            showsVerticalScrollIndicator={currentOrientation === 'landscape'}
            showsHorizontalScrollIndicator={currentOrientation === 'portrait'}
          >
            {slides.map((slide, index) => (
              <TouchableOpacity
                key={slide.id}
                style={[
                  styles.slideListItem,
                  currentOrientation === 'portrait' ? styles.slideListItemPortrait : styles.slideListItemLandscape,
                  index === selectedSlideIndex && styles.slideListItemActive
                ]}
                onPress={() => handleSlideSelect(index)}
              >
                <Image 
                  source={getImageSource(slide.image)} 
                  style={[
                    styles.slideListThumbnail,
                    currentOrientation === 'portrait' ? styles.slideListThumbnailPortrait : styles.slideListThumbnailLandscape
                  ]}
                  resizeMode="cover"
                />
                <Text style={[
                  styles.slideListNumber,
                  currentOrientation === 'portrait' && styles.slideListNumberPortrait
                ]}>
                  {slide.pageNumber}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Main Slide Display - Responsive Size */}
        <View style={[
          styles.mainSlideContainer,
          currentOrientation === 'portrait' ? styles.mainSlideContainerPortrait : styles.mainSlideContainerLandscape
        ]}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading PDF Images...</Text>
            </View>
          ) : currentSlide ? (
            <Image 
              source={getImageSource(currentSlide.image)} 
              style={[
                styles.mainSlideImage,
                currentOrientation === 'portrait' ? styles.mainSlideImagePortrait : styles.mainSlideImageLandscape
              ]}
              resizeMode="contain"
              onError={(error) => console.log('Image load error:', error)}
              onLoad={() => console.log('Image loaded successfully for:', currentSlide.image)}
            />
          ) : (
            <View style={styles.noSlideContainer}>
              <Ionicons name="document-text" size={60} color="#6b7280" />
              <Text style={styles.noSlideText}>No slides available</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavigation}>
        <TouchableOpacity 
          style={[styles.navButton, selectedSlideIndex === 0 && styles.navButtonDisabled]} 
          onPress={handlePreviousSlide}
          disabled={selectedSlideIndex === 0}
        >
          <Ionicons name="chevron-back" size={20} color={selectedSlideIndex === 0 ? "#6b7280" : "#ffffff"} />
          <Text style={[styles.navButtonText, selectedSlideIndex === 0 && styles.navButtonTextDisabled]}>
            Previous
          </Text>
        </TouchableOpacity>

        <Text style={styles.pageCounter}>
          {selectedSlideIndex + 1} / {slides.length}
        </Text>

        <TouchableOpacity 
          style={[styles.navButton, selectedSlideIndex === slides.length - 1 && styles.navButtonDisabled]} 
          onPress={handleNextSlide}
          disabled={selectedSlideIndex === slides.length - 1}
        >
          <Text style={[styles.navButtonText, selectedSlideIndex === slides.length - 1 && styles.navButtonTextDisabled]}>
            Next
          </Text>
          <Ionicons name="chevron-forward" size={20} color={selectedSlideIndex === slides.length - 1 ? "#6b7280" : "#ffffff"} />
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1f2937",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#374151",
    borderBottomWidth: 1,
    borderBottomColor: "#4b5563",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  orientationButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    minWidth: 100,
    justifyContent: "center",
  },
  orientationButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 2,
  },
  fullscreenButton: {
    padding: 8,
    marginLeft: 12,
  },
  contentContainer: {
    flex: 1,
    flexDirection: "row", // Default landscape layout
  },
  contentContainerPortrait: {
    flexDirection: "column", // Stack vertically in portrait
  },
  contentContainerLandscape: {
    flexDirection: "row", // Side by side in landscape
  },
  slideListContainer: {
    width: "15%", // Default landscape
    backgroundColor: "#374151",
    borderRightWidth: 1,
    borderRightColor: "#4b5563",
  },
  slideListContainerPortrait: {
    width: "100%",
    height: "20%", // Top 20% in portrait
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#4b5563",
  },
  slideListContainerLandscape: {
    width: "15%", // Left 15% in landscape
    height: "100%",
    borderRightWidth: 1,
    borderBottomWidth: 0,
  },
  slideList: {
    flex: 1,
    paddingVertical: 10,
  },
  slideListItem: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderRadius: 6,
    marginHorizontal: 4,
  },
  slideListItemPortrait: {
    marginRight: 8, // Horizontal spacing in portrait
    marginBottom: 0,
    minWidth: 60, // Ensure minimum width for horizontal scroll
  },
  slideListItemLandscape: {
    marginBottom: 4, // Vertical spacing in landscape
    marginRight: 0,
  },
  slideListItemActive: {
    backgroundColor: "#8b5cf6",
  },
  slideListThumbnail: {
    width: 50,
    height: 35,
    borderRadius: 4,
    backgroundColor: "#6b7280",
  },
  slideListThumbnailPortrait: {
    width: 45, // Slightly smaller in portrait for horizontal scroll
    height: 32,
  },
  slideListThumbnailLandscape: {
    width: 50, // Standard size in landscape
    height: 35,
  },
  slideListNumber: {
    fontSize: 12,
    color: "#ffffff",
    marginTop: 4,
    fontWeight: "600",
  },
  slideListNumberPortrait: {
    fontSize: 10, // Smaller text in portrait mode
    marginTop: 2,
  },
  mainSlideContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  mainSlideContainerPortrait: {
    flex: 1, // Take remaining space in portrait
    padding: 16,
  },
  mainSlideContainerLandscape: {
    flex: 1, // Take remaining space in landscape
    padding: 20,
  },
  mainSlideImage: {
    width: "100%",
    height: "100%",
  },
  mainSlideImagePortrait: {
    width: "100%",
    height: "70%", // Adjust for portrait layout
    maxHeight: 400,
  },
  mainSlideImageLandscape: {
    width: "100%",
    height: "100%", // Full height in landscape
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  loadingText: {
    fontSize: 18,
    color: "#6b7280",
    fontWeight: "600",
  },
  noSlideContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  noSlideText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
  },
  bottomNavigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#374151",
    borderTopWidth: 1,
    borderTopColor: "#4b5563",
    minHeight: 60, // Ensure consistent height across orientations
  },
  navButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#8b5cf6",
    gap: 4,
  },
  navButtonDisabled: {
    backgroundColor: "#4b5563",
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  navButtonTextDisabled: {
    color: "#6b7280",
  },
  pageCounter: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  // Group creation modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 0,
    width: "90%",
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  modalBody: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 12,
  },
  doctorsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  doctorCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  doctorCardSelected: {
    backgroundColor: "#ede9fe",
    borderColor: "#8b5cf6",
  },
  doctorInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  doctorAvatar: {
    width: 40,
    height: 40,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    resizeMode: "cover",
  },
  doctorDetails: {
    flex: 1,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  doctorSpecialty: {
    fontSize: 12,
    color: "#8b5cf6",
    marginBottom: 2,
  },
  doctorHospital: {
    fontSize: 12,
    color: "#6b7280",
  },
  emptyDoctors: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 16,
  },
  emptyDoctorsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 8,
  },
  emptyDoctorsSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 4,
  },
  addDoctorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: 16,
    gap: 8,
  },
  addDoctorButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8b5cf6",
  },
  groupDetailsSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 8,
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
  groupNamePreview: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8b5cf6",
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  groupNameNote: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
    fontStyle: "italic",
  },
  notesInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#1f2937",
    textAlignVertical: "top",
    minHeight: 80,
  },
  modalActions: {
    flexDirection: "row",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
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
  createButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#8b5cf6",
    alignItems: "center",
  },
  createButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  loadingContainer: {
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
  },
})