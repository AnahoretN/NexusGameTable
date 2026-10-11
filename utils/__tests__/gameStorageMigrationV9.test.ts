import { describe, it, expect } from 'vitest';
import { migrateToVersion9 } from '../gameStorage';
import { GameState } from '../../store/gameState';

const legacyLayers = [
  {
    id: 'boards',
    name: 'Game Boards',
    minZIndex: 1,
    maxZIndex: 1000,
    color: '#3b82f6',
    playerCanSelect: true,
    playerCanView: true,
    individualObjects: false,
    zoomEnabled: true,
    order: 0,
  },
  {
    id: 'tokens',
    name: 'Tokens',
    minZIndex: 3001,
    maxZIndex: 6000,
    color: '#10b981',
    playerCanSelect: true,
    playerCanView: true,
    individualObjects: false,
    zoomEnabled: true,
    order: 2,
  },
  {
    // layer created by a GM after the rename — must survive untouched
    id: 'custom',
    name: 'Custom',
    minZIndex: 7001,
    maxZIndex: 8000,
    color: '#06b6d4',
    playerCanSelect: true,
    playerCanUseContextMenu: false,
    individualObjects: false,
    zoomEnabled: false,
    order: 5,
  },
];

describe('migrateToVersion9', () => {
  it('renames playerCanView -> playerCanUseContextMenu', () => {
    const state = { hyperscaleLayers: legacyLayers } as Partial<GameState>;
    const result = migrateToVersion9(state);

    const tokens = result.hyperscaleLayers!.find(l => l.id === 'tokens') as any;
    expect(tokens.playerCanUseContextMenu).toBe(true);
    expect(tokens.playerCanView).toBeUndefined();
  });

  it('locks Game Boards by default (playerCanSelect + context menu off)', () => {
    const state = { hyperscaleLayers: legacyLayers } as Partial<GameState>;
    const result = migrateToVersion9(state);

    const boards = result.hyperscaleLayers!.find(l => l.id === 'boards')!;
    expect(boards.playerCanSelect).toBe(false);
    expect(boards.playerCanUseContextMenu).toBe(false);
  });

  it('keeps already-migrated custom layers intact (idempotent)', () => {
    const state = { hyperscaleLayers: legacyLayers } as Partial<GameState>;
    const once = migrateToVersion9(state);
    const twice = migrateToVersion9(once);

    const custom = twice.hyperscaleLayers!.find(l => l.id === 'custom')!;
    expect(custom.playerCanUseContextMenu).toBe(false);
    expect((custom as any).playerCanView).toBeUndefined();
    expect(custom.playerCanSelect).toBe(true);
    expect(custom.zoomEnabled).toBe(false);
    expect(twice).toEqual(once);
  });

  it('backfills zoomEnabled like v8 (interface defaults to false)', () => {
    const state = {
      hyperscaleLayers: [
        {
          id: 'interface',
          name: 'Interface',
          minZIndex: 9001,
          maxZIndex: 10000,
          color: '#8b5cf6',
          playerCanSelect: true,
          playerCanView: false,
          individualObjects: true,
          order: 4,
        } as any,
      ],
    } as Partial<GameState>;

    const result = migrateToVersion9(state);
    const iface = result.hyperscaleLayers![0];
    expect(iface.zoomEnabled).toBe(false);
    expect(iface.playerCanUseContextMenu).toBe(true); // was playerCanView: false under old semantics
  });

  it('leaves state without layers untouched', () => {
    const result = migrateToVersion9({ objects: {} } as Partial<GameState>);
    expect(result.hyperscaleLayers).toBeUndefined();
    expect(result.objects).toEqual({});
  });
});
