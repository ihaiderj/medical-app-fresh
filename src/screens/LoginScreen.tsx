import { useState, useEffect } from "react"
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator, Image } from "react-native"
import { StatusBar } from "expo-status-bar"
import { Ionicons } from "@expo/vector-icons"
import { AuthService } from "../services/AuthService"
import { SmartSyncService } from "../services/smartSyncService"
import { LoginSyncService, LoginSyncProgress } from "../services/loginSyncService"
import LoginSyncScreen from "../components/LoginSyncScreen"

interface LoginScreenProps {
  navigation: any
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [userType, setUserType] = useState<"admin" | "mr">("mr")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [showSyncScreen, setShowSyncScreen] = useState(false)
  const [syncProgress, setSyncProgress] = useState<LoginSyncProgress>({
    step: 'Starting',
    message: 'Initializing sync...',
    progress: 0
  })

  // Check if user is already logged in
  useEffect(() => {
    checkAuthState()
  }, [])

  const checkAuthState = async () => {
    const isAuth = await AuthService.isAuthenticated()
    if (isAuth) {
      const result = await AuthService.getCurrentUser()
      if (result.success && result.user) {
        // Navigate based on user role
        if (result.user.role === 'admin') {
          navigation.replace("AdminTabs")
        } else {
          navigation.replace("MRTabs")
        }
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
      const result = await AuthService.login(email, password, rememberMe)
      
      if (result.success && result.user) {
        // Show session conflict alert if needed
        if (result.hasSessionConflict && result.conflictDevice) {
          Alert.alert(
            'Device Login Detected',
            `You were logged in on another device (${result.conflictDevice}). You have been logged out from that device for security.`,
            [{ text: 'OK', style: 'default' }]
          )
        }

        // Initialize smart sync service
        await SmartSyncService.initialize()
        
        // Show sync screen for MR users and perform background sync
        if (result.user.role === 'mr') {
          setShowSyncScreen(true)
          
          // Perform login sync in background
          LoginSyncService.performLoginSync(
            result.user.id,
            setSyncProgress
          ).then((syncResult) => {
            setShowSyncScreen(false)
            if (!syncResult.success) {
              console.warn('Login sync failed:', syncResult.error)
            }
          }).catch((error) => {
            setShowSyncScreen(false)
            console.warn('Login sync error:', error)
          })
          
          // Navigate immediately (sync continues in background)
          setTimeout(() => {
            navigation.replace("MRTabs")
          }, 2000) // Show sync screen for 2 seconds
        } else {
          // Admin users navigate immediately
          navigation.replace("AdminTabs")
        }
      } else {
        Alert.alert("Login Failed", result.error || "Invalid credentials")
      }
    } catch (error) {
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

          {/* Remember Me Checkbox */}
          <TouchableOpacity 
            style={styles.rememberMeContainer} 
            onPress={() => setRememberMe(!rememberMe)}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && (
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              )}
            </View>
            <Text style={styles.rememberMeText}>Keep me signed in for 30 days</Text>
          </TouchableOpacity>

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
        visible={showSyncScreen}
        syncProgress={syncProgress}
        onSyncComplete={() => setShowSyncScreen(false)}
        onSyncError={(error) => {
          setShowSyncScreen(false)
          Alert.alert('Sync Error', error)
        }}
      />
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
  rememberMeContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#d1d5db",
    borderRadius: 4,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxChecked: {
    backgroundColor: "#8b5cf6",
    borderColor: "#8b5cf6",
  },
  rememberMeText: {
    fontSize: 14,
    color: "#6b7280",
    flex: 1,
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
