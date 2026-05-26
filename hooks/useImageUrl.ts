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
 * @returns Promise that resolves when preloading is complete
 */
export function preloadImageUrl(url: string): Promise<void> {
  if (!url || resolvedUrlCache.has(url)) {
    return Promise.resolve();
  }

  // SHA-256 hash - preload from CAS system
  if (isValidHash(url)) {
    return getAssetURL(url).then(resolvedUrl => {
      resolvedUrlCache.set(url, resolvedUrl);
    });
  }

  return Promise.resolve();
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

/**
 * Preload all image URLs from pack objects into the cache
 * Iterates through all objects and preloads their image URLs
 */
export async function preloadAllPackImages(objects: Record<string, any>): Promise<void> {
  if (!objects || typeof objects !== 'object') return;

  const urlsToPreload = new Set<string>();

  // Collect all image URLs from objects
  for (const obj of Object.values(objects)) {
    if (!obj || typeof obj !== 'object') continue;

    // Direct fields
    const urlFields = ['content', 'frontFaceUrl', 'backFaceUrl', 'spriteUrl', 'cardBackSpriteUrl'];
    for (const field of urlFields) {
      if (obj[field] && typeof obj[field] === 'string') {
        urlsToPreload.add(obj[field]);
      }
    }

    // Nested: alternativeBack.url
    if (obj.alternativeBack?.url && typeof obj.alternativeBack.url === 'string') {
      urlsToPreload.add(obj.alternativeBack.url);
    }

    // Nested: spriteConfig
    if (obj.spriteConfig) {
      if (obj.spriteConfig.spriteUrl && typeof obj.spriteConfig.spriteUrl === 'string') {
        urlsToPreload.add(obj.spriteConfig.spriteUrl);
      }
      if (obj.spriteConfig.cardBackUrl && typeof obj.spriteConfig.cardBackUrl === 'string') {
        urlsToPreload.add(obj.spriteConfig.cardBackUrl);
      }
    }

    // Nested: characterData[].characters[].avatarUrl
    if (obj.characterData?.characters && Array.isArray(obj.characterData.characters)) {
      for (const character of obj.characterData.characters) {
        if (character?.avatarUrl && typeof character.avatarUrl === 'string') {
          urlsToPreload.add(character.avatarUrl);
        }
      }
    }
  }

  // Preload all collected URLs
  const preloadPromises = Array.from(urlsToPreload).map(url => preloadImageUrl(url));
  await Promise.all(preloadPromises);
}
