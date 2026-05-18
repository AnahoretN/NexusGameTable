/**
 * Connection Manager
 * Simplified P2P connection management using PeerJS
 *
 * Key improvements over old system:
 * - Single connection path (no fallback complexity)
 * - Clear connection states
 * - Proper heartbeat/reconnect logic
 * - Message routing to appropriate handlers
 */

import { Peer } from 'peerjs';
import { ConnectionState, PlayerRole, P2P_CONFIG, P2PError, P2PErrorType, DataChannelLike } from '../types';
import {
  MessageType,
  P2PMessage,
  MessageFactory,
  MessageValidator,
  HandshakePayload,
  HandshakeAckPayload,
} from '../protocol/messages';
import { logger } from '../../../utils/logger';
import { getPlayerId } from '../../gameConstants';

// ============================================================================
// PEERJS CONFIG
// ============================================================================

const PEERJS_CONFIG = {
  debug: 0, // Disable PeerJS debug logs
  config: {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  },
};

// ============================================================================
// CONNECTION EVENTS
// ============================================================================

export interface ConnectionEvents {
  onStateChange?: (state: ConnectionState) => void;
  onGuestConnected?: (guestId: string, connection: DataChannelLike) => void;
  onGuestDisconnected?: (guestId: string) => void;
  onConnectedToHost?: (hostId: string) => void;
  onDisconnected?: () => void;
  onError?: (error: P2PError) => void;
  onMessage?: (message: P2PMessage, peerId?: string) => void;
}

// ============================================================================
// CONNECTION MANAGER
// ============================================================================

export class ConnectionManager {
  private peer: Peer | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private role: PlayerRole | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;

  // Host: track guest connections
  private guestConnections: Map<string, DataChannelLike> = new Map();

  // Guest: track host connection
  private hostConnection: DataChannelLike | null = null;

  // Event handlers
  private events: ConnectionEvents = {};

  // Handshake state
  private handshakeCompleted = false;
  private remoteProtocolVersion: string | null = null;

  constructor(events?: ConnectionEvents) {
    if (events) {
      this.events = events;
    }
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Initialize as host
   */
  async initializeAsHost(): Promise<string> {
    if (this.peer && !this.peer.destroyed) {
      throw new P2PError(P2PErrorType.CONNECTION_FAILED, 'Already initialized');
    }

    this.setState(ConnectionState.CONNECTING);
    this.role = PlayerRole.HOST;

    return new Promise((resolve, reject) => {
      this.peer = new Peer(PEERJS_CONFIG);

      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new P2PError(P2PErrorType.CONNECTION_FAILED, 'Connection timeout'));
      }, 15000);

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        this.setState(ConnectionState.CONNECTED);
        this.startHeartbeat();
        logger.log(`[ConnectionManager] Host initialized: ${id}`);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        const error = new P2PError(P2PErrorType.CONNECTION_FAILED, 'PeerJS error', err);
        this.handleError(error);
        reject(error);
      });

      this.peer.on('disconnected', () => {
        if (this.role === PlayerRole.HOST) {
          logger.warn('[ConnectionManager] Host disconnected from signalling server');
          // Host can still function with P2P connections
        }
      });
    });
  }

  /**
   * Connect to host (guest)
   */
  async connectToHost(hostId: string): Promise<boolean> {
    if (this.peer && !this.peer.destroyed) {
      throw new P2PError(P2PErrorType.CONNECTION_FAILED, 'Already initialized');
    }

    this.setState(ConnectionState.CONNECTING);
    this.role = PlayerRole.GUEST;
    this.reconnectAttempts = 0;

    return new Promise((resolve) => {
      this.peer = new Peer(PEERJS_CONFIG);

      const timeout = setTimeout(() => {
        this.cleanup();
        this.setState(ConnectionState.FAILED);
        resolve(false);
      }, 15000);

      this.peer.on('open', () => {
        // Now connect to host
        const conn = this.peer!.connect(hostId, {
          reliable: true,
        });

        this.setupConnectionHandlers(conn, hostId);

        conn.on('open', () => {
          clearTimeout(timeout);
          this.hostConnection = conn;
          this.performHandshake(conn, hostId);
        });

        conn.on('error', () => {
          clearTimeout(timeout);
          this.cleanup();
          this.setState(ConnectionState.FAILED);
          resolve(false);
        });
      });

      this.peer.on('error', () => {
        clearTimeout(timeout);
        this.cleanup();
        this.setState(ConnectionState.FAILED);
        resolve(false);
      });
    });
  }

  // ==========================================================================
  // HANDSHAKE
  // ==========================================================================

  /**
   * Perform handshake with host (guest side)
   */
  private performHandshake(conn: DataChannelLike, hostId: string): void {
    this.setState(ConnectionState.HANDSHAKING);

    const handshake = MessageFactory.createHandshake(
      getPlayerId(),
      'Player' // Will be updated when user enters name
    );

    this.sendMessage(conn, handshake);

    // Wait for handshake ACK
    const timeout = setTimeout(() => {
      if (!this.handshakeCompleted) {
        this.handleError(new P2PError(P2PErrorType.HANDSHAKE_FAILED, 'Handshake timeout'));
        conn.close();
      }
    }, 5000);

    // Store timeout for cleanup when ACK received
    (conn as any)._handshakeTimeout = timeout;
  }

  /**
   * Handle incoming connection (host side)
   */
  private handleIncomingConnection(conn: DataChannelLike): void {
    const guestId = conn.peer;

    logger.log(`[ConnectionManager] Incoming connection from: ${guestId}`);

    this.setupConnectionHandlers(conn, guestId);

    conn.on('open', () => {
      this.guestConnections.set(guestId, conn);

      if (this.events.onGuestConnected) {
        this.events.onGuestConnected(guestId, conn);
      }
    });
  }

  /**
   * Setup connection message handlers
   */
  private setupConnectionHandlers(conn: DataChannelLike, peerId: string): void {
    conn.on('data', (data: any) => {
      this.handleMessage(data, peerId);
    });

    conn.on('close', () => {
      this.handleConnectionClose(peerId);
    });

    conn.on('error', (err: any) => {
      logger.error(`[ConnectionManager] Connection error with ${peerId}:`, err);
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: any, peerId: string): void {
    const message = typeof data === 'string' ? JSON.parse(data) : data;

    if (!MessageValidator.isValid(message)) {
      logger.warn('[ConnectionManager] Invalid message received:', message);
      return;
    }

    switch (message.type) {
      case MessageType.HANDSHAKE:
        this.handleHandshake(message as P2PMessage, peerId);
        break;

      case MessageType.HANDSHAKE_ACK:
        this.handleHandshakeAck(message as P2PMessage, peerId);
        break;

      case MessageType.HEARTBEAT:
        this.handleHeartbeat(message as P2PMessage, peerId);
        break;

      case MessageType.HEARTBEAT_ACK:
        // Just acknowledging we're alive
        break;

      default:
        // Pass to application handler
        if (this.events.onMessage) {
          this.events.onMessage(message, peerId);
        }
        break;
    }
  }

  /**
   * Handle handshake (host receives from guest)
   */
  private handleHandshake(message: P2PMessage, guestId: string): void {
    const payload = message.payload as HandshakePayload;

    // Check protocol version
    if (!MessageValidator.isVersionCompatible(payload.protocolVersion)) {
      const ack = MessageFactory.createHandshakeAck(
        getPlayerId(),
        'Host',
        false
      );
      (ack.payload as HandshakeAckPayload).rejectReason = 'Version mismatch';

      const conn = this.guestConnections.get(guestId);
      if (conn) {
        this.sendMessage(conn, ack);
        conn.close();
      }
      return;
    }

    // Send handshake ACK
    const ack = MessageFactory.createHandshakeAck(
      getPlayerId(),
      'Host',
      true
    );

    const conn = this.guestConnections.get(guestId);
    if (conn) {
      this.sendMessage(conn, ack);
    }

    logger.log(`[ConnectionManager] Handshake completed with guest ${guestId}`);
  }

  /**
   * Handle handshake ACK (guest receives from host)
   */
  private handleHandshakeAck(message: P2PMessage, hostId: string): void {
    const payload = message.payload as HandshakeAckPayload;

    // Clear handshake timeout
    if (this.hostConnection) {
      const timeout = (this.hostConnection as any)._handshakeTimeout;
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    if (!payload.accepted) {
      this.handleError(new P2PError(
        P2PErrorType.HANDSHAKE_FAILED,
        payload.rejectReason || 'Handshake rejected'
      ));
      this.cleanup();
      return;
    }

    this.handshakeCompleted = true;
    this.remoteProtocolVersion = payload.protocolVersion;
    this.setState(ConnectionState.CONNECTED);
    this.startHeartbeat();

    logger.log(`[ConnectionManager] Connected to host: ${hostId}`);

    if (this.events.onConnectedToHost) {
      this.events.onConnectedToHost(hostId);
    }
  }

  /**
   * Handle heartbeat
   */
  private handleHeartbeat(message: P2PMessage, peerId: string): void {
    const ack = MessageFactory.createHeartbeatAck();
    ack.id = message.id; // Use same ID for correlation

    if (this.role === PlayerRole.HOST) {
      const conn = this.guestConnections.get(peerId);
      if (conn) {
        this.sendMessage(conn, ack);
      }
    } else if (this.role === PlayerRole.GUEST && this.hostConnection) {
      this.sendMessage(this.hostConnection, ack);
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(peerId: string): void {
    if (this.role === PlayerRole.HOST) {
      this.guestConnections.delete(peerId);

      if (this.events.onGuestDisconnected) {
        this.events.onGuestDisconnected(peerId);
      }
    } else if (this.role === PlayerRole.GUEST && peerId === this.hostConnection?.peer) {
      this.setState(ConnectionState.DISCONNECTED);

      if (this.events.onDisconnected) {
        this.events.onDisconnected();
      }
    }
  }

  // ==========================================================================
  // MESSAGING
  // ==========================================================================

  /**
   * Send message to a connection
   */
  private sendMessage(conn: DataChannelLike, message: P2PMessage): void {
    if (!conn.open) {
      logger.warn('[ConnectionManager] Cannot send: connection not open');
      return;
    }

    try {
      conn.send(JSON.stringify(message));
    } catch (error) {
      logger.error('[ConnectionManager] Error sending message:', error);
    }
  }

  /**
   * Broadcast message to all guests (host only)
   */
  broadcast(message: P2PMessage): void {
    if (this.role !== PlayerRole.HOST) {
      logger.warn('[ConnectionManager] Only host can broadcast');
      return;
    }

    for (const [guestId, conn] of this.guestConnections) {
      if (conn.open) {
        this.sendMessage(conn, message);
      }
    }
  }

  /**
   * Send message to host (guest only)
   */
  sendToHost(message: P2PMessage): void {
    if (this.role !== PlayerRole.GUEST || !this.hostConnection) {
      logger.warn('[ConnectionManager] Not connected to host');
      return;
    }

    this.sendMessage(this.hostConnection, message);
  }

  /**
   * Send message to specific guest (host only)
   */
  sendToGuest(guestId: string, message: P2PMessage): void {
    if (this.role !== PlayerRole.HOST) {
      logger.warn('[ConnectionManager] Only host can send to guests');
      return;
    }

    const conn = this.guestConnections.get(guestId);
    if (!conn) {
      logger.warn(`[ConnectionManager] Guest ${guestId} not found`);
      return;
    }

    this.sendMessage(conn, message);
  }

  // ==========================================================================
  // HEARTBEAT
  // ==========================================================================

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      const heartbeat = MessageFactory.createHeartbeat();

      if (this.role === PlayerRole.HOST) {
        this.broadcast(heartbeat);
      } else if (this.role === PlayerRole.GUEST && this.hostConnection) {
        this.sendMessage(this.hostConnection, heartbeat);
      }
    }, P2P_CONFIG.HEARTBEAT_INTERVAL);
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Set connection state
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      if (this.events.onStateChange) {
        this.events.onStateChange(state);
      }
    }
  }

  /**
   * Get current state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get current role
   */
  getRole(): PlayerRole | null {
    return this.role;
  }

  /**
   * Get guest connections (host only)
   */
  getGuestConnections(): Map<string, DataChannelLike> {
    return new Map(this.guestConnections);
  }

  /**
   * Get host connection (guest only)
   */
  getHostConnection(): DataChannelLike | null {
    return this.hostConnection;
  }

  /**
   * Get peer ID
   */
  getPeerId(): string | null {
    return this.peer?.id || null;
  }

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  /**
   * Handle error
   */
  private handleError(error: P2PError): void {
    if (this.events.onError) {
      this.events.onError(error);
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    // Send disconnect message
    const disconnect = MessageFactory.createDisconnect('User disconnected');

    if (this.role === PlayerRole.HOST) {
      for (const conn of this.guestConnections.values()) {
        if (conn.open) {
          this.sendMessage(conn, disconnect);
          conn.close();
        }
      }
      this.guestConnections.clear();
    } else if (this.hostConnection) {
      this.sendMessage(this.hostConnection, disconnect);
      this.hostConnection.close();
      this.hostConnection = null;
    }

    this.cleanup();
  }

  /**
   * Internal cleanup
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
      this.peer = null;
    }

    this.setState(ConnectionState.DISCONNECTED);
    this.handshakeCompleted = false;
    this.remoteProtocolVersion = null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if connected
 */
export function isConnected(manager: ConnectionManager | null): boolean {
  return manager?.getState() === ConnectionState.CONNECTED;
}

/**
 * Check if is host
 */
export function isHost(manager: ConnectionManager | null): boolean {
  return manager?.getRole() === PlayerRole.HOST;
}

/**
 * Check if is guest
 */
export function isGuest(manager: ConnectionManager | null): boolean {
  return manager?.getRole() === PlayerRole.GUEST;
}
