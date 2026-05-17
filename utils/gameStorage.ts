import type { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage, DiceGroup } from '../types';
import type { GameState, ViewTransform } from '../store/GameContext';
import { SCROLLBAR_WIDTH_THICK } from '../constants';
import { logger } from './logger';
import { extractImagesFromState, saveImageCacheToIDB, loadImageCacheFromIDB, getNewImages, ImageCache, clearImageCacheIDB, restoreImagesFromCache, restoreImagesToState, findLocalFilePaths, replaceLocalFilePathsWithBase64, saveSingleImageToIDB, generateImageId, createImageRef, LocalFileReference } from './imageCache';
import * as LZString from 'lz-string';

// Re-export types for use in other modules
export type { LocalFileReference };

const STORAGE_KEY = 'nexus-game-state';
const STORAGE_KEY_COMPRESSED = 'nexus-game-state-compressed';
const STORAGE_VERSION = 8; // Version with new objects and settings (diceGroups, access control, etc.)
const USE_COMPRESSION = true; // Enable compression for localStorage

// In-memory cache for IDB images to avoid repeated reads
let cachedIDBCache: ImageCache | null = null;
let cacheLoadPromise: Promise<ImageCache> | null = null;

/**
 * Get IDB cache from memory or load it once (cached for performance)
 */
async function getOrLoadIDBCache(): Promise<ImageCache> {
  if (cachedIDBCache) {
    return cachedIDBCache;
  }

  if (cacheLoadPromise) {
    return cacheLoadPromise;
  }

  cacheLoadPromise = loadImageCacheFromIDB();
  const cache = await cacheLoadPromise;
  cachedIDBCache = cache;
  cacheLoadPromise = null;

  return cache;
}

/**
 * Invalidate IDB cache (call after saving new images)
 */
function invalidateIDBCache(): void {
  cachedIDBCache = null;
}

interface ViewportInfo {
  width: number;
  height: number;
}

export interface StoredGameState {
  version: number;
  timestamp: number;
  viewport: ViewportInfo;
  state: Partial<GameState>;
}

/**
 * Estimate available localStorage space
 */
function estimateAvailableSpace(): number {
  if (typeof window === 'undefined') return 0;

  try {
    // Try with increasing test sizes
    let testSize = 1024 * 1024; // Start with 1MB
    let testString = '';
    const testKey = '__storage_test__';

    // Clean up any previous test
    localStorage.removeItem(testKey);

    // Binary search for approximate limit
    let min = 0;
    let max = 10 * 1024 * 1024; // 10MB max

    while (min < max) {
      const mid = Math.floor((min + max + 1) / 2);
      testString = new Array(mid + 1).join('x');

      try {
        localStorage.setItem(testKey, testString);
        localStorage.removeItem(testKey);
        min = mid;
      } catch (e) {
        max = mid - 1;
      }
    }

    // Subtract some buffer for safety
    return Math.max(0, min - 100 * 1024); // 100KB buffer
  } catch (error) {
    logger.warn('[QUOTA] Could not estimate available space:', error);
    return 0;
  }
}

/**
 * Compress data using LZString
 */
function compressData(jsonString: string): string {
  try {
    return LZString.compressToUTF16(jsonString);
  } catch (error) {
    logger.error('[COMPRESS] Failed to compress data:', error);
    return jsonString; // Fallback to uncompressed
  }
}

/**
 * Decompress data using LZString
 */
function decompressData(compressedString: string): string | null {
  try {
    const decompressed = LZString.decompressFromUTF16(compressedString);
    if (!decompressed) {
      throw new Error('Decompression returned null');
    }
    return decompressed;
  } catch (error) {
    logger.error('[DECOMPRESS] Failed to decompress data:', error);
    return null; // Indicate failure
  }
}

/**
 * Safely set item in localStorage with quota check
 */
function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // Check if value fits by attempting to set it
    localStorage.setItem(key, value);
    return true;
  } catch (error: any) {
    if (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014) {
      logger.error(`[QUOTA] localStorage quota exceeded when setting key "${key}". Size: ${Math.round(value.length / 1024)}KB`);

      // Try to free up space by removing old versions
      if (key === STORAGE_KEY && localStorage.getItem(STORAGE_KEY_COMPRESSED)) {
        logger.log('[QUOTA] Removing old compressed version to free space');
        localStorage.removeItem(STORAGE_KEY_COMPRESSED);
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (retryError) {
          logger.error('[QUOTA] Still cannot save after cleanup');
        }
      }

      if (key === STORAGE_KEY_COMPRESSED && localStorage.getItem(STORAGE_KEY)) {
        logger.log('[QUOTA] Removing old uncompressed version to free space');
        localStorage.removeItem(STORAGE_KEY);
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (retryError) {
          logger.error('[QUOTA] Still cannot save after cleanup');
        }
      }

      return false;
    }
    throw error;
  }
}

/**
 * Save the current game state to localStorage with viewport info
 */
export const saveGameState = async (state: GameState): Promise<void> => {
  if (typeof window === 'undefined') return;

  try {
    // Filter out main menu panel (each player has their own local position)
    const objectsToSave: Record<string, TableObject> = {};
    Object.entries(state.objects).forEach(([id, obj]) => {
      // Skip main menu panel - it's recreated locally for each player
      if (obj.type === 'PANEL' && (obj as any).panelType === 'MAIN_MENU') {
        return;
      }
      objectsToSave[id] = obj;
    });

    logger.log(`[SAVE] Saving ${Object.keys(objectsToSave).length} objects (filtered from ${Object.keys(state.objects).length} total)`);

    // Debug: log all objects with content
    Object.entries(objectsToSave).forEach(([id, obj]) => {
      if (obj.content) {
        logger.log(`[SAVE] Object ${id} (${obj.type}): content=${obj.content.substring(0, 50)}...`);
      }
    });

    // First: Extract images to cache and save to IndexedDB BEFORE converting to metadata
    // Get existing IDB cache to avoid re-saving images we already have (cached in memory)
    // IMPORTANT: Force reload IDB cache to ensure we have latest images
    cachedIDBCache = null; // Reset to force reload
    cacheLoadPromise = null; // Reset promise
    const existingIDBCache = await getOrLoadIDBCache();

    // IMPORTANT: If state has metadata markers ('D', 'B') instead of actual images,
    // log this so we can debug
    const idbCacheToUse = existingIDBCache;
    const objectsToExtract: Record<string, TableObject> = {};

    // Helper to check for metadata markers in an object
    const hasMetadataMarkers = (obj: any): boolean => {
      if (!obj) return false;
      const checkValue = (val: any): boolean => {
        if (val === 'D' || val === 'B') return true;
        if (typeof val === 'object' && val !== null) {
          for (const v of Object.values(val)) {
            if (checkValue(v)) return true;
          }
        }
        return false;
      };
      return checkValue(obj);
    };

    for (const [id, obj] of Object.entries(objectsToSave)) {
      if (hasMetadataMarkers(obj)) {
        logger.warn('[SAVE] Object has metadata markers (D/B), this indicates a bug:', id);
        // Just pass through - extractImagesToCache should handle it
        objectsToExtract[id] = obj;
      } else {
        objectsToExtract[id] = obj;
      }
    }

    const { state: extractedState, imageCache } = extractImagesFromState({ objects: objectsToExtract }, existingIDBCache);

    // Debug: check if base64 still exists after extraction
    let base64Count = 0;
    let imgRefCount = 0;
    Object.values(extractedState.objects || {}).forEach(obj => {
      const checkValue = (val: any) => {
        if (typeof val === 'string') {
          if (val.startsWith('data:image/')) base64Count++;
          if (val.startsWith('img_ref://')) imgRefCount++;
        } else if (val && typeof val === 'object') {
          Object.values(val).forEach(checkValue);
        }
      };
      Object.values(obj).forEach(checkValue);
    });

    logger.log(`[SAVE] After extraction: ${base64Count} base64 URLs, ${imgRefCount} img_ref:// URLs`);

    // Save ONLY NEW images to IndexedDB (async - don't await to avoid blocking save)
    const newImages = getNewImages(imageCache, existingIDBCache);
    if (Object.keys(newImages).length > 0) {
      saveImageCacheToIDB(newImages)
        .then(() => {
          // Update cache after successful save
          if (cachedIDBCache) {
            Object.assign(cachedIDBCache, newImages);
          }
        })
        .catch(error => {
          logger.error('[SAVE] Failed to save images to IndexedDB:', error);
        });
    }

    // Create stored data structure
    const storedData: StoredGameState = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      state: {
        // Save objects (the main game data) - with img_ref:// URLs
        objects: extractedState.objects || {},
        // Save players
        players: state.players,
        // Save active player ID (so user stays as same role)
        activePlayerId: state.activePlayerId,
        // Save dice rolls
        diceRolls: state.diceRolls,
        // Save view transform (zoom, pan position)
        viewTransform: state.viewTransform,
        // Save drawings
        drawings: state.drawings,
        // Save player permissions
        playerPermissions: state.playerPermissions,
        // Save language
        language: state.language,
        // Save session ID
        sessionId: state.sessionId,
        // Save hyperscale layers
        hyperscaleLayers: state.hyperscaleLayers,
        // Save selected hyperscale layer IDs
        selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds,
        // Save dice groups (NEW in version 8)
        diceGroups: state.diceGroups || [],
        // Save connection lock state (NEW in version 8)
        connectionsLocked: state.connectionsLocked || false,
        // Save last modified player info (NEW in version 8)
        lastModifiedBy: state.lastModifiedBy || 'gm',
        // Save player panel settings (individual panel positions/sizes for each player)
        playerPanelSettings: state.playerPanelSettings || {},
        // Save audit log
        auditLog: state.auditLog || { entries: [], maxEntries: 10000, currentReplayIndex: -1 },
      }
    };

    // Save to localStorage (with compression)
    try {
      const json = JSON.stringify(storedData);

      // Debug: log size of each component
      const size = new Blob([json]).size;

      // Try compressed first if enabled
      let saved = false;
      if (USE_COMPRESSION && size > 1024) { // Only compress if larger than 1KB
        const compressed = compressData(json);
        const compressedSize = compressed.length;
        const compressionRatio = ((size - compressedSize) / size * 100).toFixed(1);

        logger.log(`[SAVE] Original: ${Math.round(size / 1024)}KB, Compressed: ${Math.round(compressedSize / 1024)}KB (${compressionRatio}% reduction)`);

        // Try to save compressed version
        if (safeSetItem(STORAGE_KEY_COMPRESSED, compressed)) {
          // Remove old uncompressed version if it exists
          localStorage.removeItem(STORAGE_KEY);
          saved = true;
          logger.log(`[SAVE] Game saved successfully (compressed)`);
        } else {
          logger.warn('[SAVE] Could not save compressed, trying uncompressed');
        }
      }

      // Fallback to uncompressed if compressed failed or compression is disabled
      if (!saved) {
        if (safeSetItem(STORAGE_KEY, json)) {
          // Remove old compressed version if it exists
          localStorage.removeItem(STORAGE_KEY_COMPRESSED);
          logger.log(`[SAVE] Game saved successfully (uncompressed, ${Math.round(size / 1024)}KB)`);
        } else {
          logger.error(`[SAVE] Failed to save game state - localStorage quota exceeded (${Math.round(size / 1024)}KB)`);
          // Show user-facing warning
          if (typeof window !== 'undefined' && (window as any).nexusShowQuotaWarning) {
            (window as any).nexusShowQuotaWarning(Math.round(size / 1024));
          }
        }
      }
    } catch (error) {
      logger.error('Failed to save game state:', error);
    }
  } catch (error) {
    logger.error('Failed to save game state:', error);
  }
};

/**
 * Information about local file paths found in saved state
 */
export interface LocalFileInfo {
  path: string;
  filename: string;
  objectIds: string[];
  fields: string[];
}

export interface LoadGameStateResult {
  state: Partial<GameState> | null;
  localFiles: LocalFileInfo[];
}

/**
 * Load the game state from localStorage
 * Adapts objects only if user is HOST or playing SOLO
 * @param isGuest Whether the current user is a guest
 */
export const loadGameState = async (
  isGuest: boolean
): Promise<Partial<GameState> | null> => {
  if (typeof window === 'undefined') return null;

  logger.log(`[LOAD] loadGameState called, isGuest=${isGuest}`);

  try {
    // Try compressed version first
    let stored = localStorage.getItem(STORAGE_KEY_COMPRESSED);
    let isCompressed = false;

    // If no compressed version, try uncompressed
    if (!stored) {
      stored = localStorage.getItem(STORAGE_KEY);
      isCompressed = false;
    } else {
      isCompressed = true;
      logger.log('[LOAD] Found compressed save data');
    }

    if (!stored) {
      return null;
    }

    // Check size before parsing
    const storedSize = stored.length;
    if (storedSize > 50 * 1024 * 1024) { // 50MB limit (string length)
      logger.warn(`[LOAD] Saved state too large: ${Math.round(storedSize / 1024 / 1024)}MB. Clearing and returning null.`);
      clearGameState();
      return null;
    }

    // Decompress if needed
    let jsonString = stored;
    if (isCompressed) {
      const decompressed = decompressData(stored);
      if (decompressed === null) {
        logger.error('[LOAD] Failed to decompress saved state, trying uncompressed fallback');
        stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          jsonString = stored;
          isCompressed = false;
        } else {
          logger.warn('[LOAD] No uncompressed fallback available');
          clearGameState();
          return null;
        }
      } else {
        jsonString = decompressed;
        logger.log(`[LOAD] Decompressed: ${Math.round(storedSize / 1024)}KB → ${Math.round(jsonString.length / 1024)}KB`);
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error('[LOAD] Failed to parse saved state:', parseError);
      logger.warn('[LOAD] Clearing corrupted save data.');
      clearGameState();
      return null;
    }

    // Migrate old formats
    if (!parsed.version || parsed.version < 3) {
      return migrateOldFormat(parsed);
    }

    if (parsed.version === 3) {
      // Version 3 had adaptation issues - migrate to version 4
      return migrateVersion3(parsed);
    }

    // Version 4 can be loaded directly (will be converted to newer version on next save)
    if (parsed.version === 4) {
      const data: StoredGameState = parsed;
      // Check if state is too old (more than 7 days)
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (data.timestamp < weekAgo) {
        clearGameState();
        return null;
      }
      const shouldAdapt = !isGuest;
      const adaptedState = shouldAdapt
        ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
        : data.state;
      // Migrate to version 6 by adding hyperscale layers
      return migrateToVersion6(adaptedState);
    }

    // Version 5 migration - add hyperscale layers if missing
    if (parsed.version === 5) {
      const data: StoredGameState = parsed;
      // Check if state is too old (more than 7 days)
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (data.timestamp < weekAgo) {
        clearGameState();
        return null;
      }
      const shouldAdapt = !isGuest;
      const adaptedState = shouldAdapt
        ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
        : data.state;
      // Migrate to version 6 by adding hyperscale layers
      return migrateToVersion6(adaptedState);
    }

    // Version 7 migration - add new fields (diceGroups, connectionsLocked, lastModifiedBy, etc.)
    if (parsed.version === 7) {
      const data: StoredGameState = parsed;
      // Check if state is too old (more than 7 days)
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (data.timestamp < weekAgo) {
        clearGameState();
        return null;
      }
      const shouldAdapt = !isGuest;
      const adaptedState = shouldAdapt
        ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
        : data.state;

      // Migrate to version 8 by adding new fields
      return migrateToVersion8(adaptedState);
    }

    const data: StoredGameState = parsed;

    // Check version
    if (data.version !== STORAGE_VERSION) {
      logger.warn(`[LOAD] Unsupported save version: ${data.version} (current: ${STORAGE_VERSION})`);
      clearGameState();
      return null;
    }

    // Check if state is too old (more than 7 days)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (data.timestamp < weekAgo) {
      clearGameState();
      return null;
    }

    // If guest - DON'T adapt objects (host controls their position)
    // If host or solo game - adapt objects to new screen size
    const shouldAdapt = !isGuest;

    const adaptedState = shouldAdapt
      ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
      : data.state;

    // Ensure auditLog exists (for version 8 saves before auditLog was added)
    const withAuditLog = {
      ...adaptedState,
      auditLog: adaptedState.auditLog || { entries: [], maxEntries: 10000, currentReplayIndex: -1 },
    };

    // Load images from IDB and restore them to state
    const idbCache = await loadImageCacheFromIDB();
    logger.log(`[LOAD] Loaded ${Object.keys(idbCache).length} images from IndexedDB`);

    // Check for any img_ref:// URLs that couldn't be restored
    const checkForUnrestored = (obj: any, path = ''): void => {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.startsWith('img_ref://')) {
          logger.log(`[LOAD] Found unrestored img_ref:// at ${path}.${key}: ${value}`);
        } else if (value && typeof value === 'object') {
          checkForUnrestored(value, `${path}.${key}`);
        }
      }
    };

    if (Object.keys(idbCache).length > 0) {
      const restoredState = restoreImagesToState(withAuditLog, idbCache);
      // Check for any unrestored img_ref:// URLs
      checkForUnrestored(restoredState.objects, 'objects');
      return restoredState;
    }

    // Even with empty cache, check for unrestored URLs
    checkForUnrestored(withAuditLog.objects, 'objects');

    return withAuditLog;
  } catch (error) {
    logger.error('[LOAD_STATE] Failed to load game state:', error);
    return null;
  }
};

/**
 * Load game state and return information about local file paths that need restoration
 * This is an extended version of loadGameState that also detects local file paths
 * @param isGuest Whether the current user is a guest
 */
export const loadGameStateWithLocalFiles = async (
  isGuest: boolean
): Promise<LoadGameStateResult> => {
  const state = await loadGameState(isGuest);

  if (!state || !state.objects) {
    return { state, localFiles: [] };
  }

  // Find all local file paths in objects
  const localFilesMap = findLocalFilePaths(state.objects);
  const localFiles: LocalFileInfo[] = Array.from(localFilesMap.values());

  if (localFiles.length > 0) {
    logger.log(`[LOAD] Found ${localFiles.length} local file references that need restoration`);
    localFiles.forEach(file => {
      logger.log(`  - ${file.filename} (${file.objectIds.length} objects)`);
    });
  }

  return { state, localFiles };
};

/**
 * Process uploaded local files and update state with base64 data
 * @param state The loaded game state
 * @param localFiles List of local file info
 * @param fileMap Map of filename -> File object (user selected files)
 */
export const processUploadedLocalFiles = async (
  state: Partial<GameState>,
  localFiles: LocalFileInfo[],
  fileMap: Map<string, File>
): Promise<Partial<GameState>> => {
  if (!state.objects) return state;

  // Convert files to base64 and save to IDB
  const pathToBase64 = new Map<string, string>();

  for (const localFile of localFiles) {
    const file = fileMap.get(localFile.filename);
    if (!file) continue;

    try {
      const base64 = await fileToBase64(file);

      // Save to IndexedDB for persistence
      const imageId = generateImageId();
      const imgRefUrl = createImageRef(imageId);
      await saveSingleImageToIDB(imageId, base64);

      // Map the original path to img_ref URL
      pathToBase64.set(localFile.path, imgRefUrl);

      logger.log(`[LOAD] Saved local file ${localFile.filename} to cache as ${imageId}`);
    } catch (error) {
      logger.error(`[LOAD] Failed to process file ${localFile.filename}:`, error);
    }
  }

  // Replace local paths with img_ref URLs in state
  const updatedObjects = replaceLocalFilePathsWithBase64(state.objects, pathToBase64);

  return {
    ...state,
    objects: updatedObjects
  };
};

/**
 * Convert File to base64 data URL
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Migrate old format (versions < 3)
 */
function migrateOldFormat(parsed: any): Partial<GameState> | null {
  try {
    // Old format might be wrapped in viewportAdapter structure
    if (parsed.state && parsed.state.state) {
      return parsed.state.state;
    }
    if (parsed.state) {
      return parsed.state;
    }
    return parsed;
  } catch (e) {
    logger.error('Failed to migrate old format:', e);
    return null;
  }
}

/**
 * Migrate from version 3 (which adapted all objects including pinned ones)
 */
function migrateVersion3(parsed: any): Partial<GameState> | null {
  // Version 3 already adapted state, just return it as is
  // But will update version on next save
  if (parsed.state) {
    return parsed.state;
  }
  return parsed;
}

/**
 * Migrate from version 7 to version 8 (add diceGroups, connectionsLocked, lastModifiedBy, etc.)
 */
function migrateToVersion8(state: Partial<GameState>): Partial<GameState> {
  const migrated = { ...state };

  // Add diceGroups if missing (NEW in version 8)
  if (!migrated.diceGroups) {
    migrated.diceGroups = [];
  }

  // Add connectionsLocked if missing (NEW in version 8)
  if (migrated.connectionsLocked === undefined) {
    migrated.connectionsLocked = false;
  }

  // Add lastModifiedBy if missing (NEW in version 8)
  if (!migrated.lastModifiedBy) {
    migrated.lastModifiedBy = 'gm';
  }

  // Ensure all hyperscale layers have zoomEnabled field
  if (migrated.hyperscaleLayers) {
    migrated.hyperscaleLayers = migrated.hyperscaleLayers.map(layer => ({
      ...layer,
      zoomEnabled: layer.zoomEnabled ?? (layer.id !== 'interface')
    }));
  }

  // Add 'drawings' layer to hyperscale layers if missing (NEW in version 8)
  const hasDrawingsLayer = migrated.hyperscaleLayers?.some(layer => layer.id === 'drawings');
  if (!hasDrawingsLayer && migrated.hyperscaleLayers) {
    migrated.hyperscaleLayers.push({
      id: 'drawings',
      name: 'Drawings',
      minZIndex: 6001,
      maxZIndex: 7000,
      color: '#ec4899',
      playerCanSelect: true,
      playerCanView: true,
      individualPosition: true,
      individualObjects: false,
      zoomEnabled: true,
      order: 3
    });

    // Update selected layer IDs to include 'drawings'
    if (migrated.selectedHyperscaleLayerIds) {
      if (!migrated.selectedHyperscaleLayerIds.includes('drawings')) {
        migrated.selectedHyperscaleLayerIds = [...migrated.selectedHyperscaleLayerIds, 'drawings'];
      }
    }
  }

  // Migrate players: add hand access permissions if missing (NEW in version 8)
  if (migrated.players) {
    migrated.players = migrated.players.map(player => ({
      ...player,
      handVisibleToPlayerIds: player.handVisibleToPlayerIds || [],
      handManageableByPlayerIds: player.handManageableByPlayerIds || []
    }));
  }

  // Add auditLog if missing (NEW in version 8)
  if (!migrated.auditLog) {
    migrated.auditLog = {
      entries: [],
      maxEntries: 10000,
      currentReplayIndex: -1,
    };
  }

  // Migrate objects: ensure access control fields exist (NEW in version 8)
  if (migrated.objects) {
    const migratedObjects: Record<string, TableObject> = {};
    Object.entries(migrated.objects).forEach(([id, obj]) => {
      const migratedObj = { ...obj };

      // Ensure panels have proper access control
      if (obj.type === 'PANEL') {
        const panel = obj as any;

        // Ensure poolData has proper access control for tabs
        if (panel.poolData?.tabs) {
          panel.poolData.tabs = panel.poolData.tabs.map((tab: any) => ({
            ...tab,
            visibleToPlayerIds: tab.visibleToPlayerIds || [],
            manageableByPlayerIds: tab.manageableByPlayerIds || [],
            editableByPlayerIds: tab.editableByPlayerIds || []
          }));
        }

        // Ensure characterData has proper access control for characters
        if (panel.characterData?.characters) {
          panel.characterData.characters = panel.characterData.characters.map((character: any) => ({
            ...character,
            visibleToPlayerIds: character.visibleToPlayerIds || [],
            manageableByPlayerIds: character.manageableByPlayerIds || [],
            editableByPlayerIds: character.editableByPlayerIds || []
          }));
        }
      }

      // Ensure dice objects have diceGroupId field (for linking to groups)
      if (obj.type === 'DICE_OBJECT') {
        const dice = obj as any;
        if (dice.diceGroupId === undefined) {
          migratedObj.diceGroupId = null;
        }
        if (dice.fromPoolPanel === undefined) {
          migratedObj.fromPoolPanel = null;
        }
      }

      // Ensure tokens and token types have border settings (NEW in version 8)
      if (obj.type === 'TOKEN' || obj.type === 'TOKEN_TYPE') {
        const token = obj as any;
        if (token.borderColor === undefined) {
          (migratedObj as any).borderColor = '#ffffff';
        }
        if (token.borderWidth === undefined) {
          (migratedObj as any).borderWidth = 2;
        }
      }

      // Ensure decks have border settings (NEW in version 8)
      if (obj.type === 'DECK') {
        const deck = obj as any;
        if (deck.borderColor === undefined) {
          (migratedObj as any).borderColor = '#64748b';
        }
        if (deck.borderWidth === undefined) {
          (migratedObj as any).borderWidth = 2;
        }
      }

      migratedObjects[id] = migratedObj;
    });

    migrated.objects = migratedObjects;
  }

  logger.log('[MIGRATION] Migrated from version 7 to version 8:');
  logger.log('  - Added diceGroups support');
  logger.log('  - Added connectionsLocked field');
  logger.log('  - Added lastModifiedBy field');
  logger.log('  - Added drawings hyperscale layer');
  logger.log('  - Added hand access permissions for players');
  logger.log('  - Added access control for panel tabs and characters');
  logger.log('  - Added border settings (borderColor/borderWidth) for tokens and decks');
  logger.log('  - Added auditLog support');

  return migrated;
}

/**
 * Migrate from version 5 to version 6 (add hyperscale layers)
 */
function migrateToVersion6(state: Partial<GameState>): Partial<GameState> {
  const migrated = { ...state };

  // Add hyperscale layers if missing
  if (!migrated.hyperscaleLayers || migrated.hyperscaleLayers.length === 0) {
    migrated.hyperscaleLayers = [
      {
        id: 'boards',
        name: 'Game Boards',
        minZIndex: 1,
        maxZIndex: 1000,
        color: '#3b82f6',
        playerCanSelect: true,
        playerCanView: true,
        individualPosition: false,
        individualObjects: false,
        zoomEnabled: true,
        order: 0
      },
      {
        id: 'cards',
        name: 'Cards',
        minZIndex: 1001,
        maxZIndex: 3000,
        color: '#f59e0b',
        playerCanSelect: true,
        playerCanView: true,
        individualPosition: false,
        individualObjects: false,
        zoomEnabled: true,
        order: 1
      },
      {
        id: 'tokens',
        name: 'Tokens',
        minZIndex: 3001,
        maxZIndex: 6000,
        color: '#10b981',
        playerCanSelect: true,
        playerCanView: true,
        individualPosition: false,
        individualObjects: false,
        zoomEnabled: true,
        order: 2
      },
      {
        id: 'interface',
        name: 'Interface',
        minZIndex: 9001,
        maxZIndex: 10000,
        color: '#8b5cf6',
        playerCanSelect: true,
        playerCanView: false,
        individualPosition: false,
        individualObjects: false,
        zoomEnabled: false,
        order: 3
      }
    ];
  }

  // Migrate: Add zoomEnabled to existing layers that don't have it
  migrated.hyperscaleLayers = migrated.hyperscaleLayers.map(layer => ({
    ...layer,
    zoomEnabled: layer.zoomEnabled ?? (layer.id !== 'interface')
  }));

  // Add selected layer IDs if missing
  if (!migrated.selectedHyperscaleLayerIds || migrated.selectedHyperscaleLayerIds.length === 0) {
    migrated.selectedHyperscaleLayerIds = ['boards', 'cards', 'tokens', 'interface'];
  }

  return migrated;
}

/**
 * Adapt game state to new screen size
 *
 * IMPORTANT: This function is ONLY called for host or solo game
 * Guests don't adapt objects - their position is controlled by host
 *
 * VU (Virtual Units) are screen-independent - they should NOT be scaled!
 * Only viewport-pinned objects use screen coordinates and need adjustment.
 * The camera (viewTransform) adjusts to keep the same visual view.
 */
function adaptStateToViewport(
  savedState: Partial<GameState>,
  savedViewport: ViewportInfo,
  currentWidth: number,
  currentHeight: number
): Partial<GameState> {
  const newState = { ...savedState };

  // Check if adaptation is needed
  const needsAdaptation =
    savedViewport.width !== currentWidth ||
    savedViewport.height !== currentHeight;

  if (!needsAdaptation) {
    return newState;
  }

  logger.log(`Adapting game state from ${savedViewport.width}x${savedViewport.height} to ${currentWidth}x${currentHeight}`);

  // VU coordinates are screen-independent - DON'T scale them!
  // Only adapt viewport-pinned objects (they use screen coordinates)
  if (newState.objects) {
    const adaptedObjects: Record<string, TableObject> = {};

    Object.entries(newState.objects).forEach(([id, obj]: [string, any]) => {
      const adaptedObj = { ...obj };

      if (obj.isPinnedToViewport) {
        // Pinned objects use screen coordinates - need to adjust for screen size change
        // Keep relative position the same (e.g., if it was at 50% of screen width, keep it there)
        const relativeX = obj.x / savedViewport.width;
        const relativeY = obj.y / savedViewport.height;

        adaptedObj.x = relativeX * currentWidth;
        adaptedObj.y = relativeY * currentHeight;

        // Ensure object stays within screen bounds
        if (adaptedObj.x + (obj.width || 100) > currentWidth) {
          adaptedObj.x = currentWidth - (obj.width || 100) - SCROLLBAR_WIDTH_THICK;
        }
        if (adaptedObj.y + (obj.height || 100) > currentHeight - SCROLLBAR_WIDTH_THICK) {
          adaptedObj.y = currentHeight - (obj.height || 100) - SCROLLBAR_WIDTH_THICK;
        }

        // Adapt pinnedScreenPosition if present
        if (obj.pinnedScreenPosition) {
          const pinnedRelativeX = obj.pinnedScreenPosition.x / savedViewport.width;
          const pinnedRelativeY = obj.pinnedScreenPosition.y / savedViewport.height;
          adaptedObj.pinnedScreenPosition = {
            x: pinnedRelativeX * currentWidth,
            y: pinnedRelativeY * currentHeight
          };
        }

        // Adapt expandedPinnedPosition if present
        if (obj.expandedPinnedPosition) {
          const expandedRelativeX = obj.expandedPinnedPosition.x / savedViewport.width;
          const expandedRelativeY = obj.expandedPinnedPosition.y / savedViewport.height;
          adaptedObj.expandedPinnedPosition = {
            x: expandedRelativeX * currentWidth,
            y: expandedRelativeY * currentHeight
          };
        }

        // Adapt collapsedPinnedPosition if present
        if (obj.collapsedPinnedPosition) {
          const collapsedRelativeX = obj.collapsedPinnedPosition.x / savedViewport.width;
          const collapsedRelativeY = obj.collapsedPinnedPosition.y / savedViewport.height;
          adaptedObj.collapsedPinnedPosition = {
            x: collapsedRelativeX * currentWidth,
            y: collapsedRelativeY * currentHeight
          };
        }
      }
      // Regular objects: keep VU coordinates unchanged! They're screen-independent.

      adaptedObjects[id] = adaptedObj;
    });

    newState.objects = adaptedObjects;
  }

  // ViewTransform stores VU coordinates - don't scale them!
  // The visual appearance will be correct because VU is screen-independent
  // No changes needed to viewTransform

  return newState;
}

/**
 * Clear the saved game state from localStorage
 */
export const clearGameState = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_COMPRESSED);
  } catch (error) {
    logger.error('Failed to clear game state:', error);
  }
};

/**
 * Clear ALL saved data (game state, local settings, peer cache, etc.)
 * This completely resets the application to initial state
 */
export const clearAllData = (): void => {
  if (typeof window === 'undefined') return;

  try {
    // Clear game state (both compressed and uncompressed)
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_COMPRESSED);

    // Clear local settings
    localStorage.removeItem('nexus-local-settings');

    // Clear language preference
    localStorage.removeItem('app-language');

    // Clear any PeerJS-related data that might be cached
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('peerjs')) {
        localStorage.removeItem(key);
      }
    });

    // Clear IndexedDB (this is where large images are cached!)
    clearImageCacheIDB().catch(error => {
      logger.error('[CLEAR] Failed to clear IndexedDB:', error);
    });

    // Clear URL parameters to reset guest/host state
    if (window.location.search.includes('hostId')) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }

    logger.log('[CLEAR] All data cleared successfully');
  } catch (error) {
    logger.error('[CLEAR] Failed to clear all data:', error);
  }
};

/**
 * Check if there is a saved game state
 */
export const hasSavedGameState = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    return !!(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY_COMPRESSED));
  } catch (error) {
    return false;
  }
};

/**
 * Check if game state is too large for localStorage (simplified check)
 */
export const isGameStateTooLarge = (state: GameState): { tooLarge: boolean; reason?: string; recommendation?: string } => {
  if (typeof window === 'undefined') return { tooLarge: false };

  try {
    const objectCount = Object.keys(state.objects).length;

    // Simple check: too many objects might indicate large images
    if (objectCount > 1000) {
      return {
        tooLarge: true,
        reason: `Too many objects (${objectCount}). Consider using packs for large games.`,
        recommendation: 'Use "Create Pack" for large games with many images'
      };
    }

    return { tooLarge: false };
  } catch (error) {
    return { tooLarge: true, reason: 'Cannot analyze game state' };
  }
};

/**
 * Get the timestamp of the saved game state
 * Returns null if no saved state exists
 */
export const getSavedGameTimestamp = (): number | null => {
  if (typeof window === 'undefined') return null;

  try {
    let stored = localStorage.getItem(STORAGE_KEY_COMPRESSED);

    // Try uncompressed if compressed not found
    if (!stored) {
      stored = localStorage.getItem(STORAGE_KEY);
    }

    if (!stored) return null;

    // Decompress if needed
    let jsonString = stored;
    if (stored !== localStorage.getItem(STORAGE_KEY) && localStorage.getItem(STORAGE_KEY_COMPRESSED) === stored) {
      const decompressed = decompressData(stored);
      if (decompressed === null) {
        // Try uncompressed fallback
        const fallback = localStorage.getItem(STORAGE_KEY);
        if (fallback) {
          jsonString = fallback;
        } else {
          return null;
        }
      } else {
        jsonString = decompressed;
      }
    }

    const data: StoredGameState = JSON.parse(jsonString);
    return data.timestamp;
  } catch (error) {
    return null;
  }
};

/**
 * Format timestamp to readable date/time
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};
