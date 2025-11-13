/**
 * Advanced Sync Service
 * Handles intelligent bidirectional synchronization with conflict resolution
 */
import { NetworkService } from './networkService';
import { LocalDatabaseService, SyncOperation, LocalDoctor, LocalMeeting, LocalMeetingNote } from './localDatabaseService';
import { MRService } from './MRService';
import { AuthService } from './AuthService';

export interface SyncResult {
  success: boolean;
  conflicts: Conflict[];
  errors: string[];
  syncedOperations: number;
  failedOperations: number;
}

export interface Conflict {
  type: 'doctor' | 'meeting' | 'note';
  localData: any;
  serverData: any;
  resolution?: 'local_wins' | 'server_wins' | 'merge' | 'manual';
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: number;
  pendingOperations: number;
  hasConflicts: boolean;
}

export class AdvancedSyncService {
  private static isSyncing = false;
  private static lastSyncTime = 0;
  private static syncStatusListeners: ((status: SyncStatus) => void)[] = [];

  /**
   * Initialize sync service
   */
  static async initialize(): Promise<void> {
    console.log('AdvancedSync: Initializing sync service...');
    
    // Set up network monitoring for auto-sync
    NetworkService.addListener(async (networkState) => {
      if (networkState.isConnected && networkState.isInternetReachable) {
        console.log('AdvancedSync: Network connected - starting auto-sync');
        // Wait a bit for network to stabilize
        setTimeout(() => {
          this.performIncrementalSync();
        }, 2000);
      }
    });

    // Perform initial sync if online
    if (await NetworkService.isOnline()) {
      await this.performIncrementalSync();
    }

    console.log('AdvancedSync: Service initialized');
  }

  /**
   * Perform full bidirectional sync
   */
  static async performFullSync(userId?: string): Promise<SyncResult> {
    if (this.isSyncing) {
      console.log('AdvancedSync: Sync already in progress');
      return { success: false, conflicts: [], errors: ['Sync already in progress'], syncedOperations: 0, failedOperations: 0 };
    }

    if (!(await NetworkService.isOnline())) {
      console.log('AdvancedSync: Cannot sync - offline');
      return { success: false, conflicts: [], errors: ['Device is offline'], syncedOperations: 0, failedOperations: 0 };
    }

    this.isSyncing = true;
    const result: SyncResult = { success: true, conflicts: [], errors: [], syncedOperations: 0, failedOperations: 0 };

    try {
      console.log('AdvancedSync: Starting full bidirectional sync...');
      this.notifyStatusListeners();

      // Get userId from parameter or AuthService
      let userIdToUse: string | undefined = userId;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          throw new Error('User not authenticated');
        }
        userIdToUse = userResult.user.id;
      }

      const finalUserId: string = userIdToUse;

      // 1. Upload local changes first (to avoid conflicts with our own data)
      console.log('AdvancedSync: Step 1 - Uploading local changes...');
      await this.uploadLocalChanges(finalUserId, result);

      // 2. Download server changes
      console.log('AdvancedSync: Step 2 - Downloading server changes...');
      await this.downloadServerChanges(finalUserId, result);

      // 3. Resolve any conflicts
      if (result.conflicts.length > 0) {
        console.log('AdvancedSync: Step 3 - Resolving conflicts...');
        await this.resolveConflicts(result.conflicts);
      }

      // 4. Clean up completed operations
      console.log('AdvancedSync: Step 4 - Cleaning up...');
      await LocalDatabaseService.clearCompletedOperations();

      this.lastSyncTime = Date.now();
      console.log(`AdvancedSync: Full sync completed - ${result.syncedOperations} synced, ${result.failedOperations} failed, ${result.conflicts.length} conflicts`);

    } catch (error) {
      console.error('AdvancedSync: Full sync failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    } finally {
      this.isSyncing = false;
      this.notifyStatusListeners();
    }

    return result;
  }

  /**
   * Perform incremental sync (only pending operations)
   */
  static async performIncrementalSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, conflicts: [], errors: ['Sync in progress'], syncedOperations: 0, failedOperations: 0 };
    }

    if (!(await NetworkService.isOnline())) {
      return { success: false, conflicts: [], errors: ['Offline'], syncedOperations: 0, failedOperations: 0 };
    }

    this.isSyncing = true;
    const result: SyncResult = { success: true, conflicts: [], errors: [], syncedOperations: 0, failedOperations: 0 };

    try {
      console.log('AdvancedSync: Starting incremental sync...');
      this.notifyStatusListeners();

      const userResult = await AuthService.getCurrentUser();
      if (!userResult.success || !userResult.user) {
        throw new Error('User not authenticated');
      }

      // Only upload pending local changes
      await this.uploadLocalChanges(userResult.user.id, result);

      this.lastSyncTime = Date.now();
      console.log(`AdvancedSync: Incremental sync completed - ${result.syncedOperations} synced, ${result.failedOperations} failed`);

    } catch (error) {
      console.error('AdvancedSync: Incremental sync failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    } finally {
      this.isSyncing = false;
      this.notifyStatusListeners();
    }

    return result;
  }

  /**
   * Upload local changes to server
   */
  private static async uploadLocalChanges(userId: string, result: SyncResult): Promise<void> {
    const pendingOperations = await LocalDatabaseService.getPendingSyncOperations();
    console.log(`AdvancedSync: Found ${pendingOperations.length} pending operations`);

    // Sort operations by dependency order: doctors → meetings → notes
    // activity_logs can be skipped (they're just logs, not critical)
    const sortedOperations = this.sortOperationsByDependency(pendingOperations);

    // Process operations in batches by dependency level
    for (const operation of sortedOperations) {
      try {
        console.log(`AdvancedSync: Processing ${operation.operation_type} ${operation.table_name} ${operation.record_id}`);
        
        // Skip activity_logs - they're just logs and not critical for sync
        if (operation.table_name === 'activity_logs') {
          console.log(`AdvancedSync: Skipping activity_logs operation (logs are not synced to server)`);
          await LocalDatabaseService.markOperationCompleted(operation.id);
          result.syncedOperations++;
          continue;
        }
        
        const success = await this.processSyncOperation(operation);
        
        if (success) {
          await LocalDatabaseService.markOperationCompleted(operation.id);
          result.syncedOperations++;
          console.log(`AdvancedSync: ✅ Synced ${operation.operation_type} ${operation.table_name}`);
        } else {
          // Check if this is a dependency issue, skip, or permanent failure
          const retryDecision = await this.shouldRetryOperation(operation);
          
          if (retryDecision === 'skip') {
            // Operation can't be synced (local-only record, missing dependencies that can't sync)
            console.log(`AdvancedSync: ⏭️ Skipping ${operation.operation_type} ${operation.table_name} ${operation.record_id} (cannot be synced)`);
            await LocalDatabaseService.markOperationCompleted(operation.id);
            // Don't count as failed - it's just not syncable
          } else if (retryDecision === 'retry') {
            // Dependency issue - will be retried later
            await this.handleRetry(operation, 'Dependency not ready - will retry');
            result.failedOperations++;
            console.log(`AdvancedSync: ⏳ Deferring ${operation.operation_type} ${operation.table_name} (dependency not ready)`);
          } else {
            // Permanent failure
            await this.handleRetry(operation, 'Server rejected operation');
            result.failedOperations++;
            console.log(`AdvancedSync: ❌ Failed ${operation.operation_type} ${operation.table_name}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.handleRetry(operation, errorMessage);
        result.failedOperations++;
        result.errors.push(`Failed to sync ${operation.table_name} ${operation.record_id}: ${errorMessage}`);
        console.error(`AdvancedSync: Error processing operation:`, error);
      }
    }
  }

  /**
   * Sort operations by dependency order: doctors → meetings → notes
   */
  private static sortOperationsByDependency(operations: SyncOperation[]): SyncOperation[] {
    const dependencyOrder: { [key: string]: number } = {
      'doctors': 1,
      'meetings': 2,
      'meeting_notes': 3,
      'activity_logs': 0 // Skip these
    };

    return [...operations].sort((a, b) => {
      const orderA = dependencyOrder[a.table_name] ?? 99;
      const orderB = dependencyOrder[b.table_name] ?? 99;
      
      // Within same table, prioritize creates before updates/deletes
      if (orderA === orderB) {
        if (a.operation_type === 'create' && b.operation_type !== 'create') return -1;
        if (b.operation_type === 'create' && a.operation_type !== 'create') return 1;
      }
      
      return orderA - orderB;
    });
  }

  /**
   * Check if an operation should be retried (dependency issue vs permanent failure)
   * Returns: 'skip' | 'retry' | 'permanent_failure'
   */
  private static async shouldRetryOperation(operation: SyncOperation): Promise<'skip' | 'retry' | 'permanent_failure'> {
    try {
      const data = JSON.parse(operation.data);

      // Updates/deletes on local-only records (no server_id) can't be synced - skip them
      if ((operation.operation_type === 'update' || operation.operation_type === 'delete') && !data.server_id) {
        console.log(`AdvancedSync: Skipping ${operation.operation_type} ${operation.table_name} - record was never synced to server (no server_id)`);
        return 'skip'; // Can't update/delete what doesn't exist on server
      }

      // Meetings need doctor server_id
      if (operation.table_name === 'meetings' && operation.operation_type === 'create') {
        const doctorId = data.doctor_id;
        if (doctorId) {
          const doctor = await LocalDatabaseService.getDoctorById(doctorId);
          if (!doctor?.server_id) {
            // Check if doctor has pending sync operations
            const doctorOps = await LocalDatabaseService.getPendingSyncOperations();
            const doctorHasPendingOps = doctorOps.some(op => 
              op.table_name === 'doctors' && 
              (op.record_id === doctorId || JSON.parse(op.data).id === doctorId)
            );
            
            if (doctorHasPendingOps) {
              return 'retry'; // Doctor will be synced, retry later
            } else {
              // Doctor can't be synced (maybe local-only), skip this meeting
              console.log(`AdvancedSync: Skipping meeting create - doctor ${doctorId} has no server_id and no pending sync`);
              return 'skip';
            }
          }
        }
      }

      // Notes need meeting server_id
      if (operation.table_name === 'meeting_notes' && operation.operation_type === 'create') {
        const meetingId = data.meeting_id;
        if (meetingId) {
          const meeting = await LocalDatabaseService.getMeetingById(meetingId);
          if (!meeting?.server_id) {
            // Check if meeting has pending sync operations
            const meetingOps = await LocalDatabaseService.getPendingSyncOperations();
            const meetingHasPendingOps = meetingOps.some(op => 
              op.table_name === 'meetings' && 
              (op.record_id === meetingId || JSON.parse(op.data).id === meetingId)
            );
            
            if (meetingHasPendingOps) {
              return 'retry'; // Meeting will be synced, retry later
            } else {
              // Meeting can't be synced (maybe local-only), skip this note
              console.log(`AdvancedSync: Skipping note create - meeting ${meetingId} has no server_id and no pending sync`);
              return 'skip';
            }
          }
        }
      }

      return 'permanent_failure'; // Other failures are permanent
    } catch (error) {
      return 'permanent_failure'; // Error parsing, don't retry
    }
  }

  /**
   * Download server changes
   */
  private static async downloadServerChanges(userId: string, result: SyncResult): Promise<void> {
    // For now, we'll implement a simple approach
    // In a full implementation, you'd have server endpoints that return changes since a timestamp
    
    console.log('AdvancedSync: Downloading server changes (placeholder implementation)');
    
    // TODO: Implement server-side change tracking
    // This would involve:
    // 1. Server endpoints that return changes since last sync
    // 2. Conflict detection when local and server have different versions
    // 3. Merging strategies for different types of conflicts
    
    // For now, we'll just log that this step would happen
    console.log('AdvancedSync: Server change download not yet implemented');
  }

  /**
   * Process a single sync operation
   */
  private static async processSyncOperation(operation: SyncOperation): Promise<boolean> {
    const data = JSON.parse(operation.data);

    try {
      switch (operation.table_name) {
        case 'doctors':
          return await this.syncDoctor(operation.operation_type, data);
        case 'meetings':
          return await this.syncMeeting(operation.operation_type, data);
        case 'meeting_notes':
          console.log('⚪ ACTIVITY_SYNC: Processing meeting note sync operation:', operation.operation_type);
          return await this.syncMeetingNote(operation.operation_type, data);
        default:
          console.error('AdvancedSync: Unknown table name:', operation.table_name);
          return false;
      }
    } catch (error) {
      console.error('AdvancedSync: Error processing sync operation:', error);
      return false;
    }
  }

  /**
   * Sync doctor operations
   */
  private static async syncDoctor(operationType: string, data: LocalDoctor): Promise<boolean> {
    try {
      switch (operationType) {
        case 'create':
          console.log('AdvancedSync: Creating doctor on server:', data.first_name, data.last_name);
          const createResult = await MRService.addDoctor(data.mr_id, {
            first_name: data.first_name,
            last_name: data.last_name,
            specialty: data.specialty,
            hospital: data.hospital,
            phone: data.phone || '',
            email: data.email || '',
            location: data.location || '',
            notes: data.notes || '',
            profile_image_url: data.profile_image_url || null
          });
          
          if (createResult.success) {
            const serverDoctorId = createResult.data?.doctor_id || createResult.data?.id || createResult.data?.server_id;
            if (serverDoctorId) {
              await LocalDatabaseService.setDoctorServerId(data.id, serverDoctorId);
            } else {
              await LocalDatabaseService.markDoctorSynced(data.id);
            }
            return true;
          }
          return false;

        case 'update':
          console.log('AdvancedSync: Updating doctor on server:', data.server_id || data.id);
          if (!data.server_id) {
            console.warn(`AdvancedSync: Skipping update for offline-created doctor ${data.id}. The subsequent 'create' sync will handle it.`);
            return true;
          }
          
          const updateResult = await MRService.updateDoctor(data.server_id, {
            first_name: data.first_name,
            last_name: data.last_name,
            specialty: data.specialty,
            hospital: data.hospital,
            phone: data.phone || '',
            email: data.email || '',
            location: data.location || '',
            notes: data.notes || '',
            profile_image_url: data.profile_image_url || null
          });
          
          if (updateResult.success) {
            await LocalDatabaseService.markDoctorSynced(data.id);
            return true;
          }
          return false;

        case 'delete':
          console.log('AdvancedSync: Deleting doctor on server:', data.server_id || data.id);
          if (!data.server_id) {
            console.log(`AdvancedSync: Hard-deleting offline-only doctor ${data.id}.`);
            await LocalDatabaseService.hardDeleteDoctor(data.id);
            return true;
          }
          
          const deleteResult = await MRService.deleteDoctor(data.server_id);
          if (deleteResult.success) {
            await LocalDatabaseService.hardDeleteDoctor(data.id);
            return true;
          }
          return false;

        default:
          console.error('AdvancedSync: Unknown doctor operation:', operationType);
          return false;
      }
    } catch (error) {
      console.error('AdvancedSync: Error syncing doctor:', error);
      return false;
    }
  }

  /**
   * Sync meeting operations
   */
  private static async syncMeeting(operationType: string, data: LocalMeeting): Promise<boolean> {
    try {
      switch (operationType) {
        case 'create':
          console.log('AdvancedSync: Creating meeting on server:', data.title);
          
          // Find the doctor's server ID
          let doctorServerId = data.doctor_server_id;
          if (!doctorServerId) {
            const doctor = await LocalDatabaseService.getDoctorById(data.doctor_id);
            doctorServerId = doctor?.server_id;
          }
          
          if (!doctorServerId) {
            console.error('AdvancedSync: Cannot create meeting without doctor server ID');
            return false;
          }
          
          // Extract time from scheduled_date if it's a datetime string, or use empty string
          const scheduledDate = data.scheduled_date || new Date().toISOString();
          
          // MRService.createMeeting requires brochure_id and brochure_title
          // If not available, we'll use empty strings (meeting can be created without brochure)
          const createResult = await MRService.createMeeting({
            mr_id: data.mr_id,
            doctor_id: doctorServerId,
            brochure_id: data.brochure_id || '',
            brochure_title: data.brochure_id || '', // Use brochure_id as fallback for title
            title: data.title,
            purpose: data.purpose || '',
            scheduled_date: scheduledDate,
            duration_minutes: data.duration_minutes || 30
          });
          
          if (createResult.success && createResult.data) {
            await LocalDatabaseService.updateMeeting(data.id, {
              server_id: createResult.data.meeting_id,
              sync_status: 'synced',
              skipSyncQueue: true  // This is a server sync, don't create another queue entry
            });
            return true;
          }
          return false;

        case 'update':
          console.log('AdvancedSync: Updating meeting on server:', data.server_id || data.id);
          if (!data.server_id) {
            console.error('AdvancedSync: Cannot update meeting without server_id');
            return false;
          }
          
          // Find the doctor's server ID for update operations
          let doctorServerIdForUpdate: string | undefined = data.doctor_server_id;
          if (!doctorServerIdForUpdate) {
            const doctor = await LocalDatabaseService.getDoctorById(data.doctor_id);
            doctorServerIdForUpdate = doctor?.server_id;
          }
          
          // Check if this is a follow-up update (has follow-up fields)
          const hasFollowUpData = data.follow_up_date || data.follow_up_time || data.follow_up_notes;
          
          if (hasFollowUpData) {
            // Use dedicated follow-up update function
            console.log('AdvancedSync: Updating meeting follow-up on server');
            const followUpResult = await MRService.updateMeetingFollowUp({
              meeting_id: data.server_id,
              follow_up_date: data.follow_up_date || '',
              follow_up_time: data.follow_up_time || '',
              follow_up_notes: data.follow_up_notes || ''
            });
            
            if (followUpResult.success) {
              // Also update other meeting fields if they changed
              // MRService.updateMeeting expects: (meetingId, scheduledDate, durationMinutes, presentationId?, notes?, status?, title?, doctorId?)
              const updateResult = await MRService.updateMeeting(
                data.server_id,
                data.scheduled_date || new Date().toISOString(),
                data.duration_minutes || 30,
                data.brochure_id, // presentationId
                data.notes || '', // notes
                data.status || 'scheduled', // status
                data.title, // title
                doctorServerIdForUpdate // doctorId
              );
              
              if (updateResult.success) {
                await LocalDatabaseService.updateMeeting(data.id, { 
                  sync_status: 'synced',
                  skipSyncQueue: true
                });
                return true;
              }
            }
            return false;
          } else {
            // Regular meeting update without follow-up
            // Find the doctor's server ID for update operations
            let doctorServerIdForUpdate: string | undefined = data.doctor_server_id;
            if (!doctorServerIdForUpdate) {
              const doctor = await LocalDatabaseService.getDoctorById(data.doctor_id);
              doctorServerIdForUpdate = doctor?.server_id;
            }
            
            // MRService.updateMeeting expects: (meetingId, scheduledDate, durationMinutes, presentationId?, notes?, status?, title?, doctorId?)
            const updateResult = await MRService.updateMeeting(
              data.server_id,
              data.scheduled_date || new Date().toISOString(),
              data.duration_minutes || 30,
              data.brochure_id, // presentationId
              data.notes || '', // notes
              data.status || 'scheduled', // status
              data.title, // title
              doctorServerIdForUpdate // doctorId
            );
            
            if (updateResult.success) {
              await LocalDatabaseService.updateMeeting(data.id, { 
                sync_status: 'synced',
                skipSyncQueue: true  // This is a server sync response, don't create another queue entry
              });
              return true;
            }
            return false;
          }

        case 'delete':
          console.log('AdvancedSync: Deleting meeting on server:', data.server_id || data.id);
          if (!data.server_id) {
            console.error('AdvancedSync: Cannot delete meeting without server_id');
            return false;
          }
          
          const deleteResult = await MRService.deleteMeeting(data.server_id);
          if (deleteResult.success) {
            await LocalDatabaseService.deleteMeeting(data.id);
            return true;
          }
          return false;

        default:
          console.error('AdvancedSync: Unknown meeting operation:', operationType);
          return false;
      }
    } catch (error) {
      console.error('AdvancedSync: Error syncing meeting:', error);
      return false;
    }
  }

  /**
   * Sync meeting note operations
   */
  private static async syncMeetingNote(operationType: string, data: LocalMeetingNote): Promise<boolean> {
    try {
      switch (operationType) {
        case 'create':
          console.log('⚪ ACTIVITY_SYNC: Creating meeting note on server');
          console.log('⚪ ACTIVITY_SYNC: Note ID:', data.id);
          console.log('⚪ ACTIVITY_SYNC: Slide ID:', data.slide_id);
          console.log('⚪ ACTIVITY_SYNC: Slide Title:', data.slide_title);
          console.log('⚪ ACTIVITY_SYNC: Meeting ID:', data.meeting_id);
          console.log('⚪ ACTIVITY_SYNC: Note text length:', data.note_text?.length || 0);
          
          // Find the meeting's server ID
          let meetingServerId = data.meeting_server_id;
          if (!meetingServerId) {
            console.log('⚪ ACTIVITY_SYNC: Looking up meeting server ID from local meeting');
            const meeting = await LocalDatabaseService.getMeetingById(data.meeting_id);
            meetingServerId = meeting?.server_id;
            console.log('⚪ ACTIVITY_SYNC: Found meeting server ID:', meetingServerId);
          }
          
          if (!meetingServerId) {
            console.error('⚪ ACTIVITY_SYNC: Cannot create note without meeting server ID');
            return false;
          }
          
          console.log('⚪ ACTIVITY_SYNC: Uploading note to server with meeting server ID:', meetingServerId);
          // MRService.addSlideNote expects an object with all fields including timestamp
          const createResult = await MRService.addSlideNote({
            meeting_id: meetingServerId,
            slide_id: data.slide_id,
            slide_title: data.slide_title || '',
            slide_order: data.slide_order,
            brochure_id: data.brochure_id,
            note_text: data.note_text,
            slide_image_uri: data.slide_image_uri || '',
            timestamp: new Date().toISOString()
          });
          
          if (createResult.success) {
            console.log('⚪ ACTIVITY_SYNC: Note uploaded successfully, marking as synced');
            // addSlideNote doesn't return data, so we mark as synced without server_id
            await LocalDatabaseService.updateMeetingNote(data.id, {
              sync_status: 'synced'
            });
            console.log('⚪ ACTIVITY_SYNC: Note marked as synced');
            return true;
          } else {
            console.error('⚪ ACTIVITY_SYNC: Failed to upload note:', createResult.error);
          }
          return false;

        case 'update':
          console.log('AdvancedSync: Updating meeting note on server:', data.server_id || data.id);
          if (!data.server_id) {
            console.error('AdvancedSync: Cannot update note without server_id');
            return false;
          }
          
          // MRService.updateSlideNote expects: (noteId: string, noteText: string)
          const updateResult = await MRService.updateSlideNote(data.server_id, data.note_text);
          
          if (updateResult.success) {
            await LocalDatabaseService.updateMeetingNote(data.id, { sync_status: 'synced' });
            return true;
          }
          return false;

        case 'delete':
          console.log('AdvancedSync: Deleting meeting note on server:', data.server_id || data.id);
          if (!data.server_id) {
            console.error('AdvancedSync: Cannot delete note without server_id');
            return false;
          }
          
          const deleteResult = await MRService.deleteSlideNote(data.server_id);
          if (deleteResult.success) {
            await LocalDatabaseService.deleteMeetingNote(data.id);
            return true;
          }
          return false;

        default:
          console.error('AdvancedSync: Unknown note operation:', operationType);
          return false;
      }
    } catch (error) {
      console.error('AdvancedSync: Error syncing meeting note:', error);
      return false;
    }
  }

  /**
   * Resolve conflicts (placeholder implementation)
   */
  private static async resolveConflicts(conflicts: Conflict[]): Promise<void> {
    console.log(`AdvancedSync: Resolving ${conflicts.length} conflicts`);
    
    // For now, we'll use a simple "server wins" strategy
    // In a full implementation, you'd have sophisticated conflict resolution
    for (const conflict of conflicts) {
      console.log(`AdvancedSync: Resolving ${conflict.type} conflict - server wins`);
      // TODO: Implement conflict resolution strategies
    }
  }

  /**
   * Get sync status
   */
  static async getSyncStatus(): Promise<SyncStatus> {
    const isOnline = await NetworkService.isOnline();
    const stats = await LocalDatabaseService.getSyncStats();
    
    return {
      isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      pendingOperations: stats.pending,
      hasConflicts: stats.failed > 0
    };
  }

  /**
   * Add sync status listener
   */
  static addStatusListener(listener: (status: SyncStatus) => void): () => void {
    this.syncStatusListeners.push(listener);
    
    return () => {
      const index = this.syncStatusListeners.indexOf(listener);
      if (index > -1) {
        this.syncStatusListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify status listeners
   */
  private static async notifyStatusListeners(): Promise<void> {
    const status = await this.getSyncStatus();
    this.syncStatusListeners.forEach(listener => listener(status));
  }

  /**
   * Force sync now (manual trigger)
   */
  static async forceSyncNow(userId?: string): Promise<SyncResult> {
    console.log('AdvancedSync: Force sync requested');
    return await this.performFullSync(userId);
  }

  /**
   * Upload only pending local changes to server (no download)
   * Faster sync for offline-first apps where user just wants to upload pending changes
   */
  static async uploadPendingChangesOnly(userId?: string): Promise<SyncResult> {
    if (this.isSyncing) {
      console.log('AdvancedSync: Sync already in progress');
      return { success: false, conflicts: [], errors: ['Sync already in progress'], syncedOperations: 0, failedOperations: 0 };
    }

    if (!(await NetworkService.isOnline())) {
      console.log('AdvancedSync: Cannot sync - offline');
      return { success: false, conflicts: [], errors: ['Device is offline'], syncedOperations: 0, failedOperations: 0 };
    }

    this.isSyncing = true;
    const result: SyncResult = { success: true, conflicts: [], errors: [], syncedOperations: 0, failedOperations: 0 };

    try {
      console.log('AdvancedSync: Starting upload-only sync...');
      this.notifyStatusListeners();

      // Get userId from parameter or AuthService
      let userIdToUse: string | undefined = userId;
      if (!userIdToUse) {
        const userResult = await AuthService.getCurrentUser();
        if (!userResult.success || !userResult.user) {
          throw new Error('User not authenticated');
        }
        userIdToUse = userResult.user.id;
      }

      const finalUserId: string = userIdToUse;

      // Only upload local changes (no download)
      await this.uploadLocalChanges(finalUserId, result);

      // Clean up completed operations
      await LocalDatabaseService.clearCompletedOperations();

      // NOTE: We do NOT clean up duplicates after upload-only sync
      // The cleanup should only happen during comprehensive sync (download from server)
      // Upload-only sync should not modify local data - it only uploads changes
      // Duplicate cleanup will happen on next comprehensive sync or app restart
      console.log('AdvancedSync: Upload-only sync complete - skipping duplicate cleanup (preserves local data)');

      this.lastSyncTime = Date.now();
      console.log(`AdvancedSync: Upload-only sync completed - ${result.syncedOperations} synced, ${result.failedOperations} failed`);

    } catch (error) {
      console.error('AdvancedSync: Upload-only sync failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
    } finally {
      this.isSyncing = false;
      this.notifyStatusListeners();
    }

    return result;
  }

  private static async handleRetry(operation: SyncOperation, errorMessage: string): Promise<void> {
    await LocalDatabaseService.markOperationFailed(operation.id, errorMessage);

    if (operation.retry_count + 1 >= 5) {
      console.warn(`AdvancedSync: Operation ${operation.id} failed ${operation.retry_count + 1} times. Giving up.`);
      await LocalDatabaseService.markOperationCompleted(operation.id);
    } else {
      console.log(`AdvancedSync: Scheduling retry ${operation.retry_count + 1} for ${operation.table_name} ${operation.record_id}`);
      setTimeout(async () => {
        try {
          await LocalDatabaseService.resetOperationStatus(operation.id);
        } catch (error) {
          console.error('AdvancedSync: Failed to reset operation status for retry', error);
        }
      }, 1000 * Math.pow(2, operation.retry_count));
    }
  }
}
