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
import { registerP2PConnections } from '../utils/directP2PSync';
import { differentialSyncManager } from '../utils/webrtcOptimization';
import {
  getHostInviteId,
  persistHostRoomId,
  writeHostDescriptor,
  writeGuestDescriptor,
  readSessionDescriptor,
  isDescriptorFresh,
  shouldRefreshGuestDescriptor,
  readTabSession,
  isTabSessionFresh,
  rememberGuestIdentity,
} from './session/sessionResume';

// ============================================================================
// TYPES
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

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
  // 🔥 RESUME: silent rejoin + reconnect retry (guest side)
  resumeGuest: (inviteId: string, identity: { name: string; color: string }) => void;
  retryGuestConnection: () => void;
  /** Ref-based hook: invoked once when the reconnect loop gives up (UI shows backup restore). */
  onReconnectFailedRef: React.MutableRefObject<(() => void) | null>;
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
 * Resolves once at least one peer has joined the room — or with `false` after
 * timeoutMs. Uses onPeerJoin plus a getPeers() poll, so a peer that joined
 * before the listener was registered is still detected.
 */
function waitForPeer(room: TrysteroRoom, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (found: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearInterval(poll);
      resolve(found);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    const poll = setInterval(() => {
      try {
        const peers = room.getPeers();
        if (peers && Object.keys(peers as any).length > 0) finish(true);
      } catch {
        // ignore — room may be closing
      }
    }, 300);
    room.onPeerJoin(() => finish(true));
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
if (import.meta.env.DEV && typeof window !== 'undefined') {
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
    if (params.has('roomId')) return false;
    // 🔥 RESUME: THIS TAB's own record (sessionStorage) is the primary role
    // source — the shared localStorage descriptor may belong to another tab.
    const tab = readTabSession();
    if (tab && isTabSessionFresh(tab) && tab.method === 'trystero') {
      return tab.role === 'host';
    }
    // Session resume fallback: a fresh guest descriptor (no URL invite) means
    // we are a returning guest, not a host.
    const d = readSessionDescriptor();
    if (d && isDescriptorFresh(d) && d.role === 'guest' && d.method === 'trystero') return false;
    return true;
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
    armHandshakeWatchdog,
    reset: resetP2PLoading,
    armRejoin,
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

  // 🔥 RESUME: guest identity for this browser session — the color is generated
  // ONCE (not per HELO) so a rejoining guest keeps the same color.
  const identityRef = useRef<{ name: string; color: string } | null>(null);
  // 🔥 RESUME: which room peer is the host (guest side, learned from traffic)
  const hostPeerIdRef = useRef<string | null>(null);
  const lastHostPingRef = useRef(0);
  const hostPingWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hostPingBroadcasterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 🔥 RESUME: reconnect loop state (guest side)
  const reconnectStateRef = useRef({ attempts: 0, timer: null as ReturnType<typeof setTimeout> | null, active: false, startTime: null as number | null });
  const reconnectingRef = useRef(false);
  // Mirror of the roomId state for use inside stable callbacks
  const roomIdStateRef = useRef<string | null>(null);
  // Indirection so room callbacks can trigger the reconnect loop (defined
  // after connectToHost) without declaration-order hazards.
  const startGuestReconnectRef = useRef<(() => void) | null>(null);
  // 🔥 RESUME: hook for reconnect to report terminal failure to the UI
  const onReconnectFailedRef = useRef<(() => void) | null>(null);

  // Whether the guest has received at least one state sync from the host
  const receivedSyncRef = useRef(false);

  // Peers rejected because the host locked connections. Trystero has no way to
  // close a peer connection, so without this set the add-only reconcile loop
  // (and handleNetworkData's inbound-sender push) would re-add the rejected
  // peer and the host would keep streaming game state to it.
  const rejectedPeersRef = useRef<Set<string>>(new Set());

  // Set on the guest when the host answers with CONNECTION_LOCKED — stops the
  // HELO retry loop (each retry would pop another blocking alert).
  const connectionLockedRef = useRef(false);

  // Interval keeping the connection list in sync with the room's peer set
  const reconcileTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 🔥 RECONNECT FIX: the room instance the reconnect loop just left. A
  // follow-up joinRoom(sameId) may return this still-occupied zombie until
  // trystero's async leave() releases it — see connectToHost's poll loop.
  const lastLeftRoomRef = useRef<TrysteroRoom | null>(null);

  const reconcile = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    reconcileConnections(room, connectionsRef.current, sendRef.current);
    // Drop peers this host has rejected — reconcile is add-only and would
    // otherwise resurrect them from getPeers() on every tick.
    if (rejectedPeersRef.current.size > 0) {
      const list = connectionsRef.current;
      for (let i = list.length - 1; i >= 0; i--) {
        if (rejectedPeersRef.current.has(list[i].peerId)) {
          list.splice(i, 1);
        }
      }
    }
  }, []);

  // Room ID for Trystero
  const [roomId, setRoomId] = useState<string | null>(null);
  roomIdStateRef.current = roomId;

  // ============================================================================
  // NETWORK DATA HANDLER — delegates to the shared session protocol
  // ============================================================================

  const protocolHandlerRef = useRef<(data: any, senderConn: any) => void>(() => {});

  // 🔥 RECONNECT MODAL: the host announces its own unload (F5 / tab close) so
  // every guest flips to 'reconnecting' and shows the blocking reconnect
  // modal at once — instead of freezing silently until the transport-level
  // reconnect happens (or the HOST_PING watchdog fires 45s later).
  useEffect(() => {
    if (!isHost) return;
    const notifyGuests = () => {
      try {
        sendRef.current?.({ type: 'HOST_RELOADING' });
      } catch {
        // channel may already be dead — nothing to do
      }
    };
    window.addEventListener('pagehide', notifyGuests);
    window.addEventListener('beforeunload', notifyGuests);
    return () => {
      window.removeEventListener('pagehide', notifyGuests);
      window.removeEventListener('beforeunload', notifyGuests);
    };
  }, [isHost]);
  // 🔥 RESUME: fired by the protocol when a full SYNC_STATE is applied — the
  // guest session is (re)established. Persist the descriptor, stop reconnecting.
  const onSessionEstablished = useCallback(() => {
    if (isHost) return;
    const roomId = roomIdStateRef.current;
    const identity = identityRef.current;
    if (roomId && identity && (reconnectingRef.current || shouldRefreshGuestDescriptor(roomId))) {
      writeGuestDescriptor('trystero', roomId, {
        playerId: getPlayerId(),
        playerName: identity.name,
        playerColor: identity.color,
      });
    }
    if (reconnectingRef.current) {
      logger.log('[P2P][Trystero] Rejoin complete — session re-established');
    }
    reconnectingRef.current = false;
    reconnectStateRef.current = { attempts: 0, timer: null, active: false, startTime: null };
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

  const handleNetworkData = useCallback((data: any, peerId: string) => {
    if (data?.type === 'SYNC_STATE') {
      receivedSyncRef.current = true;
    }
    // 🔥 RECONNECT MODAL: the host announced its own reload (F5). Trystero
    // often self-heals the room within a second when the host comes back, so
    // without this the guest froze silently with no indication. Flip to
    // 'reconnecting' immediately — the SessionResumeBanner shows the blocking
    // modal, and onSessionEstablished (host's SYNC_STATE lands) flips the
    // status back to 'connected' and the game continues.
    if (!isHost && data?.type === 'HOST_RELOADING') {
      // Note: lastHostPingRef is deliberately NOT refreshed here — the HOST_PING
      // watchdog must keep counting from the last REAL traffic so it kicks in
      // if the host never comes back.
      setConnectionStatus('reconnecting');
      return;
    }
    // 🔥 RESUME: liveness tracking (guest side). The host broadcasts HOST_PING
    // every 10s; any game-protocol traffic from a peer also proves it is alive.
    // HOST_PING is intercepted here — it must not reach the protocol dispatcher
    // (it would spam the RECV log every 10 seconds).
    if (!isHost && peerId && (
      data?.type === 'HOST_PING' ||
      data?.type === 'SYNC_STATE' ||
      data?.type === 'PACKS_NEEDED'
    )) {
      hostPeerIdRef.current = peerId;
      lastHostPingRef.current = Date.now();
      if (data?.type === 'HOST_PING') return;
    }
    // A locked host keeps rejecting this guest. Remember it so the HELO retry
    // loop stops (each retry pops another blocking alert) and surface the
    // failure in the loading modal — the PeerJS guest path does the same
    // (setConnectionStatus('disconnected') + modal cleanup).
    if (data?.type === 'CONNECTION_LOCKED' && !isHost) {
      connectionLockedRef.current = true;
      // 🔥 RESUME: stop the reconnect loop — the host refused us on purpose.
      reconnectingRef.current = false;
      const rst = reconnectStateRef.current;
      if (rst.timer) { clearTimeout(rst.timer); rst.timer = null; }
      rst.active = false;
      setConnectionStatus('disconnected');
      updateP2PLoadingStep('handshake', 'error', 'The host has locked new connections');
    }
    // Rejected peers must never re-enter the broadcast list — their inbound
    // traffic would otherwise re-add them below and re-leak game state.
    if (peerId && rejectedPeersRef.current.has(peerId)) {
      sendRef.current?.({ type: 'CONNECTION_LOCKED' }, peerId);
      return;
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
  }, [reconcile, isHost, setConnectionStatus, updateP2PLoadingStep]);

  // ============================================================================
  // INITIALIZE HOST
  // ============================================================================

  const initializeHost = useCallback(() => {
    logger.log('[P2P][Trystero] init host');

    if (roomRef.current) {
      logger.warn('[P2P][Trystero] init host skipped — already initialized');
      return;
    }

    updateP2PLoadingStep('connect', 'loading', 'Creating room...');
    setConnectionStatus('connecting');
    liveConnections.length = 0; // fresh list for the new room

    // 🔥 RESUME: reuse the persisted room id so the invite link (?roomId=)
    // keeps working after a host refresh and guests can re-attach. Trystero
    // rooms are implicit — rejoining a stale id always succeeds. The id lives
    // in a dedicated key (not the shared descriptor): a guest tab in the same
    // browser overwrites the descriptor, the host must keep its own room id.
    const newRoomId = getHostInviteId('trystero')
      ?? `nexus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    persistHostRoomId(newRoomId);
    writeHostDescriptor('trystero', newRoomId);
    setRoomId(newRoomId);

    const config = {
      appId: 'nexus-game-table',
      relayUrls: TORRENT_TRACKERS,
    };

    logger.log('[P2P][Trystero] room created:', newRoomId, `(${TORRENT_TRACKERS.length} trackers)`);

    const room = joinRoom(config, newRoomId, {
      onJoinError: (details) => {
        logger.error('[P2P][Trystero] Room join error:', details);
      },
    }) as unknown as TrysteroRoom;
    roomRef.current = room;
    if (trysteroDbg) trysteroDbg.room = room;

    // Create messaging action using Trystero's makeAction
    const [send, getData] = room.makeAction('messaging');
    sendRef.current = (data: any, targetPeers?: string) => {
      if (trysteroDbg) {
        trysteroDbg.sent++;
        trysteroDbg.log.push(`SEND ${data?.type} -> ${targetPeers || 'all'} #${trysteroDbg.sent}`);
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

    // Register for direct P2P sync (token sliders/counters, character blocks) —
    // broadcast*() in directP2PSync reads these; without registration those
    // updates silently go nowhere on this transport.
    registerP2PConnections({
      hostConnection: null,
      connections: connectionsRef.current,
      isHost: true,
    });

    // Handle peer join
    room.onPeerJoin((peerId: string) => {
      logger.log('[P2P][Trystero] PEER JOIN', peerId.slice(0, 8));

      // Connection lock (parity with the PeerJS host accept path): reject the
      // peer without adding it to the broadcast list.
      if (stateRef.current?.connectionsLocked) {
        logger.warn('[P2P][Trystero] Connections locked — rejecting peer', peerId.slice(0, 8));
        rejectedPeersRef.current.add(peerId);
        sendRef.current?.({ type: 'CONNECTION_LOCKED' }, peerId);
        return;
      }

      reconcile();
      updateP2PLoadingStep('p2p', 'success', 'P2P connection established');

      // Backup push: the HELO reply can race with the peer's receive pipeline
      // and get lost, leaving the guest with an empty table. Mirrors the PeerJS
      // host accept sequence (PACKS_NEEDED + filtered initial state).
      setTimeout(() => {
        if (roomRef.current === room && sendRef.current) {
          logger.log('[P2P][Trystero] backup packs+state →', peerId.slice(0, 8));
          sendRef.current(buildPacksNeeded(stateRef.current), peerId);
          sendRef.current(buildInitialSyncState(stateRef.current), peerId);
          // The guest just received everything — rebase the deletion-diff
          // baseline so the next partial sync only reports changes from now on
          // (and cascade deletions are covered from the very first sync).
          differentialSyncManager.resetKnownIds(stateRef.current?.objects || {});
        }
      }, 1500);
    });

    // Handle peer leave
    room.onPeerLeave((peerId: string) => {
      logger.info('[P2P][Trystero] PEER LEAVE', peerId.slice(0, 8));
      const idx = connectionsRef.current.findIndex(c => c.peerId === peerId);
      if (idx !== -1) connectionsRef.current.splice(idx, 1);
    });

    setConnectionStatus('connected');
    updateP2PLoadingStep('connect', 'success', 'Room created: ' + newRoomId.slice(0, 20) + '...');

    // 🔥 RESUME: HOST_PING heartbeat — a room-only transport gives the guest no
    // close event when the host tab dies, so guests detect host loss via this
    // ping going silent (watchdog on the guest side, see startGuestReconnect).
    if (hostPingBroadcasterRef.current) clearInterval(hostPingBroadcasterRef.current);
    hostPingBroadcasterRef.current = setInterval(() => {
      if (roomRef.current && sendRef.current) {
        try {
          sendRef.current({ type: 'HOST_PING' });
        } catch (e) {
          logger.warn('[P2P][Trystero] HOST_PING send failed:', e);
        }
      }
    }, 10000);
  }, [updateP2PLoadingStep, handleNetworkData, localDispatch, stateRef, reconcile]);

  // ============================================================================
  // CONNECT TO HOST (GUEST)
  // ============================================================================

  const connectToHost = useCallback(async (roomIdToJoin: string, playerName: string, opts?: { rejoin?: boolean }) => {
    const rejoin = !!opts?.rejoin;
    logger.log('[P2P][Trystero] init guest — joining room:', roomIdToJoin, rejoin ? '(rejoin)' : '');

    // 🔥 RESUME: on a rejoin, armRejoin (instead of a plain reset) keeps
    // SYNC_STATE buffering disabled — nothing would call onPackLoaded (the join
    // modal never shows) and the rejoin would deadlock.
    if (rejoin) {
      armRejoin();
      updateP2PLoadingStep('connect', 'loading', 'Reconnecting to host room...');
    } else {
      resetP2PLoading();
      updateP2PLoadingStep('connect', 'loading', 'Joining room...');
    }
    // 🔥 RECONNECT MODAL: a rejoin attempt keeps 'reconnecting' for its whole
    // duration (waitForPeer included) so the blocking reconnect modal stays
    // up until the session is really re-established. 'connecting' remains
    // reserved for the INITIAL join (which shows the join modal instead).
    setConnectionStatus(rejoin ? 'reconnecting' : 'connecting');

    const config = {
      appId: 'nexus-game-table',
      relayUrls: TORRENT_TRACKERS,
    };

    try {
      // 🔥 RECONNECT FIX: trystero's joinRoom returns the STILL-OCCUPIED
      // (leaving) room instance when rejoining the same id — `occupiedRooms`
      // is vacated only at the very END of the async leave(). Joining that
      // zombie produced "Room join error" plus a full 15s blind window per
      // attempt (the user-visible "modal went away but sync was dead" bug).
      // Poll until a FRESH room instance appears (the old leave finished).
      let room: TrysteroRoom | null = null;
      let joinError = false;
      const joinDeadline = Date.now() + 8000;
      while (!room && !joinError && Date.now() < joinDeadline) {
        room = await new Promise<TrysteroRoom | null>((resolve) => {
          let done = false;
          const r = joinRoom(config, roomIdToJoin, {
            onJoinError: (details) => {
              logger.error('[P2P][Trystero] Room join error:', details);
              joinError = true;
              if (!done) {
                done = true;
                resolve(null);
              }
            },
          }) as unknown as TrysteroRoom;
          if (r !== lastLeftRoomRef.current) {
            if (!done) {
              done = true;
              resolve(r);
            }
          } else {
            // Still the leaving zombie — its async leave hasn't released the
            // room slot yet. Wait a beat and poll again.
            setTimeout(() => {
              if (!done) {
                done = true;
                resolve(null);
              }
            }, 200);
          }
        });
        if (!room && !joinError) await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!room || joinError) {
        logger.error('[P2P][Trystero] Could not obtain a fresh room for join');
        if (rejoin) {
          // 🔥 RECONNECT MODAL: a rejoin attempt can race with the swarm
          // self-heal — the host came back and SYNC_STATE already landed,
          // which reset the reconnect loop via onSessionEstablished. A stale
          // attempt failing after that must not flip the guest to
          // 'disconnected' with the loop dead: the session IS alive.
          if (!reconnectingRef.current) {
            setConnectionStatus('connected');
            return;
          }
          setConnectionStatus('reconnecting');
          return; // the reconnect loop schedules the next attempt
        }
        setConnectionStatus('disconnected');
        updateP2PLoadingStep('connect', 'error', 'Failed to join room (tracker error)');
        return;
      }
      lastLeftRoomRef.current = null;
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
      // `open: true` is also required: directP2PSync's guest path checks
      // hostConnection.open before sending.
      hostConnectionRef.current = {
        open: true,
        send: (data: any) => {
          const current = sendRef.current;
          if (current) current(data);
        },
      };

      // Register for direct P2P sync (token sliders/counters, character blocks)
      registerP2PConnections({
        hostConnection: hostConnectionRef.current,
        connections: connectionsRef.current,
        isHost: false,
      });

      // Mark connected as soon as the send channel exists — the guest's
      // dispatch path drops actions silently while connectionStatus is
      // 'connecting', and tracker discovery can legitimately take 10+s.
      // Messages sent before the host is discovered are lost either way, but
      // this avoids an extra silent window AFTER the peer is reachable.
      // 🔥 RECONNECT MODAL: a REJOIN keeps 'reconnecting' instead — flipping
      // to 'connected' here hid the whole rejoin window from the UI (the
      // reconnect modal never showed during host F5 recovery), and the modal
      // blocks guest input anyway, so nothing is lost to the dispatch gate.
      // onSessionEstablished flips the status to 'connected' when the host's
      // SYNC_STATE lands and the session is really re-established.
      if (!rejoin) {
        setConnectionStatus('connected');
      }

      // Wait until a peer actually joins the room. Tracker discovery can take
      // a while (slow/remote wss trackers) — a HELO sent into an empty room is
      // simply lost, leaving the guest with no game state.
      // 🔥 RESUME: a rejoin attempt waits only 15s per attempt — when the host
      // is really there, discovery is fast; when it's gone, the reconnect loop
      // cycles instead of hanging 80s per attempt.
      updateP2PLoadingStep('connect', 'loading', 'Waiting for peers via trackers...');
      const discoveryStart = Date.now();
      // Keep the user informed — a slow tracker can take well over 20s
      const slowTrackerTimer = rejoin ? null : setTimeout(() => {
        updateP2PLoadingStep('connect', 'loading',
          'Still looking for the host via trackers (this can take up to 80 seconds)...');
      }, 15000);
      const found = await waitForPeer(room, rejoin ? 15000 : 80000);
      if (slowTrackerTimer) clearTimeout(slowTrackerTimer);
      if (!found) {
        logger.error(`[P2P][Trystero] No peers discovered within ${rejoin ? 15 : 80}s${rejoin ? ' — reconnect attempt failed' : ' — aborting join'}`);
        if (rejoin) {
          // 🔥 RECONNECT MODAL: same self-heal race as the join-error path —
          // if the reconnect loop was reset (onSessionEstablished ran, SYNC_STATE
          // applied), the session is alive and this stale attempt must not
          // flip the guest to 'disconnected'.
          if (!reconnectingRef.current) {
            setConnectionStatus('connected');
            return;
          }
          setConnectionStatus('reconnecting');
          return; // the reconnect loop schedules the next attempt
        }
        setConnectionStatus('disconnected');
        updateP2PLoadingStep('connect', 'error',
          'Could not find the host via trackers. Make sure the host window is open and the game is hosted, then press "Retry connection".');
        return;
      }
      logger.log('[P2P][Trystero] peer discovered in', Date.now() - discoveryStart, 'ms');

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

      // 🔥 RESUME: guest-side host-loss detection. Trystero gives no close
      // event for a silently dead host tab — combine onPeerLeave (host tracked
      // via HOST_PING / SYNC_STATE senders) with a ping watchdog.
      room.onPeerLeave((leftPeerId: string) => {
        if (leftPeerId === hostPeerIdRef.current && !isHost) {
          logger.warn('[P2P][Trystero] Host peer left the room — scheduling reconnect');
          startGuestReconnectRef.current?.();
        }
        // Also drop the leaving peer from the broadcast list (host side keeps
        // its own registration from initializeHost).
        const idx = connectionsRef.current.findIndex(c => c.peerId === leftPeerId);
        if (idx !== -1) connectionsRef.current.splice(idx, 1);
      });
      if (hostPingWatchdogRef.current) clearInterval(hostPingWatchdogRef.current);
      hostPingWatchdogRef.current = setInterval(() => {
        if (isHost || reconnectingRef.current) return;
        // Only judge liveness once the session was actually established
        if (!receivedSyncRef.current || !hostPeerIdRef.current) return;
        if (roomRef.current !== room) {
          if (hostPingWatchdogRef.current) clearInterval(hostPingWatchdogRef.current);
          return;
        }
        if (Date.now() - lastHostPingRef.current > 45000) {
          logger.warn('[P2P][Trystero] No HOST_PING from host for 45s — scheduling reconnect');
          startGuestReconnectRef.current?.();
        }
      }, 15000);

      // Send HELO to room
      // 🔥 RESUME: color is generated once per browser session and reused on
      // every HELO so a rejoining guest keeps the same color.
      const playerColor = identityRef.current?.color
        ?? '#' + Math.floor(Math.random() * 16777215).toString(16);
      identityRef.current = { name: playerName, color: playerColor };
      // 🔥 RESUME: remember for the next join's name prefill
      rememberGuestIdentity(playerName, playerColor);
      const myPlayer: Player = {
        id: getPlayerId(),
        name: playerName,
        color: playerColor,
        isGM: false
      };

      send({ type: 'HELO', payload: myPlayer });
      logger.log('[P2P][Trystero] HELO sent');
      // On a rejoin the player may still be in local state — don't duplicate.
      if (!stateRef.current?.players?.some((p: Player) => p.id === myPlayer.id)) {
        localDispatch({ type: 'ADD_PLAYER', payload: myPlayer });
      }
      localDispatch({ type: 'SET_ACTIVE_ID', payload: myPlayer.id });

      // Retry HELO until the host's state sync arrives — the first reply can
      // be lost while the peer connection is still settling on either side.
      receivedSyncRef.current = false;
      connectionLockedRef.current = false;
      // Handshake watchdog: if the host's PACKS_NEEDED never arrives (lost
      // backup push, dead host tab), fail loudly instead of hanging forever.
      // connectionLockedRef also stops the retry interval below.
      // 🔥 RESUME: skipped on a rejoin — the reconnect loop is the watchdog
      // there (each failed attempt cycles and retries).
      if (!rejoin) {
        armHandshakeWatchdog(() => {
          logger.error('[P2P][Trystero] Handshake timeout — no PACKS_NEEDED from host in 30s');
          connectionLockedRef.current = true;
          setConnectionStatus('disconnected');
          updateP2PLoadingStep('handshake', 'error',
            'Host is not responding. The host may have closed the game — press "Retry connection".');
        });
      }
      let heloRetries = 0;
      const heloTimer = setInterval(() => {
        if (
          receivedSyncRef.current ||
          heloRetries >= 12 ||
          roomRef.current !== room ||
          connectionLockedRef.current
        ) {
          clearInterval(heloTimer);
          return;
        }
        heloRetries++;
        logger.warn('[P2P][Trystero] no state yet — re-sending HELO (attempt ' + heloRetries + ')');
        send({ type: 'HELO', payload: myPlayer });
      }, 1500);

      setConnectionStatus('connected');
      updateP2PLoadingStep('p2p', 'success', 'Connected to room');
      // Handshake is NOT complete yet — HELO was just sent. The protocol marks
      // this step 'Connected to host!' when the host's PACKS_NEEDED arrives.
      updateP2PLoadingStep('handshake', 'loading', 'Waiting for host response...');

    } catch (error) {
      logger.error('[P2P][Trystero] Failed to connect:', error);
      setConnectionStatus('disconnected');
      updateP2PLoadingStep('connect', 'error', 'Failed to connect');
    }
  }, [updateP2PLoadingStep, resetP2PLoading, handleNetworkData, localDispatch, armHandshakeWatchdog, armRejoin, stateRef]);

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
  // 🔥 RESUME: GUEST RECONNECT LOOP — re-attach to the same room after host
  // loss (host refresh / network blip). Each attempt reuses the persisted
  // identity; the host's HELO dedupe keeps a single Player entry.
  // ============================================================================

  const GUEST_RECONNECT_INTERVAL_MS = 5000;
  const GUEST_RECONNECT_MAX_ATTEMPTS = 12;
  const GUEST_RECONNECT_MAX_MS = 3 * 60 * 1000; // 3-minute total budget

  const startGuestReconnect = useCallback(() => {
    if (reconnectingRef.current) return;
    const roomIdToJoin = roomIdStateRef.current;
    const identity = identityRef.current;
    if (!roomIdToJoin || !identity) {
      // Never fully joined — nothing to resume.
      setConnectionStatus('disconnected');
      return;
    }

    reconnectingRef.current = true;
    reconnectStateRef.current = { attempts: 0, timer: null, active: true, startTime: null };
    setConnectionStatus('reconnecting');
    logger.log('[P2P][Trystero] Guest reconnect loop started for room', roomIdToJoin);

    const attempt = async () => {
      const st = reconnectStateRef.current;
      if (!reconnectingRef.current) return; // re-established or stopped elsewhere

      st.attempts++;
      const elapsed = Date.now() - (st.startTime ?? (st.startTime = Date.now()));
      if (st.attempts > GUEST_RECONNECT_MAX_ATTEMPTS || elapsed > GUEST_RECONNECT_MAX_MS) {
        logger.error('[P2P][Trystero] Guest reconnect gave up — host unreachable');
        reconnectingRef.current = false;
        st.active = false;
        st.timer = null;
        setConnectionStatus('disconnected');
        onReconnectFailedRef.current?.();
        return;
      }

      logger.log(`[P2P][Trystero] Reconnect attempt ${st.attempts}/${GUEST_RECONNECT_MAX_ATTEMPTS}`);
      try {
        // Tear down the stale room before rejoining (fresh peer connections).
        // ⚠️ Trystero's leave() is ASYNC (sends the leave signal, waits ~100ms,
        // then destroys the peers). Fire-and-forget here made the very next
        // joinRoom(sameId) collide with the old room's teardown — the new
        // room's shared peers were killed by "User-Initiated Abort: Close
        // called" and attempt 1 ALWAYS timed out (15s blind), so a host F5
        // left host and guest playing separately for 20s+ per reconnect.
        const oldRoom = roomRef.current;
        if (oldRoom) {
          lastLeftRoomRef.current = oldRoom;
          try {
            await Promise.race([
              oldRoom.leave(),
              new Promise(resolve => setTimeout(resolve, 3000)), // don't let a hung leave stall the loop
            ]);
          } catch { /* ignore */ }
          if (roomRef.current === oldRoom) roomRef.current = null;
        }
        liveConnections.length = 0;
        hostConnectionRef.current = null;
        sendRef.current = null;

        await connectToHost(roomIdToJoin, identity.name, { rejoin: true });
      } catch (e) {
        logger.error('[P2P][Trystero] Reconnect attempt threw:', e);
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
    reconnectStateRef.current = { attempts: 0, timer: null, active: false, startTime: null };
    reconnectingRef.current = false;
    startGuestReconnect();
  }, [startGuestReconnect]);

  /** 🔥 RESUME: silent auto-rejoin entry point (no name modal). */
  const resumeGuest = useCallback((inviteId: string, identity: { name: string; color: string }) => {
    identityRef.current = identity;
    connectToHost(inviteId, identity.name, { rejoin: true });
  }, [connectToHost]);

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
      // 🔥 RESUME: stop heartbeats, watchdogs and any pending reconnects
      if (hostPingBroadcasterRef.current) {
        clearInterval(hostPingBroadcasterRef.current);
        hostPingBroadcasterRef.current = null;
      }
      if (hostPingWatchdogRef.current) {
        clearInterval(hostPingWatchdogRef.current);
        hostPingWatchdogRef.current = null;
      }
      reconnectingRef.current = false;
      const rst = reconnectStateRef.current;
      if (rst.timer) { clearTimeout(rst.timer); rst.timer = null; }
      rst.active = false;
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
    // 🔥 RESUME: reconnection surface
    resumeGuest,
    retryGuestConnection,
    onReconnectFailedRef,
  };
}
