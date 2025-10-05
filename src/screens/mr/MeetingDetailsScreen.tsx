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
  SafeAreaView,
  TextInput
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
  slide_image_uri?: string
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
  const [showAddNoteModal, setShowAddNoteModal] = useState(false)
  const [showEditNoteModal, setShowEditNoteModal] = useState(false)
  const [editingNote, setEditingNote] = useState<SlideNote | null>(null)
  const [newNoteText, setNewNoteText] = useState('')
  const [showFullImageModal, setShowFullImageModal] = useState(false)
  const [fullImageSlide, setFullImageSlide] = useState<SlideNote | null>(null)

  useEffect(() => {
    loadMeetingDetails()
  }, [meetingId])

  const loadMeetingDetails = async () => {
    try {
      setIsLoading(true)
      console.log('=== LOADING MEETING DETAILS ===')
      console.log('Meeting ID:', meetingId)
      
      const result = await MRService.getMeetingDetails(meetingId)
      
      console.log('Meeting details result:', result)
      
      if (result.success && result.data) {
        console.log('Meeting data:', result.data.meeting)
        console.log('Slide notes count:', result.data.slide_notes?.length || 0)
        console.log('Slide notes:', result.data.slide_notes)
        
        setMeetingDetails(result.data.meeting)
        setSlideNotes(result.data.slide_notes || [])
      } else {
        console.error('Failed to load meeting details:', result.error)
        Alert.alert('Error', result.error || 'Failed to load meeting details')
      }
    } catch (error) {
      console.error('Exception in loadMeetingDetails:', error)
      Alert.alert('Error', 'Failed to load meeting details')
    } finally {
      setIsLoading(false)
    }
  }

  const openSlideModal = (slideNote: SlideNote) => {
    setSelectedSlide(slideNote)
    setShowSlideModal(true)
  }

  const openFullImageModal = (slideNote: SlideNote) => {
    setFullImageSlide(slideNote)
    setShowFullImageModal(true)
  }

  const handleEditNote = (slideNote: SlideNote) => {
    setEditingNote(slideNote)
    setNewNoteText(slideNote.note_text)
    setShowEditNoteModal(true)
  }

  const handleDeleteNote = (slideNote: SlideNote) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this slide note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // TODO: Implement delete note API call
            Alert.alert('Success', 'Note deleted successfully')
            loadMeetingDetails()
          }
        }
      ]
    )
  }

  const handleSaveEditNote = async () => {
    // TODO: Implement update note API call
    Alert.alert('Success', 'Note updated successfully')
    setShowEditNoteModal(false)
    loadMeetingDetails()
  }

  const handleAddNote = async () => {
    // TODO: Implement add note API call
    Alert.alert('Success', 'Note added successfully')
    setShowAddNoteModal(false)
    setNewNoteText('')
    loadMeetingDetails()
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
            <View style={styles.cardHeaderLeft}>
              <Ionicons name="document-text" size={24} color="#8b5cf6" />
              <Text style={styles.cardTitle}>Slide Notes ({slideNotes.length})</Text>
            </View>
            <TouchableOpacity
              style={styles.addNoteButton}
              onPress={() => setShowAddNoteModal(true)}
            >
              <Ionicons name="add" size={20} color="#ffffff" />
              <Text style={styles.addNoteButtonText}>Add Note</Text>
            </TouchableOpacity>
          </View>
          
          {slideNotes.length > 0 ? (
            slideNotes
              .sort((a, b) => a.slide_order - b.slide_order)
              .map((slideNote) => (
                <View
                  key={slideNote.note_id}
                  style={styles.slideNoteCard}
                >
                  <TouchableOpacity
                    style={styles.slideNoteContent}
                    onPress={() => openFullImageModal(slideNote)}
                  >
                    {/* Slide Thumbnail */}
                    <View style={styles.slideThumbnailContainer}>
                      {slideNote.slide_image_uri ? (
                        <Image
                          source={{ uri: slideNote.slide_image_uri }}
                          style={styles.slideThumbnail}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.slideThumbnailPlaceholder}>
                          <Ionicons name="image" size={24} color="#8b5cf6" />
                          <Text style={styles.slideOrderBadge}>#{slideNote.slide_order}</Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.slideNoteInfo}>
                      <Text style={styles.slideTitle}>
                        {slideNote.slide_title}
                      </Text>
                      <Text style={styles.slideTimestamp}>
                        {formatDate(slideNote.created_at)}
                      </Text>
                      <Text style={styles.slideNotePreview} numberOfLines={2}>
                        {slideNote.note_text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  
                  <View style={styles.noteActions}>
                    <TouchableOpacity
                      style={styles.noteActionButton}
                      onPress={() => handleEditNote(slideNote)}
                    >
                      <Ionicons name="create-outline" size={18} color="#6b7280" />
                      <Text style={styles.noteActionText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.noteActionButton}
                      onPress={() => handleDeleteNote(slideNote)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      <Text style={[styles.noteActionText, {color: '#ef4444'}]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyStateText}>No slide notes found</Text>
              <Text style={styles.emptyStateSubtext}>
                Click "Add Note" to add notes to this meeting
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

      {/* Full Image Modal */}
      <Modal
        visible={showFullImageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFullImageModal(false)}
      >
        <View style={styles.fullImageOverlay}>
          <TouchableOpacity
            style={styles.closeFullImageButton}
            onPress={() => setShowFullImageModal(false)}
          >
            <Ionicons name="close" size={32} color="#ffffff" />
          </TouchableOpacity>
          
          {fullImageSlide && (
            <View style={styles.fullImageContainer}>
              {/* Full Slide Image */}
              {fullImageSlide.slide_image_uri ? (
                <Image
                  source={{ uri: fullImageSlide.slide_image_uri }}
                  style={styles.fullSlideImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.fullImagePlaceholder}>
                  <Ionicons name="image" size={64} color="#8b5cf6" />
                  <Text style={styles.fullImageText}>
                    Slide #{fullImageSlide.slide_order}
                  </Text>
                  <Text style={styles.fullImageTitle}>
                    {fullImageSlide.slide_title}
                  </Text>
                </View>
              )}
              
              <View style={styles.fullImageNoteContainer}>
                <Text style={styles.fullImageNoteLabel}>Note:</Text>
                <Text style={styles.fullImageNoteText}>{fullImageSlide.note_text}</Text>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Edit Note Modal */}
      <Modal
        visible={showEditNoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditNoteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Slide Note</Text>
              <TouchableOpacity onPress={() => setShowEditNoteModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            {editingNote && (
              <View style={styles.modalBody}>
                <View style={styles.slideDetailInfo}>
                  <Text style={styles.slideDetailTitle}>
                    #{editingNote.slide_order} - {editingNote.slide_title}
                  </Text>
                </View>
                
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Note:</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    placeholder="Enter your note..."
                    placeholderTextColor="#9ca3af"
                    value={newNoteText}
                    onChangeText={setNewNoteText}
                    multiline
                    numberOfLines={6}
                  />
                </View>
                
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setShowEditNoteModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveEditNote}
                  >
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Note Modal */}
      <Modal
        visible={showAddNoteModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddNoteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Slide Note</Text>
              <TouchableOpacity onPress={() => setShowAddNoteModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Slide Number:</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter slide number"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Note:</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter your note..."
                  placeholderTextColor="#9ca3af"
                  value={newNoteText}
                  onChangeText={setNewNoteText}
                  multiline
                  numberOfLines={6}
                />
              </View>
              
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddNoteModal(false)
                    setNewNoteText('')
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleAddNote}
                >
                  <Text style={styles.saveButtonText}>Add Note</Text>
                </TouchableOpacity>
              </View>
            </View>
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
    paddingTop: 20, // Add padding to prevent status bar overlap
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
    paddingVertical: 20,
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
  // New styles for Phase 2
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  addNoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addNoteButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  slideNoteContent: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  slideThumbnailContainer: {
    marginRight: 12,
  },
  slideThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  slideThumbnailPlaceholder: {
    width: 80,
    height: 60,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  slideOrderBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8b5cf6',
    marginTop: 4,
  },
  slideNoteInfo: {
    flex: 1,
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  noteActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f9fafb',
  },
  noteActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginLeft: 4,
  },
  fullImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFullImageButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  fullImageContainer: {
    width: '90%',
    maxHeight: '80%',
  },
  fullSlideImage: {
    width: '100%',
    height: 400,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 20,
  },
  fullImagePlaceholder: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    marginBottom: 20,
  },
  fullImageText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  fullImageTitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  fullImageNoteContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  fullImageNoteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  fullImageNoteText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#374151',
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
})

export default MeetingDetailsScreen
