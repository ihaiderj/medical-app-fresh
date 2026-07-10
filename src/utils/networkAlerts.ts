import { Alert } from 'react-native'

export const NetworkAlerts = {
  offlineNoDownload: () =>
    Alert.alert(
      'No Internet Connection',
      'This brochure is not saved on your device. Connect to the internet to download it.',
    ),

  offlineDownloadBlocked: () =>
    Alert.alert(
      'No Internet Connection',
      'Downloading requires an internet connection. You can still view brochures already saved on this device.',
    ),

  offlineDeletedLocally: () =>
    Alert.alert(
      'Deleted on Device',
      'The brochure was removed from this device. It will also be removed from your account when you reconnect.',
    ),

  deletedOnline: () => Alert.alert('Deleted', 'Brochure deleted successfully.'),

  refreshOffline: () =>
    Alert.alert(
      'No Internet Connection',
      'Connect to the internet to refresh brochures from the server.',
    ),

  refreshSuccess: (count: number) =>
    Alert.alert('Refreshed', `Brochures updated from the server (${count} available).`),

  refreshFailed: () =>
    Alert.alert(
      'Sync Failed',
      'Could not reach the server. Showing your last saved brochure list.',
    ),

  fileUpdated: () =>
    Alert.alert('Updated', 'Downloaded the latest brochure file from the server.'),

  updateFailedUseLocal: (error?: string) =>
    Alert.alert(
      'Could Not Update',
      error
        ? `Could not download the latest version: ${error}. Opening your saved copy instead.`
        : 'Could not download the latest version. Opening your saved copy instead.',
    ),

  viewOfflineNoFile: () =>
    Alert.alert(
      'Not Available Offline',
      'This brochure is not on your device. Connect to the internet to download it.',
    ),

  wentOffline: () =>
    Alert.alert(
      'You Are Offline',
      'Showing cached brochures. Saved downloads on this device are still available.',
    ),

  backOnline: () =>
    Alert.alert('Back Online', 'Refreshing brochures from the server.'),

  syncRequiresInternet: () =>
    Alert.alert(
      'No Internet Connection',
      'Sync requires an internet connection. Your changes are saved locally and will upload when you reconnect.',
    ),

  downloadRequired: () =>
    Alert.alert(
      'Download Required',
      'Please download this brochure first, or connect to the internet to stream it.',
    ),
}

export type ConnectionMode = 'online' | 'offline' | 'cached' | 'sync_failed'

export function getConnectionBanner(mode: ConnectionMode, detail: string): {
  text: string
  tone: 'success' | 'warning' | 'error' | 'info'
} {
  switch (mode) {
    case 'online':
      return { text: detail || 'Connected • brochures up to date', tone: 'success' }
    case 'offline':
      return { text: detail || 'Offline • showing saved data on this device', tone: 'warning' }
    case 'cached':
      return { text: detail || 'Using cached brochures • connect to refresh', tone: 'info' }
    case 'sync_failed':
      return { text: detail || 'Could not reach server • showing cached data', tone: 'error' }
    default:
      return { text: detail, tone: 'info' }
  }
}
