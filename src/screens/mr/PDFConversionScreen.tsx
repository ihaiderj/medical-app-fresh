import React, { useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { StatusBar } from "expo-status-bar"
import { PDFConverter } from "../../utils/pdfConverter"

interface PDFConversionScreenProps {
  navigation: any
  route: any
}

export default function PDFConversionScreen({ navigation, route }: PDFConversionScreenProps) {
  const { brochureId, pdfPath } = route.params || {}
  
  const [isConverting, setIsConverting] = useState(false)
  const [conversionProgress, setConversionProgress] = useState(0)
  const [convertedSlides, setConvertedSlides] = useState<any[]>([])
  const [showPreview, setShowPreview] = useState(false)

  const handleConvertPDF = async () => {
    setIsConverting(true)
    setConversionProgress(0)
    
    try {
      // Simulate conversion progress
      const progressInterval = setInterval(() => {
        setConversionProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 200)

      // Convert PDF to slides using WebView method
      const result = await PDFConverter.convertPDFWithWebView(pdfPath || "/visualet-fervid-23-080-2025.pdf")

      clearInterval(progressInterval)
      setConversionProgress(100)

      if (result.success) {
        setConvertedSlides(result.pages)
        setShowPreview(true)
        Alert.alert(
          "Conversion Complete",
          `Successfully converted PDF to ${result.pages.length} slides!`,
          [
            { text: "Preview", onPress: () => setShowPreview(true) },
            { text: "Import", onPress: () => handleImportSlides(result.pages) }
          ]
        )
      } else {
        Alert.alert("Conversion Failed", result.error || "Unknown error occurred")
      }
    } catch (error) {
      Alert.alert("Error", "Failed to convert PDF")
    } finally {
      setIsConverting(false)
    }
  }

  const handleImportSlides = async (slides: any[]) => {
    try {
      // Import slides to brochure
      Alert.alert(
        "Import Slides",
        `Import ${slides.length} slides to this brochure?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Import",
            onPress: () => {
              // In real implementation, you would call the slide management service
              Alert.alert("Success", "Slides imported successfully!")
              navigation.goBack()
            }
          }
        ]
      )
    } catch (error) {
      Alert.alert("Error", "Failed to import slides")
    }
  }

  const handlePreviewSlide = (slide: any) => {
    Alert.alert(
      "Slide Preview",
      `Title: ${slide.title}\nGroup: ${slide.group}\nPage: ${slide.pageNumber}`,
      [{ text: "OK" }]
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
          <Text style={styles.headerTitle}>Convert PDF to Slides</Text>
          <Text style={styles.headerSubtitle}>Visualet Fervid 23-080-2025</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Conversion Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="document-text" size={24} color="#8b5cf6" />
            <Text style={styles.infoTitle}>PDF Conversion</Text>
          </View>
          <Text style={styles.infoDescription}>
            Convert your PDF brochure into individual slides for better presentation management. 
            Each page will become a separate slide that you can rename, group, and reorder.
          </Text>
        </View>

        {/* Conversion Options */}
        <View style={styles.optionsCard}>
          <Text style={styles.optionsTitle}>Conversion Options</Text>
          
          <View style={styles.optionItem}>
            <Text style={styles.optionLabel}>Format</Text>
            <Text style={styles.optionValue}>PNG (High Quality)</Text>
          </View>
          
          <View style={styles.optionItem}>
            <Text style={styles.optionLabel}>Resolution</Text>
            <Text style={styles.optionValue}>150 DPI</Text>
          </View>
          
          <View style={styles.optionItem}>
            <Text style={styles.optionLabel}>Auto Titles</Text>
            <Text style={styles.optionValue}>Enabled</Text>
          </View>
          
          <View style={styles.optionItem}>
            <Text style={styles.optionLabel}>Auto Grouping</Text>
            <Text style={styles.optionValue}>Enabled</Text>
          </View>
        </View>

        {/* Conversion Progress */}
        {isConverting && (
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Converting PDF...</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${conversionProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>{conversionProgress}% Complete</Text>
            <ActivityIndicator size="small" color="#8b5cf6" style={styles.progressSpinner} />
          </View>
        )}

        {/* Converted Slides Preview */}
        {showPreview && convertedSlides.length > 0 && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Converted Slides ({convertedSlides.length})</Text>
            {convertedSlides.map((slide, index) => (
              <TouchableOpacity
                key={slide.pageNumber}
                style={styles.slidePreview}
                onPress={() => handlePreviewSlide(slide)}
              >
                <View style={styles.slideNumber}>
                  <Text style={styles.slideNumberText}>{slide.pageNumber}</Text>
                </View>
                <View style={styles.slideInfo}>
                  <Text style={styles.slideTitle}>{slide.title}</Text>
                  <Text style={styles.slideGroup}>{slide.group}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {!isConverting && !showPreview && (
            <TouchableOpacity style={styles.convertButton} onPress={handleConvertPDF}>
              <Ionicons name="refresh" size={20} color="#ffffff" />
              <Text style={styles.convertButtonText}>Convert PDF to Slides</Text>
            </TouchableOpacity>
          )}
          
          {showPreview && (
            <>
              <TouchableOpacity 
                style={styles.importButton} 
                onPress={() => handleImportSlides(convertedSlides)}
              >
                <Ionicons name="download" size={20} color="#ffffff" />
                <Text style={styles.importButtonText}>Import Slides</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.previewButton} 
                onPress={() => setShowPreview(false)}
              >
                <Ionicons name="eye" size={20} color="#8b5cf6" />
                <Text style={styles.previewButtonText}>Hide Preview</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
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
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  infoCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginLeft: 12,
  },
  infoDescription: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  optionsCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 16,
  },
  optionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  optionLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  optionValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1f2937",
  },
  progressCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#8b5cf6",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 8,
  },
  progressSpinner: {
    alignSelf: "center",
  },
  previewCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 16,
  },
  slidePreview: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  slideNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#8b5cf6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  slideNumberText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  slideInfo: {
    flex: 1,
  },
  slideTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1f2937",
    marginBottom: 2,
  },
  slideGroup: {
    fontSize: 12,
    color: "#6b7280",
  },
  actionButtons: {
    gap: 12,
  },
  convertButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8b5cf6",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  convertButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#8b5cf6",
    gap: 8,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8b5cf6",
  },
})


