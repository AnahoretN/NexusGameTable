import type { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage } from '../types';
import type { GameState, ViewTransform } from '../store/GameContext';
import { SCROLLBAR_WIDTH } from '../constants';
import { logger } from './logger';
import {
  convertImagesToPathMetadata,
  restoreImagesFromPathMetadata,
  getImagePathVersion
} from './imagePathStorage';
import { extractImagesFromState, saveImageCacheToIDB, loadImageCacheFromIDB, getNewImages, ImageCache } from './imageCache';

const STORAGE_KEY = 'nexus-game-state';
const STORAGE_VERSION = 7; // Version with image path storage (no actual image data)

// In-memory cache for IDB images to avoid repeated reads
let cachedIDBCache: ImageCache | null = null;
let cacheLoadPromise: Promise<ImageCache> | null = null;

/**
 * Get IDB cache from memory or load it once (cached for performance)
 */
async function getOrLoadIDBCache(): Promise<ImageCache> {
  if (cachedIDBCache) {
    logger.log(`[SAVE] Using cached IDB cache (${Object.keys(cachedIDBCache).length} images)`);
    return cachedIDBCache;
  }

  if (cacheLoadPromise) {
    logger.log('[SAVE] Waiting for IDB cache load...');
    return cacheLoadPromise;
  }

  logger.log('[SAVE] Loading IDB cache...');
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

    // First: Extract images to cache and save to IndexedDB BEFORE converting to metadata
    // Get existing IDB cache to avoid re-saving images we already have (cached in memory)
    const existingIDBCache = await getOrLoadIDBCache();
    const { state: extractedState, imageCache } = extractImagesFromState({ objects: objectsToSave }, existingIDBCache);

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
      logger.log(`[SAVE] Saved ${Object.keys(newImages).length} new images to IndexedDB (skipped ${Object.keys(existingIDBCache).length} existing)`);
    }

    // Then: Convert EXTRACTED objects (with img_ref://) to path metadata for localStorage
    const convertedObjects = convertImagesToPathMetadata(extractedState.objects || {});

    // Debug: Check if any blob URLs remain after conversion
    let blobCount = 0;
    let dataUrlCount = 0;
    Object.values(convertedObjects).forEach(obj => {
      const checkForBlobs = (item: any) => {
        if (typeof item === 'string') {
          if (item.startsWith('blob:')) blobCount++;
          if (item.startsWith('data:image/')) dataUrlCount++;
        } else if (typeof item === 'object' && item !== null) {
          Object.values(item).forEach(checkForBlobs);
        }
      };
      checkForBlobs(obj);
    });

    if (blobCount > 0 || dataUrlCount > 0) {
      logger.error(`[SAVE] ERROR: ${blobCount} blob URLs and ${dataUrlCount} data URLs remain after conversion!`);
    } else {
      logger.log('[SAVE] All images successfully converted to metadata');
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
        // Save objects (the main game data) - keeping original URLs
        objects: convertedObjects,
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
      }
    };

    // Save to localStorage (keeping blob URLs as-is)
    try {
      const json = JSON.stringify(storedData);

      // Debug: log size of each component
      const size = new Blob([json]).size;
      const objectsSize = new Blob([JSON.stringify(storedData.state.objects)]).size;
      const drawingsSize = storedData.state.drawings ? new Blob([JSON.stringify(storedData.state.drawings)]).size : 0;
      const playersSize = storedData.state.players ? new Blob([JSON.stringify(storedData.state.players)]).size : 0;

      logger.log(`[SAVE] Total size: ${Math.round(size / 1024)}KB (objects: ${Math.round(objectsSize / 1024)}KB, drawings: ${Math.round(drawingsSize / 1024)}KB, players: ${Math.round(playersSize / 1024)}KB)`);

      localStorage.setItem(STORAGE_KEY, json);
      logger.log(`[SAVE] Game saved successfully (${Math.round(size / 1024)}KB)`);
    } catch (error) {
      logger.error('Failed to save game state:', error);
    }
  } catch (error) {
    logger.error('Failed to save game state:', error);
  }
};

/**
 * Callback function type for loading images from packs
 */
type PackImageLoader = (filename: string) => Promise<string>;

/**
 * Load the game state from localStorage
 * Adapts objects only if user is HOST or playing SOLO
 * @param isGuest Whether the current user is a guest
 * @param loadPackImage Optional callback to load images from packs
 */
export const loadGameState = (
  isGuest: boolean,
  loadPackImage?: PackImageLoader
): Partial<GameState> | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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

    let parsed;
    try {
      parsed = JSON.parse(stored);
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

    const data: StoredGameState = parsed;

    // Check version
    if (data.version !== STORAGE_VERSION) {
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

    // Restore images from path metadata (async but we'll update state later)
    // For now, return the state and let the caller handle image restoration
    return adaptedState;
  } catch (error) {
    logger.error('[LOAD_STATE] Failed to load game state:', error);
    return null;
  }
};

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
          adaptedObj.x = currentWidth - (obj.width || 100) - SCROLLBAR_WIDTH;
        }
        if (adaptedObj.y + (obj.height || 100) > currentHeight - SCROLLBAR_WIDTH) {
          adaptedObj.y = currentHeight - (obj.height || 100) - SCROLLBAR_WIDTH;
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
 * Restore images from path metadata in loaded game state
 * Call this after loadGameState to restore actual image URLs
 * @param state The loaded game state
 * @param loadPackImage Optional callback to load images from packs
 */
export const restoreImagesInState = async (
  state: Partial<GameState>,
  loadPackImage?: PackImageLoader
): Promise<Partial<GameState>> => {
  if (!state.objects) return state;

  try {
    const restoredObjects = await restoreImagesFromPathMetadata(state.objects, loadPackImage);
    return {
      ...state,
      objects: restoredObjects
    };
  } catch (error) {
    logger.error('[RESTORE] Failed to restore images:', error);
    return state; // Return original state on error
  }
};

/**
 * Clear the saved game state from localStorage
 */
export const clearGameState = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
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
    // Clear game state
    localStorage.removeItem(STORAGE_KEY);

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

    // Clear URL parameters to reset guest/host state
    if (window.location.search.includes('hostId')) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }
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
    const stored = localStorage.getItem(STORAGE_KEY);
    return !!stored;
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
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data: StoredGameState = JSON.parse(stored);
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
