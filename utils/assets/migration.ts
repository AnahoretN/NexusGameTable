/**
 * Asset System Migration
 *
 * Migrates data from the old imageCache system to the new CAS system.
 * This should be run once during the upgrade process.
 */

import { hashDataURL } from './hashing';
import { assetDB } from './indexeddb';
import { logger } from '../logger';

// ============================================================================
// TYPES
// ============================================================================

export interface MigrationResult {
  success: boolean;
  totalMigrated: number;
  duplicatesSkipped: number;
  errors: number;
  totalSize: number;
  duration: number;
}

export interface MigrationProgress {
  phase: 'reading' | 'hashing' | 'storing' | 'cleanup';
  current: number;
  total: number;
  imageId?: string;
}

export type MigrationProgressCallback = (progress: MigrationProgress) => void;

// ============================================================================
// OLD SYSTEM CONSTANTS
// ============================================================================

const OLD_DB_NAME = 'NexusGameTable_Images';
const OLD_DB_VERSION = 1;
const OLD_STORE_NAME = 'cachedImages';

interface OldIDBEntry {
  id: string;
  data: string;  // base64 data URL
  timestamp: number;
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Check if migration is needed
 *
 * @returns true if old database exists and has data
 */
export async function isMigrationNeeded(): Promise<boolean> {
  try {
    const exists = await databaseExists(OLD_DB_NAME);
    if (!exists) return false;

    // Check if it has data
    const count = await countOldEntries();
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Check if database exists
 */
async function databaseExists(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.open(name);

    request.onsuccess = () => {
      request.result.close();
      resolve(true);
    };

    request.onerror = () => resolve(false);
    request.onupgradeneeded = () => {
      request.result.close();
      resolve(false);
    };
  });
}

/**
 * Count entries in old database
 */
async function countOldEntries(): Promise<number> {
  return new Promise((resolve) => {
    const request = indexedDB.open(OLD_DB_NAME, OLD_DB_VERSION);

    request.onsuccess = () => {
      const db = request.result;

      // Check if the store exists
      if (!db.objectStoreNames.contains(OLD_STORE_NAME)) {
        // Migration: Old database exists but has different structure
        db.close();
        resolve(0); // No entries to migrate
        return;
      }

      try {
        const transaction = db.transaction([OLD_STORE_NAME], 'readonly');
        const store = transaction.objectStore(OLD_STORE_NAME);

        const countRequest = store.count();

        countRequest.onsuccess = () => {
          db.close();
          resolve(countRequest.result);
        };

        countRequest.onerror = () => {
          db.close();
          // Migration: Failed to count old entries
          resolve(0); // Assume no entries on error
        };

        transaction.onerror = () => {
          db.close();
          // Migration: Transaction error
          resolve(0); // Assume no entries on error
        };
      } catch (error) {
        db.close();
        // Migration: Error creating transaction
        resolve(0); // Assume no entries on error
      }
    };

    request.onerror = () => {
      // Migration: Failed to open old database
      resolve(0); // Assume no entries on error
    };

    request.onupgradeneeded = () => {
      // Database doesn't exist yet, will be created
      request.result.close();
      resolve(0);
    };
  });
}

/**
 * Perform migration from old system to new CAS system
 *
 * @param onProgress - Optional progress callback
 * @returns Migration result with statistics
 */
export async function migrateFromOldSystem(
  onProgress?: MigrationProgressCallback
): Promise<MigrationResult> {
  const startTime = Date.now();

  // Initialize new database
  await assetDB.init();

  // Read all entries from old database
  const oldEntries = await readOldDatabase(onProgress);

  if (oldEntries.length === 0) {
    return {
      success: true,
      totalMigrated: 0,
      duplicatesSkipped: 0,
      errors: 0,
      totalSize: 0,
      duration: Date.now() - startTime
    };
  }

  // Migrate each entry
  let totalMigrated = 0;
  let duplicatesSkipped = 0;
  let errors = 0;
  let totalSize = 0;

  for (let i = 0; i < oldEntries.length; i++) {
    const entry = oldEntries[i];

    if (onProgress) {
      onProgress({
        phase: 'hashing',
        current: i + 1,
        total: oldEntries.length,
        imageId: entry.id
      });
    }

    try {
      // Hash the data URL
      const hashResult = await hashDataURL(entry.data);

      // Check if already exists in new database
      const existing = await assetDB.getAsset(hashResult.hash);
      if (existing) {
        duplicatesSkipped++;
        continue;
      }

      // Parse data URL to get blob
      const match = entry.data.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        errors++;
        continue;
      }

      const mimeType = match[1];
      const base64Data = match[2];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);

      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }

      const blob = new Blob([bytes], { type: mimeType });

      if (onProgress) {
        onProgress({
          phase: 'storing',
          current: i + 1,
          total: oldEntries.length,
          imageId: entry.id
        });
      }

      // Store in new database
      await assetDB.putAsset(hashResult, blob, mimeType, 'migration');

      totalMigrated++;
      totalSize += blob.size;

    } catch (error) {
      logger.error(`Failed to migrate ${entry.id}:`, error);
      errors++;
    }
  }

  // Clean up old database
  if (onProgress) {
    onProgress({
      phase: 'cleanup',
      current: 0,
      total: 1
    });
  }

  // Optionally delete old database
  // await deleteOldDatabase();

  return {
    success: errors === 0,
    totalMigrated,
    duplicatesSkipped,
    errors,
    totalSize,
    duration: Date.now() - startTime
  };
}

/**
 * Read all entries from old database
 */
async function readOldDatabase(
  onProgress?: MigrationProgressCallback
): Promise<OldIDBEntry[]> {
  return new Promise((resolve) => {
    const request = indexedDB.open(OLD_DB_NAME, OLD_DB_VERSION);

    request.onsuccess = () => {
      const db = request.result;

      // Check if the store exists
      if (!db.objectStoreNames.contains(OLD_STORE_NAME)) {
        // Migration: Old database exists but has different structure
        db.close();
        resolve([]); // No entries to migrate
        return;
      }

      try {
        const transaction = db.transaction([OLD_STORE_NAME], 'readonly');
        const store = transaction.objectStore(OLD_STORE_NAME);

        const getAllRequest = store.getAll();

        getAllRequest.onsuccess = () => {
          const entries: OldIDBEntry[] = getAllRequest.result;
          db.close();
          resolve(entries);
        };

        getAllRequest.onerror = () => {
          db.close();
          logger.warn('[Migration] Failed to read old entries:', getAllRequest.error);
          resolve([]); // Return empty array on error
        };

        transaction.onerror = () => {
          db.close();
          // Migration: Transaction error
          resolve([]); // Return empty array on error
        };
      } catch (error) {
        db.close();
        logger.warn('[Migration] Error reading old database:', error);
        resolve([]); // Return empty array on error
      }
    };

    request.onerror = () => {
      logger.warn('[Migration] Failed to open old database for reading:', request.error);
      resolve([]); // Return empty array on error
    };
  });
}

/**
 * Delete old database (call after successful migration)
 */
export async function deleteOldDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OLD_DB_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      logger.warn('Database deletion blocked. Close all tabs and try again.');
      reject(new Error('Database deletion blocked'));
    };
  });
}

/**
 * Get migration statistics without migrating
 */
export async function getMigrationStats(): Promise<{
  hasOldData: boolean;
  entryCount: number;
  estimatedSize: number;
}> {
  const hasOldData = await isMigrationNeeded();

  if (!hasOldData) {
    return {
      hasOldData: false,
      entryCount: 0,
      estimatedSize: 0
    };
  }

  const entries = await readOldDatabase();
  let totalSize = 0;

  for (const entry of entries) {
    // Base64 is ~33% larger than actual size
    totalSize += Math.round(entry.data.length * 0.75);
  }

  return {
    hasOldData: true,
    entryCount: entries.length,
    estimatedSize: totalSize
  };
}

/**
 * Automatic migration on app startup
 *
 * Checks if migration is needed and performs it automatically.
 * Should be called during app initialization.
 */
export async function autoMigrate(
  onProgress?: MigrationProgressCallback
): Promise<MigrationResult | null> {
  const needsMigration = await isMigrationNeeded();

  if (!needsMigration) {
    return null;
  }

  const result = await migrateFromOldSystem(onProgress);

  if (result.success) {
    logger.log(
      `[Asset Migration] Completed: ${result.totalMigrated} migrated, ` +
      `${result.duplicatesSkipped} duplicates skipped, ` +
      `${result.errors} errors, ` +
      `${(result.totalSize / 1024 / 1024).toFixed(2)}MB migrated in ${result.duration}ms`
    );

    // Optionally delete old database after successful migration
    // Uncomment when confident:
    // await deleteOldDatabase();
  } else {
    logger.error('[Asset Migration] Failed with errors:', result.errors);
  }

  return result;
}

/**
 * Rollback migration (delete new database, keep old one)
 * Use this if something goes wrong.
 */
export async function rollbackMigration(): Promise<void> {
  // Delete new database
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('NexusGameTable_Assets');

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  logger.log('[Asset Migration] Rolled back. Old database is preserved.');
}
