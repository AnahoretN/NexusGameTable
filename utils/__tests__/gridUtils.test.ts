/**
 * Unit tests for grid utilities (utils/gridUtils.ts).
 *
 * Covers the historically bug-prone parts:
 * - snapToGrid: tokens must land exactly on cell centers (v0.3.x fix), and
 *   the grid offset must survive the snap.
 * - isAnchorAttachedObject: board/cell-attached objects move by anchor
 *   propagation and must never glide.
 * - getAttachedObjectsForMove: which objects ride along when a board/cell
 *   moves (locked and cursor-slot objects must NOT).
 */

import { vi, describe, test, expect } from 'vitest';
import {
  snapToGrid,
  isAnchorAttachedObject,
  getAttachedObjectsForMove,
  generateGridCellKey,
  parseGridCellKey,
  calculateHexHeight,
} from '../gridUtils';
import { GridType, ItemType } from '../../types';

vi.mock('../logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('snapToGrid — SQUARE', () => {
  const opts = { gridSize: 100, gridType: GridType.SQUARE };

  test('snaps to exact cell centers', () => {
    // v0.3.x regression: tokens drifted next to the cell center
    expect(snapToGrid(120, 80, opts)).toEqual({ x: 100, y: 100 });
    expect(snapToGrid(250, 249, opts)).toEqual({ x: 300, y: 200 });
    expect(snapToGrid(-1, -1, opts)).toEqual({ x: 0, y: 0 });
  });

  test('rounds half-point coordinates to the nearest cell', () => {
    expect(snapToGrid(150, 0, opts)).toEqual({ x: 200, y: 0 }); // .5 rounds up
  });

  test('grid offset shifts the whole lattice, not the point', () => {
    const offset = { gridSize: 100, gridType: GridType.SQUARE, offsetX: 25, offsetY: 75 };
    // Point exactly on an offset cell center stays; more than half a cell
    // to the right of it snaps to the next offset center
    expect(snapToGrid(125, 175, offset)).toEqual({ x: 125, y: 175 });
    expect(snapToGrid(180, 175, offset)).toEqual({ x: 225, y: 175 });
  });
});

describe('snapToGrid — HEX', () => {
  const width = 100;
  const height = calculateHexHeight(width);

  test('a point already on a hex center does not move', () => {
    const opts = { gridSize: width, gridType: GridType.HEX };
    const center = snapToGrid(0, 0, opts); // (0,0) is a lattice point
    expect(snapToGrid(center.x, center.y, opts)).toEqual(center);
  });

  test('nearby points snap to the nearest hex center', () => {
    const opts = { gridSize: width, gridType: GridType.HEX };
    const center = snapToGrid(0, 0, opts);
    const nearby = snapToGrid(center.x + 5, center.y + 5, opts);
    expect(nearby).toEqual(center);
  });

  test('hex height honors the documented 1.15 ratio', () => {
    expect(calculateHexHeight(100)).toBeCloseTo(115);
  });
});

describe('isAnchorAttachedObject', () => {
  test('true for gridCellKey and snappedToCellId back-refs', () => {
    expect(isAnchorAttachedObject({ id: 'a', gridCellKey: 'board-1:2:3' } as any)).toBe(true);
    expect(isAnchorAttachedObject({ id: 'a', snappedToCellId: 'cell-1' } as any)).toBe(true);
  });

  test('false for free objects, and null-safe', () => {
    expect(isAnchorAttachedObject({ id: 'a' } as any)).toBe(false);
    expect(isAnchorAttachedObject(null as any)).toBe(false);
    expect(isAnchorAttachedObject(undefined as any)).toBe(false);
  });
});

describe('getAttachedObjectsForMove', () => {
  const board = { id: 'board-1', type: ItemType.BOARD, x: 0, y: 0 };
  const cell = { id: 'cell-1', type: ItemType.BATTLEFIELD_CELL, x: 100, y: 0, snappedToCellId: undefined };

  test('non-board/non-cell movers drag nothing', () => {
    const token = { id: 't1', type: ItemType.TOKEN, x: 0, y: 0 };
    expect(getAttachedObjectsForMove(token as any, { 'board-1': board as any, t1: token as any })).toEqual([]);
  });

  test('objects on the board grid (gridCellKey prefix) ride along', () => {
    const token = { id: 't1', type: ItemType.TOKEN, x: 50, y: 50, gridCellKey: 'board-1:0:0' };
    const stranger = { id: 't2', type: ItemType.TOKEN, x: 900, y: 900 }; // no back-ref

    const result = getAttachedObjectsForMove(board as any, {
      'board-1': board as any, t1: token as any, t2: stranger as any,
    } as any);

    expect(result.map(o => o.id)).toEqual(['t1']);
  });

  test('locked and cursor-slot objects never ride along', () => {
    const locked = { id: 't1', type: ItemType.TOKEN, x: 50, y: 50, gridCellKey: 'board-1:0:0', locked: true };
    const held = { id: 't2', type: ItemType.TOKEN, x: 60, y: 60, gridCellKey: 'board-1:1:0', inCursorSlot: true };

    const result = getAttachedObjectsForMove(board as any, {
      'board-1': board as any, t1: locked as any, t2: held as any,
    } as any);

    expect(result).toEqual([]);
  });

  test('objects snapped to a cell (snappedToCellId) ride along', () => {
    const token = { id: 't1', type: ItemType.TOKEN, x: 100, y: 0, snappedToCellId: 'cell-1' };

    const result = getAttachedObjectsForMove(cell as any, {
      'cell-1': cell as any, t1: token as any,
    } as any);

    expect(result.map(o => o.id)).toEqual(['t1']);
  });

  test('chained: a cell on the moved board carries its own snapped tokens', () => {
    const cellOnBoard = { id: 'cell-1', type: ItemType.BATTLEFIELD_CELL, x: 100, y: 0, gridCellKey: 'board-1:1:0' };
    const tokenOnCell = { id: 't1', type: ItemType.TOKEN, x: 100, y: 0, snappedToCellId: 'cell-1' };

    const result = getAttachedObjectsForMove(board as any, {
      'board-1': board as any,
      'cell-1': cellOnBoard as any,
      t1: tokenOnCell as any,
    } as any);

    expect(result.map(o => o.id).sort()).toEqual(['cell-1', 't1']);
  });
});

describe('grid cell keys', () => {
  test('round-trips col/row', () => {
    const key = generateGridCellKey(12, 34);
    const parsed = parseGridCellKey(key);
    expect(parsed.col).toBe(12);
    expect(parsed.row).toBe(34);
  });
});
