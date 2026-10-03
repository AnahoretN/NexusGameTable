import { useEffect, useRef, useCallback, useState } from 'react';
import { Peer } from 'peerjs';
import { Action } from './gameActions';
import { Player } from '../types';
import { logger } from '../utils/logger';
import { getPlayerId } from './gameConstants';
import {
  createOptimizedPeerJSConfig,
  CONNECTION_TIMEOUT,
  } from '../utils/webrtcOptimization';
import {
  printCompressionReport,
  dataCompressionManager
} from '../utils/dataCompression';
import { getConnectionSettings, ConnectionMethod } from '../utils/localSettings';
import {
  registerP2PConnections
} from '../utils/directP2PSync';
import { useSessionUx } from './session/sessionUx';
import {
  createProtocolHandler,
  sendAcceptPush,
  notifyGuestDisconnected
} from './session/protocol';

// ============================================================================
// 🔥 SINGLETON PATTERN: Persist P2P connection across HMR remounts
// ============================================================================

/**
 * Module-level refs that persist across component remounts
 * This prevents P2P connection from being destroyed during Vite HMR
 */
const p2pSingleton = {
  peer: null as Peer | null,
  hostConnection: null as any,
  connections: [] as any[],
  room: null as any,
  peerId: null as string | null,
  isInitialized: false,
};

/**
 * Reset the singleton (call when explicitly needed, like page refresh)
 */
export function resetP2PSingleton() {
  if (p2pSingleton.peer && !p2pSingleton.peer.destroyed) {
    try {
      p2pSingleton.peer.destroy();
    } catch (e) {
      // Ignore errors
    }
  }
  p2pSingleton.peer = null;
  p2pSingleton.hostConnection = null;
  p2pSingleton.connections = [];
  p2pSingleton.room = null;
  p2pSingleton.peerId = null;
  p2pSingleton.isInitialized = false;
}

// Type for Trystero room (since library doesn't export types)
type TrysteroRoom = {
  send: (data: any) => void;
  onData: (callback: (data: any, peerId: string) => void) => () => void;
  onPeerJoin: (callback: (peerId: string) => void) => () => void;
  onPeerLeave: (callback: (peerId: string) => void) => () => void;
  leave: () => void;
  getPeers: () => string[];
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface WaitingForPlayerName {
  hostId: string;
}

// 🔥 NEW: P2P Loading Progress
export interface P2PLoadingStep {
  id: string;
  message: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress?: number; // 0-100 for progress bar
}

export interface UsePeerConnectionReturn {
  peerId: string | null;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
  waitingForPlayerName: WaitingForPlayerName | null;
  setPlayerName: (name: string) => void;
  initializeHost: () => void; // Initialize host peer on demand
  hostConnectionRef: React.RefObject<any>;
  connectionsRef: React.RefObject<any[]>;
  roomRef: React.RefObject<any>; // Trystero room ref for fallback
  // 🔥 NEW: P2P Loading Progress
  p2pLoadingSteps: P2PLoadingStep[];
  p2pLoadingProgress: number; // 0-100 overall progress
  // 🔥 NEW: Pack download modal for guests
  requiredPacks: Array<{ name: string; hash: string; size: number }>;
  onPackLoaded: (packName: string, hashes: string[]) => void;
  onJoinWithoutPacks: () => void;
  // 🔥 NEW: Suggested player name for guests
  suggestedPlayerName: string;
}

/**
 * Hook for managing Peer.js WebRTC connections
 * Handles both host and guest connection logic
 *
 * @param localDispatch - Local dispatcher for actions
 * @param stateRef - Ref to current state (for syncing)
 */

// 🔥 OPTIMIZED: WebRTC configuration with comprehensive STUN servers for global accessibility
// Includes fallback servers for countries with restricted internet access
const PEERJS_CONFIG = createOptimizedPeerJSConfig();

// 🔥 DEBUG: Log ICE servers configuration

// ============================================================================
// FALLBACK SIGNALING CONFIGURATION
// ============================================================================

/**
 * PeerJS Cloud серверы - основной метод сигналинга
 * Официальные серверы PeerJS с автоматическим failover
 */
const PEERJS_FALLBACK_SERVERS = [
  { host: '0.peerjs.com', port: 443, secure: true, name: 'PeerJS Cloud Primary' },
  { host: '1.peerjs.com', port: 443, secure: true, name: 'PeerJS Cloud Secondary' },
  { host: '2.peerjs.com', port: 443, secure: true, name: 'PeerJS Cloud Tertiary' },
  // 🔥 NEW: Add alternative public PeerJS servers
  { host: 'peerjs-server.herokuapp.com', port: 443, secure: true, name: 'Heroku PeerJS' },
  { host: 'peer-server.herokuapp.com', port: 443, secure: true, name: 'Alternative Heroku' },
];

/**
 * Комьюнити серверы - self-hosted опции
 * Загружаются из пользовательских настроек
 */
const getCommunityServers = (): Array<{ host: string; port: number; secure: boolean; path?: string; name: string }> => {
  const connectionSettings = getConnectionSettings();
  return connectionSettings.customSignalingServers.map(server => ({
    host: server.host,
    port: server.port,
    secure: server.secure,
    path: server.path,
    name: server.name,
  }));
};

// ============================================================================
// FALLBACK CONNECTION HELPERS
// ============================================================================

/**
 * Результат попытки подключения
 */

/**
 * Попытка подключения через PeerJS сервер с таймаутом
 * 🔥 OPTIMIZED: Suppresses error logs for expected failures during parallel attempts
 * 🔥 OPTIMIZED: Supports abort signal to cancel remaining attempts after first success
 */
async function tryPeerJSServer(
  serverConfig: { host: string; port: number; secure: boolean; path?: string },
  timeout: number = 15000,
  abortSignal?: AbortSignal
): Promise<{ peer: Peer } | null> {

  return new Promise((resolve) => {
    const peerConfig = {
      ...PEERJS_CONFIG, // debug logging level comes from here
      ...serverConfig,
    };

    const peer = new Peer(peerConfig);
    let resolved = false;

    // 🔥 OPTIMIZED: Handle abort signal to cancel remaining attempts
    const onAbort = () => {
      if (!resolved) {

        resolved = true;
        try {
          peer.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
        resolve(null);
      }
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort();
        return;
      }
      abortSignal.addEventListener('abort', onAbort);
    }

    const timeoutId = setTimeout(() => {
      if (!resolved) {

        resolved = true;
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        try {
          peer.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
        resolve(null);
      }
    }, timeout);

    peer.on('open', (_id) => {
      if (!resolved) {

        resolved = true;
        clearTimeout(timeoutId);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        resolve({ peer });
      }
    });

    peer.on('error', (_err) => {
      if (!resolved) {

        resolved = true;
        clearTimeout(timeoutId);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        try {
          peer.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
        resolve(null);
      }
    });
  });
}

/**
 * Попытка подключения через Trystero с торрент-трекерами
 */
// (removed — unreachable: GameContext routes connectionMethod 'trystero'
// to store/useTrysteroConnection.ts, never to this hook's guest path)

// ============================================================================
// PACK HANDLING (Simplified - no P2P asset transfer)
// ============================================================================

export function usePeerConnection(
  localDispatch: React.Dispatch<Action>,
  stateRef: React.RefObject<any>,
  connectionMethod?: ConnectionMethod
): UsePeerConnectionReturn {
  // Determine immediately from URL if we're a guest or host
  // This must be done before any effects run to prevent race conditions
  const getInitialHostStatus = (): boolean => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    // Guest if hostId OR ticket exists (for Iroh mode), host otherwise
    return !(params.has('hostId') || params.has('ticket'));
  };

  const [isHost, _setIsHost] = useState<boolean>(getInitialHostStatus());
  const [peerId, setPeerId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [waitingForPlayerName, setWaitingForPlayerName] = useState<WaitingForPlayerName | null>(null);

  // 🔥 NEW: Shared session UX (loading steps, pack negotiation) — single source of truth
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


  // 🔥 SINGLETON: Use module-level refs that persist across remounts
  // Local refs are just aliases to the singleton values
  const peerRef = useRef<Peer | null>(p2pSingleton.peer);
  const connectionsRef = useRef<any[]>(p2pSingleton.connections);
  const hostConnectionRef = useRef<any>(p2pSingleton.hostConnection);
  const roomRef = useRef<TrysteroRoom | null>(p2pSingleton.room);
  const isIntentionalDisconnectRef = useRef(false); // Track intentional disconnect vs network error
 useRef({ attempts: 0, startTime: null as number | null }); // Guest reconnect state;
  const hostReconnectStateRef = useRef({ attempts: 0, startTime: null as number | null }); // Host reconnect state
  const signallingDisconnectedRef = useRef(false); // Track if we intentionally disconnected from signalling (optimization)
 useRef(0); // Track expected player count for signalling disconnect timing;
  const signallingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Timer for signalling disconnect
  const pendingPlayerNameRef = useRef<string | null>(null); // 🔥 FIX: Store player name for HELO after connection opens

  // 🔥 SYNC: Sync singleton with refs after updates
  const syncSingleton = useCallback(() => {
    p2pSingleton.peer = peerRef.current;
    p2pSingleton.connections = connectionsRef.current;
    p2pSingleton.hostConnection = hostConnectionRef.current;
    p2pSingleton.room = roomRef.current;
    p2pSingleton.peerId = peerRef.current?.id || null;
    p2pSingleton.isInitialized = !!peerRef.current;

    // 🔥 NEW: Register P2P connections for direct sync
    registerP2PConnections({
      hostConnection: hostConnectionRef.current,
      connections: connectionsRef.current,
      isHost
    });
  }, [isHost]);


  // Signalling server timeout - disconnect after this time of inactivity
  const SIGNALLING_TIMEOUT_MS = 120000; // 2 minutes

  // Central Network Data Handler — delegates to the shared session protocol
  const protocolHandlerRef = useRef<(data: any, senderConn: any) => void>(() => {});
  protocolHandlerRef.current = createProtocolHandler({
    localDispatch,
    stateRef,
    isHost,
    getConnections: () => connectionsRef.current,
    ux: sessionUxRef.current,
  });
  const handleNetworkData = useCallback((data: any, senderConn: any) => {
    protocolHandlerRef.current(data, senderConn);
  }, []);

  // ============================================================================
  // SIGNALLING SERVER OPTIMIZATION
  // ============================================================================

  /**
   * Disconnect from signalling server after P2P connections are established
   * This reduces server load while keeping P2P connections alive
   */
  const disconnectFromSignalling = useCallback((_reason: string) => {
    const peer = peerRef.current;
    if (peer && !peer.disconnected && !peer.destroyed) {
      signallingDisconnectedRef.current = true;
      // Clear any pending timeout
      if (signallingTimeoutRef.current) {
        clearTimeout(signallingTimeoutRef.current);
        signallingTimeoutRef.current = null;
      }
      try {
        peer.disconnect();
      } catch (e) {
        logger.error('[P2P][PeerJS] Error disconnecting from signalling:', e);
      }
    }

    // Also disconnect Trystero room if active
    const room = roomRef.current;
    if (room) {
      try {
        room.leave();
        roomRef.current = null;
      } catch (e) {
        logger.error('[P2P][PeerJS] Error leaving legacy room:', e);
      }
    }
  }, []);

  /**
   * Reset the signalling disconnect timer (called when a new player connects)
   * This delays the disconnect from signalling server
   */
  const resetSignallingTimer = useCallback(() => {
    // Clear existing timer
    if (signallingTimeoutRef.current) {
      clearTimeout(signallingTimeoutRef.current);
    }

    // Don't set timer if guest (guest disconnects quickly after connection)
    if (!isHost) {
      return;
    }

    // Set new timer
    signallingTimeoutRef.current = setTimeout(() => {
      const currentConnections = connectionsRef.current.length;
      if (currentConnections > 0) {
        disconnectFromSignalling('Timeout after last player connection');
      }
    }, SIGNALLING_TIMEOUT_MS);
  }, [isHost, disconnectFromSignalling]);

  /**
   * Reconnect to signalling server (needed for new players or reconnect)
   */
  const reconnectToSignalling = useCallback((_reason: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const peer = peerRef.current;
      if (!peer) {
        reject(new Error('No peer to reconnect'));
        return;
      }

      if (peer.destroyed) {
        reject(new Error('Peer is destroyed, cannot reconnect'));
        return;
      }

      if (!peer.disconnected) {
        resolve();
        return;
      }

      signallingDisconnectedRef.current = false;

      // Set up one-time listener for reconnect
      const onOpen = () => {
        peer.off('open', onOpen);
        resolve();
      };

      const onError = (err: any) => {
        logger.error('[P2P][PeerJS] Failed to reconnect to signalling:', err);
        peer.off('open', onOpen);
        peer.off('error', onError);
        reject(err);
      };

      peer.once('open', onOpen);
      peer.once('error', onError);

      try {
        peer.reconnect();
      } catch (e) {
        peer.off('open', onOpen);
        peer.off('error', onError);
        reject(e);
      }
    });
  }, []);

  // Connect to Host Logic (Guest Side)
  const connectToHost = useCallback(async (hostId: string, playerName: string) => {
    // 🔥 NEW: Reset and start loading progress
    resetP2PLoading();
    updateP2PLoadingStep('connect', 'loading', 'Connecting to signaling server...');

    // ============================================================================
    // NO FALLBACK - Use only the selected connection method
    // ============================================================================

    // Get connection method from parameter or settings
    const method = connectionMethod || getConnectionSettings().connectionMethod || 'peerjs';

    const communityServers = getCommunityServers();
    const PARALLEL_TIMEOUT = 8000;

    // Try connection based on selected method only.
    // NOTE: method 'trystero' never reaches this hook — GameContext routes it
    // to store/useTrysteroConnection.ts.

    // For 'peerjs' and 'iroh' methods, use PeerJS
    // Build list of servers to try based on method
    let serversToTry: Array<{ host: string; port: number; secure: boolean; path?: string; name: string }> = [];

    if (method === 'peerjs') {
      // Try PeerJS Cloud servers only
      serversToTry = [...PEERJS_FALLBACK_SERVERS];
    } else if (method === 'iroh') {
      // Try community servers first, then PeerJS Cloud as fallback
      serversToTry = [...communityServers, ...PEERJS_FALLBACK_SERVERS];
    }

    if (serversToTry.length === 0) {
      serversToTry = [...PEERJS_FALLBACK_SERVERS];
    }

    setConnectionStatus('connecting');

    // Try servers in sequence (not parallel) for the selected method
    let connectedPeer: Peer | null = null;
    let connectedServerName: string | null = null;

    for (const server of serversToTry) {
      const result = await tryPeerJSServer(server, PARALLEL_TIMEOUT);

      if (result) {
        connectedPeer = result.peer;
        connectedServerName = server.name;
        updateP2PLoadingStep('connect', 'success', `Connected via ${server.name}`);
        break;
      }
    }

    if (connectedPeer && connectedServerName) {
      return setupPeerConnection(connectedPeer, hostId, playerName);
    }

    // All servers for selected method failed
    alert(`Failed to connect using ${method.toUpperCase()}. Please check your network settings or try a different connection method.`);
    setConnectionStatus('disconnected');
    setWaitingForPlayerName(null);

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    /**
     * Настроить PeerJS соединение после успешного подключения
     */
    function setupPeerConnection(peer: Peer, hostId: string, _playerName: string) {
      peerRef.current = peer;
      (window as any).__nexusPeer = peer;
      syncSingleton(); // Sync to singleton after peer is set

      // 🔥 NEW: Update progress - establishing P2P connection
      updateP2PLoadingStep('p2p', 'loading', 'Establishing P2P connection...');

      const conn = peer.connect(hostId);
      hostConnectionRef.current = conn;
      (window as any).__nexusHostConnection = conn;
      syncSingleton(); // Sync to singleton after connection is set

      // 🔥 NEW: Retry connection if it doesn't open (signaling may be delayed)
      let retryCount = 0;
      const maxRetries = 3;
      const retryInterval = 3000; // 3 seconds

      const retryConnection = () => {
        if (connectionCompleted || retryCount >= maxRetries) {
          return;
        }

        retryCount++;

        // Close old connection and try again
        if (conn && !conn.open) {
          const newConn = peer.connect(hostId);
          hostConnectionRef.current = newConn;
          (window as any).__nexusHostConnection = newConn;

          // Copy event listeners to new connection
          newConn.on('open', () => {
            if (connectionTimeoutId) {
              clearTimeout(connectionTimeoutId);
            }
            connectionCompleted = true;
            setConnectionStatus('connected');
            syncSingleton();
            updateP2PLoadingStep('p2p', 'success', 'P2P connection established');
            updateP2PLoadingStep('handshake', 'loading', 'Waiting for host info...');
          });

          newConn.on('error', (_err) => {
            // Retry connection failed
          });
        }
      };

      // Schedule retries
      for (let i = 1; i <= maxRetries; i++) {
        setTimeout(retryConnection, i * retryInterval);
      }

      // 🔥 NEW: Connection timeout with diagnostics
      let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let connectionCompleted = false;

      // Set timeout for connection
      connectionTimeoutId = setTimeout(async () => {
        if (!connectionCompleted) {
          connectionCompleted = true;
          updateP2PLoadingStep('p2p', 'error', 'Connection timeout - NAT/firewall blocking?');

          // Show helpful error message
          const errorMsg = `Connection timeout! This usually means:\n\n` +
            `• Host or guest behind a restrictive firewall/NAT\n` +
            `• Different WiFi networks with incompatible NAT types\n` +
            `• TURN relay servers may be needed\n\n` +
            `Try:\n` +
            `• Both on same network first\n` +
            `• Disable VPNs\n` +
            `• Try a different connection method in settings`;

          // Show error message without fallback option
          alert(errorMsg);
          setConnectionStatus('disconnected');
          setWaitingForPlayerName(null);
        }
      }, CONNECTION_TIMEOUT);

      conn.on('open', () => {
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
        }
        connectionCompleted = true;

        logger.log('[P2P][PeerJS] Data channel open with host');
        setConnectionStatus('connected');
        syncSingleton(); // Sync to singleton after connection is open

        // 🔥 NEW: Update progress - P2P connection established
        updateP2PLoadingStep('p2p', 'success', 'P2P connection established');
        // Handshake is NOT complete yet — success is set by the host's
        // PACKS_NEEDED in the shared protocol (parity with Trystero).
        updateP2PLoadingStep('handshake', 'loading', 'Waiting for host response...');

        // 🔥 FIX: Send HELO if player name was set before connection opened
        // This handles the case where setPlayerName was called but connection wasn't ready yet
        const playerName = pendingPlayerNameRef.current;
        if (playerName) {
          const persistentPlayerId = getPlayerId();
          const myPlayer: Player = {
            id: persistentPlayerId,
            name: playerName,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            isGM: false
          };

          // Add ourselves locally
          localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
          localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

          // Send HELO to host
          conn.send({ type: 'HELO', payload: myPlayer });
          logger.log('[P2P][PeerJS] HELO sent');

          // Clear pending name
          pendingPlayerNameRef.current = null;
        }
      });

      conn.on('data', (data: any) => {
        if (data.type === 'CONNECTION_LOCKED') {
          logger.warn('[P2P][PeerJS] Host has locked new connections');
          updateP2PLoadingStep('handshake', 'error', 'The host has locked new connections');
          alert("The host has locked new connections. Please contact the host to join.");
          setConnectionStatus('disconnected');
          setWaitingForPlayerName(null);
          return;
        }
        handleNetworkData(data, conn);
      });

      conn.on('close', () => {
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
        }
        connectionCompleted = true;

        logger.warn('[P2P][PeerJS] Host connection closed');
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        alert("Connection to Host lost");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });

      conn.on('error', (err) => {
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
        }
        connectionCompleted = true;

        logger.error('[P2P][PeerJS] Connection error to host:', err);
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        alert("Failed to connect to host");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });

      const originalEmit = conn.emit;
      conn.emit = function(...args: any[]) {
        // ICE state change monitoring
        return originalEmit.apply(this, args as any);
      };

      // 🔥 NEW: Monitor ICE connection state for better diagnostics
      // RTCPeerConnection might not be ready yet, so check periodically
      const checkIceState = () => {
        const pc = (conn as any)._pc;
        if (pc) {
          pc.addEventListener('iceconnectionstatechange', () => {
            const state = pc.iceConnectionState;
            if (state === 'failed' || state === 'disconnected') {
              updateP2PLoadingStep('p2p', 'error', `ICE ${state} - NAT blocked`);
            }
          });
        }
      };

      // Check immediately and also after a short delay
      checkIceState();
      setTimeout(checkIceState, 1000);
      setTimeout(checkIceState, 3000);

      peer.on('disconnected', () => {
        if (peer && !peer.destroyed && !isIntentionalDisconnectRef.current) {
          peer.reconnect();
        }
      });

      peer.on('error', (err) => {
        // 🔥 FIX: Handle all network-related errors, not just 'network' type
        const isNetworkError = err?.type === 'network' ||
          err?.type === 'socket-error' ||
          err?.type === 'socket-closed' ||
          err?.type === 'server-error' ||
          (err?.message && err.message.includes('Lost connection to server'));

        if (isNetworkError && peer && !peer.destroyed && !isIntentionalDisconnectRef.current) {
          peer.reconnect();
        } else if (!isNetworkError) {
          setConnectionStatus('disconnected');
        }
      });
    }
  }, [localDispatch, handleNetworkData, setConnectionStatus, setWaitingForPlayerName, updateP2PLoadingStep, resetP2PLoading]);

  // Handler for when player submits their name via modal (joining a game)
  const setPlayerName = useCallback((name: string) => {
    if (!waitingForPlayerName) return;

    const { hostId } = waitingForPlayerName;
    const finalName = name.trim() || suggestedPlayerName || `Player ${Math.floor(Math.random() * 100)}`;

    // 🔥 FIX: Store player name for HELO after connection opens
    pendingPlayerNameRef.current = finalName;

    // 🔥 CHANGED: If already connected to host, create player and send HELO immediately
    const hostConn = hostConnectionRef.current;
    if (hostConn && hostConn.open) {
      const persistentPlayerId = getPlayerId();
      const myPlayer: Player = {
        id: persistentPlayerId,
        name: finalName,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        isGM: false
      };

      localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
      localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

      hostConn.send({ type: 'HELO', payload: myPlayer });
      logger.log('[P2P][PeerJS] HELO sent');
      pendingPlayerNameRef.current = null; // Clear after sending

      // Handshake completes when the host's PACKS_NEEDED arrives (shared protocol)
    } else {
      // Fallback: not connected yet, connect first (HELO will be sent in conn.on('open'))
      connectToHost(hostId, finalName);
    }
  }, [waitingForPlayerName, connectToHost, suggestedPlayerName, localDispatch, updateP2PLoadingStep]);

  // Initialize host peer on demand (when user clicks Invite button)
  const initializeHost = useCallback(async () => {
    // 🔥 SINGLETON: Restore from singleton if available (HMR remount)
    if (p2pSingleton.peer && !p2pSingleton.peer.destroyed) {
      peerRef.current = p2pSingleton.peer;
      connectionsRef.current = p2pSingleton.connections;

      // Restore refs
      (window as any).__nexusPeer = peerRef.current;

      // Update state
      setPeerId(p2pSingleton.peer.id);
      setConnectionStatus('connected');

      return;
    }

    // Check if we have a peer that's just disconnected from signalling (optimization)
    if (peerRef.current && peerRef.current.disconnected && !peerRef.current.destroyed) {
      try {
        await reconnectToSignalling('New player needs to join');
        // Reset timer to allow time for new players to connect
        resetSignallingTimer();
        syncSingleton(); // Sync to singleton
        return;
      } catch (e) {
        logger.error('[P2P][PeerJS] Host failed to reconnect to signalling:', e);
        // Fall through to create new peer
      }
    }

    // Already initialized or initializing
    if (peerRef.current) {
      return;
    }

    const peer = new Peer(PEERJS_CONFIG);
    peerRef.current = peer;
    // Store for diagnostic access
    (window as any).__nexusPeer = peer;
    syncSingleton(); // Sync to singleton after creating peer

    peer.on('open', async (id) => {
      // Check if this is a reconnect (peerId was already set)
      const isReconnect = peerRef.current?.id === id;
      if (isReconnect) {
        // Reset reconnect state on successful reconnect
        hostReconnectStateRef.current = { attempts: 0, startTime: null };
        signallingDisconnectedRef.current = false; // Reset signalling disconnect flag
      }

      setPeerId(id);
      setConnectionStatus('connected');
      syncSingleton(); // Sync to singleton after peer is open
    });

    // Handle incoming connections (If we are Host)
    peer.on('connection', (conn) => {
      const guestPeerId = conn.peer;

      // 🔥 NEW: Monitor ICE state for incoming connections
      const checkHostIceState = () => {
        const pc = (conn as any)._pc;
        if (pc) {
          pc.addEventListener('iceconnectionstatechange', () => {
            const state = pc.iceConnectionState;
            if (state === 'failed' || state === 'disconnected') {
              // 'disconnected' can be transient (network switch) — warn, not error
              logger.warn(`[P2P][PeerJS] ICE connection ${state} — guest connection degraded`);
            }
          });
        }
      };

      checkHostIceState();
      setTimeout(() => checkHostIceState(), 1000);
      setTimeout(() => checkHostIceState(), 3000);

      conn.on('open', () => {
        logger.log('[P2P][PeerJS] Guest connected', guestPeerId);

        // Check if connections are locked
        if (stateRef.current?.connectionsLocked) {
          conn.send({ type: 'CONNECTION_LOCKED' });
          conn.close();
          return;
        }

        connectionsRef.current.push(conn);
        syncSingleton(); // Sync to singleton after connection added

        // 🔥 CRITICAL FIX: Set up data handler BEFORE sending data
        // This prevents HELO messages from being lost
        conn.on('data', (data: any) => {
          handleNetworkData(data, conn);
        });

        // PACKS_NEEDED + initial SYNC_STATE, retried while the channel settles
        // (a single fire-and-forget send used to be silently skipped)
        sendAcceptPush(conn, () => stateRef.current);

        // Store reference to connection for sending player panel settings later
        (conn as any).pendingPlayerId = null; // Will be set when HELO is received

        // Handle Disconnection
        conn.on('close', () => {
          logger.info('[P2P][PeerJS] Guest disconnected', guestPeerId);
          notifyGuestDisconnected(localDispatch, connectionsRef, conn);
          syncSingleton(); // Sync to singleton after connection removed
        });

        conn.on('error', (err) => {
          logger.error(`[P2P][PeerJS] Connection error with guest ${guestPeerId}:`, err);
          notifyGuestDisconnected(localDispatch, connectionsRef, conn);
          syncSingleton(); // Sync to singleton after connection removed
        });

        // Monitor ICE state for this connection
        const originalEmit = conn.emit;
        conn.emit = function(...args: any[]) {
          if (args[0] === 'iceStateChange') {
            const state = args[1] as string;
            if (state === 'failed' || state === 'disconnected') {
              logger.warn(`[P2P][PeerJS] ICE connection ${state} for guest ${guestPeerId} — may indicate NAT/firewall issues`);
            }
          }
          return originalEmit.apply(this, args as any);
        };

        // Connection timeout
        setTimeout(() => {
          if (!conn.open) {
            logger.warn(`[P2P][PeerJS] Connection timeout for guest ${guestPeerId}`);
          }
        }, 30000);
      });
    });

    // Reconnection logic: try every 5 seconds for 2 minutes, then give up
    const RECONNECT_INTERVAL = 5000; // 5 seconds
    const MAX_RECONNECT_TIME = 120000; // 2 minutes total (increased from 30s)

    const scheduleHostReconnect = () => {
      // Don't reconnect if this was an intentional disconnect
      if (isIntentionalDisconnectRef.current) {
        return;
      }

      // Initialize start time on first attempt
      if (hostReconnectStateRef.current.startTime === null) {
        hostReconnectStateRef.current.startTime = Date.now();
      }

      const elapsed = Date.now() - (hostReconnectStateRef.current.startTime || 0);
      hostReconnectStateRef.current.attempts++;

      if (elapsed >= MAX_RECONNECT_TIME) {
        // Clean up peer to stop server requests
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        setConnectionStatus('disconnected');
        return;
      }

      setTimeout(() => {
        // Check again before reconnecting - state may have changed
        if (isIntentionalDisconnectRef.current) {
          return;
        }

        if (peer && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch (e) {
            logger.error('[P2P][PeerJS] Host reconnect failed:', e);
            // Continue trying
            scheduleHostReconnect();
          }
        }
      }, RECONNECT_INTERVAL);
    };

    peer.on('disconnected', () => {
      if (peer && !peer.destroyed) {
        scheduleHostReconnect();
      }
    });

    peer.on('error', (err) => {
      logger.error('[P2P][PeerJS] Peer error:', err);

      // 🔥 FIX: Handle all network-related errors, not just 'network' type
      // PeerJS emits various error types for connection issues:
      // - 'network': General network error
      // - 'socket-error', 'socket-closed': WebSocket connection lost
      // - 'server-error': Signaling server error
      const isNetworkError = err?.type === 'network' ||
        err?.type === 'socket-error' ||
        err?.type === 'socket-closed' ||
        err?.type === 'server-error' ||
        // Also check error message for "Lost connection to server"
        (err?.message && err.message.includes('Lost connection to server'));

      if (isNetworkError && peer && !peer.destroyed) {
        scheduleHostReconnect();
      } else if (!isNetworkError) {
        // Critical error - clean up peer to stop server requests
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        setConnectionStatus('disconnected');
      }
    });
  }, [localDispatch, handleNetworkData, stateRef, reconnectToSignalling, resetSignallingTimer, syncSingleton]);

  // PEERJS SETUP (only for guest - host initializes on demand)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hostIdToJoin = params.get('hostId');
    const ticketParam = params.get('ticket');

    // 🔥 FIX: Skip if ticket is present but connection method is not peerjs
    // Let Iroh/Trystero handle their own connection methods
    if (ticketParam && connectionMethod !== 'peerjs') {
      return;
    }

    // Determine the host identifier (from ticket or direct hostId)
    let hostIdentifier = hostIdToJoin;

    // If we have a ticket (Iroh mode), parse it to get the peerId
    if (ticketParam && !hostIdToJoin) {
      try {
        // Try to parse the ticket (supports multiple formats)
        let parsedPeerId: string | null = null;

        // First, try the simple format used by useIrohConnection
        try {
          const simpleTicket = JSON.parse(atob(ticketParam));
          if (simpleTicket.nodeId) {
            parsedPeerId = simpleTicket.nodeId;
          }
        } catch {
          // If simple format fails, try IrohConnectionManager format
        }

        // If simple format didn't work, try IrohConnectionManager
        if (!parsedPeerId) {
          import('./useIrohConnection').then(() => {
            import('../utils/irohConnection').then(({ IrohConnectionManager }) => {
              const parsed = IrohConnectionManager.parseTicket(ticketParam);
              if (parsed && parsed.peerJsId) {
                parsedPeerId = parsed.peerJsId;
              } else if (parsed?.nodeId?.relayUrl === 'peerjs') {
                parsedPeerId = parsed.nodeId.publicKey;
              }
            });
          });
        }

        if (parsedPeerId) {
          hostIdentifier = parsedPeerId;

          // Update URL to use hostId for consistency
          const url = new URL(window.location.href);
          url.searchParams.set('hostId', hostIdentifier);
          url.searchParams.delete('ticket');
          window.history.replaceState({}, '', url.toString());

          // Continue with guest connection logic below
          if (!waitingForPlayerName) {
            const playerNum = params.get('playerNum');
            if (playerNum) {
              setSuggestedPlayerName(`Player ${playerNum}`);
            }
            setWaitingForPlayerName({ hostId: hostIdentifier });
          }
          return;
        }

        // If we get here, parsing failed
        alert('Invalid invite link. Please check the link and try again.');
      } catch (e) {
        logger.error('[P2P][PeerJS] Error parsing ticket:', e);
        alert('Invalid invite link. Please check the link and try again.');
      }
      return;
    }

    // If we have a hostId in URL, show modal FIRST for player name
    if (hostIdentifier) {
      // 🔥 FIX: Only set waitingForPlayerName if not already set
      // This prevents the modal from reopening when connectToHost changes
      if (!waitingForPlayerName) {
        // Read suggested player number from URL
        const playerNum = params.get('playerNum');
        if (playerNum) {
          const suggestedName = `Player ${playerNum}`;
          setSuggestedPlayerName(suggestedName);
        }

        // Show modal immediately - don't start connection yet
        // Connection will start after user enters name in modal
        setWaitingForPlayerName({ hostId: hostIdentifier });
      }
      return;
    }

    // No hostId/ticket = host mode - peer will be initialized when user clicks Invite
  }, [connectToHost, waitingForPlayerName]);

  // ============================================================================
  // 🔥 CLEANUP LOGIC: Preserve P2P connection across HMR remounts
  // ============================================================================

  useEffect(() => {
    const cleanupPeer = () => {
      isIntentionalDisconnectRef.current = true;

      // Clear signalling disconnect timer
      if (signallingTimeoutRef.current) {
        clearTimeout(signallingTimeoutRef.current);
        signallingTimeoutRef.current = null;
      }

      // Close all host connections
      if (connectionsRef.current.length > 0) {
        connectionsRef.current.forEach(conn => {
          try {
            conn.close();
          } catch (e) {
            // Error closing connection
          }
        });
        connectionsRef.current = [];
      }

      // Close guest connection to host
      if (hostConnectionRef.current) {
        try {
          hostConnectionRef.current.close();
        } catch (e) {
          // Error closing host connection
        }
        hostConnectionRef.current = null;
      }

      // Destroy peer connection to signalling server
      if (peerRef.current && !peerRef.current.destroyed) {
        try {
          peerRef.current.destroy();
        } catch (e) {
          // Error destroying peer
        }
        peerRef.current = null;
      }

      // Reset singleton
      resetP2PSingleton();
    };

    const handleUnload = () => {
      cleanupPeer();
    };

    window.addEventListener('beforeunload', handleUnload);

    // 🔥 OPTIMIZATION: On component unmount (HMR), sync to singleton but DON'T destroy peer
    return () => {
      window.removeEventListener('beforeunload', handleUnload);

      // Sync refs to singleton before unmount
      syncSingleton();

      // Clear refs but don't destroy peer
      peerRef.current = null;
      connectionsRef.current = [];
      hostConnectionRef.current = null;
      roomRef.current = null;
    };
  }, [syncSingleton]);

  // Old useEffect code removed - host now initializes on demand via initializeHost()

  const onJoinWithoutPacks = proceedWithoutPacks;

    // 🔥 NEW: Pack loaded handler (guest side)
  const onPackLoaded = useCallback((packName: string, hashes: string[]) => {
    // Track loaded pack
    loadedPacksRef.current.add(packName);

    // Notify host that pack was loaded
    const hostConn = hostConnectionRef.current;
    if (hostConn && hostConn.open) {
      hostConn.send({
        type: 'PACK_LOADED',
        payload: {
          packName,
          hashes
        }
      });
    }

    // Check if all required packs are loaded
    const allLoaded = expectedPacksCountRef.current > 0 && loadedPacksRef.current.size >= expectedPacksCountRef.current;
    if (allLoaded) {
      // Update loading step to success - modal stays open, managed by GameContext
      updateP2PLoadingStep('packs', 'success', `Loaded ${expectedPacksCountRef.current} asset pack(s)`);

      // Apply buffered SYNC_STATE after all packs are loaded
      flushBufferedSyncState();
    }
  }, [updateP2PLoadingStep, flushBufferedSyncState]);

  return {
    peerId,
    isHost,
    connectionStatus,
    waitingForPlayerName,
    initializeHost,
    setPlayerName,
    hostConnectionRef,
    connectionsRef,
    roomRef, // Trystero room ref for fallback
    // 🔥 NEW: P2P Loading Progress
    p2pLoadingSteps,
    p2pLoadingProgress,
    // 🔥 NEW: Pack download for guests
    requiredPacks,
    onPackLoaded,
    onJoinWithoutPacks,
    // 🔥 NEW: Suggested player name for guests
    suggestedPlayerName,
  };
}

// Expose diagnostic function to global scope for debugging
if (typeof window !== 'undefined') {
  (window as any).nexusP2PDebug = {
    ...((window as any).nexusP2PDebug || {}),
    getCompressionStats: () => {
      return dataCompressionManager.getStats();
    },
    printCompressionReport: () => {
      printCompressionReport();
    },
    setCompressionEnabled: (enabled: boolean) => {
      dataCompressionManager.setEnabled(enabled);
    },
    getDiagnostics: () => {
      const peer = (window as any).__nexusPeer;
      const conn = (window as any).__nexusHostConnection;

      return {
        peer: peer,
        connection: conn,
        webrtcSupported: !!(window as any).RTCPeerConnection,
      };
    },
    testConnection: async (hostId: string) => {
      const testPeer = new Peer(PEERJS_CONFIG);
      return new Promise((resolve) => {
        testPeer.on('open', (_id: string) => {
          const testConn = testPeer.connect(hostId);

          let resolved = false;
          testConn.on('open', () => {
            if (!resolved) {
              resolved = true;
              testConn.close();
              testPeer.destroy();
              resolve({ success: true });
            }
          });

          testConn.on('error', (err: any) => {
            if (!resolved) {
              resolved = true;
              testPeer.destroy();
              resolve({ success: false, error: err });
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              testConn.close();
              testPeer.destroy();
              resolve({ success: false, error: 'timeout' });
            }
          }, 10000);
        });

        testPeer.on('error', (err: any) => {
          resolve({ success: false, error: err });
        });
      });
    },
    // 🔥 NEW: Check current usedPacks state
    checkUsedPacks: () => {
      const state = (window as any).__gameState;
      if (!state) {
        return;
      }
      return state.usedPacks || {};
    }
  };
}
