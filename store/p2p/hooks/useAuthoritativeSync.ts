/**
 * useAuthoritativeSync Hook
 *
 * New P2P synchronization system with authoritative host:
 * 1. Guest sends events to host (with playerId + timestamp)
 * 2. Host queues and applies events in timestamp order
 * 3. Host broadcasts state updates to all guests (except sender)
 * 4. Guests apply state updates marked as fromHost (no re-broadcast)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Peer } from 'peerjs';
import { Action } from '../../gameActions';
import { Player } from '../../types';
import { logger } from '../../../utils/logger';
import { getPlayerId } from '../../gameConstants';

// Import new sync components
import {
  AuthMessageType,
  AuthMessageFactory,
  GameEventMessage,
  HeloMessage,
  HeloAckMessage,
  AssetManifestMessage,
  AssetRequestMessage,
  StateUpdateMessage,
  StateSnapshotMessage,
} from '../protocol/authoritativeMessages';
import { HostEventQueue, shouldSyncAction, reduxActionToGameAction } from '../sync/HostEventQueue';
import { GuestStateManager } from '../sync/GuestStateManager';

// Import middleware for integration
import { updateSyncState, type SyncState } from '../middleware/authoritativeMiddleware';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
export type PlayerRole = 'host' | 'guest' | null;

export interface WaitingForPlayerName {
  hostId: string;
}

export interface P2PLoadingStep {
  id: string;
  message: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress?: number;
}

export interface UseAuthoritativeSyncReturn {
  peerId: string | null;
  isHost: boolean;
  role: PlayerRole;
  connectionStatus: ConnectionStatus;
  waitingForPlayerName: WaitingForPlayerName | null;
  setPlayerName: (name: string) => void;
  initializeHost: () => void;
  hostConnectionRef: React.RefObject<any>;
  connectionsRef: React.RefObject<any[]>;
  // Loading progress
  p2pLoadingSteps: P2PLoadingStep[];
  p2pLoadingProgress: number;
  isP2PLoadingModalOpen: boolean;
}

// ============================================================================
// PEERJS CONFIG
// ============================================================================

const PEERJS_CONFIG = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  },
};

// ============================================================================
// SINGLETON (persists across HMR)
// ============================================================================

const syncSingleton = {
  peer: null as Peer | null,
  hostConnection: null as any,
  connections: [] as any[],
  peerId: null as string | null,
  isInitialized: false,

  // New sync components
  hostEventQueue: null as HostEventQueue | null,
  guestStateManager: null as GuestStateManager | null,

  // Player info
  playerId: getPlayerId(),
  playerName: '',

  reset() {
    if (this.peer && !this.peer.destroyed) {
      try {
        this.peer.destroy();
      } catch (e) {}
    }
    this.peer = null;
    this.hostConnection = null;
    this.connections = [];
    this.peerId = null;
    this.isInitialized = false;

    if (this.hostEventQueue) {
      this.hostEventQueue.stop();
      this.hostEventQueue.clear();
      this.hostEventQueue = null;
    }

    if (this.guestStateManager) {
      this.guestStateManager.clear();
      this.guestStateManager = null;
    }
  },
};

// ============================================================================
// HOOK
// ============================================================================

export function useAuthoritativeSync(
  localDispatch: React.Dispatch<Action>,
  stateRef: React.RefObject<any>
): UseAuthoritativeSyncReturn {
  // State
  const [isHost, setIsHost] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    return !params.has('hostId');
  });

  const [peerId, setPeerId] = useState<string | null>(syncSingleton.peerId);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    syncSingleton.isInitialized ? 'connected' : 'disconnected'
  );
  const [waitingForPlayerName, setWaitingForPlayerName] = useState<WaitingForPlayerName | null>(null);
  const [role, setRole] = useState<PlayerRole>(syncSingleton.isInitialized ? (isHost ? 'host' : 'guest') : null);

  // Loading progress
  const [p2pLoadingSteps, setP2pLoadingSteps] = useState<P2PLoadingStep[]>([
    { id: 'connect', message: 'Connecting...', status: 'pending' },
    { id: 'handshake', message: 'Handshake...', status: 'pending' },
    { id: 'assets', message: 'Receiving assets...', status: 'pending' },
    { id: 'state', message: 'Synchronizing state...', status: 'pending' },
  ]);
  const [p2pLoadingProgress, setP2pLoadingProgress] = useState(0);
  const [isP2PLoadingModalOpen, setIsP2PLoadingModalOpen] = useState(false);

  // Refs
  const peerRef = useRef<Peer | null>(syncSingleton.peer);
  const connectionsRef = useRef<any[]>(syncSingleton.connections);
  const hostConnectionRef = useRef<any>(syncSingleton.hostConnection);

  // ==========================================================================
  // MESSAGE HANDLERS
  // ==========================================================================

  /**
   * Handle incoming message (both host and guest)
   */
  const handleMessage = useCallback((data: any, senderConn?: any) => {
    const message = typeof data === 'string' ? JSON.parse(data) : data;

    if (!message || !message.type) {
      return;
    }

    logger.debug(`[AuthoritativeSync] Received: ${message.type}`);

    switch (message.type) {
      // ============================================================
      // CONNECTION MESSAGES
      // ============================================================
      case AuthMessageType.HELO:
        handleHelo(message as HeloMessage, senderConn);
        break;

      case AuthMessageType.HELO_ACK:
        handleHeloAck(message as HeloAckMessage);
        break;

      // ============================================================
      // ASSET MESSAGES
      // ============================================================
      case AuthMessageType.ASSET_MANIFEST:
        handleAssetManifest(message as AssetManifestMessage, senderConn);
        break;

      case AuthMessageType.ASSET_REQUEST:
        handleAssetRequest(message as AssetRequestMessage, senderConn);
        break;

      case AuthMessageType.ASSET_COMPLETE:
        handleAssetComplete(message);
        break;

      // ============================================================
      // GAME EVENT (Host receives from guests)
      // ============================================================
      case AuthMessageType.GAME_EVENT:
        handleGameEvent(message as GameEventMessage);
        break;

      // ============================================================
      // STATE UPDATE (Guest receives from host)
      // ============================================================
      case AuthMessageType.STATE_UPDATE:
        handleStateUpdate(message as StateUpdateMessage);
        break;

      case AuthMessageType.STATE_SNAPSHOT:
        handleStateSnapshot(message as StateSnapshotMessage);
        break;

      default:
        logger.warn(`[AuthoritativeSync] Unknown message type: ${message.type}`);
    }
  }, []);

  // ==========================================================================
  // HOST MESSAGE HANDLERS
  // ==========================================================================

  const handleHelo = useCallback((message: HeloMessage, conn: any) => {
    if (role !== 'host') return;

    const { playerId, playerName } = message.payload;

    logger.log(`[AuthoritativeSync] HELO from ${playerName} (${playerId})`);

    // Send HELO_ACK
    const ack = AuthMessageFactory.createHeloAck(syncSingleton.playerId, true);
    conn.send(ack);

    // Add player to game state
    const newPlayer: Player = {
      id: playerId,
      name: playerName,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      isGM: false,
    };

    localDispatch({ type: 'ADD_PLAYER', payload: newPlayer });

    // Send asset manifest
    sendAssetManifest(conn);
  }, [role, localDispatch]);

  const handleAssetRequest = useCallback(async (message: AssetRequestMessage, conn: any) => {
    if (role !== 'host') return;

    logger.log(`[AuthoritativeSync] Asset request: ${message.payload.hashes.length} hashes`);

    // Send requested assets
    // This is where asset transfer logic would go
    // For now, just send complete message
    conn.send({
      type: AuthMessageType.ASSET_COMPLETE,
      payload: {
        totalAssets: message.payload.hashes.length,
        successfulAssets: message.payload.hashes.length,
        failedAssets: [],
      },
    });
  }, [role]);

  const handleGameEvent = useCallback((message: GameEventMessage) => {
    if (role !== 'host' || !syncSingleton.hostEventQueue) return;

    const { playerId, action } = message.payload;

    logger.debug(`[AuthoritativeSync] Game event: ${action.type} from ${playerId}`);

    // Add to host's event queue
    const added = syncSingleton.hostEventQueue.addEvent(message);

    if (added) {
      // Queue will process automatically and broadcast updates
    }
  }, [role]);

  // ==========================================================================
  // GUEST MESSAGE HANDLERS
  // ==========================================================================

  const handleHeloAck = useCallback((message: HeloAckMessage) => {
    if (role !== 'guest') return;

    const { accepted, rejectReason } = message.payload;

    if (!accepted) {
      alert(`Connection rejected: ${rejectReason || 'Unknown reason'}`);
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connected');
    logger.log(`[AuthoritativeSync] Connected to host!`);

    updateLoadingStep('handshake', 'success');
  }, [role]);

  const handleAssetManifest = useCallback(async (message: AssetManifestMessage, conn: any) => {
    if (role !== 'guest') return;

    updateLoadingStep('assets', 'loading', `Checking ${message.payload.assets.length} assets...`);

    // Check which assets we need
    const { findMissingHashes } = await import('../../../utils/assets');
    const hashes = message.payload.assets.map(a => a.hash);
    const missing = await findMissingHashes(hashes);

    if (missing.length > 0) {
      logger.log(`[AuthoritativeSync] Requesting ${missing.length} missing assets`);

      const request = AuthMessageFactory.createAssetRequest(
        stateRef.current?.sessionId || 'default',
        missing
      );
      conn.send(request);
    } else {
      updateLoadingStep('assets', 'success', 'All assets cached');
    }
  }, [role, stateRef]);

  const handleAssetComplete = useCallback((message: any) => {
    if (role !== 'guest') return;

    updateLoadingStep('assets', 'success', `Received ${message.payload.successfulAssets} assets`);
  }, [role]);

  const handleStateUpdate = useCallback((message: StateUpdateMessage) => {
    if (role !== 'guest' || !syncSingleton.guestStateManager) return;

    logger.debug(`[AuthoritativeSync] State update: ${message.payload.appliedEvents.length} events`);

    // Process state update through guest state manager
    const actions = syncSingleton.guestStateManager.processStateUpdate(message);

    // Dispatch each action
    for (const action of actions) {
      localDispatch(action as any);
    }
  }, [role, localDispatch]);

  const handleStateSnapshot = useCallback((message: StateSnapshotMessage) => {
    if (role !== 'guest') return;

    logger.log(`[AuthoritativeSync] State snapshot received`);

    updateLoadingStep('state', 'loading', 'Applying game state...');

    // Apply full state
    localDispatch({
      type: 'SYNC_STATE',
      payload: {
        ...message.payload.state,
        _fromHost: true,
      },
    } as any);

    updateLoadingStep('state', 'success', 'Game synchronized!');
  }, [role, localDispatch]);

  // ==========================================================================
  // HOST ACTIONS
  // ==========================================================================

  /**
   * Send asset manifest to guest
   */
  const sendAssetManifest = useCallback(async (conn: any) => {
    try {
      const { assetDB } = await import('../../../utils/assets');
      const manifest = await assetDB.getManifest();

      const message = AuthMessageFactory.createAssetManifest(
        stateRef.current?.sessionId || 'default',
        manifest.assets.map((a: any) => ({
          hash: a.hash,
          size: a.size,
          mimeType: a.mimeType,
          priority: 5,
        })),
        manifest.totalSize,
        manifest.totalCount
      );

      conn.send(message);
      logger.log(`[AuthoritativeSync] Sent asset manifest: ${manifest.totalCount} assets`);
    } catch (error) {
      logger.error('[AuthoritativeSync] Failed to send asset manifest:', error);
    }
  }, [stateRef]);

  /**
   * Broadcast state update to all guests
   */
  const broadcastStateUpdate = useCallback((
    appliedEvents: any[],
    stateChanges: any[]
  ) => {
    if (role !== 'host') return;

    const message = AuthMessageFactory.createStateUpdate(
      Date.now(),
      appliedEvents,
      stateChanges
    );

    // Send to all connected guests
    for (const conn of connectionsRef.current) {
      if (conn.open) {
        conn.send(message);
      }
    }

    // Apply locally to host state as well
    for (const change of stateChanges) {
      // Convert state change to action
      if (change.type === 'object' && !change.change._deleted) {
        localDispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            ...change.change,
            skipNetworkSync: true,  // Already from host
          },
        });
      }
    }

    logger.debug(`[AuthoritativeSync] Broadcast state update: ${appliedEvents.length} events`);
  }, [role, localDispatch]);

  // ==========================================================================
  // GUEST ACTIONS
  // ==========================================================================

  /**
   * Send game event to host
   */
  const sendGameEvent = useCallback((action: Action) => {
    if (role !== 'guest' || !hostConnectionRef.current?.open) {
      return;
    }

    if (!shouldSyncAction(action.type)) {
      return;
    }

    const guestManager = syncSingleton.guestStateManager;
    if (!guestManager) return;

    // Check if we should send this event
    const gameAction = reduxActionToGameAction(action);

    if (!guestManager.shouldSendEvent(gameAction)) {
      return;
    }

    // Create and send event message
    const message = guestManager.createEventMessage(gameAction);
    hostConnectionRef.current.send(message);

    logger.debug(`[AuthoritativeSync] Sent event: ${action.type}`);
  }, [role]);

  // ==========================================================================
  // CONNECTION SETUP
  // ==========================================================================

  const initializeHost = useCallback(async () => {
    if (syncSingleton.peer && !syncSingleton.peer.destroyed) {
      logger.log('[AuthoritativeSync] Host already initialized');
      return;
    }

    setConnectionStatus('connecting');
    updateLoadingStep('connect', 'loading', 'Initializing host...');

    const peer = new Peer(PEERJS_CONFIG);
    peerRef.current = peer;
    syncSingleton.peer = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      syncSingleton.peerId = id;
      setConnectionStatus('connected');
      setRole('host');
      syncSingleton.isInitialized = true;

      updateLoadingStep('connect', 'success', `Host ready: ${id}`);

      // Initialize host event queue
      const queue = new HostEventQueue({
        processingInterval: 16,  // ~60fps
        batchApplies: true,
      });

      queue.onStateUpdateCallback(broadcastStateUpdate);
      queue.start();

      syncSingleton.hostEventQueue = queue;

      logger.log(`[AuthoritativeSync] Host initialized: ${id}`);
    });

    peer.on('connection', (conn) => {
      logger.log(`[AuthoritativeSync] Incoming connection from ${conn.peer}`);

      connectionsRef.current.push(conn);

      conn.on('open', () => {
        logger.log(`[AuthoritativeSync] Connection opened: ${conn.peer}`);

        // Set up data handler
        conn.on('data', (data: any) => {
          handleMessage(data, conn);
        });

        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          localDispatch({ type: 'REMOVE_PLAYER', payload: { id: conn.peer } });
        });
      });
    });

    peer.on('error', (err: any) => {
      logger.error('[AuthoritativeSync] Peer error:', err);
      setConnectionStatus('disconnected');
    });
  }, [handleMessage, broadcastStateUpdate, localDispatch]);

  const connectToHost = useCallback(async (hostId: string, playerName: string) => {
    setConnectionStatus('connecting');
    updateLoadingStep('connect', 'loading', 'Connecting to host...');

    const peer = new Peer(PEERJS_CONFIG);
    peerRef.current = peer;
    syncSingleton.peer = peer;

    peer.on('open', () => {
      const conn = peer.connect(hostId);
      hostConnectionRef.current = conn;
      syncSingleton.hostConnection = conn;

      conn.on('open', () => {
        logger.log(`[AuthoritativeSync] Connected to host: ${hostId}`);
        updateLoadingStep('connect', 'success', 'Connected to host');

        // Initialize guest state manager
        syncSingleton.guestStateManager = new GuestStateManager(syncSingleton.playerId);

        // Send HELO
        const helo = AuthMessageFactory.createHelo(syncSingleton.playerId, playerName);
        conn.send(helo);

        updateLoadingStep('handshake', 'loading', 'Handshaking...');

        // Set up data handler
        conn.on('data', (data: any) => {
          handleMessage(data, conn);
        });

        conn.on('close', () => {
          logger.warn('[AuthoritativeSync] Connection to host closed');
          setConnectionStatus('disconnected');
          syncSingleton.guestStateManager?.clear();
        });
      });

      conn.on('error', (err: any) => {
        logger.error('[AuthoritativeSync] Connection error:', err);
        setConnectionStatus('disconnected');
      });
    });

    peer.on('error', (err: any) => {
      logger.error('[AuthoritativeSync] Peer error:', err);
      setConnectionStatus('disconnected');
    });
  }, [handleMessage]);

  const setPlayerName = useCallback((name: string) => {
    if (!waitingForPlayerName) return;

    syncSingleton.playerName = name;
    setWaitingForPlayerName(null);

    connectToHost(waitingForPlayerName.hostId, name);
  }, [waitingForPlayerName, connectToHost]);

  // ==========================================================================
  // LOADING PROGRESS
  // ==========================================================================

  const updateLoadingStep = useCallback((stepId: string, status: P2PLoadingStep['status'], message?: string, progress?: number) => {
    setP2pLoadingSteps(prev => {
      const updated = prev.map(step => {
        if (step.id === stepId) {
          return { ...step, status, ...(message && { message }), ...(progress !== undefined && { progress }) };
        }
        return step;
      });

      // Calculate overall progress
      const stepOrder = ['connect', 'handshake', 'assets', 'state'] as const;
      const stepIndex = stepOrder.indexOf(stepId as any);
      if (stepIndex !== -1) {
        const stepProgress = status === 'success' ? 100 : progress || 0;
        const stepWeight = 100 / stepOrder.length;
        const newProgress = Math.min(100, (stepIndex * stepWeight) + (stepProgress * stepWeight / 100));
        setP2pLoadingProgress(newProgress);
      }

      // Modal visibility
      if (stepId === 'connect' && status === 'loading') {
        setIsP2PLoadingModalOpen(true);
      }
      if (stepId === 'state' && status === 'success') {
        setTimeout(() => setIsP2PLoadingModalOpen(false), 500);
      }

      return updated;
    });
  }, []);

  // ==========================================================================
  // EFFECTS
  // ==========================================================================

  // Check URL for hostId on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const hostId = params.get('hostId');

    if (hostId) {
      setWaitingForPlayerName({ hostId });
    }
  }, []);

  // Update middleware with current sync state
  useEffect(() => {
    if (connectionStatus !== 'connected' || !role) {
      updateSyncState(null);
      return;
    }

    const syncState: SyncState = {
      isHost: role === 'host',
      isConnected: true,
      hostConnection: hostConnectionRef.current,
      connections: connectionsRef.current,
      guestStateManager: syncSingleton.guestStateManager || undefined,
    };

    updateSyncState(syncState);

    logger.debug(`[AuthoritativeSync] Updated middleware sync state:`, {
      isHost: syncState.isHost,
      guestConnections: syncState.connections.length,
      hasHostConnection: !!syncState.hostConnection,
    });

    return () => {
      updateSyncState(null);
    };
  }, [connectionStatus, role, hostConnectionRef.current, connectionsRef.current.length]);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  return {
    peerId,
    isHost,
    role,
    connectionStatus,
    waitingForPlayerName,
    setPlayerName,
    initializeHost,
    hostConnectionRef,
    connectionsRef,
    p2pLoadingSteps,
    p2pLoadingProgress,
    isP2PLoadingModalOpen,
  };
}
