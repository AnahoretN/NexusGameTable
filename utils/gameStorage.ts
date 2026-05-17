/**
 * Game State Storage with Image Reference System
 *
 * NEW ARCHITECTURE:
 * - State ALWAYS contains img_ref:// URLs (never base64 in memory)
 * - Images stored in IndexedDB with ID-based lookup
 * - Components use useImageUrl() hook to resolve img_ref:// to displayable URLs
 * - Managed cache provides fast in-memory access to frequently used images
 */

import type { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage, DiceGroup } from '../types';
import type { GameState, ViewTransform } from '../store/GameContext';
import { SCROLLBAR_WIDTH_THICK } from '../constants';
import { logger } from './logger';
import {
  extractImagesFromState,
  saveImageCacheToIDB,
  loadImageCacheFromIDB,
  getNewImages,
  ImageCache,
  clearImageCacheIDB,
  findLocalFilePaths,
  replaceLocalFilePathsWithBase64,
  saveSingleImageToIDB,
  generateImageId,
  createImageRef,
  addToManagedCache,
  getManagedCacheStats
} from './imageCache';
import * as LZString from 'lz-string';

// Re-export types for use in other modules
export type { LocalFileReference } from './imageCache';

const STORAGE_KEY = 'nexus-game-state';
const STORAGE_KEY_COMPRESSED = 'nexus-game-state-compressed';
const STORAGE_VERSION = 8; // Version with new objects and settings (diceGroups, access control, etc.)
const USE_COMPRESSION = true; // Enable compression for localStorage

// In-memory cache for IDB images to avoid repeated reads
let cachedIDBCache: ImageCache | null = null;
let cacheLoadPromise: Promise<ImageCache> | null = null;
let isCacheInitialized = false;

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
  isCacheInitialized = true;

  return cache;
}

/**
 * Invalidate IDB cache (call after saving new images)
 */
function invalidateIDBCache(): void {
  cachedIDBCache = null;
}

/**
 * Initialize managed cache from IndexedDB on startup
 * This ensures all images are available for components to use via useImageUrl
 */
export async function initializeImageCache(): Promise<void> {
  if (isCacheInitialized) {
    return;
  }

  try {
    const idbCache = await loadImageCacheFromIDB();
    const imageCount = Object.keys(idbCache).length;

    if (imageCount > 0) {
      // Populate managed cache
      for (const [imageId, data] of Object.entries(idbCache)) {
        addToManagedCache(imageId, data);
      }

      cachedIDBCache = idbCache;
      isCacheInitialized = true;

      const stats = getManagedCacheStats();
      logger.log(`[STORAGE] Initialized image cache: ${imageCount} images, ${stats.totalSizeMB}MB`);
    } else {
      logger.log('[STORAGE] No cached images found in IndexedDB');
      isCacheInitialized = true;
    }
  } catch (error) {
    logger.error('[STORAGE] Failed to initialize image cache:', error);
    isCacheInitialized = true; // Don't retry on failure
  }
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
    logger.error('[DECOMPRESS] Failed to decompress saved state:', error);
    return null; // Indicate failure
  }
}

/**
 * Safely set item in localStorage with quota check
 */
function safeSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
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
 * Save the current game state to localStorage
 *
 * NEW ARCHITECTURE:
 * 1. Extract any base64 images from state and replace with img_ref:// URLs
 * 2. Save new images to IndexedDB
 * 3. Save state (with img_ref:// URLs) to localStorage
 */
export const saveGameState = async (state: GameState): Promise<void> => {
  if (typeof window === 'undefined') return;

  try {
    // Filter out main menu panel (each player has their own local position)
    const objectsToSave: Record<string, TableObject> = {};
    Object.entries(state.objects).forEach(([id, obj]) => {
      if (obj.type === 'PANEL' && (obj as any).panelType === 'MAIN_MENU') {
        return;
      }
      objectsToSave[id] = obj;
    });

    // Get existing IDB cache to avoid re-saving images we already have
    const existingIDBCache = await getOrLoadIDBCache();

    // Extract images: replace base64 with img_ref:// URLs
    const { state: extractedState, imageCache } = extractImagesFromState(
      { objects: objectsToSave },
      existingIDBCache
    );

    // Verify extraction worked (no base64 should remain)
    let foundBase64InExtracted = 0;
    for (const obj of Object.values(extractedState.objects || {})) {
      const objJson = JSON.stringify(obj);
      foundBase64InExtracted += (objJson.match(/data:image\//g) || []).length;
    }

    if (foundBase64InExtracted > 0) {
      logger.error(`[SAVE] ERROR: ${foundBase64InExtracted} base64 images found AFTER extraction!`);
      logger.error(`[SAVE] This indicates a bug in extractImagesFromState. Skipping save.`);
      return;
    }

    // Save ONLY NEW images to IndexedDB
    const newImages = getNewImages(imageCache, existingIDBCache);
    if (Object.keys(newImages).length > 0) {
      try {
        await saveImageCacheToIDB(newImages);

        // Update in-memory cache
        for (const [imageId, data] of Object.entries(newImages)) {
          addToManagedCache(imageId, data);
        }

        // Update cached IDB cache
        if (cachedIDBCache) {
          Object.assign(cachedIDBCache, newImages);
        }

        logger.log(`[SAVE] Saved ${Object.keys(newImages).length} new images to IndexedDB`);
      } catch (error) {
        logger.error('[SAVE] Failed to save images to IndexedDB:', error);
      }
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
        // Save objects with img_ref:// URLs (NOT base64!)
        objects: extractedState.objects || {},
        players: state.players,
        activePlayerId: state.activePlayerId,
        diceRolls: state.diceRolls,
        viewTransform: state.viewTransform,
        drawings: state.drawings,
        playerPermissions: state.playerPermissions,
        language: state.language,
        sessionId: state.sessionId,
        hyperscaleLayers: state.hyperscaleLayers,
        selectedHyperscaleLayerIds: state.selectedHyperscaleLayerIds,
        diceGroups: state.diceGroups || [],
        connectionsLocked: state.connectionsLocked || false,
        lastModifiedBy: state.lastModifiedBy || 'gm',
        playerPanelSettings: state.playerPanelSettings || {},
        auditLog: state.auditLog || { entries: [], maxEntries: 10000, currentReplayIndex: -1 },
      }
    };

    // Save to localStorage
    const json = JSON.stringify(storedData);
    const size = new Blob([json]).size;

    // Log save size for monitoring
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    const objectCount = Object.keys(storedData.state.objects || {}).length;
    logger.log(`[SAVE] Saving ${objectCount} objects, size: ${sizeMB}MB`);

    // Warn if size is abnormally large (> 5MB indicates base64 leak)
    if (size > 5 * 1024 * 1024) {
      logger.warn(`[SAVE] WARNING: Large save size (${sizeMB}MB) - may indicate base64 images embedded!`);
    }

    // Try compressed first
    let saved = false;
    if (USE_COMPRESSION && size > 1024) {
      const compressed = compressData(json);
      if (safeSetItem(STORAGE_KEY_COMPRESSED, compressed)) {
        localStorage.removeItem(STORAGE_KEY);
        saved = true;
        logger.log(`[SAVE] Saved compressed (${Math.round(compressed.length / 1024)}KB)`);
      }
    }

    // Fallback to uncompressed
    if (!saved) {
      if (safeSetItem(STORAGE_KEY, json)) {
        localStorage.removeItem(STORAGE_KEY_COMPRESSED);
        logger.log('[SAVE] Saved uncompressed');
      } else {
        logger.error('[SAVE] Failed to save - quota exceeded');
      }
    }
  } catch (error) {
    logger.error('[SAVE] Failed to save game state:', error);
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
 *
 * NEW ARCHITECTURE:
 * 1. Load state from localStorage (contains img_ref:// URLs)
 * 2. Load images from IndexedDB into managed cache
 * 3. Return state with img_ref:// URLs intact (NOT replaced with base64)
 *
 * Components will use useImageUrl() to resolve img_ref:// URLs as needed
 */
export const loadGameState = async (
  isGuest: boolean
): Promise<Partial<GameState> | null> => {
  if (typeof window === 'undefined') return null;

  try {
    // Try compressed version first
    let stored = localStorage.getItem(STORAGE_KEY_COMPRESSED);
    let isCompressed = !!stored;

    // If no compressed version, try uncompressed
    if (!stored) {
      stored = localStorage.getItem(STORAGE_KEY);
    }

    if (!stored) {
      return null;
    }

    // Check size before parsing
    const storedSize = stored.length;
    if (storedSize > 50 * 1024 * 1024) { // 50MB limit
      logger.warn(`[LOAD] Saved state too large: ${Math.round(storedSize / 1024 / 1024)}MB. Clearing.`);
      clearGameState();
      return null;
    }

    // Decompress if needed
    let jsonString = stored;
    if (isCompressed) {
      const decompressed = decompressData(stored);
      if (!decompressed) {
        logger.warn('[LOAD] Failed to decompress, trying uncompressed');
        stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          jsonString = stored;
          isCompressed = false;
        } else {
          clearGameState();
          return null;
        }
      } else {
        jsonString = decompressed;
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      logger.error('[LOAD] Failed to parse saved state:', parseError);
      clearGameState();
      return null;
    }

    // Migrate old formats
    if (!parsed.version || parsed.version < 3) {
      return migrateOldFormat(parsed);
    }

    if (parsed.version === 3) {
      return migrateVersion3(parsed);
    }

    if (parsed.version === 4) {
      const data: StoredGameState = parsed;
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (data.timestamp < weekAgo) {
        clearGameState();
        return null;
      }
      const shouldAdapt = !isGuest;
      const adaptedState = shouldAdapt
        ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
        : data.state;
      return migrateToVersion6(adaptedState);
    }

    if (parsed.version === 5) {
      const data: StoredGameState = parsed;
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (data.timestamp < weekAgo) {
        clearGameState();
        return null;
      }
      const shouldAdapt = !isGuest;
      const adaptedState = shouldAdapt
        ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
        : data.state;
      return migrateToVersion6(adaptedState);
    }

    if (parsed.version === 7) {
      const data: StoredGameState = parsed;
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      if (data.timestamp < weekAgo) {
        clearGameState();
        return null;
      }
      const shouldAdapt = !isGuest;
      const adaptedState = shouldAdapt
        ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
        : data.state;
      return migrateToVersion8(adaptedState);
    }

    const data: StoredGameState = parsed;

    if (data.version !== STORAGE_VERSION) {
      logger.warn(`[LOAD] Unsupported save version: ${data.version}`);
      clearGameState();
      return null;
    }

    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (data.timestamp < weekAgo) {
      clearGameState();
      return null;
    }

    const shouldAdapt = !isGuest;
    const adaptedState = shouldAdapt
      ? adaptStateToViewport(data.state, data.viewport, window.innerWidth, window.innerHeight)
      : data.state;

    const withAuditLog = {
      ...adaptedState,
      auditLog: adaptedState.auditLog || { entries: [], maxEntries: 10000, currentReplayIndex: -1 },
    };

    // Load images from IDB into managed cache
    // DO NOT replace img_ref:// URLs in state - keep them as-is
    const idbCache = await loadImageCacheFromIDB();
    if (Object.keys(idbCache).length > 0) {
      for (const [imageId, data] of Object.entries(idbCache)) {
        addToManagedCache(imageId, data);
      }
      logger.log(`[LOAD] Loaded ${Object.keys(idbCache).length} images to managed cache`);
    }

    // Return state with img_ref:// URLs intact
    return withAuditLog;
  } catch (error) {
    logger.error('[LOAD] Failed to load game state:', error);
    return null;
  }
};

/**
 * Load game state and detect local file paths
 */
export const loadGameStateWithLocalFiles = async (
  isGuest: boolean
): Promise<LoadGameStateResult> => {
  const state = await loadGameState(isGuest);

  if (!state || !state.objects) {
    return { state, localFiles: [] };
  }

  const localFilesMap = findLocalFilePaths(state.objects);
  const localFiles: LocalFileInfo[] = Array.from(localFilesMap.values());

  return { state, localFiles };
};

/**
 * Process uploaded local files and replace with img_ref:// URLs
 */
export const processUploadedLocalFiles = async (
  state: Partial<GameState>,
  localFiles: LocalFileInfo[],
  fileMap: Map<string, File>
): Promise<Partial<GameState>> => {
  if (!state.objects) return state;

  const pathToImgRef = new Map<string, string>();

  for (const localFile of localFiles) {
    const file = fileMap.get(localFile.filename);
    if (!file) continue;

    try {
      const base64 = await fileToBase64(file);
      const imageId = generateImageId();
      const imgRefUrl = createImageRef(imageId);

      await saveSingleImageToIDB(imageId, base64);
      addToManagedCache(imageId, base64);

      pathToImgRef.set(localFile.path, imgRefUrl);
    } catch (error) {
      logger.error(`[LOAD] Failed to process file ${localFile.filename}:`, error);
    }
  }

  const updatedObjects = replaceLocalFilePathsWithBase64(state.objects, pathToImgRef);

  return {
    ...state,
    objects: updatedObjects
  };
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// MIGRATION FUNCTIONS
// ============================================================

function migrateOldFormat(parsed: any): Partial<GameState> | null {
  try {
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

function migrateVersion3(parsed: any): Partial<GameState> | null {
  if (parsed.state) {
    return parsed.state;
  }
  return parsed;
}

function migrateToVersion8(state: Partial<GameState>): Partial<GameState> {
  const migrated = { ...state };

  if (!migrated.diceGroups) {
    migrated.diceGroups = [];
  }

  if (migrated.connectionsLocked === undefined) {
    migrated.connectionsLocked = false;
  }

  if (!migrated.lastModifiedBy) {
    migrated.lastModifiedBy = 'gm';
  }

  if (migrated.hyperscaleLayers) {
    migrated.hyperscaleLayers = migrated.hyperscaleLayers.map(layer => ({
      ...layer,
      zoomEnabled: layer.zoomEnabled ?? (layer.id !== 'interface')
    }));
  }

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

    if (migrated.selectedHyperscaleLayerIds) {
      if (!migrated.selectedHyperscaleLayerIds.includes('drawings')) {
        migrated.selectedHyperscaleLayerIds = [...migrated.selectedHyperscaleLayerIds, 'drawings'];
      }
    }
  }

  if (migrated.players) {
    migrated.players = migrated.players.map(player => ({
      ...player,
      handVisibleToPlayerIds: player.handVisibleToPlayerIds || [],
      handManageableByPlayerIds: player.handManageableByPlayerIds || []
    }));
  }

  if (!migrated.auditLog) {
    migrated.auditLog = {
      entries: [],
      maxEntries: 10000,
      currentReplayIndex: -1,
    };
  }

  if (migrated.objects) {
    const migratedObjects: Record<string, TableObject> = {};
    Object.entries(migrated.objects).forEach(([id, obj]) => {
      const migratedObj = { ...obj };

      if (obj.type === 'PANEL') {
        const panel = obj as any;

        if (panel.poolData?.tabs) {
          panel.poolData.tabs = panel.poolData.tabs.map((tab: any) => ({
            ...tab,
            visibleToPlayerIds: tab.visibleToPlayerIds || [],
            manageableByPlayerIds: tab.manageableByPlayerIds || [],
            editableByPlayerIds: tab.editableByPlayerIds || []
          }));
        }

        if (panel.characterData?.characters) {
          panel.characterData.characters = panel.characterData.characters.map((character: any) => ({
            ...character,
            visibleToPlayerIds: character.visibleToPlayerIds || [],
            manageableByPlayerIds: character.manageableByPlayerIds || [],
            editableByPlayerIds: character.editableByPlayerIds || []
          }));
        }
      }

      if (obj.type === 'DICE_OBJECT') {
        const dice = obj as any;
        if (dice.diceGroupId === undefined) {
          migratedObj.diceGroupId = null;
        }
        if (dice.fromPoolPanel === undefined) {
          migratedObj.fromPoolPanel = null;
        }
      }

      if (obj.type === 'TOKEN' || obj.type === 'TOKEN_TYPE') {
        const token = obj as any;
        if (token.borderColor === undefined) {
          (migratedObj as any).borderColor = '#ffffff';
        }
        if (token.borderWidth === undefined) {
          (migratedObj as any).borderWidth = 2;
        }
      }

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

  return migrated;
}

function migrateToVersion6(state: Partial<GameState>): Partial<GameState> {
  const migrated = { ...state };

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

  migrated.hyperscaleLayers = migrated.hyperscaleLayers.map(layer => ({
    ...layer,
    zoomEnabled: layer.zoomEnabled ?? (layer.id !== 'interface')
  }));

  if (!migrated.selectedHyperscaleLayerIds || migrated.selectedHyperscaleLayerIds.length === 0) {
    migrated.selectedHyperscaleLayerIds = ['boards', 'cards', 'tokens', 'interface'];
  }

  return migrated;
}

function adaptStateToViewport(
  savedState: Partial<GameState>,
  savedViewport: ViewportInfo,
  currentWidth: number,
  currentHeight: number
): Partial<GameState> {
  const newState = { ...savedState };

  const needsAdaptation =
    savedViewport.width !== currentWidth ||
    savedViewport.height !== currentHeight;

  if (!needsAdaptation) {
    return newState;
  }

  if (newState.objects) {
    const adaptedObjects: Record<string, TableObject> = {};

    Object.entries(newState.objects).forEach(([id, obj]: [string, any]) => {
      const adaptedObj = { ...obj };

      if (obj.isPinnedToViewport) {
        const relativeX = obj.x / savedViewport.width;
        const relativeY = obj.y / savedViewport.height;

        adaptedObj.x = relativeX * currentWidth;
        adaptedObj.y = relativeY * currentHeight;

        if (adaptedObj.x + (obj.width || 100) > currentWidth) {
          adaptedObj.x = currentWidth - (obj.width || 100) - SCROLLBAR_WIDTH_THICK;
        }
        if (adaptedObj.y + (obj.height || 100) > currentHeight - SCROLLBAR_WIDTH_THICK) {
          adaptedObj.y = currentHeight - (obj.height || 100) - SCROLLBAR_WIDTH_THICK;
        }

        if (obj.pinnedScreenPosition) {
          const pinnedRelativeX = obj.pinnedScreenPosition.x / savedViewport.width;
          const pinnedRelativeY = obj.pinnedScreenPosition.y / savedViewport.height;
          adaptedObj.pinnedScreenPosition = {
            x: pinnedRelativeX * currentWidth,
            y: pinnedRelativeY * currentHeight
          };
        }

        if (obj.expandedPinnedPosition) {
          const expandedRelativeX = obj.expandedPinnedPosition.x / savedViewport.width;
          const expandedRelativeY = obj.expandedPinnedPosition.y / savedViewport.height;
          adaptedObj.expandedPinnedPosition = {
            x: expandedRelativeX * currentWidth,
            y: expandedRelativeY * currentHeight
          };
        }

        if (obj.collapsedPinnedPosition) {
          const collapsedRelativeX = obj.collapsedPinnedPosition.x / savedViewport.width;
          const collapsedRelativeY = obj.collapsedPinnedPosition.y / savedViewport.height;
          adaptedObj.collapsedPinnedPosition = {
            x: collapsedRelativeX * currentWidth,
            y: collapsedRelativeY * currentHeight
          };
        }
      }

      adaptedObjects[id] = adaptedObj;
    });

    newState.objects = adaptedObjects;
  }

  return newState;
}

export const clearGameState = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_COMPRESSED);
  } catch (error) {
    logger.error('Failed to clear game state:', error);
  }
};

export const clearAllData = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_COMPRESSED);
    localStorage.removeItem('nexus-local-settings');
    localStorage.removeItem('app-language');

    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('peerjs')) {
        localStorage.removeItem(key);
      }
    });

    clearImageCacheIDB().catch(error => {
      logger.error('[CLEAR] Failed to clear IndexedDB:', error);
    });

    if (window.location.search.includes('hostId')) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }

    logger.log('[CLEAR] All data cleared successfully');
  } catch (error) {
    logger.error('[CLEAR] Failed to clear all data:', error);
  }
};

export const hasSavedGameState = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    return !!(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY_COMPRESSED));
  } catch (error) {
    return false;
  }
};

export const getSavedGameTimestamp = (): number | null => {
  if (typeof window === 'undefined') return null;

  try {
    let stored = localStorage.getItem(STORAGE_KEY_COMPRESSED);

    if (!stored) {
      stored = localStorage.getItem(STORAGE_KEY);
    }

    if (!stored) return null;

    let jsonString = stored;
    if (stored !== localStorage.getItem(STORAGE_KEY) && localStorage.getItem(STORAGE_KEY_COMPRESSED) === stored) {
      const decompressed = decompressData(stored);
      if (decompressed === null) {
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

export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};
