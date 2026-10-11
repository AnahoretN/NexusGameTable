import { useEffect, useRef, useCallback } from 'react';
import { GameState } from './gameState';
import { saveGameState, SaveRole } from '../utils/gameStorage';

/**
 * Simple auto-save hook for game state
 *
 * - Saves every 60 seconds for both host and guests
 * - Each client saves their own local state to their ROLE-SCOPED storage keys
 *   (a host tab and a guest tab in the same browser don't clobber each other)
 *
 * @param state - Current game state
 * @param isInitialized - Whether the game has finished initializing
 * @param role - Whether this client is the host or a guest (storage key scope)
 * @returns saveNow function to trigger immediate save
 */
export function useAutoSave(
  state: GameState,
  isInitialized: boolean,
  role: SaveRole = 'host'
): { saveNow: () => Promise<void> } {
  const stateRef = useRef(state);
  stateRef.current = state;

  const roleRef = useRef(role);
  roleRef.current = role;

  const saveNow = useCallback(async () => {
    if (!isInitialized) return;
    await saveGameState(stateRef.current, roleRef.current);
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const timer = setInterval(async () => {
      await saveGameState(state, role);
    }, 60000);

    return () => clearInterval(timer);
  }, [isInitialized, state, role]);

  return { saveNow };
}
