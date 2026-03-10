import type { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage } from '../types';
import type { GameState, ViewTransform } from '../store/GameContext';
import { SCROLLBAR_WIDTH } from '../constants';
import { logger } from './logger';

const STORAGE_KEY = 'nexus-game-state';
const STORAGE_VERSION = 6; // Version with hyperscale layers saving

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
 * Convert blob URL to base64 data URL
 */
const convertBlobToBase64 = async (blobUrl: string): Promise<string> => {
  if (!blobUrl.startsWith('blob:')) {
    return blobUrl; // Not a blob URL, return as is
  }

  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    logger.warn('Failed to convert blob to base64:', error);
    return blobUrl; // Return original on error
  }
};

/**
 * Convert all blob URLs in objects to base64 data URLs
 */
const convertBlobsInObjects = async (objects: Record<string, TableObject>): Promise<Record<string, TableObject>> => {
  const convertedObjects: Record<string, TableObject> = {};

  for (const [id, obj] of Object.entries(objects)) {
    const convertedObj = { ...obj };

    // Convert content (image URL) if it's a blob URL (only for objects that have content property)
    if ('content' in convertedObj && convertedObj.content && convertedObj.content.startsWith('blob:')) {
      convertedObj.content = await convertBlobToBase64(convertedObj.content);
    }

    // Convert alternativeBack URL if present
    if ((convertedObj as any).alternativeBack?.url?.startsWith('blob:')) {
      (convertedObj as any).alternativeBack.url = await convertBlobToBase64((convertedObj as any).alternativeBack.url);
    }

    // Convert spriteConfig URLs if present
    if ((convertedObj as any).spriteConfig) {
      const spriteConfig = { ...(convertedObj as any).spriteConfig };
      if (spriteConfig.spriteUrl?.startsWith('blob:')) {
        spriteConfig.spriteUrl = await convertBlobToBase64(spriteConfig.spriteUrl);
      }
      if (spriteConfig.cardBackUrl?.startsWith('blob:')) {
        spriteConfig.cardBackUrl = await convertBlobToBase64(spriteConfig.cardBackUrl);
      }
      (convertedObj as any).spriteConfig = spriteConfig;
    }

    convertedObjects[id] = convertedObj;
  }

  return convertedObjects;
};

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

    // Convert blob URLs to base64 before saving
    const convertedObjects = await convertBlobsInObjects(objectsToSave);

    const storedData: StoredGameState = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      state: {
        // Save objects (the main game data)
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

    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedData));
  } catch (error) {
    logger.error('Failed to save game state:', error);
  }
};

/**
 * Load the game state from localStorage
 * Adapts objects only if user is HOST or playing SOLO
 */
export const loadGameState = (isGuest: boolean): Partial<GameState> | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);

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
