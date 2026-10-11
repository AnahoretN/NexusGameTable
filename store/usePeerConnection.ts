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
import {
  getHostInviteId,
  regenerateHostPeerId,
  writeHostDescriptor,
  writeGuestDescriptor,
  readSessionDescriptor,
  isDescriptorFresh,
  shouldRefreshGuestDescriptor,
  readTabSession,
  isTabSessionFresh,
  rememberGuestIdentity,
  clearSessionDescriptor,
} from './session/sessionResume';

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

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

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
  // 🔥 RESUME: silent rejoin + reconnect retry (guest side)
  resumeGuest: (inviteId: string, identity: { name: string; color: string }) => void;
  retryGuestConnection: () => void;
  /** Ref-based hook: invoked once when the reconnect loop gives up (UI shows backup restore). */
  onReconnectFailedRef: React.MutableRefObject<(() => void) | null>;
  /** 🔧 KICK: invoked once when the host removes this player from the session. */
  onRemovedFromSessionRef: React.MutableRefObject<(() => void) | null>;
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
    if (params.has('hostId') || params.has('ticket')) return false;
    // 🔥 RESUME: THIS TAB's own record (sessionStorage) is the primary role
    // source — the shared localStorage descriptor may belong to another tab's
    // role (a guest tab in the same browser would misclassify a host reload).
    const tab = readTabSession();
    if (tab && isTabSessionFresh(tab) && tab.method === 'peerjs') {
      return tab.role === 'host';
    }
    // Session resume fallback: a fresh guest descriptor (no URL invite) means
    // we are a returning guest, not a host.
    const d = readSessionDescriptor();
    if (d && isDescriptorFresh(d) && d.role === 'guest' && d.method === 'peerjs') return false;
    return true;
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
    armRejoin,
    packBuffer: {
      loadedPacksRef,
      expectedPacksCountRef,
      flushBufferedSyncState,
      proceedWithoutPacks,
    },
  } = ux;

  // 🔥 RESUME: Guest identity for this browser session — the color is generated
  // ONCE (not per HELO) so a rejoining guest keeps the same color.
  const identityRef = useRef<{ name: string; color: string } | null>(null);

  // 🔥 SINGLETON: Use module-level refs that persist across remounts
  // Local refs are just aliases to the singleton values
  const peerRef = useRef<Peer | null>(p2pSingleton.peer);
  const connectionsRef = useRef<any[]>(p2pSingleton.connections);
  const hostConnectionRef = useRef<any>(p2pSingleton.hostConnection);
  const roomRef = useRef<TrysteroRoom | null>(p2pSingleton.room);
  const isIntentionalDisconnectRef = useRef(false); // Track intentional disconnect vs network error
  // 🔥 RESUME: transport loss ≠ session loss — set only by explicit teardown
  // (beforeunload / CLEAR_SAVED_STATE). Connection close/error now schedules a
  // guest reconnect loop instead of giving up.
  const sessionIntentionallyLeftRef = useRef(false);
  const guestReconnectStateRef = useRef({ attempts: 0, timer: null as ReturnType<typeof setTimeout> | null, active: false, startTime: null as number | null });
  const reconnectingRef = useRef(false); // single-flight guard for startGuestReconnect
  const hostReconnectStateRef = useRef({ attempts: 0, startTime: null as number | null }); // Host reconnect state
  const signallingDisconnectedRef = useRef(false); // Track if we intentionally disconnected from signalling (optimization)
  const signallingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Timer for signalling disconnect
  const pendingPlayerNameRef = useRef<string | null>(null); // 🔥 FIX: Store player name for HELO after connection opens
  const pendingPlayerColorRef = useRef<string | null>(null); // 🔥 RESUME: persisted color for rejoin HELOs
  // 🔥 RESUME: hostId we most recently connected to (for the reconnect loop)
  const lastHostIdRef = useRef<string | null>(null);
  // 🔥 RESUME: hook for reconnect to report terminal failure to the UI
  const onReconnectFailedRef = useRef<(() => void) | null>(null);
  // Indirection so connection handlers can trigger the reconnect loop
  // (defined after connectToHost) without declaration-order hazards.
  const startGuestReconnectRef = useRef<(() => void) | null>(null);
  // 🔧 KICK: set when the host removes this player — suppresses the reconnect
  // loop and connection-loss recovery; GameContext shows the removed modal.
  const kickedRef = useRef(false);
  const onRemovedFromSessionRef = useRef<(() => void) | null>(null);

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

  // 🔥 RECONNECT MODAL: the host announces its own unload (F5 / tab close) so
  // every guest flips to 'reconnecting' and shows the blocking reconnect
  // modal immediately (see SessionResumeBanner).
  useEffect(() => {
    if (!isHost) return;
    const notifyGuests = () => {
      connectionsRef.current.forEach(conn => {
        try {
          if (conn.open) conn.send({ type: 'HOST_RELOADING' });
        } catch {
          // channel may already be dead — nothing to do
        }
      });
    };
    window.addEventListener('pagehide', notifyGuests);
    window.addEventListener('beforeunload', notifyGuests);
    return () => {
      window.removeEventListener('pagehide', notifyGuests);
      window.removeEventListener('beforeunload', notifyGuests);
    };
  }, [isHost]);

  // Central Network Data Handler — delegates to the shared session protocol
  const protocolHandlerRef = useRef<(data: any, senderConn: any) => void>(() => {});
  // 🔥 RESUME: fired by the protocol when a full SYNC_STATE is applied — the
  // guest session is (re)established. Persist the descriptor and stop reconnecting.
  const onSessionEstablished = useCallback(() => {
    if (isHost) return;
    const hostId = lastHostIdRef.current;
    const identity = identityRef.current;
    if (hostId && identity && (reconnectingRef.current || shouldRefreshGuestDescriptor(hostId))) {
      writeGuestDescriptor('peerjs', hostId, {
        playerId: getPlayerId(),
        playerName: identity.name,
        playerColor: identity.color,
      });
    }
    if (reconnectingRef.current) {
      logger.log('[P2P][PeerJS] Rejoin complete — session re-established');
    }
    reconnectingRef.current = false;
    guestReconnectStateRef.current = { attempts: 0, timer: null, active: false, startTime: null };
    setConnectionStatus('connected');
  }, [isHost]);
  protocolHandlerRef.current = createProtocolHandler({
    localDispatch,
    stateRef,
    isHost,
    getConnections: () => connectionsRef.current,
    ux: sessionUxRef.current,
    onSessionEstablished,
  });
  // 🔧 KICK: host removed this player — full session teardown (no reconnect,
  // no resume); GameContext shows the blocking removed-player modal.
  const handleRemovedFromSession = useCallback(() => {
    if (kickedRef.current) return;
    kickedRef.current = true;
    logger.warn('[P2P][PeerJS] This player was removed from the session by the host');
    // Stop the reconnect loop — nobody may re-join automatically
    reconnectingRef.current = false;
    const st = guestReconnectStateRef.current;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    st.active = false;
    setConnectionStatus('disconnected');
    // Kill auto-resume: without the descriptor a reload won't rejoin.
    // nexus-player-id is intentionally KEPT — re-joining via the invite link
    // re-registers the same player (with their per-player data).
    clearSessionDescriptor();
    // Tear down the peer/connection (host side keeps its own cleanup)
    const peer = peerRef.current;
    if (peer && !peer.destroyed) {
      try { peer.destroy(); } catch { /* already dead */ }
    }
    if (p2pSingleton.peer === peer) {
      p2pSingleton.peer = null;
      p2pSingleton.hostConnection = null;
      p2pSingleton.isInitialized = false;
    }
    peerRef.current = null;
    hostConnectionRef.current = null;
    onRemovedFromSessionRef.current?.();
  }, []);

  const handleNetworkData = useCallback((data: any, senderConn: any) => {
    // 🔥 RECONNECT MODAL: the host announced its own reload (F5) — flip the
    // guest to 'reconnecting' at once so the blocking reconnect modal shows
    // (see SessionResumeBanner). onSessionEstablished flips it back once the
    // host's SYNC_STATE lands. PeerJS has no room-level self-healing, so the
    // HOST_PING watchdog would otherwise stay silent for up to 45s.
    if (data?.type === 'HOST_RELOADING') {
      setConnectionStatus('reconnecting');
      return;
    }
    // 🔧 KICK: the host removed this player from the session. Tear the session
    // down (no auto-reconnect, no resume) and let GameContext show the modal.
    if (data?.type === 'PLAYER_REMOVED') {
      if (data.payload?.playerId === getPlayerId()) {
        handleRemovedFromSession();
      }
      return;
    }
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
  // 🔥 RESUME: `opts.rejoin` marks a reconnect/auto-rejoin attempt — no alerts
  // (the reconnect loop reports failure), pack buffering stays disarmed, and
  // the persisted identity (color) is reused.
  const connectToHost = useCallback(async (hostId: string, playerName: string, opts?: { rejoin?: boolean }) => {
    const rejoin = !!opts?.rejoin;
    lastHostIdRef.current = hostId;

    // 🔥 NEW: Reset and start loading progress. On a rejoin, armRejoin (instead
    // of a plain reset) keeps SYNC_STATE buffering disabled — nothing would call
    // onPackLoaded (the join modal never shows) and the rejoin would deadlock.
    if (rejoin) {
      armRejoin();
      updateP2PLoadingStep('connect', 'loading', 'Reconnecting to host...');
    } else {
      // 🔧 KICK: a fresh join (via invite link) clears a previous kick —
      // re-joining after removal is explicitly allowed.
      kickedRef.current = false;
      resetP2PLoading();
      updateP2PLoadingStep('connect', 'loading', 'Connecting to signaling server...');
    }

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
    if (!rejoin) {
      alert(`Failed to connect using ${method.toUpperCase()}. Please check your network settings or try a different connection method.`);
    }
    setConnectionStatus(rejoin ? 'reconnecting' : 'disconnected');
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
          if (!rejoin) {
            alert(errorMsg);
          }
          setConnectionStatus(rejoin ? 'reconnecting' : 'disconnected');
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
          // 🔥 RESUME: color is generated once per browser session and reused on
          // every HELO so a rejoining guest keeps the same color.
          const playerColor = pendingPlayerColorRef.current
            || '#' + Math.floor(Math.random() * 16777215).toString(16);
          pendingPlayerColorRef.current = playerColor;
          identityRef.current = { name: playerName, color: playerColor };
          rememberGuestIdentity(playerName, playerColor);
          const myPlayer: Player = {
            id: persistentPlayerId,
            name: playerName,
            color: playerColor,
            isGM: false
          };

          // Add ourselves locally (host dedupes on its side via the player id).
          // On a rejoin the player may still be in local state — don't duplicate.
          if (!stateRef.current?.players?.some((p: Player) => p.id === myPlayer.id)) {
            localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
          }
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
          // 🔥 RESUME: stop the reconnect loop — the host refused us on purpose.
          reconnectingRef.current = false;
          const st = guestReconnectStateRef.current;
          if (st.timer) { clearTimeout(st.timer); st.timer = null; }
          st.active = false;
          updateP2PLoadingStep('handshake', 'error', 'The host has locked new connections');
          alert("The host has locked new connections. Please contact the host to join.");
          setConnectionStatus('disconnected');
          setWaitingForPlayerName(null);
          return;
        }
        handleNetworkData(data, conn);
      });

      // 🔥 RESUME: transport loss ≠ session loss. Close/error now destroys the
      // dead peer and starts the reconnect loop instead of killing the session.
      const handleHostConnectionLost = (reason: string) => {
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
        }
        connectionCompleted = true;

        logger.warn(`[P2P][PeerJS] Host connection lost (${reason})`);
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        // Null the dead peer out of the singleton so a reconnect attempt
        // doesn't trip over it (HMR singleton persists across remounts).
        if (p2pSingleton.peer === peer) {
          p2pSingleton.peer = null;
          p2pSingleton.hostConnection = null;
          p2pSingleton.isInitialized = false;
        }
        if (sessionIntentionallyLeftRef.current) {
          // Page unload / explicit teardown — do not schedule reconnects.
          setConnectionStatus('disconnected');
          return;
        }
        if (kickedRef.current) {
          // 🔧 KICK: removed by the host — never auto-reconnect.
          setConnectionStatus('disconnected');
          return;
        }
        startGuestReconnectRef.current?.();
      };

      conn.on('close', () => {
        handleHostConnectionLost('closed');
      });

      conn.on('error', (err) => {
        logger.error('[P2P][PeerJS] Connection error to host:', err);
        handleHostConnectionLost('error');
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
        if (peer && !peer.destroyed && !isIntentionalDisconnectRef.current && !kickedRef.current) {
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
  }, [localDispatch, handleNetworkData, setConnectionStatus, setWaitingForPlayerName, updateP2PLoadingStep, resetP2PLoading, armRejoin, stateRef]);

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
      // 🔥 RESUME: reuse the session identity color if we already picked one
      const playerColor = pendingPlayerColorRef.current
        || '#' + Math.floor(Math.random() * 16777215).toString(16);
      pendingPlayerColorRef.current = playerColor;
      identityRef.current = { name: finalName, color: playerColor };
      // 🔥 RESUME: remember for the next join's name prefill
      rememberGuestIdentity(finalName, playerColor);
      const myPlayer: Player = {
        id: persistentPlayerId,
        name: finalName,
        color: playerColor,
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

  // ============================================================================
  // 🔥 RESUME: GUEST RECONNECT LOOP — re-attach to the same host after a
  // transport loss (network blip, host refresh). Each attempt reuses the
  // persisted identity (nexus-player-id + name/color) and re-runs the normal
  // handshake; the host's HELO dedupe keeps a single Player entry.
  // ============================================================================

  const GUEST_RECONNECT_INTERVAL_MS = 5000;
  const GUEST_RECONNECT_MAX_ATTEMPTS = 12;
  const GUEST_RECONNECT_MAX_MS = 3 * 60 * 1000; // 3-minute total budget

  const startGuestReconnect = useCallback(() => {
    if (reconnectingRef.current) return;
    if (kickedRef.current) return; // 🔧 KICK: removed by the host — no rejoin
    const hostId = lastHostIdRef.current;
    const identity = identityRef.current;
    if (!hostId || !identity) {
      // Never fully joined — nothing to resume.
      setConnectionStatus('disconnected');
      return;
    }

    reconnectingRef.current = true;
    guestReconnectStateRef.current = { attempts: 0, timer: null, active: true, startTime: null };
    setConnectionStatus('reconnecting');
    logger.log('[P2P][PeerJS] Guest reconnect loop started for host', hostId);

    const attempt = async () => {
      const st = guestReconnectStateRef.current;
      if (!reconnectingRef.current) return; // re-established or stopped elsewhere

      st.attempts++;
      const elapsed = Date.now() - (st.startTime ?? (st.startTime = Date.now()));
      if (st.attempts > GUEST_RECONNECT_MAX_ATTEMPTS || elapsed > GUEST_RECONNECT_MAX_MS) {
        logger.error('[P2P][PeerJS] Guest reconnect gave up — host unreachable');
        reconnectingRef.current = false;
        st.active = false;
        st.timer = null;
        setConnectionStatus('disconnected');
        onReconnectFailedRef.current?.();
        return;
      }

      logger.log(`[P2P][PeerJS] Reconnect attempt ${st.attempts}/${GUEST_RECONNECT_MAX_ATTEMPTS}`);
      pendingPlayerNameRef.current = identity.name;
      pendingPlayerColorRef.current = identity.color;
      try {
        // Tear down any lingering peer from the previous attempt — its setup
        // timers may still be running while this attempt dials afresh.
        const oldPeer = peerRef.current;
        if (oldPeer && !oldPeer.destroyed) {
          try { oldPeer.destroy(); } catch { /* ignore */ }
        }
        if (p2pSingleton.peer === oldPeer) {
          p2pSingleton.peer = null;
          p2pSingleton.hostConnection = null;
          p2pSingleton.isInitialized = false;
        }
        peerRef.current = null;
        hostConnectionRef.current = null;
        await connectToHost(hostId, identity.name, { rejoin: true });
      } catch (e) {
        logger.error('[P2P][PeerJS] Reconnect attempt threw:', e);
      }

      // onSessionEstablished (SYNC_STATE applied) flips reconnectingRef to
      // false and restores 'connected' — only schedule the next attempt if
      // we're still reconnecting.
      if (reconnectingRef.current) {
        st.timer = setTimeout(attempt, GUEST_RECONNECT_INTERVAL_MS);
      }
    };

    attempt();
  }, [connectToHost]);
  startGuestReconnectRef.current = startGuestReconnect;

  /** Manual retry after the reconnect loop gave up (banner button). */
  const retryGuestConnection = useCallback(() => {
    guestReconnectStateRef.current = { attempts: 0, timer: null, active: false, startTime: null };
    reconnectingRef.current = false;
    startGuestReconnect();
  }, [startGuestReconnect]);

  // Initialize host peer on demand (when user clicks Invite button)
  // 🔥 RESUME: the host peer id persists (nexus-host-peer-id), so after a page
  // refresh the host re-creates the SAME identity — old invite links keep
  // working and guests can reconnect.
  // (explicit return type: the unavailable-id retry references initializeHost
  // recursively)
  const initializeHost: () => Promise<void> = useCallback(async () => {
    // 🔥 SINGLETON: Restore from singleton if available (HMR remount)
    if (p2pSingleton.peer && !p2pSingleton.peer.destroyed) {
      peerRef.current = p2pSingleton.peer;
      connectionsRef.current = p2pSingleton.connections;

      // Restore refs
      (window as any).__nexusPeer = peerRef.current;

      // Update state + descriptor (identity must survive a reload from here too)
      setPeerId(p2pSingleton.peer.id);
      setConnectionStatus('connected');
      writeHostDescriptor('peerjs', p2pSingleton.peer.id);

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

    // 🔥 RESUME: reuse the persisted host id so invite links survive reloads.
    // On 'unavailable-id' (e.g. the previous tab's registration hasn't expired
    // yet) retry the same id twice, then regenerate as a last resort.
    const requestedId = getHostInviteId('peerjs') ?? regenerateHostPeerId();
    let idRetryCount = 0;
    const createPeer = (id: string | null): Peer =>
      id ? new Peer(id, PEERJS_CONFIG) : new Peer(PEERJS_CONFIG);

    const peer = createPeer(requestedId);
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
      writeHostDescriptor('peerjs', id);
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

      // 🔥 RESUME: the persisted host id is still registered on the signaling
      // server (previous tab's registration not expired yet — normal right
      // after a refresh). Retry the SAME id; after two failed retries assume
      // the id is genuinely taken and regenerate.
      if (err?.type === 'unavailable-id') {
        idRetryCount++;
        const retrySameId = idRetryCount <= 2;
        const delay = idRetryCount === 1 ? 2000 : 5000;
        logger.warn(`[P2P][PeerJS] Host id unavailable — ${retrySameId ? `retrying same id in ${delay}ms` : 'regenerating id'} (attempt ${idRetryCount})`);
        if (!retrySameId) {
          regenerateHostPeerId();
        }
        // Tear down the errored peer so the recursive initializeHost creates
        // a fresh one with the (possibly regenerated) id.
        if (peerRef.current === peer) {
          peerRef.current = null;
        }
        if (p2pSingleton.peer === peer) {
          p2pSingleton.peer = null;
          p2pSingleton.isInitialized = false;
        }
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
        setTimeout(() => { initializeHost(); }, delay);
        return;
      }

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
      // 🔥 RESUME: page unload / explicit teardown — never schedule reconnects
      sessionIntentionallyLeftRef.current = true;
      reconnectingRef.current = false;
      const st = guestReconnectStateRef.current;
      if (st.timer) { clearTimeout(st.timer); st.timer = null; }
      st.active = false;

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

  // 🔥 RESUME: silent auto-rejoin entry point (no name modal). Reuses the
  // persisted identity and dials the host directly.
  const resumeGuest = useCallback((inviteId: string, identity: { name: string; color: string }) => {
    identityRef.current = identity;
    pendingPlayerNameRef.current = identity.name;
    pendingPlayerColorRef.current = identity.color;
    connectToHost(inviteId, identity.name, { rejoin: true });
  }, [connectToHost]);

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
    // 🔥 RESUME: reconnection surface
    resumeGuest,
    retryGuestConnection,
    onReconnectFailedRef,
    // 🔧 KICK: GameContext wires the removed-player modal through this
    onRemovedFromSessionRef,
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
