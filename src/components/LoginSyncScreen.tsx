import React from 'react'
import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export interface LoginSyncProgress {
  step: string
  message: string
  progress: number
}

interface LoginSyncScreenProps {
  visible: boolean
  syncProgress: LoginSyncProgress
}

/**
 * Full-screen overlay shown during the first-login sync-down so the user knows
 * their data (doctors, meetings, notes, brochures) is being downloaded, with
 * a live progress bar.
 */
export default function LoginSyncScreen({ visible, syncProgress }: LoginSyncScreenProps) {
  const pct = Math.max(0, Math.min(100, Math.round(syncProgress?.progress || 0)))

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-download-outline" size={40} color="#8b5cf6" />
          </View>

          <Text style={styles.title}>Setting up your workspace</Text>
          <Text style={styles.step}>{syncProgress?.step || 'Starting'}</Text>
          <Text style={styles.message} numberOfLines={2}>
            {syncProgress?.message || 'Preparing your data...'}
          </Text>

          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.pct}>{pct}%</Text>

          <ActivityIndicator style={styles.spinner} color="#8b5cf6" />

          <Text style={styles.hint}>
            Please keep the app open. We're downloading your doctors, meetings and
            brochures so everything works offline.
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f3e8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  step: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b5cf6',
    marginBottom: 4,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 18,
    textAlign: 'center',
    minHeight: 34,
  },
  barTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#8b5cf6',
  },
  pct: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  spinner: {
    marginTop: 14,
  },
  hint: {
    marginTop: 16,
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 16,
  },
})
