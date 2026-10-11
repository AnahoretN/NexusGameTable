import { describe, it, expect } from 'vitest';
import {
  getSelectableLayerIds,
  sanitizeLayerSelection,
  isObjectLayerSelected,
  canUseContextMenuOnLayer,
  canMoveObjectToLayer,
  getObjectLayerId,
} from '../layerPermissions';
import { HyperscaleLayer } from '../../types';

const layer = (overrides: Partial<HyperscaleLayer>): HyperscaleLayer => ({
  id: 'test',
  name: 'Test',
  minZIndex: 1,
  maxZIndex: 100,
  color: '#000000',
  playerCanSelect: true,
  playerCanUseContextMenu: true,
  individualObjects: false,
  zoomEnabled: true,
  order: 0,
  ...overrides,
});

const layers: HyperscaleLayer[] = [
  layer({ id: 'boards', playerCanSelect: false, playerCanUseContextMenu: false }),
  layer({ id: 'tokens' }),
  layer({ id: 'secret', playerCanSelect: false }),
];

describe('getSelectableLayerIds', () => {
  it('GM can select every layer', () => {
    expect(getSelectableLayerIds(layers, true)).toEqual(['boards', 'tokens', 'secret']);
  });

  it('players only get playerCanSelect layers', () => {
    expect(getSelectableLayerIds(layers, false)).toEqual(['tokens']);
  });
});

describe('sanitizeLayerSelection', () => {
  it('drops non-selectable layers for players', () => {
    expect(sanitizeLayerSelection(['boards', 'tokens', 'secret'], layers, false)).toEqual(['tokens']);
  });

  it('keeps everything for the GM', () => {
    expect(sanitizeLayerSelection(['boards', 'tokens'], layers, true)).toEqual(['boards', 'tokens']);
  });

  it('drops stale ids of deleted layers', () => {
    expect(sanitizeLayerSelection(['tokens', 'ghost'], layers, true)).toEqual(['tokens']);
  });
});

describe('isObjectLayerSelected', () => {
  const selected = ['tokens'];

  it('unselected layer → false', () => {
    expect(isObjectLayerSelected({ hyperscaleLayerId: 'boards' }, selected, layers)).toBe(false);
  });

  it('selected layer → true', () => {
    expect(isObjectLayerSelected({ hyperscaleLayerId: 'tokens' }, selected, layers)).toBe(true);
  });

  it('objects without layer default to tokens', () => {
    expect(isObjectLayerSelected({}, selected, layers)).toBe(true);
    expect(isObjectLayerSelected(null, selected, layers)).toBe(true);
  });

  it('stale/unknown layer ids fail open (treated as selected)', () => {
    expect(isObjectLayerSelected({ hyperscaleLayerId: 'ghost' }, selected, layers)).toBe(true);
  });
});

describe('canUseContextMenuOnLayer', () => {
  it('GM can always open the menu', () => {
    expect(canUseContextMenuOnLayer({ hyperscaleLayerId: 'boards' }, layers, true)).toBe(true);
  });

  it('players are blocked on layers with the flag off', () => {
    expect(canUseContextMenuOnLayer({ hyperscaleLayerId: 'boards' }, layers, false)).toBe(false);
  });

  it('players can open menus on layers with the flag on', () => {
    expect(canUseContextMenuOnLayer({ hyperscaleLayerId: 'tokens' }, layers, false)).toBe(true);
  });

  it('unknown layers fail open', () => {
    expect(canUseContextMenuOnLayer({ hyperscaleLayerId: 'ghost' }, layers, false)).toBe(true);
  });
});

describe('canMoveObjectToLayer', () => {
  it('players can only move to selectable layers (Change Layer submenu)', () => {
    expect(canMoveObjectToLayer(layers[0], false)).toBe(false);
    expect(canMoveObjectToLayer(layers[1], false)).toBe(true);
    expect(canMoveObjectToLayer(layers[0], true)).toBe(true);
  });
});

describe('getObjectLayerId', () => {
  it('defaults to tokens', () => {
    expect(getObjectLayerId(undefined)).toBe('tokens');
    expect(getObjectLayerId({ hyperscaleLayerId: 'boards' })).toBe('boards');
  });
});
