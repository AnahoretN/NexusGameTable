/**
 * Iroh Connection Hook
 *
 * TRANSPORT ONLY: node identity (nodeId/ticket) and PeerJS-backed byte pipes.
 * (True Iroh is not wired yet — this wraps PeerJS under an Iroh-shaped API.)
 * All game-session protocol (HELO/SYNC_STATE/POSITION_UPDATE/packs) is handled
 * by the shared store/session/protocol.ts.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Action } from './gameActions';
import { Player } from '../types';
import { logger } from '../utils/logger';
import { getPlayerId } from './gameConstants';
import { useSessionUx } from './session/sessionUx';
import {
  createProtocolHandler,
  buildPacksNeeded,
  buildInitialSyncState
} from './session/protocol';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface WaitingForPlayerName {
  ticket: string;
  nodeId: string;
}

export interface P2PLoadingStep {
  id: string;
  message: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress?: number;
}

export interface UseIrohConnectionReturn {
  // Node identity
  nodeId: string | null;
  ticket: string | null;
  peerId: string | null; // For compatibility with GameContext
  isHost: boolean;

  // Connection state
  connectionStatus: ConnectionStatus;
  waitingForPlayerName: WaitingForPlayerName | null;

  // Actions
  initializeHost: () => void;
  setPlayerName: (name: string) => void;
  onPackLoaded: (packName: string, hashes: string[]) => void;
  onJoinWithoutPacks: () => void;

  // Internal refs
  hostConnectionRef: React.RefObject<any>;
  connectionsRef: React.RefObject<any[]>;
  roomRef: React.RefObject<any>;

  // Loading progress
  p2pLoadingSteps: P2PLoadingStep[];
  p2pLoadingProgress: number;
  isP2PLoadingModalOpen: boolean;

  // Packs
  requiredPacks: Array<{ name: string; hash: string; size: number }>;
  suggestedPlayerName: string;
}

// ============================================================================
// SINGLETON
// ============================================================================

interface IrohNode {
  nodeId: string;
  ticket: string;
  connections: Map<string, any>;
  isInitialized: boolean;
}

const irohSingleton: {
  node: IrohNode | null;
  reset: () => void;
} = {
  node: null,
  reset: () => {
    irohSingleton.node = null;
  }
};

export function resetIrohSingleton() {
  irohSingleton.reset();
}

// ============================================================================
// MOCK IROH IMPLEMENTATION (for now - using PeerJS underneath)
// ============================================================================

// For now, we'll use PeerJS but wrap it to look like Iroh
// This allows the UI to work while we implement true Iroh P2P
let PeerJS: any = null;

async function loadPeerJS() {
  if (!PeerJS) {
    PeerJS = (await import('peerjs')).default;
  }
  return PeerJS;
}

// ============================================================================
// HOOK
// ============================================================================

export function useIrohConnection(
  localDispatch: React.Dispatch<Action>,
  stateRef: React.RefObject<any>
): UseIrohConnectionReturn {
  // Determine host/guest from URL
  const getInitialHostStatus = (): boolean => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    // Guest if ticket exists in URL
    return !params.has('ticket');
  };

  const [isHost, _setIsHost] = useState<boolean>(getInitialHostStatus());
  const [nodeId, setNodeId] = useState<string | null>(irohSingleton.node?.nodeId || null);
  const [ticket, setTicket] = useState<string | null>(irohSingleton.node?.ticket || null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [waitingForPlayerName, setWaitingForName] = useState<WaitingForPlayerName | null>(null);
  const [isP2PLoadingModalOpen, setIsP2PLoadingModalOpen] = useState(false);

  // Shared session UX (loading steps, pack negotiation) — single source of truth
  const ux = useSessionUx(localDispatch);
  const sessionUxRef = useRef(ux);
  sessionUxRef.current = ux;
  const {
    p2pLoadingSteps,
    p2pLoadingProgress,
    requiredPacks,
    suggestedPlayerName,
    setSuggestedPlayerName,
    updateStep: updateP2PLoadingStep,
    reset: resetP2PLoading,
    packBuffer: {
      loadedPacksRef,
      expectedPacksCountRef,
      flushBufferedSyncState,
      proceedWithoutPacks,
    },
  } = ux;

  // Refs
  const hostConnectionRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]);
  const roomRef = useRef<any>(null);
  const peerRef = useRef<any>(null);
  const connectionStatusRef = useRef<ConnectionStatus>('disconnected');

  // Keep ref in sync with state
  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  // Pending player name
  const pendingPlayerNameRef = useRef<string | null>(null);

  // ============================================================================
  // NETWORK DATA HANDLER — delegates to the shared session protocol
  // ============================================================================

  const protocolHandlerRef = useRef<(data: any, senderConn: any) => void>(() => {});
  protocolHandlerRef.current = createProtocolHandler({
    localDispatch,
    stateRef,
    isHost,
    getConnections: () => connectionsRef.current,
    ux: sessionUxRef.current,
  });

  const handleNetworkData = useCallback((data: any, conn: any) => {
    protocolHandlerRef.current(data, conn);
  }, []);

  // ============================================================================
  // INITIALIZE HOST
  // ============================================================================

  const initializeHost = useCallback(async () => {
    if (irohSingleton.node?.isInitialized) {
      return;
    }

    updateP2PLoadingStep('connect', 'loading', 'Creating Iroh node...');
    setConnectionStatus('connecting');

    try {
      const Peer = await loadPeerJS();

      // Create PeerJS instance (acting as Iroh node for now)
      const peer = new Peer(null, {
        debug: 2
      });

      peerRef.current = peer;

      peer.on('open', (id: string) => {
        setNodeId(id);

        // Create a simple ticket (just the nodeId for now, in real Iroh this would be a proper ticket)
        const ticket = btoa(JSON.stringify({ nodeId: id, timestamp: Date.now() }));
        setTicket(ticket);

        if (!irohSingleton.node) {
          irohSingleton.node = {
            nodeId: id,
            ticket,
            connections: new Map(),
            isInitialized: true
          };
        } else {
          irohSingleton.node.nodeId = id;
          irohSingleton.node.ticket = ticket;
          irohSingleton.node.isInitialized = true;
        }

        setConnectionStatus('connected');
        updateP2PLoadingStep('connect', 'success', `Node ready: ${id.slice(0, 8)}...`);
      });

      peer.on('connection', (conn: any) => {
        connectionsRef.current.push(conn);
        hostConnectionRef.current = conn;

        conn.on('data', (data: any) => {
          handleNetworkData(data, conn);
        });

        conn.on('open', () => {
          updateP2PLoadingStep('p2p', 'success', 'P2P connection established');

          // Same accept sequence as the PeerJS host: PACKS_NEEDED first,
          // then the filtered initial state (guest buffers until packs resolve)
          setTimeout(() => {
            if (conn?.open) {
              conn.send(buildPacksNeeded(stateRef.current));
              conn.send(buildInitialSyncState(stateRef.current));
            }
          }, 50);
        });

        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
        });

        conn.on('error', (err: any) => {
          logger.error('[Iroh] Connection error:', err);
        });
      });

      peer.on('error', (err: any) => {
        logger.error('[Iroh] Peer error:', err);
        setConnectionStatus('disconnected');
        updateP2PLoadingStep('connect', 'error', 'Connection failed');
      });

    } catch (error) {
      logger.error('[Iroh] Failed to initialize:', error);
      setConnectionStatus('disconnected');
      updateP2PLoadingStep('connect', 'error', 'Initialization failed');
    }
  }, [updateP2PLoadingStep, handleNetworkData, localDispatch, stateRef]);

  // ============================================================================
  // CONNECT TO HOST (GUEST)
  // ============================================================================

  const connectToHost = useCallback(async (ticketString: string, playerName: string) => {
    resetP2PLoading();
    updateP2PLoadingStep('connect', 'loading', 'Parsing ticket...');
    setConnectionStatus('connecting');

    try {
      // Parse ticket
      let ticketData: any;
      try {
        ticketData = JSON.parse(atob(ticketString));
      } catch {
        // Try using ticket string directly as nodeId
        ticketData = { nodeId: ticketString };
      }

      const hostNodeId = ticketData.nodeId || ticketString;

      updateP2PLoadingStep('connect', 'success', 'Ticket parsed, creating node...');
      updateP2PLoadingStep('p2p', 'loading', 'Connecting to host node...');

      const Peer = await loadPeerJS();
      const peer = new Peer(null, { debug: 2 });
      peerRef.current = peer;

      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (connectionStatusRef.current !== 'connected') {
          updateP2PLoadingStep('connect', 'error', 'Connection timeout');
          setConnectionStatus('disconnected');
        }
      }, 15000); // 15 second timeout

      peer.on('open', (id: string) => {
        setNodeId(id);

        updateP2PLoadingStep('p2p', 'loading', 'Establishing P2P connection...');

        const conn = peer.connect(hostNodeId);
        hostConnectionRef.current = conn;

        conn.on('open', () => {
          clearTimeout(connectionTimeout);
          setConnectionStatus('connected');
          updateP2PLoadingStep('p2p', 'success', 'Connected to host');

          // Send HELO
          const myPlayer: Player = {
            id: getPlayerId(),
            name: playerName,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            isGM: false
          };

          conn.send({ type: 'HELO', payload: myPlayer });
          localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
          localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

          updateP2PLoadingStep('handshake', 'success', 'Handshake complete');
        });

        conn.on('data', (data: any) => {
          handleNetworkData(data, conn);
        });

        conn.on('close', () => {
          clearTimeout(connectionTimeout);
          setConnectionStatus('disconnected');
        });

        conn.on('error', (err: any) => {
          clearTimeout(connectionTimeout);
          logger.error('[Iroh] Connection error:', err);
          setConnectionStatus('disconnected');
          updateP2PLoadingStep('p2p', 'error', 'Connection failed: ' + err.message);
        });
      });

      peer.on('error', (err: any) => {
        clearTimeout(connectionTimeout);
        logger.error('[Iroh] Peer error:', err);
        setConnectionStatus('disconnected');
        updateP2PLoadingStep('connect', 'error', 'Failed to create node: ' + err.message);
      });

    } catch (error) {
      logger.error('[Iroh] Failed to connect:', error);
      setConnectionStatus('disconnected');
      updateP2PLoadingStep('connect', 'error', 'Connection failed');
    }
  }, [updateP2PLoadingStep, resetP2PLoading, handleNetworkData, localDispatch]);

  // ============================================================================
  // SET PLAYER NAME
  // ============================================================================

  const setPlayerName = useCallback((name: string) => {
    if (!waitingForPlayerName) return;

    const finalName = name.trim() || suggestedPlayerName || `Player ${Math.floor(Math.random() * 100)}`;
    pendingPlayerNameRef.current = finalName;

    // If already connected, send HELO
    const hostConn = hostConnectionRef.current;
    if (hostConn && hostConn.open) {
      const myPlayer: Player = {
        id: getPlayerId(),
        name: finalName,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        isGM: false
      };

      hostConn.send({ type: 'HELO', payload: myPlayer });
      localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
      localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

      pendingPlayerNameRef.current = null;
      setWaitingForName(null);
      setIsP2PLoadingModalOpen(false);
    } else {
      // Not connected yet, connect first
      connectToHost(waitingForPlayerName.ticket, finalName);
      setWaitingForName(null);
    }
  }, [waitingForPlayerName, suggestedPlayerName, connectToHost, localDispatch]);

  // ============================================================================
  // ON PACK LOADED
  // ============================================================================

  const onJoinWithoutPacks = proceedWithoutPacks;

  const onPackLoaded = useCallback((packName: string, hashes: string[]) => {
    // Track loaded pack
    loadedPacksRef.current.add(packName);

    // Notify host about pack loading
    const hostConn = hostConnectionRef.current;
    if (hostConn && hostConn.open) {
      hostConn.send({
        type: 'PACK_LOADED',
        payload: { packName, hashes }
      });
    }

    // Apply buffered SYNC_STATE after all required packs are loaded
    const allLoaded = expectedPacksCountRef.current > 0 && loadedPacksRef.current.size >= expectedPacksCountRef.current;
    if (allLoaded) {
      updateP2PLoadingStep('packs', 'success', `Loaded ${expectedPacksCountRef.current} asset pack(s)`);
      flushBufferedSyncState();
    }
  }, [updateP2PLoadingStep, flushBufferedSyncState, loadedPacksRef, expectedPacksCountRef]);

  // ============================================================================
  // URL CHECK ON MOUNT
  // ============================================================================

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticketParam = params.get('ticket');

    if (ticketParam) {
      // Guest mode - show modal for player name
      const playerNum = params.get('playerNum');
      if (playerNum) {
        setSuggestedPlayerName(`Player ${playerNum}`);
      }

      setWaitingForName({
        ticket: ticketParam,
        nodeId: '' // Will be parsed from ticket
      });
    }
  }, [setSuggestedPlayerName]);

  // ============================================================================
  // CLEANUP
  // ============================================================================

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
      }
    };
  }, []);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    nodeId,
    ticket,
    peerId: nodeId, // For compatibility
    isHost,
    connectionStatus,
    waitingForPlayerName,
    initializeHost,
    setPlayerName,
    hostConnectionRef,
    connectionsRef,
    roomRef,
    p2pLoadingSteps,
    p2pLoadingProgress,
    isP2PLoadingModalOpen,
    requiredPacks,
    onPackLoaded,
    onJoinWithoutPacks,
    suggestedPlayerName,
  };
}

// ============================================================================
// URL GENERATION
// ============================================================================

/**
 * Generate invite URL with Iroh ticket
 */
export function generateIrohInviteUrl(
  ticket: string,
  playerNum: number,
  baseUrl: string = window.location.origin
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('ticket', ticket);
  url.searchParams.set('playerNum', playerNum.toString());
  return url.toString();
}
