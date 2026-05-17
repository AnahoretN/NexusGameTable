/**
 * Image cache utility for P2P synchronization
 * Extracts base64 images from state and replaces them with reference IDs
 * to avoid re-sending large image data on every update
 */

import { logger } from './logger';

export interface ImageCache {
  [imageId: string]: string; // imageId -> base64 data
}

export interface StateWithImageCache {
  state: any;
  imageCache: ImageCache;
}

// Prefix to identify image references
const IMAGE_REF_PREFIX = 'img_ref://';

/**
 * Check if a string is a base64 data URL
 */
export function isBase64DataURL(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith('data:image/');
}

/**
 * Generate a unique image ID
 */
export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an image reference string
 */
export function createImageRef(imageId: string): string {
  return `${IMAGE_REF_PREFIX}${imageId}`;
}

/**
 * Check if a string is an image reference
 */
export function isImageRef(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith(IMAGE_REF_PREFIX);
}

/**
 * Extract image ID from reference
 */
export function getImageIdFromRef(ref: string): string {
  return ref.replace(IMAGE_REF_PREFIX, '');
}

/**
 * Recursively extract base64 images from an object and build cache
 * Returns the object with base64 strings replaced by references
 */
export function extractImagesToCache(obj: any, cache: ImageCache = {}, existingCache: ImageCache = {}, existingCacheMap?: Map<string, string>): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Build reverse lookup map for O(1) search (only once per extraction)
  if (!existingCacheMap && Object.keys(existingCache).length > 0) {
    existingCacheMap = new Map(
      Object.entries(existingCache).map(([id, data]) => [data, id])
    );
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => extractImagesToCache(item, cache, existingCache, existingCacheMap));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip metadata and IDs
    if (key === 'id' || key === 'deckId' || key === 'ownerId' || key === 'archetypeId' || key === 'parentId') {
      result[key] = value;
      continue;
    }

    // Handle nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = extractImagesToCache(value, cache, existingCache, existingCacheMap);
    }
    // Check for base64 data URLs in ANY string field (not just specific keys)
    else if (typeof value === 'string') {
      if (isBase64DataURL(value)) {
        // Check if we already have this image cached (O(1) lookup with Map)
        const existingId = existingCacheMap?.get(value);

        if (existingId) {
          // Use existing cache entry
          result[key] = createImageRef(existingId);
          cache[existingId] = value;
        } else {
          // Create new cache entry
          const imageId = generateImageId();
          result[key] = createImageRef(imageId);
          cache[imageId] = value;
        }
      } else if (isImageRef(value)) {
        // Keep img_ref:// URLs as-is - they'll be loaded during restore
        result[key] = value;
      } else {
        result[key] = value;
      }
    }
    // Check spriteConfig for images (special handling - needs to preserve structure)
    else if (key === 'spriteConfig' && value && typeof value === 'object') {
      result[key] = extractImagesToCache(value, cache, existingCache, existingCacheMap);
    }
    // Check alternativeBack object (special handling - needs to preserve structure)
    else if (key === 'alternativeBack' && value && typeof value === 'object') {
      result[key] = extractImagesToCache(value, cache, existingCache, existingCacheMap);
    }
    // Keep other values as-is
    else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Restore base64 images from cache references
 */
export function restoreImagesFromCache(obj: any, cache: ImageCache): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => restoreImagesFromCache(item, cache));
  }

  const result: any = {};
  let restoredCount = 0;

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      result[key] = restoreImagesFromCache(value, cache);
    } else if (typeof value === 'string' && isImageRef(value)) {
      const imageId = getImageIdFromRef(value);
      if (cache[imageId]) {
        result[key] = cache[imageId];
        restoredCount++;
      } else {
        // Silently skip missing images - don't spam console
        result[key] = value; // Fallback to original if not in cache
      }
    } else {
      result[key] = value;
    }
  }

  // Remove verbose logging for better performance
  return result;
}

/**
 * Extract images from state and return state with references + image cache
 */
export function extractImagesFromState(state: any, existingCache: ImageCache = {}): StateWithImageCache {
  const cache: ImageCache = { ...existingCache };

  // Build reverse lookup map for O(1) search
  const existingCacheMap = Object.keys(existingCache).length > 0
    ? new Map(Object.entries(existingCache).map(([id, data]) => [data, id]))
    : undefined;

  // Process objects (but skip main menu - each player has their own)
  const processedObjects: Record<string, any> = {};
  Object.entries(state.objects || {}).forEach(([id, obj]) => {
    // Skip main menu panel - it's recreated locally for each player
    if ((obj as any).type === 'PANEL' && (obj as any).panelType === 'MAIN_MENU') {
      return;
    }
    processedObjects[id] = extractImagesToCache(obj, cache, existingCache, existingCacheMap);
  });


  // Debug: check DECK objects specifically
  const decks = Object.values(processedObjects).filter((obj: any) => obj.type === 'DECK');
  if (decks.length > 0) {
    // Debug info removed
  }

  // Filter out viewTransform, playerPanelSettings, and internal fields from sync
  // viewTransform: pixelsPerVU is screen-specific
  // playerPanelSettings: synced separately via PLAYER_PANEL_SETTINGS message
  // _*: internal fields (not persisted)
  const { viewTransform, playerPanelSettings, _lastPanelSettingsUpdate, _pendingPanelSettings, ...stateWithoutViewTransform } = state;

  return {
    state: { ...stateWithoutViewTransform, objects: processedObjects },
    imageCache: cache
  };
}

/**
 * Restore images to state from cache
 */
export function restoreImagesToState(state: any, imageCache: ImageCache): any {
  const restoredObjects: any = {};
  Object.entries(state.objects || {}).forEach(([id, obj]) => {
    restoredObjects[id] = restoreImagesFromCache(obj, imageCache);
  });

  return { ...state, objects: restoredObjects };
}

/**
 * Get only new images (not in existing cache)
 */
export function getNewImages(currentCache: ImageCache, existingCache: ImageCache): ImageCache {
  const newImages: ImageCache = {};
  for (const [id, data] of Object.entries(currentCache)) {
    if (!existingCache[id]) {
      newImages[id] = data;
    }
  }
  return newImages;
}

// ============================================================
// INDEXEDDB PERSISTENT STORAGE (for page reload recovery)
// ============================================================

const IDB_DB_NAME = 'NexusGameTable_Images';
const IDB_DB_VERSION = 1;
const IDB_STORE_NAME = 'cachedImages';

interface IDBImageEntry {
  id: string;
  data: string; // base64 data URL
  timestamp: number;
}

let idbDatabase: IDBDatabase | null = null;

/**
 * Initialize IndexedDB for persistent image storage
 */
async function initIDB(): Promise<IDBDatabase> {
  if (idbDatabase) return idbDatabase;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    request.onsuccess = () => {
      idbDatabase = request.result;
      resolve(idbDatabase);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        const store = db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Save image cache to IndexedDB for persistence
 */
export async function saveImageCacheToIDB(cache: ImageCache): Promise<void> {
  try {
    const db = await initIDB();
    const transaction = db.transaction([IDB_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(IDB_STORE_NAME);

    // Save each image to IndexedDB
    const promises = Object.entries(cache).map(([id, data]) => {
      return new Promise<void>((resolve, reject) => {
        const entry: IDBImageEntry = {
          id,
          data,
          timestamp: Date.now()
        };

        const request = store.put(entry);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
  } catch (error) {
  }
}

/**
 * Save single image to IndexedDB (call when user uploads an image)
 */
export async function saveSingleImageToIDB(imageId: string, dataUrl: string): Promise<void> {
  try {
    const db = await initIDB();
    const transaction = db.transaction([IDB_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(IDB_STORE_NAME);

    const entry: IDBImageEntry = {
      id: imageId,
      data: dataUrl,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(entry);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
  }
}

/**
 * Load image cache from IndexedDB
 */
export async function loadImageCacheFromIDB(): Promise<ImageCache> {
  try {
    const db = await initIDB();
    const transaction = db.transaction([IDB_STORE_NAME], 'readonly');
    const store = transaction.objectStore(IDB_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const entries: IDBImageEntry[] = request.result;
        const cache: ImageCache = {};

        entries.forEach(entry => {
          cache[entry.id] = entry.data;
        });

        resolve(cache);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return {};
  }
}

/**
 * Get specific image from IndexedDB
 */
export async function getImageFromIDB(imageId: string): Promise<string | null> {
  try {
    const db = await initIDB();
    const transaction = db.transaction([IDB_STORE_NAME], 'readonly');
    const store = transaction.objectStore(IDB_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(imageId);

      request.onsuccess = () => {
        const entry: IDBImageEntry = request.result;
        resolve(entry ? entry.data : null);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return null;
  }
}

/**
 * Clear all images from IndexedDB
 */
export async function clearImageCacheIDB(): Promise<void> {
  try {
    const db = await initIDB();
    const transaction = db.transaction([IDB_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(IDB_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
  }
}

/**
 * Clean old images from IndexedDB (older than specified days)
 */
export async function cleanOldImagesFromIDB(daysOld: number = 30): Promise<number> {
  try {
    const db = await initIDB();
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);

    const transaction = db.transaction([IDB_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(IDB_STORE_NAME);
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return 0;
  }
}

/**
 * Get IndexedDB cache size info
 */
export async function getIDBCacheInfo(): Promise<{ count: number; totalSize: number }> {
  try {
    const db = await initIDB();
    const transaction = db.transaction([IDB_STORE_NAME], 'readonly');
    const store = transaction.objectStore(IDB_STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const entries: IDBImageEntry[] = request.result;
        const totalSize = entries.reduce((sum, entry) => sum + entry.data.length, 0);
        resolve({ count: entries.length, totalSize });
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    return { count: 0, totalSize: 0 };
  }
}

// ============================================================
// MEMORY-MANAGED IMAGE CACHE (with size limits and LRU eviction)
// ============================================================

const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB default limit
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface ManagedCacheEntry {
  data: string;
  size: number;
  lastAccess: number;
  createdAt: number;
}

interface ManagedImageCache {
  [imageId: string]: ManagedCacheEntry;
}

let managedCache: ManagedImageCache = {};
let currentCacheSize = 0;

/**
 * Get the current size of the managed cache in bytes
 */
export function getManagedCacheSize(): number {
  return currentCacheSize;
}

/**
 * Get the current managed cache
 */
export function getManagedCache(): ManagedImageCache {
  return managedCache;
}

/**
 * Add an image to the managed cache with automatic size management
 */
export function addToManagedCache(imageId: string, data: string): void {
  const dataSize = data.length;

  // Check if this image is already in cache
  if (managedCache[imageId]) {
    // Update last access time
    managedCache[imageId].lastAccess = Date.now();
    return;
  }

  // If adding this image would exceed the cache size, evict old entries
  const newSize = currentCacheSize + dataSize;
  if (newSize > MAX_CACHE_SIZE_BYTES) {
    evictLRUEntries(newSize - MAX_CACHE_SIZE_BYTES);
  }

  // Add the new entry
  managedCache[imageId] = {
    data,
    size: dataSize,
    lastAccess: Date.now(),
    createdAt: Date.now()
  };

  currentCacheSize += dataSize;
}

/**
 * Get an image from the managed cache (updates last access time)
 */
export function getFromManagedCache(imageId: string): string | null {
  const entry = managedCache[imageId];
  if (entry) {
    entry.lastAccess = Date.now();
    return entry.data;
  }
  return null;
}

/**
 * Remove an image from the managed cache
 */
export function removeFromManagedCache(imageId: string): boolean {
  const entry = managedCache[imageId];
  if (entry) {
    currentCacheSize -= entry.size;
    delete managedCache[imageId];
    return true;
  }
  return false;
}

/**
 * Clear the entire managed cache
 */
export function clearManagedCache(): void {
  managedCache = {};
  currentCacheSize = 0;
}

/**
 * Evict least recently used entries to free up space
 */
function evictLRUEntries(bytesToFree: number): void {
  // Sort entries by last access time (oldest first)
  const entries = Object.entries(managedCache)
    .sort(([, a], [, b]) => a.lastAccess - b.lastAccess);

  let freedBytes = 0;

  for (const [imageId, entry] of entries) {
    if (freedBytes >= bytesToFree) break;

    // Remove this entry
    currentCacheSize -= entry.size;
    delete managedCache[imageId];
    freedBytes += entry.size;

  }

}

/**
 * Clean old entries from the managed cache
 */
export function cleanOldManagedCacheEntries(maxAgeMs: number = MAX_CACHE_AGE_MS): number {
  const now = Date.now();
  const entriesToRemove: string[] = [];
  let totalSizeFreed = 0;

  for (const [imageId, entry] of Object.entries(managedCache)) {
    if (now - entry.createdAt > maxAgeMs) {
      entriesToRemove.push(imageId);
      totalSizeFreed += entry.size;
    }
  }

  for (const imageId of entriesToRemove) {
    removeFromManagedCache(imageId);
  }

  if (entriesToRemove.length > 0) {
  }

  return entriesToRemove.length;
}

/**
 * Get managed cache statistics
 */
export function getManagedCacheStats(): {
  count: number;
  totalSize: number;
  totalSizeMB: string;
  oldestEntry: number;
  newestEntry: number;
  avgEntrySize: number;
} {
  const entries = Object.values(managedCache);
  const now = Date.now();

  if (entries.length === 0) {
    return {
      count: 0,
      totalSize: 0,
      totalSizeMB: '0.00',
      oldestEntry: 0,
      newestEntry: 0,
      avgEntrySize: 0
    };
  }

  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  const oldestEntry = Math.min(...entries.map(e => now - e.createdAt));
  const newestEntry = Math.max(...entries.map(e => now - e.createdAt));
  const avgEntrySize = totalSize / entries.length;

  return {
    count: entries.length,
    totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    oldestEntry,
    newestEntry,
    avgEntrySize
  };
}

/**
 * Start automatic cache cleanup (runs every 5 minutes)
 */
export function startManagedCacheCleanup(intervalMs: number = 5 * 60 * 1000): () => void {
  const interval = setInterval(() => {
    // Clean old entries if cache is getting full
    if (currentCacheSize > MAX_CACHE_SIZE_BYTES * 0.8) {
      cleanOldManagedCacheEntries(MAX_CACHE_AGE_MS / 2); // Clean entries older than 15 days
    }
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(interval);
}

/**
 * Convert managed cache to regular ImageCache format
 */
export function managedCacheToImageCache(): ImageCache {
  const cache: ImageCache = {};
  for (const [imageId, entry] of Object.entries(managedCache)) {
    cache[imageId] = entry.data;
  }
  return cache;
}

/**
 * Initialize managed cache from regular ImageCache
 */
export function initManagedCacheFromImageCache(cache: ImageCache): void {
  for (const [imageId, data] of Object.entries(cache)) {
    addToManagedCache(imageId, data);
  }
}
