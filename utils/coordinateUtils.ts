import { Coordinates } from '../types';
import { vuToPixels, pixelsToVu } from './vuSystem';

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

/**
 * Convert viewport coordinates to world coordinates for UI objects
 * UI objects don't account for scroll in their rendering
 *
 * @param viewportX - Screen X coordinate in pixels
 * @param viewportY - Screen Y coordinate in pixels
 * @param offset - Pan offset in pixels
 * @param pixelsPerVU - Conversion factor from vu to pixels
 */
export function viewportToUIWorld(
  viewportX: number,
  viewportY: number,
  offset: Coordinates,
  pixelsPerVU: number = 1
): Coordinates {
  return {
    x: viewportX / pixelsPerVU,
    y: viewportY / pixelsPerVU
  };
}

/**
 * Convert world coordinates to viewport coordinates for UI objects
 *
 * @param worldX - World X coordinate in vu
 * @param worldY - World Y coordinate in vu
 * @param offset - Pan offset in pixels
 * @param pixelsPerVU - Conversion factor from vu to pixels
 */
export function uiWorldToViewport(
  worldX: number,
  worldY: number,
  offset: Coordinates,
  pixelsPerVU: number = 1
): Coordinates {
  return {
    x: worldX * pixelsPerVU + offset.x,
    y: worldY * pixelsPerVU + offset.y
  };
}

/**
 * Get distance between two points
 */
export function getDistance(p1: Coordinates, p2: Coordinates): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get angle between two points in degrees
 */
export function getAngle(p1: Coordinates, p2: Coordinates): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
}
