import { useEffect, useRef, useCallback, useState } from 'react';
import { Peer } from 'peerjs';
import { Action } from './gameActions';
import { Player } from '../types';
import { logger } from '../utils/logger';
import { filterLocalPanelProperties } from '../utils/panelSync';
import { filterObjectsForBroadcast } from '../utils/individualPositions';
import { getPlayerId } from './gameConstants';
import {
  differentialSyncManager,
  webrtcStatsMonitor,
  createOptimizedPeerJSConfig,
  CONNECTION_TIMEOUT,
  ICE_GATHERING_TIMEOUT
} from '../utils/webrtcOptimization';
import {
  compressWebRTCData,
  decompressWebRTCData,
  printCompressionReport,
  dataCompressionManager
} from '../utils/dataCompression';
import { joinRoom } from 'trystero';
import { getConnectionSettings, ConnectionMethod } from '../utils/localSettings';
import {
  ActionBatcher,
  PredictivePositionSender,
  getActionPriority
} from './p2p';
import {
  handleDirectSyncMessage,
  registerP2PConnections,
  DirectP2PMessage
} from '../utils/directP2PSync';

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
  // 🔥 NEW: Action batching for rapid updates
  actionBatcher: new ActionBatcher({
    batchWindow: 30, // 30ms batching window
    onFlush: (objectId, finalAction) => {
      // When batch is flushed, send the final action
      // This will be called automatically by ActionBatcher
    }
  }),
  // 🔥 NEW: Predictive position sender to reduce unnecessary updates
  positionSender: new PredictivePositionSender(),
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
  // 🔥 NEW: Clear action batcher
  p2pSingleton.actionBatcher.clear();
  p2pSingleton.positionSender.clearAll();
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
  isP2PLoadingModalOpen: boolean; // Whether the P2P loading modal is visible
  // 🔥 NEW: Pack download modal for guests
  requiredPacks: Array<{ name: string; hash: string; size: number }>;
  onPackLoaded: (packName: string, hashes: string[]) => void;
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
const countStunServers = (servers: any[]) => {
  let count = 0;
  for (const s of servers) {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    if (urls.some((u: string) => u.startsWith('stun:'))) count++;
  }
  return count;
};
const countTurnServers = (servers: any[]) => {
  let count = 0;
  for (const s of servers) {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    if (urls.some((u: string) => u.startsWith('turn:'))) count++;
  }
  return count;
};

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

/**
 * WebTorrent трекеры для Trystero - финальный fallback
 * Децентрализованный метод без центрального сервера
 */
const TORRENT_TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.fastcast.nz',
  'wss://tracker.files.fm:443/announce',
];

// ============================================================================
// FALLBACK CONNECTION HELPERS
// ============================================================================

/**
 * Результат попытки подключения
 */
interface ConnectionAttempt {
  success: boolean;
  method: string;
  peer?: Peer;
  connection?: any;
  room?: TrysteroRoom;
  error?: string;
}

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
  const serverName = `${serverConfig.host}:${serverConfig.port}`;
  console.log(`[tryPeerJSServer] 🔌 Attempting connection to ${serverName} (timeout: ${timeout}ms)`);

  return new Promise((resolve) => {
    const peerConfig = {
      debug: 0, // 🔥 Disable PeerJS debug logs to reduce console noise
      ...PEERJS_CONFIG,
      ...serverConfig,
    };

    const peer = new Peer(peerConfig);
    let resolved = false;

    // 🔥 OPTIMIZED: Handle abort signal to cancel remaining attempts
    const onAbort = () => {
      if (!resolved) {
        console.log(`[tryPeerJSServer] ❌ Aborted ${serverName}`);
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
        console.log(`[tryPeerJSServer] ⏰ Timeout connecting to ${serverName}`);
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

    peer.on('open', (id) => {
      if (!resolved) {
        console.log(`[tryPeerJSServer] ✅ Connected to ${serverName}, ID: ${id}`);
        resolved = true;
        clearTimeout(timeoutId);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        resolve({ peer });
      }
    });

    peer.on('error', (err) => {
      if (!resolved) {
        console.log(`[tryPeerJSServer] ❌ Error from ${serverName}:`, err?.type || err);
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
async function tryTrysteroTorrent(
  roomId: string,
  timeout: number = 20000
): Promise<TrysteroRoom | null> {
  return new Promise((resolve) => {
    try {
      const config = {
        appId: 'nexus-game-table',
        trackers: TORRENT_TRACKERS,
      };

      const room = joinRoom(config, roomId);

      // Trystero не имеет явного события подключения, но мы можем
      // проверить что room создан успешно
      setTimeout(() => {
        resolve(room);
      }, 1000);

      const timeoutId = setTimeout(() => {
        resolve(null);
      }, timeout);

    } catch (error) {
      resolve(null);
    }
  });
}

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

  const [isHost, setIsHost] = useState<boolean>(getInitialHostStatus());
  const [peerId, setPeerId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [waitingForPlayerName, setWaitingForPlayerName] = useState<WaitingForPlayerName | null>(null);

  // 🔥 NEW: P2P Loading Progress state
  const [p2pLoadingSteps, setP2pLoadingSteps] = useState<P2PLoadingStep[]>([
    { id: 'connect', message: 'Connecting to signaling server...', status: 'pending' },
    { id: 'p2p', message: 'Establishing P2P connection...', status: 'pending' },
    { id: 'handshake', message: 'Handshake with host...', status: 'pending' },
    { id: 'packs', message: 'Loading asset packs...', status: 'pending' },
    { id: 'state', message: 'Synchronizing game state...', status: 'pending' },
  ]);
  const [p2pLoadingProgress, setP2pLoadingProgress] = useState(0);
  const [isP2PLoadingModalOpen, setIsP2PLoadingModalOpen] = useState(false); // 🔥 NEW: Separate state for modal visibility

  // 🔥 NEW: Pack download modal state for guests
  const [requiredPacks, setRequiredPacks] = useState<Array<{ name: string; hash: string; size: number }>>([]);
  const loadedPacksRef = useRef<Set<string>>(new Set()); // Track which packs have been loaded
  const [suggestedPlayerName, setSuggestedPlayerName] = useState<string>(''); // 🔥 NEW: Suggested name for new guest

  // 🔥 NEW: Track if we received empty PACKS_NEEDED (for warning)
  const receivedEmptyPacksRef = useRef(false);

  // 🔥 NEW: Buffer SYNC_STATE until packs are loaded (fixes race condition)
  const bufferedStateRef = useRef<any>(null);
  const hasReceivedPacksNeededRef = useRef(false);
  const expectedPacksCountRef = useRef(0); // Track expected pack count (synchronous)


  // 🔥 SINGLETON: Use module-level refs that persist across remounts
  // Local refs are just aliases to the singleton values
  const peerRef = useRef<Peer | null>(p2pSingleton.peer);
  const connectionsRef = useRef<any[]>(p2pSingleton.connections);
  const hostConnectionRef = useRef<any>(p2pSingleton.hostConnection);
  const roomRef = useRef<TrysteroRoom | null>(p2pSingleton.room);
  const isIntentionalDisconnectRef = useRef(false); // Track intentional disconnect vs network error
  const guestReconnectStateRef = useRef({ attempts: 0, startTime: null as number | null }); // Guest reconnect state
  const hostReconnectStateRef = useRef({ attempts: 0, startTime: null as number | null }); // Host reconnect state
  const signallingDisconnectedRef = useRef(false); // Track if we intentionally disconnected from signalling (optimization)
  const expectedPlayerCountRef = useRef(0); // Track expected player count for signalling disconnect timing
  const signallingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Timer for signalling disconnect
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

  // 🔥 NEW: Helper functions for P2P loading progress
  const updateP2PLoadingStep = useCallback((stepId: string, status: P2PLoadingStep['status'], message?: string, progress?: number) => {
    setP2pLoadingSteps(prev => {
      const updated = prev.map(step => {
        if (step.id === stepId) {
          return {
            ...step,
            status,
            ...(message && { message }),
            ...(progress !== undefined && { progress })
          };
        }
        return step;
      });

      // Update overall progress based on completed steps
      // Step IDs in order: connect, p2p, handshake, packs, state
      const stepOrder = ['connect', 'p2p', 'handshake', 'packs', 'state'] as const;
      const stepIndex = stepOrder.indexOf(stepId as any);
      if (stepIndex !== -1) {
        const stepProgress = status === 'success' ? 100 : progress || 0;
        const stepWeight = 100 / stepOrder.length;
        const newProgress = Math.min(100, (stepIndex * stepWeight) + (stepProgress * stepWeight / 100));
        setP2pLoadingProgress(newProgress);
      }

      // 🔥 NEW: Open modal on first step loading
      // Note: Modal is no longer auto-closed - managed by GameContext
      if (stepId === 'connect' && status === 'loading') {
        setIsP2PLoadingModalOpen(true);
      }

      return updated;
    });
  }, []);

  const resetP2PLoading = useCallback(() => {
    setP2pLoadingSteps([
      { id: 'connect', message: 'Connecting to signaling server...', status: 'pending' },
      { id: 'p2p', message: 'Establishing P2P connection...', status: 'pending' },
      { id: 'handshake', message: 'Handshake with host...', status: 'pending' },
      { id: 'packs', message: 'Loading asset packs...', status: 'pending' },
      { id: 'state', message: 'Synchronizing game state...', status: 'pending' },
    ]);
    setP2pLoadingProgress(0);
    setIsP2PLoadingModalOpen(false);
    // 🔥 FIX: Reset refs for new connection
    loadedPacksRef.current.clear();
    bufferedStateRef.current = null;
    hasReceivedPacksNeededRef.current = false;
    expectedPacksCountRef.current = 0;
    receivedEmptyPacksRef.current = false;
    setRequiredPacks([]);
  }, []);

  // Signalling server timeout - disconnect after this time of inactivity
  const SIGNALLING_TIMEOUT_MS = 120000; // 2 minutes

  // Central Network Data Handler
  const handleNetworkData = useCallback((data: any, senderConn: any) => {
    // 🔥 NEW: Process PACKS_NEEDED BEFORE SYNC_STATE
    // This ensures guest knows which packs are needed before state sync
    if (data.type === 'PACKS_NEEDED') {
      // 🔥 NEW: Guest received pack list from host
      const { packs, nextPlayerNumber } = data.payload;

      // 🔥 NEW: Set suggested player name (Player X where X is the next player number)
      if (nextPlayerNumber !== undefined) {
        const suggestedName = `Player ${nextPlayerNumber}`;
        setSuggestedPlayerName(suggestedName);
      }

      // 🔥 NEW: Update handshake step and show modal for player name
      updateP2PLoadingStep('handshake', 'success', 'Connected to host!');
      updateP2PLoadingStep('packs', 'loading', `Waiting for ${packs.length} asset pack(s)...`);

      if (packs.length > 0) {
        // Set required packs and show modal
        setRequiredPacks(packs);
        expectedPacksCountRef.current = packs.length; // Track expected count
      } else {
        // No packs needed - mark as complete
        updateP2PLoadingStep('packs', 'success', 'No asset packs needed');
        // 🔥 NEW: Track that we received empty packs list
        receivedEmptyPacksRef.current = true;

        // 🔥 FIX: Apply buffered SYNC_STATE immediately if no packs needed
        if (bufferedStateRef.current) {
          updateP2PLoadingStep('state', 'loading', 'Synchronizing game state...');
          localDispatch({ type: 'SYNC_STATE', payload: bufferedStateRef.current });
          bufferedStateRef.current = null;
          updateP2PLoadingStep('state', 'success', 'Game synchronized!');
        }
      }

      // 🔥 NOTE: Modal is already opened when URL has hostId parameter
      // No need to set waitingForPlayerName here - it's already set in the useEffect

      // 🔥 NEW: Mark that we received PACKS_NEEDED (for SYNC_STATE buffering)
      hasReceivedPacksNeededRef.current = true;
    } else if (data.type === 'PACK_LOADED') {
      // 🔥 NEW: Host received notification that guest loaded a pack
      const { packName, hashes } = data.payload;
      const guestId = senderConn.peer;

      // Get guest info
      const guest = stateRef.current?.players.find(p => p.id === guestId);
      if (!guest) {
        return;
      }

      // Find pack info to get hash
      const packInfo = Object.values(stateRef.current?.usedPacks || {}).find(p => p.name === packName);
      if (!packInfo) {
        return;
      }

      // Update guest pack status
      const currentStatus = stateRef.current?.guestPackStatus?.[guestId];
      if (currentStatus) {
        localDispatch({
          type: 'UPDATE_GUEST_PACK_STATUS',
          payload: {
            guestId,
            packName,
            packHash: packInfo.hash,
            imageCount: hashes.length,
          }
        });
      } else {
        // Initialize guest status
        localDispatch({
          type: 'INITIALIZE_GUEST_PACK_STATUS',
          payload: {
            guestId,
            guestName: guest.name,
            connectedAt: Date.now(),
          }
        });
        // Then update with pack info
        setTimeout(() => {
          localDispatch({
            type: 'UPDATE_GUEST_PACK_STATUS',
            payload: {
              guestId,
              packName,
              packHash: packInfo.hash,
              imageCount: hashes.length,
            }
          });
        }, 50);
      }

    } else if (data.type === 'SYNC_STATE') {
      // Received full state update (Guest receives from Host)
      // Check if data is compressed
      const isCompressed = data.compressed === true;
      const payload = isCompressed
        ? decompressWebRTCData(data.payload, true)
        : data.payload;

      // 🔥 FIX: Buffer SYNC_STATE until packs are loaded (prevents race condition)
      // Check if we need to wait for pack loading
      const needsPacks = expectedPacksCountRef.current > 0 && loadedPacksRef.current.size < expectedPacksCountRef.current;
      const waitingForPacksNeeded = !hasReceivedPacksNeededRef.current;

      if (needsPacks || waitingForPacksNeeded) {
        bufferedStateRef.current = payload;
        updateP2PLoadingStep('state', 'loading', 'Waiting for asset packs...');
        return; // Don't dispatch yet
      }

      // 🔥 NEW: Update progress - state synchronized
      updateP2PLoadingStep('state', 'loading', 'Synchronizing game state...');

      localDispatch({ type: 'SYNC_STATE', payload });

      // 🔥 NEW: Mark state as complete immediately
      // Images will be loaded from packs by the guest
      updateP2PLoadingStep('state', 'success', 'Game synchronized!');

      // 🔥 NEW: Check if game likely needs asset packs but host didn't register any
      // Show warning if: 1) we received empty PACKS_NEEDED, 2) game has objects with images
      if (receivedEmptyPacksRef.current && payload.usedPacks && Object.keys(payload.usedPacks).length === 0) {
        // Check if any objects have image content (sha256: hashes or URLs)
        const objectsHaveImages = Object.values(payload.objects || {}).some((obj: any) => {
          // Check for various image content fields
          return !!(obj.content && (
            obj.content.startsWith('sha256:') ||
            obj.content.startsWith('http://') ||
            obj.content.startsWith('https://') ||
            obj.content.startsWith('data:image/')
          ));
        });

        if (objectsHaveImages) {
          // Show warning after a short delay
          setTimeout(() => {
            setShowMissingAssetWarning(true);
          }, 1000);
        }
      }
    } else if (data.type === 'PLAYER_PANEL_SETTINGS') {
      // Guest received their individual panel settings from host
      const { playerId, settings } = data.payload;

      // Apply individual panel settings using special action
      localDispatch({
        type: 'APPLY_PLAYER_PANEL_SETTINGS',
        payload: { settings }
      });
    } else if (data.type === 'POSITION_UPDATE') {
      // Lightweight position update for smooth dragging (batched)
      // 🔥 EXTENDED: Now includes effect template properties (rotation, width, height, pivot, etc.) for smoother effect sync
      const positions = data.payload;

      // Update each object's position (skipNetworkSync prevents re-broadcasting)
      positions.forEach((pos: {
        id: string;
        x?: number;
        y?: number;
        rotation?: number;
        width?: number;
        height?: number;
        pivot?: { x: number; y: number };
        rotationMarkerDistance?: number;
        zIndex?: number;
      }) => {
        const existingObj = stateRef.current.objects[pos.id];
        if (existingObj) {
          localDispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: pos.id,
              ...pos,
              skipNetworkSync: true // Prevent re-broadcasting to host
            }
          });
        }
      });
    } else if (data.type === 'HELO') {
      // Host received new player info
      const newPlayer = data.payload;
      localDispatch({ type: 'ADD_PLAYER', payload: newPlayer });

      // 🔥 CRITICAL FIX: Wait for state to update before sending SYNC_STATE
      // localDispatch is async, so we need to wait for the next tick to get updated state
      setTimeout(() => {
        const stateToSend = { ...stateRef.current };

        // 🔥 FIX: Verify that new player is in the state before sending
        const playerExists = stateToSend.players?.some((p: any) => p.id === newPlayer.id);
        if (!playerExists) {
          // Retry after another tick
          setTimeout(() => {
            const retryState = { ...stateRef.current };
            senderConn.send({ type: 'SYNC_STATE', payload: retryState });
          }, 50);
        } else {
          senderConn.send({ type: 'SYNC_STATE', payload: stateToSend });
        }
      }, 0);

      // Send player's individual panel settings back to them
      const playerPanelSettings = stateRef.current.playerPanelSettings[newPlayer.id] || {};
      if (Object.keys(playerPanelSettings).length > 0) {
        senderConn.send({ type: 'PLAYER_PANEL_SETTINGS', payload: { playerId: newPlayer.id, settings: playerPanelSettings } });
      }
    } else if (data.type === 'UPDATE_PLAYER_NAME') {
      // Host received player name update request
      localDispatch(data.payload);
    } else if (data.type === 'ACTION') {
      // Host received action request from Guest
      const actionType = data.payload?.type;

      // Filter out local-only actions that should not affect host state
      // These actions are screen-specific and should not be synced
      const localOnlyActions = [
        'UPDATE_VIEW_TRANSFORM',  // View transform is screen-specific
        'SET_PIXELS_PER_VU',      // Pixels per VU is screen-specific
        'RESIZE_UI_OBJECT'        // Panel/window size is local (handled by UPDATE_PLAYER_PANEL_SETTINGS)
      ];

      // NOTE: MOVE_OBJECT_COMMIT is NOT in localOnlyActions because it needs to reach the host
      // for panel position tracking. The GameContext reducer handles it correctly:
      // - For panels/windows: saves to playerPanelSettings (individual per player)
      // - For other objects: updates global position

      if (localOnlyActions.includes(actionType)) {
        // Ignoring local-only action
      } else if (actionType === 'UPDATE_PLAYER_PANEL_SETTINGS') {
        // Host received update to player panel settings from guest
        localDispatch(data.payload);
      } else {
        localDispatch(data.payload);
      }
    } else if (data.type === 'DIRECT_SYNC') {
      // 🔥 NEW: Direct P2P sync for sliders and character blocks
      // This bypasses the host for faster updates
      const directSyncMessage = data as DirectP2PMessage;

      // Handle the direct sync message
      const action = handleDirectSyncMessage(
        directSyncMessage,
        stateRef.current?.objects || {},
        stateRef.current?.activePlayerId || ''
      );

      if (action) {
        // Dispatch the action to update local state
        localDispatch(action);

        // If we're host, relay the direct sync to other guests
        if (isHost) {
          connectionsRef.current.forEach((conn: any) => {
            if (conn.open && conn.peer !== senderConn.peer) {
              try {
                conn.send(data);
              } catch (e) {
                console.error('[P2P Host] Failed to relay DIRECT_SYNC:', e);
              }
            }
          });
        }
      }
    }
  }, [localDispatch, updateP2PLoadingStep, isHost]);

  // ============================================================================
  // SIGNALLING SERVER OPTIMIZATION
  // ============================================================================

  /**
   * Disconnect from signalling server after P2P connections are established
   * This reduces server load while keeping P2P connections alive
   */
  const disconnectFromSignalling = useCallback((reason: string) => {
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
        console.log(`[P2P Signalling] ✅ Disconnected from signalling - P2P connections remain active`);
      } catch (e) {
        console.error(`[P2P Signalling] Error disconnecting from signalling:`, e);
      }
    }

    // Also disconnect Trystero room if active
    const room = roomRef.current;
    if (room) {
      try {
        room.leave();
        roomRef.current = null;
      } catch (e) {
        console.error(`[Trystero] Error leaving room:`, e);
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
  const reconnectToSignalling = useCallback((reason: string): Promise<void> => {
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
        console.error(`[P2P Signalling] ❌ Failed to reconnect to signalling:`, err);
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
    console.log(`[P2P Guest] 🔵 Starting connection to host: ${hostId}, player: ${playerName}`);

    // 🔥 NEW: Reset and start loading progress
    resetP2PLoading();
    updateP2PLoadingStep('connect', 'loading', 'Connecting to signaling server...');
    console.log(`[P2P Guest] ⏳ Step 1/5: Connecting to signaling...`);

    // ============================================================================
    // NO FALLBACK - Use only the selected connection method
    // ============================================================================

    // Get connection method from parameter or settings
    const method = connectionMethod || getConnectionSettings().connectionMethod || 'peerjs';
    console.log(`[P2P Guest] 🔧 Using connection method: ${method}`);

    const communityServers = getCommunityServers();
    const PARALLEL_TIMEOUT = 8000;

    // Try connection based on selected method only
    if (method === 'trystero') {
      // Use Trystero BitTorrent P2P only
      updateP2PLoadingStep('connect', 'loading', 'Connecting via BitTorrent trackers...');
      setConnectionStatus('connecting');

      const trysteroRoom = await tryTrysteroTorrent(hostId, 20000);
      if (trysteroRoom) {
        roomRef.current = trysteroRoom;

        trysteroRoom.onData((data: any, peerId: string) => {
          const trysteroConn = { send: (msg: any) => trysteroRoom.send(msg) };
          handleNetworkData(data, trysteroConn);
        });

        const persistentPlayerId = getPlayerId();
        const myPlayer: Player = {
          id: persistentPlayerId,
          name: playerName.trim() || `Player ${Math.floor(Math.random() * 100)}`,
          color: '#' + Math.floor(Math.random() * 16777215).toString(16),
          isGM: false
        };

        trysteroRoom.send({ type: 'HELO', payload: myPlayer });

        setConnectionStatus('connected');
        updateP2PLoadingStep('connect', 'success', 'Connected via BitTorrent!');
        localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
        localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

        return;
      }

      // Trystero failed
      console.error(`[P2P Guest] ❌ Trystero connection failed`);
      alert("Failed to connect via BitTorrent trackers. Check your network settings.");
      setConnectionStatus('disconnected');
      setWaitingForPlayerName(null);
      return;
    }

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
      console.log(`[P2P Guest] 🔌 Trying ${server.name}...`);
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
    console.error(`[P2P Guest] ❌ All servers failed for method: ${method}`);
    alert(`Failed to connect using ${method.toUpperCase()}. Please check your network settings or try a different connection method.`);
    setConnectionStatus('disconnected');
    setWaitingForPlayerName(null);

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    /**
     * Настроить PeerJS соединение после успешного подключения
     */
    function setupPeerConnection(peer: Peer, hostId: string, playerName: string) {
      console.log(`[P2P Guest] ⏳ Step 2/5: Setting up P2P connection to ${hostId}...`);
      peerRef.current = peer;
      (window as any).__nexusPeer = peer;
      syncSingleton(); // Sync to singleton after peer is set

      // 🔥 NEW: Update progress - establishing P2P connection
      updateP2PLoadingStep('p2p', 'loading', 'Establishing P2P connection...');
      console.log(`[P2P Guest] ⏳ Step 3/5: Calling peer.connect(${hostId})...`);

      const conn = peer.connect(hostId);
      hostConnectionRef.current = conn;
      (window as any).__nexusHostConnection = conn;
      syncSingleton(); // Sync to singleton after connection is set

      console.log(`[P2P Guest] ⏳ Waiting for connection.open event...`);

      // 🔥 NEW: Retry connection if it doesn't open (signaling may be delayed)
      let retryCount = 0;
      const maxRetries = 3;
      const retryInterval = 3000; // 3 seconds

      const retryConnection = () => {
        if (connectionCompleted || retryCount >= maxRetries) {
          return;
        }

        retryCount++;
        console.log(`[P2P Guest] 🔄 Retry ${retryCount}/${maxRetries} - Reconnecting to ${hostId}...`);

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
            console.log(`[P2P Guest] 🎉 Connection to host SUCCESSFUL! (retry ${retryCount})`);
            setConnectionStatus('connected');
            syncSingleton();
            updateP2PLoadingStep('p2p', 'success', 'P2P connection established');
            updateP2PLoadingStep('handshake', 'loading', 'Waiting for host info...');
          });

          newConn.on('error', (err) => {
            console.error(`[P2P Guest] ❌ Retry ${retryCount} failed:`, err);
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
          console.error(`[P2P Guest] ❌ Connection TIMEOUT after ${CONNECTION_TIMEOUT}ms`);
          console.error(`[P2P Guest] 📊 Diagnostics:`, {
            peerId: peer.id,
            hostId,
            connectionState: (conn as any)._pc?.signalingState,
            iceState: (conn as any)._pc?.iceConnectionState,
            iceGatheringState: (conn as any)._pc?.iceGatheringState,
          });
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

        console.log(`[P2P Guest] 🎉 Connection to host SUCCESSFUL!`);
        setConnectionStatus('connected');
        syncSingleton(); // Sync to singleton after connection is open

        // 🔥 NEW: Update progress - P2P connection established
        updateP2PLoadingStep('p2p', 'success', 'P2P connection established');
        updateP2PLoadingStep('handshake', 'loading', 'Waiting for host info...');

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

          console.log(`[P2P Guest] 📤 Sending HELO with player: ${myPlayer.name} (${myPlayer.id})`);

          // Add ourselves locally
          localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
          localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

          // Send HELO to host
          conn.send({ type: 'HELO', payload: myPlayer });

          // Clear pending name
          pendingPlayerNameRef.current = null;

          // Update progress
          updateP2PLoadingStep('handshake', 'success', 'Handshake complete!');
        }
      });

      conn.on('data', (data: any) => {
        if (data.type === 'CONNECTION_LOCKED') {
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

        console.error(`[P2P Guest] ❌ Connection ERROR:`, err);
        logger.error("Connection error to host:", err);
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
          console.log(`[P2P Guest] 🔍 RTCPeerConnection found! Current state:`, {
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            signalingState: pc.signalingState,
          });

          pc.addEventListener('iceconnectionstatechange', () => {
            const state = pc.iceConnectionState;
            console.log(`[P2P Guest] 🧊 ICE Connection State: ${state}`);

            if (state === 'failed' || state === 'disconnected') {
              console.error(`[P2P Guest] ❌ ICE connection ${state} - NAT traversal failed`);
              console.error(`[P2P Guest] 💡 Try: Both devices on same network, or check firewall`);
              updateP2PLoadingStep('p2p', 'error', `ICE ${state} - NAT blocked`);
            } else if (state === 'connected') {
              console.log(`[P2P Guest] ✅ ICE connected - direct connection established!`);
            } else if (state === 'checking') {
              console.log(`[P2P Guest] 🔍 ICE checking - trying to reach host...`);
            }
          });

          pc.addEventListener('icegatheringstatechange', () => {
            console.log(`[P2P Guest] 🧊 ICE Gathering State: ${pc.iceGatheringState}`);
          });

          pc.addEventListener('signalingstatechange', () => {
            console.log(`[P2P Guest] 📡 Signaling State: ${pc.signalingState}`);
          });
        } else {
          console.log(`[P2P Guest] ⏳ RTCPeerConnection not ready yet, will retry...`);
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
        console.error(`[P2P Guest] ❌ PeerJS ERROR:`, err);

        // 🔥 FIX: Handle all network-related errors, not just 'network' type
        const isNetworkError = err?.type === 'network' ||
          err?.type === 'socket-error' ||
          err?.type === 'socket-closed' ||
          err?.type === 'server-error' ||
          (err?.message && err.message.includes('Lost connection to server'));

        if (isNetworkError && peer && !peer.destroyed && !isIntentionalDisconnectRef.current) {
          console.log(`[P2P Guest] 🔄 Network error detected, attempting reconnect...`);
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
      pendingPlayerNameRef.current = null; // Clear after sending

      // 🔥 NEW: Update progress - handshake complete
      updateP2PLoadingStep('handshake', 'success', 'Handshake complete!');
    } else {
      // Fallback: not connected yet, connect first (HELO will be sent in conn.on('open'))
      connectToHost(hostId, finalName);
    }
  }, [waitingForPlayerName, connectToHost, suggestedPlayerName, localDispatch, updateP2PLoadingStep]);

  // Initialize host peer on demand (when user clicks Invite button)
  const initializeHost = useCallback(async () => {
    console.log(`[P2P Host] 🎮 initializeHost called`);
    // 🔥 SINGLETON: Restore from singleton if available (HMR remount)
    if (p2pSingleton.peer && !p2pSingleton.peer.destroyed) {
      console.log(`[P2P Host] ♻️ Restoring from singleton`);
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
      console.log(`[P2P Host] 🔄 Attempting to reconnect disconnected peer`);
      try {
        await reconnectToSignalling('New player needs to join');
        console.log(`[P2P Host] ✅ Reconnected to signalling - ready for new players`);
        // Reset timer to allow time for new players to connect
        resetSignallingTimer();
        syncSingleton(); // Sync to singleton
        return;
      } catch (e) {
        console.error(`[P2P Host] ❌ Failed to reconnect to signalling:`, e);
        // Fall through to create new peer
      }
    }

    // Already initialized or initializing
    if (peerRef.current) {
      console.log(`[P2P Host] ⚠️ Peer already exists, skipping initialization`);
      return;
    }

    console.log(`[P2P Host] 🔨 Creating new Peer...`);
    const peer = new Peer(PEERJS_CONFIG);
    peerRef.current = peer;
    // Store for diagnostic access
    (window as any).__nexusPeer = peer;
    syncSingleton(); // Sync to singleton after creating peer

    peer.on('open', async (id) => {
      console.log(`[P2P Host] ✅ Peer.open event fired, ID: ${id}`);
      // Check if this is a reconnect (peerId was already set)
      const isReconnect = peerRef.current?.id === id;
      if (isReconnect) {
        // Reset reconnect state on successful reconnect
        hostReconnectStateRef.current = { attempts: 0, startTime: null };
        signallingDisconnectedRef.current = false; // Reset signalling disconnect flag
      } else {
        console.log(`[P2P Host] ✅ Host ID assigned: ${id}`);
      }

      setPeerId(id);
      setConnectionStatus('connected');
      syncSingleton(); // Sync to singleton after peer is open
    });

    // Handle incoming connections (If we are Host)
    peer.on('connection', (conn) => {
      const guestPeerId = conn.peer;
      console.log(`[P2P Host] 📨 Incoming connection from: ${guestPeerId}`);
      console.log(`[P2P Host] 📊 Current peer state:`, {
        disconnected: peer.disconnected,
        destroyed: peer.destroyed,
        connectionsCount: connectionsRef.current.length
      });

      // 🔥 NEW: Monitor ICE state for incoming connections
      const checkHostIceState = () => {
        const pc = (conn as any)._pc;
        if (pc) {
          console.log(`[P2P Host] 🔍 RTCPeerConnection found for guest ${guestPeerId}:`, {
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            signalingState: pc.signalingState,
          });

          pc.addEventListener('iceconnectionstatechange', () => {
            const state = pc.iceConnectionState;
            console.log(`[P2P Host] 🧊 ICE Connection State for ${guestPeerId}: ${state}`);

            if (state === 'failed' || state === 'disconnected') {
              console.error(`[P2P Host] ❌ ICE connection ${state} - guest connection failed`);
            } else if (state === 'connected') {
              console.log(`[P2P Host] ✅ ICE connected - direct connection to ${guestPeerId}!`);
            }
          });
        } else {
          console.log(`[P2P Host] ⏳ RTCPeerConnection not ready for guest ${guestPeerId}`);
        }
      };

      checkHostIceState();
      setTimeout(() => checkHostIceState(), 1000);
      setTimeout(() => checkHostIceState(), 3000);

      conn.on('open', () => {
        console.log(`[P2P Host] 🎉 Connection opened for guest: ${guestPeerId}`);

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

        // IMPORTANT: Wait for data channel to be fully ready before sending data
        // This fixes the issue where guest doesn't receive messages
        setTimeout(() => {
          if (!conn.open) {
            return;
          }

          // 🔥 NEW: Send PACKS_NEEDED (simplified asset sync)
          const usedPacks = stateRef.current?.usedPacks || {};
          const packList = Object.values(usedPacks);

          // 🔥 NEW: Calculate next player number (count non-GM players + 1)
          const players = stateRef.current?.players || [];
          const nonGMCount = players.filter(p => !p.isGM).length;
          const nextPlayerNumber = nonGMCount + 1;

          if (packList.length > 0) {
            conn.send({
              type: 'PACKS_NEEDED',
              payload: {
                packs: packList.map(p => ({
                  name: p.name,
                  hash: p.hash,
                  size: p.size
                })),
                nextPlayerNumber
              }
            });
          } else {
            conn.send({
              type: 'PACKS_NEEDED',
              payload: {
                packs: [],
                nextPlayerNumber
              }
            });
          }

          // Filter out local panel properties and individual objects before syncing
          const stateToSend = { ...stateRef.current };
          if (stateToSend.objects) {
            let filteredObjects = filterLocalPanelProperties(stateToSend.objects);
	            // Also filter out individual objects (on layers with individualObjects enabled)
	            filteredObjects = filterObjectsForBroadcast(filteredObjects, stateToSend.hyperscaleLayers);
	            stateToSend.objects = filteredObjects;
          }

          // Send state (now contains only hashes, not base64)
          conn.send({ type: 'SYNC_STATE', payload: stateToSend });

          // Store reference to connection for sending player panel settings later
          (conn as any).pendingPlayerId = null; // Will be set when HELO is received
        }, 50); // 50ms delay to ensure data channel is fully ready

        // Handle Disconnection
        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          syncSingleton(); // Sync to singleton after connection removed
          localDispatch({ type: 'REMOVE_PLAYER', payload: { id: conn.peer } });
        });

        conn.on('error', (err) => {
          console.error(`[P2P Host] ❌ Connection error with guest ${guestPeerId}:`, err);
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          syncSingleton(); // Sync to singleton after connection removed
          localDispatch({ type: 'REMOVE_PLAYER', payload: { id: conn.peer } });
        });

        // Monitor ICE state for this connection
        const originalEmit = conn.emit;
        conn.emit = function(...args: any[]) {
          if (args[0] === 'iceStateChange') {
            const state = args[1] as string;
            if (state === 'failed' || state === 'disconnected') {
              console.warn(`[P2P Host] ⚠️ ICE connection ${state} for guest ${guestPeerId} - may indicate NAT/Firewall issues`);
            }
          }
          return originalEmit.apply(this, args as any);
        };

        // Connection timeout
        setTimeout(() => {
          if (!conn.open) {
            console.warn(`[P2P Host] ⏰ Connection timeout for guest ${guestPeerId}`);
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
        console.error(`[P2P Host] ❌ Reconnect timeout after ${elapsed}ms - giving up`);
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
            console.error(`[P2P Host] ❌ Reconnect failed:`, e);
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
      console.error(`[P2P Host] ❌ PeerJS ERROR:`, err);
      logger.error('Peer error:', err);

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
        console.log(`[P2P Host] 🔄 Network error detected, attempting reconnect...`);
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
      console.log('[usePeerConnection] Skipping - ticket present but connection method is:', connectionMethod);
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
            console.log('[usePeerConnection] Parsed simple ticket format, got peerId:', parsedPeerId);
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
                console.log('[usePeerConnection] Parsed Iroh ticket, got peerId:', parsedPeerId);
              } else if (parsed?.nodeId?.relayUrl === 'peerjs') {
                parsedPeerId = parsed.nodeId.publicKey;
                console.log('[usePeerConnection] Parsed relay ticket, got peerId:', parsedPeerId);
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
        console.error('[usePeerConnection] Invalid ticket format');
        alert('Invalid invite link. Please check the link and try again.');
      } catch (e) {
        console.error('[usePeerConnection] Error parsing ticket:', e);
        alert('Invalid invite link. Please check the link and try again.');
      }
      return;
    }

    // If we have a hostId in URL, show modal FIRST for player name
    if (hostIdentifier) {
      console.log('[usePeerConnection] Guest mode detected', {
        hostId: hostIdentifier,
        waitingForPlayerName,
        willSetWaiting: !waitingForPlayerName
      });

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
        console.log('[usePeerConnection] Setting waitingForPlayerName');
        setWaitingForPlayerName({ hostId: hostIdentifier });
      } else {
        console.log('[usePeerConnection] Skipping setWaitingForPlayerName - already set');
      }
      return;
    }

    // No hostId/ticket = host mode - peer will be initialized when user clicks Invite
    console.log('[usePeerConnection] Host mode - no hostId/ticket in URL');
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
            console.error(`[P2P Cleanup] Error closing connection:`, e);
          }
        });
        connectionsRef.current = [];
      }

      // Close guest connection to host
      if (hostConnectionRef.current) {
        try {
          hostConnectionRef.current.close();
        } catch (e) {
          console.error(`[P2P Cleanup] Error closing host connection:`, e);
        }
        hostConnectionRef.current = null;
      }

      // Destroy peer connection to signalling server
      if (peerRef.current && !peerRef.current.destroyed) {
        try {
          peerRef.current.destroy();
        } catch (e) {
          console.error(`[P2P Cleanup] Error destroying peer:`, e);
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

      // 🔥 FIX: Apply buffered SYNC_STATE after all packs are loaded
      if (bufferedStateRef.current) {
        updateP2PLoadingStep('state', 'loading', 'Synchronizing game state...');

        localDispatch({ type: 'SYNC_STATE', payload: bufferedStateRef.current });

        bufferedStateRef.current = null; // Clear buffer
        updateP2PLoadingStep('state', 'success', 'Game synchronized!');
      }
    }
  }, [updateP2PLoadingStep]);

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
    // Expose signalling control functions for manual management
    disconnectFromSignalling,
    reconnectToSignalling,
    resetSignallingTimer,
    // 🔥 NEW: P2P Loading Progress
    p2pLoadingSteps,
    p2pLoadingProgress,
    isP2PLoadingModalOpen,
    // 🔥 NEW: Pack download for guests
    requiredPacks,
    onPackLoaded,
    // 🔥 NEW: Suggested player name for guests
    suggestedPlayerName,
  };
}

// Expose diagnostic function to global scope for debugging
if (typeof window !== 'undefined') {
  (window as any).nexusP2PDebug = {
    ...((window as any).nexusP2PDebug || {}),
    getCompressionStats: () => {
      const stats = dataCompressionManager.getStats();
      console.log('[P2P Compression] 📊 Compression Statistics:');
      console.log(`[P2P Compression] 📦 Operations: ${stats.entries}`);
      console.log(`[P2P Compression] 📏 Original: ${(stats.totalOriginalSize / 1024).toFixed(2)} KB`);
      console.log(`[P2P Compression] 🗜️ Compressed: ${(stats.totalCompressedSize / 1024).toFixed(2)} KB`);
      console.log(`[P2P Compression] 💾 Saved: ${((1 - stats.averageCompressionRatio) * 100).toFixed(1)}%`);
      console.log(`[P2P Compression] ⚡ Avg Time: ${(stats.totalCompressionTime / stats.entries).toFixed(2)}ms`);
      return stats;
    },
    printCompressionReport: () => {
      printCompressionReport();
    },
    setCompressionEnabled: (enabled: boolean) => {
      dataCompressionManager.setEnabled(enabled);
      console.log(`[P2P Compression] Compression ${enabled ? 'ENABLED' : 'DISABLED'}`);
    },
    getDiagnostics: () => {
      const peer = (window as any).__nexusPeer;
      const conn = (window as any).__nexusHostConnection;

      console.log(`[P2P Diagnostic] ════════════════════════════════════════════`);
      console.log(`[P2P Diagnostic] 📊 NEXUS GAME TABLE P2P DIAGNOSTIC REPORT`);
      console.log(`[P2P Diagnostic] ════════════════════════════════════════════`);
      console.log(`[P2P Diagnostic] 🌐 Browser Info:`, {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
      });
      console.log(`[P2P Diagnostic] 🔍 WebRTC Support:`, {
        RTCPeerConnection: !!(window as any).RTCPeerConnection,
        RTCDataChannel: !!(window as any).RTCDataChannel,
        getUserMedia: !!(navigator.mediaDevices?.getUserMedia),
      });
      console.log(`[P2P Diagnostic] 📡 PeerJS Status:`, peer ? {
        id: peer.id,
        destroyed: peer.destroyed,
        disconnected: peer.disconnected,
        connections: Object.keys(peer.connections || {}).length,
        signallingOptimized: peer.disconnected ? 'Yes - disconnected from signalling (P2P active)' : 'No - still connected to signalling',
      } : 'Not initialized');
      console.log(`[P2P Diagnostic] 🔗 Host Connection:`, conn ? {
        open: conn.open,
        peer: conn.peer,
        label: conn.label,
        dataChannel: conn.dataChannel ? 'exists' : 'none',
      } : 'Not connected (guest only)');
      console.log(`[P2P Diagnostic] 📍 Current URL:`, window.location.href);
      console.log(`[P2P Diagnostic] ════════════════════════════════════════════`);
      console.log(`[P2P Diagnostic] 💡 TIP: If connection fails, check:`);
      console.log(`[P2P Diagnostic]    1. Both users have different public IPs`);
      console.log(`[P2P Diagnostic]    2. Firewall allows WebRTC (UDP ports)`);
      console.log(`[P2P Diagnostic]    3. Not behind symmetric NAT`);
      console.log(`[P2P Diagnostic]    4. Browser supports WebRTC`);
      console.log(`[P2P Diagnostic] ════════════════════════════════════════════`);

      return {
        peer: peer,
        connection: conn,
        webrtcSupported: !!(window as any).RTCPeerConnection,
      };
    },
    testConnection: async (hostId: string) => {
      console.log(`[P2P Diagnostic] 🧪 Testing connection to host: ${hostId}`);
      const testPeer = new Peer(PEERJS_CONFIG);
      return new Promise((resolve) => {
        testPeer.on('open', (id: string) => {
          console.log(`[P2P Diagnostic] ✅ Test peer ID: ${id}`);
          const testConn = testPeer.connect(hostId);

          let resolved = false;
          testConn.on('open', () => {
            if (!resolved) {
              resolved = true;
              console.log(`[P2P Diagnostic] 🎉 Test connection SUCCESS!`);
              testConn.close();
              testPeer.destroy();
              resolve({ success: true });
            }
          });

          testConn.on('error', (err: any) => {
            if (!resolved) {
              resolved = true;
              console.error(`[P2P Diagnostic] ❌ Test connection FAILED:`, err);
              testPeer.destroy();
              resolve({ success: false, error: err });
            }
          });

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              console.warn(`[P2P Diagnostic] ⏰ Test connection TIMEOUT (10s)`);
              testConn.close();
              testPeer.destroy();
              resolve({ success: false, error: 'timeout' });
            }
          }, 10000);
        });

        testPeer.on('error', (err: any) => {
          console.error(`[P2P Diagnostic] ❌ Test peer error:`, err);
          resolve({ success: false, error: err });
        });
      });
    },
    // 🔥 NEW: Check current usedPacks state
    checkUsedPacks: () => {
      const state = (window as any).__gameState;
      if (!state) {
        console.error('[P2P Debug] Game state not found. Make sure game is loaded.');
        return;
      }
      const usedPacks = state.usedPacks || {};
      const packCount = Object.keys(usedPacks).length;
      console.log('[P2P Debug] ════════════════════════════════════════════');
      console.log('[P2P Debug] 📦 USED PACKS STATUS');
      console.log('[P2P Debug] ════════════════════════════════════════════');
      console.log(`[P2P Debug] Pack count: ${packCount}`);
      if (packCount > 0) {
        console.log('[P2P Debug] Packs:');
        Object.entries(usedPacks).forEach(([name, info]: [string, any]) => {
          console.log(`[P2P Debug]   - ${name}:`);
          console.log(`[P2P Debug]     Hash: ${info.hash?.substring(0, 16)}...`);
          console.log(`[P2P Debug]     Size: ${(info.size / 1024 / 1024).toFixed(2)} MB`);
          console.log(`[P2P Debug]     Images: ${info.imageCount}`);
        });
      } else {
        console.warn('[P2P Debug] ⚠️ No packs registered!');
        console.warn('[P2P Debug] 💡 Load a pack via menu to register it for P2P sync');
      }
      console.log('[P2P Debug] ════════════════════════════════════════════');
      return usedPacks;
    }
  };
}
