import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Modal, TextInput, Alert, ActivityIndicator } from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import React, { useState, useEffect } from "react"
import { useFocusEffect } from '@react-navigation/native'
import { AdminService, DashboardStats, RecentActivity, MRPerformance, BrochureAnalytics } from "../../services/AdminService"
import { AuthService } from "../../services/AuthService"

interface AdminDashboardScreenProps {
  navigation: any
}

export default function AdminDashboardScreen({ navigation }: AdminDashboardScreenProps) {
  const [showManageBrochures, setShowManageBrochures] = useState(false)
  const [showManageMRs, setShowManageMRs] = useState(false)
  const [showViewMeetings, setShowViewMeetings] = useState(false)
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [mrPerformance, setMRPerformance] = useState<MRPerformance[]>([])
  const [brochureAnalytics, setBrochureAnalytics] = useState<BrochureAnalytics[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<any>(null)

  // Load dashboard data on component mount
  useEffect(() => {
    loadDashboardData()
  }, [])

  // Refresh dashboard data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData()
    }, [])
  )

  const loadDashboardData = async () => {
    setIsLoading(true)
    try {
      // Get user profile
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        setUserProfile(userResult.user)
      }

      // Load all dashboard data in parallel
      const [
        statsResult,
        performanceResult,
        analyticsResult
      ] = await Promise.all([
        AdminService.getDashboardStats(),
        AdminService.getMRPerformanceStats(),
        AdminService.getBrochureAnalytics()
      ])

      // Set dashboard stats
      if (statsResult.success && statsResult.data) {
        setDashboardStats(statsResult.data)
      }

      // Set MR performance
      if (performanceResult.success && performanceResult.data) {
        setMRPerformance(performanceResult.data)
      }

      // Set brochure analytics
      if (analyticsResult.success && analyticsResult.data) {
        setBrochureAnalytics(analyticsResult.data)
      }

    } catch (error) {
      console.error('Dashboard data loading error:', error)
      Alert.alert("Error", "Failed to load dashboard data")
    } finally {
      setIsLoading(false)
    }
  }

  const stats = dashboardStats ? [
    { label: "Total MRs", value: dashboardStats.total_mrs.toString(), icon: "people", color: "#8b5cf6" },
    { label: "Active Brochures", value: dashboardStats.active_brochures.toString(), icon: "document", color: "#d97706" },
    { label: "Total Doctors", value: dashboardStats.total_doctors.toString(), icon: "medical", color: "#ef4444" },
    { label: "This Month Meetings", value: dashboardStats.monthly_meetings.toString(), icon: "calendar", color: "#6b7280" },
  ] : [
    { label: "Total MRs", value: "0", icon: "people", color: "#8b5cf6" },
    { label: "Active Brochures", value: "0", icon: "document", color: "#d97706" },
    { label: "Total Doctors", value: "0", icon: "medical", color: "#ef4444" },
    { label: "This Month Meetings", value: "0", icon: "calendar", color: "#6b7280" },
  ]

  // Helper function to format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours} hours ago`
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays} days ago`
    return date.toLocaleDateString()
  }

  // Helper function to get activity icon
  const getActivityIcon = (activityType: string) => {
    switch (activityType.toLowerCase()) {
      case 'login': return 'log-in'
      case 'logout': return 'log-out'
      case 'brochure_upload': return 'cloud-upload'
      case 'meeting': return 'calendar'
      case 'mr_created': return 'person-add'
      case 'brochure_viewed': return 'eye'
      default: return 'information-circle'
    }
  }

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
              const result = await AuthService.logout()
              if (result.success) {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                })
              } else {
                Alert.alert("Error", "Failed to logout. Please try again.")
              }
            } catch (error) {
              Alert.alert("Error", "An error occurred during logout.")
            }
          }
        }
      ]
    )
  }

  const handleAdminAction = (action: string) => {
    switch (action) {
      case "Manage Brochures":
        setShowManageBrochures(true)
        break
      case "View All Brochures":
        navigation.navigate("ViewAllBrochures")
        break
      case "Manage MRs":
        setShowManageMRs(true)
        break
      case "View All Meetings":
        setShowViewMeetings(true)
        break
      default:
        Alert.alert("Coming Soon", "This feature is under development")
    }
  }

  const adminActions = [
    { title: "Manage Brochures", icon: "document-text", screen: "AdminBrochures" },
    { title: "View All Brochures", icon: "library", screen: "ViewAllBrochures" },
    { title: "Manage MRs", icon: "people", screen: "AdminMRs" },
    { title: "View All Meetings", icon: "calendar", screen: "AdminMeetings" },
  ]

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>Admin Dashboard</Text>
            <Text style={styles.userName}>
              Welcome back, {userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : 'Administrator'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.profileButton}>
              <Ionicons name="shield-checkmark" size={32} color="#8b5cf6" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats Cards - 2 columns */}
        <View style={styles.statsContainer}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Loading dashboard...</Text>
            </View>
          ) : (
            <View style={styles.statsGrid}>
              {stats.map((stat, index) => (
                <View key={index} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: `${stat.color}20` }]}>
                    <Ionicons name={stat.icon as any} size={24} color={stat.color} />
                  </View>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Admin Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin Actions</Text>
          <View style={styles.actionsGrid}>
            {adminActions.map((action, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.actionCard}
                onPress={() => handleAdminAction(action.title)}
              >
                <Ionicons name={action.icon as any} size={28} color="#8b5cf6" />
                <Text style={styles.actionText}>{action.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>


      </ScrollView>

      {/* Manage Brochures Modal */}
      <Modal visible={showManageBrochures} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Brochures</Text>
              <TouchableOpacity onPress={() => setShowManageBrochures(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <TouchableOpacity 
                style={styles.actionItem}
                onPress={() => {
                  setShowManageBrochures(false)
                  navigation.navigate('AddBrochure')
                }}
              >
                <Ionicons name="cloud-upload" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Upload New Brochure</Text>
                  <Text style={styles.actionSubtitle}>Add new medical brochures to the system</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6b7280" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionItem}
                onPress={() => {
                  setShowManageBrochures(false)
                  navigation.navigate('ViewAllBrochures')
                }}
              >
                <Ionicons name="list" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>View All Brochures</Text>
                  <Text style={styles.actionSubtitle}>Browse and manage existing brochures</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6b7280" />
              </TouchableOpacity>

              <View style={styles.actionItem}>
                <Ionicons name="trash" size={24} color="#ef4444" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Delete Brochures</Text>
                  <Text style={styles.actionSubtitle}>Remove outdated or unused brochures</Text>
                </View>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.actionItem}>
                <Ionicons name="analytics" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Brochure Analytics</Text>
                  <Text style={styles.actionSubtitle}>View download and usage statistics</Text>
                </View>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Manage MRs Modal */}
      <Modal visible={showManageMRs} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage MRs</Text>
              <TouchableOpacity onPress={() => setShowManageMRs(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <TouchableOpacity 
                style={styles.actionItem}
                onPress={() => {
                  setShowManageMRs(false)
                  navigation.navigate('AddMR')
                }}
              >
                <Ionicons name="person-add" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Add New MR</Text>
                  <Text style={styles.actionSubtitle}>Register new medical representatives</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6b7280" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionItem}
                onPress={() => {
                  setShowManageMRs(false)
                  navigation.navigate('ViewAllMRs')
                }}
              >
                <Ionicons name="people" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>View All MRs</Text>
                  <Text style={styles.actionSubtitle}>Browse and manage MR accounts</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6b7280" />
              </TouchableOpacity>

              <View style={styles.actionItem}>
                <Ionicons name="shield-checkmark" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Manage Permissions</Text>
                  <Text style={styles.actionSubtitle}>Set access levels and permissions</Text>
                </View>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.actionItem}>
                <Ionicons name="bar-chart" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>MR Performance</Text>
                  <Text style={styles.actionSubtitle}>View performance metrics and reports</Text>
                </View>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* View All Meetings Modal */}
      <Modal visible={showViewMeetings} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>View All Meetings</Text>
              <TouchableOpacity onPress={() => setShowViewMeetings(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.actionItem}>
                <Ionicons name="calendar" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Today's Meetings</Text>
                  <Text style={styles.actionSubtitle}>View all meetings scheduled for today</Text>
                </View>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.actionItem}>
                <Ionicons name="time" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Upcoming Meetings</Text>
                  <Text style={styles.actionSubtitle}>View future scheduled meetings</Text>
                </View>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.actionItem}>
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Completed Meetings</Text>
                  <Text style={styles.actionSubtitle}>View past meeting records</Text>
                </View>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.actionItem}>
                <Ionicons name="analytics" size={24} color="#8b5cf6" />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Meeting Analytics</Text>
                  <Text style={styles.actionSubtitle}>View meeting statistics and trends</Text>
                </View>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
    paddingTop: 0,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 50,
    minHeight: 110,
  },
  greeting: {
    fontSize: 14,
    color: "#6b7280",
  },
  userName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
    marginTop: 2,
    flexShrink: 1,
  },
  headerLeft: {
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  profileButton: {
    padding: 2,
  },
  logoutButton: {
    padding: 6,
    backgroundColor: "#fef2f2",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  statsContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  actionCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginTop: 8,
    textAlign: "center",
  },
  activityContainer: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  activityIcon: {
    width: 36,
    height: 36,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    width: "90%",
    maxHeight: "80%",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
  },
  modalBody: {
    maxHeight: 400,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  actionContent: {
    flex: 1,
    marginLeft: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
  actionButton: {
    padding: 8,
  },
  loadingContainer: {
    width: "100%",
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
    color: "#6b7280",
    marginTop: 12,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
})
