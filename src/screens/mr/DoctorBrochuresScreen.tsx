import React, { useState, useEffect } from "react"
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { StatusBar } from "expo-status-bar"
import { BrochureManagementService, BrochureData, SlideGroup } from "../../services/brochureManagementService"
import * as FileSystem from 'expo-file-system'

interface DoctorBrochuresScreenProps {
  navigation: any
  route: any
}

interface BrochureWithGroups {
  brochure: BrochureData
  groups: SlideGroup[]
}

export default function DoctorBrochuresScreen({ navigation, route }: DoctorBrochuresScreenProps) {
  const { doctorId, doctorName } = route.params || {}
  
  const [brochuresWithGroups, setBrochuresWithGroups] = useState<BrochureWithGroups[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDoctorBrochures()
  }, [doctorId])

  const loadDoctorBrochures = async () => {
    try {
      setIsLoading(true)
      
      // Get all brochures from local storage
      const brochuresDir = `${FileSystem.documentDirectory}brochures/`
      
      // Check if directory exists
      const dirInfo = await FileSystem.getInfoAsync(brochuresDir)
      if (!dirInfo.exists) {
        setIsLoading(false)
        return
      }

      // Read all brochure directories
      const brochureDirs = await FileSystem.readDirectoryAsync(brochuresDir)
      
      const brochuresWithDoctorGroups: BrochureWithGroups[] = []
      
      // Check each brochure for groups with this doctor ID
      for (const brochureDir of brochureDirs) {
        const brochureId = brochureDir
        const result = await BrochureManagementService.getBrochureData(brochureId)
        
        if (result.success && result.data) {
          const brochure = result.data
          // Find groups that belong to this doctor
          const doctorGroups = brochure.groups.filter(group => group.doctorId === doctorId)
          
          if (doctorGroups.length > 0) {
            brochuresWithDoctorGroups.push({
              brochure,
              groups: doctorGroups
            })
          }
        }
      }
      
      setBrochuresWithGroups(brochuresWithDoctorGroups)
    } catch (error) {
      console.error('Error loading doctor brochures:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewGroup = (brochure: BrochureData, group: SlideGroup) => {
    // Navigate to fullscreen viewer with only the group's slides
    navigation.navigate('DoctorGroupViewer', {
      brochureId: brochure.id,
      brochureTitle: brochure.title,
      groupId: group.id,
      groupName: group.name,
      slideIds: group.slideIds,
      doctorName
    })
  }

  const renderBrochureItem = ({ item }: { item: BrochureWithGroups }) => (
    <View style={styles.brochureCard}>
      <View style={styles.brochureHeader}>
        <Ionicons name="folder-outline" size={24} color="#8b5cf6" />
        <Text style={styles.brochureTitle}>{item.brochure.title}</Text>
      </View>
      
      <View style={styles.groupsList}>
        {item.groups.map(group => (
          <TouchableOpacity
            key={group.id}
            style={styles.groupItem}
            onPress={() => handleViewGroup(item.brochure, group)}
          >
            <View style={styles.groupInfo}>
              <View style={[styles.groupColorDot, { backgroundColor: group.color }]} />
              <View style={styles.groupDetails}>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupSlideCount}>
                  {group.slideIds.length} slide{group.slideIds.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6b7280" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        
        {/* Header */}
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

        {/* Content */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.loadingText}>Loading brochures...</Text>
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
    justifyContent: "space-between",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    padding: 12,
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
})

