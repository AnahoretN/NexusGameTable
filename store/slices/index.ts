import { GameState, Action } from '../gameState';
import { playerSlice } from './playerSlice';
import { objectSlice } from './objectSlice';

/**
 * Combine multiple slices into a single reducer
 * Each slice processes actions in sequence, passing state to the next
 */
const combineSlices = (
  slices: Array<(state: GameState, action: Action) => GameState>
): ((state: GameState, action: Action) => GameState) => {
  return (state: GameState, action: Action) => {
    return slices.reduce(
      (currentState, slice) => slice(currentState, action),
      state
    );
  };
};

/**
 * Main composed reducer
 * Combines all slices into a single reducer function
 * Process slices in order: players → objects → cards → ui → etc.
 */
export const composedReducer = combineSlices([
  playerSlice,
  objectSlice,
  // Add more slices here as they are created:
  // cardSlice,
  // uiSlice,
  // drawingSlice,
  // diceSlice,
  // hyperscaleSlice,
  // appSlice,
  // utilitySlice
]);

/**
 * Alternative approach: Create a more efficient reducer that only processes
 * actions relevant to each slice, similar to Redux Toolkit's createSlice
 */
export const createOptimizedReducer = (
  sliceMap: Record<string, (state: GameState, action: Action) => GameState>
): ((state: GameState, action: Action) => GameState) => {
  return (state: GameState, action: Action) => {
    // Only process with slices that handle this action type
    // This would require each slice to export a list of handled actions
    let currentState = state;

    for (const slice of Object.values(sliceMap)) {
      currentState = slice(currentState, action);
    }

    return currentState;
  };
};