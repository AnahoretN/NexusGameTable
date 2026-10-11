/**
 * Unit tests for coordinate conversions (utils/coordinateUtils.ts).
 *
 * Pure math used by every camera/pan/zoom interaction — a regression here
 * moves every object on the board at once.
 */

import { describe, test, expect } from 'vitest';
import { viewportToWorld, worldToViewport } from '../coordinateUtils';

const offset = { x: 100, y: 50 };
const scroll = { left: 30, top: 20 };
const ppvu = 2;

describe('viewportToWorld / worldToViewport', () => {
  test('round-trip preserves the point', () => {
    const world = viewportToWorld(640, 480, offset, scroll.left, scroll.top, ppvu);
    const back = worldToViewport(world.x, world.y, offset, scroll.left, scroll.top, ppvu);
    expect(back.x).toBeCloseTo(640);
    expect(back.y).toBeCloseTo(480);
  });

  test('applies scroll and offset with the documented formula', () => {
    // (640 + 30 - 100) / 2 = 285
    expect(viewportToWorld(640, 480, offset, scroll.left, scroll.top, ppvu)).toEqual({
      x: 285,
      y: 225, // (480 + 20 - 50) / 2
    });
  });

  test('defaults: no scroll, 1 pixel per VU', () => {
    expect(viewportToWorld(100, 100, { x: 0, y: 0 })).toEqual({ x: 100, y: 100 });
    expect(worldToViewport(7, 3, { x: 0, y: 0 })).toEqual({ x: 7, y: 3 });
  });
});
