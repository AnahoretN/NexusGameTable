/**
 * Local File Asset Loader
 *
 * Handles loading assets from user's local filesystem via File API.
 */

import { hashFile } from '../hashing';
import { assetDB } from '../indexeddb';

// ============================================================================
// TYPES
// ============================================================================

export interface LoadLocalFileResult {
  hash: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface LoadLocalFilesResult {
  successful: LoadLocalFileResult[];
  failed: Array<{ file: File; error: string }>;
  totalSize: number;
  duplicates: number;
}

// ============================================================================
// LOCAL FILE LOADER
// ============================================================================

/**
 * Load a single local file into the asset database
 *
 * @param file - File object from File API
 * @param onProgress - Optional progress callback
 * @returns Hash and metadata of stored asset
 */
export async function loadLocalFile(
  file: File,
  onProgress?: (progress: { loaded: number; total: number }) => void
): Promise<LoadLocalFileResult> {
  // Hash the file
  const hashResult = await hashFile(file);

  // Check if already exists
  const existing = await assetDB.getAsset(hashResult.hash);
  if (existing) {
    return {
      hash: hashResult.hash,
      filename: file.name,
      size: file.size,
      mimeType: file.type
    };
  }

  // Store in database
  await assetDB.putAsset(hashResult, file, file.type, 'local');

  return {
    hash: hashResult.hash,
    filename: file.name,
    size: file.size,
    mimeType: file.type
  };
}

/**
 * Load multiple local files
 *
 * @param files - Array of File objects
 * @param onProgress - Optional progress callback
 * @returns Results with successful and failed files
 */
export async function loadLocalFiles(
  files: File[],
  onProgress?: (progress: { current: number; total: number; file: string }) => void
): Promise<LoadLocalFilesResult> {
  const successful: LoadLocalFileResult[] = [];
  const failed: Array<{ file: File; error: string }> = [];
  let totalSize = 0;
  let duplicates = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: files.length,
        file: file.name
      });
    }

    try {
      const result = await loadLocalFile(file);

      // Check if it was a duplicate
      const existing = await assetDB.getAsset(result.hash);
      if (existing && existing.createdAt < Date.now() - 1000) {
        duplicates++;
      }

      successful.push(result);
      totalSize += result.size;
    } catch (error) {
      failed.push({
        file,
        error: (error as Error).message
      });
    }
  }

  return {
    successful,
    failed,
    totalSize,
    duplicates
  };
}

/**
 * Load local files from a FileList (e.g., from <input type="file">)
 */
export async function loadFileList(
  fileList: FileList,
  onProgress?: (progress: { current: number; total: number; file: string }) => void
): Promise<LoadLocalFilesResult> {
  const files = Array.from(fileList);
  return loadLocalFiles(files, onProgress);
}

/**
 * Load a single file from a file input element
 */
export async function loadFromFileInput(
  input: HTMLInputElement,
  onProgress?: (progress: { current: number; total: number; file: string }) => void
): Promise<LoadLocalFilesResult> {
  if (!input.files || input.files.length === 0) {
    return {
      successful: [],
      failed: [],
      totalSize: 0,
      duplicates: 0
    };
  }

  return loadFileList(input.files, onProgress);
}

/**
 * Filter image files from a list of files
 */
export function filterImageFiles(files: File[]): File[] {
  const imageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/x-icon'
  ];

  return files.filter(file => imageTypes.includes(file.type));
}

/**
 * Get total size of files
 */
export function getTotalFileSize(files: File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
