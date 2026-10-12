/**
 * Unit tests for the main game reducer (store/GameContext.tsx `gameReducer`).
 *
 * These branches are what `getPartialState` (see webrtcOptimization.test.ts)
 * maps into P2P payloads — testing them pins down the guest-visible behavior
 * of the most frequent player actions: draw, play top, drop, shuffle, flip,
 * add to pile.
 *
 * Note: the reducer registers remote-movement animations for large jumps; the
 * animator is mocked so tests stay synchronous and side-effect free.
 */

import { vi, describe, test, expect } from 'vitest';
import { gameReducer } from '../GameContext';
import { initialState } from '../gameState';
import { CardLocation } from '../../types';
import { registerRemoteMovement } from '../../utils/remoteMovementAnimator';

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../utils/remoteMovementAnimator', () => ({
  registerRemoteMovement: vi.fn(),
}));

// --- fixtures ---

let idSeq = 0;
function makeCard(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? `card-${++idSeq}`,
    type: 'CARD',
    x: 0,
    y: 0,
    width: 63,
    height: 88,
    rotation: 0,
    zIndex: 1,
    faceUp: false,
    location: CardLocation.DECK,
    deckId: overrides.deckId,
    isOnTable: false,
    ...overrides,
  };
}

function makeDeck(cardIds: string[], overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? `deck-${++idSeq}`,
    type: 'DECK',
    x: 100,
    y: 100,
    width: 90,
    height: 120,
    rotation: 0,
    zIndex: 1,
    cardIds,
    playTopFaceUp: true,
    cardShape: 'POKER',
    isOnTable: true,
    location: CardLocation.TABLE,
    ...overrides,
  };
}

function makeState(objects: Record<string, any>, players: any[] = []) {
  return {
    ...initialState,
    objects,
    players: players.length ? players : initialState.players,
  };
}

// --- card drawing ---

describe('gameReducer — DRAW_CARD', () => {
  test('takes the TOP card into the hand and records the deck membership', () => {
    const c1 = makeCard({ id: 'c1', deckId: 'd1' });
    const c2 = makeCard({ id: 'c2', deckId: 'd1' });
    const deck = makeDeck(['c1', 'c2'], { id: 'd1' });
    const state = makeState({ d1: deck, c1, c2 }, [
      { id: 'gm', name: 'GM', isGM: true },
      { id: 'p1', name: 'P1', isGM: false },
    ]);

    const next: any = gameReducer(state, { type: 'DRAW_CARD', payload: { deckId: 'd1', playerId: 'p1' } } as any);

    const drawn = next.objects['c1'];
    expect(drawn.location).toBe(CardLocation.HAND);
    expect(drawn.ownerId).toBe('p1');
    expect(drawn.faceUp).toBe(true); // deck.playTopFaceUp
    expect(drawn.isOnTable).toBe(false);
    expect(next.objects['d1'].cardIds).toEqual(['c2']); // top card removed

    // Drawn card is prepended to the player's hand order
    const p1 = next.players.find((p: any) => p.id === 'p1');
    expect(p1.handCardOrder[0]).toBe('c1');

    // History entry for undo
    expect(next.undo.generalHistory.at(-1).type).toBe('card-drawn');
  });

  test('empty deck leaves the state untouched (same reference)', () => {
    const deck = makeDeck([], { id: 'd1' });
    const state = makeState({ d1: deck });

    const next = gameReducer(state, { type: 'DRAW_CARD', payload: { deckId: 'd1', playerId: 'p1' } } as any);
    expect(next).toBe(state);
  });

  test('playTopFaceUp: false draws face-down', () => {
    const c1 = makeCard({ id: 'c1', deckId: 'd1' });
    const deck = makeDeck(['c1'], { id: 'd1', playTopFaceUp: false });
    const state = makeState({ d1: deck, c1 });

    const next: any = gameReducer(state, { type: 'DRAW_CARD', payload: { deckId: 'd1', playerId: 'p1' } } as any);
    expect(next.objects['c1'].faceUp).toBe(false);
  });
});

// --- play top ---

describe('gameReducer — PLAY_TOP_CARD', () => {
  test('moves the top card into the cursor slot with a pending marker', () => {
    const c1 = makeCard({ id: 'c1', deckId: 'd1' });
    const c2 = makeCard({ id: 'c2', deckId: 'd1' });
    const deck = makeDeck(['c1', 'c2'], { id: 'd1', x: 300, y: 400 });
    const state = makeState({ d1: deck, c1, c2 });

    const next: any = gameReducer(state, { type: 'PLAY_TOP_CARD', payload: { deckId: 'd1' } } as any);

    const played = next.objects['c1'];
    expect(played.location).toBe(CardLocation.CURSOR_SLOT);
    expect(played.inCursorSlot).toBe(true);
    expect(played.x).toBe(300); // positioned at the deck...
    expect(played.y).toBe(400); // ...so pool-panel drops land correctly
    expect(played.__pendingPlayTop).toMatchObject({
      deckId: 'd1',
      previousCardIds: ['c1', 'c2'],
    });
    expect(next.objects['d1'].cardIds).toEqual(['c2']);
  });

  test('empty deck leaves the state untouched', () => {
    const deck = makeDeck([], { id: 'd1' });
    const state = makeState({ d1: deck });

    const next = gameReducer(state, { type: 'PLAY_TOP_CARD', payload: { deckId: 'd1' } } as any);
    expect(next).toBe(state);
  });

  test('dropping the pending card finishes the play: table + marker cleared', () => {
    const c1 = makeCard({ id: 'c1', deckId: 'd1' });
    const deck = makeDeck(['c1'], { id: 'd1' });
    const state = makeState({ d1: deck, c1 });

    const afterPlay: any = gameReducer(state, { type: 'PLAY_TOP_CARD', payload: { deckId: 'd1' } } as any);
    const afterDrop: any = gameReducer(afterPlay, {
      type: 'DROP_FROM_CURSOR_SLOT',
      payload: { objectId: 'c1', x: 500, y: 600 },
    } as any);

    const card = afterDrop.objects['c1'];
    expect(card.location).toBe(CardLocation.TABLE);
    expect(card.isOnTable).toBe(true);
    expect(card.inCursorSlot).toBe(false);
    expect(card.x).toBe(500);
    expect(card.y).toBe(600);
    expect(card.__pendingPlayTop).toBeUndefined();
    expect(afterDrop.undo.generalHistory.at(-1).type).toBe('card-played-from-top');
  });
});

// --- shuffle & flip ---

describe('gameReducer — SHUFFLE_DECK', () => {
  test('preserves the exact multiset of card ids and records history', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map(id => makeCard({ id, deckId: 'd1' }));
    const deck = makeDeck(['a', 'b', 'c', 'd', 'e'], { id: 'd1' });
    const objects: Record<string, any> = { d1: deck };
    cards.forEach(c => { objects[c.id] = c; });
    const state = makeState(objects);

    const next: any = gameReducer(state, { type: 'SHUFFLE_DECK', payload: { deckId: 'd1' } } as any);

    expect([...next.objects['d1'].cardIds].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(next.undo.generalHistory.at(-1).type).toBe('deck-shuffled');
    expect(next.undo.generalHistory.at(-1).previousCardOrder).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('missing deck leaves the state untouched', () => {
    const state = makeState({});
    const next = gameReducer(state, { type: 'SHUFFLE_DECK', payload: { deckId: 'ghost' } } as any);
    expect(next).toBe(state);
  });
});

describe('gameReducer — FLIP_CARD', () => {
  test('toggles faceUp and records the previous value', () => {
    const card = makeCard({ id: 'c1', faceUp: false });
    const state = makeState({ c1: card });

    const next: any = gameReducer(state, { type: 'FLIP_CARD', payload: { cardId: 'c1' } } as any);
    expect(next.objects['c1'].faceUp).toBe(true);
    expect(next.undo.generalHistory.at(-1)).toMatchObject({ type: 'card-flipped', previousFaceUp: false });

    const back: any = gameReducer(next, { type: 'FLIP_CARD', payload: { cardId: 'c1' } } as any);
    expect(back.objects['c1'].faceUp).toBe(false);
  });

  test('non-card objects are not affected', () => {
    const token = { id: 't1', type: 'TOKEN', faceUp: false };
    const state = makeState({ t1: token });

    const next = gameReducer(state, { type: 'FLIP_CARD', payload: { cardId: 't1' } } as any);
    expect(next).toBe(state);
  });
});

// --- piles ---

describe('gameReducer — ADD_CARD_TO_PILE', () => {
  test('adds the card to the TOP of the pile and marks it PILE', () => {
    const inPile = makeCard({ id: 'c1', deckId: 'd1', location: CardLocation.PILE });
    const moved = makeCard({ id: 'c2', deckId: 'd1' });
    const deck = makeDeck(['c1'], {
      id: 'd1',
      piles: [{ id: 'pile-1', cardIds: ['c1'], faceUp: false }],
    });
    const state = makeState({ d1: deck, c1: inPile, c2: moved });

    const next: any = gameReducer(state, {
      type: 'ADD_CARD_TO_PILE',
      payload: { cardId: 'c2', deckId: 'd1', pileId: 'pile-1' },
    } as any);

    expect(next.objects['d1'].piles.find((p: any) => p.id === 'pile-1').cardIds).toEqual(['c2', 'c1']);
    expect(next.objects['c2'].location).toBe(CardLocation.PILE);
  });

  test('card moving from another deck is removed from that deck first', () => {
    const moved = makeCard({ id: 'c2', deckId: 'd1' });
    const sourceDeck = makeDeck(['c2'], { id: 'd1' });
    const targetDeck = makeDeck([], {
      id: 'd2',
      piles: [{ id: 'pile-2', cardIds: [], faceUp: false }],
    });
    const state = makeState({ d1: sourceDeck, d2: targetDeck, c2: moved });

    const next: any = gameReducer(state, {
      type: 'ADD_CARD_TO_PILE',
      payload: { cardId: 'c2', deckId: 'd2', pileId: 'pile-2' },
    } as any);

    expect(next.objects['d1'].cardIds).toEqual([]); // removed from source
    expect(next.objects['d2'].piles[0].cardIds).toEqual(['c2']);
    expect(next.objects['c2'].location).toBe(CardLocation.PILE);
  });

  test('missing pile leaves the state untouched', () => {
    const card = makeCard({ id: 'c1', deckId: 'd1' });
    const deck = makeDeck(['c1'], { id: 'd1' });
    const state = makeState({ d1: deck, c1: card });

    const next = gameReducer(state, {
      type: 'ADD_CARD_TO_PILE',
      payload: { cardId: 'c1', deckId: 'd1', pileId: 'ghost-pile' },
    } as any);
    expect(next).toBe(state);
  });
});

describe('gameReducer — REMOVE_PLAYER (kick cleanup)', () => {
  const baseState = {
    ...initialState,
    players: [
      { id: 'gm', name: 'GM', color: '#e74c3c', isGM: true },
      { id: 'guest-a', name: 'A', color: '#3498db', isGM: false },
      { id: 'guest-b', name: 'B', color: '#2ecc71', isGM: false },
    ],
    guestPackStatus: {
      'guest-a': { guestName: 'A', loadedPacks: {}, connectedAt: 1 },
      'guest-b': { guestName: 'B', loadedPacks: {}, connectedAt: 2 },
    },
    playerObjectPositions: {
      'guest-a': { obj1: { x: 1, y: 2 } },
      'guest-b': { obj1: { x: 3, y: 4 } },
    },
    playerPanelSettings: {
      'guest-a': { panel1: { x: 10, y: 20 } },
      'guest-b': { panel1: { x: 30, y: 40 } },
    },
  } as any;

  test('removes the player and ALL their per-player data', () => {
    const next = gameReducer(baseState, { type: 'REMOVE_PLAYER', payload: { id: 'guest-a' } } as any);

    expect(next.players.map(p => p.id)).toEqual(['gm', 'guest-b']);
    expect(next.guestPackStatus['guest-a']).toBeUndefined();
    expect(next.playerObjectPositions['guest-a']).toBeUndefined();
    expect(next.playerPanelSettings['guest-a']).toBeUndefined();
  });

  test('keeps other players data intact', () => {
    const next = gameReducer(baseState, { type: 'REMOVE_PLAYER', payload: { id: 'guest-a' } } as any);

    expect(next.guestPackStatus['guest-b']).toBeDefined();
    expect(next.playerObjectPositions['guest-b']).toEqual(baseState.playerObjectPositions['guest-b']);
    expect(next.playerPanelSettings['guest-b']).toEqual(baseState.playerPanelSettings['guest-b']);
  });

  test('removing an unknown player does not touch per-player maps', () => {
    const next = gameReducer(baseState, { type: 'REMOVE_PLAYER', payload: { id: 'ghost' } } as any);

    expect(next.playerObjectPositions).toEqual(baseState.playerObjectPositions);
    expect(next.playerPanelSettings).toEqual(baseState.playerPanelSettings);
  });
});

describe('gameReducer — DROP_FROM_CURSOR_SLOT movement-animation guard', () => {
  test('does NOT animate a drop from the -999999 cursor-slot hide position', () => {
    (registerRemoteMovement as any).mockClear();

    const state = {
      ...initialState,
      objects: {
        'c1': makeCard({ id: 'c1', x: -999999, y: -999999, inCursorSlot: true, isOnTable: false }),
      },
    } as any;

    gameReducer(state, {
      type: 'DROP_FROM_CURSOR_SLOT',
      payload: { objectId: 'c1', x: 500, y: 300 },
    } as any);

    expect(registerRemoteMovement).not.toHaveBeenCalled();
  });

  test('animates a real cross-client position jump', () => {
    (registerRemoteMovement as any).mockClear();

    const state = {
      ...initialState,
      objects: {
        'c1': makeCard({ id: 'c1', x: 100, y: 100 }),
      },
    } as any;

    gameReducer(state, {
      type: 'DROP_FROM_CURSOR_SLOT',
      payload: { objectId: 'c1', x: 2000, y: 2000 },
    } as any);

    expect(registerRemoteMovement).toHaveBeenCalledWith('c1', 100, 100, 2000, 2000);
  });
});

describe('gameReducer — SYNC_STATE players preservation', () => {
  test('a payload WITHOUT players keeps the current players (GM personas intact)', () => {
    const state = {
      ...initialState,
      players: [
        { id: 'gm', name: 'Game Master', color: '#FF0000', isGM: true },
        { id: 'gm-player', name: 'GM Player', color: '#FF0000', isGM: false },
        { id: 'player-1', name: 'Guest', color: '#00FF00', isGM: false },
      ],
    } as any;

    // Sparse payload — exactly what loadSavedStateIntoGame dispatches
    const next = gameReducer(state, {
      type: 'SYNC_STATE',
      payload: { drawings: { layers: [] } },
    } as any);

    expect(next.players.map(p => p.id)).toEqual(['gm', 'gm-player', 'player-1']);
  });

  test('GM personas are repaired when an incoming players list lacks them', () => {
    const state = { ...initialState } as any;

    const next = gameReducer(state, {
      type: 'SYNC_STATE',
      payload: { players: [{ id: 'player-1', name: 'Guest', color: '#00FF00', isGM: false }] },
    } as any);

    const ids = next.players.map(p => p.id);
    expect(ids).toContain('gm');
    expect(ids).toContain('gm-player');
    expect(ids).toContain('player-1');
  });
});
