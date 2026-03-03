/**
 * Image cache utility for P2P synchronization
 * Extracts base64 images from state and replaces them with reference IDs
 * to avoid re-sending large image data on every update
 */

export interface ImageCache {
  [imageId: string]: string; // imageId -> base64 data
}

export interface StateWithImageCache {
  state: any;
  imageCache: ImageCache;
}

// Prefix to identify image references
const IMAGE_REF_PREFIX = 'img_ref://';

/**
 * Check if a string is a base64 data URL
 */
export function isBase64DataURL(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith('data:image/');
}

/**
 * Generate a unique image ID
 */
export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an image reference string
 */
export function createImageRef(imageId: string): string {
  return `${IMAGE_REF_PREFIX}${imageId}`;
}

/**
 * Check if a string is an image reference
 */
export function isImageRef(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith(IMAGE_REF_PREFIX);
}

/**
 * Extract image ID from reference
 */
export function getImageIdFromRef(ref: string): string {
  return ref.replace(IMAGE_REF_PREFIX, '');
}

/**
 * Recursively extract base64 images from an object and build cache
 * Returns the object with base64 strings replaced by references
 */
export function extractImagesToCache(obj: any, cache: ImageCache = {}, existingCache: ImageCache = {}): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => extractImagesToCache(item, cache, existingCache));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip metadata and IDs
    if (key === 'id' || key === 'deckId' || key === 'ownerId' || key === 'archetypeId' || key === 'parentId') {
      result[key] = value;
      continue;
    }

    // Handle nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = extractImagesToCache(value, cache, existingCache);
    }
    // Check for base64 data URLs in content fields
    else if ((key === 'content' || key === 'url' || key === 'cardBackUrl' || key === 'alternativeBackUrl') && typeof value === 'string') {
      if (isBase64DataURL(value)) {
        // Check if we already have this image cached
        const existingId = Object.entries(existingCache).find(([_, data]) => data === value)?.[0];

        if (existingId) {
          // Use existing cache entry
          result[key] = createImageRef(existingId);
          cache[existingId] = value;
        } else {
          // Create new cache entry
          const imageId = generateImageId();
          result[key] = createImageRef(imageId);
          cache[imageId] = value;
        }
      } else {
        result[key] = value;
      }
    }
    // Check spriteConfig for images
    else if (key === 'spriteConfig' && value && typeof value === 'object') {
      const spriteConfig: any = { ...value };
      if (typeof spriteConfig.spriteUrl === 'string' && isBase64DataURL(spriteConfig.spriteUrl)) {
        const existingId = Object.entries(existingCache).find(([_, data]) => data === spriteConfig.spriteUrl)?.[0];
        if (existingId) {
          spriteConfig.spriteUrl = createImageRef(existingId);
          cache[existingId] = existingCache[existingId];
        } else {
          const imageId = generateImageId();
          spriteConfig.spriteUrl = createImageRef(imageId);
          cache[imageId] = (value as any).spriteUrl;
        }
      }
      if (typeof spriteConfig.cardBackUrl === 'string' && isBase64DataURL(spriteConfig.cardBackUrl)) {
        const existingId = Object.entries(existingCache).find(([_, data]) => data === spriteConfig.cardBackUrl)?.[0];
        if (existingId) {
          spriteConfig.cardBackUrl = createImageRef(existingId);
          cache[existingId] = existingCache[existingId];
        } else {
          const imageId = generateImageId();
          spriteConfig.cardBackUrl = createImageRef(imageId);
          cache[imageId] = (value as any).cardBackUrl;
        }
      }
      result[key] = spriteConfig;
    }
    // Check alternativeBack object
    else if (key === 'alternativeBack' && value && typeof value === 'object') {
      const altBack: any = { ...value };
      if (typeof altBack.url === 'string' && isBase64DataURL(altBack.url)) {
        const existingId = Object.entries(existingCache).find(([_, data]) => data === altBack.url)?.[0];
        if (existingId) {
          altBack.url = createImageRef(existingId);
          cache[existingId] = existingCache[existingId];
        } else {
          const imageId = generateImageId();
          altBack.url = createImageRef(imageId);
          cache[imageId] = (value as any).url;
        }
      }
      result[key] = altBack;
    }
    // Keep other values as-is
    else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Restore base64 images from cache references
 */
export function restoreImagesFromCache(obj: any, cache: ImageCache): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => restoreImagesFromCache(item, cache));
  }

  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      result[key] = restoreImagesFromCache(value, cache);
    } else if (typeof value === 'string' && isImageRef(value)) {
      const imageId = getImageIdFromRef(value);
      result[key] = cache[imageId] || value; // Fallback to original if not in cache
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract images from state and return state with references + image cache
 */
export function extractImagesFromState(state: any, existingCache: ImageCache = {}): StateWithImageCache {
  const cache: ImageCache = { ...existingCache };

  // Process objects
  const processedObjects: any = {};
  Object.entries(state.objects || {}).forEach(([id, obj]) => {
    processedObjects[id] = extractImagesToCache(obj, cache, existingCache);
  });

  return {
    state: { ...state, objects: processedObjects },
    imageCache: cache
  };
}

/**
 * Restore images to state from cache
 */
export function restoreImagesToState(state: any, imageCache: ImageCache): any {
  const restoredObjects: any = {};
  Object.entries(state.objects || {}).forEach(([id, obj]) => {
    restoredObjects[id] = restoreImagesFromCache(obj, imageCache);
  });

  return { ...state, objects: restoredObjects };
}

/**
 * Get only new images (not in existing cache)
 */
export function getNewImages(currentCache: ImageCache, existingCache: ImageCache): ImageCache {
  const newImages: ImageCache = {};
  for (const [id, data] of Object.entries(currentCache)) {
    if (!existingCache[id]) {
      newImages[id] = data;
    }
  }
  return newImages;
}
