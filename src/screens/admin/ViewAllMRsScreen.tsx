import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Switch,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AdminService } from '../../services/AdminService'

interface MRData {
  id: string
  email: string
  first_name: string
  last_name: string
  phone?: string
  address?: string
  profile_image_url?: string
  is_active: boolean
  can_upload_brochures: boolean
  can_manage_doctors: boolean
  can_schedule_meetings: boolean
  doctors_count: number
  meetings_count: number
  created_at: string
}

interface ViewAllMRsScreenProps {
  navigation: any
}

export default function ViewAllMRsScreen({ navigation }: ViewAllMRsScreenProps) {
  const [mrs, setMrs] = useState<MRData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMR, setSelectedMR] = useState<MRData | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    address: '',
    isActive: true,
  })
  const [permissions, setPermissions] = useState({
    canUploadBrochures: false,
    canManageDoctors: false,
    canScheduleMeetings: true,
  })

  useEffect(() => {
    loadMRs()
  }, [])

  const loadMRs = async () => {
    setIsLoading(true)
    try {
      const result = await AdminService.getAllMRsWithPermissions()
      if (result.success && result.data) {
        setMrs(result.data)
      } else {
        Alert.alert('Error', 'Failed to load MRs')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load MRs')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditMR = (mr: MRData) => {
    setSelectedMR(mr)
    setEditForm({
      firstName: mr.first_name,
      lastName: mr.last_name,
      phone: mr.phone || '',
      address: mr.address || '',
      isActive: mr.is_active,
    })
    setShowEditModal(true)
  }

  const handlePermissions = (mr: MRData) => {
    setSelectedMR(mr)
    setPermissions({
      canUploadBrochures: mr.can_upload_brochures,
      canManageDoctors: mr.can_manage_doctors,
      canScheduleMeetings: mr.can_schedule_meetings,
    })
    setShowPermissionsModal(true)
  }

  const handleUpdateMR = async () => {
    if (!selectedMR) return

    try {
      const result = await AdminService.updateMRProfile(
        selectedMR.id,
        editForm.firstName,
        editForm.lastName,
        editForm.phone || undefined,
        editForm.address || undefined,
        undefined, // profile image URL
        editForm.isActive
      )

      if (result.success) {
        Alert.alert('Success', 'MR profile updated successfully')
        setShowEditModal(false)
        loadMRs()
      } else {
        Alert.alert('Error', result.error || 'Failed to update MR')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update MR')
    }
  }

  const handleUpdatePermissions = async () => {
    if (!selectedMR) return

    try {
      const result = await AdminService.updateMRPermissions(
        selectedMR.id,
        permissions.canUploadBrochures,
        permissions.canManageDoctors,
        permissions.canScheduleMeetings
      )

      if (result.success) {
        Alert.alert('Success', 'MR permissions updated successfully')
        setShowPermissionsModal(false)
        loadMRs()
      } else {
        Alert.alert('Error', result.error || 'Failed to update permissions')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update permissions')
    }
  }

  const handleDeactivateMR = (mr: MRData) => {
    Alert.alert(
      'Deactivate MR',
      `Are you sure you want to deactivate ${mr.first_name} ${mr.last_name}? This will make them inactive but keep their data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await AdminService.deactivateMR(mr.id)
              if (result.success) {
                Alert.alert('Success', 'MR deactivated successfully')
                loadMRs()
              } else {
                Alert.alert('Error', result.error || 'Failed to deactivate MR')
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to deactivate MR')
            }
          }
        }
      ]
    )
  }

  const handleDeleteMR = (mr: MRData) => {
    Alert.alert(
      'Permanently Delete MR',
      `Are you sure you want to PERMANENTLY DELETE ${mr.first_name} ${mr.last_name}? This action cannot be undone and will remove all their data including meetings, assignments, and permissions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: () => {
            // Double confirmation for permanent deletion
            Alert.alert(
              'Final Confirmation',
              `This will PERMANENTLY DELETE ${mr.first_name} ${mr.last_name} and ALL their data. This cannot be undone. Are you absolutely sure?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'DELETE PERMANENTLY',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const result = await AdminService.deleteMR(mr.id)
                      if (result.success) {
                        Alert.alert('Success', 'MR permanently deleted')
                        loadMRs()
                      } else {
                        Alert.alert('Error', result.error || 'Failed to delete MR')
                      }
                    } catch (error) {
                      Alert.alert('Error', 'Failed to delete MR')
                    }
                  }
                }
              ]
            )
          }
        }
      ]
    )
  }

  const renderMRCard = (mr: MRData) => (
    <View key={mr.id} style={styles.mrCard}>
      <View style={styles.mrHeader}>
        <View style={styles.mrInfo}>
          <Text style={styles.mrName}>
            {mr.first_name} {mr.last_name}
          </Text>
          <Text style={styles.mrEmail}>{mr.email}</Text>
          {mr.phone && <Text style={styles.mrPhone}>{mr.phone}</Text>}
        </View>
        <View style={styles.mrStatus}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: mr.is_active ? '#10b981' : '#ef4444' }
            ]}
          />
          <Text style={styles.statusText}>
            {mr.is_active ? 'Active' : 'Inactive'}
          </Text>
        </View>
      </View>

      <View style={styles.mrStats}>
        <View style={styles.statItem}>
          <Ionicons name="people" size={16} color="#6b7280" />
          <Text style={styles.statText}>{mr.doctors_count} Doctors</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="calendar" size={16} color="#6b7280" />
          <Text style={styles.statText}>{mr.meetings_count} Meetings</Text>
        </View>
      </View>

      <View style={styles.permissionsRow}>
        {mr.can_upload_brochures && (
          <View style={styles.permissionBadge}>
            <Ionicons name="document" size={12} color="#8b5cf6" />
            <Text style={styles.permissionText}>Brochures</Text>
          </View>
        )}
        {mr.can_manage_doctors && (
          <View style={styles.permissionBadge}>
            <Ionicons name="people" size={12} color="#8b5cf6" />
            <Text style={styles.permissionText}>Doctors</Text>
          </View>
        )}
        {mr.can_schedule_meetings && (
          <View style={styles.permissionBadge}>
            <Ionicons name="calendar" size={12} color="#8b5cf6" />
            <Text style={styles.permissionText}>Meetings</Text>
          </View>
        )}
      </View>

      <View style={styles.mrActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEditMR(mr)}
        >
          <Ionicons name="create-outline" size={14} color="#6b7280" />
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handlePermissions(mr)}
        >
          <Ionicons name="shield-outline" size={14} color="#6b7280" />
          <Text style={styles.actionText}>Permissions</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deactivateButton]}
          onPress={() => handleDeactivateMR(mr)}
        >
          <Ionicons name="pause-circle-outline" size={14} color="#f59e0b" />
          <Text style={[styles.actionText, styles.deactivateText]}>Deactivate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteMR(mr)}
        >
          <Ionicons name="trash-outline" size={14} color="#ef4444" />
          <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All MRs</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddMR')}
        >
          <Ionicons name="add" size={24} color="#8b5cf6" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading MRs...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {mrs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No MRs Found</Text>
              <Text style={styles.emptyDescription}>
                Start by adding your first medical representative
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigation.navigate('AddMR')}
              >
                <Text style={styles.emptyButtonText}>Add First MR</Text>
              </TouchableOpacity>
            </View>
          ) : (
            mrs.map(renderMRCard)
          )}
        </ScrollView>
      )}

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit MR Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>First Name</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.firstName}
                  onChangeText={(value) => setEditForm(prev => ({ ...prev, firstName: value }))}
                  placeholder="Enter first name"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.lastName}
                  onChangeText={(value) => setEditForm(prev => ({ ...prev, lastName: value }))}
                  placeholder="Enter last name"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.phone}
                  onChangeText={(value) => setEditForm(prev => ({ ...prev, phone: value }))}
                  placeholder="Enter phone number"
                  keyboardType="phone-pad"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Address</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editForm.address}
                  onChangeText={(value) => setEditForm(prev => ({ ...prev, address: value }))}
                  placeholder="Enter address"
                  multiline
                  numberOfLines={3}
                />
              </View>
              
              <View style={styles.switchGroup}>
                <Text style={styles.inputLabel}>Active Status</Text>
                <Switch
                  value={editForm.isActive}
                  onValueChange={(value) => setEditForm(prev => ({ ...prev, isActive: value }))}
                  trackColor={{ false: '#e5e7eb', true: '#8b5cf6' }}
                  thumbColor="#ffffff"
                />
              </View>
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleUpdateMR}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Permissions Modal */}
      <Modal visible={showPermissionsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Permissions</Text>
              <TouchableOpacity onPress={() => setShowPermissionsModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.permissionItem}>
                <View style={styles.permissionInfo}>
                  <Text style={styles.permissionTitle}>Upload Brochures</Text>
                  <Text style={styles.permissionDescription}>
                    Allow MR to upload and manage brochures
                  </Text>
                </View>
                <Switch
                  value={permissions.canUploadBrochures}
                  onValueChange={(value) => setPermissions(prev => ({ ...prev, canUploadBrochures: value }))}
                  trackColor={{ false: '#e5e7eb', true: '#8b5cf6' }}
                  thumbColor="#ffffff"
                />
              </View>
              
              <View style={styles.permissionItem}>
                <View style={styles.permissionInfo}>
                  <Text style={styles.permissionTitle}>Manage Doctors</Text>
                  <Text style={styles.permissionDescription}>
                    Allow MR to add and update doctor information
                  </Text>
                </View>
                <Switch
                  value={permissions.canManageDoctors}
                  onValueChange={(value) => setPermissions(prev => ({ ...prev, canManageDoctors: value }))}
                  trackColor={{ false: '#e5e7eb', true: '#8b5cf6' }}
                  thumbColor="#ffffff"
                />
              </View>
              
              <View style={styles.permissionItem}>
                <View style={styles.permissionInfo}>
                  <Text style={styles.permissionTitle}>Schedule Meetings</Text>
                  <Text style={styles.permissionDescription}>
                    Allow MR to schedule and manage meetings
                  </Text>
                </View>
                <Switch
                  value={permissions.canScheduleMeetings}
                  onValueChange={(value) => setPermissions(prev => ({ ...prev, canScheduleMeetings: value }))}
                  trackColor={{ false: '#e5e7eb', true: '#8b5cf6' }}
                  thumbColor="#ffffff"
                />
              </View>
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowPermissionsModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleUpdatePermissions}
              >
                <Text style={styles.saveButtonText}>Save Permissions</Text>
              </TouchableOpacity>
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
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  addButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  mrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  mrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  mrInfo: {
    flex: 1,
  },
  mrName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  mrEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  mrPhone: {
    fontSize: 14,
    color: '#6b7280',
  },
  mrStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  mrStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 14,
    color: '#6b7280',
  },
  permissionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  permissionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  permissionText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  mrActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f9fafb',
    gap: 3,
    flex: 1,
    minWidth: '22%',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  deactivateButton: {
    backgroundColor: '#fffbeb',
  },
  deactivateText: {
    color: '#f59e0b',
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
  },
  deleteText: {
    color: '#ef4444',
  },
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
    paddingHorizontal: 20,
    paddingVertical: 16,
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
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  permissionInfo: {
    flex: 1,
    marginRight: 16,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 14,
    color: '#6b7280',
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
})
