/**
 * THE game-session protocol dispatcher.
 *
 * Every network message ({type, payload}) exchanged between host and guests is
 * handled here — this is the single definition of the wire protocol. Transports
 * (peerjs / trystero / iroh / manual) only deliver bytes; they call this handler.
 *
 * Extracted verbatim from usePeerConnection.handleNetworkData — the canonical
 * implementation. Do NOT normalize SYNC_STATE payloads: they may be partial
 * ({_isPartial, _changeCount}) and the reducer branches on those flags.
 */

import { Action } from '../gameActions';
import { Player, PackInfo } from '../../types';
import { logger } from '../../utils/logger';
import { decompressWebRTCData } from '../../utils/dataCompression';
import { registerRemoteMovement } from '../../utils/remoteMovementAnimator';
import { filterLocalPanelProperties } from '../../utils/panelSync';
import { filterObjectsForBroadcast } from '../../utils/individualPositions';
import { differentialSyncManager } from '../../utils/webrtcOptimization';
import {
  handleDirectSyncMessage,
  DirectP2PMessage
} from '../../utils/directP2PSync';
import type { SessionUx } from './sessionUx';

// ============================================================================
// TYPES
// ============================================================================

/** Duck-typed connection that the protocol replies to (PeerJS conn or adapter). */
export interface SenderConn {
  peer?: string;
  peerId?: string;
  send: (msg: any) => void;
  open?: boolean;
}

export interface ProtocolDeps {
  localDispatch: React.Dispatch<Action>;
  stateRef: React.RefObject<any>;
  isHost: boolean;
  /** Live guest connections (for DIRECT_SYNC host relay) */
  getConnections: () => any[];
  ux: SessionUx;
}

// ============================================================================
// OUTBOUND MESSAGE BUILDERS (host → guest)
// ============================================================================

/** PACKS_NEEDED — first message a guest receives; carries used packs + player number. */
export function buildPacksNeeded(state: any): { type: 'PACKS_NEEDED'; payload: any } {
  const usedPacks: Record<string, PackInfo> = state?.usedPacks || {};
  const packList = Object.values(usedPacks);

  // Calculate next player number (count non-GM players + 1)
  const players: Player[] = state?.players || [];
  const nonGMCount = players.filter(p => !p.isGM).length;
  const nextPlayerNumber = nonGMCount + 1;

  return {
    type: 'PACKS_NEEDED',
    payload: {
      packs: packList.map(p => ({
        name: p.name,
        hash: p.hash,
        size: p.size
      })),
      nextPlayerNumber
    }
  };
}

/** Initial full SYNC_STATE with local panel props and individual-object positions filtered out. */
export function buildInitialSyncState(state: any): { type: 'SYNC_STATE'; payload: any } {
  const stateToSend = { ...state };
  if (stateToSend.objects) {
    let filteredObjects = filterLocalPanelProperties(stateToSend.objects);
    // Also filter out individual objects (on layers with individualObjects enabled)
    filteredObjects = filterObjectsForBroadcast(filteredObjects, stateToSend.hyperscaleLayers);
    stateToSend.objects = filteredObjects;
  }
  return { type: 'SYNC_STATE', payload: stateToSend };
}

/**
 * Accept push (host → guest right after the data channel opens): PACKS_NEEDED +
 * initial SYNC_STATE. Retried while the channel is still closing/opening — a
 * single fire-and-forget send used to be silently skipped by
 * `if (!conn.open) return` and left the guest deadlocked on the handshake step.
 */
export function sendAcceptPush(
  conn: SenderConn,
  getState: () => any,
  attempts = 6
): void {
  const trySend = (left: number) => {
    if (!conn.open) {
      if (left > 0) {
        setTimeout(() => trySend(left - 1), 250);
      } else {
        logger.error('[P2P][Session] Accept push aborted — connection never opened');
      }
      return;
    }
    logger.log('[P2P][Session] Accept push sent');
    conn.send(buildPacksNeeded(getState()));
    conn.send(buildInitialSyncState(getState()));
  };
  setTimeout(() => trySend(attempts), 50);
}

/** Host-side cleanup when a guest connection drops. */
export function notifyGuestDisconnected(
  localDispatch: React.Dispatch<Action>,
  connectionsRef: { current: any[] },
  conn: any
): void {
  if (connectionsRef.current) {
    connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
  }
  localDispatch({ type: 'REMOVE_PLAYER', payload: { id: conn.peer } });
}

// ============================================================================
// INBOUND DISPATCHER
// ============================================================================

export function createProtocolHandler(deps: ProtocolDeps): (data: any, senderConn: SenderConn) => void {
  const { localDispatch, stateRef, isHost, getConnections, ux } = deps;
  const {
    setSuggestedPlayerName,
    setRequiredPacks,
    updateStep,
    cancelHandshakeWatchdog,
    packBuffer,
  } = ux;
  const {
    loadedPacksRef,
    bufferedStateRef,
    hasReceivedPacksNeededRef,
    expectedPacksCountRef,
    receivedEmptyPacksRef,
    flushBufferedSyncState,
  } = packBuffer;

  const handle = (data: any, senderConn: SenderConn) => {
    logger.log('[P2P][Session] RECV', data?.type);

    // Host has locked new connections (guest side). Each transport surfaces this
    // itself (step error / alert) — no alert here, it fired twice before.
    if (data.type === 'CONNECTION_LOCKED') {
      logger.warn('[P2P][Session] Host has locked new connections');
      return;
    }

    // Process PACKS_NEEDED BEFORE SYNC_STATE
    // This ensures guest knows which packs are needed before state sync
    if (data.type === 'PACKS_NEEDED') {
      // Guest received pack list from host
      const { packs, nextPlayerNumber } = data.payload;

      // Repeat delivery (HELO reply + onPeerJoin backup push). The pack list is
      // deterministic from host state, so just confirm the handshake and stop —
      // do NOT regress the 'packs' step or re-trigger pack loading.
      if (hasReceivedPacksNeededRef.current) {
        logger.log('[P2P][Session] PACKS_NEEDED received (repeat) — handshake already confirmed');
        updateStep('handshake', 'success', 'Connected to host!');
        cancelHandshakeWatchdog();
        return;
      }
      logger.log('[P2P][Session] PACKS_NEEDED received —', packs.length, 'pack(s)');

      // Set suggested player name (Player X where X is the next player number)
      if (nextPlayerNumber !== undefined) {
        setSuggestedPlayerName(`Player ${nextPlayerNumber}`);
      }

      // Update handshake step and show modal for player name
      updateStep('handshake', 'success', 'Connected to host!');
      updateStep('packs', 'loading', `Waiting for ${packs.length} asset pack(s)...`);

      if (packs.length > 0) {
        // Set required packs and show modal
        setRequiredPacks(packs);
        expectedPacksCountRef.current = packs.length; // Track expected count
      } else {
        // No packs needed - mark as complete
        updateStep('packs', 'success', 'No asset packs needed');
        // Track that we received empty packs list
        receivedEmptyPacksRef.current = true;

        // Apply buffered SYNC_STATE immediately if no packs needed
        flushBufferedSyncState();
      }

      // NOTE: Modal is already opened when the invite URL parameter is present

      // Mark that we received PACKS_NEEDED (for SYNC_STATE buffering)
      hasReceivedPacksNeededRef.current = true;
      cancelHandshakeWatchdog();
    } else if (data.type === 'PACK_LOADED') {
      // Host received notification that guest loaded a pack
      const { packName, hashes } = data.payload;
      const guestId = senderConn.peer || senderConn.peerId || '';

      // Get guest info
      const guest = stateRef.current?.players?.find((p: Player) => p.id === guestId);
      if (!guest) {
        return;
      }

      // Find pack info to get hash
      const usedPacks: Record<string, PackInfo> = stateRef.current?.usedPacks ?? {};
      const packInfo = Object.values(usedPacks).find(p => p.name === packName);
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

      // Buffer SYNC_STATE until packs are loaded (prevents race condition)
      // Check if we need to wait for pack loading
      const needsPacks = expectedPacksCountRef.current > 0 && loadedPacksRef.current.size < expectedPacksCountRef.current;
      const waitingForPacksNeeded = !hasReceivedPacksNeededRef.current;

      if (needsPacks || waitingForPacksNeeded) {
        bufferedStateRef.current = payload;
        updateStep('state', 'loading', 'Waiting for asset packs...');
        return; // Don't dispatch yet
      }

      // Update progress - state synchronized
      updateStep('state', 'loading', 'Synchronizing game state...');

      // NOTE: payload passes through UNMODIFIED — it may be a partial update
      // ({_isPartial, _changeCount}) that the reducer branches on.
      localDispatch({ type: 'SYNC_STATE', payload });

      // Mark state as complete immediately
      // Images will be loaded from packs by the guest
      updateStep('state', 'success', 'Game synchronized!');

      // Check if game likely needs asset packs but host didn't register any
      if (receivedEmptyPacksRef.current && payload.usedPacks && Object.keys(payload.usedPacks).length === 0) {
        // Check if any objects have image content (sha256: hashes or URLs)
        const objectsHaveImages = Object.values(payload.objects || {}).some((obj: any) => {
          return !!(obj.content && (
            obj.content.startsWith('sha256:') ||
            obj.content.startsWith('http://') ||
            obj.content.startsWith('https://') ||
            obj.content.startsWith('data:image/')
          ));
        });

        if (objectsHaveImages) {
          logger.warn('[Session] Host did not register any packs, but game state contains image objects — assets may be missing');
        }
      }
    } else if (data.type === 'PLAYER_PANEL_SETTINGS') {
      // Guest received their individual panel settings from host
      const { settings } = data.payload;

      localDispatch({
        type: 'APPLY_PLAYER_PANEL_SETTINGS',
        payload: { settings }
      });
    } else if (data.type === 'POSITION_UPDATE') {
      // Lightweight position update for smooth dragging (batched)
      // Includes effect template properties (rotation, width, height, pivot, etc.)
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
        // 🔧 Objects held in a cursor slot are position-frozen for everyone
        // except the holder
        if (stateRef.current.objects[pos.id]?.inCursorSlot === true) {
          return;
        }
        const existingObj = stateRef.current.objects[pos.id];
        if (existingObj) {
          // 🔧 Remote movement animation for big sync jumps
          if (pos.x !== undefined && pos.y !== undefined && existingObj.x !== undefined &&
              (Math.abs(existingObj.x - pos.x) > 20 || Math.abs(existingObj.y - pos.y) > 20)) {
            registerRemoteMovement(pos.id, existingObj.x, existingObj.y, pos.x, pos.y);
          }
          localDispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              ...pos,
              skipNetworkSync: true // Prevent re-broadcasting to host
            }
          });
        }
      });
    } else if (data.type === 'HELO') {
      // Host received new player info
      const newPlayer = data.payload;

      // Connection lock enforcement (parity with the PeerJS host accept path):
      // a locked host does not accept new players.
      if (stateRef.current?.connectionsLocked) {
        senderConn.send({ type: 'CONNECTION_LOCKED' });
        return;
      }

      // Self-healing handshake: the Trystero host pushes PACKS_NEEDED exactly
      // once (1.5s after onPeerJoin) and the guest may not be listening yet —
      // answering EVERY HELO (first try or retry) makes the handshake recover
      // on its own. The guest's repeat-guard makes duplicates harmless.
      logger.log('[P2P][Session] HELO received — replying PACKS_NEEDED');
      senderConn.send(buildPacksNeeded(stateRef.current));

      // Retry HELOs from an already-known player: skip the duplicate ADD_PLAYER
      // (avoids re-render churn) but still re-send the full state below.
      const knownPlayer = stateRef.current?.players?.some((p: Player) => p.id === newPlayer.id);
      if (!knownPlayer) {
        localDispatch({ type: 'ADD_PLAYER', payload: newPlayer });
      }

      // Wait for state to update before sending SYNC_STATE
      // localDispatch is async, so we need to wait for the next tick to get updated state
      setTimeout(() => {
        // Filtered initial state (same as the backup push): strips local panel
        // props and individual-object positions the guest must not receive —
        // the raw state also leaks those and is slightly larger.
        const reply = buildInitialSyncState(stateRef.current);

        // Verify that new player is in the state before sending
        const playerExists = reply.payload.players?.some((p: any) => p.id === newPlayer.id);
        if (!playerExists) {
          // Retry after another tick
          setTimeout(() => {
            senderConn.send({ type: 'SYNC_STATE', payload: buildInitialSyncState(stateRef.current).payload });
            // Guest received everything — rebase the deletion-diff baseline so
            // the next partial sync only reports changes from now on.
            differentialSyncManager.resetKnownIds(stateRef.current?.objects || {});
          }, 50);
        } else {
          senderConn.send({ type: 'SYNC_STATE', payload: reply.payload });
          // Guest received everything — rebase the deletion-diff baseline so
          // the next partial sync only reports changes from now on (otherwise
          // it stays null until the first full sync and cascade deletions in
          // that window are never tombstoned to this guest).
          differentialSyncManager.resetKnownIds(stateRef.current?.objects || {});
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


      // 🔧 Remote cursor-slot pickup: sync ONLY the inCursorSlot flag — the
      // -999999 hide position stays on the holding client. The host's object
      // keeps its origin, rendered locked/dimmed until the holder drops.
      // 🔧 FIX: the rebuild previously dropped the `payload` wrapper entirely
      // ({type, id, inCursorSlot} instead of {type, payload: {id, ...}}) — the
      // reducer crashed on payload.id and the guest's pickup was silently lost,
      // so the host and the other guests never saw the lock or the movement.
      // Accept both payload shapes: flat {id, inCursorSlot} and wrapped
      // {id, updates: {inCursorSlot, x: -999999, ...}}.
      const incomingAction: any = data.payload;
      const incomingBody: any = incomingAction?.payload;
      if (incomingAction?.type === 'UPDATE_OBJECT' && incomingBody?.inCursorSlot === true) {
        data.payload = {
          type: 'UPDATE_OBJECT',
          payload: {
            id: incomingAction.id ?? incomingBody.id,
            inCursorSlot: true,
            // The holder is the SENDING client, not the host
            cursorSlotOwnerId: senderConn.peer || senderConn.peerId,
          },
        };
      }

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
      // Direct P2P sync for sliders and character blocks
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
        localDispatch(action as Action);

        // If we're host, relay the direct sync to other guests
        if (isHost) {
          getConnections().forEach((conn: any) => {
            if (conn.open && conn.peer !== senderConn.peer) {
              try {
                conn.send(data);
              } catch (e) {
                // Direct sync relay failed
              }
            }
          });
        }
      }
    }
  };

  // A throw inside a message handler used to kill the join silently — the guest
  // just hung on the current loading step. Surface it instead.
  return (data: any, senderConn: SenderConn) => {
    try {
      handle(data, senderConn);
    } catch (e) {
      logger.error('[P2P][Session] Handler error for', data?.type, e);
      if (!isHost && (data?.type === 'PACKS_NEEDED' || data?.type === 'SYNC_STATE')) {
        updateStep('state', 'error', 'Synchronization error — see console (F12)');
      }
    }
  };
}
