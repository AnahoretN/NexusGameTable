/**
 * P2P System - Main Export
 * New P2P system for Nexus Game Table
 *
 * This module exports all P2P functionality in a clean, organized way.
 */

// ============================================================================
// TYPES
// ============================================================================

export * from './types';

// ============================================================================
// PROTOCOL
// ============================================================================

export * from './protocol/messages';

// ============================================================================
// CONNECTION
// ============================================================================

export {
  ConnectionManager,
  isConnected,
  isHost,
  isGuest,
} from './connection/manager';

// ============================================================================
// IMAGES
// ============================================================================

export {
  ImageManifestBuilder,
  getImagesByPriority,
  getMissingImages,
  getManifestTotalSize,
  getImagesInPriorityRange,
  compareManifests,
} from './images/manifest';

export {
  ProgressiveImageLoader,
  chunkImageData,
  createImageChunks,
} from './images/loader';

export {
  HostImageTransferManager,
  GuestImageTransferManager,
  calculateChunkSize,
  estimateTransferTime,
} from './images/transfer';

// ============================================================================
// STATE
// ============================================================================

export {
  ActionRecorder,
  isActionReliable,
  isPositionAction,
  applyAction,
  applyActions,
  compressPositionUpdates,
  batchActions,
  filterSyncableActions,
  filterActionsByPlayer,
  getActionStats,
} from './state/actions';

export {
  HostStateSyncManager,
  GuestStateSyncManager,
  filterStateForSync,
  createStateSnapshot,
} from './state/sync';

// ============================================================================
// FACTORY
// ============================================================================

import { ConnectionManager } from './connection/manager';
import { HostImageTransferManager } from './images/transfer';
import { GuestImageTransferManager } from './images/transfer';
import { HostStateSyncManager } from './state/sync';
import { GuestStateSyncManager } from './state/sync';
import { PlayerRole } from './types';

/**
 * Create a complete P2P system for host
 */
export function createHostP2PSystem(connectionManager: ConnectionManager) {
  return {
    imageTransfer: new HostImageTransferManager(),
    stateSync: new HostStateSyncManager(),
  };
}

/**
 * Create a complete P2P system for guest
 */
export function createGuestP2PSystem(connectionManager: ConnectionManager) {
  return {
    imageTransfer: new GuestImageTransferManager(),
    stateSync: new GuestStateSyncManager(),
  };
}

// ============================================================================
// HOOKS
// ============================================================================

export { useP2PConnection, useP2PImages } from './hooks';
export type { UseP2PConnectionReturn, UseP2PImagesReturn, ImageLoadStatus } from './hooks';

// ============================================================================
// OPTIMIZATIONS (New P2P Performance Modules)
// ============================================================================

export {
  objectExtractionCache,
  extractImagesIncremental,
  needsBoardContentExtraction,
  extractBoardContentOnly,
  p2pChangeTracker,
  createLazyExtractor,
  startExtractionCacheCleanup,
} from './optimizedStateSync';

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
