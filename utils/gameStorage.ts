/**
 * Game State Storage with Image Reference System
 *
 * NEW ARCHITECTURE (CAS):
 * - State ALWAYS contains sha256: hashes (never base64 in memory)
 * - Images stored in IndexedDB (AssetDB)
 * - Components use useImageUrl() hook to resolve sha256: to displayable URLs
 */

import type { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage, DiceGroup } from '../types';
import type { GameState, ViewTransform } from '../store/GameContext';
import { SCROLLBAR_WIDTH_THICK } from '../constants';
import { logger } from './logger';
import * as LZString from 'lz-string';
import { findLocalFilePaths, type LocalFileReference } from './imageCompat';
import { assetDB, clearAssetCache } from './assets';
import { deleteOldDatabase } from './assets/migration';

// Re-export for other modules
export type { LocalFileReference };
export { findLocalFilePaths };

const STORAGE_KEY = 'nexus-game-state';
const STORAGE_KEY_COMPRESSED = 'nexus-game-state-compressed';
const STORAGE_VERSION = 8; // Version with new objects and settings (diceGroups, access control, etc.)
const USE_COMPRESSION = true; // Enable compression for localStorage

/**
 * Initialize image system (no-op in CAS system)
 * Assets are managed by AssetDB
 */
export async function initializeImageCache(): Promise<void> {
  // No-op - images are managed by the new CAS system
  logger.log('[STORAGE] Image cache initialized (CAS system manages assets)');
}

// ============================================================================
// COMPATIBILITY FUNCTIONS FOR OLD IMAGE SYSTEM
// These bridge the old img_ref:// system with the new SHA-256 hash system
// ============================================================================

/**
 * Generate a unique image ID (for backward compatibility)
 * In the new system, we use SHA-256 hashes directly
 */
export function generateImageId(): string {
  // Generate a random ID (timestamp + random)
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an img_ref:// URL (for backward compatibility)
 * Note: The new system prefers sha256: hashes directly
 */
export function createImageRef(imageId: string): string {
  return `img_ref://${imageId}`;
}

/**
 * Save a single image to IndexedDB using the new CAS system
 * @param imageId - Legacy image ID (not used in new system, kept for compat)
 * @param base64 - Base64 data URL
 * @returns The SHA-256 hash of the stored image
 */
export async function saveSingleImageToIDB(imageId: string, base64: string): Promise<string> {
  const { storeAssetFromDataURL } = await import('./assets');
  return storeAssetFromDataURL(base64, 'local');
}

/**
 * Add an image to the managed cache (no-op in new system)
 * The new asset system handles caching automatically
 * @param imageId - Legacy image ID (not used)
 * @param base64 - Base64 data URL (not used)
 */
export function addToManagedCache(imageId: string, base64: string): void {
  // No-op - the new CAS system handles caching automatically via assetCache
  // Images are loaded on-demand and cached in memory as ObjectURLs
}

/**
 * Load images from IDB into managed cache (no-op in new system)
 * The new system loads images on-demand
 * @returns Empty object (no preloading in new system)
 */
export async function loadImageCacheFromIDB(): Promise<Record<string, string>> {
  // No-op - images are loaded on-demand in the new system
  return {};
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
 * NEW ARCHITECTURE (CAS):
 * - State already contains sha256: hashes (no base64 extraction needed)
 * - Images are stored in IndexedDB AssetDB
 * - Just save state as-is to localStorage
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

    // Create stored data structure
    const storedData: StoredGameState = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      state: {
        // State already contains sha256: hashes
        objects: objectsToSave,
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
        // 🔥 NEW: Save usedPacks for P2P sync
        usedPacks: state.usedPacks || {},
      }
    };

    // Save to localStorage
    const json = JSON.stringify(storedData);
    const size = new Blob([json]).size;

    // Warn if size is abnormally large (> 5MB indicates base64 leak)
    if (size > 5 * 1024 * 1024) {
      logger.warn(`[AUTOSAVE] WARNING: Large save size - may indicate base64 images embedded!`);
    }

    // Try compressed first
    let saved = false;
    if (USE_COMPRESSION && size > 1024) {
      const compressed = compressData(json);
      if (safeSetItem(STORAGE_KEY_COMPRESSED, compressed)) {
        localStorage.removeItem(STORAGE_KEY);
        saved = true;
      }
    }

    // Fallback to uncompressed
    if (!saved) {
      if (safeSetItem(STORAGE_KEY, json)) {
        localStorage.removeItem(STORAGE_KEY_COMPRESSED);
      } else {
        logger.error('[AUTOSAVE] Failed to save - quota exceeded');
      }
    }
  } catch (error) {
    logger.error('[AUTOSAVE] Failed to save game state:', error);
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

    // Note: Images are now loaded on-demand by the CAS asset system
    // The migration to the new system happens during app initialization
    // No need to preload images here - they will be fetched as needed

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

/**
 * Replace local file paths in objects with img_ref URLs
 * This is used when processing uploaded local files
 */
function replaceLocalFilePathsWithBase64(
  objects: Record<string, unknown>,
  pathToImgRef: Map<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...objects };

  for (const [objectId, obj] of Object.entries(objects)) {
    if (obj && typeof obj === 'object') {
      const updated = replaceInObject(obj, pathToImgRef);
      if (updated !== obj) {
        result[objectId] = updated;
      }
    }
  }

  return result;
}

/**
 * Recursively replace local file paths in an object
 */
function replaceInObject(
  obj: unknown,
  pathToImgRef: Map<string, string>
): unknown {
  if (!obj || typeof obj !== 'object') {
    // Check if this string is a local file path
    if (typeof obj === 'string') {
      const replacement = pathToImgRef.get(obj);
      if (replacement) {
        return replacement;
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => replaceInObject(item, pathToImgRef));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = replaceInObject(value, pathToImgRef);
  }

  return result;
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

/**
 * Clear ALL application data from browser storage
 * - localStorage (game state, settings, peerjs data)
 * - sessionStorage (temporary session data)
 * - IndexedDB (all asset databases)
 * - Cache API (PWA caches)
 * - Service Workers (unregister all)
 * - URL parameters (clean hostId from URL)
 */
export const clearAllData = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  try {
    logger.log('[CLEAR] Starting complete data cleanup...');

    // 1. Clear all localStorage
    logger.log('[CLEAR] Clearing localStorage...');
    const localStorageKeys = Object.keys(localStorage);
    localStorageKeys.forEach(key => {
      localStorage.removeItem(key);
    });

    // 2. Clear sessionStorage
    logger.log('[CLEAR] Clearing sessionStorage...');
    const sessionStorageKeys = Object.keys(sessionStorage);
    sessionStorageKeys.forEach(key => {
      sessionStorage.removeItem(key);
    });

    // 3. Clear IndexedDB - main asset database
    logger.log('[CLEAR] Clearing IndexedDB (AssetDB)...');
    try {
      await assetDB.clear();
    } catch (idbError) {
      logger.error('[CLEAR] Failed to clear AssetDB:', idbError);
    }

    // 4. Clear old IndexedDB databases (migration remnants)
    logger.log('[CLEAR] Clearing old IndexedDB databases...');
    try {
      await deleteOldDatabase();
    } catch (oldDbError) {
      logger.error('[CLEAR] Failed to delete old database:', oldDbError);
    }

    // 5. Clear any remaining IndexedDB databases
    logger.log('[CLEAR] Checking for remaining IndexedDB databases...');
    try {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name && db.name.includes('Nexus')) {
          logger.log(`[CLEAR] Deleting database: ${db.name}`);
          indexedDB.deleteDatabase(db.name);
        }
      }
    } catch (listError) {
      logger.error('[CLEAR] Failed to list databases:', listError);
    }

    // 6. Clear Cache API (PWA caches)
    logger.log('[CLEAR] Clearing Cache API...');
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
      logger.log(`[CLEAR] Deleted ${cacheNames.length} cache(s)`);
    } catch (cacheError) {
      logger.error('[CLEAR] Failed to clear caches:', cacheError);
    }

    // 7. Unregister Service Workers
    logger.log('[CLEAR] Unregistering Service Workers...');
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(registration => registration.unregister())
      );
      logger.log(`[CLEAR] Unregistered ${registrations.length} service worker(s)`);
    } catch (swError) {
      logger.error('[CLEAR] Failed to unregister service workers:', swError);
    }

    // 8. Clear in-memory asset cache
    logger.log('[CLEAR] Clearing in-memory asset cache...');
    clearAssetCache();

    // 9. Clean URL parameters (remove hostId)
    if (window.location.search.includes('hostId')) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
      logger.log('[CLEAR] Cleaned URL parameters');
    }

    logger.log('[CLEAR] ✓ All data cleared successfully');
  } catch (error) {
    logger.error('[CLEAR] Failed to clear all data:', error);
    throw error;
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
