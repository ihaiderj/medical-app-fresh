import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import AdminDashboardScreen from './AdminDashboardScreen'
import ViewAllMRsScreen from './ViewAllMRsScreen'
import ViewAllBrochuresScreen from './ViewAllBrochuresScreen'

const Tab = createBottomTabNavigator()

export default function AdminTabs() {
  const insets = useSafeAreaInsets()
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap

          if (route.name === 'Dashboard') {
            iconName = focused ? 'grid' : 'grid-outline'
          } else if (route.name === 'Medical Reps') {
            iconName = focused ? 'people' : 'people-outline'
          } else if (route.name === 'Brochures') {
            iconName = focused ? 'document-text' : 'document-text-outline'
          } else {
            iconName = 'ellipse'
          }

          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: '#8b5cf6',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
          height: 70 + insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={AdminDashboardScreen}
        options={{
          tabBarLabel: 'Dashboard',
        }}
      />
      <Tab.Screen 
        name="Medical Reps" 
        component={ViewAllMRsScreen}
        options={{
          tabBarLabel: 'Medical Reps',
        }}
      />
      <Tab.Screen 
        name="Brochures" 
        component={ViewAllBrochuresScreen}
        options={{
          tabBarLabel: 'Brochures',
        }}
      />
    </Tab.Navigator>
  )
}
