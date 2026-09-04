/**
 * Image Compatibility Layer
 *
 * Minimal functions for checking image URL types.
 * Most legacy functions have been removed as the CAS system handles images directly.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const IMAGE_REF_PREFIX = 'img_ref://';
export const HASH_PREFIX = 'sha256:';

// ============================================================================
// TYPES
// ============================================================================

export interface LocalFileReference {
  type: 'local';
  path: string;
  filename?: string;
}

// ============================================================================
// TYPE CHECKS
// ============================================================================

export function isImageRef(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith(IMAGE_REF_PREFIX);
}

export function isHashRef(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith(HASH_PREFIX);
}

export function isAssetReference(str: unknown): boolean {
  return isImageRef(str) || isHashRef(str);
}

export function isBase64DataURL(str: unknown): boolean {
  return typeof str === 'string' && str.startsWith('data:image/');
}

export function isLocalFilePath(str: unknown): boolean {
  if (typeof str !== 'string') return false;

  // Windows absolute paths (e.g., C:\Users\...)
  if (/^[A-Za-z]:\\/.test(str)) return true;

  // Windows absolute paths with forward slashes (e.g., C:/Users/...)
  if (/^[A-Za-z]:\//.test(str)) return true;

  // Unix absolute paths (e.g., /home/user/...)
  // But not protocol-relative URLs (//example.com)
  if (str.startsWith('/') && str.length > 1 && str[1] !== '/') return true;

  return false;
}

/**
 * Local filesystem references (file:///..., C:\..., /home/...) can never be
 * loaded by a web page — browsers block them (Firefox:
 * "Попытка нарушения системы безопасности: ... не имеет права загружать file:///").
 * They only appear in legacy saves. Use this to avoid feeding such strings
 * into img src / background-image url().
 */
export function isLocalFsReference(str: unknown): boolean {
  return typeof str === 'string' && (str.startsWith('file:') || isLocalFilePath(str));
}

// ============================================================================
// CONVERSION
// ============================================================================

export function getImageIdFromRef(ref: string): string {
  return ref.replace(IMAGE_REF_PREFIX, '');
}

export function extractFilenameFromPath(filePath: string): string {
  // Handle both Windows and Unix paths
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  return parts[parts.length - 1] || filePath;
}

// ============================================================================
// LOCAL FILE PATHS
// ============================================================================

/**
 * Find local file paths in objects
 */
export function findLocalFilePaths(
  objects: Record<string, unknown>
): Map<string, LocalFileReference> {
  const localFiles = new Map<string, LocalFileReference>();

  function traverse(obj: unknown, path: string[]): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        traverse(obj[i], [...path, String(i)]);
      }
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (isLocalFilePath(value)) {
        localFiles.set(path.join('.'), {
          type: 'local',
          path: value as string,
          filename: extractFilenameFromPath(value as string)
        });
      } else if (typeof value === 'object' && value !== null) {
        traverse(value, [...path, key]);
      }
    }
  }

  traverse(objects, []);
  return localFiles;
}
