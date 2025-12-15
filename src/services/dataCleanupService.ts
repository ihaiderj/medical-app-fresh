/**
 * Data Cleanup Service
 * Removes duplicate and corrupt records from both local and server databases
 */
import { LocalDatabaseService, LocalMeeting, LocalDoctor, LocalMeetingNote, LocalMeetingFollowUp, LocalSavedBrochure } from './localDatabaseService';
import { MRService } from './MRService';
import { supabase } from './supabase';

export interface CleanupResult {
  duplicatesRemoved: number;
  corruptRecordsRemoved: number;
  orphanedRecordsRemoved: number;
  errors: string[];
}

export class DataCleanupService {
  /**
   * Comprehensive cleanup of all data types
   */
  static async performComprehensiveCleanup(userId: string): Promise<CleanupResult> {
    const result: CleanupResult = {
      duplicatesRemoved: 0,
      corruptRecordsRemoved: 0,
      orphanedRecordsRemoved: 0,
      errors: []
    };

    try {
      console.log('🧹 DATA CLEANUP: Starting comprehensive cleanup for user:', userId);

      // 1. Clean up corrupt records (undefined IDs, null values)
      const corruptResult = await this.cleanupCorruptRecords(userId);
      result.corruptRecordsRemoved += corruptResult.removed;
      result.errors.push(...corruptResult.errors);

      // 2. Clean up orphaned records (missing dependencies)
      const orphanedResult = await this.cleanupOrphanedRecords(userId);
      result.orphanedRecordsRemoved += orphanedResult.removed;
      result.errors.push(...orphanedResult.errors);

      // 3. Clean up duplicates
      const duplicateResult = await this.cleanupAllDuplicates(userId);
      result.duplicatesRemoved += duplicateResult.removed;
      result.errors.push(...duplicateResult.errors);

      console.log(`✅ DATA CLEANUP: Completed - ${result.duplicatesRemoved} duplicates, ${result.corruptRecordsRemoved} corrupt, ${result.orphanedRecordsRemoved} orphaned removed`);
      
      return result;
    } catch (error) {
      console.error('❌ DATA CLEANUP: Comprehensive cleanup failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown cleanup error');
      return result;
    }
  }

  /**
   * Clean up corrupt records (undefined IDs, null values, invalid data)
   */
  static async cleanupCorruptRecords(userId: string): Promise<{ removed: number; errors: string[] }> {
    const result = { removed: 0, errors: [] as string[] };

    try {
      console.log('🧹 CLEANUP CORRUPT: Starting corrupt records cleanup...');

      // Clean up meetings with undefined/null server_id but marked as synced
      const meetings = await LocalDatabaseService.getMeetings(userId);
      for (const meeting of meetings) {
        if (meeting.sync_status === 'synced' && (!meeting.server_id || meeting.server_id === null || meeting.server_id === undefined)) {
          console.warn(`🧹 CLEANUP CORRUPT: Found corrupt meeting "${meeting.title}" (${meeting.id}) - marked as synced but no server_id`);
          try {
            await LocalDatabaseService.updateMeeting(meeting.id, {
              is_deleted: true,
              sync_status: 'synced',
              skipSyncQueue: true
            });
            result.removed++;
            console.log(`✅ CLEANUP CORRUPT: Removed corrupt meeting ${meeting.id}`);
          } catch (error) {
            result.errors.push(`Failed to remove corrupt meeting ${meeting.id}: ${error}`);
          }
        }
      }

      // Clean up doctors with undefined/null server_id but marked as synced
      const doctors = await LocalDatabaseService.getDoctors(userId);
      for (const doctor of doctors) {
        if (doctor.sync_status === 'synced' && (!doctor.server_id || doctor.server_id === null || doctor.server_id === undefined)) {
          console.warn(`🧹 CLEANUP CORRUPT: Found corrupt doctor "${doctor.first_name} ${doctor.last_name}" (${doctor.id}) - marked as synced but no server_id`);
          try {
            await LocalDatabaseService.updateDoctor(doctor.id, {
              is_deleted: true,
              sync_status: 'synced',
              skipSyncQueue: true
            });
            result.removed++;
            console.log(`✅ CLEANUP CORRUPT: Removed corrupt doctor ${doctor.id}`);
          } catch (error) {
            result.errors.push(`Failed to remove corrupt doctor ${doctor.id}: ${error}`);
          }
        }
      }

      // Clean up notes with undefined/null server_id but marked as synced
      const notes = await LocalDatabaseService.getMeetingSlideNotes(userId);
      for (const note of notes) {
        if (note.sync_status === 'synced' && (!note.server_id || note.server_id === null || note.server_id === undefined)) {
          console.warn(`🧹 CLEANUP CORRUPT: Found corrupt note ${note.id} - marked as synced but no server_id`);
          try {
            await LocalDatabaseService.updateMeetingNote(note.id, {
              is_deleted: true,
              sync_status: 'synced',
              skipSyncQueue: true
            });
            result.removed++;
            console.log(`✅ CLEANUP CORRUPT: Removed corrupt note ${note.id}`);
          } catch (error) {
            result.errors.push(`Failed to remove corrupt note ${note.id}: ${error}`);
          }
        }
      }

      // Clean up follow-ups with undefined/null server_id but marked as synced
      const meetingsForFollowUps = await LocalDatabaseService.getMeetings(userId);
      for (const meeting of meetingsForFollowUps) {
        const followUps = await LocalDatabaseService.getMeetingFollowUps(meeting.id);
        for (const followUp of followUps) {
          if (followUp.sync_status === 'synced' && (!followUp.server_id || followUp.server_id === null || followUp.server_id === undefined)) {
            console.warn(`🧹 CLEANUP CORRUPT: Found corrupt follow-up ${followUp.id} - marked as synced but no server_id`);
            try {
              await LocalDatabaseService.updateMeetingFollowUp(followUp.id, {
                is_deleted: true,
                sync_status: 'synced',
                skipSyncQueue: true
              });
              result.removed++;
              console.log(`✅ CLEANUP CORRUPT: Removed corrupt follow-up ${followUp.id}`);
            } catch (error) {
              result.errors.push(`Failed to remove corrupt follow-up ${followUp.id}: ${error}`);
            }
          }
        }
      }

      // Clean up saved brochures with undefined/null server_id but marked as synced
      const savedBrochures = await LocalDatabaseService.getSavedBrochures(userId);
      for (const brochure of savedBrochures) {
        if (brochure.sync_status === 'synced' && (!brochure.server_id || brochure.server_id === null || brochure.server_id === undefined)) {
          console.warn(`🧹 CLEANUP CORRUPT: Found corrupt saved brochure "${brochure.custom_title || brochure.brochure_title}" (${brochure.id}) - marked as synced but no server_id`);
          try {
            await LocalDatabaseService.updateSavedBrochure(brochure.id, {
              is_deleted: true,
              sync_status: 'synced',
              skipSyncQueue: true
            });
            result.removed++;
            console.log(`✅ CLEANUP CORRUPT: Removed corrupt saved brochure ${brochure.id}`);
          } catch (error) {
            result.errors.push(`Failed to remove corrupt saved brochure ${brochure.id}: ${error}`);
          }
        }
      }

      console.log(`✅ CLEANUP CORRUPT: Removed ${result.removed} corrupt records`);
    } catch (error) {
      console.error('❌ CLEANUP CORRUPT: Error cleaning up corrupt records:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Clean up orphaned records (records with missing dependencies)
   */
  static async cleanupOrphanedRecords(userId: string): Promise<{ removed: number; errors: string[] }> {
    const result = { removed: 0, errors: [] as string[] };

    try {
      console.log('🧹 CLEANUP ORPHANED: Starting orphaned records cleanup...');

      // Clean up meetings with invalid doctor_id
      const meetings = await LocalDatabaseService.getMeetings(userId);
      for (const meeting of meetings) {
        if (meeting.doctor_id) {
          try {
            const doctor = await LocalDatabaseService.getDoctorById(meeting.doctor_id);
            if (!doctor || doctor.is_deleted) {
              console.warn(`🧹 CLEANUP ORPHANED: Found orphaned meeting "${meeting.title}" (${meeting.id}) - doctor ${meeting.doctor_id} not found`);
              try {
                await LocalDatabaseService.updateMeeting(meeting.id, {
                  is_deleted: true,
                  sync_status: 'synced',
                  skipSyncQueue: true
                });
                result.removed++;
                console.log(`✅ CLEANUP ORPHANED: Removed orphaned meeting ${meeting.id}`);
              } catch (error) {
                result.errors.push(`Failed to remove orphaned meeting ${meeting.id}: ${error}`);
              }
            }
          } catch (error) {
            // Doctor lookup failed - mark meeting as orphaned
            console.warn(`🧹 CLEANUP ORPHANED: Found orphaned meeting "${meeting.title}" (${meeting.id}) - doctor lookup failed`);
            try {
              await LocalDatabaseService.updateMeeting(meeting.id, {
                is_deleted: true,
                sync_status: 'synced',
                skipSyncQueue: true
              });
              result.removed++;
              console.log(`✅ CLEANUP ORPHANED: Removed orphaned meeting ${meeting.id}`);
            } catch (deleteError) {
              result.errors.push(`Failed to remove orphaned meeting ${meeting.id}: ${deleteError}`);
            }
          }
        }
      }

      // Clean up notes with invalid meeting_id
      const meetingsForNotes = await LocalDatabaseService.getMeetings(userId);
      const validMeetingIds = new Set(meetingsForNotes.map(m => m.id));
      
      const notes = await LocalDatabaseService.getMeetingSlideNotes(userId);
      for (const note of notes) {
        if (!validMeetingIds.has(note.meeting_id)) {
          console.warn(`🧹 CLEANUP ORPHANED: Found orphaned note ${note.id} - meeting ${note.meeting_id} not found`);
          try {
            await LocalDatabaseService.updateMeetingNote(note.id, {
              is_deleted: true,
              sync_status: 'synced',
              skipSyncQueue: true
            });
            result.removed++;
            console.log(`✅ CLEANUP ORPHANED: Removed orphaned note ${note.id}`);
          } catch (error) {
            result.errors.push(`Failed to remove orphaned note ${note.id}: ${error}`);
          }
        }
      }

      // Clean up follow-ups with invalid meeting_id
      for (const meeting of meetingsForNotes) {
        const followUps = await LocalDatabaseService.getMeetingFollowUps(meeting.id);
        for (const followUp of followUps) {
          if (followUp.meeting_id !== meeting.id) {
            console.warn(`🧹 CLEANUP ORPHANED: Found orphaned follow-up ${followUp.id} - meeting ${followUp.meeting_id} mismatch`);
            try {
              await LocalDatabaseService.updateMeetingFollowUp(followUp.id, {
                is_deleted: true,
                sync_status: 'synced',
                skipSyncQueue: true
              });
              result.removed++;
              console.log(`✅ CLEANUP ORPHANED: Removed orphaned follow-up ${followUp.id}`);
            } catch (error) {
              result.errors.push(`Failed to remove orphaned follow-up ${followUp.id}: ${error}`);
            }
          }
        }
      }

      // Clean up saved brochures with invalid brochure_id
      const localBrochures = await LocalDatabaseService.getBrochures(userId);
      const validBrochureIds = new Set(localBrochures.map(b => b.id));
      
      const savedBrochures = await LocalDatabaseService.getSavedBrochures(userId);
      for (const savedBrochure of savedBrochures) {
        if (!validBrochureIds.has(savedBrochure.brochure_id)) {
          console.warn(`🧹 CLEANUP ORPHANED: Found orphaned saved brochure "${savedBrochure.custom_title || savedBrochure.brochure_title}" (${savedBrochure.id}) - brochure ${savedBrochure.brochure_id} not found`);
          try {
            await LocalDatabaseService.updateSavedBrochure(savedBrochure.id, {
              is_deleted: true,
              sync_status: 'synced',
              skipSyncQueue: true
            });
            result.removed++;
            console.log(`✅ CLEANUP ORPHANED: Removed orphaned saved brochure ${savedBrochure.id}`);
          } catch (error) {
            result.errors.push(`Failed to remove orphaned saved brochure ${savedBrochure.id}: ${error}`);
          }
        }
      }

      console.log(`✅ CLEANUP ORPHANED: Removed ${result.removed} orphaned records`);
    } catch (error) {
      console.error('❌ CLEANUP ORPHANED: Error cleaning up orphaned records:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Clean up all duplicate records
   */
  static async cleanupAllDuplicates(userId: string): Promise<{ removed: number; errors: string[] }> {
    const result = { removed: 0, errors: [] as string[] };

    try {
      console.log('🧹 CLEANUP DUPLICATES: Starting duplicate records cleanup...');

      // Use existing cleanup functions
      try {
        const { ComprehensiveServerSyncService } = await import('./comprehensiveServerSyncService');
        
        // Clean up duplicate meetings
        await ComprehensiveServerSyncService.cleanupDuplicateMeetings(userId);
        
        // Clean up duplicate saved brochures
        await ComprehensiveServerSyncService.cleanupDuplicateSavedBrochures(userId);
        
        // Clean up duplicate meeting slide notes
        await ComprehensiveServerSyncService.cleanupDuplicateMeetingSlideNotes(userId);
        
        console.log('✅ CLEANUP DUPLICATES: Duplicate cleanup completed');
      } catch (error) {
        result.errors.push(`Failed to run duplicate cleanup: ${error}`);
      }

    } catch (error) {
      console.error('❌ CLEANUP DUPLICATES: Error cleaning up duplicates:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Clean up corrupt records on server (meetings with undefined IDs)
   * Note: This requires server-side RPC function or direct SQL access
   */
  static async cleanupCorruptServerRecords(userId: string): Promise<{ removed: number; errors: string[] }> {
    const result = { removed: 0, errors: [] as string[] };

    try {
      console.log('🧹 CLEANUP SERVER CORRUPT: Starting server corrupt records cleanup...');

      // Fetch meetings from server
      const { data: meetings, error } = await supabase
        .from('meetings')
        .select('id, title, mr_id')
        .eq('mr_id', userId);

      if (error) {
        console.error('❌ CLEANUP SERVER CORRUPT: Error fetching meetings:', error);
        result.errors.push(`Failed to fetch meetings: ${error.message}`);
        return result;
      }

      if (!meetings) {
        return result;
      }

      // Find meetings with undefined/null IDs
      const corruptMeetings = meetings.filter(m => !m.id || m.id === null || m.id === undefined);
      
      if (corruptMeetings.length > 0) {
        console.warn(`🧹 CLEANUP SERVER CORRUPT: Found ${corruptMeetings.length} corrupt meetings on server`);
        
        // Note: We can't directly delete from client - need server-side RPC function
        // For now, log them and provide SQL script
        console.warn('⚠️ CLEANUP SERVER CORRUPT: Cannot delete from client - use SQL script below:');
        console.warn('SQL to delete corrupt meetings:');
        console.warn(`DELETE FROM meetings WHERE mr_id = '${userId}' AND (id IS NULL OR id = '');`);
        
        result.errors.push(`${corruptMeetings.length} corrupt meetings found on server - manual cleanup required`);
      }

      console.log(`✅ CLEANUP SERVER CORRUPT: Found ${corruptMeetings.length} corrupt records (manual cleanup required)`);
    } catch (error) {
      console.error('❌ CLEANUP SERVER CORRUPT: Error cleaning up server corrupt records:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }
}




