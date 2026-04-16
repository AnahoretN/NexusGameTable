/**
 * Optimized GameState for GameContext
 *
 * This file contains the refactored GameState interface that removes
 * duplicate data now managed by dedicated contexts:
 * - PlayerContext: players, activePlayerId, playerPermissions
 * - ViewTransformContext: viewTransform
 * - UIContext: language, playerPanelSettings, hyperscaleLayers, selectedHyperscaleLayerIds
 *
 * @module store/gameStateOptimized
 */

import { TableObject, DiceRoll, DrawingData, UndoState, DiceGroup } from '../types';

/**
 * Optimized GameState interface - contains only game-specific data
 * All UI, player, and view transform data has been moved to dedicated contexts
 */
export interface OptimizedGameState {
  // Core game objects
  objects: Record<string, TableObject>;

  // Dice functionality
  diceRolls: DiceRoll[];
  diceGroups: DiceGroup[];

  // Drawing functionality
  drawings: DrawingData;

  // Undo/redo functionality
  undo: UndoState;

  // Connection management
  connectionsLocked: boolean;

  // Session management
  sessionId?: string;
  version?: number;
  lastModifiedBy?: string;

  // Internal fields (not persisted, used for runtime optimization)
  _lastPanelSettingsUpdate?: number;
  _pendingPanelSettings?: Record<string, any>;
}

/**
 * Initial state for the optimized GameContext
 * This contains only game-specific data, excluding data managed by other contexts
 */
export const optimizedInitialState: OptimizedGameState = {
  // Core game objects
  objects: {},

  // Dice functionality
  diceRolls: [],
  diceGroups: [],

  // Drawing functionality
  drawings: { layers: [] },

  // Undo/redo functionality
  undo: {
    markerHistory: [],
    generalHistory: [],
    maxMarkerHistory: 10,
    maxGeneralHistory: 100
  },

  // Connection management
  connectionsLocked: false,

  // Session management
  sessionId: generateSessionId(),
  version: 1,
  lastModifiedBy: 'gm',
};

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Migration utility to convert legacy GameState to OptimizedGameState
 *
 * This function extracts only the game-specific data from the legacy state,
 * excluding data now managed by dedicated contexts
 *
 * @param legacyState - The legacy GameState containing all data
 * @returns OptimizedGameState containing only game-specific data
 */
export function migrateToOptimizedState(legacyState: any): OptimizedGameState {
  return {
    objects: legacyState.objects || {},
    diceRolls: legacyState.diceRolls || [],
    diceGroups: legacyState.diceGroups || [],
    drawings: legacyState.drawings || { layers: [] },
    undo: legacyState.undo || {
      markerHistory: [],
      generalHistory: [],
      maxMarkerHistory: 10,
      maxGeneralHistory: 100
    },
    connectionsLocked: legacyState.connectionsLocked || false,
    sessionId: legacyState.sessionId,
    version: legacyState.version,
    lastModifiedBy: legacyState.lastModifiedBy,
    _lastPanelSettingsUpdate: legacyState._lastPanelSettingsUpdate,
    _pendingPanelSettings: legacyState._pendingPanelSettings,
  };
}

/**
 * Type guard to check if a state object is OptimizedGameState
 */
export function isOptimizedGameState(state: any): state is OptimizedGameState {
  return (
    state &&
    typeof state.objects === 'object' &&
    Array.isArray(state.diceRolls) &&
    Array.isArray(state.diceGroups) &&
    typeof state.drawings === 'object' &&
    typeof state.undo === 'object' &&
    typeof state.connectionsLocked === 'boolean'
  );
}

/**
 * Utility to merge game state with context data
 * Useful for save/load operations that need the complete state
 */
export function mergeStateWithContexts(
  gameState: OptimizedGameState,
  contexts: {
    players: any[];
    activePlayerId: string;
    playerPermissions: any;
    viewTransform: any;
    language: string;
    playerPanelSettings: any;
    hyperscaleLayers: any[];
    selectedHyperscaleLayerIds: string[];
  }
) {
  return {
    ...gameState,
    ...contexts,
  };
}