/**
 * Optimized blob URL to base64 converter with queue management
 *
 * Performance benefits:
 * - Prevents blocking the main thread with multiple concurrent conversions
 * - Limits concurrent conversions to avoid overwhelming the browser
 * - Provides progress tracking for batch operations
 * - Reduces memory pressure during conversion
 */

import { logger } from './logger';

interface ConversionJob {
  blobUrl: string;
  resolve: (dataUrl: string) => void;
  reject: (error: Error) => void;
  priority: 'high' | 'normal' | 'low';
}

interface ConversionStats {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  queued: number;
}

/**
 * Optimized blob converter with queue management
 */
class BlobConverter {
  private queue: ConversionJob[] = [];
  private activeConversions = 0;
  private maxConcurrent = 3; // Max 3 simultaneous conversions
  private isProcessing = false;
  private stats: ConversionStats = {
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
    queued: 0
  };

  /**
   * Convert a single blob URL to base64
   */
  async convertBlobToBase64(blobUrl: string): Promise<string> {
    if (!blobUrl?.startsWith('blob:')) {
      return blobUrl;
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        blobUrl,
        resolve,
        reject,
        priority: 'normal'
      });
      this.stats.total++;
      this.stats.queued++;
      this.updateStats();
      this.processQueue();
    });
  }

  /**
   * Convert multiple blob URLs with progress tracking
   */
  async convertBlobsToBase64(blobUrls: string[]): Promise<{
    results: Map<string, string>;
    stats: ConversionStats;
  }> {
    const results = new Map<string, string>();
    const conversions = blobUrls.map(url =>
      this.convertBlobToBase64(url)
        .then(dataUrl => {
          results.set(url, dataUrl);
          return dataUrl;
        })
        .catch(error => {
          logger.warn(`Failed to convert blob URL: ${url}`, error);
          return url; // Return original URL on failure
        })
    );

    await Promise.all(conversions);

    return {
      results,
      stats: { ...this.stats }
    };
  }

  /**
   * Process the conversion queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeConversions < this.maxConcurrent) {
      // Sort by priority (high first)
      this.queue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const job = this.queue.shift();
      if (!job) break;

      this.activeConversions++;
      this.stats.queued--;
      this.stats.inProgress++;
      this.updateStats();

      // Process the job
      this.processJob(job).finally(() => {
        this.activeConversions--;
        this.stats.inProgress--;
        this.updateStats();

        // Continue processing queue
        if (this.queue.length > 0 || this.activeConversions > 0) {
          this.processQueue();
        } else {
          this.isProcessing = false;
        }
      });
    }

    if (this.queue.length === 0 && this.activeConversions === 0) {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single conversion job
   */
  private async processJob(job: ConversionJob): Promise<void> {
    const { blobUrl, resolve, reject } = job;

    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const dataUrl = await this.readBlobAsDataURL(blob);
      resolve(dataUrl);
      this.stats.completed++;
    } catch (error) {
      logger.warn(`Failed to convert blob URL: ${blobUrl}`, error);
      reject(error as Error);
      this.stats.failed++;
    } finally {
      this.updateStats();
    }
  }

  /**
   * Read a blob as a data URL
   */
  private readBlobAsDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Update conversion statistics
   */
  private updateStats(): void {
    this.stats.queued = this.queue.length;
  }

  /**
   * Get current conversion statistics
   */
  getStats(): ConversionStats {
    return { ...this.stats };
  }

  /**
   * Clear the conversion queue (useful for cleanup)
   */
  clearQueue(): void {
    // Reject all pending jobs
    for (const job of this.queue) {
      job.reject(new Error('Conversion cancelled'));
    }
    this.queue = [];
    this.stats.queued = 0;
    this.updateStats();
    logger.log('[BlobConverter] Queue cleared');
  }

  /**
   * Set max concurrent conversions
   */
  setMaxConcurrent(max: number): void {
    if (max > 0 && max <= 10) {
      this.maxConcurrent = max;
      logger.log(`[BlobConverter] Max concurrent conversions set to ${max}`);
    }
  }
}

// Singleton instance
export const blobConverter = new BlobConverter();

/**
 * Convert blobs in objects with optimized batch processing
 */
export async function convertBlobsInObjects(
  objects: Record<string, any>
): Promise<Record<string, any>> {
  const convertedObjects: Record<string, any> = {};
  const blobUrls: string[] = [];

  // First pass: collect all blob URLs
  for (const [id, obj] of Object.entries(objects)) {
    const collectBlobs = (item: any): void => {
      if (!item || typeof item !== 'object') return;

      if (Array.isArray(item)) {
        item.forEach(collectBlobs);
        return;
      }

      for (const [key, value] of Object.entries(item)) {
        if (typeof value === 'string' && value.startsWith('blob:')) {
          blobUrls.push(value);
        } else if (typeof value === 'object' && value !== null) {
          collectBlobs(value);
        }
      }
    };

    collectBlobs(obj);
  }

  // Early exit if no blob URLs found
  if (blobUrls.length === 0) {
    logger.log('[BlobConverter] No blob URLs found in objects');
    return objects;
  }

  logger.log(`[BlobConverter] Found ${blobUrls.length} blob URLs to convert`);

  try {
    // Convert all blob URLs in parallel with queue management
    const { results } = await blobConverter.convertBlobsToBase64(blobUrls);

    // Second pass: replace blob URLs with base64
    for (const [id, obj] of Object.entries(objects)) {
      const convertedObj = { ...obj };

      const replaceBlobs = (item: any): any => {
        if (!item || typeof item !== 'object') return item;

        if (Array.isArray(item)) {
          return item.map(replaceBlobs);
        }

        const result: any = {};
        for (const [key, value] of Object.entries(item)) {
          if (typeof value === 'string' && value.startsWith('blob:')) {
            result[key] = results.get(value) || value;
          } else if (typeof value === 'object' && value !== null) {
            result[key] = replaceBlobs(value);
          } else {
            result[key] = value;
          }
        }
        return result;
      };

      convertedObjects[id] = replaceBlobs(convertedObj);
    }

    logger.log(`[BlobConverter] Successfully converted ${results.size} blob URLs`);
    return convertedObjects;
  } catch (error) {
    logger.error('[BlobConverter] Failed to convert blob URLs:', error);
    // Return original objects on failure
    return objects;
  }
}

/**
 * Convert a single blob URL to base64 (convenience function)
 */
export async function convertSingleBlobToBase64(blobUrl: string): Promise<string> {
  return blobConverter.convertBlobToBase64(blobUrl);
}

/**
 * Get current conversion statistics
 */
export function getBlobConverterStats(): ConversionStats {
  return blobConverter.getStats();
}

/**
 * Clear the blob conversion queue
 */
export function clearBlobConverterQueue(): void {
  blobConverter.clearQueue();
}

/**
 * Configure blob converter settings
 */
export function configureBlobConverter(settings: {
  maxConcurrent?: number;
}): void {
  if (settings.maxConcurrent !== undefined) {
    blobConverter.setMaxConcurrent(settings.maxConcurrent);
  }
}
