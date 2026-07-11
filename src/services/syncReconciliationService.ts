import { LocalDatabaseService, LocalSavedBrochure } from './localDatabaseService'
import { MRService, MRAssignedDoctor } from './MRService'
import { NetworkService } from './networkService'

export interface BackupGapStats {
  saved_brochures: number
  doctors: number
  meetings: number
  meeting_followups: number
  meeting_notes: number
  brochure_sync: number
  activity_logs: number
  doctor_photos: number
  queue_pending: number
  /** Local records or queue items that still need upload */
  total: number
}

export interface ReconcileResult {
  success: boolean
  queued: number
  clearedStaleServerIds: number
  message: string
  errors: string[]
}

/**
 * Scans local MR data against server state and queues missing/stale records for sync-up.
 * See docs/BACKEND_MR_SYNC_REQUIREMENTS.md
 */
export class SyncReconciliationService {
  static async getBackupGapStats(mrId: string): Promise<BackupGapStats> {
    await LocalDatabaseService.ensureReady()
    const gaps = await LocalDatabaseService.getBackupGapCounts(mrId)
    const queueStats = await LocalDatabaseService.getActionableSyncStats()

    const entityTotal =
      gaps.saved_brochures +
      gaps.doctors +
      gaps.meetings +
      gaps.meeting_followups +
      gaps.meeting_notes +
      gaps.brochure_sync +
      gaps.activity_logs +
      gaps.doctor_photos

    return {
      ...gaps,
      queue_pending: queueStats.pending,
      total: Math.max(entityTotal, queueStats.pending),
    }
  }

  static async reconcileLocalToServer(mrId: string): Promise<ReconcileResult> {
    const errors: string[] = []
    let queued = 0
    let clearedStaleServerIds = 0

    if (!(await NetworkService.isOnline())) {
      return {
        success: false,
        queued: 0,
        clearedStaleServerIds: 0,
        message: 'Device is offline — skipped server reconciliation',
        errors: ['offline'],
      }
    }

    try {
      const savedResult = await this.reconcileSavedBrochures(mrId)
      queued += savedResult.queued
      clearedStaleServerIds += savedResult.clearedStaleServerIds
      errors.push(...savedResult.errors)

      const doctorResult = await this.reconcileDoctors(mrId)
      queued += doctorResult.queued
      clearedStaleServerIds += doctorResult.clearedStaleServerIds
      errors.push(...doctorResult.errors)

      const meetingResult = await this.reconcileMeetings(mrId)
      queued += meetingResult.queued
      errors.push(...meetingResult.errors)

      const followUpResult = await this.reconcileMeetingFollowUps(mrId)
      queued += followUpResult.queued
      errors.push(...followUpResult.errors)

      const noteResult = await this.reconcileMeetingNotes(mrId)
      queued += noteResult.queued
      errors.push(...noteResult.errors)

      const brochureSyncResult = await this.reconcileBrochureSyncs(mrId)
      queued += brochureSyncResult.queued
      errors.push(...brochureSyncResult.errors)

      const activityResult = await this.reconcileActivityLogs(mrId)
      queued += activityResult.queued
      errors.push(...activityResult.errors)

      const photoResult = await this.reconcileDoctorPhotos(mrId)
      queued += photoResult.queued
      errors.push(...photoResult.errors)

      return {
        success: errors.length === 0,
        queued,
        clearedStaleServerIds,
        message:
          queued > 0
            ? `Reconciliation queued ${queued} operation(s)`
            : 'Local records match server (metadata)',
        errors,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reconciliation failed'
      return {
        success: false,
        queued,
        clearedStaleServerIds,
        message,
        errors: [...errors, message],
      }
    }
  }

  private static async reconcileSavedBrochures(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    let clearedStaleServerIds = 0
    const errors: string[] = []

    const localCopies = await LocalDatabaseService.getSavedBrochures(mrId)
    if (localCopies.length === 0) {
      return { queued, clearedStaleServerIds, errors }
    }

    const serverList = await MRService.getSavedBrochuresForMr(mrId)
    if (!serverList.success) {
      errors.push(`saved_brochures: ${serverList.error || 'Failed to fetch server list'}`)
      return { queued, clearedStaleServerIds, errors }
    }

    const serverById = new Map<string, { id: string; custom_title?: string }>()
    for (const row of (serverList.data || []) as Array<{ id: string; custom_title?: string }>) {
      if (row?.id) {
        serverById.set(String(row.id), row)
      }
    }

    console.log(
      `🔄 RECONCILE saved_brochures: local=${localCopies.length} server=${serverById.size} (matched by server id, not brochure_id)`,
    )

    for (const local of localCopies) {
      try {
        const action = await this.resolveSavedBrochureAction(local, serverById)
        if (action.clearServerId) {
          await LocalDatabaseService.updateSavedBrochure(local.id, {
            server_id: null,
            skipSyncQueue: true,
          })
          clearedStaleServerIds++
        }

        if (!action.operation) {
          continue
        }

        const fresh = await LocalDatabaseService.getSavedBrochureById(local.id)
        if (!fresh) continue

        await LocalDatabaseService.addToSyncQueue(
          action.operation,
          'saved_brochures',
          fresh.id,
          fresh,
        )
        await LocalDatabaseService.updateSavedBrochure(fresh.id, {
          sync_status: 'pending',
          skipSyncQueue: true,
        })
        queued++
        console.log(
          `🔄 RECONCILE: Queued saved_brochures ${action.operation} for ${fresh.id} (${fresh.custom_title})`,
        )
      } catch (error) {
        errors.push(
          `saved_brochure ${local.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    }

    return { queued, clearedStaleServerIds, errors }
  }

  private static async resolveSavedBrochureAction(
    local: LocalSavedBrochure,
    serverById: Map<string, { id: string; custom_title?: string }>,
  ): Promise<{ operation?: 'create' | 'update'; clearServerId?: boolean }> {
    if (local.sync_status === 'pending' || local.sync_status === 'error') {
      const op = local.server_id ? 'update' : 'create'
      return { operation: op }
    }

    if (!local.server_id) {
      return { operation: 'create' }
    }

    const serverRow = serverById.get(String(local.server_id))
    if (!serverRow) {
      return { operation: 'create', clearServerId: true }
    }

    const localTitle = (local.custom_title || local.brochure_title || '').trim()
    const serverTitle = (serverRow.custom_title || '').trim()
    if (localTitle && serverTitle && localTitle !== serverTitle) {
      return { operation: 'update' }
    }

    return {}
  }

  private static async reconcileDoctors(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    return this.reconcileServerBackedRecords({
      entity: 'doctors',
      mrId,
      fetchServerIds: async () => {
        const result = await MRService.getDoctors(mrId)
        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to fetch doctors from server')
        }
        return new Set(
          (result.data as MRAssignedDoctor[])
            .map((d) => String(d.doctor_id || ''))
            .filter(Boolean),
        )
      },
      loadLocal: () => LocalDatabaseService.getDoctors(mrId),
    })
  }

  private static async reconcileMeetings(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    return this.reconcileServerBackedRecords({
      entity: 'meetings',
      mrId,
      fetchServerIds: async () => {
        const result = await MRService.getMeetings(mrId)
        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to fetch meetings from server')
        }
        return new Set(
          (result.data as Array<{ id?: string; meeting_id?: string }>)
            .map((m) => String(m.id || m.meeting_id || ''))
            .filter(Boolean),
        )
      },
      loadLocal: () => LocalDatabaseService.getMeetings(mrId),
    })
  }

  private static async reconcileMeetingFollowUps(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    const errors: string[] = []
    const meetings = await LocalDatabaseService.getMeetings(mrId)

    for (const meeting of meetings) {
      const followUps = await LocalDatabaseService.getMeetingFollowUps(meeting.id)
      for (const followUp of followUps) {
        if (followUp.is_deleted) continue
        const op = await this.localRecordNeedsQueue(followUp.sync_status, followUp.server_id)
        if (!op) continue

        if (op === 'create' && !meeting.server_id) {
          continue
        }

        try {
          await LocalDatabaseService.addToSyncQueue(op, 'meeting_followups', followUp.id, followUp)
          await LocalDatabaseService.updateMeetingFollowUp(
            followUp.id,
            { sync_status: 'pending' },
            true,
          )
          queued++
        } catch (error) {
          errors.push(
            `meeting_followup ${followUp.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
          )
        }
      }
    }

    return { queued, clearedStaleServerIds: 0, errors }
  }

  private static async reconcileMeetingNotes(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    const errors: string[] = []
    const meetings = await LocalDatabaseService.getMeetings(mrId)

    for (const meeting of meetings) {
      const notes = await LocalDatabaseService.getMeetingNotes(meeting.id)
      for (const note of notes) {
        if (note.is_deleted) continue
        const op = await this.localRecordNeedsQueue(note.sync_status, note.server_id)
        if (!op) continue
        if (op === 'create' && !meeting.server_id) continue

        try {
          await LocalDatabaseService.addToSyncQueue(op, 'meeting_notes', note.id, note)
          await LocalDatabaseService.updateMeetingSlideNote(
            note.id,
            { sync_status: 'pending' },
            true,
          )
          queued++
        } catch (error) {
          errors.push(`meeting_note ${note.id}: ${error instanceof Error ? error.message : 'Unknown'}`)
        }
      }
    }

    return { queued, clearedStaleServerIds: 0, errors }
  }

  private static async reconcileBrochureSyncs(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    const errors: string[] = []
    const syncs = await LocalDatabaseService.getBrochureSyncs(mrId)

    for (const sync of syncs) {
      if (sync.is_deleted) continue
      const op = await this.localRecordNeedsQueue(sync.sync_status, sync.server_id)
      if (!op) continue

      try {
        await LocalDatabaseService.addToSyncQueue(op, 'brochure_sync', sync.id, sync)
        await LocalDatabaseService.updateBrochureSync(sync.id, { sync_status: 'pending' }, true)
        queued++
      } catch (error) {
        errors.push(`brochure_sync ${sync.id}: ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }

    return { queued, clearedStaleServerIds: 0, errors }
  }

  private static async reconcileActivityLogs(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    let clearedStaleServerIds = 0
    const errors: string[] = []
    const logs = await LocalDatabaseService.getActivityLogs(mrId)

    if (logs.length === 0) {
      return { queued, clearedStaleServerIds, errors }
    }

    const serverList = await MRService.listActivityLogIds(mrId)
    if (!serverList.success) {
      errors.push(`activity_logs: ${serverList.error || 'Failed to fetch server list'}`)
      return { queued, clearedStaleServerIds, errors }
    }

    const serverIds = new Set(serverList.data || [])
    console.log(
      `🔄 RECONCILE activity_logs: local=${logs.length} server=${serverIds.size}`,
    )

    for (const log of logs) {
      if (log.is_deleted) continue

      const activityType = String(log.activity_type || '').trim()
      const description = String(log.description || '').trim()
      if (!activityType && !description) continue

      let needsCreate = false
      let clearServerId = false

      if (log.sync_status === 'pending' || log.sync_status === 'error') {
        needsCreate = true
      } else if (!log.server_id) {
        needsCreate = true
      } else if (!serverIds.has(String(log.server_id))) {
        // Admin deleted on server, or stale local server_id — re-backup from local.
        needsCreate = true
        clearServerId = true
      }

      if (!needsCreate) continue

      try {
        if (clearServerId) {
          await LocalDatabaseService.resetActivityLogServerSync(log.id)
          clearedStaleServerIds++
        }

        await LocalDatabaseService.addToSyncQueue('create', 'activity_logs', log.id, {
          ...log,
          activity_type: activityType,
          description,
          action: activityType,
          details: description,
          server_id: null,
        })
        queued++
        console.log(`🔄 RECONCILE: Queued activity_logs create for ${log.id}`)
      } catch (error) {
        errors.push(`activity_log ${log.id}: ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }

    return { queued, clearedStaleServerIds, errors }
  }

  private static async reconcileDoctorPhotos(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    const errors: string[] = []

    try {
      const photos = await LocalDatabaseService.getDoctorPhotos(mrId)
      for (const photo of photos) {
        if (photo.sync_status !== 'pending' && photo.sync_status !== 'error') continue
        // Phase 2 will upload binaries; Phase 0 counts gaps only.
        console.log(`🔄 RECONCILE: Doctor photo ${photo.id} pending upload (Phase 2)`)
      }
    } catch (error) {
      errors.push(`doctor_photos: ${error instanceof Error ? error.message : 'Unknown'}`)
    }

    return { queued, clearedStaleServerIds: 0, errors }
  }

  private static async reconcileServerBackedRecords<T extends {
    id: string
    server_id?: string | null
    sync_status: string
    is_deleted?: boolean
  }>(options: {
    entity: 'doctors' | 'meetings'
    mrId: string
    fetchServerIds: () => Promise<Set<string>>
    loadLocal: () => Promise<T[]>
  }): Promise<{ queued: number; clearedStaleServerIds: number; errors: string[] }> {
    let queued = 0
    let clearedStaleServerIds = 0
    const errors: string[] = []

    let serverIds: Set<string>
    try {
      serverIds = await options.fetchServerIds()
    } catch (error) {
      errors.push(
        `${options.entity}: ${error instanceof Error ? error.message : 'Server fetch failed'}`,
      )
      return { queued, clearedStaleServerIds, errors }
    }

    const locals = await options.loadLocal()
    for (const local of locals) {
      if (local.is_deleted) continue

      try {
        let operation: 'create' | 'update' | undefined
        let clearServerId = false

        if (local.sync_status === 'pending' || local.sync_status === 'error') {
          operation = local.server_id ? 'update' : 'create'
        } else if (!local.server_id) {
          operation = 'create'
        } else if (!serverIds.has(String(local.server_id))) {
          operation = 'create'
          clearServerId = true
        }

        if (!operation) continue

        if (clearServerId) {
          if (options.entity === 'doctors') {
            await LocalDatabaseService.updateDoctor(local.id, { server_id: null }, true)
          } else {
            await LocalDatabaseService.updateMeeting(local.id, { server_id: null }, true)
          }
          clearedStaleServerIds++
        }

        const tableName = options.entity
        const updateFn =
          options.entity === 'doctors'
            ? (id: string) => LocalDatabaseService.updateDoctor(id, { sync_status: 'pending' }, true)
            : (id: string) => LocalDatabaseService.updateMeeting(id, { sync_status: 'pending' }, true)

        await LocalDatabaseService.addToSyncQueue(operation, tableName, local.id, local)
        await updateFn(local.id)
        queued++
        console.log(`🔄 RECONCILE: Queued ${tableName} ${operation} for ${local.id}`)
      } catch (error) {
        errors.push(
          `${options.entity} ${local.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
        )
      }
    }

    return { queued, clearedStaleServerIds, errors }
  }

  private static async localRecordNeedsQueue(
    syncStatus: string,
    serverId?: string | null,
  ): Promise<'create' | 'update' | null> {
    if (syncStatus === 'pending' || syncStatus === 'error') {
      return serverId ? 'update' : 'create'
    }
    if (!serverId) {
      return 'create'
    }
    return null
  }
}
