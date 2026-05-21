/**
 * Content-Addressable Storage (CAS) - Asset Management System
 *
 * A complete image storage and transfer system using:
 * - IndexedDB for persistent storage
 * - SHA-256 hashing for deduplication
 * - ObjectURL caching for fast rendering
 * - Web Workers for non-blocking transfers
 *
 * @version 1.0.0
 */

// ============================================================================
// HASHING MODULE
// ============================================================================

export {
  computeSHA256,
  hashAsset,
  hashFile,
  hashDataURL,
  hashBatch,
  hashDataURLs,
  verifyHash,
  verifyAsset,
  isValidHash,
  getHashValue,
  normalizeHash,
  hashesEqual,
  HASH_PREFIX,
  HASH_ALGORITHM
} from './hashing';

export type {
  HashResult,
  HashInput
} from './hashing';

// ============================================================================
// INDEXEDDB MODULE
// ============================================================================

export {
  assetDB,
  initAssetDB,
  storeAsset,
  storeAssetFromDataURL,
  getAssetAsDataURL,
  storeAssetsBatch,
  findMissingHashes,
  DB_NAME,
  DB_VERSION,
  STORE_ASSETS,
  STORE_METADATA
} from './indexeddb';

export type {
  AssetEntry,
  AssetInfo,
  AssetManifest,
  StorageStats
} from './indexeddb';

// ============================================================================
// ASSET CACHE MODULE
// ============================================================================

export {
  assetCache,
  getAssetURL,
  preloadAssets,
  releaseAsset,
  acquireAsset,
  isAssetCached,
  getCacheStats,
  clearAssetCache,
  startAssetCacheCleanup,
  useAssetURL
} from './assetCache';

export type {
  CacheEntry,
  CacheStats
} from './assetCache';

// ============================================================================
// MIGRATION MODULE
// ============================================================================

export {
  isMigrationNeeded,
  migrateFromOldSystem,
  deleteOldDatabase,
  getMigrationStats,
  autoMigrate,
  rollbackMigration
} from './migration';

export type {
  MigrationResult,
  MigrationProgress,
  MigrationProgressCallback
} from './migration';

// ============================================================================
// SOURCE LOADERS
// ============================================================================

export {
  loadLocalFile,
  loadLocalFiles,
  loadFileList,
  loadFromFileInput,
  filterImageFiles,
  getTotalFileSize,
  formatFileSize
} from './sources/localFileLoader';

export {
  loadFromURL,
  loadFromURLs,
  loadFromURLsConcurrent,
  checkURLAccessible,
  getURLInfo,
  getFilenameFromURL,
  isImageURL
} from './sources/urlLoader';

export {
  loadPack,
  loadPackFromFile,
  listPackContents,
  getPackInfo,
  extractSingleFile,
  isZipFile
} from './sources/packLoader';

export type {
  LoadLocalFileResult,
  LoadLocalFilesResult,
  LoadURLResult,
  LoadURLOptions,
  LoadURLsProgress,
  PackEntry,
  LoadPackResult,
  LoadPackProgress
} from './sources';
