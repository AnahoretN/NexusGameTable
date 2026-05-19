/**
 * P2P System - Main Export
 *
 * This module exports P2P functionality used by usePeerConnection.
 */

// ============================================================================
// UTILITIES
// ============================================================================

export {
  ActionBatcher,
  PredictivePositionSender,
  getActionPriority,
  ActionQueue,
  ActionPriority,
} from './actionBatcher';

export {
  hasIdleCallback,
  requestIdleCallbackCompat,
  cancelIdleCallbackCompat,
  IdleWorkScheduler,
  idleWorkScheduler,
  processInChunks,
  defer,
  deferWithPriority,
} from './idleWorkScheduler';
