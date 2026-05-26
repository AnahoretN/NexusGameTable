/**
 * Content-Addressable Storage - Asset Cache Module
 *
 * In-memory cache of ObjectURLs for fast rendering.
 * Bridges IndexedDB storage and rendering components.
 */

import { assetDB, type AssetEntry } from './indexeddb';
import { isValidHash, normalizeHash } from './hashing';

// ============================================================================
// CONSTANTS
// ============================================================================

// Maximum number of ObjectURLs to keep in memory
const MAX_CACHE_ENTRIES = 500;
// Maximum total size of cached ObjectURLs (100MB)
const MAX_CACHE_SIZE_BYTES = 100 * 1024 * 1024;
// How long to keep unused ObjectURLs in memory (10 minutes)
const MAX_IDLE_TIME_MS = 10 * 60 * 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface CacheEntry {
  hash: string;
  url: string;              // ObjectURL from URL.createObjectURL()
  size: number;             // Size in bytes
  createdAt: number;        // When ObjectURL was created
  lastAccess: number;       // Last time this entry was accessed
  accessCount: number;      // Number of times accessed (for LRU)
  refCount: number;         // 🔥 FIX: Reference count - don't revoke while in use
}

export interface CacheStats {
  entries: number;
  totalSize: number;
  totalSizeMB: string;
  hitRate: number;          // Cache hit rate (0-1)
  oldestEntry: number;
  newestEntry: number;
}

type ResolveFn = (url: string) => void;
type RejectFn = (error: Error) => void;

interface PendingRequest {
  resolve: ResolveFn;
  reject: RejectFn;
  timestamp: number;
}

// ============================================================================
// ASSET CACHE CLASS
// ============================================================================

class AssetCache {
  // In-memory cache of ObjectURLs
  private cache = new Map<string, CacheEntry>();

  // Pending requests (avoid duplicate loads)
  private pending = new Map<string, PendingRequest>();

  // Statistics
  private hits = 0;
  private misses = 0;

  /**
   * Get ObjectURL for an asset hash
   *
   * If the asset is already in memory, returns immediately.
   * Otherwise loads from IndexedDB and creates new ObjectURL.
   *
   * @param hash - Asset hash (with or without prefix)
   * @returns ObjectURL string
   */
  async getObjectURL(hash: string): Promise<string> {
    const normalizedHash = normalizeHash(hash);

    // Check memory cache first
    const cached = this.cache.get(normalizedHash);
    if (cached) {
      this.hits++;
      cached.lastAccess = Date.now();
      cached.accessCount++;
      cached.refCount++; // 🔥 FIX: Increment ref count when URL is returned
      return cached.url;
    }

    // Check for pending request
    const pending = this.pending.get(normalizedHash);
    if (pending) {
      return new Promise((resolve, reject) => {
        this.pending.set(normalizedHash, {
          resolve,
          reject,
          timestamp: pending.timestamp
        });
      });
    }

    // Load from IndexedDB
    this.misses++;
    return this.loadFromDB(normalizedHash);
  }

  /**
   * Load asset from IndexedDB and create ObjectURL
   */
  private async loadFromDB(hash: string): Promise<string> {
    const startTime = Date.now();

    // Create pending entry
    const pendingRequests: PendingRequest[] = [];
    this.pending.set(hash, {
      resolve: () => {},
      reject: () => {},
      timestamp: startTime
    });

    try {
      // Get from IndexedDB
      const entry: AssetEntry | null = await assetDB.getAsset(hash);

      if (!entry) {
        throw new Error(`Asset not found: ${hash}`);
      }

      // 🔥 NEW: Check if blob is valid
      if (!entry.blob || entry.blob.size === 0) {
        throw new Error(`Asset has empty or invalid blob: ${hash}`);
      }

      // Create ObjectURL
      const url = URL.createObjectURL(entry.blob);

      // Add to cache
      this.addToCache(hash, url, entry.size, 1); // 🔥 FIX: Initial refCount = 1 (caller is using it)

      // Resolve all pending requests
      let pending = this.pending.get(hash);
      while (pending) {
        pendingRequests.push(pending);
        this.pending.delete(hash);
        pending = this.pending.get(hash);
      }

      for (const p of pendingRequests) {
        p.resolve(url);
      }

      return url;

    } catch (error) {
      // Reject all pending requests
      let pending = this.pending.get(hash);
      while (pending) {
        pendingRequests.push(pending);
        this.pending.delete(hash);
        pending = this.pending.get(hash);
      }

      for (const p of pendingRequests) {
        p.reject(error as Error);
      }

      throw error;
    }
  }

  /**
   * Add entry to cache with eviction if needed
   */
  private addToCache(hash: string, url: string, size: number, initialRefCount = 0): void {
    // Check if we need to evict
    const newTotalSize = this.getCurrentSize() + size;
    const needsEviction =
      this.cache.size >= MAX_CACHE_ENTRIES ||
      newTotalSize > MAX_CACHE_SIZE_BYTES;

    if (needsEviction) {
      this.evictLRU(size);
    }

    // Add new entry
    const now = Date.now();
    this.cache.set(hash, {
      hash,
      url,
      size,
      createdAt: now,
      lastAccess: now,
      accessCount: 1,
      refCount: initialRefCount // 🔥 FIX: Initialize ref count
    });
  }

  /**
   * Evict least recently used entries to free space
   * 🔥 FIX: Don't revoke URLs that are currently in use (refCount > 0)
   */
  private evictLRU(neededSpace: number): void {
    // Sort by last access (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccess - b.lastAccess);

    let freedSpace = 0;
    const now = Date.now();

    for (const [hash, entry] of entries) {
      // Stop if we've freed enough space
      if (freedSpace >= neededSpace &&
          this.cache.size < MAX_CACHE_ENTRIES &&
          this.getCurrentSize() < MAX_CACHE_SIZE_BYTES) {
        break;
      }

      // Also evict old idle entries
      const idleTime = now - entry.lastAccess;
      if (freedSpace >= neededSpace && idleTime < MAX_IDLE_TIME_MS) {
        break;
      }

      // 🔥 FIX: Don't revoke URLs that are currently in use
      if (entry.refCount > 0) {
        continue;
      }

      // Revoke ObjectURL and remove from cache
      URL.revokeObjectURL(entry.url);
      this.cache.delete(hash);
      freedSpace += entry.size;
    }
  }

  /**
   * Get current total cache size
   */
  private getCurrentSize(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Preload multiple assets into cache
   *
   * @param hashes - Array of asset hashes to preload
   * @returns Map of hash to ObjectURL
   */
  async preloadHashes(hashes: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    await Promise.all(
      hashes.map(async (hash) => {
        try {
          const url = await this.getObjectURL(hash);
          results.set(hash, url);
        } catch (error) {
          // Silently skip preload errors
        }
      })
    );

    return results;
  }

  /**
   * Release an ObjectURL (explicit cleanup)
   *
   * Decrements ref count. URL is revoked when refCount reaches 0.
   *
   * @param hash - Asset hash to release
   */
  release(hash: string): void {
    const normalizedHash = normalizeHash(hash);
    const entry = this.cache.get(normalizedHash);

    if (entry) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        // Ref count reached 0, safe to revoke
        URL.revokeObjectURL(entry.url);
        this.cache.delete(normalizedHash);
      }
    }
  }

  /**
   * Acquire a reference to an asset (increment ref count)
   * Call this when you start using an ObjectURL
   *
   * @param hash - Asset hash to acquire
   */
  acquire(hash: string): void {
    const normalizedHash = normalizeHash(hash);
    const entry = this.cache.get(normalizedHash);

    if (entry) {
      entry.refCount++;
    }
  }

  /**
   * Check if asset is in memory cache
   */
  hasInMemory(hash: string): boolean {
    return this.cache.has(normalizeHash(hash));
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const now = Date.now();

    let oldestEntry = 0;
    let newestEntry = 0;

    for (const entry of entries) {
      const age = now - entry.createdAt;
      if (age > oldestEntry) oldestEntry = age;
      if (age > newestEntry || newestEntry === 0) newestEntry = age;
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      entries: this.cache.size,
      totalSize: this.getCurrentSize(),
      totalSizeMB: (this.getCurrentSize() / 1024 / 1024).toFixed(2),
      hitRate,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Clear all cached ObjectURLs
   *
   * Call this when switching rooms or loading new game state.
   */
  clear(): void {
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Clean up old idle entries
   *
   * @param maxIdleTime - Maximum idle time in ms (default: MAX_IDLE_TIME_MS)
   * @returns Number of entries cleaned up
   */
  cleanupOldEntries(maxIdleTime: number = MAX_IDLE_TIME_MS): number {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [hash, entry] of this.cache.entries()) {
      if (now - entry.lastAccess > maxIdleTime) {
        toDelete.push(hash);
      }
    }

    for (const hash of toDelete) {
      this.release(hash);
    }

    return toDelete.length;
  }

  /**
   * Start automatic cleanup interval
   *
   * @param intervalMs - Cleanup interval in ms
   * @returns Cleanup function to stop the interval
   */
  startAutoCleanup(intervalMs: number = 60000): () => void {
    const interval = setInterval(() => {
      this.cleanupOldEntries();
    }, intervalMs);

    return () => clearInterval(interval);
  }

  /**
   * Get all cached hashes
   */
  getCachedHashes(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get entry info without loading
   */
  getEntryInfo(hash: string): CacheEntry | null {
    return this.cache.get(normalizeHash(hash)) || null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const assetCache = new AssetCache();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Get ObjectURL for asset hash
 * 🔥 FIX: Added retry mechanism for P2P transfers where assets might not be immediately available
 */
export async function getAssetURL(hash: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      return await assetCache.getObjectURL(hash);
    } catch (error) {
      const isAssetNotFound = error instanceof Error && error.message.includes('Asset not found');
      if (isAssetNotFound && i < retries - 1) {
        // Asset might still be saving to IndexedDB - wait and retry
        const delay = 100 * Math.pow(2, i); // 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Final retry failed or different error
        throw error;
      }
    }
  }
  // Should never reach here, but TypeScript needs it
  return assetCache.getObjectURL(hash);
}

/**
 * Preload multiple assets
 */
export async function preloadAssets(hashes: string[]): Promise<Map<string, string>> {
  return assetCache.preloadHashes(hashes);
}

/**
 * Release cached asset
 */
export function releaseAsset(hash: string): void {
  assetCache.release(hash);
}

/**
 * Acquire a reference to a cached asset
 * Call this when you start using an ObjectURL
 */
export function acquireAsset(hash: string): void {
  assetCache.acquire(hash);
}

/**
 * Check if asset is in memory cache
 */
export function isAssetCached(hash: string): boolean {
  return assetCache.hasInMemory(hash);
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  return assetCache.getStats();
}

/**
 * Clear asset cache
 */
export function clearAssetCache(): void {
  assetCache.clear();
}

/**
 * Start automatic cleanup
 */
export function startAssetCacheCleanup(intervalMs?: number): () => void {
  return assetCache.startAutoCleanup(intervalMs);
}

// ============================================================================
// REACT HOOK
// ============================================================================

// Global event emitter for asset updates
class AssetEventEmitter {
  private listeners = new Set<() => void>();

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(): void {
    this.listeners.forEach(callback => callback());
  }
}

export const assetEvents = new AssetEventEmitter();

/**
 * React hook for loading asset URLs
 *
 * @param hash - Asset hash to load
 * @returns ObjectURL or null while loading
 */
export function useAssetURL(hash: string | null): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);

  React.useEffect(() => {
    if (!hash) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    let timeoutId: NodeJS.Timeout;

    const loadAsset = async () => {
      try {
        const loadedUrl = await assetCache.getObjectURL(hash);
        if (!cancelled) {
          setUrl(loadedUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setUrl(null);
          // Retry after 1 second if asset not found (might be loading via P2P)
          if ((error as Error).message.includes('Asset not found')) {
            timeoutId = setTimeout(() => {
              if (!cancelled) {
                setRetryCount(c => c + 1);
              }
            }, 1000);
          }
        }
      }
    };

    loadAsset();

    // Subscribe to asset update events
    const unsubscribe = assetEvents.subscribe(() => {
      if (!cancelled && hash) {
        loadAsset();
      }
    });

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [hash, retryCount]);

  return url;
}

// Import React for the hook
import React from 'react';
