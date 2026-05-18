/**
 * Optimized P2P State Synchronization
 *
 * Key optimizations:
 * 1. Incremental image extraction - only scan changed objects
 * 2. Object-level caching - avoid re-scanning unchanged objects
 * 3. Lazy extraction - only extract when actually sending
 * 4. Batched updates - combine rapid changes into single sync
 */

import { logger } from '../../utils/logger';
import { ImageCache, extractImagesToCache, isBase64DataURL, isImageRef, createImageRef, generateImageId } from '../../utils/imageCache';

// ============================================================================
// CACHING LAYER
// ============================================================================

interface CachedObjectData {
  objectWithRefs: any;
  imageCache: ImageCache;
  hash: string;
  timestamp: number;
}

/**
 * Simple hash function for detecting object changes
 */
function hashObject(obj: any): string {
  if (!obj) return '';
  // Quick hash using JSON.stringify on key properties
  const str = JSON.stringify({
    id: obj.id,
    content: obj.content?.substring(0, 100), // First 100 chars for content
    frontFaceUrl: obj.frontFaceUrl,
    backFaceUrl: obj.backFaceUrl,
    url: obj.url,
    avatarUrl: obj.avatarUrl,
    x: obj.x,
    y: obj.y,
    rotation: obj.rotation,
    width: obj.width,
    height: obj.height,
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Cache for extracted object data
 */
class ObjectExtractionCache {
  private cache = new Map<string, CachedObjectData>();
  private maxAge = 60000; // 60 seconds
  private maxSize = 100;

  get(objectId: string, obj: any): CachedObjectData | null {
    const entry = this.cache.get(objectId);
    if (!entry) return null;

    // Check if cache is still valid
    const now = Date.now();
    if (now - entry.timestamp > this.maxAge) {
      this.cache.delete(objectId);
      return null;
    }

    // Check if object has changed
    const currentHash = hashObject(obj);
    if (currentHash !== entry.hash) {
      this.cache.delete(objectId);
      return null;
    }

    return entry;
  }

  set(objectId: string, obj: any, objectWithRefs: any, imageCache: ImageCache): void {
    // Evict old entries if cache is too large
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(objectId, {
      objectWithRefs,
      imageCache,
      hash: hashObject(obj),
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean old entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

export const objectExtractionCache = new ObjectExtractionCache();

// ============================================================================
// INCREMENTAL EXTRACTION
// ============================================================================

interface IncrementalExtractionResult {
  stateWithRefs: any;
  imageCache: ImageCache;
  extractedCount: number;
  cachedCount: number;
}

/**
 * Extract images from only the changed objects
 * This is MUCH faster than scanning the entire state
 */
export function extractImagesIncremental(
  state: any,
  existingCache: ImageCache = {},
  changedObjectIds?: Set<string>
): IncrementalExtractionResult {
  const startTime = performance.now();

  // If no changed IDs provided, check all objects (fallback to full scan)
  const objectsToProcess = changedObjectIds
    ? Array.from(changedObjectIds).filter(id => state.objects?.[id])
    : Object.keys(state.objects || {});

  let extractedCount = 0;
  let cachedCount = 0;

  // Result containers
  const processedObjects: Record<string, any> = {};
  const mergedImageCache: ImageCache = { ...existingCache };

  // Process each object
  for (const objectId of objectsToProcess) {
    const obj = state.objects?.[objectId];
    if (!obj) continue;

    // Check cache first
    const cached = objectExtractionCache.get(objectId, obj);
    if (cached) {
      processedObjects[objectId] = cached.objectWithRefs;
      // Merge image cache
      Object.assign(mergedImageCache, cached.imageCache);
      cachedCount++;
      continue;
    }

    // Not in cache, extract images
    const tempCache: ImageCache = {};
    const extracted = extractImagesToCache(obj, tempCache, existingCache);

    processedObjects[objectId] = extracted;
    Object.assign(mergedImageCache, tempCache);

    // Store in cache
    objectExtractionCache.set(objectId, obj, extracted, tempCache);
    extractedCount++;
  }

  // For unchanged objects, copy from original state
  if (changedObjectIds) {
    for (const [id, obj] of Object.entries(state.objects || {})) {
      if (!changedObjectIds.has(id) && obj.type !== 'PANEL') {
        processedObjects[id] = obj;
      }
    }
  }

  // Build final state
  const { viewTransform, playerPanelSettings, ...stateWithoutView } = state;
  const stateWithRefs = {
    ...stateWithoutView,
    objects: processedObjects,
  };

  const elapsed = performance.now() - startTime;
  if (elapsed > 10) {
    logger.log(`[P2P OPT] Incremental extraction: ${extractedCount} new, ${cachedCount} cached, ${elapsed.toFixed(1)}ms`);
  }

  return {
    stateWithRefs,
    imageCache: mergedImageCache,
    extractedCount,
    cachedCount,
  };
}

// ============================================================================
// FAST BOARD CONTENT EXTRACTION
// ============================================================================

/**
 * Quick check if board content needs extraction
 * This avoids full state scan when only positions changed
 */
export function needsBoardContentExtraction(state: any): boolean {
  for (const obj of Object.values(state.objects || {})) {
    if (obj?.type === 'BOARD' && obj?.content) {
      // Check if content is base64 (needs extraction) or img_ref (already extracted)
      if (isBase64DataURL(obj.content)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extract ONLY board content (the most expensive operation)
 * Use this when only positions changed but board still has base64
 * Returns both stateWithRefs and updated imageCache
 */
export function extractBoardContentOnly(state: any, existingCache: ImageCache = {}): { state: any; imageCache: ImageCache } {
  const processedObjects: Record<string, any> = {};
  const imageCache: ImageCache = { ...existingCache };
  let boardExtracted = false;

  for (const [id, obj] of Object.entries(state.objects || {})) {
    if (obj?.type === 'BOARD' && obj?.content && isBase64DataURL(obj.content)) {
      // Extract board content
      const tempCache: ImageCache = {};
      processedObjects[id] = extractImagesToCache(obj, tempCache, existingCache);
      Object.assign(imageCache, tempCache);
      boardExtracted = true;

      logger.log(`[P2P OPT] Board content extracted: ${obj.name || id} (${Math.round(obj.content.length/1024)}KB)`);
    } else {
      // Keep other objects as-is
      processedObjects[id] = obj;
    }
  }

  if (boardExtracted) {
    const { viewTransform, playerPanelSettings, ...stateWithoutView } = state;
    return {
      state: {
        ...stateWithoutView,
        objects: processedObjects,
      },
      imageCache,
    };
  }

  return { state, imageCache };
}

// ============================================================================
// BATCHED CHANGE TRACKING
// ============================================================================

interface PendingChange {
  objectId: string;
  timestamp: number;
}

/**
 * Track changes for batched extraction
 */
export class ChangeTracker {
  private pendingChanges = new Map<string, PendingChange>();
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private batchDelay = 50; // 50ms batching window

  /**
   * Mark an object as changed
   */
  markChanged(objectId: string): void {
    this.pendingChanges.set(objectId, {
      objectId,
      timestamp: Date.now(),
    });

    // Reset batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.flush();
    }, this.batchDelay);
  }

  /**
   * Get changed object IDs and clear pending
   */
  getChangedIds(): Set<string> {
    const ids = new Set(this.pendingChanges.keys());
    return ids;
  }

  /**
   * Clear all pending changes
   */
  clear(): void {
    this.pendingChanges.clear();
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  /**
   * Flush changes (for immediate sync)
   */
  private flush(): void {
    // Changes will be picked up by next sync
  }

  /**
   * Check if we have pending changes
   */
  hasPendingChanges(): boolean {
    return this.pendingChanges.size > 0;
  }

  /**
   * Get count of pending changes
   */
  getChangeCount(): number {
    return this.pendingChanges.size;
  }
}

export const p2pChangeTracker = new ChangeTracker();

// ============================================================================
// LAZY EXTRACTION
// ============================================================================

/**
 * Lazy state wrapper - only extract when actually sending
 */
export class LazyStateExtractor {
  private state: any;
  private existingCache: ImageCache;
  private changedIds: Set<string> | null;

  constructor(state: any, existingCache: ImageCache = {}, changedIds?: Set<string>) {
    this.state = state;
    this.existingCache = existingCache;
    this.changedIds = changedIds || null;
  }

  /**
   * Actually perform the extraction
   */
  extract(): IncrementalExtractionResult {
    return extractImagesIncremental(this.state, this.existingCache, this.changedIds);
  }
}

/**
 * Create a lazy extractor for delayed processing
 */
export function createLazyExtractor(
  state: any,
  existingCache: ImageCache = {},
  changedIds?: Set<string>
): LazyStateExtractor {
  return new LazyStateExtractor(state, existingCache, changedIds);
}

// ============================================================================
// MAINTENANCE
// ============================================================================

/**
 * Clean up old cache entries periodically
 */
export function startExtractionCacheCleanup(intervalMs: number = 30000): () => void {
  const interval = setInterval(() => {
    objectExtractionCache.cleanup();
  }, intervalMs);

  return () => clearInterval(interval);
}
