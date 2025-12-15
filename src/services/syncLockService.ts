/**
 * Sync Lock Service
 * Prevents concurrent sync operations using mutex pattern
 */

type SyncCallback = () => Promise<void>;

class SyncLockService {
  private isLocked: boolean = false;
  private pendingQueue: Array<{ callback: SyncCallback; resolve: () => void; reject: (error: Error) => void }> = [];

  /**
   * Acquire sync lock
   * If lock is already held, queue the request
   */
  async acquireLock(): Promise<void> {
    if (!this.isLocked) {
      this.isLocked = true;
      return Promise.resolve();
    }

    // Lock is held, queue the request
    return new Promise<void>((resolve, reject) => {
      this.pendingQueue.push({
        callback: async () => {},
        resolve,
        reject
      });
    });
  }

  /**
   * Release sync lock and process next queued request
   */
  releaseLock(): void {
    if (!this.isLocked) {
      console.warn('SyncLock: Attempted to release lock that was not held');
      return;
    }

    this.isLocked = false;

    // Process next queued request
    if (this.pendingQueue.length > 0) {
      const next = this.pendingQueue.shift();
      if (next) {
        this.isLocked = true;
        next.resolve();
      }
    }
  }

  /**
   * Execute a function with sync lock
   * Automatically acquires and releases lock
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireLock();
    try {
      return await fn();
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Check if lock is currently held
   */
  isLockHeld(): boolean {
    return this.isLocked;
  }

  /**
   * Get number of pending requests
   */
  getPendingCount(): number {
    return this.pendingQueue.length;
  }

  /**
   * Clear all pending requests
   */
  clearPending(): void {
    this.pendingQueue.forEach(item => {
      item.reject(new Error('Sync lock cleared'));
    });
    this.pendingQueue = [];
  }
}

export const syncLockService = new SyncLockService();

