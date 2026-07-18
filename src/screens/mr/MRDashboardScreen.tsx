import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator, Modal, FlatList } from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { useState, useEffect, useCallback, useRef } from "react"
import { useFocusEffect } from '@react-navigation/native'
import { AuthService } from "../../services/AuthService"
import { MRService, MRDashboardStats, MRRecentActivity, MRUpcomingMeeting } from "../../services/MRService"
// import { SmartSyncService } from "../../services/smartSyncService" // DELETED
import { SessionManagementService } from "../../services/sessionManagementService"
// import SavedBrochureSyncStatus from "../../components/SavedBrochureSyncStatus" // DELETED
import { useAppData } from '../../context/AppDataContext';
import { OfflineFirstService } from '../../services/offlineFirstService';
import { LocalDatabaseService, SyncOperation } from '../../services/localDatabaseService';
// import { ComprehensiveServerSyncService } from '../../services/comprehensiveServerSyncService'; // DELETED
// import { AdvancedSyncService } from '../../services/advancedSyncService'; // DELETED
import { FirstTimeLoginService } from '../../services/firstTimeLoginService';
// import { SyncVerificationService } from '../../services/syncVerificationService'; // DELETED
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncService } from '../../services/SyncService';
import { NetworkService } from '../../services/networkService';
import { NetworkAlerts } from '../../utils/networkAlerts';
import { TokenStorage } from '../../services/tokenStorage';
import { NotificationService } from '../../services/NotificationService';
import MeetingRemindersModal from '../../components/MeetingRemindersModal';

interface MRDashboardScreenProps {
  navigation: any
}

function parseQueueData(data: unknown): Record<string, unknown> {
  if (!data) return {}
  if (typeof data === 'object') return data as Record<string, unknown>
  try {
    return JSON.parse(String(data)) as Record<string, unknown>
  } catch {
    return {}
  }
}

function formatQueueTableName(tableName: string): string {
  const labels: Record<string, string> = {
    doctors: 'Doctor',
    meetings: 'Meeting',
    meeting_notes: 'Slide note',
    meeting_slide_notes: 'Slide note',
    meeting_general_notes: 'General note',
    meeting_followups: 'Follow-up',
    saved_brochures: 'Saved brochure',
    brochure_sync: 'Brochure changes',
    activity_logs: 'Activity',
  }
  return labels[tableName] || tableName.replace(/_/g, ' ')
}

function formatQueueEntryDetail(op: SyncOperation): string {
  const data = parseQueueData(op.data)
  const title =
    data.title ||
    data.custom_title ||
    data.brochure_title ||
    data.note_text ||
    data.description ||
    [data.first_name, data.last_name].filter(Boolean).join(' ') ||
    data.slide_title ||
    ''
  const shortId = String(op.record_id || '').slice(0, 8)
  return title ? String(title) : `id ${shortId}…`
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
  const [syncStats, setSyncStats] = useState({ pending: 0, failed: 0, unbackedUp: 0 })
  const [showSyncQueueModal, setShowSyncQueueModal] = useState(false)
  const [syncQueueEntries, setSyncQueueEntries] = useState<SyncOperation[]>([])
  const [isLoadingSyncQueue, setIsLoadingSyncQueue] = useState(false)
  const [reminderRefresh, setReminderRefresh] = useState(0)
  const loadInFlightRef = useRef(false)
  const loadRequestIdRef = useRef(0)
  const hasLoadedOnceRef = useRef(false)

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  const refreshSyncStats = useCallback(async () => {
    try {
      const result = await OfflineFirstService.getSyncStats();
      if (result.success && result.data) {
        setSyncStats({
          pending: result.data.pending,
          failed: result.data.failed,
          unbackedUp: result.data.unbackedUp ?? result.data.pending,
        });
      }
    } catch (error) {
      console.error('Failed to load sync stats:', error);
    }
  }, []);

  // Load sync stats periodically
  useEffect(() => {
    refreshSyncStats();
    const interval = setInterval(refreshSyncStats, 30000);
    return () => clearInterval(interval);
  }, [refreshSyncStats]);

  // Set user profile from context immediately
  useEffect(() => {
    if (user && !userProfile) {
      setUserProfile(user);
    }
  }, [user]);

  // Initialize local notifications (permissions + channel) once.
  useEffect(() => {
    NotificationService.configure();
    NotificationService.ensurePermissions();
  }, []);

  // Reset dashboard load state when user logs out
  useEffect(() => {
    if (!user?.id) {
      hasLoadedOnceRef.current = false;
      loadInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [user?.id]);

  const loadDashboardData = useCallback(async (options?: { silent?: boolean }) => {
    if (!user?.id) {
      console.log('❌ DASHBOARD DEBUG: No user ID, waiting for user data...');
      return;
    }

    if (loadInFlightRef.current) {
      console.log('🔍 DASHBOARD DEBUG: Load already in progress, skipping duplicate request');
      return;
    }

    const requestId = ++loadRequestIdRef.current;
    loadInFlightRef.current = true;
    const silent = options?.silent === true || hasLoadedOnceRef.current;
    console.log('🔍 DASHBOARD DEBUG: Starting data load...', silent ? '(silent)' : '');
    console.log('🔍 DASHBOARD DEBUG: User ID:', user.id);

    if (!silent) {
      setIsLoading(true);
    }

    try {
      if (user && !userProfile) {
        setUserProfile(user);
      }

      await LocalDatabaseService.ensureReady();

      const loadStats = async () => {
        const localStats = await LocalDatabaseService.getDashboardStats(user.id);
        return {
          doctors_connected: localStats.doctors_connected,
          scheduled_meetings: localStats.scheduled_meetings,
          brochures_available: localStats.brochures_available || 0,
          active_presentations: localStats.active_presentations,
          monthly_meetings: localStats.monthly_meetings,
          completed_meetings: localStats.completed_meetings,
          brochures_uploaded: localStats.brochures_uploaded,
        } satisfies MRDashboardStats;
      };

      console.log('🔍 DASHBOARD DEBUG: Loading stats, activities, meetings sequentially...');
      let statsOutcome: PromiseSettledResult<MRDashboardStats>;
      let activitiesOutcome: PromiseSettledResult<Array<{ id: string; activity_type: string; description: string; created_at: string }>>;
      let meetingsOutcome: PromiseSettledResult<Array<{ meeting_id: string; doctor_name: string; hospital: string; scheduled_date: string; status: string; notes?: string }>>;

      try {
        const stats = await withTimeout(loadStats(), 25000, 'Dashboard stats');
        statsOutcome = { status: 'fulfilled', value: stats };
      } catch (reason) {
        statsOutcome = { status: 'rejected', reason };
      }

      try {
        const activities = await withTimeout(LocalDatabaseService.getRecentActivities(user.id, 5), 25000, 'Dashboard activities');
        activitiesOutcome = { status: 'fulfilled', value: activities };
      } catch (reason) {
        activitiesOutcome = { status: 'rejected', reason };
      }

      try {
        const meetings = await withTimeout(LocalDatabaseService.getUpcomingMeetings(user.id, 3), 25000, 'Dashboard meetings');
        meetingsOutcome = { status: 'fulfilled', value: meetings };
      } catch (reason) {
        meetingsOutcome = { status: 'rejected', reason };
      }

      if (statsOutcome.status === 'fulfilled') {
        setDashboardStats(statsOutcome.value);
        console.log('✅ DASHBOARD DEBUG: Stats loaded:', statsOutcome.value);
      } else {
        console.warn('⚠️ DASHBOARD DEBUG: Stats load failed, keeping previous values:', statsOutcome.reason);
      }

      if (activitiesOutcome.status === 'fulfilled') {
        const mapped = activitiesOutcome.value.map((row) => ({
          id: row.id,
          activity_type: row.activity_type,
          description: row.description,
          created_at: row.created_at,
        }));
        setRecentActivities(mapped);
        console.log('✅ DASHBOARD DEBUG: Activities loaded:', mapped.length);
      } else {
        console.warn('⚠️ DASHBOARD DEBUG: Activities load failed, keeping previous values:', activitiesOutcome.reason);
      }

      if (meetingsOutcome.status === 'fulfilled') {
        const mapped = meetingsOutcome.value.map((row) => ({
          meeting_id: row.meeting_id,
          doctor_name: row.doctor_name,
          hospital: row.hospital,
          scheduled_date: row.scheduled_date,
          status: row.status,
          notes: row.notes,
        }));
        setUpcomingMeetings(mapped);
        console.log('✅ DASHBOARD DEBUG: Meetings loaded:', mapped.length);
      } else {
        console.warn('⚠️ DASHBOARD DEBUG: Meetings load failed, keeping previous values:', meetingsOutcome.reason);
      }

      console.log('🔍 DASHBOARD DEBUG: Setting brochure count...');
      let brochureCount = 0;
      const statsData =
        statsOutcome.status === 'fulfilled' ? statsOutcome.value : dashboardStats;
      if (user?.id && (await NetworkService.isOnline())) {
        try {
          const liveBrochures = await withTimeout(
            MRService.getAssignedBrochures(user.id),
            8000,
            'Assigned brochures',
          );
          if (liveBrochures.success && liveBrochures.data) {
            brochureCount = liveBrochures.data.length;
          }
        } catch (error) {
          console.warn('🔍 DASHBOARD DEBUG: Live brochure count skipped:', error);
        }
      }
      if (!brochureCount && statsData) {
        brochureCount = statsData.brochures_available || 0;
      }
      setAvailableBrochuresCount(brochureCount);
      console.log('✅ DASHBOARD DEBUG: Brochure count set to:', brochureCount);

    } catch (error) {
      console.warn('⚠️ DASHBOARD DEBUG: Unexpected dashboard load error:', error);
    } finally {
      hasLoadedOnceRef.current = true;
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false);
        console.log('✅ DASHBOARD DEBUG: Data loading completed.');
      }
      loadInFlightRef.current = false;
    }
  }, [user?.id, user, userProfile, dashboardStats]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      const timer = setTimeout(() => {
        loadDashboardData({ silent: hasLoadedOnceRef.current });
      }, hasLoadedOnceRef.current ? 0 : 1500);
      // Re-check meeting reminders (upcoming today + expired) on each focus.
      setReminderRefresh((prev) => prev + 1);
      return () => clearTimeout(timer);
    }, [user?.id, loadDashboardData]),
  )

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
      refreshSyncStats();
    });
    return unsubscribe;
  }, [onActivityChange, loadDashboardData, refreshSyncStats])

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

    setIsSyncing(true);
    setSyncProgress({ step: 'Starting', message: 'Preparing sync...', progress: 0 });

    try {
      if (!(await NetworkService.isOnline())) {
        NetworkAlerts.syncRequiresInternet();
        return;
      }

      if (!(await TokenStorage.hasTokens())) {
        Alert.alert(
          'Sign in required',
          'Your API session is missing. Please log out and sign in again to sync with the server.',
        );
        return;
      }

      AuthService.setCurrentUser({
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        is_active: user.is_active ?? true,
      });

      console.log('🚀 MANUAL SYNC DEBUG: Starting full backup sync for user:', user.id);
      setSyncProgress({ step: 'Reconciling', message: 'Checking local data against server...', progress: 20 });

      const syncResult = await SyncService.syncNow(user.id);
      
      if (syncResult.success) {
        console.log('✅ MANUAL SYNC DEBUG: Manual sync completed successfully');
        console.log('📊 MANUAL SYNC DEBUG: Synced operations:', syncResult.synced);
        console.log('📊 MANUAL SYNC DEBUG: Failed operations:', syncResult.failed);
        
        // TODO: Implement sync verification in SyncService if needed
        // try {
        //   console.log('🔍 SYNC VERIFICATION: Verifying sync status...');
        //   const verificationResult = await SyncVerificationService.verifySyncStatus(user.id);
        //   console.log('📊 SYNC VERIFICATION: Summary:', verificationResult.summary);
        //   SyncVerificationService.printSyncLogs();
        // } catch (verifyError) {
        //   console.warn('⚠️ SYNC VERIFICATION: Failed to verify sync status:', verifyError);
        // }
        
        // Update last sync timestamp
        await FirstTimeLoginService.updateLastSyncTimestamp();
        
        // Reload dashboard data to show updated information
        await loadDashboardData({ silent: true });
        await refreshSyncStats();
        
        setSyncProgress({ step: 'Complete', message: `Sync completed! ${syncResult.synced} operation(s) uploaded.`, progress: 100 });
        const gapNote =
          syncResult.backupGapsRemaining && syncResult.backupGapsRemaining > 0
            ? ` ${syncResult.backupGapsRemaining} item(s) still need backup.`
            : '';
        Alert.alert(
          'Sync Complete',
          syncResult.synced > 0 || (syncResult.reconciled ?? 0) > 0
            ? `${syncResult.synced} change(s) uploaded.${syncResult.reconciled ? ` (${syncResult.reconciled} queued by reconciliation)` : ''}${gapNote}`
            : `Everything is already backed up.${gapNote}`,
        )
        
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
        Alert.alert('Sync Failed', errorMessage)
        
        // Clear error after 5 seconds
        setTimeout(() => {
          setSyncProgress(null);
        }, 5000);
      }
    } catch (error) {
      console.error('❌ MANUAL SYNC DEBUG: Manual sync error:', error);
      setSyncProgress({ step: 'Error', message: `Sync error: ${error instanceof Error ? error.message : 'Unknown error'}`, progress: 0 });
      Alert.alert('Sync Failed', error instanceof Error ? error.message : 'Unknown error');
      
      setTimeout(() => {
        setSyncProgress(null);
      }, 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleShowSyncQueue = async () => {
    setShowSyncQueueModal(true)
    setIsLoadingSyncQueue(true)
    try {
      await LocalDatabaseService.ensureReady()
      const ops = await LocalDatabaseService.getPendingSyncOperations()
      setSyncQueueEntries(ops)
    } catch (error) {
      console.error('Failed to load sync queue:', error)
      setSyncQueueEntries([])
      Alert.alert('Error', 'Could not load sync queue.')
    } finally {
      setIsLoadingSyncQueue(false)
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
              // Get current user for session cleanup
              const userResult = await AuthService.getCurrentUser()
              
              // Stop sync service before logout
              // SmartSyncService.stop() // DELETED - service removed
              
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
      case 'brochure_saved': return 'bookmark'
      case 'brochure_renamed': return 'create-outline'
      case 'brochure_viewed': return 'eye'
      case 'doctor_added':
      case 'doctor_updated': return 'person'
      case 'doctor_deleted': return 'trash'
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
                style={[
                  styles.syncButton,
                  isSyncing && styles.syncButtonActive,
                  syncStats.unbackedUp === 0 && !isSyncing && styles.syncButtonIdle,
                ]} 
                onPress={handleManualSync}
                onLongPress={handleShowSyncQueue}
                delayLongPress={400}
                disabled={isSyncing}
              >
                <Ionicons 
                  name={isSyncing ? "sync" : "cloud-upload-outline"} 
                  size={24} 
                  color={isSyncing ? "#f59e0b" : syncStats.unbackedUp > 0 ? "#10b981" : "#94a3b8"} 
                />
              </TouchableOpacity>
              {syncStats.unbackedUp > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{syncStats.unbackedUp}</Text>
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

      {/* Meeting reminders: upcoming-today prompts + expired status resolution */}
      <MeetingRemindersModal
        userId={user?.id}
        refreshKey={reminderRefresh}
        navigation={navigation}
        onChanged={() => loadDashboardData({ silent: true })}
      />

      <Modal
        visible={showSyncQueueModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSyncQueueModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.syncQueueModalContent]}>
            <View style={styles.syncQueueHeader}>
              <View>
                <Text style={styles.syncQueueTitle}>Queued for sync</Text>
                <Text style={styles.syncQueueSubtitle}>
                  {isLoadingSyncQueue
                    ? 'Loading…'
                    : `${syncQueueEntries.length} pending operation${syncQueueEntries.length === 1 ? '' : 's'}`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSyncQueueModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {isLoadingSyncQueue ? (
              <View style={styles.syncQueueLoading}>
                <ActivityIndicator size="large" color="#8b5cf6" />
              </View>
            ) : syncQueueEntries.length === 0 ? (
              <View style={styles.syncQueueEmpty}>
                <Ionicons name="checkmark-circle-outline" size={40} color="#10b981" />
                <Text style={styles.syncQueueEmptyText}>Nothing queued</Text>
                <Text style={styles.syncQueueEmptySubtext}>Local changes will appear here until you sync.</Text>
              </View>
            ) : (
              <FlatList
                data={syncQueueEntries}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.syncQueueList}
                renderItem={({ item }) => (
                  <View style={styles.syncQueueItem}>
                    <View style={styles.syncQueueItemTop}>
                      <Text style={styles.syncQueueItemAction}>
                        {item.operation_type.toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          styles.syncQueueItemStatus,
                          item.status === 'failed' && styles.syncQueueItemStatusFailed,
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                    <Text style={styles.syncQueueItemTitle}>
                      {formatQueueTableName(item.table_name)} · {formatQueueEntryDetail(item)}
                    </Text>
                    <Text style={styles.syncQueueItemMeta}>
                      {item.timestamp
                        ? new Date(item.timestamp).toLocaleString()
                        : '—'}
                      {item.error_message ? ` · ${item.error_message}` : ''}
                    </Text>
                  </View>
                )}
              />
            )}

            <TouchableOpacity
              style={styles.syncQueueCloseButton}
              onPress={() => setShowSyncQueueModal(false)}
            >
              <Text style={styles.syncQueueCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  syncButtonIdle: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
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
  syncQueueModalContent: {
    height: '70%',
    maxHeight: 520,
    paddingBottom: 12,
  },
  syncQueueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  syncQueueTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  syncQueueSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
  },
  syncQueueLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncQueueEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  syncQueueEmptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  syncQueueEmptySubtext: {
    marginTop: 6,
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
  syncQueueList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  syncQueueItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
  },
  syncQueueItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  syncQueueItemAction: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c3aed',
    letterSpacing: 0.4,
  },
  syncQueueItemStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f59e0b',
    textTransform: 'uppercase',
  },
  syncQueueItemStatusFailed: {
    color: '#ef4444',
  },
  syncQueueItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  syncQueueItemMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  syncQueueCloseButton: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  syncQueueCloseButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
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
