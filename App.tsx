import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthService } from './src/services/AuthService';
import LoginScreen from './src/screens/LoginScreen';
import AdminDashboardScreen from './src/screens/admin/AdminDashboardScreen';
import AddMRScreen from './src/screens/admin/AddMRScreen';
import ViewAllMRsScreen from './src/screens/admin/ViewAllMRsScreen';
import AddBrochureScreen from './src/screens/admin/AddBrochureScreen';
import ViewAllBrochuresScreen from './src/screens/admin/ViewAllBrochuresScreen';
import DocumentViewerScreen from './src/screens/admin/DocumentViewerScreen';
import AdminSlideManagementScreen from './src/screens/admin/SlideManagementScreen';
import MRDashboardScreen from './src/screens/mr/MRDashboardScreen';
import BrochuresScreen from './src/screens/mr/BrochuresScreen';
import DoctorsScreen from './src/screens/mr/DoctorsScreen';
import MeetingsScreen from './src/screens/mr/MeetingsScreen';
// import PresentationsScreen from './src/screens/mr/PresentationsScreen';
// import PresentationModeScreen from './src/screens/mr/PresentationModeScreen';
import SlideManagementScreen from './src/screens/mr/SlideManagementScreen';
import PDFConversionScreen from './src/screens/mr/PDFConversionScreen';
import BrochureViewerScreen from './src/screens/mr/BrochureViewerScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function WelcomeScreen({ navigation }: { navigation: any }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Text style={styles.title}>MedPresent</Text>
        <Text style={styles.subtitle}>Medical Presentation App</Text>
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
      })}
    >
      <Tab.Screen name="MRDashboard" component={MRDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Brochures" component={BrochuresScreen} options={{ title: 'Brochures' }} />
      <Tab.Screen name="Doctors" component={DoctorsScreen} options={{ title: 'Doctors' }} />
      <Tab.Screen name="Meetings" component={MeetingsScreen} options={{ title: 'Meetings' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'mr' | null>(null);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const isAuth = await AuthService.isAuthenticated();
      if (isAuth) {
        const result = await AuthService.getCurrentUser();
        if (result.success && result.user) {
          setIsAuthenticated(true);
          setUserRole(result.user.role);
        } else {
          setIsAuthenticated(false);
          setUserRole(null);
        }
      } else {
        setIsAuthenticated(false);
        setUserRole(null);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUserRole(null);
    } finally {
      setIsLoading(false);
    }
  };

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
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName={isAuthenticated ? (userRole === 'admin' ? 'AdminDashboard' : 'MRTabs') : 'Welcome'}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#ffffff' }
          }}
        >
        <Stack.Screen 
          name="Welcome" 
          component={WelcomeScreen}
          options={{
            statusBarStyle: 'light'
          }}
        />
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="AdminDashboard" 
          component={AdminDashboardScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="AddMR" 
          component={AddMRScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="ViewAllMRs" 
          component={ViewAllMRsScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="AddBrochure" 
          component={AddBrochureScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="ViewAllBrochures" 
          component={ViewAllBrochuresScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="DocumentViewer" 
          component={DocumentViewerScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="AdminSlideManagement" 
          component={AdminSlideManagementScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="MRTabs" 
          component={MRTabs}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        {/* <Stack.Screen 
          name="PresentationMode" 
          component={PresentationModeScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        /> */}
        <Stack.Screen 
          name="SlideManagement" 
          component={SlideManagementScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="PDFConversion" 
          component={PDFConversionScreen}
          options={{
            statusBarStyle: 'dark'
          }}
        />
        <Stack.Screen 
          name="BrochureViewer" 
          component={BrochureViewerScreen}
          options={{
            statusBarStyle: 'light',
            headerShown: false
          }}
        />
      </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#8b5cf6',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: 'white',
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: 'white',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  buttonText: {
    color: '#8b5cf6',
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
