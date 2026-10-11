/**
 * Unit tests for DifferentialSyncManager.getPartialState (utils/webrtcOptimization.ts).
 *
 * This is the differential-sync payload mapper — the #1 source of "guest state
 * silently diverges from host" bugs. Every branch here was added after a real
 * regression:
 * - actions without payload.id (FLIP_CARD, PLAY_TOP_CARD) used to be dropped
 * - newly created objects whose id is generated in the reducer never synced
 * - deletions (incl. cascades) never reached guests without tombstones
 * - cursor-slot objects must not leak their hide-position (-999999)
 *
 * The manager is a module singleton — every test resets pending changes and
 * the diff baseline first.
 */

import { vi, describe, test, expect, beforeEach } from 'vitest';
import {
  differentialSyncManager as dsm,
  WEBRTC_OPTIMIZATION_CONFIG,
} from '../webrtcOptimization';

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const T = 1700000000000; // fixed currentStateTime

function freshManager(baseline: Record<string, any> = {}) {
  dsm.clearChanges();
  dsm.resetKnownIds(baseline);
}

function add(type: string, payload: any, extraIds?: string[]) {
  dsm.addChange({ type: 'object', action: { type, payload }, timestamp: T, extraIds });
}

function partial(currentState: any) {
  return dsm.getPartialState(currentState, T);
}

beforeEach(() => {
  freshManager();
});

describe('getPartialState — actions with payload.id', () => {
  test('includes the full changed object and flags the payload as partial', () => {
    add('UPDATE_OBJECT', { id: 'a', x: 5 });
    const state = { objects: { a: { id: 'a', x: 5, name: 'card' } }, players: [] };

    const result = partial(state);

    expect(result._isPartial).toBe(true);
    expect(result._changeCount).toBe(1);
    expect(result._timestamp).toBe(T);
    expect(result.objects['a']).toEqual({ id: 'a', x: 5, name: 'card' });
  });

  test('MOVE_OBJECT with only x/y emits a minimal {id, x, y} entry', () => {
    add('MOVE_OBJECT', { id: 'a', x: 10, y: 20 });
    const state = {
      objects: { a: { id: 'a', x: 10, y: 20, type: 'DRAWING', strokes: new Array(500) } },
      players: [],
    };

    const result = partial(state);

    // Minimal traffic: no strokes or other fields leak into the sync
    expect(result.objects['a']).toEqual({ id: 'a', x: 10, y: 20 });
  });

  test('MOVE_OBJECT carrying extra fields emits the full object', () => {
    add('MOVE_OBJECT', { id: 'a', x: 10, y: 20, rotation: 90 });
    const state = { objects: { a: { id: 'a', x: 10, y: 20, rotation: 90 } }, players: [] };

    const result = partial(state);

    expect(result.objects['a']).toEqual({ id: 'a', x: 10, y: 20, rotation: 90 });
  });
});

describe('getPartialState — actions WITHOUT payload.id (the historical gap)', () => {
  test('FLIP_CARD is recovered via the generic cardId fallback', () => {
    // Regression: no payload.id → change silently dropped, guests kept stale side
    add('FLIP_CARD', { cardId: 'card-1' });
    const state = {
      objects: { 'card-1': { id: 'card-1', faceUp: true } },
      players: [],
    };

    const result = partial(state);

    expect(result.objects['card-1']).toEqual({ id: 'card-1', faceUp: true });
  });

  test('action referencing an unknown object is dropped (null result)', () => {
    add('FLIP_CARD', { cardId: 'ghost' });
    const state = { objects: {}, players: [] };

    expect(partial(state)).toBeNull();
  });

  test('DRAW_CARD syncs the deck + only the drawn card', () => {
    const objects: Record<string, any> = {
      'deck-1': { id: 'deck-1', type: 'DECK', cardIds: ['c1', 'c2'] },
      'c1': { id: 'c1', type: 'CARD', deckId: 'deck-1', location: 'HAND', ownerId: 'p1' },
      'c2': { id: 'c2', type: 'CARD', deckId: 'deck-1', location: 'DECK' },
    };
    // Baseline knows all objects: models a mid-session sync, so the additions
    // diff contributes nothing and we observe the DRAW_CARD branch alone.
    freshManager(objects);
    add('DRAW_CARD', { deckId: 'deck-1', playerId: 'p1' });
    const state = { objects, players: [] };

    const result = partial(state);

    expect(result.objects['deck-1']).toBeDefined();
    expect(result.objects['c1']).toBeDefined(); // the drawn card
    expect(result.objects['c2']).toBeUndefined(); // still in the deck — not needed
  });

  test('PLAY_TOP_CARD syncs deck + played card (__pendingPlayTop) + new top card', () => {
    // Regression: the played card is no longer deck.cardIds[0] — without the
    // __pendingPlayTop marker lookup guests never learned about it.
    add('PLAY_TOP_CARD', { deckId: 'deck-1' });
    const state = {
      objects: {
        'deck-1': { id: 'deck-1', type: 'DECK', cardIds: ['c-top'] },
        'c-played': { id: 'c-played', __pendingPlayTop: { deckId: 'deck-1' } },
        'c-top': { id: 'c-top', type: 'CARD' },
      },
      players: [],
    };

    const result = partial(state);

    expect(result.objects['deck-1']).toBeDefined();
    expect(result.objects['c-played']).toBeDefined();
    expect(result.objects['c-top']).toBeDefined();
  });

  test('ADD_CARD_TO_PILE syncs pile + card', () => {
    add('ADD_CARD_TO_PILE', { deckId: 'pile-1', cardId: 'c1' });
    const state = {
      objects: {
        'pile-1': { id: 'pile-1', type: 'CARD_PILE' },
        'c1': { id: 'c1', type: 'CARD' },
      },
      players: [],
    };

    const result = partial(state);

    expect(result.objects['pile-1']).toBeDefined();
    expect(result.objects['c1']).toBeDefined();
  });

  test('DROP_FROM_CURSOR_SLOT syncs the dropped object', () => {
    add('DROP_FROM_CURSOR_SLOT', { objectId: 'card-1' });
    const state = { objects: { 'card-1': { id: 'card-1' } }, players: [] };

    const result = partial(state);

    expect(result.objects['card-1']).toBeDefined();
  });
});

describe('getPartialState — deletions and diff-based sync', () => {
  test('DELETE_OBJECT emits a tombstone guests merge as a removal', () => {
    add('DELETE_OBJECT', { id: 'gone' });
    const state = { objects: {}, players: [] };

    const result = partial(state);

    expect(result.objects['gone']).toEqual({ id: 'gone', _deleted: true });
  });

  test('deletion extraIds: survivors are synced, removed ids become tombstones', () => {
    // Dice group deleted: some dice were re-parented (survivors), others vanished
    add('DELETE_DICE_GROUP', { groupId: 'g1' }, ['die-survivor', 'die-gone']);
    const state = {
      objects: { 'die-survivor': { id: 'die-survivor', diceGroupId: null } },
      players: [],
    };

    const result = partial(state);

    expect(result.objects['die-survivor']).toEqual({ id: 'die-survivor', diceGroupId: null });
    expect(result.objects['die-gone']).toEqual({ id: 'die-gone', _deleted: true });
  });

  test('objects removed WITHOUT a tracked action still produce tombstones (cascade deletions)', () => {
    // Baseline knows a & b; b vanished from state through any untracked path.
    // Unchanged objects are NOT included — tombstones are the whole payload.
    freshManager({ a: { id: 'a' }, b: { id: 'b' } });
    const state = { objects: { a: { id: 'a' } }, players: [] };

    const result = partial(state);

    expect(result.objects).toEqual({ b: { id: 'b', _deleted: true } });
  });

  test('objects created since the last sync are included even with no tracked action', () => {
    // Regression: CREATE_DRAWING_OBJECT generates the id in the reducer, the
    // action payload has none — without the diff the object never synced.
    freshManager({ a: { id: 'a' } });
    const state = { objects: { a: { id: 'a' }, 'created': { id: 'created', type: 'DRAWING' } }, players: [] };

    const result = partial(state);

    expect(result.objects['created']).toEqual({ id: 'created', type: 'DRAWING' });
  });
});

describe('getPartialState — cursor slot and limits', () => {
  test('cursor-slot object syncs ONLY the flag + owner (hide-position never leaves the holder)', () => {
    add('UPDATE_OBJECT', { id: 'card-1', inCursorSlot: true });
    const state = {
      objects: {
        'card-1': { id: 'card-1', inCursorSlot: true, cursorSlotOwnerId: 'p2', x: -999999, y: -999999 },
      },
      players: [],
    };

    const result = partial(state);

    expect(result.objects['card-1']).toEqual({
      id: 'card-1',
      inCursorSlot: true,
      cursorSlotOwnerId: 'p2',
    });
  });

  test(`changed objects are capped at MAX_PARTIAL_OBJECTS (${WEBRTC_OPTIMIZATION_CONFIG.MAX_PARTIAL_OBJECTS})`, () => {
    const objects: Record<string, any> = {};
    const changes: Array<[string, any]> = [];
    for (let i = 0; i < WEBRTC_OPTIMIZATION_CONFIG.MAX_PARTIAL_OBJECTS + 5; i++) {
      objects[`obj-${i}`] = { id: `obj-${i}` };
      changes.push([`obj-${i}`, { id: `obj-${i}` }] as [string, any]);
    }
    // Baseline knows all objects so the uncapped additions-diff adds nothing
    // and the cap on TRACKED changes is what we observe.
    freshManager(objects);
    changes.forEach(([id, payload]) => add('UPDATE_OBJECT', payload));
    const state = { objects, players: [] };

    const result = partial(state);

    expect(result._changeCount).toBe(WEBRTC_OPTIMIZATION_CONFIG.MAX_PARTIAL_OBJECTS);
  });

  test('returns null when nothing changed and there are no player changes', () => {
    // Baseline matches current state: no additions, no removals, no changes
    const objects = { a: { id: 'a' } };
    freshManager(objects);
    const state = { objects, players: [] };
    expect(partial(state)).toBeNull();
  });

  test('player-only changes still produce a payload (handCardOrder sync)', () => {
    dsm.addChange({ type: 'player', action: { type: 'UPDATE_HAND_CARD_ORDER', payload: {} }, timestamp: T });
    const state = { objects: {}, players: [{ id: 'p1', handCardOrder: ['c2', 'c1'] }] };

    const result = partial(state);

    expect(result).not.toBeNull();
    expect(result.objects).toEqual({});
    expect(result.players).toEqual([{ id: 'p1', handCardOrder: ['c2', 'c1'] }]);
  });
});

describe('DifferentialSyncManager — housekeeping', () => {
  test('shouldSendFullState flips past the change threshold', () => {
    expect(dsm.shouldSendFullState()).toBe(false);
    for (let i = 0; i <= WEBRTC_OPTIMIZATION_CONFIG.MAX_CHANGES_FOR_FULL_SYNC; i++) {
      add('UPDATE_OBJECT', { id: `o${i}` });
    }
    expect(dsm.shouldSendFullState()).toBe(true);
  });

  test('filterInvalidChanges drops changes for missing objects, keeps deletions', () => {
    add('UPDATE_OBJECT', { id: 'exists' });
    add('UPDATE_OBJECT', { id: 'vanished' });
    add('DELETE_OBJECT', { id: 'already-gone' });

    const state = { objects: { exists: { id: 'exists' } } };
    dsm.filterInvalidChanges(state);

    expect(dsm.getChangeCount()).toBe(2);
  });

  test('resetKnownIds rebases the deletion diff', () => {
    freshManager({ a: { id: 'a' } });
    // No changes at all; 'a' still present → no tombstone, no additions
    const state = { objects: { a: { id: 'a' } }, players: [] };
    expect(partial(state)).toBeNull();
  });
});
