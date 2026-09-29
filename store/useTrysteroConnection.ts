/**
 * Trystero Connection Hook (BitTorrent transport)
 *
 * TRANSPORT ONLY: joins/creates a BitTorrent-tracker room and moves bytes.
 * All game-session protocol (HELO/SYNC_STATE/POSITION_UPDATE/packs) is handled
 * by the shared store/session/protocol.ts — this hook keeps only the
 * trystero-specific connection hardening:
 *   - waitForPeer before sending HELO (tracker discovery can exceed 2s)
 *   - HELO retries until the first state sync arrives
 *   - host backup PACKS_NEEDED + full-state push after onPeerJoin
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Action } from './gameActions';
import { Player } from '../types';
import { logger } from '../utils/logger';
import { getPlayerId } from './gameConstants';
// Import the BitTorrent strategy directly — the default 'trystero' entry point
// is the Nostr strategy, and 'trystero/torrent' ships empty type stubs.
import { joinRoom } from '@trystero-p2p/torrent';
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
  roomId: string;
}

export interface P2PLoadingStep {
  id: string;
  message: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress?: number;
}

export interface UseTrysteroConnectionReturn {
  peerId: string | null;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
  waitingForPlayerName: WaitingForPlayerName | null;
  setPlayerName: (name: string) => void;
  initializeHost: () => void;
  hostConnectionRef: React.RefObject<any>;
  connectionsRef: React.RefObject<any[]>;
  roomRef: React.RefObject<any>;
  p2pLoadingSteps: P2PLoadingStep[];
  p2pLoadingProgress: number;
  isP2PLoadingModalOpen: boolean;
  requiredPacks: Array<{ name: string; hash: string; size: number }>;
  onPackLoaded: (packName: string, hashes: string[]) => void;
  onJoinWithoutPacks: () => void;
  suggestedPlayerName: string;
  roomId: string | null; // Expose room ID for invite links
}

// Trystero room type
type TrysteroRoom = {
  makeAction: (namespace: string) => [(data: any, peerId?: string) => void, (callback: (data: any, peerId: string) => void) => () => void];
  onPeerJoin: (callback: (peerId: string) => void) => () => void;
  onPeerLeave: (callback: (peerId: string) => void) => () => void;
  leave: () => void;
  getPeers: () => string[];
};

// Torrent relay trackers for Trystero (BitTorrent strategy uses relayUrls config).
// Only live relays: btorrent.xyz and files.fm:7073 are dead and spam reconnect errors.
const TORRENT_TRACKERS = [
  'wss://tracker.webtorrent.dev',
  'wss://tracker.openwebtorrent.com',
];

// 🔧 DEV ONLY: message counters for debugging sync issues in the browser console
const trysteroDbg: { sent: number; received: number; log: string[]; room?: unknown; connections?: any[]; instanceId?: string } | null =
  (import.meta as any).env?.DEV
    ? ((window as any).__trysteroDebug = (window as any).__trysteroDebug || { sent: 0, received: 0, log: [] })
    : null;

/**
 * Resolves once at least one peer has joined the room (or after timeoutMs).
 * Uses onPeerJoin plus a getPeers() poll, so a peer that joined before the
 * listener was registered is still detected.
 */
function waitForPeer(room: TrysteroRoom, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearInterval(poll);
      resolve();
    };
    const timeout = setTimeout(finish, timeoutMs);
    const poll = setInterval(() => {
      try {
        const peers = room.getPeers();
        if (peers && Object.keys(peers as any).length > 0) finish();
      } catch {
        // ignore — room may be closing
      }
    }, 300);
    room.onPeerJoin(() => finish());
  });
}

/**
 * Module-scoped guest connection list.
 *
 * Lives at module level so it SURVIVES hook remounts (React StrictMode
 * double-mount, Vite HMR after code edits). A per-instance ref would be
 * recreated empty while the room keeps delivering onPeerJoin into the old
 * closure — the host would then hold a live guest but broadcast to an empty
 * list (`[Broadcast] SKIP connections: 0`).
 */
const liveConnections: any[] = [];

// 🔧 DEV diagnostics: tag this module copy so we can detect duplicated module
// instances (two copies = two liveConnections arrays = the host broadcasts
// into one list while GameContext reads the other, `connections: 0`).
const INSTANCE_ID = Math.random().toString(36).slice(2, 8);
(liveConnections as any).__instanceId = INSTANCE_ID;
if (typeof window !== 'undefined') {
  const w = window as any;
  w.__trysteroInstances = w.__trysteroInstances || {};
  w.__trysteroInstances[INSTANCE_ID] = liveConnections;
  if (trysteroDbg) {
    trysteroDbg.connections = liveConnections;
    trysteroDbg.instanceId = INSTANCE_ID;
  }
}

/**
 * Reconciles a connection list with the room's actual peer set.
 *
 * The list can desync from the live room (a missed onPeerJoin/onPeerLeave, or
 * stale refs after a Vite HMR remount) — and when it does, the host broadcast
 * loop in GameContext sees `connections: 0` and silently stops syncing guests,
 * while direct sends (HELO replies etc.) still work. Reconciling on every
 * inbound message plus an interval keeps the list self-healing.
 *
 * ADD-ONLY by design: a transiently empty getPeers() (tracker reconnect,
 * handshake pending) must not wipe known-good entries — removal happens
 * explicitly in onPeerLeave.
 */
function reconcileConnections(
  room: TrysteroRoom,
  list: any[],
  send: ((data: any, peerId?: string) => void) | null
): void {
  let peerIds: string[] = [];
  try {
    peerIds = Object.keys((room.getPeers() as any) || {});
  } catch {
    return; // room may be closing
  }
  peerIds.forEach(peerId => {
    if (!list.some(c => c.peerId === peerId)) {
      // `open: true` is required — the host broadcast loop in GameContext
      // skips connections without it.
      list.push({ peerId, send, open: true });
      if (trysteroDbg) {
        console.log('[Trystero] reconcile +' + peerId.slice(0, 6) + ' list=' + list.length + ' inst=' + INSTANCE_ID);
      }
    }
  });
}

// ============================================================================
// HOOK
// ============================================================================

export function useTrysteroConnection(
  localDispatch: React.Dispatch<Action>,
  stateRef: React.RefObject<any>
): UseTrysteroConnectionReturn {
  const [peerId] = useState<string | null>(() => getPlayerId());
  const [isHost, _setIsHost] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const params = new URLSearchParams(window.location.search);
    return !params.has('roomId');
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [waitingForPlayerName, setWaitingForName] = useState<WaitingForPlayerName | null>(null);

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
  const [_isP2PLoadingModalOpen] = useState(false);

  // Refs — connectionsRef points at the shared module-scoped list
  const hostConnectionRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>(liveConnections);
  const roomRef = useRef<TrysteroRoom | null>(null);
  const sendRef = useRef<((data: any, peerId?: string) => void) | null>(null);

  // Pending player name
  const pendingPlayerNameRef = useRef<string | null>(null);

  // Whether the guest has received at least one state sync from the host
  const receivedSyncRef = useRef(false);

  // Interval keeping the connection list in sync with the room's peer set
  const reconcileTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reconcile = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    reconcileConnections(room, connectionsRef.current, sendRef.current);
  }, []);

  // Room ID for Trystero
  const [roomId, setRoomId] = useState<string | null>(null);

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

  const handleNetworkData = useCallback((data: any, peerId: string) => {
    if (data?.type === 'SYNC_STATE') {
      receivedSyncRef.current = true;
    }
    // An inbound message is the STRONGEST proof of connectivity — trystero only
    // delivers data from ACTIVE peers (pending peers are dropped internally),
    // yet getPeers()/onPeerJoin can still be blind to it (e.g. a silent
    // "peer replaced" clears activePeerMap without onPeerJoin/onPeerLeave).
    // Populate the list from the sender directly so the host broadcast loop
    // in GameContext always has a target.
    const list = connectionsRef.current;
    if (peerId && !list.some(c => c.peerId === peerId)) {
      // `open: true` is required — the broadcast loop skips connections without it
      list.push({ peerId, send: sendRef.current, open: true });
      if (trysteroDbg) {
        console.log('[Trystero] inbound +' + peerId.slice(0, 6) + ' list=' + list.length + ' inst=' + INSTANCE_ID);
      }
    }
    // Also reconcile against the room's peer set (covers peers that connected
    // but have not sent anything yet)
    reconcile();
    // Replies (HELO → SYNC_STATE etc.) go back to the same peer
    const senderConn = {
      peerId,
      send: (msg: any) => {
        const send = sendRef.current;
        if (send) send(msg, peerId);
      },
    };
    protocolHandlerRef.current(data, senderConn);
  }, [reconcile]);

  // ============================================================================
  // INITIALIZE HOST
  // ============================================================================

  const initializeHost = useCallback(() => {
    console.log('[Trystero] Initializing host...');

    if (roomRef.current) {
      console.log('[Trystero] Already initialized');
      return;
    }

    updateP2PLoadingStep('connect', 'loading', 'Creating room...');
    setConnectionStatus('connecting');
    liveConnections.length = 0; // fresh list for the new room

    // Generate a random room ID
    const newRoomId = `nexus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setRoomId(newRoomId);

    const config = {
      appId: 'nexus-game-table',
      relayUrls: TORRENT_TRACKERS,
    };

    console.log('[Trystero] Creating room:', newRoomId);

    const room = joinRoom(config, newRoomId) as unknown as TrysteroRoom;
    roomRef.current = room;
    if (trysteroDbg) trysteroDbg.room = room;

    // Create messaging action using Trystero's makeAction
    const [send, getData] = room.makeAction('messaging');
    sendRef.current = (data: any, targetPeers?: string) => {
      if (trysteroDbg) {
        trysteroDbg.sent++;
        trysteroDbg.log.push(`SEND ${data?.type} -> ${targetPeers || 'all'} #${trysteroDbg.sent}`);
        console.log('[Trystero] SEND', data?.type, '->', targetPeers || 'all', '#' + trysteroDbg.sent, `${JSON.stringify(data)?.length || 0}b`);
      }
      return send(data, targetPeers);
    };

    // Handle incoming data from any peer
    getData((data: any, peerId: string) => {
      if (trysteroDbg) {
        trysteroDbg.received++;
        trysteroDbg.log.push(`RECV ${data?.type} from ${peerId} #${trysteroDbg.received}`);
      }
      handleNetworkData(data, peerId);
    });

    // Keep the connection list reconciled with the room's peer set even when
    // no messages flow (self-heals a desynced list within one tick)
    if (reconcileTimerRef.current) clearInterval(reconcileTimerRef.current);
    reconcileTimerRef.current = setInterval(reconcile, 2000);

    // Handle peer join
    room.onPeerJoin((peerId: string) => {
      console.log('[Trystero] Peer joined:', peerId);
      reconcile();
      updateP2PLoadingStep('p2p', 'success', 'P2P connection established');

      // Backup push: the HELO reply can race with the peer's receive pipeline
      // and get lost, leaving the guest with an empty table. Mirrors the PeerJS
      // host accept sequence (PACKS_NEEDED + filtered initial state).
      setTimeout(() => {
        if (roomRef.current === room && sendRef.current) {
          console.log('[Trystero] Sending backup packs+state to', peerId);
          sendRef.current(buildPacksNeeded(stateRef.current), peerId);
          sendRef.current(buildInitialSyncState(stateRef.current), peerId);
        }
      }, 1500);
    });

    // Handle peer leave
    room.onPeerLeave((peerId: string) => {
      console.log('[Trystero] Peer left:', peerId);
      const idx = connectionsRef.current.findIndex(c => c.peerId === peerId);
      if (idx !== -1) connectionsRef.current.splice(idx, 1);
    });

    setConnectionStatus('connected');
    updateP2PLoadingStep('connect', 'success', 'Room created: ' + newRoomId.slice(0, 20) + '...');
  }, [updateP2PLoadingStep, handleNetworkData, localDispatch, stateRef, reconcile]);

  // ============================================================================
  // CONNECT TO HOST (GUEST)
  // ============================================================================

  const connectToHost = useCallback(async (roomIdToJoin: string, playerName: string) => {
    console.log('[Trystero] Connecting to room:', roomIdToJoin);

    resetP2PLoading();
    updateP2PLoadingStep('connect', 'loading', 'Joining room...');
    setConnectionStatus('connecting');

    const config = {
      appId: 'nexus-game-table',
      relayUrls: TORRENT_TRACKERS,
    };

    try {
      const room = joinRoom(config, roomIdToJoin) as unknown as TrysteroRoom;
      roomRef.current = room;
      setRoomId(roomIdToJoin);
      if (trysteroDbg) trysteroDbg.room = room;

      // Create messaging action
      const [send, getData] = room.makeAction('messaging');
      sendRef.current = (data: any, targetPeers?: string) => {
        if (trysteroDbg) {
          trysteroDbg.sent++;
          trysteroDbg.log.push(`SEND ${data?.type} -> ${targetPeers || 'all'} #${trysteroDbg.sent}`);
        }
        return send(data, targetPeers);
      };

      // Expose the send channel via hostConnectionRef — GameContext sends all
      // guest→host actions through hostConnectionRef.current.send(...)
      hostConnectionRef.current = {
        send: (data: any) => {
          const current = sendRef.current;
          if (current) current(data);
        },
      };

      // Mark connected as soon as the send channel exists — the guest's
      // dispatch path drops actions silently while connectionStatus is
      // 'connecting', and tracker discovery can legitimately take 10+s.
      // Messages sent before the host is discovered are lost either way, but
      // this avoids an extra silent window AFTER the peer is reachable.
      setConnectionStatus('connected');

      // Wait until a peer actually joins the room. Tracker discovery can take
      // a while — a HELO sent into an empty room is simply lost, leaving the
      // guest with no game state.
      updateP2PLoadingStep('connect', 'loading', 'Waiting for peers via trackers...');
      await waitForPeer(room, 15000);

      updateP2PLoadingStep('connect', 'success', 'Joined room');
      updateP2PLoadingStep('p2p', 'loading', 'Establishing P2P connection...');

      // Handle incoming data
      getData((data: any, peerId: string) => {
        if (trysteroDbg) {
          trysteroDbg.received++;
          trysteroDbg.log.push(`RECV ${data?.type} from ${peerId} #${trysteroDbg.received}`);
        }
        handleNetworkData(data, peerId);
      });

      // Send HELO to room
      const myPlayer: Player = {
        id: getPlayerId(),
        name: playerName,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16),
        isGM: false
      };

      send({ type: 'HELO', payload: myPlayer });
      localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
      localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

      // Retry HELO until the host's state sync arrives — the first reply can
      // be lost while the peer connection is still settling on either side.
      receivedSyncRef.current = false;
      let heloRetries = 0;
      const heloTimer = setInterval(() => {
        if (receivedSyncRef.current || heloRetries >= 12 || roomRef.current !== room) {
          clearInterval(heloTimer);
          return;
        }
        heloRetries++;
        logger.warn('[Trystero] No state received yet, re-sending HELO (attempt ' + heloRetries + ')');
        send({ type: 'HELO', payload: myPlayer });
      }, 1500);

      setConnectionStatus('connected');
      updateP2PLoadingStep('p2p', 'success', 'Connected to room');
      updateP2PLoadingStep('handshake', 'success', 'Handshake complete');

    } catch (error) {
      console.error('[Trystero] Failed to connect:', error);
      setConnectionStatus('disconnected');
      updateP2PLoadingStep('connect', 'error', 'Failed to connect');
    }
  }, [updateP2PLoadingStep, resetP2PLoading, handleNetworkData, localDispatch]);

  // ============================================================================
  // SET PLAYER NAME
  // ============================================================================

  const setPlayerName = useCallback((name: string) => {
    if (!waitingForPlayerName) return;

    const finalName = name.trim() || suggestedPlayerName || `Player ${Math.floor(Math.random() * 100)}`;
    pendingPlayerNameRef.current = finalName;

    // Connect to host room
    connectToHost(waitingForPlayerName.roomId, finalName);
    setWaitingForName(null);
  }, [waitingForPlayerName, suggestedPlayerName, connectToHost]);

  // ============================================================================
  // ON PACK LOADED
  // ============================================================================

  const onJoinWithoutPacks = proceedWithoutPacks;

  const onPackLoaded = useCallback((packName: string, hashes: string[]) => {
    // Track loaded pack
    loadedPacksRef.current.add(packName);

    // Notify host that pack was loaded
    const send = sendRef.current;
    if (send) {
      send({
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
    const roomIdParam = params.get('roomId');

    if (roomIdParam) {
      // Guest mode - show modal for player name
      const playerNum = params.get('playerNum');
      if (playerNum) {
        setSuggestedPlayerName(`Player ${playerNum}`);
      }

      setWaitingForName({
        roomId: roomIdParam
      });
    }
  }, [setSuggestedPlayerName]);

  // ============================================================================
  // CLEANUP
  // ============================================================================

  useEffect(() => {
    return () => {
      if (reconcileTimerRef.current) {
        clearInterval(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      const room = roomRef.current;
      if (room) {
        room.leave();
        roomRef.current = null;
        // This instance owned the room — its connections are gone with it
        liveConnections.length = 0;
      }
      hostConnectionRef.current = null;
      sendRef.current = null;
    };
  }, []);

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    peerId,
    isHost,
    connectionStatus,
    waitingForPlayerName,
    setPlayerName,
    initializeHost,
    hostConnectionRef,
    connectionsRef,
    roomRef,
    p2pLoadingSteps,
    p2pLoadingProgress,
    isP2PLoadingModalOpen: _isP2PLoadingModalOpen,
    requiredPacks,
    onPackLoaded,
    onJoinWithoutPacks,
    suggestedPlayerName,
    roomId,
  };
}
