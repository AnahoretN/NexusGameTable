/**
 * URL Asset Loader
 *
 * Handles loading assets from external URLs via fetch API.
 */

import { hashAsset } from '../hashing';
import { assetDB } from '../indexeddb';

// ============================================================================
// TYPES
// ============================================================================

export interface LoadURLResult {
  url: string;
  hash: string;
  size: number;
  mimeType: string;
  cached: boolean;
}

export interface LoadURLOptions {
  timeout?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  maxSize?: number;
}

export interface LoadURLsProgress {
  current: number;
  total: number;
  url: string;
  loaded: number;
  totalBytes: number;
}

// ============================================================================
// URL LOADER
// ============================================================================

/**
 * Load a single asset from URL
 *
 * @param url - URL to fetch
 * @param options - Loading options
 * @returns Hash and metadata of loaded asset
 */
export async function loadFromURL(
  url: string,
  options?: LoadURLOptions
): Promise<LoadURLResult> {
  const {
    timeout = 30000,
    signal,
    headers,
    maxSize = 50 * 1024 * 1024 // 50MB default max
  } = options || {};

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Combine with external signal
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  try {
    // Fetch the URL
    const response = await fetch(url, {
      signal: controller.signal,
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content length
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new Error(`File too large: ${contentLength} bytes`);
    }

    // Get blob
    const blob = await response.blob();

    if (blob.size > maxSize) {
      throw new Error(`File too large: ${blob.size} bytes`);
    }

    // Hash the blob
    const hashResult = await hashAsset(blob);

    // Check if already exists
    const existing = await assetDB.getAsset(hashResult.hash);
    const cached = !!existing;

    // Store if not exists
    if (!existing) {
      await assetDB.putAsset(hashResult, blob, blob.type, 'url');
    }

    return {
      url,
      hash: hashResult.hash,
      size: blob.size,
      mimeType: blob.type,
      cached
    };

  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Load multiple assets from URLs
 *
 * @param urls - Array of URLs to fetch
 * @param onProgress - Optional progress callback
 * @param options - Loading options
 * @returns Array of results
 */
export async function loadFromURLs(
  urls: string[],
  onProgress?: (progress: LoadURLsProgress) => void,
  options?: LoadURLOptions
): Promise<LoadURLResult[]> {
  const results: LoadURLResult[] = [];
  let loadedBytes = 0;
  let totalBytes = 0;

  // First, fetch all to get total size (HEAD requests)
  try {
    const headResponses = await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          const size = parseInt(response.headers.get('content-length') || '0');
          return { url, size };
        } catch {
          return { url, size: 0 };
        }
      })
    );

    totalBytes = headResponses.reduce((sum, r) => sum + r.size, 0);
  } catch {
    // If HEAD fails, we'll still load but without accurate total
  }

  // Load URLs one at a time (to avoid overwhelming the server)
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    try {
      const result = await loadFromURL(url, options);
      results.push(result);
      loadedBytes += result.size;

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: urls.length,
          url,
          loaded: loadedBytes,
          totalBytes
        });
      }
    } catch (error) {
      // Continue with other URLs
    }
  }

  return results;
}

/**
 * Load from URLs with concurrency limit
 */
export async function loadFromURLsConcurrent(
  urls: string[],
  concurrency: number = 3,
  onProgress?: (progress: LoadURLsProgress) => void,
  options?: LoadURLOptions
): Promise<LoadURLResult[]> {
  const results: LoadURLResult[] = [];
  const loading = new Set<Promise<LoadURLResult>>();
  let completed = 0;

  for (const url of urls) {
    // Wait if we're at concurrency limit
    if (loading.size >= concurrency) {
      const result = await Promise.race(loading);
      results.push(result);
      completed++;

      loading.delete(loading.find(p => p === result)!);

      if (onProgress) {
        onProgress({
          current: completed,
          total: urls.length,
          url: result.url,
          loaded: 0,
          totalBytes: 0
        });
      }
    }

    // Start loading this URL
    const promise = loadFromURL(url, options)
      .then(result => {
        results.push(result);
        completed++;

        if (onProgress) {
          onProgress({
            current: completed,
            total: urls.length,
            url,
            loaded: result.size,
            totalBytes: 0
          });
        }

        return result;
      })
      .catch(error => {
        completed++;

        if (onProgress) {
          onProgress({
            current: completed,
            total: urls.length,
            url,
            loaded: 0,
            totalBytes: 0
          });
        }

        // Return a dummy result
        return {
          url,
          hash: '',
          size: 0,
          mimeType: '',
          cached: false
        };
      });

    loading.add(promise);
  }

  // Wait for remaining
  await Promise.all(loading);

  return results.filter(r => r.hash !== '');
}

/**
 * Check if URL is accessible (HEAD request)
 */
export async function checkURLAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get URL info (size, type) without downloading
 */
export async function getURLInfo(url: string): Promise<{
  size: number;
  mimeType: string;
  accessible: boolean
} | null> {
  try {
    const response = await fetch(url, { method: 'HEAD' });

    if (!response.ok) {
      return null;
    }

    const size = parseInt(response.headers.get('content-length') || '0');
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';

    return {
      size,
      mimeType,
      accessible: true
    };
  } catch {
    return {
      size: 0,
      mimeType: '',
      accessible: false
    };
  }
}

/**
 * Extract filename from URL
 */
export function getFilenameFromURL(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    return filename || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Check if URL is an image URL
 */
export function isImageURL(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();

    return imageExtensions.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}
