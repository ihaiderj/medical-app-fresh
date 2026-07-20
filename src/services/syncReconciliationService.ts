import { LocalDatabaseService, LocalSavedBrochure } from './localDatabaseService'
import { MRService, MRAssignedDoctor } from './MRService'
import { NetworkService } from './networkService'
import { BrochureManagementService } from './brochureManagementService'
import { getSavedBrochureStorageId } from '../utils/brochureTypeUtils'

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
  /**
   * If a living server doctor matches local by name+hospital, link local to that
   * server_id instead of creating a duplicate. Returns adopted server id or null.
   */
  static async tryAdoptMatchingDoctor(
    localDoctorId: string,
    mrId: string,
  ): Promise<string | null> {
    const local = await LocalDatabaseService.getDoctorRecordById(localDoctorId)
    if (!local || local.is_deleted) {
      return null
    }
    if (local.server_id) {
      return String(local.server_id)
    }

    const listResult = await MRService.getDoctors(mrId)
    if (!listResult.success || !listResult.data?.length) {
      return null
    }

    const locals = await LocalDatabaseService.getDoctors(mrId)
    const claimed = new Set(
      locals
        .filter((d) => !d.is_deleted && d.server_id && d.id !== localDoctorId)
        .map((d) => String(d.server_id)),
    )

    const match = this.findMatchingServerDoctor(local, listResult.data, claimed)
    if (!match) {
      return null
    }

    const matchId = String(match.doctor_id || (match as any).id || '').trim()
    if (!matchId) {
      return null
    }

    await LocalDatabaseService.updateDoctor(localDoctorId, {
      server_id: matchId,
      sync_status: 'synced',
      skipSyncQueue: true,
    })
    console.log(
      `🔗 SYNC DOCTOR: Adopted existing server doctor ${matchId} for local ${localDoctorId} (name+hospital)`,
    )
    return matchId
  }

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
          await LocalDatabaseService.resetSavedBrochureServerSync(local.id)
          clearedStaleServerIds++
          console.log(
            `🔄 RECONCILE: Cleared stale saved_brochure server_id for ${local.id} (${local.custom_title}) — will create as new`,
          )
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
    const serverId = local.server_id ? String(local.server_id) : ''
    const serverRow = serverId ? serverById.get(serverId) : undefined

    // Never keep a server_id that is absent on the current backend (e.g. Render
    // after migrating off local Django). Clear it and treat as a fresh create.
    if (serverId && !serverRow) {
      return { operation: 'create', clearServerId: true }
    }

    if (local.sync_status === 'pending' || local.sync_status === 'error') {
      return { operation: serverRow ? 'update' : 'create' }
    }

    if (!serverId) {
      return { operation: 'create' }
    }

    const localTitle = (local.custom_title || local.brochure_title || '').trim()
    const serverTitle = (serverRow?.custom_title || '').trim()
    if (localTitle && serverTitle && localTitle !== serverTitle) {
      return { operation: 'update' }
    }

    return {}
  }

  private static doctorMatchKey(
    firstName?: string | null,
    lastName?: string | null,
    hospital?: string | null,
  ): string {
    const norm = (value: unknown) =>
      String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    return `${norm(firstName)}|${norm(lastName)}|${norm(hospital)}`
  }

  private static findMatchingServerDoctor(
    local: {
      first_name?: string
      last_name?: string
      hospital?: string
    },
    serverDoctors: MRAssignedDoctor[],
    adoptedServerIds: Set<string>,
  ): MRAssignedDoctor | null {
    const localKey = this.doctorMatchKey(local.first_name, local.last_name, local.hospital)
    if (!localKey || localKey === '||') {
      return null
    }

    for (const server of serverDoctors) {
      const serverId = String(server.doctor_id || (server as any).id || '').trim()
      if (!serverId || adoptedServerIds.has(serverId)) continue
      const serverKey = this.doctorMatchKey(server.first_name, server.last_name, server.hospital)
      if (serverKey === localKey) {
        return server
      }
    }
    return null
  }

  private static async reconcileDoctors(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    let clearedStaleServerIds = 0
    const errors: string[] = []

    let serverDoctors: MRAssignedDoctor[] = []
    try {
      const listResult = await MRService.getDoctors(mrId)
      if (!listResult.success || !listResult.data) {
        throw new Error(listResult.error || 'Failed to fetch doctors from server')
      }
      serverDoctors = listResult.data
    } catch (error) {
      errors.push(`doctors: ${error instanceof Error ? error.message : 'Server fetch failed'}`)
      return { queued, clearedStaleServerIds, errors }
    }

    const serverById = new Map(
      serverDoctors
        .map((doctor) => {
          const id = String(doctor.doctor_id || (doctor as any).id || '').trim()
          return [id, doctor] as const
        })
        .filter(([id]) => !!id),
    )
    const serverIds = new Set(serverById.keys())
    const locals = await LocalDatabaseService.getDoctors(mrId)
    // Server ids already claimed by a local row with a valid link
    const adoptedServerIds = new Set<string>(
      locals
        .filter((d) => !d.is_deleted && d.server_id && serverIds.has(String(d.server_id)))
        .map((d) => String(d.server_id)),
    )

    console.log(
      `🔄 RECONCILE doctors: local=${locals.filter((doctor) => !doctor.is_deleted).length} server=${serverIds.size}`,
    )

    for (const local of locals) {
      if (local.is_deleted) continue

      try {
        let operation: 'create' | 'update' | undefined
        let clearServerId = false
        const localServerId = local.server_id ? String(local.server_id) : ''

        // Stale server_id (not on backend) must become create — check before pending/update.
        if (localServerId && !serverIds.has(localServerId)) {
          operation = 'create'
          clearServerId = true
        } else if (local.sync_status === 'pending' || local.sync_status === 'error') {
          operation = localServerId ? 'update' : 'create'
        } else if (!localServerId) {
          operation = 'create'
        } else {
          const serverDoctor = serverById.get(localServerId)
          if (serverDoctor && this.localDoctorDiffersFromServer(local, serverDoctor)) {
            operation = 'update'
          }
        }

        const alreadyQueued = await LocalDatabaseService.hasPendingSyncOperation('doctors', local.id)
        if (alreadyQueued && !operation) {
          operation = localServerId && serverIds.has(localServerId) ? 'update' : 'create'
          if (operation === 'create' && localServerId) {
            clearServerId = true
          }
        }

        if (!operation) continue

        // Before creating, adopt an existing server doctor matched by name + hospital.
        if (operation === 'create') {
          const match = this.findMatchingServerDoctor(local, serverDoctors, adoptedServerIds)
          if (match) {
            const matchId = String(match.doctor_id || (match as any).id || '').trim()
            if (matchId) {
              adoptedServerIds.add(matchId)
              if (clearServerId) {
                clearedStaleServerIds++
              }
              const needsUpdate = this.localDoctorDiffersFromServer(local, match)
              await LocalDatabaseService.updateDoctor(local.id, {
                server_id: matchId,
                sync_status: needsUpdate ? 'pending' : 'synced',
                skipSyncQueue: true,
              })
              console.log(
                `🔗 RECONCILE: Adopted existing server doctor ${matchId} for local ${local.id} (name+hospital, avoided duplicate)`,
              )
              if (needsUpdate) {
                await LocalDatabaseService.addToSyncQueue('update', 'doctors', local.id, {
                  ...local,
                  server_id: matchId,
                  notes: local.notes ?? '',
                })
                queued++
                console.log(`🔄 RECONCILE: Queued doctors update for ${local.id} after adopt`)
              }
              continue
            }
          }
        }

        if (clearServerId) {
          await LocalDatabaseService.resetDoctorServerSync(local.id)
          clearedStaleServerIds++
        }

        // Always re-queue so a prior "update" with a stale server_id is superseded.
        // Strip server_id on create — otherwise resolveQueueOperation turns it into update.
        await LocalDatabaseService.addToSyncQueue(operation, 'doctors', local.id, {
          ...local,
          server_id: operation === 'create' ? null : local.server_id,
          notes: local.notes ?? '',
        })
        if (!alreadyQueued || clearServerId) {
          queued++
        }
        console.log(`🔄 RECONCILE: Queued doctors ${operation} for ${local.id}`)

        await LocalDatabaseService.updateDoctor(local.id, {
          sync_status: 'pending',
          skipSyncQueue: true,
        })
      } catch (error) {
        errors.push(
          `doctors ${local.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
        )
      }
    }

    console.log(`🔄 RECONCILE doctors: queued=${queued} cleared=${clearedStaleServerIds}`)

    const deletedLocals = await LocalDatabaseService.getDeletedDoctorsWithServerId(mrId)
    for (const local of deletedLocals) {
      if (!local.server_id || !LocalDatabaseService.doctorDeleteNeedsServerTombstone(local)) {
        continue
      }

      try {
        const alreadyQueued = await LocalDatabaseService.hasPendingSyncOperation('doctors', local.id)
        if (!alreadyQueued) {
          await LocalDatabaseService.addToSyncQueue('delete', 'doctors', local.id, {
            ...local,
            notes: local.notes ?? '',
          })
          queued++
          console.log(
            `🔄 RECONCILE: Queued doctors delete for ${local.id} (server_id=${local.server_id})`,
          )
        }

        if (local.sync_status === 'synced' || local.sync_status === 'error') {
          await LocalDatabaseService.updateDoctor(local.id, {
            sync_status: 'pending',
            skipSyncQueue: true,
          })
        }
      } catch (error) {
        errors.push(
          `doctors delete ${local.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
        )
      }
    }

    return { queued, clearedStaleServerIds, errors }
  }

  private static localDoctorDiffersFromServer(
    local: {
      first_name?: string
      last_name?: string
      specialty?: string
      hospital?: string
      phone?: string | null
      email?: string | null
      location?: string | null
      notes?: string | null
    },
    server: MRAssignedDoctor,
  ): boolean {
    const norm = (value: unknown) => String(value ?? '').trim()

    return (
      norm(local.first_name) !== norm(server.first_name) ||
      norm(local.last_name) !== norm(server.last_name) ||
      norm(local.specialty) !== norm(server.specialty) ||
      norm(local.hospital) !== norm(server.hospital) ||
      norm(local.phone) !== norm(server.phone) ||
      norm(local.email) !== norm(server.email) ||
      norm(local.location) !== norm(server.location) ||
      norm(local.notes) !== norm(server.notes)
    )
  }

  private static async reconcileMeetings(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    const result = await this.reconcileServerBackedRecords({
      entity: 'meetings',
      mrId,
      fetchServerIds: async () => {
        const listResult = await MRService.getMeetings(mrId)
        if (!listResult.success || !listResult.data) {
          throw new Error(listResult.error || 'Failed to fetch meetings from server')
        }
        return new Set(
          (listResult.data as Array<{ id?: string; meeting_id?: string }>)
            .map((m) => String(m.id || m.meeting_id || ''))
            .filter(Boolean),
        )
      },
      loadLocal: () => LocalDatabaseService.getMeetings(mrId),
    })
    console.log(`🔄 RECONCILE meetings: queued=${result.queued} cleared=${result.clearedStaleServerIds}`)
    return result
  }

  private static async reconcileMeetingFollowUps(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    let clearedStaleServerIds = 0
    const errors: string[] = []

    const serverList = await MRService.listServerFollowUpIds(mrId)
    if (!serverList.success) {
      errors.push(`meeting_followups: ${serverList.error || 'Failed to fetch server list'}`)
      return { queued, clearedStaleServerIds, errors }
    }

    const serverIds = new Set(serverList.data || [])
    const meetings = await LocalDatabaseService.getMeetings(mrId)
    const localFollowUps = (
      await Promise.all(meetings.map((m) => LocalDatabaseService.getMeetingFollowUps(m.id)))
    ).flat()

    console.log(
      `🔄 RECONCILE meeting_followups: local=${localFollowUps.filter((f) => !f.is_deleted).length} server=${serverIds.size}`,
    )

    for (const meeting of meetings) {
      const followUps = await LocalDatabaseService.getMeetingFollowUps(meeting.id)

      // Fetch the meeting's server follow-ups once so we can adopt an existing
      // record (matched by date+time) instead of creating a duplicate on the server.
      let serverFollowUps: Array<{ id: string; key: string }> = []
      const adoptedServerIds = new Set<string>()
      if (meeting.server_id) {
        try {
          const res = await MRService.getMeetingFollowUps(String(meeting.server_id))
          if (res.success && Array.isArray(res.data)) {
            serverFollowUps = (res.data as Array<Record<string, unknown>>)
              .map((row) => {
                const id = String(row.follow_up_id || row.followup_id || row.id || '').trim()
                return { id, key: this.followUpKey(row.follow_up_date, row.follow_up_time) }
              })
              .filter((r) => r.id)
          }
        } catch {
          // Non-fatal: fall back to create-if-missing behaviour below.
        }
      }

      for (const followUp of followUps) {
        if (followUp.is_deleted) continue

        try {
          let operation: 'create' | 'update' | undefined
          let clearServerId = false

          if (followUp.sync_status === 'pending' || followUp.sync_status === 'error') {
            operation = followUp.server_id ? 'update' : 'create'
          } else if (!followUp.server_id) {
            operation = 'create'
          } else if (!serverIds.has(String(followUp.server_id))) {
            operation = 'create'
            clearServerId = true
          }

          if (!operation) continue
          if (operation === 'create' && !meeting.server_id) continue

          // Before creating a duplicate, try to adopt a matching server follow-up.
          if (operation === 'create') {
            const localKey = this.followUpKey(followUp.follow_up_date, followUp.follow_up_time)
            const match = serverFollowUps.find(
              (s) => s.key === localKey && !adoptedServerIds.has(s.id),
            )
            if (match) {
              adoptedServerIds.add(match.id)
              await LocalDatabaseService.updateMeetingFollowUp(followUp.id, {
                server_id: match.id,
                sync_status: 'synced',
                skipSyncQueue: true,
              })
              console.log(
                `🔗 RECONCILE: Adopted existing server follow-up ${match.id} for local ${followUp.id} (avoided duplicate)`,
              )
              continue
            }
          }

          if (clearServerId) {
            await LocalDatabaseService.resetMeetingFollowUpServerSync(followUp.id)
            clearedStaleServerIds++
          }

          await LocalDatabaseService.addToSyncQueue(operation, 'meeting_followups', followUp.id, {
            ...followUp,
            server_id: operation === 'create' ? null : followUp.server_id,
          })
          await LocalDatabaseService.updateMeetingFollowUp(followUp.id, {
            sync_status: 'pending',
            skipSyncQueue: true,
          })
          queued++
          console.log(`🔄 RECONCILE: Queued meeting_followups ${operation} for ${followUp.id}`)
        } catch (error) {
          errors.push(
            `meeting_followup ${followUp.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
          )
        }
      }
    }

    return { queued, clearedStaleServerIds, errors }
  }

  /** Normalized key for matching a follow-up by its date + time (HH:MM). */
  private static followUpKey(date: unknown, time: unknown): string {
    const d = String(date ?? '').trim()
    const t = String(time ?? '').trim().slice(0, 5)
    return `${d}|${t}`
  }

  /** Normalized key for matching a meeting note by its slide + text. */
  private static noteKey(slideId: unknown, noteText: unknown): string {
    const s = String(slideId ?? '').trim()
    const t = String(noteText ?? '').trim()
    return `${s}|${t}`
  }

  private static async reconcileMeetingNotes(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    let clearedStaleServerIds = 0
    const errors: string[] = []

    const serverList = await MRService.listServerMeetingNoteIds(mrId)
    if (!serverList.success) {
      errors.push(`meeting_notes: ${serverList.error || 'Failed to fetch server list'}`)
      return { queued, clearedStaleServerIds, errors }
    }

    const serverIds = new Set(serverList.data || [])
    const notes = await LocalDatabaseService.getMeetingNotesForMr(mrId)

    console.log(`🔄 RECONCILE meeting_notes: local=${notes.length} server=${serverIds.size}`)

    // Cache of server notes per meeting (server_id) so we can adopt existing
    // records (matched by slide + note text) instead of creating duplicates.
    const serverNotesCache = new Map<string, Array<{ id: string; key: string }>>()
    const adoptedNoteServerIds = new Set<string>()

    for (const note of notes) {
      if (note.is_deleted) continue

      try {
        const noteBrochureId = String(note.brochure_id || '').trim()
        if (noteBrochureId) {
          const brochureActive = await LocalDatabaseService.isMeetingNoteBrochureActive(
            noteBrochureId,
            note.brochure_title,
          )
          if (!brochureActive) {
            console.log(
              `🔄 RECONCILE: Soft-deleting orphan meeting note ${note.id} (brochure gone: ${noteBrochureId} / ${note.brochure_title || 'untitled'})`,
            )
            await LocalDatabaseService.deleteMeetingNote(note.id)
            continue
          }

          // Keep stored title aligned with the live saved copy (fixes stale "66" labels)
          const { brochureTitle: liveTitle } =
            await LocalDatabaseService.resolveNoteBrochure(noteBrochureId)
          if (liveTitle && liveTitle !== note.brochure_title) {
            await LocalDatabaseService.updateMeetingNote(note.id, {
              brochure_title: liveTitle,
              skipActivityLog: true,
            })
            note.brochure_title = liveTitle
            console.log(
              `🔄 RECONCILE: Refreshed note ${note.id} brochure_title → "${liveTitle}"`,
            )
          }
        }

        let operation: 'create' | 'update' | undefined
        let clearServerId = false
        const noteServerId = note.server_id ? String(note.server_id) : ''
        const noteOnServer = noteServerId ? serverIds.has(noteServerId) : false

        // Stale server_id from another backend → clear and recreate
        if (noteServerId && !noteOnServer) {
          operation = 'create'
          clearServerId = true
        } else if (note.sync_status === 'pending' || note.sync_status === 'error') {
          operation = noteOnServer ? 'update' : 'create'
        } else if (!noteServerId) {
          operation = 'create'
        }

        if (!operation) continue

        const meeting = await LocalDatabaseService.getMeetingById(note.meeting_id)
        if (operation === 'create' && (!meeting || !meeting.server_id)) continue

        // Before creating a duplicate, try to adopt a matching server note.
        if (operation === 'create' && meeting?.server_id) {
          const serverMeetingId = String(meeting.server_id)
          if (!serverNotesCache.has(serverMeetingId)) {
            let list: Array<{ id: string; key: string }> = []
            try {
              const res = await MRService.getMeetingDetails(serverMeetingId)
              const slideNotes = (res.success && res.data
                ? (res.data as { slide_notes?: Array<Record<string, unknown>> }).slide_notes
                : undefined) || []
              list = slideNotes
                .map((row) => {
                  const id = String(row.note_id || row.id || '').trim()
                  return { id, key: this.noteKey(row.slide_id, row.note_text) }
                })
                .filter((r) => r.id)
            } catch {
              // Non-fatal.
            }
            serverNotesCache.set(serverMeetingId, list)
          }

          const localKey = this.noteKey(note.slide_id, note.note_text)
          const match = (serverNotesCache.get(serverMeetingId) || []).find(
            (s) => s.key === localKey && !adoptedNoteServerIds.has(s.id),
          )
          if (match) {
            adoptedNoteServerIds.add(match.id)
            await LocalDatabaseService.updateMeetingNote(note.id, {
              server_id: match.id,
              sync_status: 'synced',
              skipSyncQueue: true,
            })
            console.log(
              `🔗 RECONCILE: Adopted existing server note ${match.id} for local ${note.id} (avoided duplicate)`,
            )
            continue
          }
        }

        if (clearServerId) {
          await LocalDatabaseService.resetMeetingNoteServerSync(note.id)
          clearedStaleServerIds++
          console.log(
            `🔄 RECONCILE: Cleared stale meeting_note server_id for ${note.id} — will create as new`,
          )
        }

        const freshNote = clearServerId
          ? { ...note, server_id: null as string | null, sync_status: 'pending' as const }
          : note
        await LocalDatabaseService.addToSyncQueue(
          operation,
          'meeting_notes',
          note.id,
          freshNote,
        )
        await LocalDatabaseService.updateMeetingNote(note.id, {
          sync_status: 'pending',
          skipSyncQueue: true,
        })
        queued++
        console.log(`🔄 RECONCILE: Queued meeting_notes ${operation} for ${note.id}`)
      } catch (error) {
        errors.push(`meeting_note ${note.id}: ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }

    return { queued, clearedStaleServerIds, errors }
  }

  private static async reconcileBrochureSyncs(mrId: string): Promise<{
    queued: number
    clearedStaleServerIds: number
    errors: string[]
  }> {
    let queued = 0
    const errors: string[] = []

    // Server brochure_sync rows are keyed by saved-brochure server_id.
    // After migration we often have saved rows on the server but no sync payload yet.
    const serverList = await MRService.getBrochureChangesForMr(mrId)
    const serverBrochureIds = new Set<string>()
    if (serverList.success && Array.isArray(serverList.data)) {
      for (const row of serverList.data as Array<Record<string, unknown>>) {
        const id = String(row.brochure_id || row.id || '').trim()
        if (id) serverBrochureIds.add(id)
      }
    }

    const savedCopies = await LocalDatabaseService.getSavedBrochures(mrId)
    for (const saved of savedCopies) {
      if (saved.is_deleted || !saved.server_id) continue
      const serverId = String(saved.server_id)
      if (serverBrochureIds.has(serverId)) continue

      try {
        const storageId = getSavedBrochureStorageId(saved)
        console.log(
          `🔄 RECONCILE brochure_sync: Saved ${saved.id} ("${saved.custom_title}") has server_id ${serverId} but no brochure_sync on server — queuing slides/groups`,
        )
        await BrochureManagementService.markBrochureAsModified(storageId, mrId, undefined, {
          savedBrochureId: saved.id,
          customTitle: saved.custom_title || saved.brochure_title,
        })
        queued++
      } catch (error) {
        errors.push(
          `brochure_sync for saved ${saved.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
        )
      }
    }

    const syncs = await LocalDatabaseService.getBrochureSyncs(mrId)
    for (const sync of syncs) {
      if (sync.is_deleted) continue
      const op = await this.localRecordNeedsQueue(sync.sync_status, sync.server_id)
      if (!op) continue

      try {
        const alreadyQueued = await LocalDatabaseService.hasPendingSyncOperation(
          'brochure_sync',
          sync.id,
        )
        if (alreadyQueued) continue

        await LocalDatabaseService.addToSyncQueue(op, 'brochure_sync', sync.id, sync)
        await LocalDatabaseService.updateBrochureSync(sync.id, {
          sync_status: 'pending',
          skipSyncQueue: true,
        })
        queued++
      } catch (error) {
        errors.push(`brochure_sync ${sync.id}: ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }

    if (queued > 0) {
      console.log(`🔄 RECONCILE brochure_sync: queued=${queued}`)
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

        const alreadyQueued = await LocalDatabaseService.hasPendingSyncOperation('activity_logs', log.id)
        if (!alreadyQueued) {
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
        }
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
    console.log(
      `🔄 RECONCILE ${options.entity}: local=${locals.filter((l) => !l.is_deleted).length} server=${serverIds.size}`,
    )

    for (const local of locals) {
      if (local.is_deleted) continue

      try {
        let operation: 'create' | 'update' | undefined
        let clearServerId = false
        const localServerId = local.server_id ? String(local.server_id) : ''

        if (localServerId && !serverIds.has(localServerId)) {
          operation = 'create'
          clearServerId = true
        } else if (local.sync_status === 'pending' || local.sync_status === 'error') {
          operation = localServerId ? 'update' : 'create'
        } else if (!localServerId) {
          operation = 'create'
        }

        if (!operation) continue

        if (clearServerId) {
          if (options.entity === 'doctors') {
            await LocalDatabaseService.resetDoctorServerSync(local.id)
          } else {
            await LocalDatabaseService.resetMeetingServerSync(local.id)
          }
          clearedStaleServerIds++
        }

        const tableName = options.entity
        const updateFn =
          options.entity === 'doctors'
            ? (id: string) => LocalDatabaseService.updateDoctor(id, { sync_status: 'pending', skipSyncQueue: true })
            : (id: string) => LocalDatabaseService.updateMeeting(id, { sync_status: 'pending', skipSyncQueue: true })

        const alreadyQueued = await LocalDatabaseService.hasPendingSyncOperation(tableName, local.id)
        await LocalDatabaseService.addToSyncQueue(operation, tableName, local.id, {
          ...local,
          server_id: operation === 'create' ? null : local.server_id,
          notes: local.notes ?? '',
        })
        if (!alreadyQueued || clearServerId) {
          queued++
        }
        console.log(`🔄 RECONCILE: Queued ${tableName} ${operation} for ${local.id}`)
        await updateFn(local.id)
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
