/**
 * Image Manifest System
 * Builds and manages image manifests for P2P transfer
 *
 * Key concept: Host sends manifest FIRST, guest requests what they need.
 * This fixes the race condition where SYNC_STATE arrives before IMAGE_CACHE.
 */

import { GameState } from '../../gameState';
import { ImageInfo, ImageManifestPayload } from '../protocol/messages';
import { isImageRef, getImageIdFromRef } from '../../../utils/imageCache';
import { logger } from '../../../utils/logger';

// ============================================================================
// IMAGE PRIORITY CALCULATION
// ============================================================================

export interface ImagePriorityConfig {
  cardImages: number;      // Priority for card faces/backs
  tokenImages: number;     // Priority for tokens
  boardImages: number;     // Priority for boards/backgrounds
  otherImages: number;     // Default priority
}

const DEFAULT_PRIORITY: ImagePriorityConfig = {
  cardImages: 10,          // Cards are most important
  tokenImages: 8,
  boardImages: 6,
  otherImages: 3,
};

// ============================================================================
// IMAGE MANIFEST BUILDER
// ============================================================================

export class ImageManifestBuilder {
  private config: ImagePriorityConfig;

  constructor(config?: Partial<ImagePriorityConfig>) {
    this.config = { ...DEFAULT_PRIORITY, ...config };
  }

  /**
   * Build image manifest from game state
   * Extracts all img_ref:// URLs and creates manifest entries
   */
  buildManifest(state: GameState): ImageManifestPayload {
    const images: Record<string, ImageInfo> = {};
    const seenHashes = new Set<string>();

    // Collect images from all objects
    for (const [objId, obj] of Object.entries(state.objects || {})) {
      this.collectImagesFromObject(obj, images, seenHashes);
    }

    logger.log(`[ImageManifest] Built manifest with ${Object.keys(images).length} images`);

    return {
      sessionId: state.sessionId || '',
      version: 1,
      images,
    };
  }

  /**
   * Recursively collect images from an object
   */
  private collectImagesFromObject(
    obj: any,
    images: Record<string, ImageInfo>,
    seenHashes: Set<string>
  ): void {
    if (!obj || typeof obj !== 'object') return;

    // Handle arrays
    if (Array.isArray(obj)) {
      obj.forEach(item => this.collectImagesFromObject(item, images, seenHashes));
      return;
    }

    // Check each field
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && isImageRef(value)) {
        const imageId = getImageIdFromRef(value);
        this.addImageToManifest(imageId, obj, images, seenHashes);
      } else if (typeof value === 'object' && value !== null) {
        this.collectImagesFromObject(value, images, seenHashes);
      }
    }
  }

  /**
   * Add image to manifest with calculated priority
   */
  private addImageToManifest(
    imageId: string,
    obj: any,
    images: Record<string, ImageInfo>,
    seenHashes: Set<string>
  ): void {
    // Skip if already in manifest
    if (images[imageId]) return;

    // Calculate priority based on object type
    const priority = this.calculatePriority(obj);

    // Create a simple hash (in production, use crypto.subtle.digest)
    const hash = this.simpleHash(imageId);

    // Estimate size (will be updated when actual data is loaded)
    const size = 0;

    images[imageId] = {
      id: imageId,
      hash,
      size,
      mimeType: 'image/png',
      priority,
      chunkCount: 0, // Will be calculated during transfer
    };
  }

  /**
   * Calculate image priority based on object type
   */
  private calculatePriority(obj: any): number {
    const objType = obj?.type;

    switch (objType) {
      case 'CARD':
        return this.config.cardImages;
      case 'TOKEN':
        return this.config.tokenImages;
      case 'PANEL':
        // Main menu and panels have lower priority
        return obj.panelType === 'MAIN_MENU' ? 1 : this.config.otherImages;
      case 'BOARD':
        return this.config.boardImages;
      default:
        return this.config.otherImages;
    }
  }

  /**
   * Simple hash function for image ID (not cryptographically secure)
   * In production, consider using crypto.subtle.digest('SHA-256', ...)
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Update image info with actual data
   */
  updateImageWithData(
    manifest: ImageManifestPayload,
    imageId: string,
    base64Data: string
  ): ImageManifestPayload {
    const image = manifest.images[imageId];
    if (!image) return manifest;

    // Update size and chunk count
    image.size = base64Data.length;
    image.chunkCount = Math.ceil(base64Data.length / 64 * 1024); // 64KB chunks

    return manifest;
  }
}

// ============================================================================
// IMAGE MANIFEST UTILITIES
// ============================================================================

/**
 * Get images by priority from manifest
 */
export function getImagesByPriority(
  manifest: ImageManifestPayload,
  priority: number
): ImageInfo[] {
  return Object.values(manifest.images)
    .filter(img => img.priority === priority)
    .sort((a, b) => b.size - a.size); // Larger images first within priority
}

/**
 * Get missing images (not yet loaded)
 */
export function getMissingImages(
  manifest: ImageManifestPayload,
  loadedImages: Set<string>
): ImageInfo[] {
  return Object.values(manifest.images)
    .filter(img => !loadedImages.has(img.id))
    .sort((a, b) => b.priority - a.priority); // Highest priority first
}

/**
 * Get total size of all images in manifest
 */
export function getManifestTotalSize(manifest: ImageManifestPayload): number {
  return Object.values(manifest.images)
    .reduce((sum, img) => sum + img.size, 0);
}

/**
 * Get images by priority range
 */
export function getImagesInPriorityRange(
  manifest: ImageManifestPayload,
  minPriority: number,
  maxPriority: number
): ImageInfo[] {
  return Object.values(manifest.images)
    .filter(img => img.priority >= minPriority && img.priority <= maxPriority)
    .sort((a, b) => b.priority - a.priority || b.size - a.size);
}

// ============================================================================
// MANIFEST DIFF
// ============================================================================

/**
 * Compare two manifests and return new/updated images
 */
export function compareManifests(
  oldManifest: ImageManifestPayload,
  newManifest: ImageManifestPayload
): ImageInfo[] {
  const updated: ImageInfo[] = [];

  for (const [id, newImage] of Object.entries(newManifest.images)) {
    const oldImage = oldManifest.images[id];

    if (!oldImage) {
      // New image
      updated.push(newImage);
    } else if (oldImage.hash !== newImage.hash) {
      // Image changed
      updated.push(newImage);
    }
  }

  return updated.sort((a, b) => b.priority - a.priority);
}
