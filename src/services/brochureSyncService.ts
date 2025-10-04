import { supabase } from './supabase'
import { BrochureSlide, SlideGroup } from './brochureManagementService'

export interface BrochureSyncData {
  slides: BrochureSlide[]
  groups: SlideGroup[]
  totalSlides: number
  lastModified: string
  brochureTitle: string
}

export interface BrochureSyncStatus {
  hasServerChanges: boolean
  needsDownload: boolean
  serverLastModified?: string
  localLastModified?: string
}

export interface BrochureChangeInfo {
  brochureId: string
  brochureTitle: string
  lastModified: string
  hasChanges: boolean
}

class BrochureSyncService {
  /**
   * Save brochure changes to server
   */
  async saveBrochureChanges(
    mrId: string,
    brochureId: string,
    brochureTitle: string,
    brochureData: BrochureSyncData
  ): Promise<{ success: boolean; error?: string; lastModified?: string }> {
    try {
      const { data, error } = await supabase.rpc('save_brochure_changes', {
        p_mr_id: mrId,
        p_brochure_id: brochureId,
        p_brochure_title: brochureTitle,
        p_brochure_data: brochureData
      })

      if (error) {
        console.error('Error saving brochure changes:', error)
        return { success: false, error: error.message }
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to save brochure changes' }
      }

      return { 
        success: true, 
        lastModified: data.last_modified 
      }
    } catch (error) {
      console.error('Brochure sync save error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }
    }
  }

  /**
   * Get all brochure changes for MR user
   */
  async getBrochureChanges(mrId: string): Promise<{ 
    success: boolean; 
    data?: BrochureChangeInfo[]; 
    error?: string 
  }> {
    try {
      const { data, error } = await supabase.rpc('get_brochure_changes', {
        p_mr_id: mrId
      })

      if (error) {
        console.error('Error getting brochure changes:', error)
        return { success: false, error: error.message }
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to get brochure changes' }
      }

      return { 
        success: true, 
        data: data.data || [] 
      }
    } catch (error) {
      console.error('Brochure sync get changes error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }
    }
  }

  /**
   * Get specific brochure sync data for download
   */
  async getBrochureSyncData(
    mrId: string,
    brochureId: string
  ): Promise<{ 
    success: boolean; 
    data?: BrochureSyncData; 
    error?: string 
  }> {
    try {
      const { data, error } = await supabase.rpc('get_brochure_sync_data', {
        p_mr_id: mrId,
        p_brochure_id: brochureId
      })

      if (error) {
        console.error('Error getting brochure sync data:', error)
        return { success: false, error: error.message }
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to get brochure sync data' }
      }

      return { 
        success: true, 
        data: data.data 
      }
    } catch (error) {
      console.error('Brochure sync get data error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }
    }
  }

  /**
   * Check if brochure has server changes
   */
  async checkBrochureSyncStatus(
    mrId: string,
    brochureId: string,
    localLastModified?: string
  ): Promise<{ 
    success: boolean; 
    data?: BrochureSyncStatus; 
    error?: string 
  }> {
    try {
      const { data, error } = await supabase.rpc('check_brochure_sync_status', {
        p_brochure_id: brochureId,
        p_local_last_modified: localLastModified || null,
        p_mr_id: mrId
      })

      if (error) {
        console.error('Error checking brochure sync status:', error)
        return { success: false, error: error.message }
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to check brochure sync status' }
      }

      return { 
        success: true, 
        data: {
          hasServerChanges: data.has_server_changes,
          needsDownload: data.needs_download,
          serverLastModified: data.server_last_modified,
          localLastModified: data.local_last_modified
        }
      }
    } catch (error) {
      console.error('Brochure sync status check error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }
    }
  }

  /**
   * Delete brochure sync data
   */
  async deleteBrochureSync(
    mrId: string,
    brochureId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('delete_brochure_sync', {
        p_mr_id: mrId,
        p_brochure_id: brochureId
      })

      if (error) {
        console.error('Error deleting brochure sync:', error)
        return { success: false, error: error.message }
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to delete brochure sync data' }
      }

      return { success: true }
    } catch (error) {
      console.error('Brochure sync delete error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }
    }
  }

  /**
   * Sync brochure changes to server (helper method)
   */
  async syncBrochureToServer(
    mrId: string,
    brochureId: string,
    brochureTitle: string,
    slides: BrochureSlide[],
    groups: SlideGroup[]
  ): Promise<{ success: boolean; error?: string; lastModified?: string }> {
    const brochureData: BrochureSyncData = {
      slides,
      groups,
      totalSlides: slides.length,
      lastModified: new Date().toISOString(),
      brochureTitle
    }

    return this.saveBrochureChanges(mrId, brochureId, brochureTitle, brochureData)
  }

  /**
   * Download brochure changes from server (helper method)
   */
  async downloadBrochureChanges(
    mrId: string,
    brochureId: string
  ): Promise<{ 
    success: boolean; 
    data?: BrochureSyncData; 
    error?: string 
  }> {
    return this.getBrochureSyncData(mrId, brochureId)
  }
}

export const brochureSyncService = new BrochureSyncService()
