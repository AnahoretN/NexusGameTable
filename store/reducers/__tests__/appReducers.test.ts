/**
 * Unit tests for addPackToGameReducer (store/reducers/appReducers.ts).
 *
 * This is the ONLY reducer from appReducers.ts wired into GameContext
 * (GameContext.tsx imports addPackToGameReducer; the other exports are dead
 * code kept for reference). It handles importing an asset pack into a running
 * game: merging objects, remapping conflicting IDs, merging dice groups,
 * drawing layers and hyperscale layers.
 */

import { vi, describe, test, expect } from 'vitest';
import { addPackToGameReducer } from '../appReducers';

vi.mock('../../utils/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function baseState(overrides: Record<string, any> = {}) {
  return {
    objects: {},
    players: [{ id: 'gm', name: 'GM' }],
    activePlayerId: 'gm',
    sessionId: 'session-1',
    viewTransform: { zoom: 2 },
    hyperscaleLayers: [],
    selectedHyperscaleLayerIds: [],
    diceGroups: [],
    drawings: { layers: [] },
    ...overrides,
  };
}

const packAction = (objects: Record<string, any>, extra: Record<string, any> = {}) => ({
  type: 'ADD_PACK_TO_GAME' as const,
  payload: { objects, ...extra },
});

describe('addPackToGameReducer', () => {
  test('ignores other action types (returns the same state reference)', () => {
    const state = baseState();
    expect(addPackToGameReducer(state, { type: 'UPDATE_OBJECT', payload: {} } as any)).toBe(state);
  });

  test('merges non-conflicting pack objects unchanged', () => {
    const state = baseState({ objects: { existing: { id: 'existing' } } });

    const next = addPackToGameReducer(state, packAction({
      'new-obj': { id: 'new-obj', type: 'TOKEN' },
    }));

    expect(Object.keys(next.objects).sort()).toEqual(['existing', 'new-obj']);
    expect(next.objects['new-obj']).toEqual({ id: 'new-obj', type: 'TOKEN' });
  });

  test('conflicting ID is renamed with a _pack suffix', () => {
    const state = baseState({ objects: { 'card-1': { id: 'card-1' } } });

    const next = addPackToGameReducer(state, packAction({
      'card-1': { id: 'card-1', type: 'CARD', name: 'from pack' },
    }));

    // Existing object untouched, pack copy lives under a new ID
    expect(next.objects['card-1']).toEqual({ id: 'card-1' });
    expect(next.objects['card-1_pack1']).toEqual({ id: 'card-1_pack1', type: 'CARD', name: 'from pack' });
  });

  test('references to renamed objects are remapped (single fields and ID arrays)', () => {
    const state = baseState({ objects: { 'deck-1': { id: 'deck-1' } } });

    const next = addPackToGameReducer(state, packAction({
      // Conflicts with the existing deck → renamed
      'deck-1': { id: 'deck-1', type: 'DECK', cardIds: ['card-1'] },
      // References the renamed deck by single field and inside an array
      'card-1': {
        id: 'card-1',
        deckId: 'deck-1',
        baseCardIds: ['deck-1'],
      },
    }));

    expect(next.objects['deck-1_pack1']).toBeDefined();
    const card = next.objects['card-1'];
    expect(card.deckId).toBe('deck-1_pack1');
    expect(card.baseCardIds).toEqual(['deck-1_pack1']);
    expect(next.objects['deck-1_pack1'].cardIds).toEqual(['card-1']);
  });

  test('session settings are preserved from the current state, not the pack', () => {
    const state = baseState({ sessionId: 'keep-me', players: [{ id: 'gm' }], activePlayerId: 'gm' });

    const next = addPackToGameReducer(state, packAction({
      'a': { id: 'a' },
    }, {
      sessionId: 'pack-session',
      players: [{ id: 'impostor' }],
      activePlayerId: 'impostor',
    }));

    expect(next.sessionId).toBe('keep-me');
    expect(next.players).toEqual([{ id: 'gm' }]);
    expect(next.activePlayerId).toBe('gm');
    expect(next.viewTransform).toEqual({ zoom: 2 });
  });

  test('dice groups merge with deduplicated IDs and object references are remapped', () => {
    // Regression: generateUniqueId used to check only OBJECT ids, so a pack
    // group colliding with an existing dice-group id was merged silently —
    // two groups sharing one id, and dice pointing at the wrong group.
    const state = baseState({
      diceGroups: [{ id: 'group-1', sides: 6 }],
    });

    const next = addPackToGameReducer(state, packAction({
      'die-1': { id: 'die-1', diceGroupId: 'group-1' },
    }, {
      diceGroups: [{ id: 'group-1', sides: 20 }],
    }));

    expect(next.diceGroups).toHaveLength(2);
    expect(next.diceGroups[0].id).toBe('group-1'); // existing group untouched
    expect(next.diceGroups[1].id).toBe('group-1_pack1'); // renamed, not duplicated
    expect(next.diceGroups[1].sides).toBe(20);
    expect(next.objects['die-1'].diceGroupId).toBe('group-1_pack1');
  });

  test('two pack dice groups with the same ID each get a unique ID', () => {
    const next = addPackToGameReducer(baseState(), packAction({}, {
      diceGroups: [
        { id: 'group-1', sides: 6 },
        { id: 'group-1', sides: 20 },
      ],
    }));

    const ids = next.diceGroups.map((g: any) => g.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(['group-1', 'group-1_pack1']);
  });

  test('drawing layers colliding with existing layer IDs are renamed', () => {
    const state = baseState({ drawings: { layers: [{ id: 'layer-1', strokes: [] }] } });

    const next = addPackToGameReducer(state, packAction({}, {
      drawings: { layers: [{ id: 'layer-1', strokes: [{ x: 1 }] }] },
    }));

    const ids = next.drawings.layers.map((l: any) => l.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(['layer-1', 'layer-1_pack1']);
  });

  test('drawing layers merge into the existing drawings', () => {
    const state = baseState({ drawings: { layers: [{ id: 'layer-1', strokes: [] }] } });

    const next = addPackToGameReducer(state, packAction({}, {
      drawings: { layers: [{ id: 'layer-2', strokes: [{ x: 1 }] }] },
    }));

    expect(next.drawings.layers.map((l: any) => l.id)).toEqual(['layer-1', 'layer-2']);
  });

  test('hyperscale layers merge without duplicating existing IDs', () => {
    const state = baseState({
      hyperscaleLayers: [{ id: 'boards', name: 'Boards' }],
    });

    const next = addPackToGameReducer(state, packAction({}, {
      hyperscaleLayers: [
        { id: 'boards', name: 'Boards (duplicate)' },
        { id: 'fog', name: 'Fog' },
      ],
    }));

    expect(next.hyperscaleLayers).toEqual([
      { id: 'boards', name: 'Boards' },
      { id: 'fog', name: 'Fog' },
    ]);
  });
});
