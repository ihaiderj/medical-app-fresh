/**
 * App Data Context
 * Global state management for doctors, meetings, and notes
 * Ensures all screens stay in sync when data is created/updated
 */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { InteractionManager } from 'react-native';
import { OfflineFirstService } from '../services/offlineFirstService';
import { AuthService, UserProfile } from '../services/AuthService';
import { LocalDoctor, LocalMeeting, LocalMeetingNote } from '../services/localDatabaseService';
import { ExtendedAuthService } from '../services/extendedAuthService';
import { LocalDatabaseService } from '../services/localDatabaseService';
import { appEvents, DATA_CHANGED_EVENT } from '../services/eventService';

export interface AppDataContextType {
  // User
  user: UserProfile | null;
  isDataInitialized: boolean;

  // Data
  doctors: LocalDoctor[];
  meetings: LocalMeeting[];
  isLoading: boolean;
  
  // Refresh functions
  refreshDoctors: () => Promise<void>;
  refreshMeetings: () => Promise<void>;
  refreshAll: () => Promise<void>;
  
  // Subscribe to changes
  onDoctorChange: (callback: () => void) => () => void;
  onMeetingChange: (callback: () => void) => () => void;
  onBrochureChange: (callback: () => void) => () => void;
  onActivityChange: (callback: () => void) => () => void;
  
  // Notify changes (to trigger subscriptions)
  notifyDoctorChange: () => void;
  notifyMeetingChange: () => void;
  notifyBrochureChange: () => void;
  notifyActivityChange: () => void;

  // Authentication
  loginUser: (userData: UserProfile) => void;
  logoutUser: () => void;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

interface AppDataProviderProps {
  children: ReactNode;
}

export const AppDataProvider: React.FC<AppDataProviderProps> = ({ children }) => {
  const [doctors, setDoctors] = useState<LocalDoctor[]>([]);
  const [meetings, setMeetings] = useState<LocalMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isDataInitialized, setIsDataInitialized] = useState(false);
  
  // Event subscribers
  const [doctorSubscribers, setDoctorSubscribers] = useState<Set<() => void>>(new Set());
  const [meetingSubscribers, setMeetingSubscribers] = useState<Set<() => void>>(new Set());
  const [brochureSubscribers, setBrochureSubscribers] = useState<Set<() => void>>(new Set());
  const [activitySubscribers, setActivitySubscribers] = useState<Set<() => void>>(new Set());

  /**
   * Refresh doctors from local database
   */
  const refreshDoctors = useCallback(async () => {
    try {
      // Use user from context, fallback to AuthService
      let userIdToUse = user?.id;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return;
        }
        userIdToUse = userResult.user.id;
      }

      const result = await OfflineFirstService.getDoctors(userIdToUse);
      if (result.success && result.data) {
        setDoctors(result.data);
        console.log('AppDataContext: Doctors refreshed, count:', result.data.length);
      }
    } catch (error) {
      console.error('AppDataContext: Failed to refresh doctors:', error);
    }
  }, [user]);

  /**
   * Refresh meetings from local database
   */
  const refreshMeetings = useCallback(async () => {
    try {
      // Use user from context, fallback to AuthService
      let userIdToUse = user?.id;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          return;
        }
        userIdToUse = userResult.user.id;
      }

      const result = await OfflineFirstService.getMeetings(userIdToUse);
      if (result.success && result.data) {
        setMeetings(result.data);
        console.log('AppDataContext: Meetings refreshed, count:', result.data.length);
      }
    } catch (error) {
      console.error('AppDataContext: Failed to refresh meetings:', error);
    }
  }, [user]);

  /**
   * Refresh all data
   */
  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        refreshDoctors(),
        refreshMeetings(),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [refreshDoctors, refreshMeetings]);

  /**
   * Subscribe to doctor changes
   */
  const onDoctorChange = useCallback((callback: () => void) => {
    setDoctorSubscribers(prev => {
      const newSet = new Set(prev);
      newSet.add(callback);
      return newSet;
    });

    // Return unsubscribe function
    return () => {
      setDoctorSubscribers(prev => {
        const newSet = new Set(prev);
        newSet.delete(callback);
        return newSet;
      });
    };
  }, []);

  /**
   * Subscribe to meeting changes
   */
  const onMeetingChange = useCallback((callback: () => void) => {
    setMeetingSubscribers(prev => {
      const newSet = new Set(prev);
      newSet.add(callback);
      return newSet;
    });

    // Return unsubscribe function
    return () => {
      setMeetingSubscribers(prev => {
        const newSet = new Set(prev);
        newSet.delete(callback);
        return newSet;
      });
    };
  }, []);

  /**
   * Notify all doctor change subscribers
   */
  const notifyDoctorChange = useCallback(() => {
    console.log('AppDataContext: Notifying doctor change');
    
    // Refresh doctors first
    refreshDoctors().then(() => {
      // Then notify all subscribers using the current state
      setDoctorSubscribers(current => {
        console.log('AppDataContext: Notifying', current.size, 'doctor subscribers');
        current.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('AppDataContext: Error in doctor change subscriber:', error);
          }
        });
        return current; // Return same set to avoid triggering state update
      });
    });
  }, [refreshDoctors]);

  /**
   * Notify all meeting change subscribers
   */
  const notifyMeetingChange = useCallback(() => {
    console.log('AppDataContext: Notifying meeting change');
    
    // Defer state updates to avoid React render warnings
    setTimeout(() => {
      // Notify subscribers first (without refreshing meetings to avoid nested updates)
      setMeetingSubscribers(current => {
        console.log('AppDataContext: Notifying', current.size, 'meeting subscribers');
        current.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('AppDataContext: Error in meeting change subscriber:', error);
          }
        });
        return current; // Return same set to avoid triggering state update
      });
      
      // Refresh meetings in background after notifying
      refreshMeetings().catch(error => {
        console.error('AppDataContext: Error refreshing meetings:', error);
      });
    }, 0);
  }, [refreshMeetings]);

  /**
   * Subscribe to brochure changes
   */
  const onBrochureChange = useCallback((callback: () => void) => {
    setBrochureSubscribers(prev => {
      const newSet = new Set(prev);
      newSet.add(callback);
      return newSet;
    });

    // Return unsubscribe function
    return () => {
      setBrochureSubscribers(prev => {
        const newSet = new Set(prev);
        newSet.delete(callback);
        return newSet;
      });
    };
  }, []);

  /**
   * Subscribe to activity changes
   */
  const onActivityChange = useCallback((callback: () => void) => {
    setActivitySubscribers(prev => {
      const newSet = new Set(prev);
      newSet.add(callback);
      return newSet;
    });

    // Return unsubscribe function
    return () => {
      setActivitySubscribers(prev => {
        const newSet = new Set(prev);
        newSet.delete(callback);
        return newSet;
      });
    };
  }, []);

  /**
   * Notify all brochure change subscribers
   */
  const notifyBrochureChange = useCallback(() => {
    console.log('AppDataContext: Notifying brochure change');
    
    // Defer state updates to avoid React render warnings
    setTimeout(() => {
      setBrochureSubscribers(current => {
        console.log('AppDataContext: Notifying', current.size, 'brochure subscribers');
        current.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('AppDataContext: Error in brochure change subscriber:', error);
          }
        });
        return current;
      });
    }, 0);
  }, []);

  /**
   * Notify all activity change subscribers
   */
  const notifyActivityChange = useCallback(() => {
    console.log('AppDataContext: Notifying activity change');
    
    // Defer state updates to avoid React render warnings
    setTimeout(() => {
      setActivitySubscribers(current => {
        console.log('AppDataContext: Notifying', current.size, 'activity subscribers');
        current.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('AppDataContext: Error in activity change subscriber:', error);
          }
        });
        return current;
      });
    }, 0);
  }, []);

  const loginUser = (userData: UserProfile) => {
    console.log("AppDataContext: Logging in user and setting profile.", userData.id);
    AuthService.setCurrentUser(userData);
    setUser(userData);
  };

  const logoutUser = () => {
    console.log("AppDataContext: Logging out user.");
    setUser(null);
    // Clear other data states here
  };

  // Initial data load when user is authenticated (only once on mount)
  const initializeData = useCallback(async () => {
    console.log("AppDataContext: Initializing data...");
    try {
      // Correctly check for a persistent session using existing methods
      const session = await ExtendedAuthService.getExtendedSession();
      if (session && session.userId) {
        // If a session exists, fetch the full user profile
        const userProfile = await LocalDatabaseService.getUserById(session.userId);
        if (userProfile) {
          console.log("AppDataContext: User session loaded from local data, setting user.");
          setUser(userProfile);
          AuthService.setCurrentUser(userProfile);
          
          // Defer non-critical DB maintenance until after first paint
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
              void (async () => {
                try {
                  await LocalDatabaseService.ensureReady();
                  await LocalDatabaseService.markServerDoctorsSynced(session.userId);
                  await LocalDatabaseService.cleanupStaleSyncQueueEntries(session.userId);
                } catch (error) {
                  console.warn('AppDataContext: Failed to fix server doctors sync status:', error);
                }
              })();
            }, 2000);
          });
        }
      }
    } catch (e) {
      console.error("AppDataContext: Error during initial data load:", e);
    } finally {
      console.log("AppDataContext: Data initialization finished.");
      setIsDataInitialized(true);
    }
  }, []);

  useEffect(() => {
    initializeData();
  }, [initializeData]);

  // Effect to load data once a user is authenticated
  useEffect(() => {
    if (!user) return;

    const timer = setTimeout(() => {
      refreshDoctors();
      refreshMeetings();
    }, 1500);

    return () => clearTimeout(timer);
  }, [user, refreshDoctors, refreshMeetings]);

  // Effect to listen for external data changes
  useEffect(() => {
    const handleDataChanged = ({ source }: { source: string }) => {
      console.log(`AppDataContext: Detected data change from "${source}", refreshing data...`);
      if (user) {
        refreshDoctors();
        refreshMeetings();
      }
    };

    const handleActivityChanged = () => {
      console.log('AppDataContext: Detected activity change, notifying subscribers...');
      notifyActivityChange();
    };

    appEvents.on(DATA_CHANGED_EVENT, handleDataChanged);
    appEvents.on('activity-changed', handleActivityChanged);

    return () => {
      appEvents.off(DATA_CHANGED_EVENT, handleDataChanged);
      appEvents.off('activity-changed', handleActivityChanged);
    };
  }, [user, refreshDoctors, refreshMeetings, notifyActivityChange]);


  const value: AppDataContextType = {
    user,
    isDataInitialized,
    doctors,
    meetings,
    isLoading,
    refreshDoctors,
    refreshMeetings,
    refreshAll,
    onDoctorChange,
    onMeetingChange,
    onBrochureChange,
    onActivityChange,
    notifyDoctorChange,
    notifyMeetingChange,
    notifyBrochureChange,
    notifyActivityChange,
    loginUser,
    logoutUser,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
};

/**
 * Hook to use app data context
 */
export const useAppData = (): AppDataContextType => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return context;
};

/**
 * Hook for screens that need to stay updated with doctor changes
 */
export const useDoctorSync = (onUpdate?: () => void) => {
  const { doctors, refreshDoctors, onDoctorChange } = useAppData();

  useEffect(() => {
    if (!onUpdate) return;
    
    const unsubscribe = onDoctorChange(() => {
      onUpdate();
    });

    return unsubscribe;
  }, [onDoctorChange]); // Remove onUpdate from dependencies to prevent infinite loop

  return { doctors, refreshDoctors };
};

/**
 * Hook for screens that need to stay updated with meeting changes
 */
export const useMeetingSync = (onUpdate?: () => void) => {
  const { meetings, refreshMeetings, onMeetingChange } = useAppData();

  useEffect(() => {
    if (!onUpdate) return;
    
    const unsubscribe = onMeetingChange(() => {
      onUpdate();
    });

    return unsubscribe;
  }, [onMeetingChange]); // Remove onUpdate from dependencies to prevent infinite loop

  return { meetings, refreshMeetings };
};

