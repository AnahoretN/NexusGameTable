/**
 * P2P Asset Transfer Protocol
 *
 * Message types and structures for transferring assets between host and guests.
 * Part of the new Content-Addressable Storage system.
 */

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export enum AssetMessageType {
  // Host → Guest: List of all assets needed for the room
  MANIFEST = 'ASSET_MANIFEST',

  // Guest → Host: Request for missing assets (differential loading)
  REQUEST = 'ASSET_REQUEST',

  // Host → Guest: Binary chunk of asset data
  CHUNK = 'ASSET_CHUNK',

  // Guest → Host: Acknowledgment of received chunk
  ACK = 'ASSET_ACK',

  // Host → Guest: Progress update for UI
  PROGRESS = 'ASSET_PROGRESS',

  // Host → Guest: All transfers complete
  COMPLETE = 'ASSET_COMPLETE',

  // Either: Error during transfer
  ERROR = 'ASSET_ERROR',

  // Either: Cancel transfer
  CANCEL = 'ASSET_CANCEL'
}

// ============================================================================
// BASE MESSAGE STRUCTURE
// ============================================================================

export interface AssetMessage {
  type: AssetMessageType;
  id: string;              // Unique message ID
  timestamp: number;
}

// ============================================================================
// MANIFEST (Host → Guest)
// ============================================================================

export interface AssetManifestEntry {
  hash: string;            // SHA-256 hash of the asset
  size: number;            // Size in bytes
  mimeType: string;        // MIME type
  priority: number;        // 0-10, higher = load first
}

export interface AssetManifestPayload {
  sessionId: string;
  version: number;
  timestamp: number;
  assets: AssetManifestEntry[];
  totalSize: number;
  totalCount: number;
}

export interface AssetManifestMessage extends AssetMessage {
  type: AssetMessageType.MANIFEST;
  payload: AssetManifestPayload;
}

// ============================================================================
// REQUEST (Guest → Host)
// ============================================================================

export interface AssetRequestPayload {
  sessionId: string;
  hashes: string[];        // Hashes of assets the guest needs
  priority?: number;       // Only request assets with this priority or higher
}

export interface AssetRequestMessage extends AssetMessage {
  type: AssetMessageType.REQUEST;
  payload: AssetRequestPayload;
}

// ============================================================================
// CHUNK (Host → Guest)
// ============================================================================

export interface AssetChunkPayload {
  hash: string;
  chunkIndex: number;      // Current chunk index
  totalChunks: number;     // Total number of chunks for this asset
  data: ArrayBuffer;       // Binary chunk data
  size: number;            // Size of this chunk
}

export interface AssetChunkMessage extends AssetMessage {
  type: AssetMessageType.CHUNK;
  payload: AssetChunkPayload;
}

// ============================================================================
// ACK (Guest → Host)
// ============================================================================

export interface AssetAckPayload {
  hash: string;
  chunkIndex: number;
  received: boolean;
  error?: string;
}

export interface AssetAckMessage extends AssetMessage {
  type: AssetMessageType.ACK;
  payload: AssetAckPayload;
}

// ============================================================================
// PROGRESS (Host → Guest)
// ============================================================================

export interface AssetProgressPayload {
  hash: string;
  chunkIndex: number;
  totalChunks: number;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;      // 0-100
  bytesPerSecond?: number; // Transfer speed
  estimatedSecondsRemaining?: number;
}

export interface AssetProgressMessage extends AssetMessage {
  type: AssetMessageType.PROGRESS;
  payload: AssetProgressPayload;
}

// ============================================================================
// COMPLETE (Host → Guest)
// ============================================================================

export interface AssetCompletePayload {
  sessionId: string;
  totalAssets: number;
  successfulAssets: number;
  failedAssets: string[];
  totalBytes: number;
  duration: number;        // Transfer duration in ms
}

export interface AssetCompleteMessage extends AssetMessage {
  type: AssetMessageType.COMPLETE;
  payload: AssetCompletePayload;
}

// ============================================================================
// ERROR (Either → Either)
// ============================================================================

export interface AssetErrorPayload {
  hash?: string;
  code: AssetErrorCode;
  message: string;
  details?: any;
}

export enum AssetErrorCode {
  // Host errors
  ASSET_NOT_FOUND = 'ASSET_NOT_FOUND',
  DATABASE_ERROR = 'DATABASE_ERROR',
  WORKER_ERROR = 'WORKER_ERROR',

  // Guest errors
  INVALID_HASH = 'INVALID_HASH',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  STORAGE_FULL = 'STORAGE_FULL',

  // Network errors
  TIMEOUT = 'TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',

  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface AssetErrorMessage extends AssetMessage {
  type: AssetMessageType.ERROR;
  payload: AssetErrorPayload;
}

// ============================================================================
// CANCEL (Either → Either)
// ============================================================================

export interface AssetCancelPayload {
  sessionId?: string;
  reason?: string;
  hashes?: string[];       // Cancel specific assets (optional)
}

export interface AssetCancelMessage extends AssetMessage {
  type: AssetMessageType.CANCEL;
  payload: AssetCancelPayload;
}

// ============================================================================
// MESSAGE FACTORY
// ============================================================================

export class AssetMessageFactory {
  static generateId(): string {
    return `asset_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static createManifest(
    sessionId: string,
    assets: AssetManifestEntry[]
  ): AssetManifestMessage {
    const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);

    return {
      type: AssetMessageType.MANIFEST,
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        sessionId,
        version: 1,
        timestamp: Date.now(),
        assets,
        totalSize,
        totalCount: assets.length
      }
    };
  }

  static createRequest(
    sessionId: string,
    hashes: string[],
    priority?: number
  ): AssetRequestMessage {
    return {
      type: AssetMessageType.REQUEST,
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        sessionId,
        hashes,
        priority
      }
    };
  }

  static createChunk(
    hash: string,
    chunkIndex: number,
    totalChunks: number,
    data: ArrayBuffer
  ): AssetChunkMessage {
    return {
      type: AssetMessageType.CHUNK,
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        hash,
        chunkIndex,
        totalChunks,
        data,
        size: data.byteLength
      }
    };
  }

  static createAck(
    hash: string,
    chunkIndex: number,
    received: boolean,
    error?: string
  ): AssetAckMessage {
    return {
      type: AssetMessageType.ACK,
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        hash,
        chunkIndex,
        received,
        error
      }
    };
  }

  static createProgress(
    hash: string,
    chunkIndex: number,
    totalChunks: number,
    bytesTransferred: number,
    totalBytes: number,
    bytesPerSecond?: number,
    estimatedSecondsRemaining?: number
  ): AssetProgressMessage {
    const percentage = Math.round((bytesTransferred / totalBytes) * 100);

    return {
      type: AssetMessageType.PROGRESS,
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        hash,
        chunkIndex,
        totalChunks,
        bytesTransferred,
        totalBytes,
        percentage,
        bytesPerSecond,
        estimatedSecondsRemaining
      }
    };
  }

  static createComplete(
    sessionId: string,
    totalAssets: number,
    successfulAssets: number,
    failedAssets: string[],
    totalBytes: number,
    duration: number
  ): AssetCompleteMessage {
    return {
      type: AssetMessageType.COMPLETE,
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        sessionId,
        totalAssets,
        successfulAssets,
        failedAssets,
        totalBytes,
        duration
      }
    };
  }

  static createError(
    code: AssetErrorCode,
    message: string,
    hash?: string,
    details?: any
  ): AssetErrorMessage {
    return {
      type: AssetMessageType.ERROR,
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        hash,
        code,
        message,
        details
      }
    };
  }

  static createCancel(
    sessionId?: string,
    reason?: string,
    hashes?: string[]
  ): AssetCancelMessage {
    return {
      type: AssetMessageType.CANCEL,
      id: this.generateId(),
      timestamp: Date.now(),
      payload: {
        sessionId,
        reason,
        hashes
      }
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a message is an asset message
 */
export function isAssetMessage(message: any): message is AssetMessage {
  return message && Object.values(AssetMessageType).includes(message.type);
}

/**
 * Get message type specific payload
 */
export function getAssetPayload<T extends AssetMessage>(
  message: T
): T['payload'] {
  return message.payload;
}

/**
 * Calculate priority for asset (higher = load first)
 * Based on size and type
 */
export function calculateAssetPriority(
  hash: string,
  size: number,
  mimeType: string
): number {
  // Small images get higher priority
  if (size < 50 * 1024) return 10;      // < 50KB
  if (size < 200 * 1024) return 7;     // < 200KB
  if (size < 1024 * 1024) return 5;    // < 1MB
  if (size < 5 * 1024 * 1024) return 3; // < 5MB
  return 1;                            // >= 5MB
}

/**
 * Group assets by priority
 */
export function groupAssetsByPriority(
  assets: AssetManifestEntry[]
): Map<number, AssetManifestEntry[]> {
  const groups = new Map<number, AssetManifestEntry[]>();

  for (const asset of assets) {
    const priority = asset.priority;
    if (!groups.has(priority)) {
      groups.set(priority, []);
    }
    groups.get(priority)!.push(asset);
  }

  return groups;
}

/**
 * Calculate optimal chunk size based on asset size
 */
export function calculateChunkSize(assetSize: number): number {
  const minChunk = 16 * 1024;   // 16KB
  const maxChunk = 64 * 1024;   // 64KB
  const targetChunks = 100;     // Aim for ~100 chunks per asset

  const calculatedSize = Math.ceil(assetSize / targetChunks);

  return Math.max(minChunk, Math.min(maxChunk, calculatedSize));
}
