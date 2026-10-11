import { Coordinates } from '../types';

/**
 * Convert viewport (screen) coordinates to world coordinates (vu)
 * Used when unpinning objects from viewport
 *
 * @param viewportX - Screen X coordinate in pixels
 * @param viewportY - Screen Y coordinate in pixels
 * @param offset - Pan offset in pixels
 * @param scrollLeft - Horizontal scroll position in pixels
 * @param scrollTop - Vertical scroll position in pixels
 * @param pixelsPerVU - Conversion factor from vu to pixels
 */
export function viewportToWorld(
  viewportX: number,
  viewportY: number,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates {
  return {
    x: (viewportX + scrollLeft - offset.x) / pixelsPerVU,
    y: (viewportY + scrollTop - offset.y) / pixelsPerVU
  };
}

/**
 * Convert world coordinates (vu) to viewport (screen) coordinates
 * Used when pinning objects to viewport
 *
 * @param worldX - World X coordinate in vu
 * @param worldY - World Y coordinate in vu
 * @param offset - Pan offset in pixels
 * @param scrollLeft - Horizontal scroll position in pixels
 * @param scrollTop - Vertical scroll position in pixels
 * @param pixelsPerVU - Conversion factor from vu to pixels
 */
export function worldToViewport(
  worldX: number,
  worldY: number,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates {
  return {
    x: worldX * pixelsPerVU + offset.x - scrollLeft,
    y: worldY * pixelsPerVU + offset.y - scrollTop
  };
}
