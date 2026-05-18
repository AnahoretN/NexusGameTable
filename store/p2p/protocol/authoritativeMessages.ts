/**
 * Authoritative Host Sync Protocol
 *
 * All changes flow through the host:
 * 1. Guest makes local change
 * 2. Guest sends event to host (with playerId + timestamp)
 * 3. Host queues event by timestamp
 * 4. Host applies event to its state
 * 5. Host broadcasts new state to all guests (except sender)
 * 6. Guests apply state (marked as fromHost, no re-broadcast)
 */

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export enum AuthMessageType {
  // Connection
  HELO = 'HELO',                      // Guest introduces self to host
  HELO_ACK = 'HELO_ACK',              // Host acknowledges guest

  // Initial state transfer
  ASSET_MANIFEST = 'ASSET_MANIFEST',  // List of all assets (hashes)
  INITIAL_STATE = 'INITIAL_STATE',    // Full game state (objects, etc)

  // Event sync (guest -> host)
  GAME_EVENT = 'GAME_EVENT',          // Player action with timestamp

  // State broadcast (host -> guests)
  STATE_UPDATE = 'STATE_UPDATE',      // Partial state update (applied events)
  STATE_SNAPSHOT = 'STATE_SNAPSHOT',  // Full state (periodic or on demand)

  // Asset transfer
  ASSET_REQUEST = 'ASSET_REQUEST',    // Guest requests missing assets
  ASSET_CHUNK = 'ASSET_CHUNK',        // Binary asset data
  ASSET_COMPLETE = 'ASSET_COMPLETE',  // Transfer complete
}

// ============================================================================
// BASE MESSAGE
// ============================================================================

export interface AuthMessage {
  type: AuthMessageType;
}

// ============================================================================
// CONNECTION MESSAGES
// ============================================================================

export interface HeloMessage extends AuthMessage {
  type: AuthMessageType.HELO;
  payload: {
    playerId: string;
    playerName: string;
    protocolVersion: string;
  };
}

export interface HeloAckMessage extends AuthMessage {
  type: AuthMessageType.HELO_ACK;
  payload: {
    hostPlayerId: string;
    protocolVersion: string;
    accepted: boolean;
    rejectReason?: string;
  };
}

// ============================================================================
// ASSET MESSAGES
// ============================================================================

export interface AssetManifestMessage extends AuthMessage {
  type: AuthMessageType.ASSET_MANIFEST;
  payload: {
    sessionId: string;
    version: number;
    timestamp: number;
    assets: AssetInfo[];
    totalSize: number;
    totalCount: number;
  };
}

export interface AssetInfo {
  hash: string;
  size: number;
  mimeType: string;
  priority: number;  // 0-10, higher = load first
}

export interface AssetRequestMessage extends AuthMessage {
  type: AuthMessageType.ASSET_REQUEST;
  payload: {
    sessionId: string;
    hashes: string[];
  };
}

// ============================================================================
// GAME EVENT (Guest -> Host)
// ============================================================================

export interface GameEventMessage extends AuthMessage {
  type: AuthMessageType.GAME_EVENT;
  payload: {
    playerId: string;           // Who made the change
    playerTimestamp: number;    // When the player made the change (client time)
    eventId: string;            // Unique ID for this event
    action: GameAction;         // The action to apply
  };
}

/**
 * Game action - represents a state change
 */
export interface GameAction {
  type: string;                 // Action type: MOVE_OBJECT, FLIP_CARD, etc.
  objectId?: string;            // Target object (if applicable)
  payload: any;                 // Action payload
}

// ============================================================================
// STATE UPDATE (Host -> Guests)
// ============================================================================

export interface StateUpdateMessage extends AuthMessage {
  type: AuthMessageType.STATE_UPDATE;
  payload: {
    hostTimestamp: number;      // When host applied this update
    appliedEvents: AppliedEvent[];  // Events that were applied
    stateChanges: StateChange[];    // Resulting state changes
  };
}

export interface AppliedEvent {
  eventId: string;
  playerId: string;
  playerTimestamp: number;
  actionType: string;
}

export interface StateChange {
  type: 'object' | 'dice' | 'drawing' | 'player';
  id: string;
  change: any;  // Partial state update
}

// ============================================================================
// STATE SNAPSHOT (Host -> Guests)
// ============================================================================

export interface StateSnapshotMessage extends AuthMessage {
  type: AuthMessageType.STATE_SNAPSHOT;
  payload: {
    sessionId: string;
    timestamp: number;
    state: GameStateSnapshot;
  };
}

export interface GameStateSnapshot {
  objects: Record<string, any>;
  diceRolls: any[];
  drawings: any;
  players: any[];
  activePlayerId: string;
  connectionsLocked: boolean;
  diceGroups: any[];
  sessionId: string;
}

// ============================================================================
// MESSAGE FACTORY
// ============================================================================

export class AuthMessageFactory {
  static generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  static createHelo(playerId: string, playerName: string): HeloMessage {
    return {
      type: AuthMessageType.HELO,
      payload: {
        playerId,
        playerName,
        protocolVersion: '3.0.0',
      },
    };
  }

  static createHeloAck(hostPlayerId: string, accepted: boolean, rejectReason?: string): HeloAckMessage {
    return {
      type: AuthMessageType.HELO_ACK,
      payload: {
        hostPlayerId,
        protocolVersion: '3.0.0',
        accepted,
        rejectReason,
      },
    };
  }

  static createAssetManifest(
    sessionId: string,
    assets: AssetInfo[],
    totalSize: number,
    totalCount: number
  ): AssetManifestMessage {
    return {
      type: AuthMessageType.ASSET_MANIFEST,
      payload: {
        sessionId,
        version: 1,
        timestamp: Date.now(),
        assets,
        totalSize,
        totalCount,
      },
    };
  }

  static createAssetRequest(sessionId: string, hashes: string[]): AssetRequestMessage {
    return {
      type: AuthMessageType.ASSET_REQUEST,
      payload: {
        sessionId,
        hashes,
      },
    };
  }

  static createGameEvent(playerId: string, action: GameAction): GameEventMessage {
    return {
      type: AuthMessageType.GAME_EVENT,
      payload: {
        playerId,
        playerTimestamp: Date.now(),
        eventId: this.generateEventId(),
        action,
      },
    };
  }

  static createStateUpdate(
    hostTimestamp: number,
    appliedEvents: AppliedEvent[],
    stateChanges: StateChange[]
  ): StateUpdateMessage {
    return {
      type: AuthMessageType.STATE_UPDATE,
      payload: {
        hostTimestamp,
        appliedEvents,
        stateChanges,
      },
    };
  }

  static createStateSnapshot(sessionId: string, state: GameStateSnapshot): StateSnapshotMessage {
    return {
      type: AuthMessageType.STATE_SNAPSHOT,
      payload: {
        sessionId,
        timestamp: Date.now(),
        state,
      },
    };
  }
}
