import { useState, useEffect } from 'react';
import { getAssetURL, isValidHash, assetCache } from '../utils/assets';

// ============================================================================
// URL CACHE
// ============================================================================

const resolvedUrlCache = new Map<string, string>();
const pendingResolves = new Map<string, Promise<string>>();

/**
 * React hook to convert asset URLs to displayable URLs
 *
 * Supports:
 * - SHA-256 hashes: "sha256:abc123..." → loads from new CAS system
 * - Regular URLs: "https://..." → used as-is
 *
 * @deprecated Use useAssetURL from utils/assets instead
 */
export function useImageUrl(url: string): string {
  const [displayUrl, setDisplayUrl] = useState<string>(() => {
    if (url && resolvedUrlCache.has(url)) {
      return resolvedUrlCache.get(url)!;
    }
    // Don't return sha256: URLs directly - they cause CSP violations
    // Return empty string until resolved
    if (url && isValidHash(url)) {
      return '';
    }
    return url;
  });

  useEffect(() => {
    if (!url) {
      setDisplayUrl(url);
      return;
    }

    // Regular URL - use as-is (not a hash)
    if (!isValidHash(url)) {
      setDisplayUrl(url);
      return;
    }

    // Check global cache first (instant)
    if (resolvedUrlCache.has(url)) {
      const cached = resolvedUrlCache.get(url);
      if (cached && cached !== displayUrl) {
        setDisplayUrl(cached);
      }
      return;
    }

    // Check for pending resolve
    if (pendingResolves.has(url)) {
      pendingResolves.get(url)!.then(resolvedUrl => {
        setDisplayUrl(resolvedUrl);
      });
      return;
    }

    // Resolve SHA-256 hash to ObjectURL
    let cancelled = false;
    const resolvePromise = getAssetURL(url).then((resolvedUrl) => {
      if (!cancelled) {
        resolvedUrlCache.set(url, resolvedUrl);
        setDisplayUrl(resolvedUrl);
      }
      pendingResolves.delete(url);
      return resolvedUrl;
    }).catch((error) => {
      console.error(`Failed to resolve URL ${url}:`, error);
      if (!cancelled) {
        setDisplayUrl(url); // Fallback to original URL
      }
      pendingResolves.delete(url);
      return url;
    });

    pendingResolves.set(url, resolvePromise);

    return () => {
      cancelled = true;
    };
  }, [url, displayUrl]);

  return displayUrl;
}

/**
 * Preload an image URL into the cache
 */
export function preloadImageUrl(url: string): void {
  if (!url || resolvedUrlCache.has(url)) {
    return;
  }

  // SHA-256 hash - preload from CAS system
  if (isValidHash(url)) {
    getAssetURL(url).then(resolvedUrl => {
      resolvedUrlCache.set(url, resolvedUrl);
    });
  }
}

/**
 * Clear the URL cache (useful for testing or memory management)
 */
export function clearUrlCache(): void {
  resolvedUrlCache.clear();
}

/**
 * Clear both URL cache and asset cache
 */
export function clearAllImageCaches(): void {
  clearUrlCache();
  assetCache.clear();
}
