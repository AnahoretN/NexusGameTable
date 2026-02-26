import type { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage } from '../types';
import type { GameState, ViewTransform } from '../store/GameContext';
import { SCROLLBAR_WIDTH } from '../constants';
import { logger } from './logger';

const STORAGE_KEY = 'nexus-game-state';
const STORAGE_VERSION = 4; // Version with proper adaptation

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
export const saveGameState = (state: GameState): void => {
  if (typeof window === 'undefined') return;

  try {
    const storedData: StoredGameState = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      state: {
        // Save objects (the main game data)
        objects: state.objects,
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
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Migrate old formats
    if (!parsed.version || parsed.version < 3) {
      logger.log('Old save format detected, migrating...');
      return migrateOldFormat(parsed);
    }

    if (parsed.version === 3) {
      // Version 3 had adaptation issues - migrate to version 4
      return migrateVersion3(parsed);
    }

    const data: StoredGameState = parsed;

    // Check version
    if (data.version !== STORAGE_VERSION) {
      logger.warn('Game state version mismatch, clearing saved state');
      clearGameState();
      return null;
    }

    // Check if state is too old (more than 7 days)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (data.timestamp < weekAgo) {
      logger.warn('Saved game state is too old, clearing');
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
    logger.error('Failed to load game state:', error);
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
 * Adapt game state to new screen size
 * Scales object positions and pan/zoom to visually keep everything in place
 *
 * IMPORTANT: This function is ONLY called for host or solo game
 * Guests don't adapt objects - their position is controlled by host
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

  // Calculate scaling factors
  const scaleX = currentWidth / savedViewport.width;
  const scaleY = currentHeight / savedViewport.height;

  // Adapt objects
  if (newState.objects) {
    const adaptedObjects: Record<string, TableObject> = {};

    Object.entries(newState.objects).forEach(([id, obj]: [string, any]) => {
      const adaptedObj = { ...obj };

      if (obj.isPinnedToViewport) {
        // Pinned objects - check they don't go beyond screen boundaries
        // Right side should be within screen
        let newX = obj.x;
        let newY = obj.y;

        // If object is beyond right edge, shift it
        if (newX + (obj.width || 100) > currentWidth) {
          newX = currentWidth - (obj.width || 100) - SCROLLBAR_WIDTH;
        }
        // If below bottom edge, shift up
        if (newY + (obj.height || 100) > currentHeight - SCROLLBAR_WIDTH) {
          newY = currentHeight - (obj.height || 100) - SCROLLBAR_WIDTH;
        }

        adaptedObj.x = newX;
        adaptedObj.y = newY;

        // Adapt pinnedScreenPosition if present
        if (obj.pinnedScreenPosition) {
          adaptedObj.pinnedScreenPosition = {
            x: newX,
            y: newY
          };
        }
      } else {
        // Regular objects - scale coordinates
        // This preserves their visual position relative to screen
        adaptedObj.x = obj.x * scaleX;
        adaptedObj.y = obj.y * scaleY;
      }

      adaptedObjects[id] = adaptedObj;
    });

    newState.objects = adaptedObjects;
  }

  // Adapt viewTransform (pan/zoom) so camera stays in place
  if (newState.viewTransform) {
    const vt: ViewTransform = { ...newState.viewTransform };
    if (vt.scroll) {
      vt.scroll = {
        x: vt.scroll.x * scaleX,
        y: vt.scroll.y * scaleY
      };
    }
    if (vt.offset) {
      vt.offset = {
        x: vt.offset.x * scaleX,
        y: vt.offset.y * scaleY
      };
    }
    newState.viewTransform = vt;
  }

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
