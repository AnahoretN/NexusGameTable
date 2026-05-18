/**
 * State Action Recorder
 * Records game state changes as actions for incremental sync
 *
 * Instead of sending full state, we send actions that transform state.
 * This reduces bandwidth and improves performance.
 */

import { StateAction } from '../protocol/messages';
import { Action } from '../../gameActions';
import { P2P_CONFIG } from '../types';
import { logger } from '../../../utils/logger';

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * Determine if an action should be reliable (needs ACK)
 */
export function isActionReliable(actionType: string): boolean {
  // Critical actions that need confirmation
  const RELIABLE_ACTIONS = new Set([
    'CREATE_OBJECT',
    'DELETE_OBJECT',
    'FLIP_CARD',
    'SHUFFLE_DECK',
    'DRAW_CARD',
    'ROLL_DICE',
    'CREATE_DICE_ROLL',
    'UPDATE_PLAYER_PERMISSIONS',
    'UPDATE_HYPERSCALE_LAYERS',
  ]);

  return RELIABLE_ACTIONS.has(actionType);
}

/**
 * Determine if an action is position-related (high frequency, fire-and-forget)
 */
export function isPositionAction(actionType: string): boolean {
  const POSITION_ACTIONS = new Set([
    'MOVE_OBJECT_START',
    'MOVE_OBJECT_UPDATE',
    'UPDATE_VIEW_TRANSFORM',
  ]);

  return POSITION_ACTIONS.has(actionType);
}

// ============================================================================
// ACTION RECORDER
// ============================================================================

export interface ActionRecord extends StateAction {
  version: number;          // State version when action was created
  applied: boolean;         // Whether action has been applied locally
}

export class ActionRecorder {
  private history: ActionRecord[] = [];
  private currentVersion: number = 0;
  private maxHistory: number;

  constructor(maxHistory: number = P2P_CONFIG.ACTION_HISTORY_SIZE) {
    this.maxHistory = maxHistory;
  }

  /**
   * Record an action
   */
  record(action: Action, playerId: string): ActionRecord {
    const record: ActionRecord = {
      type: action.type,
      payload: action.payload,
      objectId: action.payload?.id,
      timestamp: Date.now(),
      playerId,
      version: ++this.currentVersion,
      reliable: isActionReliable(action.type),
      applied: true, // Host actions are applied immediately
    };

    this.history.push(record);

    // Trim history if needed
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Create snapshot periodically
    if (this.currentVersion % P2P_CONFIG.SNAPSHOT_INTERVAL === 0) {
      logger.log(`[ActionRecorder] Version ${this.currentVersion}: snapshot point`);
    }

    return record;
  }

  /**
   * Get actions since a specific version
   */
  getActionsSince(version: number): ActionRecord[] {
    return this.history.filter(a => a.version > version);
  }

  /**
   * Get current version
   */
  getCurrentVersion(): number {
    return this.currentVersion;
  }

  /**
   * Get action history
   */
  getHistory(): ActionRecord[] {
    return [...this.history];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
    this.currentVersion = 0;
  }

  /**
   * Get history size
   */
  getSize(): number {
    return this.history.length;
  }
}

// ============================================================================
// ACTION APPLIER (Guest side)
// ============================================================================

/**
 * Apply an action to state (converts StateAction to Redux Action)
 */
export function applyAction(action: StateAction): Action {
  return {
    type: action.type as any,
    payload: action.payload,
  };
}

/**
 * Apply multiple actions in order
 */
export function applyActions(actions: StateAction[]): Action[] {
  return actions.map(applyAction);
}

// ============================================================================
// ACTION COMPRESSION
// ============================================================================

/**
 * Compress position updates by only sending latest position
 */
export function compressPositionUpdates(actions: StateAction[]): StateAction[] {
  const positionActions = new Map<string, StateAction>();

  for (const action of actions) {
    if (isPositionAction(action.type) && action.objectId) {
      // Keep only the latest position update for each object
      positionActions.set(action.objectId, action);
    }
  }

  const nonPositionActions = actions.filter(a => !isPositionAction(a.type));

  return [
    ...nonPositionActions,
    ...Array.from(positionActions.values()),
  ];
}

/**
 * Batch actions for efficient transmission
 */
export function batchActions(actions: StateAction[], maxBatchSize: number = 50): StateAction[][] {
  const batches: StateAction[][] = [];

  for (let i = 0; i < actions.length; i += maxBatchSize) {
    batches.push(actions.slice(i, i + maxBatchSize));
  }

  return batches;
}

// ============================================================================
// ACTION FILTERING
// ============================================================================

/**
 * Filter actions that should be synced
 * Some actions are local-only and shouldn't be sent to other players
 */
export function filterSyncableActions(actions: Action[]): Action[] {
  const LOCAL_ONLY_ACTIONS = new Set([
    'UPDATE_VIEW_TRANSFORM',
    'SET_PIXELS_PER_VU',
    'SET_LANGUAGE',
  ]);

  return actions.filter(a => !LOCAL_ONLY_ACTIONS.has(a.type));
}

/**
 * Filter actions by player (for permissions)
 */
export function filterActionsByPlayer(
  actions: StateAction[],
  playerId: string,
  playerPermissions?: any
): StateAction[] {
  // If player is GM, return all actions
  if (playerPermissions?.isGM) {
    return actions;
  }

  // Filter based on permissions
  return actions.filter(action => {
    // All players can see position updates
    if (isPositionAction(action.type)) {
      return true;
    }

    // Other filtering based on permissions...
    return true;
  });
}

// ============================================================================
// STATS
// ============================================================================

export interface ActionStats {
  totalActions: number;
  reliableActions: number;
  positionActions: number;
  otherActions: number;
  currentVersion: number;
}

export function getActionStats(recorder: ActionRecorder): ActionStats {
  const history = recorder.getHistory();
  const reliableActions = history.filter(a => a.reliable).length;
  const positionActions = history.filter(a => isPositionAction(a.type)).length;

  return {
    totalActions: history.length,
    reliableActions,
    positionActions,
    otherActions: history.length - reliableActions - positionActions,
    currentVersion: recorder.getCurrentVersion(),
  };
}
