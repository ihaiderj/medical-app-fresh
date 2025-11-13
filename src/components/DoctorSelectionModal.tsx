import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DoctorSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDoctor: (doctor: any) => void;
  onAddDoctor: () => void;
  availableDoctors: any[];
  isLoadingDoctors?: boolean;
  selectedDoctorId?: string;
}

export default function DoctorSelectionModal({
  visible,
  onClose,
  onSelectDoctor,
  onAddDoctor,
  availableDoctors,
  isLoadingDoctors = false,
  selectedDoctorId,
}: DoctorSelectionModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.pickerContainer}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.pickerCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Select Doctor</Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.pickerActions}>
          <TouchableOpacity style={styles.addDoctorButton} onPress={onAddDoctor}>
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={styles.addDoctorButtonText}>Add New Doctor</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.pickerContent}>
          {isLoadingDoctors ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.emptyStateText}>Loading doctors...</Text>
            </View>
          ) : availableDoctors.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No doctors found. Add a doctor to continue.</Text>
            </View>
          ) : (
            availableDoctors.map((doctor, index) => {
              const doctorId = doctor.id || doctor.doctor_id || doctor.server_id;
              if (!doctorId) {
                return null;
              }

              return (
                <TouchableOpacity
                  key={`${doctorId}-${index}`}
                  style={styles.pickerItem}
                  onPress={() => onSelectDoctor(doctor)}
                >
                  <Text style={styles.pickerItemText}>
                    {doctor.first_name} {doctor.last_name}
                  </Text>
                  <Text style={styles.pickerItemSubtext}>
                    {doctor.specialty} - {doctor.hospital}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pickerContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  pickerCancelText: {
    color: '#8b5cf6',
    fontSize: 16,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  pickerActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  addDoctorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#8b5cf6',
    borderRadius: 8,
  },
  addDoctorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  pickerContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  pickerItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pickerItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  pickerItemSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
});

