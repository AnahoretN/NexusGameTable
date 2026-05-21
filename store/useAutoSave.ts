import { useEffect, useRef, useCallback } from 'react';
import { GameState } from './gameState';
import { saveGameState } from '../utils/gameStorage';
import { logger } from '../utils/logger';

/**
 * Simple auto-save hook for game state
 *
 * - Saves every 60 seconds for both host and guests
 * - Each client saves their own local state
 *
 * @param state - Current game state
 * @param isInitialized - Whether the game has finished initializing
 * @returns saveNow function to trigger immediate save
 */
export function useAutoSave(
  state: GameState,
  isInitialized: boolean
): { saveNow: () => Promise<void> } {
  const stateRef = useRef(state);
  stateRef.current = state;

  const saveNow = useCallback(async () => {
    if (!isInitialized) return;
    await saveGameState(stateRef.current);
    logger.log('[AUTOSAVE] Immediate save completed');
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const timer = setInterval(async () => {
      await saveGameState(state);
      logger.log('[AUTOSAVE] Scheduled save completed');
    }, 60000);

    return () => clearInterval(timer);
  }, [isInitialized, state]);

  return { saveNow };
}
