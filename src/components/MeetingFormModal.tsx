/**
 * Reusable Meeting Form Modal Component
 * Used across all screens for creating/editing meetings
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UnifiedDataService } from '../services/UnifiedDataService';
import BottomSheetDatePicker from './BottomSheetDatePicker';
import DoctorSelectionModal from './DoctorSelectionModal';
import { useAppData } from '../context/AppDataContext';
import { useGlobalForms } from '../context/GlobalFormContext';

interface MeetingFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (meeting?: any) => void;
  existingMeeting?: any; // For editing
  title?: string;
  selectedDoctor?: any; // Pre-selected doctor
  onAddDoctor?: (existingDoctor?: any, onSuccess?: (doctor?: any) => void) => void;
}

export default function MeetingFormModal({ 
  visible, 
  onClose, 
  onSuccess, 
  existingMeeting,
  title = "Schedule New Meeting",
  selectedDoctor,
  onAddDoctor,
}: MeetingFormModalProps) {
  const { user, notifyMeetingChange } = useAppData(); // Get user and notifyMeetingChange from context
  const { showDoctorForm } = useGlobalForms(); // Get global doctor form handler
  const [formData, setFormData] = useState({
    title: '',
    purpose: '',
    scheduled_date: '',
    time: '',
    duration_minutes: '30',
    doctor_id: '',
    notes: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [availableDoctors, setAvailableDoctors] = useState<any[]>([]);
  const [showDoctorPicker, setShowDoctorPicker] = useState(false);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<Date>(new Date());

  useEffect(() => {
    const now = new Date();

    if (existingMeeting) {
      const parsedDate = existingMeeting.scheduled_date ? new Date(existingMeeting.scheduled_date) : now;
      const isValidDate = !Number.isNaN(parsedDate.getTime());
      const safeDate = isValidDate ? parsedDate : now;
      const baseDateString = safeDate.toISOString().split('T')[0];

      let derivedTime = existingMeeting.time || '';
      if (!derivedTime && isValidDate) {
        derivedTime = `${safeDate.getHours().toString().padStart(2, '0')}:${safeDate.getMinutes().toString().padStart(2, '0')}`;
      }

      const timeDate = new Date(safeDate);
      if (derivedTime) {
        const [hours, minutes] = derivedTime.split(':').map((value: string) => parseInt(value, 10));
        if (!Number.isNaN(hours)) {
          timeDate.setHours(hours || 0, minutes || 0, 0, 0);
        }
      }

      setFormData({
        title: existingMeeting.title || '',
        purpose: existingMeeting.purpose || '',
        scheduled_date: baseDateString,
        time: derivedTime,
        duration_minutes: existingMeeting.duration_minutes ? String(existingMeeting.duration_minutes) : '30',
        doctor_id: existingMeeting.doctor_id || '',
        notes: existingMeeting.notes || '',
      });
      setSelectedDate(safeDate);
      setSelectedTime(timeDate);
    } else {
      const defaultDateString = now.toISOString().split('T')[0];
      const defaultTimeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const defaultTimeDate = new Date(now);

      setFormData({
        title: '',
        purpose: '',
        scheduled_date: defaultDateString,
        time: defaultTimeString,
        duration_minutes: '30',
        doctor_id: selectedDoctor?.id || '',
        notes: '',
      });
      setSelectedDate(now);
      setSelectedTime(defaultTimeDate);
    }
    setErrors({});
    if (user?.id) {
      loadAvailableDoctors();
    }
  }, [existingMeeting, selectedDoctor, visible, user]);

  const loadAvailableDoctors = async (): Promise<any[]> => {
    try {
      // Use userId from context if available
      const userId = user?.id;
      const result = await UnifiedDataService.getDoctorsForSelection(userId);
      
      console.log('MeetingFormModal: Loading doctors for selection, userId:', userId);
      console.log('MeetingFormModal: Doctors result:', result.success, result.data?.length || 0);
      
      if (result.success && result.data) {
        const deduped = new Map<string, any>();

        result.data.forEach((doctor) => {
          const normalizedId = doctor.id || doctor.doctor_id || doctor.server_id;
          if (!normalizedId) {
            return;
          }

          const keyBase = doctor.server_id
            || `${(doctor.first_name || '').trim().toLowerCase()}|${(doctor.last_name || '').trim().toLowerCase()}|${doctor.email || ''}|${doctor.phone || ''}`;
          const key = keyBase || normalizedId;
          const existing = deduped.get(key);

          if (!existing) {
            deduped.set(key, { ...doctor, id: normalizedId });
          } else {
            const existingUpdated = existing.updated_at ? Date.parse(existing.updated_at) : 0;
            const incomingUpdated = doctor.updated_at ? Date.parse(doctor.updated_at) : 0;
            const primary = incomingUpdated > existingUpdated ? doctor : existing;
            const secondary = primary === existing ? doctor : existing;

            deduped.set(key, {
              ...secondary,
              ...primary,
              id: normalizedId,
              server_id: primary.server_id || secondary.server_id,
              profile_image_url: primary.profile_image_url || secondary.profile_image_url,
            });
          }
        });

        const doctors = Array.from(deduped.values());
        setAvailableDoctors(doctors);
        return doctors;
      }
      setAvailableDoctors([]);
      return [];
    } catch (error) {
      console.error('Failed to load doctors:', error);
      setAvailableDoctors([]);
      return [];
    }
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Meeting title is required';
    }
    if (!formData.purpose.trim()) {
      newErrors.purpose = 'Meeting purpose is required';
    }
    if (!formData.scheduled_date) {
      newErrors.scheduled_date = 'Meeting date is required';
    } else {
      const selected = new Date(formData.scheduled_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selected.setHours(0, 0, 0, 0);
      if (selected < today) {
        newErrors.scheduled_date = 'Meeting date cannot be in the past';
      }
    }
    if (!formData.time) {
      newErrors.time = 'Meeting time is required';
    }
    if (!formData.doctor_id) {
      newErrors.doctor_id = 'Please select a doctor';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    
    // Prevent double-submission
    if (isLoading) {
      console.warn('⚠️ MEETING_FORM: Submission already in progress, ignoring duplicate submit');
      return;
    }
    
    try {
      const meetingData = {
        doctor_id: formData.doctor_id,
        title: formData.title.trim(),
        purpose: formData.purpose.trim(),
        scheduled_date: buildScheduledDateTime(formData.scheduled_date, formData.time),
        time: formData.time,
        duration_minutes: formData.duration_minutes ? parseInt(formData.duration_minutes, 10) || 0 : 0,
        notes: formData.notes.trim(),
      };

      // Use userId from context for meeting creation/update
      const userId = user?.id;
      
      if (!userId) {
        Alert.alert('Error', 'User information not available. Please try again.');
        setIsLoading(false);
        return;
      }

      // Validate doctor_id exists before creating meeting
      if (!existingMeeting?.id && meetingData.doctor_id) {
        try {
          const doctorsResult = await UnifiedDataService.getDoctors(userId);
          if (doctorsResult.success && doctorsResult.data) {
            const doctorExists = doctorsResult.data.find(d => 
              d.id === meetingData.doctor_id || d.server_id === meetingData.doctor_id
            );
            if (!doctorExists) {
              Alert.alert('Error', 'Selected doctor not found. Please select a valid doctor.');
              setIsLoading(false);
              return;
            }
          }
        } catch (error) {
          console.warn('⚠️ MEETING_FORM: Could not validate doctor, proceeding:', error);
        }
      }

      let result;
      if (existingMeeting?.id) {
        // Update existing meeting with userId from context
        result = await UnifiedDataService.updateMeeting(existingMeeting.id, meetingData, userId);
      } else {
        // Create new meeting with userId from context
        result = await UnifiedDataService.createMeeting(meetingData, userId);
      }

      if (result.success) {
        // Notify global state about meeting change
        notifyMeetingChange();
        
        Alert.alert(
          'Success', 
          existingMeeting ? 'Meeting updated successfully' : 'Meeting scheduled successfully',
          [{ text: 'OK', onPress: () => {
            onSuccess(result.data);
            onClose();
          }}]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to save meeting');
      }
    } catch (error) {
      console.error('Meeting form error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    const sanitizedValue = field === 'duration_minutes' ? value.replace(/[^0-9]/g, '') : value;
    setFormData(prev => ({ ...prev, [field]: sanitizedValue }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    const dateString = date.toISOString().split('T')[0];
    handleInputChange('scheduled_date', dateString);
  };

  const handleTimeSelect = (date: Date) => {
    setSelectedTime(date);
    const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    handleInputChange('time', time);
  };

  const handleAddNewDoctor = () => {
    setShowDoctorPicker(false);

    // Use onAddDoctor prop if provided, otherwise use global form context
    if (onAddDoctor) {
      onAddDoctor(undefined, async (newDoctor) => {
        const doctors = await loadAvailableDoctors();
        const nextDoctorId = newDoctor?.id || doctors[0]?.id;

        if (nextDoctorId) {
          setFormData(prev => ({ ...prev, doctor_id: nextDoctorId }));
        }
      });
    } else if (showDoctorForm) {
      // Use global form context as fallback
      showDoctorForm(undefined, async (newDoctor) => {
        const doctors = await loadAvailableDoctors();
        const nextDoctorId = newDoctor?.id || doctors[0]?.id;

        if (nextDoctorId) {
          setFormData(prev => ({ ...prev, doctor_id: nextDoctorId }));
        }
      });
    } else {
      console.warn('MeetingFormModal: No doctor form handler available (onAddDoctor or showDoctorForm)');
    }
  };

  const buildScheduledDateTime = (dateString: string, timeString: string) => {
    try {
      if (!dateString) {
        return '';
      }
      const [year, month, day] = dateString.split('-').map((value) => parseInt(value, 10));
      const [hours, minutes] = (timeString || '00:00').split(':').map((value) => parseInt(value, 10));
      if ([year, month, day].some(value => Number.isNaN(value))) {
        return dateString;
      }
      const combined = new Date();
      combined.setFullYear(year, (month || 1) - 1, day || 1);
      combined.setHours(Number.isNaN(hours) ? 0 : hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
      return combined.toISOString();
    } catch (error) {
      console.warn('Failed to build scheduled datetime', error);
      return dateString;
    }
  };

  const selectedDoctorName = availableDoctors.find(d => d.id === formData.doctor_id)?.name || 'Select Doctor';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Meeting Title *</Text>
              <TextInput
                style={[styles.input, errors.title && styles.inputError]}
                value={formData.title}
                onChangeText={(value) => handleInputChange('title', value)}
                placeholder="Enter meeting title"
                autoCapitalize="words"
              />
              {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Purpose *</Text>
              <TextInput
                style={[styles.input, errors.purpose && styles.inputError]}
                value={formData.purpose}
                onChangeText={(value) => handleInputChange('purpose', value)}
                placeholder="Enter meeting purpose"
                autoCapitalize="words"
              />
              {errors.purpose && <Text style={styles.errorText}>{errors.purpose}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Doctor *</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, errors.doctor_id && styles.inputError]}
                onPress={() => setShowDoctorPicker(true)}
              >
                <Text style={[styles.pickerText, !formData.doctor_id && styles.placeholderText]}>
                  {selectedDoctorName}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#666" />
              </TouchableOpacity>
              {errors.doctor_id && <Text style={styles.errorText}>{errors.doctor_id}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date *</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, errors.scheduled_date && styles.inputError]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={[styles.pickerText, !formData.scheduled_date && styles.placeholderText]}>
                  {formData.scheduled_date || 'Select date'}
                </Text>
                <Ionicons name="calendar" size={20} color="#666" />
              </TouchableOpacity>
              {errors.scheduled_date && <Text style={styles.errorText}>{errors.scheduled_date}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Time *</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, errors.time && styles.inputError]}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={[styles.pickerText, !formData.time && styles.placeholderText]}>
                  {formData.time || 'Select time'}
                </Text>
                <Ionicons name="time" size={20} color="#666" />
              </TouchableOpacity>
              {errors.time && <Text style={styles.errorText}>{errors.time}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Duration (minutes)</Text>
              <TextInput
                style={styles.input}
                value={formData.duration_minutes}
                onChangeText={(value) => handleInputChange('duration_minutes', value)}
                placeholder="30"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.notes}
                onChangeText={(value) => handleInputChange('notes', value)}
                placeholder="Enter meeting notes"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onClose}
            disabled={isLoading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.submitButton, isLoading && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>
                {existingMeeting ? 'Update Meeting' : 'Schedule Meeting'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Doctor Picker Modal */}
        <DoctorSelectionModal
          visible={showDoctorPicker}
          onClose={() => setShowDoctorPicker(false)}
          onSelectDoctor={(doctor) => {
            const doctorId = doctor.id || doctor.doctor_id || doctor.server_id;
            handleInputChange('doctor_id', doctorId);
            setShowDoctorPicker(false);
          }}
          onAddDoctor={handleAddNewDoctor}
          availableDoctors={availableDoctors}
          isLoadingDoctors={false}
        />

        <BottomSheetDatePicker
          visible={showDatePicker}
          value={selectedDate}
          mode="date"
          minimumDate={new Date()}
          onConfirm={(result) => {
            if (!result.cancelled && result.date) {
              handleDateSelect(result.date)
            }
            setShowDatePicker(false)
          }}
          onCancel={() => setShowDatePicker(false)}
        />

        <BottomSheetDatePicker
          visible={showTimePicker}
          value={selectedTime}
          mode="time"
          onConfirm={(result) => {
            if (!result.cancelled && result.date) {
              handleTimeSelect(result.date)
            }
            setShowTimePicker(false)
          }}
          onCancel={() => setShowTimePicker(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  form: {
    paddingVertical: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  pickerInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: {
    fontSize: 16,
    color: '#333',
  },
  placeholderText: {
    color: '#999',
  },
  textArea: {
    height: 80,
  },
  inputError: {
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#8b5cf6',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
