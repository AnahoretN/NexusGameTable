import { useEffect } from 'react';
import { GameState } from './gameState';
import { saveGameState } from '../utils/gameStorage';
import { logger } from '../utils/logger';

/**
 * Auto-save hook for game state
 * Saves to localStorage with a debounce delay
 * Only saves when user is the host (guests receive state from host)
 *
 * @param state - Current game state
 * @param isHost - Whether the current user is the host
 * @param debounceMs - Debounce delay in milliseconds (default: 500ms)
 */
export function useAutoSave(state: GameState, isHost: boolean, debounceMs: number = 500): void {
  useEffect(() => {
    // Don't save if we're a guest (state comes from host)
    if (!isHost) return;

    const timeoutId = setTimeout(() => {
      saveGameState(state);
      logger.debug('Game state auto-saved');
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [state, isHost, debounceMs]);
}
