/**
 * Brochure File Download Service
 * Downloads brochure files via Django REST API media URLs
 */
import * as FileSystem from 'expo-file-system'
import { resolveMediaUrl } from '../config/apiConfig'
import { BrochureManagementService, BrochureData, SlideGroup } from './brochureManagementService'

export interface BrochureDownloadResult {
  success: boolean
  brochureData?: BrochureData
  error?: string
}

export class BrochureFileDownloadService {
  static async downloadBrochureFiles(
    brochureId: string,
    _mrId: string,
    serverBrochureData: unknown,
  ): Promise<BrochureDownloadResult> {
    try {
      const brochureDir = `${FileSystem.documentDirectory}brochures/${brochureId}/`
      const slidesDir = `${brochureDir}slides/`
      const tempDir = `${brochureDir}temp_${Date.now()}/`
      const tempSlidesDir = `${tempDir}slides/`

      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true })
      await FileSystem.makeDirectoryAsync(tempSlidesDir, { intermediates: true })

      try {
        const serverData: BrochureData =
          typeof serverBrochureData === 'string'
            ? JSON.parse(serverBrochureData)
            : (serverBrochureData as BrochureData)

        for (const slide of serverData.slides) {
          if (!slide.imageUri || slide.imageUri.startsWith('file://')) {
            continue
          }

          try {
            const downloadUrl = resolveMediaUrl(slide.imageUri)
            const extension = downloadUrl.split('.').pop()?.toLowerCase() || 'jpg'
            const localFilePath = `${tempSlidesDir}${slide.id}.${extension}`

            const downloadResult = await FileSystem.downloadAsync(downloadUrl, localFilePath)
            if (downloadResult.status === 200) {
              slide.imageUri = localFilePath
            }
          } catch (error) {
            console.error(`Error downloading slide ${slide.id}:`, error)
          }
        }

        const existingBrochureResult = await BrochureManagementService.getBrochureData(brochureId)
        if (existingBrochureResult.success && existingBrochureResult.data) {
          const existingData = existingBrochureResult.data
          const existingGroupsByServerId = new Map<string, SlideGroup>()

          existingData.groups.forEach((group) => {
            if (group.server_id) {
              existingGroupsByServerId.set(group.server_id, group)
            }
          })

          serverData.groups.forEach((serverGroup) => {
            if (serverGroup.server_id) {
              const existingGroup = existingGroupsByServerId.get(serverGroup.server_id)
              if (existingGroup) {
                Object.assign(existingGroup, { ...serverGroup, id: existingGroup.id })
              }
            }
          })
        }

        await FileSystem.writeAsStringAsync(`${tempDir}brochure_data.json`, JSON.stringify(serverData, null, 2))

        const oldDataPath = `${brochureDir}brochure_data.json`
        const oldDataInfo = await FileSystem.getInfoAsync(oldDataPath)
        if (oldDataInfo.exists) {
          await FileSystem.deleteAsync(oldDataPath)
        }

        const oldSlidesInfo = await FileSystem.getInfoAsync(slidesDir)
        if (oldSlidesInfo.exists) {
          await FileSystem.deleteAsync(slidesDir, { idempotent: true })
        }

        await FileSystem.copyAsync({ from: `${tempDir}brochure_data.json`, to: oldDataPath })
        await FileSystem.copyAsync({ from: tempSlidesDir, to: slidesDir })
        await FileSystem.deleteAsync(tempDir, { idempotent: true })

        return { success: true, brochureData: serverData }
      } catch (error) {
        await FileSystem.deleteAsync(tempDir, { idempotent: true })
        throw error
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download brochure files',
      }
    }
  }

  static matchGroupsByServerId(localGroups: SlideGroup[], serverGroups: SlideGroup[]): SlideGroup[] {
    const matchedGroups: SlideGroup[] = []
    const localGroupsByServerId = new Map<string, SlideGroup>()

    localGroups.forEach((group) => {
      if (group.server_id) {
        localGroupsByServerId.set(group.server_id, group)
      }
    })

    serverGroups.forEach((serverGroup) => {
      if (serverGroup.server_id) {
        const localGroup = localGroupsByServerId.get(serverGroup.server_id)
        if (localGroup) {
          matchedGroups.push({ ...serverGroup, id: localGroup.id })
        } else {
          matchedGroups.push(serverGroup)
        }
      } else {
        matchedGroups.push(serverGroup)
      }
    })

    localGroups.forEach((localGroup) => {
      if (!localGroup.server_id) {
        matchedGroups.push(localGroup)
      }
    })

    return matchedGroups
  }
}
