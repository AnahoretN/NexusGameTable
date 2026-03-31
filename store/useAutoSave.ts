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
  const prevStateRef = useRef<number>(0);

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
      // Check if safe to save - same logic as main auto-save
      let hash = Object.keys(state.objects).length;
      for (const obj of Object.values(state.objects)) {
        hash += (obj.x || 0) + (obj.y || 0);
        if ((obj as any).content) {
          hash += (obj as any).content.length;
        }
        if (obj.name) {
          hash += obj.name.length;
        }
        if ((obj as any).color) {
          hash += (obj as any).color.length;
        }
        if (obj.type === 'DECK') {
          const deck = obj as any;
          hash += deck.cardIds?.length || 0;
          if (deck.piles) {
            hash += deck.piles.reduce((sum: number, pile: any) => sum + pile.cardIds.length, 0);
          }
        }
        // Add character data changes (for character panels)
        if ((obj as any).characterData) {
          const charData = (obj as any).characterData;
          hash += charData.characters?.length || 0;
          if (charData.characters) {
            charData.characters.forEach((char: any) => {
              hash += char.blocks?.length || 0;
              hash += char.columns || 1;
              hash += char.characterName?.length || 0;
              char.blocks?.forEach((block: any) => {
                if (block.data?.rows) {
                  hash += block.data.rows.length;
                  block.data.rows.forEach((row: any) => {
                    hash += Object.keys(row.cells || {}).length;
                  });
                }
                if (block.data?.columns) {
                  hash += block.data.columns.length;
                }
                if (block.data?.sliders) {
                  hash += block.data.sliders.length;
                }
                if (block.data?.items) {
                  hash += block.data.items.length;
                }
                if (block.data?.counters) {
                  hash += block.data.counters.length;
                }
                if (block.data?.content) {
                  hash += block.data.content.length;
                }
              });
            });
          }
        }
      }

      if (hash === prevStateRef.current) {
        return; // No changes detected
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

    // Fast hash check: count objects + sum positions + deck cardIds count + content length
    // This catches object moves, drawing cards, deck shuffles, image changes WITHOUT expensive JSON.stringify
    let hash = Object.keys(state.objects).length;
    for (const obj of Object.values(state.objects)) {
      // Add position changes
      hash += (obj.x || 0) + (obj.y || 0);
      // Add content length (images, URLs, etc.)
      if ((obj as any).content) {
        hash += (obj as any).content.length;
      }
      // Add name length (for renamed objects)
      if (obj.name) {
        hash += obj.name.length;
      }
      // Add color string (for colored objects)
      if ((obj as any).color) {
        hash += (obj as any).color.length;
      }
      // Add deck/pile changes (cardIds length)
      if (obj.type === 'DECK') {
        const deck = obj as any;
        hash += deck.cardIds?.length || 0;
        if (deck.piles) {
          hash += deck.piles.reduce((sum: number, pile: any) => sum + pile.cardIds.length, 0);
        }
      }
      // Add character data changes (for character panels)
      if ((obj as any).characterData) {
        const charData = (obj as any).characterData;
        // Count characters
        hash += charData.characters?.length || 0;
        // Count blocks across all characters
        if (charData.characters) {
          charData.characters.forEach((char: any) => {
            hash += char.blocks?.length || 0;
            hash += char.columns || 1;
            // Add character name length
            hash += char.characterName?.length || 0;
            // Count total cells in tables
            char.blocks?.forEach((block: any) => {
              if (block.data?.rows) {
                hash += block.data.rows.length;
                block.data.rows.forEach((row: any) => {
                  hash += Object.keys(row.cells || {}).length;
                });
              }
              if (block.data?.columns) {
                hash += block.data.columns.length;
              }
              if (block.data?.sliders) {
                hash += block.data.sliders.length;
              }
              if (block.data?.items) {
                hash += block.data.items.length;
              }
              if (block.data?.counters) {
                hash += block.data.counters.length;
              }
              if (block.data?.content) {
                hash += block.data.content.length;
              }
            });
          });
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
