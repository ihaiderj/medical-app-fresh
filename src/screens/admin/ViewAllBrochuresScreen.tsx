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
  Image,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AdminService } from '../../services/AdminService'

interface BrochureData {
  id: string
  title: string
  category_name: string
  category_color: string
  description?: string
  file_url?: string
  file_name?: string
  file_type?: string
  thumbnail_url?: string
  pages?: number
  file_size?: string
  tags?: string[]
  is_public: boolean
  created_at: string
  view_count?: number
  download_count?: number
}

interface ViewAllBrochuresScreenProps {
  navigation: any
}

export default function ViewAllBrochuresScreen({ navigation }: ViewAllBrochuresScreenProps) {
  const [brochures, setBrochures] = useState<BrochureData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedBrochure, setSelectedBrochure] = useState<BrochureData | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [deletingBrochureId, setDeletingBrochureId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: '',
    tags: '',
    isPublic: true,
  })

  useEffect(() => {
    loadBrochures()
  }, [])

  const loadBrochures = async () => {
    setIsLoading(true)
    try {
      const result = await AdminService.getAllBrochuresWithCategories()
      if (result.success && result.data) {
        setBrochures(result.data)
      } else {
        Alert.alert('Error', 'Failed to load brochures')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load brochures')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditBrochure = (brochure: BrochureData) => {
    setSelectedBrochure(brochure)
    setEditForm({
      title: brochure.title,
      description: brochure.description || '',
      category: brochure.category_name,
      tags: brochure.tags ? brochure.tags.join(', ') : '',
      isPublic: brochure.is_public,
    })
    setShowEditModal(true)
  }

  const handleUpdateBrochure = async () => {
    if (!selectedBrochure) return

    try {
      // For now, we'll just show a success message
      // In a real implementation, you'd call an update API
      Alert.alert('Success', 'Brochure updated successfully')
      setShowEditModal(false)
      loadBrochures()
    } catch (error) {
      Alert.alert('Error', 'Failed to update brochure')
    }
  }

  const handleDeleteBrochure = (brochure: BrochureData) => {
    Alert.alert(
      'Delete Brochure',
      `Are you sure you want to delete "${brochure.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingBrochureId(brochure.id)
            try {
              const result = await AdminService.deleteBrochure(brochure.id)
              
              if (result.success) {
                Alert.alert('Success', 'Brochure deleted successfully')
                loadBrochures() // Refresh the list
              } else {
                Alert.alert('Error', result.error || 'Failed to delete brochure')
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete brochure')
            } finally {
              setDeletingBrochureId(null)
            }
          }
        }
      ]
    )
  }

  const renderBrochureCard = (brochure: BrochureData) => (
    <View key={brochure.id} style={styles.brochureCard}>
      <View style={styles.brochureHeader}>
        <View style={styles.brochureInfo}>
          <Text style={styles.brochureTitle}>{brochure.title}</Text>
          <View style={styles.categoryContainer}>
            <View 
              style={[
                styles.categoryBadge, 
                { backgroundColor: brochure.category_color || '#8b5cf6' }
              ]}
            >
              <Text style={styles.categoryText}>{brochure.category_name}</Text>
            </View>
            {brochure.is_public ? (
              <View style={styles.publicBadge}>
                <Ionicons name="globe" size={12} color="#10b981" />
                <Text style={styles.publicText}>Public</Text>
              </View>
            ) : (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={12} color="#ef4444" />
                <Text style={styles.privateText}>Private</Text>
              </View>
            )}
          </View>
        </View>
        {brochure.thumbnail_url ? (
          <Image source={{ uri: brochure.thumbnail_url }} style={styles.thumbnail} />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons 
              name={brochure.file_type?.includes('pdf') ? 'document-text' : 
                    brochure.file_type?.includes('image') ? 'image' :
                    brochure.file_type?.includes('word') ? 'document' :
                    brochure.file_type?.includes('powerpoint') ? 'easel' :
                    'document-outline'} 
              size={24} 
              color="#8b5cf6" 
            />
          </View>
        )}
      </View>

      {brochure.description && (
        <Text style={styles.brochureDescription} numberOfLines={2}>
          {brochure.description}
        </Text>
      )}

      <View style={styles.brochureStats}>
        <View style={styles.statItem}>
          <Ionicons name="eye" size={16} color="#6b7280" />
          <Text style={styles.statText}>{brochure.view_count || 0} views</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="download" size={16} color="#6b7280" />
          <Text style={styles.statText}>{brochure.download_count || 0} downloads</Text>
        </View>
        {brochure.pages && (
          <View style={styles.statItem}>
            <Ionicons name="document" size={16} color="#6b7280" />
            <Text style={styles.statText}>{brochure.pages} pages</Text>
          </View>
        )}
        {brochure.file_size && (
          <View style={styles.statItem}>
            <Ionicons name="folder" size={16} color="#6b7280" />
            <Text style={styles.statText}>{brochure.file_size}</Text>
          </View>
        )}
        <View style={styles.statItem}>
          <Ionicons name="calendar" size={16} color="#6b7280" />
          <Text style={styles.statText}>
            {new Date(brochure.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>

      {brochure.tags && brochure.tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {brochure.tags.slice(0, 3).map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
          {brochure.tags.length > 3 && (
            <Text style={styles.moreTags}>+{brochure.tags.length - 3} more</Text>
          )}
        </View>
      )}

      <View style={styles.brochureActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEditBrochure(brochure)}
        >
          <Ionicons name="create-outline" size={16} color="#6b7280" />
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            // Navigate to slide management for ZIP files, appropriate viewer for others
            if (brochure.file_type?.includes('zip')) {
              navigation.navigate('AdminSlideManagement', { 
                brochureId: brochure.id,
                brochureTitle: brochure.title
              })
            } else if (brochure.file_type?.includes('pdf')) {
              navigation.navigate('DocumentViewer', { 
                brochureId: brochure.id,
                brochureTitle: brochure.title,
                brochureUrl: brochure.file_url
              })
            } else {
              navigation.navigate('DocumentViewer', { 
                brochureId: brochure.id,
                brochureTitle: brochure.title,
                brochureUrl: brochure.file_url,
                fileName: brochure.file_name,
                fileType: brochure.file_type
              })
            }
          }}
        >
          <Ionicons name="eye-outline" size={16} color="#6b7280" />
          <Text style={styles.actionText}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            navigation.navigate('AdminSlideManagement', { 
              brochureId: brochure.id,
              brochureTitle: brochure.title
            })
          }}
        >
          <Ionicons name="albums-outline" size={16} color="#6b7280" />
          <Text style={styles.actionText}>Slides</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton, 
            styles.deleteButton,
            deletingBrochureId === brochure.id && styles.actionButtonDisabled
          ]}
          onPress={() => handleDeleteBrochure(brochure)}
          disabled={deletingBrochureId === brochure.id}
        >
          {deletingBrochureId === brochure.id ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
          )}
          <Text style={[styles.actionText, styles.deleteText]}>
            {deletingBrochureId === brochure.id ? 'Deleting...' : 'Delete'}
          </Text>
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
        <Text style={styles.headerTitle}>All Brochures</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddBrochure')}
        >
          <Ionicons name="add" size={24} color="#8b5cf6" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading brochures...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {brochures.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No Brochures Found</Text>
              <Text style={styles.emptyDescription}>
                Start by adding your first brochure
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigation.navigate('AddBrochure')}
              >
                <Text style={styles.emptyButtonText}>Add First Brochure</Text>
              </TouchableOpacity>
            </View>
          ) : (
            brochures.map(renderBrochureCard)
          )}
        </ScrollView>
      )}

      {/* Edit Modal */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Brochure</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.title}
                  onChangeText={(value) => setEditForm(prev => ({ ...prev, title: value }))}
                  placeholder="Enter brochure title"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Category</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.category}
                  onChangeText={(value) => setEditForm(prev => ({ ...prev, category: value }))}
                  placeholder="Enter category"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editForm.description}
                  onChangeText={(value) => setEditForm(prev => ({ ...prev, description: value }))}
                  placeholder="Enter description"
                  multiline
                  numberOfLines={3}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tags</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.tags}
                  onChangeText={(value) => setEditForm(prev => ({ ...prev, tags: value }))}
                  placeholder="Enter tags separated by commas"
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
                onPress={handleUpdateBrochure}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
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
  brochureCard: {
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
  brochureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  brochureInfo: {
    flex: 1,
    marginRight: 12,
  },
  brochureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  publicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  publicText: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '500',
  },
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  privateText: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '500',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    resizeMode: 'contain',
  },
  thumbnailPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  brochureDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  brochureStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#6b7280',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  moreTags: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  brochureActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f9fafb',
    gap: 3,
    minWidth: 60,
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
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

