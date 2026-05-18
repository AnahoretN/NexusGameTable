/**
 * Progressive Image Loader
 * Loads images progressively by priority, handles chunking and reassembly
 *
 * This fixes the race condition by:
 * 1. Guest receives manifest FIRST
 * 2. Guest requests images by priority
 * 3. Host sends images in chunks
 * 4. Guest assembles chunks and updates cache
 */

import { ImageManifestPayload, ImageInfo, ImageChunkPayload } from '../protocol/messages';
import { ImageLoadState } from '../types';
import { addToManagedCache, getFromManagedCache } from '../../../utils/imageCache';
import { logger } from '../../../utils/logger';

// ============================================================================
// IMAGE LOAD STATUS
// ============================================================================

export interface ImageLoadStatus {
  id: string;
  state: ImageLoadState;
  progress: number;        // 0-1 for chunk progress
  priority: number;
  retries: number;
  size: number;
  receivedBytes: number;
}

// ============================================================================
// PROGRESSIVE IMAGE LOADER
// ============================================================================

export class ProgressiveImageLoader {
  private manifest: ImageManifestPayload | null = null;
  private loadedImages: Map<string, string> = new Map(); // id -> base64
  private loadStatus: Map<string, ImageLoadStatus> = new Map();
  private receivedChunks: Map<string, Map<number, string>> = new Map(); // imageId -> chunkIndex -> data
  private requestedImages: Set<string> = new Set();

  // Configuration
  private readonly maxRetries = 3;
  private readonly concurrentDownloads = 3;
  private activeDownloads = 0;

  // Callbacks
  private onImageLoadedCallbacks: Map<string, (imageId: string, data: string) => void> = new Map();
  private onAllImagesLoadedCallback?: () => void;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Set the image manifest (guest side, called after receiving from host)
   */
  setManifest(manifest: ImageManifestPayload): void {
    this.manifest = manifest;

    // Initialize load status for all images
    for (const [id, info] of Object.entries(manifest.images)) {
      // Check if already in managed cache
      const cached = getFromManagedCache(id);
      if (cached) {
        this.loadedImages.set(id, cached);
        this.loadStatus.set(id, {
          id,
          state: ImageLoadState.LOADED,
          progress: 1,
          priority: info.priority,
          retries: 0,
          size: info.size,
          receivedBytes: info.size,
        });
      } else {
        this.loadStatus.set(id, {
          id,
          state: ImageLoadState.PENDING,
          progress: 0,
          priority: info.priority,
          retries: 0,
          size: info.size,
          receivedBytes: 0,
        });
      }
    }

    logger.log(`[ImageLoader] Manifest set with ${Object.keys(manifest.images).length} images`);
  }

  // ============================================================================
  // IMAGE REQUESTING
  // ============================================================================

  /**
   * Get next batch of images to request by priority
   */
  getNextBatch(limit: number = 5, minPriority: number = 0): string[] {
    if (!this.manifest) return [];

    const pending = Object.values(this.manifest.images)
      .filter(img => {
        const status = this.loadStatus.get(img.id);
        return status &&
          status.state === ImageLoadState.PENDING &&
          img.priority >= minPriority &&
          !this.requestedImages.has(img.id);
      })
      .sort((a, b) => b.priority - a.priority || b.size - a.size)
      .slice(0, limit)
      .map(img => img.id);

    // Mark as requested
    pending.forEach(id => {
      this.requestedImages.add(id);
      const status = this.loadStatus.get(id);
      if (status) {
        status.state = ImageLoadState.REQUESTED;
      }
    });

    return pending;
  }

  /**
   * Get images by specific priority level
   */
  getImagesByPriority(priority: number, limit: number = 5): string[] {
    if (!this.manifest) return [];

    return Object.values(this.manifest.images)
      .filter(img => {
        const status = this.loadStatus.get(img.id);
        return img.priority === priority &&
          status?.state === ImageLoadState.PENDING &&
          !this.requestedImages.has(img.id);
      })
      .sort((a, b) => b.size - a.size)
      .slice(0, limit)
      .map(img => img.id);
  }

  // ============================================================================
  // CHUNK HANDLING
  // ============================================================================

  /**
   * Receive image chunk (called when IMAGE_CHUNK message received)
   */
  receiveChunk(chunk: ImageChunkPayload): boolean {
    const { imageId, chunkIndex, totalChunks, data } = chunk;

    // Get or create chunk map for this image
    if (!this.receivedChunks.has(imageId)) {
      this.receivedChunks.set(imageId, new Map());
    }

    const chunks = this.receivedChunks.get(imageId)!;
    chunks.set(chunkIndex, data);

    // Update status
    const status = this.loadStatus.get(imageId);
    if (status) {
      status.state = ImageLoadState.LOADING;
      status.receivedBytes += data.length;
      status.progress = chunks.size / totalChunks;
    }

    // Check if all chunks received
    if (chunks.size === totalChunks) {
      return this.assembleImage(imageId);
    }

    return false;
  }

  /**
   * Assemble received chunks into complete image
   */
  private assembleImage(imageId: string): boolean {
    const chunks = this.receivedChunks.get(imageId);
    if (!chunks) return false;

    // Sort chunks by index and concatenate
    const sortedChunks = Array.from(chunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, data]) => data);

    const fullData = sortedChunks.join('');

    // Store in loaded images
    this.loadedImages.set(imageId, fullData);

    // Add to managed cache
    addToManagedCache(imageId, fullData);

    // Update status
    const status = this.loadStatus.get(imageId);
    if (status) {
      status.state = ImageLoadState.LOADED;
      status.progress = 1;
      status.receivedBytes = status.size;
    }

    // Clean up chunks
    this.receivedChunks.delete(imageId);
    this.requestedImages.delete(imageId);

    logger.log(`[ImageLoader] Assembled image: ${imageId}`);

    // Trigger callback
    const callback = this.onImageLoadedCallbacks.get(imageId);
    if (callback) {
      callback(imageId, fullData);
    }

    // Check if all images loaded
    this.checkAllLoaded();

    return true;
  }

  /**
   * Mark image as failed
   */
  markFailed(imageId: string, reason?: string): void {
    const status = this.loadStatus.get(imageId);
    if (!status) return;

    status.retries++;

    if (status.retries >= this.maxRetries) {
      status.state = ImageLoadState.FAILED;
      this.requestedImages.delete(imageId);
      logger.error(`[ImageLoader] Image failed after ${status.retries} retries: ${imageId}`);
    } else {
      // Allow retry
      status.state = ImageLoadState.PENDING;
      this.requestedImages.delete(imageId);
      logger.warn(`[ImageLoader] Image failed, retrying (${status.retries}/${this.maxRetries}): ${imageId}`);
    }
  }

  // ============================================================================
  // STATUS QUERIES
  // ============================================================================

  /**
   * Check if image is loaded
   */
  isLoaded(imageId: string): boolean {
    return this.loadedImages.has(imageId);
  }

  /**
   * Get loaded image data
   */
  getImageData(imageId: string): string | null {
    return this.loadedImages.get(imageId) || null;
  }

  /**
   * Get load status for an image
   */
  getStatus(imageId: string): ImageLoadStatus | null {
    return this.loadStatus.get(imageId) || null;
  }

  /**
   * Get overall progress
   */
  getProgress(): { loaded: number; total: number; percent: number } {
    if (!this.manifest) {
      return { loaded: 0, total: 0, percent: 0 };
    }

    const total = Object.keys(this.manifest.images).length;
    const loaded = Array.from(this.loadStatus.values())
      .filter(s => s.state === ImageLoadState.LOADED).length;

    return {
      loaded,
      total,
      percent: total > 0 ? (loaded / total) * 100 : 0,
    };
  }

  /**
   * Check if all images are loaded
   */
  isComplete(): boolean {
    if (!this.manifest) return false;

    return Array.from(this.loadStatus.values())
      .every(s => s.state === ImageLoadState.LOADED || s.state === ImageLoadState.FAILED);
  }

  // ============================================================================
  // CALLBACKS
  // ============================================================================

  /**
   * Register callback for when an image is loaded
   */
  onImageLoaded(imageId: string, callback: (imageId: string, data: string) => void): void {
    this.onImageLoadedCallbacks.set(imageId, callback);

    // If already loaded, call immediately
    if (this.loadedImages.has(imageId)) {
      callback(imageId, this.loadedImages.get(imageId)!);
    }
  }

  /**
   * Register callback for when all images are loaded
   */
  onAllImagesLoaded(callback: () => void): void {
    this.onAllImagesLoadedCallback = callback;

    if (this.isComplete()) {
      callback();
    }
  }

  /**
   * Check if all images loaded and trigger callback
   */
  private checkAllLoaded(): void {
    if (this.isComplete() && this.onAllImagesLoadedCallback) {
      this.onAllImagesLoadedCallback();
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Reset the loader
   */
  reset(): void {
    this.manifest = null;
    this.loadedImages.clear();
    this.loadStatus.clear();
    this.receivedChunks.clear();
    this.requestedImages.clear();
    this.onImageLoadedCallbacks.clear();
    this.onAllImagesLoadedCallback = undefined;
  }

  /**
   * Get all loaded images as a map
   */
  getLoadedImages(): Map<string, string> {
    return new Map(this.loadedImages);
  }
}

// ============================================================================
// IMAGE CHUNKING (Host side)
// ============================================================================

/**
 * Split image data into chunks
 */
export function chunkImageData(base64Data: string, chunkSize: number = 64 * 1024): ImageChunkPayload[] {
  const chunks: ImageChunkPayload[] = [];
  const imageId = `temp_${Date.now()}`; // Will be replaced with actual ID
  const totalChunks = Math.ceil(base64Data.length / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, base64Data.length);
    const data = base64Data.substring(start, end);

    chunks.push({
      imageId,
      chunkIndex: i,
      totalChunks,
      data,
    });
  }

  return chunks;
}

/**
 * Create chunks for an image from manifest
 */
export function createImageChunks(
  imageId: string,
  base64Data: string,
  chunkSize: number = 64 * 1024
): ImageChunkPayload[] {
  const chunks: ImageChunkPayload[] = [];
  const totalChunks = Math.ceil(base64Data.length / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, base64Data.length);
    const data = base64Data.substring(start, end);

    chunks.push({
      imageId,
      chunkIndex: i,
      totalChunks,
      data,
    });
  }

  return chunks;
}
