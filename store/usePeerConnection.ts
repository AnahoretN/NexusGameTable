import { useEffect, useRef, useCallback, useState } from 'react';
import { Peer } from 'peerjs';
import { Action } from './gameActions';
import { Player } from '../types';
import { logger } from '../utils/logger';
import { filterLocalPanelProperties } from '../utils/panelSync';
import { getPlayerId } from './gameConstants';
// 🔥 NEW: CAS Asset System
import {
  assetTransferHost,
  assetTransferGuest,
  type HostTransferConfig,
  type GuestTransferConfig,
  type TransferProgress
} from './p2p/assetTransfer';
import {
  AssetMessageFactory,
  AssetMessageType,
  type AssetManifestMessage
} from './p2p/protocol/assetMessages';
import {
  throttle,
  debounce,
  differentialSyncManager,
  webrtcStatsMonitor,
  measureSyncTime,
  createOptimizedPeerJSConfig,
  WEBRTC_OPTIMIZATION_CONFIG
} from '../utils/webrtcOptimization';
import {
  compressWebRTCData,
  decompressWebRTCData,
  printCompressionReport,
  dataCompressionManager
} from '../utils/dataCompression';
import { joinRoom } from 'trystero';
import { getConnectionSettings } from '../utils/localSettings';
// 🔥 NEW: P2P Optimizations
import {
  ActionBatcher,
  PredictivePositionSender,
  getActionPriority,
  defer,
  extractImagesIncremental,
  needsBoardContentExtraction
} from './p2p';

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
        resolved = true;
        try {
          peer.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
        console.log(`[Connect] 🚫 Aborted connection to ${serverConfig.host}`);
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
        console.log(`[Connect] ⏰ Timeout connecting to ${serverConfig.host}`);
        resolve(null);
      }
    }, timeout);

    peer.on('open', (id) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        console.log(`[Connect] ✅ Connected to ${serverConfig.host}, ID: ${id}`);
        resolve({ peer });
      }
    });

    peer.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        try {
          peer.destroy();
        } catch (e) {
          // Ignore destroy errors
        }
        // 🔥 Only log unexpected errors, not network/DNS failures during parallel attempts
        if (err?.type !== 'peer-unavailable' && err?.type !== 'network') {
          console.warn(`[Connect] ⚠️ Error connecting to ${serverConfig.host}:`, err?.type || err);
        } else {
          console.log(`[Connect] ❌ ${serverConfig.host} unavailable`);
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
        console.log(`[Connect] ✅ Trystero connected: ${roomId}`);
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

/**
 * Get local IP address using WebRTC
 * This detects the LAN IP address for local network connections
 */
async function getLocalIPAddress(): Promise<string | null> {
  if (typeof window === 'undefined' || !(window as any).RTCPeerConnection) {
    return null;
  }

  try {
    const rtc = new (window as any).RTCPeerConnection({ iceServers: [] });
    rtc.createDataChannel(''); // Create a bogus data channel

    // Create an offer to trigger ICE candidate gathering
    const offer = await rtc.createOffer();
    await rtc.setLocalDescription(offer);

    // Wait a bit for ICE candidates to be gathered
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check the local description for IP addresses
    const candidates = await new Promise<string>((resolve) => {
      setTimeout(() => {
        if (rtc.localDescription && rtc.localDescription.sdp) {
          resolve(rtc.localDescription.sdp);
        } else {
          resolve('');
        }
      }, 200);
    });

    rtc.close();

    // Parse SDP for IP addresses
    const ipRegex = /c=IN IP4 (\d+\.\d+\.\d+\.\d+)/g;
    const ips = new Set<string>();
    let match;

    while ((match = ipRegex.exec(candidates)) !== null) {
      const ip = match[1];
      // Filter out localhost and invalid IPs
      if (ip !== '127.0.0.1' && ip !== '0.0.0.0' && !ip.startsWith('169.254')) {
        ips.add(ip);
      }
    }

    // Return the first found IP (prefer non-192.168.x.x if available)
    const ipArray = Array.from(ips);
    const lanIp = ipArray.find(ip => !ip.startsWith('192.168.')) || ipArray[0] || null;

    return lanIp;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// 🔥 NEW: ASSET TRANSFER HANDLERS
// ============================================================================

/**
 * Handle asset manifest received from host (guest side)
 */
async function handleAssetManifest(manifest: any, connection: any): Promise<void> {
  try {
    const { findMissingHashes } = await import('../utils/assets');
    const { hashes } = manifest;

    // Find which assets we're missing
    const missingHashes = await findMissingHashes(hashes || []);

    if (missingHashes.length > 0) {
      console.log(`[Asset Transfer] Requesting ${missingHashes.length} missing assets`);
      connection.send({
        type: 'ASSET_REQUEST',
        payload: {
          sessionId: manifest.sessionId,
          hashes: missingHashes
        }
      });
    } else {
      console.log(`[Asset Transfer] All ${hashes?.length || 0} assets already cached`);
    }
  } catch (error) {
    console.error('[Asset Transfer] Failed to handle manifest:', error);
  }
}

/**
 * Handle asset request from guest (host side)
 */
async function handleAssetRequest(request: any, connection: any): Promise<void> {
  try {
    const { assetDB } = await import('../utils/assets');
    const { hashes } = request.payload;

    // Get manifest of all assets
    const manifest = await assetDB.getManifest();

    // Filter to only requested hashes
    const requestedAssets = manifest.assets.filter(a =>
      hashes.includes(a.hash)
    );

    console.log(`[Asset Transfer] Sending ${requestedAssets.length} assets to guest`);

    // Start streaming assets
    for (const asset of requestedAssets) {
      const entry = await assetDB.getAsset(asset.hash);
      if (entry && entry.blob) {
        const arrayBuffer = await entry.blob.arrayBuffer();

        connection.send({
          type: 'ASSET_CHUNK',
          payload: {
            hash: asset.hash,
            data: Array.from(new Uint8Array(arrayBuffer)),
            mimeType: asset.mimeType,
            size: asset.size
          }
        });
      }
    }

    // Send complete message
    connection.send({
      type: 'ASSET_COMPLETE',
      payload: {
        totalAssets: hashes.length,
        successfulAssets: requestedAssets.length,
        failedAssets: []
      }
    });

  } catch (error) {
    console.error('[Asset Transfer] Failed to handle request:', error);
  }
}

/**
 * Handle asset chunk received from host (guest side)
 */
async function handleAssetChunk(chunk: any): Promise<void> {
  try {
    const { assetDB } = await import('../utils/assets');
    const { hash, data, mimeType, size } = chunk;

    // Convert array back to ArrayBuffer
    const arrayBuffer = new Uint8Array(data).buffer;

    // Create blob
    const blob = new Blob([arrayBuffer], { type: mimeType });

    // Store in database
    await assetDB.putAsset(
      { hash, value: hash.replace('sha256:', ''), algorithm: 'SHA-256' },
      blob,
      mimeType,
      'transfer'
    );

    console.log(`[Asset Transfer] Received asset ${hash} (${size} bytes)`);
  } catch (error) {
    console.error('[Asset Transfer] Failed to handle chunk:', error);
  }
}

export function usePeerConnection(
  localDispatch: React.Dispatch<Action>,
  stateRef: React.RefObject<any>
): UsePeerConnectionReturn {
  // Determine immediately from URL if we're a guest or host
  // This must be done before any effects run to prevent race conditions
  const getInitialHostStatus = (): boolean => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    return !params.has('hostId'); // Guest if hostId exists, host otherwise
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
    { id: 'images', message: 'Receiving game assets...', status: 'pending' },
    { id: 'state', message: 'Synchronizing game state...', status: 'pending' },
  ]);
  const [p2pLoadingProgress, setP2pLoadingProgress] = useState(0);
  const [isP2PLoadingModalOpen, setIsP2PLoadingModalOpen] = useState(false); // 🔥 NEW: Separate state for modal visibility

  // Log initial role detection for debugging
  useEffect(() => {
    console.log(`[P2P Init] 🔍 Role determined from URL: isHost=${isHost}, URL=${window.location.href}`);
    console.log(`[P2P Init] 🔄 Singleton state: isInitialized=${p2pSingleton.isInitialized}, peerId=${p2pSingleton.peerId}`);
  }, [isHost]);

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

  // 🔥 SYNC: Sync singleton with refs after updates
  const syncSingleton = useCallback(() => {
    p2pSingleton.peer = peerRef.current;
    p2pSingleton.connections = connectionsRef.current;
    p2pSingleton.hostConnection = hostConnectionRef.current;
    p2pSingleton.room = roomRef.current;
    p2pSingleton.peerId = peerRef.current?.id || null;
    p2pSingleton.isInitialized = !!peerRef.current;
  }, []);

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
      // Step IDs in order: connect, p2p, handshake, images, state
      const stepOrder = ['connect', 'p2p', 'handshake', 'images', 'state'] as const;
      const stepIndex = stepOrder.indexOf(stepId as any);
      if (stepIndex !== -1) {
        const stepProgress = status === 'success' ? 100 : progress || 0;
        const stepWeight = 100 / stepOrder.length;
        const newProgress = Math.min(100, (stepIndex * stepWeight) + (stepProgress * stepWeight / 100));
        setP2pLoadingProgress(newProgress);
      }

      // 🔥 NEW: Open modal on first step loading, close on last step success
      if (stepId === 'connect' && status === 'loading') {
        setIsP2PLoadingModalOpen(true);
      }
      if (stepId === 'state' && status === 'success') {
        // Small delay to show 100% progress before closing
        setTimeout(() => setIsP2PLoadingModalOpen(false), 500);
      }

      return updated;
    });
  }, []);

  const resetP2PLoading = useCallback(() => {
    setP2pLoadingSteps([
      { id: 'connect', message: 'Connecting to signaling server...', status: 'pending' },
      { id: 'p2p', message: 'Establishing P2P connection...', status: 'pending' },
      { id: 'handshake', message: 'Handshake with host...', status: 'pending' },
      { id: 'images', message: 'Receiving game assets...', status: 'pending' },
      { id: 'state', message: 'Synchronizing game state...', status: 'pending' },
    ]);
    setP2pLoadingProgress(0);
    setIsP2PLoadingModalOpen(false);
  }, []);

  // Signalling server timeout - disconnect after this time of inactivity
  const SIGNALLING_TIMEOUT_MS = 120000; // 2 minutes

  // Central Network Data Handler
  const handleNetworkData = useCallback((data: any, senderConn: any) => {
    // Log ALL incoming messages for debugging
    console.log(`[P2P Network] 📨 Received message type: ${data.type}`);

    if (data.type === 'SYNC_STATE') {
      // Received full state update (Guest receives from Host)
      // Check if data is compressed
      const isCompressed = data.compressed === true;
      const payload = isCompressed
        ? decompressWebRTCData(data.payload, true)
        : data.payload;

      const payloadSize = isCompressed
        ? data.payload.length
        : JSON.stringify(payload).length;

      console.log(`[P2P Network] 📦 Received SYNC_STATE (${payloadSize} chars, compressed: ${isCompressed})`);
      console.log(`[P2P Network] 📊 State contains:`, {
        objects: Object.keys(payload.objects || {}).length,
        players: payload.players?.length || 0,
        diceRolls: payload.diceRolls?.length || 0
      });

      // 🔥 NEW: Update progress - state synchronized
      updateP2PLoadingStep('state', 'loading', 'Synchronizing game state...');

      localDispatch({ type: 'SYNC_STATE', payload });
      console.log(`[P2P Network] ✅ SYNC_STATE dispatched to game state`);

      // 🔥 NEW: All steps complete!
      updateP2PLoadingStep('state', 'success', 'Game synchronized!');
    } else if (data.type === 'PLAYER_PANEL_SETTINGS') {
      // Guest received their individual panel settings from host
      const { playerId, settings } = data.payload;
      console.log(`[P2P Network] 📥 Received PLAYER_PANEL_SETTINGS for ${playerId} (${Object.keys(settings).length} panels)`);
    } else if (data.type === 'ASSET_MANIFEST') {
      // 🔥 NEW: Guest received asset manifest from host
      console.log(`[P2P Network] 📋 Received ASSET_MANIFEST (${data.payload.assets?.length || 0} assets)`);
      handleAssetManifest(data.payload, conn);
    } else if (data.type === 'ASSET_CHUNK') {
      // 🔥 NEW: Guest received asset chunk from host
      handleAssetChunk(data.payload);
    } else if (data.type === 'ASSET_PROGRESS') {
    } else if (data.type === 'ASSET_PROGRESS') {
      // 🔥 NEW: Progress update for asset transfer
      const progress = data.payload;
      console.log(`[P2P Network] 📊 Asset transfer progress: ${progress.percentage?.toFixed(1)}%`);
    } else if (data.type === 'ASSET_COMPLETE') {
      // 🔥 NEW: Asset transfer complete
      console.log(`[P2P Network] ✅ Asset transfer complete: ${data.payload.successfulAssets}/${data.payload.totalAssets} assets`);
    } else if (data.type === 'ASSET_REQUEST') {
      // 🔥 NEW: Host received asset request from guest
      console.log(`[P2P Network] 📨 Received ASSET_REQUEST for ${data.payload.hashes?.length || 0} assets`);
      handleAssetRequest(data.payload, conn);

      // Apply individual panel settings using special action
      localDispatch({
        type: 'APPLY_PLAYER_PANEL_SETTINGS',
        payload: { settings }
      });
    } else if (data.type === 'POSITION_UPDATE') {
      // Lightweight position update for smooth dragging (batched)
      const positions = data.payload;
      console.log(`[P2P Network] 📥 Received POSITION_UPDATE for ${positions.length} objects`);

      // Update each object's position (skipNetworkSync prevents re-broadcasting)
      positions.forEach((pos: { id: string; x?: number; y?: number; rotation?: number; zIndex?: number }) => {
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
      console.log(`[P2P Network] 👋 Received HELO from player:`, newPlayer.name, `(${newPlayer.id})`);
      localDispatch({ type: 'ADD_PLAYER', payload: newPlayer });

      // Send player's individual panel settings back to them
      const playerPanelSettings = stateRef.current.playerPanelSettings[newPlayer.id] || {};
      if (Object.keys(playerPanelSettings).length > 0) {
        console.log(`[P2P Host] 📤 Sending player panel settings to ${newPlayer.name} (${Object.keys(playerPanelSettings).length} panels)`);
        senderConn.send({ type: 'PLAYER_PANEL_SETTINGS', payload: { playerId: newPlayer.id, settings: playerPanelSettings } });
      } else {
        console.log(`[P2P Host] 📤 No existing panel settings for ${newPlayer.name}, using host defaults`);
      }
    } else if (data.type === 'UPDATE_PLAYER_NAME') {
      // Host received player name update request
      console.log(`[P2P Network] ✏️ Received UPDATE_PLAYER_NAME`);
      localDispatch(data.payload);
    } else if (data.type === 'POSITION_UPDATE') {
      // 🔥 NEW: Host received batched position updates from guest
      const positions = data.payload;
      console.log(`[P2P Host] 📥 Received POSITION_UPDATE for ${positions.length} objects`);

      // Update each object's position (skipNetworkSync prevents re-broadcasting)
      positions.forEach((pos: { id: string; x?: number; y?: number; rotation?: number; zIndex?: number }) => {
        const existingObj = stateRef.current.objects[pos.id];
        if (existingObj) {
          localDispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: pos.id,
              ...pos,
              skipNetworkSync: true // Prevent re-broadcasting
            }
          });
        }
      });
    } else if (data.type === 'ACTION') {
      // Host received action request from Guest
      const actionType = data.payload?.type;
      console.log(`[P2P Network] 🎮 Received ACTION:`, actionType);

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
        console.log(`[P2P Network] ⚠️ Ignoring local-only action:`, actionType, '- not applying to host state');
      } else if (actionType === 'UPDATE_PLAYER_PANEL_SETTINGS') {
        // Host received update to player panel settings from guest
        console.log(`[P2P Network] 📥 Received UPDATE_PLAYER_PANEL_SETTINGS from guest`);
        localDispatch(data.payload);
      } else {
        localDispatch(data.payload);
      }
    }
  }, [localDispatch, updateP2PLoadingStep]);

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
      console.log(`[P2P Signalling] 🔌 Disconnecting from signalling server: ${reason}`);
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
      console.log(`[Trystero] 🔌 Leaving room: ${reason}`);
      try {
        room.leave();
        roomRef.current = null;
        console.log(`[Trystero] ✅ Left room successfully`);
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
    console.log(`[P2P Signalling] ⏰ Resetting disconnect timer (${SIGNALLING_TIMEOUT_MS / 1000}s)`);
    signallingTimeoutRef.current = setTimeout(() => {
      const currentConnections = connectionsRef.current.length;
      if (currentConnections > 0) {
        console.log(`[P2P Signalling] ⏰ Timer expired - ${currentConnections} active connection(s)`);
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
        console.log(`[P2P Signalling] Already connected to signalling server`);
        resolve();
        return;
      }

      console.log(`[P2P Signalling] 🔌 Reconnecting to signalling server: ${reason}`);
      signallingDisconnectedRef.current = false;

      // Set up one-time listener for reconnect
      const onOpen = () => {
        console.log(`[P2P Signalling] ✅ Reconnected to signalling server`);
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
    console.log(`[P2P Guest] 🔵 Starting connection process to host: ${hostId}`);
    console.log(`[P2P Guest] 👤 Player name: ${playerName}`);
    console.log(`[P2P Guest] 🌐 User Agent: ${navigator.userAgent}`);
    console.log(`[P2P Guest] 📍 URL: ${window.location.href}`);

    // 🔥 NEW: Reset and start loading progress
    resetP2PLoading();
    updateP2PLoadingStep('connect', 'loading', 'Connecting to signaling server...');

    // ============================================================================
    // OPTIMIZED FALLBACK CONNECTION LOGIC - PARALLEL ATTEMPTS
    // ============================================================================

    console.log(`[Connect] 🔄 Starting optimized fallback connection sequence...`);

    // Load connection settings
    const connectionSettings = getConnectionSettings();
    const communityServers = getCommunityServers();
    const useTrystero = connectionSettings.enableTrysteroTrackers;

    console.log(`[Connect] 📋 Connection settings:`, {
      customServers: communityServers.length,
      trysteroEnabled: useTrystero,
    });

    // OPTIMIZATION: Try all PeerJS servers in parallel with shorter timeout
    // First successful connection wins
    const PARALLEL_TIMEOUT = 8000; // Reduced from 15000ms for faster failover

    // 🔥 OPTIMIZED: Use AbortController to cancel remaining attempts after first success
    const abortController = new AbortController();

    // Шаг 1: Пробуем все PeerJS Cloud серверы параллельно
    setConnectionStatus('connecting');

    const peerjsPromises = PEERJS_FALLBACK_SERVERS.map(server =>
      tryPeerJSServer(server, PARALLEL_TIMEOUT, abortController.signal).then(result => ({ result, server }))
    );

    // Wait for first successful connection
    const peerjsResult = await Promise.race([
      Promise.any(peerjsPromises.map(async p => {
        const { result, server } = await p;
        if (result) {
          // 🔥 OPTIMIZED: Abort remaining attempts immediately after first success
          abortController.abort();
          console.log(`[Connect] ✅ Connected via ${server.name} (${server.host}) - cancelling remaining attempts`);
          // 🔥 NEW: Update progress
          updateP2PLoadingStep('connect', 'success', `Connected via ${server.name}`);
          return { peer: result.peer, server: server.name };
        }
        throw new Error(`Failed to connect to ${server.name}`);
      })),
      // Fallback if all fail
      new Promise((_, reject) => setTimeout(() => {
        abortController.abort();
        reject(new Error('All PeerJS servers failed'));
      }, PARALLEL_TIMEOUT + 1000))
    ]).catch(() => null);

    if (peerjsResult) {
      return setupPeerConnection(peerjsResult.peer, hostId, playerName);
    }

    console.log(`[Connect] ❌ All PeerJS Cloud servers failed, trying community servers...`);

    // Шаг 2: Пробуем комьюнити серверы (пользовательские) параллельно
    if (communityServers.length > 0) {
      // 🔥 OPTIMIZED: Use new AbortController for community server attempts
      const communityAbortController = new AbortController();

      const communityPromises = communityServers.map(server =>
        tryPeerJSServer(server, PARALLEL_TIMEOUT, communityAbortController.signal).then(result => ({ result, server }))
      );

      const communityResult = await Promise.race([
        Promise.any(communityPromises.map(async p => {
          const { result, server } = await p;
          if (result) {
            // 🔥 OPTIMIZED: Abort remaining attempts immediately after first success
            communityAbortController.abort();
            console.log(`[Connect] ✅ Connected via ${server.name} (${server.host}) - cancelling remaining attempts`);
            return { peer: result.peer, server: server.name };
          }
          throw new Error(`Failed to connect to ${server.name}`);
        })),
        new Promise((_, reject) => setTimeout(() => {
          communityAbortController.abort();
          reject(new Error('All community servers failed'));
        }, PARALLEL_TIMEOUT + 1000))
      ]).catch(() => null);

      if (communityResult) {
        return setupPeerConnection(communityResult.peer, hostId, playerName);
      }
    } else {
      console.log(`[Connect] ⏭️ No community servers configured`);
    }

    // Шаг 3: Пробуем Trystero с торрент-трекерами (если включено)
    if (useTrystero) {
      console.log(`[Connect] Attempting Trystero with torrent trackers...`);
      setConnectionStatus('connecting');

      const trysteroRoom = await tryTrysteroTorrent(hostId, 20000);
      if (trysteroRoom) {
        console.log(`[Connect] ✅ Connected via Trystero`);
        return setupTrysteroConnection(trysteroRoom, hostId, playerName);
      }
    } else {
      console.log(`[Connect] ⏭️ Trystero torrent trackers disabled in settings`);
    }

    // Все методы провалились
    console.error(`[Connect] ❌ All connection methods failed`);
    alert("Failed to connect to host. All connection methods failed.");
    setConnectionStatus('disconnected');
    setWaitingForPlayerName(null);

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    /**
     * Настроить PeerJS соединение после успешного подключения
     */
    function setupPeerConnection(peer: Peer, hostId: string, playerName: string) {
      peerRef.current = peer;
      (window as any).__nexusPeer = peer;
      syncSingleton(); // Sync to singleton after peer is set

      console.log(`[P2P Guest] 🎯 Attempting to connect to host ${hostId}...`);

      // 🔥 NEW: Update progress - establishing P2P connection
      updateP2PLoadingStep('p2p', 'loading', 'Establishing P2P connection...');

      const conn = peer.connect(hostId);
      hostConnectionRef.current = conn;
      (window as any).__nexusHostConnection = conn;
      syncSingleton(); // Sync to singleton after connection is set

      console.log(`[P2P Guest] 🔗 Connection object created, waiting for connection to open...`);

      conn.on('open', () => {
        console.log(`[P2P Guest] 🎉 Connection to host SUCCESSFUL!`);
        setConnectionStatus('connected');
        syncSingleton(); // Sync to singleton after connection is open

        // 🔥 NEW: Update progress - P2P connection established
        updateP2PLoadingStep('p2p', 'success', 'P2P connection established');
        updateP2PLoadingStep('handshake', 'loading', 'Handshake with host...');

        const persistentPlayerId = getPlayerId();
        const myPlayer: Player = {
          id: persistentPlayerId,
          name: playerName.trim() || `Player ${Math.floor(Math.random() * 100)}`,
          color: '#' + Math.floor(Math.random() * 16777215).toString(16),
          isGM: false
        };

        console.log(`[P2P Guest] 👤 Created player object:`, myPlayer);

        localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
        localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

        console.log(`[P2P Guest] 📤 Sending HELO to host...`);
        conn.send({ type: 'HELO', payload: myPlayer });

        // 🔥 NEW: Update progress - handshake complete
        updateP2PLoadingStep('handshake', 'success', 'Handshake complete');
        updateP2PLoadingStep('images', 'loading', 'Waiting for game images...');

        // TEMPORARILY DISABLED: Keep signalling connection alive to debug disconnect issue
        // setTimeout(() => {
        //   disconnectFromSignalling('P2P connection established with host');
        // }, 2000);
      });

      conn.on('data', (data: any) => {
        console.log(`[P2P Guest] 📥 Received data from host:`, data.type);
        if (data.type === 'CONNECTION_LOCKED') {
          console.warn(`[P2P Guest] 🔒 Host has locked new connections!`);
          alert("The host has locked new connections. Please contact the host to join.");
          setConnectionStatus('disconnected');
          setWaitingForPlayerName(null);
          return;
        }
        handleNetworkData(data, null);
      });

      conn.on('close', () => {
        console.warn(`[P2P Guest] ❌ Connection to host CLOSED`);
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          console.log(`[P2P Guest] 🧹 Destroying peer connection`);
          peer.destroy();
        }
        alert("Connection to Host lost");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });

      conn.on('error', (err) => {
        console.error(`[P2P Guest] ❌ Connection ERROR:`, err);
        logger.error("Connection error to host:", err);
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          console.log(`[P2P Guest] 🧹 Destroying peer after connection error`);
          peer.destroy();
        }
        alert("Failed to connect to host");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });

      const originalEmit = conn.emit;
      conn.emit = function(...args: any[]) {
        if (args[0] === 'iceStateChange') {
          console.log(`[P2P Guest] 🧊 ICE State changed:`, args[1] as string);
        }
        return originalEmit.apply(this, args as any);
      };

      peer.on('disconnected', () => {
        console.warn(`[P2P Guest] ⚠️ Disconnected from PeerJS server`);
        if (peer && !peer.destroyed && !isIntentionalDisconnectRef.current) {
          peer.reconnect();
        }
      });

      peer.on('error', (err) => {
        console.error(`[P2P Guest] ❌ PeerJS ERROR:`, err);
        if (err?.type === 'network' && peer && !peer.destroyed && !isIntentionalDisconnectRef.current) {
          console.log(`[P2P Guest] 🔄 Network error - attempting reconnection...`);
          peer.reconnect();
        } else if (err?.type !== 'network') {
          setConnectionStatus('disconnected');
        }
      });
    }

    /**
     * Настроить Trystero соединение
     */
    function setupTrysteroConnection(room: TrysteroRoom, hostId: string, playerName: string) {
      roomRef.current = room;

      console.log(`[Trystero] Setting up data handlers...`);

      // Обработка входящих данных
      const unsubscribeData = room.onData((data: any, peerId: string) => {
        console.log(`[Trystero] 📥 Received data from ${peerId}:`, data);
        handleNetworkData(data, null);
      });

      // Отправляем HELO хосту
      const persistentPlayerId = getPlayerId();
      const myPlayer: Player = {
        id: persistentPlayerId,
        name: playerName.trim() || `Player ${Math.floor(Math.random() * 100)}`,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        isGM: false
      };

      console.log(`[Trystero] 👤 Sending HELO to host...`);
      room.send({ type: 'HELO', payload: myPlayer });

      setConnectionStatus('connected');
      localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
      localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

      // Очистка при отключении
      room.onPeerLeave((peerId: string) => {
        console.warn(`[Trystero] Peer ${peerId} left`);
      });
    }
  }, [localDispatch, handleNetworkData, setConnectionStatus, setWaitingForPlayerName, updateP2PLoadingStep, resetP2PLoading]);

  // Оригинальная функция connectToHost для обратной совместимости
  // (Теперь использует fallback логику выше)
  const connectToHostLegacy = useCallback((hostId: string, playerName: string) => {
    console.log(`[P2P Guest] 🔵 Starting connection process to host: ${hostId}`);
    console.log(`[P2P Guest] 👤 Player name: ${playerName}`);
    console.log(`[P2P Guest] 🌐 User Agent: ${navigator.userAgent}`);
    console.log(`[P2P Guest] 📍 URL: ${window.location.href}`);

    const peer = new Peer(PEERJS_CONFIG);
    peerRef.current = peer;

    console.log(`[P2P Guest] ⏳ Waiting for PeerJS to assign ID...`);

    peer.on('open', (id) => {
      // Check if this is a reconnect (peerId was already set)
      const isReconnect = peerRef.current?.id === id;
      if (isReconnect) {
        console.log(`[P2P Guest] 🔄 Successfully reconnected to PeerJS server`);
        // Reset reconnect state on successful reconnect
        guestReconnectStateRef.current = { attempts: 0, startTime: null };
        signallingDisconnectedRef.current = false; // Reset signalling disconnect flag
      } else {
        console.log(`[P2P Guest] ✅ PeerJS assigned ID: ${id}`);
      }
      console.log(`[P2P Guest] 🎯 Attempting to connect to host ${hostId}...`);
      // Store for diagnostic access
      (window as any).__nexusPeer = peer;
      setPeerId(id);
      // isHost already set correctly from URL during initialization
      setConnectionStatus('connecting');

      const conn = peer.connect(hostId);
      hostConnectionRef.current = conn;
      // Store for diagnostic access
      (window as any).__nexusHostConnection = conn;

      console.log(`[P2P Guest] 🔗 Connection object created, waiting for connection to open...`);
      console.log(`[P2P Guest] 📊 Connection state:`, {
        peerId: id,
        hostId: hostId,
        connection: conn ? 'created' : 'failed',
        peerConfig: (peer as any).options
      });

      conn.on('open', () => {
        console.log(`[P2P Guest] 🎉 Connection to host SUCCESSFUL!`);
        setConnectionStatus('connected');

        // Use persistent playerId from localStorage instead of peer.id
        // This allows us to restore panel settings across page reloads
        const persistentPlayerId = getPlayerId();

        const myPlayer: Player = {
          id: persistentPlayerId,
          name: playerName.trim() || `Player ${Math.floor(Math.random() * 100)}`,
          color: '#' + Math.floor(Math.random() * 16777215).toString(16),
          isGM: false
        };

        console.log(`[P2P Guest] 👤 Created player object:`, myPlayer);

        // Add ourselves locally
        localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
        localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

        // Tell Host we are here
        console.log(`[P2P Guest] 📤 Sending HELO to host...`);
        conn.send({ type: 'HELO', payload: myPlayer });

        // TEMPORARILY DISABLED: Keep signalling connection alive to debug disconnect issue
        // // OPTIMIZATION: Disconnect from signalling server after P2P connection is established
        // // P2P connection is now direct, signalling server is no longer needed for data transfer
        // setTimeout(() => {
        //   disconnectFromSignalling('P2P connection established with host');
        // }, 2000); // Small delay to ensure HELO is delivered
      });

      conn.on('data', (data: any) => {
        console.log(`[P2P Guest] 📥 Received data from host:`, data.type);
        if (data.type === 'CONNECTION_LOCKED') {
          console.warn(`[P2P Guest] 🔒 Host has locked new connections!`);
          alert("The host has locked new connections. Please contact the host to join.");
          setConnectionStatus('disconnected');
          setWaitingForPlayerName(null);
          return;
        }
        handleNetworkData(data, null);
      });

      conn.on('close', () => {
        console.warn(`[P2P Guest] ❌ Connection to host CLOSED`);
        // Mark as intentional disconnect to prevent reconnect attempts
        isIntentionalDisconnectRef.current = true;
        // Clean up peer connection to signalling server
        if (peer && !peer.destroyed) {
          console.log(`[P2P Guest] 🧹 Destroying peer connection to signalling server`);
          peer.destroy();
        }
        alert("Connection to Host lost");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });

      conn.on('error', (err) => {
        console.error(`[P2P Guest] ❌ Connection ERROR:`, err);
        console.error(`[P2P Guest] ❌ Error details:`, {
          type: err?.type,
          message: err?.message,
          stack: err?.stack
        });
        logger.error("Connection error to host:", err);
        // Mark as intentional disconnect and clean up peer
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          console.log(`[P2P Guest] 🧹 Destroying peer after connection error`);
          peer.destroy();
        }
        alert("Failed to connect to host");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      });

      // Log connection state changes
      const originalEmit = conn.emit;
      conn.emit = function(...args: any[]) {
        if (args[0] === 'iceStateChange') {
          console.log(`[P2P Guest] 🧊 ICE State changed:`, args[1] as string);
        }
        return originalEmit.apply(this, args as any);
      };
    });

    // Reconnection logic: try every 5 seconds for 30 seconds, then give up
    const RECONNECT_INTERVAL = 5000; // 5 seconds
    const MAX_RECONNECT_TIME = 30000; // 30 seconds total

    const scheduleReconnect = () => {
      // Don't reconnect if this was an intentional disconnect
      if (isIntentionalDisconnectRef.current) {
        console.log(`[P2P Guest] ⏹️ Intentional disconnect - skipping reconnect`);
        return;
      }

      // Initialize start time on first attempt
      if (guestReconnectStateRef.current.startTime === null) {
        guestReconnectStateRef.current.startTime = Date.now();
      }

      const elapsed = Date.now() - (guestReconnectStateRef.current.startTime || 0);
      guestReconnectStateRef.current.attempts++;

      if (elapsed >= MAX_RECONNECT_TIME) {
        console.error(`[P2P Guest] ❌ Reconnect timeout after ${elapsed}ms - giving up`);
        // Clean up peer to stop server requests
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          console.log(`[P2P Guest] 🧹 Destroying peer after reconnect timeout`);
          peer.destroy();
        }
        alert("Failed to reconnect to peer server. Please refresh the page.");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
        return;
      }

      console.log(`[P2P Guest] 🔌 Reconnection attempt ${guestReconnectStateRef.current.attempts} in ${RECONNECT_INTERVAL}ms... (${elapsed}/${MAX_RECONNECT_TIME}ms elapsed)`);

      setTimeout(() => {
        // Check again before reconnecting - state may have changed
        if (isIntentionalDisconnectRef.current) {
          console.log(`[P2P Guest] ⏹️ Intentional disconnect detected - cancelling reconnect`);
          return;
        }

        if (peer && !peer.destroyed) {
          try {
            peer.reconnect();
            console.log(`[P2P Guest] 🔄 Reconnect triggered`);
          } catch (e) {
            console.error(`[P2P Guest] ❌ Reconnect failed:`, e);
            // Continue trying
            scheduleReconnect();
          }
        }
      }, RECONNECT_INTERVAL);
    };

    peer.on('disconnected', () => {
      console.warn(`[P2P Guest] ⚠️ Disconnected from PeerJS server`);
      if (peer && !peer.destroyed) {
        scheduleReconnect();
      }
    });

    peer.on('error', (err) => {
      console.error(`[P2P Guest] ❌ PeerJS ERROR:`, err);
      console.error(`[P2P Guest] ❌ Error details:`, {
        type: err?.type,
        message: err?.message,
        stack: err?.stack
      });
      logger.error('Peer error:', err);

      // Only show alert for critical errors (not 'network' errors which may be transient)
      if (err?.type !== 'network' && err?.type !== 'peer-unavailable') {
        // Critical error - clean up peer to stop server requests
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          console.log(`[P2P Guest] 🧹 Destroying peer after critical error: ${err?.type}`);
          peer.destroy();
        }
        alert("Failed to connect to peer server");
        setConnectionStatus('disconnected');
        setWaitingForPlayerName(null);
      }
      // For network errors, try to reconnect
      else if (err?.type === 'network' && peer && !peer.destroyed) {
        console.log(`[P2P Guest] 🔄 Network error - attempting reconnection...`);
        scheduleReconnect();
      }
    });

    // Monitor connection timeout
    setTimeout(() => {
      if (connectionStatus === 'connecting') {
        console.warn(`[P2P Guest] ⏰ Connection timeout - still connecting after 30 seconds`);
        console.warn(`[P2P Guest] 💡 This may indicate NAT/Firewall issues`);
      }
    }, 30000);
  }, [localDispatch, handleNetworkData, connectionStatus]);

  // Handler for when player submits their name via modal (joining a game)
  const setPlayerName = useCallback((name: string) => {
    if (!waitingForPlayerName) return;

    const { hostId } = waitingForPlayerName;
    setWaitingForPlayerName(null);
    connectToHost(hostId, name.trim() || `Player ${Math.floor(Math.random() * 100)}`);
  }, [waitingForPlayerName, connectToHost]);

  // Initialize host peer on demand (when user clicks Invite button)
  const initializeHost = useCallback(async () => {
    // 🔥 SINGLETON: Restore from singleton if available (HMR remount)
    if (p2pSingleton.peer && !p2pSingleton.peer.destroyed) {
      console.log(`[P2P Host] 🔄 Restoring peer from singleton (HMR remount)`);
      peerRef.current = p2pSingleton.peer;
      connectionsRef.current = p2pSingleton.connections;
      imageCachesRef.current = p2pSingleton.imageCaches;

      // Restore refs
      (window as any).__nexusPeer = peerRef.current;

      // Update state
      setPeerId(peerRef.current.id);
      setConnectionStatus('connected');

      console.log(`[P2P Host] ✅ Restored peer from singleton, ID: ${peerRef.current.id}`);
      return;
    }

    // Check if we have a peer that's just disconnected from signalling (optimization)
    if (peerRef.current && peerRef.current.disconnected && !peerRef.current.destroyed) {
      console.log(`[P2P Host] 🔄 Peer exists but disconnected from signalling - reconnecting`);
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
      console.log(`[P2P Host] ℹ️ Peer already initialized, peerId: ${peerRef.current.id}`);
      return;
    }

    console.log(`[P2P Host] 👑 Initializing host peer on demand`);
    console.log(`[P2P Host] 🌐 User Agent: ${navigator.userAgent}`);
    console.log(`[P2P Host] 📍 URL: ${window.location.href}`);

    const peer = new Peer(PEERJS_CONFIG);
    peerRef.current = peer;
    // Store for diagnostic access
    (window as any).__nexusPeer = peer;
    syncSingleton(); // Sync to singleton after creating peer

    console.log(`[P2P Host] ⏳ Waiting for PeerJS to assign host ID...`);

    peer.on('open', async (id) => {
      // Check if this is a reconnect (peerId was already set)
      const isReconnect = peerRef.current?.id === id;
      if (isReconnect) {
        console.log(`[P2P Host] 🔄 Successfully reconnected to PeerJS server`);
        // Reset reconnect state on successful reconnect
        hostReconnectStateRef.current = { attempts: 0, startTime: null };
        signallingDisconnectedRef.current = false; // Reset signalling disconnect flag
      } else {
        console.log(`[P2P Host] ✅ Host ID assigned: ${id}`);
      }
      console.log(`[P2P Host] 📋 Share this ID with players or use the Invite button`);
      console.log(`[P2P Host] 🔗 Invite link format: ${window.location.href.split('?')[0]}?hostId=${id}`);

      setPeerId(id);
      setConnectionStatus('connected');
      syncSingleton(); // Sync to singleton after peer is open

      // Get and display local IP for LAN connections
      const localIP = await getLocalIPAddress();
      if (localIP) {
        const protocol = window.location.protocol;
        const port = window.location.port ? `:${window.location.port}` : '';
        const path = window.location.pathname;
        const lanUrl = `${protocol}//${localIP}${port}${path}?hostId=${id}`;
        console.log(`[P2P Host] 🏠 Local Network (LAN) URL: ${lanUrl}`);
        console.log(`[P2P Host] 📍 Local IP: ${localIP}`);
        console.log(`[P2P Host] 💡 Other devices on the same network can use the LAN URL to connect`);
      }
    });

    // Handle incoming connections (If we are Host)
    peer.on('connection', (conn) => {
      const guestPeerId = conn.peer;
      console.log(`[P2P Host] 📨 Incoming connection from: ${guestPeerId}`);
      console.log(`[P2P Host] ⏳ Waiting for connection to open...`);

      conn.on('open', () => {
        console.log(`[P2P Host] 🎉 Connection opened for guest: ${guestPeerId}`);

        // Check if connections are locked
        if (stateRef.current?.connectionsLocked) {
          console.warn(`[P2P Host] 🔒 Connections are LOCKED! Rejecting guest: ${guestPeerId}`);
          conn.send({ type: 'CONNECTION_LOCKED' });
          conn.close();
          return;
        }

        connectionsRef.current.push(conn);
        console.log(`[P2P Host] 📋 Total active connections: ${connectionsRef.current.length}`);
        syncSingleton(); // Sync to singleton after connection added

        // 🔥 CRITICAL FIX: Set up data handler BEFORE sending data
        // This prevents HELO messages from being lost
        conn.on('data', (data: any) => {
          console.log(`[P2P Host] 📥 Received data from ${guestPeerId}:`, data.type);
          handleNetworkData(data, conn);
        });

        // IMPORTANT: Wait for data channel to be fully ready before sending data
        // This fixes the issue where guest doesn't receive messages
        setTimeout(() => {
          if (!conn.open) {
            console.warn(`[P2P Host] ⚠️ Connection closed before sending data`);
            return;
          }

          console.log(`[P2P Host] 📤 Data channel ready, sending state to guest...`);

          // 🔥 NEW: Send asset manifest instead of IMAGE_CACHE
          (async () => {
            try {
              const { assetDB } = await import('../utils/assets');
              const manifest = await assetDB.getManifest();

              console.log(`[P2P Host] 📋 Sending ASSET_MANIFEST to guest (${manifest.totalCount} assets, ${(manifest.totalSize / 1024 / 1024).toFixed(2)}MB)`);

              conn.send({
                type: 'ASSET_MANIFEST',
                payload: {
                  sessionId: stateRef.current?.sessionId || 'default',
                  version: 1,
                  timestamp: Date.now(),
                  assets: manifest.assets.map(a => ({
                    hash: a.hash,
                    size: a.size,
                    mimeType: a.mimeType,
                    priority: 5
                  })),
                  totalSize: manifest.totalSize,
                  totalCount: manifest.totalCount
                }
              });
            } catch (error) {
              console.error('[P2P Host] Failed to send asset manifest:', error);
              // Fallback: send empty manifest
              conn.send({
                type: 'ASSET_MANIFEST',
                payload: {
                  sessionId: stateRef.current?.sessionId || 'default',
                  version: 1,
                  timestamp: Date.now(),
                  assets: [],
                  totalSize: 0,
                  totalCount: 0
                }
              });
            }
          })();

          // Filter out local panel properties before syncing
          const stateToSend = { ...stateRef.current };
          if (stateToSend.objects) {
            stateToSend.objects = filterLocalPanelProperties(stateToSend.objects);
          }

          // Send state (now contains only hashes, not base64)
          console.log(`[P2P Host] 📤 Sending SYNC_STATE to guest`);
          conn.send({ type: 'SYNC_STATE', payload: stateToSend });

          // Store reference to connection for sending player panel settings later
          (conn as any).pendingPlayerId = null; // Will be set when HELO is received

          console.log(`[P2P Host] ✅ Initial sync complete (ASSET_MANIFEST + SYNC_STATE sent)`);
        }, 50); // 50ms delay to ensure data channel is fully ready

        // Handle Disconnection
        conn.on('close', () => {
          console.warn(`[P2P Host] ❌ Guest ${guestPeerId} disconnected`);
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
            console.log(`[P2P Host] 🧊 ICE State changed for ${guestPeerId}:`, state);
            if (state === 'failed' || state === 'disconnected') {
              console.warn(`[P2P Host] ⚠️ ICE connection ${state} for guest ${guestPeerId} - may indicate NAT/Firewall issues`);
            }
          }
          return originalEmit.apply(this, args as any);
        };

        // Connection timeout
        setTimeout(() => {
          if (!conn.open) {
            console.warn(`[P2P Host] ⏰ Connection timeout for guest ${guestPeerId} - connection never opened`);
          }
        }, 30000);

        // TEMPORARILY DISABLED: Keep signalling connection alive to debug disconnect issue
        // // OPTIMIZATION: Reset signalling disconnect timer when a new guest connects
        // // This allows time for more players to join before disconnecting from signalling
        // // After SIGNALLING_TIMEOUT_MS (2 minutes) of no new connections, disconnect from signalling
        // setTimeout(() => {
        //   if (conn.open) {
        //     console.log(`[P2P Host] 📊 Guest ${guestPeerId} connected - resetting signalling timer`);
        //     resetSignallingTimer();
        //   }
        // }, 1000); // Small delay to ensure connection is fully established
      });
    });

    // Reconnection logic: try every 5 seconds for 30 seconds, then give up
    const RECONNECT_INTERVAL = 5000; // 5 seconds
    const MAX_RECONNECT_TIME = 30000; // 30 seconds total

    const scheduleHostReconnect = () => {
      // Don't reconnect if this was an intentional disconnect
      if (isIntentionalDisconnectRef.current) {
        console.log(`[P2P Host] ⏹️ Intentional disconnect - skipping reconnect`);
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
          console.log(`[P2P Host] 🧹 Destroying peer after reconnect timeout`);
          peer.destroy();
        }
        setConnectionStatus('disconnected');
        return;
      }

      console.log(`[P2P Host] 🔌 Reconnection attempt ${hostReconnectStateRef.current.attempts} in ${RECONNECT_INTERVAL}ms... (${elapsed}/${MAX_RECONNECT_TIME}ms elapsed)`);

      setTimeout(() => {
        // Check again before reconnecting - state may have changed
        if (isIntentionalDisconnectRef.current) {
          console.log(`[P2P Host] ⏹️ Intentional disconnect detected - cancelling reconnect`);
          return;
        }

        if (peer && !peer.destroyed) {
          try {
            peer.reconnect();
            console.log(`[P2P Host] 🔄 Reconnect triggered`);
          } catch (e) {
            console.error(`[P2P Host] ❌ Reconnect failed:`, e);
            // Continue trying
            scheduleHostReconnect();
          }
        }
      }, RECONNECT_INTERVAL);
    };

    peer.on('disconnected', () => {
      console.warn(`[P2P Host] ⚠️ Disconnected from PeerJS server`);
      if (peer && !peer.destroyed) {
        scheduleHostReconnect();
      }
    });

    peer.on('error', (err) => {
      console.error(`[P2P Host] ❌ PeerJS ERROR:`, err);
      console.error(`[P2P Host] ❌ Error details:`, {
        type: err?.type,
        message: err?.message,
        stack: err?.stack
      });
      logger.error('Peer error:', err);

      // For network errors, try to reconnect instead of failing
      if (err?.type === 'network' && peer && !peer.destroyed) {
        console.log(`[P2P Host] 🔄 Network error - attempting reconnection...`);
        scheduleHostReconnect();
      } else if (err?.type !== 'network') {
        // Critical error - clean up peer to stop server requests
        isIntentionalDisconnectRef.current = true;
        if (peer && !peer.destroyed) {
          console.log(`[P2P Host] 🧹 Destroying peer after critical error: ${err?.type}`);
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

    // If we have a hostId in URL, show modal for player name first
    if (hostIdToJoin) {
      console.log(`[P2P Guest] 📋 Detected hostId in URL: ${hostIdToJoin}`);
      console.log(`[P2P Guest] 👋 Waiting for player name input...`);
      setWaitingForPlayerName({ hostId: hostIdToJoin });
      return;
    }

    // No hostId = host mode - peer will be initialized when user clicks Invite
    console.log(`[P2P Init] 🎮 Host mode - PeerJS will initialize on first Invite`);
  }, []);

  // ============================================================================
  // 🔥 CLEANUP LOGIC: Preserve P2P connection across HMR remounts
  // ============================================================================

  useEffect(() => {
    const cleanupPeer = () => {
      console.log(`[P2P Cleanup] 🧹 Cleaning up peer connection`);
      isIntentionalDisconnectRef.current = true;

      // Clear signalling disconnect timer
      if (signallingTimeoutRef.current) {
        clearTimeout(signallingTimeoutRef.current);
        signallingTimeoutRef.current = null;
      }

      // Close all host connections
      if (connectionsRef.current.length > 0) {
        console.log(`[P2P Cleanup] 📋 Closing ${connectionsRef.current.length} guest connections`);
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
          console.log(`[P2P Cleanup] 🔗 Closing host connection`);
          hostConnectionRef.current.close();
        } catch (e) {
          console.error(`[P2P Cleanup] Error closing host connection:`, e);
        }
        hostConnectionRef.current = null;
      }

      // Destroy peer connection to signalling server
      if (peerRef.current && !peerRef.current.destroyed) {
        console.log(`[P2P Cleanup] 🌐 Destroying peer connection to signalling server`);
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
      console.log(`[P2P Cleanup] 🔄 Page unloading - destroying P2P connection`);
      cleanupPeer();
    };

    window.addEventListener('beforeunload', handleUnload);

    // 🔥 OPTIMIZATION: On component unmount (HMR), sync to singleton but DON'T destroy peer
    return () => {
      console.log(`[P2P Cleanup] 🔄 Component unmounting - syncing to singleton (P2P preserved)`);
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
    }
  };
}
