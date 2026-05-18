/**
 * Optimized Image Storage using Blobs instead of Base64
 *
 * Benefits:
 * - ~33% less memory (no base64 encoding overhead)
 * - Zero-copy transfers where possible
 * - Better compression support
 * - Shared memory between tabs
 */

import { logger } from './logger';

// ============================================================================
// BLOB STORAGE
// ============================================================================

interface BlobImageEntry {
  blob: Blob;
  url: string; // Object URL created via URL.createObjectURL
  size: number;
  lastAccess: number;
  mimeType: string;
}

class BlobImageCache {
  private cache = new Map<string, BlobImageEntry>();
  private maxSize = 200 * 1024 * 1024; // 200MB
  private currentSize = 0;

  /**
   * Store image as Blob instead of base64
   */
  async storeImage(imageId: string, base64Data: string): Promise<string> {
    // Convert base64 to Blob
    const blob = await this.base64ToBlob(base64Data);
    const url = URL.createObjectURL(blob);

    // Evict if needed
    if (this.currentSize + blob.size > this.maxSize) {
      this.evictLRU(blob.size);
    }

    // Clean up old entry if exists
    const oldEntry = this.cache.get(imageId);
    if (oldEntry) {
      URL.revokeObjectURL(oldEntry.url);
      this.currentSize -= oldEntry.size;
    }

    // Store new entry
    this.cache.set(imageId, {
      blob,
      url,
      size: blob.size,
      lastAccess: Date.now(),
      mimeType: blob.type
    });

    this.currentSize += blob.size;

    return url;
  }

  /**
   * Get image URL for rendering
   */
  getImageUrl(imageId: string): string | null {
    const entry = this.cache.get(imageId);
    if (entry) {
      entry.lastAccess = Date.now();
      return entry.url;
    }
    return null;
  }

  /**
   * Get Blob for P2P transfer (more efficient than base64)
   */
  getImageBlob(imageId: string): Blob | null {
    const entry = this.cache.get(imageId);
    return entry ? entry.blob : null;
  }

  /**
   * Convert base64 to Blob
   */
  private async base64ToBlob(base64: string): Promise<Blob> {
    // Extract mime type and data
    const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data URL');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    // Convert to binary string
    const byteString = atob(base64Data);

    // Convert to ArrayBuffer
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }

    return new Blob([arrayBuffer], { type: mimeType });
  }

  /**
   * Convert Blob to base64 (for P2P compatibility)
   */
  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Evict least recently used entries
   */
  private evictLRU(neededSpace: number): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    let freedSpace = 0;
    for (const [id, entry] of entries) {
      if (freedSpace >= neededSpace) break;

      URL.revokeObjectURL(entry.url);
      this.currentSize -= entry.size;
      this.cache.delete(id);
      freedSpace += entry.size;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      entries: this.cache.size,
      totalSize: this.currentSize,
      totalSizeMB: (this.currentSize / 1024 / 1024).toFixed(2),
      avgSize: this.cache.size > 0 ? this.currentSize / this.cache.size : 0
    };
  }

  /**
   * Clear all cached images
   */
  clear(): void {
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.cache.clear();
    this.currentSize = 0;
  }
}

// Global instance
export const blobImageCache = new BlobImageCache();

// ============================================================================
// IMAGE COMPRESSION
// ============================================================================

/**
 * Compress image using Canvas API
 */
export async function compressImage(
  base64Data: string,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number; // 0.0 - 1.0
    format?: 'image/jpeg' | 'image/webp';
  } = {}
): Promise<string> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    format = 'image/webp'
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate dimensions (maintain aspect ratio)
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Compress using Canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to compressed base64
      const compressedDataUrl = canvas.toDataURL(format, quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = base64Data;
  });
}

/**
 * Batch compress multiple images
 */
export async function compressImages(
  images: Record<string, string>,
  options?: Parameters<typeof compressImage>[1]
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;

  for (const [id, base64] of Object.entries(images)) {
    try {
      const originalSize = base64.length;
      totalOriginalSize += originalSize;

      const compressed = await compressImage(base64, options);
      results[id] = compressed;

      totalCompressedSize += compressed.length;

      const savings = ((1 - compressed.length / originalSize) * 100).toFixed(1);
      logger.log(`[Compress] ${id}: ${Math.round(originalSize/1024)}KB → ${Math.round(compressed.length/1024)}KB (${savings}% saved)`);
    } catch (error) {
      logger.error(`[Compress] Failed to compress ${id}:`, error);
      results[id] = base64; // Use original on error
    }
  }

  const totalSavings = ((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(1);
  logger.log(`[Compress] Total: ${Math.round(totalOriginalSize/1024)}KB → ${Math.round(totalCompressedSize/1024)}KB (${totalSavings}% saved)`);

  return results;
}

// ============================================================================
// IMAGE DEDUPLICATION
// ============================================================================

/**
 * Calculate hash of image data for deduplication
 */
export async function calculateImageHash(base64Data: string): Promise<string> {
  // Use first 1000 characters as quick hash
  const sample = base64Data.substring(0, 1000);

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return hash.toString(36) + '-' + base64Data.length;
}

/**
 * Find duplicate images in cache
 */
export async function findDuplicates(images: Record<string, string>): Promise<Map<string, string[]>> {
  const hashMap = new Map<string, string[]>();

  for (const [id, data] of Object.entries(images)) {
    const hash = await calculateImageHash(data);
    if (!hashMap.has(hash)) {
      hashMap.set(hash, []);
    }
    hashMap.get(hash)!.push(id);
  }

  // Return only duplicates
  const duplicates = new Map<string, string[]>();
  for (const [hash, ids] of hashMap.entries()) {
    if (ids.length > 1) {
      duplicates.set(ids[0], ids.slice(1)); // First ID is canonical
    }
  }

  return duplicates;
}

// ============================================================================
// CHUNKED TRANSFER
// ============================================================================

/**
 * Split large image into chunks for transfer
 */
export function chunkImage(base64Data: string, chunkSize = 50 * 1024): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < base64Data.length; i += chunkSize) {
    chunks.push(base64Data.substring(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Reassemble chunks into image
 */
export function assembleImage(chunks: string[]): string {
  return chunks.join('');
}
