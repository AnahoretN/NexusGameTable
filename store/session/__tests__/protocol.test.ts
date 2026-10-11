/**
 * Unit tests for the wire-protocol dispatcher (store/session/protocol.ts).
 *
 * Covers the historically bug-prone behaviors:
 * - PACKS_NEEDED repeat-guard (HELO reply + onPeerJoin backup push must not
 *   re-trigger pack loading) — see handshake PACKS_NEEDED invariant.
 * - SYNC_STATE buffering until packs are ready; partial payloads pass through
 *   UNMODIFIED (the reducer branches on {_isPartial, _changeCount}).
 * - Cursor-slot pickup rebuild: the payload wrapper must survive the rebuild.
 * - POSITION_UPDATE: cursor-slot objects are position-frozen, unknown ids are
 *   ignored, big jumps animate.
 * - HELO: add/update/rejoin, connection lock, post-sync delete-baseline reset.
 * - Local-only actions filtered; DIRECT_SYNC host relay.
 *
 * All side-effecting utils are module-mocked; timers are faked.
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

// Shared spy mocks (registerRemoteMovement, differentialSyncManager, ...)
// must not leak calls between tests.
beforeEach(() => vi.clearAllMocks());

// --- module mocks (paths relative to THIS file) ---

vi.mock('../../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../utils/dataCompression', () => ({
  decompressWebRTCData: (data: any) => data,
}));

vi.mock('../../../utils/remoteMovementAnimator', () => ({
  registerRemoteMovement: vi.fn(),
}));

vi.mock('../../../utils/gridUtils', () => ({
  isAnchorAttachedObject: vi.fn(() => false),
}));

vi.mock('../../../utils/panelSync', () => ({
  filterLocalPanelProperties: (objects: any) => objects,
}));

vi.mock('../../../utils/individualPositions', () => ({
  filterObjectsForBroadcast: (objects: any) => objects,
}));

vi.mock('../../../utils/webrtcOptimization', () => ({
  differentialSyncManager: { resetKnownIds: vi.fn() },
}));

vi.mock('../../../utils/directP2PSync', () => ({
  handleDirectSyncMessage: vi.fn(),
}));

import {
  buildPacksNeeded,
  buildInitialSyncState,
  sendAcceptPush,
  notifyGuestDisconnected,
  createProtocolHandler,
  ProtocolDeps,
} from '../protocol';
import { registerRemoteMovement } from '../../../utils/remoteMovementAnimator';
import { differentialSyncManager } from '../../../utils/webrtcOptimization';
import { handleDirectSyncMessage } from '../../../utils/directP2PSync';

// --- helpers ---

function createUx() {
  return {
    setSuggestedPlayerName: vi.fn(),
    setRequiredPacks: vi.fn(),
    updateStep: vi.fn(),
    cancelHandshakeWatchdog: vi.fn(),
    packBuffer: {
      loadedPacksRef: { current: new Set<string>() },
      bufferedStateRef: { current: null as any },
      hasReceivedPacksNeededRef: { current: false },
      expectedPacksCountRef: { current: 0 },
      receivedEmptyPacksRef: { current: false },
      flushBufferedSyncState: vi.fn(),
    },
  };
}

function createDeps(overrides: Partial<ProtocolDeps> = {}) {
  const state: any = {
    players: [{ id: 'gm', name: 'GM', color: '#e74c3c', isGM: true }],
    objects: {},
    usedPacks: {},
    playerPanelSettings: {},
    activePlayerId: 'gm',
  };
  const deps: ProtocolDeps = {
    localDispatch: vi.fn(),
    stateRef: { current: state },
    isHost: false,
    getConnections: () => [],
    ux: createUx(),
    onSessionEstablished: vi.fn(),
    ...overrides,
  };
  return deps;
}

function makeConn(peer = 'peer-9', overrides: any = {}) {
  return { peer, send: vi.fn(), open: true, ...overrides };
}

// --- outbound builders ---

describe('buildPacksNeeded', () => {
  test('maps only name/hash/size and counts non-GM players for next number', () => {
    const msg = buildPacksNeeded({
      usedPacks: {
        base: { name: 'base', hash: 'h1', size: 10, extra: 'stripped' },
        art: { name: 'art', hash: 'h2', size: 20 },
      },
      players: [
        { id: 'gm', isGM: true },
        { id: 'p1', isGM: false },
      ],
    });

    expect(msg.type).toBe('PACKS_NEEDED');
    expect(msg.payload.packs).toEqual([
      { name: 'base', hash: 'h1', size: 10 },
      { name: 'art', hash: 'h2', size: 20 },
    ]);
    expect(msg.payload.nextPlayerNumber).toBe(2);
  });

  test('tolerates an empty state', () => {
    const msg = buildPacksNeeded(undefined);
    expect(msg.payload.packs).toEqual([]);
    expect(msg.payload.nextPlayerNumber).toBe(1);
  });
});

describe('buildInitialSyncState', () => {
  test('returns SYNC_STATE with the given state as payload', () => {
    const state = { objects: { a: { id: 'a' } }, players: [] };
    const msg = buildInitialSyncState(state);
    expect(msg.type).toBe('SYNC_STATE');
    expect(msg.payload.objects).toEqual({ a: { id: 'a' } });
  });

  test('does not mutate the source state', () => {
    const state = { objects: { a: { id: 'a' } } };
    buildInitialSyncState(state);
    expect(state.objects).toEqual({ a: { id: 'a' } });
  });

  test('attaches hostViewport so guests can apply relative positioning', () => {
    const state = { objects: { a: { id: 'a' } }, players: [] };
    const msg = buildInitialSyncState(state);
    expect(msg.payload.hostViewport.width).toBe(window.innerWidth);
    expect(msg.payload.hostViewport.height).toBe(window.innerHeight);
  });
});

// --- dispatcher ---

describe('protocol dispatcher — PACKS_NEEDED', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('first delivery: confirms handshake and requests packs', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);

    handler({ type: 'PACKS_NEEDED', payload: { packs: [{ name: 'base', hash: 'h1', size: 1 }], nextPlayerNumber: 3 } }, makeConn());

    expect(deps.ux.setSuggestedPlayerName).toHaveBeenCalledWith('Player 3');
    expect(deps.ux.updateStep).toHaveBeenCalledWith('handshake', 'success', 'Connected to host!');
    expect(deps.ux.updateStep).toHaveBeenCalledWith('packs', 'loading', expect.stringContaining('1'));
    expect(deps.ux.setRequiredPacks).toHaveBeenCalledWith([{ name: 'base', hash: 'h1', size: 1 }]);
    expect(deps.ux.packBuffer.expectedPacksCountRef.current).toBe(1);
    expect(deps.ux.packBuffer.hasReceivedPacksNeededRef.current).toBe(true);
    expect(deps.ux.cancelHandshakeWatchdog).toHaveBeenCalled();
    expect(deps.ux.packBuffer.flushBufferedSyncState).not.toHaveBeenCalled();
  });

  test('empty pack list: flushes buffered state immediately', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);

    handler({ type: 'PACKS_NEEDED', payload: { packs: [], nextPlayerNumber: 2 } }, makeConn());

    expect(deps.ux.setRequiredPacks).not.toHaveBeenCalled();
    expect(deps.ux.packBuffer.receivedEmptyPacksRef.current).toBe(true);
    expect(deps.ux.packBuffer.flushBufferedSyncState).toHaveBeenCalled();
  });

  test('repeat delivery: handshake confirm only, no pack re-trigger (repeat-guard)', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);
    const msg = { type: 'PACKS_NEEDED', payload: { packs: [{ name: 'base', hash: 'h1', size: 1 }], nextPlayerNumber: 2 } };

    handler(msg, makeConn());
    vi.clearAllMocks();

    handler(msg, makeConn()); // e.g. HELO reply after the onPeerJoin push

    expect(deps.ux.updateStep).toHaveBeenCalledTimes(1);
    expect(deps.ux.updateStep).toHaveBeenCalledWith('handshake', 'success', 'Connected to host!');
    expect(deps.ux.cancelHandshakeWatchdog).toHaveBeenCalled();
    expect(deps.ux.setRequiredPacks).not.toHaveBeenCalled();
    expect(deps.ux.setSuggestedPlayerName).not.toHaveBeenCalled();
  });
});

describe('protocol dispatcher — SYNC_STATE (guest)', () => {
  test('buffers while PACKS_NEEDED not yet received', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);

    const payload = { objects: { a: { id: 'a' } }, _isPartial: true, _changeCount: 1 };
    handler({ type: 'SYNC_STATE', payload }, makeConn());

    expect(deps.localDispatch).not.toHaveBeenCalled();
    expect(deps.ux.packBuffer.bufferedStateRef.current).toBe(payload); // UNMODIFIED
    expect(deps.ux.updateStep).toHaveBeenCalledWith('state', 'loading', 'Waiting for asset packs...');
    expect(deps.onSessionEstablished).not.toHaveBeenCalled();
  });

  test('buffers while packs are still loading', () => {
    const deps = createDeps();
    deps.ux.packBuffer.hasReceivedPacksNeededRef.current = true;
    deps.ux.packBuffer.expectedPacksCountRef.current = 2;
    deps.ux.packBuffer.loadedPacksRef.current = new Set(['base']); // 1 of 2
    const handler = createProtocolHandler(deps);

    handler({ type: 'SYNC_STATE', payload: { objects: {} } }, makeConn());

    expect(deps.localDispatch).not.toHaveBeenCalled();
    expect(deps.ux.packBuffer.bufferedStateRef.current).toEqual({ objects: {} });
  });

  test('dispatches unmodified payload (incl. partial flags) and establishes session', () => {
    const deps = createDeps();
    deps.ux.packBuffer.hasReceivedPacksNeededRef.current = true;
    const handler = createProtocolHandler(deps);

    const payload = { objects: { a: { id: 'a' } }, _isPartial: true, _changeCount: 1 };
    handler({ type: 'SYNC_STATE', payload }, makeConn());

    expect(deps.localDispatch).toHaveBeenCalledWith({ type: 'SYNC_STATE', payload }); // same reference
    expect(deps.ux.updateStep).toHaveBeenCalledWith('state', 'success', 'Game synchronized!');
    expect(deps.onSessionEstablished).toHaveBeenCalledTimes(1);
  });

  test('handler error is surfaced as a step error, not a crash', () => {
    const deps = createDeps();
    deps.ux.packBuffer.hasReceivedPacksNeededRef.current = true;
    deps.localDispatch = vi.fn(() => { throw new Error('reducer boom'); });
    const handler = createProtocolHandler(deps);

    expect(() =>
      handler({ type: 'SYNC_STATE', payload: { objects: {} } }, makeConn())
    ).not.toThrow();
    expect(deps.ux.updateStep).toHaveBeenCalledWith('state', 'error', expect.stringContaining('error'));
  });
});

describe('protocol dispatcher — POSITION_UPDATE', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
    deps.stateRef.current.objects = {
      'obj-1': { id: 'obj-1', x: 0, y: 0 },
      'obj-locked': { id: 'obj-locked', x: 0, y: 0, inCursorSlot: true },
    };
  });

  test('updates existing objects with skipNetworkSync', () => {
    const handler = createProtocolHandler(deps);

    handler({ type: 'POSITION_UPDATE', payload: [{ id: 'obj-1', x: 5, y: 7 }] }, makeConn());

    expect(deps.localDispatch).toHaveBeenCalledTimes(1);
    expect(deps.localDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_OBJECT',
      payload: { id: 'obj-1', x: 5, y: 7, skipNetworkSync: true },
    });
  });

  test('cursor-slot objects are position-frozen, unknown ids ignored', () => {
    const handler = createProtocolHandler(deps);

    handler({
      type: 'POSITION_UPDATE',
      payload: [
        { id: 'obj-locked', x: 50, y: 50 },
        { id: 'ghost', x: 1, y: 1 },
      ],
    }, makeConn());

    expect(deps.localDispatch).not.toHaveBeenCalled();
    expect(registerRemoteMovement).not.toHaveBeenCalled();
  });

  test('big jumps register remote movement animation (>20px)', () => {
    const handler = createProtocolHandler(deps);

    handler({ type: 'POSITION_UPDATE', payload: [{ id: 'obj-1', x: 100, y: 0 }] }, makeConn());

    expect(registerRemoteMovement).toHaveBeenCalledWith('obj-1', 0, 0, 100, 0);
    expect(deps.localDispatch).toHaveBeenCalledTimes(1);
  });

  test('small jumps do not animate', () => {
    const handler = createProtocolHandler(deps);

    handler({ type: 'POSITION_UPDATE', payload: [{ id: 'obj-1', x: 10, y: 5 }] }, makeConn());

    expect(registerRemoteMovement).not.toHaveBeenCalled();
  });
});

describe('protocol dispatcher — ACTION', () => {
  test('cursor-slot pickup: flat shape is rebuilt with the payload wrapper + owner', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);
    const conn = makeConn('peer-9');

    // Regression: the rebuild used to drop the payload wrapper, so the reducer
    // crashed on payload.id and the pickup was silently lost.
    handler({
      type: 'ACTION',
      payload: {
        type: 'UPDATE_OBJECT',
        payload: { id: 'card-1', inCursorSlot: true, x: -999999, y: -999999 },
      },
    }, conn);

    expect(deps.localDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_OBJECT',
      payload: {
        id: 'card-1',
        inCursorSlot: true,
        cursorSlotOwnerId: 'peer-9', // holder = SENDING client, not host
      },
    });
  });

  test('cursor-slot pickup: id fallback reads the action body when action-level id is absent', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);

    handler({
      type: 'ACTION',
      payload: {
        type: 'UPDATE_OBJECT',
        id: 'card-2',
        payload: { id: 'card-2', inCursorSlot: true },
      },
    }, makeConn('peer-7'));

    expect(deps.localDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_OBJECT',
      payload: { id: 'card-2', inCursorSlot: true, cursorSlotOwnerId: 'peer-7' },
    });
  });

  test('regular UPDATE_OBJECT passes through untouched', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);

    const action = { type: 'UPDATE_OBJECT', payload: { id: 'card-1', x: 10 } };
    handler({ type: 'ACTION', payload: action }, makeConn());

    expect(deps.localDispatch).toHaveBeenCalledWith(action);
  });

  test('local-only actions are dropped', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);

    for (const type of ['UPDATE_VIEW_TRANSFORM', 'SET_PIXELS_PER_VU', 'RESIZE_UI_OBJECT']) {
      handler({ type: 'ACTION', payload: { type } }, makeConn());
    }

    expect(deps.localDispatch).not.toHaveBeenCalled();
  });

  test('guest CLEAR_SAVED_STATE never resets the host (cache-clear host guard)', () => {
    // Regression: a guest's "Clear Cache" forwarded the state reset to the
    // host — the host reducer wiped its own state AND localStorage, ruining
    // the game for everyone.
    const deps = createDeps();
    const handler = createProtocolHandler(deps);

    handler({ type: 'ACTION', payload: { type: 'CLEAR_SAVED_STATE' } }, makeConn());

    expect(deps.localDispatch).not.toHaveBeenCalled();
  });
});

describe('protocol dispatcher — HELO (host)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('new player: replies PACKS_NEEDED, adds player, then syncs state', () => {
    const deps = createDeps();
    deps.isHost = true;
    const conn = makeConn('guest-1');
    const handler = createProtocolHandler(deps);
    const newPlayer = { id: 'guest-1', name: 'Player 2', color: '#00ff00', isGM: false };

    handler({ type: 'HELO', payload: newPlayer }, conn);

    expect(conn.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PACKS_NEEDED' })
    );
    expect(deps.localDispatch).toHaveBeenCalledWith({ type: 'ADD_PLAYER', payload: newPlayer });

    // Player not yet in stateRef (dispatch is a mock) → retry path sends SYNC_STATE anyway
    vi.advanceTimersByTime(60);
    const syncCall = conn.send.mock.calls.find(c => c[0].type === 'SYNC_STATE');
    expect(syncCall).toBeTruthy();
    expect(differentialSyncManager.resetKnownIds).toHaveBeenCalled();
  });

  test('rejoin with same identity: no duplicate ADD_PLAYER, state re-synced', () => {
    const deps = createDeps();
    deps.isHost = true;
    deps.stateRef.current.players.push({ id: 'guest-1', name: 'Player 2', color: '#00ff00', isGM: false });
    const conn = makeConn('guest-1');
    const handler = createProtocolHandler(deps);

    handler({ type: 'HELO', payload: { id: 'guest-1', name: 'Player 2', color: '#00ff00' } }, conn);

    expect(deps.localDispatch).not.toHaveBeenCalledWith({ type: 'ADD_PLAYER', payload: expect.anything() });

    vi.advanceTimersByTime(60);
    const syncCall = conn.send.mock.calls.find(c => c[0].type === 'SYNC_STATE');
    expect(syncCall).toBeTruthy();
  });

  test('rejoin with changed name/color: UPDATE_PLAYER instead of ADD_PLAYER', () => {
    const deps = createDeps();
    deps.isHost = true;
    deps.stateRef.current.players.push({ id: 'guest-1', name: 'Old Name', color: '#0000ff', isGM: false });
    const handler = createProtocolHandler(deps);

    handler({ type: 'HELO', payload: { id: 'guest-1', name: 'New Name', color: '#ff0000' } }, makeConn('guest-1'));

    expect(deps.localDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_PLAYER',
      payload: { id: 'guest-1', name: 'New Name', color: '#ff0000' },
    });
  });

  test('locked host rejects new players with CONNECTION_LOCKED', () => {
    const deps = createDeps();
    deps.isHost = true;
    deps.stateRef.current.connectionsLocked = true;
    const conn = makeConn('guest-1');
    const handler = createProtocolHandler(deps);

    handler({ type: 'HELO', payload: { id: 'guest-1', name: 'X', color: '#fff' } }, conn);

    expect(conn.send).toHaveBeenCalledWith({ type: 'CONNECTION_LOCKED' });
    expect(deps.localDispatch).not.toHaveBeenCalled();
    expect(conn.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'PACKS_NEEDED' }));
  });

  test('known player panel settings are sent back after HELO', () => {
    const deps = createDeps();
    deps.isHost = true;
    deps.stateRef.current.playerPanelSettings['guest-1'] = { hand: { open: true } };
    const conn = makeConn('guest-1');
    const handler = createProtocolHandler(deps);

    handler({ type: 'HELO', payload: { id: 'guest-1', name: 'P', color: '#fff' } }, conn);

    expect(conn.send).toHaveBeenCalledWith({
      type: 'PLAYER_PANEL_SETTINGS',
      payload: { playerId: 'guest-1', settings: { hand: { open: true } } },
    });
  });
});

describe('protocol dispatcher — DIRECT_SYNC', () => {
  test('host relays the message to other open connections only', () => {
    const deps = createDeps();
    deps.isHost = true;
    const sender = makeConn('guest-1');
    const other = makeConn('guest-2');
    const closed = makeConn('guest-3', { open: false });
    deps.getConnections = () => [sender, other, closed];

    vi.mocked(handleDirectSyncMessage).mockReturnValue({ type: 'UPDATE_OBJECT', payload: { id: 'x' } } as any);
    const handler = createProtocolHandler(deps);

    const msg = { type: 'DIRECT_SYNC', payload: { prop: 'hp', value: 5 } };
    handler(msg, sender);

    expect(deps.localDispatch).toHaveBeenCalledWith({ type: 'UPDATE_OBJECT', payload: { id: 'x' } });
    expect(other.send).toHaveBeenCalledWith(msg);
    expect(sender.send).not.toHaveBeenCalled();
    expect(closed.send).not.toHaveBeenCalled();
  });

  test('guest does not relay; no-op result dispatches nothing', () => {
    const deps = createDeps();
    deps.isHost = false;
    const other = makeConn('guest-2');
    deps.getConnections = () => [other];

    vi.mocked(handleDirectSyncMessage).mockReturnValue(null as any);
    const handler = createProtocolHandler(deps);

    handler({ type: 'DIRECT_SYNC', payload: {} }, makeConn('guest-1'));

    expect(deps.localDispatch).not.toHaveBeenCalled();
    expect(other.send).not.toHaveBeenCalled();
  });
});

describe('protocol dispatcher — misc', () => {
  test('CONNECTION_LOCKED is acknowledged silently', () => {
    const deps = createDeps();
    const handler = createProtocolHandler(deps);
    const conn = makeConn();

    expect(() => handler({ type: 'CONNECTION_LOCKED' }, conn)).not.toThrow();
    expect(deps.localDispatch).not.toHaveBeenCalled();
  });
});

// --- host-side helpers ---

describe('sendAcceptPush', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('retries until the channel opens, then sends PACKS_NEEDED + SYNC_STATE', () => {
    const state = { players: [], usedPacks: {}, objects: {} };
    const conn = makeConn('g', { open: false });

    sendAcceptPush(conn, () => state);
    expect(conn.send).not.toHaveBeenCalled();

    conn.open = true;
    vi.advanceTimersByTime(50 + 250 + 1);

    expect(conn.send).toHaveBeenCalledTimes(2);
    expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'PACKS_NEEDED' }));
    expect(conn.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'SYNC_STATE' }));
  });

  test('gives up after all attempts when the channel never opens', () => {
    const conn = makeConn('g', { open: false });
    sendAcceptPush(conn, () => ({}));

    vi.advanceTimersByTime(50 + 250 * 6 + 1000);
    expect(conn.send).not.toHaveBeenCalled();
  });
});

describe('notifyGuestDisconnected', () => {
  test('removes the connection but keeps the player entry (disconnect ≠ kick)', () => {
    const localDispatch = vi.fn();
    const conn = makeConn('g');
    const connectionsRef: { current: any[] } = { current: [conn, makeConn('other')] };

    notifyGuestDisconnected(localDispatch, connectionsRef, conn);

    expect(connectionsRef.current).toHaveLength(1);
    expect(connectionsRef.current[0].peer).toBe('other');
    expect(localDispatch).not.toHaveBeenCalled(); // no REMOVE_PLAYER
  });
});
