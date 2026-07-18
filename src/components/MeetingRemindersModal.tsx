import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { MeetingReminderService, MeetingReminderInfo } from '../services/MeetingReminderService'
import { NotificationService } from '../services/NotificationService'
import { OfflineFirstService } from '../services/offlineFirstService'

interface MeetingRemindersModalProps {
  userId?: string
  /** Bump this number to force a re-check (e.g. on dashboard focus). */
  refreshKey?: number
  navigation: any
  /** Called after any change so the dashboard can refresh. */
  onChanged?: () => void
}

const SNOOZE_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
]

function formatDateTime(date: Date): string {
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MeetingRemindersModal({
  userId,
  refreshKey,
  navigation,
  onChanged,
}: MeetingRemindersModalProps) {
  const [visible, setVisible] = useState(false)
  const [upcoming, setUpcoming] = useState<MeetingReminderInfo[]>([])
  const [expired, setExpired] = useState<MeetingReminderInfo[]>([])
  const [customFor, setCustomFor] = useState<string | null>(null)
  const [customMinutes, setCustomMinutes] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    try {
      // Auto-mark anything freshly expired before we read the lists.
      await MeetingReminderService.autoMarkExpired(userId)
      const [up, exp] = await Promise.all([
        MeetingReminderService.getUpcomingToday(userId),
        MeetingReminderService.getExpiredNeedingReview(userId),
      ])
      setUpcoming(up)
      setExpired(exp)
      if (up.length > 0 || exp.length > 0) {
        setVisible(true)
      }
    } catch (error) {
      console.warn('MeetingRemindersModal: load failed', error)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const close = () => {
    setVisible(false)
    setCustomFor(null)
    setCustomMinutes('')
  }

  const scheduleSnooze = async (info: MeetingReminderInfo, minutes: number) => {
    const title = 'Meeting reminder'
    const body = `${info.meeting.title || 'Meeting'} with ${info.doctorName} at ${formatDateTime(info.occurrence)}`
    const id = await NotificationService.scheduleInMinutes(minutes, {
      title,
      body,
      data: { meetingId: info.meeting.id, type: 'meeting-reminder' },
    })
    if (id) {
      Alert.alert('Reminder set', `We'll remind you in ${minutes} minute${minutes === 1 ? '' : 's'}.`)
    } else if (!NotificationService.isAvailable) {
      Alert.alert(
        'Reminders unavailable',
        'Notification support needs a new app build. Rebuild the dev client to enable reminders.',
      )
    } else {
      Alert.alert('Reminder not set', 'Could not schedule the reminder (permission denied or invalid time).')
    }
    // Remove this card once handled.
    setUpcoming((prev) => prev.filter((u) => u.meeting.id !== info.meeting.id))
    maybeAutoClose()
  }

  const handleCustomSnooze = async (info: MeetingReminderInfo) => {
    const minutes = parseInt(customMinutes, 10)
    if (!minutes || minutes <= 0) {
      Alert.alert('Invalid time', 'Enter a number of minutes greater than 0.')
      return
    }
    setCustomFor(null)
    setCustomMinutes('')
    await scheduleSnooze(info, minutes)
  }

  const dismissUpcoming = (info: MeetingReminderInfo) => {
    setUpcoming((prev) => prev.filter((u) => u.meeting.id !== info.meeting.id))
    maybeAutoClose()
  }

  const resolveExpired = async (
    info: MeetingReminderInfo,
    action: 'completed' | 'cancelled' | 'followup' | 'skip',
  ) => {
    try {
      if (action === 'completed' || action === 'cancelled') {
        await OfflineFirstService.updateMeeting(info.meeting.id, { status: action })
        onChanged?.()
      } else if (action === 'skip') {
        await MeetingReminderService.dismissExpiry(MeetingReminderService.expiryKey(info))
      } else if (action === 'followup') {
        // Dismiss this expiry occurrence and take them to details to add a follow-up.
        await MeetingReminderService.dismissExpiry(MeetingReminderService.expiryKey(info))
        close()
        navigation.navigate('MeetingDetails', { meetingId: info.meeting.id })
        return
      }
    } catch (error) {
      console.warn('MeetingRemindersModal: resolveExpired failed', error)
    }
    setExpired((prev) => prev.filter((e) => e.meeting.id !== info.meeting.id))
    maybeAutoClose()
  }

  const maybeAutoClose = () => {
    setTimeout(() => {
      setUpcoming((up) => {
        setExpired((exp) => {
          if (up.length === 0 && exp.length === 0) {
            setVisible(false)
          }
          return exp
        })
        return up
      })
    }, 0)
  }

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Ionicons name="notifications" size={22} color="#8b5cf6" />
            <Text style={styles.headerTitle}>Meeting Reminders</Text>
            <TouchableOpacity onPress={close} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {upcoming.length > 0 && (
              <Text style={styles.sectionLabel}>Today's meetings</Text>
            )}
            {upcoming.map((info) => (
              <View key={`up-${info.meeting.id}`} style={styles.itemCard}>
                <Text style={styles.itemTitle}>{info.meeting.title || 'Meeting'}</Text>
                <Text style={styles.itemSub}>
                  {info.doctorName} • {formatDateTime(info.occurrence)}
                </Text>
                <Text style={styles.remindLabel}>Remind me again in:</Text>
                <View style={styles.actionRow}>
                  {SNOOZE_PRESETS.map((p) => (
                    <TouchableOpacity
                      key={p.label}
                      style={styles.snoozeBtn}
                      onPress={() => scheduleSnooze(info, p.minutes)}
                    >
                      <Text style={styles.snoozeBtnText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.snoozeBtn}
                    onPress={() => {
                      setCustomFor(customFor === info.meeting.id ? null : info.meeting.id)
                      setCustomMinutes('')
                    }}
                  >
                    <Text style={styles.snoozeBtnText}>Custom</Text>
                  </TouchableOpacity>
                </View>
                {customFor === info.meeting.id && (
                  <View style={styles.customRow}>
                    <TextInput
                      style={styles.customInput}
                      placeholder="Minutes"
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                      value={customMinutes}
                      onChangeText={setCustomMinutes}
                    />
                    <TouchableOpacity style={styles.customSetBtn} onPress={() => handleCustomSnooze(info)}>
                      <Text style={styles.customSetBtnText}>Set</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <TouchableOpacity style={styles.dismissLink} onPress={() => dismissUpcoming(info)}>
                  <Text style={styles.dismissLinkText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ))}

            {expired.length > 0 && (
              <Text style={[styles.sectionLabel, { color: '#b45309' }]}>Expired — needs an update</Text>
            )}
            {expired.map((info) => (
              <View key={`exp-${info.meeting.id}`} style={[styles.itemCard, styles.expiredCard]}>
                <Text style={styles.itemTitle}>{info.meeting.title || 'Meeting'}</Text>
                <Text style={styles.itemSub}>
                  {info.doctorName} • was due {formatDateTime(info.occurrence)}
                </Text>
                <View style={styles.expiredActions}>
                  <TouchableOpacity
                    style={[styles.expBtn, { backgroundColor: '#10b981' }]}
                    onPress={() => resolveExpired(info, 'completed')}
                  >
                    <Text style={styles.expBtnText}>Completed</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.expBtn, { backgroundColor: '#8b5cf6' }]}
                    onPress={() => resolveExpired(info, 'followup')}
                  >
                    <Text style={styles.expBtnText}>Add follow-up</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.expiredActions}>
                  <TouchableOpacity
                    style={[styles.expBtn, { backgroundColor: '#ef4444' }]}
                    onPress={() => resolveExpired(info, 'cancelled')}
                  >
                    <Text style={styles.expBtnText}>Cancelled</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.expBtn, styles.skipBtn]}
                    onPress={() => resolveExpired(info, 'skip')}
                  >
                    <Text style={[styles.expBtnText, { color: '#6b7280' }]}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.doneBtn} onPress={close}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8b5cf6',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  itemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  expiredCard: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
  },
  itemSub: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
    marginBottom: 8,
  },
  remindLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snoozeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  snoozeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7c3aed',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  customSetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#8b5cf6',
  },
  customSetBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  dismissLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  dismissLinkText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  expiredActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  expBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  skipBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  expBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  doneBtn: {
    margin: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
})
