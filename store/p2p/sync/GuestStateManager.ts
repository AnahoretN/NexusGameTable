/**
 * Guest State Manager
 *
 * Manages the guest's local state and prevents:
 * 1. Re-broadcasting events that came from host
 * 2. Sending duplicate events for changes already applied by host
 * 3. Applying state changes for events we sent ourselves (optimistic update)
 */

import { StateUpdateMessage, StateSnapshotMessage, AppliedEvent, GameEventMessage } from '../protocol/authoritativeMessages';
import { GameAction } from '../protocol/authoritativeMessages';
import { logger } from '../../../utils/logger';

// ============================================================================
// PENDING EVENT (sent by us, waiting for host confirmation)
// ============================================================================

export interface PendingEvent {
  eventId: string;
  action: GameAction;
  sentAt: number;
  acknowledged: boolean;  // Host has processed and broadcast
}

// ============================================================================
// GUEST STATE MANAGER
// ============================================================================

export interface GuestStateManagerOptions {
  maxPendingEvents?: number;     // Max pending events to track
  maxHistorySize?: number;       // Max applied events to remember
}

export class GuestStateManager {
  private playerId: string;

  // Events we've sent to host, waiting for confirmation
  private pendingEvents: Map<string, PendingEvent> = new Map();

  // Events that host has confirmed (applied and broadcast)
  private confirmedEvents: Set<string> = new Set();

  // Events from host that we've applied
  private appliedHostEvents: Set<string> = new Set();

  // For deduplication - track last processed timestamp per object
  private objectTimestamps: Map<string, number> = new Map();

  // Options
  private maxPendingEvents: number;
  private maxHistorySize: number;

  constructor(playerId: string, options: GuestStateManagerOptions = {}) {
    this.playerId = playerId;
    this.maxPendingEvents = options.maxPendingEvents ?? 100;
    this.maxHistorySize = options.maxHistorySize ?? 1000;
  }

  // ==========================================================================
  // SENDING EVENTS
  // ==========================================================================

  /**
   * Check if we should send an event to host
   * Returns true if we should send, false if we should skip
   */
  shouldSendEvent(action: GameAction): boolean {
    // For object updates, check if we've already sent a more recent update
    if (action.objectId) {
      const lastUpdate = this.objectTimestamps.get(action.objectId);
      const now = Date.now();

      // If we sent an update for this object in the last 25ms, skip it
      // This prevents spamming host during drag operations
      if (lastUpdate && (now - lastUpdate) < 25) {
        return false;
      }
    }

    return true;
  }

  /**
   * Register an event we're about to send to host
   * Returns the eventId that should be used
   */
  registerOutgoingEvent(action: GameAction): string {
    const eventId = this.generateEventId();

    const pending: PendingEvent = {
      eventId,
      action,
      sentAt: Date.now(),
      acknowledged: false,
    };

    this.pendingEvents.set(eventId, pending);

    // Trim pending events if needed
    if (this.pendingEvents.size > this.maxPendingEvents) {
      const oldest = Array.from(this.pendingEvents.values())
        .sort((a, b) => a.sentAt - b.sentAt)[0];

      if (oldest) {
        this.pendingEvents.delete(oldest.eventId);
      }
    }

    // Update object timestamp
    if (action.objectId) {
      this.objectTimestamps.set(action.objectId, Date.now());
    }

    return eventId;
  }

  /**
   * Create a GameEventMessage for an action
   */
  createEventMessage(action: GameAction, eventId?: string): GameEventMessage {
    const id = eventId ?? this.registerOutgoingEvent(action);

    return {
      type: 'GAME_EVENT' as any,
      payload: {
        playerId: this.playerId,
        playerTimestamp: Date.now(),
        eventId: id,
        action,
      },
    };
  }

  // ==========================================================================
  // RECEIVING STATE UPDATES
  // ==========================================================================

  /**
   * Process a state update from host
   * Returns the actions that should be dispatched locally
   */
  processStateUpdate(message: StateUpdateMessage): GameAction[] {
    const actionsToDispatch: GameAction[] = [];
    const { appliedEvents, stateChanges } = message.payload;

    for (const appliedEvent of appliedEvents) {
      // Check if this is our own event
      const isOurEvent = appliedEvent.playerId === this.playerId;
      const pending = this.pendingEvents.get(appliedEvent.eventId);

      if (isOurEvent && pending) {
        // This is our event being confirmed by host
        // Mark as acknowledged but don't apply (optimistic update already applied)
        pending.acknowledged = true;
        this.confirmedEvents.add(appliedEvent.eventId);

        // Clean up confirmed events periodically
        if (this.confirmedEvents.size > this.maxHistorySize) {
          const toRemove = Array.from(this.confirmedEvents).slice(0, 100);
          toRemove.forEach(id => {
            this.confirmedEvents.delete(id);
            this.pendingEvents.delete(id);
          });
        }

        logger.debug(`[GuestStateManager] Our event confirmed: ${appliedEvent.eventId}`);
        continue;  // Skip applying - we already did optimistic update
      }

      // This is an event from another player
      if (!this.appliedHostEvents.has(appliedEvent.eventId)) {
        // Find the corresponding state change
        const stateChange = stateChanges.find(sc => {
          // Match state change to event
          if (appliedEvent.actionType === 'DELETE_OBJECT') {
            return sc.type === 'object' && sc.id === appliedEvent.eventId;  // eventId might be objectId
          }
          return sc.change?._modifiedBy === appliedEvent.playerId;
        });

        if (stateChange) {
          actionsToDispatch.push(this.stateChangeToAction(stateChange));
          this.appliedHostEvents.add(appliedEvent.eventId);
        }
      }
    }

    // Trim applied host events
    if (this.appliedHostEvents.size > this.maxHistorySize) {
      const toRemove = Array.from(this.appliedHostEvents).slice(0, 100);
      toRemove.forEach(id => this.appliedHostEvents.delete(id));
    }

    return actionsToDispatch;
  }

  /**
   * Process a full state snapshot from host
   */
  processStateSnapshot(message: StateSnapshotMessage): any {
    const { state } = message.payload;

    // Return action to sync entire state
    return {
      type: 'SYNC_STATE',
      payload: {
        ...state,
        _fromHost: true,  // Mark as from host to prevent re-broadcast
      },
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Convert a state change to a Redux action
   */
  private stateChangeToAction(stateChange: any): GameAction {
    switch (stateChange.type) {
      case 'object':
        if (stateChange.change._deleted) {
          return {
            type: 'DELETE_OBJECT',
            objectId: stateChange.id,
            payload: { id: stateChange.id },
          };
        }
        return {
          type: 'UPDATE_OBJECT',
          objectId: stateChange.id,
          payload: {
            id: stateChange.id,
            ...stateChange.change,
            skipNetworkSync: true,  // Don't re-broadcast to host
          },
        };

      case 'dice':
        return {
          type: 'CREATE_DICE_ROLL',
          payload: {
            roll: stateChange.change,
            skipNetworkSync: true,
          },
        };

      default:
        logger.warn(`[GuestStateManager] Unknown state change type: ${stateChange.type}`);
        return {
          type: 'UNKNOWN',
          payload: stateChange,
        };
    }
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Clear all state
   */
  clear(): void {
    this.pendingEvents.clear();
    this.confirmedEvents.clear();
    this.appliedHostEvents.clear();
    this.objectTimestamps.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      pendingEvents: this.pendingEvents.size,
      confirmedEvents: this.confirmedEvents.size,
      appliedHostEvents: this.appliedHostEvents.size,
      trackedObjects: this.objectTimestamps.size,
    };
  }

  /**
   * Clean up stale pending events
   */
  cleanupStaleEvents(maxAge: number = 30000): void {
    const now = Date.now();
    const stale: string[] = [];

    for (const [eventId, pending] of this.pendingEvents) {
      if (!pending.acknowledged && (now - pending.sentAt) > maxAge) {
        stale.push(eventId);
      }
    }

    stale.forEach(id => this.pendingEvents.delete(id));

    if (stale.length > 0) {
      logger.warn(`[GuestStateManager] Cleaned up ${stale.length} stale pending events`);
    }
  }
}
