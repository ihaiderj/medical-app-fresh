import { LocalDatabaseService } from './localDatabaseService'
import { MRService } from './MRService'
import { AuthService } from './AuthService'
import { NetworkService } from './networkService'
import { FileStorageService } from './fileStorageService'
import { BrochureManagementService } from './brochureManagementService'
import { apiClient } from './apiClient'
import { TokenStorage } from './tokenStorage'
import { resolveServerBrochureId } from '../utils/brochureTypeUtils'
import { resolveMediaUrl } from '../config/apiConfig'
import { SyncReconciliationService } from './syncReconciliationService'
import { FirstTimeLoginService } from './firstTimeLoginService'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system'

export interface SyncResult {
  success: boolean
  synced: number
  failed: number
  message: string
  errors?: string[]
  /** Records queued during reconciliation before upload */
  reconciled?: number
  /** Local rows still missing server backup after sync */
  backupGapsRemaining?: number
}

export interface SyncProgress {
  step: string
  message: string
  progress: number
  current?: number
  total?: number
}

export class SyncService {
  private static progressCallback: ((progress: SyncProgress) => void) | null = null
  private static readonly LAST_SYNC_KEY = 'fervid_last_sync_timestamp'
  /** Prevents parallel syncNow runs (manual + login + OfflineStatusBar). */
  private static activeSyncPromise: Promise<SyncResult> | null = null

  /**
   * Set progress callback for sync operations
   */
  static onProgress(callback: (progress: SyncProgress) => void): () => void {
    this.progressCallback = callback
    return () => {
      this.progressCallback = null
    }
  }

  private static reportProgress(step: string, message: string, progress: number, current?: number, total?: number) {
    if (this.progressCallback) {
      this.progressCallback({ step, message, progress, current, total })
    }
  }

  private static runExclusiveSync(kind: 'syncNow' | 'up' | 'full', runner: () => Promise<SyncResult>): Promise<SyncResult> {
    if (this.activeSyncPromise) {
      console.log(`🔄 SYNC: ${kind} requested while sync already in progress — joining existing run`)
      return this.activeSyncPromise
    }
    this.activeSyncPromise = runner().finally(() => {
      this.activeSyncPromise = null
    })
    return this.activeSyncPromise
  }

  /**
   * Sole public sync entry point for the app.
   * Reconciles local gaps, then pushes the sync queue (doctors, meetings, notes,
   * brochure customizations, activity logs, etc.) under one exclusive lock.
   *
   * Call this from: dashboard Sync, OfflineStatusBar, login, slide-management cloud button.
   * Do NOT call this on every navigation exit — local writes should only queue.
   */
  static async syncNow(userIdOverride?: string): Promise<SyncResult> {
    return this.runExclusiveSync('syncNow', () => this.syncUpFullInternal(userIdOverride))
  }

  /**
   * @deprecated Use syncNow() — kept as an alias so older call sites keep working.
   */
  static async syncUpFull(userIdOverride?: string): Promise<SyncResult> {
    return this.syncNow(userIdOverride)
  }

  private static async syncUpFullInternal(userIdOverride?: string): Promise<SyncResult> {
    console.log('🔄 SYNC NOW: Starting unified backup sync...')

    let userId = userIdOverride
    if (!userId) {
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        return {
          success: false,
          synced: 0,
          failed: 0,
          message: 'User not authenticated',
          errors: ['User not authenticated — please sign in again'],
        }
      }
      userId = userResult.user.id
    }

    if (!(await TokenStorage.hasTokens())) {
      return {
        success: false,
        synced: 0,
        failed: 0,
        message: 'API session expired — please sign in again',
        errors: ['No API tokens — please sign in again'],
      }
    }

    if (!(await NetworkService.isOnline())) {
      return {
        success: false,
        synced: 0,
        failed: 0,
        message: 'Device is offline. Please connect to the internet and try again.',
      }
    }

    this.reportProgress('Reconciling', 'Checking local data against server...', 15)

    const reconcileResult = await SyncReconciliationService.reconcileLocalToServer(userId)
    console.log('🔄 SYNC NOW: Reconciliation:', reconcileResult.message)

    if (reconcileResult.errors.length > 0) {
      console.warn('⚠️ SYNC NOW: Reconciliation warnings:', reconcileResult.errors)
    }

    this.reportProgress('Uploading', 'Uploading changes to server...', 45)

    // Already inside exclusive lock — call internal upload (do not re-enter mutex)
    const uploadResult = await this.syncUpInternal()

    const gapStats = await SyncReconciliationService.getBackupGapStats(userId)

    const combinedMessage = [
      reconcileResult.message,
      uploadResult.message,
      gapStats.total > 0
        ? `${gapStats.total} item(s) still need backup`
        : 'All metadata backed up to server',
    ].join('. ')

    const reconcileWarnings = reconcileResult.errors.filter(Boolean)
    const uploadErrors = (uploadResult.errors || []).filter(Boolean)

    return {
      success: uploadResult.success,
      synced: uploadResult.synced,
      failed: uploadResult.failed,
      message: combinedMessage,
      errors: [
        ...uploadErrors,
        ...reconcileWarnings.map((warning) => `Warning: ${warning}`),
      ],
      reconciled: reconcileResult.queued,
      backupGapsRemaining: gapStats.total,
    }
  }

  /**
   * Sync down for new/empty device only. Skips if local DB already has MR data.
   */
  static async syncDownInitial(userId: string): Promise<SyncResult> {
    const firstTimeInfo = await FirstTimeLoginService.isFirstTimeLogin(userId)
    if (!firstTimeInfo.isFirstTime) {
      console.log('⬇️ SYNC DOWN INITIAL: Skipped — local database is not empty')
      return {
        success: true,
        synced: 0,
        failed: 0,
        message: 'Skipped initial sync down — local data already exists',
      }
    }
    console.log('⬇️ SYNC DOWN INITIAL: Empty local DB — pulling server data')
    return this.syncDown(userId)
  }

  /**
   * Incremental sync down (explicit pull). Uses last sync timestamp when available.
   */
  static async syncDownIncremental(userId: string): Promise<SyncResult> {
    console.log('⬇️ SYNC DOWN INCREMENTAL: Pulling server changes')
    return this.syncDown(userId)
  }

  /**
   * @deprecated Use syncNow(). Previously queue-only upload; now aliases to syncNow
   * so accidental callers cannot bypass reconciliation or run a second sync path.
   */
  static async syncUp(): Promise<SyncResult> {
    console.warn('🔄 SYNC: syncUp() is deprecated — use syncNow(). Redirecting.')
    return this.syncNow()
  }

  /**
   * Internal queue upload only. Must only be called from syncNow while the exclusive lock is held.
   */
  private static async syncUpInternal(): Promise<SyncResult> {
    console.log('🔄 SYNC UP: Starting sync up process...')
    
    try {
      // Check network connectivity
      const isOnline = await NetworkService.isOnline()
      if (!isOnline) {
        console.log('❌ SYNC UP: Device is offline, cannot sync')
        return {
          success: false,
          synced: 0,
          failed: 0,
          message: 'Device is offline. Please connect to the internet and try again.'
        }
      }

      // Verify authentication via JWT
      const hasToken = await TokenStorage.hasTokens()
      if (!hasToken) {
        const userResult = await AuthService.getCurrentUser()
        if (!userResult.success || !userResult.user) {
          console.log('❌ SYNC UP: User not authenticated')
          return {
            success: false,
            synced: 0,
            failed: 0,
            message: 'User not authenticated. Please login again.',
          }
        }
      }

      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        return {
          success: false,
          synced: 0,
          failed: 0,
          message: 'User not authenticated'
        }
      }
      const userId = userResult.user.id

      // Get pending operations
      await LocalDatabaseService.ensureReady()
      await LocalDatabaseService.repairDoctorSyncQueueState(userId)
      const requeuedDoctorDeletes = await LocalDatabaseService.reconcileDeletedDoctorSync(userId)
      if (requeuedDoctorDeletes > 0) {
        console.log(`🔄 SYNC UP: Re-queued ${requeuedDoctorDeletes} doctor delete(s)`)
      }
      await LocalDatabaseService.cleanupStaleSyncOperations()
      await LocalDatabaseService.sanitizePendingDoctorSyncOperations()
      const requeuedDeletes = await LocalDatabaseService.reconcileSavedBrochureDeleteSync(userId)
      if (requeuedDeletes > 0) {
        console.log(`🔄 SYNC UP: Re-queued ${requeuedDeletes} saved brochure delete(s)`)
      }
      const pendingOps = await LocalDatabaseService.getPendingSyncOperations()
      const photoResult = await this.syncPendingDoctorPhotos(userId)

      if (pendingOps.length === 0) {
        if (photoResult.synced > 0 || photoResult.failed > 0) {
          console.log(
            `🔄 SYNC UP: Doctor photos synced=${photoResult.synced} failed=${photoResult.failed}`,
          )
          return {
            success: photoResult.failed === 0,
            synced: photoResult.synced,
            failed: photoResult.failed,
            message:
              photoResult.failed === 0
                ? `Synced ${photoResult.synced} doctor photo(s)`
                : `Synced ${photoResult.synced}, failed ${photoResult.failed} doctor photo(s)`,
            errors: photoResult.errors.length > 0 ? photoResult.errors : undefined,
          }
        }

        console.log('✅ SYNC UP: No pending operations to sync')
        return {
          success: true,
          synced: 0,
          failed: 0,
          message: 'No pending operations to sync',
        }
      }

      console.log(`🔄 SYNC UP: Found ${pendingOps.length} pending operations`)

      const sortedOps = this.sortOperationsByDependency(pendingOps)
      const bulkResult = await this.syncUpViaPush(sortedOps, userId)
      if (bulkResult) {
        await LocalDatabaseService.cleanupStaleSyncOperations()
        return this.mergePhotoSyncResult(bulkResult, photoResult)
      }

      // Fallback: process operations individually
      
      let synced = 0
      let failed = 0
      const errors: string[] = []

      this.reportProgress('Processing', `Processing ${sortedOps.length} operations...`, 0, 0, sortedOps.length)

      for (let i = 0; i < sortedOps.length; i++) {
        const op = sortedOps[i]
        const progress = Math.round(((i + 1) / sortedOps.length) * 100)
        
        this.reportProgress(
          'Processing',
          `Syncing ${op.table_name} (${op.operation_type})...`,
          progress,
          i + 1,
          sortedOps.length
        )

        try {
          console.log(`🔄 SYNC UP: Processing operation ${i + 1}/${sortedOps.length}:`, {
            id: op.id,
            type: op.operation_type,
            table: op.table_name,
            recordId: op.record_id
          })

          let success = false

          switch (op.table_name) {
            case 'doctors':
              success = await this.syncDoctor(op, userId)
              break
            case 'meetings':
              success = await this.syncMeeting(op, userId)
              break
            case 'meeting_notes':
            case 'meeting_slide_notes':
              success = await this.syncMeetingNote(op, userId)
              break
            case 'meeting_general_notes':
              success = await this.syncMeetingGeneralNote(op, userId)
              break
            case 'meeting_followups':
              success = await this.syncMeetingFollowUp(op, userId)
              break
            case 'saved_brochures':
              success = await this.syncSavedBrochure(op, userId)
              break
            case 'brochure_sync':
              success = await this.syncBrochureChanges(op, userId)
              break
            case 'activity_logs':
              success = await this.syncActivityLog(op, userId)
              break
            default:
              console.warn(`⚠️ SYNC UP: Unknown table name: ${op.table_name}`)
              success = false
          }

          if (success) {
            await LocalDatabaseService.markOperationCompleted(op.id)
            synced++
            console.log(`✅ SYNC UP: Successfully synced operation ${op.id}`)
          } else {
            const errorMsg = `Failed to sync ${op.table_name} ${op.operation_type}`
            await LocalDatabaseService.markOperationFailed(op.id, errorMsg)
            failed++
            errors.push(errorMsg)
            console.error(`❌ SYNC UP: Failed to sync operation ${op.id}`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          await LocalDatabaseService.markOperationFailed(op.id, errorMsg)
          failed++
          errors.push(`Operation ${op.id}: ${errorMsg}`)
          console.error(`❌ SYNC UP: Exception syncing operation ${op.id}:`, error)
        }
      }

      const message = `Synced: ${synced}, Failed: ${failed}`
      console.log(`🔄 SYNC UP: Completed - ${message}`)

      await LocalDatabaseService.cleanupStaleSyncOperations()

      this.reportProgress('Complete', message, 100, sortedOps.length, sortedOps.length)

      return this.mergePhotoSyncResult(
        {
          success: failed === 0,
          synced,
          failed,
          message,
          errors: errors.length > 0 ? errors : undefined,
        },
        photoResult,
      )
    } catch (error) {
      console.error('❌ SYNC UP: Fatal error:', error)
      return {
        success: false,
        synced: 0,
        failed: 0,
        message: error instanceof Error ? error.message : 'Sync failed',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }

  /**
   * Sort operations by dependency order
   */
  private static sortOperationsByDependency(ops: any[]): any[] {
    const tableOrder = ['doctors', 'meetings', 'meeting_notes', 'meeting_slide_notes', 'meeting_general_notes', 'meeting_followups', 'saved_brochures', 'brochure_sync', 'activity_logs']
    const actionOrder: Record<string, number> = { create: 0, update: 1, delete: 2 }
    return ops.sort((a, b) => {
      const aIndex = tableOrder.indexOf(a.table_name)
      const bIndex = tableOrder.indexOf(b.table_name)
      if (aIndex !== bIndex) {
        if (aIndex === -1 && bIndex === -1) return 0
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
      }

      const aAction = actionOrder[a.operation_type] ?? 1
      const bAction = actionOrder[b.operation_type] ?? 1
      if (aAction !== bAction) {
        return aAction - bAction
      }

      return String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
    })
  }

  private static mergePhotoSyncResult(
    result: SyncResult,
    photoResult: { synced: number; failed: number; errors: string[] },
  ): SyncResult {
    const synced = result.synced + photoResult.synced
    const failed = result.failed + photoResult.failed
    const errors = [...(result.errors || []), ...photoResult.errors]
    const photoMessage =
      photoResult.synced > 0 || photoResult.failed > 0
        ? `; photos: ${photoResult.synced} synced${photoResult.failed > 0 ? `, ${photoResult.failed} failed` : ''}`
        : ''

    return {
      ...result,
      success: failed === 0,
      synced,
      failed,
      message: `${result.message}${photoMessage}`,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  private static parseDoctorPhotoLinks(
    localChanges?: string | null,
  ): { doctorLocalId?: string; doctorServerId?: string } {
    if (!localChanges) {
      return {}
    }

    try {
      const parsed =
        typeof localChanges === 'string' ? JSON.parse(localChanges) : localChanges
      return {
        doctorLocalId: parsed?.doctor_local_id || undefined,
        doctorServerId: parsed?.doctor_server_id || undefined,
      }
    } catch {
      return {}
    }
  }

  private static async syncPendingDoctorPhotos(
    userId: string,
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0
    let failed = 0
    const errors: string[] = []

    try {
      const pendingPhotos = await LocalDatabaseService.getPendingDoctorPhotos(userId)
      if (pendingPhotos.length === 0) {
        return { synced, failed, errors }
      }

      console.log(`🔄 SYNC PHOTO: Uploading ${pendingPhotos.length} pending doctor photo(s)`)

      for (const photo of pendingPhotos) {
        if (!photo.file_path?.trim()) {
          failed++
          errors.push(`doctor_photo ${photo.id}: missing file path`)
          continue
        }

        const fileInfo = await FileSystem.getInfoAsync(photo.file_path)
        if (!fileInfo.exists) {
          failed++
          errors.push(`doctor_photo ${photo.id}: local file missing`)
          continue
        }

        const links = this.parseDoctorPhotoLinks(photo.local_changes)
        let doctor =
          links.doctorLocalId
            ? await LocalDatabaseService.getDoctorRecordById(links.doctorLocalId)
            : null

        if (!doctor && photo.file_path) {
          doctor = await LocalDatabaseService.findDoctorByProfileImagePath(
            userId,
            photo.file_path,
          )
        }

        const doctorServerId = doctor?.server_id?.trim() || links.doctorServerId?.trim()

        try {
          const uploadResult = await apiClient.uploadFile(
            '/api/files/doctor-photos/upload/',
            photo.file_path,
            photo.file_name || `doctor_${photo.id}.jpg`,
            doctorServerId ? { doctor_id: doctorServerId } : undefined,
          )

          const fileUrl = uploadResult.file_url
          if (!fileUrl) {
            failed++
            errors.push(`doctor_photo ${photo.id}: upload returned no file_url`)
            continue
          }

          if (doctor && !doctor.is_deleted) {
            await LocalDatabaseService.updateDoctor(doctor.id, {
              profile_image_url: fileUrl,
              sync_status: doctorServerId ? 'synced' : doctor.sync_status,
              skipSyncQueue: Boolean(doctorServerId),
            })
          } else if (doctorServerId) {
            const patchResult = await MRService.updateDoctor(doctorServerId, {
              profile_image_url: fileUrl,
            })
            if (!patchResult.success) {
              console.warn(
                `⚠️ SYNC PHOTO: PATCH profile_image_url failed for ${doctorServerId}:`,
                patchResult.error,
              )
            }
          }

          await LocalDatabaseService.markDoctorPhotoSynced(photo.id)
          synced++
          console.log(
            `✅ SYNC PHOTO: Uploaded ${photo.id}${doctorServerId ? ` for doctor ${doctorServerId}` : ''}`,
          )
        } catch (error) {
          failed++
          const message = error instanceof Error ? error.message : 'Unknown error'
          errors.push(`doctor_photo ${photo.id}: ${message}`)
          console.error(`❌ SYNC PHOTO: Failed to upload ${photo.id}:`, error)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`doctor_photos: ${message}`)
      console.error('❌ SYNC PHOTO: Failed to process pending doctor photos:', error)
    }

    return { synced, failed, errors }
  }

  private static normalizeDoctorProfileImageUrl(value: unknown): string {
    if (value === null || value === undefined) {
      return ''
    }
    return String(value)
  }

  private static isDoctorAlreadyGoneOnServer(error?: string): boolean {
    if (!error) {
      return false
    }
    const normalized = error.toLowerCase()
    return (
      normalized.includes('does not exist') ||
      normalized.includes('not found') ||
      normalized.includes('no doctor')
    )
  }

  /**
   * Soft-delete the Doctor row on the server (Django admin tombstone).
   * REST DELETE only removes the MR assignment; sync push sets is_deleted on Doctor.
   */
  private static async pushDoctorSoftDelete(
    serverId: string,
    localId: string,
    mrId: string,
  ): Promise<{ success: boolean; alreadyGone?: boolean; error?: string }> {
    try {
      const response = await apiClient.post<{
        results?: Array<{ success: boolean; error?: string }>
      }>('/api/sync/push/', {
        operations: [
          {
            local_id: `tombstone_${localId}`,
            entity: 'doctors',
            action: 'delete',
            data: {
              server_id: serverId,
              mr_id: mrId,
              is_deleted: true,
            },
          },
        ],
      })

      const result = response?.results?.[0]
      if (result?.success) {
        console.log(`✅ SYNC DOCTOR: Tombstone pushed for ${serverId}`)
        return { success: true }
      }

      const error = result?.error || 'unknown error'
      if (this.isDoctorAlreadyGoneOnServer(error)) {
        console.log(`✅ SYNC DOCTOR: Doctor already absent on server ${serverId}`)
        return { success: false, alreadyGone: true, error }
      }

      console.warn(`⚠️ SYNC DOCTOR: Sync push tombstone failed for ${serverId}:`, error)
      return { success: false, error }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (this.isDoctorAlreadyGoneOnServer(message)) {
        console.log(`✅ SYNC DOCTOR: Doctor already absent on server ${serverId}`)
        return { success: false, alreadyGone: true, error: message }
      }
      console.error(`❌ SYNC DOCTOR: Sync push tombstone error for ${serverId}:`, error)
      return { success: false, error: message }
    }
  }

  private static async markDoctorDeleteSynced(localId: string): Promise<void> {
    await LocalDatabaseService.updateDoctor(localId, {
      sync_status: 'synced',
      skipSyncQueue: true,
      local_changes: JSON.stringify({ delete_tombstone_pushed: true }),
    })
  }

  private static isMissingOnServerError(error?: string | null): boolean {
    const msg = String(error || '').toLowerCase()
    return (
      msg.includes('does not exist') ||
      msg.includes('not found') ||
      msg.includes('matching query') ||
      msg.includes('404')
    )
  }

  /**
   * Ensure a local doctor has a valid server_id (recreate if missing / stale).
   */
  private static async ensureDoctorHasServerId(
    doctorLocalId: string,
    userId: string,
  ): Promise<string | null> {
    const doctor = await LocalDatabaseService.getDoctorRecordById(doctorLocalId)
    if (!doctor || doctor.is_deleted) {
      return null
    }
    if (doctor.server_id) {
      return String(doctor.server_id)
    }

    console.log(`🔄 SYNC DOCTOR: Ensuring server_id for local doctor ${doctorLocalId}`)
    const ok = await this.syncDoctor(
      {
        record_id: doctorLocalId,
        operation_type: 'create',
        data: { ...doctor, server_id: null },
      },
      userId,
    )
    if (!ok) {
      return null
    }
    const refreshed = await LocalDatabaseService.getDoctorRecordById(doctorLocalId)
    return refreshed?.server_id ? String(refreshed.server_id) : null
  }

  /**
   * Ensure a local meeting has a valid server_id (create on server if needed).
   */
  private static async ensureMeetingHasServerId(
    meetingLocalId: string,
    userId: string,
  ): Promise<string | null> {
    const meeting = await LocalDatabaseService.getMeetingById(meetingLocalId)
    if (!meeting || meeting.is_deleted) {
      return null
    }
    if (meeting.server_id) {
      return String(meeting.server_id)
    }

    console.log(`🔄 SYNC MEETING: Ensuring server_id for local meeting ${meetingLocalId}`)
    const ok = await this.syncMeeting(
      {
        record_id: meetingLocalId,
        operation_type: 'create',
        data: { ...meeting, server_id: null },
      },
      userId,
    )
    if (!ok) {
      return null
    }
    const refreshed = await LocalDatabaseService.getMeetingById(meetingLocalId)
    return refreshed?.server_id ? String(refreshed.server_id) : null
  }

  /**
   * Sync doctor operation
   */
  private static async syncDoctor(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      const localDoctor = await LocalDatabaseService.getDoctorRecordById(op.record_id)
      console.log(`🔄 SYNC DOCTOR: ${op.operation_type}`, data)

      if (op.operation_type === 'create') {
        if (localDoctor?.is_deleted) {
          console.log('✅ SYNC DOCTOR: Skipping create — doctor was deleted locally')
          return true
        }

        if (localDoctor?.server_id) {
          console.log(
            `⏭️ SYNC DOCTOR: Skipping create — already has server_id ${localDoctor.server_id}`,
          )
          await LocalDatabaseService.updateDoctor(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }

        // Prefer relinking to an existing server doctor (name+hospital) over creating.
        const adoptedId = await SyncReconciliationService.tryAdoptMatchingDoctor(
          op.record_id,
          userId,
        )
        if (adoptedId) {
          return true
        }

        const localId = String(localDoctor?.id || op.record_id)
        const result = await MRService.addDoctor(userId, {
          id: localId,
          client_id: localId,
          first_name: data.first_name ?? localDoctor?.first_name,
          last_name: data.last_name ?? localDoctor?.last_name,
          specialty: data.specialty ?? localDoctor?.specialty,
          hospital: data.hospital ?? localDoctor?.hospital,
          phone: data.phone ?? localDoctor?.phone,
          email: data.email ?? localDoctor?.email,
          location: data.location ?? localDoctor?.location,
          notes: data.notes ?? localDoctor?.notes ?? '',
          profile_image_url: this.normalizeDoctorProfileImageUrl(
            data.profile_image_url ?? localDoctor?.profile_image_url,
          ),
        })

        if (result.success && result.data) {
          const created: any = result.data
          // Update local record with server_id
          await LocalDatabaseService.updateDoctor(op.record_id, {
            server_id: created.doctor_id || created.id,
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      } else if (op.operation_type === 'update') {
        // Prefer live local server_id — queue payload may still hold a stale id after reset.
        const serverId = localDoctor?.server_id || (!localDoctor ? data.server_id : null)
        if (!serverId) {
          return this.syncDoctor(
            { ...op, operation_type: 'create', data: { ...data, server_id: null } },
            userId,
          )
        }

        const result = await MRService.updateDoctor(serverId, {
          first_name: data.first_name ?? localDoctor?.first_name,
          last_name: data.last_name ?? localDoctor?.last_name,
          specialty: data.specialty ?? localDoctor?.specialty,
          hospital: data.hospital ?? localDoctor?.hospital,
          phone: data.phone ?? localDoctor?.phone,
          email: data.email ?? localDoctor?.email,
          location: data.location ?? localDoctor?.location,
          notes: data.notes ?? localDoctor?.notes ?? '',
          profile_image_url: this.normalizeDoctorProfileImageUrl(
            data.profile_image_url ?? localDoctor?.profile_image_url,
          ),
        })

        if (result.success) {
          await LocalDatabaseService.updateDoctor(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }

        // Stale server_id (duplicate cleanup / soft-delete on backend) → recreate
        if (this.isMissingOnServerError(result.error)) {
          console.warn(
            `⚠️ SYNC DOCTOR: Update failed for missing server_id ${serverId} — recreating`,
          )
          await LocalDatabaseService.resetDoctorServerSync(op.record_id)
          return this.syncDoctor(
            { ...op, operation_type: 'create', data: { ...data, server_id: null } },
            userId,
          )
        }
        return false
      } else if (op.operation_type === 'delete') {
        const serverId = localDoctor?.server_id || data.server_id
        if (!serverId) {
          console.log('✅ SYNC DOCTOR: Skipping server delete — doctor was never synced')
          await LocalDatabaseService.updateDoctor(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
          return true
        }

        const mrId = String(localDoctor?.mr_id || data.mr_id || userId)
        console.log(`🔄 SYNC DOCTOR: delete server_id=${serverId}`, data)

        const restResult = await MRService.deleteDoctor(serverId)
        if (!restResult.success) {
          console.error(`❌ SYNC DOCTOR: REST delete failed for ${serverId}:`, restResult.error)
          return false
        }

        const tombstone = await this.pushDoctorSoftDelete(serverId, op.record_id, mrId)
        const deleteConfirmed = tombstone.success || tombstone.alreadyGone

        if (!deleteConfirmed) {
          console.error(
            `❌ SYNC DOCTOR: Delete not confirmed for ${serverId}:`,
            tombstone.error || 'unknown error',
          )
          return false
        }

        await this.markDoctorDeleteSynced(op.record_id)
        console.log(`✅ SYNC DOCTOR: Delete complete for ${serverId}`)
        return true
      }

      return false
    } catch (error) {
      console.error('❌ SYNC DOCTOR: Error:', error)
      return false
    }
  }

  private static async retryBulkOpIndividually(op: any, userId: string): Promise<boolean> {
    switch (op.table_name) {
      case 'doctors':
        return this.syncDoctor(op, userId)
      case 'meetings':
        return this.syncMeeting(op, userId)
      case 'meeting_notes':
      case 'meeting_slide_notes':
        return this.syncMeetingNote(op, userId)
      case 'meeting_general_notes':
        return this.syncMeetingGeneralNote(op, userId)
      case 'meeting_followups':
        return this.syncMeetingFollowUp(op, userId)
      case 'activity_logs':
        return this.syncActivityLog(op, userId)
      default:
        return false
    }
  }

  /**
   * Sync meeting operation
   */
  private static async syncMeeting(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC MEETING: ${op.operation_type}`, data)

      if (op.operation_type === 'create') {
        const localMeeting = await LocalDatabaseService.getMeetingById(op.record_id)
        if (localMeeting?.server_id) {
          console.log(
            `⏭️ SYNC MEETING: Skipping create — already has server_id ${localMeeting.server_id}`,
          )
          await LocalDatabaseService.updateMeeting(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }

        const doctorLocalId = String(data.doctor_id || localMeeting?.doctor_id || '')
        const doctorServerId = await this.ensureDoctorHasServerId(doctorLocalId, userId)
        if (!doctorServerId) {
          console.error('❌ SYNC MEETING: Doctor not found or missing server_id')
          return false
        }

        const result = await MRService.createMeeting({
          mr_id: userId,
          doctor_id: doctorServerId,
          brochure_id: data.brochure_id || '',
          brochure_title: data.brochure_title || '',
          title: data.title,
          purpose: data.purpose || '',
          scheduled_date: data.scheduled_date,
          duration_minutes: data.duration_minutes || 30,
          location: data.location ?? null,
          notes: data.notes,
        })

        if (result.success && result.data) {
          await LocalDatabaseService.updateMeeting(op.record_id, {
            server_id: result.data.meeting_id,
            doctor_server_id: doctorServerId,
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      } else if (op.operation_type === 'update') {
        if (!data.server_id) {
          return this.syncMeeting({ ...op, operation_type: 'create' }, userId)
        }

        const result = await MRService.updateMeeting(data.server_id, {
          title: data.title,
          scheduled_date: data.scheduled_date,
          duration_minutes: data.duration_minutes,
          status: data.status,
          location: data.location ?? null,
          purpose: data.purpose,
          notes: data.notes
        })

        if (result.success) {
          await LocalDatabaseService.updateMeeting(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.log('✅ SYNC MEETING: Skipping server delete — meeting was never synced')
          await LocalDatabaseService.updateMeeting(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
          return true
        }

        const result = await MRService.deleteMeeting(data.server_id)
        if (result.success) {
          await LocalDatabaseService.updateMeeting(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC MEETING: Error:', error)
      return false
    }
  }

  /**
   * Sync meeting note operation
   */
  private static async syncMeetingNote(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC NOTE: ${op.operation_type}`, data)

      const meetingLocalId = String(data.meeting_id || '')
      let meeting = await LocalDatabaseService.getMeetingById(meetingLocalId)
      if (!meeting) {
        console.error('❌ SYNC NOTE: Meeting not found or missing server_id')
        return false
      }
      if (!meeting.server_id) {
        const meetingServerId = await this.ensureMeetingHasServerId(meetingLocalId, userId)
        if (!meetingServerId) {
          console.error('❌ SYNC NOTE: Meeting not found or missing server_id')
          return false
        }
        meeting = await LocalDatabaseService.getMeetingById(meetingLocalId)
        if (!meeting?.server_id) {
          console.error('❌ SYNC NOTE: Meeting not found or missing server_id')
          return false
        }
      }

      let followUpServerId: string | undefined
      if (data.follow_up_id) {
        const followUp = await LocalDatabaseService.getMeetingFollowUpById(data.follow_up_id)
        followUpServerId = followUp?.server_id || undefined
      }

      // The note's brochure_id is a local saved-copy storage id (never synced).
      // Resolve it to a server-known id and the saved copy's custom title.
      const noteBrochureId = String(data.brochure_id || '').trim()
      if (noteBrochureId) {
        const brochureActive = await LocalDatabaseService.isMeetingNoteBrochureActive(
          noteBrochureId,
          data.brochure_title,
        )
        if (!brochureActive) {
          console.warn(
            `⚠️ SYNC NOTE: Brochure for note ${op.record_id} is gone (${noteBrochureId} / ${data.brochure_title || ''}) — converting to local delete`,
          )
          await LocalDatabaseService.deleteMeetingNote(op.record_id)
          // deleteMeetingNote queues a delete; mark this op done so we don't recreate
          return true
        }
      }

      const { serverBrochureId, brochureTitle } = await LocalDatabaseService.resolveNoteBrochure(
        data.brochure_id,
      )
      // Prefer live saved-copy title over a stale snapshot (e.g. deleted "66")
      const resolvedBrochureTitle = (brochureTitle && brochureTitle.trim())
        ? brochureTitle.trim()
        : (data.brochure_title && String(data.brochure_title).trim())
          ? String(data.brochure_title).trim()
          : ''

      if (op.operation_type === 'create') {
        const result = await MRService.addSlideNote({
          meeting_id: meeting.server_id,
          slide_id: data.slide_id,
          slide_title: data.slide_title,
          slide_order: data.slide_order ?? 0,
          brochure_id: serverBrochureId || data.brochure_id || '',
          brochure_title: resolvedBrochureTitle || undefined,
          note_text: data.note_text || '',
          follow_up_id: followUpServerId,
        })

        if (result.success && result.data) {
          const noteServerId =
            result.data.note_id ||
            (result.data as { id?: string }).id
          if (!noteServerId) {
            console.error('❌ SYNC NOTE: Create succeeded but no note id in response', result.data)
            return false
          }
          await LocalDatabaseService.updateMeetingNote(op.record_id, {
            server_id: noteServerId,
            brochure_title: resolvedBrochureTitle || data.brochure_title,
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          console.log('✅ SYNC NOTE: Created on server with id', noteServerId)
          return true
        }
        console.error('❌ SYNC NOTE: Create failed', (result as any).error)
        return false
      } else if (op.operation_type === 'update') {
        if (!data.server_id) {
          return this.syncMeetingNote({ ...op, operation_type: 'create' }, userId)
        }

        const result = await MRService.updateSlideNote(
          data.server_id,
          data.note_text || '',
          meeting.server_id,
          resolvedBrochureTitle || undefined,
          data.slide_title || undefined,
        )
        if (result.success) {
          await LocalDatabaseService.updateMeetingNote(op.record_id, {
            brochure_title: resolvedBrochureTitle || data.brochure_title,
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.log('✅ SYNC NOTE: Skipping server delete — note was never synced')
          await LocalDatabaseService.updateMeetingNote(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
          return true
        }

        const result = await MRService.deleteSlideNote(data.server_id, meeting.server_id)
        if (result.success) {
          await LocalDatabaseService.updateMeetingNote(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC NOTE: Error:', error)
      return false
    }
  }

  /**
   * Sync meeting follow-up operation
   */
  private static async syncMeetingFollowUp(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC FOLLOW-UP: ${op.operation_type}`, data)

      // Get meeting server_id
      const meeting = await LocalDatabaseService.getMeetingById(data.meeting_id)
      if (!meeting || !meeting.server_id) {
        console.error('❌ SYNC FOLLOW-UP: Meeting not found or missing server_id')
        return false
      }

      if (op.operation_type === 'create') {
        const result = await MRService.createMeetingFollowUp({
          meeting_id: meeting.server_id,
          follow_up_date: data.follow_up_date,
          follow_up_time: data.follow_up_time,
          follow_up_notes: data.follow_up_notes || '',
          status: data.status || 'scheduled',
        })

        if (result.success && result.data) {
          const followUpId =
            (result.data as any).follow_up_id ||
            (result.data as any).followup_id ||
            (result.data as any).id
          if (!followUpId) {
            console.error('❌ SYNC FOLLOW-UP: Create succeeded but no follow-up id in response', result.data)
            return false
          }
          await LocalDatabaseService.updateMeetingFollowUp(op.record_id, {
            server_id: followUpId,
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          console.log('✅ SYNC FOLLOW-UP: Created on server with id', followUpId)
          return true
        }
        console.error('❌ SYNC FOLLOW-UP: Create failed', (result as any).error)
        return false
      } else if (op.operation_type === 'update') {
        if (!data.server_id) {
          return this.syncMeetingFollowUp({ ...op, operation_type: 'create' }, userId)
        }

        const result = await MRService.updateMeetingFollowUpById(data.server_id, {
          follow_up_date: data.follow_up_date,
          follow_up_time: data.follow_up_time,
          follow_up_notes: data.follow_up_notes || '',
          status: data.status,
        })

        if (result.success) {
          await LocalDatabaseService.updateMeetingFollowUp(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.log('✅ SYNC FOLLOW-UP: Skipping server delete — follow-up was never synced')
          await LocalDatabaseService.updateMeetingFollowUp(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
          return true
        }

        const result = await MRService.deleteMeetingFollowUp(data.server_id)
        if (result.success) {
          await LocalDatabaseService.updateMeetingFollowUp(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC FOLLOW-UP: Error:', error)
      return false
    }
  }

  /**
   * Sync a general meeting note (title + notes) — separate entity from slide notes.
   */
  private static async syncMeetingGeneralNote(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC GENERAL NOTE: ${op.operation_type}`, data)

      const meeting = await LocalDatabaseService.getMeetingById(data.meeting_id)
      if (!meeting || !meeting.server_id) {
        console.error('❌ SYNC GENERAL NOTE: Meeting not found or missing server_id')
        return false
      }

      if (op.operation_type === 'create') {
        const result = await MRService.addGeneralNote({
          meeting_id: meeting.server_id,
          title: data.title || '',
          notes: data.notes || '',
        })
        if (result.success && result.data) {
          const noteServerId = result.data.note_id
          if (!noteServerId) {
            console.error('❌ SYNC GENERAL NOTE: Create succeeded but no id', result.data)
            return false
          }
          await LocalDatabaseService.updateMeetingGeneralNote(op.record_id, {
            server_id: noteServerId,
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          console.log('✅ SYNC GENERAL NOTE: Created on server with id', noteServerId)
          return true
        }
        console.error('❌ SYNC GENERAL NOTE: Create failed', (result as any).error)
        return false
      } else if (op.operation_type === 'update') {
        if (!data.server_id) {
          return this.syncMeetingGeneralNote({ ...op, operation_type: 'create' }, userId)
        }
        const result = await MRService.updateGeneralNote(data.server_id, {
          title: data.title || '',
          notes: data.notes || '',
        })
        if (result.success) {
          await LocalDatabaseService.updateMeetingGeneralNote(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.log('✅ SYNC GENERAL NOTE: Skipping server delete — note was never synced')
          await LocalDatabaseService.updateMeetingGeneralNote(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
          return true
        }
        const result = await MRService.deleteGeneralNote(data.server_id)
        if (result.success) {
          await LocalDatabaseService.updateMeetingGeneralNote(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC GENERAL NOTE: Error:', error)
      return false
    }
  }

  private static async applySavedBrochureDelete(op: any, userId: string): Promise<boolean> {
    const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
    let brochureId = data.brochure_id as string | undefined
    let serverId = data.server_id as string | undefined

    if (!brochureId || !serverId) {
      const local = await LocalDatabaseService.getSavedBrochureRecordById(op.record_id)
      brochureId = brochureId || local?.brochure_id
      serverId = serverId || local?.server_id
    }

    if (!serverId && !brochureId) {
      const local = await LocalDatabaseService.getSavedBrochureRecordById(op.record_id)
      if (!local?.server_id) {
        console.log('✅ SYNC SAVED BROCHURE: Skipping server delete — record was never synced')
        await LocalDatabaseService.updateSavedBrochure(op.record_id, {
          sync_status: 'synced',
          skipSyncQueue: true,
        })
        return true
      }
      console.warn('⚠️ SYNC SAVED BROCHURE: Cannot delete saved brochure without identifiers')
      return false
    }

    const result = await MRService.removeSavedBrochureWithIdentifiers({
      server_id: serverId,
      brochure_id: brochureId,
    })

    if (result.success) {
      await LocalDatabaseService.updateSavedBrochure(op.record_id, {
        sync_status: 'synced',
        skipSyncQueue: true,
      })
      return true
    }

    return false
  }

  private static async pushSavedBrochureCreate(
    opRecordId: string,
    userId: string,
    brochureId: string,
    customTitle: string,
    logLabel: string,
  ): Promise<boolean> {
    // Re-read local — a prior queue op may have already created the server row.
    const local = await LocalDatabaseService.getSavedBrochureRecordById(opRecordId)
    if (local?.server_id) {
      const title = String(customTitle || local.custom_title || local.brochure_title || '')
      console.log(
        `⏭️ SYNC SAVED BROCHURE: Skip duplicate create for ${opRecordId} — already has server_id ${local.server_id}`,
      )
      if (title) {
        const updateResult = await MRService.updateSavedBrochureTitle(userId, String(local.server_id), title)
        if (updateResult.success) {
          await LocalDatabaseService.updateSavedBrochure(opRecordId, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
      }
      await LocalDatabaseService.updateSavedBrochure(opRecordId, {
        sync_status: 'synced',
        skipSyncQueue: true,
      })
      return true
    }

    const resolvedBrochureId = brochureId || String(local?.brochure_id || '')
    const resolvedTitle = String(
      customTitle || local?.custom_title || local?.brochure_title || '',
    )

    const result = await MRService.saveBrochureForMr(userId, resolvedBrochureId, resolvedTitle)

    if (result.success && result.data) {
      await LocalDatabaseService.updateSavedBrochure(opRecordId, {
        server_id: result.data.id,
        sync_status: 'synced',
        brochure_id: resolveServerBrochureId(resolvedBrochureId),
        skipSyncQueue: true,
      })
      console.log(`✅ SYNC SAVED BROCHURE: ${logLabel} with id ${result.data.id}`)
      return true
    }

    console.warn(`⚠️ SYNC SAVED BROCHURE: ${logLabel} failed:`, result.error)
    return false
  }

  /**
   * Sync saved brochure operation
   */
  private static async syncSavedBrochure(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC SAVED BROCHURE: ${op.operation_type}`, data)

      if (op.operation_type === 'create') {
        return this.pushSavedBrochureCreate(
          op.record_id,
          userId,
          String(data.brochure_id || ''),
          String(data.custom_title || data.brochure_title || ''),
          'Created on server',
        )
      } else if (op.operation_type === 'update') {
        const local = await LocalDatabaseService.getSavedBrochureRecordById(op.record_id)

        if (data.is_deleted) {
          return this.applySavedBrochureDelete(op, userId)
        }

        const brochureId = String(data.brochure_id || local?.brochure_id || '')
        const customTitle = String(data.custom_title || local?.custom_title || local?.brochure_title || '')
        const serverId = data.server_id || local?.server_id

        // Title/metadata updates must target the saved-brochure server UUID.
        // If never synced, push as create instead of PATCHing by source brochure_id.
        if (!serverId) {
          return this.pushSavedBrochureCreate(
            op.record_id,
            userId,
            brochureId,
            customTitle,
            'Created on server (from update)',
          )
        }

        const result = await MRService.updateSavedBrochureTitle(
          userId,
          String(serverId),
          customTitle,
        )

        if (result.success) {
          await LocalDatabaseService.updateSavedBrochure(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          console.log(`✅ SYNC SAVED BROCHURE: Updated title on server for ${serverId}`)
          return true
        }

        // Stale server_id (e.g. admin deleted the row) — recreate on server.
        if (result.notFound) {
          console.log(
            `⚠️ SYNC SAVED BROCHURE: Server record ${serverId} not found — recreating local copy ${op.record_id}`,
          )
          await LocalDatabaseService.updateSavedBrochure(op.record_id, {
            server_id: null,
            skipSyncQueue: true,
          })
          return this.pushSavedBrochureCreate(
            op.record_id,
            userId,
            brochureId,
            customTitle,
            'Recreated on server after stale server_id',
          )
        }

        console.warn('⚠️ SYNC SAVED BROCHURE: Update failed:', result.error)
        return false
      } else if (op.operation_type === 'delete') {
        return this.applySavedBrochureDelete(op, userId)
      }
      return false
    } catch (error) {
      console.error('❌ SYNC SAVED BROCHURE: Error:', error)
      return false
    }
  }

  /**
   * Sync brochure changes (slides, groups, etc.)
   * brochure_id pushed to the server must be the SavedBrochure.server_id so admin
   * can attach customizations to that saved copy (not a local storage folder id).
   */
  private static async syncBrochureChanges(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC BROCHURE CHANGES: ${op.operation_type}`, {
        brochureId: data.brochureId || data.brochure_id,
        title: data.title || data.brochure_title,
        slidesCount: data.slides?.length || 0,
        groupsCount: data.groups?.length || 0,
      })

      const queuedBrochureId = data.brochureId || data.brochure_id
      if (!queuedBrochureId) {
        console.warn('⚠️ SYNC BROCHURE CHANGES: Missing brochureId — marking operation complete to clear queue')
        return true
      }

      const syncRow = await LocalDatabaseService.getBrochureSyncById(op.record_id)
      let parsedRowData: Record<string, unknown> = {}
      try {
        parsedRowData =
          typeof syncRow?.brochure_data === 'string'
            ? JSON.parse(syncRow.brochure_data)
            : ((syncRow?.brochure_data as Record<string, unknown>) || {})
      } catch {
        parsedRowData = {}
      }

      const storageId = String(parsedRowData.storage_id || data.storage_id || queuedBrochureId)
      const savedHint =
        String(parsedRowData.saved_brochure_id || data.saved_brochure_id || '').trim() || undefined

      const saved = await LocalDatabaseService.resolveSavedBrochureForSync(userId, storageId, {
        savedBrochureId: savedHint || queuedBrochureId,
        customTitle: syncRow?.brochure_title || data.brochure_title || data.title,
      })

      const pushBrochureId = saved?.server_id || syncRow?.brochure_id || queuedBrochureId
      const pushTitle =
        saved?.custom_title ||
        syncRow?.brochure_title ||
        data.brochure_title ||
        data.title ||
        'Brochure'

      if (!saved?.server_id) {
        console.warn(
          `⚠️ SYNC BROCHURE CHANGES: Saved brochure has no server_id yet for storage=${storageId}. ` +
            `Pushing with brochure_id=${pushBrochureId}. saved_brochures should sync first.`,
        )
      }

      const brochureResult = await BrochureManagementService.getBrochureData(storageId)
      if (!brochureResult.success || !brochureResult.data) {
        console.error('❌ SYNC BROCHURE CHANGES: Brochure data not found at storage:', storageId)
        return false
      }

      const brochureData = brochureResult.data
      const slides = brochureData.slides || []
      const groups = brochureData.groups || []

      const resolvedGroups = await Promise.all(
        groups.map(async (group: any) => {
          const rawDoctorId = group.doctorId || group.doctor_id
          if (!rawDoctorId) return group
          const serverDoctorId = await LocalDatabaseService.resolveDoctorServerId(rawDoctorId)
          return { ...group, doctorId: serverDoctorId || rawDoctorId }
        }),
      )

      // Never send file:// as the only image reference — admin uses fileName + source ZIP.
      const sanitizedSlides = slides.map((slide: any) => {
        const fileName =
          slide.fileName ||
          (typeof slide.imageUri === 'string' && slide.imageUri.includes('/')
            ? slide.imageUri.split('/').pop()
            : undefined) ||
          `slide_${slide.order ?? 0}.jpg`

        const remoteUrl =
          typeof slide.imageUri === 'string' &&
          (slide.imageUri.startsWith('http://') || slide.imageUri.startsWith('https://'))
            ? slide.imageUri
            : typeof slide.image_url === 'string' &&
                (slide.image_url.startsWith('http://') ||
                  slide.image_url.startsWith('https://') ||
                  slide.image_url.startsWith('/'))
              ? slide.image_url
              : undefined

        const clean: Record<string, unknown> = {
          id: slide.id,
          title: slide.title,
          fileName,
          order: slide.order,
          groupIds: slide.groupIds || (slide.groupId ? [slide.groupId] : []),
        }
        if (remoteUrl) clean.image_url = remoteUrl
        return clean
      })

      // Best-effort upload of local slide images for optional remote image_url.
      console.log(`🔄 SYNC BROCHURE CHANGES: Uploading ${slides.length} slide images (best-effort)...`)
      const slideUploadResults = await Promise.all(
        slides.map(async (slide: any) => {
          if (!slide.imageUri || !String(slide.imageUri).startsWith('file://')) return null
          try {
            const uploadResult = await FileStorageService.uploadFile(slide.imageUri, `${slide.id}.jpg`)
            if (uploadResult.success && uploadResult.publicUrl) {
              return { slideId: slide.id, url: uploadResult.publicUrl }
            }
          } catch (error) {
            console.error(`❌ SYNC BROCHURE CHANGES: Exception uploading slide ${slide.id}:`, error)
          }
          return null
        }),
      )
      const successfulUploads = slideUploadResults.filter(Boolean) as Array<{ slideId: string; url: string }>
      const urlBySlideId = new Map(successfulUploads.map((r) => [r.slideId, r.url]))
      const slidesWithOptionalUrls = sanitizedSlides.map((slide) => {
        const uploaded = urlBySlideId.get(String(slide.id))
        if (uploaded && !slide.image_url) return { ...slide, image_url: uploaded }
        return slide
      })

      this.reportProgress('Updating Brochure Metadata', 'Saving brochure changes to server...', 90)
      console.log(
        `🔄 SYNC BROCHURE CHANGES: Saving brochure_id=${pushBrochureId} title=${pushTitle} ` +
          `(storage=${storageId}, uploads=${successfulUploads.length}/${slides.length})`,
      )

      if (op.operation_type === 'create' || op.operation_type === 'update') {
        const saveResult = await MRService.saveBrochureChanges({
          mr_id: userId,
          brochure_id: pushBrochureId,
          brochure_title: pushTitle,
          brochure_data: {
            slides: slidesWithOptionalUrls,
            groups: resolvedGroups,
          },
          last_modified:
            brochureData.updatedAt || brochureData.localLastModified || new Date().toISOString(),
        })

        if (saveResult.success && saveResult.data) {
          await LocalDatabaseService.updateBrochureSync(op.record_id, {
            server_id: saveResult.data.id,
            brochure_id: pushBrochureId,
            brochure_title: pushTitle,
            brochure_data: JSON.stringify({
              storage_id: storageId,
              saved_brochure_id: saved?.id || null,
              slides: slidesWithOptionalUrls,
              groups: resolvedGroups,
            }),
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          console.log(
            `✅ SYNC BROCHURE CHANGES: Synced customizations for saved copy ${pushBrochureId}`,
          )
          return true
        }

        console.error(`❌ SYNC BROCHURE CHANGES: Failed to save metadata:`, saveResult.error)
        return false
      }

      if (op.operation_type === 'delete') {
        const serverId = data.server_id || syncRow?.server_id
        if (!serverId) {
          console.warn(
            `⚠️ SYNC BROCHURE CHANGES: Skipping delete for ${op.record_id} — no server_id`,
          )
          return true
        }
        const deleteResult = await MRService.deleteBrochureSync(userId, pushBrochureId)
        if (deleteResult.success) {
          await LocalDatabaseService.updateBrochureSync(op.record_id, {
            sync_status: 'synced',
            skipSyncQueue: true,
          })
          return true
        }
        console.error(`❌ SYNC BROCHURE CHANGES: Failed to delete brochure sync:`, deleteResult.error)
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC BROCHURE CHANGES: Error:', error)
      return false
    }
  }

  private static extractActivityLogServerId(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const payload = data as Record<string, unknown>;
    const candidates = [payload.id, payload.activity_id, payload.server_id];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
    return undefined;
  }

  /**
   * Sync activity log operation
   */
  private static async syncActivityLog(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC ACTIVITY LOG: ${op.operation_type}`, data)

      if (op.operation_type === 'create') {
        // Prefer live local row (correct field mapping); fall back to queue payload aliases.
        const local = await LocalDatabaseService.getActivityLogById(op.record_id)
        const activityType = String(
          local?.activity_type || data.activity_type || data.action || '',
        ).trim()
        const description = String(
          local?.description || data.description || data.details || '',
        ).trim()
        const metadata = local?.metadata ?? data.metadata
        const enriched = this.buildActivityLogPushPayload(activityType, description, metadata)

        if (!activityType && !description) {
          console.warn(
            `⚠️ SYNC ACTIVITY LOG: Skipping empty activity ${op.record_id} (no type/description)`,
          )
          await LocalDatabaseService.markActivityLogSynced(op.record_id)
          return true
        }

        const result = await MRService.logActivity(
          userId,
          enriched.activity_type,
          enriched.description,
          enriched.metadata,
          {
            entity_type: enriched.entity_type,
            entity_id: enriched.entity_id,
            details: enriched.description,
          },
        )

        if (result.success) {
          const serverId = this.extractActivityLogServerId(result.data)
          await LocalDatabaseService.markActivityLogSynced(op.record_id, serverId)
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC ACTIVITY LOG: Error:', error)
      return false
    }
  }

  /**
   * Normalize activity log payload to the backend-preferred shape
   * (activity_type, description, entity_type, entity_id, metadata).
   */
  private static buildActivityLogPushPayload(
    activityType: string,
    description: string,
    metadata: unknown,
  ): {
    activity_type: string
    description: string
    entity_type?: string
    entity_id?: string
    metadata?: Record<string, unknown>
  } {
    let meta: Record<string, unknown> = {}
    if (typeof metadata === 'string') {
      try {
        meta = JSON.parse(metadata)
      } catch {
        meta = { raw: metadata }
      }
    } else if (metadata && typeof metadata === 'object') {
      meta = { ...(metadata as Record<string, unknown>) }
    }

    const type = activityType || 'activity'
    let entityType: string | undefined
    if (type.startsWith('doctor_')) entityType = 'doctors'
    else if (type.startsWith('meeting_')) entityType = 'meetings'
    else if (type.startsWith('follow_up_')) entityType = 'meeting_followups'
    else if (type.startsWith('slide_note_')) entityType = 'meeting_slide_notes'
    else if (type.startsWith('general_note_')) entityType = 'meeting_general_notes'
    else if (
      type.startsWith('slide_') ||
      type.startsWith('group_') ||
      type === 'brochure_saved' ||
      type === 'brochure_download' ||
      type === 'brochure_viewed'
    ) {
      entityType = 'brochure_sync'
    }

    const entityId = String(
      meta.entity_id ||
        meta.server_id ||
        meta.meeting_id ||
        meta.doctor_id ||
        meta.note_id ||
        meta.follow_up_id ||
        meta.brochure_id ||
        meta.saved_brochure_id ||
        '',
    ).trim() || undefined

    return {
      activity_type: type,
      description: description || type,
      entity_type: entityType,
      entity_id: entityId,
      metadata: Object.keys(meta).length > 0 ? meta : undefined,
    }
  }

  /**
   * Sync down: Download data from server to local database
   */
  static async syncDown(userId: string): Promise<SyncResult> {
    console.log('⬇️ SYNC DOWN: Starting sync down process...')
    
    try {
      // Check network connectivity
      const isOnline = await NetworkService.isOnline()
      if (!isOnline) {
        console.log('❌ SYNC DOWN: Device is offline, cannot sync')
        return {
          success: false,
          synced: 0,
          failed: 0,
          message: 'Device is offline. Please connect to the internet and try again.'
        }
      }

      await LocalDatabaseService.ensureReady()

      const pullResult = await this.syncDownViaPull(userId)
      if (pullResult) {
        return pullResult
      }

      let synced = 0
      let failed = 0
      const errors: string[] = []

      // Download doctors
      this.reportProgress('Downloading', 'Downloading doctors...', 10)
      console.log('⬇️ SYNC DOWN: Downloading doctors...')
      try {
        const doctorsResult = await MRService.getDoctors(userId)
        if (doctorsResult.success && doctorsResult.data) {
          for (const doctor of doctorsResult.data) {
            try {
              await LocalDatabaseService.upsertDoctor({
                id: `doctor_${doctor.doctor_id}`,
                server_id: doctor.doctor_id,
                mr_id: userId,
                first_name: doctor.first_name,
                last_name: doctor.last_name,
                specialty: doctor.specialty,
                hospital: doctor.hospital,
                phone: doctor.phone,
                email: doctor.email,
                location: doctor.location,
                notes: doctor.notes ?? '',
                profile_image_url: null,
                created_at: doctor.created_at,
                updated_at: doctor.created_at,
                sync_status: 'synced',
                is_deleted: false
              })
              synced++
            } catch (error) {
              failed++
              errors.push(`Doctor ${doctor.doctor_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
          }
          console.log(`✅ SYNC DOWN: Downloaded ${doctorsResult.data.length} doctors`)
        }
      } catch (error) {
        failed++
        errors.push(`Doctors: ${error instanceof Error ? error.message : 'Unknown error'}`)
        console.error('❌ SYNC DOWN: Failed to download doctors:', error)
      }

      // Download meetings
      this.reportProgress('Downloading', 'Downloading meetings...', 30)
      console.log('⬇️ SYNC DOWN: Downloading meetings...')
      try {
        const meetingsResult = await MRService.getMeetings(userId)
        if (meetingsResult.success && meetingsResult.data) {
          for (const meeting of meetingsResult.data) {
            try {
              // Get doctor local ID
              const doctor = await LocalDatabaseService.getDoctorByServerId(meeting.doctor_id)
              if (!doctor) {
                console.warn(`⚠️ SYNC DOWN: Doctor ${meeting.doctor_id} not found locally, skipping meeting`)
                failed++
                continue
              }

              await LocalDatabaseService.upsertMeeting({
                id: `meeting_${meeting.meeting_id}`,
                server_id: meeting.meeting_id,
                mr_id: userId,
                doctor_id: doctor.id,
                doctor_server_id: meeting.doctor_id,
                brochure_id: meeting.brochure_id || null,
                title: meeting.title,
                scheduled_date: meeting.scheduled_date || meeting.meeting_date,
                duration_minutes: meeting.duration_minutes || 30,
                status: meeting.status,
                location: meeting.hospital || null,
                purpose: meeting.purpose || null,
                notes: meeting.notes || null,
                follow_up_required: meeting.follow_up_required || false,
                follow_up_date: meeting.follow_up_date || null,
                follow_up_time: meeting.follow_up_time || null,
                follow_up_notes: meeting.follow_up_notes || null,
                created_at: meeting.created_at,
                updated_at: meeting.updated_at || meeting.created_at,
                sync_status: 'synced',
                is_deleted: false
              })
              synced++
            } catch (error) {
              failed++
              errors.push(`Meeting ${meeting.meeting_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
          }
          console.log(`✅ SYNC DOWN: Downloaded ${meetingsResult.data.length} meetings`)
        }
      } catch (error) {
        failed++
        errors.push(`Meetings: ${error instanceof Error ? error.message : 'Unknown error'}`)
        console.error('❌ SYNC DOWN: Failed to download meetings:', error)
      }

      // Download meeting follow-ups
      this.reportProgress('Downloading', 'Downloading follow-ups...', 60)
      console.log('⬇️ SYNC DOWN: Downloading meeting follow-ups...')
      try {
        const meetings = await LocalDatabaseService.getMeetings(userId)
        for (const meeting of meetings) {
          if (meeting.server_id) {
            try {
              const followUpsResult = await MRService.getMeetingFollowUps(meeting.server_id)
              if (followUpsResult.success && followUpsResult.data) {
                for (const followUp of followUpsResult.data) {
                  try {
                    await LocalDatabaseService.upsertMeetingFollowUp({
                      id: `followup_${followUp.followup_id}`,
                      server_id: followUp.followup_id,
                      meeting_id: meeting.id,
                      meeting_server_id: meeting.server_id,
                      follow_up_date: followUp.follow_up_date,
                      follow_up_time: followUp.follow_up_time,
                      follow_up_notes: followUp.follow_up_notes || null,
                      status: followUp.status || 'scheduled',
                      sequence_number: followUp.sequence_number || 1,
                      created_at: followUp.created_at,
                      updated_at: followUp.updated_at || followUp.created_at,
                      sync_status: 'synced',
                      is_deleted: false
                    })
                    synced++
                  } catch (error) {
                    failed++
                    errors.push(`Follow-up ${followUp.followup_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  }
                }
              }
            } catch (error) {
              console.warn(`⚠️ SYNC DOWN: Failed to download follow-ups for meeting ${meeting.server_id}:`, error)
            }
          }
        }
      } catch (error) {
        console.error('❌ SYNC DOWN: Failed to download follow-ups:', error)
      }

      // Download meeting notes (metadata)
      this.reportProgress('Downloading', 'Downloading meeting notes...', 65)
      console.log('⬇️ SYNC DOWN: Downloading meeting notes...')
      try {
        const meetingsForNotes = await LocalDatabaseService.getMeetings(userId)
        for (const meeting of meetingsForNotes) {
          if (!meeting.server_id) continue
          try {
            const detailsResult = await MRService.getMeetingDetails(meeting.server_id)
            if (!detailsResult.success || !detailsResult.data?.slide_notes) continue

            for (const note of detailsResult.data.slide_notes) {
              try {
                await LocalDatabaseService.upsertMeetingNote({
                  id: `note_${note.note_id}`,
                  server_id: note.note_id,
                  meeting_id: meeting.id,
                  meeting_server_id: meeting.server_id,
                  slide_id: note.slide_id,
                  slide_title: note.slide_title,
                  slide_order: note.slide_order ?? 0,
                  brochure_id: note.brochure_id || meeting.brochure_id || '',
                  brochure_title: note.brochure_title || '',
                  note_text: note.note_text,
                  created_at: note.created_at,
                  updated_at: note.updated_at || note.created_at,
                  version: 1,
                  sync_status: 'synced',
                  is_deleted: false,
                })
                synced++
              } catch (error) {
                failed++
                errors.push(`Note ${note.note_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
              }
            }
          } catch (error) {
            console.warn(`⚠️ SYNC DOWN: Failed to download notes for meeting ${meeting.server_id}:`, error)
          }
        }
      } catch (error) {
        console.error('❌ SYNC DOWN: Failed to download meeting notes:', error)
      }

      // Download available brochures and sync local cache
      this.reportProgress('Downloading', 'Downloading available brochures...', 55)
      console.log('⬇️ SYNC DOWN: Downloading available brochures...')
      try {
        const brochuresResult = await MRService.getAssignedBrochures(userId)
        if (brochuresResult.success) {
          const brochures = brochuresResult.data || []
          await LocalDatabaseService.syncBrochuresFromServer(brochures)
          const { OfflineBrochureService } = await import('./offlineBrochureService')
          await OfflineBrochureService.cacheBrochures(userId, brochures)
          console.log(`✅ SYNC DOWN: Synced ${brochures.length} available brochures`)
        }
      } catch (error) {
        console.error('❌ SYNC DOWN: Failed to download available brochures:', error)
      }

      // Download saved brochures
      this.reportProgress('Downloading', 'Downloading saved brochures...', 70)
      console.log('⬇️ SYNC DOWN: Downloading saved brochures...')
      try {
        const savedBrochuresResult = await MRService.getSavedBrochuresForMr(userId)
        if (savedBrochuresResult.success && savedBrochuresResult.data) {
          for (const savedBrochure of savedBrochuresResult.data) {
            try {
              const serverSavedId = String(savedBrochure.id || '')
              await LocalDatabaseService.upsertSavedBrochure({
                id: serverSavedId,
                server_id: serverSavedId,
                storage_id: serverSavedId,
                mr_id: userId,
                brochure_id: resolveServerBrochureId(String(savedBrochure.brochure_id || '')),
                brochure_title: savedBrochure.brochure_title,
                custom_title: savedBrochure.custom_title,
                original_brochure_data: JSON.stringify(savedBrochure.original_brochure_data),
                saved_at: savedBrochure.saved_at,
                last_accessed: savedBrochure.last_accessed,
                created_at: savedBrochure.saved_at,
                version: 1,
                sync_status: 'synced',
                is_deleted: false
              })
              try {
                await BrochureManagementService.ensureIndependentSavedBrochureStorage({
                  id: serverSavedId,
                  server_id: serverSavedId,
                  brochure_id: resolveServerBrochureId(String(savedBrochure.brochure_id || '')),
                  storage_id: serverSavedId,
                })
              } catch (migrateErr) {
                console.warn(`⚠️ SYNC DOWN: Independent storage for ${serverSavedId}:`, migrateErr)
              }
              synced++
            } catch (error) {
              console.error(`❌ SYNC DOWN: Failed to upsert saved brochure ${savedBrochure.id}:`, error)
              failed++
              errors.push(`Failed to upsert saved brochure ${savedBrochure.id}: ${error instanceof Error ? error.message : String(error)}`)
            }
          }

          // Tombstone deletions only — never delete local copies just because server has fewer rows.
          // Local is source of truth; unmatched locals are pushed via syncUpFull reconciliation.
          for (const savedBrochure of savedBrochuresResult.data) {
            if (savedBrochure.is_deleted) {
              const serverSavedId = String(savedBrochure.id || '')
              const canonicalBrochureId = resolveServerBrochureId(String(savedBrochure.brochure_id || ''))
              await LocalDatabaseService.applyServerSavedBrochureDeletion(
                userId,
                serverSavedId,
                canonicalBrochureId,
              )
            }
          }

          console.log(`✅ SYNC DOWN: Downloaded ${savedBrochuresResult.data.length} saved brochures`)
        } else if (savedBrochuresResult.error) {
          throw new Error(savedBrochuresResult.error)
        }
      } catch (err) {
        console.error('❌ SYNC DOWN: Failed to download saved brochures:', err)
        failed++
        errors.push(`Failed to download saved brochures: ${err instanceof Error ? err.message : String(err)}`)
      }

      // Download brochure sync data (brochure modifications)
      this.reportProgress('Downloading', 'Downloading brochure modifications...', 85)
      console.log('⬇️ SYNC DOWN: Downloading brochure modifications...')
      try {
        const brochureChangesResult = await MRService.getBrochureChangesForMr(userId)
        if (brochureChangesResult.success && brochureChangesResult.data) {
          for (const change of brochureChangesResult.data) {
            try {
              // Get full brochure sync data
              const syncDataResult = await MRService.getBrochureSyncData(userId, change.brochure_id)
              if (syncDataResult.success && syncDataResult.data) {
                const syncData = syncDataResult.data
                await LocalDatabaseService.upsertBrochureSync({
                  id: `brochure_sync_${userId}_${change.brochure_id}`,
                  server_id: (syncData as { id?: string }).id || change.id,
                  mr_id: userId,
                  brochure_id: change.brochure_id,
                  brochure_title: change.brochure_title,
                  brochure_data: JSON.stringify(syncData),
                  last_modified: change.last_modified,
                  created_at: change.last_modified,
                  version: 1,
                  sync_status: 'synced',
                  is_deleted: false,
                })
                synced++
              }
            } catch (error) {
              console.error(`❌ SYNC DOWN: Failed to download brochure sync data for ${change.brochure_id}:`, error)
              failed++
              errors.push(`Failed to download brochure sync data for ${change.brochure_id}: ${error instanceof Error ? error.message : String(error)}`)
            }
          }
          console.log(`✅ SYNC DOWN: Downloaded ${brochureChangesResult.data.length} brochure modifications`)
        } else if (brochureChangesResult.error) {
          throw new Error(brochureChangesResult.error)
        }
      } catch (err) {
        console.error('❌ SYNC DOWN: Failed to download brochure modifications:', err)
        failed++
        errors.push(`Failed to download brochure modifications: ${err instanceof Error ? err.message : String(err)}`)
      }

      this.reportProgress('Complete', `Downloaded: ${synced}, Failed: ${failed}`, 100)

      const message = `Downloaded: ${synced}, Failed: ${failed}`
      console.log(`⬇️ SYNC DOWN: Completed - ${message}`)

      return {
        success: failed === 0,
        synced,
        failed,
        message,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (error) {
      console.error('❌ SYNC DOWN: Fatal error:', error)
      return {
        success: false,
        synced: 0,
        failed: 0,
        message: error instanceof Error ? error.message : 'Sync down failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      }
    }
  }

  private static mapTableToEntity(tableName: string): string | null {
    const mapping: Record<string, string> = {
      doctors: 'doctors',
      meetings: 'meetings',
      meeting_notes: 'meeting_slide_notes',
      meeting_slide_notes: 'meeting_slide_notes',
      meeting_general_notes: 'meeting_general_notes',
      meeting_followups: 'meeting_followups',
      saved_brochures: 'saved_brochures',
      brochure_sync: 'brochure_sync',
      activity_logs: 'activity_logs',
    }
    return mapping[tableName] || null
  }

  private static async enrichPushData(
    op: any,
    data: Record<string, unknown>,
    userId: string,
  ): Promise<Record<string, unknown>> {
    if (op.table_name === 'saved_brochures') {
      return this.enrichSavedBrochurePushData(op, data)
    }

    if (op.table_name === 'doctors') {
      const local = await LocalDatabaseService.getDoctorRecordById(op.record_id)
      const merged = { ...(local || {}), ...data } as Record<string, unknown>
      const localId = String(local?.id || op.record_id)
      // Live DB is source of truth — ignore stale server_id left in queue payload after reset.
      const localServerId = String(local?.server_id || '').trim()
      let effectiveOp: 'create' | 'update' | 'delete' = op.operation_type

      if (effectiveOp === 'update' && !localServerId) {
        console.log(
          `🔄 SYNC PUSH: Converting doctors update→create for ${localId} (no local server_id)`,
        )
        effectiveOp = 'create'
      }

      if (effectiveOp === 'create' && local?.is_deleted) {
        return { skip: true }
      }

      // Never re-create a row that already has a server_id
      if (effectiveOp === 'create' && localServerId) {
        console.log(
          `⏭️ SYNC PUSH: Skipping doctors create for ${localId} — already has server_id ${localServerId}`,
        )
        return { skip: true }
      }

      const payload: Record<string, unknown> = {
        mr_id: merged.mr_id,
        first_name: merged.first_name,
        last_name: merged.last_name,
        specialty: merged.specialty,
        hospital: merged.hospital,
        phone: merged.phone ?? null,
        email: merged.email ?? null,
        location: merged.location ?? null,
        notes: merged.notes ?? '',
        profile_image_url: this.normalizeDoctorProfileImageUrl(merged.profile_image_url),
      }

      if (effectiveOp === 'create') {
        // Stable client UUID so backend create is idempotent on retry
        payload.id = localId
        payload.client_id = localId
        payload.local_uuid = localId
      }

      if (effectiveOp === 'update' || effectiveOp === 'delete') {
        payload.server_id = localServerId
      }
      if (effectiveOp === 'delete') {
        payload.is_deleted = true
      }
      // Tell applyPushSuccess / result matching which action we actually sent
      ;(op as { operation_type: string }).operation_type = effectiveOp
      return payload
    }

    if (op.table_name === 'meetings') {
      const local = await LocalDatabaseService.getMeetingById(op.record_id)
      const merged = { ...(local || {}), ...data } as Record<string, unknown>
      const localId = String(local?.id || op.record_id)
      const meetingServerId = String(local?.server_id || '').trim()
      const doctorLocalId = String(merged.doctor_id || '')
      let doctorServerId = String(
        (await LocalDatabaseService.getDoctorById(doctorLocalId))?.server_id || '',
      ).trim()

      if (
        !doctorServerId &&
        doctorLocalId &&
        (op.operation_type === 'create' || op.operation_type === 'update')
      ) {
        doctorServerId = (await this.ensureDoctorHasServerId(doctorLocalId, userId)) || ''
      }

      if (op.operation_type === 'create' && meetingServerId) {
        console.log(
          `⏭️ SYNC PUSH: Skipping meetings create for ${localId} — already has server_id ${meetingServerId}`,
        )
        return { skip: true }
      }

      if (op.operation_type === 'delete') {
        return {
          server_id: meetingServerId || merged.server_id,
          is_deleted: true,
        }
      }

      if (!doctorServerId) {
        throw new Error(
          `Meeting ${localId}: doctor ${doctorLocalId || '(missing)'} has no server_id`,
        )
      }

      const payload: Record<string, unknown> = {
        mr_id: merged.mr_id,
        doctor_id: doctorServerId,
        brochure_id: merged.brochure_id || '',
        brochure_title: merged.brochure_title || '',
        title: merged.title,
        purpose: merged.purpose || '',
        scheduled_date: merged.scheduled_date,
        duration_minutes: merged.duration_minutes ?? 30,
        location: merged.location ?? null,
        notes: merged.notes ?? '',
        status: merged.status || 'scheduled',
      }

      if (op.operation_type === 'create') {
        payload.id = localId
        payload.client_id = localId
        payload.local_uuid = localId
      }

      if (op.operation_type === 'update') {
        payload.server_id = meetingServerId || merged.server_id
      }

      return payload
    }

    if (op.table_name === 'meeting_general_notes') {
      const local = await LocalDatabaseService.getMeetingGeneralNoteById(op.record_id)
      const merged = { ...(local || {}), ...data } as Record<string, unknown>
      const meeting = await LocalDatabaseService.getMeetingById(String(merged.meeting_id || ''))
      const meetingServerId = meeting?.server_id || merged.meeting_server_id

      if (op.operation_type === 'delete') {
        return { server_id: merged.server_id, is_deleted: true }
      }

      const payload: Record<string, unknown> = {
        meeting_id: meetingServerId,
        title: merged.title || '',
        notes: merged.notes || '',
      }
      if (op.operation_type === 'create') {
        const noteLocalId = String(local?.id || op.record_id)
        payload.id = noteLocalId
        payload.client_id = noteLocalId
        payload.local_uuid = noteLocalId
      }
      if (op.operation_type === 'update') {
        payload.server_id = merged.server_id
      }
      // If the parent meeting has no server id yet the push will fail and the
      // individual REST fallback returns false, so it stays queued for retry.
      return payload
    }

    if (
      op.table_name === 'meeting_notes' ||
      op.table_name === 'meeting_slide_notes' ||
      op.table_name === 'meeting_followups'
    ) {
      const enriched: Record<string, unknown> = { ...data }

      if (op.table_name === 'meeting_notes' || op.table_name === 'meeting_slide_notes') {
        const meetingLocalId = String(enriched.meeting_id || '')
        let meetingServerId = ''
        if (meetingLocalId) {
          const meeting = await LocalDatabaseService.getMeetingById(meetingLocalId)
          meetingServerId = String(meeting?.server_id || '').trim()
          if (
            !meetingServerId &&
            (op.operation_type === 'create' || op.operation_type === 'update')
          ) {
            meetingServerId =
              (await this.ensureMeetingHasServerId(meetingLocalId, userId)) || ''
          }
        }
        if (!meetingServerId && op.operation_type !== 'delete') {
          throw new Error(
            `Meeting note: parent meeting ${meetingLocalId || '(missing)'} has no server_id`,
          )
        }
        if (meetingServerId) {
          enriched.meeting_id = meetingServerId
        }
      }

      if (op.operation_type === 'create') {
        const localId = String(op.record_id)
        enriched.id = enriched.id || localId
        enriched.client_id = enriched.client_id || localId
        enriched.local_uuid = enriched.local_uuid || localId
      }
      return enriched
    }

    if (op.table_name === 'activity_logs') {
      const local = await LocalDatabaseService.getActivityLogById(op.record_id)
      const activityType = String(
        local?.activity_type || data.activity_type || data.action || '',
      ).trim()
      const description = String(
        local?.description || data.description || data.details || '',
      ).trim()
      const metadata = local?.metadata ?? data.metadata
      return this.buildActivityLogPushPayload(activityType, description, metadata)
    }

    return data
  }

  private static async enrichSavedBrochurePushData(op: any, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (op.table_name !== 'saved_brochures') {
      return data
    }

    const enriched: Record<string, unknown> = { ...data }
    const local = await LocalDatabaseService.getSavedBrochureRecordById(op.record_id)
    if (local) {
      enriched.mr_id = enriched.mr_id || local.mr_id
      enriched.server_id = enriched.server_id || local.server_id
      enriched.brochure_id = enriched.brochure_id || local.brochure_id
      enriched.brochure_title = enriched.brochure_title || local.brochure_title
      enriched.custom_title = enriched.custom_title || local.custom_title
      enriched.original_brochure_data = enriched.original_brochure_data || local.original_brochure_data
    }

    const resolvedBrochureId = resolveServerBrochureId(String(enriched.brochure_id || ''))

    if (op.operation_type === 'create') {
      return {
        mr_id: enriched.mr_id,
        brochure_id: resolvedBrochureId,
        brochure_title: enriched.brochure_title,
        custom_title: enriched.custom_title,
        original_brochure_data: enriched.original_brochure_data,
      }
    }

    if (op.operation_type === 'delete') {
      return {
        mr_id: enriched.mr_id,
        server_id: enriched.server_id,
        brochure_id: resolveServerBrochureId(String(enriched.brochure_id || '')),
        is_deleted: true,
      }
    }

    return {
      mr_id: enriched.mr_id,
      server_id: enriched.server_id,
      brochure_id: resolvedBrochureId,
      custom_title: enriched.custom_title,
    }
  }

  /**
   * Doctor/meeting deletes use direct REST first; doctors also need a sync-push
   * tombstone so the Doctor row is soft-deleted in Django admin.
   */
  private static shouldSyncDirectly(op: any): boolean {
    if (op.operation_type !== 'delete') {
      return false
    }
    return op.table_name === 'doctors' || op.table_name === 'meetings'
  }

  private static async processDirectSyncOps(
    ops: any[],
    userId: string,
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0
    let failed = 0
    const errors: string[] = []

    for (const op of ops) {
      let success = false
      switch (op.table_name) {
        case 'doctors':
          success = await this.syncDoctor(op, userId)
          break
        case 'meetings':
          success = await this.syncMeeting(op, userId)
          break
        default:
          break
      }

      if (success) {
        await LocalDatabaseService.markOperationCompleted(op.id)
        synced++
      } else {
        const errorMsg = `Failed to sync ${op.table_name} ${op.operation_type}`
        await LocalDatabaseService.markOperationFailed(op.id, errorMsg)
        failed++
        errors.push(errorMsg)
      }
    }

    return { synced, failed, errors }
  }

  private static async syncUpViaPush(ops: any[], userId: string): Promise<SyncResult | null> {
    const brochureSyncOps = ops.filter((op) => op.table_name === 'brochure_sync')
    const savedBrochureOps = ops.filter((op) => op.table_name === 'saved_brochures')
    const bulkOps = ops.filter((op) => op.table_name !== 'brochure_sync' && op.table_name !== 'saved_brochures')
    const directOps = bulkOps.filter((op) => this.shouldSyncDirectly(op))
    const pushBulkOps = bulkOps.filter((op) => !this.shouldSyncDirectly(op))

    if (bulkOps.length === 0 && brochureSyncOps.length === 0 && savedBrochureOps.length === 0) {
      return null
    }

    let synced = 0
    let failed = 0
    const errors: string[] = []

    if (directOps.length > 0) {
      console.log(`🔄 SYNC UP: Processing ${directOps.length} delete(s) via direct API`)
      const directResult = await this.processDirectSyncOps(directOps, userId)
      synced += directResult.synced
      failed += directResult.failed
      errors.push(...directResult.errors)
    }

    for (const op of savedBrochureOps) {
      const success = await this.syncSavedBrochure(op, userId)
      if (success) {
        await LocalDatabaseService.markOperationCompleted(op.id)
        synced++
      } else {
        await LocalDatabaseService.markOperationFailed(op.id, 'Failed to sync saved brochure')
        failed++
        errors.push(`Failed saved_brochures ${op.id}`)
      }
    }

    if (pushBulkOps.length > 0) {
      try {
        const operations = []
        for (const op of pushBulkOps) {
          const entity = this.mapTableToEntity(op.table_name)
          if (!entity) continue

          const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
          const pushData = await this.enrichPushData(op, data, userId)
          if ((pushData as { skip?: boolean }).skip) {
            await LocalDatabaseService.markOperationCompleted(op.id)
            synced++
            continue
          }
          operations.push({
            local_id: String(op.id),
            entity,
            action: op.operation_type,
            data: pushData,
          })
        }

        if (operations.length > 0) {
          const response = await apiClient.post<{
            results: Array<{
              id?: string
              local_id?: string
              success: boolean
              server_id?: string
              error?: string
            }>
          }>('/api/sync/push/', { operations })

          const matchedOpIds = new Set<string>()

          for (const result of response.results || []) {
            const resultKey = String(result.local_id || result.id || '')
            const op =
              pushBulkOps.find((item) => String(item.id) === resultKey) ||
              // Some backends echo entity local UUID instead of queue op id
              pushBulkOps.find((item) => String(item.record_id) === resultKey)
            if (!op) {
              console.warn('⚠️ SYNC UP: Push result did not match a queued op:', resultKey, result)
              continue
            }
            matchedOpIds.add(String(op.id))

            if (result.success) {
              try {
                await this.applyPushSuccess(op, result.server_id, userId)
                await LocalDatabaseService.markOperationCompleted(op.id)
                synced++
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Failed to apply sync result'
                await LocalDatabaseService.markOperationFailed(op.id, errorMsg)
                failed++
                errors.push(errorMsg)
              }
            } else if (
              op.table_name === 'saved_brochures' &&
              op.operation_type === 'delete' &&
              await this.applySavedBrochureDelete(op, userId)
            ) {
              await LocalDatabaseService.markOperationCompleted(op.id)
              synced++
            } else {
              const individualSuccess = await this.retryBulkOpIndividually(op, userId)
              if (individualSuccess) {
                await LocalDatabaseService.markOperationCompleted(op.id)
                synced++
              } else {
                await LocalDatabaseService.markOperationFailed(op.id, result.error || 'Sync failed')
                failed++
                errors.push(result.error || `Failed ${op.table_name}`)
              }
            }
          }

          // If backend omitted some results, retry unmatched ops individually so they
          // are either completed or marked failed — never left silently pending.
          for (const op of pushBulkOps) {
            if (matchedOpIds.has(String(op.id))) continue
            console.warn(`⚠️ SYNC UP: No push result for op ${op.id} (${op.table_name}) — retrying individually`)
            const individualSuccess = await this.retryBulkOpIndividually(op, userId)
            if (individualSuccess) {
              await LocalDatabaseService.markOperationCompleted(op.id)
              synced++
            } else {
              await LocalDatabaseService.markOperationFailed(op.id, 'No matching push result')
              failed++
              errors.push(`No push result for ${op.table_name} ${op.record_id}`)
            }
          }
        }
      } catch (error) {
        console.warn('Bulk sync push failed, falling back to individual sync:', error)
        return null
      }
    }

    for (const op of brochureSyncOps) {
      const success = await this.syncBrochureChanges(op, userId)
      if (success) {
        await LocalDatabaseService.markOperationCompleted(op.id)
        synced++
      } else {
        await LocalDatabaseService.markOperationFailed(op.id, 'Failed to sync brochure changes')
        failed++
        errors.push(`Failed brochure_sync ${op.id}`)
      }
    }

    if (bulkOps.length === 0 && brochureSyncOps.length > 0 && savedBrochureOps.length > 0) {
      return {
        success: failed === 0,
        synced,
        failed,
        message: `Synced: ${synced}, Failed: ${failed}`,
        errors: errors.length > 0 ? errors : undefined,
      }
    }

    if (bulkOps.length === 0 && brochureSyncOps.length > 0) {
      return {
        success: failed === 0,
        synced,
        failed,
        message: `Synced: ${synced}, Failed: ${failed}`,
        errors: errors.length > 0 ? errors : undefined,
      }
    }

    if (pushBulkOps.length > 0 || directOps.length > 0) {
      return {
        success: failed === 0,
        synced,
        failed,
        message: `Synced: ${synced}, Failed: ${failed}`,
        errors: errors.length > 0 ? errors : undefined,
      }
    }

    if (savedBrochureOps.length > 0) {
      return {
        success: failed === 0,
        synced,
        failed,
        message: `Synced: ${synced}, Failed: ${failed}`,
        errors: errors.length > 0 ? errors : undefined,
      }
    }

    return null
  }

  private static async applyPushSuccess(op: any, serverId: string | undefined, userId: string) {
    const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data

    switch (op.table_name) {
      case 'doctors':
        if (op.operation_type === 'delete') {
          await LocalDatabaseService.updateDoctor(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
        } else if (serverId) {
          await LocalDatabaseService.updateDoctor(op.record_id, { server_id: serverId, sync_status: 'synced', skipSyncQueue: true })
        }
        break
      case 'meetings':
        if (serverId) {
          await LocalDatabaseService.updateMeeting(op.record_id, {
            server_id: serverId,
            sync_status: 'synced',
            skipSyncQueue: true,
          })
        }
        break
      case 'meeting_notes':
      case 'meeting_slide_notes':
        if (serverId) {
          await LocalDatabaseService.updateMeetingNote(op.record_id, { server_id: serverId, sync_status: 'synced', skipSyncQueue: true })
        }
        break
      case 'meeting_general_notes':
        if (op.operation_type === 'delete') {
          await LocalDatabaseService.updateMeetingGeneralNote(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
        } else if (serverId) {
          await LocalDatabaseService.updateMeetingGeneralNote(op.record_id, { server_id: serverId, sync_status: 'synced', skipSyncQueue: true })
        }
        break
      case 'meeting_followups':
        if (serverId) {
          await LocalDatabaseService.updateMeetingFollowUp(op.record_id, { server_id: serverId, sync_status: 'synced', skipSyncQueue: true })
        }
        break
      case 'saved_brochures':
        if (op.operation_type === 'delete') {
          await LocalDatabaseService.updateSavedBrochure(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
        } else if (serverId) {
          await LocalDatabaseService.updateSavedBrochure(op.record_id, { server_id: serverId, sync_status: 'synced', skipSyncQueue: true })
        }
        break
      case 'activity_logs':
        await LocalDatabaseService.markActivityLogSynced(op.record_id, serverId)
        break
      default:
        break
    }

    if (op.table_name === 'doctors' && op.operation_type === 'update') {
      await LocalDatabaseService.updateDoctor(op.record_id, { sync_status: 'synced', skipSyncQueue: true })
    }
  }

  private static async syncDownViaPull(userId: string): Promise<SyncResult | null> {
    try {
      const since =
        (await AsyncStorage.getItem(this.LAST_SYNC_KEY)) || '1970-01-01T00:00:00.000Z'

      const data = await apiClient.get<{
        doctors: any[]
        meetings: any[]
        meeting_slide_notes: any[]
        meeting_notes: any[]
        meeting_general_notes: any[]
        meeting_followups: any[]
        saved_brochures: any[]
        brochure_sync: any[]
        activity_logs: any[]
        sync_timestamp: string
      }>('/api/sync/pull/', { query: { since } })

      console.log(
        `⬇️ SYNC PULL: received doctors=${data.doctors?.length || 0} meetings=${data.meetings?.length || 0} ` +
          `slide_notes=${data.meeting_slide_notes?.length || 0} general_notes=${(data.meeting_general_notes?.length || 0) + (data.meeting_notes?.length || 0)} ` +
          `followups=${data.meeting_followups?.length || 0} saved_brochures=${data.saved_brochures?.length || 0} ` +
          `brochure_sync=${data.brochure_sync?.length || 0} activity_logs=${data.activity_logs?.length || 0}`,
      )

      let synced = 0
      let failed = 0
      const errors: string[] = []

      for (const doctor of data.doctors || []) {
        if (doctor.is_deleted) continue
        try {
          await LocalDatabaseService.upsertDoctor({
            id: `doctor_${doctor.id}`,
            server_id: doctor.id,
            mr_id: userId,
            first_name: doctor.first_name,
            last_name: doctor.last_name,
            specialty: doctor.specialty,
            hospital: doctor.hospital,
            phone: doctor.phone,
            email: doctor.email,
            location: doctor.location,
            notes: doctor.notes ?? '',
            profile_image_url: doctor.profile_image_url
              ? resolveMediaUrl(doctor.profile_image_url)
              : doctor.profile_image_url,
            created_at: doctor.created_at,
            updated_at: doctor.updated_at || doctor.created_at,
            sync_status: 'synced',
            is_deleted: false,
          })
          synced++
        } catch (error) {
          failed++
          errors.push(`Doctor ${doctor.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      for (const meeting of data.meetings || []) {
        if (meeting.is_deleted) continue
        try {
          const doctor = await LocalDatabaseService.getDoctorByServerId(meeting.doctor_id)
          if (!doctor) {
            failed++
            continue
          }
          await LocalDatabaseService.upsertMeeting({
            id: `meeting_${meeting.id}`,
            server_id: meeting.id,
            mr_id: userId,
            doctor_id: doctor.id,
            doctor_server_id: meeting.doctor_id,
            brochure_id: meeting.brochure_id || null,
            title: meeting.title,
            scheduled_date: meeting.scheduled_date,
            duration_minutes: meeting.duration_minutes || 30,
            status: meeting.status,
            location: meeting.location || meeting.hospital || null,
            purpose: meeting.purpose || null,
            notes: meeting.notes || null,
            follow_up_required: meeting.follow_up_required || false,
            follow_up_date: meeting.follow_up_date || null,
            follow_up_time: meeting.follow_up_time || null,
            follow_up_notes: meeting.follow_up_notes || null,
            created_at: meeting.created_at,
            updated_at: meeting.updated_at || meeting.created_at,
            sync_status: 'synced',
            is_deleted: false,
          })
          synced++
        } catch (error) {
          failed++
          errors.push(`Meeting ${meeting.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      for (const savedBrochure of data.saved_brochures || []) {
        try {
          const canonicalBrochureId = resolveServerBrochureId(String(savedBrochure.brochure_id || ''))
          if (savedBrochure.is_deleted) {
            await LocalDatabaseService.applyServerSavedBrochureDeletion(
              userId,
              String(savedBrochure.id || ''),
              canonicalBrochureId,
            )
            synced++
            continue
          }

          const serverSavedId = String(savedBrochure.id || '')
          if (!serverSavedId) {
            console.warn('⚠️ SYNC PULL: Saved brochure missing server id — skipped')
            continue
          }

          // Each saved copy must use its own storage folder (serverSavedId), not the
          // shared source brochure id — otherwise edits to one copy mutate all copies.
          await LocalDatabaseService.upsertSavedBrochure({
            id: serverSavedId,
            server_id: serverSavedId,
            storage_id: serverSavedId,
            mr_id: userId,
            brochure_id: canonicalBrochureId,
            brochure_title: savedBrochure.brochure_title,
            custom_title: savedBrochure.custom_title,
            original_brochure_data: JSON.stringify(savedBrochure.original_brochure_data || {}),
            saved_at: savedBrochure.saved_at || savedBrochure.created_at,
            last_accessed: savedBrochure.last_accessed || savedBrochure.saved_at,
            created_at: savedBrochure.saved_at || savedBrochure.created_at,
            version: 1,
            sync_status: 'synced',
            is_deleted: false,
          })
          synced++
        } catch (error) {
          failed++
          errors.push(`Saved brochure ${savedBrochure.brochure_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      for (const followUp of data.meeting_followups || []) {
        if (followUp.is_deleted) continue
        try {
          const meeting = await LocalDatabaseService.getMeetingByServerId(followUp.meeting_id)
          if (!meeting) {
            failed++
            continue
          }
          await LocalDatabaseService.upsertMeetingFollowUp({
            id: `followup_${followUp.id}`,
            server_id: followUp.id,
            meeting_id: meeting.id,
            meeting_server_id: followUp.meeting_id,
            follow_up_date: followUp.follow_up_date,
            follow_up_time: followUp.follow_up_time,
            follow_up_notes: followUp.follow_up_notes || null,
            status: followUp.status || 'scheduled',
            sequence_number: followUp.sequence_number || 1,
            created_at: followUp.created_at,
            updated_at: followUp.updated_at || followUp.created_at,
            sync_status: 'synced',
            is_deleted: false,
          })
          synced++
        } catch (error) {
          failed++
          errors.push(`Follow-up ${followUp.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      for (const note of data.meeting_slide_notes || []) {
        if (note.is_deleted) continue
        try {
          const meeting = await LocalDatabaseService.getMeetingByServerId(note.meeting_id)
          if (!meeting) {
            failed++
            continue
          }
          await LocalDatabaseService.upsertMeetingNote({
            id: `note_${note.id}`,
            server_id: note.id,
            meeting_id: meeting.id,
            meeting_server_id: note.meeting_id,
            slide_id: note.slide_id,
            slide_title: note.slide_title,
            slide_order: note.slide_order ?? 0,
            brochure_id: note.brochure_id || meeting.brochure_id || '',
            brochure_title: note.brochure_title || '',
            note_text: note.note_text,
            slide_image_uri: note.slide_image_uri,
            follow_up_id: note.follow_up_id,
            created_at: note.created_at,
            updated_at: note.updated_at || note.created_at,
            version: 1,
            sync_status: 'synced',
            is_deleted: false,
          })
          synced++
        } catch (error) {
          failed++
          errors.push(`Note ${note.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // General notes are returned by the backend under `meeting_notes`
      // (and/or `meeting_general_notes`). Support both keys.
      const generalNotes = [
        ...(data.meeting_general_notes || []),
        ...(data.meeting_notes || []),
      ]
      for (const gnote of generalNotes) {
        if (gnote.is_deleted) continue
        try {
          const meeting = await LocalDatabaseService.getMeetingByServerId(gnote.meeting_id)
          if (!meeting) {
            failed++
            continue
          }
          await LocalDatabaseService.upsertMeetingGeneralNote({
            id: `gnote_${gnote.note_id || gnote.id}`,
            server_id: String(gnote.note_id || gnote.id),
            meeting_id: meeting.id,
            meeting_server_id: gnote.meeting_id,
            title: gnote.title || '',
            notes: gnote.notes || gnote.note_text || '',
            created_at: gnote.created_at,
            updated_at: gnote.updated_at || gnote.created_at,
            sync_status: 'synced',
            is_deleted: false,
          })
          synced++
        } catch (error) {
          failed++
          errors.push(`General note ${gnote.note_id || gnote.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // Per-copy brochure edits (custom brochure content). Without this the
      // saved custom brochures ("33"/"66") open empty after a fresh install.
      for (const bsync of data.brochure_sync || []) {
        try {
          if (bsync.is_deleted) continue
          const bdata = bsync.brochure_data
          await LocalDatabaseService.upsertBrochureSync({
            id: String(bsync.id || bsync.server_id),
            server_id: String(bsync.server_id || bsync.id),
            mr_id: userId,
            brochure_id: resolveServerBrochureId(String(bsync.brochure_id || '')),
            brochure_title: bsync.brochure_title,
            brochure_data:
              typeof bdata === 'string' ? bdata : JSON.stringify(bdata || {}),
            last_modified: bsync.last_modified || bsync.updated_at,
            created_at: bsync.created_at,
            version: bsync.version || 1,
            sync_status: 'synced',
            is_deleted: false,
          })
          synced++
        } catch (error) {
          failed++
          errors.push(`Brochure sync ${bsync.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // Activity logs — populate the dashboard history.
      for (const alog of data.activity_logs || []) {
        try {
          if (alog.is_deleted) continue
          // Backend note: the meaningful field is `activity_type` (`action` is a
          // legacy column that is always empty). Likewise `description` is the
          // human-readable text; `details` is an empty {} object on all rows.
          await LocalDatabaseService.upsertActivityLog({
            id: `activity_${alog.id}`,
            server_id: String(alog.id),
            user_id: alog.user_id || userId,
            mr_id: userId,
            activity_type: alog.activity_type || alog.action || '',
            description:
              alog.description ||
              (typeof alog.details === 'string' ? alog.details : '') ||
              '',
            metadata:
              typeof alog.metadata === 'string'
                ? alog.metadata
                : alog.metadata
                  ? JSON.stringify(alog.metadata)
                  : undefined,
            created_at: alog.created_at || alog.timestamp,
            version: 1,
            sync_status: 'synced',
            is_deleted: false,
          })
          synced++
        } catch (error) {
          failed++
          errors.push(`Activity log ${alog.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      try {
        const brochuresResult = await MRService.getAssignedBrochures(userId)
        const availableBrochures = brochuresResult.success ? brochuresResult.data || [] : []
        if (brochuresResult.success) {
          await LocalDatabaseService.syncBrochuresFromServer(availableBrochures)
          const { OfflineBrochureService } = await import('./offlineBrochureService')
          await OfflineBrochureService.cacheBrochures(userId, availableBrochures)
        }

        // Pre-download the source ZIP for every brochure referenced by a saved
        // copy so the slide images are on-device and viewable OFFLINE right after
        // first login (instead of being lazily fetched on first view).
        const sourceIds = Array.from(
          new Set(
            (data.saved_brochures || [])
              .filter((sb: any) => !sb.is_deleted)
              .map((sb: any) => resolveServerBrochureId(String(sb.brochure_id || '')))
              .filter(Boolean),
          ),
        ) as string[]

        for (let i = 0; i < sourceIds.length; i++) {
          const srcId = sourceIds[i]
          try {
            const dir = `${FileSystem.documentDirectory}brochures/${srcId}/`
            const dataJsonInfo = await FileSystem.getInfoAsync(`${dir}brochure_data.json`)
            const slidesInfo = await FileSystem.getInfoAsync(`${dir}slides`)
            if (dataJsonInfo.exists && slidesInfo.exists) {
              continue // already downloaded — skip
            }

            const avail = availableBrochures.find(
              (b: any) => (b.brochure_id || b.id) === srcId,
            ) as any
            const fileUrl = avail?.file_url
            if (!fileUrl) continue

            this.reportProgress(
              'Downloading brochures',
              `Downloading brochure ${i + 1} of ${sourceIds.length} for offline use...`,
              90,
              i + 1,
              sourceIds.length,
            )

            await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
            const zipPath = `${dir}temp.zip`
            const dl = await FileStorageService.downloadFile(fileUrl, zipPath)
            if (dl.success) {
              await BrochureManagementService.processZipFile(
                srcId,
                zipPath,
                avail.title || avail.brochure_title || 'Brochure',
              )
              console.log(`⬇️ SYNC PULL: Pre-downloaded brochure ${srcId} for offline use`)
            } else {
              console.warn(`⚠️ SYNC PULL: Brochure ${srcId} ZIP download failed:`, dl.error)
            }
          } catch (err) {
            console.warn(`⚠️ SYNC PULL: Failed to pre-download brochure ${srcId}:`, err)
          }
        }

        // Clone source ZIP content into each saved copy's independent storage folder
        for (const sb of data.saved_brochures || []) {
          if (sb.is_deleted) continue
          const serverSavedId = String(sb.id || '')
          const canonicalBrochureId = resolveServerBrochureId(String(sb.brochure_id || ''))
          if (!serverSavedId || !canonicalBrochureId) continue
          try {
            await BrochureManagementService.ensureIndependentSavedBrochureStorage({
              id: serverSavedId,
              server_id: serverSavedId,
              brochure_id: canonicalBrochureId,
              storage_id: serverSavedId,
            })
          } catch (migrateErr) {
            console.warn(
              `⚠️ SYNC PULL: Could not ensure independent storage for ${serverSavedId}:`,
              migrateErr,
            )
          }
        }
      } catch (error) {
        console.warn('⚠️ SYNC PULL: Failed to refresh available brochures:', error)
      }

      if (data.sync_timestamp) {
        await AsyncStorage.setItem(this.LAST_SYNC_KEY, data.sync_timestamp)
      }

      console.log(`⬇️ SYNC PULL: persisted synced=${synced} failed=${failed}`)
      this.reportProgress('Complete', `Downloaded: ${synced}, Failed: ${failed}`, 100)
      return {
        success: failed === 0,
        synced,
        failed,
        message: `Downloaded: ${synced}, Failed: ${failed}`,
        errors: errors.length > 0 ? errors : undefined,
      }
    } catch (error) {
      console.warn('Bulk sync pull failed, falling back to individual download:', error)
      return null
    }
  }
}

