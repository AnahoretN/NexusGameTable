import { describe, it, expect } from 'vitest';
import { migrateToVersion10 } from '../gameStorage';
import { GameState } from '../../store/gameState';

type TestLayer = Record<string, any>;

describe('migrateToVersion10', () => {
  it('backfills relativePositioning: interface on, everything else off', () => {
    const layers: TestLayer[] = [
      { id: 'boards', individualObjects: false },
      { id: 'cards', individualObjects: false },
      { id: 'tokens', individualObjects: false },
      { id: 'interface', individualObjects: true },
    ];
    const result = migrateToVersion10({ hyperscaleLayers: layers } as Partial<GameState>);

    expect(result.hyperscaleLayers!.find(l => l.id === 'interface')!.relativePositioning).toBe(true);
    expect(result.hyperscaleLayers!.find(l => l.id === 'boards')!.relativePositioning).toBe(false);
    expect(result.hyperscaleLayers!.find(l => l.id === 'tokens')!.relativePositioning).toBe(false);
  });

  it('keeps an explicitly set value', () => {
    const layers: TestLayer[] = [
      { id: 'custom', individualObjects: true, relativePositioning: true },
      { id: 'interface', individualObjects: true, relativePositioning: false },
    ];
    const result = migrateToVersion10({ hyperscaleLayers: layers } as Partial<GameState>);

    expect(result.hyperscaleLayers![0].relativePositioning).toBe(true);
    expect(result.hyperscaleLayers![1].relativePositioning).toBe(false);
  });

  it('forces relativePositioning off when individualObjects is disabled', () => {
    const layers: TestLayer[] = [
      { id: 'interface', individualObjects: false, relativePositioning: true },
    ];
    const result = migrateToVersion10({ hyperscaleLayers: layers } as Partial<GameState>);
    expect(result.hyperscaleLayers![0].relativePositioning).toBe(false);
  });

  it('is idempotent', () => {
    const state = {
      hyperscaleLayers: [
        { id: 'interface', individualObjects: true },
        { id: 'tokens', individualObjects: false },
      ],
    } as Partial<GameState>;
    const once = migrateToVersion10(state);
    const twice = migrateToVersion10(once);
    expect(twice).toEqual(once);
  });

  it('leaves state without layers untouched', () => {
    const result = migrateToVersion10({ objects: {} } as Partial<GameState>);
    expect(result.hyperscaleLayers).toBeUndefined();
    expect(result.objects).toEqual({});
  });
});
