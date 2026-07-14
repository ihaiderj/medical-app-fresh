import React, { useState, useEffect } from "react"
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { UnifiedDataService } from "../../services/UnifiedDataService"
import { useGlobalForms } from "../../context/GlobalFormContext"
import { OfflineFirstService } from "../../services/offlineFirstService"
import { AuthService } from "../../services/AuthService"
import { useModalQueue } from "../../hooks/useModalQueue"
import { useAppData, useDoctorSync } from "../../context/AppDataContext"
import BottomSheetDatePicker from "../../components/BottomSheetDatePicker"
import { useBottomSheetDatePicker } from "../../hooks/useBottomSheetDatePicker"
import { getModalWidth, getModalMaxHeight, getModalPadding, getModalBorderRadius, isTablet } from "../../utils/responsive"

interface MeetingsScreenProps {
  navigation: any
  route?: any
}

export default function MeetingsScreen({ navigation, route }: MeetingsScreenProps) {
  const { doctorId } = route?.params || {}
  const { showMeetingForm, showDoctorForm } = useGlobalForms();

  // Modal queue for iOS-safe modal transitions
  const modalQueue = useModalQueue()
  
  // Global state management
  const { notifyDoctorChange, notifyMeetingChange, user, onMeetingChange, onDoctorChange } = useAppData()

  // Bottom sheet date picker
  const datePicker = useBottomSheetDatePicker()

  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState("All")
  const [doctorRefreshTrigger, setDoctorRefreshTrigger] = useState(0)

  // Subscribe to global doctor changes for cross-screen updates
  // useDoctorSync(() => {
  //   console.log('MeetingsScreen: Received doctor change notification, triggering refresh...')
  //   setDoctorRefreshTrigger(prev => prev + 1)
  // })
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null)
  const [followUpRequired, setFollowUpRequired] = useState(false)
  const [followUpDate, setFollowUpDate] = useState("")
  const [followUpTime, setFollowUpTime] = useState("")
  const [followUpNotes, setFollowUpNotes] = useState("")
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [showDoctorSelectionModal, setShowDoctorSelectionModal] = useState(false)
  
  // Date/Time picker states
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTime, setSelectedTime] = useState(new Date())
  const [datePickerMode, setDatePickerMode] = useState<'edit' | 'followup'>('edit')
  const [meetingForm, setMeetingForm] = useState({
    doctor_id: '',
    scheduled_date: '',
    duration_minutes: 30,
    purpose: '',
    notes: '',
  })
  const [meetings, setMeetings] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [availableDoctors, setAvailableDoctors] = useState<any[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  
  const getDoctorIdentifier = (doctor: any): string => {
    if (!doctor) {
      return ''
    }
    return doctor.id || doctor.doctor_id || doctor.server_id || ''
  }

  const findDoctorById = (doctorId?: string | null) => {
    if (!doctorId) {
      return undefined
    }
    return availableDoctors.find((doctor) => {
      const identifiers = [
        getDoctorIdentifier(doctor),
        doctor.id,
        doctor.server_id,
        doctor.doctor_id,
      ].filter(Boolean)
      return identifiers.includes(doctorId)
    })
  }

  // Doctor form state for inline creation
  
  // Initialize meetings as empty array to prevent map errors
  React.useEffect(() => {
    if (!meetings) {
      setMeetings([])
    }
  }, [])

  const filters = ["All", "This Week", "This Month", "Follow-up Required", "Completed"]

  // Load meetings and doctors on component mount
  useEffect(() => {
    const initializeScreen = async () => {
      // Clean up duplicates first
      if (user?.id) {
        try {
          // TODO: Implement cleanup in SyncService or DataCleanupService
          // const { ComprehensiveServerSyncService } = await import('../../services/comprehensiveServerSyncService'); // DELETED
          // await ComprehensiveServerSyncService.cleanupDuplicateMeetings(user.id);
          console.warn('MeetingsScreen: Cleanup duplicate meetings not yet implemented');
        } catch (error) {
          console.warn('MeetingsScreen: Error cleaning up duplicate meetings:', error);
        }
      }
      // Then load meetings and doctors
      loadMeetings();
      loadAvailableDoctors();
    };
    initializeScreen();
  }, [])

  // Subscribe to meeting changes to refresh list
  useEffect(() => {
    const unsubscribe = onMeetingChange(() => {
      console.log('MeetingsScreen: Received meeting change notification, refreshing meetings...');
      loadMeetings();
    });
    return unsubscribe;
  }, [onMeetingChange])

  // Subscribe to doctor changes to refresh availableDoctors
  // This ensures newly created doctors are immediately available for lookup
  useEffect(() => {
    console.log('🟢 DOCTOR_REFRESH: MeetingsScreen subscribing to doctor changes');
    const unsubscribe = onDoctorChange(() => {
      console.log('🟢 DOCTOR_REFRESH: MeetingsScreen received doctor change notification, refreshing available doctors...');
      loadAvailableDoctors().then(() => {
        // After doctors are refreshed, reload meetings to update doctor names
        loadMeetings();
      });
    });
    return () => {
      console.log('🟢 DOCTOR_REFRESH: MeetingsScreen unsubscribing from doctor changes');
      unsubscribe();
    };
  }, [onDoctorChange])

  // Reload doctors when refresh is triggered from doctor changes
  useEffect(() => {
    if (doctorRefreshTrigger > 0) {
      loadAvailableDoctors()
    }
  }, [doctorRefreshTrigger])

  const loadAvailableDoctors = async (): Promise<any[]> => {
    try {
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success && userResult.user) {
        // Use OfflineFirstService to get doctors from local database
        // This ensures consistency with My Doctors screen
        const doctorsResult = await OfflineFirstService.getDoctors(userResult.user.id)
        if (doctorsResult.success && doctorsResult.data) {
          const unique = new Map<string, any>()

          doctorsResult.data.forEach(rawDoctor => {
            const normalizedId = getDoctorIdentifier(rawDoctor)
            if (!normalizedId) {
              return
            }

            const keyBase = rawDoctor.server_id
              || `${(rawDoctor.first_name || '').trim().toLowerCase()}|${(rawDoctor.last_name || '').trim().toLowerCase()}|${rawDoctor.email || ''}|${rawDoctor.phone || ''}`
            const key = keyBase || normalizedId
            const existing = unique.get(key)

            if (!existing) {
              unique.set(key, { ...rawDoctor, id: normalizedId })
            } else {
              const existingUpdated = existing.updated_at ? Date.parse(existing.updated_at) : 0
              const incomingUpdated = rawDoctor.updated_at ? Date.parse(rawDoctor.updated_at) : 0
              const preferred = incomingUpdated >= existingUpdated ? rawDoctor : existing
              const fallback = preferred === rawDoctor ? existing : rawDoctor

              unique.set(key, {
                ...fallback,
                ...preferred,
                id: normalizedId,
                server_id: preferred.server_id || fallback.server_id,
                profile_image_url: preferred.profile_image_url || fallback.profile_image_url,
                sync_status: preferred.sync_status === 'pending' || fallback.sync_status === 'pending'
                  ? 'pending'
                  : preferred.sync_status,
              })
            }
          })

          const sorted = Array.from(unique.values()).sort((a, b) => {
            const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase()
            const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase()
            return nameA.localeCompare(nameB)
          })

          setAvailableDoctors(sorted)
          return sorted
        }
      }
      return []
    } catch (error) {
      console.error('Error loading doctors:', error)
      setAvailableDoctors([])
      return []
    }
  }

  // Helper function to get doctor details for a meeting
  const getDoctorForMeeting = (meeting: any) => {
    if (!meeting) return null
    
    // For local meetings, find doctor by doctor_id
    if (meeting.doctor_id && availableDoctors.length > 0) {
      const doctor = findDoctorById(meeting.doctor_id)
      if (doctor) {
        return doctor
      }
    }
    
    return null
  }

  // Helper function to get doctor display name
  const getDoctorName = (meeting: any) => {
    if (!meeting) return 'Unknown Doctor'
    
    const doctor = getDoctorForMeeting(meeting)
    if (doctor) {
      return `${doctor.first_name} ${doctor.last_name}`
    }
    return meeting.doctor_name || `${meeting.doctor_first_name || ''} ${meeting.doctor_last_name || ''}`.trim() || 'Unknown Doctor'
  }

  // Helper function to get doctor details
  const getDoctorDetails = (meeting: any) => {
    if (!meeting) return 'N/A • N/A'
    
    const doctor = getDoctorForMeeting(meeting)
    if (doctor) {
      return `${doctor.specialty || 'N/A'} • ${doctor.hospital || 'N/A'}`
    }
    return `${meeting.doctor_specialty || 'N/A'} • ${meeting.hospital || 'N/A'}`
  }

  const loadMeetings = async () => {
    setIsLoading(true)
    try {
      // Ensure doctors are loaded first (needed for deduplication)
      if (availableDoctors.length === 0) {
        await loadAvailableDoctors();
      }
      
      // Load meetings from local database using UnifiedDataService
      const userId = user?.id;
      const result = await UnifiedDataService.getMeetings(userId)
      
      if (result.success && result.data) {
        // Additional deduplication by doctor_id + scheduled_date + title
        // This ensures we don't show duplicates even if dedupeMeetings missed some
        const dedupedMeetings: any[] = [];
        
        // First pass: collect all meetings and group by key
        // Improved deduplication: group by server_id OR by (title + scheduled_date) regardless of doctor_id
        const meetingsByKey = new Map<string, any[]>();
        const meetingsByTitleDate = new Map<string, any[]>();
        
        result.data.forEach(meeting => {
          if (!meeting.is_deleted) {
            // Primary key: server_id if available
            if (meeting.server_id) {
              const key = `server_${meeting.server_id}`;
              if (!meetingsByKey.has(key)) {
                meetingsByKey.set(key, []);
              }
              meetingsByKey.get(key)!.push(meeting);
            } else {
              // For local meetings, also group by title + date (to catch duplicates with different doctor_id)
              const titleDateKey = `local_title_date_${meeting.title}_${meeting.scheduled_date}`;
              if (!meetingsByTitleDate.has(titleDateKey)) {
                meetingsByTitleDate.set(titleDateKey, []);
              }
              meetingsByTitleDate.get(titleDateKey)!.push(meeting);
              
              // Also group by doctor_id + date + title (original logic)
              const doctorKey = `local_${meeting.doctor_id}_${meeting.scheduled_date}_${meeting.title}`;
              if (!meetingsByKey.has(doctorKey)) {
                meetingsByKey.set(doctorKey, []);
              }
              meetingsByKey.get(doctorKey)!.push(meeting);
            }
          }
        });
        
        // Second pass: process meetings grouped by server_id or doctor_id
        const processedMeetingIds = new Set<string>();
        
        meetingsByKey.forEach((meetings, key) => {
          if (meetings.length === 1) {
            const meeting = meetings[0];
            // Check if this meeting is a duplicate of another by title+date
            const titleDateKey = `local_title_date_${meeting.title}_${meeting.scheduled_date}`;
            const titleDateGroup = meetingsByTitleDate.get(titleDateKey);
            
            if (titleDateGroup && titleDateGroup.length > 1 && !meeting.server_id) {
              // Multiple meetings with same title+date - keep the one with valid doctor_id
              const validDoctorMeeting = titleDateGroup.find(m => {
                const doctor = getDoctorForMeeting(m);
                return doctor !== null;
              });
              
              if (validDoctorMeeting && validDoctorMeeting.id !== meeting.id) {
                // This meeting has invalid doctor, skip it
                console.log(`🔴 MEETING_DEDUP: Skipping duplicate meeting "${meeting.title}" with invalid doctor_id: ${meeting.id}`);
                return;
              }
            }
            
            processedMeetingIds.add(meeting.id);
            dedupedMeetings.push(meeting);
          } else {
            // Multiple meetings with same key - keep the best one
            // Priority: valid doctor_id > server_id > most recent updated_at
            const bestMeeting = meetings.reduce((best, current) => {
              const bestDoctor = getDoctorForMeeting(best);
              const currentDoctor = getDoctorForMeeting(current);
              
              // Prefer meeting with valid doctor
              if (currentDoctor && !bestDoctor) return current;
              if (!currentDoctor && bestDoctor) return best;
              
              // If both have valid doctors or both invalid, prefer server_id
              if (current.server_id && !best.server_id) return current;
              if (!current.server_id && best.server_id) return best;
              
              // Finally, prefer most recent
              const bestDate = best.updated_at ? new Date(best.updated_at).getTime() : 0;
              const currentDate = current.updated_at ? new Date(current.updated_at).getTime() : 0;
              return currentDate > bestDate ? current : best;
            });
            
            processedMeetingIds.add(bestMeeting.id);
            dedupedMeetings.push(bestMeeting);
            console.log(`🔴 MEETING_DEDUP: Found ${meetings.length} duplicate meetings for key "${key}", keeping best: ${bestMeeting.title || bestMeeting.id}`);
          }
        });
        
        // Third pass: filter out orphaned meetings (meetings with invalid doctor_id)
        const finalMeetings = dedupedMeetings.filter(meeting => {
          // If meeting has no server_id and doctor_id doesn't match any available doctor, it's orphaned
          if (!meeting.server_id && meeting.doctor_id) {
            const doctor = getDoctorForMeeting(meeting);
            if (!doctor) {
              console.log(`🔴 MEETING_DEDUP: Filtering out orphaned meeting "${meeting.title}" with invalid doctor_id: ${meeting.doctor_id}`);
              return false;
            }
          }
          return true;
        });
        
        dedupedMeetings.length = 0;
        dedupedMeetings.push(...finalMeetings);
        
        // Enrich meetings with follow-up data
        const enrichedMeetings = await Promise.all(
          dedupedMeetings.map(async (meeting) => {
            try {
              const meetingId = meeting.id || meeting.meeting_id;
              const [latestFollowUpResult, followUpCountResult] = await Promise.all([
                OfflineFirstService.getLatestMeetingFollowUp(meetingId),
                OfflineFirstService.getFollowUpCount(meetingId)
              ]);
              
              return {
                ...meeting,
                latest_follow_up: latestFollowUpResult.success ? latestFollowUpResult.data : null,
                follow_up_count: followUpCountResult.success ? followUpCountResult.data : 0,
                follow_up_required: (followUpCountResult.success && followUpCountResult.data > 0) || meeting.follow_up_required
              };
            } catch (error) {
              console.warn(`Failed to load follow-up data for meeting ${meeting.id}:`, error);
              return {
                ...meeting,
                latest_follow_up: null,
                follow_up_count: 0
              };
            }
          })
        );
        
        setMeetings(enrichedMeetings)
        
        // NOTE: Cleanup should only run during comprehensive sync (server-to-local), not after every load
        // Running cleanup here causes issues when manually deleting meetings - it incorrectly groups and deletes other meetings
        // Cleanup will happen automatically during comprehensive sync or can be triggered manually if needed
        
        // Extract unique statuses with safe operations
        const uniqueStatuses = ["All", ...new Set(
          enrichedMeetings.map(m => m.status).filter(status => status)
        )]
        setStatuses(uniqueStatuses)
      } else {
        console.error('MeetingsScreen: Failed to load meetings:', result.error);
        setMeetings([]);
        setStatuses(["All"]);
      }
    } catch (error) {
      console.error('Error loading meetings:', error)
      Alert.alert("Error", "Failed to load meetings")
    } finally {
      setIsLoading(false)
    }
  }

  // Reload meetings when filter changes
  useEffect(() => {
    if (!isLoading) {
      loadMeetings()
    }
  }, [selectedFilter])

  // Helper function to format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No date'
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return 'Invalid date'
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch (error) {
      return 'Invalid date'
    }
  }

  const filteredMeetings = React.useMemo(() => {
    if (!meetings || !Array.isArray(meetings)) {
      return []
    }

    return meetings.map((meeting) => {
      const now = new Date()
      
      let derivedStatus = meeting.status

      if (derivedStatus !== 'cancelled') {
        // If there is a pending (future) follow-up, the meeting is "scheduled"
        const latestFU = meeting.latest_follow_up
        if (latestFU && latestFU.status !== 'completed' && latestFU.status !== 'cancelled') {
          const fuDate = new Date(latestFU.follow_up_date)
          if (latestFU.follow_up_time) {
            const [h, m] = latestFU.follow_up_time.split(':')
            fuDate.setHours(parseInt(h), parseInt(m))
          } else {
            fuDate.setHours(23, 59, 59)
          }
          if (fuDate >= now) {
            derivedStatus = 'follow-up-scheduled'
          } else {
            derivedStatus = 'completed'
          }
        } else if (derivedStatus !== 'completed') {
          // No active follow-up: auto-complete if meeting date passed
          if (meeting.scheduled_date) {
            const meetingDate = new Date(meeting.scheduled_date)
            if (meetingDate < now) {
              derivedStatus = 'completed'
            }
          }
        }
      }
      
      return {
        ...meeting,
        status: derivedStatus
      }
    }).filter((meeting) => {
      if (!meeting) return false
      
      const doctorName = meeting.doctor_name || `${meeting.doctor_first_name || ''} ${meeting.doctor_last_name || ''}`.trim()
      const matchesSearch = doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           meeting.hospital?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           meeting.purpose?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           meeting.title?.toLowerCase().includes(searchQuery.toLowerCase())

      let matchesFilter = true
      const meetingDate = new Date(meeting.scheduled_date || meeting.meeting_date || new Date())
      
      if (selectedFilter === "This Week") {
        const now = new Date()
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()))
        const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 7))
        matchesFilter = meetingDate >= weekStart && meetingDate <= weekEnd
      } else if (selectedFilter === "This Month") {
        const now = new Date()
        matchesFilter = meetingDate.getMonth() === now.getMonth() && 
                       meetingDate.getFullYear() === now.getFullYear()
      } else if (selectedFilter === "Follow-up Required") {
        // Check if meeting has any follow-ups (new system) or follow_up_required flag (legacy)
        matchesFilter = (meeting.follow_up_count > 0) || (meeting.follow_up_required === true)
      } else if (selectedFilter === "Completed") {
        matchesFilter = meeting.status === "completed"
      }

      return matchesSearch && matchesFilter
    })
  }, [meetings, searchQuery, selectedFilter])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#10b981"
      case "follow-up-scheduled":
        return "#8b5cf6"
      case "scheduled":
        return "#3b82f6"
      case "cancelled":
        return "#ef4444"
      default:
        return "#6b7280"
    }
  }

  const handleViewMeeting = (meeting: any) => {
    // Navigate to the dedicated MeetingDetailsScreen
    const meetingId = meeting.id || meeting.meeting_id
    console.log('Navigating to MeetingDetailsScreen with meetingId:', meetingId)
    navigation.navigate('MeetingDetails', { meetingId })
  }

  const handleEditMeeting = (meeting: any) => {
    console.log('Editing meeting:', meeting)
    setSelectedMeeting(meeting)
    
    // Find the doctor_id from the doctor name or use existing doctor_id
    const doctor = availableDoctors.find(d => 
      getDoctorIdentifier(d) === meeting.doctor_id ||
      `${d.first_name} ${d.last_name}` === meeting.doctor_name
    )
    
    setMeetingForm({
      doctor_id: getDoctorIdentifier(doctor) || meeting.doctor_id || '',
      scheduled_date: meeting.scheduled_date || '',
      duration_minutes: meeting.duration_minutes || 30,
      purpose: meeting.title || meeting.purpose || '',
      notes: meeting.purpose || meeting.notes || ''
    })
    setFollowUpRequired(meeting.follow_up_required || false)
    setFollowUpDate(meeting.follow_up_date || "")
    setShowEditModal(true)
  }

  const handleFollowUp = (meeting: any) => {
    setSelectedMeeting(meeting)
    setFollowUpDate(meeting.follow_up_date || new Date().toISOString().split('T')[0])
    setFollowUpTime(meeting.follow_up_time || '09:00')
    setFollowUpNotes(meeting.follow_up_notes || '')
    setShowFollowUpModal(true)
  }

  const handleSaveEdit = async () => {
    try {
      if (!selectedMeeting) return

      const meetingId = selectedMeeting.id || selectedMeeting.meeting_id
      
      // Validate: scheduled_date must not be in the past
      if (meetingForm.scheduled_date) {
        const selected = new Date(meetingForm.scheduled_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        selected.setHours(0, 0, 0, 0)
        if (selected < today) {
          Alert.alert("Invalid Date", "Meeting date cannot be in the past.")
          return
        }
      }

      const updateData = {
        title: meetingForm.purpose,
        purpose: meetingForm.purpose,
        scheduled_date: meetingForm.scheduled_date,
        duration_minutes: meetingForm.duration_minutes,
        notes: meetingForm.notes,
        doctor_id: meetingForm.doctor_id || undefined,
        status: 'scheduled',
      }

      const result = await OfflineFirstService.updateMeeting(meetingId, updateData)
      
      if (result.success) {
        notifyMeetingChange()
        Alert.alert("Success", "Meeting updated successfully!")
        setShowEditModal(false)
        loadMeetings()
      } else {
        Alert.alert("Error", result.error || "Failed to update meeting")
      }
    } catch (error) {
      console.error('EXCEPTION in handleSaveEdit:', error)
      Alert.alert("Error", "Failed to update meeting")
    }
  }

  const handleSaveFollowUp = async () => {
    try {
      console.log('=== FOLLOW-UP SAVE DEBUG ===')
      console.log('selectedMeeting:', selectedMeeting)
      console.log('followUpDate:', followUpDate)
      console.log('followUpTime:', followUpTime)
      console.log('followUpNotes:', followUpNotes)
      
      if (!selectedMeeting) {
        Alert.alert("Error", "No meeting selected");
        return;
      }

      // Use local meeting ID (not server meeting_id)
      const meetingId = selectedMeeting.id || selectedMeeting.meeting_id;
      
      if (!meetingId) {
        Alert.alert("Error", "Meeting ID not found");
        return;
      }

      // Validate follow-up data
      if (!followUpDate || !followUpTime) {
        Alert.alert("Error", "Please select both date and time");
        return;
      }

      // Follow-up must be today or later
      const fuDate = new Date(followUpDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      fuDate.setHours(0, 0, 0, 0);
      if (fuDate < today) {
        Alert.alert("Invalid Date", "Follow-up date cannot be in the past.");
        return;
      }

      // Follow-up must be on or after the meeting date
      const meetingDate = selectedMeeting.scheduled_date ? new Date(selectedMeeting.scheduled_date) : null;
      if (meetingDate) {
        meetingDate.setHours(0, 0, 0, 0);
        if (fuDate < meetingDate) {
          Alert.alert("Invalid Date", "Follow-up date must be on or after the meeting date.");
          return;
        }
      }

      console.log('Calling OfflineFirstService.createMeetingFollowUp with meetingId:', meetingId);
      console.log('Follow-up data:', {
        meeting_id: meetingId,
        follow_up_date: followUpDate,
        follow_up_time: followUpTime,
        follow_up_notes: followUpNotes || undefined,
        status: 'scheduled'
      });

      // Create new follow-up using the new system
      const result = await OfflineFirstService.createMeetingFollowUp({
        meeting_id: meetingId,
        follow_up_date: followUpDate,
        follow_up_time: followUpTime,
        follow_up_notes: followUpNotes || undefined,
        status: 'scheduled'
      });

      console.log('Follow-up create result:', result);
      
      if (result.success) {
        console.log('SUCCESS: Follow-up created successfully');
        Alert.alert("Success", "Follow-up created successfully!");
        setShowFollowUpModal(false);
        // Reset form
        setFollowUpDate("");
        setFollowUpTime("");
        setFollowUpNotes("");
        setSelectedMeeting(null);
        // Refresh meetings list
        loadMeetings();
        // Notify global state
        notifyMeetingChange();
      } else {
        console.log('ERROR: Follow-up creation failed:', result.error);
        Alert.alert("Error", result.error || "Failed to create follow-up");
      }
    } catch (error) {
      console.error('EXCEPTION in handleSaveFollowUp:', error);
      Alert.alert("Error", "Failed to create follow-up");
    }
  }

  // Date/Time picker handlers
  const handleDateChange = (event: any, selectedDate?: Date) => {
    // Legacy handler - now using bottom sheet
    if (selectedDate) {
      handleDatePickerConfirm(selectedDate)
    }
  }

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    // Legacy handler - now using bottom sheet
    if (selectedTime) {
      handleTimePickerConfirm(selectedTime)
    }
  }

  // Bottom sheet date picker handlers
  const handleDatePickerConfirm = (date: Date) => {
      if (datePickerMode === 'edit') {
        const currentTime = meetingForm.scheduled_date ? new Date(meetingForm.scheduled_date) : new Date()
      const newDateTime = new Date(date)
        newDateTime.setHours(currentTime.getHours(), currentTime.getMinutes())
        setMeetingForm({...meetingForm, scheduled_date: newDateTime.toISOString()})
      } else {
      setFollowUpDate(date.toISOString().split('T')[0])
    }
  }

  const handleTimePickerConfirm = (time: Date) => {
      if (datePickerMode === 'edit') {
        const currentDate = meetingForm.scheduled_date ? new Date(meetingForm.scheduled_date) : new Date()
        const newDateTime = new Date(currentDate)
      newDateTime.setHours(time.getHours(), time.getMinutes())
        setMeetingForm({...meetingForm, scheduled_date: newDateTime.toISOString()})
      } else {
      setFollowUpTime(time.toTimeString().slice(0, 5))
    }
  }

  const handleViewSlideFullScreen = (slide: any) => {
    Alert.alert("View Slide", `Viewing: ${slide.title}`)
    // Implement full-screen slide view
  }

  const handleAddMeeting = async () => {
    try {
      if (!meetingForm.doctor_id || !meetingForm.purpose.trim()) {
        Alert.alert("Error", "Please select a doctor and enter meeting purpose")
        return
      }

      // Validate: scheduled_date must not be in the past
      if (meetingForm.scheduled_date) {
        const selected = new Date(meetingForm.scheduled_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        selected.setHours(0, 0, 0, 0)
        if (selected < today) {
          Alert.alert("Invalid Date", "Meeting date cannot be in the past.")
          return
        }
      }

      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success && userResult.user) {
        // Use OfflineFirstService to save to local DB first (offline-first architecture)
        const selectedDoctorObj = availableDoctors.find(d => getDoctorIdentifier(d) === meetingForm.doctor_id)
        const meetingTitle = meetingForm.purpose.trim() || `Meeting with ${selectedDoctorObj?.first_name || 'Doctor'}`
        
        // Build scheduled_date with time if not already ISO format
        let scheduledDate = meetingForm.scheduled_date
        if (scheduledDate && !scheduledDate.includes('T')) {
          // If it's just a date, add current time
          const now = new Date()
          const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
          scheduledDate = `${scheduledDate}T${timeString}:00`
        }
        
        const result = await OfflineFirstService.createMeeting({
          mr_id: userResult.user.id,
          doctor_id: meetingForm.doctor_id,
          title: meetingTitle,
          purpose: meetingForm.purpose.trim(),
          scheduled_date: scheduledDate || new Date().toISOString(),
          duration_minutes: meetingForm.duration_minutes || 30,
          status: 'scheduled',
          notes: meetingForm.notes || undefined
        })
        
        if (result.success) {
          // Notify global state about meeting change
          notifyMeetingChange()
          
          Alert.alert("Success", "Meeting scheduled successfully!")
          setShowEditModal(false)
          resetMeetingForm()
          loadMeetings()
        } else {
          Alert.alert("Error", result.error || "Failed to schedule meeting")
        }
      }
    } catch (error) {
      console.error('Error scheduling meeting:', error)
      Alert.alert("Error", "Failed to schedule meeting")
    }
  }

  const handleDeleteMeeting = (meeting: any) => {
    Alert.alert(
      "Delete Meeting",
      `Are you sure you want to delete the meeting "${meeting.title || meeting.purpose}"?\n\nThis will also remove all associated follow-ups and notes.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const meetingId = meeting.id || meeting.meeting_id
              
              // Always use OfflineFirstService — handles local soft-delete + sync queue
              const result = await OfflineFirstService.deleteMeeting(meetingId)
              
              if (result.success) {
                Alert.alert("Success", "Meeting deleted successfully!")
                notifyMeetingChange()
                loadMeetings()
              } else {
                Alert.alert("Error", result.error || "Failed to delete meeting")
              }
            } catch (error) {
              console.error('EXCEPTION in handleDeleteMeeting:', error)
              Alert.alert("Error", "Failed to delete meeting")
            }
          }
        }
      ]
    )
  }

  const resetMeetingForm = () => {
    setMeetingForm({
      doctor_id: '',
      scheduled_date: '',
      duration_minutes: 30,
      purpose: '',
      notes: '',
    })
  }


  const handleAddDoctor = () => {
    showDoctorForm(undefined, () => {
      loadAvailableDoctors()
      setDoctorRefreshTrigger(prev => prev + 1)
      setTimeout(() => {
                setShowDoctorSelectionModal(true)
      }, 100)
    })
  }

  const handleTimeSelection = (initialTime?: string) => {
    setDatePickerMode('followup')
    const timeDate = new Date()
    if (initialTime) {
      const [hours, minutes] = initialTime.split(':')
      timeDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0)
    }
    setSelectedTime(timeDate)
    datePicker.showTime(timeDate, { mode: 'time' })
  }

  const selectedMeetingFormDoctor = findDoctorById(meetingForm.doctor_id)

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      
      {/* Static Header Section */}
      <View style={styles.staticHeader}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Meeting Records</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => showMeetingForm(undefined, undefined, (createdMeeting?: any) => {
                // Refresh both doctors and meetings after meeting creation
                setDoctorRefreshTrigger(prev => prev + 1);
                loadMeetings();
              })}
            >
              <Ionicons name="add" size={20} color="#ffffff" />
            </TouchableOpacity>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="filter" size={20} color="#8b5cf6" />
          </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#6b7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search meetings..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Filter Chips */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContentContainer}
        >
          {filters.map((filterOption, index) => (
            <TouchableOpacity
              key={`meeting-filter-${filterOption}-${index}`}
              style={[styles.filterChip, selectedFilter === filterOption && styles.filterChipActive]}
              onPress={() => setSelectedFilter(filterOption)}
            >
              <Text style={[styles.filterText, selectedFilter === filterOption && styles.filterTextActive]}>{filterOption}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Scrollable Content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.meetingsList}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Loading meetings...</Text>
            </View>
          ) : filteredMeetings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No Meetings Found</Text>
              <Text style={styles.emptyMessage}>
                {searchQuery || selectedFilter !== "All" 
                  ? "No meetings match your current filters" 
                  : "You don't have any meetings scheduled yet"}
              </Text>
            </View>
          ) : (
            Array.isArray(filteredMeetings) && filteredMeetings.length > 0 ? filteredMeetings.map((meeting, index) => {
            const meetingKey = String(meeting.id || meeting.meeting_id || `meeting-${index}`);
            return (
            <TouchableOpacity 
              key={meetingKey} 
              style={styles.meetingCard}
              onPress={() => handleViewMeeting(meeting)}
            >
            <View style={styles.meetingHeader}>
              <View style={styles.doctorImageContainer}>
                {meeting.profile_image_url ? (
                  <Image
                    source={{ uri: meeting.profile_image_url }}
                    style={styles.doctorImage}
                    onError={() => console.log('Failed to load doctor image')}
                  />
                ) : (
                  <View style={[styles.doctorImage, styles.defaultDoctorImage]}>
                    <Ionicons name="person" size={24} color="#8b5cf6" />
                  </View>
                )}
              </View>
              <View style={styles.meetingInfo}>
                  <Text style={styles.meetingTitle}>{meeting.title || meeting.purpose || 'Untitled Meeting'}</Text>
                  <Text style={styles.doctorName}>{getDoctorName(meeting)}</Text>
                <Text style={styles.doctorDetails}>
                    {getDoctorDetails(meeting)}
                </Text>
                <Text style={styles.meetingDate}>
                    {formatDate(meeting.scheduled_date)} • {meeting.duration_minutes || 30} min
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(meeting.status || 'scheduled')}20` }]}>
                <Text style={[styles.statusText, { color: getStatusColor(meeting.status || 'scheduled') }]}>
                  {(meeting.status || 'scheduled').replace("-", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </Text>
              </View>
            </View>

            <View style={styles.presentationInfo}>
              <Ionicons name="play-circle" size={16} color="#8b5cf6" />
                <Text style={styles.presentationTitle}>{meeting.purpose || 'No purpose specified'}</Text>
            </View>

              {(meeting.latest_follow_up || (meeting.follow_up_required && meeting.follow_up_date)) ? (
              <View style={styles.followUpInfo}>
                <Ionicons name="calendar" size={14} color={meeting.status === 'follow-up-scheduled' ? '#8b5cf6' : '#d97706'} />
                <View style={styles.followUpContent}>
                  <Text style={[styles.followUpText, meeting.status === 'follow-up-scheduled' && { color: '#8b5cf6' }]}>
                    {meeting.latest_follow_up 
                      ? `Next: ${formatDate(meeting.latest_follow_up.follow_up_date)}${meeting.latest_follow_up.follow_up_time ? ` at ${meeting.latest_follow_up.follow_up_time}` : ''}`
                      : `Follow-up: ${formatDate(meeting.follow_up_date)}${meeting.follow_up_time ? ` at ${meeting.follow_up_time}` : ''}`
                    }
                  </Text>
                  {meeting.follow_up_count > 0 && (
                    <View style={[styles.followUpCountBadge, meeting.status === 'follow-up-scheduled' && { backgroundColor: '#8b5cf6' }]}>
                      <Text style={styles.followUpCountText}>
                        {meeting.follow_up_count} {meeting.follow_up_count === 1 ? 'follow-up' : 'follow-ups'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            ) : null}

            <View style={styles.meetingActions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleEditMeeting(meeting)}>
                <Ionicons name="create" size={16} color="#6b7280" />
                <Text style={[styles.actionButtonText, { color: "#6b7280" }]}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={() => handleFollowUp(meeting)}
              >
                <Ionicons name="calendar" size={16} color="#d97706" />
                <Text style={[styles.actionButtonText, { color: "#d97706" }]}>
                  {meeting.follow_up_date ? 'Edit Follow Up' : 'Follow Up'}
                </Text>
              </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => handleDeleteMeeting(meeting)}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={[styles.actionButtonText, { color: "#ef4444" }]}>Delete</Text>
              </TouchableOpacity>
            </View>
            </TouchableOpacity>
            );
          }) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No Meetings Found</Text>
              <Text style={styles.emptyMessage}>No meetings available</Text>
            </View>
          )
          )}
        </View>
      </ScrollView>

      {/* Edit Meeting Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlayBottomSheet}>
          <View style={styles.modalContentBottomSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Meeting</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Doctor</Text>
                <TouchableOpacity
                  style={styles.doctorSelectionButton}
                  onPress={() => {
                    setShowEditModal(false)
                    setTimeout(() => {
                      setShowDoctorSelectionModal(true)
                    }, 100)
                  }}
                >
                  {selectedMeetingFormDoctor ? (
                    <View style={styles.selectedDoctorInfo}>
                      <Text style={styles.selectedDoctorName}>
                        {selectedMeetingFormDoctor.first_name} {selectedMeetingFormDoctor.last_name}
                      </Text>
                      <Text style={styles.selectedDoctorDetails}>
                        {selectedMeetingFormDoctor.specialty} • {selectedMeetingFormDoctor.hospital}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.placeholderText}>
                      {selectedMeeting?.doctor_name || 'Select Doctor'}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Title</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter meeting title"
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.purpose}
                  onChangeText={(text) => setMeetingForm({...meetingForm, purpose: text})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Date</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    const initialDate = meetingForm.scheduled_date ? new Date(meetingForm.scheduled_date) : new Date()
                    setSelectedDate(initialDate)
                    datePicker.showDate(initialDate, {
                      mode: 'date',
                      title: 'Select Meeting Date',
                      minimumDate: new Date(),
                    }, (result) => {
                      if (!result.cancelled && result.date) {
                        setMeetingForm(prev => ({ ...prev, scheduled_date: result.date?.toISOString().split('T')[0] || '' }))
                      }
                    })
                  }}
                >
                  <Ionicons name="calendar" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {meetingForm.scheduled_date ? 
                      new Date(meetingForm.scheduled_date).toLocaleDateString() : 
                      'Select Date'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Time</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    const timeDate = new Date()
                    const [hours, minutes] = (meetingForm.scheduled_date || '09:00').split(':')
                    timeDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0)
                    setSelectedTime(timeDate)
                    datePicker.showTime(timeDate, {
                      mode: 'time',
                      title: 'Select Meeting Time'
                    }, (result) => {
                      if (!result.cancelled && result.date) {
                        const formatted = result.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                        setMeetingForm(prev => ({ ...prev, scheduled_date: result.date?.toISOString().split('T')[0] || '' }))
                      }
                    })
                  }}
                >
                  <Ionicons name="time" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {meetingForm.scheduled_date ? 
                      new Date(meetingForm.scheduled_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 
                      'Select Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Duration (minutes)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="30"
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.duration_minutes?.toString()}
                  onChangeText={(text) => setMeetingForm({...meetingForm, duration_minutes: parseInt(text) || 30})}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meeting Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter meeting notes..."
                  placeholderTextColor="#9ca3af"
                  value={meetingForm.notes}
                  onChangeText={(text) => setMeetingForm({...meetingForm, notes: text})}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowEditModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Meeting handled via global form context */}

      {/* Follow-up Modal */}
      <Modal visible={showFollowUpModal} transparent animationType="slide">
        <View style={styles.modalOverlayBottomSheet}>
          <View style={styles.modalContentBottomSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedMeeting?.follow_up_date ? 'Edit Follow-up' : 'Schedule Follow-up'}
              </Text>
              <TouchableOpacity onPress={() => setShowFollowUpModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Date</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setDatePickerMode('followup')
                    const minDate = selectedMeeting?.scheduled_date
                      ? new Date(Math.max(new Date(selectedMeeting.scheduled_date).getTime(), new Date().setHours(0,0,0,0)))
                      : new Date()
                    setSelectedDate(new Date(followUpDate || Date.now()))
                    datePicker.showDate(
                      new Date(followUpDate || Date.now()), 
                      { mode: 'date', title: 'Select Follow-up Date', minimumDate: minDate },
                      (result) => {
                        if (!result.cancelled && result.date instanceof Date) {
                          setFollowUpDate(result.date.toISOString().split('T')[0])
                        }
                      }
                    )
                  }}
                >
                  <Ionicons name="calendar" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {followUpDate ? 
                      new Date(followUpDate).toLocaleDateString() : 
                      'Select Date'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Time</Text>
                <TouchableOpacity
                  style={styles.dateTimeButton}
                  onPress={() => {
                    setDatePickerMode('followup')
                    const timeDate = new Date()
                    if (followUpTime) {
                      const [hours, minutes] = followUpTime.split(':')
                      timeDate.setHours(parseInt(hours), parseInt(minutes))
                    }
                    setSelectedTime(timeDate)
                    datePicker.showTime(
                      timeDate, 
                      { mode: 'time', title: 'Select Follow-up Time' },
                      (result) => {
                        if (!result.cancelled && result.date instanceof Date) {
                          setFollowUpTime(result.date.toTimeString().slice(0, 5))
                        }
                      }
                    )
                  }}
                >
                  <Ionicons name="time" size={20} color="#8b5cf6" />
                  <Text style={styles.dateTimeButtonText}>
                    {followUpTime || 'Select Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Follow-up Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Enter follow-up notes..."
                  placeholderTextColor="#9ca3af"
                  value={followUpNotes}
                  onChangeText={setFollowUpNotes}
                  multiline
                  numberOfLines={4}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowFollowUpModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveFollowUp}>
                <Text style={styles.saveButtonText}>Save Follow-up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Doctor Selection Modal for New Meeting */}
      <Modal visible={showDoctorSelectionModal} transparent animationType="slide">
        <View style={styles.modalOverlayBottomSheet}>
          <View style={styles.modalContentBottomSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Doctor</Text>
              <TouchableOpacity onPress={() => {
                setShowDoctorSelectionModal(false)
                setTimeout(() => {
                    setShowEditModal(true)
                }, 100)
              }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {availableDoctors && availableDoctors.length > 0 ? (
                availableDoctors.map((doctor, index) => {
                  const doctorId = getDoctorIdentifier(doctor)
                  if (!doctorId) {
                    return null
                  }

                  return (
                  <TouchableOpacity
                    key={`${doctorId}-${index}`}
                    style={[
                      styles.doctorSelectionCard,
                      meetingForm.doctor_id === doctorId && styles.doctorSelectionCardSelected
                    ]}
                    onPress={() => {
                      setMeetingForm({...meetingForm, doctor_id: doctorId})
                      setShowDoctorSelectionModal(false)
                      setTimeout(() => {
                          setShowEditModal(true)
                      }, 100)
                    }}
                  >
                    <View style={styles.doctorInfo}>
                      <View style={styles.doctorAvatar}>
                        {doctor.profile_image_url ? (
                          <Image source={{ uri: doctor.profile_image_url }} style={styles.doctorAvatarImage} />
                        ) : (
                          <Ionicons name="person" size={20} color="#8b5cf6" />
                        )}
                      </View>
                      <View style={styles.doctorDetails}>
                        <Text style={styles.doctorName}>{doctor.first_name} {doctor.last_name}</Text>
                        <Text style={styles.doctorSpecialty}>{doctor.specialty}</Text>
                        <Text style={styles.doctorHospital}>{doctor.hospital}</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                  )
                })
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="person-outline" size={48} color="#9ca3af" />
                  <Text style={styles.emptyStateText}>No doctors available</Text>
                  <Text style={styles.emptyStateSubtext}>Add doctors first to create meetings</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.addNewButton}
                onPress={() => {
                  setShowDoctorSelectionModal(false)
                  showDoctorForm(undefined, async (newDoctor) => {
                    const doctors = await loadAvailableDoctors()
                    const nextDoctorId = newDoctor?.id || (doctors && doctors.length > 0 ? doctors[0]?.id : undefined)

                    if (nextDoctorId) {
                      setMeetingForm(prev => ({ ...prev, doctor_id: nextDoctorId }))
                    }

                    setDoctorRefreshTrigger(prev => prev + 1)
                    setShowDoctorSelectionModal(true)
                  })
                }}
              >
                <Ionicons name="add" size={20} color="#8b5cf6" />
                <Text style={styles.addNewButtonText}>Add New Doctor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Sheet Date/Time Picker */}
      <BottomSheetDatePicker
        visible={datePicker.visible}
        value={datePicker.value}
        mode={(datePicker.config.mode === 'datetime' || datePicker.config.mode === 'date') ? 'date' : 'time'}
        title={datePicker.config.title}
        minimumDate={datePicker.config.minimumDate}
        maximumDate={datePicker.config.maximumDate}
        onConfirm={datePicker.handleConfirm}
        onCancel={datePicker.handleCancel}
      />
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
  staticHeader: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  addButton: {
    width: 36,
    height: 36,
    backgroundColor: "#8b5cf6",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButton: {
    padding: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#1f2937",
  },
  filterContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 8,
  },
  filterContentContainer: {
    paddingRight: 20, // Add padding to the right so last item isn't cut off
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
    letterSpacing: 0.2,
  },
  filterTextActive: {
    color: "#ffffff",
    fontWeight: "600",
  },
  meetingsList: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  meetingCard: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  meetingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  doctorImageContainer: {
    marginRight: 12,
  },
  doctorImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f3f4f6',
  },
  defaultDoctorImage: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  meetingInfo: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 2,
  },
  doctorDetails: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  meetingDate: {
    fontSize: 12,
    color: "#9ca3af",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "500",
  },
  presentationInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  presentationTitle: {
    fontSize: 14,
    color: "#8b5cf6",
    fontWeight: "500",
  },
  followUpInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 6,
  },
  followUpContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  followUpText: {
    fontSize: 12,
    color: "#d97706",
    fontWeight: "500",
    flex: 1,
  },
  followUpCountBadge: {
    backgroundColor: "#d97706",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  followUpCountText: {
    fontSize: 10,
    color: "#ffffff",
    fontWeight: "600",
  },
  meetingActions: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalOverlayBottomSheet: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  detailsModal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "90%",
  },
  editModal: {
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
  detailsContent: {
    maxHeight: 500,
  },
  meetingOverview: {
    backgroundColor: "#f1f5f9",
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
  },
  detailsDoctorName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  detailsDoctorInfo: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  detailsDateTime: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 8,
  },
  detailsPresentation: {
    fontSize: 14,
    color: "#8b5cf6",
    fontWeight: "500",
  },
  slidesSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 12,
  },
  slideItem: {
    flexDirection: "row",
    marginBottom: 16,
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  slideThumbnail: {
    width: 60,
    height: 45,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
    marginRight: 12,
  },
  slideContent: {
    flex: 1,
  },
  slideTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  slideComments: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 16,
  },
  notesSection: {
    marginBottom: 20,
  },
  overallNotes: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  followUpSection: {
    marginBottom: 20,
  },
  followUpDetails: {
    fontSize: 14,
    color: "#d97706",
    fontWeight: "500",
  },
  editContent: {
    gap: 20,
  },
  editMeetingInfo: {
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 8,
  },
  editDoctorName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 2,
  },
  editMeetingDate: {
    fontSize: 12,
    color: "#6b7280",
  },
  followUpEditSection: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  followUpToggle: {
    flexDirection: "row",
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  toggleButtonActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  toggleButtonTextActive: {
    color: "#ffffff",
  },
  inputGroup: {
    gap: 8,
  },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    gap: 8,
  },
  dateInputText: {
    fontSize: 14,
    color: "#374151",
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
  emptyStateText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
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
  },
  modalBody: {
    maxHeight: isTablet() ? 500 : 400, // More height on tablets
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: getModalBorderRadius(),
    padding: getModalPadding(),
    margin: isTablet() ? 24 : 20,
    width: getModalWidth(90),
    maxHeight: getModalMaxHeight(80),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalContentBottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: getModalBorderRadius(),
    borderTopRightRadius: getModalBorderRadius(),
    borderRadius: 0,
    padding: getModalPadding(),
    margin: 0,
    width: '100%',
    maxHeight: getModalMaxHeight(80),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  formContainer: {
    maxHeight: isTablet() ? 500 : 400, // More height on tablets
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  // Doctor selection styles
  doctorSelection: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  doctorSelectionCard: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    borderRadius: 8,
    margin: 4,
  },
  doctorSelectionCardSelected: {
    backgroundColor: '#ede9fe',
    borderColor: '#8b5cf6',
    borderWidth: 1,
  },
  doctorSelectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  doctorSpecialty: {
    fontSize: 12,
    color: '#8b5cf6',
    marginBottom: 1,
  },
  doctorHospital: {
    fontSize: 12,
    color: '#6b7280',
  },
  noDoctorsText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  doctorSelectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  selectedDoctorInfo: {
    flex: 1,
  },
  selectedDoctorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  selectedDoctorDetails: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  placeholderText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  doctorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  doctorAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  addNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  addNewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b5cf6',
    marginLeft: 8,
  },
  largeModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: getModalBorderRadius(),
    padding: getModalPadding(),
    margin: isTablet() ? 24 : 20,
    width: getModalWidth(95),
    maxHeight: getModalMaxHeight(90),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  dateTimeButtonText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  readOnlyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  brochureInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  brochureTitle: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
  },
  notesCount: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  // Date/Time Picker Modal Styles
  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34, // Safe area for iOS
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  datePickerButton: {
    fontSize: 16,
    color: '#6b7280',
  },
  datePickerDoneButton: {
    color: '#8b5cf6',
    fontWeight: '600',
  },
})
