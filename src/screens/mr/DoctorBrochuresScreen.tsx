import React, { useState, useCallback, useRef } from "react"
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Image,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { StatusBar } from "expo-status-bar"
import { useFocusEffect } from "@react-navigation/native"
import {
  BrochureManagementService,
  BrochureData,
  BrochureSlide,
  SlideGroup,
} from "../../services/brochureManagementService"
import { LocalDatabaseService } from "../../services/localDatabaseService"
import { useAppData } from "../../context/AppDataContext"
import { FilePathUtils } from "../../utils/filePathUtils"
import * as FileSystem from "expo-file-system"

interface DoctorBrochuresScreenProps {
  navigation: any
  route: any
}

interface BrochureWithGroups {
  brochure: BrochureData
  groups: SlideGroup[]
}

type ManageTarget = {
  brochure: BrochureData
  group: SlideGroup
}

export default function DoctorBrochuresScreen({ navigation, route }: DoctorBrochuresScreenProps) {
  const { doctorId, doctorName } = route.params || {}
  const { notifyActivityChange, notifyBrochureChange } = useAppData()

  const [brochuresWithGroups, setBrochuresWithGroups] = useState<BrochureWithGroups[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [renameTarget, setRenameTarget] = useState<ManageTarget | null>(null)
  const [renameText, setRenameText] = useState("")
  const [showRenameModal, setShowRenameModal] = useState(false)

  const [manageTarget, setManageTarget] = useState<ManageTarget | null>(null)
  const [showManageModal, setShowManageModal] = useState(false)
  const [groupSlides, setGroupSlides] = useState<BrochureSlide[]>([])
  const [availableSlides, setAvailableSlides] = useState<BrochureSlide[]>([])
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])
  const [showAddSlidesPanel, setShowAddSlidesPanel] = useState(false)

  const [editSlideTarget, setEditSlideTarget] = useState<BrochureSlide | null>(null)
  const [editSlideTitle, setEditSlideTitle] = useState("")
  const [showEditSlideModal, setShowEditSlideModal] = useState(false)

  const [showFullscreenPicker, setShowFullscreenPicker] = useState(false)
  const [fullscreenIndex, setFullscreenIndex] = useState(0)
  const fullscreenListRef = useRef<FlatList<BrochureSlide>>(null)

  const [isBusy, setIsBusy] = useState(false)
  const screenWidth = Dimensions.get("window").width

  const openFullscreenPicker = (index: number) => {
    setFullscreenIndex(index)
    setShowFullscreenPicker(true)
  }

  const onFullscreenScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / screenWidth)
    if (next >= 0 && next < availableSlides.length) {
      setFullscreenIndex(next)
    }
  }

  const afterMutation = async () => {
    notifyActivityChange()
    notifyBrochureChange()
    await loadDoctorBrochures()
  }

  const doctorIdsMatch = async (groupDoctorId: string | undefined, localDoctorId: string) => {
    if (!groupDoctorId || !localDoctorId) return false
    if (groupDoctorId === localDoctorId) return true
    try {
      const localServer = await LocalDatabaseService.resolveDoctorServerId(localDoctorId)
      if (localServer && groupDoctorId === localServer) return true
      const groupServer = await LocalDatabaseService.resolveDoctorServerId(groupDoctorId)
      if (localServer && groupServer && localServer === groupServer) return true
    } catch {
      // ignore
    }
    return false
  }

  const loadDoctorBrochures = async () => {
    try {
      setIsLoading(true)

      const brochuresDir = `${FileSystem.documentDirectory}brochures/`
      const dirInfo = await FileSystem.getInfoAsync(brochuresDir)
      if (!dirInfo.exists) {
        setBrochuresWithGroups([])
        return
      }

      const brochureDirs = await FileSystem.readDirectoryAsync(brochuresDir)
      const brochuresWithDoctorGroups: BrochureWithGroups[] = []

      for (const brochureDir of brochureDirs) {
        const brochureId = brochureDir
        const result = await BrochureManagementService.getBrochureData(brochureId)

        if (result.success && result.data) {
          const brochure = result.data
          const doctorGroups: SlideGroup[] = []
          for (const group of brochure.groups || []) {
            if (await doctorIdsMatch(group.doctorId, doctorId)) {
              doctorGroups.push(group)
            }
          }

          if (doctorGroups.length > 0) {
            brochuresWithDoctorGroups.push({ brochure, groups: doctorGroups })
          }
        }
      }

      setBrochuresWithGroups(brochuresWithDoctorGroups)
    } catch (error) {
      console.error("Error loading doctor brochures:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadDoctorBrochures()
    }, [doctorId]),
  )

  const handleViewGroup = (brochure: BrochureData, group: SlideGroup) => {
    navigation.navigate("DoctorGroupViewer", {
      brochureId: brochure.id,
      brochureTitle: brochure.title,
      groupId: group.id,
      groupName: group.name,
      slideIds: group.slideIds,
      doctorName,
    })
  }

  const openGroupActions = (brochure: BrochureData, group: SlideGroup) => {
    Alert.alert(group.name, "Choose an action", [
      { text: "View slides", onPress: () => handleViewGroup(brochure, group) },
      {
        text: "Manage slides",
        onPress: () => openManageSlides(brochure, group),
      },
      {
        text: "Rename group",
        onPress: () => {
          setRenameTarget({ brochure, group })
          setRenameText(group.name)
          setShowRenameModal(true)
        },
      },
      {
        text: "Delete group",
        style: "destructive",
        onPress: () => confirmDeleteGroup(brochure, group),
      },
      { text: "Cancel", style: "cancel" },
    ])
  }

  const confirmDeleteGroup = (brochure: BrochureData, group: SlideGroup) => {
    Alert.alert(
      "Delete Group",
      `Delete "${group.name}"? Slides stay in the brochure.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsBusy(true)
            try {
              const result = await BrochureManagementService.deleteSlideGroup(
                brochure.id,
                group.id,
              )
              if (result.success) {
                if (manageTarget?.group.id === group.id) {
                  setShowManageModal(false)
                  setManageTarget(null)
                }
                await afterMutation()
                Alert.alert("Success", "Group deleted")
              } else {
                Alert.alert("Error", result.error || "Failed to delete group")
              }
            } catch (error) {
              console.error("Delete group error:", error)
              Alert.alert("Error", "Failed to delete group")
            } finally {
              setIsBusy(false)
            }
          },
        },
      ],
    )
  }

  const handleRenameGroup = async () => {
    if (!renameTarget || !renameText.trim()) {
      Alert.alert("Error", "Enter a group name")
      return
    }
    setIsBusy(true)
    try {
      const result = await BrochureManagementService.renameSlideGroup(
        renameTarget.brochure.id,
        renameTarget.group.id,
        renameText.trim(),
      )
      if (result.success) {
        setShowRenameModal(false)
        setRenameTarget(null)
        await afterMutation()
        Alert.alert("Success", "Group renamed")
      } else {
        Alert.alert("Error", result.error || "Failed to rename group")
      }
    } catch (error) {
      console.error("Rename group error:", error)
      Alert.alert("Error", "Failed to rename group")
    } finally {
      setIsBusy(false)
    }
  }

  const refreshManageSlides = async (brochure: BrochureData, group: SlideGroup) => {
    const dataResult = await BrochureManagementService.getBrochureData(brochure.id)
    if (!dataResult.success || !dataResult.data) {
      setGroupSlides([])
      setAvailableSlides([])
      return
    }
    const fresh = dataResult.data
    const freshGroup = fresh.groups.find((g) => g.id === group.id) || group
    setManageTarget({ brochure: fresh, group: freshGroup })

    const inGroup = fresh.slides.filter(
      (slide) =>
        freshGroup.slideIds.includes(slide.id) ||
        slide.groupIds?.includes(freshGroup.id) ||
        slide.groupId === freshGroup.id,
    )
    const notInGroup = fresh.slides.filter((slide) => !inGroup.some((g) => g.id === slide.id))

    setGroupSlides(inGroup)
    setAvailableSlides(notInGroup)
  }

  const openManageSlides = async (brochure: BrochureData, group: SlideGroup) => {
    setManageTarget({ brochure, group })
    setSelectedToAdd([])
    setShowAddSlidesPanel(false)
    setShowManageModal(true)
    await refreshManageSlides(brochure, group)
  }

  const handleRemoveSlideFromGroup = (slide: BrochureSlide) => {
    if (!manageTarget) return
    Alert.alert(
      "Remove from Group",
      `Remove "${slide.title}" from this group? The slide stays in the brochure.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setIsBusy(true)
            try {
              const result = await BrochureManagementService.removeSlidesFromGroup(
                manageTarget.brochure.id,
                manageTarget.group.id,
                [slide.id],
              )
              if (result.success) {
                notifyActivityChange()
                notifyBrochureChange()
                await refreshManageSlides(manageTarget.brochure, manageTarget.group)
                await loadDoctorBrochures()
              } else {
                Alert.alert("Error", result.error || "Failed to remove slide")
              }
            } catch (error) {
              console.error("Remove slide error:", error)
              Alert.alert("Error", "Failed to remove slide")
            } finally {
              setIsBusy(false)
            }
          },
        },
      ],
    )
  }

  const toggleAddSlide = (slideId: string) => {
    setSelectedToAdd((prev) =>
      prev.includes(slideId) ? prev.filter((id) => id !== slideId) : [...prev, slideId],
    )
  }

  const handleAddSelectedSlides = async () => {
    if (!manageTarget || selectedToAdd.length === 0) {
      Alert.alert("Info", "Select at least one slide to add")
      return
    }
    setIsBusy(true)
    try {
      const result = await BrochureManagementService.addSlidesToGroup(
        manageTarget.brochure.id,
        manageTarget.group.id,
        selectedToAdd,
      )
      if (result.success) {
        setSelectedToAdd([])
        setShowAddSlidesPanel(false)
        notifyActivityChange()
        notifyBrochureChange()
        await refreshManageSlides(manageTarget.brochure, manageTarget.group)
        await loadDoctorBrochures()
        Alert.alert("Success", `Added ${result.addedCount || 0} slide(s)`)
      } else {
        Alert.alert("Error", result.error || "Failed to add slides")
      }
    } catch (error) {
      console.error("Add slides error:", error)
      Alert.alert("Error", "Failed to add slides")
    } finally {
      setIsBusy(false)
    }
  }

  const openEditSlide = (slide: BrochureSlide) => {
    setEditSlideTarget(slide)
    setEditSlideTitle(slide.title || "")
    setShowEditSlideModal(true)
  }

  const handleSaveSlideTitle = async () => {
    if (!manageTarget || !editSlideTarget || !editSlideTitle.trim()) {
      Alert.alert("Error", "Enter a slide title")
      return
    }
    setIsBusy(true)
    try {
      const result = await BrochureManagementService.updateSlideTitle(
        manageTarget.brochure.id,
        editSlideTarget.id,
        editSlideTitle.trim(),
      )
      if (result.success) {
        setShowEditSlideModal(false)
        setEditSlideTarget(null)
        notifyActivityChange()
        notifyBrochureChange()
        await refreshManageSlides(manageTarget.brochure, manageTarget.group)
        await loadDoctorBrochures()
        Alert.alert("Success", "Slide renamed")
      } else {
        Alert.alert("Error", result.error || "Failed to rename slide")
      }
    } catch (error) {
      console.error("Rename slide error:", error)
      Alert.alert("Error", "Failed to rename slide")
    } finally {
      setIsBusy(false)
    }
  }

  const getSlideThumb = (brochureId: string, slide: BrochureSlide) => {
    if (slide.fileName) {
      return { uri: FilePathUtils.getSlideImagePath(brochureId, slide.fileName) }
    }
    if (slide.imageUri) {
      const uri = slide.imageUri.startsWith("file://")
        ? slide.imageUri
        : `file://${slide.imageUri}`
      return { uri }
    }
    return require("../../../public/placeholder.jpg")
  }

  const renderBrochureItem = ({ item }: { item: BrochureWithGroups }) => (
    <View style={styles.brochureCard}>
      <View style={styles.brochureHeader}>
        <Ionicons name="folder-outline" size={24} color="#8b5cf6" />
        <Text style={styles.brochureTitle}>{item.brochure.title}</Text>
      </View>

      <View style={styles.groupsList}>
        {item.groups.map((group) => (
          <View key={group.id} style={styles.groupItem}>
            <TouchableOpacity
              style={styles.groupMainPress}
              onPress={() => handleViewGroup(item.brochure, group)}
              onLongPress={() => openGroupActions(item.brochure, group)}
            >
              <View style={styles.groupInfo}>
                <View style={[styles.groupColorDot, { backgroundColor: group.color }]} />
                <View style={styles.groupDetails}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.groupSlideCount}>
                    {group.slideIds.length} slide{group.slideIds.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.groupMenuButton}
              onPress={() => openGroupActions(item.brochure, group)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-vertical" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{doctorName}</Text>
            <Text style={styles.headerSubtitle}>Brochure Groups</Text>
          </View>
          <View style={styles.headerActions} />
        </View>

        {isLoading || isBusy ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>
              {isBusy ? "Updating…" : "Loading brochures..."}
            </Text>
          </View>
        ) : brochuresWithGroups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="albums-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No Brochure Groups</Text>
            <Text style={styles.emptyMessage}>
              No brochures have been grouped for {doctorName} yet.
            </Text>
          </View>
        ) : (
          <FlatList
            data={brochuresWithGroups}
            renderItem={renderBrochureItem}
            keyExtractor={(item) => item.brochure.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      {/* Rename group */}
      <Modal visible={showRenameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename Group</Text>
            <TextInput
              style={styles.modalInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Group name"
              placeholderTextColor="#9ca3af"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowRenameModal(false)
                  setRenameTarget(null)
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleRenameGroup}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manage slides in group */}
      <Modal
        visible={showManageModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.manageModalCard]}>
            <View style={styles.manageHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{manageTarget?.group.name || "Group"}</Text>
                <Text style={styles.manageSubtitle}>
                  {groupSlides.length} slide{groupSlides.length !== 1 ? "s" : ""} in group
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowManageModal(false)}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <View style={styles.manageToolbar}>
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={() => setShowAddSlidesPanel((v) => !v)}
              >
                <Ionicons name="add-circle-outline" size={18} color="#10b981" />
                <Text style={styles.toolbarBtnText}>Add slides</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolbarBtn, styles.toolbarBtnDanger]}
                onPress={() => {
                  if (manageTarget) {
                    setShowManageModal(false)
                    confirmDeleteGroup(manageTarget.brochure, manageTarget.group)
                  }
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={[styles.toolbarBtnText, { color: "#ef4444" }]}>Delete group</Text>
              </TouchableOpacity>
            </View>

            {showAddSlidesPanel && (
              <View style={styles.addPanel}>
                <Text style={styles.addPanelTitle}>Select slides to add</Text>
                {availableSlides.length === 0 ? (
                  <Text style={styles.emptyHint}>All brochure slides are already in this group.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 200 }}>
                    {availableSlides.map((slide, index) => {
                      const selected = selectedToAdd.includes(slide.id)
                      return (
                        <View
                          key={slide.id}
                          style={[styles.addSlideRow, selected && styles.addSlideRowSelected]}
                        >
                          <TouchableOpacity onPress={() => toggleAddSlide(slide.id)} hitSlop={8}>
                            <Ionicons
                              name={selected ? "checkbox" : "square-outline"}
                              size={22}
                              color={selected ? "#8b5cf6" : "#9ca3af"}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => openFullscreenPicker(index)}
                            activeOpacity={0.85}
                          >
                            <Image
                              source={getSlideThumb(manageTarget!.brochure.id, slide)}
                              style={styles.addSlideThumb}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            onPress={() => toggleAddSlide(slide.id)}
                          >
                            <Text style={styles.addSlideTitle} numberOfLines={2}>
                              {slide.title}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.iconBtn}
                            onPress={() => openFullscreenPicker(index)}
                          >
                            <Ionicons name="expand-outline" size={20} color="#60a5fa" />
                          </TouchableOpacity>
                        </View>
                      )
                    })}
                  </ScrollView>
                )}
                {availableSlides.length > 0 && (
                  <TouchableOpacity style={styles.addConfirmBtn} onPress={handleAddSelectedSlides}>
                    <Text style={styles.modalSaveText}>
                      Add {selectedToAdd.length || 0} selected
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <FlatList
              data={groupSlides}
              keyExtractor={(item) => item.id}
              style={styles.manageList}
              ListEmptyComponent={
                <Text style={styles.emptyHint}>No slides in this group yet.</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.manageSlideRow}>
                  <Image
                    source={getSlideThumb(manageTarget!.brochure.id, item)}
                    style={styles.manageThumb}
                    resizeMode="cover"
                  />
                  <Text style={styles.manageSlideTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => openEditSlide(item)}
                  >
                    <Ionicons name="pencil" size={18} color="#60a5fa" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => handleRemoveSlideFromGroup(item)}
                  >
                    <Ionicons name="remove-circle-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Fullscreen slide picker (swipe + select) */}
      <Modal
        visible={showFullscreenPicker}
        animationType="fade"
        onRequestClose={() => setShowFullscreenPicker(false)}
        statusBarTranslucent
      >
        <View style={styles.fullscreenRoot}>
          <StatusBar style="light" />
          <SafeAreaView style={styles.fullscreenSafe}>
            <View style={styles.fullscreenTopBar}>
              <TouchableOpacity
                style={styles.fullscreenIconBtn}
                onPress={() => setShowFullscreenPicker(false)}
              >
                <Ionicons name="close" size={28} color="#ffffff" />
              </TouchableOpacity>
              <View style={styles.fullscreenTopCenter}>
                <Text style={styles.fullscreenCounter}>
                  {availableSlides.length > 0
                    ? `${fullscreenIndex + 1} / ${availableSlides.length}`
                    : "0 / 0"}
                </Text>
                <Text style={styles.fullscreenHint}>Swipe to browse · tap Select</Text>
              </View>
              <View style={{ width: 44 }} />
            </View>

            {showFullscreenPicker && availableSlides.length > 0 && (
              <FlatList
                ref={fullscreenListRef}
                data={availableSlides}
                key={`fs-picker-${fullscreenIndex}`}
                keyExtractor={(item) => item.id}
                style={{ flex: 1 }}
                horizontal
                pagingEnabled
                initialScrollIndex={fullscreenIndex}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onFullscreenScrollEnd}
                getItemLayout={(_, index) => ({
                  length: screenWidth,
                  offset: screenWidth * index,
                  index,
                })}
                onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => {
                    fullscreenListRef.current?.scrollToIndex({ index, animated: false })
                  }, 50)
                }}
                renderItem={({ item }) => (
                  <View style={[styles.fullscreenPage, { width: screenWidth }]}>
                    <Image
                      source={getSlideThumb(manageTarget!.brochure.id, item)}
                      style={styles.fullscreenImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              />
            )}

            <View style={styles.fullscreenBottomBar}>
              <Text style={styles.fullscreenSlideTitle} numberOfLines={2}>
                {availableSlides[fullscreenIndex]?.title || ""}
              </Text>
              <TouchableOpacity
                style={[
                  styles.fullscreenSelectBtn,
                  availableSlides[fullscreenIndex] &&
                    selectedToAdd.includes(availableSlides[fullscreenIndex].id) &&
                    styles.fullscreenSelectBtnActive,
                ]}
                onPress={() => {
                  const slide = availableSlides[fullscreenIndex]
                  if (slide) toggleAddSlide(slide.id)
                }}
              >
                <Ionicons
                  name={
                    availableSlides[fullscreenIndex] &&
                    selectedToAdd.includes(availableSlides[fullscreenIndex].id)
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={22}
                  color="#ffffff"
                />
                <Text style={styles.fullscreenSelectText}>
                  {availableSlides[fullscreenIndex] &&
                  selectedToAdd.includes(availableSlides[fullscreenIndex].id)
                    ? "Selected"
                    : "Select"}
                </Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Edit slide title */}
      <Modal visible={showEditSlideModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Slide Title</Text>
            <TextInput
              style={styles.modalInput}
              value={editSlideTitle}
              onChangeText={setEditSlideTitle}
              placeholder="Slide title"
              placeholderTextColor="#9ca3af"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowEditSlideModal(false)
                  setEditSlideTarget(null)
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveSlideTitle}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1f2937",
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#374151",
    borderBottomWidth: 1,
    borderBottomColor: "#4b5563",
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 2,
  },
  headerActions: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#9ca3af",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#ffffff",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
  list: {
    padding: 20,
  },
  brochureCard: {
    backgroundColor: "#374151",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  brochureHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#4b5563",
  },
  brochureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginLeft: 12,
    flex: 1,
  },
  groupsList: {
    gap: 8,
  },
  groupItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 4,
  },
  groupMainPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
  },
  groupInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  groupColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  groupDetails: {
    flex: 1,
  },
  groupName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
    marginBottom: 2,
  },
  groupSlideCount: {
    fontSize: 12,
    color: "#9ca3af",
  },
  groupMenuButton: {
    padding: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1f2937",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#4b5563",
  },
  manageModalCard: {
    maxHeight: "88%",
    height: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 12,
  },
  manageSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: -8,
    marginBottom: 8,
  },
  manageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#4b5563",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#ffffff",
    fontSize: 15,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#374151",
  },
  modalCancelText: {
    color: "#e5e7eb",
    fontWeight: "600",
  },
  modalSave: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#8b5cf6",
  },
  modalSaveText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  manageToolbar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  toolbarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#374151",
  },
  toolbarBtnDanger: {
    borderColor: "#7f1d1d",
  },
  toolbarBtnText: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600",
  },
  addPanel: {
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  addPanelTitle: {
    color: "#d1d5db",
    fontWeight: "600",
    marginBottom: 8,
  },
  addSlideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  addSlideRowSelected: {
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  addSlideThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: "#374151",
  },
  addSlideTitle: {
    color: "#f3f4f6",
    flex: 1,
    fontSize: 14,
  },
  addConfirmBtn: {
    marginTop: 8,
    backgroundColor: "#8b5cf6",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  manageList: {
    flex: 1,
  },
  manageSlideRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    gap: 8,
  },
  manageThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#374151",
  },
  manageSlideTitle: {
    flex: 1,
    color: "#f9fafb",
    fontSize: 14,
    fontWeight: "500",
  },
  iconBtn: {
    padding: 6,
  },
  emptyHint: {
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 20,
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: "#000000",
  },
  fullscreenSafe: {
    flex: 1,
  },
  fullscreenTopBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 2,
  },
  fullscreenIconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenTopCenter: {
    flex: 1,
    alignItems: "center",
  },
  fullscreenCounter: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  fullscreenHint: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 2,
  },
  fullscreenPage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  fullscreenBottomBar: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  fullscreenSlideTitle: {
    color: "#e5e7eb",
    fontSize: 14,
    textAlign: "center",
  },
  fullscreenSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4b5563",
    borderRadius: 12,
    paddingVertical: 14,
  },
  fullscreenSelectBtnActive: {
    backgroundColor: "#8b5cf6",
  },
  fullscreenSelectText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
})
