/**
 * Keeps local brochures in sync with admin/backend changes when the device is online.
 */
import * as FileSystem from 'expo-file-system'
import { MRService, MRAssignedBrochure } from './MRService'
import { NetworkService } from './networkService'
import { LocalDatabaseService } from './localDatabaseService'
import { OfflineBrochureService } from './offlineBrochureService'
import { BrochureManagementService } from './brochureManagementService'

export interface BrochureRefreshResult {
  success: boolean
  brochures: MRAssignedBrochure[]
  offline?: boolean
  error?: string
  filesInvalidated?: number
}

export interface AdminFileRefreshResult {
  refreshed: boolean
  offline?: boolean
  error?: string
}

type BrochureMetadata = {
  id?: string
  title?: string
  category?: string
  description?: string
  file_url?: string
  thumbnail_url?: string
  file_name?: string
  file_type?: string
  updated_at?: string
  view_count?: number
  download_count?: number
  uploaded_by_name?: string
}

export class BrochureRefreshService {
  static getBrochureKey(brochure: { id?: string; brochure_id?: string }): string {
    return brochure.brochure_id || brochure.id || ''
  }

  static parseMetadata(raw: string | BrochureMetadata | null | undefined): BrochureMetadata {
    if (!raw) return {}
    if (typeof raw === 'object') return raw
    try {
      return JSON.parse(raw) as BrochureMetadata
    } catch {
      return {}
    }
  }

  /** True when the admin replaced the underlying ZIP/PDF on the server. */
  static hasAdminFileChanged(localMeta: BrochureMetadata, serverBrochure: MRAssignedBrochure): boolean {
    if (!serverBrochure.file_url) return false
    if (localMeta.file_url && localMeta.file_url !== serverBrochure.file_url) return true
    if (serverBrochure.file_name && localMeta.file_name && serverBrochure.file_name !== localMeta.file_name) {
      return true
    }
    if (serverBrochure.file_type && localMeta.file_type && serverBrochure.file_type !== localMeta.file_type) {
      return true
    }
    return false
  }

  static buildMetadata(serverBrochure: MRAssignedBrochure, existing: BrochureMetadata = {}): BrochureMetadata {
    const id = this.getBrochureKey(serverBrochure)
    return {
      ...existing,
      id,
      title: serverBrochure.title,
      category: serverBrochure.category,
      description: serverBrochure.description,
      file_url: serverBrochure.file_url,
      thumbnail_url: serverBrochure.thumbnail_url,
      file_name: serverBrochure.file_name,
      file_type: serverBrochure.file_type,
      updated_at: serverBrochure.updated_at,
      view_count: serverBrochure.view_count,
      download_count: serverBrochure.download_count,
      uploaded_by_name: serverBrochure.uploaded_by_name,
    }
  }

  static async clearLocalBrochureFiles(userId: string, brochureId: string): Promise<void> {
    const brochureDir = `${FileSystem.documentDirectory}brochures/${brochureId}/`
    await FileSystem.deleteAsync(brochureDir, { idempotent: true })

    const downloadDir = `${FileSystem.documentDirectory}mr_downloads/${userId}/`
    const files = await FileSystem.readDirectoryAsync(downloadDir).catch(() => [])
    for (const file of files) {
      if (file.includes(brochureId)) {
        await FileSystem.deleteAsync(`${downloadDir}${file}`, { idempotent: true })
      }
    }
  }

  static async getLocalMetadataForBrochure(userId: string, brochureId: string): Promise<BrochureMetadata> {
    const savedBrochures = await LocalDatabaseService.getSavedBrochures(userId)
    const saved = savedBrochures.find((item) => item.brochure_id === brochureId)
    if (saved?.original_brochure_data) {
      return this.parseMetadata(saved.original_brochure_data)
    }

    const brochures = await LocalDatabaseService.getBrochures()
    const brochure = brochures.find((item) => item.id === brochureId)
    if (brochure) {
      return {
        id: brochure.id,
        title: brochure.title,
        category: brochure.category,
        description: brochure.description,
        file_url: brochure.file_url,
        thumbnail_url: brochure.thumbnail_url,
        file_name: brochure.file_name,
        file_type: brochure.file_type,
        updated_at: brochure.updated_at,
        view_count: brochure.view_count,
        download_count: brochure.download_count,
      }
    }

    return {}
  }

  static async updateSavedBrochureMetadata(
    userId: string,
    brochureId: string,
    serverBrochure: MRAssignedBrochure,
  ): Promise<void> {
    const savedBrochures = await LocalDatabaseService.getSavedBrochures(userId)
    const saved = savedBrochures.find((item) => item.brochure_id === brochureId)
    if (!saved) return

    const metadata = this.buildMetadata(serverBrochure, this.parseMetadata(saved.original_brochure_data))
    await LocalDatabaseService.updateSavedBrochure(saved.id, {
      original_brochure_data: JSON.stringify(metadata),
      brochure_title: serverBrochure.title,
      skipSyncQueue: true,
    })
  }

  /**
   * Refresh available brochures from server and merge admin changes into saved brochure records.
   */
  static async refreshFromServer(userId: string): Promise<BrochureRefreshResult> {
    if (!(await NetworkService.isOnline())) {
      return { success: false, brochures: [], offline: true, error: 'Device is offline' }
    }

    let serverResult: { success: boolean; data?: MRAssignedBrochure[]; error?: string }
    try {
      serverResult = await Promise.race([
        MRService.getAssignedBrochures(userId),
        new Promise<{ success: boolean; error: string }>((_, reject) =>
          setTimeout(() => reject(new Error('Assigned brochures timed out after 8000ms')), 8000),
        ),
      ])
    } catch (error) {
      return {
        success: false,
        brochures: [],
        error: error instanceof Error ? error.message : 'Failed to fetch brochures from server',
      }
    }

    if (!serverResult.success || !serverResult.data) {
      return {
        success: false,
        brochures: [],
        error: serverResult.error || 'Failed to fetch brochures from server',
      }
    }

    const serverBrochures = serverResult.data
    await LocalDatabaseService.syncBrochuresFromServer(serverBrochures)
    await OfflineBrochureService.cacheBrochures(userId, serverBrochures)

    const serverById = new Map(serverBrochures.map((brochure) => [this.getBrochureKey(brochure), brochure]))
    const savedBrochures = await LocalDatabaseService.getSavedBrochures(userId)
    let filesInvalidated = 0

    for (const saved of savedBrochures) {
      const serverBrochure = serverById.get(saved.brochure_id)
      if (!serverBrochure) continue

      const localMeta = this.parseMetadata(saved.original_brochure_data)
      const metadata = this.buildMetadata(serverBrochure, localMeta)

      await LocalDatabaseService.updateSavedBrochure(saved.id, {
        original_brochure_data: JSON.stringify(metadata),
        brochure_title: serverBrochure.title,
        skipSyncQueue: true,
      })

      if (this.hasAdminFileChanged(localMeta, serverBrochure)) {
        console.log('BrochureRefresh: Admin file changed for saved brochure:', saved.brochure_id)
        await this.clearLocalBrochureFiles(userId, saved.brochure_id)
        filesInvalidated += 1
      }
    }

    return { success: true, brochures: serverBrochures, filesInvalidated }
  }

  /**
   * When online, download and process the latest admin file before viewing.
   */
  static async ensureLatestAdminFile(
    userId: string,
    brochureId: string,
    serverBrochure?: MRAssignedBrochure,
  ): Promise<AdminFileRefreshResult> {
    if (!(await NetworkService.isOnline())) {
      return { refreshed: false, offline: true }
    }

    let server = serverBrochure
    if (!server) {
      server = (await MRService.getBrochureById(brochureId)) || undefined
    }
    if (!server?.file_url) {
      return { refreshed: false, error: 'Brochure file is not available on the server' }
    }

    const localMeta = await this.getLocalMetadataForBrochure(userId, brochureId)
    if (!this.hasAdminFileChanged(localMeta, server)) {
      await this.updateSavedBrochureMetadata(userId, brochureId, server)
      return { refreshed: false }
    }

    console.log('BrochureRefresh: Downloading latest admin file for:', brochureId)
    await this.clearLocalBrochureFiles(userId, brochureId)

    const downloadResult = await BrochureManagementService.downloadBrochureFile(
      brochureId,
      server.file_url,
      userId,
      server.title,
    )

    if (!downloadResult.success) {
      console.warn('BrochureRefresh: Failed to download latest admin file:', downloadResult.error)
      return { refreshed: false, error: downloadResult.error || 'Download failed' }
    }

    await this.updateSavedBrochureMetadata(userId, brochureId, server)
    return { refreshed: true }
  }
}
