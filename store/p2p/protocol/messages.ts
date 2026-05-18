/**
 * P2P Message Protocol
 * Defines all message types and structures for P2P communication
 */

import { P2P_CONFIG } from '../types';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export enum MessageType {
  // Connection management
  HANDSHAKE = 'HANDSHAKE',
  HANDSHAKE_ACK = 'HANDSHAKE_ACK',
  HEARTBEAT = 'HEARTBEAT',
  HEARTBEAT_ACK = 'HEARTBEAT_ACK',
  DISCONNECT = 'DISCONNECT',

  // Reliable messaging
  RELIABLE_MESSAGE = 'RELIABLE_MESSAGE',
  ACK = 'ACK',
  NACK = 'NACK',

  // Image transfer (ONCE per connection)
  IMAGE_MANIFEST = 'IMAGE_MANIFEST',
  IMAGE_CHUNK = 'IMAGE_CHUNK',
  IMAGE_REQUEST = 'IMAGE_REQUEST',
  IMAGE_ACK = 'IMAGE_ACK',

  // State synchronization
  STATE_SNAPSHOT = 'STATE_SNAPSHOT',
  STATE_PATCH = 'STATE_PATCH',
  ACTION = 'ACTION',
  ACTION_BATCH = 'ACTION_BATCH',

  // Player-specific
  PLAYER_SETTINGS = 'PLAYER_SETTINGS',
}

// ============================================================================
// BASE MESSAGE STRUCTURE
// ============================================================================

export interface P2PMessage {
  id: string;                    // UUID for tracking
  type: MessageType;
  timestamp: number;
  payload?: any;
  requiresAck?: boolean;         // Whether delivery confirmation is needed
  compressed?: boolean;          // Whether payload is compressed
}

// ============================================================================
// ACK/NACK MESSAGES
// ============================================================================

export interface AckMessage {
  messageId: string;             // ID of message being acknowledged
  timestamp: number;
  receivedSeq?: number;          // Last received sequence number
}

export interface NackMessage {
  messageId: string;
  timestamp: number;
  missing?: number[];            // Missing sequence numbers
  reason?: string;
}

// ============================================================================
// CONNECTION MESSAGES
// ============================================================================

export interface HandshakePayload {
  playerId: string;
  playerName: string;
  protocolVersion: string;
  capabilities?: {
    compression: boolean;
    chunking: boolean;
    actionSync: boolean;
  };
}

export interface HandshakeAckPayload {
  playerId: string;
  playerName: string;
  protocolVersion: string;
  accepted: boolean;
  rejectReason?: string;
}

// ============================================================================
// IMAGE MESSAGES
// ============================================================================

export interface ImageManifestPayload {
  sessionId: string;
  version: number;
  images: Record<string, ImageInfo>;
}

export interface ImageInfo {
  id: string;
  hash: string;                  // For deduplication and verification
  size: number;
  mimeType: string;
  priority: number;              // 0-10, higher = load first
  chunkCount: number;
}

export interface ImageChunkPayload {
  imageId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string;                  // Base64 chunk data
  hash?: string;                 // For verification
}

export interface ImageRequestPayload {
  imageIds: string[];
  priority?: number;             // Only request images with this priority
}

export interface ImageAckPayload {
  imageId: string;
  chunkIndex: number;
  received: boolean;
}

// ============================================================================
// STATE MESSAGES
// ============================================================================

export interface StateSnapshotPayload {
  sessionId: string;
  version: number;
  state: any;
  timestamp: number;
}

export interface StatePatchPayload {
  sessionId: string;
  fromVersion: number;
  toVersion: number;
  actions: StateAction[];
  timestamp: number;
}

export interface StateAction {
  type: string;                  // Action type (MOVE_OBJECT, FLIP_CARD, etc.)
  objectId?: string;
  payload: any;
  timestamp: number;
  playerId: string;
  version?: number;              // State version when action was created
  reliable?: boolean;            // Whether this action needs ACK
}

// ============================================================================
// PLAYER SETTINGS MESSAGES
// ============================================================================

export interface PlayerSettingsPayload {
  playerId: string;
  settings: Record<string, any>;
}

// ============================================================================
// MESSAGE FACTORY
// ============================================================================

export class MessageFactory {
  /**
   * Generate a unique message ID
   */
  static generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a base message
   */
  static create(type: MessageType, payload?: any, requiresAck = false): P2PMessage {
    return {
      id: this.generateId(),
      type,
      timestamp: Date.now(),
      payload,
      requiresAck,
    };
  }

  /**
   * Create handshake message
   */
  static createHandshake(playerId: string, playerName: string): P2PMessage {
    return this.create(MessageType.HANDSHAKE, {
      playerId,
      playerName,
      protocolVersion: P2P_CONFIG.PROTOCOL_VERSION,
      capabilities: {
        compression: true,
        chunking: true,
        actionSync: true,
      },
    }, true);
  }

  /**
   * Create handshake ACK
   */
  static createHandshakeAck(playerId: string, playerName: string, accepted = true): P2PMessage {
    return this.create(MessageType.HANDSHAKE_ACK, {
      playerId,
      playerName,
      protocolVersion: P2P_CONFIG.PROTOCOL_VERSION,
      accepted,
    }, true);
  }

  /**
   * Create heartbeat message
   */
  static createHeartbeat(): P2PMessage {
    return this.create(MessageType.HEARTBEAT);
  }

  /**
   * Create ACK message
   */
  static createAck(messageId: string): P2PMessage {
    return this.create(MessageType.ACK, { messageId });
  }

  /**
   * Create image manifest message
   */
  static createImageManifest(payload: ImageManifestPayload): P2PMessage {
    return this.create(MessageType.IMAGE_MANIFEST, payload, true);
  }

  /**
   * Create image chunk message
   */
  static createImageChunk(payload: ImageChunkPayload): P2PMessage {
    return this.create(MessageType.IMAGE_CHUNK, payload, true);
  }

  /**
   * Create image request message
   */
  static createImageRequest(imageIds: string[], priority?: number): P2PMessage {
    return this.create(MessageType.IMAGE_REQUEST, {
      imageIds,
      priority,
    });
  }

  /**
   * Create state snapshot message
   */
  static createStateSnapshot(payload: StateSnapshotPayload): P2PMessage {
    return this.create(MessageType.STATE_SNAPSHOT, payload, true);
  }

  /**
   * Create state patch message
   */
  static createStatePatch(payload: StatePatchPayload): P2PMessage {
    return this.create(MessageType.STATE_PATCH, payload);
  }

  /**
   * Create action message
   */
  static createAction(action: StateAction): P2PMessage {
    return this.create(MessageType.ACTION, action, action.reliable);
  }

  /**
   * Create disconnect message
   */
  static createDisconnect(reason?: string): P2PMessage {
    return this.create(MessageType.DISCONNECT, { reason });
  }
}

// ============================================================================
// MESSAGE VALIDATION
// ============================================================================

export class MessageValidator {
  /**
   * Validate message structure
   */
  static isValid(message: any): message is P2PMessage {
    return (
      message &&
      typeof message === 'object' &&
      typeof message.id === 'string' &&
      typeof message.type === 'string' &&
      typeof message.timestamp === 'number'
    );
  }

  /**
   * Check protocol version compatibility
   */
  static isVersionCompatible(version: string): boolean {
    const [major] = version.split('.');
    const [currentMajor] = P2P_CONFIG.PROTOCOL_VERSION.split('.');
    return major === currentMajor;
  }
}

// ============================================================================
// MESSAGE SERIALIZATION
// ============================================================================

export class MessageSerializer {
  /**
   * Serialize message to string
   */
  static serialize(message: P2PMessage): string {
    return JSON.stringify(message);
  }

  /**
   * Deserialize message from string
   */
  static deserialize(data: string): P2PMessage | null {
    try {
      const message = JSON.parse(data);
      return MessageValidator.isValid(message) ? message : null;
    } catch {
      return null;
    }
  }
}
