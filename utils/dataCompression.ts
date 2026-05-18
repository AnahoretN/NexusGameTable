/**
 * Data Compression Utilities for WebRTC
 * Provides compression/decompression for network data transmission
 *
 * 🔥 OPTIMIZED: Compression is only used for messages larger than 2KB
 * Small messages like position updates are sent uncompressed to reduce latency
 */

import * as LZString from 'lz-string';

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  compressionTime: number;
  decompressionTime: number;
}

// 🔥 OPTIMIZED: Increased threshold to avoid compression overhead on small messages
// Position updates, chat messages, and other small actions are sent uncompressed
const COMPRESSION_THRESHOLD = 2048; // 2KB - only compress messages larger than this

class DataCompressionManager {
  private stats: CompressionStats[] = [];
  private enabled: boolean = true;

  /**
   * Enable/disable compression
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Compress JSON data for transmission
   * @param data - Object to compress
   * @returns Compressed string
   */
  compressData(data: any): string {
    if (!this.enabled) {
      return JSON.stringify(data);
    }

    try {
      const startTime = performance.now();
      const jsonString = JSON.stringify(data);
      const compressed = LZString.compressToUTF16(jsonString);
      const endTime = performance.now();

      // Track stats
      this.stats.push({
        originalSize: jsonString.length,
        compressedSize: compressed.length,
        compressionRatio: compressed.length / jsonString.length,
        compressionTime: endTime - startTime,
        decompressionTime: 0,
      });

      // Keep only last 100 stats
      if (this.stats.length > 100) {
        this.stats.shift();
      }

      return compressed;
    } catch (error) {
      // Fallback to uncompressed
      return JSON.stringify(data);
    }
  }

  /**
   * Decompress data from transmission
   * @param compressed - Compressed string
   * @param isCompressed - Whether the data is actually compressed
   * @returns Decompressed object
   */
  decompressData(compressed: string, isCompressed: boolean = true): any {
    if (!isCompressed || !this.enabled) {
      return JSON.parse(compressed);
    }

    try {
      const startTime = performance.now();
      const decompressed = LZString.decompressFromUTF16(compressed);
      const endTime = performance.now();

      if (!decompressed) {
        throw new Error('Decompression returned null');
      }

      const parsed = JSON.parse(decompressed);

      // Update stats for this entry
      const statEntry = this.stats.find(
        stat => stat.compressedSize === compressed.length
      );
      if (statEntry) {
        statEntry.decompressionTime = endTime - startTime;
      }

      return parsed;
    } catch (error) {
      // Fallback: try parsing as regular JSON
      try {
        return JSON.parse(compressed);
      } catch (parseError) {
        return null;
      }
    }
  }

  /**
   * Get compression statistics
   */
  getStats(): {
    totalOriginalSize: number;
    totalCompressedSize: number;
    averageCompressionRatio: number;
    totalCompressionTime: number;
    totalDecompressionTime: number;
    entries: number;
  } {
    const totalOriginalSize = this.stats.reduce((sum, stat) => sum + stat.originalSize, 0);
    const totalCompressedSize = this.stats.reduce((sum, stat) => sum + stat.compressedSize, 0);
    const totalCompressionTime = this.stats.reduce((sum, stat) => sum + stat.compressionTime, 0);
    const totalDecompressionTime = this.stats.reduce((sum, stat) => sum + stat.decompressionTime, 0);
    const averageCompressionRatio = totalOriginalSize > 0
      ? totalCompressedSize / totalOriginalSize
      : 1;

    return {
      totalOriginalSize,
      totalCompressedSize,
      averageCompressionRatio,
      totalCompressionTime,
      totalDecompressionTime,
      entries: this.stats.length,
    };
  }

  /**
   * Print compression report to console
   */
  printReport(): void {
    const stats = this.getStats();
    const savedBytes = stats.totalOriginalSize - stats.totalCompressedSize;
    const savedPercent = ((savedBytes / stats.totalOriginalSize) * 100).toFixed(1);

  }

  /**
   * Clear compression statistics
   */
  clearStats(): void {
    this.stats = [];
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  /**
   * Estimate if compression is beneficial for data size
   * Small data might not benefit from compression
   */
  shouldCompress(dataSize: number): boolean {
    // Only compress data larger than 1KB
    return dataSize > 1024;
  }

  /**
   * Compress if beneficial, otherwise return as-is
   */
  smartCompress(data: any): { compressed: string; wasCompressed: boolean } {
    const jsonString = JSON.stringify(data);

    if (!this.shouldCompress(jsonString.length)) {
      return {
        compressed: jsonString,
        wasCompressed: false,
      };
    }

    return {
      compressed: this.compressData(data),
      wasCompressed: true,
    };
  }
}

// Global instance
export const dataCompressionManager = new DataCompressionManager();

// Convenience functions
export function compressWebRTCData(data: any): string {
  const jsonString = JSON.stringify(data);

  // 🔥 OPTIMIZED: Skip compression for small messages to reduce latency
  if (jsonString.length < COMPRESSION_THRESHOLD) {
    return jsonString;
  }

  return dataCompressionManager.compressData(data);
}

export function decompressWebRTCData(compressed: string, isCompressed: boolean = true): any {
  // 🔥 OPTIMIZED: Handle uncompressed data seamlessly
  // If isCompressed is false or data is smaller than threshold, parse directly
  if (!isCompressed || compressed.length < COMPRESSION_THRESHOLD) {
    try {
      return JSON.parse(compressed);
    } catch (e) {
      // If parsing fails, try decompression anyway
      return dataCompressionManager.decompressData(compressed, true);
    }
  }

  return dataCompressionManager.decompressData(compressed, true);
}

export function getCompressionStats() {
  return dataCompressionManager.getStats();
}

export function printCompressionReport() {
  dataCompressionManager.printReport();
}

// Expose to global scope for debugging
if (typeof window !== 'undefined') {
  (window as any).nexusDataCompression = {
    manager: dataCompressionManager,
    compress: compressWebRTCData,
    decompress: decompressWebRTCData,
    getStats: getCompressionStats,
    printReport: printCompressionReport,
    setEnabled: (enabled: boolean) => dataCompressionManager.setEnabled(enabled),
  };

}