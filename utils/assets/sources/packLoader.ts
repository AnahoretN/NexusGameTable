/**
 * Pack Asset Loader
 *
 * Handles loading assets from ZIP archives (packs).
 * Uses fflate library for decompression.
 */

import { hashAsset } from '../hashing';
import { assetDB } from '../indexeddb';

// ============================================================================
// TYPES
// ============================================================================

export interface PackEntry {
  path: string;           // Full path in archive
  filename: string;       // Just the filename
  size: number;           // Uncompressed size
  compressedSize: number; // Compressed size in archive
  hash?: string;          // SHA-256 hash (computed during load)
}

export interface LoadPackResult {
  packName: string;
  totalEntries: number;
  imageEntries: number;
  successfulHashes: string[];
  duplicates: number;
  failed: Array<{ path: string; error: string }>;
  totalSize: number;
}

export interface LoadPackProgress {
  current: number;
  total: number;
  filename: string;
  phase: 'reading' | 'hashing' | 'storing';
}

// ============================================================================
// PACK LOADER
// ============================================================================

/**
 * Check if file is an image based on extension
 */
function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
  return imageExtensions.includes(ext || '');
}

/**
 * Detect MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();

  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon'
  };

  return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Load assets from a ZIP file (Blob)
 *
 * @param zipBlob - ZIP file as Blob
 * @param packName - Name of the pack (for metadata)
 * @param onProgress - Optional progress callback
 * @returns Loading result with hashes
 */
export async function loadPack(
  zipBlob: Blob,
  packName: string,
  onProgress?: (progress: LoadPackProgress) => void
): Promise<LoadPackResult> {
  // Dynamic import of fflate
  const fflate = await importfflate();

  // Unzip the file
  const buffer = await zipBlob.arrayBuffer();
  const unzipped = fflate.unzSync(buffer);

  const entries: PackEntry[] = [];
  let totalSize = 0;

  // First pass: collect all entries
  for (const [path, data] of Object.entries(unzipped)) {
    const entry: PackEntry = {
      path,
      filename: path.split('/').pop() || path,
      size: data.length,
      compressedSize: 0 // Not easily available from fflate
    };
    entries.push(entry);
    totalSize += entry.size;
  }

  const imageEntries = entries.filter(e => isImageFile(e.filename));

  // Process images
  const successfulHashes: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  let duplicates = 0;

  for (let i = 0; i < imageEntries.length; i++) {
    const entry = imageEntries[i];

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: imageEntries.length,
        filename: entry.filename,
        phase: 'reading'
      });
    }

    try {
      // Get the unzipped data
      const data = unzipped[entry.path];
      if (!data) continue;

      // Create blob
      const mimeType = getMimeType(entry.filename);
      const blob = new Blob([data], { type: mimeType });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: imageEntries.length,
          filename: entry.filename,
          phase: 'hashing'
        });
      }

      // Hash the blob
      const hashResult = await hashAsset(blob);
      entry.hash = hashResult.hash;

      // Check if already exists
      const existing = await assetDB.getAsset(hashResult.hash);
      if (existing) {
        duplicates++;
      } else {
        // Store in database
        await assetDB.putAsset(hashResult, blob, mimeType, 'pack');
      }

      successfulHashes.push(hashResult.hash);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: imageEntries.length,
          filename: entry.filename,
          phase: 'storing'
        });
      }

    } catch (error) {
      failed.push({
        path: entry.path,
        error: (error as Error).message
      });
    }
  }

  return {
    packName,
    totalEntries: entries.length,
    imageEntries: imageEntries.length,
    successfulHashes,
    duplicates,
    failed,
    totalSize
  };
}

/**
 * Load pack from File object (e.g., from file input)
 */
export async function loadPackFromFile(
  file: File,
  onProgress?: (progress: LoadPackProgress) => void
): Promise<LoadPackResult> {
  return loadPack(file, file.name.replace(/\.[^/.]+$/, ''), onProgress);
}

/**
 * List contents of a ZIP file without loading
 */
export async function listPackContents(zipBlob: Blob): Promise<PackEntry[]> {
  const fflate = await importfflate();

  const buffer = await zipBlob.arrayBuffer();
  const unzipped = fflate.unzSync(buffer);

  const entries: PackEntry[] = [];

  for (const [path, data] of Object.entries(unzipped)) {
    entries.push({
      path,
      filename: path.split('/').pop() || path,
      size: data.length,
      compressedSize: 0
    });
  }

  return entries;
}

/**
 * Get pack info (counts, sizes) without loading
 */
export async function getPackInfo(zipBlob: Blob): Promise<{
  totalEntries: number;
  imageEntries: number;
  totalSize: number;
  imagesByType: Record<string, number>;
}> {
  const entries = await listPackContents(zipBlob);

  const imageEntries = entries.filter(e => isImageFile(e.filename));
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);

  const imagesByType: Record<string, number> = {};
  for (const entry of imageEntries) {
    const ext = entry.filename.toLowerCase().split('.').pop() || 'unknown';
    imagesByType[ext] = (imagesByType[ext] || 0) + 1;
  }

  return {
    totalEntries: entries.length,
    imageEntries: imageEntries.length,
    totalSize,
    imagesByType
  };
}

/**
 * Extract a single file from a ZIP blob
 */
export async function extractSingleFile(
  zipBlob: Blob,
  filePath: string
): Promise<Blob | null> {
  const fflate = await importfflate();

  const buffer = await zipBlob.arrayBuffer();
  const unzipped = fflate.unzSync(buffer);

  const data = unzipped[filePath];
  if (!data) return null;

  const mimeType = getMimeType(filePath);
  return new Blob([data], { type: mimeType });
}

/**
 * Check if blob is a ZIP file
 */
export async function isZipFile(blob: Blob): Promise<boolean> {
  // ZIP files start with magic number: PK (0x504B)
  const header = await blob.slice(0, 4).arrayBuffer();
  const view = new Uint8Array(header);

  return view[0] === 0x50 && view[1] === 0x4B;
}

/**
 * Import fflate dynamically
 */
async function importfflate() {
  try {
    // Try to import from node_modules
    const module = await import('fflate');
    return module;
  } catch {
    throw new Error('fflate library is required for pack loading. Install it with: npm install fflate');
  }
}
