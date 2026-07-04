import Constants from 'expo-constants'
import { Platform } from 'react-native'

/** Default dev backend — use 10.0.2.2 on Android emulator to reach host localhost */
const DEV_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000'

export const API_BASE_URL: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  DEV_BASE_URL

export function resolveMediaUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return ''
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('file://')) {
    return pathOrUrl
  }
  const base = API_BASE_URL.replace(/\/$/, '')
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${base}${path}`
}
