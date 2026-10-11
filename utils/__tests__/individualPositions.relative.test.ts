import { describe, it, expect } from 'vitest';
import {
  applyRelativePositioning,
  getRelativePositioningRatio,
  individualObjectKeepsPosition,
  getMainMenuLeftEdge,
  isMainMenuPanelObj,
} from '../individualPositions';
import { HyperscaleLayer, TableObject } from '../../types';

const layer = (id: string, overrides: Partial<HyperscaleLayer> = {}): HyperscaleLayer => ({
  id,
  name: id,
  minZIndex: 1,
  maxZIndex: 100,
  color: '#000000',
  playerCanSelect: true,
  playerCanUseContextMenu: true,
  individualObjects: true,
  relativePositioning: false,
  zoomEnabled: true,
  order: 0,
  ...overrides,
});

const layers: HyperscaleLayer[] = [
  layer('interface', { relativePositioning: true }),
  layer('plain'),
];

const panelObj = (x: number, layerId = 'interface'): TableObject => ({
  id: 'p1',
  type: 'PANEL',
  x,
  y: 100,
  hyperscaleLayerId: layerId,
} as unknown as TableObject);

describe('getRelativePositioningRatio', () => {
  it('equals the aspect-ratio quotient (height-locked world scale)', () => {
    // host 1920×1080 (16:9, 1778 vu visible), guest 1280×1024 (5:4, 1250 vu)
    expect(getRelativePositioningRatio(1280, 1024, { width: 1920, height: 1080 }))
      .toBeCloseTo(1250 / 1778, 3);
  });

  it('is 1 for the same aspect at different resolutions (FHD vs 4K)', () => {
    expect(getRelativePositioningRatio(3840, 2160, { width: 1920, height: 1080 })).toBeCloseTo(1, 6);
  });

  it('fails open (1) without a host viewport or with invalid values', () => {
    expect(getRelativePositioningRatio(1280, 1024, null)).toBe(1);
    expect(getRelativePositioningRatio(1280, 1024, undefined)).toBe(1);
    expect(getRelativePositioningRatio(1280, 1024, { width: 0, height: 1080 })).toBe(1);
    expect(getRelativePositioningRatio(0, 0, { width: 1920, height: 1080 })).toBe(1);
  });
});

describe('applyRelativePositioning', () => {
  it('scales x so the object keeps its fraction of the visible world width', () => {
    // host 16:9 vs guest 5:4 → ratio 1250/1778 ≈ 0.703
    const result = applyRelativePositioning(panelObj(1000), layers, 1250 / 1778);
    expect(result.x).toBeCloseTo(703, 0);
  });

  it('scales pinnedScreenPosition.x when present', () => {
    const obj = {
      ...panelObj(1000),
      pinnedScreenPosition: { x: 1000, y: 40 },
    } as any;
    const result = applyRelativePositioning(obj, layers, 0.5) as any;
    expect(result.x).toBe(500);
    expect(result.pinnedScreenPosition.x).toBe(500);
    expect(result.pinnedScreenPosition.y).toBe(40);
  });

  it('is a no-op when ratio is 1 (same aspect, e.g. FHD host vs 4K guest)', () => {
    const obj = panelObj(1000);
    expect(applyRelativePositioning(obj, layers, 1)).toBe(obj);
  });

  it('fails open when the ratio is missing or invalid', () => {
    expect(applyRelativePositioning(panelObj(1000), layers, NaN).x).toBe(1000);
    expect(applyRelativePositioning(panelObj(1000), layers, undefined as any).x).toBe(1000);
    expect(applyRelativePositioning(panelObj(1000), layers, Infinity).x).toBe(1000);
  });

  it('does not scale objects on layers without the flag', () => {
    const result = applyRelativePositioning(panelObj(1000, 'plain'), layers, 0.5);
    expect(result.x).toBe(1000);
  });

  it('does not scale objects without a finite x', () => {
    const obj = { id: 'p1', type: 'PANEL', hyperscaleLayerId: 'interface' } as unknown as TableObject;
    expect(applyRelativePositioning(obj, layers, 0.5).x).toBeUndefined();
  });

  it('never scales the main menu itself', () => {
    const menu = {
      id: 'menu',
      type: 'PANEL',
      panelType: 'MAIN_MENU',
      x: 1200,
      hyperscaleLayerId: 'interface',
    } as unknown as TableObject;
    const result = applyRelativePositioning(menu, layers, 0.5);
    expect(result.x).toBe(1200);
  });
});

describe('individualObjectKeepsPosition (relative layers keep x/y in broadcast)', () => {
  it('keeps position for panels/windows regardless of layers', () => {
    expect(individualObjectKeepsPosition(panelObj(1))).toBe(true);
    expect(individualObjectKeepsPosition(panelObj(1), layers)).toBe(true);
  });

  it('keeps position for objects on relativePositioning layers', () => {
    const deck = { id: 'd', type: 'DECK', hyperscaleLayerId: 'interface' } as unknown as TableObject;
    expect(individualObjectKeepsPosition(deck)).toBe(false); // legacy behaviour without layers
    expect(individualObjectKeepsPosition(deck, layers)).toBe(true);
  });

  it('strips position for other individual-layer objects', () => {
    const token = { id: 't', type: 'TOKEN', hyperscaleLayerId: 'plain' } as unknown as TableObject;
    expect(individualObjectKeepsPosition(token, layers)).toBe(false);
    expect(individualObjectKeepsPosition(token)).toBe(false);
  });
});

describe('getMainMenuLeftEdge / isMainMenuPanelObj', () => {
  it('finds the main menu left edge (pinnedScreenPosition wins over x)', () => {
    const objects = {
      a: panelObj(50),
      menu: {
        id: 'menu',
        type: 'PANEL',
        panelType: 'MAIN_MENU',
        x: 1200,
        pinnedScreenPosition: { x: 1100, y: 0 },
      } as unknown as TableObject,
    };
    expect(isMainMenuPanelObj(objects.menu)).toBe(true);
    expect(getMainMenuLeftEdge(objects)).toBe(1100);
  });

  it('returns null when there is no main menu', () => {
    expect(getMainMenuLeftEdge({ a: panelObj(50) })).toBeNull();
  });
});
