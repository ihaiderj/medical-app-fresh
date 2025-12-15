/**
 * Brochure File Download Service
 * Handles downloading brochure files (images and JSON) from Supabase Storage
 */

import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { BrochureManagementService, BrochureData, SlideGroup } from './brochureManagementService';

const BUCKET_NAME = 'brochures';

export interface BrochureDownloadResult {
  success: boolean;
  brochureData?: BrochureData;
  error?: string;
}

export class BrochureFileDownloadService {
  /**
   * Download brochure files from Supabase Storage
   * Downloads slide images and replaces local brochure directory atomically
   */
  static async downloadBrochureFiles(
    brochureId: string,
    mrId: string,
    serverBrochureData: any
  ): Promise<BrochureDownloadResult> {
    try {
      const brochureDir = `${FileSystem.documentDirectory}brochures/${brochureId}/`;
      const slidesDir = `${brochureDir}slides/`;
      const tempDir = `${brochureDir}temp_${Date.now()}/`;
      const tempSlidesDir = `${tempDir}slides/`;

      // Create temp directory
      await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
      await FileSystem.makeDirectoryAsync(tempSlidesDir, { intermediates: true });

      try {
        // Parse server brochure data
        const serverData: BrochureData = typeof serverBrochureData === 'string'
          ? JSON.parse(serverBrochureData)
          : serverBrochureData;

        // Download slide images
        for (const slide of serverData.slides) {
          if (!slide.imageUri || slide.imageUri.startsWith('file://')) {
            // Already local or no image
            continue;
          }

          // Extract storage path from URL or construct it
          let storagePath: string;
          if (slide.imageUri.includes('/storage/v1/object/public/')) {
            // Extract path from public URL
            const urlParts = slide.imageUri.split('/storage/v1/object/public/');
            if (urlParts.length > 1) {
              const pathParts = urlParts[1].split('?');
              storagePath = pathParts[0].replace(`${BUCKET_NAME}/`, '');
            } else {
              // Fallback: construct path
              storagePath = `${mrId}/${brochureId}/slides/${slide.id}.jpg`;
            }
          } else {
            // Construct path from slide ID
            const extension = slide.imageUri.split('.').pop()?.toLowerCase() || 'jpg';
            storagePath = `${mrId}/${brochureId}/slides/${slide.id}.${extension}`;
          }

          try {
            // Download file from Supabase Storage
            const { data: fileData, error: downloadError } = await supabase.storage
              .from(BUCKET_NAME)
              .download(storagePath);

            if (downloadError || !fileData) {
              console.warn(`Failed to download slide ${slide.id}:`, downloadError);
              continue;
            }

            // Convert blob to base64
            const arrayBuffer = await fileData.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const binaryString = String.fromCharCode.apply(null, Array.from(uint8Array));
            const base64Data = btoa(binaryString);

            // Determine file extension
            const extension = storagePath.split('.').pop()?.toLowerCase() || 'jpg';
            const localFileName = `${slide.id}.${extension}`;
            const localFilePath = `${tempSlidesDir}${localFileName}`;

            // Save to temp directory
            await FileSystem.writeAsStringAsync(localFilePath, base64Data, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Update slide imageUri to local path
            slide.imageUri = localFilePath;
          } catch (error) {
            console.error(`Error downloading slide ${slide.id}:`, error);
            continue;
          }
        }

        // Match groups by server_id to prevent duplicates
        const existingBrochureResult = await BrochureManagementService.getBrochureData(brochureId);
        if (existingBrochureResult.success && existingBrochureResult.data) {
          const existingData = existingBrochureResult.data;
          const existingGroupsByServerId = new Map<string, SlideGroup>();
          
          existingData.groups.forEach(group => {
            if (group.server_id) {
              existingGroupsByServerId.set(group.server_id, group);
            }
          });

          // Merge groups: keep existing local groups that match server groups by server_id
          serverData.groups.forEach(serverGroup => {
            if (serverGroup.server_id) {
              const existingGroup = existingGroupsByServerId.get(serverGroup.server_id);
              if (existingGroup) {
                // Merge: keep local ID but update with server data
                Object.assign(existingGroup, {
                  ...serverGroup,
                  id: existingGroup.id, // Keep local ID
                });
              }
            }
          });
        }

        // Save brochure_data.json to temp directory
        await FileSystem.writeAsStringAsync(
          `${tempDir}brochure_data.json`,
          JSON.stringify(serverData, null, 2)
        );

        // Atomic replacement: delete old files and move temp files
        try {
          // Delete old brochure_data.json
          const oldDataPath = `${brochureDir}brochure_data.json`;
          const oldDataInfo = await FileSystem.getInfoAsync(oldDataPath);
          if (oldDataInfo.exists) {
            await FileSystem.deleteAsync(oldDataPath);
          }

          // Delete old slides directory
          const oldSlidesInfo = await FileSystem.getInfoAsync(slidesDir);
          if (oldSlidesInfo.exists) {
            await FileSystem.deleteAsync(slidesDir, { idempotent: true });
          }

          // Move temp files to final location
          // Copy brochure_data.json
          const tempDataPath = `${tempDir}brochure_data.json`;
          await FileSystem.copyAsync({
            from: tempDataPath,
            to: oldDataPath,
          });

          // Copy slides directory
          await FileSystem.copyAsync({
            from: tempSlidesDir,
            to: slidesDir,
          });

          // Clean up temp directory
          await FileSystem.deleteAsync(tempDir, { idempotent: true });

          return {
            success: true,
            brochureData: serverData,
          };
        } catch (replaceError) {
          console.error('Error replacing brochure files:', replaceError);
          // Try to restore from temp if possible
          throw replaceError;
        }
      } catch (error) {
        // Clean up temp directory on error
        try {
          await FileSystem.deleteAsync(tempDir, { idempotent: true });
        } catch (cleanupError) {
          console.error('Error cleaning up temp directory:', cleanupError);
        }
        throw error;
      }
    } catch (error) {
      console.error('BrochureFileDownload: Error downloading files:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download brochure files',
      };
    }
  }

  /**
   * Match groups by server_id when applying downloaded changes
   */
  static matchGroupsByServerId(
    localGroups: SlideGroup[],
    serverGroups: SlideGroup[]
  ): SlideGroup[] {
    const matchedGroups: SlideGroup[] = [];
    const localGroupsByServerId = new Map<string, SlideGroup>();

    // Index local groups by server_id
    localGroups.forEach(group => {
      if (group.server_id) {
        localGroupsByServerId.set(group.server_id, group);
      }
    });

    // Match server groups with local groups
    serverGroups.forEach(serverGroup => {
      if (serverGroup.server_id) {
        const localGroup = localGroupsByServerId.get(serverGroup.server_id);
        if (localGroup) {
          // Merge: keep local ID but update with server data
          matchedGroups.push({
            ...serverGroup,
            id: localGroup.id, // Keep local ID
          });
        } else {
          // New group from server
          matchedGroups.push(serverGroup);
        }
      } else {
        // Server group without server_id, add as new
        matchedGroups.push(serverGroup);
      }
    });

    // Add local groups that don't have server_id (not synced yet)
    localGroups.forEach(localGroup => {
      if (!localGroup.server_id) {
        matchedGroups.push(localGroup);
      }
    });

    return matchedGroups;
  }
}

