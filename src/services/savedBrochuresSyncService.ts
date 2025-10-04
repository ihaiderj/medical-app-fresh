import { supabase } from './supabase'
import { MRAssignedBrochure } from './MRService'

export interface SavedBrochureServerData {
  brochure_id: string
  brochure_title: string
  custom_title: string
  original_brochure_data: MRAssignedBrochure
  saved_at: string
  last_accessed: string
}

export interface SavedBrochuresSyncService {
  saveBrochureToServer: (
    mrId: string,
    brochureId: string,
    brochureTitle: string,
    customTitle: string,
    originalBrochureData: MRAssignedBrochure
  ) => Promise<{ success: boolean; error?: string }>
  
  getSavedBrochuresFromServer: (
    mrId: string
  ) => Promise<{ success: boolean; data?: SavedBrochureServerData[]; error?: string }>
  
  removeSavedBrochureFromServer: (
    mrId: string,
    brochureId: string
  ) => Promise<{ success: boolean; error?: string }>
  
  updateSavedBrochureTitle: (
    mrId: string,
    brochureId: string,
    newCustomTitle: string
  ) => Promise<{ success: boolean; error?: string }>
  
  updateSavedBrochureAccess: (
    mrId: string,
    brochureId: string
  ) => Promise<{ success: boolean; error?: string }>
}

export const savedBrochuresSyncService: SavedBrochuresSyncService = {
  async saveBrochureToServer(
    mrId: string,
    brochureId: string,
    brochureTitle: string,
    customTitle: string,
    originalBrochureData: MRAssignedBrochure
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('save_brochure_for_mr', {
        p_mr_id: mrId,
        p_brochure_id: brochureId,
        p_brochure_title: brochureTitle,
        p_custom_title: customTitle,
        p_original_brochure_data: originalBrochureData
      })

      if (error) {
        console.error('Error saving brochure to server:', error)
        return { success: false, error: error.message }
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to save brochure' }
      }

      return { success: true }
    } catch (error) {
      console.error('Error saving brochure to server:', error)
      return { success: false, error: 'Network error while saving brochure' }
    }
  },

  async getSavedBrochuresFromServer(
    mrId: string
  ): Promise<{ success: boolean; data?: SavedBrochureServerData[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_saved_brochures_for_mr', {
        p_mr_id: mrId
      })

      if (error) {
        console.error('Error getting saved brochures from server:', error)
        return { success: false, error: error.message }
      }

      return { success: true, data: data || [] }
    } catch (error) {
      console.error('Error getting saved brochures from server:', error)
      return { success: false, error: 'Network error while fetching saved brochures' }
    }
  },

  async removeSavedBrochureFromServer(
    mrId: string,
    brochureId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('remove_saved_brochure_for_mr', {
        p_mr_id: mrId,
        p_brochure_id: brochureId
      })

      if (error) {
        console.error('Error removing saved brochure from server:', error)
        return { success: false, error: error.message }
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to remove saved brochure' }
      }

      return { success: true }
    } catch (error) {
      console.error('Error removing saved brochure from server:', error)
      return { success: false, error: 'Network error while removing saved brochure' }
    }
  },

  async updateSavedBrochureTitle(
    mrId: string,
    brochureId: string,
    newCustomTitle: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('update_saved_brochure_title', {
        p_mr_id: mrId,
        p_brochure_id: brochureId,
        p_new_custom_title: newCustomTitle
      })

      if (error) {
        console.error('Error updating saved brochure title:', error)
        return { success: false, error: error.message }
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to update title' }
      }

      return { success: true }
    } catch (error) {
      console.error('Error updating saved brochure title:', error)
      return { success: false, error: 'Network error while updating title' }
    }
  },

  async updateSavedBrochureAccess(
    mrId: string,
    brochureId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('update_saved_brochure_access', {
        p_mr_id: mrId,
        p_brochure_id: brochureId
      })

      if (error) {
        console.error('Error updating saved brochure access:', error)
        return { success: false, error: error.message }
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to update access time' }
      }

      return { success: true }
    } catch (error) {
      console.error('Error updating saved brochure access:', error)
      return { success: false, error: 'Network error while updating access time' }
    }
  }
}
