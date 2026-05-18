/**
 * Optimized P2P Image Transfer
 *
 * Optimizations:
 * 1. Deduplication - don't send same images twice
 * 2. Compression - WebP with reduced quality
 * 3. Chunking - stream large images
 * 4. Manifest - send list of images first, client requests only needed
 */

import { logger } from './logger';
import { compressImage, calculateImageHash } from './blobImageCache';

// ============================================================================
// IMAGE MANIFEST
// ============================================================================

export interface ImageManifestEntry {
  id: string;
  hash: string;
  size: number;
  compressedSize?: number;
  mimeType: string;
}

export interface ImageManifest {
  version: string;
  timestamp: number;
  images: ImageManifestEntry[];
  totalSize: number;
  totalCompressedSize?: number;
}

/**
 * Create manifest from images
 */
export async function createManifest(images: Record<string, string>): Promise<ImageManifest> {
  const entries: ImageManifestEntry[] = [];
  let totalSize = 0;

  for (const [id, data] of Object.entries(images)) {
    const hash = await calculateImageHash(data);
    const size = data.length;
    totalSize += size;

    // Extract mime type
    const mimeType = data.match(/^data:([^;]+);/)?.[1] || 'image/jpeg';

    entries.push({
      id,
      hash,
      size,
      mimeType
    });
  }

  return {
    version: '1.0',
    timestamp: Date.now(),
    images: entries,
    totalSize
  };
}

// ============================================================================
// IMAGE DEDUPLICATION
// ============================================================================

/**
 * Find which images guest needs (doesn't have yet)
 */
export function getMissingImages(
  guestManifest: ImageManifest | null,
  hostManifest: ImageManifest
): string[] {
  if (!guestManifest) {
    // Guest has no images, send all
    return hostManifest.images.map(img => img.id);
  }

  const guestImageIds = new Set(guestManifest.images.map(img => img.id));
  const guestImageHashes = new Map(
    guestManifest.images.map(img => [img.hash, img.id])
  );

  const missing: string[] = [];

  for (const hostImage of hostManifest.images) {
    // Check if guest has this image (by ID or hash)
    const hasById = guestImageIds.has(hostImage.id);
    const hasByHash = guestImageHashes.get(hostImage.hash);

    if (!hasById && !hasByHash) {
      missing.push(hostImage.id);
    }
  }

  return missing;
}

// ============================================================================
// COMPRESSION OPTIONS
// ============================================================================

export interface CompressionOptions {
  enabled: boolean;
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'image/jpeg' | 'image/webp';
}

export const DEFAULT_COMPRESSION: CompressionOptions = {
  enabled: true,
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.75,
  format: 'image/webp'
};

/**
 * Compress image for transfer
 */
export async function compressForTransfer(
  base64Data: string,
  options: CompressionOptions = DEFAULT_COMPRESSION
): Promise<string> {
  if (!options.enabled) {
    return base64Data;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { maxWidth, maxHeight, quality, format } = options;

      // Calculate dimensions
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Use canvas for compression
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Get compressed data URL
      const compressed = canvas.toDataURL(format, quality);
      resolve(compressed);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64Data;
  });
}

// ============================================================================
// PROGRESSIVE TRANSFER
// ============================================================================

export interface TransferProgress {
  total: number;
  transferred: number;
  percentage: number;
  currentImage?: string;
}

export type ProgressCallback = (progress: TransferProgress) => void;

/**
 * Transfer images with progress tracking and priority
 */
export async function transferImagesWithProgress(
  images: Record<string, string>,
  imageIds: string[],
  sendFn: (imageId: string, data: string) => Promise<void>,
  options?: {
    compress?: CompressionOptions;
    priority?: 'high' | 'low';
    onProgress?: ProgressCallback;
  }
): Promise<void> {
  const { compress, priority = 'low', onProgress } = options || {};

  // Sort by size (small images first for faster initial load)
  const sortedIds = [...imageIds].sort((a, b) => {
    const sizeA = images[a]?.length || 0;
    const sizeB = images[b]?.length || 0;
    return sizeA - sizeB;
  });

  let transferred = 0;
  const total = sortedIds.length;
  const totalSize = sortedIds.reduce((sum, id) => sum + (images[id]?.length || 0), 0);
  let transferredSize = 0;

  for (const imageId of sortedIds) {
    const base64 = images[imageId];
    if (!base64) continue;

    // Compress if enabled
    const dataToSend = compress
      ? await compressForTransfer(base64, compress)
      : base64;

    // Send image
    await sendFn(imageId, dataToSend);

    // Update progress
    transferred++;
    transferredSize += base64.length;

    if (onProgress) {
      onProgress({
        total: totalSize,
        transferred: transferredSize,
        percentage: (transferredSize / totalSize) * 100,
        currentImage: imageId
      });
    }

    // Small delay between images to avoid blocking
    if (priority === 'low' && transferred < sortedIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
}

// ============================================================================
// ADAPTIVE QUALITY
// ============================================================================

/**
 * Adjust compression quality based on network conditions
 */
export function getAdaptiveQuality(networkSpeed: 'slow' | 'fast' | 'unknown'): CompressionOptions {
  if (networkSpeed === 'slow') {
    return {
      ...DEFAULT_COMPRESSION,
      maxWidth: 1280,
      maxHeight: 720,
      quality: 0.6
    };
  }

  if (networkSpeed === 'fast') {
    return {
      ...DEFAULT_COMPRESSION,
      maxWidth: 2560,
      maxHeight: 1440,
      quality: 0.85
    };
  }

  return DEFAULT_COMPRESSION;
}

/**
 * Estimate network speed based on transfer time
 */
export function estimateNetworkSpeed(
  bytesTransferred: number,
  timeMs: number
): 'slow' | 'fast' | 'unknown' {
  const bytesPerSecond = (bytesTransferred / timeMs) * 1000;

  if (bytesPerSecond < 100 * 1024) {
    // Less than 100 KB/s
    return 'slow';
  }

  if (bytesPerSecond > 1024 * 1024) {
    // More than 1 MB/s
    return 'fast';
  }

  return 'unknown';
}
