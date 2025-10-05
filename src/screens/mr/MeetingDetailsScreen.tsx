import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  ActivityIndicator,
  SafeAreaView
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { MRService } from '../../services/MRService'

interface MeetingDetails {
  meeting_id: string
  title: string
  doctor_name: string
  doctor_specialty: string
  hospital: string
  scheduled_date: string
  duration_minutes: number
  status: string
  purpose: string
  brochure_info: {
    brochure_id: string
    brochure_title: string
  }
  created_at: string
  updated_at: string
}

interface SlideNote {
  note_id: string
  slide_id: string
  slide_title: string
  slide_order: number
  note_text: string
  created_at: string
  updated_at: string
}

const MeetingDetailsScreen = () => {
  const navigation = useNavigation()
  const route = useRoute()
  const { meetingId } = route.params as { meetingId: string }

  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null)
  const [slideNotes, setSlideNotes] = useState<SlideNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSlide, setSelectedSlide] = useState<SlideNote | null>(null)
  const [showSlideModal, setShowSlideModal] = useState(false)

  useEffect(() => {
    loadMeetingDetails()
  }, [meetingId])

  const loadMeetingDetails = async () => {
    try {
      setIsLoading(true)
      const result = await MRService.getMeetingDetails(meetingId)
      
      if (result.success && result.data) {
        setMeetingDetails(result.data.meeting)
        setSlideNotes(result.data.slide_notes || [])
      } else {
        Alert.alert('Error', result.error || 'Failed to load meeting details')
      }
    } catch (error) {
      console.error('Error loading meeting details:', error)
      Alert.alert('Error', 'Failed to load meeting details')
    } finally {
      setIsLoading(false)
    }
  }

  const openSlideModal = (slideNote: SlideNote) => {
    setSelectedSlide(slideNote)
    setShowSlideModal(true)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading meeting details...</Text>
      </View>
    )
  }

  if (!meetingDetails) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorText}>Meeting not found</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backIconButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meeting Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollContainer}>
        {/* Meeting Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={24} color="#8b5cf6" />
            <Text style={styles.cardTitle}>Meeting Information</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Title:</Text>
            <Text style={styles.infoValue}>{meetingDetails.title}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Doctor:</Text>
            <Text style={styles.infoValue}>{meetingDetails.doctor_name}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Specialty:</Text>
            <Text style={styles.infoValue}>{meetingDetails.doctor_specialty}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hospital:</Text>
            <Text style={styles.infoValue}>{meetingDetails.hospital}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Scheduled:</Text>
            <Text style={styles.infoValue}>{formatDate(meetingDetails.scheduled_date)}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Duration:</Text>
            <Text style={styles.infoValue}>{meetingDetails.duration_minutes} minutes</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Purpose:</Text>
            <Text style={styles.infoValue}>{meetingDetails.purpose}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Brochure:</Text>
            <Text style={styles.infoValue}>{meetingDetails.brochure_info.brochure_title}</Text>
          </View>
        </View>

        {/* Slide Notes */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text" size={24} color="#8b5cf6" />
            <Text style={styles.cardTitle}>Slide Notes ({slideNotes.length})</Text>
          </View>
          
          {slideNotes.length > 0 ? (
            slideNotes
              .sort((a, b) => a.slide_order - b.slide_order)
              .map((slideNote) => (
                <TouchableOpacity
                  key={slideNote.note_id}
                  style={styles.slideNoteCard}
                  onPress={() => openSlideModal(slideNote)}
                >
                  <View style={styles.slideNoteHeader}>
                    <View style={styles.slideInfo}>
                      <Text style={styles.slideTitle}>
                        #{slideNote.slide_order} - {slideNote.slide_title}
                      </Text>
                      <Text style={styles.slideTimestamp}>
                        {formatDate(slideNote.created_at)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                  </View>
                  <Text style={styles.slideNotePreview} numberOfLines={2}>
                    {slideNote.note_text}
                  </Text>
                </TouchableOpacity>
              ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>No slide notes found</Text>
              <Text style={styles.emptyStateSubtext}>
                Notes will appear here when added during presentations
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Slide Detail Modal */}
      <Modal
        visible={showSlideModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSlideModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Slide Note</Text>
              <TouchableOpacity onPress={() => setShowSlideModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            {selectedSlide && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.slideDetailInfo}>
                  <Text style={styles.slideDetailTitle}>
                    #{selectedSlide.slide_order} - {selectedSlide.slide_title}
                  </Text>
                  <Text style={styles.slideDetailTimestamp}>
                    {formatDate(selectedSlide.created_at)}
                  </Text>
                </View>
                
                <View style={styles.noteTextContainer}>
                  <Text style={styles.noteLabel}>Note:</Text>
                  <Text style={styles.noteText}>{selectedSlide.note_text}</Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
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
    fontSize: 18,
    color: '#ef4444',
    marginTop: 16,
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backIconButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  placeholder: {
    width: 40,
  },
  scrollContainer: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
    width: 100,
  },
  infoValue: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  slideNoteCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  slideNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  slideInfo: {
    flex: 1,
  },
  slideTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  slideTimestamp: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  slideNotePreview: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    padding: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  modalBody: {
    padding: 16,
  },
  slideDetailInfo: {
    marginBottom: 16,
  },
  slideDetailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  slideDetailTimestamp: {
    fontSize: 14,
    color: '#6b7280',
  },
  noteTextContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
})

export default MeetingDetailsScreen
