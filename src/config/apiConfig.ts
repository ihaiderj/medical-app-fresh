import Constants from 'expo-constants'
import { Platform } from 'react-native'

function getDebuggerHostIp(): string | null {
  const debuggerHost =
    Constants.expoGoConfig?.debuggerHost ??
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri

  if (!debuggerHost) return null

  const host = debuggerHost.split(':')[0]
  if (!host || host === 'localhost' || host === '127.0.0.1') return null
  return host
}

function getDefaultDevBaseUrl(): string {
  const lanIp = getDebuggerHostIp()
  if (lanIp) {
    return `http://${lanIp}:8000`
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000'
}

const configuredUrl = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl
const isLocalhostOnly =
  configuredUrl?.includes('127.0.0.1') || configuredUrl?.includes('localhost')

/** Prefer LAN IP on physical devices; localhost config only applies on simulator/emulator */
export const API_BASE_URL: string =
  isLocalhostOnly && getDebuggerHostIp()
    ? `http://${getDebuggerHostIp()}:8000`
    : configuredUrl || getDefaultDevBaseUrl()

export function resolveMediaUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return ''
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('file://')) {
    return pathOrUrl
  }
  const base = API_BASE_URL.replace(/\/$/, '')
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${base}${path}`
}
