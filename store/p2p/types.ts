/**
 * P2P Type Definitions
 * Core types for the new P2P system
 */

// ============================================================================
// CONNECTION STATES
// ============================================================================

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  HANDSHAKING = 'HANDSHAKING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  FAILED = 'FAILED',
}

// ============================================================================
// IMAGE STATES
// ============================================================================

export enum ImageLoadState {
  PENDING = 'PENDING',
  REQUESTED = 'REQUESTED',
  LOADING = 'LOADING',
  LOADED = 'LOADED',
  FAILED = 'FAILED',
}

// ============================================================================
// PLAYER ROLES
// ============================================================================

export enum PlayerRole {
  HOST = 'HOST',
  GUEST = 'GUEST',
}

// ============================================================================
// P2P CONFIG
// ============================================================================

export const P2P_CONFIG = {
  PROTOCOL_VERSION: '2.0.0',
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  HEARTBEAT_TIMEOUT: 60000, // 60 seconds
  RECONNECT_DELAY: 2000, // Initial reconnect delay
  MAX_RECONNECT_ATTEMPTS: 5,
  IMAGE_CHUNK_SIZE: 64 * 1024, // 64KB chunks
  MAX_PENDING_ACK: 100, // Max messages waiting for ACK
  ACTION_HISTORY_SIZE: 1000, // Keep last 1000 actions
  SNAPSHOT_INTERVAL: 100, // Create snapshot every 100 actions
} as const;

// ============================================================================
// ERROR TYPES
// ============================================================================

export enum P2PErrorType {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  HANDSHAKE_FAILED = 'HANDSHAKE_FAILED',
  VERSION_MISMATCH = 'VERSION_MISMATCH',
  MESSAGE_TIMEOUT = 'MESSAGE_TIMEOUT',
  IMAGE_TRANSFER_FAILED = 'IMAGE_TRANSFER_FAILED',
  STATE_SYNC_FAILED = 'STATE_SYNC_FAILED',
}

export class P2PError extends Error {
  constructor(
    public type: P2PErrorType,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'P2PError';
  }
}

// ============================================================================
// CONNECTION INFO
// ============================================================================

export interface ConnectionInfo {
  peerId: string;
  playerId: string;
  role: PlayerRole;
  state: ConnectionState;
  connectedAt?: number;
  lastActivity: number;
}

// ============================================================================
// PEER CONNECTION TYPE (for DataChannel compatibility)
// ============================================================================

export interface DataChannelLike {
  peer: string;
  open: boolean;
  send(data: any): void;
  close(): void;
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback?: (...args: any[]) => void): void;
}
