import * as FileSystem from 'expo-file-system'
import { API_BASE_URL } from '../config/apiConfig'
import { TokenStorage } from './tokenStorage'

export interface ApiEnvelope<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  code?: string
}

export class ApiError extends Error {
  code?: string
  status?: number

  constructor(message: string, code?: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface RequestOptions {
  auth?: boolean
  body?: unknown
  headers?: Record<string, string>
  query?: Record<string, string | number | boolean | undefined>
  /** Request timeout in ms (default 15000). Use 0 to disable. */
  timeoutMs?: number
}

let refreshPromise: Promise<boolean> | null = null
const DEFAULT_TIMEOUT_MS = 15000

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = API_BASE_URL.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${base}${normalizedPath}`)
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    })
  }
  return url.toString()
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = await TokenStorage.getRefreshToken()
  if (!refreshToken) return false

  try {
    const response = await fetch(buildUrl('/api/auth/refresh/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    })

    if (!response.ok) {
      await TokenStorage.clearTokens()
      return false
    }

    const json = await response.json()
    const access = json.access as string | undefined
    if (!access) {
      await TokenStorage.clearTokens()
      return false
    }

    await TokenStorage.saveTokens(access, refreshToken)
    return true
  } catch {
    await TokenStorage.clearTokens()
    return false
  }
}

async function ensureRefreshed(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  let json: ApiEnvelope<T> | null = null
  try {
    json = await response.json()
  } catch {
    if (!response.ok) {
      throw new ApiError(`Request failed (${response.status})`, undefined, response.status)
    }
    return undefined as T
  }

  if (!response.ok || json?.success === false) {
    throw new ApiError(
      json?.error || json?.message || `Request failed (${response.status})`,
      json?.code,
      response.status,
    )
  }

  if (json && 'data' in json && json.data !== undefined) {
    return json.data as T
  }

  return (json as unknown as T) ?? (undefined as T)
}

async function request<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {},
  retryOnUnauthorized = true,
): Promise<T> {
  const { auth = true, body, headers = {}, query, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const requestHeaders: Record<string, string> = { ...headers }

  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const accessToken = await TokenStorage.getAccessToken()
    if (accessToken) {
      requestHeaders.Authorization = `Bearer ${accessToken}`
    }
  }

  const controller = timeoutMs > 0 ? new AbortController() : null
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      signal: controller?.signal,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${timeoutMs}ms: ${path}`, 'TIMEOUT')
    }
    throw new ApiError(`Network request failed: cannot reach ${API_BASE_URL}`)
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (response.status === 401 && auth && retryOnUnauthorized) {
    const refreshed = await ensureRefreshed()
    if (refreshed) {
      return request<T>(method, path, options, false)
    }
  }

  return parseEnvelope<T>(response)
}

function mimeTypeFromFileName(fileName: string): string {
  const extension = fileName.toLowerCase().split('.').pop()
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'zip':
      return 'application/zip'
    case 'pdf':
      return 'application/pdf'
    case 'json':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}

export const apiClient = {
  getBaseUrl: () => API_BASE_URL,

  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, options),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('POST', path, { ...options, body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PATCH', path, { ...options, body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('PUT', path, { ...options, body }),

  delete: <T>(path: string, options?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, options),

  async uploadFile(
    endpoint: string,
    localFilePath: string,
    fileName: string,
    extraFields?: Record<string, string>,
    mimeType?: string,
  ): Promise<{ file_url: string; file_name: string; file_type: string; file_size: string }> {
    const fileInfo = await FileSystem.getInfoAsync(localFilePath)
    if (!fileInfo.exists) {
      throw new ApiError('File does not exist')
    }

    const resolvedType = mimeType || mimeTypeFromFileName(fileName)
    const formData = new FormData()
    // React Native FormData file part — do not set Content-Type on the request
    // so fetch can attach the multipart boundary automatically.
    formData.append('file', {
      uri: localFilePath,
      type: resolvedType,
      name: fileName,
    } as unknown as Blob)

    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        formData.append(key, value)
      })
    }

    console.log('apiClient.uploadFile:', {
      endpoint,
      fileName,
      type: resolvedType,
      size: fileInfo.size,
      extraFieldKeys: extraFields ? Object.keys(extraFields) : [],
    })

    return request('POST', endpoint, { body: formData, timeoutMs: 180000 })
  },
}
