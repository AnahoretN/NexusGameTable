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
  const prevStateRef = useRef<string>('');

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

      logger.log('[AutoSave] Emergency backup save (60s timer)...');
      await saveGameState(state);
      lastSaveTimeRef.current = Date.now();
    }, 60000); // 60 seconds

    return () => clearInterval(emergencyTimer);
  }, [isHost, isInitialized, state]);

  useEffect(() => {
    // Don't save if we're a guest (state comes from host)
    if (!isHost) return;

    // Don't save during initialization
    if (!isInitialized) return;

    // Fast hash check: count objects + sum positions + deck cardIds count
    // This catches object moves, drawing cards, deck shuffles WITHOUT expensive JSON.stringify
    let hash = Object.keys(state.objects).length;
    for (const obj of Object.values(state.objects)) {
      // Add position changes
      hash += (obj.x || 0) + (obj.y || 0);
      // Add deck/pile changes (cardIds length)
      if (obj.type === 'DECK') {
        const deck = obj as any;
        hash += deck.cardIds?.length || 0;
        if (deck.piles) {
          hash += deck.piles.reduce((sum: number, pile: any) => sum + pile.cardIds.length, 0);
        }
      }
    }

    if (hash === prevStateRef.current) {
      return;
    }

    // Update previous hash
    prevStateRef.current = hash;

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
        const remainingTime = Math.round((minInterval - timeSinceLastSave) / 1000);
        logger.log(`[AutoSave] Timer expired for ${modifierPlayerId}, but skipping: ${remainingTime}s until next save allowed`);
        delete playerTimersRef.current[modifierPlayerId];
        return;
      }

      // Final check: any object still dragging or in cursor slot?
      // Note: we check the CURRENT state at timeout time, not capture time
      const isStillDragging = Object.values(state.objects).some(
        obj => (obj as any).draggingPlayerId !== undefined && (obj as any).draggingPlayerId !== null
      );

      const isStillInCursorSlot = Object.values(state.objects).some(
        obj => (obj as any).inCursorSlot === true
      );

      if (isStillDragging || isStillInCursorSlot) {
        logger.log('[AutoSave] Cancelled: dragging or cursor slot active');
        delete playerTimersRef.current[modifierPlayerId];
        return;
      }

      logger.log(`[AutoSave] Saving game state (triggered by player ${modifierPlayerId})...`);
      await saveGameState(state);
      lastSaveTimeRef.current = Date.now();
      delete playerTimersRef.current[modifierPlayerId];
    }, 5000);
  }, [state, isHost, isInitialized]);
}
