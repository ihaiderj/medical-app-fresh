/**
 * Meeting Details Modal
 * Shows complete meeting information with all slide notes
 */
import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { MRService, MeetingDetails, SlideNote } from '../services/MRService'

interface MeetingDetailsModalProps {
  visible: boolean
  meetingId: string | null
  onClose: () => void
}

export default function MeetingDetailsModal({
  visible,
  meetingId,
  onClose
}: MeetingDetailsModalProps) {
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (visible && meetingId) {
      loadMeetingDetails()
    }
  }, [visible, meetingId])

  const loadMeetingDetails = async () => {
    if (!meetingId) return

    try {
      setIsLoading(true)
      const result = await MRService.getMeetingDetails(meetingId)
      
      if (result.success && result.data) {
        setMeetingDetails(result.data)
      }
    } catch (error) {
      console.error('Error loading meeting details:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateString
    }
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Meeting Details</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Loading meeting details...</Text>
            </View>
          ) : meetingDetails ? (
            <ScrollView style={styles.content}>
              {/* Meeting Information */}
              <View style={styles.meetingInfoSection}>
                <Text style={styles.sectionTitle}>Meeting Information</Text>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Ionicons name="person" size={16} color="#8b5cf6" />
                    <Text style={styles.infoLabel}>Doctor:</Text>
                    <Text style={styles.infoValue}>
                      {meetingDetails.meeting.doctor_name} ({meetingDetails.meeting.doctor_specialty})
                    </Text>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Ionicons name="business" size={16} color="#8b5cf6" />
                    <Text style={styles.infoLabel}>Hospital:</Text>
                    <Text style={styles.infoValue}>{meetingDetails.meeting.hospital}</Text>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Ionicons name="calendar" size={16} color="#8b5cf6" />
                    <Text style={styles.infoLabel}>Date:</Text>
                    <Text style={styles.infoValue}>
                      {formatDate(meetingDetails.meeting.scheduled_date)}
                    </Text>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Ionicons name="time" size={16} color="#8b5cf6" />
                    <Text style={styles.infoLabel}>Duration:</Text>
                    <Text style={styles.infoValue}>{meetingDetails.meeting.duration_minutes} minutes</Text>
                  </View>
                  
                  {meetingDetails.meeting.brochure_info?.brochure_title && (
                    <View style={styles.infoRow}>
                      <Ionicons name="document-text" size={16} color="#8b5cf6" />
                      <Text style={styles.infoLabel}>Brochure:</Text>
                      <Text style={styles.infoValue}>{meetingDetails.meeting.brochure_info.brochure_title}</Text>
                    </View>
                  )}
                  
                  {meetingDetails.meeting.purpose && (
                    <View style={styles.infoRow}>
                      <Ionicons name="clipboard" size={16} color="#8b5cf6" />
                      <Text style={styles.infoLabel}>Purpose:</Text>
                      <Text style={styles.infoValue}>{meetingDetails.meeting.purpose}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Slide Notes */}
              <View style={styles.slideNotesSection}>
                <Text style={styles.sectionTitle}>
                  Slide Notes ({meetingDetails.slide_notes.length})
                </Text>
                
                {meetingDetails.slide_notes.length > 0 ? (
                  meetingDetails.slide_notes
                    .sort((a, b) => a.slide_order - b.slide_order)
                    .map((note) => (
                      <View key={note.note_id} style={styles.noteCard}>
                        <View style={styles.noteHeader}>
                          <View style={styles.slideInfo}>
                            <Text style={styles.slideNumber}>#{note.slide_order}</Text>
                            <Text style={styles.slideTitle}>{note.slide_title}</Text>
                          </View>
                          <Text style={styles.noteDate}>
                            {new Date(note.created_at).toLocaleDateString()}
                          </Text>
                        </View>
                        <Text style={styles.noteText}>{note.note_text}</Text>
                      </View>
                    ))
                ) : (
                  <View style={styles.emptyNotes}>
                    <Ionicons name="document-outline" size={32} color="#9ca3af" />
                    <Text style={styles.emptyNotesText}>No slide notes for this meeting</Text>
                    <Text style={styles.emptyNotesSubtext}>
                      Add notes while viewing brochure slides
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={32} color="#ef4444" />
              <Text style={styles.errorText}>Failed to load meeting details</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    margin: 20,
    maxWidth: 500,
    width: '95%',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  meetingInfoSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    minWidth: 80,
  },
  infoValue: {
    fontSize: 13,
    color: '#1f2937',
    flex: 1,
  },
  slideNotesSection: {
    marginBottom: 20,
  },
  noteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  slideInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  slideNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8b5cf6',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  slideTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  noteDate: {
    fontSize: 11,
    color: '#9ca3af',
  },
  noteText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  emptyNotes: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emptyNotesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyNotesSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginTop: 12,
  },
})

