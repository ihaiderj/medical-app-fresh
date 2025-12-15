/**
 * Log File Writer Utility
 * Writes console logs to a file for debugging purposes
 */
import * as FileSystem from 'expo-file-system'

export class LogFileWriter {
  private static readonly LOG_DIR = `${FileSystem.documentDirectory}logs/`
  private static readonly LOG_FILE = `${this.LOG_DIR}sync_debug.log`
  private static maxLogSize = 5 * 1024 * 1024 // 5MB max file size
  private static isInitialized = false

  /**
   * Initialize log file writer
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Create logs directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(this.LOG_DIR)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.LOG_DIR, { intermediates: true })
      }

      // Check log file size and rotate if needed
      const fileInfo = await FileSystem.getInfoAsync(this.LOG_FILE)
      if (fileInfo.exists && fileInfo.size && fileInfo.size > this.maxLogSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const rotatedFile = `${this.LOG_DIR}sync_debug_${timestamp}.log`
        await FileSystem.moveAsync({
          from: this.LOG_FILE,
          to: rotatedFile
        })
      }

      // Write initialization message
      await this.writeLog('=== LOG FILE WRITER INITIALIZED ===')
      await this.writeLog(`Started at: ${new Date().toISOString()}`)
      await this.writeLog('=====================================\n')

      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize log file writer:', error)
    }
  }

  /**
   * Write log message to file
   */
  static async writeLog(message: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    try {
      const timestamp = new Date().toISOString()
      const logEntry = `[${timestamp}] ${message}\n`
      
      // Read existing content and append
      const fileInfo = await FileSystem.getInfoAsync(this.LOG_FILE)
      const existingContent = fileInfo.exists 
        ? await FileSystem.readAsStringAsync(this.LOG_FILE)
        : ''
      
      // Append to log file
      await FileSystem.writeAsStringAsync(
        this.LOG_FILE,
        existingContent + logEntry,
        { encoding: FileSystem.EncodingType.UTF8 }
      )
    } catch (error) {
      // Silently fail - don't break the app if logging fails
      console.error('Failed to write log:', error)
    }
  }

  /**
   * Get log file path
   */
  static getLogFilePath(): string {
    return this.LOG_FILE
  }

  /**
   * Read log file contents
   */
  static async readLogs(): Promise<string> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(this.LOG_FILE)
      if (!fileInfo.exists) {
        return 'No log file found'
      }

      return await FileSystem.readAsStringAsync(this.LOG_FILE)
    } catch (error) {
      return `Error reading log file: ${error}`
    }
  }

  /**
   * Clear log file
   */
  static async clearLogs(): Promise<void> {
    try {
      await FileSystem.deleteAsync(this.LOG_FILE, { idempotent: true })
      await this.initialize()
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }
}

// Intercept console.log and write to file
const originalLog = console.log
const originalError = console.error
const originalWarn = console.warn

console.log = (...args: any[]) => {
  originalLog(...args)
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ')
  
  // Only log our debug messages (with emoji prefixes)
  if (message.includes('🔵') || message.includes('🟢') || message.includes('🟡') || 
      message.includes('🔴') || message.includes('⚪')) {
    LogFileWriter.writeLog(message).catch(() => {})
  }
}

console.error = (...args: any[]) => {
  originalError(...args)
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ')
  
  if (message.includes('🔵') || message.includes('🟢') || message.includes('🟡') || 
      message.includes('🔴') || message.includes('⚪')) {
    LogFileWriter.writeLog(`[ERROR] ${message}`).catch(() => {})
  }
}

console.warn = (...args: any[]) => {
  originalWarn(...args)
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ')
  
  if (message.includes('🔵') || message.includes('🟢') || message.includes('🟡') || 
      message.includes('🔴') || message.includes('⚪')) {
    LogFileWriter.writeLog(`[WARN] ${message}`).catch(() => {})
  }
}

