import { useState, useEffect, useRef } from "react"
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator, Image } from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AuthService } from "../services/AuthService"
import { SmartSyncService } from "../services/smartSyncService"
import { LoginSyncService, LoginSyncProgress } from "../services/loginSyncService"
import LoginSyncScreen from "../components/LoginSyncScreen"
import { ExtendedAuthService } from "../services/extendedAuthService"
import { NetworkService } from "../services/networkService"
import { OfflineBrochureService } from "../services/offlineBrochureService"
import { CompleteDataSyncService, BrochureSyncResult } from "../services/completeDataSyncService"
import { ComprehensiveServerSyncService } from "../services/comprehensiveServerSyncService"
import { FirstTimeLoginService } from "../services/firstTimeLoginService"
import { LocalDatabaseService } from "../services/localDatabaseService"
import { useNavigation } from '@react-navigation/native';
import { useAppData } from '../context/AppDataContext';
import { UserProfile } from "../services/AuthService";
import BrochureSyncPrompt from "../components/BrochureSyncPrompt";
import { BrochureManagementService } from "../services/brochureManagementService";
import { MRService } from "../services/MRService";

interface LoginScreenProps {
  navigation: any
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [userType, setUserType] = useState<"admin" | "mr">("mr")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Removed rememberMe - user stays logged in until manual logout
  const [showSyncScreen, setShowSyncScreen] = useState(false)
  const [syncProgress, setSyncProgress] = useState<LoginSyncProgress>({
    step: 'Starting',
    message: 'Initializing sync...',
    progress: 0
  })
  const [isFirstLogin, setIsFirstLogin] = useState(false)
  const { loginUser } = useAppData();
  const userProfileRef = useRef<UserProfile | null>(null); // Store user profile to call loginUser after sync
  const [brochurePrompts, setBrochurePrompts] = useState<{
    savedBrochuresToUpdate: Array<{
      brochureId: string;
      brochureTitle: string;
      serverLastModified: string;
      localLastModified?: string;
    }>;
    savedBrochuresToDownload: Array<{
      brochureId: string;
      brochureTitle: string;
      fileUrl?: string;
    }>;
    newAvailableBrochures: Array<{
      id: string;
      title: string;
      category: string;
    }>;
  } | null>(null);
  const [currentPromptIndex, setCurrentPromptIndex] = useState<{
    type: 'update' | 'download' | 'new';
    index: number;
  } | null>(null);
  const [isProcessingPrompt, setIsProcessingPrompt] = useState(false);

  // Check if user is already logged in
  useEffect(() => {
    checkAuthState()
  }, [])

  const checkAuthState = async () => {
    const isAuth = await AuthService.isAuthenticated()
    if (isAuth) {
      const result = await AuthService.getCurrentUser()
      if (result.success && result.user) {
        // Navigation is handled reactively by App.tsx based on user state
      }
    }
  }

  const showNextPrompt = (
    prompts: BrochureSyncResult,
    userId: string
  ) => {
    // Priority: saved brochures to download > saved brochures to update > new available brochures
    // Check current prompt index to move to next item
    if (currentPromptIndex) {
      // Move to next item in current category
      if (currentPromptIndex.type === 'download' && 
          currentPromptIndex.index < prompts.savedBrochuresToDownload.length - 1) {
        setCurrentPromptIndex({ type: 'download', index: currentPromptIndex.index + 1 });
        return;
      }
      
      if (currentPromptIndex.type === 'update' && 
          currentPromptIndex.index < prompts.savedBrochuresToUpdate.length - 1) {
        setCurrentPromptIndex({ type: 'update', index: currentPromptIndex.index + 1 });
        return;
      }
      
      if (currentPromptIndex.type === 'new' && 
          currentPromptIndex.index < prompts.newAvailableBrochures.length - 1) {
        setCurrentPromptIndex({ type: 'new', index: currentPromptIndex.index + 1 });
        return;
      }
    }
    
    // Move to next category
    if (prompts.savedBrochuresToDownload.length > 0) {
      // Check if we've already shown all download prompts
      const hasShownAllDownloads = currentPromptIndex?.type === 'download' && 
        currentPromptIndex.index >= prompts.savedBrochuresToDownload.length - 1;
      
      if (!hasShownAllDownloads) {
        // Show saved brochure download prompt
        setCurrentPromptIndex({ type: 'download', index: 0 });
        return;
      }
    }
    
    if (prompts.savedBrochuresToUpdate.length > 0) {
      // Check if we've already shown all update prompts
      const hasShownAllUpdates = currentPromptIndex?.type === 'update' && 
        currentPromptIndex.index >= prompts.savedBrochuresToUpdate.length - 1;
      
      if (!hasShownAllUpdates && (!currentPromptIndex || currentPromptIndex.type !== 'new')) {
        // Show saved brochure update prompt
        setCurrentPromptIndex({ type: 'update', index: 0 });
        return;
      }
    }
    
    if (prompts.newAvailableBrochures.length > 0) {
      // Check if we've already shown all new brochure prompts
      const hasShownAllNew = currentPromptIndex?.type === 'new' && 
        currentPromptIndex.index >= prompts.newAvailableBrochures.length - 1;
      
      if (!hasShownAllNew) {
        // Show new available brochure prompt
        setCurrentPromptIndex({ type: 'new', index: 0 });
        return;
      }
    }
    
    // No more prompts, complete login and hide sync screen
    if (userProfileRef.current) {
      console.log('✅ LOGIN DEBUG: All prompts done, completing login');
      loginUser(userProfileRef.current);
      setTimeout(() => {
        setShowSyncScreen(false);
        setIsFirstLogin(false);
        setBrochurePrompts(null);
        setCurrentPromptIndex(null);
      }, 500);
    } else {
      // Fallback: just hide sync screen
      setShowSyncScreen(false);
      setIsFirstLogin(false);
      setBrochurePrompts(null);
      setCurrentPromptIndex(null);
    }
  }

  const handleDownloadNow = async (brochureId: string, brochureTitle: string, fileUrl?: string, userId?: string) => {
    if (!userId || !fileUrl) {
      Alert.alert('Error', 'Missing information to download brochure');
      return;
    }

    setIsProcessingPrompt(true);
    try {
      console.log('🔍 LOGIN DEBUG: Downloading brochure:', brochureTitle);
      
      // Download the brochure file
      const downloadResult = await BrochureManagementService.downloadBrochureFile(
        brochureId,
        fileUrl,
        userId,
        brochureTitle
      );

      if (downloadResult.success && downloadResult.localPath) {
        console.log('✅ LOGIN DEBUG: Brochure downloaded successfully:', brochureTitle);
        Alert.alert('Success', `Downloaded "${brochureTitle}" successfully`);
        
        // Remove from prompts list
        if (brochurePrompts) {
          const updatedPrompts = { ...brochurePrompts };
          updatedPrompts.savedBrochuresToDownload = updatedPrompts.savedBrochuresToDownload.filter(
            b => b.brochureId !== brochureId
          );
          setBrochurePrompts(updatedPrompts);
        }
      } else {
        Alert.alert('Error', downloadResult.error || 'Failed to download brochure');
      }
    } catch (error) {
      console.error('❌ LOGIN DEBUG: Failed to download brochure:', error);
      Alert.alert('Error', 'Failed to download brochure');
    } finally {
      setIsProcessingPrompt(false);
      
      // Move to next prompt
      if (brochurePrompts) {
        showNextPrompt(brochurePrompts, userId);
      }
    }
  }

  const handleUpdateNow = async (brochureId: string, brochureTitle: string, userId?: string) => {
    if (!userId) {
      Alert.alert('Error', 'User information not available');
      return;
    }

    setIsProcessingPrompt(true);
    try {
      console.log('🔍 LOGIN DEBUG: Updating brochure:', brochureTitle);
      
      // Download brochure changes
      const downloadResult = await BrochureManagementService.downloadBrochureChanges(userId, brochureId);
      
      if (downloadResult.success && downloadResult.data) {
        // Apply brochure changes
        const applyResult = await BrochureManagementService.applyBrochureChanges(brochureId, downloadResult.data);
        
        if (applyResult.success) {
          console.log('✅ LOGIN DEBUG: Brochure updated successfully:', brochureTitle);
          Alert.alert('Success', `Updated "${brochureTitle}" successfully`);
          
          // Remove from prompts list
          if (brochurePrompts) {
            const updatedPrompts = { ...brochurePrompts };
            updatedPrompts.savedBrochuresToUpdate = updatedPrompts.savedBrochuresToUpdate.filter(
              b => b.brochureId !== brochureId
            );
            setBrochurePrompts(updatedPrompts);
          }
        } else {
          Alert.alert('Error', applyResult.error || 'Failed to apply brochure updates');
        }
      } else {
        Alert.alert('Error', downloadResult.error || 'Failed to download brochure updates');
      }
    } catch (error) {
      console.error('❌ LOGIN DEBUG: Failed to update brochure:', error);
      Alert.alert('Error', 'Failed to update brochure');
    } finally {
      setIsProcessingPrompt(false);
      
      // Move to next prompt
      if (brochurePrompts) {
        showNextPrompt(brochurePrompts, userId);
      }
    }
  }

  const handleDownloadLater = async (brochureId: string, type: 'download' | 'new') => {
    // Remove from prompts list
    if (brochurePrompts) {
      const updatedPrompts = { ...brochurePrompts };
      if (type === 'download') {
        updatedPrompts.savedBrochuresToDownload = updatedPrompts.savedBrochuresToDownload.filter(
          b => b.brochureId !== brochureId
        );
      } else {
        updatedPrompts.newAvailableBrochures = updatedPrompts.newAvailableBrochures.filter(
          b => b.id !== brochureId
        );
      }
      setBrochurePrompts(updatedPrompts);
      
      // Move to next prompt
      const userResult = await AuthService.getCurrentUser();
      if (userResult.success && userResult.user) {
        showNextPrompt(updatedPrompts, userResult.user.id);
      }
    }
  }

  const handleUpdateLater = async (brochureId: string) => {
    // Remove from prompts list
    if (brochurePrompts) {
      const updatedPrompts = { ...brochurePrompts };
      updatedPrompts.savedBrochuresToUpdate = updatedPrompts.savedBrochuresToUpdate.filter(
        b => b.brochureId !== brochureId
      );
      setBrochurePrompts(updatedPrompts);
      
      // Move to next prompt
      const userResult = await AuthService.getCurrentUser();
      if (userResult.success && userResult.user) {
        showNextPrompt(updatedPrompts, userResult.user.id);
      }
    }
  }

  const handleKeepLocal = async (brochureId: string) => {
    // Remove from prompts list (user chose to keep local version)
    if (brochurePrompts) {
      const updatedPrompts = { ...brochurePrompts };
      updatedPrompts.savedBrochuresToUpdate = updatedPrompts.savedBrochuresToUpdate.filter(
        b => b.brochureId !== brochureId
      );
      setBrochurePrompts(updatedPrompts);
      
      // Move to next prompt
      const userResult = await AuthService.getCurrentUser();
      if (userResult.success && userResult.user) {
        showNextPrompt(updatedPrompts, userResult.user.id);
      }
    }
  }

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields")
      return
    }

    setIsLoading(true)

    try {
      // Use extended authentication service
      const result = await ExtendedAuthService.authenticate(email, password) // Always remember user
      
      if (result.success && result.user) {
        console.log('Login successful, mapping user and updating AppContext.');
        
        // The user object from AuthService/ExtendedAuthService has first_name and last_name
        const userProfile: UserProfile = {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          first_name: result.user.full_name?.split(' ')[0] || '',
          last_name: result.user.full_name?.split(' ').slice(1).join(' ') || '',
          is_active: true, // Assuming active on login
        };
        
        // Store user profile in ref for use after sync/prompts
        userProfileRef.current = userProfile;

        // Show offline login indicator if applicable
        if (result.isOfflineAuth) {
          Alert.alert(
            'Offline Login',
            'You are logged in using offline authentication. Some features may be limited until you connect to the internet.',
            [{ text: 'OK', style: 'default' }]
          )
        }

        // Initialize smart sync service (will handle offline gracefully)
        await SmartSyncService.initialize()
        
        // For MR users: Show sync screen and perform sync BEFORE setting user (to block navigation)
        // For admin users: Set user immediately (no sync needed)
        if (result.user.role === 'mr') {
          console.log('🔍 LOGIN DEBUG: User is MR, showing sync screen and performing sync before navigation');
          setShowSyncScreen(true)
          setIsFirstLogin(true)
          
          // Check if this is first time login
          const firstTimeInfo = await FirstTimeLoginService.isFirstTimeLogin(result.user.id);
          console.log('🔍 LOGIN DEBUG: First time login info:', firstTimeInfo);
          
          // Track sync completion
          let syncCompleted = false
          
          if (firstTimeInfo.isFirstTime) {
            console.log('🚀 LOGIN DEBUG: First time login detected - performing comprehensive sync');
            
            // Set up progress callback for comprehensive sync
            ComprehensiveServerSyncService.setProgressCallback((progress) => {
              console.log('🔍 LOGIN DEBUG: Comprehensive sync progress:', progress);
              setSyncProgress({
                step: progress.step,
                message: progress.message,
                progress: progress.progress
              });
              
              // When sync reaches 100%, complete login
              if (progress.progress >= 100 && !syncCompleted) {
                syncCompleted = true
                console.log('✅ LOGIN DEBUG: Sync completed, setting user and allowing navigation');
                loginUser(userProfile)
                setTimeout(() => {
                  setShowSyncScreen(false)
                  setIsFirstLogin(false)
                }, 1000)
              }
            });
            
            // Perform comprehensive data sync
            try {
              console.log('🚀 LOGIN DEBUG: Starting comprehensive server sync for user:', result.user.id);
              const syncResult = await ComprehensiveServerSyncService.performComprehensiveSync(result.user.id);
              if (syncResult.success) {
                console.log('✅ LOGIN DEBUG: Comprehensive sync completed successfully');
                console.log('📊 LOGIN DEBUG: Synced tables:', syncResult.syncedTables);
                
                // Mark first time login as completed
                await FirstTimeLoginService.markFirstTimeLoginCompleted(result.user.id);
                
                // Store sync timestamp
                await AsyncStorage.setItem(`last_sync_time_${result.user.id}`, Date.now().toString())
                
                // Verify user profile was updated after sync
                const updatedUser = await LocalDatabaseService.getUserById(result.user.id);
                console.log('🔍 LOGIN DEBUG: User profile after comprehensive sync:', updatedUser);
                
                // If sync didn't trigger callback (shouldn't happen), set user now
                if (!syncCompleted) {
                  syncCompleted = true
                  loginUser(userProfile)
                  setTimeout(() => {
                    setShowSyncScreen(false)
                    setIsFirstLogin(false)
                  }, 1000)
                }
              } else {
                console.warn('❌ LOGIN DEBUG: Comprehensive sync failed:', syncResult.error);
                // Even on failure, allow login (offline-first)
                if (!syncCompleted) {
                  syncCompleted = true
                  loginUser(userProfile)
                  setTimeout(() => {
                    setShowSyncScreen(false)
                    setIsFirstLogin(false)
                  }, 1000)
                }
              }
            } catch (error) {
              console.error('❌ LOGIN DEBUG: Comprehensive sync error:', error);
              // Even on error, allow login (offline-first)
              if (!syncCompleted) {
                syncCompleted = true
                loginUser(userProfile)
                setTimeout(() => {
                  setShowSyncScreen(false)
                  setIsFirstLogin(false)
                }, 1000)
              }
            }
          } else {
            console.log('🔍 LOGIN DEBUG: Not first time login - performing regular sync');
            
            // Set up progress callback for regular sync
            CompleteDataSyncService.setProgressCallback((progress) => {
              console.log('🔍 LOGIN DEBUG: Regular sync progress:', progress);
              setSyncProgress({
                step: progress.step,
                message: progress.message,
                progress: progress.progress
              });
              
              // When sync reaches 100%, complete login
              if (progress.progress >= 100 && !syncCompleted) {
                syncCompleted = true
                console.log('✅ LOGIN DEBUG: Regular sync completed, setting user and allowing navigation');
                loginUser(userProfile)
                setTimeout(() => {
                  setShowSyncScreen(false)
                  setIsFirstLogin(false)
                }, 1000)
              }
            });
            
            // Perform regular data sync
            try {
              console.log('🚀 LOGIN DEBUG: Starting regular data sync for user:', result.user.id);
              // Clear previous sync results
              CompleteDataSyncService.clearBrochureSyncResult();
              
              const syncResult = await CompleteDataSyncService.performCompleteSync(result.user.id);
              if (syncResult.success) {
                console.log('✅ LOGIN DEBUG: Regular sync completed successfully');
                
                // Store sync timestamp
                await AsyncStorage.setItem(`last_sync_time_${result.user.id}`, Date.now().toString())
                
                // Get brochure sync results
                const brochureSyncResult = CompleteDataSyncService.getBrochureSyncResult();
                console.log('🔍 LOGIN DEBUG: Brochure sync results:', brochureSyncResult);
                
                // Check if there are prompts to show
                if (brochureSyncResult.savedBrochuresToDownload.length > 0 ||
                    brochureSyncResult.savedBrochuresToUpdate.length > 0 ||
                    brochureSyncResult.newAvailableBrochures.length > 0) {
                  console.log('🔍 LOGIN DEBUG: Found brochures to prompt:', {
                    toDownload: brochureSyncResult.savedBrochuresToDownload.length,
                    toUpdate: brochureSyncResult.savedBrochuresToUpdate.length,
                    newAvailable: brochureSyncResult.newAvailableBrochures.length
                  });
                  
                  // Store prompts for sequential display
                  setBrochurePrompts(brochureSyncResult);
                  
                  // Start showing prompts (but don't hide sync screen yet)
                  showNextPrompt(brochureSyncResult, result.user.id);
                  
                  // Complete login after prompts are handled
                  if (!syncCompleted) {
                    syncCompleted = true
                    loginUser(userProfile)
                  }
                } else {
                  // No prompts, complete login
                  if (!syncCompleted) {
                    syncCompleted = true
                    loginUser(userProfile)
                    setTimeout(() => {
                      setShowSyncScreen(false);
                      setIsFirstLogin(false);
                    }, 1000);
                  }
                }
              } else {
                console.warn('❌ LOGIN DEBUG: Regular sync failed:', syncResult.error);
                // Even on failure, allow login (offline-first)
                if (!syncCompleted) {
                  syncCompleted = true
                  loginUser(userProfile)
                  setTimeout(() => {
                    setShowSyncScreen(false);
                    setIsFirstLogin(false);
                  }, 1000);
                }
              }
            } catch (error) {
              console.error('❌ LOGIN DEBUG: Regular sync error:', error);
              // Even on error, allow login (offline-first)
              if (!syncCompleted) {
                syncCompleted = true
                loginUser(userProfile)
                setTimeout(() => {
                  setShowSyncScreen(false);
                  setIsFirstLogin(false);
                }, 1000);
              }
            }
          }
          
          // Initialize offline brochure service
          try {
            await OfflineBrochureService.initializeForNewUser(result.user.id);
            console.log('Offline brochure service initialized');
          } catch (error) {
            console.error('Failed to initialize offline brochure service:', error);
          }
        } else {
          // Admin users: set user immediately (no sync needed)
          loginUser(userProfile);
        }
        
        // Navigation is handled reactively by App.tsx based on user state
        // No need for manual navigation here.
      } else {
        Alert.alert('Login Failed', result.error || 'An unknown error occurred.');
      }
    } catch (error) {
      console.error('Login error:', error)
      Alert.alert("Error", "An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../../assets/icon.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>Fervid</Text>
          <Text style={styles.subtitle}>Professional Medical Presentations</Text>
        </View>

        {/* User Type Selection */}
        <View style={styles.userTypeContainer}>
          <TouchableOpacity
            style={[styles.userTypeButton, userType === "mr" && styles.userTypeButtonActive]}
            onPress={() => setUserType("mr")}
          >
            <Ionicons name="person" size={24} color={userType === "mr" ? "#ffffff" : "#6b7280"} />
            <Text style={[styles.userTypeText, userType === "mr" && styles.userTypeTextActive]}>
              Medical Representative
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.userTypeButton, userType === "admin" && styles.userTypeButtonActive]}
            onPress={() => setUserType("admin")}
          >
            <Ionicons name="shield-checkmark" size={24} color={userType === "admin" ? "#ffffff" : "#6b7280"} />
            <Text style={[styles.userTypeText, userType === "admin" && styles.userTypeTextActive]}>Administrator</Text>
          </TouchableOpacity>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity style={styles.passwordToggle} onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* User stays logged in until manual logout */}

          <TouchableOpacity 
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} 
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Text style={styles.loginButtonText}>Sign In</Text>
                <Ionicons name="arrow-forward" size={20} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Secure medical presentation platform for pharmaceutical professionals</Text>
        </View>
        </View>
      </SafeAreaView>
      
      {/* Login Sync Screen */}
      <LoginSyncScreen
        visible={showSyncScreen && !currentPromptIndex}
        syncProgress={syncProgress}
        onSyncComplete={() => setShowSyncScreen(false)}
        onSyncError={(error) => {
          setShowSyncScreen(false)
          Alert.alert('Sync Error', error)
        }}
      />

      {/* Brochure Sync Prompts */}
      {brochurePrompts && currentPromptIndex && (
        <>
          {/* Saved Brochure Download Prompt */}
          {currentPromptIndex.type === 'download' && 
           brochurePrompts.savedBrochuresToDownload[currentPromptIndex.index] && (() => {
            const brochure = brochurePrompts.savedBrochuresToDownload[currentPromptIndex.index];
            return (
              <BrochureSyncPrompt
                visible={true}
                type="download"
                brochureId={brochure.brochureId}
                brochureTitle={brochure.brochureTitle}
                onDownloadNow={async () => {
                  const userResult = await AuthService.getCurrentUser();
                  if (userResult.success && userResult.user) {
                    await handleDownloadNow(brochure.brochureId, brochure.brochureTitle, brochure.fileUrl, userResult.user.id);
                  }
                }}
                onDownloadLater={() => handleDownloadLater(brochure.brochureId, 'download')}
                onDismiss={() => handleDownloadLater(brochure.brochureId, 'download')}
              />
            );
          })()}

          {/* Saved Brochure Update Prompt */}
          {currentPromptIndex.type === 'update' && 
           brochurePrompts.savedBrochuresToUpdate[currentPromptIndex.index] && (() => {
            const brochure = brochurePrompts.savedBrochuresToUpdate[currentPromptIndex.index];
            return (
              <BrochureSyncPrompt
                visible={true}
                type="update"
                brochureId={brochure.brochureId}
                brochureTitle={brochure.brochureTitle}
                onUpdateNow={async () => {
                  const userResult = await AuthService.getCurrentUser();
                  if (userResult.success && userResult.user) {
                    await handleUpdateNow(brochure.brochureId, brochure.brochureTitle, userResult.user.id);
                  }
                }}
                onKeepLocal={() => handleKeepLocal(brochure.brochureId)}
                onUpdateLater={() => handleUpdateLater(brochure.brochureId)}
                onDismiss={() => handleUpdateLater(brochure.brochureId)}
              />
            );
          })()}

          {/* New Available Brochure Prompt */}
          {currentPromptIndex.type === 'new' && 
           brochurePrompts.newAvailableBrochures[currentPromptIndex.index] && (() => {
            const brochure = brochurePrompts.newAvailableBrochures[currentPromptIndex.index];
            return (
              <BrochureSyncPrompt
                visible={true}
                type="new"
                brochureId={brochure.id}
                brochureTitle={brochure.title}
                onDownloadNow={async () => {
                  // Get brochure details to download
                  const userResult = await AuthService.getCurrentUser();
                  if (userResult.success && userResult.user) {
                    const brochuresResult = await MRService.getAssignedBrochures(userResult.user.id);
                    if (brochuresResult.success && brochuresResult.data) {
                      const brochureData = brochuresResult.data.find((b: any) => b.id === brochure.id);
                      if (brochureData && brochureData.file_url) {
                        await handleDownloadNow(brochure.id, brochure.title, brochureData.file_url, userResult.user.id);
                      }
                    }
                  }
                }}
                onDownloadLater={() => handleDownloadLater(brochure.id, 'new')}
                onDismiss={() => handleDownloadLater(brochure.id, 'new')}
              />
            );
          })()}
        </>
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
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    backgroundColor: "#f1f5f9",
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logo: {
    width: 60,
    height: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
  userTypeContainer: {
    flexDirection: "row",
    marginBottom: 32,
    gap: 12,
  },
  userTypeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  userTypeButtonActive: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  userTypeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    textAlign: "center",
  },
  userTypeTextActive: {
    color: "#ffffff",
  },
  form: {
    gap: 16,
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#1f2937",
  },
  passwordToggle: {
    padding: 4,
  },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8b5cf6",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  footer: {
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },
})
