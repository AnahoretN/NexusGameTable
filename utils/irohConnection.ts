/**
 * Iroh-style Connection System
 *
 * Simplified implementation that uses ticket-based invites
 * with PeerJS for the actual P2P connection.
 *
 * This provides the user experience of Iroh (shareable tickets)
 * while using the battle-tested PeerJS infrastructure.
 */

import { logger } from './logger';

// ============================================================================
// TYPES
// ============================================================================

export interface IrohNodeID {
  publicKey: string;
  relayUrl: string;
  stamp: number;
}

export interface IrohTicket {
  nodeId: IrohNodeID;
  capability: string;
  expiresAt: number;
  // PeerJS specific fields
  peerJsId?: string;
}

// ============================================================================
// CONNECTION MANAGER (Simplified)
// ============================================================================

export interface IrohConnectionConfig {
  enableLogging?: boolean;
}

export class IrohConnectionManager {
  private nodeId: IrohNodeID;
  private config: Required<IrohConnectionConfig>;
  private peerJsId: string | null = null;

  constructor(config: IrohConnectionConfig = {}) {
    this.config = {
      enableLogging: config.enableLogging ?? true,
    };

    // Generate or load node ID
    this.nodeId = this.generateNodeId();

    if (this.config.enableLogging) {
      logger.log('[Iroh] Initialized with config:', {
        nodeId: this.nodeId.publicKey.slice(0, 16) + '...',
      });
    }
  }

  /**
   * Generate a unique node ID
   */
  private generateNodeId(): IrohNodeID {
    const stored = localStorage.getItem('iroh_node_id');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Corrupted, generate new
      }
    }

    // Generate random ID
    const publicKey = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const nodeId: IrohNodeID = {
      publicKey,
      relayUrl: 'peerjs', // Using PeerJS as relay
      stamp: Date.now()
    };

    localStorage.setItem('iroh_node_id', JSON.stringify(nodeId));
    return nodeId;
  }

  /**
   * Set PeerJS ID (called after PeerJS peer is created)
   */
  setPeerJsId(id: string): void {
    this.peerJsId = id;
    if (this.config.enableLogging) {
      logger.log('[Iroh] PeerJS ID set:', id);
    }
  }

  /**
   * Get our node ID
   */
  getNodeId(): string {
    return this.nodeId.publicKey;
  }

  /**
   * Get PeerJS ID
   */
  getPeerJsId(): string | null {
    return this.peerJsId;
  }

  /**
   * Create a ticket for others to join our session
   * This ticket can be shared via URL, QR code, etc.
   */
  createTicket(peerJsId: string, capability: string = 'nexus-game-table'): string {
    const ticket: IrohTicket = {
      nodeId: this.nodeId,
      capability,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      peerJsId: peerJsId
    };

    return btoa(JSON.stringify(ticket));
  }

  /**
   * Parse a ticket from a host
   * Handles both simplified format {nodeId, timestamp} and full format
   */
  static parseTicket(ticketCode: string): IrohTicket | null {
    try {
      const ticket = JSON.parse(atob(ticketCode));

      // Handle simplified format from useIrohConnection.ts: {nodeId, timestamp}
      if (ticket.nodeId && typeof ticket.nodeId === 'string') {
        // Convert to full format
        return {
          nodeId: {
            publicKey: ticket.nodeId,
            relayUrl: 'peerjs',
            stamp: ticket.timestamp || Date.now()
          },
          capability: 'nexus-game-table',
          expiresAt: ticket.expiresAt || (ticket.timestamp || Date.now()) + (24 * 60 * 60 * 1000),
          peerJsId: ticket.nodeId
        };
      }

      // Handle full format with nodeId object
      if (!ticket.nodeId?.publicKey) {
        throw new Error('Invalid ticket format');
      }

      if (ticket.expiresAt && ticket.expiresAt < Date.now()) {
        throw new Error('Ticket expired');
      }

      return ticket;
    } catch (e) {
      logger.error('[Iroh] Failed to parse ticket:', e);
      return null;
    }
  }

  /**
   * Extract PeerJS ID from ticket
   */
  static getPeerJsIdFromTicket(ticketCode: string): string | null {
    const ticket = IrohConnectionManager.parseTicket(ticketCode);
    return ticket?.peerJsId || ticket?.nodeId?.relayUrl === 'peerjs' ? ticket.nodeId.publicKey : null;
  }

  /**
   * Connect (no-op for this simplified version)
   */
  async connect(): Promise<void> {
    // No relay connection needed - PeerJS handles signaling
    return Promise.resolve();
  }

  /**
   * Disconnect (no-op for this simplified version)
   */
  disconnect(): void {
    // Nothing to disconnect
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a readable room code from ticket
 */
export function generateRoomCode(ticket: string): string {
  // Use first 8 chars of ticket as room code
  return ticket.slice(0, 8).toUpperCase();
}

/**
 * Validate ticket format
 */
export function isValidTicketFormat(ticket: string): boolean {
  try {
    const decoded = atob(ticket);
    const data = JSON.parse(decoded);
    return !!(data.nodeId?.publicKey);
  } catch {
    return false;
  }
}
