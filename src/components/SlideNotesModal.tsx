import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  StyleSheet,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BrochureSlide } from '../services/brochureManagementService'
import { OfflineFirstService } from '../services/offlineFirstService'
import { AuthService } from '../services/AuthService'

interface SlideNotesModalProps {
  visible: boolean
  slide: BrochureSlide | null
  brochureId: string
  brochureTitle: string
  onClose: () => void
  getImageSource?: (uri: string) => any
  onOpenMeetingSelection?: () => void
  selectedMeeting?: any
  onMeetingSelected?: (meeting: any) => void
}

export default function SlideNotesModal({
  visible,
  slide,
  brochureId,
  brochureTitle,
  onClose,
  getImageSource,
  onOpenMeetingSelection,
  selectedMeeting: externalSelectedMeeting,
  onMeetingSelected,
}: SlideNotesModalProps) {
  const [noteText, setNoteText] = useState('')
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(externalSelectedMeeting || null)

  // Sync external meeting selection
  useEffect(() => {
    if (externalSelectedMeeting) {
      setSelectedMeeting(externalSelectedMeeting)
    }
  }, [externalSelectedMeeting])

  const handleSaveNote = async () => {
    try {
      if (!slide || !noteText.trim()) {
        Alert.alert('Error', 'Please enter a note')
        return
      }

      if (!selectedMeeting) {
        Alert.alert('Error', 'Please select a meeting')
        return
      }

      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user || userResult.user.role !== 'mr') {
        Alert.alert('Error', 'Please log in as MR user')
        return
      }

      // Extract meeting ID carefully - handle both object and string
      let meetingId: string
      if (typeof selectedMeeting === 'string') {
        meetingId = selectedMeeting
      } else if (typeof selectedMeeting === 'object') {
        meetingId = selectedMeeting.id || selectedMeeting.meeting_id
      } else {
        console.error('SlideNotesModal: Invalid selectedMeeting type:', typeof selectedMeeting)
        Alert.alert('Error', 'Invalid meeting selection')
        return
      }

      console.log('SlideNotesModal: Saving note for meeting ID:', meetingId)
      console.log('SlideNotesModal: Meeting ID type:', typeof meetingId)

      // Use offline-first meeting note creation
      const noteResult = await OfflineFirstService.createMeetingNote({
        meeting_id: meetingId,
        slide_id: slide.id,
        slide_title: slide.title,
        slide_order: slide.order,
        note_text: noteText.trim(),
        slide_image_uri: slide.imageUri,
      })

      console.log('SlideNotesModal: Note creation result:', noteResult)

      if (noteResult.success) {
        Alert.alert('Success', 'Note saved successfully!')
        setNoteText('')
        setSelectedMeeting(null)
        onClose()
      } else {
        Alert.alert('Error', noteResult.error || 'Failed to save note')
      }
    } catch (error) {
      console.error('SlideNotesModal: Error saving note:', error)
      Alert.alert('Error', 'Failed to save note')
    }
  }

  const handleClose = () => {
    setNoteText('')
    setSelectedMeeting(null)
    onClose()
  }

  const getImageSourceInternal = (uri: string) => {
    if (getImageSource) {
      return getImageSource(uri)
    }
    return { uri }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Slide Note</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="#1f2937" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {slide && (
              <View style={styles.slideInfoSection}>
                <Text style={styles.inputLabel}>Slide Information</Text>
                <View style={styles.slideInfoCard}>
                  <View style={styles.slideInfoContent}>
                    <Image
                      source={getImageSourceInternal(slide.imageUri)}
                      style={styles.slideInfoThumbnail}
                      resizeMode="cover"
                    />
                    <View style={styles.slideInfoDetails}>
                      <Text style={styles.slideInfoTitle}>
                        #{slide.order} - {slide.title}
                      </Text>
                      <Text style={styles.slideInfoBrochure}>From: {brochureTitle}</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Note</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Enter your note about this slide..."
                multiline
                numberOfLines={4}
                value={noteText}
                onChangeText={setNoteText}
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Meeting</Text>

              <TouchableOpacity
                style={styles.selectionButton}
                onPress={() => {
                  if (onOpenMeetingSelection) {
                    onOpenMeetingSelection()
                  }
                }}
              >
                <View style={styles.selectionButtonContent}>
                  <Ionicons name="calendar" size={20} color="#8b5cf6" />
                  <View style={styles.selectionButtonText}>
                    {selectedMeeting ? (
                      <>
                        <Text style={styles.selectedItemTitle}>
                          {selectedMeeting.title || 'Meeting'}
                        </Text>
                        <Text style={styles.selectedItemSubtitle}>
                          {selectedMeeting.scheduled_date ? (
                            <>
                              {new Date(selectedMeeting.scheduled_date).toLocaleDateString()}
                              {selectedMeeting.time && ` ${selectedMeeting.time}`}
                              {selectedMeeting.purpose && ` - ${selectedMeeting.purpose}`}
                            </>
                          ) : (
                            'Date not set'
                          )}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.placeholderText}>Select a meeting</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveNote}>
              <Text style={styles.saveButtonText}>Save Note</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  inputGroup: {
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  slideInfoSection: {
    marginBottom: 16,
  },
  slideInfoCard: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  slideInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slideInfoThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  slideInfoDetails: {
    flex: 1,
  },
  slideInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  slideInfoBrochure: {
    fontSize: 12,
    color: '#6b7280',
  },
  selectionButton: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginTop: 8,
  },
  selectionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionButtonText: {
    flex: 1,
    marginLeft: 12,
  },
  selectedItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  selectedItemSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  placeholderText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  meetingSelectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meetingSelectionCardSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f3f4f6',
  },
  meetingInfo: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  meetingDate: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 2,
  },
  meetingDoctor: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
  },
})

