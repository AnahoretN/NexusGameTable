import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DISPLAY_ANGLE,
  MIN_DISPLAY_ANGLE,
  MAX_DISPLAY_ANGLE,
  clampDisplayAngle,
  wedgeRayLocalAngle,
  buildWedgeClipPolygon,
  halfAngleFromLocalMouseAngle,
} from '../effectDisplayAngle';

describe('clampDisplayAngle', () => {
  it('defaults to 90° for undefined / invalid input', () => {
    expect(clampDisplayAngle(undefined)).toBe(DEFAULT_DISPLAY_ANGLE);
    expect(clampDisplayAngle(NaN)).toBe(DEFAULT_DISPLAY_ANGLE);
    expect(clampDisplayAngle(Infinity)).toBe(DEFAULT_DISPLAY_ANGLE);
  });

  it('clamps into [1, 360]', () => {
    expect(clampDisplayAngle(0)).toBe(MIN_DISPLAY_ANGLE);
    expect(clampDisplayAngle(-50)).toBe(MIN_DISPLAY_ANGLE);
    expect(clampDisplayAngle(999)).toBe(MAX_DISPLAY_ANGLE);
    expect(clampDisplayAngle(45.5)).toBe(45.5);
  });
});

describe('wedgeRayLocalAngle', () => {
  it('places rays symmetrically around local up (-90°)', () => {
    expect(wedgeRayLocalAngle(45, 1)).toBeCloseTo(-67.5);
    expect(wedgeRayLocalAngle(45, -1)).toBeCloseTo(-112.5);
    expect(wedgeRayLocalAngle(360, 1)).toBeCloseTo(90);
    expect(wedgeRayLocalAngle(360, -1)).toBeCloseTo(-270);
  });
});

describe('buildWedgeClipPolygon', () => {
  it('returns null for a full-disc wedge (no clipping needed)', () => {
    expect(buildWedgeClipPolygon(200, 100, 100, 50, 360)).toBeNull();
    expect(buildWedgeClipPolygon(200, 100, 100, 50, 0)).not.toBeNull();
  });

  it('starts the polygon at the pivot, with valid CSS px point syntax', () => {
    const poly = buildWedgeClipPolygon(300, 300, 150, 165, 45)!;
    expect(poly).toMatch(/^polygon\(150\.0px 165\.0px,/);
    // every point is a space-separated px pair, pairs are comma-separated
    const pointList = poly.replace('polygon(', '').replace(')', '');
    for (const point of pointList.split(', ')) {
      expect(point).toMatch(/^-?[\d.]+px -?[\d.]+px$/);
    }
  });

  it('samples the arc between the two rays', () => {
    const poly = buildWedgeClipPolygon(300, 300, 150, 165, 45)!;
    // pivot + ceil(45/10)=5 arc steps
    expect(poly.split(', ').length).toBe(7);
    // wide wedge gets more samples (180/10=18 steps)
    const wide = buildWedgeClipPolygon(300, 300, 150, 165, 180)!;
    expect(wide.split(', ').length).toBe(2 + 18);
    // near-full wedge hits the 48-step cap via ceil(359/10)=36… stays 36
    const full = buildWedgeClipPolygon(300, 300, 150, 165, 360 - MIN_DISPLAY_ANGLE)!;
    expect(full.split(', ').length).toBe(2 + Math.min(48, Math.ceil((360 - MIN_DISPLAY_ANGLE) / 10)));
  });

  it('points the ray ends in the correct local directions (45° wedge, up-centered)', () => {
    const W = 300, H = 300, px = 150, py = 165;
    const poly = buildWedgeClipPolygon(W, H, px, py, 45)!;
    const pointPairs = poly
      .replace('polygon(', '')
      .replace(')', '')
      .split(', ')
      .map(p => p.split('px ').map(v => parseFloat(v)));
    const [, ...arc] = pointPairs;

    // First arc point on the -1 ray (up-left, angle -112.5°), last on the +1 ray (up-right, angle -67.5°)
    const first = arc[0];
    const last = arc[arc.length - 1];
    expect(first[0]).toBeLessThan(px);
    expect(first[1]).toBeLessThan(py);
    expect(last[0]).toBeGreaterThan(px);
    expect(last[1]).toBeLessThan(py);

    // Both lie on their ray directions from the pivot
    const a1 = Math.atan2(first[1] - py, first[0] - px) * 180 / Math.PI;
    const a2 = Math.atan2(last[1] - py, last[0] - px) * 180 / Math.PI;
    expect(a1).toBeCloseTo(wedgeRayLocalAngle(45, -1), 1);
    expect(a2).toBeCloseTo(wedgeRayLocalAngle(45, 1), 1);
  });

  it('radius overshoots the element so the wedge always covers it', () => {
    // Pivot at a corner of a wide element
    const poly = buildWedgeClipPolygon(1000, 100, 0, 100, 45)!;
    const coords = poly
      .replace('polygon(', '')
      .replace(')', '')
      .split(', ')
      .map(s => s.split('px ').map(v => parseFloat(v)));
    const maxDist = Math.max(...coords.map(([x, y]) => Math.hypot(x - 0, y - 100)));
    expect(maxDist).toBeGreaterThan(Math.hypot(1000, 100));
  });

  it('tolerates non-finite input defensively', () => {
    expect(() => buildWedgeClipPolygon(NaN, NaN, NaN, NaN, NaN)).not.toThrow();
    expect(buildWedgeClipPolygon(NaN, NaN, NaN, NaN, 45)).toMatch(/^polygon\(/);
  });
});

describe('halfAngleFromLocalMouseAngle', () => {
  it('recovers the half-angle when the marker sits on its ray', () => {
    expect(halfAngleFromLocalMouseAngle(wedgeRayLocalAngle(45, 1), 1)).toBeCloseTo(22.5);
    expect(halfAngleFromLocalMouseAngle(wedgeRayLocalAngle(45, -1), -1)).toBeCloseTo(22.5);
  });

  it('saturates instead of mirroring when dragged across the opposite ray', () => {
    // +1 marker dragged 180° past its ray → raw half 202.5 → clamps to 180 (fully open)
    expect(halfAngleFromLocalMouseAngle(wedgeRayLocalAngle(45, 1) + 180, 1)).toBe(180);
    // dragged to the center ray → clamps to the minimum sliver
    expect(halfAngleFromLocalMouseAngle(-90, 1)).toBe(MIN_DISPLAY_ANGLE / 2);
    expect(halfAngleFromLocalMouseAngle(-90, -1)).toBe(MIN_DISPLAY_ANGLE / 2);
  });

  it('stays continuous around the ±180° raw-value boundary', () => {
    // Just before / just after the fully-open position: both clamp to 180, no snap to closed
    expect(halfAngleFromLocalMouseAngle(89, 1)).toBe(179);
    expect(halfAngleFromLocalMouseAngle(91, 1)).toBe(180);
    expect(halfAngleFromLocalMouseAngle(175, 1)).toBe(180);
    // -1 side reaches fully-open at local ≈ -270 (raw half = 180); symmetric continuity
    expect(halfAngleFromLocalMouseAngle(-269, -1)).toBe(179);
    expect(halfAngleFromLocalMouseAngle(-271, -1)).toBe(180);
    expect(halfAngleFromLocalMouseAngle(-175, 1)).toBe(MIN_DISPLAY_ANGLE / 2);
  });
});
