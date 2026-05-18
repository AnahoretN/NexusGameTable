/**
 * State Synchronization Manager
 * Manages state synchronization between host and guests
 *
 * Host: Records actions, broadcasts to guests
 * Guest: Receives actions, applies to local state
 */

import { GameState } from '../../gameState';
import { Action } from '../../gameActions';
import {
  StateAction,
  StateSnapshotPayload,
  StatePatchPayload,
} from '../protocol/messages';
import { ActionRecorder, applyActions, compressPositionUpdates } from './actions';
import { DataChannelLike } from '../types';
import { MessageFactory, MessageType } from '../protocol/messages';
import { logger } from '../../../utils/logger';

// ============================================================================
// HOST SIDE: State Sync Manager
// ============================================================================

export interface GuestSyncState {
  connection: DataChannelLike;
  guestId: string;
  currentVersion: number;
  lastSync: number;
  pendingAck: Set<string>; // Message IDs waiting for ACK
}

export class HostStateSyncManager {
  private recorder: ActionRecorder;
  private guests: Map<string, GuestSyncState> = new Map();
  private currentState: GameState | null = null;

  constructor() {
    this.recorder = new ActionRecorder();
  }

  /**
   * Initialize with current game state
   */
  initialize(state: GameState): void {
    this.currentState = state;
    logger.log('[HostStateSync] Initialized');
  }

  /**
   * Record and broadcast an action
   */
  async recordAndBroadcast(action: Action, playerId: string): Promise<void> {
    // Record the action
    const record = this.recorder.record(action, playerId);

    // Broadcast to all guests
    this.broadcastAction(record);

    // Check if we should create a snapshot
    if (record.version % 100 === 0) {
      this.broadcastSnapshot();
    }
  }

  /**
   * Broadcast action to all guests
   */
  private broadcastAction(action: StateAction): void {
    const message = MessageFactory.createAction(action);
    const messageStr = JSON.stringify(message);

    for (const [guestId, guest] of this.guest.entries()) {
      if (!guest.connection.open) continue;

      try {
        guest.connection.send(messageStr);

        if (action.reliable) {
          guest.pendingAck.add(message.id);
        }

        guest.currentVersion = action.version || guest.currentVersion;
        guest.lastSync = Date.now();
      } catch (error) {
        logger.error(`[HostStateSync] Error sending to guest ${guestId}:`, error);
      }
    }
  }

  /**
   * Send full state snapshot to a specific guest
   */
  sendSnapshot(guestId: string): void {
    const guest = this.guest.get(guestId);
    if (!guest || !this.currentState) return;

    const snapshot: StateSnapshotPayload = {
      sessionId: this.currentState.sessionId || '',
      version: this.recorder.getCurrentVersion(),
      state: this.currentState, // State now contains sha256 hashes instead of base64
      timestamp: Date.now(),
    };

    const message = MessageFactory.createStateSnapshot(snapshot);

    try {
      guest.connection.send(JSON.stringify(message));
      logger.log(`[HostStateSync] Sent snapshot to guest ${guestId} (version ${snapshot.version})`);
    } catch (error) {
      logger.error(`[HostStateSync] Error sending snapshot:`, error);
    }
  }

  /**
   * Broadcast snapshot to all guests
   */
  private broadcastSnapshot(): void {
    logger.log('[HostStateSync] Broadcasting snapshot to all guests');
    for (const guestId of this.guest.keys()) {
      this.sendSnapshot(guestId);
    }
  }

  /**
   * Add a guest
   */
  addGuest(guestId: string, connection: DataChannelLike): void {
    this.guest.set(guestId, {
      connection,
      guestId,
      currentVersion: 0,
      lastSync: Date.now(),
      pendingAck: new Set(),
    });

    logger.log(`[HostStateSync] Added guest ${guestId}`);

    // Send snapshot to new guest
    setTimeout(() => this.sendSnapshot(guestId), 100);
  }

  /**
   * Remove a guest
   */
  removeGuest(guestId: string): void {
    this.guest.delete(guestId);
    logger.log(`[HostStateSync] Removed guest ${guestId}`);
  }

  /**
   * Handle ACK from guest
   */
  handleAck(guestId: string, messageId: string): void {
    const guest = this.guest.get(guestId);
    if (!guest) return;

    guest.pendingAck.delete(messageId);
  }

  /**
   * Handle state request from guest (after reconnect)
   */
  handleStateRequest(guestId: string, fromVersion: number): void {
    const guest = this.guest.get(guestId);
    if (!guest) return;

    // Get actions since guest's version
    const actions = this.recorder.getActionsSince(fromVersion);

    if (actions.length > 50) {
      // Too many actions, send snapshot instead
      this.sendSnapshot(guestId);
    } else {
      // Send patch
      const patch: StatePatchPayload = {
        sessionId: this.currentState?.sessionId || '',
        fromVersion,
        toVersion: this.recorder.getCurrentVersion(),
        actions,
        timestamp: Date.now(),
      };

      const message = MessageFactory.createStatePatch(patch);

      try {
        guest.connection.send(JSON.stringify(message));
        logger.log(`[HostStateSync] Sent patch to guest ${guestId} (${actions.length} actions)`);
      } catch (error) {
        logger.error(`[HostStateSync] Error sending patch:`, error);
      }
    }
  }

  /**
   * Update current state (call after state changes)
   */
  updateState(state: GameState): void {
    this.currentState = state;
  }

  /**
   * Get current version
   */
  getCurrentVersion(): number {
    return this.recorder.getCurrentVersion();
  }

  /**
   * Get guest count
   */
  getGuestCount(): number {
    return this.guest.size;
  }
}

// ============================================================================
// GUEST SIDE: State Sync Manager
// ============================================================================

export class GuestStateSyncManager {
  private currentVersion: number = 0;
  private hostConnection: DataChannelLike | null = null;
  private pendingActions: StateAction[] = [];
  private onStateUpdateCallback?: (state: any) => void;
  private onActionCallback?: (action: Action) => void;

  /**
   * Set host connection
   */
  setConnection(connection: DataChannelLike): void {
    this.hostConnection = connection;
  }

  /**
   * Handle state snapshot
   */
  handleSnapshot(snapshot: StateSnapshotPayload, dispatch: (action: Action) => void): void {
    logger.log(`[GuestStateSync] Received snapshot (version ${snapshot.version})`);

    // Apply snapshot
    dispatch({
      type: 'SYNC_STATE',
      payload: snapshot.state,
    });

    this.currentVersion = snapshot.version;
    this.pendingActions = []; // Clear pending actions

    if (this.onStateUpdateCallback) {
      this.onStateUpdateCallback(snapshot.state);
    }
  }

  /**
   * Handle state patch
   */
  handlePatch(patch: StatePatchPayload, dispatch: (action: Action) => void): void {
    logger.log(`[GuestStateSync] Received patch (${patch.actions.length} actions)`);

    // Validate version
    if (patch.fromVersion !== this.currentVersion) {
      logger.warn('[GuestStateSync] Version mismatch, requesting full sync');
      this.requestStateSync();
      return;
    }

    // Compress position updates (only keep latest)
    const compressedActions = compressPositionUpdates(patch.actions);

    // Apply actions
    for (const action of compressedActions) {
      if (this.onActionCallback) {
        this.onActionCallback({
          type: action.type as any,
          payload: action.payload,
        });
      }
    }

    this.currentVersion = patch.toVersion;
  }

  /**
   * Handle single action
   */
  handleAction(action: StateAction, dispatch: (action: Action) => void): void {
    // Send ACK if reliable
    if (action.reliable && this.hostConnection) {
      const ackMessage = MessageFactory.createAck(action.id || '');
      try {
        this.hostConnection.send(JSON.stringify(ackMessage));
      } catch (error) {
        logger.error('[GuestStateSync] Error sending ACK:', error);
      }
    }

    // Apply action
    dispatch({
      type: action.type as any,
      payload: action.payload,
    });

    // Update version if present
    if (action.version) {
      this.currentVersion = action.version;
    }
  }

  /**
   * Request state sync
   */
  requestStateSync(): void {
    if (!this.hostConnection) return;

    const message = MessageFactory.create(MessageType.STATE_SNAPSHOT, {
      fromVersion: this.currentVersion,
    });

    try {
      this.hostConnection.send(JSON.stringify(message));
      logger.log('[GuestStateSync] Requested state sync');
    } catch (error) {
      logger.error('[GuestStateSync] Error requesting sync:', error);
    }
  }

  /**
   * Register callback for state updates
   */
  onStateUpdate(callback: (state: any) => void): void {
    this.onStateUpdateCallback = callback;
  }

  /**
   * Register callback for actions
   */
  onAction(callback: (action: Action) => void): void {
    this.onActionCallback = callback;
  }

  /**
   * Get current version
   */
  getCurrentVersion(): number {
    return this.currentVersion;
  }

  /**
   * Clean up
   */
  cleanup(): void {
    this.hostConnection = null;
    this.pendingActions = [];
    this.onStateUpdateCallback = undefined;
    this.onActionCallback = undefined;
  }
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

/**
 * Filter state for sync (remove local-only fields)
 */
export function filterStateForSync(state: GameState): any {
  const {
    viewTransform,      // Local to each player
    playerPanelSettings, // Synced separately
    language,           // Local to each player
    _lastPanelSettingsUpdate,
    _pendingPanelSettings,
    ...syncableState
  } = state;

  return syncableState;
}

/**
 * Create state snapshot
 */
export function createStateSnapshot(state: GameState, version: number): StateSnapshotPayload {
  return {
    sessionId: state.sessionId || '',
    version,
    state: filterStateForSync(state),
    timestamp: Date.now(),
  };
}
