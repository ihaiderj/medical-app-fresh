import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator } from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { useState, useEffect, useCallback } from "react"
import { AuthService } from "../../services/AuthService"
import { MRService, MRDashboardStats, MRRecentActivity, MRUpcomingMeeting } from "../../services/MRService"
import { SmartSyncService } from "../../services/smartSyncService"
import { SessionManagementService } from "../../services/sessionManagementService"
import SavedBrochureSyncStatus from "../../components/SavedBrochureSyncStatus"
import { useAppData } from '../../context/AppDataContext';
import { OfflineFirstService } from '../../services/offlineFirstService';
import { LocalDatabaseService } from '../../services/localDatabaseService';
import { ComprehensiveServerSyncService } from '../../services/comprehensiveServerSyncService';
import { AdvancedSyncService } from '../../services/advancedSyncService';
import { FirstTimeLoginService } from '../../services/firstTimeLoginService';
import { SyncVerificationService } from '../../services/syncVerificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SyncTestPanel from '../../components/SyncTestPanel';

interface MRDashboardScreenProps {
  navigation: any
}

export default function MRDashboardScreen({ navigation }: MRDashboardScreenProps) {
  const { user, onMeetingChange, onDoctorChange, onBrochureChange, onActivityChange, logoutUser } = useAppData();
  const [dashboardStats, setDashboardStats] = useState<MRDashboardStats | null>(null)
  const [recentActivities, setRecentActivities] = useState<MRRecentActivity[]>([])
  const [upcomingMeetings, setUpcomingMeetings] = useState<MRUpcomingMeeting[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [availableBrochuresCount, setAvailableBrochuresCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ step: string; message: string; progress: number } | null>(null)
  const [syncStats, setSyncStats] = useState({ pending: 0, failed: 0 })
  const [showTestPanel, setShowTestPanel] = useState(false)

  // Load sync stats periodically
  useEffect(() => {
    const loadSyncStats = async () => {
      try {
        const result = await OfflineFirstService.getSyncStats();
        if (result.success && result.data) {
          setSyncStats(result.data);
        }
      } catch (error) {
        console.error('Failed to load sync stats:', error);
      }
    };
    
    loadSyncStats();
    const interval = setInterval(loadSyncStats, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Set user profile from context immediately
  useEffect(() => {
    if (user && !userProfile) {
      setUserProfile(user);
    }
  }, [user]);

  const loadDashboardData = useCallback(async () => {
    console.log('🔍 DASHBOARD DEBUG: Starting data load...');
    console.log('🔍 DASHBOARD DEBUG: User ID:', user?.id);
    console.log('🔍 DASHBOARD DEBUG: User object:', user);
    
    if (!user?.id) {
      console.log('❌ DASHBOARD DEBUG: No user ID, waiting for user data...');
      return;
    }
    
    setIsLoading(true);
    console.log('🔍 DASHBOARD DEBUG: Loading state set to true');
    
    try {
      // Load user profile from local database
      console.log('🔍 DASHBOARD DEBUG: Loading user profile...');
      try {
        const localUser = await LocalDatabaseService.getUserById(user.id);
        console.log('🔍 DASHBOARD DEBUG: Local user from DB:', localUser);
        if (localUser) {
          setUserProfile(localUser);
          console.log('✅ DASHBOARD DEBUG: User profile set from local DB');
        } else if (user) {
          // Fallback to user from context
          setUserProfile(user);
          console.log('✅ DASHBOARD DEBUG: User profile set from context (fallback)');
        }
      } catch (error) {
        console.error('❌ DASHBOARD DEBUG: Failed to load user profile:', error);
        // Fallback to user from context
        if (user) {
          setUserProfile(user);
          console.log('✅ DASHBOARD DEBUG: User profile set from context (error fallback)');
        }
      }

      console.log('🔍 DASHBOARD DEBUG: Loading stats...');
      const statsResult = await OfflineFirstService.getDashboardStats(user.id);
      console.log('🔍 DASHBOARD DEBUG: Stats result:', statsResult);
      if (statsResult.success && statsResult.data) {
        setDashboardStats(statsResult.data);
        console.log('✅ DASHBOARD DEBUG: Stats loaded successfully:', statsResult.data);
      } else {
        console.error('❌ DASHBOARD DEBUG: Failed to load dashboard stats:', statsResult.error);
        console.log('🔍 DASHBOARD DEBUG: Setting default stats (all zeros)');
        setDashboardStats({
          doctors_connected: 0,
          scheduled_meetings: 0,
          brochures_available: 0,
          active_presentations: 0,
          monthly_meetings: 0,
          completed_meetings: 0,
          brochures_uploaded: 0
        });
      }
      console.log('🔍 DASHBOARD DEBUG: Stats loading completed.');

      console.log('🔍 DASHBOARD DEBUG: Loading activities...');
      const activitiesResult = await OfflineFirstService.getRecentActivities(5, user.id);
      console.log('🔍 DASHBOARD DEBUG: Activities result:', activitiesResult);
      if (activitiesResult.success && activitiesResult.data) {
        setRecentActivities(activitiesResult.data);
        console.log('✅ DASHBOARD DEBUG: Activities loaded successfully:', activitiesResult.data.length, 'items');
      } else {
        console.error('❌ DASHBOARD DEBUG: Failed to load recent activities:', activitiesResult.error);
        console.log('🔍 DASHBOARD DEBUG: Setting empty activities array');
        setRecentActivities([]);
      }
      console.log('🔍 DASHBOARD DEBUG: Activities loading completed.');

      console.log('🔍 DASHBOARD DEBUG: Loading meetings...');
      const meetingsResult = await OfflineFirstService.getUpcomingMeetings(3, user.id);
      console.log('🔍 DASHBOARD DEBUG: Meetings result:', meetingsResult);
      if (meetingsResult.success && meetingsResult.data) {
        setUpcomingMeetings(meetingsResult.data);
        console.log('✅ DASHBOARD DEBUG: Meetings loaded successfully:', meetingsResult.data.length, 'items');
      } else {
        console.error('❌ DASHBOARD DEBUG: Failed to load upcoming meetings:', meetingsResult.error);
        console.log('🔍 DASHBOARD DEBUG: Setting empty meetings array');
        setUpcomingMeetings([]);
      }
      console.log('🔍 DASHBOARD DEBUG: Meetings loading completed.');

      // Load available brochures count - use saved brochures count from stats
      console.log('🔍 DASHBOARD DEBUG: Setting brochure count...');
      if (statsResult.success && statsResult.data) {
        const brochureCount = statsResult.data.brochures_available || 0;
        setAvailableBrochuresCount(brochureCount);
        console.log('✅ DASHBOARD DEBUG: Brochure count set to:', brochureCount);
      } else {
        setAvailableBrochuresCount(0);
        console.log('🔍 DASHBOARD DEBUG: Brochure count set to 0 (fallback)');
      }

    } catch (error) {
      console.error('❌ DASHBOARD DEBUG: Error loading dashboard data:', error);
      console.log('🔍 DASHBOARD DEBUG: Setting fallback values due to error');
      setDashboardStats({
        doctors_connected: 0,
        scheduled_meetings: 0,
        brochures_available: 0,
        active_presentations: 0,
        monthly_meetings: 0,
        completed_meetings: 0,
        brochures_uploaded: 0
      });
      setRecentActivities([]);
      setUpcomingMeetings([]);
      setAvailableBrochuresCount(0);
    } finally {
      setIsLoading(false);
      console.log('🔍 DASHBOARD DEBUG: Loading state set to false');
      console.log('🔍 DASHBOARD DEBUG: Final state - isLoading:', false);
      console.log('🔍 DASHBOARD DEBUG: Final state - userProfile:', userProfile);
      console.log('🔍 DASHBOARD DEBUG: Final state - dashboardStats:', dashboardStats);
      console.log('🔍 DASHBOARD DEBUG: Final state - recentActivities count:', recentActivities.length);
      console.log('🔍 DASHBOARD DEBUG: Final state - upcomingMeetings count:', upcomingMeetings.length);
      console.log('🔍 DASHBOARD DEBUG: Final state - availableBrochuresCount:', availableBrochuresCount);
      console.log('✅ DASHBOARD DEBUG: Data loading completed.');
    }
  }, [user?.id]);

  // Load dashboard data on component mount
  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  // Subscribe to meeting changes to refresh dashboard stats
  useEffect(() => {
    const unsubscribe = onMeetingChange(() => {
      console.log('MRDashboard: Received meeting change notification, refreshing dashboard...');
      loadDashboardData();
    });
    return unsubscribe;
  }, [onMeetingChange, loadDashboardData])

  // Subscribe to doctor changes to refresh dashboard stats
  useEffect(() => {
    const unsubscribe = onDoctorChange(() => {
      console.log('MRDashboard: Received doctor change notification, refreshing dashboard...');
      // Defer the state update to avoid setState during render
      const { InteractionManager } = require('react-native');
      InteractionManager.runAfterInteractions(() => {
        loadDashboardData();
      });
    });
    return unsubscribe;
  }, [onDoctorChange, loadDashboardData])

  // Subscribe to brochure changes to refresh dashboard stats
  useEffect(() => {
    const unsubscribe = onBrochureChange(() => {
      console.log('MRDashboard: Received brochure change notification, refreshing dashboard...');
      loadDashboardData();
    });
    return unsubscribe;
  }, [onBrochureChange, loadDashboardData])

  // Subscribe to activity changes to refresh dashboard stats
  useEffect(() => {
    const unsubscribe = onActivityChange(() => {
      console.log('MRDashboard: Received activity change notification, refreshing dashboard...');
      loadDashboardData();
    });
    return unsubscribe;
  }, [onActivityChange, loadDashboardData])

  const debugReloadData = async () => {
    console.log('🔍 DASHBOARD DEBUG: Manual reload triggered');
    console.log('🔍 DASHBOARD DEBUG: Current state before reload:');
    console.log('  - isLoading:', isLoading);
    console.log('  - userProfile:', userProfile);
    console.log('  - dashboardStats:', dashboardStats);
    console.log('  - recentActivities count:', recentActivities.length);
    console.log('  - upcomingMeetings count:', upcomingMeetings.length);
    console.log('  - availableBrochuresCount:', availableBrochuresCount);
    
    await loadDashboardData();
    
    console.log('🔍 DASHBOARD DEBUG: Reload completed');
    Alert.alert("Debug", "Dashboard data reloaded. Check logs for details.");
  };

  const handleManualSync = async () => {
    if (!user?.id || isSyncing) return;
    
    console.log('🚀 MANUAL SYNC DEBUG: Starting manual sync (upload-only) for user:', user.id);
    setIsSyncing(true);
    setSyncProgress({ step: 'Starting', message: 'Preparing sync...', progress: 0 });
    
    try {
      // Upload local changes to server (this will reduce pending count)
      setSyncProgress({ step: 'Uploading', message: 'Uploading local changes to server...', progress: 50 });
      console.log('🚀 MANUAL SYNC DEBUG: Uploading local changes...');
      
      // Perform comprehensive sync to ensure server matches local exactly
      const syncResult = await AdvancedSyncService.syncLocalToServer(user.id);
      
      if (syncResult.success) {
        console.log('✅ MANUAL SYNC DEBUG: Manual sync completed successfully');
        console.log('📊 MANUAL SYNC DEBUG: Synced operations:', syncResult.syncedOperations);
        console.log('📊 MANUAL SYNC DEBUG: Failed operations:', syncResult.failedOperations);
        
        // Verify sync status after sync completes
        try {
          console.log('🔍 SYNC VERIFICATION: Verifying sync status...');
          const verificationResult = await SyncVerificationService.verifySyncStatus(user.id);
          console.log('📊 SYNC VERIFICATION: Summary:', verificationResult.summary);
          SyncVerificationService.printSyncLogs();
        } catch (verifyError) {
          console.warn('⚠️ SYNC VERIFICATION: Failed to verify sync status:', verifyError);
        }
        
        // Update last sync timestamp
        await FirstTimeLoginService.updateLastSyncTimestamp();
        
        // Reload dashboard data to show updated information
        await loadDashboardData();
        
        setSyncProgress({ step: 'Complete', message: `Sync completed! ${syncResult.syncedOperations} operations synced.`, progress: 100 });
        
        // Clear progress after 3 seconds
        setTimeout(() => {
          setSyncProgress(null);
        }, 3000);
      } else {
        console.error('❌ MANUAL SYNC DEBUG: Manual sync failed:', syncResult.errors);
        const errorMessage = syncResult.errors.length > 0 
          ? syncResult.errors.join(', ') 
          : 'Unknown error';
        setSyncProgress({ step: 'Error', message: `Sync failed: ${errorMessage}`, progress: 0 });
        
        // Clear error after 5 seconds
        setTimeout(() => {
          setSyncProgress(null);
        }, 5000);
      }
    } catch (error) {
      console.error('❌ MANUAL SYNC DEBUG: Manual sync error:', error);
      setSyncProgress({ step: 'Error', message: `Sync error: ${error instanceof Error ? error.message : 'Unknown error'}`, progress: 0 });
      
      // Clear error after 5 seconds
      setTimeout(() => {
        setSyncProgress(null);
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleVerifySync = async () => {
    if (!user?.id) return;
    
    try {
      Alert.alert(
        'Sync Verification',
        'This will verify what data was synced to the server. Check the console logs for detailed results.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Verify',
            onPress: async () => {
              console.log('🔍 SYNC VERIFICATION: Starting verification...');
              const result = await SyncVerificationService.verifySyncStatus(user.id);
              console.log('📊 SYNC VERIFICATION: Results:', JSON.stringify(result.results, null, 2));
              SyncVerificationService.printSyncLogs();
              
              // Show summary in alert
              const summaryLines = result.results.map(r => 
                `${r.entity}: Local=${r.localCount}, Server=${r.serverCount}, Synced=${r.syncedToServerCount}, Queued=${r.queuedCount}`
              ).join('\n');
              
              Alert.alert(
                'Sync Verification Complete',
                `Check console logs for details.\n\nSummary:\n${summaryLines}`,
                [{ text: 'OK' }]
              );
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ SYNC VERIFICATION: Error:', error);
      Alert.alert('Error', 'Failed to verify sync status. Check console logs.');
    }
  };

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
              // Get current user for session cleanup
              const userResult = await AuthService.getCurrentUser()
              
              // Stop sync service before logout
              SmartSyncService.stop()
              
              // End session if user exists
              if (userResult.success && userResult.user) {
                await SessionManagementService.endSession(userResult.user.id)
              }
              
              const result = await AuthService.logout()
              if (result.success) {
                // Use AppDataContext logoutUser which will automatically trigger navigation change
                // when user state becomes null, the AppNavigator will show Login screen
                // No need to manually reset navigation - AppNavigator handles it automatically
                logoutUser();
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
  const getActivityIcon = (activityType?: string) => {
    if (!activityType) return 'information-circle';
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

  const handleDumpAsyncStorage = async () => {
    console.log("========================================");
    console.log("DUMPING ASYNC STORAGE FOR atul@gmail.com");
    console.log("========================================");
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const allData = await AsyncStorage.multiGet(allKeys);

      allData.forEach(([key, value]) => {
        console.log(`\n--- KEY: ${key} ---`);
        try {
          // Try to parse JSON for better readability
          console.log(JSON.parse(value || '{}'));
        } catch {
          // If not JSON, just log the raw value
          console.log(value);
        }
      });
      Alert.alert("AsyncStorage Dumped", "Check the Metro logs for the complete data dump.");
    } catch (e) {
      console.error("Failed to dump AsyncStorage", e);
      Alert.alert("Error", "Could not dump AsyncStorage. Check logs.");
    }
    console.log("========================================");
  };


  // Debug logging for stats calculation
  console.log('🔍 DASHBOARD RENDER DEBUG: dashboardStats:', dashboardStats);
  console.log('🔍 DASHBOARD RENDER DEBUG: availableBrochuresCount:', availableBrochuresCount);
  console.log('🔍 DASHBOARD RENDER DEBUG: isLoading:', isLoading);
  console.log('🔍 DASHBOARD RENDER DEBUG: userProfile:', userProfile);
  console.log('🔍 DASHBOARD RENDER DEBUG: recentActivities count:', recentActivities.length);
  console.log('🔍 DASHBOARD RENDER DEBUG: upcomingMeetings count:', upcomingMeetings.length);

  const stats = dashboardStats ? [
    { label: "Brochures Available", value: (availableBrochuresCount || 0).toString(), icon: "document", color: "#8b5cf6" },
    { label: "Scheduled Meetings", value: (dashboardStats.scheduled_meetings || 0).toString(), icon: "calendar", color: "#d97706" },
    { label: "Doctors Connected", value: (dashboardStats.doctors_connected || 0).toString(), icon: "people", color: "#ef4444" },
    // { label: "This Month Meetings", value: (dashboardStats.monthly_meetings || 0).toString(), icon: "trending-up", color: "#6b7280" },
  ] : [
    { label: "Brochures Available", value: (availableBrochuresCount || 0).toString(), icon: "document", color: "#8b5cf6" },
    { label: "Scheduled Meetings", value: "0", icon: "calendar", color: "#d97706" },
    { label: "Doctors Connected", value: "0", icon: "people", color: "#ef4444" },
    // { label: "This Month Meetings", value: "0", icon: "trending-up", color: "#6b7280" },
  ]

  console.log('🔍 DASHBOARD RENDER DEBUG: Calculated stats array:', stats);

  const quickActions = [
    { title: "Schedule Meeting", icon: "calendar-outline", action: () => navigation.navigate("Doctors") },
    { title: `View Brochures (${availableBrochuresCount})`, icon: "document-outline", action: () => navigation.navigate("Brochures") },
    { title: "Upload Brochure", icon: "cloud-upload-outline", action: () => navigation.navigate("AddBrochure") },
    { title: "Meeting Records", icon: "list-outline", action: () => navigation.navigate("Meetings") },
  ]

  // Debug logging for what will be rendered
  const displayName = userProfile ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() : 
                     (user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'MR User');
  
  console.log('🔍 DASHBOARD RENDER DEBUG: Display name will be:', displayName);
  console.log('🔍 DASHBOARD RENDER DEBUG: Will show loading?', isLoading);
  console.log('🔍 DASHBOARD RENDER DEBUG: Will show stats?', !isLoading && stats.length > 0);
  console.log('🔍 DASHBOARD RENDER DEBUG: Will show activities?', !isLoading && recentActivities.length > 0);
  console.log('🔍 DASHBOARD RENDER DEBUG: Will show meetings?', !isLoading && upcomingMeetings.length > 0);

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
              {displayName}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.debugButton} onPress={debugReloadData}>
              <Ionicons name="refresh" size={24} color="#3b82f6" />
            </TouchableOpacity>
            <View style={{ position: 'relative' }}>
              <TouchableOpacity 
                style={[styles.syncButton, isSyncing && styles.syncButtonActive]} 
                onPress={handleManualSync}
                onLongPress={() => {
                  Alert.alert(
                    'Sync Options',
                    'Choose an option',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Verify Sync', onPress: handleVerifySync },
                      { text: 'Test Panel', onPress: () => setShowTestPanel(true) }
                    ]
                  );
                }}
                disabled={isSyncing}
              >
                <Ionicons 
                  name={isSyncing ? "sync" : "cloud-upload-outline"} 
                  size={24} 
                  color={isSyncing ? "#f59e0b" : "#10b981"} 
                />
              </TouchableOpacity>
              {syncStats.pending > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{syncStats.pending}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.profileButton}>
              <Ionicons name="person-circle" size={40} color="#8b5cf6" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <Ionicons name="log-out" size={24} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Sync Progress Indicator */}
        {syncProgress && (
          <View style={styles.syncProgressContainer}>
            <View style={styles.syncProgressHeader}>
              <Ionicons 
                name={syncProgress.step === 'Error' ? 'alert-circle' : 'cloud-upload-outline'} 
                size={20} 
                color={syncProgress.step === 'Error' ? '#ef4444' : '#10b981'} 
              />
              <Text style={styles.syncProgressStep}>{syncProgress.step}</Text>
            </View>
            <Text style={styles.syncProgressMessage}>{syncProgress.message}</Text>
            {syncProgress.progress > 0 && syncProgress.step !== 'Error' && (
              <View style={styles.syncProgressBar}>
                <View 
                  style={[
                    styles.syncProgressFill, 
                    { width: `${syncProgress.progress}%` }
                  ]} 
                />
              </View>
            )}
          </View>
        )}

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
                    <Text style={styles.activityTitle}>{activity.description || 'Activity'}</Text>
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

        {/* Upcoming Meetings - REMOVED per user request */}
        {false && upcomingMeetings.length > 0 && (
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

      {/* Sync Test Panel Modal */}
      {showTestPanel && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <SyncTestPanel onClose={() => setShowTestPanel(false)} />
          </View>
        </View>
      )}
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
  debugButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  syncButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  syncButtonActive: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    width: '90%',
    height: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  syncProgressContainer: {
    marginHorizontal: 20,
    marginVertical: 10,
    padding: 16,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  syncProgressHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  syncProgressStep: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  syncProgressMessage: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
  },
  syncProgressBar: {
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 2,
    overflow: "hidden",
  },
  syncProgressFill: {
    height: "100%",
    backgroundColor: "#10b981",
    borderRadius: 2,
  },
  profileButton: {
    padding: 4,
  },
  pendingBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ffa726',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  pendingBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
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
