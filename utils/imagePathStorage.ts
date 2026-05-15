import type { TableObject } from '../types';
import { logger } from './logger';

/**
 * Image path metadata for storage
 * Compact format to minimize localStorage usage
 * Instead of storing actual image data (base64/blob), store only path information
 */
export interface ImagePathMetadata {
  t: 'p' | 'u' | 'b' | 'd'; // type: pack/url/blob/data (shortened)
  p: string; // path (shortened)
  f?: string; // filename (for pack images, shortened)
  o?: string; // originalUrl (for reference, shortened)
}

/**
 * Storage version for image path system
 */
const IMAGE_PATH_VERSION = 7;

/**
 * Convert image URLs to path metadata for storage
 * This prevents storing large base64/blob data in localStorage
 */
export function convertImagesToPathMetadata(objects: Record<string, TableObject>, skipLogging = false): Record<string, TableObject> {
  const convertedObjects: Record<string, TableObject> = {};
  let convertedCount = 0;
  let skippedCount = 0;

  for (const [id, obj] of Object.entries(objects)) {
    // Deep clone to avoid mutating original objects
    const convertedObj = JSON.parse(JSON.stringify(obj));

    // Recursively convert all URL strings in the object
    const processObject = (item: any): any => {
      if (typeof item === 'string') {
        const result = convertImageUrlToMetadata(item);
        if (result && result !== item) {
          convertedCount++;
          return result;
        }
        if (result === item) {
          skippedCount++;
        }
        return item;
      } else if (Array.isArray(item)) {
        return item.map(processObject);
      } else if (typeof item === 'object' && item !== null) {
        const processed: any = {};
        for (const [key, value] of Object.entries(item)) {
          processed[key] = processObject(value);
        }
        return processed;
      }
      return item;
    };

    convertedObjects[id] = processObject(convertedObj);
  }

  if (!skipLogging && convertedCount > 0) {
    logger.log(`[IMAGE_PATH] Converted ${convertedCount} images to path metadata (${skippedCount} URLs kept as-is)`);
  }

  return convertedObjects;
}

/**
 * Convert a single image URL to path metadata (ULTRA COMPACT FORMAT)
 */
function convertImageUrlToMetadata(url: string): string | null {
  // Don't convert already-converted URLs or external URLs
  if (!url || url.startsWith('http://') || url.startsWith('https://')) {
    return url; // Keep external URLs as-is
  }

  // Convert blob URLs to ULTRA compact metadata
  // Don't store the actual blob URL - it's temporary and will expire
  if (url.startsWith('blob:')) {
    return `B`; // Just "B" for blob - ultra compact!
  }

  // Convert data URLs to compact metadata
  if (url.startsWith('data:image/')) {
    return `D`; // Just "D" for data - ultra compact!
  }

  // Already a metadata string?
  if (url === 'B' || url === 'D' || url.startsWith('{"t":') || url.startsWith('{"type":')) {
    return url; // Already converted
  }

  return url; // Keep unknown formats as-is
}

/**
 * Restore images from path metadata
 * This converts path metadata back to actual image URLs
 */
export async function restoreImagesFromPathMetadata(
  objects: Record<string, TableObject>,
  loadPackImage?: (filename: string) => Promise<string>
): Promise<Record<string, TableObject>> {
  const restoredObjects: Record<string, TableObject> = {};
  let restoredCount = 0;
  let failedCount = 0;

  for (const [id, obj] of Object.entries(objects)) {
    const restoredObj = { ...obj };

    // Process content field
    if ('content' in restoredObj && restoredObj.content) {
      const result = await restoreImageFromMetadata(restoredObj.content, loadPackImage);
      if (result && result !== restoredObj.content) {
        restoredObj.content = result;
        restoredCount++;
      }
    }

    // Process characterData.avatarUrl (for PANEL objects with character tabs)
    if ((restoredObj as any).characterData?.characters) {
      for (const character of (restoredObj as any).characterData.characters) {
        if (character.avatarUrl) {
          const result = await restoreImageFromMetadata(character.avatarUrl, loadPackImage);
          if (result && result !== character.avatarUrl) {
            character.avatarUrl = result;
            restoredCount++;
          }
        }
      }
    }

    // Process poolData.avatarUrl (for PANEL pool tabs with avatars)
    if ((restoredObj as any).poolData?.tabs) {
      for (const tab of (restoredObj as any).poolData.tabs) {
        if (tab.avatarUrl) {
          const result = await restoreImageFromMetadata(tab.avatarUrl, loadPackImage);
          if (result && result !== tab.avatarUrl) {
            tab.avatarUrl = result;
            restoredCount++;
          }
        }
      }
    }

    // Process alternativeBack URL
    if ((restoredObj as any).alternativeBack?.url) {
      const result = await restoreImageFromMetadata((restoredObj as any).alternativeBack.url, loadPackImage);
      if (result) {
        (restoredObj as any).alternativeBack.url = result;
      }
    }

    // Process spriteConfig URLs
    if ((restoredObj as any).spriteConfig) {
      const spriteConfig = { ...(restoredObj as any).spriteConfig };

      if (spriteConfig.spriteUrl) {
        const result = await restoreImageFromMetadata(spriteConfig.spriteUrl, loadPackImage);
        if (result) spriteConfig.spriteUrl = result;
      }

      if (spriteConfig.cardBackUrl) {
        const result = await restoreImageFromMetadata(spriteConfig.cardBackUrl, loadPackImage);
        if (result) spriteConfig.cardBackUrl = result;
      }

      (restoredObj as any).spriteConfig = spriteConfig;
    }

    restoredObjects[id] = restoredObj;
  }

  if (restoredCount > 0) {
    logger.log(`[IMAGE_PATH] Restored ${restoredCount} images from path metadata`);
  }
  if (failedCount > 0) {
    logger.warn(`[IMAGE_PATH] Failed to restore ${failedCount} images (user will need to reload them)`);
  }

  return restoredObjects;
}

/**
 * Restore a single image from metadata (ULTRA COMPACT FORMAT)
 */
async function restoreImageFromMetadata(
  url: string,
  loadPackImage?: (filename: string) => Promise<string>
): Promise<string | null> {
  // Ultra compact format: single letters
  if (url === 'B') {
    // Blob - temporary, can't restore
    logger.debug('[IMAGE_PATH] Blob URL not restored (expired)');
    return null;
  }

  if (url === 'D') {
    // Data URL - removed to save space
    logger.debug('[IMAGE_PATH] Data URL not restored (removed)');
    return null;
  }

  // Not a metadata string - return as-is
  if (!url || (!url.startsWith('{"t":') && !url.startsWith('{"type":'))) {
    return url;
  }

  try {
    const metadata: ImagePathMetadata = JSON.parse(url);

    switch (metadata.t) {
      case 'p': // pack
        // Load from pack
        if (loadPackImage && metadata.f) {
          return await loadPackImage(metadata.f);
        }
        logger.warn(`[IMAGE_PATH] Pack image loader not available for ${metadata.f}`);
        return null;

      case 'u': // url
        // Return original URL
        return metadata.o || metadata.p;

      case 'b': // blob (old format)
        // Blob URLs are temporary - can't be restored
        return metadata.o || null; // Return original blob URL if available

      case 'd': // data (old format)
        // Data URLs were removed - can't be restored
        return null;

      default:
        return url;
    }
  } catch (error) {
    logger.error('[IMAGE_PATH] Failed to parse image metadata:', error);
    return url;
  }
}

/**
 * Check if objects need image restoration
 */
export function needsImageRestoration(objects: Record<string, TableObject>): boolean {
  for (const obj of Object.values(objects)) {
    if ('content' in obj && obj.content &&
        (obj.content === 'B' || obj.content === 'D' ||
         obj.content.startsWith('{"t":') || obj.content.startsWith('{"type":'))) {
      return true;
    }
  }
  return false;
}

/**
 * Get storage version for image path system
 */
export function getImagePathVersion(): number {
  return IMAGE_PATH_VERSION;
}