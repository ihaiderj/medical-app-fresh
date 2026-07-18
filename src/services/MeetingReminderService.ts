/**
 * MeetingReminderService
 *
 * Central place for meeting status derivation and the two dashboard prompts:
 *   1. Upcoming meetings happening *today* (offer a snooze reminder).
 *   2. Expired meetings the user never resolved (offer to mark the status).
 *
 * "Expired" = a meeting whose relevant date/time has passed while its stored
 * status is still the default ('scheduled') and there is no pending future
 * follow-up. These are auto-marked 'expired' and surfaced for the user to
 * resolve (Completed / Add follow-up / Cancelled / Skip).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { LocalDatabaseService, LocalMeeting, LocalMeetingFollowUp } from './localDatabaseService'
import { OfflineFirstService } from './offlineFirstService'

export type EffectiveMeetingStatus =
  | 'scheduled'
  | 'follow-up-scheduled'
  | 'completed'
  | 'cancelled'
  | 'expired'

export interface MeetingReminderInfo {
  meeting: LocalMeeting
  latestFollowUp: LocalMeetingFollowUp | null
  /** The datetime that drives the reminder (meeting time or latest follow-up). */
  occurrence: Date
  effectiveStatus: EffectiveMeetingStatus
  doctorName: string
}

const DISMISSED_EXPIRY_KEY = 'reminder_dismissed_expiries'

/** Combine a YYYY-MM-DD (or ISO) date string with an optional HH:mm time. */
function combineDateTime(dateStr?: string, timeStr?: string): Date {
  const base = dateStr ? new Date(dateStr) : new Date()
  if (isNaN(base.getTime())) {
    return new Date(NaN)
  }
  if (timeStr && /^\d{1,2}:\d{2}/.test(timeStr)) {
    const [h, m] = timeStr.split(':')
    base.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
  } else if (dateStr && !dateStr.includes('T')) {
    // Date-only string with no time: treat as end of day so it isn't marked
    // expired mid-day on the scheduled day.
    base.setHours(23, 59, 59, 999)
  }
  return base
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export class MeetingReminderService {
  /**
   * Derive the effective status of a meeting from its stored status and its
   * latest follow-up. Kept in one place so the list screen, dashboard and
   * expiry logic all agree.
   */
  static computeEffectiveStatus(
    meeting: Pick<LocalMeeting, 'status' | 'scheduled_date'>,
    latestFollowUp: LocalMeetingFollowUp | null,
    now: Date = new Date(),
  ): EffectiveMeetingStatus {
    if (meeting.status === 'cancelled') return 'cancelled'
    if (meeting.status === 'completed') return 'completed'

    if (latestFollowUp && latestFollowUp.status !== 'completed' && latestFollowUp.status !== 'cancelled') {
      const fuDateTime = combineDateTime(latestFollowUp.follow_up_date, latestFollowUp.follow_up_time)
      if (!isNaN(fuDateTime.getTime())) {
        return fuDateTime >= now ? 'follow-up-scheduled' : 'expired'
      }
    }

    if (meeting.status === 'expired') return 'expired'

    const meetingDateTime = combineDateTime(meeting.scheduled_date)
    if (!isNaN(meetingDateTime.getTime()) && meetingDateTime < now) {
      return 'expired'
    }
    return meeting.status === 'follow-up-scheduled' ? 'follow-up-scheduled' : 'scheduled'
  }

  /** The datetime that a reminder should key off (follow-up if present, else meeting). */
  static getOccurrence(
    meeting: Pick<LocalMeeting, 'scheduled_date'>,
    latestFollowUp: LocalMeetingFollowUp | null,
  ): Date {
    if (latestFollowUp && latestFollowUp.status !== 'completed' && latestFollowUp.status !== 'cancelled') {
      const fu = combineDateTime(latestFollowUp.follow_up_date, latestFollowUp.follow_up_time)
      if (!isNaN(fu.getTime())) return fu
    }
    return combineDateTime(meeting.scheduled_date)
  }

  private static async buildInfos(userId: string, now: Date): Promise<MeetingReminderInfo[]> {
    await LocalDatabaseService.ensureReady()
    const meetings = await LocalDatabaseService.getMeetings(userId)
    const infos: MeetingReminderInfo[] = []

    for (const meeting of meetings) {
      if (meeting.is_deleted) continue
      const meetingId = meeting.id
      let latestFollowUp: LocalMeetingFollowUp | null = null
      try {
        latestFollowUp = await LocalDatabaseService.getLatestMeetingFollowUp(meetingId)
      } catch {
        latestFollowUp = null
      }

      const effectiveStatus = this.computeEffectiveStatus(meeting, latestFollowUp, now)
      const occurrence = this.getOccurrence(meeting, latestFollowUp)

      let doctorName = 'Doctor'
      try {
        const doctor = await LocalDatabaseService.getDoctorById(meeting.doctor_id)
        if (doctor) doctorName = `${doctor.first_name} ${doctor.last_name}`.trim()
      } catch {
        // ignore
      }

      infos.push({ meeting, latestFollowUp, occurrence, effectiveStatus, doctorName })
    }
    return infos
  }

  /**
   * Persist status = 'expired' for meetings that have passed while still
   * 'scheduled' (i.e. the user never manually resolved them). Returns the
   * number of meetings updated.
   */
  static async autoMarkExpired(userId: string, now: Date = new Date()): Promise<number> {
    const infos = await this.buildInfos(userId, now)
    let updated = 0
    for (const info of infos) {
      if (info.effectiveStatus === 'expired' && info.meeting.status === 'scheduled') {
        try {
          await OfflineFirstService.updateMeeting(info.meeting.id, { status: 'expired' })
          updated++
        } catch (error) {
          console.warn('MeetingReminderService: failed to mark expired', info.meeting.id, error)
        }
      }
    }
    return updated
  }

  /** Meetings/follow-ups happening later today that haven't passed yet. */
  static async getUpcomingToday(userId: string, now: Date = new Date()): Promise<MeetingReminderInfo[]> {
    const infos = await this.buildInfos(userId, now)
    return infos.filter((info) => {
      if (info.effectiveStatus === 'cancelled' || info.effectiveStatus === 'completed') return false
      if (isNaN(info.occurrence.getTime())) return false
      return isSameDay(info.occurrence, now) && info.occurrence >= now
    })
  }

  /** Expired meetings the user hasn't dismissed/resolved yet. */
  static async getExpiredNeedingReview(userId: string, now: Date = new Date()): Promise<MeetingReminderInfo[]> {
    const infos = await this.buildInfos(userId, now)
    const dismissed = await this.getDismissedExpiries()
    return infos.filter((info) => {
      if (info.effectiveStatus !== 'expired') return false
      const key = this.expiryKey(info)
      return !dismissed.includes(key)
    })
  }

  static expiryKey(info: MeetingReminderInfo): string {
    const occ = isNaN(info.occurrence.getTime()) ? 'unknown' : info.occurrence.toISOString()
    return `${info.meeting.id}:${occ}`
  }

  static async getDismissedExpiries(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(DISMISSED_EXPIRY_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  }

  static async dismissExpiry(key: string): Promise<void> {
    try {
      const current = await this.getDismissedExpiries()
      if (!current.includes(key)) {
        current.push(key)
        // Keep the list bounded.
        const trimmed = current.slice(-200)
        await AsyncStorage.setItem(DISMISSED_EXPIRY_KEY, JSON.stringify(trimmed))
      }
    } catch (error) {
      console.warn('MeetingReminderService: dismissExpiry failed', error)
    }
  }
}
