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
  FlatList,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { BrochureManagementService, BrochureSlide, SlideGroup } from '../../services/brochureManagementService'

interface SlideManagementScreenProps {
  navigation: any
  route: any
}

export default function SlideManagementScreen({ navigation, route }: SlideManagementScreenProps) {
  const { brochureId, brochureTitle } = route.params || {}
  
  const [slides, setSlides] = useState<BrochureSlide[]>([])
  const [groups, setGroups] = useState<SlideGroup[]>([])
  const [selectedSlide, setSelectedSlide] = useState<BrochureSlide | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showRenameGroupModal, setShowRenameGroupModal] = useState(false)
  const [showAlphabetFilter, setShowAlphabetFilter] = useState(false)
  const [showGroupSelectionModal, setShowGroupSelectionModal] = useState(false)
  const [newSlideTitle, setNewSlideTitle] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedSlides, setSelectedSlides] = useState<string[]>([])
  const [currentFilter, setCurrentFilter] = useState<'all' | string>('all')
  const [alphabetFilters, setAlphabetFilters] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [showCheckboxes, setShowCheckboxes] = useState(false)

  useEffect(() => {
    loadBrochureData()
  }, [])

  const loadBrochureData = async () => {
    setIsLoading(true)
    try {
      console.log('Loading brochure data for ID:', brochureId)
      const result = await BrochureManagementService.getBrochureData(brochureId)
      
      if (result.success && result.data) {
        console.log('Loaded brochure data:', result.data.slides.length, 'slides')
        setSlides(result.data.slides)
        setGroups(result.data.groups)
        if (result.data.slides.length > 0) {
          setSelectedSlide(result.data.slides[0])
        }
        
        // Generate alphabet filters from current slides
        const availableLetters = [...new Set(
          slides.map(slide => slide.title.charAt(0).toUpperCase())
        )].sort()
        setAlphabetFilters(availableLetters)
      } else {
        console.error('Failed to load brochure data:', result.error)
        Alert.alert('Error', result.error || 'Failed to load brochure data')
      }
    } catch (error) {
      console.error('Load brochure data error:', error)
      Alert.alert('Error', 'Failed to load brochure data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRenameSlide = async () => {
    if (selectedSlides.length === 0 || !newSlideTitle.trim()) return

    try {
      let successCount = 0
      
      // Rename all selected slides
      for (let i = 0; i < selectedSlides.length; i++) {
        const slideId = selectedSlides[i]
        // If multiple slides selected, append number to make titles unique
        const finalTitle = selectedSlides.length > 1 
          ? `${newSlideTitle.trim()} ${i + 1}`
          : newSlideTitle.trim()
          
        const result = await BrochureManagementService.updateSlideTitle(
          brochureId,
          slideId,
          finalTitle
        )
        
        if (result.success) {
          successCount++
        }
      }
      
      if (successCount > 0) {
        setShowRenameModal(false)
        setNewSlideTitle('')
        exitSelectionMode()
        loadBrochureData()
        
        const message = successCount === 1 
          ? 'Slide renamed successfully'
          : `${successCount} slides renamed successfully`
        Alert.alert('Success', message)
      } else {
        Alert.alert('Error', 'Failed to rename slides')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to rename slides')
    }
  }

  const handleSortAlphabetically = async () => {
    try {
      const result = await BrochureManagementService.sortSlidesAlphabetically(brochureId)
      if (result.success) {
        loadBrochureData()
        Alert.alert('Success', 'Slides sorted alphabetically')
      } else {
        Alert.alert('Error', result.error || 'Failed to sort slides')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sort slides')
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedSlides.length === 0) {
      Alert.alert('Error', 'Please enter group name and select slides')
      return
    }

    try {
      const result = await BrochureManagementService.createSlideGroup(
        brochureId,
        newGroupName.trim(),
        selectedSlides
      )
      
      if (result.success) {
        setShowGroupModal(false)
        setNewGroupName('')
        setSelectedSlides([])
        loadBrochureData()
        Alert.alert('Success', 'Group created successfully')
      } else {
        Alert.alert('Error', result.error || 'Failed to create group')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create group')
    }
  }

  const handleDeleteSlide = async (slide: BrochureSlide) => {
    Alert.alert(
      'Delete Slide',
      `Are you sure you want to delete "${slide.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await BrochureManagementService.deleteSlide(brochureId, slide.id)
            if (result.success) {
              loadBrochureData()
              Alert.alert('Success', 'Slide deleted successfully')
            } else {
              Alert.alert('Error', result.error || 'Failed to delete slide')
            }
          }
        }
      ]
    )
  }

  const getFilteredSlides = () => {
    if (selectedGroup) {
      return slides.filter(slide => slide.groupId === selectedGroup)
    }
    
    if (currentFilter === 'all') {
      return slides
    }
    
    return slides.filter(slide => 
      slide.title.toLowerCase().startsWith(currentFilter.toLowerCase())
    )
  }

  const toggleSlideSelection = (slideId: string) => {
    setSelectedSlides(prev => 
      prev.includes(slideId) 
        ? prev.filter(id => id !== slideId)
        : [...prev, slideId]
    )
  }

  const handleSlideLongPress = (slide: BrochureSlide) => {
    setShowCheckboxes(true)
    toggleSlideSelection(slide.id)
  }

  const handleSlidePress = (slide: BrochureSlide) => {
    if (showCheckboxes) {
      // If checkboxes are visible, clicking anywhere selects/deselects
      return
    } else {
      // Normal click - set as selected slide for preview
      setSelectedSlide(slide)
    }
  }

  const exitSelectionMode = () => {
    setShowCheckboxes(false)
    setSelectedSlides([])
  }

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return
    
    const group = groups.find(g => g.id === selectedGroup)
    if (!group) return
    
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete the group "${group.name}"? Slides will remain in the brochure.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
              if (!brochureData) return
              
              // Remove group assignment from all slides in this group
              brochureData.slides.forEach(slide => {
                if (slide.groupId === selectedGroup) {
                  delete slide.groupId
                  slide.updatedAt = new Date().toISOString()
                }
              })
              
              // Remove group from groups array
              brochureData.groups = brochureData.groups.filter(g => g.id !== selectedGroup)
              brochureData.updatedAt = new Date().toISOString()
              
              // Save updated data
              const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
              await FileSystem.writeAsStringAsync(
                `${brochureDir}brochure_data.json`,
                JSON.stringify(brochureData, null, 2)
              )
              
              setSelectedGroup(null)
              loadBrochureData()
              Alert.alert('Success', 'Group deleted successfully')
            } catch (error) {
              Alert.alert('Error', 'Failed to delete group')
            }
          }
        }
      ]
    )
  }

  const handleRenameGroup = async () => {
    if (!selectedGroup || !newGroupName.trim()) return
    
    try {
      const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
      if (!brochureData) return
      
      // Update group name
      const groupIndex = brochureData.groups.findIndex(g => g.id === selectedGroup)
      if (groupIndex !== -1) {
        brochureData.groups[groupIndex].name = newGroupName.trim()
        brochureData.updatedAt = new Date().toISOString()
        
        // Save updated data
        const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
        await FileSystem.writeAsStringAsync(
          `${brochureDir}brochure_data.json`,
          JSON.stringify(brochureData, null, 2)
        )
        
        setShowRenameGroupModal(false)
        setNewGroupName('')
        loadBrochureData()
        Alert.alert('Success', 'Group renamed successfully')
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to rename group')
    }
  }

  const handleAddSlide = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      })

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        const slideTitle = `New Slide ${slides.length + 1}`
        
        const addResult = await BrochureManagementService.addSlideImage(
          brochureId,
          asset.uri,
          slideTitle
        )
        
        if (addResult.success) {
          loadBrochureData()
          Alert.alert('Success', 'Slide added successfully')
        } else {
          Alert.alert('Error', addResult.error || 'Failed to add slide')
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add slide')
    }
  }

  const handleAddToExistingGroup = async (groupId: string) => {
    try {
      const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
      if (!brochureData) return
      
      // Find the group
      const groupIndex = brochureData.groups.findIndex(g => g.id === groupId)
      if (groupIndex === -1) return
      
      // Add new slides to group (avoid duplicates)
      const newSlideIds = selectedSlides.filter(slideId => 
        !brochureData.groups[groupIndex].slideIds.includes(slideId)
      )
      
      brochureData.groups[groupIndex].slideIds.push(...newSlideIds)
      
      // Update slides with group assignment
      newSlideIds.forEach(slideId => {
        const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
        if (slideIndex !== -1) {
          brochureData.slides[slideIndex].groupId = groupId
          brochureData.slides[slideIndex].updatedAt = new Date().toISOString()
        }
      })
      
      brochureData.updatedAt = new Date().toISOString()
      
      // Save updated data
      const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
      await FileSystem.writeAsStringAsync(
        `${brochureDir}brochure_data.json`,
        JSON.stringify(brochureData, null, 2)
      )
      
      setShowGroupSelectionModal(false)
      exitSelectionMode()
      loadBrochureData()
      Alert.alert('Success', `${newSlideIds.length} slides added to group`)
    } catch (error) {
      Alert.alert('Error', 'Failed to add slides to group')
    }
  }

  const handleDeleteSlides = async () => {
    if (selectedSlides.length === 0) {
      Alert.alert('Info', 'Select slides first by long pressing them')
      return
    }
    
    const slideCount = selectedSlides.length
    const slideText = slideCount === 1 ? 'slide' : 'slides'
    
    Alert.alert(
      'Delete Slides',
      `Are you sure you want to delete ${slideCount} ${slideText}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
              if (!brochureData) return
              
              let deletedCount = 0
              
              // Delete each selected slide
              for (const slideId of selectedSlides) {
                const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
                if (slideIndex !== -1) {
                  const slide = brochureData.slides[slideIndex]
                  
                  // Remove slide file if it exists
                  try {
                    if (slide.imageUri && slide.imageUri.startsWith('file://')) {
                      await FileSystem.deleteAsync(slide.imageUri, { idempotent: true })
                    }
                  } catch (fileError) {
                    console.log('File deletion error (non-critical):', fileError)
                  }
                  
                  // Remove from groups if it's in any group
                  brochureData.groups.forEach(group => {
                    group.slideIds = group.slideIds.filter(id => id !== slideId)
                  })
                  
                  // Remove slide from slides array
                  brochureData.slides.splice(slideIndex, 1)
                  deletedCount++
                }
              }
              
              // Update slide orders
              brochureData.slides.forEach((slide, index) => {
                slide.order = index + 1
                slide.updatedAt = new Date().toISOString()
              })
              
              brochureData.totalSlides = brochureData.slides.length
              brochureData.updatedAt = new Date().toISOString()
              
              // Save updated data
              const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
              await FileSystem.writeAsStringAsync(
                `${brochureDir}brochure_data.json`,
                JSON.stringify(brochureData, null, 2)
              )
              
              exitSelectionMode()
              loadBrochureData()
              
              const message = deletedCount === 1 
                ? 'Slide deleted successfully'
                : `${deletedCount} slides deleted successfully`
              Alert.alert('Success', message)
            } catch (error) {
              Alert.alert('Error', 'Failed to delete slides')
            }
          }
        }
      ]
    )
  }

  const handleRemoveFromGroup = async () => {
    if (selectedSlides.length === 0) {
      Alert.alert('Info', 'Select slides first to remove from group')
      return
    }
    
    Alert.alert(
      'Remove from Group', 
      `Remove ${selectedSlides.length} slides from this group? They will remain in the brochure.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          onPress: async () => {
            try {
              // Remove group assignment from selected slides
              const { data: brochureData } = await BrochureManagementService.getBrochureData(brochureId)
              if (!brochureData) {
                Alert.alert('Error', 'Brochure not found')
                return
              }
              
              // Update slides to remove group assignment
              selectedSlides.forEach(slideId => {
                const slideIndex = brochureData.slides.findIndex(slide => slide.id === slideId)
                if (slideIndex !== -1) {
                  delete brochureData.slides[slideIndex].groupId
                  brochureData.slides[slideIndex].updatedAt = new Date().toISOString()
                }
              })
              
              // Update group to remove slide IDs
              if (selectedGroup) {
                const groupIndex = brochureData.groups.findIndex(group => group.id === selectedGroup)
                if (groupIndex !== -1) {
                  brochureData.groups[groupIndex].slideIds = brochureData.groups[groupIndex].slideIds
                    .filter(slideId => !selectedSlides.includes(slideId))
                }
              }
              
              brochureData.updatedAt = new Date().toISOString()
              
              // Save updated data
              const brochureDir = `file:///data/user/0/com.ihaiderj.medicalapp.dev/files/brochures/${brochureId}/`
              await FileSystem.writeAsStringAsync(
                `${brochureDir}brochure_data.json`,
                JSON.stringify(brochureData, null, 2)
              )
              
              Alert.alert('Success', 'Slides removed from group successfully')
              exitSelectionMode()
              loadBrochureData()
            } catch (error) {
              Alert.alert('Error', 'Failed to remove slides from group')
            }
          }
        }
      ]
    )
  }

  const filteredSlides = getFilteredSlides()

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
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>{brochureTitle}</Text>
          <Text style={styles.headerSubtitle}>
            {slides.length} slides • {groups.length} groups
          </Text>
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setShowAlphabetFilter(!showAlphabetFilter)}
        >
          <Ionicons name="filter" size={24} color="#8b5cf6" />
        </TouchableOpacity>
      </View>

      {/* Alphabet Filter */}
      {showAlphabetFilter && (
        <View style={styles.alphabetFilter}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.filterButton, currentFilter === 'all' && styles.filterButtonActive]}
              onPress={() => {
                setCurrentFilter('all')
                setSelectedGroup(null)
              }}
            >
              <Text style={[styles.filterButtonText, currentFilter === 'all' && styles.filterButtonTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            
            {/* Only show alphabets that have corresponding slides */}
            {(() => {
              // Get unique starting letters from slide titles
              const availableLetters = [...new Set(
                slides.map(slide => slide.title.charAt(0).toUpperCase())
              )].sort()
              
              return availableLetters.map(letter => (
                <TouchableOpacity
                  key={letter}
                  style={[
                    styles.filterButton, 
                    currentFilter === letter && styles.filterButtonActive
                  ]}
                  onPress={() => {
                    setCurrentFilter(letter)
                    setSelectedGroup(null)
                  }}
                >
                  <Text style={[
                    styles.filterButtonText, 
                    currentFilter === letter && styles.filterButtonTextActive
                  ]}>
                    {letter}
                  </Text>
                </TouchableOpacity>
              ))
            })()}
          </ScrollView>
        </View>
      )}

      {/* Groups Filter */}
      {groups.length > 0 && (
        <View style={styles.groupsFilter}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[
                styles.groupButton, 
                !selectedGroup && styles.groupButtonActive,
                { backgroundColor: !selectedGroup ? '#8b5cf6' : '#f3f4f6' }
              ]}
              onPress={() => {
                setSelectedGroup(null)
                setCurrentFilter('all')
              }}
            >
              <Text style={[styles.groupButtonText, !selectedGroup && styles.groupButtonTextActive]}>
                All Slides
              </Text>
            </TouchableOpacity>
            {groups.map(group => (
              <TouchableOpacity
                key={group.id}
                style={[
                  styles.groupButton, 
                  selectedGroup === group.id && styles.groupButtonActive,
                  { backgroundColor: selectedGroup === group.id ? group.color : '#f3f4f6' }
                ]}
                onPress={() => {
                  setSelectedGroup(group.id)
                  setCurrentFilter('all')
                }}
              >
                <Text style={[styles.groupButtonText, selectedGroup === group.id && styles.groupButtonTextActive]}>
                  {group.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionBarContainer}>
        {showCheckboxes && (
          <TouchableOpacity
            style={styles.exitSelectionButton}
            onPress={exitSelectionMode}
          >
            <Ionicons name="close" size={18} color="#6b7280" />
            <Text style={styles.exitSelectionText}>Cancel</Text>
          </TouchableOpacity>
        )}
        
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.actionBar}
          contentContainerStyle={styles.actionBarContent}
        >
          {!selectedGroup && (
            <>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleSortAlphabetically}
              >
                <Ionicons name="swap-vertical" size={18} color="#8b5cf6" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => {
                  if (selectedSlides.length === 0) {
                    Alert.alert('Info', 'Select slides first by long pressing them')
                    return
                  }
                  setShowGroupSelectionModal(true)
                }}
              >
                <Ionicons name="albums" size={18} color="#8b5cf6" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleAddSlide}
              >
                <Ionicons name="add-circle" size={18} color="#8b5cf6" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => {
                  if (selectedSlides.length === 0) {
                    Alert.alert('Info', 'Select slides first by long pressing them')
                    return
                  }
                  // If only one slide selected, show its current title
                  if (selectedSlides.length === 1) {
                    const slideToRename = slides.find(slide => slide.id === selectedSlides[0])
                    setNewSlideTitle(slideToRename?.title || '')
                  } else {
                    // If multiple slides selected, show generic title
                    setNewSlideTitle('')
                  }
                  setShowRenameModal(true)
                }}
              >
                <Ionicons name="create" size={18} color="#6b7280" />
              </TouchableOpacity>
            </>
          )}
          
          {selectedGroup ? (
            <>
              <TouchableOpacity
                style={styles.groupActionButton}
                onPress={() => {
                  const group = groups.find(g => g.id === selectedGroup)
                  if (group) {
                    setNewGroupName(group.name)
                    setShowRenameGroupModal(true)
                  }
                }}
              >
                <Ionicons name="create" size={18} color="#8b5cf6" />
                <Text style={styles.groupActionText}>Rename Group</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.groupActionButton}
                onPress={() => handleDeleteGroup()}
              >
                <Ionicons name="trash" size={18} color="#ef4444" />
                <Text style={[styles.groupActionText, styles.deleteGroupText]}>Delete Group</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.removeFromGroupTextButton}
                onPress={handleRemoveFromGroup}
              >
                <Ionicons name="remove-circle" size={18} color="#f59e0b" />
                <Text style={styles.removeFromGroupText}>Remove from Group</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.iconButton, styles.deleteIconButton]}
              onPress={handleDeleteSlides}
            >
              <Ionicons name="trash" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
          <Text style={styles.loadingText}>Loading slides...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Slides List */}
          <View style={styles.slidesList}>
            <Text style={styles.sectionTitle}>
              Slides ({filteredSlides.length})
            </Text>
            <FlatList
              data={filteredSlides}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.slideItem,
                    selectedSlide?.id === item.id && !showCheckboxes && styles.slideItemActive,
                    selectedSlides.includes(item.id) && styles.slideItemSelected
                  ]}
                  onPress={() => handleSlidePress(item)}
                  onLongPress={() => handleSlideLongPress(item)}
                >
                  <View style={styles.slideContent}>
                    <Image source={{ uri: item.imageUri }} style={styles.slideThumb} />
                    
                    {/* Checkbox and View overlay */}
                    {showCheckboxes && (
                      <View style={styles.overlayContainer}>
                        <TouchableOpacity
                          style={styles.viewIconContainer}
                          onPress={() => setSelectedSlide(item)}
                        >
                          <View style={styles.viewIcon}>
                            <Ionicons name="eye" size={14} color="#8b5cf6" />
                          </View>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={styles.checkboxContainer}
                          onPress={() => toggleSlideSelection(item.id)}
                        >
                          <View style={[
                            styles.checkbox,
                            selectedSlides.includes(item.id) && styles.checkboxSelected
                          ]}>
                            {selectedSlides.includes(item.id) && (
                              <Ionicons name="checkmark" size={16} color="#ffffff" />
                            )}
                          </View>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.slideInfo}>
                    <Text style={styles.slideTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.slideOrder}>#{item.order}</Text>
                  </View>
                </TouchableOpacity>
              )}
              style={styles.slidesList}
            />
          </View>

          {/* Selected Slide Preview */}
          <View style={styles.slidePreview}>
            {selectedSlide ? (
              <>
                <Text style={styles.previewBrochureTitle}>{brochureTitle}</Text>
                <Image source={{ uri: selectedSlide.imageUri }} style={styles.previewImage} />
                <Text style={styles.previewSlideNumber}>Slide #{selectedSlide.order}</Text>
                <Text style={styles.previewSlideTitle}>{selectedSlide.title}</Text>
              </>
            ) : (
              <View style={styles.noPreview}>
                <Ionicons name="image-outline" size={48} color="#d1d5db" />
                <Text style={styles.noPreviewText}>Select a slide to preview</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Rename Modal */}
      <Modal visible={showRenameModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedSlides.length === 1 ? 'Rename Slide' : `Rename ${selectedSlides.length} Slides`}
              </Text>
              <TouchableOpacity onPress={() => setShowRenameModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>
                {selectedSlides.length === 1 
                  ? 'Slide Title' 
                  : 'Base Title (numbers will be added automatically)'
                }
              </Text>
              <TextInput
                style={styles.input}
                value={newSlideTitle}
                onChangeText={setNewSlideTitle}
                placeholder={selectedSlides.length === 1 
                  ? "Enter slide title" 
                  : "Enter base title"
                }
                autoFocus
              />
              {selectedSlides.length > 1 && (
                <Text style={styles.helpText}>
                  Example: "Product" will become "Product 1", "Product 2", etc.
                </Text>
              )}
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowRenameModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleRenameSlide}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Group Creation Modal */}
      <Modal visible={showGroupModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Group</Text>
              <TouchableOpacity onPress={() => setShowGroupModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Group Name</Text>
              <TextInput
                style={styles.input}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="Enter group name"
                autoFocus
              />
              
              <Text style={styles.inputLabel}>Selected Slides ({selectedSlides.length})</Text>
              <Text style={styles.helpText}>
                Long press slides in the main view to select them for grouping
              </Text>
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowGroupModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleCreateGroup}
              >
                <Text style={styles.saveButtonText}>Create Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Group Selection Modal */}
      <Modal visible={showGroupSelectionModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Group</Text>
              <TouchableOpacity onPress={() => setShowGroupSelectionModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>
                {selectedSlides.length} slides selected
              </Text>
              
              <TouchableOpacity
                style={styles.groupOptionButton}
                onPress={() => {
                  setShowGroupSelectionModal(false)
                  setShowGroupModal(true)
                }}
              >
                <Ionicons name="add-circle" size={20} color="#8b5cf6" />
                <Text style={styles.groupOptionText}>Create New Group</Text>
              </TouchableOpacity>
              
              {groups.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>Or add to existing group:</Text>
                  {groups.map(group => (
                    <TouchableOpacity
                      key={group.id}
                      style={styles.existingGroupButton}
                      onPress={() => handleAddToExistingGroup(group.id)}
                    >
                      <View 
                        style={[styles.groupColorIndicator, { backgroundColor: group.color }]}
                      />
                      <Text style={styles.existingGroupText}>{group.name}</Text>
                      <Text style={styles.existingGroupCount}>
                        {group.slideIds.length} slides
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Group Modal */}
      <Modal visible={showRenameGroupModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename Group</Text>
              <TouchableOpacity onPress={() => setShowRenameGroupModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Group Name</Text>
              <TextInput
                style={styles.input}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="Enter group name"
                autoFocus
              />
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowRenameGroupModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleRenameGroup}
              >
                <Text style={styles.saveButtonText}>Save</Text>
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
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  menuButton: {
    padding: 8,
  },
  alphabetFilter: {
    backgroundColor: '#f9fafb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  filterButtonActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  groupsFilter: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  groupButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  groupButtonActive: {
    borderColor: '#8b5cf6',
  },
  groupButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  groupButtonTextActive: {
    color: '#ffffff',
  },
  actionBar: {
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 8,
    maxHeight: 60,
  },
  actionBarContent: {
    paddingHorizontal: 20,
    gap: 8,
    alignItems: 'center',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIconButton: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  removeFromGroupButton: {
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
  },
  removeFromGroupTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
    gap: 6,
  },
  removeFromGroupText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f59e0b',
  },
  groupActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    gap: 4,
  },
  groupActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  deleteGroupText: {
    color: '#ef4444',
  },
  groupOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8,
    marginBottom: 16,
  },
  groupOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  existingGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
    gap: 12,
  },
  groupColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  existingGroupText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  existingGroupCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  actionBarContainer: {
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  exitSelectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 6,
  },
  exitSelectionText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  slidesList: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  slideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  slideItemActive: {
    backgroundColor: '#f0f9ff',
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  slideItemSelected: {
    backgroundColor: '#fef3c7',
  },
  slideContent: {
    position: 'relative',
  },
  overlayContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    gap: 6,
    zIndex: 1,
  },
  viewIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  viewIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  slideThumb: {
    width: 60,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#f3f4f6',
    marginRight: 12,
  },
  slideInfo: {
    flex: 1,
  },
  slideTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  slideOrder: {
    fontSize: 12,
    color: '#6b7280',
  },
  slidePreview: {
    flex: 1.5,
    backgroundColor: '#f9fafb',
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
    padding: 16,
    alignItems: 'center',
  },
  previewBrochureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  previewSlideNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8b5cf6',
    marginBottom: 8,
    textAlign: 'center',
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    marginBottom: 16,
  },
  previewSlideTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  noPreview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noPreviewText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
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
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontStyle: 'italic',
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

