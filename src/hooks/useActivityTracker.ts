/**
 * Activity Tracker Hook
 * Tracks user activity and updates persistent session
 */
import { useEffect } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { PersistentAuthService } from '../services/persistentAuthService'

export const useActivityTracker = () => {
  useEffect(() => {
    let activityTimer: NodeJS.Timeout

    const updateActivity = async () => {
      try {
        await PersistentAuthService.updateActivity()
      } catch (error) {
        console.log('Failed to update activity:', error)
      }
    }

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App became active, update activity
        updateActivity()
        
        // Set up periodic activity updates while app is active
        activityTimer = setInterval(updateActivity, 5 * 60 * 1000) // Every 5 minutes
      } else {
        // App going to background, clear timer
        if (activityTimer) {
          clearInterval(activityTimer)
        }
      }
    }

    // Initial activity update
    updateActivity()

    // Set up app state listener
    const subscription = AppState.addEventListener('change', handleAppStateChange)

    // Set up initial timer if app is active
    if (AppState.currentState === 'active') {
      activityTimer = setInterval(updateActivity, 5 * 60 * 1000)
    }

    return () => {
      subscription?.remove()
      if (activityTimer) {
        clearInterval(activityTimer)
      }
    }
  }, [])
}

export default useActivityTracker
