import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthService } from './src/services/AuthService';
import useActivityTracker from './src/hooks/useActivityTracker';
import { SmartSyncService } from './src/services/smartSyncService';
import { SessionManagementService } from './src/services/sessionManagementService';
import { LocalDatabaseService } from './src/services/localDatabaseService';
import { NetworkService } from './src/services/networkService';
import { AdvancedSyncService } from './src/services/advancedSyncService';
import { UnifiedSyncService } from './src/services/unifiedSyncService';
import { InitialSyncService } from './src/services/initialSyncService';
import { AppDataProvider, useAppData } from './src/context/AppDataContext';
import { GlobalFormProvider } from './src/context/GlobalFormContext';
import UnifiedSyncIndicator from './src/components/UnifiedSyncIndicator';
import LoginScreen from './src/screens/LoginScreen';
import AdminDashboardScreen from './src/screens/admin/AdminDashboardScreen';
import AdminTabs from './src/screens/admin/AdminTabs';
import AddMRScreen from './src/screens/admin/AddMRScreen';
import ViewAllMRsScreen from './src/screens/admin/ViewAllMRsScreen';
import AddBrochureScreen from './src/screens/admin/AddBrochureScreen';
import ViewAllBrochuresScreen from './src/screens/admin/ViewAllBrochuresScreen';
import DocumentViewerScreen from './src/screens/admin/DocumentViewerScreen';
import SlideManagementScreen from './src/screens/admin/SlideManagementScreen';
import MRDashboardScreen from './src/screens/mr/MRDashboardScreen';
import BrochuresScreen from './src/screens/mr/BrochuresScreen';
import DoctorsScreen from './src/screens/mr/DoctorsScreen';
import MeetingsScreen from './src/screens/mr/MeetingsScreen';
import MeetingDetailsScreen from './src/screens/mr/MeetingDetailsScreen';
import PDFConversionScreen from './src/screens/mr/PDFConversionScreen';
import BrochureViewerScreen from './src/screens/mr/BrochureViewerScreen';
import DoctorBrochuresScreen from './src/screens/mr/DoctorBrochuresScreen';
import DoctorGroupViewerScreen from './src/screens/mr/DoctorGroupViewerScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function WelcomeScreen({ navigation }: { navigation: any }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Image 
          source={require('./assets/fervid-logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        {/* <Text style={styles.title}>Fervid</Text> */}
        <Text style={styles.subtitle}>Professional Medical Presentation Platform</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function MRTabs() {
  const insets = useSafeAreaInsets();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'MRDashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Brochures') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'Doctors') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Meetings') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else {
            iconName = 'help-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#8b5cf6',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          height: 60 + Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
      })}
    >
      <Tab.Screen 
        name="MRDashboard" 
        component={MRDashboardScreen} 
        options={{ 
          tabBarLabel: 'Dashboard',
          title: 'Dashboard'
        }} 
      />
      <Tab.Screen 
        name="Brochures" 
        component={BrochuresScreen} 
        options={{ 
          tabBarLabel: 'Brochures',
          title: 'Brochures'
        }} 
      />
      <Tab.Screen 
        name="Doctors" 
        component={DoctorsScreen} 
        options={{ 
          tabBarLabel: 'Doctors',
          title: 'Doctors'
        }} 
      />
      <Tab.Screen 
        name="Meetings" 
        component={MeetingsScreen} 
        options={{ 
          tabBarLabel: 'Meetings',
          title: 'Meetings'
        }} 
      />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { user, isDataInitialized } = useAppData();
  
  if (!isDataInitialized) {
    // Show a loading screen while the app initializes
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user ? (
          // User is logged in
          <>
            <Stack.Screen name="MRTabs" component={MRTabs} options={{ headerShown: false }} />
            <Stack.Screen name="SlideManagement" component={SlideManagementScreen} />
            <Stack.Screen name="BrochureViewer" component={BrochureViewerScreen} />
            <Stack.Screen name="DoctorBrochures" component={DoctorBrochuresScreen} />
            <Stack.Screen name="DoctorGroupViewer" component={DoctorGroupViewerScreen} />
            <Stack.Screen name="MeetingDetails" component={MeetingDetailsScreen} />
          </>
        ) : (
          // No user is logged in
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}


export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'mr' | null>(null);

  // Track user activity for persistent sessions
  // useActivityTracker(); // DISABLED - causing sync issues

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      console.log('Checking authentication state...')
      
      // Initialize offline-first services
      console.log('Initializing offline-first services...')
      try {
        await LocalDatabaseService.initialize()
      } catch (dbError) {
        console.warn('SQLite initialization failed, offline features will be limited:', dbError)
        // Continue without SQLite - app will work online-only
      }
      await NetworkService.initialize()
      
      // First try auto-login with persistent session
      const autoLoginResult = await AuthService.attemptAutoLogin()
      if (autoLoginResult.success && autoLoginResult.user) {
        console.log('Auto-login successful:', autoLoginResult.user.email)
        setIsAuthenticated(true)
        setUserRole(autoLoginResult.user.role)
        
        // Register session and initialize sync services
        await SessionManagementService.registerSessionWithConflictCheck(autoLoginResult.user.id)
        // await AdvancedSyncService.initialize() // DISABLED - causing infinite doctor creation
        // await UnifiedSyncService.initialize() // Temporarily disabled to fix sync issues
        
        // Perform comprehensive sync only if local DB is empty or outdated
        // This ensures offline-first: data should already be in local DB
        try {
          const { shouldPerformComprehensiveSync } = await import('./src/services/loginSyncHelper');
          const { NetworkService } = await import('./src/services/networkService');
          
          // Check if device is online (sync only works when online)
          const isOnline = await NetworkService.isOnline();
          
          if (!isOnline) {
            console.log('⏭️ AUTO-LOGIN DEBUG: Device is offline, skipping sync check (offline-first mode)');
            // Work with local data only when offline
            return;
          }
          
          // Determine if comprehensive sync should be performed
          const syncDecision = await shouldPerformComprehensiveSync(autoLoginResult.user.id);
          
          if (syncDecision.shouldSync) {
            console.log(`🔄 AUTO-LOGIN DEBUG: Starting comprehensive sync - Reason: ${syncDecision.reason}...`);
            
            const { ComprehensiveServerSyncService } = await import('./src/services/comprehensiveServerSyncService');
            const syncResult = await ComprehensiveServerSyncService.performComprehensiveSync(autoLoginResult.user.id);
            
            if (syncResult.success) {
              console.log('✅ AUTO-LOGIN DEBUG: Comprehensive sync completed successfully');
              console.log('📊 AUTO-LOGIN DEBUG: Synced tables:', syncResult.syncedTables);
              
              // Store sync time after successful sync
              try {
                const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                await AsyncStorage.setItem(`last_sync_time_${autoLoginResult.user.id}`, Date.now().toString());
                console.log('✅ AUTO-LOGIN DEBUG: Sync timestamp stored');
              } catch (error) {
                console.error('❌ AUTO-LOGIN DEBUG: Failed to store sync time:', error);
              }
            } else {
              console.warn('⚠️ AUTO-LOGIN DEBUG: Comprehensive sync failed:', syncResult.error);
            }
          } else {
            console.log(`⏭️ AUTO-LOGIN DEBUG: Skipping sync - Local DB is ${syncDecision.reason} (offline-first mode)`);
            // Work with local data only
            
            // Even if sync is skipped, clean up any duplicates that may exist
            try {
              const { ComprehensiveServerSyncService } = await import('./src/services/comprehensiveServerSyncService');
              await Promise.all([
                ComprehensiveServerSyncService.cleanupDuplicateDoctorsByName(autoLoginResult.user.id),
                ComprehensiveServerSyncService.cleanupDuplicateMeetings(autoLoginResult.user.id),
                ComprehensiveServerSyncService.cleanupDuplicateSavedBrochures(autoLoginResult.user.id),
                ComprehensiveServerSyncService.cleanupDuplicateMeetingSlideNotes(autoLoginResult.user.id)
              ]);
            } catch (cleanupError) {
              console.warn('⚠️ AUTO-LOGIN DEBUG: Error cleaning up duplicates:', cleanupError);
            }
          }
        } catch (error) {
          console.error('❌ AUTO-LOGIN DEBUG: Sync check error:', error);
        }
        
        return
      }
      
      // Fallback to regular auth check
      const isAuth = await AuthService.isAuthenticated()
      if (isAuth) {
        const result = await AuthService.getCurrentUser()
        if (result.success && result.user) {
          setIsAuthenticated(true)
          setUserRole(result.user.role)
          
          // Register session and initialize sync service
          await SessionManagementService.registerSessionWithConflictCheck(result.user.id)
          // await AdvancedSyncService.initialize() // DISABLED - causing infinite doctor creation
          // await UnifiedSyncService.initialize() // Temporarily disabled to fix sync issues
          
          // Perform initial sync from server to local database
          // console.log('Performing initial sync from server...')
          // try {
          //   const syncResult = await InitialSyncService.performInitialSync()
          //   if (syncResult.success) {
          //     console.log('Initial sync completed successfully')
          //   } else {
          //     console.warn('Initial sync failed:', syncResult.error)
          //   }
          // } catch (error) {
          //   console.error('Initial sync error:', error)
          // }
        } else {
          setIsAuthenticated(false)
          setUserRole(null)
        }
      } else {
        console.log('No authentication found')
        setIsAuthenticated(false)
        setUserRole(null)
      }
    } catch (error) {
      console.error('Error checking auth state:', error)
      setIsAuthenticated(false)
      setUserRole(null)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppDataProvider>
        <GlobalFormProvider>
          <AppNavigator />
          
          {/* Unified Sync Indicator - Top Banner - Temporarily disabled */}
          {/* <UnifiedSyncIndicator /> */}
        </GlobalFormProvider>
      </AppDataProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    paddingTop: 30,
  },
  logo: {
    width: 180,
    height: 180,
    marginBottom: 0,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    marginTop: -40,
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
});
