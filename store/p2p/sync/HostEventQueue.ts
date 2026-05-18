/**
 * Host Event Queue
 *
 * The host maintains a queue of all incoming events from guests.
 * Events are sorted by timestamp and applied in order.
 * After applying events, host broadcasts state updates to all guests.
 */

import { GameEventMessage, AppliedEvent, StateChange, AuthMessageFactory } from '../protocol/authoritativeMessages';
import { GameAction } from '../protocol/authoritativeMessages';
import { logger } from '../../../utils/logger';

// ============================================================================
// QUEUED EVENT
// ============================================================================

export interface QueuedEvent {
  eventId: string;
  playerId: string;
  playerTimestamp: number;
  receivedAt: number;     // When host received this event
  action: GameAction;
  applied: boolean;
}

// ============================================================================
// HOST EVENT QUEUE
// ============================================================================

export interface HostEventQueueOptions {
  maxQueueSize?: number;      // Max events to keep in queue
  processingInterval?: number; // Process queue every N ms
  batchApplies?: boolean;      // Batch multiple events into one update
}

export class HostEventQueue {
  private queue: QueuedEvent[] = [];
  private processing = false;
  private maxQueueSize: number;
  private processingInterval: number;
  private batchApplies: boolean;
  private processingTimer: NodeJS.Timeout | null = null;
  private eventHistory: Map<string, AppliedEvent> = new Map();  // For deduplication

  // Callbacks
  private onStateUpdate?: (appliedEvents: AppliedEvent[], stateChanges: StateChange[]) => void;

  constructor(options: HostEventQueueOptions = {}) {
    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.processingInterval = options.processingInterval ?? 16; // ~60fps
    this.batchApplies = options.batchApplies ?? true;
  }

  // ==========================================================================
  // QUEUE MANAGEMENT
  // ==========================================================================

  /**
   * Add an event to the queue
   * Returns true if event was added (false if duplicate)
   */
  addEvent(message: GameEventMessage): boolean {
    const { eventId, playerId, playerTimestamp, action } = message.payload;

    // Check for duplicate event
    if (this.eventHistory.has(eventId)) {
      logger.warn(`[HostEventQueue] Duplicate event ignored: ${eventId}`);
      return false;
    }

    const queuedEvent: QueuedEvent = {
      eventId,
      playerId,
      playerTimestamp,
      receivedAt: Date.now(),
      action,
      applied: false,
    };

    this.queue.push(queuedEvent);
    this.eventHistory.set(eventId, {
      eventId,
      playerId,
      playerTimestamp,
      actionType: action.type,
    });

    // Trim queue if needed (keep most recent by timestamp)
    if (this.queue.length > this.maxQueueSize) {
      this.queue.sort((a, b) => a.playerTimestamp - b.playerTimestamp);
      const removed = this.queue.shift();
      if (removed) {
        this.eventHistory.delete(removed.eventId);
      }
    }

    logger.debug(`[HostEventQueue] Event queued: ${action.type} from ${playerId} (${this.queue.length} in queue)`);

    return true;
  }

  /**
   * Process all pending events in timestamp order
   */
  processQueue(): void {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Sort queue by timestamp (oldest first)
      this.queue.sort((a, b) => a.playerTimestamp - b.playerTimestamp);

      if (this.batchApplies) {
        // Batch all pending events into one update
        this.applyBatch();
      } else {
        // Apply events one by one
        this.applySequential();
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Apply all pending events as a batch
   */
  private applyBatch(): void {
    const appliedEvents: AppliedEvent[] = [];
    const stateChanges: StateChange[] = [];

    // Process all unapplied events
    const unapplied = this.queue.filter(e => !e.applied);

    for (const event of unapplied) {
      const change = this.applyEvent(event);
      if (change) {
        appliedEvents.push({
          eventId: event.eventId,
          playerId: event.playerId,
          playerTimestamp: event.playerTimestamp,
          actionType: event.action.type,
        });
        stateChanges.push(change);
        event.applied = true;
      }
    }

    // Clean up applied events
    this.queue = this.queue.filter(e => !e.applied);

    // Broadcast update if we have changes
    if (appliedEvents.length > 0 && this.onStateUpdate) {
      this.onStateUpdate(appliedEvents, stateChanges);
    }
  }

  /**
   * Apply events sequentially (one state update per event)
   */
  private applySequential(): void {
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      if (!event.applied) {
        const change = this.applyEvent(event);
        if (change) {
          const appliedEvents: AppliedEvent[] = [{
            eventId: event.eventId,
            playerId: event.playerId,
            playerTimestamp: event.playerTimestamp,
            actionType: event.action.type,
          }];

          if (this.onStateUpdate) {
            this.onStateUpdate(appliedEvents, [change]);
          }
        }
      }
    }
  }

  /**
   * Apply a single event and return the state change
   * This is where the actual game logic would be applied
   */
  private applyEvent(event: QueuedEvent): StateChange | null {
    const { action, playerId } = event;

    // Convert game action to state change
    // This is a simplified version - in reality, this would call the game reducer
    switch (action.type) {
      case 'UPDATE_OBJECT':
      case 'MOVE_OBJECT_COMMIT':
        if (action.payload?.id) {
          return {
            type: 'object',
            id: action.payload.id,
            change: {
              ...action.payload,
              _fromHost: true,  // Mark as coming from host
              _modifiedBy: playerId,
            },
          };
        }
        break;

      case 'DELETE_OBJECT':
        if (action.payload?.id) {
          return {
            type: 'object',
            id: action.payload.id,
            change: { _deleted: true },
          };
        }
        break;

      case 'CREATE_OBJECT':
        if (action.payload?.object) {
          const obj = action.payload.object;
          return {
            type: 'object',
            id: obj.id,
            change: {
              ...obj,
              _fromHost: true,
              _createdBy: playerId,
            },
          };
        }
        break;

      case 'FLIP_CARD':
        if (action.payload?.id) {
          return {
            type: 'object',
            id: action.payload.id,
            change: {
              isFlipped: action.payload.isFlipped,
              _fromHost: true,
              _modifiedBy: playerId,
            },
          };
        }
        break;

      case 'SHUFFLE_DECK':
        if (action.payload?.deckId) {
          return {
            type: 'object',
            id: action.payload.deckId,
            change: {
              cards: action.payload.cards,  // New card order
              _fromHost: true,
              _modifiedBy: playerId,
            },
          };
        }
        break;

      case 'ROLL_DICE':
      case 'CREATE_DICE_ROLL':
        if (action.payload?.roll) {
          return {
            type: 'dice',
            id: action.payload.roll.id,
            change: {
              ...action.payload.roll,
              _fromHost: true,
              _createdBy: playerId,
            },
          };
        }
        break;

      default:
        logger.warn(`[HostEventQueue] Unknown action type: ${action.type}`);
    }

    return null;
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Start automatic processing
   */
  start(): void {
    if (this.processingTimer) {
      return;
    }

    this.processingTimer = setInterval(() => {
      this.processQueue();
    }, this.processingInterval);

    logger.log('[HostEventQueue] Started automatic processing');
  }

  /**
   * Stop automatic processing
   */
  stop(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    logger.log('[HostEventQueue] Stopped automatic processing');
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.queue = [];
    this.eventHistory.clear();
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      appliedCount: Array.from(this.eventHistory.values()).length,
      processing: this.processing,
    };
  }

  // ==========================================================================
  // CALLBACKS
  // ==========================================================================

  /**
   * Set callback for state updates
   */
  onStateUpdateCallback(callback: (appliedEvents: AppliedEvent[], stateChanges: StateChange[]) => void): void {
    this.onStateUpdate = callback;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert Redux action to GameAction
 */
export function reduxActionToGameAction(reduxAction: any): GameAction {
  return {
    type: reduxAction.type,
    objectId: reduxAction.payload?.id,
    payload: reduxAction.payload,
  };
}

/**
 * Check if action should be synced to host
 */
export function shouldSyncAction(actionType: string): boolean {
  const LOCAL_ONLY_ACTIONS = new Set([
    'UPDATE_VIEW_TRANSFORM',    // Local view state
    'SET_PIXELS_PER_VU',        // Local zoom
    'SET_LANGUAGE',             // Local language
    'SYNC_STATE',               // Don't sync sync messages!
    'SET_ACTIVE_ID',            // Local active player
  ]);

  return !LOCAL_ONLY_ACTIONS.has(actionType);
}
