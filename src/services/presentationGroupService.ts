/**
 * Presentation Group Service
 * Manages doctor-based presentation groups
 */
import { supabase } from './supabase'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface PresentationGroup {
  id: string
  name: string
  doctorId: string
  doctorName: string
  brochureId: string
  brochureTitle: string
  createdBy: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface GroupDoctor {
  doctor_id: string
  first_name: string
  last_name: string
  specialty: string
  hospital: string
  profile_image_url?: string
}

export class PresentationGroupService {
  /**
   * Get available doctors for group creation
   */
  static async getAvailableDoctors(mrId: string): Promise<{ success: boolean; data?: GroupDoctor[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_mr_assigned_doctors', { p_mr_id: mrId })

      if (error) {
        return { success: false, error: error.message }
      }

      // Transform data to GroupDoctor format
      const doctors: GroupDoctor[] = (data || []).map((doctor: any) => ({
        doctor_id: doctor.doctor_id,
        first_name: doctor.first_name,
        last_name: doctor.last_name,
        specialty: doctor.specialty,
        hospital: doctor.hospital,
        profile_image_url: doctor.profile_image_url
      }))

      return { success: true, data: doctors }
    } catch (error) {
      return { success: false, error: 'Failed to fetch available doctors' }
    }
  }

  /**
   * Create a new presentation group
   */
  static async createGroup(
    groupData: {
      name: string
      doctorId: string
      brochureId: string
      brochureTitle: string
      createdBy: string
      notes?: string
    }
  ): Promise<{ success: boolean; data?: PresentationGroup; error?: string }> {
    try {
      const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const newGroup: PresentationGroup = {
        id: groupId,
        name: groupData.name,
        doctorId: groupData.doctorId,
        doctorName: groupData.name, // Group name is doctor name
        brochureId: groupData.brochureId,
        brochureTitle: groupData.brochureTitle,
        createdBy: groupData.createdBy,
        notes: groupData.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      // Save to local storage for now (can be enhanced to use server later)
      const key = `presentation_groups_${groupData.createdBy}`
      const existingGroups = await this.getStoredGroups(groupData.createdBy)
      const updatedGroups = [...existingGroups, newGroup]
      
      await AsyncStorage.setItem(key, JSON.stringify(updatedGroups))

      console.log('Presentation group created:', newGroup)
      return { success: true, data: newGroup }
    } catch (error) {
      console.error('Error creating group:', error)
      return { success: false, error: 'Failed to create group' }
    }
  }

  /**
   * Get stored groups for a user
   */
  static async getStoredGroups(userId: string): Promise<PresentationGroup[]> {
    try {
      const key = `presentation_groups_${userId}`
      const storedData = await AsyncStorage.getItem(key)
      return storedData ? JSON.parse(storedData) : []
    } catch (error) {
      console.error('Error getting stored groups:', error)
      return []
    }
  }

  /**
   * Get groups for a specific brochure
   */
  static async getGroupsForBrochure(
    userId: string, 
    brochureId: string
  ): Promise<{ success: boolean; data?: PresentationGroup[]; error?: string }> {
    try {
      const allGroups = await this.getStoredGroups(userId)
      const brochureGroups = allGroups.filter(group => group.brochureId === brochureId)
      
      return { success: true, data: brochureGroups }
    } catch (error) {
      return { success: false, error: 'Failed to get brochure groups' }
    }
  }

  /**
   * Delete a presentation group
   */
  static async deleteGroup(
    userId: string, 
    groupId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const key = `presentation_groups_${userId}`
      const existingGroups = await this.getStoredGroups(userId)
      const updatedGroups = existingGroups.filter(group => group.id !== groupId)
      
      await AsyncStorage.setItem(key, JSON.stringify(updatedGroups))
      
      console.log('Presentation group deleted:', groupId)
      return { success: true }
    } catch (error) {
      console.error('Error deleting group:', error)
      return { success: false, error: 'Failed to delete group' }
    }
  }

  /**
   * Update group notes
   */
  static async updateGroupNotes(
    userId: string,
    groupId: string,
    notes: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const key = `presentation_groups_${userId}`
      const existingGroups = await this.getStoredGroups(userId)
      const updatedGroups = existingGroups.map(group => 
        group.id === groupId 
          ? { ...group, notes, updatedAt: new Date().toISOString() }
          : group
      )
      
      await AsyncStorage.setItem(key, JSON.stringify(updatedGroups))
      
      console.log('Group notes updated:', groupId)
      return { success: true }
    } catch (error) {
      console.error('Error updating group notes:', error)
      return { success: false, error: 'Failed to update group notes' }
    }
  }
}
