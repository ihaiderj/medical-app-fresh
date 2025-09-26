import React, { useState, useEffect } from "react"
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
} from "react-native"
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

  // Lock orientation to landscape for better PDF viewing
  useEffect(() => {
    console.log("BrochureViewer mounted with:", { brochureId, brochureTitle, brochureFile })
    
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
    
    // Load converted PDF images
    loadConvertedPresentation()
    
    // Cleanup: unlock orientation when component unmounts
    return () => {
      ScreenOrientation.unlockAsync()
    }
  }, [])

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

  const handleSlideSelect = (index: number) => {
    setSelectedSlideIndex(index)
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
            {slides.length > 0 ? `Page ${selectedSlideIndex + 1} of ${slides.length}` : "Loading..."}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.fullscreenButton}
          onPress={async () => {
            try {
              const currentOrientation = await ScreenOrientation.getOrientationAsync()
              if (currentOrientation === ScreenOrientation.Orientation.PORTRAIT_UP) {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
              } else {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT)
              }
            } catch (error) {
              console.log("Orientation change error:", error)
            }
          }}
        >
          <Ionicons name="expand" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.contentContainer}>
        {/* Slide List (Left Side) */}
        <View style={styles.slideListContainer}>
          <ScrollView style={styles.slideList} showsVerticalScrollIndicator={false}>
            {slides.map((slide, index) => (
              <TouchableOpacity
                key={slide.id}
                style={[
                  styles.slideListItem,
                  index === selectedSlideIndex && styles.slideListItemActive
                ]}
                onPress={() => handleSlideSelect(index)}
              >
                <Image 
                  source={getImageSource(slide.image)} 
                  style={styles.slideListThumbnail}
                  resizeMode="cover"
                />
                <Text style={styles.slideListNumber}>{slide.pageNumber}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Main Slide Display (Right Side) */}
        <View style={styles.mainSlideContainer}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Loading PDF Images...</Text>
            </View>
          ) : currentSlide ? (
            <Image 
              source={getImageSource(currentSlide.image)} 
              style={styles.mainSlideImage}
              resizeMode="contain"
              onError={(error) => console.log('Image load error:', error)}
              onLoad={() => console.log('Image loaded successfully')}
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
    flexDirection: "row",
  },
  slideListContainer: {
    width: "15%",
    backgroundColor: "#374151",
    borderRightWidth: 1,
    borderRightColor: "#4b5563",
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
  slideListItemActive: {
    backgroundColor: "#8b5cf6",
  },
  slideListThumbnail: {
    width: 50,
    height: 35,
    borderRadius: 4,
    backgroundColor: "#6b7280",
  },
  slideListNumber: {
    fontSize: 12,
    color: "#ffffff",
    marginTop: 4,
    fontWeight: "600",
  },
  mainSlideContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  mainSlideImage: {
    width: "100%",
    height: "100%",
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
})