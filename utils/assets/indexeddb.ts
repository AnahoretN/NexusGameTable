/**
 * Content-Addressable Storage - IndexedDB Module
 *
 * Provides persistent storage for assets using SHA-256 hashes as primary keys.
 * Implements Content-Addressable Storage (CAS) pattern for automatic deduplication.
 */

import { HASH_PREFIX, type HashResult } from './hashing';

// ============================================================================
// CONSTANTS
// ============================================================================

export const DB_NAME = 'NexusGameTable_Assets';
export const DB_VERSION = 1;
export const STORE_ASSETS = 'assets';
export const STORE_METADATA = 'metadata';

// Maximum storage before triggering cleanup (500MB)
const MAX_STORAGE_BYTES = 500 * 1024 * 1024;
// Maximum age for unused assets (30 days)
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface AssetEntry {
  hash: string;           // SHA-256 hash (with prefix)
  blob: Blob;            // Binary data
  mimeType: string;      // image/png, image/jpeg, etc.
  size: number;          // Size in bytes
  createdAt: number;     // Timestamp of creation
  lastAccess: number;    // Timestamp of last access
  source?: 'local' | 'pack' | 'url' | 'migration';
}

export interface AssetInfo {
  hash: string;
  size: number;
  mimeType: string;
  createdAt: number;
  lastAccess: number;
}

export interface AssetManifest {
  version: number;
  timestamp: number;
  assets: AssetInfo[];
  totalSize: number;
  totalCount: number;
}

export interface StorageStats {
  totalCount: number;
  totalSize: number;
  totalSizeMB: string;
  oldestAccess: number;
  newestAccess: number;
  bySource: Record<string, number>;
}

// Metadata key-value pairs
export type MetadataKey = 'lastCleanup' | 'totalStored' | 'schemaVersion';
export const METADATA_KEYS = {
  LAST_CLEANUP: 'lastCleanup',
  TOTAL_STORED: 'totalStored',
  SCHEMA_VERSION: 'schemaVersion'
} as const;

interface MetadataEntry {
  key: string;
  value: any;
}

// ============================================================================
// ASSET DATABASE CLASS
// ============================================================================

class AssetDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize the database
   */
  async init(): Promise<IDBDatabase> {
    // If database is closed, reset and reinitialize
    if (this.db && this.db.readyState === 'closed') {
      console.warn('[AssetDB] Database was closed, reinitializing...');
      this.db = null;
      this.initPromise = null;
    }

    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create assets store (hash as primary key)
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          const assetStore = db.createObjectStore(STORE_ASSETS, { keyPath: 'hash' });
          assetStore.createIndex('lastAccess', 'lastAccess', { unique: false });
          assetStore.createIndex('createdAt', 'createdAt', { unique: false });
          assetStore.createIndex('size', 'size', { unique: false });
          assetStore.createIndex('source', 'source', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(STORE_METADATA)) {
          db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Safely create a transaction with retry on database closed error
   */
  private async createTransaction(
    mode: IDBTransactionMode,
    storeNames: string[] = [STORE_ASSETS]
  ): Promise<IDBTransaction> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const db = await this.init();

        // Check if database is closing or closed
        if (!db || db.readyState === 'closed') {
          throw new Error('Database is closed');
        }

        return db.transaction(storeNames, mode);
      } catch (error) {
        attempts++;
        console.warn(`[AssetDB] Transaction attempt ${attempts} failed:`, error);

        if (attempts >= maxAttempts) {
          throw error;
        }

        // Reset connection and retry
        this.db = null;
        this.initPromise = null;

        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    throw new Error('Failed to create transaction after retries');
  }

  /**
   * Store an asset in the database
   *
   * @param hashResult - Hash result from hashing module
   * @param blob - Binary data
   * @param mimeType - MIME type
   * @param source - Where the asset came from
   * @returns true if asset was stored, false if it already existed
   */
  async putAsset(
    hashResult: HashResult,
    blob: Blob,
    mimeType: string,
    source: AssetEntry['source'] = 'local'
  ): Promise<boolean> {
    // Check if asset already exists
    const existing = await this.getAsset(hashResult.hash);
    if (existing) {
      // Update last access time
      await this.updateAccessTime(hashResult.hash);
      return false;
    }

    const entry: AssetEntry = {
      hash: hashResult.hash,
      blob,
      mimeType,
      size: blob.size,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      source
    };

    const transaction = await this.createTransaction('readwrite');
    const store = transaction.objectStore(STORE_ASSETS);
    const request = store.put(entry);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get an asset by hash
   *
   * @param hash - Asset hash (with or without prefix)
   * @returns Asset entry or null if not found
   */
  async getAsset(hash: string): Promise<AssetEntry | null> {
    const normalizedHash = hash.startsWith(HASH_PREFIX) ? hash : `${HASH_PREFIX}${hash}`;

    const transaction = await this.createTransaction('readonly');
    const store = transaction.objectStore(STORE_ASSETS);
    const request = store.get(normalizedHash);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result: AssetEntry | undefined = request.result;
        if (result) {
          // Update last access time asynchronously
          this.updateAccessTime(normalizedHash).catch(() => {});
        }
        resolve(result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get just the Blob data for an asset
   *
   * @param hash - Asset hash
   * @returns Blob or null if not found
   */
  async getBlob(hash: string): Promise<Blob | null> {
    const entry = await this.getAsset(hash);
    return entry?.blob || null;
  }

  /**
   * Check if an asset exists
   *
   * @param hash - Asset hash
   * @returns true if asset exists
   */
  async hasAsset(hash: string): Promise<boolean> {
    const entry = await this.getAsset(hash);
    return entry !== null;
  }

  /**
   * Update last access time for an asset
   */
  private async updateAccessTime(hash: string): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ASSETS], 'readwrite');
      const store = transaction.objectStore(STORE_ASSETS);

      store.get(hash).onsuccess = (event) => {
        const entry = (event.target as IDBRequest).result as AssetEntry | undefined;
        if (entry) {
          entry.lastAccess = Date.now();
          store.put(entry);
        }
        resolve();
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Delete an asset
   *
   * @param hash - Asset hash to delete
   * @returns true if deleted, false if not found
   */
  async deleteAsset(hash: string): Promise<boolean> {
    const db = await this.init();
    const normalizedHash = hash.startsWith(HASH_PREFIX) ? hash : `${HASH_PREFIX}${hash}`;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ASSETS], 'readwrite');
      const store = transaction.objectStore(STORE_ASSETS);
      const request = store.delete(normalizedHash);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get manifest of all assets
   *
   * @returns AssetManifest with all asset info
   */
  async getManifest(): Promise<AssetManifest> {
    const db = await this.init();
    const assets: AssetInfo[] = [];
    let totalSize = 0;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ASSETS], 'readonly');
      const store = transaction.objectStore(STORE_ASSETS);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry: AssetEntry = cursor.value;
          assets.push({
            hash: entry.hash,
            size: entry.size,
            mimeType: entry.mimeType,
            createdAt: entry.createdAt,
            lastAccess: entry.lastAccess
          });
          totalSize += entry.size;
          cursor.continue();
        } else {
          resolve({
            version: 1,
            timestamp: Date.now(),
            assets,
            totalSize,
            totalCount: assets.length
          });
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    const manifest = await this.getManifest();
    const now = Date.now();

    const bySource: Record<string, number> = {};
    let oldestAccess = Infinity;
    let newestAccess = 0;

    for (const asset of manifest.assets) {
      // Count by source
      const source = 'unknown'; // We'd need to fetch full entries to get source
      bySource[source] = (bySource[source] || 0) + 1;

      // Track access times
      const age = now - asset.lastAccess;
      if (age < oldestAccess) oldestAccess = age;
      if (age > newestAccess) newestAccess = age;
    }

    return {
      totalCount: manifest.totalCount,
      totalSize: manifest.totalSize,
      totalSizeMB: (manifest.totalSize / 1024 / 1024).toFixed(2),
      oldestAccess: oldestAccess === Infinity ? 0 : oldestAccess,
      newestAccess,
      bySource
    };
  }

  /**
   * Clean up old or excess assets
   *
   * @param options - Cleanup options
   * @returns Number of assets deleted
   */
  async cleanup(options?: {
    maxAge?: number;      // Max age in ms (default: MAX_AGE_MS)
    maxSize?: number;     // Max total size in bytes (default: MAX_STORAGE_BYTES)
    targetSize?: number;  // Target size after cleanup
  }): Promise<number> {
    const {
      maxAge = MAX_AGE_MS,
      maxSize = MAX_STORAGE_BYTES,
      targetSize = maxSize * 0.8
    } = options || {};

    const db = await this.init();
    const manifest = await this.getManifest();
    const now = Date.now();

    // If under limits, no cleanup needed
    if (manifest.totalSize < maxSize) {
      return 0;
    }

    // Sort by last access (oldest first)
    const sorted = [...manifest.assets].sort((a, b) => a.lastAccess - b.lastAccess);

    let deletedCount = 0;
    let currentSize = manifest.totalSize;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ASSETS], 'readwrite');
      const store = transaction.objectStore(STORE_ASSETS);

      const deleteNext = (index: number) => {
        if (index >= sorted.length) {
          resolve(deletedCount);
          return;
        }

        const asset = sorted[index];
        const age = now - asset.lastAccess;

        // Delete if:
        // 1. Still over target size, OR
        // 2. Older than max age
        if (currentSize > targetSize || age > maxAge) {
          const request = store.delete(asset.hash);
          request.onsuccess = () => {
            currentSize -= asset.size;
            deletedCount++;
            deleteNext(index + 1);
          };
          request.onerror = () => reject(request.error);
        } else {
          // Reached target, stop deleting
          resolve(deletedCount);
        }
      };

      deleteNext(0);
    });
  }

  /**
   * Clear all assets
   */
  async clear(): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ASSETS], 'readwrite');
      const store = transaction.objectStore(STORE_ASSETS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ========================================================================
  // METADATA METHODS
  // ========================================================================

  /**
   * Get metadata value
   */
  async getMetadata(key: string): Promise<any> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_METADATA], 'readonly');
      const store = transaction.objectStore(STORE_METADATA);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry: MetadataEntry | undefined = request.result;
        resolve(entry?.value);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Set metadata value
   */
  async setMetadata(key: string, value: any): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_METADATA], 'readwrite');
      const store = transaction.objectStore(STORE_METADATA);
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete metadata key
   */
  async deleteMetadata(key: string): Promise<void> {
    const db = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_METADATA], 'readwrite');
      const store = transaction.objectStore(STORE_METADATA);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const assetDB = new AssetDatabase();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Initialize the asset database (call on app startup)
 */
export async function initAssetDB(): Promise<IDBDatabase> {
  return assetDB.init();
}

/**
 * Store an asset from Blob
 */
export async function storeAsset(
  blob: Blob,
  mimeType: string,
  source: AssetEntry['source'] = 'local'
): Promise<string> {
  const { hashAsset } = await import('./hashing');
  const hashResult = await hashAsset(blob);
  await assetDB.putAsset({ hash: hashResult.hash, value: hashResult.value, algorithm: hashResult.algorithm }, blob, mimeType, source);
  return hashResult.hash;
}

/**
 * Store an asset from data URL (base64)
 */
export async function storeAssetFromDataURL(
  dataURL: string,
  source: AssetEntry['source'] = 'local'
): Promise<string> {
  const { hashDataURL } = await import('./hashing');
  const hashResult = await hashDataURL(dataURL);

  // Convert data URL to Blob
  const match = dataURL.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }

  const mimeType = match[1];
  const base64Data = match[2];
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });

  await assetDB.putAsset(hashResult, blob, mimeType, source);
  return hashResult.hash;
}

/**
 * Get asset as data URL
 */
export async function getAssetAsDataURL(hash: string): Promise<string | null> {
  const entry = await assetDB.getAsset(hash);
  if (!entry) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(entry.blob);
  });
}

/**
 * Batch store assets
 */
export async function storeAssetsBatch(
  items: Array<{ blob: Blob; mimeType: string; source?: AssetEntry['source'] }>
): Promise<string[]> {
  const hashes: string[] = [];

  for (const item of items) {
    const hash = await storeAsset(item.blob, item.mimeType, item.source);
    hashes.push(hash);
  }

  return hashes;
}

/**
 * Find which hashes are missing from the database
 */
export async function findMissingHashes(hashes: string[]): Promise<string[]> {
  const missing: string[] = [];

  for (const hash of hashes) {
    const exists = await assetDB.hasAsset(hash);
    if (!exists) {
      missing.push(hash);
    }
  }

  return missing;
}
