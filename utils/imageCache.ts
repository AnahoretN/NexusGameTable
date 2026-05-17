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
  originalPaths?: Record<string, string>; // imageId -> original path/URL
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
 * Check if a string looks like a local file path
 * Matches patterns like:
 * - C:\Users\...\image.png (Windows absolute)
 * - /home/user/image.png (Unix absolute)
 * - ./image.png (relative)
 * - ../image.png (relative)
 * - file:///C:/Users/.../image.png (file:// URL)
 */
export function isLocalFilePath(str: unknown): boolean {
  if (typeof str !== 'string') return false;

  // Skip URLs that are already handled elsewhere
  if (str.startsWith('http://') || str.startsWith('https://') ||
      str.startsWith('data:image/') || str.startsWith('blob:') ||
      str.startsWith('img_ref://') || str.startsWith('pack://')) {
    return false;
  }

  // Check for file:// URLs
  if (str.startsWith('file://')) {
    return true;
  }

  // Check for Windows absolute paths (e.g., C:\Users\...)
  if (/^[A-Za-z]:\\/.test(str)) {
    return true;
  }

  // Check for Windows absolute paths with forward slashes (e.g., C:/Users/...)
  if (/^[A-Za-z]:\//.test(str)) {
    return true;
  }

  // Check for Unix absolute paths (e.g., /home/user/...)
  if (str.startsWith('/') && !str.startsWith('//')) {
    return true;
  }

  // Check for relative paths (e.g., ./image.png or ../image.png)
  if (str.startsWith('./') || str.startsWith('../')) {
    return true;
  }

  return false;
}

/**
 * Extract filename from a local file path
 */
export function extractFilenameFromPath(filePath: string): string {
  // Handle Windows paths
  const windowsMatch = filePath.match(/[^\\/:*?"<>|]+$/);
  if (windowsMatch) return windowsMatch[0];

  // Handle Unix paths
  const unixMatch = filePath.match(/[^/]+$/);
  if (unixMatch) return unixMatch[0];

  return filePath;
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
 * Also collects original paths/URLs for restoration
 */
export function extractImagesToCache(obj: any, cache: ImageCache = {}, existingCache: ImageCache = {}, existingCacheMap?: Map<string, string>, originalPathMap?: Map<string, string>): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Build reverse lookup map for O(1) search (only once per extraction)
  if (!existingCacheMap && Object.keys(existingCache).length > 0) {
    existingCacheMap = new Map(
      Object.entries(existingCache).map(([id, data]) => [data, id])
    );
  }

  // Initialize original path map if not provided
  if (!originalPathMap) {
    originalPathMap = new Map();
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => extractImagesToCache(item, cache, existingCache, existingCacheMap, originalPathMap));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip metadata and IDs
    if (key === 'id' || key === 'deckId' || key === 'ownerId' || key === 'archetypeId' || key === 'parentId') {
      result[key] = value;
      continue;
    }

    // Handle arrays (must check before objects since arrays are also objects in JS)
    if (Array.isArray(value)) {
      result[key] = value.map(item => extractImagesToCache(item, cache, existingCache, existingCacheMap, originalPathMap));
      continue;
    }

    // Handle nested objects
    if (value && typeof value === 'object') {
      result[key] = extractImagesToCache(value, cache, existingCache, existingCacheMap, originalPathMap);
    }
    // Check for base64 data URLs in ANY string field (not just specific keys)
    else if (typeof value === 'string') {
      if (isBase64DataURL(value)) {
        // Check if we already have this image cached (O(1) lookup with Map)
        const existingId = existingCacheMap?.get(value);

        if (existingId) {
          // Use existing cache entry
          const imgRefUrl = createImageRef(existingId);
          result[key] = imgRefUrl;
          cache[existingId] = value;
        } else {
          // Create new cache entry
          const imageId = generateImageId();
          const imgRefUrl = createImageRef(imageId);
          result[key] = imgRefUrl;
          cache[imageId] = value;
        }
      } else if (isImageRef(value)) {
        // Keep img_ref:// URLs as-is - they'll be loaded during restore
        result[key] = value;
      } else if (isLocalFilePath(value) || (value.startsWith('http://') || value.startsWith('https://'))) {
        // This is an original path (local file or URL) - save it and replace with img_ref
        // First check if we already have this path cached
        const existingId = originalPathMap.get(value);

        if (existingId) {
          result[key] = createImageRef(existingId);
        } else {
          // Create new cache entry with placeholder (will be loaded later)
          const imageId = generateImageId();
          const imgRefUrl = createImageRef(imageId);
          result[key] = imgRefUrl;
          // Store original path for this image ID
          originalPathMap.set(value, imageId);
          // Also store reverse mapping for later lookup
          if (!cache._originalPaths) {
            cache._originalPaths = {};
          }
          cache._originalPaths[imageId] = value;
        }
      } else {
        result[key] = value;
      }
    }
    // Check spriteConfig for images (special handling - needs to preserve structure)
    else if (key === 'spriteConfig' && value && typeof value === 'object') {
      result[key] = extractImagesToCache(value, cache, existingCache, existingCacheMap, originalPathMap);
    }
    // Check alternativeBack object (special handling - needs to preserve structure)
    else if (key === 'alternativeBack' && value && typeof value === 'object') {
      result[key] = extractImagesToCache(value, cache, existingCache, existingCacheMap, originalPathMap);
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
  let missingCount = 0;

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      result[key] = restoreImagesFromCache(value, cache);
    } else if (typeof value === 'string' && isImageRef(value)) {
      const imageId = getImageIdFromRef(value);
      if (cache[imageId]) {
        result[key] = cache[imageId];
        restoredCount++;
        // Log successful restoration
        if (restoredCount <= 5) { // Only log first 5 to avoid spam
          logger.log(`[RESTORE] Restored ${imageId} for field ${key}`);
        }
      } else {
        // Log missing images for debugging
        missingCount++;
        logger.log(`[RESTORE] MISSING: ${imageId} for field ${key} - not found in cache (${Object.keys(cache).length} items)`);
        result[key] = value; // Fallback to original if not in cache
      }
    } else {
      result[key] = value;
    }
  }

  if ((restoredCount > 0 || missingCount > 0) && (obj.id || obj.name)) {
    logger.log(`[RESTORE] Object ${obj.id || obj.name}: restored ${restoredCount}, missing ${missingCount}`);
  }

  return result;
}

/**
 * Extract images from state and return state with references + image cache + original paths
 */
export function extractImagesFromState(state: any, existingCache: ImageCache = {}): StateWithImageCache {
  const cache: ImageCache = { ...existingCache };
  const originalPathMap = new Map<string, string>(); // path -> imageId

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
    processedObjects[id] = extractImagesToCache(obj, cache, existingCache, existingCacheMap, originalPathMap);
  });

  // Extract original paths from cache
  const originalPaths: Record<string, string> = cache._originalPaths || {};
  delete cache._originalPaths; // Remove from cache before returning

  // Filter out viewTransform, playerPanelSettings, and internal fields from sync
  // viewTransform: pixelsPerVU is screen-specific
  // playerPanelSettings: synced separately via PLAYER_PANEL_SETTINGS message
  // _*: internal fields (not persisted)
  const { viewTransform, playerPanelSettings, _lastPanelSettingsUpdate, _pendingPanelSettings, ...stateWithoutViewTransform } = state;

  return {
    state: { ...stateWithoutViewTransform, objects: processedObjects },
    imageCache: cache,
    originalPaths
  };
}

/**
 * Restore images to state from cache
 */
export function restoreImagesToState(state: any, imageCache: ImageCache): any {
  if (!state || !state.objects) {
    logger.log('[RESTORE] No state or objects to restore');
    return state;
  }

  logger.log(`[RESTORE] Restoring images for ${Object.keys(state.objects).length} objects with ${Object.keys(imageCache).length} cached images`);

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
    logger.log(`[IDB] Saving image ${imageId} to IndexedDB (${dataUrl.length} bytes)`);

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
        logger.log(`[IDB] Successfully saved image ${imageId}`);
        resolve();
      };

      request.onerror = () => {
        logger.error(`[IDB] Failed to save image ${imageId}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    logger.error(`[IDB] Exception saving image ${imageId}:`, error);
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
 * Get image URL from reference (img_ref://...)
 * First tries managed cache, then falls back to IndexedDB
 * Returns the original URL if it's not an img_ref:// URL
 */
export async function getImageUrlFromRef(url: string): Promise<string> {
  // If not an img_ref URL, return as-is
  if (!isImageRef(url)) {
    return url;
  }

  // Extract image ID from ref
  const imageId = getImageIdFromRef(url);

  // Try managed cache first (faster)
  const cached = getFromManagedCache(imageId);
  if (cached) {
    return cached;
  }

  // Fall back to IndexedDB
  const fromIDB = await getImageFromIDB(imageId);
  if (fromIDB) {
    // Add to managed cache for next time
    addToManagedCache(imageId, fromIDB);
    return fromIDB;
  }

  // If all else fails, return original URL
  return url;
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

// ============================================================
// LOCAL FILE PATH RESTORATION
// ============================================================

interface LocalFileReference {
  path: string;
  filename: string;
  objectIds: string[]; // Objects that reference this file
  fields: string[]; // Fields in objects (e.g., 'content', 'frontFaceUrl')
}

/**
 * Find all local file paths in objects
 */
export function findLocalFilePaths(objects: Record<string, any>): Map<string, LocalFileReference> {
  const localFiles = new Map<string, LocalFileReference>();

  const imageFields = ['content', 'frontFaceUrl', 'backFaceUrl', 'url', 'avatarUrl'];

  // Debug: log all string values in objects
  let totalStringsChecked = 0;
  let localPathsFound = 0;

  for (const [objId, obj] of Object.entries(objects)) {
    if (!obj || typeof obj !== 'object') continue;

    for (const field of imageFields) {
      const value = obj[field];
      totalStringsChecked++;
      if (value && typeof value === 'string' && isLocalFilePath(value)) {
        localPathsFound++;
        const filename = extractFilenameFromPath(value);
        logger.log(`[LOCAL_FILES] Found local path in ${objId}.${field}: ${filename} (${value.substring(0, 50)}...)`);

        if (localFiles.has(value)) {
          const ref = localFiles.get(value)!;
          ref.objectIds.push(objId);
          if (!ref.fields.includes(field)) {
            ref.fields.push(field);
          }
        } else {
          localFiles.set(value, {
            path: value,
            filename,
            objectIds: [objId],
            fields: [field]
          });
        }
      }
    }

    // Check spriteConfig
    if (obj.spriteConfig) {
      const spriteUrl = obj.spriteConfig.spriteUrl;
      const cardBackUrl = obj.spriteConfig.cardBackUrl;

      if (spriteUrl && typeof spriteUrl === 'string' && isLocalFilePath(spriteUrl)) {
        const filename = extractFilenameFromPath(spriteUrl);
        if (localFiles.has(spriteUrl)) {
          const ref = localFiles.get(spriteUrl)!;
          if (!ref.objectIds.includes(objId)) ref.objectIds.push(objId);
          if (!ref.fields.includes('spriteConfig.spriteUrl')) ref.fields.push('spriteConfig.spriteUrl');
        } else {
          localFiles.set(spriteUrl, {
            path: spriteUrl,
            filename,
            objectIds: [objId],
            fields: ['spriteConfig.spriteUrl']
          });
        }
      }

      if (cardBackUrl && typeof cardBackUrl === 'string' && isLocalFilePath(cardBackUrl)) {
        const filename = extractFilenameFromPath(cardBackUrl);
        if (localFiles.has(cardBackUrl)) {
          const ref = localFiles.get(cardBackUrl)!;
          if (!ref.objectIds.includes(objId)) ref.objectIds.push(objId);
          if (!ref.fields.includes('spriteConfig.cardBackUrl')) ref.fields.push('spriteConfig.cardBackUrl');
        } else {
          localFiles.set(cardBackUrl, {
            path: cardBackUrl,
            filename,
            objectIds: [objId],
            fields: ['spriteConfig.cardBackUrl']
          });
        }
      }
    }

    // Check alternativeBack
    if (obj.alternativeBack?.url) {
      const altBackUrl = obj.alternativeBack.url;
      if (typeof altBackUrl === 'string' && isLocalFilePath(altBackUrl)) {
        const filename = extractFilenameFromPath(altBackUrl);
        if (localFiles.has(altBackUrl)) {
          const ref = localFiles.get(altBackUrl)!;
          if (!ref.objectIds.includes(objId)) ref.objectIds.push(objId);
          if (!ref.fields.includes('alternativeBack.url')) ref.fields.push('alternativeBack.url');
        } else {
          localFiles.set(altBackUrl, {
            path: altBackUrl,
            filename,
            objectIds: [objId],
            fields: ['alternativeBack.url']
          });
        }
      }
    }
  }

  // Debug logging
  logger.log(`[LOCAL_FILES] Searched ${totalStringsChecked} strings, found ${localPathsFound} local file paths`);

  return localFiles;
}

/**
 * Replace local file paths with base64 data URLs
 */
export function replaceLocalFilePathsWithBase64(
  objects: Record<string, any>,
  localFiles: Map<string, string> // Map of path -> base64 data URL
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [objId, obj] of Object.entries(objects)) {
    const processed = { ...obj };

    // Simple fields
    const imageFields = ['content', 'frontFaceUrl', 'backFaceUrl', 'url', 'avatarUrl'];
    for (const field of imageFields) {
      if (processed[field] && typeof processed[field] === 'string') {
        const base64 = localFiles.get(processed[field]);
        if (base64) {
          processed[field] = base64;
        }
      }
    }

    // spriteConfig
    if (processed.spriteConfig) {
      processed.spriteConfig = { ...processed.spriteConfig };
      if (processed.spriteConfig.spriteUrl && typeof processed.spriteConfig.spriteUrl === 'string') {
        const base64 = localFiles.get(processed.spriteConfig.spriteUrl);
        if (base64) {
          processed.spriteConfig.spriteUrl = base64;
        }
      }
      if (processed.spriteConfig.cardBackUrl && typeof processed.spriteConfig.cardBackUrl === 'string') {
        const base64 = localFiles.get(processed.spriteConfig.cardBackUrl);
        if (base64) {
          processed.spriteConfig.cardBackUrl = base64;
        }
      }
    }

    // alternativeBack
    if (processed.alternativeBack?.url) {
      processed.alternativeBack = { ...processed.alternativeBack };
      if (typeof processed.alternativeBack.url === 'string') {
        const base64 = localFiles.get(processed.alternativeBack.url);
        if (base64) {
          processed.alternativeBack.url = base64;
        }
      }
    }

    result[objId] = processed;
  }

  return result;
}

// ============================================================
// AUTO IMAGE LOADING FROM URLS
// ============================================================

/**
 * Load an image from URL and return it as base64 data URL
 */
export async function loadImageFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load image: ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`Failed to load image from ${url}: ${error}`);
  }
}

/**
 * Auto-load images from their original paths (URLs)
 * Returns a map of imageId -> base64 data URL
 */
export async function autoLoadImages(originalPaths: Record<string, string>): Promise<Record<string, string>> {
  const loadedImages: Record<string, string> = {};

  for (const [imageId, originalPath] of Object.entries(originalPaths)) {
    // Only auto-load from URLs (http/https)
    if (originalPath.startsWith('http://') || originalPath.startsWith('https://')) {
      try {
        logger.log(`[AUTO_LOAD] Loading image ${imageId} from URL: ${originalPath}`);
        const base64Url = await loadImageFromUrl(originalPath);
        loadedImages[imageId] = base64Url;
        logger.log(`[AUTO_LOAD] Successfully loaded ${imageId}`);
      } catch (error) {
        logger.error(`[AUTO_LOAD] Failed to load ${imageId} from ${originalPath}:`, error);
      }
    }
    // Local file paths cannot be auto-loaded due to browser security
    // They will need user interaction via dialog
  }

  return loadedImages;
}

// ============================================================
// FILE NAME METADATA (for local file restoration)
// ============================================================

/**
 * Get filename for an img_ref:// URL from the global registry
 */
export function getFileNameForImageRef(imgRefUrl: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const registry = (window as any).__nexusFileNames;
  if (!registry) return undefined;
  return registry.get(imgRefUrl);
}

/**
 * Set filename for an img_ref:// URL in the global registry
 */
export function setFileNameForImageRef(imgRefUrl: string, fileName: string): void {
  if (typeof window === 'undefined') return;
  if (!(window as any).__nexusFileNames) {
    (window as any).__nexusFileNames = new Map();
  }
  (window as any).__nexusFileNames.set(imgRefUrl, fileName);
}

/**
 * Get all filename mappings from the global registry
 */
export function getAllFileNameMappings(): Map<string, string> {
  if (typeof window === 'undefined') return new Map();
  const registry = (window as any).__nexusFileNames;
  if (!registry) return new Map();
  return new Map(registry);
}
