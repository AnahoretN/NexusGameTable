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
// ASSET TRANSFER (New CAS system)
// ============================================================================

export {
  assetTransferHost,
  assetTransferGuest,
  type AssetTransferHost,
  type AssetTransferGuest,
  type TransferProgress,
  type ProgressCallback,
  type CompleteCallback,
  type ErrorCallback,
  type TransferResult,
  type TransferError,
  type HostTransferConfig,
  type GuestTransferConfig,
} from './assetTransfer';

export {
  AssetMessageFactory,
  AssetMessageType,
  type AssetMessage,
  type AssetManifestMessage,
  type AssetRequestMessage,
  type AssetChunkMessage,
  type AssetAckMessage,
  type AssetProgressMessage,
  type AssetCompleteMessage,
  type AssetErrorMessage,
  type AssetCancelMessage,
  type AssetManifestEntry,
  type AssetManifestPayload,
  type AssetRequestPayload,
  type AssetChunkPayload,
  type AssetAckPayload,
  type AssetProgressPayload,
  type AssetCompletePayload,
  type AssetErrorPayload,
  type AssetCancelPayload,
  type AssetErrorCode,
  calculateAssetPriority,
  groupAssetsByPriority,
  calculateChunkSize,
  isAssetMessage,
  getAssetPayload,
} from './protocol/assetMessages';

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
// OPTIMIZATIONS (New P2P Performance Modules)
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

// ============================================================================
// HOOKS
// ============================================================================

export { useP2PConnection } from './hooks';
export type { UseP2PConnectionReturn } from './hooks';
