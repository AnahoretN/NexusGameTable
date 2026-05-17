import { useState, useEffect } from 'react';
import { isImageRef, getImageUrlFromRef, getFromManagedCache } from '../utils/imageCache';

// Global cache for resolved URLs to prevent re-loading during drag operations
const resolvedUrlCache = new Map<string, string>();
const pendingResolves = new Map<string, Promise<string>>();

/**
 * React hook to convert img_ref:// URLs to displayable URLs
 * Returns the actual URL (data URL or original URL)
 * Optimized to prevent flicker during drag operations
 */
export function useImageUrl(url: string): string {
  const [displayUrl, setDisplayUrl] = useState<string>(() => {
    // Initialize from cache if available
    if (url && isImageRef(url)) {
      return resolvedUrlCache.get(url) || url;
    }
    return url;
  });

  useEffect(() => {
    // If not an img_ref URL, use as-is
    if (!isImageRef(url)) {
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

    // Check managed cache (fast, in-memory)
    const imageId = url.replace('img_ref://', '');
    const managedCached = getFromManagedCache(imageId);
    if (managedCached) {
      resolvedUrlCache.set(url, managedCached);
      setDisplayUrl(managedCached);
      return;
    }

    // Check if there's already a pending resolve for this URL
    if (pendingResolves.has(url)) {
      pendingResolves.get(url)!.then(resolvedUrl => {
        setDisplayUrl(resolvedUrl);
      });
      return;
    }

    // Convert img_ref:// to actual URL
    let cancelled = false;
    const resolvePromise = getImageUrlFromRef(url).then((resolvedUrl) => {
      if (!cancelled) {
        resolvedUrlCache.set(url, resolvedUrl);
        setDisplayUrl(resolvedUrl);
      }
      pendingResolves.delete(url);
      return resolvedUrl;
    });

    pendingResolves.set(url, resolvePromise);

    return () => {
      cancelled = true;
    };
  }, [url]);

  return displayUrl;
}

/**
 * Preload an image URL into the cache
 */
export function preloadImageUrl(url: string): void {
  if (isImageRef(url) && !resolvedUrlCache.has(url)) {
    const imageId = url.replace('img_ref://', '');
    const managedCached = getFromManagedCache(imageId);
    if (managedCached) {
      resolvedUrlCache.set(url, managedCached);
    }
  }
}

/**
 * Clear the URL cache (useful for testing or memory management)
 */
export function clearUrlCache(): void {
  resolvedUrlCache.clear();
}
