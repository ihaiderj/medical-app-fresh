import { supabase } from './supabase'
import { PersistentAuthService } from './persistentAuthService'
import { SessionManagementService } from './sessionManagementService'
import { NetworkService } from './networkService'
import { LocalDatabaseService, LocalUser } from './localDatabaseService'
import bcrypt from 'bcryptjs'

export interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'mr'
  first_name: string
  last_name: string
  phone?: string
  profile_image_url?: string
  is_active: boolean
}

export interface AuthResult {
  success: boolean
  user?: UserProfile
  error?: string
  isOfflineAuthenticated?: boolean
}

export class AuthService {
  // Simple in-memory storage for current user (in production, use secure storage)
  private static currentUser: UserProfile | null = null

  /**
   * Set current user (called after successful login)
   */
  static setCurrentUser(user: UserProfile): void {
    this.currentUser = user
  }

  /**
   * Get current user from memory
   */
  static getCurrentUserFromMemory(): UserProfile | null {
    return this.currentUser
  }

  /**
   * Clear current user (called on logout)
   */
  static clearCurrentUser(): void {
    this.currentUser = null
  }

  /**
   * Login with persistent authentication support
   */
  static async login(email: string, password: string, rememberMe: boolean = true): Promise<AuthResult & {
    hasSessionConflict?: boolean
    conflictDevice?: string
  }> {
    const result = await this.signIn(email, password, rememberMe)
    return result
  }

  /**
   * Sign in with email and password (original method)
   */
  static async signIn(email: string, password: string, rememberMe: boolean = true): Promise<AuthResult & {
    hasSessionConflict?: boolean;
    conflictDevice?: string;
  }> {
    try {
      const isOnline = await NetworkService.isOnline();

      if (!isOnline) {
        return this.handleOfflineLogin(email, password, rememberMe);
      }

    const onlineResult = await this.trySupabaseLogin(email, password, rememberMe);
    if (onlineResult.success) {
      return onlineResult;
    }

    return this.handleOfflineLogin(email, password, rememberMe);
    } catch (error) {
      console.log('AuthService error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  /**
   * Sign out the current user
   */
  static async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  /**
   * Get current user session
   */
  static async getCurrentUser(): Promise<AuthResult> {
    try {
      // First try to get user from memory (works for both admin and MR)
      const memoryUser = this.getCurrentUserFromMemory()
      if (memoryUser) {
        return {
          success: true,
          user: memoryUser,
        }
      }

      // Fallback: try Supabase Auth (for admin users only)
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        return { success: false, error: 'No active session' }
      }

      // Get user profile from our users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        return { success: false, error: 'Failed to fetch user profile' }
      }

      const userProfile = {
        id: profile.id,
        email: profile.email,
        role: profile.role,
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        profile_image_url: profile.profile_image_url,
        is_active: profile.is_active,
      }
      
      // Store in memory for future use
      this.setCurrentUser(userProfile)
      
      return {
        success: true,
        user: userProfile,
      }
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  /**
   * Check if user is authenticated
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return !!session
    } catch (error) {
      return false
    }
  }

  /**
   * Listen to auth state changes
   */
  static onAuthStateChange(callback: (user: UserProfile | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profile) {
          callback({
            id: profile.id,
            email: profile.email,
            role: profile.role,
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone: profile.phone,
            profile_image_url: profile.profile_image_url,
            is_active: profile.is_active,
          })
        } else {
          callback(null)
        }
      } else {
        callback(null)
      }
    })
  }

  private static async trySupabaseLogin(email: string, password: string, rememberMe: boolean) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data && data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError) {
        return { success: false, error: 'Failed to fetch user profile' };
      }

      return this.finalizeOnlineLogin(profile, email, password, rememberMe);
    }

    const customResult = await this.tryCustomUserLogin(email, password, rememberMe);
    if (customResult.success) {
      return customResult;
    }

    return { success: false, error: customResult.error || 'Invalid email or password' } as AuthResult;
  }

  private static async tryCustomUserLogin(email: string, password: string, rememberMe: boolean) {
    const { data: customUsers, error: customError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true);

    if (customError || !customUsers || customUsers.length === 0) {
      return { success: false, error: 'Invalid email or password' } as AuthResult;
    }

    return this.finalizeOnlineLogin(customUsers[0], email, password, rememberMe);
  }

  private static async handleOfflineLogin(email: string, password: string, rememberMe: boolean) {
    const localCreds = await LocalDatabaseService.getUserCredentialsByEmail(email);
    if (!localCreds) {
      return { success: false, error: 'No saved credentials for offline login' } as AuthResult;
    }

    const passwordMatches = await bcrypt.compare(password, localCreds.password_hash);
    if (!passwordMatches) {
      return { success: false, error: 'Invalid email or password' } as AuthResult;
    }

    const localUser = await LocalDatabaseService.getUserById(localCreds.user_id);
    if (!localUser) {
      return { success: false, error: 'Offline profile not found' } as AuthResult;
    }

    console.log('🔍 AUTH DEBUG: Local user data for offline login:', localUser);
    
    const userProfile: UserProfile = {
      id: localUser.id,
      email: localUser.email,
      role: localUser.role,
      first_name: localUser.first_name || '',
      last_name: localUser.last_name || '',
      phone: localUser.phone || undefined,
      profile_image_url: localUser.profile_image_url || undefined,
      is_active: localUser.is_active,
    };
    
    console.log('🔍 AUTH DEBUG: Mapped offline user profile:', userProfile);

    this.setCurrentUser(userProfile);

    await SessionManagementService.recordLocalSession(userProfile.id);

    if (rememberMe) {
      await PersistentAuthService.saveSession(
        userProfile.id,
        userProfile.email,
        userProfile.role,
        localCreds.password_hash,
        rememberMe,
        true,
      );
    }

    return { success: true, user: userProfile, isOfflineAuthenticated: true } as AuthResult;
  }

  private static async finalizeOnlineLogin(profile: any, email: string, password: string, rememberMe: boolean) {
    console.log('🔍 AUTH DEBUG: Server profile data received:', profile);
    console.log('🔍 AUTH DEBUG: Profile first_name:', profile.first_name);
    console.log('🔍 AUTH DEBUG: Profile last_name:', profile.last_name);
    
    const userProfile: UserProfile = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone,
      profile_image_url: profile.profile_image_url,
      is_active: profile.is_active,
    };
    
    console.log('🔍 AUTH DEBUG: Mapped user profile:', userProfile);

    this.setCurrentUser(userProfile);

    const now = new Date().toISOString();
    await LocalDatabaseService.upsertUser({
      ...userProfile,
      created_at: profile.created_at || now,
      updated_at: profile.updated_at || now,
      sync_status: 'synced',
    });

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    await LocalDatabaseService.saveUserCredentials(userProfile.id, email, hashedPassword);

    const permissionsRes = await supabase
      .from('mr_permissions')
      .select('*')
      .eq('user_id', userProfile.id);

    if (!permissionsRes.error && permissionsRes.data) {
      for (const perm of permissionsRes.data) {
        await LocalDatabaseService.upsertPermission({
          id: perm.id,
          user_id: perm.user_id,
          permission_key: perm.permission_key,
          value: perm.value,
          created_at: perm.created_at,
          updated_at: perm.updated_at,
          sync_status: 'synced',
        });
      }
    }

    const sessionResult = await SessionManagementService.registerSessionWithConflictCheck(userProfile.id);

    if (sessionResult.success) {
      await PersistentAuthService.saveSession(
        userProfile.id,
        userProfile.email,
        userProfile.role,
        hashedPassword,
        rememberMe,
        true,
      );

      return {
        success: true,
        user: userProfile,
        hasSessionConflict: sessionResult.hasConflict,
        conflictDevice: sessionResult.conflictDevice,
      } as AuthResult & { hasSessionConflict?: boolean; conflictDevice?: string };
    }

    console.warn('SessionManager: Failed to register session:', sessionResult.error);
    await PersistentAuthService.saveSession(
      userProfile.id,
      userProfile.email,
      userProfile.role,
      hashedPassword,
      rememberMe,
      true,
    );

    return { success: true, user: userProfile } as AuthResult;
  }

  /**
   * Logout with persistent data clearing
   */
  static async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('Logging out and clearing persistent data...')
      
      // Clear persistent session data
      await PersistentAuthService.clearSession()
      
      // Sign out from Supabase
      await supabase.auth.signOut()
      
      // Clear current user
      this.clearCurrentUser()
      
      console.log('Logout completed successfully')
      return { success: true }
    } catch (error) {
      console.error('Error during logout:', error)
      return { success: false, error: 'Failed to logout completely' }
    }
  }

  /**
   * Attempt automatic login using persistent session
   */
  static async attemptAutoLogin(): Promise<AuthResult> {
    try {
      console.log('Checking for persistent session...')
      
      // Check if there's a valid persistent session
      const autoLoginResult = await PersistentAuthService.attemptAutoLogin()
      
      if (autoLoginResult.success && autoLoginResult.user) {
        console.log('Auto-login successful for user:', autoLoginResult.user.email)
        this.setCurrentUser(autoLoginResult.user)
        return { success: true, user: autoLoginResult.user }
      } else {
        console.log('No valid persistent session found')
        return { success: false, error: autoLoginResult.error || 'No persistent session' }
      }
    } catch (error) {
      console.error('Error in auto-login attempt:', error)
      return { success: false, error: 'Auto-login failed' }
    }
  }
}





