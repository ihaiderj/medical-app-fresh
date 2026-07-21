import { apiClient, ApiError } from './apiClient'
import { API_BASE_URL } from '../config/apiConfig'
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

      return this.tryApiLogin(email, password, rememberMe)
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
        const withPerms = await this.attachLocalPermissions(memoryUser)
        this.setCurrentUser(withPerms)
        return { success: true, user: withPerms }
      }

      if (!(await TokenStorage.hasTokens())) {
        return { success: false, error: 'No active session' }
      }

      const profile = await apiClient.get<UserProfile>('/api/auth/me/')
      const userProfile = this.mapUserProfile(profile)
      await this.syncPermissionsFromProfile(userProfile)
      const withPerms = await this.attachLocalPermissions(userProfile)
      this.setCurrentUser(withPerms)
      return { success: true, user: withPerms }
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
    const flag = (value: unknown, fallback = false) => {
      if (value === undefined || value === null) return fallback
      return LocalDatabaseService.coercePermissionFlag(value)
    }
    const raw = profile as Record<string, unknown>
    // Backend may send can_upload_brochures or legacy upload_brochures
    const uploadRaw =
      raw.can_upload_brochures ??
      raw.upload_brochures ??
      raw.canUploadBrochures
    const manageRaw =
      raw.can_manage_doctors ?? raw.manage_doctors ?? raw.canManageDoctors
    const scheduleRaw =
      raw.can_schedule_meetings ?? raw.schedule_meetings ?? raw.canScheduleMeetings

    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone,
      profile_image_url: profile.profile_image_url,
      address: profile.address,
      can_upload_brochures: flag(uploadRaw),
      can_manage_doctors: flag(manageRaw),
      can_schedule_meetings: flag(
        scheduleRaw,
        scheduleRaw === undefined ? true : false,
      ),
      is_active: profile.is_active !== false,
    }
  }

  /** Merge permission flags from local mr_permissions (survives auto-login). */
  static async attachLocalPermissions(user: UserProfile): Promise<UserProfile> {
    try {
      const upload = await LocalDatabaseService.getPermissionValue(user.id, 'can_upload_brochures')
      const manageDoctors = await LocalDatabaseService.getPermissionValue(user.id, 'can_manage_doctors')
      const schedule = await LocalDatabaseService.getPermissionValue(user.id, 'can_schedule_meetings')

      // Prefer true from either profile or local store (admin may have enabled after last login)
      const canUpload =
        upload === null ? !!user.can_upload_brochures : upload || !!user.can_upload_brochures

      return {
        ...user,
        can_upload_brochures: canUpload,
        can_manage_doctors:
          manageDoctors === null ? !!user.can_manage_doctors : manageDoctors,
        can_schedule_meetings:
          schedule === null ? user.can_schedule_meetings !== false : schedule,
      }
    } catch {
      return user
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
      if (message.includes('fetch') || message.includes('Network') || message.includes('Failed')) {
        return {
          success: false,
          error: `Cannot reach server at ${API_BASE_URL}. Check that Django is running and your phone is on the same WiFi.`,
        } as AuthResult
      }
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

    const withPerms = await this.attachLocalPermissions(userProfile)
    this.setCurrentUser(withPerms)
    await SessionManagementService.recordLocalSession(withPerms.id)

    if (rememberMe) {
      await PersistentAuthService.saveSession(
        withPerms.id,
        withPerms.email,
        withPerms.role,
        localCreds.password_hash,
        rememberMe,
        true,
      )
    }

    return { success: true, user: withPerms, isOfflineAuthenticated: true } as AuthResult
  }

  private static async finalizeOnlineLogin(
    profile: UserProfile & { created_at?: string; updated_at?: string },
    email: string,
    password: string,
    rememberMe: boolean,
  ) {
    const userProfile = this.mapUserProfile(profile)
    await this.syncPermissionsFromProfile(userProfile)
    const withPerms = await this.attachLocalPermissions(userProfile)
    this.setCurrentUser(withPerms)

    const now = new Date().toISOString()
    await LocalDatabaseService.upsertUser({
      ...withPerms,
      created_at: profile.created_at || now,
      updated_at: profile.updated_at || now,
      sync_status: 'synced',
    })

    const salt = bcrypt.genSaltSync(10)
    const hashedPassword = bcrypt.hashSync(password, salt)
    await LocalDatabaseService.saveUserCredentials(withPerms.id, email, hashedPassword)

    const sessionResult = await SessionManagementService.registerSessionWithConflictCheck(withPerms.id)

    await PersistentAuthService.saveSession(
      withPerms.id,
      withPerms.email,
      withPerms.role,
      hashedPassword,
      rememberMe,
      true,
    )

    if (sessionResult.success) {
      return {
        success: true,
        user: withPerms,
        hasSessionConflict: sessionResult.hasConflict,
        conflictDevice: sessionResult.conflictDevice,
      } as AuthResult & { hasSessionConflict?: boolean; conflictDevice?: string }
    }

    return { success: true, user: withPerms } as AuthResult
  }

  /** Refresh permissions from /api/auth/me/ when online, else local mr_permissions. */
  static async refreshPermissions(): Promise<UserProfile | null> {
    const memory = this.getCurrentUserFromMemory()
    if (!memory) return null

    try {
      if (await NetworkService.isOnline() && (await TokenStorage.hasTokens())) {
        const profile = await apiClient.get<UserProfile & Record<string, unknown>>('/api/auth/me/')
        console.log('🔐 AUTH: /api/auth/me/ permissions raw', {
          can_upload_brochures: (profile as any).can_upload_brochures,
          upload_brochures: (profile as any).upload_brochures,
        })
        const mapped = this.mapUserProfile(profile)
        const raw = profile as Record<string, unknown>
        const uploadFieldPresent =
          'can_upload_brochures' in raw ||
          'upload_brochures' in raw ||
          'canUploadBrochures' in raw

        // Never overwrite a stored true with false just because /me omitted the field
        if (uploadFieldPresent) {
          await this.syncPermissionsFromProfile(mapped)
        } else {
          console.warn(
            '🔐 AUTH: /me omitted upload permission fields — keeping local mr_permissions',
          )
        }

        const withPerms = await this.attachLocalPermissions({
          ...mapped,
          // If API omitted the field, keep whatever memory/local already had
          can_upload_brochures: uploadFieldPresent
            ? mapped.can_upload_brochures
            : memory.can_upload_brochures,
        })
        this.setCurrentUser(withPerms)
        return withPerms
      }
    } catch (error) {
      console.warn('AuthService: refreshPermissions online failed, using local:', error)
    }

    const withPerms = await this.attachLocalPermissions(memory)
    this.setCurrentUser(withPerms)
    return withPerms
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
