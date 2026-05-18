/**
 * P2P Action Batching
 *
 * Batches rapid actions (like drag operations) into single updates
 * to reduce P2P message overhead
 */

import { logger } from '../../utils/logger';

// ============================================================================
// ACTION BATCHING
// ============================================================================

interface BatchedAction {
  action: any;
  timestamp: number;
}

interface ActionBatch {
  objectId: string;
  actions: BatchedAction[];
  lastAction: BatchedAction;
}

/**
 * Batches rapid updates to the same object
 */
export class ActionBatcher {
  private pendingBatches = new Map<string, ActionBatch>();
  private flushTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private batchWindow = 30; // 30ms batching window
  private onFlushCallback?: (objectId: string, finalAction: any) => void;

  constructor(options?: { batchWindow?: number; onFlush?: (objectId: string, finalAction: any) => void }) {
    if (options?.batchWindow) {
      this.batchWindow = options.batchWindow;
    }
    this.onFlushCallback = options?.onFlush;
  }

  /**
   * Add an action to the batch
   * Returns true if action was batched, false if it should be sent immediately
   */
  addAction(action: any): boolean {
    // Only batch position updates
    if (action.type !== 'UPDATE_OBJECT') {
      return false;
    }

    const objectId = action.payload?.id;
    if (!objectId) {
      return false;
    }

    // Only batch x, y, rotation changes (rapid drag operations)
    const payload = action.payload;
    const keys = Object.keys(payload);
    const isPositionUpdate = keys.every(k =>
      k === 'id' || k === 'x' || k === 'y' || k === 'rotation' || k === 'zIndex'
    );

    if (!isPositionUpdate) {
      // Flush any pending batch for this object
      this.flush(objectId);
      return false;
    }

    // Add to batch
    const batchedAction: BatchedAction = {
      action,
      timestamp: Date.now(),
    };

    const existingBatch = this.pendingBatches.get(objectId);
    if (existingBatch) {
      existingBatch.actions.push(batchedAction);
      existingBatch.lastAction = batchedAction;

      // Reset flush timeout
      const existingTimeout = this.flushTimeouts.get(objectId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
    } else {
      // Create new batch
      this.pendingBatches.set(objectId, {
        objectId,
        actions: [batchedAction],
        lastAction: batchedAction,
      });
    }

    // Set flush timeout
    const timeout = setTimeout(() => {
      this.flush(objectId);
    }, this.batchWindow);

    this.flushTimeouts.set(objectId, timeout);

    return true;
  }

  /**
   * Flush batched actions for an object
   */
  flush(objectId: string): any | null {
    const batch = this.pendingBatches.get(objectId);
    if (!batch) {
      return null;
    }

    // Get the final action (most recent state)
    const finalAction = batch.lastAction.action;

    // Clear batch
    this.pendingBatches.delete(objectId);
    const timeout = this.flushTimeouts.get(objectId);
    if (timeout) {
      clearTimeout(timeout);
      this.flushTimeouts.delete(objectId);
    }

    // Call callback if set
    if (this.onFlushCallback) {
      this.onFlushCallback(objectId, finalAction);
    }

    return finalAction;
  }

  /**
   * Flush all pending batches
   */
  flushAll(): any[] {
    const flushedActions: any[] = [];

    for (const objectId of this.pendingBatches.keys()) {
      const action = this.flush(objectId);
      if (action) {
        flushedActions.push(action);
      }
    }

    return flushedActions;
  }

  /**
   * Get pending batch count
   */
  getPendingCount(): number {
    return this.pendingBatches.size;
  }

  /**
   * Check if object has pending batch
   */
  hasPendingBatch(objectId: string): boolean {
    return this.pendingBatches.has(objectId);
  }

  /**
   * Clear all pending batches
   */
  clear(): void {
    for (const timeout of this.flushTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pendingBatches.clear();
    this.flushTimeouts.clear();
  }
}

// ============================================================================
// PREDICTIVE POSITION UPDATES
// ============================================================================

/**
 * Predictive position sender - sends fewer updates by predicting motion
 */
export class PredictivePositionSender {
  private lastSentPositions = new Map<string, { x: number; y: number; rotation: number; timestamp: number }>();
  private positionThreshold = 5; // Minimum pixels to send update
  private timeThreshold = 50; // Minimum ms between sends

  /**
   * Check if position update should be sent
   */
  shouldSend(objectId: string, x: number, y: number, rotation?: number): boolean {
    const lastSent = this.lastSentPositions.get(objectId);
    if (!lastSent) {
      this.updateLastSent(objectId, x, y, rotation);
      return true;
    }

    const now = Date.now();
    const timeDelta = now - lastSent.timestamp;
    const distanceDelta = Math.sqrt(
      Math.pow(x - lastSent.x, 2) + Math.pow(y - lastSent.y, 2)
    );
    const rotationDelta = rotation !== undefined
      ? Math.abs(rotation - (lastSent.rotation || 0))
      : 0;

    // Send if thresholds exceeded
    if (timeDelta >= this.timeThreshold &&
        (distanceDelta >= this.positionThreshold || rotationDelta >= 5)) {
      this.updateLastSent(objectId, x, y, rotation);
      return true;
    }

    return false;
  }

  /**
   * Update last sent position
   */
  private updateLastSent(objectId: string, x: number, y: number, rotation?: number): void {
    this.lastSentPositions.set(objectId, {
      x,
      y,
      rotation: rotation ?? 0,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear tracking for an object
   */
  clear(objectId: string): void {
    this.lastSentPositions.delete(objectId);
  }

  /**
   * Clear all tracking
   */
  clearAll(): void {
    this.lastSentPositions.clear();
  }
}

// ============================================================================
// ACTION PRIORITIZATION
// ============================================================================

export enum ActionPriority {
  CRITICAL = 0,  // Cards, dice rolls - send immediately
  HIGH = 1,      // Token creation, deletion
  NORMAL = 2,    // Position updates, rotation
  LOW = 3,       // UI updates
}

/**
 * Get priority for an action type
 */
export function getActionPriority(action: any): ActionPriority {
  switch (action.type) {
    case 'DRAW_CARD':
    case 'PLAY_TOP_CARD':
    case 'ROLL_DICE':
    case 'FLIP_OBJECT':
      return ActionPriority.CRITICAL;

    case 'ADD_OBJECT':
    case 'DELETE_OBJECT':
    case 'SHUFFLE_DECK':
      return ActionPriority.HIGH;

    case 'UPDATE_OBJECT':
      // Check if it's a position update
      const payload = action.payload;
      if (payload) {
        const keys = Object.keys(payload);
        const isPositionUpdate = keys.every(k =>
          k === 'id' || k === 'x' || k === 'y' || k === 'rotation' || k === 'zIndex'
        );
        if (isPositionUpdate) {
          return ActionPriority.NORMAL;
        }
      }
      return ActionPriority.HIGH;

    case 'UPDATE_VIEW_TRANSFORM':
    case 'UPDATE_PLAYER_PANEL_SETTINGS':
      return ActionPriority.LOW;

    default:
      return ActionPriority.NORMAL;
  }
}

// ============================================================================
// ACTION QUEUE
// ============================================================================

interface QueuedAction {
  action: any;
  priority: ActionPriority;
  timestamp: number;
}

/**
 * Prioritized action queue
 */
export class ActionQueue {
  private queue: QueuedAction[] = [];
  private processing = false;
  private maxQueueSize = 100;

  /**
   * Add action to queue
   */
  enqueue(action: any): void {
    // Don't queue if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      logger.warn('[ActionQueue] Queue full, dropping action:', action.type);
      return;
    }

    const priority = getActionPriority(action);
    this.queue.push({
      action,
      priority,
      timestamp: Date.now(),
    });

    // Sort by priority
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get next action to process
   */
  dequeue(): any | null {
    if (this.queue.length === 0) {
      return null;
    }

    return this.queue.shift()!.action;
  }

  /**
   * Get all actions of a priority level
   */
  dequeuePriority(priority: ActionPriority): any[] {
    const actions: any[] = [];
    const remaining: QueuedAction[] = [];

    for (const queued of this.queue) {
      if (queued.priority === priority) {
        actions.push(queued.action);
      } else {
        remaining.push(queued);
      }
    }

    this.queue = remaining;
    return actions;
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}
