import { useEffect, useRef, useCallback } from 'react';
import { GameState } from './gameState';
import { saveGameState, SaveRole } from '../utils/gameStorage';

const SAVE_DEBOUNCE_MS = 5000;
const SAVE_INTERVAL_MS = 60000;

/**
 * Auto-save hook for game state
 *
 * - Debounced save ~5s after the last state change (covers active play)
 * - Interval save every 60s as a safety net (covers long-idle sessions)
 * - Save on page unload (F5 / tab close — localStorage writes are synchronous,
 *   so the save completes before the page is torn down)
 * - Each client saves their own local state to their ROLE-SCOPED storage keys
 *   (a host tab and a guest tab in the same browser don't clobber each other)
 *
 * The debounce/interval timers read the state through a ref so that state
 * changes NEVER restart the interval — an earlier version put `state` in the
 * effect deps, and during active play the 60s timer was reset on every
 * dispatch, so it never fired and a host reload lost the whole session.
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

  // Debounced save after state changes
  useEffect(() => {
    if (!isInitialized) return;

    const timer = setTimeout(() => {
      saveGameState(stateRef.current, roleRef.current);
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isInitialized, state]);

  // Interval safety net — stable deps, reads state via ref
  useEffect(() => {
    if (!isInitialized) return;

    const timer = setInterval(() => {
      saveGameState(stateRef.current, roleRef.current);
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isInitialized]);

  // Save on page unload (F5, tab close). saveGameState's body is fully
  // synchronous (localStorage + LZString), so it completes before teardown.
  useEffect(() => {
    if (!isInitialized) return;

    const saveOnUnload = () => {
      saveGameState(stateRef.current, roleRef.current);
    };
    window.addEventListener('pagehide', saveOnUnload);
    window.addEventListener('beforeunload', saveOnUnload);

    return () => {
      window.removeEventListener('pagehide', saveOnUnload);
      window.removeEventListener('beforeunload', saveOnUnload);
    };
  }, [isInitialized]);

  return { saveNow };
}
