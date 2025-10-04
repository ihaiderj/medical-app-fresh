import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator } from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { useState, useEffect } from "react"
import { AuthService } from "../../services/AuthService"
import { MRService, MRDashboardStats, MRRecentActivity, MRUpcomingMeeting } from "../../services/MRService"

interface MRDashboardScreenProps {
  navigation: any
}

export default function MRDashboardScreen({ navigation }: MRDashboardScreenProps) {
  const [dashboardStats, setDashboardStats] = useState<MRDashboardStats | null>(null)
  const [recentActivities, setRecentActivities] = useState<MRRecentActivity[]>([])
  const [upcomingMeetings, setUpcomingMeetings] = useState<MRUpcomingMeeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [availableBrochuresCount, setAvailableBrochuresCount] = useState(0)

  // Load dashboard data on component mount
  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    setIsLoading(true)
    try {
      // Get user profile
      const userResult = await AuthService.getCurrentUser()
      if (userResult.success) {
        setUserProfile(userResult.user)
        
        // Load MR-specific dashboard data
        const [
          statsResult,
          activitiesResult,
          meetingsResult,
          brochuresResult
        ] = await Promise.all([
          MRService.getDashboardStats(userResult.user.id),
          MRService.getRecentActivities(userResult.user.id, 5),
          MRService.getUpcomingMeetings(userResult.user.id, 3),
          MRService.getAssignedBrochures(userResult.user.id)
        ])

        // Set dashboard stats
        if (statsResult.success && statsResult.data) {
          setDashboardStats(statsResult.data)
        }

        // Set recent activities
        if (activitiesResult.success && activitiesResult.data) {
          setRecentActivities(activitiesResult.data)
        }

        // Set upcoming meetings
        if (meetingsResult.success && meetingsResult.data) {
          setUpcomingMeetings(meetingsResult.data)
        }

        // Set available brochures count
        if (brochuresResult.success && brochuresResult.data) {
          setAvailableBrochuresCount(brochuresResult.data.length)
        }
      }
    } catch (error) {
      console.error('MR Dashboard data loading error:', error)
      Alert.alert("Error", "Failed to load dashboard data")
    } finally {
      setIsLoading(false)
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
      case 'brochure_download': return 'download'
      case 'brochure_viewed': return 'eye'
      default: return 'information-circle'
    }
  }

  const handleClearActivities = async () => {
    Alert.alert(
      'Clear Activities',
      'Are you sure you want to clear all recent activities? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const userResult = await AuthService.getCurrentUser()
              if (userResult.success && userResult.user) {
                const result = await MRService.clearRecentActivities(userResult.user.id)
                if (result.success) {
                  setRecentActivities([])
                  Alert.alert('Success', 'Recent activities cleared successfully')
                } else {
                  Alert.alert('Error', result.error || 'Failed to clear activities')
                }
              }
            } catch (error) {
              console.error('Clear activities error:', error)
              Alert.alert('Error', 'Failed to clear activities')
            }
          }
        }
      ]
    )
  }

  // Helper function to get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  const stats = dashboardStats ? [
    { label: "Brochures Available", value: availableBrochuresCount.toString(), icon: "document", color: "#8b5cf6" },
    { label: "Scheduled Meetings", value: dashboardStats.scheduled_meetings.toString(), icon: "calendar", color: "#d97706" },
    { label: "Doctors Connected", value: dashboardStats.doctors_connected.toString(), icon: "people", color: "#ef4444" },
    { label: "This Month Meetings", value: dashboardStats.monthly_meetings.toString(), icon: "trending-up", color: "#6b7280" },
  ] : [
    { label: "Brochures Available", value: availableBrochuresCount.toString(), icon: "document", color: "#8b5cf6" },
    { label: "Scheduled Meetings", value: "0", icon: "calendar", color: "#d97706" },
    { label: "Doctors Connected", value: "0", icon: "people", color: "#ef4444" },
    { label: "This Month Meetings", value: "0", icon: "trending-up", color: "#6b7280" },
  ]

  const quickActions = [
    { title: "Schedule Meeting", icon: "calendar-outline", action: () => navigation.navigate("Doctors") },
    { title: `View Brochures (${availableBrochuresCount})`, icon: "document-outline", action: () => navigation.navigate("Brochures") },
    { title: "Upload Brochure", icon: "cloud-upload-outline", action: () => navigation.navigate("AddBrochure") },
    { title: "Meeting Records", icon: "list-outline", action: () => navigation.navigate("Meetings") },
  ]

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>
              {userProfile ? `${userProfile.first_name} ${userProfile.last_name}` : 'MR User'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.profileButton}>
              <Ionicons name="person-circle" size={40} color="#8b5cf6" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out" size={24} color="#ef4444" />
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

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action, index) => (
              <TouchableOpacity key={index} style={styles.quickActionCard} onPress={action.action}>
                <Ionicons name={action.icon as any} size={28} color="#8b5cf6" />
                <Text style={styles.quickActionText}>{action.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {recentActivities.length > 0 && (
              <TouchableOpacity 
                style={styles.clearButton}
                onPress={handleClearActivities}
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.activityContainer}>
            {recentActivities.length > 0 ? (
              recentActivities.map((activity, index) => (
                <View key={activity.id || index} style={styles.activityItem}>
                  <View style={styles.activityIcon}>
                    <Ionicons name={getActivityIcon(activity.activity_type) as any} size={20} color="#8b5cf6" />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityTitle}>{activity.description}</Text>
                    <Text style={styles.activitySubtitle}>
                      {formatTimeAgo(activity.created_at)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyStateText}>No recent activity</Text>
                <Text style={styles.emptyStateSubtext}>Your activities will appear here</Text>
              </View>
            )}
          </View>
        </View>

        {/* Upcoming Meetings */}
        {upcomingMeetings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Meetings</Text>
            <View style={styles.activityContainer}>
              {upcomingMeetings.map((meeting, index) => (
                <View key={meeting.meeting_id || index} style={styles.activityItem}>
                  <View style={styles.activityIcon}>
                    <Ionicons name="calendar" size={20} color="#d97706" />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityTitle}>{meeting.doctor_name}</Text>
                    <Text style={styles.activitySubtitle}>
                      {meeting.hospital} • {new Date(meeting.scheduled_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                </View>
              ))}
            </View>
          </View>
        )}
        </ScrollView>
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
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 50,
  },
  greeting: {
    fontSize: 16,
    color: "#6b7280",
  },
  userName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginTop: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileButton: {
    padding: 4,
  },
  logoutButton: {
    padding: 8,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#fef2f2",
    gap: 4,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#ef4444",
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  quickActionCard: {
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
  quickActionText: {
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
