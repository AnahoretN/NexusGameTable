import { useEffect, useRef } from 'react';
import { GameState } from './gameState';
import { saveGameState } from '../utils/gameStorage';
import { logger } from '../utils/logger';

/**
 * Auto-save hook for game state
 *
 * Behavior:
 * - Each PLAYER has independent 5-second timer after their changes
 * - MINIMUM 10 seconds between actual saves (to avoid too frequent saves)
 * - NEVER saves while ANY object is being dragged
 * - NEVER saves while ANY object is in cursor slot
 * - Only saves for host (guests receive state from host)
 * - ALSO saves every 60 seconds as emergency backup
 *
 * Example:
 * - Player A moves object → 5s timer starts for A
 * - Player B changes setting → 5s timer starts for B (doesn't reset A's timer)
 * - After 5s: first timer expires → save
 * - After another 5s: second timer would expire → skipped (min 10s interval)
 * - Every 60 seconds: emergency save (if safe to save)
 *
 * @param state - Current game state
 * @param isHost - Whether the current user is the host
 * @param isInitialized - Whether the game has finished initializing
 */
export function useAutoSave(
  state: GameState,
  isHost: boolean,
  isInitialized: boolean
): void {
  const lastSaveTimeRef = useRef<number>(0);
  const playerTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastEmergencySaveHashRef = useRef<string>('');

  // Only cleanup timers on unmount, not on every state change
  useEffect(() => {
    return () => {
      Object.values(playerTimersRef.current).forEach(timer => clearTimeout(timer));
      playerTimersRef.current = {};
    };
  }, []);

  // Emergency backup save every 60 seconds
  useEffect(() => {
    if (!isHost || !isInitialized) return;

    const emergencyTimer = setInterval(async () => {
      // Create a stable hash based on actual state content (not time-based)
      const stateHash = JSON.stringify({
        objectCount: Object.keys(state.objects).length,
        objectIds: Object.keys(state.objects).sort(),
        // Sample a few object properties to detect changes without expensive serialization
        sampleObjects: Object.entries(state.objects).slice(0, 5).map(([id, obj]) => ({
          id,
          x: obj.x,
          y: obj.y,
          modifiedBy: obj.lastModifiedBy
        }))
      });

      if (stateHash === lastEmergencySaveHashRef.current) {
        return; // No actual changes detected
      }

      // Check if safe to save
      const isAnyDragging = Object.values(state.objects).some(
        obj => (obj as any).draggingPlayerId !== undefined && (obj as any).draggingPlayerId !== null
      );

      const isAnyInCursorSlot = Object.values(state.objects).some(
        obj => (obj as any).inCursorSlot === true
      );

      if (isAnyDragging || isAnyInCursorSlot) {
        return; // Skip if not safe
      }

      const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
      const minInterval = 10000; // 10 seconds

      if (timeSinceLastSave < minInterval) {
        return; // Skip if saved recently
      }

      await saveGameState(state);
      lastSaveTimeRef.current = Date.now();
      lastEmergencySaveHashRef.current = stateHash;
    }, 60000); // 60 seconds

    return () => clearInterval(emergencyTimer);
  }, [isHost, isInitialized]);

  useEffect(() => {
    // Don't save if we're a guest (state comes from host)
    if (!isHost) return;

    // Don't save during initialization
    if (!isInitialized) {
      return;
    }

    // Check if ANY object is being dragged (by any player)
    const isAnyDragging = Object.values(state.objects).some(
      obj => (obj as any).draggingPlayerId !== undefined && (obj as any).draggingPlayerId !== null
    );

    if (isAnyDragging) {
      return;
    }

    // Check if ANY object is in cursor slot
    const isAnyInCursorSlot = Object.values(state.objects).some(
      obj => (obj as any).inCursorSlot === true
    );

    if (isAnyInCursorSlot) {
      return;
    }

    // Determine which player made the change (use lastModifiedBy if available, otherwise activePlayerId)
    const modifierPlayerId = state.lastModifiedBy || state.activePlayerId;

    // Clear existing timer for this player
    if (playerTimersRef.current[modifierPlayerId]) {
      clearTimeout(playerTimersRef.current[modifierPlayerId]);
    }

    // Schedule save for this player in 5 seconds
    playerTimersRef.current[modifierPlayerId] = setTimeout(async () => {
      // Check minimum interval between saves
      const timeSinceLastSave = Date.now() - lastSaveTimeRef.current;
      const minInterval = 10000; // 10 seconds

      if (timeSinceLastSave < minInterval) {
        logger.log('[AUTOSAVE] Skipping save - saved too recently');
        delete playerTimersRef.current[modifierPlayerId];
        return;
      }

      // Final check: any object still dragging or in cursor slot?
      // Note: we check the CURRENT state at timeout time, not capture time
      const isStillDragging = Object.values(state.objects).some(
        obj => (obj as any).draggingPlayerId !== undefined && (obj as any).draggingPlayerId !== null
      );

      const isStillInCursorSlot = Object.values(state.objects).some(
        obj => obj.inCursorSlot === true
      );

      if (isStillDragging || isStillInCursorSlot) {
        delete playerTimersRef.current[modifierPlayerId];
        return;
      }

      await saveGameState(state);
      lastSaveTimeRef.current = Date.now();
      delete playerTimersRef.current[modifierPlayerId];
    }, 5000);
  }, [state, isHost, isInitialized]);
}
