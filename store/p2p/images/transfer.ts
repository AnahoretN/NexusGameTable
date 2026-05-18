/**
 * Image Transfer Manager
 * Manages image transfer between host and guest
 *
 * Host: Sends manifest, chunks images on request
 * Guest: Receives manifest, requests images by priority
 */

import { ImageManifestPayload, ImageChunkPayload, ImageRequestPayload } from '../protocol/messages';
import { ProgressiveImageLoader, createImageChunks } from './loader';
import { ImageManifestBuilder } from './manifest';
import { DataChannelLike } from '../types';
import { MessageFactory, MessageType } from '../protocol/messages';
import { GameState } from '../../gameState';
import { logger } from '../../../utils/logger';
import { getFromManagedCache } from '../../../utils/imageCache';

// ============================================================================
// HOST SIDE: Image Transfer Manager
// ============================================================================

export class HostImageTransferManager {
  private manifest: ImageManifestPayload | null = null;
  private guestRequests: Map<string, Set<string>> = new Map(); // guestId -> requested image IDs
  private activeTransfers: Map<string, Set<string>> = new Map(); // guestId -> transferring image IDs

  /**
   * Initialize image transfer with game state
   */
  initialize(state: GameState): ImageManifestPayload {
    const builder = new ImageManifestBuilder();
    this.manifest = builder.buildManifest(state);

    // Update manifest with actual image data from managed cache
    for (const [imageId, info] of Object.entries(this.manifest.images)) {
      const imageData = getFromManagedCache(imageId);
      if (imageData) {
        info.size = imageData.length;
        info.chunkCount = Math.ceil(imageData.length / (64 * 1024));
      }
    }

    logger.log(`[HostImageTransfer] Initialized with ${Object.keys(this.manifest.images).length} images`);
    return this.manifest;
  }

  /**
   * Send manifest to guest
   */
  sendManifest(guestId: string, connection: DataChannelLike): void {
    if (!this.manifest) {
      logger.warn('[HostImageTransfer] No manifest to send');
      return;
    }

    const message = MessageFactory.createImageManifest(this.manifest);
    connection.send(JSON.stringify(message));
    logger.log(`[HostImageTransfer] Sent manifest to guest ${guestId}`);
  }

  /**
   * Handle image request from guest
   */
  handleImageRequest(guestId: string, request: ImageRequestPayload, connection: DataChannelLike): void {
    const { imageIds, priority } = request;

    logger.log(`[HostImageTransfer] Guest ${guestId} requested ${imageIds.length} images`);

    // Track request
    if (!this.guestRequests.has(guestId)) {
      this.guestRequests.set(guestId, new Set());
    }
    imageIds.forEach(id => this.guestRequests.get(guestId)!.add(id));

    // Send images
    this.sendImages(guestId, imageIds, connection);
  }

  /**
   * Send images to guest
   */
  private sendImages(guestId: string, imageIds: string[], connection: DataChannelLike): void {
    if (!this.activeTransfers.has(guestId)) {
      this.activeTransfers.set(guestId, new Set());
    }
    const activeTransfer = this.activeTransfers.get(guestId)!;

    for (const imageId of imageIds) {
      if (activeTransfer.has(imageId)) {
        continue; // Already transferring
      }

      activeTransfer.add(imageId);
      this.sendImageChunks(guestId, imageId, connection);
    }
  }

  /**
   * Send image in chunks
   */
  private sendImageChunks(guestId: string, imageId: string, connection: DataChannelLike): void {
    const imageData = getFromManagedCache(imageId);

    if (!imageData) {
      logger.warn(`[HostImageTransfer] Image not found in cache: ${imageId}`);
      const activeTransfer = this.activeTransfers.get(guestId);
      if (activeTransfer) {
        activeTransfer.delete(imageId);
      }
      return;
    }

    const chunks = createImageChunks(imageId, imageData);
    logger.log(`[HostImageTransfer] Sending ${chunks.length} chunks for image ${imageId}`);

    // Send chunks with small delay between each to avoid overwhelming the connection
    let chunkIndex = 0;
    const sendNext = () => {
      if (chunkIndex >= chunks.length) {
        // Done
        const activeTransfer = this.activeTransfers.get(guestId);
        if (activeTransfer) {
          activeTransfer.delete(imageId);
        }
        logger.log(`[HostImageTransfer] Finished sending image ${imageId}`);
        return;
      }

      const chunk = chunks[chunkIndex];
      const message = MessageFactory.createImageChunk(chunk);

      try {
        connection.send(JSON.stringify(message));
        chunkIndex++;

        // Send next chunk immediately (rely on browser's buffering)
        // Or add small delay for rate limiting
        if (chunkIndex < chunks.length) {
          setTimeout(sendNext, 5); // 5ms delay between chunks
        } else {
          sendNext(); // Last chunk
        }
      } catch (error) {
        logger.error(`[HostImageTransfer] Error sending chunk ${chunkIndex} of ${imageId}:`, error);
        const activeTransfer = this.activeTransfers.get(guestId);
        if (activeTransfer) {
          activeTransfer.delete(imageId);
        }
      }
    };

    sendNext();
  }

  /**
   * Handle image ACK from guest
   */
  handleImageAck(guestId: string, imageId: string, chunkIndex: number): void {
    // Could use this for flow control, but currently we send all chunks
    // and rely on TCP's built-in flow control
  }

  /**
   * Clean up when guest disconnects
   */
  guestDisconnected(guestId: string): void {
    this.guestRequests.delete(guestId);
    this.activeTransfers.delete(guestId);
    logger.log(`[HostImageTransfer] Cleaned up guest ${guestId}`);
  }
}

// ============================================================================
// GUEST SIDE: Image Transfer Manager
// ============================================================================

export class GuestImageTransferManager {
  private loader: ProgressiveImageLoader;
  private hostConnection: DataChannelLike | null = null;
  private requestQueue: string[] = [];
  private isRequesting = false;
  private requestTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loader = new ProgressiveImageLoader();
  }

  /**
   * Set host connection
   */
  setConnection(connection: DataChannelLike): void {
    this.hostConnection = connection;
  }

  /**
   * Handle received manifest
   */
  handleManifest(manifest: ImageManifestPayload): void {
    this.loader.setManifest(manifest);
    logger.log(`[GuestImageTransfer] Received manifest with ${Object.keys(manifest.images).length} images`);

    // Start requesting images
    this.startRequesting();
  }

  /**
   * Handle received image chunk
   */
  handleChunk(chunk: ImageChunkPayload): boolean {
    return this.loader.receiveChunk(chunk);
  }

  /**
   * Start automatic image requesting
   */
  private startRequesting(): void {
    if (this.requestTimer) {
      clearInterval(this.requestTimer);
    }

    // Request images periodically
    this.requestTimer = setInterval(() => {
      this.requestNextBatch();
    }, 100); // Check every 100ms

    // Initial request
    this.requestNextBatch();
  }

  /**
   * Request next batch of images
   */
  private requestNextBatch(): void {
    if (!this.hostConnection || this.isRequesting) {
      return;
    }

    // Check if all loaded
    if (this.loader.isComplete()) {
      if (this.requestTimer) {
        clearInterval(this.requestTimer);
        this.requestTimer = null;
      }
      logger.log('[GuestImageTransfer] All images loaded!');
      return;
    }

    // Get next batch by priority
    const batch = this.loader.getNextBatch(5);

    if (batch.length === 0) {
      return;
    }

    this.isRequesting = true;

    const message = MessageFactory.createImageRequest({
      imageIds: batch,
    });

    try {
      this.hostConnection.send(JSON.stringify(message));
      logger.log(`[GuestImageTransfer] Requested ${batch.length} images`);
    } catch (error) {
      logger.error('[GuestImageTransfer] Error sending image request:', error);
    } finally {
      // Allow next request after a short delay
      setTimeout(() => {
        this.isRequesting = false;
      }, 50);
    }
  }

  /**
   * Get image loader for status queries
   */
  getLoader(): ProgressiveImageLoader {
    return this.loader;
  }

  /**
   * Check if image is loaded
   */
  isLoaded(imageId: string): boolean {
    return this.loader.isLoaded(imageId);
  }

  /**
   * Get image data
   */
  getImageData(imageId: string): string | null {
    return this.loader.getImageData(imageId);
  }

  /**
   * Get load progress
   */
  getProgress(): { loaded: number; total: number; percent: number } {
    return this.loader.getProgress();
  }

  /**
   * Register callback for when image is loaded
   */
  onImageLoaded(imageId: string, callback: (imageId: string, data: string) => void): void {
    this.loader.onImageLoaded(imageId, callback);
  }

  /**
   * Register callback for when all images are loaded
   */
  onAllImagesLoaded(callback: () => void): void {
    this.loader.onAllImagesLoaded(callback);
  }

  /**
   * Clean up
   */
  cleanup(): void {
    if (this.requestTimer) {
      clearInterval(this.requestTimer);
      this.requestTimer = null;
    }
    this.loader.reset();
    this.hostConnection = null;
  }
}

// ============================================================================
// SHARED: Image Transfer Utilities
// ============================================================================

/**
 * Calculate optimal chunk size based on image size
 */
export function calculateChunkSize(imageSize: number): number {
  const CHUNK_SIZE = 64 * 1024; // 64KB base

  if (imageSize < 100 * 1024) {
    // Small image: smaller chunks for faster delivery
    return 32 * 1024;
  } else if (imageSize < 500 * 1024) {
    // Medium image: standard chunks
    return CHUNK_SIZE;
  } else {
    // Large image: larger chunks for efficiency
    return 128 * 1024;
  }
}

/**
 * Estimate transfer time for an image
 */
export function estimateTransferTime(imageSize: number, bandwidthKbps = 1000): number {
  // Assume 80% efficiency due to overhead
  const effectiveBandwidth = bandwidthKbps * 1000 * 0.8 / 8; // bytes per second
  return imageSize / effectiveBandwidth * 1000; // milliseconds
}
