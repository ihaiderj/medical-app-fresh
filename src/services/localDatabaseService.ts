/**
 * Local Database Service
 * Handles all SQLite operations for offline-first functionality
 * Falls back to AsyncStorage if SQLite is not available
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateUUID } from '../utils/uuid';
import { MRRecentActivity, MRUpcomingMeeting } from './MRService';
import { appEvents, DATA_CHANGED_EVENT } from './eventService';

// Try to import SQLite, fall back to null if not available
let SQLite: any = null;
try {
  SQLite = require('expo-sqlite');
} catch (error) {
  console.warn('LocalDB: SQLite not available, falling back to AsyncStorage');
}

export interface LocalDoctor {
  id: string;
  server_id?: string;
  mr_id: string;
  first_name: string;
  last_name: string;
  specialty: string;
  hospital: string;
  phone?: string;
  email?: string;
  location?: string;
  profile_image_url?: string;
  notes?: string;
  relationship_status: string;
  meetings_count: number;
  last_meeting_date?: string;
  next_appointment?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  last_modified?: string;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  is_deleted: boolean;
  local_changes?: string;
}

export interface LocalMeeting {
  id: string;
  server_id?: string;
  mr_id: string;
  doctor_id: string;
  doctor_server_id?: string;
  brochure_id?: string;
  title: string;
  scheduled_date: string;
  duration_minutes: number;
  status: string;
  location?: string;
  purpose?: string;
  notes?: string;
  follow_up_required: boolean;
  follow_up_date?: string;
  follow_up_time?: string;
  follow_up_notes?: string;
  presentation_slides?: string;
  comments?: string;
  created_at: string;
  updated_at: string;
  last_modified?: string;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  is_deleted: boolean;
  local_changes?: string;
}

export interface LocalMeetingNote {
  id: string;
  server_id?: string;
  meeting_id: string;
  meeting_server_id?: string;
  slide_id: string;
  slide_title: string;
  slide_order: number;
  brochure_id: string;
  note_text: string;
  slide_image_uri?: string;
  created_at: string;
  updated_at: string;
  last_modified?: string;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  is_deleted: boolean;
  local_changes?: string;
}

export interface SyncOperation {
  id: string;
  operation_type: 'create' | 'update' | 'delete';
  table_name: string;
  record_id: string;
  data: string; // JSON data
  timestamp: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  retry_count: number;
  error_message?: string;
}

export interface LocalDoctorAssignment {
  id: string;
  server_id?: string;
  doctor_id: string;
  doctor_server_id?: string;
  mr_id: string;
  status: string;
  assigned_by?: string;
  assigned_at?: string;
  transferred_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  is_deleted: boolean;
  local_changes?: string;
}

export interface LocalBrochureSync {
  id: string;
  server_id?: string;
  mr_id: string;
  brochure_id: string;
  brochure_title?: string;
  brochure_data: string;
  last_modified?: string;
  created_at?: string;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  is_deleted?: boolean;
  local_changes?: string;
}

export interface LocalSavedBrochure {
  id: string;
  server_id?: string;
  mr_id: string;
  brochure_id: string;
  brochure_title: string;
  custom_title: string;
  original_brochure_data: string;
  saved_at?: string;
  last_accessed?: string;
  created_at?: string;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  local_changes?: string;
  is_deleted?: boolean;
}

export interface LocalActivityLog {
  id: string;
  server_id?: string;
  user_id: string;
  mr_id: string;
  activity_type: string;
  description: string;
  metadata?: string;
  created_at?: string;
  version: number;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  is_deleted: boolean;
  local_changes?: string;
}

export interface LocalUser {
  id: string;
  email: string;
  role: 'admin' | 'mr';
  first_name: string;
  last_name: string;
  phone?: string;
  profile_image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  local_changes?: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
}

export interface LocalPermission {
  id: string;
  user_id: string;
  permission_key: string;
  value: string;
  created_at: string;
  updated_at: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  local_changes?: string;
}

export interface LocalBrochureCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  is_active: boolean;
  created_at: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  local_changes?: string | null;
  last_synced_at?: string;
  needs_sync: boolean;
}

export interface LocalBrochure {
  id: string;
  title: string;
  category?: string;
  description?: string;
  file_url: string;
  thumbnail_url?: string;
  pages?: number;
  file_size?: string;
  status: string;
  assigned_by?: string;
  download_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  file_name?: string;
  file_type?: string;
  uploaded_by?: string;
  is_public: boolean;
  tags?: string;
  version: string;
  category_id?: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  local_changes?: string | null;
  last_synced_at?: string;
  needs_sync: boolean;
}

export interface LocalDoctorAssignment {
  id: string;
  doctor_id: string;
  mr_id: string;
  assigned_by?: string;
  status: string;
  assigned_at?: string;
  transferred_at?: string;
  notes?: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  local_changes?: string;
  last_synced_at?: string;
  needs_sync: boolean;
}

export interface LocalDoctorPhoto {
  id: string;
  user_id?: string;
  file_name?: string;
  file_path?: string;
  photo_data?: string;
  mime_type?: string;
  created_at: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  local_changes?: string | null;
  last_synced_at?: string;
  needs_sync: boolean;
}

export interface LocalMeetingSlideNote {
  id: string;
  meeting_id: string;
  slide_id: string;
  slide_title: string;
  slide_order: number;
  brochure_id: string;
  note_text: string;
  created_at: string;
  updated_at: string;
  slide_image_uri?: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  local_changes?: string | null;
  last_synced_at?: string;
  needs_sync: boolean;
}

export interface LocalSession {
  id: string;
  user_id: string;
  device_id: string;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  sync_status: 'pending' | 'synced' | 'conflict' | 'error';
  local_changes?: string;
}

export class LocalDatabaseService {
  private static db: any = null;
  private static isInitialized = false;
  private static useAsyncStorage = false;

  /**
   * Ensure database is initialized
   */
  private static async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Check if we're using AsyncStorage fallback
   */
  static isUsingAsyncStorage(): boolean {
    return this.useAsyncStorage || !this.db;
  }

  /**
   * Execute SQL query with AsyncStorage fallback
   */
  private static async executeQuery(query: string, params: any[] = []): Promise<any> {
    if (this.isUsingAsyncStorage()) {
      // For AsyncStorage fallback, we'll return empty results for now
      // This prevents the runAsync errors during authentication
      console.log('LocalDB: Query skipped in AsyncStorage mode:', query.substring(0, 50) + '...');
      return [];
    } else {
      // Use SQLite with new API
      const statement = await this.db.prepareAsync(query);
      try {
        const result = await statement.executeAsync(params);
        return result;
      } finally {
        await statement.finalizeAsync();
      }
    }
  }

  /**
   * Execute SELECT query with AsyncStorage fallback
   */
  private static async executeSelect(query: string, params: any[] = []): Promise<any[]> {
    if (this.isUsingAsyncStorage()) {
      // For AsyncStorage fallback, we'll return empty results for now
      console.log('LocalDB: Select query skipped in AsyncStorage mode:', query.substring(0, 50) + '...');
      return [];
    } else {
      // Use SQLite with new API
      const statement = await this.db.prepareAsync(query);
      try {
        const result = await statement.executeAsync(params);
        return await result.getAllAsync();
      } finally {
        await statement.finalizeAsync();
      }
    }
  }

  /**
   * Execute SELECT query for single result with AsyncStorage fallback
   */
  static async executeSelectFirst(query: string, params: any[] = []): Promise<any> {
    if (this.isUsingAsyncStorage()) {
      // For AsyncStorage fallback, we'll return null for now
      console.log('LocalDB: SelectFirst query skipped in AsyncStorage mode:', query.substring(0, 50) + '...');
      return null;
    } else {
      // Use SQLite with new API
      const statement = await this.db.prepareAsync(query);
      try {
        const result = await statement.executeAsync(params);
        return await result.getFirstAsync();
      } finally {
        await statement.finalizeAsync();
      }
    }
  }

  static async ensureReady(): Promise<void> {
    await this.ensureInitialized();
  }

  /**
   * Force recreate database (for debugging)
   */
  static async forceRecreateDatabase(): Promise<void> {
    // First, drop all tables BEFORE closing the database
    if (this.db) {
      try {
        console.log('LocalDB: Dropping all tables...');
        // Drop tables in reverse dependency order
        await this.db.execAsync('DROP TABLE IF EXISTS meeting_notes');
        await this.db.execAsync('DROP TABLE IF EXISTS activity_logs');
        await this.db.execAsync('DROP TABLE IF EXISTS saved_brochures');
        await this.db.execAsync('DROP TABLE IF EXISTS brochure_sync');
        await this.db.execAsync('DROP TABLE IF EXISTS doctor_assignments');
        await this.db.execAsync('DROP TABLE IF EXISTS mr_permissions');
        await this.db.execAsync('DROP TABLE IF EXISTS meetings');
        await this.db.execAsync('DROP TABLE IF EXISTS doctors');
        await this.db.execAsync('DROP TABLE IF EXISTS sync_operations');
        await this.db.execAsync('DROP TABLE IF EXISTS schema_version');
        console.log('LocalDB: All tables dropped successfully');
      } catch (error) {
        console.log('LocalDB: Error dropping tables:', error);
      } finally {
        // Close the database after dropping tables
        try {
          await this.db.closeAsync();
        } catch (closeError) {
          // Ignore close errors
        }
        this.db = null;
      }
    }
    
    this.isInitialized = false;
    
    // Now reinitialize with fresh tables
    console.log('LocalDB: Reinitializing database with fresh schema...');
    await this.initialize();
  }

  /**
   * Initialize the local database
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('LocalDB: Initializing database...');
      
      if (SQLite) {
        console.log('LocalDB: Using SQLite database...');
        this.useAsyncStorage = false;
        // Use the new async API for expo-sqlite 15.x
        this.db = await SQLite.openDatabaseAsync('main.db');
        console.log('LocalDB: Database opened successfully');
        
        // Enable WAL mode and foreign keys using execAsync
        await this.db.execAsync(`
          PRAGMA journal_mode = WAL;
          PRAGMA foreign_keys = ON;
        `);
        console.log('LocalDB: WAL mode enabled successfully');
        
        console.log('LocalDB: About to run migrations...');
        await this.migrateDbIfNeeded();
        console.log('LocalDB: Migrations completed');
      } else {
        console.log('LocalDB: Using AsyncStorage fallback...');
        this.useAsyncStorage = true;
        // Initialize AsyncStorage-based storage
        await this.initializeAsyncStorage();
      }
      
      this.isInitialized = true;
      console.log('LocalDB: Database initialized successfully');
    } catch (error) {
      console.error('LocalDB: Failed to initialize database:', error);
      console.error('LocalDB: Error details:', JSON.stringify(error, null, 2));
      
      // Fall back to AsyncStorage if SQLite fails
      console.log('LocalDB: Falling back to AsyncStorage...');
      try {
        this.useAsyncStorage = true;
        await this.initializeAsyncStorage();
        this.isInitialized = true;
        console.log('LocalDB: AsyncStorage fallback initialized successfully');
      } catch (fallbackError) {
        console.error('LocalDB: AsyncStorage fallback also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Initialize AsyncStorage fallback
   */
  private static async initializeAsyncStorage(): Promise<void> {
    console.log('LocalDB: Initializing AsyncStorage fallback...');
    
    // Check if we have any existing data
    const existingData = await AsyncStorage.getItem('local_db_initialized');
    if (!existingData) {
      console.log('LocalDB: First time setup with AsyncStorage...');
      await AsyncStorage.setItem('local_db_initialized', 'true');
      await AsyncStorage.setItem('doctors', JSON.stringify([]));
      await AsyncStorage.setItem('meetings', JSON.stringify([]));
      await AsyncStorage.setItem('sync_operations', JSON.stringify([]));
      await AsyncStorage.setItem('user_profile', JSON.stringify(null));
      console.log('LocalDB: AsyncStorage initialized with empty data');
    } else {
      console.log('LocalDB: AsyncStorage already initialized');
    }
  }

  /**
   * Check if database needs migration and create tables if needed
   */
  private static async migrateDbIfNeeded(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Check if schema_version table exists
      const schemaCheck = await this.db.prepareAsync(
        'SELECT name FROM sqlite_master WHERE type="table" AND name="schema_version"'
      );
      let hasSchemaVersion = false;
      try {
        const result = await schemaCheck.executeAsync();
        const schemaResult = await result.getAllAsync();
        hasSchemaVersion = schemaResult.length > 0;
      } finally {
        await schemaCheck.finalizeAsync();
      }
      
      if (!hasSchemaVersion) {
        console.log('LocalDB: No schema_version table found, creating all tables...');
        await this.createTables();
      } else {
        console.log('LocalDB: Database schema exists, checking for schema mismatches...');
        
        // Check if current schema matches expected schema
        const needsRecreation = await this.checkSchemaMismatch();
        if (needsRecreation) {
          console.log('LocalDB: Schema mismatch detected, recreating database...');
          await this.recreateDatabaseWithBackup();
        } else {
          console.log('LocalDB: Schema is up to date, running migrations...');
          await this.runMigrations();
        }
      }
      
      // Verify tables were created by checking for key tables
      const tableCheck = await this.db.prepareAsync(
        'SELECT name FROM sqlite_master WHERE type="table" AND name IN ("doctors", "meetings", "saved_brochures", "activity_logs", "brochures", "brochure_sync")'
      );
      try {
        const result = await tableCheck.executeAsync();
        const tables = await result.getAllAsync();
        console.log('LocalDB: Available tables:', tables.map((t: any) => t.name));
        
        // Also check if brochures and brochure_sync tables exist
        const allTablesCheck = await this.db.prepareAsync(
          'SELECT name FROM sqlite_master WHERE type="table" ORDER BY name'
        );
        try {
          const allTablesResult = await allTablesCheck.executeAsync();
          const allTables = await allTablesResult.getAllAsync();
          console.log('LocalDB: All tables in database:', allTables.map((t: any) => t.name));
        } finally {
          await allTablesCheck.finalizeAsync();
        }
      } finally {
        await tableCheck.finalizeAsync();
      }
    } catch (error) {
      console.error('LocalDB: Migration check failed:', error);
      // If migration check fails, try to create tables
      console.log('LocalDB: Forcing table creation due to migration error...');
      await this.createTables();
    }
  }

  /**
   * Check if the current database schema matches the expected schema
   */
  private static async checkSchemaMismatch(): Promise<boolean> {
    try {
      // Check if activity_logs table has the required columns
      const activityLogsCheck = await this.db.prepareAsync(
        'PRAGMA table_info(activity_logs)'
      );
      const result = await activityLogsCheck.executeAsync();
      const columns = await result.getAllAsync();
      await activityLogsCheck.finalizeAsync();
      
      const columnNames = columns.map((col: any) => col.name);
      const requiredColumns = ['mr_id', 'brochure_id', 'action', 'details', 'metadata', 'timestamp', 'is_deleted'];
      
      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
      if (missingColumns.length > 0) {
        console.log('LocalDB: Missing columns in activity_logs:', missingColumns);
        return true;
      }
      
      // Check if other tables have required columns
      const meetingsCheck = await this.db.prepareAsync('PRAGMA table_info(meetings)');
      const meetingsResult = await meetingsCheck.executeAsync();
      const meetingsColumns = await meetingsResult.getAllAsync();
      await meetingsCheck.finalizeAsync();
      
      const meetingsColumnNames = meetingsColumns.map((col: any) => col.name);
      if (!meetingsColumnNames.includes('brochure_id')) {
        console.log('LocalDB: Missing brochure_id column in meetings table');
        return true;
      }
      
      // Check if brochure_sync table has is_deleted column
      try {
        const brochureSyncCheck = await this.db.prepareAsync('PRAGMA table_info(brochure_sync)');
        const brochureSyncResult = await brochureSyncCheck.executeAsync();
        const brochureSyncColumns = await brochureSyncResult.getAllAsync();
        await brochureSyncCheck.finalizeAsync();
        
        const brochureSyncColumnNames = brochureSyncColumns.map((col: any) => col.name);
        if (!brochureSyncColumnNames.includes('is_deleted')) {
          console.log('LocalDB: Missing is_deleted column in brochure_sync table');
          return true;
        }
      } catch (error) {
        // If table doesn't exist, schema mismatch - will be created
        console.log('LocalDB: brochure_sync table check failed:', error);
        return true;
      }
      
      // Check if user_sessions table has correct schema
      try {
        const sessionsCheck = await this.db.prepareAsync('PRAGMA table_info(user_sessions)');
        const sessionsResult = await sessionsCheck.executeAsync();
        const sessionsColumns = await sessionsResult.getAllAsync();
        await sessionsCheck.finalizeAsync();
        
        const sessionsColumnNames = sessionsColumns.map((col: any) => col.name);
        const expectedColumns = ['id', 'user_id', 'device_id', 'is_active', 'last_seen_at', 'created_at', 'updated_at', 'sync_status', 'local_changes'];
        const missingColumns = expectedColumns.filter((col: string) => !sessionsColumnNames.includes(col));
        const unexpectedColumns = sessionsColumnNames.filter((col: string) => !expectedColumns.includes(col));
        
        if (missingColumns.length > 0) {
          console.log('LocalDB: Missing columns in user_sessions table:', missingColumns);
          return true;
        }
        
        if (unexpectedColumns.length > 0) {
          console.log('LocalDB: Unexpected columns in user_sessions table (will recreate):', unexpectedColumns);
          return true;
        }
      } catch (error) {
        // If table doesn't exist, schema mismatch - will be created
        console.log('LocalDB: user_sessions table check failed:', error);
        return true;
      }
      
      return false;
    } catch (error) {
      console.log('LocalDB: Error checking schema mismatch:', error);
      return true; // If we can't check, assume mismatch and recreate
    }
  }

  /**
   * Recreate database with backup of existing data
   */
  private static async recreateDatabaseWithBackup(): Promise<void> {
    try {
      console.log('LocalDB: Backing up existing data...');
      
      // Backup existing data
      const backupData: any = {};
      
      // Backup doctors - select only columns that exist in current schema
      try {
        const doctorsResult = await this.db.getAllAsync(`
          SELECT id, server_id, mr_id, first_name, last_name, email, phone, specialty, hospital, 
                 location, profile_image_url, notes, relationship_status, meetings_count, 
                 last_meeting_date, next_appointment, created_by, created_at, updated_at, 
                 last_modified, version, sync_status, is_deleted, local_changes
          FROM doctors WHERE is_deleted = 0
        `);
        backupData.doctors = doctorsResult;
      } catch (e) {
        console.log('LocalDB: Could not backup doctors:', e);
      }
      
      // Backup meetings
      try {
        const meetingsResult = await this.db.getAllAsync('SELECT * FROM meetings WHERE is_deleted = 0');
        backupData.meetings = meetingsResult;
      } catch (e) {
        console.log('LocalDB: Could not backup meetings:', e);
      }
      
      // Backup user profile
      try {
        const userResult = await this.db.getAllAsync('SELECT * FROM user_profile');
        backupData.user_profile = userResult;
      } catch (e) {
        console.log('LocalDB: Could not backup user profile:', e);
      }
      
      console.log('LocalDB: Dropping all tables...');
      // Drop all tables
      await this.db.execAsync('DROP TABLE IF EXISTS meeting_notes');
      await this.db.execAsync('DROP TABLE IF EXISTS activity_logs');
      await this.db.execAsync('DROP TABLE IF EXISTS saved_brochures');
      await this.db.execAsync('DROP TABLE IF EXISTS brochure_sync');
      await this.db.execAsync('DROP TABLE IF EXISTS doctor_assignments');
      await this.db.execAsync('DROP TABLE IF EXISTS mr_permissions');
      await this.db.execAsync('DROP TABLE IF EXISTS meetings');
      await this.db.execAsync('DROP TABLE IF EXISTS doctors');
      await this.db.execAsync('DROP TABLE IF EXISTS user_sessions');
      await this.db.execAsync('DROP TABLE IF EXISTS users');
      await this.db.execAsync('DROP TABLE IF EXISTS user_credentials');
      await this.db.execAsync('DROP TABLE IF EXISTS sync_operations');
      await this.db.execAsync('DROP TABLE IF EXISTS schema_version');
      
      console.log('LocalDB: Creating fresh schema...');
      // Create fresh tables
      await this.createTables();
      
      console.log('LocalDB: Restoring backed up data...');
      // Restore data
      if (backupData.doctors && backupData.doctors.length > 0) {
        for (const doctor of backupData.doctors) {
          try {
            // Map old schema fields (address, city, state, pincode) to new schema (location)
            const location = doctor.location || 
              [doctor.address, doctor.city, doctor.state, doctor.pincode]
                .filter(Boolean)
                .join(', ') || null;
            
            await this.db.runAsync(`
              INSERT INTO doctors (id, server_id, mr_id, first_name, last_name, email, phone, specialty, hospital, 
                location, profile_image_url, notes, relationship_status, meetings_count, last_meeting_date, 
                next_appointment, created_by, created_at, updated_at, last_modified, version, sync_status, is_deleted, local_changes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              doctor.id, doctor.server_id || null, doctor.mr_id, doctor.first_name, doctor.last_name,
              doctor.email || null, doctor.phone || null, doctor.specialty || null, doctor.hospital || null,
              location, doctor.profile_image_url || null, doctor.notes || null,
              doctor.relationship_status || 'active', doctor.meetings_count || 0,
              doctor.last_meeting_date || null, doctor.next_appointment || null,
              doctor.created_by || null, doctor.created_at, doctor.updated_at, doctor.last_modified || null,
              doctor.version || 1, doctor.sync_status || 'pending', doctor.is_deleted ? 1 : 0, doctor.local_changes || null
            ]);
          } catch (e) {
            console.log('LocalDB: Could not restore doctor:', doctor.id, e);
          }
        }
      }
      
      if (backupData.meetings && backupData.meetings.length > 0) {
        for (const meeting of backupData.meetings) {
          try {
            await this.db.runAsync(`
              INSERT INTO meetings (id, server_id, mr_id, doctor_id, doctor_server_id, brochure_id, title, scheduled_date,
                duration_minutes, status, location, purpose, notes, follow_up_required, follow_up_date, follow_up_time,
                follow_up_notes, presentation_slides, comments, created_at, updated_at, last_modified, version, sync_status, is_deleted, local_changes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              meeting.id, meeting.server_id || null, meeting.mr_id, meeting.doctor_id, meeting.doctor_server_id || null,
              meeting.brochure_id || null, meeting.title, meeting.scheduled_date, meeting.duration_minutes || 30,
              meeting.status, meeting.location || null, meeting.purpose || null, meeting.notes || null,
              meeting.follow_up_required ? 1 : 0, meeting.follow_up_date || null, meeting.follow_up_time || null,
              meeting.follow_up_notes || null, meeting.presentation_slides || null, meeting.comments || null,
              meeting.created_at, meeting.updated_at, meeting.last_modified || null, meeting.version || 1,
              meeting.sync_status || 'pending', meeting.is_deleted ? 1 : 0, meeting.local_changes || null
            ]);
          } catch (e) {
            console.log('LocalDB: Could not restore meeting:', meeting.id, e);
          }
        }
      }
      
      if (backupData.user_profile && backupData.user_profile.length > 0) {
        for (const user of backupData.user_profile) {
          try {
            await this.db.runAsync(`
              INSERT INTO user_profile (id, email, role, first_name, last_name, phone, created_at, updated_at, version, sync_status, local_changes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              user.id, user.email, user.role, user.first_name, user.last_name, user.phone || null,
              user.created_at, user.updated_at, user.version || 1, user.sync_status || 'pending', user.local_changes || null
            ]);
          } catch (e) {
            console.log('LocalDB: Could not restore user profile:', user.id, e);
          }
        }
      }
      
      console.log('LocalDB: Database recreation completed successfully');
    } catch (error) {
      console.error('LocalDB: Error during database recreation:', error);
      // If recreation fails, just create fresh tables
      await this.createTables();
    }
  }

  /**
   * Create all database tables
   */
  private static async createTables(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    const createTablesSQL = `
      -- Schema version tracking
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        phone TEXT,
        profile_image_url TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'synced',
        local_changes TEXT
      );

      -- User credentials (local only)
      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Doctors table
      CREATE TABLE IF NOT EXISTS doctors (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        mr_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        specialty TEXT NOT NULL,
        hospital TEXT NOT NULL,
        location TEXT,
        profile_image_url TEXT,
        notes TEXT,
        relationship_status TEXT DEFAULT 'active',
        meetings_count INTEGER DEFAULT 0,
        last_meeting_date TEXT,
        next_appointment TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_modified TEXT,
        version INTEGER DEFAULT 1,
        sync_status TEXT DEFAULT 'pending',
        is_deleted INTEGER DEFAULT 0,
        local_changes TEXT
      );

      -- Doctor assignments table
      CREATE TABLE IF NOT EXISTS doctor_assignments (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        doctor_id TEXT NOT NULL,
        doctor_server_id TEXT,
        mr_id TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        assigned_by TEXT,
        assigned_at TEXT,
        transferred_at TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        sync_status TEXT DEFAULT 'pending',
        is_deleted INTEGER DEFAULT 0,
        local_changes TEXT
      );

      -- Meetings table
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        mr_id TEXT NOT NULL,
        doctor_id TEXT NOT NULL,
        doctor_server_id TEXT,
        brochure_id TEXT,
        title TEXT NOT NULL,
        scheduled_date TEXT NOT NULL,
        duration_minutes INTEGER DEFAULT 30,
        status TEXT DEFAULT 'scheduled',
        location TEXT,
        purpose TEXT,
        notes TEXT,
        follow_up_required INTEGER DEFAULT 0,
        follow_up_date TEXT,
        follow_up_time TEXT,
        follow_up_notes TEXT,
        presentation_slides TEXT,
        comments TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_modified TEXT,
        version INTEGER DEFAULT 1,
        sync_status TEXT DEFAULT 'pending',
        is_deleted INTEGER DEFAULT 0,
        local_changes TEXT
      );

      -- Meeting slide notes table
      CREATE TABLE IF NOT EXISTS meeting_notes (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        meeting_id TEXT NOT NULL,
        meeting_server_id TEXT,
        slide_id TEXT NOT NULL,
        slide_title TEXT NOT NULL,
        slide_order INTEGER NOT NULL,
        brochure_id TEXT NOT NULL,
        note_text TEXT NOT NULL,
        slide_image_uri TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_modified TEXT,
        version INTEGER DEFAULT 1,
        sync_status TEXT DEFAULT 'pending',
        is_deleted INTEGER DEFAULT 0,
        local_changes TEXT
      );

      -- Brochure sync table
      CREATE TABLE IF NOT EXISTS brochure_sync (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        mr_id TEXT NOT NULL,
        brochure_id TEXT NOT NULL,
        brochure_title TEXT,
        brochure_data TEXT NOT NULL,
        last_modified TEXT,
        created_at TEXT,
        version INTEGER DEFAULT 1,
        sync_status TEXT DEFAULT 'pending',
        is_deleted INTEGER DEFAULT 0,
        local_changes TEXT
      );

      -- Saved brochures table
      CREATE TABLE IF NOT EXISTS saved_brochures (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        mr_id TEXT NOT NULL,
        brochure_id TEXT NOT NULL,
        brochure_title TEXT NOT NULL,
        custom_title TEXT NOT NULL,
        original_brochure_data TEXT NOT NULL,
        saved_at TEXT,
        last_accessed TEXT,
        version INTEGER DEFAULT 1,
        sync_status TEXT DEFAULT 'pending',
        local_changes TEXT,
        is_deleted INTEGER DEFAULT 0
      );

      -- Activity logs table (optional)
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        user_id TEXT NOT NULL,
        mr_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        metadata TEXT,
        brochure_id TEXT,
        created_at TEXT,
        timestamp TEXT,
        version INTEGER DEFAULT 1,
        sync_status TEXT DEFAULT 'pending',
        is_deleted INTEGER DEFAULT 0,
        local_changes TEXT,
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1
      );

      -- Brochure categories table
      CREATE TABLE IF NOT EXISTS brochure_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#8b5cf6',
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending',
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1,
        local_changes TEXT
      );

      -- Brochure sync table
      CREATE TABLE IF NOT EXISTS brochure_sync (
        id TEXT PRIMARY KEY,
        server_id TEXT,
        mr_id TEXT NOT NULL,
        brochure_id TEXT NOT NULL,
        brochure_title TEXT,
        brochure_data TEXT NOT NULL,
        last_modified TEXT,
        created_at TEXT,
        version INTEGER DEFAULT 1,
        sync_status TEXT DEFAULT 'pending',
        is_deleted INTEGER DEFAULT 0,
        local_changes TEXT,
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1
      );

      -- Brochures table
      CREATE TABLE IF NOT EXISTS brochures (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT,
        description TEXT,
        file_url TEXT NOT NULL,
        thumbnail_url TEXT,
        pages INTEGER,
        file_size TEXT,
        status TEXT DEFAULT 'active',
        assigned_by TEXT,
        download_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        file_name TEXT,
        file_type TEXT,
        uploaded_by TEXT,
        is_public INTEGER DEFAULT 1,
        tags TEXT,
        version TEXT DEFAULT '1.0',
        category_id TEXT,
        sync_status TEXT DEFAULT 'pending',
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1,
        local_changes TEXT
      );

      -- Doctor assignments table
      CREATE TABLE IF NOT EXISTS doctor_assignments (
        id TEXT PRIMARY KEY,
        doctor_id TEXT NOT NULL,
        mr_id TEXT NOT NULL,
        assigned_by TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        assigned_at TEXT,
        transferred_at TEXT,
        notes TEXT,
        sync_status TEXT DEFAULT 'pending',
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1
      );

      -- Doctor photos table
      CREATE TABLE IF NOT EXISTS doctor_photos (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        file_name TEXT,
        file_path TEXT,
        photo_data TEXT,
        mime_type TEXT,
        created_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending',
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1,
        local_changes TEXT
      );

      -- Meeting slide notes table
      CREATE TABLE IF NOT EXISTS meeting_slide_notes (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        slide_id TEXT NOT NULL,
        slide_title TEXT NOT NULL,
        slide_order INTEGER NOT NULL,
        brochure_id TEXT NOT NULL,
        note_text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        slide_image_uri TEXT,
        sync_status TEXT DEFAULT 'pending',
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1
      );

      -- MR permissions table
      CREATE TABLE IF NOT EXISTS mr_permissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending',
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1
      );

      -- Saved brochures table
      CREATE TABLE IF NOT EXISTS saved_brochures (
        id TEXT PRIMARY KEY,
        mr_id TEXT NOT NULL,
        brochure_id TEXT NOT NULL,
        brochure_title TEXT NOT NULL,
        brochure_data TEXT NOT NULL,
        last_modified TEXT,
        created_at TEXT NOT NULL,
        sync_status TEXT DEFAULT 'pending',
        last_synced_at TEXT,
        needs_sync INTEGER DEFAULT 1,
        custom_title TEXT,
        original_brochure_data TEXT,
        local_changes TEXT,
        is_deleted INTEGER DEFAULT 0
      );

      -- User sessions table (removed duplicate definition - see below)

      -- Sync operations queue
      CREATE TABLE IF NOT EXISTS sync_operations (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        error_message TEXT
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE INDEX IF NOT EXISTS idx_doctors_mr_id ON doctors(mr_id);
      CREATE INDEX IF NOT EXISTS idx_doctors_sync_status ON doctors(sync_status);
      CREATE INDEX IF NOT EXISTS idx_doctors_server_id ON doctors(server_id);
      CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON doctors(specialty);
      CREATE INDEX IF NOT EXISTS idx_doctors_hospital ON doctors(hospital);

      CREATE INDEX IF NOT EXISTS idx_doctor_assignments_doctor_id ON doctor_assignments(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_doctor_assignments_mr_id ON doctor_assignments(mr_id);
      CREATE INDEX IF NOT EXISTS idx_doctor_assignments_status ON doctor_assignments(status);
      
      CREATE INDEX IF NOT EXISTS idx_meetings_mr_id ON meetings(mr_id);
      CREATE INDEX IF NOT EXISTS idx_meetings_doctor_id ON meetings(doctor_id);
      CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
      CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_date ON meetings(scheduled_date);
      CREATE INDEX IF NOT EXISTS idx_meetings_server_id ON meetings(server_id);
      
      CREATE INDEX IF NOT EXISTS idx_meeting_notes_meeting_id ON meeting_notes(meeting_id);
      CREATE INDEX IF NOT EXISTS idx_meeting_notes_slide_id ON meeting_notes(slide_id);
      CREATE INDEX IF NOT EXISTS idx_meeting_notes_brochure_id ON meeting_notes(brochure_id);
      CREATE UNIQUE INDEX IF NOT EXISTS unique_meeting_slide_note ON meeting_notes(meeting_id, slide_id);
      CREATE INDEX IF NOT EXISTS idx_meeting_notes_sync_status ON meeting_notes(sync_status);

      CREATE UNIQUE INDEX IF NOT EXISTS brochure_sync_unique ON brochure_sync(mr_id, brochure_id);
      CREATE INDEX IF NOT EXISTS idx_brochure_sync_mr_id ON brochure_sync(mr_id);
      CREATE INDEX IF NOT EXISTS idx_brochure_sync_last_modified ON brochure_sync(last_modified);

      CREATE UNIQUE INDEX IF NOT EXISTS saved_brochures_unique ON saved_brochures(mr_id, brochure_id);
      CREATE INDEX IF NOT EXISTS idx_saved_brochures_mr_id ON saved_brochures(mr_id);
      CREATE INDEX IF NOT EXISTS idx_saved_brochures_brochure_id ON saved_brochures(brochure_id);

      CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

      -- User sessions table (final definition with all required columns)
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        last_seen_at TEXT,
        created_at TEXT,
        updated_at TEXT,
        sync_status TEXT DEFAULT 'pending',
        local_changes TEXT
      );

      CREATE TABLE IF NOT EXISTS mr_permissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        sync_status TEXT DEFAULT 'pending',
        local_changes TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_device_id ON user_sessions(device_id);
      CREATE UNIQUE INDEX IF NOT EXISTS unique_user_device_session ON user_sessions(user_id, device_id);

      CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON mr_permissions(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS unique_permission_key ON mr_permissions(user_id, permission_key);
    `;

    // Execute all table creation statements using new API
    const statements = createTablesSQL.split(';').filter(stmt => stmt.trim());
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        try {
          await this.db.execAsync(statement);
          console.log(`LocalDB: Executed statement ${i + 1}/${statements.length}`);
        } catch (error) {
          console.error(`LocalDB: Failed to execute statement ${i + 1}:`, statement.substring(0, 100) + '...', error);
          throw error;
        }
      }
    }
    
    console.log('LocalDB: Tables created successfully');
  }

  /**
   * Run database migrations
   */
  private static async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      // Check current schema version using new API
      const versionCheck = await this.db.prepareAsync('SELECT MAX(version) as version FROM schema_version');
      let currentVersion = 0;
      try {
        const result = await versionCheck.executeAsync();
        const versionResult = await result.getFirstAsync();
        currentVersion = versionResult?.version || 0;
      } finally {
        await versionCheck.finalizeAsync();
      }
      
      console.log('LocalDB: Current schema version:', currentVersion);
      
      // Run migrations if needed
      if (currentVersion < 1) {
        await this.runMigration_001();
      }
      
      // Migration 2: Add last_seen_at to user_sessions table
      // Always check if column exists, even if version is 2 (in case migration failed previously)
      if (currentVersion < 2) {
        await this.runMigration_002();
      } else {
        // Even if version is 2, verify the column exists (in case of partial migration)
        try {
          const tableInfo = await this.db.prepareAsync('PRAGMA table_info(user_sessions)');
          const result = await tableInfo.executeAsync();
          const columns = await result.getAllAsync();
          await tableInfo.finalizeAsync();
          
          const columnNames = columns.map((col: any) => col.name);
          if (!columnNames.includes('last_seen_at')) {
            console.log('LocalDB: Schema version is 2 but last_seen_at column is missing, running migration 002...');
            await this.runMigration_002();
          }
        } catch (error) {
          console.log('LocalDB: Could not verify user_sessions schema, assuming migration needed');
          await this.runMigration_002();
        }
      }
      
      // Migration 3: Add local_changes to brochures, doctor_photos, brochure_categories, mr_permissions
      if (currentVersion < 3) {
        await this.runMigration_003();
      } else {
        // Even if version is 3, verify the columns exist (in case of partial migration)
        try {
          const tablesToCheck = ['brochures', 'doctor_photos', 'brochure_categories', 'mr_permissions'];
          let needsMigration = false;
          
          for (const tableName of tablesToCheck) {
            try {
              const tableInfo = await this.db.prepareAsync(`PRAGMA table_info(${tableName})`);
              const result = await tableInfo.executeAsync();
              const columns = await result.getAllAsync();
              await tableInfo.finalizeAsync();
              
              const columnNames = columns.map((col: any) => col.name);
              if (!columnNames.includes('local_changes')) {
                console.log(`LocalDB: Schema version is 3 but ${tableName} table is missing local_changes column, running migration 003...`);
                needsMigration = true;
                break;
              }
            } catch (error) {
              console.log(`LocalDB: Could not verify ${tableName} schema, assuming migration needed`);
              needsMigration = true;
              break;
            }
          }
          
          if (needsMigration) {
            await this.runMigration_003();
          }
        } catch (error) {
          console.log('LocalDB: Could not verify local_changes columns, assuming migration needed');
          await this.runMigration_003();
        }
      }
      
      // Migration 4: Add is_deleted to saved_brochures table
      if (currentVersion < 4) {
        await this.runMigration_004();
      } else {
        // Even if version is 4, verify the column exists (in case of partial migration)
        try {
          const tableInfo = await this.db.prepareAsync('PRAGMA table_info(saved_brochures)');
          const result = await tableInfo.executeAsync();
          const columns = await result.getAllAsync();
          await tableInfo.finalizeAsync();
          
          const columnNames = columns.map((col: any) => col.name);
          if (!columnNames.includes('is_deleted')) {
            console.log('LocalDB: Schema version is 4 but saved_brochures table is missing is_deleted column, running migration 004...');
            await this.runMigration_004();
          }
        } catch (error) {
          console.log('LocalDB: Could not verify saved_brochures schema, assuming migration needed');
          await this.runMigration_004();
        }
      }
      
    } catch (error) {
      console.error('LocalDB: Migration error:', error);
      throw error;
    }
  }

  /**
   * Migration 001: Initial schema
   */
  private static async runMigration_001(): Promise<void> {
    console.log('LocalDB: Running migration 001...');
    
    await this.db.execAsync('INSERT INTO schema_version (version) VALUES (1)');
    console.log('LocalDB: Migration 001 completed');
  }

  /**
   * Migration 002: Add last_seen_at to user_sessions table
   */
  private static async runMigration_002(): Promise<void> {
    console.log('LocalDB: Running migration 002 - Adding last_seen_at to user_sessions...');
    
    try {
      // Check if user_sessions table exists
      const tableCheck = await this.db.prepareAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_sessions'"
      );
      const tableResult = await tableCheck.executeAsync();
      const tables = await tableResult.getAllAsync();
      await tableCheck.finalizeAsync();
      
      if (tables.length === 0) {
        console.log('LocalDB: user_sessions table does not exist, will be created with correct schema');
        await this.db.execAsync('INSERT INTO schema_version (version) VALUES (2)');
        return;
      }
      
      // Check if column already exists
      const tableInfo = await this.db.prepareAsync('PRAGMA table_info(user_sessions)');
      const result = await tableInfo.executeAsync();
      const columns = await result.getAllAsync();
      await tableInfo.finalizeAsync();
      
      const columnNames = columns.map((col: any) => col.name);
      const requiredColumns = ['last_seen_at', 'updated_at', 'created_at', 'local_changes'];
      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
      
      // Add missing columns
      for (const column of missingColumns) {
        try {
          await this.db.execAsync(`ALTER TABLE user_sessions ADD COLUMN ${column} TEXT`);
          console.log(`LocalDB: Added ${column} column to user_sessions table`);
        } catch (alterError: any) {
          // If ALTER fails (e.g., column already exists due to race condition), log and continue
          if (alterError.message && alterError.message.includes('duplicate column')) {
            console.log(`LocalDB: ${column} column already exists (race condition)`);
          } else {
            throw alterError;
          }
        }
      }
      
      if (missingColumns.length === 0) {
        console.log('LocalDB: All required columns exist in user_sessions table');
      }
      
      // Only insert version if it doesn't already exist
      try {
        const versionCheck = await this.db.prepareAsync('SELECT version FROM schema_version WHERE version = 2');
        const versionResult = await versionCheck.executeAsync();
        const versionRow = await versionResult.getFirstAsync();
        await versionCheck.finalizeAsync();
        
        if (!versionRow) {
          await this.db.execAsync('INSERT INTO schema_version (version) VALUES (2)');
        }
      } catch (error) {
        // If check fails, try to insert (might fail if duplicate, that's okay)
        try {
          await this.db.execAsync('INSERT INTO schema_version (version) VALUES (2)');
        } catch (insertError) {
          // Ignore duplicate entry errors
          console.log('LocalDB: Schema version 2 already exists');
        }
      }
      console.log('LocalDB: Migration 002 completed');
    } catch (error) {
      console.error('LocalDB: Migration 002 failed:', error);
      // If migration fails, try to recreate the table
      throw error;
    }
  }

  /**
   * Migration 003: Add local_changes column to brochures, doctor_photos, brochure_categories, mr_permissions
   */
  private static async runMigration_003(): Promise<void> {
    console.log('LocalDB: Running migration 003 - Adding local_changes to brochures, doctor_photos, brochure_categories, mr_permissions...');
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      // Add local_changes to brochures table
      try {
        await this.db.execAsync('ALTER TABLE brochures ADD COLUMN local_changes TEXT');
        console.log('LocalDB: Added local_changes to brochures table');
      } catch (error: any) {
        if (error?.message?.includes('duplicate column name') || error?.message?.includes('already exists')) {
          console.log('LocalDB: local_changes already exists in brochures table');
        } else {
          console.warn('LocalDB: Could not add local_changes to brochures:', error);
        }
      }
      
      // Add local_changes to doctor_photos table
      try {
        await this.db.execAsync('ALTER TABLE doctor_photos ADD COLUMN local_changes TEXT');
        console.log('LocalDB: Added local_changes to doctor_photos table');
      } catch (error: any) {
        if (error?.message?.includes('duplicate column name') || error?.message?.includes('already exists')) {
          console.log('LocalDB: local_changes already exists in doctor_photos table');
        } else {
          console.warn('LocalDB: Could not add local_changes to doctor_photos:', error);
        }
      }
      
      // Add local_changes to brochure_categories table
      try {
        await this.db.execAsync('ALTER TABLE brochure_categories ADD COLUMN local_changes TEXT');
        console.log('LocalDB: Added local_changes to brochure_categories table');
      } catch (error: any) {
        if (error?.message?.includes('duplicate column name') || error?.message?.includes('already exists')) {
          console.log('LocalDB: local_changes already exists in brochure_categories table');
        } else {
          console.warn('LocalDB: Could not add local_changes to brochure_categories:', error);
        }
      }
      
      // Add local_changes to mr_permissions table
      try {
        await this.db.execAsync('ALTER TABLE mr_permissions ADD COLUMN local_changes TEXT');
        console.log('LocalDB: Added local_changes to mr_permissions table');
      } catch (error: any) {
        if (error?.message?.includes('duplicate column name') || error?.message?.includes('already exists')) {
          console.log('LocalDB: local_changes already exists in mr_permissions table');
        } else {
          console.warn('LocalDB: Could not add local_changes to mr_permissions:', error);
        }
      }
      
      // Update schema version to 3
      try {
        const versionCheck = await this.db.prepareAsync('SELECT version FROM schema_version WHERE version = 3');
        const versionResult = await versionCheck.executeAsync();
        const versionRow = await versionResult.getFirstAsync();
        await versionCheck.finalizeAsync();
        
        if (!versionRow) {
          await this.db.execAsync('INSERT INTO schema_version (version) VALUES (3)');
          console.log('LocalDB: Schema version updated to 3');
        } else {
          console.log('LocalDB: Schema version 3 already exists');
        }
      } catch (error) {
        // If check fails, try to insert (might fail if duplicate, that's okay)
        try {
          await this.db.execAsync('INSERT INTO schema_version (version) VALUES (3)');
          console.log('LocalDB: Schema version updated to 3');
        } catch (insertError) {
          // Ignore duplicate entry errors
          console.log('LocalDB: Schema version 3 already exists');
        }
      }
      
      console.log('LocalDB: Migration 003 completed');
    } catch (error) {
      console.error('LocalDB: Migration 003 failed:', error);
      throw error;
    }
  }

  /**
   * Migration 004: Add is_deleted column to saved_brochures table
   */
  private static async runMigration_004(): Promise<void> {
    console.log('LocalDB: Running migration 004 - Adding is_deleted to saved_brochures...');
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      // Add is_deleted to saved_brochures table
      try {
        await this.db.execAsync('ALTER TABLE saved_brochures ADD COLUMN is_deleted INTEGER DEFAULT 0');
        console.log('LocalDB: Added is_deleted to saved_brochures table');
      } catch (error: any) {
        if (error?.message?.includes('duplicate column name') || error?.message?.includes('already exists')) {
          console.log('LocalDB: is_deleted already exists in saved_brochures table');
        } else {
          console.warn('LocalDB: Could not add is_deleted to saved_brochures:', error);
        }
      }
      
      // Update schema version to 4
      try {
        const versionCheck = await this.db.prepareAsync('SELECT version FROM schema_version WHERE version = 4');
        const versionResult = await versionCheck.executeAsync();
        const versionRow = await versionResult.getFirstAsync();
        await versionCheck.finalizeAsync();
        
        if (!versionRow) {
          await this.db.execAsync('INSERT INTO schema_version (version) VALUES (4)');
          console.log('LocalDB: Schema version updated to 4');
        } else {
          console.log('LocalDB: Schema version 4 already exists');
        }
      } catch (error) {
        // If check fails, try to insert (might fail if duplicate, that's okay)
        try {
          await this.db.execAsync('INSERT INTO schema_version (version) VALUES (4)');
          console.log('LocalDB: Schema version updated to 4');
        } catch (insertError) {
          // Ignore duplicate entry errors
          console.log('LocalDB: Schema version 4 already exists');
        }
      }
      
      console.log('LocalDB: Migration 004 completed');
    } catch (error) {
      console.error('LocalDB: Migration 004 failed:', error);
      throw error;
    }
  }

  // ==================== DOCTORS CRUD ====================

  /**
   * Create a new doctor locally
   */
  static async createDoctor(doctorData: Omit<LocalDoctor, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'is_deleted'> & { skipSyncQueue?: boolean }): Promise<string> {
    await this.initialize();
    
    const skipSyncQueue = doctorData.skipSyncQueue || false;
    const syncStatus = skipSyncQueue ? 'synced' : 'pending';
    
    const id = (doctorData as any).id || generateUUID();
    const now = new Date().toISOString();
    
    const doctor: LocalDoctor = {
      id,
      ...doctorData,
      created_at: (doctorData as any).created_at || now,
      updated_at: (doctorData as any).updated_at || now,
      last_modified: doctorData.last_modified || now,
      version: (doctorData as any).version || 1,
      sync_status: (doctorData as any).sync_status || syncStatus,
      is_deleted: false
    };

    try {
      if (this.isUsingAsyncStorage()) {
        // Use AsyncStorage fallback
        const doctorsData = await AsyncStorage.getItem('doctors');
        const doctors = doctorsData ? JSON.parse(doctorsData) : [];
        doctors.push(doctor);
        await AsyncStorage.setItem('doctors', JSON.stringify(doctors));
        
        // Add to sync queue only if not skipping
        if (!skipSyncQueue) {
          const syncData = await AsyncStorage.getItem('sync_operations');
          const syncOps = syncData ? JSON.parse(syncData) : [];
          syncOps.push({
            id: generateUUID(),
            table_name: 'doctors',
            operation: 'create',
            record_id: doctor.id,
            data: doctor,
            created_at: now,
            retry_count: 0
          });
          await AsyncStorage.setItem('sync_operations', JSON.stringify(syncOps));
        }
      } else {
        // Use SQLite
      await this.db.runAsync(`
        INSERT INTO doctors (
            id, server_id, mr_id, first_name, last_name, email, phone, specialty, hospital, location, profile_image_url, notes, relationship_status,
            meetings_count, last_meeting_date, next_appointment, created_by, created_at, updated_at, last_modified, version, sync_status, is_deleted, local_changes
          ) VALUES (${Array(24).fill('?').join(', ')})
      `, [
        doctor.id, doctor.server_id || null, doctor.mr_id, doctor.first_name, 
          doctor.last_name, doctor.email || null, doctor.phone || null, doctor.specialty, doctor.hospital, doctor.location || null,
          doctor.profile_image_url || null, doctor.notes || null, doctor.relationship_status, doctor.meetings_count,
          doctor.last_meeting_date || null, doctor.next_appointment || null,
          doctor.created_by || null, doctor.created_at, doctor.updated_at,
          doctor.last_modified || doctor.updated_at, doctor.version, doctor.sync_status,
          doctor.is_deleted ? 1 : 0, doctor.local_changes || null
      ]);

      // Add to sync queue only if not skipping
      if (!skipSyncQueue) {
        await this.addToSyncQueue('create', 'doctors', id, doctor);
        
        // Create activity log for doctor creation (only for user-created doctors, not server syncs)
        try {
          await this.createActivityLog({
            user_id: doctor.mr_id,
            mr_id: doctor.mr_id,
            activity_type: 'doctor_added',
            description: `Added doctor: ${doctor.first_name} ${doctor.last_name}`,
            metadata: JSON.stringify({
              doctor_id: id,
              specialty: doctor.specialty,
              hospital: doctor.hospital,
            }),
            is_deleted: false
          });
        } catch (error) {
          console.warn('LocalDB: Failed to create activity log for doctor:', error);
        }
      }
      }
      
      console.log('LocalDB: Doctor created locally:', id, skipSyncQueue ? '(server sync, skipped queue)' : '(user change)');
      return id;
    } catch (error) {
      console.error('LocalDB: Failed to create doctor:', error);
      throw error;
    }
  }

  /**
   * Get all doctors for an MR
   */
  static async getDoctors(mrId: string): Promise<LocalDoctor[]> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        // Use AsyncStorage fallback
        const doctorsData = await AsyncStorage.getItem('doctors');
        const doctors = doctorsData ? JSON.parse(doctorsData) : [];
        return doctors.filter((doctor: LocalDoctor) => 
          doctor.mr_id === mrId && !doctor.is_deleted
        ).sort((a: LocalDoctor, b: LocalDoctor) => 
          `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
        );
      } else {
        // Use SQLite - get all doctors first
        const result = await this.db.getAllAsync(`
          SELECT * FROM doctors 
          WHERE mr_id = ? AND is_deleted = 0 
          ORDER BY 
            CASE WHEN id IS NOT NULL AND id != '' THEN 1 ELSE 0 END DESC,
            created_at DESC
        `, [mrId]);
        
        // Deduplicate by server_id (keep only one per server_id)
        const deduplicated = new Map<string, any>();
        result.forEach((doctor: any) => {
          const key = doctor.server_id || doctor.id;
          if (key && !deduplicated.has(key)) {
            deduplicated.set(key, doctor);
          } else if (key) {
            // If duplicate, keep the one with a valid id (not null)
            const existing = deduplicated.get(key);
            if (existing && !existing.id && doctor.id) {
              deduplicated.set(key, doctor); // Replace null id with valid id
            }
          } else if (doctor.id) {
            // If no server_id but has id, use id as key
            if (!deduplicated.has(doctor.id)) {
              deduplicated.set(doctor.id, doctor);
            }
          }
        });
        
        const finalResult = Array.from(deduplicated.values()).sort((a: any, b: any) => 
          `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
        );

        return finalResult.map((row: any) => ({
          ...row,
          is_deleted: Boolean(row.is_deleted)
        })) as LocalDoctor[];
      }
    } catch (error) {
      console.error('LocalDB: Failed to get doctors:', error);
      throw error;
    }
  }

  /**
   * Get doctor by ID
   */
  static async getDoctorById(id: string): Promise<LocalDoctor | null> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('doctors');
        const doctors: LocalDoctor[] = data ? JSON.parse(data) : [];
        return doctors.find(d => d.id === id && !d.is_deleted) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM doctors WHERE id = ? AND is_deleted = 0
      `, [id]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalDoctor;
    } catch (error) {
      console.error('LocalDB: Failed to get doctor by ID:', error);
      throw error;
    }
  }

  /**
   * Get doctor by server ID
   */
  static async getDoctorByServerId(serverId: string): Promise<LocalDoctor | null> {
    await this.initialize();
    
    if (!serverId) {
      return null; // Skip if server_id is undefined/null
    }
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('doctors');
        const doctors: LocalDoctor[] = data ? JSON.parse(data) : [];
        return doctors.find(d => d.server_id === serverId && !d.is_deleted) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM doctors WHERE server_id = ? AND is_deleted = 0
        ORDER BY id DESC LIMIT 1
      `, [serverId]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalDoctor;
    } catch (error) {
      console.error('LocalDB: Failed to get doctor by server ID:', error);
      throw error;
    }
  }

  /**
   * Update doctor
   */
  static async updateDoctor(id: string, updates: Partial<LocalDoctor> & { skipSyncQueue?: boolean }): Promise<void> {
    await this.initialize();
    
    try {
      const skipSyncQueue = updates.skipSyncQueue || false;
      const now = new Date().toISOString();
      const updateFields = [];
      const values = [];

      // Build dynamic update query
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at' && key !== 'skipSyncQueue') {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      const syncStatus = skipSyncQueue ? (updates.sync_status || 'synced') : 'pending';
      updateFields.push('updated_at = ?', 'version = version + 1', 'sync_status = ?');
      values.push(now, syncStatus, id);

      await this.executeQuery(`
        UPDATE doctors SET ${updateFields.join(', ')} WHERE id = ?
      `, values);

      // Add to sync queue only if not skipping
      if (!skipSyncQueue) {
        const updatedDoctor = await this.getDoctorById(id);
        if (updatedDoctor) {
          await this.addToSyncQueue('update', 'doctors', id, updatedDoctor);
          
          // Create activity log for doctor update (only for user changes, not server syncs)
          try {
            await this.createActivityLog({
              user_id: updatedDoctor.mr_id,
              mr_id: updatedDoctor.mr_id,
              activity_type: 'doctor_updated',
              description: `Updated doctor: ${updatedDoctor.first_name} ${updatedDoctor.last_name}`,
              metadata: JSON.stringify({
                doctor_id: id,
                specialty: updatedDoctor.specialty,
                hospital: updatedDoctor.hospital,
              }),
              is_deleted: false
            });
          } catch (error) {
            console.warn('LocalDB: Failed to create activity log for doctor update:', error);
          }
        }
      }

      console.log('LocalDB: Doctor updated:', id, skipSyncQueue ? '(server sync, skipped queue)' : '(user change)');
    } catch (error) {
      console.error('LocalDB: Failed to update doctor:', error);
      throw error;
    }
  }

  /**
   * Upsert doctor (for server syncs)
   */
  static async upsertDoctor(doctor: LocalDoctor): Promise<void> {
    await this.initialize();
    
    try {
      const existing = await this.getDoctorByServerId(doctor.server_id || '');
      
      if (existing) {
        // Update existing doctor (skip sync queue for server sync)
        await this.updateDoctor(existing.id, {
          ...doctor,
          skipSyncQueue: true,
          sync_status: 'synced'
        });
      } else {
        // Create new doctor (skip sync queue for server sync)
        await this.createDoctor({
          ...doctor,
          skipSyncQueue: true
        });
      }
    } catch (error) {
      console.error('LocalDB: Failed to upsert doctor:', error);
      throw error;
    }
  }

  /**
   * Delete doctor (soft delete)
   */
  static async deleteDoctor(id: string): Promise<void> {
    await this.initialize();
    
    try {
      const doctorToDelete = await this.getDoctorById(id);
      if (!doctorToDelete) {
        console.warn(`LocalDB: Attempted to delete non-existent doctor with id: ${id}`);
        // If it doesn't exist locally, ensure it's not in the sync queue either
        await this.executeQuery(`DELETE FROM sync_queue WHERE record_id = ? AND table_name = 'doctors'`, [id]);
        return;
      }

      const now = new Date().toISOString();
      
      await this.executeQuery(`
        UPDATE doctors 
        SET is_deleted = 1, updated_at = ?, version = version + 1, sync_status = ? 
        WHERE id = ?
      `, [now, 'pending', id]);

      // Add to sync queue with the full record to ensure server_id is present
      await this.addToSyncQueue('delete', 'doctors', id, doctorToDelete);
      
      console.log('LocalDB: Doctor soft deleted:', id);
    } catch (error) {
      console.error('LocalDB: Failed to delete doctor:', error);
      throw error;
    }
  }

  private static normalizeString(value?: string | null): string {
    return (value ?? '').trim().toLowerCase();
  }

  private static normalizePhone(value?: string | null): string {
    return (value ?? '').replace(/\D/g, '');
  }

  private static mapRowToDoctor(row: any): LocalDoctor {
    return {
      id: row.id,
      server_id: row.server_id || undefined,
      mr_id: row.mr_id,
      first_name: row.first_name,
      last_name: row.last_name,
      specialty: row.specialty,
      hospital: row.hospital,
      phone: row.phone || undefined,
      email: row.email || undefined,
      location: row.location || undefined,
      profile_image_url: row.profile_image_url || undefined,
      notes: row.notes || undefined,
      relationship_status: row.relationship_status || 'active',
      meetings_count: row.meetings_count ?? 0,
      last_meeting_date: row.last_meeting_date || undefined,
      next_appointment: row.next_appointment || undefined,
      created_by: row.created_by || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_modified: row.last_modified || undefined,
      version: row.version ?? 1,
      sync_status: row.sync_status || 'synced',
      is_deleted: Boolean(row.is_deleted),
      local_changes: row.local_changes || undefined,
    };
  }

  static async findMatchingLocalDoctor(mrId: string, server: any, excludeId?: string): Promise<LocalDoctor | null> {
    await this.initialize();

    const rows = await this.db.getAllAsync(`
      SELECT * FROM doctors
      WHERE mr_id = ? AND is_deleted = 0 AND (server_id IS NULL OR server_id = '')
    `, [mrId]);

    const candidates = rows
      .map((row: any) => this.mapRowToDoctor(row))
      .filter((doctor: LocalDoctor) => doctor.id !== excludeId);

    if (candidates.length === 0) {
      return null;
    }

    const normalizedEmail = this.normalizeString(server.email || server.email_address);
    if (normalizedEmail) {
      const match = candidates.find((candidate: LocalDoctor) => this.normalizeString(candidate.email) === normalizedEmail);
      if (match) {
        return match;
      }
    }

    const normalizedPhone = this.normalizePhone(server.phone || server.phone_number);
    if (normalizedPhone) {
      const match = candidates.find((candidate: LocalDoctor) => this.normalizePhone(candidate.phone) === normalizedPhone);
      if (match) {
        return match;
      }
    }

    const serverFirst = this.normalizeString(server.first_name || server.firstname || server.firstName);
    const serverLast = this.normalizeString(server.last_name || server.lastname || server.lastName);
    const serverHospital = this.normalizeString(server.hospital || server.hospital_name);

    if (serverFirst || serverLast) {
      const match = candidates.find((candidate: LocalDoctor) =>
        this.normalizeString(candidate.first_name) === serverFirst &&
        this.normalizeString(candidate.last_name) === serverLast &&
        (!serverHospital || this.normalizeString(candidate.hospital) === serverHospital)
      );

      if (match) {
        return match;
      }
    }

    return null;
  }

  private static async applyServerDoctorUpdate(localDoctor: LocalDoctor, server: any, mrId: string, serverDoctorId?: string): Promise<void> {
    await this.initialize();

    const now = new Date().toISOString();
    const serverId = serverDoctorId || localDoctor.server_id || null;

    const updatedFirstName = server.first_name ?? server.firstname ?? server.firstName ?? localDoctor.first_name;
    const updatedLastName = server.last_name ?? server.lastname ?? server.lastName ?? localDoctor.last_name;
    const updatedEmail = server.email ?? server.email_address ?? localDoctor.email ?? null;
    const updatedPhone = server.phone ?? server.phone_number ?? localDoctor.phone ?? null;
    const updatedSpecialty = server.specialty ?? server.specialisation ?? localDoctor.specialty;
    const updatedHospital = server.hospital ?? server.hospital_name ?? localDoctor.hospital;
    const updatedLocation = server.location ?? server.address ?? localDoctor.location ?? null;
    const updatedProfileImageUrl = server.profile_image_url ?? localDoctor.profile_image_url ?? null;
    const updatedNotes = localDoctor.notes ?? server.notes ?? null;
    const updatedRelationshipStatus = server.relationship_status ?? server.status ?? localDoctor.relationship_status ?? 'active';
    const updatedMeetingsCount = server.meetings_count ?? localDoctor.meetings_count ?? 0;
    const updatedLastMeetingDate = server.last_meeting_date ?? localDoctor.last_meeting_date ?? null;
    const updatedNextAppointment = server.next_meeting_date ?? server.next_appointment ?? localDoctor.next_appointment ?? null;
    const updatedCreatedBy = server.created_by ?? localDoctor.created_by ?? mrId;
    const updatedAt = server.updated_at ?? now;
    const lastModified = server.last_modified ?? updatedAt;

    await this.db.runAsync(`
      UPDATE doctors
      SET server_id = ?, first_name = ?, last_name = ?, email = ?, phone = ?, specialty = ?, hospital = ?, location = ?,
          profile_image_url = ?, notes = ?, relationship_status = ?, meetings_count = ?, last_meeting_date = ?,
          next_appointment = ?, created_by = ?, updated_at = ?, last_modified = ?, version = version + 1,
          sync_status = 'synced', is_deleted = 0, local_changes = NULL
      WHERE id = ?
    `, [
      serverId,
      updatedFirstName,
      updatedLastName,
      updatedEmail,
      updatedPhone,
      updatedSpecialty,
      updatedHospital,
      updatedLocation,
      updatedProfileImageUrl,
      updatedNotes,
      updatedRelationshipStatus,
      updatedMeetingsCount,
      updatedLastMeetingDate,
      updatedNextAppointment,
      updatedCreatedBy,
      updatedAt,
      lastModified,
      localDoctor.id
    ]);
  }

  static async reassignDoctorReferences(oldDoctorId: string, newDoctorId: string, serverDoctorId?: string | null): Promise<void> {
    await this.initialize();

    const serverIdValue = serverDoctorId || null;

    await this.db.runAsync(`
      UPDATE meetings
      SET doctor_id = ?, doctor_server_id = ?
      WHERE doctor_id = ?
    `, [newDoctorId, serverIdValue, oldDoctorId]);

    await this.db.runAsync(`
      UPDATE doctor_assignments
      SET doctor_id = ?, doctor_server_id = ?
      WHERE doctor_id = ?
    `, [newDoctorId, serverIdValue, oldDoctorId]);
  }

  private static async softDeleteDoctorWithoutSync(id: string): Promise<void> {
    await this.initialize();
    const now = new Date().toISOString();

    await this.db.runAsync(`
      UPDATE doctors
      SET is_deleted = 1, updated_at = ?, last_modified = ?, version = version + 1,
          sync_status = 'synced', local_changes = NULL
      WHERE id = ?
    `, [now, now, id]);
  }

  private static async cleanupDuplicateDoctorsByServerId(mrId: string): Promise<void> {
    await this.initialize();

    const rows = await this.db.getAllAsync(`
      SELECT * FROM doctors
      WHERE mr_id = ? AND server_id IS NOT NULL AND server_id <> '' AND is_deleted = 0
      ORDER BY updated_at DESC
    `, [mrId]);

    const seen = new Map<string, any>();

    for (const row of rows) {
      const serverId = row.server_id;
      if (!serverId) {
        continue;
      }

      if (!seen.has(serverId)) {
        seen.set(serverId, row);
      } else {
        const keepRow = seen.get(serverId);
        await this.reassignDoctorReferences(row.id, keepRow.id, serverId);
        await this.softDeleteDoctorWithoutSync(row.id);
      }
    }
  }

  static async setDoctorServerId(localId: string, serverId?: string | null): Promise<void> {
    await this.initialize();

    const now = new Date().toISOString();
    await this.db.runAsync(`
      UPDATE doctors
      SET server_id = ?, updated_at = ?, last_modified = ?, version = version + 1,
          sync_status = 'synced', local_changes = NULL
      WHERE id = ?
    `, [serverId || null, now, now, localId]);
  }

  static async markDoctorSynced(localId: string): Promise<void> {
    await this.initialize();

    const now = new Date().toISOString();
    await this.db.runAsync(`
      UPDATE doctors
      SET updated_at = ?, last_modified = ?, version = version + 1,
          sync_status = 'synced', local_changes = NULL
      WHERE id = ?
    `, [now, now, localId]);
  }

  /**
   * Mark all doctors with server_id as synced (fix for old records)
   */
  static async markServerDoctorsSynced(mrId: string): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      if (this.isUsingAsyncStorage()) {
        const doctorsData = await AsyncStorage.getItem('doctors');
        const doctors = doctorsData ? JSON.parse(doctorsData) : [];
        let updated = false;
        doctors.forEach((doctor: LocalDoctor) => {
          if (doctor.mr_id === mrId && doctor.server_id && doctor.sync_status === 'pending') {
            doctor.sync_status = 'synced';
            doctor.updated_at = now;
            doctor.local_changes = undefined;
            updated = true;
          }
        });
        if (updated) {
          await AsyncStorage.setItem('doctors', JSON.stringify(doctors));
        }
      } else {
        await this.db.runAsync(`
          UPDATE doctors
          SET updated_at = ?, last_modified = ?, sync_status = 'synced', local_changes = NULL
          WHERE mr_id = ? AND server_id IS NOT NULL AND server_id <> '' AND sync_status = 'pending'
        `, [now, now, mrId]);
      }
      console.log('LocalDB: Marked server doctors as synced for MR:', mrId);
    } catch (error) {
      console.error('LocalDB: Failed to mark server doctors as synced:', error);
    }
  }

  static async mergeDoctors(mrId: string, serverDoctors: any[]): Promise<void> {
    await this.initialize();

    for (const server of serverDoctors) {
      const serverDoctorId = server?.id || server?.doctor_id || server?.server_id || null;
      
      // Check if this doctor is pending deletion locally. If so, skip.
      const pendingDelete = serverDoctorId ? await this.db.getFirstAsync(
        `SELECT 1 FROM sync_queue WHERE table_name = 'doctors' AND operation_type = 'delete' AND data LIKE ?`,
        [`%${serverDoctorId}%`]
      ) : null;

      if (pendingDelete) {
        console.log(`LocalDB: Skipping merge for server doctor ${serverDoctorId} as it's pending deletion.`);
        continue;
      }
      
      const existing = serverDoctorId ? await this.getDoctorByServerId(serverDoctorId) : null;

      const matchingLocal = await this.findMatchingLocalDoctor(mrId, server, existing?.id);

      if (matchingLocal) {
        await this.applyServerDoctorUpdate(matchingLocal, server, mrId, serverDoctorId || undefined);

        if (existing && existing.id !== matchingLocal.id) {
          await this.reassignDoctorReferences(existing.id, matchingLocal.id, serverDoctorId);
          await this.softDeleteDoctorWithoutSync(existing.id);
        }
      } else if (existing) {
        await this.applyServerDoctorUpdate(existing, server, mrId, serverDoctorId || undefined);
      } else {
        const id = generateUUID();
        const now = new Date().toISOString();

        await this.db.runAsync(`
          INSERT INTO doctors (
            id, server_id, mr_id, first_name, last_name, email, phone, specialty, hospital, location,
            profile_image_url, notes, relationship_status, meetings_count, last_meeting_date,
            next_appointment, created_by, created_at, updated_at, last_modified,
            version, sync_status, is_deleted, local_changes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          serverDoctorId,
          mrId,
          server.first_name ?? server.firstname ?? server.firstName ?? '',
          server.last_name ?? server.lastname ?? server.lastName ?? '',
          server.email || server.email_address || null,
          server.phone || server.phone_number || null,
          server.specialty || server.specialisation || '',
          server.hospital || server.hospital_name || '',
          server.location || server.address || null,
          server.profile_image_url || null,
          server.notes || null,
          server.relationship_status || server.status || 'active',
          server.meetings_count || 0,
          server.last_meeting_date || null,
          server.next_meeting_date || server.next_appointment || null,
          server.created_by || mrId,
          server.created_at || now,
          server.updated_at || now,
          server.updated_at || now,
          1,
          'synced',
          0,
          null
        ]);
      }
    }

    await this.cleanupDuplicateDoctorsByServerId(mrId);
  }

  static async hardDeleteDoctor(id: string): Promise<void> {
    await this.initialize();
    try {
      await this.db.runAsync(`DELETE FROM doctors WHERE id = ?`, [id]);
      await this.db.runAsync(`DELETE FROM sync_operations WHERE record_id = ? AND table_name = 'doctors'`, [id]);
      console.log('LocalDB: Hard deleted doctor:', id);
    } catch (error) {
      console.error('LocalDB: Failed to hard delete doctor:', error);
      throw error;
    }
  }

  // ==================== MEETINGS CRUD ====================

  /**
   * Create a new meeting locally
   */
  static async createMeeting(meetingData: Omit<LocalMeeting, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'is_deleted'>): Promise<string> {
    await this.initialize();
    
    const id = generateUUID();
    const now = new Date().toISOString();
    
    const meeting: LocalMeeting = {
      id,
      ...meetingData,
      created_at: now,
      updated_at: now,
      version: 1,
      sync_status: 'pending',
      is_deleted: false
    };

    try {
      await this.db.runAsync(`
        INSERT INTO meetings (
          id, server_id, mr_id, doctor_id, doctor_server_id, brochure_id, title, scheduled_date, 
          duration_minutes, status, location, purpose, notes, follow_up_required,
          follow_up_date, follow_up_time, follow_up_notes, presentation_slides, comments,
          created_at, updated_at, last_modified, version, sync_status, is_deleted, local_changes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        meeting.id, meeting.server_id || null, meeting.mr_id, meeting.doctor_id,
        meeting.doctor_server_id || null, meeting.brochure_id || null, meeting.title, meeting.scheduled_date,
        meeting.duration_minutes, meeting.status, meeting.location || null,
        meeting.purpose || null, meeting.notes || null, meeting.follow_up_required ? 1 : 0,
        meeting.follow_up_date || null, meeting.follow_up_time || null, meeting.follow_up_notes || null,
        meeting.presentation_slides || null, meeting.comments || null, meeting.created_at,
        meeting.updated_at, meeting.last_modified || null, meeting.version, meeting.sync_status,
        meeting.is_deleted ? 1 : 0, meeting.local_changes || null
      ]);

      // Add to sync queue
      await this.addToSyncQueue('create', 'meetings', id, meeting);
      
      // Create activity log for meeting creation
      try {
        await this.createActivityLog({
          user_id: meeting.mr_id,
          mr_id: meeting.mr_id,
          activity_type: 'meeting_scheduled',
          description: `Scheduled meeting: ${meeting.title}`,
          metadata: JSON.stringify({
            meeting_id: id,
            doctor_id: meeting.doctor_id,
            scheduled_date: meeting.scheduled_date,
          }),
          is_deleted: false
        });
      } catch (error) {
        console.warn('LocalDB: Failed to create activity log for meeting:', error);
        // Don't throw - activity log failure shouldn't prevent meeting creation
      }
      
      console.log('LocalDB: Meeting created locally:', id);
      return id;
    } catch (error) {
      console.error('LocalDB: Failed to create meeting:', error);
      throw error;
    }
  }

  /**
   * Get all meetings for an MR
   */
  static async getMeetings(mrId: string): Promise<LocalMeeting[]> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('meetings');
        const meetings: LocalMeeting[] = data ? JSON.parse(data) : [];
        return meetings
          .filter(m => m.mr_id === mrId && !m.is_deleted)
          .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
      }

      const result = await this.db.getAllAsync(`
        SELECT * FROM meetings 
        WHERE mr_id = ? AND is_deleted = 0 
        ORDER BY scheduled_date DESC, duration_minutes DESC
      `, [mrId]);

      return result.map((row: any) => ({
        ...row,
        is_deleted: Boolean(row.is_deleted)
      })) as LocalMeeting[];
    } catch (error) {
      console.error('LocalDB: Failed to get meetings:', error);
      throw error;
    }
  }

  /**
   * Get meeting by ID
   */
  static async getMeetingById(id: string): Promise<LocalMeeting | null> {
    await this.initialize();
    
    try {
       if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('meetings');
        const meetings: LocalMeeting[] = data ? JSON.parse(data) : [];
        return meetings.find(m => m.id === id && !m.is_deleted) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM meetings WHERE id = ? AND is_deleted = 0
      `, [id]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalMeeting;
    } catch (error) {
      console.error('LocalDB: Failed to get meeting by ID:', error);
      throw error;
    }
  }

  /**
   * Get meeting by server ID
   */
  static async getMeetingByServerId(serverId: string): Promise<LocalMeeting | null> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('meetings');
        const meetings: LocalMeeting[] = data ? JSON.parse(data) : [];
        return meetings.find(m => m.server_id === serverId && !m.is_deleted) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM meetings WHERE server_id = ? AND is_deleted = 0
      `, [serverId]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalMeeting;
    } catch (error) {
      console.error('LocalDB: Failed to get meeting by server ID:', error);
      throw error;
    }
  }

  /**
   * Update meeting
   */
  static async updateMeeting(id: string, updates: Partial<LocalMeeting> & { skipSyncQueue?: boolean }): Promise<void> {
    await this.initialize();
    
    try {
      const skipSyncQueue = updates.skipSyncQueue || false;
      const now = new Date().toISOString();
      const updateFields = [];
      const values = [];

      // Build dynamic update query
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at' && key !== 'skipSyncQueue') {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      const syncStatus = skipSyncQueue ? (updates.sync_status || 'synced') : 'pending';
      updateFields.push('updated_at = ?', 'version = version + 1', 'sync_status = ?');
      values.push(now, syncStatus, id);

      await this.db.runAsync(`
        UPDATE meetings SET ${updateFields.join(', ')} WHERE id = ?
      `, values);

      // Add to sync queue only if not skipping
      if (!skipSyncQueue) {
        const updatedMeeting = await this.getMeetingById(id);
        if (updatedMeeting) {
          // Only queue for sync if meeting has server_id (was previously synced)
          // Local-only meetings can't be updated on server
          if (updatedMeeting.server_id) {
            await this.addToSyncQueue('update', 'meetings', id, updatedMeeting);
          } else {
            console.log(`LocalDB: Skipping sync queue for update - meeting ${id} has no server_id (local-only)`);
            // Mark as synced since there's nothing to sync
            await this.db.runAsync(`UPDATE meetings SET sync_status = 'synced' WHERE id = ?`, [id]);
          }
          
          // Create activity log for meeting update (only for user changes, not server syncs)
          try {
            await this.createActivityLog({
              user_id: updatedMeeting.mr_id,
              mr_id: updatedMeeting.mr_id,
              activity_type: 'meeting_updated',
              description: `Updated meeting: ${updatedMeeting.title}`,
              metadata: JSON.stringify({
                meeting_id: id,
                doctor_id: updatedMeeting.doctor_id,
                scheduled_date: updatedMeeting.scheduled_date,
              }),
              is_deleted: false
            });
          } catch (error) {
            console.warn('LocalDB: Failed to create activity log for meeting update:', error);
          }
        }
      }

      console.log('LocalDB: Meeting updated:', id);
    } catch (error) {
      console.error('LocalDB: Failed to update meeting:', error);
      throw error;
    }
  }

  /**
   * Delete meeting (soft delete)
   */
  static async deleteMeeting(id: string): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      
      // Check if meeting has server_id before queuing for sync
      const meeting = await this.getMeetingById(id);
      const hasServerId = meeting?.server_id;
      
      await this.db.runAsync(`
        UPDATE meetings 
        SET is_deleted = 1, updated_at = ?, version = version + 1, sync_status = ? 
        WHERE id = ?
      `, [now, hasServerId ? 'pending' : 'synced', id]);

      // Add to sync queue only if meeting has server_id (was previously synced)
      // Local-only meetings can't be deleted on server
      if (hasServerId) {
        await this.addToSyncQueue('delete', 'meetings', id, { 
          id, 
          server_id: meeting.server_id,
          is_deleted: true 
        });
      } else {
        console.log(`LocalDB: Skipping sync queue for delete - meeting ${id} has no server_id (local-only)`);
      }
      
      console.log('LocalDB: Meeting deleted:', id);
    } catch (error) {
      console.error('LocalDB: Failed to delete meeting:', error);
      throw error;
    }
  }

  /**
   * Find matching local meeting without server_id (to avoid duplicates)
   */
  static async findMatchingLocalMeeting(mrId: string, server: any, excludeId?: string): Promise<LocalMeeting | null> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('meetings');
        const meetings: LocalMeeting[] = data ? JSON.parse(data) : [];
        return meetings.find(m => 
          m.mr_id === mrId &&
          !m.server_id &&
          m.doctor_id === server.doctor_id &&
          m.scheduled_date === server.scheduled_date &&
          m.title === server.title &&
          (!excludeId || m.id !== excludeId) &&
          !m.is_deleted
        ) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM meetings 
        WHERE mr_id = ? 
          AND server_id IS NULL 
          AND doctor_id = ? 
          AND scheduled_date = ? 
          AND title = ?
          AND is_deleted = 0
          ${excludeId ? 'AND id != ?' : ''}
        LIMIT 1
      `, excludeId ? [mrId, server.doctor_id, server.scheduled_date, server.title, excludeId] : [mrId, server.doctor_id, server.scheduled_date, server.title]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalMeeting;
    } catch (error) {
      console.error('LocalDB: Failed to find matching local meeting:', error);
      return null;
    }
  }

  /**
   * Upsert meeting (insert or update by id or server_id)
   */
  static async upsertMeeting(meeting: LocalMeeting): Promise<void> {
    await this.initialize();
    
    try {
      // Check if meeting exists by id
      const existingById = await this.getMeetingById(meeting.id);
      
      if (existingById) {
        // Update existing meeting
        // IMPORTANT: Preserve is_deleted flag if meeting was locally deleted
        // Only restore if server explicitly says it's not deleted AND local delete hasn't been synced
        const shouldPreserveDeleted = existingById.is_deleted && 
          existingById.sync_status === 'pending' && 
          !meeting.is_deleted;
        
        await this.updateMeeting(meeting.id, {
          ...meeting,
          // Preserve local deletion if it hasn't been synced yet
          is_deleted: shouldPreserveDeleted ? true : (meeting.is_deleted ?? existingById.is_deleted),
          skipSyncQueue: true // Server sync, don't queue
        });
        return;
      }

      // Check if meeting exists by server_id (including deleted ones)
      if (meeting.server_id) {
        // First check for non-deleted meeting
        const existingByServerId = await this.getMeetingByServerId(meeting.server_id);
        
        if (existingByServerId) {
          // Update existing meeting with server_id
          // IMPORTANT: Preserve is_deleted flag if meeting was locally deleted
          const shouldPreserveDeleted = existingByServerId.is_deleted && 
            existingByServerId.sync_status === 'pending' && 
            !meeting.is_deleted;
          
          await this.updateMeeting(existingByServerId.id, {
            ...meeting,
            // Preserve local deletion if it hasn't been synced yet
            is_deleted: shouldPreserveDeleted ? true : (meeting.is_deleted ?? existingByServerId.is_deleted),
            skipSyncQueue: true // Server sync, don't queue
          });
          return;
        }
        
        // Also check for deleted meeting with same server_id (to avoid duplicates)
        const deletedByServerId = await this.db.getFirstAsync(`
          SELECT * FROM meetings WHERE server_id = ? AND is_deleted = 1
        `, [meeting.server_id]);
        
        if (deletedByServerId) {
          // Meeting was deleted locally but server still has it
          // Only restore if local delete has been synced (sync_status = 'synced')
          // Otherwise preserve the deletion
          const shouldRestore = deletedByServerId.sync_status === 'synced' && !meeting.is_deleted;
          
          await this.updateMeeting(deletedByServerId.id, {
            ...meeting,
            is_deleted: shouldRestore ? false : true, // Restore only if delete was synced
            skipSyncQueue: true
          });
          return;
        }

        // Check for matching local meeting without server_id
        const matchingLocal = await this.findMatchingLocalMeeting(meeting.mr_id, meeting, undefined);
        
        if (matchingLocal) {
          console.log(`🔴 MEETING_SYNC: Found matching local meeting without server_id: ${matchingLocal.id}, linking to server_id: ${meeting.server_id}`);
          console.log(`🔴 MEETING_SYNC: Preventing duplicate by updating existing meeting instead of creating new one`);
          
          // Update the local meeting with server_id and server data
          // IMPORTANT: Preserve is_deleted flag if meeting was locally deleted
          const shouldPreserveDeleted = matchingLocal.is_deleted && 
            matchingLocal.sync_status === 'pending' && 
            !meeting.is_deleted;
          
          await this.updateMeeting(matchingLocal.id, {
            server_id: meeting.server_id,
            doctor_server_id: meeting.doctor_server_id || meeting.doctor_id,
            ...meeting,
            // Preserve local deletion if it hasn't been synced yet
            is_deleted: shouldPreserveDeleted ? true : (meeting.is_deleted ?? matchingLocal.is_deleted),
            skipSyncQueue: true // Server sync, don't queue
          });
          console.log(`🔴 MEETING_SYNC: Successfully linked local meeting to server_id, duplicate prevented`);
          return;
        }
      }

      // Create new meeting
      await this.db.runAsync(`
        INSERT INTO meetings (
          id, server_id, mr_id, doctor_id, doctor_server_id, brochure_id, title, scheduled_date,
          duration_minutes, status, location, purpose, notes, follow_up_required, follow_up_date,
          follow_up_time, follow_up_notes, presentation_slides, comments,
          created_at, updated_at, last_modified, version, sync_status, is_deleted, local_changes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        meeting.id,
        meeting.server_id || null,
        meeting.mr_id,
        meeting.doctor_id,
        meeting.doctor_server_id || null,
        meeting.brochure_id || null,
        meeting.title,
        meeting.scheduled_date,
        meeting.duration_minutes || 30,
        meeting.status || 'scheduled',
        meeting.location || null,
        meeting.purpose || null,
        meeting.notes || null,
        meeting.follow_up_required ? 1 : 0,
        meeting.follow_up_date || null,
        meeting.follow_up_time || null,
        meeting.follow_up_notes || null,
        meeting.presentation_slides ? JSON.stringify(meeting.presentation_slides) : null,
        meeting.comments ? JSON.stringify(meeting.comments) : null,
        meeting.created_at || new Date().toISOString(),
        meeting.updated_at || new Date().toISOString(),
        meeting.last_modified || meeting.updated_at || new Date().toISOString(),
        meeting.version || 1,
        meeting.sync_status || 'synced',
        meeting.is_deleted ? 1 : 0,
        meeting.local_changes || null
      ]);
    } catch (error) {
      console.error('LocalDB: Failed to upsert meeting:', error);
      throw error;
    }
  }

  static async mergeMeetings(mrId: string, serverMeetings: any[]): Promise<void> {
    await this.initialize();

    for (const server of serverMeetings) {
      const existing = await this.getMeetingByServerId(server.id);
      const now = new Date().toISOString();

      if (existing) {
        await this.db.runAsync(`
          UPDATE meetings
          SET doctor_id = ?, doctor_server_id = ?, brochure_id = ?, title = ?, scheduled_date = ?,
              duration_minutes = ?, status = ?, location = ?, purpose = ?, notes = ?, follow_up_required = ?,
              follow_up_date = ?, follow_up_time = ?, follow_up_notes = ?, presentation_slides = ?, comments = ?,
              updated_at = ?, last_modified = ?, sync_status = 'synced', local_changes = NULL
          WHERE id = ?
        `, [
          server.doctor_id || existing.doctor_id,
          server.doctor_id || existing.doctor_server_id,
          server.brochure_id || null,
          server.title,
          server.scheduled_date,
          server.duration_minutes || 30,
          server.status || 'scheduled',
          server.location || null,
          server.purpose || null,
          server.notes || null,
          server.follow_up_required ? 1 : 0,
          server.follow_up_date || null,
          server.follow_up_time || null,
          server.follow_up_notes || null,
          server.presentation_slides ? JSON.stringify(server.presentation_slides) : null,
          server.comments ? JSON.stringify(server.comments) : null,
          server.updated_at || now,
          server.updated_at || now,
          existing.id
        ]);
      } else {
        const id = generateUUID();
        await this.db.runAsync(`
          INSERT INTO meetings (
            id, server_id, mr_id, doctor_id, doctor_server_id, brochure_id, title, scheduled_date,
            duration_minutes, status, location, purpose, notes, follow_up_required, follow_up_date,
            follow_up_time, follow_up_notes, presentation_slides, comments,
            created_at, updated_at, last_modified, version, sync_status, is_deleted, local_changes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          server.id,
          mrId,
          server.doctor_id,
          server.doctor_id,
          server.brochure_id || null,
          server.title,
          server.scheduled_date,
          server.duration_minutes || 30,
          server.status || 'scheduled',
          server.location || null,
          server.purpose || null,
          server.notes || null,
          server.follow_up_required ? 1 : 0,
          server.follow_up_date || null,
          server.follow_up_time || null,
          server.follow_up_notes || null,
          server.presentation_slides ? JSON.stringify(server.presentation_slides) : null,
          server.comments ? JSON.stringify(server.comments) : null,
          server.created_at || now,
          server.updated_at || now,
          server.updated_at || now,
          1,
          'synced',
          0,
          null
        ]);
      }
    }
  }

  // ==================== MEETING NOTES CRUD ====================

  /**
   * Create a new meeting note locally
   */
  static async createMeetingNote(noteData: Omit<LocalMeetingNote, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'is_deleted'>): Promise<string> {
    await this.initialize();
    
    const id = generateUUID();
    const now = new Date().toISOString();
    
    const note: LocalMeetingNote = {
      id,
      ...noteData,
      created_at: now,
      updated_at: now,
      version: 1,
      sync_status: 'pending',
      is_deleted: false
    };

    try {
      // Debug: Log the note object and count values
      const valuesArray = [
        note.id, note.server_id || null, note.meeting_id, note.meeting_server_id || null,
        note.slide_id, note.slide_title, note.slide_order, note.brochure_id,
        note.note_text, note.slide_image_uri || null, note.created_at, note.updated_at, 
        note.last_modified || null, note.version, note.sync_status, 
        note.is_deleted ? 1 : 0, note.local_changes || null
      ];
      console.log('LocalDB: Creating meeting note with', valuesArray.length, 'values');
      console.log('LocalDB: Note data:', {
        id: note.id,
        meeting_id: note.meeting_id,
        slide_id: note.slide_id,
        brochure_id: note.brochure_id
      });
      
      await this.db.runAsync(`
        INSERT INTO meeting_notes (
          id, server_id, meeting_id, meeting_server_id, slide_id, slide_title, 
          slide_order, brochure_id, note_text, slide_image_uri, created_at, updated_at, 
          last_modified, version, sync_status, is_deleted, local_changes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, valuesArray);

      // Add to sync queue
      await this.addToSyncQueue('create', 'meeting_notes', id, note);
      
      console.log('LocalDB: Meeting note created locally:', id);
      return id;
    } catch (error) {
      console.error('LocalDB: Failed to create meeting note:', error);
      throw error;
    }
  }

  /**
   * Get meeting notes by meeting ID
   */
  static async getMeetingNotes(meetingId: string): Promise<LocalMeetingNote[]> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('meeting_notes');
        const notes: LocalMeetingNote[] = data ? JSON.parse(data) : [];
        return notes
          .filter(n => n.meeting_id === meetingId && !n.is_deleted)
          .sort((a, b) => a.slide_order - b.slide_order);
      }

      const result = await this.db.getAllAsync(`
        SELECT * FROM meeting_notes 
        WHERE meeting_id = ? AND is_deleted = 0 
        ORDER BY slide_order, created_at
      `, [meetingId]);

      return result.map((row: any) => ({
        ...row,
        is_deleted: Boolean(row.is_deleted)
      })) as LocalMeetingNote[];
    } catch (error) {
      console.error('LocalDB: Failed to get meeting notes:', error);
      throw error;
    }
  }

  /**
   * Get meeting note by ID
   */
  static async getMeetingNoteById(id: string): Promise<LocalMeetingNote | null> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('meeting_notes');
        const notes: LocalMeetingNote[] = data ? JSON.parse(data) : [];
        return notes.find(n => n.id === id && !n.is_deleted) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM meeting_notes WHERE id = ? AND is_deleted = 0
      `, [id]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalMeetingNote;
    } catch (error) {
      console.error('LocalDB: Failed to get meeting note by ID:', error);
      throw error;
    }
  }

  /**
   * Update meeting note
   */
  static async updateMeetingNote(id: string, updates: Partial<LocalMeetingNote>): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      const updateFields = [];
      const values = [];

      // Build dynamic update query
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at') {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      updateFields.push('updated_at = ?', 'version = version + 1', 'sync_status = ?');
      values.push(now, 'pending', id);

      await this.db.runAsync(`
        UPDATE meeting_notes SET ${updateFields.join(', ')} WHERE id = ?
      `, values);

      // Add to sync queue only if note has server_id (was previously synced)
      const updatedNote = await this.getMeetingNoteById(id);
      if (updatedNote) {
        if (updatedNote.server_id) {
          await this.addToSyncQueue('update', 'meeting_notes', id, updatedNote);
        } else {
          console.log(`LocalDB: Skipping sync queue for note update - note ${id} has no server_id (local-only)`);
          // Mark as synced since there's nothing to sync
          await this.db.runAsync(`UPDATE meeting_notes SET sync_status = 'synced' WHERE id = ?`, [id]);
        }
      }

      console.log('LocalDB: Meeting note updated:', id);
    } catch (error) {
      console.error('LocalDB: Failed to update meeting note:', error);
      throw error;
    }
  }

  /**
   * Delete meeting note (soft delete)
   */
  static async deleteMeetingNote(id: string): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      
      // Fetch the note before deleting to check if it has server_id
      const note = await this.getMeetingNoteById(id);
      const hasServerId = note?.server_id;
      
      await this.db.runAsync(`
        UPDATE meeting_notes 
        SET is_deleted = 1, updated_at = ?, version = version + 1, sync_status = ? 
        WHERE id = ?
      `, [now, hasServerId ? 'pending' : 'synced', id]);

      // Add to sync queue only if note has server_id (was previously synced)
      // Local-only notes can't be deleted on server
      if (hasServerId && note) {
        await this.addToSyncQueue('delete', 'meeting_notes', id, {
          id: note.id,
          server_id: note.server_id,
          meeting_id: note.meeting_id,
          meeting_server_id: note.meeting_server_id,
          slide_id: note.slide_id,
          is_deleted: true
        });
      } else {
        console.log(`LocalDB: Skipping sync queue for note delete - note ${id} has no server_id (local-only)`);
      }
      
      console.log('LocalDB: Meeting note deleted:', id);
    } catch (error) {
      console.error('LocalDB: Failed to delete meeting note:', error);
      throw error;
    }
  }

  // ==================== DOCTOR ASSIGNMENTS CRUD ====================

  /**
   * Create a new doctor assignment locally
   */
  static async createDoctorAssignment(assignmentData: Omit<LocalDoctorAssignment, 'id' | 'created_at' | 'updated_at' | 'version' | 'sync_status' | 'is_deleted'>): Promise<string> {
    await this.initialize();
    
    const id = generateUUID();
    const now = new Date().toISOString();
    
    const assignment: LocalDoctorAssignment = {
      id,
      ...assignmentData,
      created_at: now,
      updated_at: now,
      version: 1,
      sync_status: 'pending',
      is_deleted: false
    };

    try {
      await this.db.runAsync(`
        INSERT INTO doctor_assignments (
          id, server_id, doctor_id, doctor_server_id, mr_id, status, assigned_by, assigned_at, transferred_at, notes,
          created_at, updated_at, version, sync_status, is_deleted, local_changes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        assignment.id, assignment.server_id || null, assignment.doctor_id, assignment.doctor_server_id || null,
        assignment.mr_id, assignment.status, assignment.assigned_by || null, assignment.assigned_at || null,
        assignment.transferred_at || null, assignment.notes || null, assignment.created_at, assignment.updated_at,
        assignment.version, assignment.sync_status, assignment.is_deleted ? 1 : 0, JSON.stringify({ type: 'create', payload: assignmentData })
      ]);

      // Add to sync queue
      await this.addToSyncQueue('create', 'doctor_assignments', id, assignment);
      
      console.log('LocalDB: Doctor assignment created locally:', id);
      return id;
    } catch (error) {
      console.error('LocalDB: Failed to create doctor assignment:', error);
      throw error;
    }
  }

  /**
   * Get all doctor assignments for an MR
   */
  static async getDoctorAssignments(mrId: string): Promise<LocalDoctorAssignment[]> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('doctor_assignments');
        const assignments: LocalDoctorAssignment[] = data ? JSON.parse(data) : [];
        return assignments.filter(a => a.mr_id === mrId && !a.is_deleted);
      }

      const result = await this.db.getAllAsync(`
        SELECT * FROM doctor_assignments 
        WHERE mr_id = ? AND is_deleted = 0 
        ORDER BY assigned_at DESC
      `, [mrId]);

      return result.map((row: any) => ({
        ...row,
        is_deleted: Boolean(row.is_deleted)
      })) as LocalDoctorAssignment[];
    } catch (error) {
      console.error('LocalDB: Failed to get doctor assignments:', error);
      throw error;
    }
  }

  /**
   * Get doctor assignment by ID
   */
  static async getDoctorAssignmentById(id: string): Promise<LocalDoctorAssignment | null> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('doctor_assignments');
        const assignments: LocalDoctorAssignment[] = data ? JSON.parse(data) : [];
        return assignments.find(a => a.id === id && !a.is_deleted) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM doctor_assignments WHERE id = ? AND is_deleted = 0
      `, [id]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalDoctorAssignment;
    } catch (error) {
      console.error('LocalDB: Failed to get doctor assignment by ID:', error);
      throw error;
    }
  }

  /**
   * Update doctor assignment
   */
  static async updateDoctorAssignment(id: string, updates: Partial<LocalDoctorAssignment>): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      const updateFields = [];
      const values = [];

      // Build dynamic update query
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at') {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      updateFields.push('updated_at = ?', 'version = version + 1', 'sync_status = ?');
      values.push(now, 'pending', id);

      await this.db.runAsync(`
        UPDATE doctor_assignments SET ${updateFields.join(', ')} WHERE id = ?
      `, values);

      // Add to sync queue
      const updatedAssignment = await this.getDoctorAssignmentById(id);
      if (updatedAssignment) {
        await this.addToSyncQueue('update', 'doctor_assignments', id, updatedAssignment);
      }

      console.log('LocalDB: Doctor assignment updated:', id);
    } catch (error) {
      console.error('LocalDB: Failed to update doctor assignment:', error);
      throw error;
    }
  }

  /**
   * Delete doctor assignment (soft delete)
   */
  static async deleteDoctorAssignment(id: string): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      
      await this.db.runAsync(`
        UPDATE doctor_assignments 
        SET is_deleted = 1, updated_at = ?, version = version + 1, sync_status = ? 
        WHERE id = ?
      `, [now, 'pending', id]);

      // Add to sync queue
      await this.addToSyncQueue('delete', 'doctor_assignments', id, { id, is_deleted: true });
      
      console.log('LocalDB: Doctor assignment deleted:', id);
    } catch (error) {
      console.error('LocalDB: Failed to delete doctor assignment:', error);
      throw error;
    }
  }

  // ==================== BROCHURE SYNC CRUD ====================

  /**
   * Create a new brochure sync locally
   */
  static async createBrochureSync(syncData: Omit<LocalBrochureSync, 'id' | 'created_at' | 'version' | 'sync_status' | 'local_changes'>): Promise<string> {
    await this.initialize();
    
    const id = generateUUID();
    const now = new Date().toISOString();
    
    const sync: LocalBrochureSync = {
      id,
      ...syncData,
      created_at: now,
      version: 1,
      sync_status: 'pending',
      local_changes: JSON.stringify({}) // Initialize local_changes
    };

    try {
      await this.db.runAsync(`
        INSERT INTO brochure_sync (
          id, server_id, mr_id, brochure_id, brochure_title, brochure_data, last_modified, created_at, version, sync_status, local_changes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        sync.id, sync.server_id || null, sync.mr_id, sync.brochure_id, sync.brochure_title || null, sync.brochure_data,
        sync.last_modified || null, sync.created_at, sync.version, sync.sync_status, sync.local_changes || null
      ]);

      // Add to sync queue
      await this.addToSyncQueue('create', 'brochure_sync', id, sync);
      
      console.log('LocalDB: Brochure sync created locally:', id);
      return id;
    } catch (error) {
      console.error('LocalDB: Failed to create brochure sync:', error);
      throw error;
    }
  }

  /**
   * Get all brochure syncs for an MR
   */
  static async getBrochureSyncs(mrId: string): Promise<LocalBrochureSync[]> {
    await this.initialize();
    
    try {
      const result = await this.db.getAllAsync(`
        SELECT * FROM brochure_sync 
        WHERE mr_id = ? AND is_deleted = 0 
        ORDER BY created_at DESC
      `, [mrId]);

      return result.map((row: any) => ({
        ...row,
        is_deleted: Boolean(row.is_deleted)
      })) as LocalBrochureSync[];
    } catch (error) {
      console.error('LocalDB: Failed to get brochure syncs:', error);
      throw error;
    }
  }

  /**
   * Get brochure sync by ID
   */
  static async getBrochureSyncById(id: string): Promise<LocalBrochureSync | null> {
    await this.initialize();
    
    try {
      const result = await this.db.getFirstAsync(`
        SELECT * FROM brochure_sync WHERE id = ? AND is_deleted = 0
      `, [id]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalBrochureSync;
    } catch (error) {
      console.error('LocalDB: Failed to get brochure sync by ID:', error);
      throw error;
    }
  }

  /**
   * Update brochure sync
   */
  static async updateBrochureSync(id: string, updates: Partial<LocalBrochureSync>): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      const updateFields = [];
      const values = [];

      // Build dynamic update query
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at') {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      updateFields.push('updated_at = ?', 'version = version + 1', 'sync_status = ?');
      values.push(now, 'pending', id);

      await this.db.runAsync(`
        UPDATE brochure_sync SET ${updateFields.join(', ')} WHERE id = ?
      `, values);

      // Add to sync queue
      const updatedSync = await this.getBrochureSyncById(id);
      if (updatedSync) {
        await this.addToSyncQueue('update', 'brochure_sync', id, updatedSync);
      }

      console.log('LocalDB: Brochure sync updated:', id);
    } catch (error) {
      console.error('LocalDB: Failed to update brochure sync:', error);
      throw error;
    }
  }

  /**
   * Delete brochure sync (soft delete)
   */
  static async deleteBrochureSync(id: string): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      
      await this.db.runAsync(`
        UPDATE brochure_sync 
        SET is_deleted = 1, updated_at = ?, version = version + 1, sync_status = ? 
        WHERE id = ?
      `, [now, 'pending', id]);

      // Add to sync queue
      await this.addToSyncQueue('delete', 'brochure_sync', id, { id, is_deleted: true });
      
      console.log('LocalDB: Brochure sync deleted:', id);
    } catch (error) {
      console.error('LocalDB: Failed to delete brochure sync:', error);
      throw error;
    }
  }

  // ==================== SAVED BROCHURES CRUD ====================

  /**
   * Create a new saved brochure locally
   */
  static async createSavedBrochure(savedBrochureData: Omit<LocalSavedBrochure, 'id' | 'created_at' | 'version' | 'sync_status' | 'local_changes'>): Promise<string> {
    await this.initialize();
    
    const id = generateUUID();
    const now = new Date().toISOString();
    
    const savedBrochure: LocalSavedBrochure = {
      id,
      ...savedBrochureData,
      created_at: now,
      version: 1,
      sync_status: 'pending',
      local_changes: JSON.stringify({}), // Initialize local_changes
      is_deleted: savedBrochureData.is_deleted || false
    };

    try {
      await this.db.runAsync(`
        INSERT INTO saved_brochures (
          id, server_id, mr_id, brochure_id, brochure_title, custom_title, original_brochure_data, saved_at, last_accessed, version, sync_status, local_changes, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        savedBrochure.id, savedBrochure.server_id || null, savedBrochure.mr_id, savedBrochure.brochure_id, savedBrochure.brochure_title,
        savedBrochure.custom_title || null, savedBrochure.original_brochure_data, savedBrochure.saved_at || null,
        savedBrochure.last_accessed || null, savedBrochure.version, savedBrochure.sync_status, savedBrochure.local_changes || null,
        savedBrochure.is_deleted ? 1 : 0
      ]);

      // Add to sync queue
      await this.addToSyncQueue('create', 'saved_brochures', id, savedBrochure);
      
      // Create activity log for brochure saving
      try {
        await this.createActivityLog({
          user_id: savedBrochure.mr_id,
          mr_id: savedBrochure.mr_id,
          activity_type: 'brochure_saved',
          description: `Saved brochure: ${savedBrochure.brochure_title}`,
          metadata: JSON.stringify({
            brochure_id: savedBrochure.brochure_id,
            saved_brochure_id: id,
          }),
          is_deleted: false
        });
      } catch (error) {
        console.warn('LocalDB: Failed to create activity log for saved brochure:', error);
      }
      
      console.log('LocalDB: Saved brochure created locally:', id);
      return id;
    } catch (error) {
      console.error('LocalDB: Failed to create saved brochure:', error);
      throw error;
    }
  }

  /**
   * Get all saved brochures for an MR
   */
  static async getSavedBrochures(mrId: string): Promise<LocalSavedBrochure[]> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('saved_brochures');
        const brochures: LocalSavedBrochure[] = data ? JSON.parse(data) : [];
        return brochures.filter(b => b.mr_id === mrId);
      }

      const result = await this.db.getAllAsync(`
        SELECT * FROM saved_brochures 
        WHERE mr_id = ? AND is_deleted = 0 
        ORDER BY saved_at DESC
      `, [mrId]);

      return result.map((row: any) => ({
        ...row,
        is_deleted: Boolean(row.is_deleted)
      })) as LocalSavedBrochure[];
    } catch (error) {
      console.error('LocalDB: Failed to get saved brochures:', error);
      throw error;
    }
  }

  /**
   * Get saved brochure by ID
   */
  static async getSavedBrochureById(id: string): Promise<LocalSavedBrochure | null> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('saved_brochures');
        const brochures: LocalSavedBrochure[] = data ? JSON.parse(data) : [];
        return brochures.find(b => b.id === id) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM saved_brochures WHERE id = ? AND is_deleted = 0
      `, [id]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalSavedBrochure;
    } catch (error) {
      console.error('LocalDB: Failed to get saved brochure by ID:', error);
      throw error;
    }
  }

  /**
   * Update saved brochure
   */
  static async updateSavedBrochure(id: string, updates: Partial<LocalSavedBrochure>): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      const updateFields = [];
      const values = [];

      // Build dynamic update query
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at') {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      updateFields.push('updated_at = ?', 'version = version + 1', 'sync_status = ?');
      values.push(now, 'pending', id);

      await this.db.runAsync(`
        UPDATE saved_brochures SET ${updateFields.join(', ')} WHERE id = ?
      `, values);

      // Add to sync queue
      const updatedSavedBrochure = await this.getSavedBrochureById(id);
      if (updatedSavedBrochure) {
        await this.addToSyncQueue('update', 'saved_brochures', id, updatedSavedBrochure);
      }

      console.log('LocalDB: Saved brochure updated:', id);
    } catch (error) {
      console.error('LocalDB: Failed to update saved brochure:', error);
      throw error;
    }
  }

  /**
   * Delete saved brochure (soft delete)
   */
  static async deleteSavedBrochure(id: string): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      
      await this.db.runAsync(`
        UPDATE saved_brochures 
        SET is_deleted = 1, updated_at = ?, version = version + 1, sync_status = ? 
        WHERE id = ?
      `, [now, 'pending', id]);

      // Add to sync queue
      await this.addToSyncQueue('delete', 'saved_brochures', id, { id, is_deleted: true });
      
      console.log('LocalDB: Saved brochure deleted:', id);
    } catch (error) {
      console.error('LocalDB: Failed to delete saved brochure:', error);
      throw error;
    }
  }

  // ==================== ACTIVITY LOGS CRUD ====================

  /**
   * Create a new activity log locally
   */
  static async createActivityLog(logData: Omit<LocalActivityLog, 'id' | 'created_at' | 'version' | 'sync_status' | 'local_changes'>): Promise<string> {
    await this.initialize();
    
    const id = generateUUID();
    const now = new Date().toISOString();
    
    const log: LocalActivityLog = {
      id,
      ...logData,
      created_at: now,
      version: 1,
      sync_status: 'pending',
      local_changes: JSON.stringify({}) // Initialize local_changes
    };

    try {
      await this.db.runAsync(`
        INSERT INTO activity_logs (
          id, server_id, user_id, mr_id, action, details, metadata, created_at, timestamp, version, sync_status, is_deleted, local_changes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        log.id, log.server_id || null, log.user_id, log.mr_id, log.activity_type, log.description, log.metadata || undefined,
        log.created_at, log.created_at, log.version, log.sync_status, log.is_deleted !== undefined ? (log.is_deleted ? 1 : 0) : 0, log.local_changes || undefined
      ]);

      // Add to sync queue
      await this.addToSyncQueue('create', 'activity_logs', id, log);
      
      // Emit activity change event
      appEvents.emit('activity-changed', { type: 'created', activityId: id });
      
      console.log('LocalDB: Activity log created locally:', id);
      return id;
    } catch (error) {
      console.error('LocalDB: Failed to create activity log:', error);
      throw error;
    }
  }

  /**
   * Get all activity logs for a user
   */
  static async getActivityLogs(mrId: string): Promise<LocalActivityLog[]> {
    await this.initialize();
    
    try {
      const result = await this.db.getAllAsync(`
        SELECT * FROM activity_logs 
        WHERE mr_id = ? AND is_deleted = 0 
        ORDER BY created_at DESC
      `, [mrId]);

      return result.map((row: any) => ({
        ...row,
        is_deleted: Boolean(row.is_deleted)
      })) as LocalActivityLog[];
    } catch (error) {
      console.error('LocalDB: Failed to get activity logs:', error);
      throw error;
    }
  }

  /**
   * Get activity log by ID
   */
  static async getActivityLogById(id: string): Promise<LocalActivityLog | null> {
    await this.initialize();
    
    try {
      const result = await this.db.getFirstAsync(`
        SELECT * FROM activity_logs WHERE id = ? AND is_deleted = 0
      `, [id]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalActivityLog;
    } catch (error) {
      console.error('LocalDB: Failed to get activity log by ID:', error);
      throw error;
    }
  }

  /**
   * Update activity log
   */
  static async updateActivityLog(id: string, updates: Partial<LocalActivityLog>): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      const updateFields = [];
      const values = [];

      // Build dynamic update query
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at') {
          updateFields.push(`${key} = ?`);
          values.push(value);
        }
      });

      updateFields.push('updated_at = ?', 'version = version + 1', 'sync_status = ?');
      values.push(now, 'pending', id);

      await this.db.runAsync(`
        UPDATE activity_logs SET ${updateFields.join(', ')} WHERE id = ?
      `, values);

      // Add to sync queue
      const updatedLog = await this.getActivityLogById(id);
      if (updatedLog) {
        await this.addToSyncQueue('update', 'activity_logs', id, updatedLog);
      }

      console.log('LocalDB: Activity log updated:', id);
    } catch (error) {
      console.error('LocalDB: Failed to update activity log:', error);
      throw error;
    }
  }

  /**
   * Delete activity log (soft delete)
   */
  static async deleteActivityLog(id: string): Promise<void> {
    await this.initialize();
    
    try {
      const now = new Date().toISOString();
      
      await this.db.runAsync(`
        UPDATE activity_logs 
        SET is_deleted = 1, updated_at = ?, version = version + 1, sync_status = ? 
        WHERE id = ?
      `, [now, 'pending', id]);

      // Add to sync queue
      await this.addToSyncQueue('delete', 'activity_logs', id, { id, is_deleted: true });
      
      console.log('LocalDB: Activity log deleted:', id);
    } catch (error) {
      console.error('LocalDB: Failed to delete activity log:', error);
      throw error;
    }
  }

  // ==================== SYNC OPERATIONS ====================

  /**
   * Add operation to sync queue
   */
  static async addToSyncQueue(operation: 'create' | 'update' | 'delete', tableName: string, recordId: string, data: any): Promise<void> {
    await this.initialize();
    
    const queueId = generateUUID();
    const now = new Date().toISOString();

      console.log('🔄 SYNC QUEUE DEBUG: Adding to sync queue - Operation:', operation, 'Table:', tableName, 'RecordID:', recordId);
      console.log('🔄 SYNC QUEUE DEBUG: Queue ID:', queueId, 'Timestamp:', now);
      if (tableName === 'doctors') {
        console.log('🔄 SYNC QUEUE DEBUG: Doctor data:', { id: recordId, name: `${data.first_name || ''} ${data.last_name || ''}`.trim(), server_id: data.server_id });
      } else if (tableName === 'meetings') {
        console.log('🔄 SYNC QUEUE DEBUG: Meeting data:', { id: recordId, title: data.title, doctor_id: data.doctor_id, server_id: data.server_id });
      } else if (tableName === 'meeting_notes') {
        console.log('🔄 SYNC QUEUE DEBUG: Meeting note data:', { id: recordId, meeting_id: data.meeting_id, slide_id: data.slide_id });
      }

    try {
      if (this.isUsingAsyncStorage()) {
        // Use AsyncStorage fallback
        const syncData = await AsyncStorage.getItem('sync_operations');
        const syncOps = syncData ? JSON.parse(syncData) : [];
        syncOps.push({
          id: queueId,
          operation_type: operation,
          table_name: tableName,
          record_id: recordId,
          data: data,
          timestamp: now,
          status: 'pending',
          retry_count: 0
        });
        await AsyncStorage.setItem('sync_operations', JSON.stringify(syncOps));
        console.log('✅ SYNC QUEUE DEBUG: Successfully added to AsyncStorage sync queue - Queue ID:', queueId, 'Total items:', syncOps.length);
      } else {
        // Use SQLite
      await this.db.runAsync(`
        INSERT INTO sync_operations (id, operation_type, table_name, record_id, data, timestamp, status, retry_count)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', 0)
      `, [queueId, operation, tableName, recordId, JSON.stringify(data), now]);
      
      // Get current queue size for logging
      const queueSizeResult = await this.db.getAllAsync('SELECT COUNT(*) as count FROM sync_operations WHERE status = ?', ['pending']);
      const queueSize = queueSizeResult?.[0]?.count || 0;
      console.log('✅ SYNC QUEUE DEBUG: Successfully added to SQLite sync queue - Queue ID:', queueId, 'Current pending queue size:', queueSize);
      }

      console.log('LocalDB: Added to sync queue:', operation, tableName, recordId);
    } catch (error) {
      console.error('LocalDB: Failed to add to sync queue:', error);
      throw error;
    }
  }

  /**
   * Get pending sync operations
   */
  static async getPendingSyncOperations(): Promise<SyncOperation[]> {
    await this.initialize();
    
    try {
      const result = await this.db.getAllAsync(`
        SELECT * FROM sync_operations 
        WHERE status = 'pending' 
        ORDER BY timestamp ASC
      `);

      return result as SyncOperation[];
    } catch (error) {
      console.error('LocalDB: Failed to get pending sync operations:', error);
      throw error;
    }
  }

  /**
   * Mark sync operation as completed
   */
  static async markOperationCompleted(operationId: string): Promise<void> {
    await this.initialize();
    
    try {
      await this.db.runAsync(`
        UPDATE sync_operations SET status = 'completed' WHERE id = ?
      `, [operationId]);

      console.log('LocalDB: Sync operation completed:', operationId);
    } catch (error) {
      console.error('LocalDB: Failed to mark operation completed:', error);
      throw error;
    }
  }

  /**
   * Mark sync operation as failed
   */
  static async markOperationFailed(operationId: string, errorMessage: string): Promise<void> {
    await this.initialize();
    
    try {
      await this.db.runAsync(`
        UPDATE sync_operations 
        SET status = 'failed', error_message = ?, retry_count = retry_count + 1 
        WHERE id = ?
      `, [errorMessage, operationId]);

      console.log('LocalDB: Sync operation failed:', operationId, errorMessage);
    } catch (error) {
      console.error('LocalDB: Failed to mark operation failed:', error);
      throw error;
    }
  }

  /**
   * Reset sync operation status back to pending for retry
   */
  static async resetOperationStatus(operationId: string): Promise<void> {
    await this.initialize();
    try {
      await this.db.runAsync(`
        UPDATE sync_operations
        SET status = 'pending'
        WHERE id = ?
      `, [operationId]);
      console.log('LocalDB: Reset sync operation status to pending:', operationId);
    } catch (error) {
      console.error('LocalDB: Failed to reset operation status:', error);
      throw error;
    }
  }

  /**
   * Get sync statistics
   */
  static async getSyncStats(): Promise<{ pending: number; failed: number; completed: number }> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('sync_operations');
        const ops: SyncOperation[] = data ? JSON.parse(data) : [];
        const stats = { pending: 0, failed: 0, completed: 0 };
        ops.forEach(op => {
          if (op.status === 'pending') stats.pending++;
          else if (op.status === 'failed') stats.failed++;
          else if (op.status === 'completed') stats.completed++;
        });
        return stats;
      }

      const result = await this.db.getAllAsync(`
        SELECT 
          status,
          COUNT(*) as count
        FROM sync_operations 
        GROUP BY status
      `);

      const stats = { pending: 0, failed: 0, completed: 0 };
      result.forEach((row: any) => {
        stats[row.status as keyof typeof stats] = row.count;
      });

      return stats;
    } catch (error) {
      console.error('LocalDB: Failed to get sync stats:', error);
      return { pending: 0, failed: 0, completed: 0 };
    }
  }

  /**
   * Clear completed sync operations (cleanup)
   */
  static async clearCompletedOperations(): Promise<void> {
    await this.initialize();
    
    try {
      await this.db.runAsync(`
        DELETE FROM sync_operations 
        WHERE status = 'completed' AND timestamp < datetime('now', '-7 days')
      `);

      console.log('LocalDB: Cleared old completed sync operations');
    } catch (error) {
      console.error('LocalDB: Failed to clear completed operations:', error);
    }
  }

  /**
   * Clean up stale sync queue entries for records that came from server
   * These shouldn't be in the queue since they weren't created/updated by the user
   */
  static async cleanupStaleSyncQueueEntries(mrId: string): Promise<void> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const syncData = await AsyncStorage.getItem('sync_operations');
        if (!syncData) return;
        
        const syncOps: any[] = JSON.parse(syncData);
        const doctorsData = await AsyncStorage.getItem('doctors');
        const doctors: LocalDoctor[] = doctorsData ? JSON.parse(doctorsData) : [];
        
        // Create a map of doctor IDs to their sync_status and server_id
        const doctorMap = new Map<string, { sync_status: string; server_id?: string }>();
        doctors.forEach((doctor: LocalDoctor) => {
          if (doctor.mr_id === mrId) {
            doctorMap.set(doctor.id, {
              sync_status: doctor.sync_status,
              server_id: doctor.server_id
            });
          }
        });
        
        // Filter out stale entries
        const validOps = syncOps.filter((op: any) => {
          if (op.table_name === 'doctors' && op.status === 'pending') {
            const doctor = doctorMap.get(op.record_id);
            // Remove if doctor has server_id (came from server) OR is already synced
            if (doctor && (doctor.server_id || doctor.sync_status === 'synced')) {
              console.log('LocalDB: Removing stale sync queue entry for doctor:', op.record_id);
              return false;
            }
          }
          return true;
        });
        
        if (validOps.length !== syncOps.length) {
          await AsyncStorage.setItem('sync_operations', JSON.stringify(validOps));
          console.log(`LocalDB: Cleaned up ${syncOps.length - validOps.length} stale sync queue entries`);
        }
      } else {
        // Use SQLite - remove pending sync operations for doctors that have server_id or are synced
        const result = await this.db.runAsync(`
          DELETE FROM sync_operations
          WHERE table_name = 'doctors'
          AND status = 'pending'
          AND record_id IN (
            SELECT id FROM doctors 
            WHERE mr_id = ? 
            AND (server_id IS NOT NULL AND server_id <> '' OR sync_status = 'synced')
          )
        `, [mrId]);
        
        if (result.changes > 0) {
          console.log(`LocalDB: Cleaned up ${result.changes} stale sync queue entries for doctors`);
        }
      }
    } catch (error) {
      console.error('LocalDB: Failed to cleanup stale sync queue entries:', error);
    }
  }

  // ==================== BROCHURE CATEGORIES CRUD ====================

  static async upsertBrochureCategory(category: LocalBrochureCategory): Promise<void> {
    await this.initialize();
    if (this.isUsingAsyncStorage()) {
      const categoriesData = await AsyncStorage.getItem('brochure_categories');
      const categories: LocalBrochureCategory[] = categoriesData ? JSON.parse(categoriesData) : [];
      const existingIndex = categories.findIndex(c => c.id === category.id);
      
      if (existingIndex >= 0) {
        categories[existingIndex] = category;
      } else {
        categories.push(category);
      }
      
      await AsyncStorage.setItem('brochure_categories', JSON.stringify(categories));
      return;
    }
    
    await this.db.runAsync(`
      INSERT INTO brochure_categories (id, name, description, color, is_active, created_at, sync_status, local_changes, last_synced_at, needs_sync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        color = excluded.color,
        is_active = excluded.is_active,
        sync_status = excluded.sync_status,
        local_changes = excluded.local_changes,
        last_synced_at = excluded.last_synced_at,
        needs_sync = excluded.needs_sync
    `, [
      category.id, category.name, category.description, category.color, 
      category.is_active ? 1 : 0, category.created_at, category.sync_status, 
      category.local_changes, category.last_synced_at, category.needs_sync ? 1 : 0
    ]);
  }

  // ==================== BROCHURES CRUD ====================

  /**
   * Get all brochures (from brochures table - all available brochures, not assigned to specific MR)
   * Note: For MR-specific brochures, use getBrochureSyncs or check brochure_sync table
   */
  static async getBrochures(mrId?: string): Promise<LocalBrochure[]> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('brochures');
        const brochures: LocalBrochure[] = data ? JSON.parse(data) : [];
        // If mrId provided, filter by brochure_sync table (assigned brochures)
        if (mrId) {
          const syncData = await AsyncStorage.getItem('brochure_sync');
          const syncs: LocalBrochureSync[] = syncData ? JSON.parse(syncData) : [];
          const assignedBrochureIds = new Set(
            syncs
              .filter(s => s.mr_id === mrId && !s.is_deleted)
              .map(s => s.brochure_id)
          );
          return brochures.filter(b => assignedBrochureIds.has(b.id) || b.is_public);
        }
        // Return all active brochures if no mrId
        return brochures.filter(b => b.status === 'active');
      }

      // SQLite path
      if (mrId) {
        // Get assigned brochures via brochure_sync join
        const result = await this.db.getAllAsync(`
          SELECT DISTINCT b.* FROM brochures b
          INNER JOIN brochure_sync bs ON b.id = bs.brochure_id
          WHERE bs.mr_id = ? AND bs.is_deleted = 0 AND b.status = 'active'
          UNION
          SELECT * FROM brochures WHERE is_public = 1 AND status = 'active'
        `, [mrId]);
        
        return result.map((row: any) => ({
          ...row,
          is_public: Boolean(row.is_public),
          needs_sync: Boolean(row.needs_sync)
        })) as LocalBrochure[];
      } else {
        // Get all active brochures
        const result = await this.db.getAllAsync(`
          SELECT * FROM brochures WHERE status = 'active'
        `, []);
        
        return result.map((row: any) => ({
          ...row,
          is_public: Boolean(row.is_public),
          needs_sync: Boolean(row.needs_sync)
        })) as LocalBrochure[];
      }
    } catch (error) {
      console.error('LocalDB: Failed to get brochures:', error);
      return [];
    }
  }

  static async upsertBrochure(brochure: LocalBrochure): Promise<void> {
    await this.initialize();
    if (this.isUsingAsyncStorage()) {
      const brochuresData = await AsyncStorage.getItem('brochures');
      const brochures: LocalBrochure[] = brochuresData ? JSON.parse(brochuresData) : [];
      const existingIndex = brochures.findIndex(b => b.id === brochure.id);
      
      if (existingIndex >= 0) {
        brochures[existingIndex] = brochure;
      } else {
        brochures.push(brochure);
      }
      
      await AsyncStorage.setItem('brochures', JSON.stringify(brochures));
      return;
    }
    
    await this.db.runAsync(`
      INSERT INTO brochures (id, title, category, description, file_url, thumbnail_url, pages, file_size, status, assigned_by, download_count, view_count, created_at, updated_at, file_name, file_type, uploaded_by, is_public, tags, version, category_id, sync_status, local_changes, last_synced_at, needs_sync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        description = excluded.description,
        file_url = excluded.file_url,
        thumbnail_url = excluded.thumbnail_url,
        pages = excluded.pages,
        file_size = excluded.file_size,
        status = excluded.status,
        assigned_by = excluded.assigned_by,
        download_count = excluded.download_count,
        view_count = excluded.view_count,
        updated_at = excluded.updated_at,
        file_name = excluded.file_name,
        file_type = excluded.file_type,
        uploaded_by = excluded.uploaded_by,
        is_public = excluded.is_public,
        tags = excluded.tags,
        version = excluded.version,
        category_id = excluded.category_id,
        sync_status = excluded.sync_status,
        local_changes = excluded.local_changes,
        last_synced_at = excluded.last_synced_at,
        needs_sync = excluded.needs_sync
    `, [
      brochure.id, brochure.title, brochure.category, brochure.description, brochure.file_url,
      brochure.thumbnail_url, brochure.pages, brochure.file_size, brochure.status, brochure.assigned_by,
      brochure.download_count, brochure.view_count, brochure.created_at, brochure.updated_at,
      brochure.file_name, brochure.file_type, brochure.uploaded_by, brochure.is_public ? 1 : 0,
      brochure.tags, brochure.version, brochure.category_id, brochure.sync_status,
      brochure.local_changes, brochure.last_synced_at, brochure.needs_sync ? 1 : 0
    ]);
  }

  // ==================== DOCTOR ASSIGNMENTS CRUD ====================

  static async upsertDoctorAssignment(assignment: LocalDoctorAssignment): Promise<void> {
    await this.initialize();
    if (this.isUsingAsyncStorage()) {
      const assignmentsData = await AsyncStorage.getItem('doctor_assignments');
      const assignments: LocalDoctorAssignment[] = assignmentsData ? JSON.parse(assignmentsData) : [];
      const existingIndex = assignments.findIndex(a => a.id === assignment.id);
      
      if (existingIndex >= 0) {
        assignments[existingIndex] = assignment;
      } else {
        assignments.push(assignment);
      }
      
      await AsyncStorage.setItem('doctor_assignments', JSON.stringify(assignments));
      return;
    }
    
    await this.db.runAsync(`
      INSERT INTO doctor_assignments (id, doctor_id, mr_id, assigned_by, status, assigned_at, transferred_at, notes, sync_status, local_changes, last_synced_at, needs_sync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        doctor_id = excluded.doctor_id,
        mr_id = excluded.mr_id,
        assigned_by = excluded.assigned_by,
        status = excluded.status,
        assigned_at = excluded.assigned_at,
        transferred_at = excluded.transferred_at,
        notes = excluded.notes,
        sync_status = excluded.sync_status,
        local_changes = excluded.local_changes,
        last_synced_at = excluded.last_synced_at,
        needs_sync = excluded.needs_sync
    `, [
      assignment.id, assignment.doctor_id, assignment.mr_id, assignment.assigned_by,
      assignment.status, assignment.assigned_at, assignment.transferred_at, assignment.notes,
      assignment.sync_status, assignment.local_changes, assignment.last_synced_at, assignment.needs_sync ? 1 : 0
    ]);
  }

  // ==================== DOCTOR PHOTOS CRUD ====================

  static async upsertDoctorPhoto(photo: LocalDoctorPhoto): Promise<void> {
    await this.initialize();
    if (this.isUsingAsyncStorage()) {
      const photosData = await AsyncStorage.getItem('doctor_photos');
      const photos: LocalDoctorPhoto[] = photosData ? JSON.parse(photosData) : [];
      const existingIndex = photos.findIndex(p => p.id === photo.id);
      
      if (existingIndex >= 0) {
        photos[existingIndex] = photo;
      } else {
        photos.push(photo);
      }
      
      await AsyncStorage.setItem('doctor_photos', JSON.stringify(photos));
      return;
    }
    
    await this.db.runAsync(`
      INSERT INTO doctor_photos (id, user_id, file_name, file_path, photo_data, mime_type, created_at, sync_status, local_changes, last_synced_at, needs_sync)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        file_name = excluded.file_name,
        file_path = excluded.file_path,
        photo_data = excluded.photo_data,
        mime_type = excluded.mime_type,
        sync_status = excluded.sync_status,
        local_changes = excluded.local_changes,
        last_synced_at = excluded.last_synced_at,
        needs_sync = excluded.needs_sync
    `, [
      photo.id, photo.user_id, photo.file_name, photo.file_path, photo.photo_data,
      photo.mime_type, photo.created_at, photo.sync_status, photo.local_changes,
      photo.last_synced_at, photo.needs_sync ? 1 : 0
    ]);
  }

  /**
   * Get doctor photos by user_id
   */
  static async getDoctorPhotos(userId: string): Promise<LocalDoctorPhoto[]> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const photosData = await AsyncStorage.getItem('doctor_photos');
        const photos: LocalDoctorPhoto[] = photosData ? JSON.parse(photosData) : [];
        return photos.filter(p => p.user_id === userId);
      }

      const result = await this.db.getAllAsync(`
        SELECT * FROM doctor_photos 
        WHERE user_id = ?
        ORDER BY created_at DESC
      `, [userId]);

      return result.map((row: any) => ({
        ...row,
        needs_sync: Boolean(row.needs_sync)
      })) as LocalDoctorPhoto[];
    } catch (error) {
      console.error('LocalDB: Failed to get doctor photos:', error);
      return [];
    }
  }

  // ==================== MEETING SLIDE NOTES CRUD ====================

  /**
   * Find matching local meeting slide note without server_id (to avoid duplicates)
   */
  static async findMatchingLocalMeetingSlideNote(meetingId: string, slideId: string, excludeId?: string): Promise<LocalMeetingSlideNote | null> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const notesData = await AsyncStorage.getItem('meeting_slide_notes');
        const notes: LocalMeetingSlideNote[] = notesData ? JSON.parse(notesData) : [];
        return notes.find(n => 
          n.meeting_id === meetingId &&
          n.slide_id === slideId &&
          !n.sync_status || n.sync_status === 'pending' || !(n as any).server_id &&
          (!excludeId || n.id !== excludeId)
        ) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM meeting_slide_notes 
        WHERE meeting_id = ? 
          AND slide_id = ?
          AND (sync_status = 'pending' OR sync_status IS NULL)
          ${excludeId ? 'AND id != ?' : ''}
        LIMIT 1
      `, excludeId ? [meetingId, slideId, excludeId] : [meetingId, slideId]);

      if (!result) return null;

      return {
        ...result,
        needs_sync: Boolean(result.needs_sync)
      } as LocalMeetingSlideNote;
    } catch (error) {
      console.error('LocalDB: Failed to find matching local meeting slide note:', error);
      return null;
    }
  }

  static async upsertMeetingSlideNote(note: LocalMeetingSlideNote): Promise<void> {
    await this.initialize();
    
    try {
      // Check if note exists by id
      const existingById = await this.db.getFirstAsync(`
        SELECT * FROM meeting_slide_notes WHERE id = ?
      `, [note.id]);
      
      if (existingById) {
        // Update existing note
        await this.db.runAsync(`
          UPDATE meeting_slide_notes SET
            meeting_id = ?,
            slide_id = ?,
            slide_title = ?,
            slide_order = ?,
            brochure_id = ?,
            note_text = ?,
            updated_at = ?,
            slide_image_uri = ?,
            sync_status = ?,
            local_changes = ?,
            last_synced_at = ?,
            needs_sync = ?
          WHERE id = ?
        `, [
          note.meeting_id, note.slide_id, note.slide_title, note.slide_order,
          note.brochure_id, note.note_text, note.updated_at, note.slide_image_uri,
          note.sync_status, note.local_changes, note.last_synced_at, note.needs_sync ? 1 : 0,
          note.id
        ]);
        return;
      }

      // Check for matching local note without server_id (by meeting_id + slide_id)
      const matchingLocal = await this.findMatchingLocalMeetingSlideNote(note.meeting_id, note.slide_id, undefined);
      
      if (matchingLocal && note.sync_status === 'synced') {
        console.log(`🔗 MEETING SLIDE NOTES SYNC DEBUG: Found matching local note without server_id: ${matchingLocal.id}, updating with server data`);
        
        // Update the local note with server data
        await this.db.runAsync(`
          UPDATE meeting_slide_notes SET
            id = ?,
            slide_title = ?,
            slide_order = ?,
            brochure_id = ?,
            note_text = ?,
            updated_at = ?,
            slide_image_uri = ?,
            sync_status = ?,
            local_changes = ?,
            last_synced_at = ?,
            needs_sync = ?
          WHERE id = ?
        `, [
          note.id, // Use server's id
          note.slide_title,
          note.slide_order,
          note.brochure_id,
          note.note_text,
          note.updated_at,
          note.slide_image_uri,
          note.sync_status,
          note.local_changes,
          note.last_synced_at,
          note.needs_sync ? 1 : 0,
          matchingLocal.id
        ]);
        return;
      }

      // Create new note
      if (this.isUsingAsyncStorage()) {
        const notesData = await AsyncStorage.getItem('meeting_slide_notes');
        const notes: LocalMeetingSlideNote[] = notesData ? JSON.parse(notesData) : [];
        notes.push(note);
        await AsyncStorage.setItem('meeting_slide_notes', JSON.stringify(notes));
        return;
      }
      
      await this.db.runAsync(`
        INSERT INTO meeting_slide_notes (id, meeting_id, slide_id, slide_title, slide_order, brochure_id, note_text, created_at, updated_at, slide_image_uri, sync_status, local_changes, last_synced_at, needs_sync)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        note.id, note.meeting_id, note.slide_id, note.slide_title, note.slide_order,
        note.brochure_id, note.note_text, note.created_at, note.updated_at, note.slide_image_uri,
        note.sync_status, note.local_changes, note.last_synced_at, note.needs_sync ? 1 : 0
      ]);
    } catch (error) {
      console.error('LocalDB: Failed to upsert meeting slide note:', error);
      throw error;
    }
  }

  // ==================== USERS CRUD ====================

  static async upsertUser(user: LocalUser): Promise<void> {
    await this.initialize();
    console.log('🔍 USER PROFILE DEBUG: Upserting user profile:', user.id, user.email);
    
    if (this.isUsingAsyncStorage()) {
      // Use a consistent key for the user's profile
      await AsyncStorage.setItem('user_profile', JSON.stringify(user));
      console.log('✅ USER PROFILE DEBUG: User profile saved to AsyncStorage');
      return;
    }
    
    try {
      await this.db.runAsync(`
        INSERT INTO users (id, email, role, first_name, last_name, phone, profile_image_url, is_active, created_at, updated_at, sync_status, local_changes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          role = excluded.role,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          phone = excluded.phone,
          profile_image_url = excluded.profile_image_url,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at,
          sync_status = excluded.sync_status,
          local_changes = excluded.local_changes
      `, [
        user.id,
        user.email,
        user.role,
        user.first_name,
        user.last_name,
        user.phone || null,
        user.profile_image_url || null,
        user.is_active ? 1 : 0,
        user.created_at,
        user.updated_at,
        user.sync_status,
        user.local_changes || null
      ]);
      console.log('✅ USER PROFILE DEBUG: User profile saved to SQLite database');
    } catch (error) {
      console.error('❌ USER PROFILE DEBUG: Failed to upsert user profile:', error);
      throw error;
    }
  }

  static async getUserById(id: string): Promise<LocalUser | null> {
    await this.initialize();
    console.log('🔍 GET USER DEBUG: Getting user by ID:', id);
    
    if (this.isUsingAsyncStorage()) {
      console.log('🔍 GET USER DEBUG: Using AsyncStorage for user lookup');
      // Try the consistent key first (used by upsertUser)
      let data = await AsyncStorage.getItem('user_profile');
      if (data) {
        const user = JSON.parse(data);
        console.log('🔍 GET USER DEBUG: Found user in user_profile key:', user);
        if (user.id === id) {
          return user;
        }
      }
      
      // Fallback to user_${id} key for backward compatibility
      data = await AsyncStorage.getItem(`user_${id}`);
      if (data) {
        const user = JSON.parse(data);
        console.log('🔍 GET USER DEBUG: Found user in user_${id} key:', user);
        return user;
      }
      
      console.log('❌ GET USER DEBUG: No user found in AsyncStorage');
      return null;
    }
    
    console.log('🔍 GET USER DEBUG: Using SQLite for user lookup');
    const row = await this.db.getFirstAsync(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!row) {
      console.log('❌ GET USER DEBUG: No user found in SQLite');
      return null;
    }
    
    const user = {
      ...row,
      is_active: Boolean(row.is_active)
    } as LocalUser;
    
    console.log('✅ GET USER DEBUG: Found user in SQLite:', user);
    return user;
  }

  static async saveUserCredentials(userId: string, email: string, passwordHash: string): Promise<void> {
    await this.initialize();
    const now = new Date().toISOString();
     if (this.isUsingAsyncStorage()) {
      const credentials = { user_id: userId, email, password_hash: passwordHash, updated_at: now };
      await AsyncStorage.setItem(`user_credentials_${email}`, JSON.stringify(credentials));
      return;
    }
    await this.db.runAsync(`
      INSERT INTO user_credentials (user_id, email, password_hash, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email,
        password_hash = excluded.password_hash,
        updated_at = excluded.updated_at;
    `, [userId, email, passwordHash, now]);
  }

  static async getUserCredentialsByEmail(email: string): Promise<{ user_id: string; password_hash: string } | null> {
    await this.initialize();
    if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem(`user_credentials_${email}`);
        return data ? JSON.parse(data) : null;
    }
    const row = await this.db.getFirstAsync(`SELECT user_id, password_hash FROM user_credentials WHERE email = ?`, [email]);
    return row ? row as { user_id: string; password_hash: string } : null;
  }

  static async upsertPermission(permission: LocalPermission): Promise<void> {
    await this.initialize();
    if (this.isUsingAsyncStorage()) {
        const key = `permission_${permission.user_id}_${permission.permission_key}`;
        await AsyncStorage.setItem(key, JSON.stringify(permission));
        return;
    }
    
    // Ensure local_changes column exists before inserting
    try {
      // Check if column exists by trying to query it
      const checkColumn = await this.db.prepareAsync('SELECT local_changes FROM mr_permissions LIMIT 1');
      await checkColumn.executeAsync();
      await checkColumn.finalizeAsync();
    } catch (error: any) {
      // Column doesn't exist, add it
      if (error?.message?.includes('no such column') || error?.message?.includes('local_changes')) {
        try {
          await this.db.execAsync('ALTER TABLE mr_permissions ADD COLUMN local_changes TEXT');
          console.log('LocalDB: Added local_changes column to mr_permissions table');
        } catch (alterError: any) {
          if (alterError?.message?.includes('duplicate column name') || alterError?.message?.includes('already exists')) {
            console.log('LocalDB: local_changes column already exists in mr_permissions table');
          } else {
            console.warn('LocalDB: Could not add local_changes column to mr_permissions:', alterError);
            throw alterError;
          }
        }
      } else {
        throw error;
      }
    }
    
    await this.db.runAsync(`
      INSERT INTO mr_permissions (id, user_id, permission_key, value, created_at, updated_at, sync_status, local_changes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        permission_key = excluded.permission_key,
        value = excluded.value,
        updated_at = excluded.updated_at,
        sync_status = excluded.sync_status,
        local_changes = excluded.local_changes;
    `, [
      permission.id,
      permission.user_id,
      permission.permission_key,
      permission.value,
      permission.created_at,
      permission.updated_at,
      permission.sync_status,
      permission.local_changes || null
    ]);
  }

  static async upsertSession(session: LocalSession): Promise<void> {
    await this.initialize();
    
    if (this.isUsingAsyncStorage()) {
        const key = `session_${session.user_id}_${session.device_id}`;
        await AsyncStorage.setItem(key, JSON.stringify(session));
        return;
    }
    
    // Safety check: Ensure all required columns exist before using them
    try {
      const tableInfo = await this.db.prepareAsync('PRAGMA table_info(user_sessions)');
      const result = await tableInfo.executeAsync();
      const columns = await result.getAllAsync();
      await tableInfo.finalizeAsync();
      
      const columnNames = columns.map((col: any) => col.name);
      const requiredColumns = ['last_seen_at', 'updated_at', 'created_at', 'local_changes'];
      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`LocalDB: upsertSession: Missing columns [${missingColumns.join(', ')}], running migration 002...`);
        await this.runMigration_002();
      }
    } catch (error) {
      console.warn('LocalDB: Could not verify user_sessions schema, attempting migration:', error);
      try {
        await this.runMigration_002();
      } catch (migrationError) {
        console.error('LocalDB: Migration failed during upsertSession:', migrationError);
        // Continue anyway - will fail below if column truly missing
      }
    }
    
    await this.db.runAsync(`
      INSERT INTO user_sessions (id, user_id, device_id, is_active, last_seen_at, created_at, updated_at, sync_status, local_changes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        device_id = excluded.device_id,
        is_active = excluded.is_active,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at,
        sync_status = excluded.sync_status,
        local_changes = excluded.local_changes;
    `, [
      session.id,
      session.user_id,
      session.device_id,
      session.is_active ? 1 : 0,
      session.last_seen_at,
      session.created_at,
      session.updated_at,
      session.sync_status,
      session.local_changes || null
    ]);
  }

  static async getActiveSession(userId: string, deviceId: string): Promise<LocalSession | null> {
    await this.initialize();
    if (this.isUsingAsyncStorage()) {
        const key = `session_${userId}_${deviceId}`;
        const data = await AsyncStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    }
    const row = await this.executeSelectFirst(`
      SELECT * FROM user_sessions WHERE user_id = ? AND device_id = ?
    `, [userId, deviceId]);
    if (!row) return null;
    return {
      ...row,
      is_active: Boolean(row.is_active)
    } as LocalSession;
  }

  // ==================== BROCHURE SYNC CRUD ====================

  static async upsertBrochureSync(sync: LocalBrochureSync): Promise<void> {
    await this.initialize();
    if (this.isUsingAsyncStorage()) {
      const key = 'brochure_sync';
      const data = await AsyncStorage.getItem(key);
      const syncs: LocalBrochureSync[] = data ? JSON.parse(data) : [];
      const index = syncs.findIndex(s => s.id === sync.id);
      if (index >= 0) {
        syncs[index] = sync;
      } else {
        syncs.push(sync);
      }
      await AsyncStorage.setItem(key, JSON.stringify(syncs));
      return;
    }
    await this.executeQuery(`
      INSERT INTO brochure_sync (id, server_id, mr_id, brochure_id, brochure_title, brochure_data, last_modified, created_at, version, sync_status, local_changes, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        server_id = excluded.server_id,
        mr_id = excluded.mr_id,
        brochure_id = excluded.brochure_id,
        brochure_title = excluded.brochure_title,
        brochure_data = excluded.brochure_data,
        last_modified = excluded.last_modified,
        created_at = excluded.created_at,
        version = excluded.version,
        sync_status = excluded.sync_status,
        local_changes = excluded.local_changes,
        is_deleted = excluded.is_deleted
    `, [
      sync.id, sync.server_id || null, sync.mr_id, sync.brochure_id, 
      sync.brochure_title || null, sync.brochure_data, sync.last_modified || null,
      sync.created_at || null, sync.version, sync.sync_status, sync.local_changes || null,
      sync.is_deleted ? 1 : 0
    ]);
  }

  /**
   * Find matching local saved brochure without server_id (to avoid duplicates)
   */
  static async findMatchingLocalSavedBrochure(mrId: string, brochureId: string, excludeId?: string): Promise<LocalSavedBrochure | null> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('saved_brochures');
        const brochures: LocalSavedBrochure[] = data ? JSON.parse(data) : [];
        return brochures.find(b => 
          b.mr_id === mrId &&
          !b.server_id &&
          b.brochure_id === brochureId &&
          (!excludeId || b.id !== excludeId) &&
          !b.is_deleted
        ) || null;
      }

      const result = await this.db.getFirstAsync(`
        SELECT * FROM saved_brochures 
        WHERE mr_id = ? 
          AND server_id IS NULL 
          AND brochure_id = ?
          AND is_deleted = 0
          ${excludeId ? 'AND id != ?' : ''}
        LIMIT 1
      `, excludeId ? [mrId, brochureId, excludeId] : [mrId, brochureId]);

      if (!result) return null;

      return {
        ...result,
        is_deleted: Boolean(result.is_deleted)
      } as LocalSavedBrochure;
    } catch (error) {
      console.error('LocalDB: Failed to find matching local saved brochure:', error);
      return null;
    }
  }

  static async upsertSavedBrochure(savedBrochure: LocalSavedBrochure): Promise<void> {
    await this.initialize();
    
    try {
      // Check if saved brochure exists by id
      const existingById = await this.getSavedBrochureById(savedBrochure.id);
      
      if (existingById) {
        // Update existing saved brochure
        await this.executeQuery(`
          UPDATE saved_brochures SET
            server_id = ?,
            mr_id = ?,
            brochure_id = ?,
            brochure_title = ?,
            custom_title = ?,
            original_brochure_data = ?,
            saved_at = ?,
            last_accessed = ?,
            version = ?,
            sync_status = ?,
            local_changes = ?
          WHERE id = ?
        `, [
          savedBrochure.server_id || null,
          savedBrochure.mr_id,
          savedBrochure.brochure_id,
          savedBrochure.brochure_title,
          savedBrochure.custom_title,
          savedBrochure.original_brochure_data,
          savedBrochure.saved_at || null,
          savedBrochure.last_accessed || null,
          savedBrochure.version,
          savedBrochure.sync_status,
          savedBrochure.local_changes || null,
          savedBrochure.id
        ]);
        return;
      }

      // Check if saved brochure exists by server_id
      if (savedBrochure.server_id) {
        const allSavedBrochures = await this.getSavedBrochures(savedBrochure.mr_id);
        const existingByServerId = allSavedBrochures.find(b => b.server_id === savedBrochure.server_id);
        
        if (existingByServerId) {
          // Update existing saved brochure with server_id
          await this.executeQuery(`
            UPDATE saved_brochures SET
              server_id = ?,
              mr_id = ?,
              brochure_id = ?,
              brochure_title = ?,
              custom_title = ?,
              original_brochure_data = ?,
              saved_at = ?,
              last_accessed = ?,
              version = ?,
              sync_status = ?,
              local_changes = ?
            WHERE id = ?
          `, [
            savedBrochure.server_id,
            savedBrochure.mr_id,
            savedBrochure.brochure_id,
            savedBrochure.brochure_title,
            savedBrochure.custom_title,
            savedBrochure.original_brochure_data,
            savedBrochure.saved_at || null,
            savedBrochure.last_accessed || null,
            savedBrochure.version,
            savedBrochure.sync_status,
            savedBrochure.local_changes || null,
            existingByServerId.id
          ]);
          return;
        }

        // Check for matching local saved brochure without server_id
        const matchingLocal = await this.findMatchingLocalSavedBrochure(savedBrochure.mr_id, savedBrochure.brochure_id, undefined);
        
        if (matchingLocal) {
          console.log(`🔗 SAVED BROCHURES SYNC DEBUG: Found matching local saved brochure without server_id: ${matchingLocal.id}, linking to server_id: ${savedBrochure.server_id}`);
          
          // Update the local saved brochure with server_id and server data
          await this.executeQuery(`
            UPDATE saved_brochures SET
              server_id = ?,
              mr_id = ?,
              brochure_id = ?,
              brochure_title = ?,
              custom_title = ?,
              original_brochure_data = ?,
              saved_at = ?,
              last_accessed = ?,
              version = ?,
              sync_status = ?,
              local_changes = ?
            WHERE id = ?
          `, [
            savedBrochure.server_id,
            savedBrochure.mr_id,
            savedBrochure.brochure_id,
            savedBrochure.brochure_title,
            savedBrochure.custom_title,
            savedBrochure.original_brochure_data,
            savedBrochure.saved_at || null,
            savedBrochure.last_accessed || null,
            savedBrochure.version,
            savedBrochure.sync_status,
            savedBrochure.local_changes || null,
            matchingLocal.id
          ]);
          return;
        }
      }

      // Create new saved brochure
      if (this.isUsingAsyncStorage()) {
        const key = 'saved_brochures';
        const data = await AsyncStorage.getItem(key);
        const brochures: LocalSavedBrochure[] = data ? JSON.parse(data) : [];
        brochures.push(savedBrochure);
        await AsyncStorage.setItem(key, JSON.stringify(brochures));
        return;
      }
      
      await this.executeQuery(`
        INSERT INTO saved_brochures (id, server_id, mr_id, brochure_id, brochure_title, custom_title, original_brochure_data, saved_at, last_accessed, version, sync_status, local_changes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        savedBrochure.id, savedBrochure.server_id || null, savedBrochure.mr_id, savedBrochure.brochure_id,
        savedBrochure.brochure_title, savedBrochure.custom_title, savedBrochure.original_brochure_data,
        savedBrochure.saved_at || null, savedBrochure.last_accessed || null, savedBrochure.version,
        savedBrochure.sync_status, savedBrochure.local_changes || null
      ]);
    } catch (error) {
      console.error('LocalDB: Failed to upsert saved brochure:', error);
      throw error;
    }
  }



  static async getDashboardStats(mrId: string): Promise<{
    doctors_connected: number;
    meetings_scheduled: number;
    brochures_downloaded: number;
    brochures_viewed: number;
    brochures_available: number;
  }> {
    await this.initialize();
    console.log('🔍 DASHBOARD STATS DEBUG: Getting dashboard stats for MR:', mrId);
    
    try {
      if (this.isUsingAsyncStorage()) {
        console.log('🔍 DASHBOARD STATS DEBUG: Using AsyncStorage for stats calculation');
        const doctorsData = await AsyncStorage.getItem('doctors');
        const meetingsData = await AsyncStorage.getItem('meetings');
        const savedBrochuresData = await AsyncStorage.getItem('saved_brochures');
        
        const doctors: LocalDoctor[] = doctorsData ? JSON.parse(doctorsData) : [];
        const meetings: LocalMeeting[] = meetingsData ? JSON.parse(meetingsData) : [];
        const savedBrochures: LocalSavedBrochure[] = savedBrochuresData ? JSON.parse(savedBrochuresData) : [];
        
        console.log('🔍 DASHBOARD STATS DEBUG: Raw data counts:');
        console.log('  - Total doctors in storage:', doctors.length);
        console.log('  - Total meetings in storage:', meetings.length);
        console.log('  - Total saved brochures in storage:', savedBrochures.length);
        
        console.log('🔍 DASHBOARD STATS DEBUG: Doctor details:');
        doctors.forEach((d, index) => {
          console.log(`  - Doctor ${index}: id=${d.id}, mr_id=${d.mr_id}, is_deleted=${d.is_deleted}, name=${d.first_name} ${d.last_name}`);
        });
        
        const doctorsConnected = doctors.filter(d => d.mr_id === mrId && !d.is_deleted).length;
        const meetingsScheduled = meetings.filter(m => m.mr_id === mrId && !m.is_deleted && m.status === 'scheduled').length;
        const brochuresDownloaded = savedBrochures.filter(b => b.mr_id === mrId).length;
        
        // Get available brochures count from AsyncStorage using same logic as getBrochures():
        // - Brochures assigned via brochure_sync (where mr_id matches)
        // - OR public brochures (is_public = 1)
        // Both must be active (status = 'active')
        const brochureSyncData = await AsyncStorage.getItem('brochure_sync');
        const brochureSyncs: any[] = brochureSyncData ? JSON.parse(brochureSyncData) : [];
        const assignedBrochureIds = new Set(
          brochureSyncs
            .filter((sync: any) => sync.mr_id === mrId && !sync.is_deleted)
            .map((sync: any) => sync.brochure_id)
        );
        
        const brochuresData = await AsyncStorage.getItem('brochures');
        const availableBrochures: any[] = brochuresData ? JSON.parse(brochuresData) : [];
        
        // Count brochures that are either assigned OR public (and active)
        const brochuresAvailable = availableBrochures.filter((b: any) => 
          b.status === 'active' && 
          (assignedBrochureIds.has(b.id) || b.is_public === 1 || b.is_public === true)
        ).length;
        
        // Get brochures viewed from activity logs
        const activityLogsData = await AsyncStorage.getItem('activity_logs');
        const activityLogs: any[] = activityLogsData ? JSON.parse(activityLogsData) : [];
        const viewedBrochureIds = new Set(
          activityLogs
            .filter((log: any) => log.mr_id === mrId && (log.action === 'view_brochure' || log.activity_type === 'view_brochure'))
            .map((log: any) => log.brochure_id)
            .filter((id: string) => id)
        );
        const brochuresViewed = viewedBrochureIds.size;
        
        console.log('🔍 DASHBOARD STATS DEBUG: Filtered counts:');
        console.log('  - Doctors connected (mr_id match):', doctorsConnected);
        console.log('  - Meetings scheduled (mr_id match):', meetingsScheduled);
        console.log('  - Brochures downloaded (saved) count:', brochuresDownloaded);
        console.log('  - Brochures available (assigned) count:', brochuresAvailable);
        console.log('  - Brochures viewed count:', brochuresViewed);

        const result = {
          doctors_connected: doctorsConnected,
          meetings_scheduled: meetingsScheduled,
          brochures_downloaded: brochuresDownloaded,
          brochures_viewed: brochuresViewed,
          brochures_available: brochuresAvailable, // Add this for dashboard
        };
        
        console.log('✅ DASHBOARD STATS DEBUG: Final stats result:', result);
        return result;
      } else {
        console.log('🔍 DASHBOARD STATS DEBUG: Using SQLite for stats calculation');
        
        // Debug: Check all doctors for this MR
        const allDoctorsDebug = await this.db.getAllAsync(
          `SELECT id, first_name, last_name, mr_id, is_deleted, sync_status FROM doctors WHERE mr_id = ? OR mr_id IS NULL`,
          [mrId]
        );
        console.log('🔍 DASHBOARD STATS DEBUG: All doctors with matching mr_id:', allDoctorsDebug?.length || 0, allDoctorsDebug);
        
        // Debug: Check all doctors regardless of mr_id
        const allDoctorsAll = await this.db.getAllAsync(
          `SELECT id, first_name, last_name, mr_id, is_deleted, sync_status FROM doctors LIMIT 10`
        );
        console.log('🔍 DASHBOARD STATS DEBUG: All doctors in DB (first 10):', allDoctorsAll?.length || 0, allDoctorsAll);
        
        // Use SQLite with helper methods
        // Count doctors that match mr_id and are not deleted
        // Handle NULL is_deleted as 0 (not deleted)
        const doctorResult = await this.executeSelectFirst(
          `SELECT COUNT(id) as count FROM doctors WHERE mr_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)`,
          [mrId]
        );
        
        // Also verify the count matches getDoctors() result
        const doctorsList = await this.getDoctors(mrId);
        console.log('🔍 DASHBOARD STATS DEBUG: getDoctors() returned:', doctorsList.length, 'doctors');
        console.log('🔍 DASHBOARD STATS DEBUG: getDoctors() doctor details:', doctorsList.map(d => ({ id: d.id, server_id: d.server_id, name: `${d.first_name} ${d.last_name}`, mr_id: d.mr_id, is_deleted: d.is_deleted })));
        
        // Deduplicate doctors by server_id (fix duplicate issue)
        const uniqueDoctors = new Map<string, LocalDoctor>();
        doctorsList.forEach(doctor => {
          const key = doctor.server_id || doctor.id; // Use server_id as key, fallback to id
          if (key && !uniqueDoctors.has(key)) {
            uniqueDoctors.set(key, doctor);
          } else if (key) {
            // Duplicate found - keep the one with a valid id (not null)
            const existing = uniqueDoctors.get(key);
            if (existing && !existing.id && doctor.id) {
              uniqueDoctors.set(key, doctor); // Replace null id with valid id
            }
          }
        });
        
        const actualDoctorCount = uniqueDoctors.size;
        const countQueryResult = doctorResult?.count || 0;
        
        console.log('🔍 DASHBOARD STATS DEBUG: Unique doctors count (deduplicated):', actualDoctorCount);
        
        if (actualDoctorCount !== countQueryResult) {
          console.warn(`⚠️ DASHBOARD STATS DEBUG: Doctor count mismatch! COUNT query: ${countQueryResult}, unique doctors: ${actualDoctorCount}. Using unique count.`);
          // Use the actual unique count (deduplicated)
          doctorResult.count = actualDoctorCount;
        }

        // Get all meetings and deduplicate them (same logic as Meeting Records screen)
        const allMeetings = await this.getMeetings(mrId);
        console.log('🔍 DASHBOARD STATS DEBUG: Total meetings from getMeetings:', allMeetings.length);
        const scheduledMeetings = allMeetings.filter(m => m.status === 'scheduled');
        console.log('🔍 DASHBOARD STATS DEBUG: Scheduled meetings (before dedup):', scheduledMeetings.length);
        console.log('🔍 DASHBOARD STATS DEBUG: Scheduled meetings details:', scheduledMeetings.map(m => ({
          id: m.id,
          server_id: m.server_id,
          doctor_id: m.doctor_id,
          scheduled_date: m.scheduled_date,
          title: m.title,
          is_deleted: m.is_deleted
        })));
        
        // Deduplicate meetings using same logic as UnifiedDataService and MeetingsScreen
        const meetingsByKey = new Map<string, LocalMeeting>();
        scheduledMeetings.forEach(meeting => {
          const key = meeting.server_id 
            ? `server_${meeting.server_id}` 
            : `local_${meeting.doctor_id}_${meeting.scheduled_date}_${meeting.title}`;
          
          if (!meetingsByKey.has(key)) {
            meetingsByKey.set(key, meeting);
          } else {
            // Keep the one with server_id, or the most recent
            const existing = meetingsByKey.get(key)!;
            if (meeting.server_id && !existing.server_id) {
              meetingsByKey.set(key, meeting);
            } else if (!meeting.server_id && existing.server_id) {
              // Keep existing
            } else {
              // Both have or don't have server_id - keep most recent
              const meetingDate = new Date(meeting.updated_at).getTime();
              const existingDate = new Date(existing.updated_at).getTime();
              if (meetingDate > existingDate) {
                meetingsByKey.set(key, meeting);
              }
            }
          }
        });
        
        console.log('🔍 DASHBOARD STATS DEBUG: Unique meetings after deduplication:', meetingsByKey.size);
        console.log('🔍 DASHBOARD STATS DEBUG: Deduplication keys:', Array.from(meetingsByKey.keys()));
        
        const meetingResult = { count: meetingsByKey.size };

        const brochureDownloadedResult = await this.executeSelectFirst(
          `SELECT COUNT(id) as count FROM saved_brochures WHERE mr_id = ?`,
          [mrId]
        );

        // Note: Viewed count can be complex offline. A simple count of distinct viewed brochures is used here.
        // A more detailed implementation might track view events in a separate table.
        // Count available brochures using the same logic as getBrochures():
        // - Brochures assigned via brochure_sync (where mr_id matches)
        // - OR public brochures (is_public = 1)
        // Both must be active (status = 'active')
        let brochuresAvailableResult;
        try {
          // First, let's check what brochures exist in the database
          const allBrochuresCheck = await this.db.getAllAsync(`SELECT id, title, status, is_public FROM brochures LIMIT 10`);
          console.log('🔍 DASHBOARD STATS DEBUG: All brochures in DB:', allBrochuresCheck?.length || 0, allBrochuresCheck);
          
          // Check brochure_sync table
          const brochureSyncCheck = await this.db.getAllAsync(`SELECT brochure_id, mr_id, is_deleted FROM brochure_sync WHERE mr_id = ? LIMIT 10`, [mrId]);
          console.log('🔍 DASHBOARD STATS DEBUG: Brochure sync entries for MR:', brochureSyncCheck?.length || 0, brochureSyncCheck);
          
          // Use same logic as getBrochures: assigned OR public brochures
          // Query 1: Get assigned brochures (via brochure_sync)
          let assignedBrochuresResult;
          try {
            assignedBrochuresResult = await this.executeSelectFirst(
              `SELECT COUNT(DISTINCT bs.brochure_id) as count 
               FROM brochure_sync bs
               INNER JOIN brochures b ON bs.brochure_id = b.id
               WHERE bs.mr_id = ? AND (bs.is_deleted = 0 OR bs.is_deleted IS NULL) AND b.status = 'active'`,
              [mrId]
            );
          } catch (error: any) {
            if (error?.message?.includes('no such column: is_deleted')) {
              assignedBrochuresResult = await this.executeSelectFirst(
                `SELECT COUNT(DISTINCT bs.brochure_id) as count 
                 FROM brochure_sync bs
                 INNER JOIN brochures b ON bs.brochure_id = b.id
                 WHERE bs.mr_id = ? AND b.status = 'active'`,
                [mrId]
              );
            } else {
              assignedBrochuresResult = { count: 0 };
            }
          }
          
          // Query 2: Get public brochures (not already counted in assigned)
          const assignedBrochureIds = brochureSyncCheck?.map((sync: any) => sync.brochure_id) || [];
          const assignedIdsPlaceholder = assignedBrochureIds.length > 0 
            ? `AND b.id NOT IN (${assignedBrochureIds.map(() => '?').join(',')})`
            : '';
          
          let publicBrochuresResult = { count: 0 };
          if (assignedIdsPlaceholder) {
            publicBrochuresResult = await this.executeSelectFirst(
              `SELECT COUNT(b.id) as count 
               FROM brochures b
               WHERE b.status = 'active' AND (b.is_public = 1 OR b.is_public = true) ${assignedIdsPlaceholder}`,
              [...assignedBrochureIds]
            );
          } else {
            publicBrochuresResult = await this.executeSelectFirst(
              `SELECT COUNT(b.id) as count 
               FROM brochures b
               WHERE b.status = 'active' AND (b.is_public = 1 OR b.is_public = true)`,
              []
            );
          }
          
          const assignedCount = assignedBrochuresResult?.count || 0;
          const publicCount = publicBrochuresResult?.count || 0;
          const totalCount = assignedCount + publicCount;
          
          console.log('🔍 DASHBOARD STATS DEBUG: Assigned brochures count:', assignedCount);
          console.log('🔍 DASHBOARD STATS DEBUG: Public brochures count:', publicCount);
          console.log('🔍 DASHBOARD STATS DEBUG: Total brochures available:', totalCount);
          
          brochuresAvailableResult = { count: totalCount };
        } catch (error: any) {
          console.error('LocalDB: Error counting brochures available:', error);
          // Final fallback: count all active brochures
          const allBrochuresResult = await this.executeSelectFirst(
            `SELECT COUNT(id) as count FROM brochures WHERE status = 'active'`,
            []
          );
          brochuresAvailableResult = allBrochuresResult;
        }
        
        const brochuresAvailable = brochuresAvailableResult?.count || 0;

        // Note: Viewed count can be complex offline. A simple count of distinct viewed brochures is used here.
        const brochureViewedResult = await this.executeSelectFirst(
          `SELECT COUNT(DISTINCT brochure_id) as count FROM activity_logs WHERE mr_id = ? AND action = 'view_brochure'`,
          [mrId]
        );

        console.log('🔍 DASHBOARD STATS DEBUG: SQLite query results:');
        console.log('  - Doctors count:', doctorResult?.count || 0);
        console.log('  - Meetings count:', meetingResult?.count || 0);
        console.log('  - Brochures downloaded (saved) count:', brochureDownloadedResult?.count || 0);
        console.log('  - Brochures available (assigned) count:', brochuresAvailableResult?.count || 0);
        console.log('  - Brochures viewed count:', brochureViewedResult?.count || 0);

        const result = {
          doctors_connected: doctorResult?.count || 0,
          meetings_scheduled: meetingResult?.count || 0,
          brochures_downloaded: brochureDownloadedResult?.count || 0,
          brochures_viewed: brochureViewedResult?.count || 0,
          brochures_available: brochuresAvailable, // Use calculated value
        };
        
        console.log('✅ DASHBOARD STATS DEBUG: Final SQLite stats result:', result);
        return result;
      }
    } catch (error) {
      console.error('LocalDB: Failed to get dashboard stats:', error);
      return {
        doctors_connected: 0,
        meetings_scheduled: 0,
        brochures_downloaded: 0,
        brochures_viewed: 0,
        brochures_available: 0,
      };
    }
  }

  static async getRecentActivities(mrId: string, limit: number): Promise<MRRecentActivity[]> {
    await this.initialize();
    try {
      if (this.isUsingAsyncStorage()) {
        const data = await AsyncStorage.getItem('activity_logs');
        const logs: LocalActivityLog[] = data ? JSON.parse(data) : [];
        return logs
          .filter(l => l.mr_id === mrId)
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .slice(0, limit)
          .map(activity => ({
            id: activity.id,
            activity_type: activity.activity_type,
            description: activity.description,
            created_at: activity.created_at || new Date().toISOString(),
          }));
      }

      const activities = await this.executeSelect(
        `SELECT * FROM activity_logs WHERE mr_id = ? ORDER BY created_at DESC LIMIT ?`,
        [mrId, limit]
      );
      return activities.map((activity: any) => ({
        id: activity.id || activity.activity_id,
        activity_type: activity.activity_type || activity.action,
        description: activity.description || activity.details,
        created_at: activity.created_at || activity.timestamp || new Date().toISOString(),
      }));
    } catch (error) {
      console.error('LocalDB: Failed to get recent activities:', error);
      return [];
    }
  }

  static async getUpcomingMeetings(mrId: string, limit: number): Promise<MRUpcomingMeeting[]> {
    await this.initialize();
    try {
       if (this.isUsingAsyncStorage()) {
        const today = new Date().toISOString().split('T')[0];
        const meetingsData = await AsyncStorage.getItem('meetings');
        const meetings: LocalMeeting[] = meetingsData ? JSON.parse(meetingsData) : [];
        const doctorsData = await AsyncStorage.getItem('doctors');
        const doctors: LocalDoctor[] = doctorsData ? JSON.parse(doctorsData) : [];
        
        return meetings
          .filter(m => m.mr_id === mrId && !m.is_deleted && m.scheduled_date >= today)
          .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
          .slice(0, limit)
          .map(meeting => {
            const doctor = doctors.find(d => d.id === meeting.doctor_id);
            return {
              meeting_id: meeting.id,
              doctor_name: doctor ? `${doctor.first_name} ${doctor.last_name}` : 'Unknown Doctor',
              hospital: doctor ? (doctor.hospital || 'Unknown') : 'Unknown',
              scheduled_date: meeting.scheduled_date,
              status: meeting.status || 'scheduled',
              notes: meeting.notes,
            };
          });
      }

      const today = new Date().toISOString().split('T')[0];
      const meetings = await this.executeSelect(
        `SELECT m.*, d.first_name, d.last_name, d.specialty
         FROM meetings m
         JOIN doctors d ON m.doctor_id = d.id
         WHERE m.mr_id = ? AND m.is_deleted = 0 AND m.scheduled_date >= ?
         ORDER BY m.scheduled_date ASC, m.duration_minutes ASC
         LIMIT ?`,
        [mrId, today, limit]
      );

      return meetings.map((meeting: any) => ({
        meeting_id: meeting.id,
        doctor_name: `${meeting.first_name} ${meeting.last_name}`,
        hospital: meeting.hospital || 'Unknown',
        scheduled_date: meeting.scheduled_date,
        status: meeting.status || 'scheduled',
        notes: meeting.notes,
      }));
    } catch (error) {
      console.error('LocalDB: Failed to get upcoming meetings:', error);
      return [];
    }
  }

  /**
   * Verify brochure storage in local DB
   * Returns counts and details of available brochures and saved brochures
   */
  static async verifyBrochureStorage(mrId: string): Promise<{
    availableBrochures: { count: number; details: any[] };
    savedBrochures: { count: number; details: any[] };
    brochureSyncEntries: { count: number; details: any[] };
    brochuresTableEntries: { count: number; details: any[] };
  }> {
    await this.initialize();
    
    try {
      if (this.isUsingAsyncStorage()) {
        // AsyncStorage path
        const brochuresData = await AsyncStorage.getItem('brochures');
        const brochureSyncData = await AsyncStorage.getItem('brochure_sync');
        const savedBrochuresData = await AsyncStorage.getItem('saved_brochures');
        
        const brochures: LocalBrochure[] = brochuresData ? JSON.parse(brochuresData) : [];
        const syncs: LocalBrochureSync[] = brochureSyncData ? JSON.parse(brochureSyncData) : [];
        const saved: LocalSavedBrochure[] = savedBrochuresData ? JSON.parse(savedBrochuresData) : [];
        
        const assignedSyncs = syncs.filter(s => s.mr_id === mrId && !s.is_deleted);
        const availableBrochures = brochures.filter(b => {
          const isAssigned = assignedSyncs.some(s => s.brochure_id === b.id);
          return isAssigned || b.is_public;
        });
        
        return {
          availableBrochures: {
            count: availableBrochures.length,
            details: availableBrochures.map(b => ({ id: b.id, title: b.title, status: b.status }))
          },
          savedBrochures: {
            count: saved.filter(s => s.mr_id === mrId).length,
            details: saved.filter(s => s.mr_id === mrId).map(s => ({ id: s.id, brochure_id: s.brochure_id, custom_title: s.custom_title }))
          },
          brochureSyncEntries: {
            count: assignedSyncs.length,
            details: assignedSyncs.map(s => ({ id: s.id, brochure_id: s.brochure_id, brochure_title: s.brochure_title }))
          },
          brochuresTableEntries: {
            count: brochures.filter(b => b.status === 'active').length,
            details: brochures.filter(b => b.status === 'active').map(b => ({ id: b.id, title: b.title, is_public: b.is_public }))
          }
        };
      }
      
      // SQLite path
      const brochuresResult = await this.db.getAllAsync(`
        SELECT id, title, status, is_public FROM brochures WHERE status = 'active'
      `);
      
      const syncResult = await this.db.getAllAsync(`
        SELECT id, mr_id, brochure_id, brochure_title, is_deleted FROM brochure_sync WHERE mr_id = ? AND is_deleted = 0
      `, [mrId]);
      
      const savedResult = await this.db.getAllAsync(`
        SELECT id, mr_id, brochure_id, custom_title FROM saved_brochures WHERE mr_id = ?
      `, [mrId]);
      
      const assignedBrochureIds = new Set(syncResult.map((s: any) => s.brochure_id));
      const availableBrochures = brochuresResult.filter((b: any) => {
        return assignedBrochureIds.has(b.id) || b.is_public === 1;
      });
      
      return {
        availableBrochures: {
          count: availableBrochures.length,
          details: availableBrochures.map((b: any) => ({ id: b.id, title: b.title, status: b.status }))
        },
        savedBrochures: {
          count: savedResult.length,
          details: savedResult.map((s: any) => ({ id: s.id, brochure_id: s.brochure_id, custom_title: s.custom_title }))
        },
        brochureSyncEntries: {
          count: syncResult.length,
          details: syncResult.map((s: any) => ({ id: s.id, brochure_id: s.brochure_id, brochure_title: s.brochure_title }))
        },
        brochuresTableEntries: {
          count: brochuresResult.length,
          details: brochuresResult.map((b: any) => ({ id: b.id, title: b.title, is_public: b.is_public === 1 }))
        }
      };
    } catch (error) {
      console.error('LocalDB: Failed to verify brochure storage:', error);
      return {
        availableBrochures: { count: 0, details: [] },
        savedBrochures: { count: 0, details: [] },
        brochureSyncEntries: { count: 0, details: [] },
        brochuresTableEntries: { count: 0, details: [] }
      };
    }
  }
}
