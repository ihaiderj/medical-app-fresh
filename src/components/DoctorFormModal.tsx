/**
 * Reusable Doctor Form Modal Component
 * Used across all screens for creating/editing doctors
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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { UnifiedDataService } from '../services/UnifiedDataService';
import { DoctorPhotoServiceV2 } from '../services/doctorPhotoServiceV2';
import { useAppData } from '../context/AppDataContext';
import { AuthService } from '../services/AuthService';

interface DoctorFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (doctor?: any) => void;
  existingDoctor?: any; // For editing
  title?: string;
}

export default function DoctorFormModal({ 
  visible, 
  onClose, 
  onSuccess, 
  existingDoctor,
  title = "Add New Doctor"
}: DoctorFormModalProps) {
  const { user } = useAppData();
  const [currentUserId, setCurrentUserId] = useState<string | null>(user?.id ?? null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    specialty: '',
    hospital: '',
    phone: '',
    email: '',
    location: '',
    profile_image_url: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [localPhoto, setLocalPhoto] = useState<string | undefined>(existingDoctor?.profile_image_url);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoProgress, setPhotoProgress] = useState(0);

  useEffect(() => {
    if (existingDoctor) {
      setFormData({
        first_name: existingDoctor.first_name || '',
        last_name: existingDoctor.last_name || '',
        specialty: existingDoctor.specialty || '',
        hospital: existingDoctor.hospital || '',
        phone: existingDoctor.phone || '',
        email: existingDoctor.email || '',
        location: existingDoctor.location || '',
        profile_image_url: existingDoctor.profile_image_url || '',
      });
      if (existingDoctor?.profile_image_url) {
        setLocalPhoto(existingDoctor.profile_image_url);
      } else {
        setLocalPhoto(undefined);
      }
    } else {
      setFormData({
        first_name: '',
        last_name: '',
        specialty: '',
        hospital: '',
        phone: '',
        email: '',
        location: '',
        profile_image_url: '',
      });
      setLocalPhoto(undefined);
    }
    setErrors({});
  }, [existingDoctor, visible]);

  useEffect(() => {
    let isMounted = true;

    const ensureUser = async () => {
      if (user?.id) {
        setCurrentUserId(user.id);
        return;
      }

      try {
        const result = await AuthService.getCurrentUser();
        if (isMounted && result.success && result.user) {
          setCurrentUserId(result.user.id);
        }
      } catch (error) {
        console.error('DoctorFormModal: failed to resolve current user', error);
      }
    };

    if (visible) {
      ensureUser();
    }

    return () => {
      isMounted = false;
    };
  }, [user?.id, visible]);

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (!formData.specialty.trim()) {
      newErrors.specialty = 'Specialty is required';
    }
    if (!formData.hospital.trim()) {
      newErrors.hospital = 'Hospital is required';
    }

    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      const doctorData = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        specialty: formData.specialty.trim(),
        hospital: formData.hospital.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        location: formData.location.trim(),
        profile_image_url: formData.profile_image_url || undefined,
      };

      let result;
      if (existingDoctor?.id) {
        result = await UnifiedDataService.updateDoctor(existingDoctor.id, doctorData);
      } else {
        // Create new doctor
        // Use userId from context for doctor creation
        const userId = user?.id || currentUserId;
        if (!userId) {
          Alert.alert('Error', 'User information not available. Please try again.');
          setIsLoading(false);
          return;
        }
        
        result = await UnifiedDataService.createDoctor(doctorData, userId);
      }

      if (result.success) {
        Alert.alert(
          'Success', 
          existingDoctor ? 'Doctor updated successfully' : 'Doctor created successfully',
          [{ text: 'OK', onPress: () => {
            if (onSuccess) {
              onSuccess(result.data);
            }
            onClose();
          }}]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to save doctor');
      }
    } catch (error) {
      console.error('Doctor form error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const processPhotoAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    try {
      if (!asset.uri) {
        Alert.alert('Error', 'Unable to read the selected photo.');
        return;
      }

      const resolvedUserId = currentUserId ?? user?.id;
      if (!resolvedUserId) {
        Alert.alert('Error', 'User information unavailable.');
        return;
      }

      const previousPhoto = localPhoto;
      setUploadingPhoto(true);
      setPhotoProgress(0);
      setLocalPhoto(asset.uri);

      const uploadResult = await DoctorPhotoServiceV2.uploadDoctorPhoto(
        asset.uri,
        asset.fileName || `doctor_${Date.now()}.jpg`,
        resolvedUserId,
        (progress) => {
          setPhotoProgress(progress.percentage);
        }
      );

      if (!uploadResult.success || !uploadResult.photoUrl) {
        setLocalPhoto(previousPhoto);
        Alert.alert('Upload failed', uploadResult.error || 'Unable to upload photo.');
        return;
      }

      setLocalPhoto(uploadResult.photoUrl);
      setFormData(prev => ({
        ...prev,
        profile_image_url: uploadResult.photoUrl || '',
      }));
    } catch (error) {
      console.error('Doctor photo processing error:', error);
      Alert.alert('Error', 'Something went wrong while processing the photo.');
    } finally {
      setUploadingPhoto(false);
      setPhotoProgress(0);
    }
  };

  const pickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access to upload a photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        mediaTypes: ['images'],
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      await processPhotoAsset(result.assets[0]);
    } catch (error) {
      console.error('Doctor photo picker error:', error);
      Alert.alert('Error', 'Something went wrong while picking the photo.');
    }
  };

  const capturePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow camera access to take a photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        mediaTypes: ['images'],
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      await processPhotoAsset(result.assets[0]);
    } catch (error) {
      console.error('Doctor photo capture error:', error);
      Alert.alert('Error', 'Something went wrong while taking the photo.');
    }
  };

  const removePhoto = async () => {
    if (!localPhoto) {
      return;
    }

    try {
      setUploadingPhoto(true);
      await DoctorPhotoServiceV2.deleteDoctorPhoto(localPhoto);
      setLocalPhoto(undefined);
      setFormData(prev => ({
        ...prev,
        profile_image_url: '',
      }));
    } catch (error) {
      console.error('Doctor photo removal error:', error);
      Alert.alert('Error', 'Failed to remove doctor photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

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
          {/* Doctor Photo */}
          <View style={styles.photoSection}>
            <Text style={styles.sectionTitle}>Doctor Photo</Text>
            <View style={styles.photoRow}>
              <View style={styles.photoPreviewWrapper}>
                {localPhoto ? (
                  <Image source={{ uri: localPhoto }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="person" size={40} color="#8b5cf6" />
                  </View>
                )}
                {uploadingPhoto && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.uploadText}>{Math.round(photoProgress)}%</Text>
                  </View>
                )}
              </View>
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.photoButton} onPress={pickPhoto} disabled={uploadingPhoto}>
                  <Ionicons name={localPhoto ? 'images' : 'image-outline'} size={16} color="#8b5cf6" />
                  <Text style={styles.photoButtonText}>{localPhoto ? 'Change Photo' : 'Choose from Gallery'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoButton} onPress={capturePhoto} disabled={uploadingPhoto}>
                  <Ionicons name="camera" size={16} color="#8b5cf6" />
                  <Text style={styles.photoButtonText}>Take Photo</Text>
                </TouchableOpacity>
                {localPhoto && !uploadingPhoto && (
                  <TouchableOpacity style={styles.removePhotoButton} onPress={removePhoto}>
                    <Ionicons name="trash" size={16} color="#ef4444" />
                    <Text style={[styles.photoButtonText, { color: '#ef4444' }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={[styles.input, errors.first_name && styles.inputError]}
                  value={formData.first_name}
                  onChangeText={(value) => handleInputChange('first_name', value)}
                  placeholder="Enter first name"
                  autoCapitalize="words"
                />
                {errors.first_name && <Text style={styles.errorText}>{errors.first_name}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={[styles.input, errors.last_name && styles.inputError]}
                  value={formData.last_name}
                  onChangeText={(value) => handleInputChange('last_name', value)}
                  placeholder="Enter last name"
                  autoCapitalize="words"
                />
                {errors.last_name && <Text style={styles.errorText}>{errors.last_name}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Specialty *</Text>
                <TextInput
                  style={[styles.input, errors.specialty && styles.inputError]}
                  value={formData.specialty}
                  onChangeText={(value) => handleInputChange('specialty', value)}
                  placeholder="Enter specialty"
                  autoCapitalize="words"
                />
                {errors.specialty && <Text style={styles.errorText}>{errors.specialty}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Hospital *</Text>
                <TextInput
                  style={[styles.input, errors.hospital && styles.inputError]}
                  value={formData.hospital}
                  onChangeText={(value) => handleInputChange('hospital', value)}
                  placeholder="Enter hospital name"
                  autoCapitalize="words"
                />
                {errors.hospital && <Text style={styles.errorText}>{errors.hospital}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phone}
                  onChangeText={(value) => handleInputChange('phone', value)}
                  placeholder="Enter phone number"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  value={formData.email}
                  onChangeText={(value) => handleInputChange('email', value)}
                  placeholder="Enter email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Location</Text>
                <TextInput
                  style={styles.input}
                  value={formData.location}
                  onChangeText={(value) => handleInputChange('location', value)}
                  placeholder="Enter location"
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onClose}
            disabled={isLoading || uploadingPhoto}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.submitButton, isLoading || uploadingPhoto ? styles.disabledButton : {}]}
            onPress={handleSubmit}
            disabled={isLoading || uploadingPhoto}
          >
            {isLoading || uploadingPhoto ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>
                {existingDoctor ? 'Update Doctor' : 'Create Doctor'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
  // New styles for photo elements
  photoSection: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
  },
  photoPreviewWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 5,
  },
  photoActions: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  photoButtonText: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  removePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
});
