import type { TableObject, Player, PlayerPermissions, DiceRoll, DrawingData, UndoState, AppLanguage } from '../types';
import type { GameState, ViewTransform } from '../store/GameContext';

const STORAGE_KEY = 'nexus-game-state';
const STORAGE_VERSION = 1;

export interface StoredGameState {
  version: number;
  timestamp: number;
  state: Partial<GameState>;
}

/**
 * Save the current game state to localStorage
 * Only saves the essential data needed to restore the game
 */
export const saveGameState = (state: GameState): void => {
  if (typeof window === 'undefined') return;

  try {
    const dataToStore: StoredGameState = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
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

    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToStore));
  } catch (error) {
    console.error('Failed to save game state:', error);
  }
};

/**
 * Load the game state from localStorage
 * Returns null if no saved state exists or if there was an error
 */
export const loadGameState = (): Partial<GameState> | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data: StoredGameState = JSON.parse(stored);

    // Check version compatibility
    if (data.version !== STORAGE_VERSION) {
      console.warn('Game state version mismatch, clearing saved state');
      clearGameState();
      return null;
    }

    // Check if state is too old (more than 7 days)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (data.timestamp < weekAgo) {
      console.warn('Saved game state is too old, clearing');
      clearGameState();
      return null;
    }

    return data.state;
  } catch (error) {
    console.error('Failed to load game state:', error);
    return null;
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
    console.error('Failed to clear game state:', error);
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
