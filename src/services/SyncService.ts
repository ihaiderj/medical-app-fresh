import { LocalDatabaseService } from './localDatabaseService'
import { MRService } from './MRService'
import { AuthService } from './AuthService'
import { NetworkService } from './networkService'
import { FileStorageService } from './fileStorageService'
import { BrochureManagementService } from './brochureManagementService'
import * as FileSystem from 'expo-file-system'
import { supabase } from './supabase'

export interface SyncResult {
  success: boolean
  synced: number
  failed: number
  message: string
  errors?: string[]
}

export interface SyncProgress {
  step: string
  message: string
  progress: number
  current?: number
  total?: number
}

export class SyncService {
  private static progressCallback: ((progress: SyncProgress) => void) | null = null

  /**
   * Set progress callback for sync operations
   */
  static onProgress(callback: (progress: SyncProgress) => void): () => void {
    this.progressCallback = callback
    return () => {
      this.progressCallback = null
    }
  }

  private static reportProgress(step: string, message: string, progress: number, current?: number, total?: number) {
    if (this.progressCallback) {
      this.progressCallback({ step, message, progress, current, total })
    }
  }

  /**
   * Sync up: Process pending operations from local queue to server
   */
  static async syncUp(): Promise<SyncResult> {
    console.log('🔄 SYNC UP: Starting sync up process...')
    
    try {
      // Check network connectivity
      const isOnline = await NetworkService.isOnline()
      if (!isOnline) {
        console.log('❌ SYNC UP: Device is offline, cannot sync')
        return {
          success: false,
          synced: 0,
          failed: 0,
          message: 'Device is offline. Please connect to the internet and try again.'
        }
      }

      // Test Supabase connectivity
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          const userResult = await AuthService.getCurrentUser()
          if (!userResult.success || !userResult.user) {
            console.log('❌ SYNC UP: User not authenticated')
            return {
              success: false,
              synced: 0,
              failed: 0,
              message: 'User not authenticated. Please login again.'
            }
          }
        }
      } catch (authError) {
        console.error('❌ SYNC UP: Auth check failed:', authError)
        return {
          success: false,
          synced: 0,
          failed: 0,
          message: 'Authentication failed. Please login again.'
        }
      }

      // Get current user
      const userResult = await AuthService.getCurrentUser()
      if (!userResult.success || !userResult.user) {
        return {
          success: false,
          synced: 0,
          failed: 0,
          message: 'User not authenticated'
        }
      }
      const userId = userResult.user.id

      // Get pending operations
      await LocalDatabaseService.ensureReady()
      const pendingOps = await LocalDatabaseService.getPendingSyncOperations()
      
      if (pendingOps.length === 0) {
        console.log('✅ SYNC UP: No pending operations to sync')
        return {
          success: true,
          synced: 0,
          failed: 0,
          message: 'No pending operations to sync'
        }
      }

      console.log(`🔄 SYNC UP: Found ${pendingOps.length} pending operations`)

      // Process operations in dependency order: doctors → meetings → notes → follow-ups → brochures
      const sortedOps = this.sortOperationsByDependency(pendingOps)
      
      let synced = 0
      let failed = 0
      const errors: string[] = []

      this.reportProgress('Processing', `Processing ${sortedOps.length} operations...`, 0, 0, sortedOps.length)

      for (let i = 0; i < sortedOps.length; i++) {
        const op = sortedOps[i]
        const progress = Math.round(((i + 1) / sortedOps.length) * 100)
        
        this.reportProgress(
          'Processing',
          `Syncing ${op.table_name} (${op.operation_type})...`,
          progress,
          i + 1,
          sortedOps.length
        )

        try {
          console.log(`🔄 SYNC UP: Processing operation ${i + 1}/${sortedOps.length}:`, {
            id: op.id,
            type: op.operation_type,
            table: op.table_name,
            recordId: op.record_id
          })

          let success = false

          switch (op.table_name) {
            case 'doctors':
              success = await this.syncDoctor(op, userId)
              break
            case 'meetings':
              success = await this.syncMeeting(op, userId)
              break
            case 'meeting_notes':
            case 'meeting_slide_notes':
              success = await this.syncMeetingNote(op, userId)
              break
            case 'meeting_followups':
              success = await this.syncMeetingFollowUp(op, userId)
              break
            case 'saved_brochures':
              success = await this.syncSavedBrochure(op, userId)
              break
            case 'brochure_sync':
              success = await this.syncBrochureChanges(op, userId)
              break
            case 'activity_logs':
              success = await this.syncActivityLog(op, userId)
              break
            default:
              console.warn(`⚠️ SYNC UP: Unknown table name: ${op.table_name}`)
              success = false
          }

          if (success) {
            await LocalDatabaseService.markOperationCompleted(op.id)
            synced++
            console.log(`✅ SYNC UP: Successfully synced operation ${op.id}`)
          } else {
            const errorMsg = `Failed to sync ${op.table_name} ${op.operation_type}`
            await LocalDatabaseService.markOperationFailed(op.id, errorMsg)
            failed++
            errors.push(errorMsg)
            console.error(`❌ SYNC UP: Failed to sync operation ${op.id}`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          await LocalDatabaseService.markOperationFailed(op.id, errorMsg)
          failed++
          errors.push(`Operation ${op.id}: ${errorMsg}`)
          console.error(`❌ SYNC UP: Exception syncing operation ${op.id}:`, error)
        }
      }

      const message = `Synced: ${synced}, Failed: ${failed}`
      console.log(`🔄 SYNC UP: Completed - ${message}`)

      this.reportProgress('Complete', message, 100, sortedOps.length, sortedOps.length)

      return {
        success: failed === 0,
        synced,
        failed,
        message,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (error) {
      console.error('❌ SYNC UP: Fatal error:', error)
      return {
        success: false,
        synced: 0,
        failed: 0,
        message: error instanceof Error ? error.message : 'Sync failed',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }

  /**
   * Sort operations by dependency order
   */
  private static sortOperationsByDependency(ops: any[]): any[] {
    const order = ['doctors', 'meetings', 'meeting_notes', 'meeting_slide_notes', 'meeting_followups', 'saved_brochures', 'brochure_sync', 'activity_logs']
    return ops.sort((a, b) => {
      const aIndex = order.indexOf(a.table_name)
      const bIndex = order.indexOf(b.table_name)
      if (aIndex === -1 && bIndex === -1) return 0
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
  }

  /**
   * Sync doctor operation
   */
  private static async syncDoctor(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC DOCTOR: ${op.operation_type}`, data)

      if (op.operation_type === 'create') {
        const result = await MRService.addDoctor(userId, {
          first_name: data.first_name,
          last_name: data.last_name,
          specialty: data.specialty,
          hospital: data.hospital,
          phone: data.phone,
          email: data.email,
          location: data.location,
          notes: data.notes,
          profile_image_url: data.profile_image_url
        })

        if (result.success && result.data) {
          // Update local record with server_id
          await LocalDatabaseService.updateDoctor(op.record_id, {
            server_id: result.data.doctor_id || result.data.id,
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'update') {
        if (!data.server_id) {
          console.warn('⚠️ SYNC DOCTOR: Cannot update doctor without server_id')
          return false
        }

        const result = await MRService.updateDoctor(data.server_id, {
          first_name: data.first_name,
          last_name: data.last_name,
          specialty: data.specialty,
          hospital: data.hospital,
          phone: data.phone,
          email: data.email,
          location: data.location,
          notes: data.notes,
          profile_image_url: data.profile_image_url
        })

        if (result.success) {
          await LocalDatabaseService.updateDoctor(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.warn('⚠️ SYNC DOCTOR: Cannot delete doctor without server_id')
          return false
        }

        const result = await MRService.deleteDoctor(data.server_id)
        if (result.success) {
          // Local record already marked as deleted, just update sync status
          await LocalDatabaseService.updateDoctor(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC DOCTOR: Error:', error)
      return false
    }
  }

  /**
   * Sync meeting operation
   */
  private static async syncMeeting(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC MEETING: ${op.operation_type}`, data)

      if (op.operation_type === 'create') {
        // Get doctor server_id
        const doctor = await LocalDatabaseService.getDoctorById(data.doctor_id)
        if (!doctor || !doctor.server_id) {
          console.error('❌ SYNC MEETING: Doctor not found or missing server_id')
          return false
        }

        const result = await MRService.createMeeting({
          mr_id: userId,
          doctor_id: doctor.server_id,
          brochure_id: data.brochure_id || '',
          brochure_title: data.brochure_title || '',
          title: data.title,
          purpose: data.purpose || '',
          scheduled_date: data.scheduled_date,
          duration_minutes: data.duration_minutes || 30
        })

        if (result.success && result.data) {
          // Update local record with server_id
          await LocalDatabaseService.updateMeeting(op.record_id, {
            server_id: result.data.meeting_id,
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'update') {
        if (!data.server_id) {
          console.warn('⚠️ SYNC MEETING: Cannot update meeting without server_id')
          return false
        }

        const result = await MRService.updateMeeting(data.server_id, {
          title: data.title,
          scheduled_date: data.scheduled_date,
          duration_minutes: data.duration_minutes,
          status: data.status,
          location: data.location,
          purpose: data.purpose,
          notes: data.notes
        })

        if (result.success) {
          await LocalDatabaseService.updateMeeting(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.warn('⚠️ SYNC MEETING: Cannot delete meeting without server_id')
          return false
        }

        const result = await MRService.deleteMeeting(data.server_id)
        if (result.success) {
          await LocalDatabaseService.updateMeeting(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC MEETING: Error:', error)
      return false
    }
  }

  /**
   * Sync meeting note operation
   */
  private static async syncMeetingNote(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC NOTE: ${op.operation_type}`, data)

      // Get meeting server_id
      const meeting = await LocalDatabaseService.getMeetingById(data.meeting_id)
      if (!meeting || !meeting.server_id) {
        console.error('❌ SYNC NOTE: Meeting not found or missing server_id')
        return false
      }

      if (op.operation_type === 'create') {
        const result = await MRService.addSlideNote({
          meeting_id: meeting.server_id,
          slide_id: data.slide_id,
          note_text: data.note_text || ''
        })

        if (result.success && result.data) {
          await LocalDatabaseService.updateMeetingSlideNote(op.record_id, {
            server_id: result.data.note_id || result.data.id,
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'update') {
        if (!data.server_id) {
          console.warn('⚠️ SYNC NOTE: Cannot update note without server_id')
          return false
        }

        const result = await MRService.updateSlideNote(data.server_id, data.note_text || '')
        if (result.success) {
          await LocalDatabaseService.updateMeetingSlideNote(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.warn('⚠️ SYNC NOTE: Cannot delete note without server_id')
          return false
        }

        const result = await MRService.deleteSlideNote(data.server_id)
        if (result.success) {
          await LocalDatabaseService.updateMeetingSlideNote(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC NOTE: Error:', error)
      return false
    }
  }

  /**
   * Sync meeting follow-up operation
   */
  private static async syncMeetingFollowUp(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC FOLLOW-UP: ${op.operation_type}`, data)

      // Get meeting server_id
      const meeting = await LocalDatabaseService.getMeetingById(data.meeting_id)
      if (!meeting || !meeting.server_id) {
        console.error('❌ SYNC FOLLOW-UP: Meeting not found or missing server_id')
        return false
      }

      if (op.operation_type === 'create') {
        const result = await MRService.createMeetingFollowUp({
          meeting_id: meeting.server_id,
          follow_up_date: data.follow_up_date,
          follow_up_time: data.follow_up_time,
          follow_up_notes: data.follow_up_notes || ''
        })

        if (result.success && result.data) {
          const followUpId = result.data.followup_id || result.data.id
          await LocalDatabaseService.updateMeetingFollowUp(op.record_id, {
            server_id: followUpId,
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'update') {
        if (!data.server_id) {
          console.warn('⚠️ SYNC FOLLOW-UP: Cannot update follow-up without server_id')
          return false
        }

        const result = await MRService.updateMeetingFollowUp(data.server_id, {
          follow_up_date: data.follow_up_date,
          follow_up_time: data.follow_up_time,
          follow_up_notes: data.follow_up_notes || ''
        })

        if (result.success) {
          await LocalDatabaseService.updateMeetingFollowUp(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.warn('⚠️ SYNC FOLLOW-UP: Cannot delete follow-up without server_id')
          return false
        }

        const result = await MRService.deleteMeetingFollowUp(data.server_id)
        if (result.success) {
          await LocalDatabaseService.updateMeetingFollowUp(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC FOLLOW-UP: Error:', error)
      return false
    }
  }

  /**
   * Sync saved brochure operation
   */
  private static async syncSavedBrochure(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC SAVED BROCHURE: ${op.operation_type}`, data)

      if (op.operation_type === 'create') {
        const result = await MRService.saveBrochureForMr(
          userId,
          data.brochure_id,
          data.custom_title
        )

        if (result.success && result.data) {
          await LocalDatabaseService.updateSavedBrochure(op.record_id, {
            server_id: result.data.id,
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'update') {
        // For updates, we need brochure_id from data
        if (!data.brochure_id) {
          console.warn('⚠️ SYNC SAVED BROCHURE: Cannot update saved brochure without brochure_id')
          return false
        }

        const result = await MRService.updateSavedBrochureTitle(
          userId,
          data.brochure_id,
          data.custom_title
        )

        if (result.success) {
          await LocalDatabaseService.updateSavedBrochure(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      } else if (op.operation_type === 'delete') {
        if (!data.brochure_id) {
          console.warn('⚠️ SYNC SAVED BROCHURE: Cannot delete saved brochure without brochure_id')
          return false
        }

        const result = await MRService.removeSavedBrochureForMr(userId, data.brochure_id)
        if (result.success) {
          await LocalDatabaseService.updateSavedBrochure(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        return false
      }
      return false
    } catch (error) {
      console.error('❌ SYNC SAVED BROCHURE: Error:', error)
      return false
    }
  }

  /**
   * Sync brochure changes (slides, groups, etc.)
   */
  private static async syncBrochureChanges(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC BROCHURE CHANGES: ${op.operation_type}`, {
        brochureId: data.brochureId,
        title: data.title,
        slidesCount: data.slides?.length || 0,
        groupsCount: data.groups?.length || 0
      })

      const brochureId = data.brochureId
      if (!brochureId) {
        console.error('❌ SYNC BROCHURE CHANGES: Missing brochureId')
        return false
      }

      // Get brochure data
      const brochureResult = await BrochureManagementService.getBrochureData(brochureId)
      if (!brochureResult.success || !brochureResult.data) {
        console.error('❌ SYNC BROCHURE CHANGES: Brochure data not found')
        return false
      }

      const brochureData = brochureResult.data
      const slides = brochureData.slides || []
      const groups = brochureData.groups || []

      // Upload slide images
      console.log(`🔄 SYNC BROCHURE CHANGES: Uploading ${slides.length} slide images...`)
      const slideUploadPromises = slides.map(async (slide: any) => {
        if (!slide.imageUri) {
          console.warn(`⚠️ SYNC BROCHURE CHANGES: Slide ${slide.id} has no imageUri`)
          return null
        }

        try {
          const fileName = `${slide.id}.jpg`
          const filePath = `${userId}/${brochureId}/slides/${fileName}`
          
          console.log(`🔄 SYNC BROCHURE CHANGES: Uploading slide image: ${fileName}`)
          const uploadResult = await FileStorageService.uploadFile(
            slide.imageUri,
            fileName
          )

          if (uploadResult.success && uploadResult.publicUrl) {
            console.log(`✅ SYNC BROCHURE CHANGES: Slide image uploaded successfully: ${fileName}`)
            return { slideId: slide.id, url: uploadResult.publicUrl }
          } else {
            console.error(`❌ SYNC BROCHURE CHANGES: Failed to upload slide image: ${fileName}`, uploadResult.error)
            return null
          }
        } catch (error) {
          console.error(`❌ SYNC BROCHURE CHANGES: Exception uploading slide ${slide.id}:`, error)
          return null
        }
      })

      const slideUploadResults = await Promise.all(slideUploadPromises)
      const successfulUploads = slideUploadResults.filter(r => r !== null)

      // Upload brochure_data.json
      console.log(`🔄 SYNC BROCHURE CHANGES: Uploading brochure_data.json...`)
      const brochureDataPath = `${FileSystem.documentDirectory}brochures/${brochureId}/brochure_data.json`
      const brochureDataInfo = await FileSystem.getInfoAsync(brochureDataPath)
      
      let brochureDataUrl: string | undefined
      if (brochureDataInfo.exists) {
        try {
          const uploadResult = await FileStorageService.uploadFile(
            brochureDataPath,
            `${userId}/${brochureId}/brochure_data.json`
          )

          if (!uploadResult.success || !uploadResult.publicUrl) {
            console.error(`❌ SYNC BROCHURE CHANGES: Failed to upload brochure_data.json:`, uploadResult.error)
            return false
          }

          brochureDataUrl = uploadResult.publicUrl
          console.log(`✅ SYNC BROCHURE CHANGES: brochure_data.json uploaded successfully: ${brochureDataUrl}`)
        } catch (error) {
          console.error(`❌ SYNC BROCHURE CHANGES: Exception uploading brochure_data.json:`, error)
          return false
        }
      } else {
        console.error(`❌ SYNC BROCHURE CHANGES: brochure_data.json file not found`)
        return false
      }

      // Call RPC to save brochure changes metadata
      this.reportProgress('Updating Brochure Metadata', 'Saving brochure changes to server...', 90)
      console.log(`🔄 SYNC BROCHURE CHANGES: Saving brochure changes metadata to server...`)
      
      if (op.operation_type === 'create' || op.operation_type === 'update') {
        const saveResult = await MRService.saveBrochureChanges({
          mr_id: userId,
          brochure_id: brochureId,
          brochure_title: brochureData.title,
          brochure_data_url: brochureDataUrl,
          last_modified: brochureData.updatedAt || brochureData.localLastModified || new Date().toISOString()
        })

        if (saveResult.success && saveResult.data) {
          // Update local brochure_sync record with server_id
          await LocalDatabaseService.updateBrochureSync(op.record_id, {
            server_id: saveResult.data.id,
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          console.log(`✅ SYNC BROCHURE CHANGES: Successfully synced brochure changes (${successfulUploads.length}/${slides.length} slides uploaded)`)
          return true
        } else {
          console.error(`❌ SYNC BROCHURE CHANGES: Failed to save brochure changes metadata:`, saveResult.error)
          return false
        }
      } else if (op.operation_type === 'delete') {
        if (!data.server_id) {
          console.warn(`⚠️ SYNC BROCHURE CHANGES: Skipping delete for local brochure sync ${op.record_id} as server_id is missing.`)
          return true // Treat as successful for local queue
        }
        const deleteResult = await MRService.deleteBrochureSync(userId, brochureId)
        if (deleteResult.success) {
          await LocalDatabaseService.updateBrochureSync(op.record_id, {
            sync_status: 'synced'
          }, true) // skipSyncQueue = true
          return true
        }
        console.error(`❌ SYNC BROCHURE CHANGES: Failed to delete brochure sync:`, deleteResult.error)
        return false
      }
      
      return false
    } catch (error) {
      console.error('❌ SYNC BROCHURE CHANGES: Error:', error)
      return false
    }
  }

  /**
   * Sync activity log operation
   */
  private static async syncActivityLog(op: any, userId: string): Promise<boolean> {
    try {
      const data = typeof op.data === 'string' ? JSON.parse(op.data) : op.data
      console.log(`🔄 SYNC ACTIVITY LOG: ${op.operation_type}`, data)

      if (op.operation_type === 'create') {
        const result = await MRService.logActivity(
          userId,
          data.activity_type,
          data.description,
          data.metadata
        )

        if (result.success) {
          // Mark local activity as synced
          // TODO: Update local activity log sync status if method exists
          return true
        }
        return false
      }

      return false
    } catch (error) {
      console.error('❌ SYNC ACTIVITY LOG: Error:', error)
      return false
    }
  }

  /**
   * Sync down: Download data from server to local database
   */
  static async syncDown(userId: string): Promise<SyncResult> {
    console.log('⬇️ SYNC DOWN: Starting sync down process...')
    
    try {
      // Check network connectivity
      const isOnline = await NetworkService.isOnline()
      if (!isOnline) {
        console.log('❌ SYNC DOWN: Device is offline, cannot sync')
        return {
          success: false,
          synced: 0,
          failed: 0,
          message: 'Device is offline. Please connect to the internet and try again.'
        }
      }

      await LocalDatabaseService.ensureReady()

      let synced = 0
      let failed = 0
      const errors: string[] = []

      // Download doctors
      this.reportProgress('Downloading', 'Downloading doctors...', 10)
      console.log('⬇️ SYNC DOWN: Downloading doctors...')
      try {
        const doctorsResult = await MRService.getDoctors(userId)
        if (doctorsResult.success && doctorsResult.data) {
          for (const doctor of doctorsResult.data) {
            try {
              await LocalDatabaseService.upsertDoctor({
                id: `doctor_${doctor.doctor_id}`,
                server_id: doctor.doctor_id,
                mr_id: userId,
                first_name: doctor.first_name,
                last_name: doctor.last_name,
                specialty: doctor.specialty,
                hospital: doctor.hospital,
                phone: doctor.phone,
                email: doctor.email,
                location: doctor.location,
                notes: doctor.notes,
                profile_image_url: null,
                created_at: doctor.created_at,
                updated_at: doctor.created_at,
                sync_status: 'synced',
                is_deleted: false
              })
              synced++
            } catch (error) {
              failed++
              errors.push(`Doctor ${doctor.doctor_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
          }
          console.log(`✅ SYNC DOWN: Downloaded ${doctorsResult.data.length} doctors`)
        }
      } catch (error) {
        failed++
        errors.push(`Doctors: ${error instanceof Error ? error.message : 'Unknown error'}`)
        console.error('❌ SYNC DOWN: Failed to download doctors:', error)
      }

      // Download meetings
      this.reportProgress('Downloading', 'Downloading meetings...', 30)
      console.log('⬇️ SYNC DOWN: Downloading meetings...')
      try {
        const meetingsResult = await MRService.getMeetings(userId)
        if (meetingsResult.success && meetingsResult.data) {
          for (const meeting of meetingsResult.data) {
            try {
              // Get doctor local ID
              const doctor = await LocalDatabaseService.getDoctorByServerId(meeting.doctor_id)
              if (!doctor) {
                console.warn(`⚠️ SYNC DOWN: Doctor ${meeting.doctor_id} not found locally, skipping meeting`)
                failed++
                continue
              }

              await LocalDatabaseService.upsertMeeting({
                id: `meeting_${meeting.meeting_id}`,
                server_id: meeting.meeting_id,
                mr_id: userId,
                doctor_id: doctor.id,
                doctor_server_id: meeting.doctor_id,
                brochure_id: meeting.brochure_id || null,
                title: meeting.title,
                scheduled_date: meeting.scheduled_date || meeting.meeting_date,
                duration_minutes: meeting.duration_minutes || 30,
                status: meeting.status,
                location: meeting.hospital || null,
                purpose: meeting.purpose || null,
                notes: meeting.notes || null,
                follow_up_required: meeting.follow_up_required || false,
                follow_up_date: meeting.follow_up_date || null,
                follow_up_time: meeting.follow_up_time || null,
                follow_up_notes: meeting.follow_up_notes || null,
                created_at: meeting.created_at,
                updated_at: meeting.updated_at || meeting.created_at,
                sync_status: 'synced',
                is_deleted: false
              })
              synced++
            } catch (error) {
              failed++
              errors.push(`Meeting ${meeting.meeting_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
          }
          console.log(`✅ SYNC DOWN: Downloaded ${meetingsResult.data.length} meetings`)
        }
      } catch (error) {
        failed++
        errors.push(`Meetings: ${error instanceof Error ? error.message : 'Unknown error'}`)
        console.error('❌ SYNC DOWN: Failed to download meetings:', error)
      }

      // Download meeting follow-ups
      this.reportProgress('Downloading', 'Downloading follow-ups...', 60)
      console.log('⬇️ SYNC DOWN: Downloading meeting follow-ups...')
      try {
        const meetings = await LocalDatabaseService.getMeetings(userId)
        for (const meeting of meetings) {
          if (meeting.server_id) {
            try {
              const followUpsResult = await MRService.getMeetingFollowUps(meeting.server_id)
              if (followUpsResult.success && followUpsResult.data) {
                for (const followUp of followUpsResult.data) {
                  try {
                    await LocalDatabaseService.upsertMeetingFollowUp({
                      id: `followup_${followUp.followup_id}`,
                      server_id: followUp.followup_id,
                      meeting_id: meeting.id,
                      meeting_server_id: meeting.server_id,
                      follow_up_date: followUp.follow_up_date,
                      follow_up_time: followUp.follow_up_time,
                      follow_up_notes: followUp.follow_up_notes || null,
                      created_at: followUp.created_at,
                      updated_at: followUp.updated_at || followUp.created_at,
                      sync_status: 'synced',
                      is_deleted: false
                    })
                    synced++
                  } catch (error) {
                    failed++
                    errors.push(`Follow-up ${followUp.followup_id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
                  }
                }
              }
            } catch (error) {
              console.warn(`⚠️ SYNC DOWN: Failed to download follow-ups for meeting ${meeting.server_id}:`, error)
            }
          }
        }
      } catch (error) {
        console.error('❌ SYNC DOWN: Failed to download follow-ups:', error)
      }

      // Download saved brochures
      this.reportProgress('Downloading', 'Downloading saved brochures...', 70)
      console.log('⬇️ SYNC DOWN: Downloading saved brochures...')
      try {
        const savedBrochuresResult = await MRService.getSavedBrochuresForMr(userId)
        if (savedBrochuresResult.success && savedBrochuresResult.data) {
          for (const savedBrochure of savedBrochuresResult.data) {
            try {
              await LocalDatabaseService.upsertSavedBrochure({
                id: `saved_${userId}_${savedBrochure.brochure_id}`,
                server_id: savedBrochure.id,
                mr_id: userId,
                brochure_id: savedBrochure.brochure_id,
                brochure_title: savedBrochure.brochure_title,
                custom_title: savedBrochure.custom_title,
                original_brochure_data: JSON.stringify(savedBrochure.original_brochure_data),
                saved_at: savedBrochure.saved_at,
                last_accessed: savedBrochure.last_accessed,
                created_at: savedBrochure.saved_at,
                version: 1,
                sync_status: 'synced',
                is_deleted: false
              })
              synced++
            } catch (error) {
              console.error(`❌ SYNC DOWN: Failed to upsert saved brochure ${savedBrochure.brochure_id}:`, error)
              failed++
              errors.push(`Failed to upsert saved brochure ${savedBrochure.brochure_id}: ${error instanceof Error ? error.message : String(error)}`)
            }
          }
          console.log(`✅ SYNC DOWN: Downloaded ${savedBrochuresResult.data.length} saved brochures`)
        } else if (savedBrochuresResult.error) {
          throw new Error(savedBrochuresResult.error)
        }
      } catch (err) {
        console.error('❌ SYNC DOWN: Failed to download saved brochures:', err)
        failed++
        errors.push(`Failed to download saved brochures: ${err instanceof Error ? err.message : String(err)}`)
      }

      // Download brochure sync data (brochure modifications)
      this.reportProgress('Downloading', 'Downloading brochure modifications...', 85)
      console.log('⬇️ SYNC DOWN: Downloading brochure modifications...')
      try {
        const brochureChangesResult = await MRService.getBrochureChangesForMr(userId)
        if (brochureChangesResult.success && brochureChangesResult.data) {
          for (const change of brochureChangesResult.data) {
            try {
              // Get full brochure sync data
              const syncDataResult = await MRService.getBrochureSyncData(userId, change.brochure_id)
              if (syncDataResult.success && syncDataResult.data) {
                const syncData = syncDataResult.data
                // Get the actual server_id from the brochure_sync table
                const { data: syncRecord } = await supabase
                  .from('brochure_sync')
                  .select('id')
                  .eq('mr_id', userId)
                  .eq('brochure_id', change.brochure_id)
                  .single()
                
                await LocalDatabaseService.upsertBrochureSync({
                  id: `brochure_sync_${userId}_${change.brochure_id}`,
                  server_id: syncRecord?.id || undefined,
                  mr_id: userId,
                  brochure_id: change.brochure_id,
                  brochure_title: change.brochure_title,
                  brochure_data: JSON.stringify(syncData),
                  last_modified: change.last_modified,
                  created_at: change.last_modified,
                  version: 1,
                  sync_status: 'synced',
                  is_deleted: false
                })
                synced++
              }
            } catch (error) {
              console.error(`❌ SYNC DOWN: Failed to download brochure sync data for ${change.brochure_id}:`, error)
              failed++
              errors.push(`Failed to download brochure sync data for ${change.brochure_id}: ${error instanceof Error ? error.message : String(error)}`)
            }
          }
          console.log(`✅ SYNC DOWN: Downloaded ${brochureChangesResult.data.length} brochure modifications`)
        } else if (brochureChangesResult.error) {
          throw new Error(brochureChangesResult.error)
        }
      } catch (err) {
        console.error('❌ SYNC DOWN: Failed to download brochure modifications:', err)
        failed++
        errors.push(`Failed to download brochure modifications: ${err instanceof Error ? err.message : String(err)}`)
      }

      this.reportProgress('Complete', `Downloaded: ${synced}, Failed: ${failed}`, 100)

      const message = `Downloaded: ${synced}, Failed: ${failed}`
      console.log(`⬇️ SYNC DOWN: Completed - ${message}`)

      return {
        success: failed === 0,
        synced,
        failed,
        message,
        errors: errors.length > 0 ? errors : undefined
      }
    } catch (error) {
      console.error('❌ SYNC DOWN: Fatal error:', error)
      return {
        success: false,
        synced: 0,
        failed: 0,
        message: error instanceof Error ? error.message : 'Sync down failed',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }
}

