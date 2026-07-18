/**
 * NotificationService
 *
 * Thin wrapper around expo-notifications used for local meeting reminders.
 *
 * IMPORTANT: expo-notifications is a native module. If the current dev-client
 * build does not include it yet, `require` will throw / the module will be
 * unavailable. Every method here is defensive: it degrades to a no-op and logs
 * a warning instead of crashing the app. After a dev-client rebuild the real
 * scheduling starts working automatically.
 */

let Notifications: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications')
} catch (error) {
  console.warn('NotificationService: expo-notifications native module not available yet:', error)
}

const REMINDER_CHANNEL_ID = 'meeting-reminders'

export interface ScheduleReminderInput {
  title: string
  body: string
  /** Fire at this absolute time. */
  date: Date
  /** Arbitrary payload carried with the notification. */
  data?: Record<string, unknown>
  /** Optional stable identifier so it can be cancelled/replaced. */
  identifier?: string
}

export class NotificationService {
  private static configured = false

  static get isAvailable(): boolean {
    return !!Notifications
  }

  /**
   * Configure the foreground handler + Android channel. Safe to call multiple
   * times; only runs once.
   */
  static async configure(): Promise<void> {
    if (!Notifications || this.configured) {
      return
    }
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          // Older + newer SDK keys included so it works across versions.
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      })

      if (Notifications.setNotificationChannelAsync) {
        await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
          name: 'Meeting Reminders',
          importance: Notifications.AndroidImportance?.HIGH ?? 4,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#8b5cf6',
        })
      }
      this.configured = true
    } catch (error) {
      console.warn('NotificationService: configure failed:', error)
    }
  }

  /**
   * Ensure we have permission to post notifications. Returns true when granted.
   */
  static async ensurePermissions(): Promise<boolean> {
    if (!Notifications) {
      return false
    }
    try {
      const settings = await Notifications.getPermissionsAsync()
      let status = settings.status
      if (status !== 'granted') {
        const request = await Notifications.requestPermissionsAsync()
        status = request.status
      }
      return status === 'granted'
    } catch (error) {
      console.warn('NotificationService: ensurePermissions failed:', error)
      return false
    }
  }

  /**
   * Schedule a local notification at an absolute date. Returns the scheduled
   * notification id (or null when unavailable / in the past).
   */
  static async scheduleReminder(input: ScheduleReminderInput): Promise<string | null> {
    if (!Notifications) {
      return null
    }
    const fireDate = input.date
    if (!(fireDate instanceof Date) || isNaN(fireDate.getTime())) {
      return null
    }
    // Guard: a trigger in the past would fire immediately; skip it.
    const secondsFromNow = Math.round((fireDate.getTime() - Date.now()) / 1000)
    if (secondsFromNow <= 0) {
      return null
    }

    try {
      await this.configure()
      const granted = await this.ensurePermissions()
      if (!granted) {
        return null
      }

      const identifier = await Notifications.scheduleNotificationAsync({
        identifier: input.identifier,
        content: {
          title: input.title,
          body: input.body,
          data: input.data || {},
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? 'timeInterval',
          seconds: secondsFromNow,
          channelId: REMINDER_CHANNEL_ID,
          repeats: false,
        },
      })
      return identifier
    } catch (error) {
      console.warn('NotificationService: scheduleReminder failed:', error)
      return null
    }
  }

  /**
   * Convenience: remind after N minutes from now (the "snooze" feature).
   */
  static async scheduleInMinutes(
    minutes: number,
    content: { title: string; body: string; data?: Record<string, unknown> },
  ): Promise<string | null> {
    const date = new Date(Date.now() + minutes * 60 * 1000)
    return this.scheduleReminder({ ...content, date })
  }

  static async cancel(identifier: string): Promise<void> {
    if (!Notifications || !identifier) {
      return
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier)
    } catch (error) {
      console.warn('NotificationService: cancel failed:', error)
    }
  }

  static async cancelAll(): Promise<void> {
    if (!Notifications) {
      return
    }
    try {
      await Notifications.cancelAllScheduledNotificationsAsync()
    } catch (error) {
      console.warn('NotificationService: cancelAll failed:', error)
    }
  }
}
