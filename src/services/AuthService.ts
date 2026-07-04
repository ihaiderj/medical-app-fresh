import { apiClient, ApiError } from './apiClient'
import { TokenStorage } from './tokenStorage'
import { PersistentAuthService } from './persistentAuthService'
import { SessionManagementService } from './sessionManagementService'
import { NetworkService } from './networkService'
import { LocalDatabaseService } from './localDatabaseService'
import bcrypt from 'bcryptjs'

export interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'mr'
  first_name: string
  last_name: string
  phone?: string
  profile_image_url?: string
  address?: string
  can_upload_brochures?: boolean
  can_manage_doctors?: boolean
  can_schedule_meetings?: boolean
  is_active: boolean
}

export interface AuthResult {
  success: boolean
  user?: UserProfile
  error?: string
  isOfflineAuthenticated?: boolean
}

interface LoginResponse {
  access_token: string
  refresh_token: string
  user: UserProfile & { created_at?: string; updated_at?: string }
}

export class AuthService {
  private static currentUser: UserProfile | null = null

  static setCurrentUser(user: UserProfile): void {
    this.currentUser = user
  }

  static getCurrentUserFromMemory(): UserProfile | null {
    return this.currentUser
  }

  static clearCurrentUser(): void {
    this.currentUser = null
  }

  static async login(
    email: string,
    password: string,
    rememberMe: boolean = true,
  ): Promise<AuthResult & { hasSessionConflict?: boolean; conflictDevice?: string }> {
    return this.signIn(email, password, rememberMe)
  }

  static async signIn(
    email: string,
    password: string,
    rememberMe: boolean = true,
  ): Promise<AuthResult & { hasSessionConflict?: boolean; conflictDevice?: string }> {
    try {
      const isOnline = await NetworkService.isOnline()

      if (!isOnline) {
        return this.handleOfflineLogin(email, password, rememberMe)
      }

      const onlineResult = await this.tryApiLogin(email, password, rememberMe)
      if (onlineResult.success) {
        return onlineResult
      }

      return this.handleOfflineLogin(email, password, rememberMe)
    } catch (error) {
      console.log('AuthService error:', error)
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  static async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      if (await TokenStorage.hasTokens()) {
        try {
          await apiClient.post('/api/auth/logout/')
        } catch {
          // Clear local session even if server logout fails
        }
      }
      await TokenStorage.clearTokens()
      this.clearCurrentUser()
      return { success: true }
    } catch {
      return { success: false, error: 'An unexpected error occurred' }
    }
  }

  static async getCurrentUser(): Promise<AuthResult> {
    try {
      const memoryUser = this.getCurrentUserFromMemory()
      if (memoryUser) {
        return { success: true, user: memoryUser }
      }

      if (!(await TokenStorage.hasTokens())) {
        return { success: false, error: 'No active session' }
      }

      const profile = await apiClient.get<UserProfile>('/api/auth/me/')
      const userProfile = this.mapUserProfile(profile)
      this.setCurrentUser(userProfile)
      return { success: true, user: userProfile }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await TokenStorage.clearTokens()
      }
      return { success: false, error: 'No active session' }
    }
  }

  static async isAuthenticated(): Promise<boolean> {
    if (this.currentUser) return true
    return TokenStorage.hasTokens()
  }

  static onAuthStateChange(callback: (user: UserProfile | null) => void) {
    callback(this.currentUser)
    return { data: { subscription: { unsubscribe: () => {} } } }
  }

  private static mapUserProfile(profile: UserProfile & Record<string, unknown>): UserProfile {
    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone,
      profile_image_url: profile.profile_image_url,
      address: profile.address,
      can_upload_brochures: profile.can_upload_brochures,
      can_manage_doctors: profile.can_manage_doctors,
      can_schedule_meetings: profile.can_schedule_meetings,
      is_active: profile.is_active,
    }
  }

  private static async tryApiLogin(email: string, password: string, rememberMe: boolean) {
    try {
      const data = await apiClient.post<LoginResponse>(
        '/api/auth/login/',
        { email, password },
        { auth: false },
      )

      await TokenStorage.saveTokens(data.access_token, data.refresh_token)
      return this.finalizeOnlineLogin(data.user, email, password, rememberMe)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Invalid email or password'
      return { success: false, error: message } as AuthResult
    }
  }

  private static async handleOfflineLogin(email: string, password: string, rememberMe: boolean) {
    const localCreds = await LocalDatabaseService.getUserCredentialsByEmail(email)
    if (!localCreds) {
      return { success: false, error: 'No saved credentials for offline login' } as AuthResult
    }

    const passwordMatches = await bcrypt.compare(password, localCreds.password_hash)
    if (!passwordMatches) {
      return { success: false, error: 'Invalid email or password' } as AuthResult
    }

    const localUser = await LocalDatabaseService.getUserById(localCreds.user_id)
    if (!localUser) {
      return { success: false, error: 'Offline profile not found' } as AuthResult
    }

    const userProfile: UserProfile = {
      id: localUser.id,
      email: localUser.email,
      role: localUser.role,
      first_name: localUser.first_name || '',
      last_name: localUser.last_name || '',
      phone: localUser.phone || undefined,
      profile_image_url: localUser.profile_image_url || undefined,
      is_active: localUser.is_active,
    }

    this.setCurrentUser(userProfile)
    await SessionManagementService.recordLocalSession(userProfile.id)

    if (rememberMe) {
      await PersistentAuthService.saveSession(
        userProfile.id,
        userProfile.email,
        userProfile.role,
        localCreds.password_hash,
        rememberMe,
        true,
      )
    }

    return { success: true, user: userProfile, isOfflineAuthenticated: true } as AuthResult
  }

  private static async finalizeOnlineLogin(
    profile: UserProfile & { created_at?: string; updated_at?: string },
    email: string,
    password: string,
    rememberMe: boolean,
  ) {
    const userProfile = this.mapUserProfile(profile)
    this.setCurrentUser(userProfile)

    const now = new Date().toISOString()
    await LocalDatabaseService.upsertUser({
      ...userProfile,
      created_at: profile.created_at || now,
      updated_at: profile.updated_at || now,
      sync_status: 'synced',
    })

    const salt = bcrypt.genSaltSync(10)
    const hashedPassword = bcrypt.hashSync(password, salt)
    await LocalDatabaseService.saveUserCredentials(userProfile.id, email, hashedPassword)

    await this.syncPermissionsFromProfile(userProfile)

    const sessionResult = await SessionManagementService.registerSessionWithConflictCheck(userProfile.id)

    await PersistentAuthService.saveSession(
      userProfile.id,
      userProfile.email,
      userProfile.role,
      hashedPassword,
      rememberMe,
      true,
    )

    if (sessionResult.success) {
      return {
        success: true,
        user: userProfile,
        hasSessionConflict: sessionResult.hasConflict,
        conflictDevice: sessionResult.conflictDevice,
      } as AuthResult & { hasSessionConflict?: boolean; conflictDevice?: string }
    }

    return { success: true, user: userProfile } as AuthResult
  }

  private static async syncPermissionsFromProfile(user: UserProfile) {
    const permissionEntries: Array<{ key: string; value: boolean }> = [
      { key: 'can_upload_brochures', value: !!user.can_upload_brochures },
      { key: 'can_manage_doctors', value: !!user.can_manage_doctors },
      { key: 'can_schedule_meetings', value: user.can_schedule_meetings !== false },
    ]

    const now = new Date().toISOString()
    for (const perm of permissionEntries) {
      await LocalDatabaseService.upsertPermission({
        id: `${user.id}_${perm.key}`,
        user_id: user.id,
        permission_key: perm.key,
        value: perm.value,
        created_at: now,
        updated_at: now,
        sync_status: 'synced',
      })
    }
  }

  static async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      await PersistentAuthService.clearSession()
      await this.signOut()
      return { success: true }
    } catch (error) {
      console.error('Error during logout:', error)
      return { success: false, error: 'Failed to logout completely' }
    }
  }

  static async attemptAutoLogin(): Promise<AuthResult> {
    try {
      const autoLoginResult = await PersistentAuthService.attemptAutoLogin()

      if (autoLoginResult.success && autoLoginResult.user) {
        this.setCurrentUser(autoLoginResult.user)
        return { success: true, user: autoLoginResult.user }
      }

      return { success: false, error: autoLoginResult.error || 'No persistent session' }
    } catch (error) {
      console.error('Error in auto-login attempt:', error)
      return { success: false, error: 'Auto-login failed' }
    }
  }
}
