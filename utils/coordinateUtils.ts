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
 * Batch convert viewport coordinates to world coordinates for performance
 * Used when converting multiple points at once
 *
 * @param points - Array of viewport coordinates in pixels
 * @param offset - Pan offset in pixels
 * @param scrollLeft - Horizontal scroll position in pixels
 * @param scrollTop - Vertical scroll position in pixels
 * @param pixelsPerVU - Conversion factor from vu to pixels
 * @returns Array of world coordinates in vu
 */
export function batchViewportToWorld(
  points: Array<{ x: number; y: number }>,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates[] {
  const result = new Array(points.length);
  const invPixelsPerVU = 1 / pixelsPerVU; // Pre-compute for optimization

  for (let i = 0; i < points.length; i++) {
    result[i] = {
      x: (points[i].x + scrollLeft - offset.x) * invPixelsPerVU,
      y: (points[i].y + scrollTop - offset.y) * invPixelsPerVU
    };
  }

  return result;
}

/**
 * Batch convert world coordinates to viewport coordinates for performance
 * Used when converting multiple points at once
 *
 * @param points - Array of world coordinates in vu
 * @param offset - Pan offset in pixels
 * @param scrollLeft - Horizontal scroll position in pixels
 * @param scrollTop - Vertical scroll position in pixels
 * @param pixelsPerVU - Conversion factor from vu to pixels
 * @returns Array of viewport coordinates in pixels
 */
export function batchWorldToViewport(
  points: Array<{ x: number; y: number }>,
  offset: Coordinates,
  scrollLeft: number = 0,
  scrollTop: number = 0,
  pixelsPerVU: number = 1
): Coordinates[] {
  const result = new Array(points.length);

  for (let i = 0; i < points.length; i++) {
    result[i] = {
      x: points[i].x * pixelsPerVU + offset.x - scrollLeft,
      y: points[i].y * pixelsPerVU + offset.y - scrollTop
    };
  }

  return result;
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
 * Batch get distances from one point to multiple points
 * More efficient than calling getDistance multiple times
 *
 * @param fromPoint - Starting point
 * @param toPoints - Array of destination points
 * @returns Array of distances
 */
export function batchGetDistances(
  fromPoint: Coordinates,
  toPoints: Coordinates[]
): number[] {
  const result = new Array(toPoints.length);
  const fromX = fromPoint.x;
  const fromY = fromPoint.y;

  for (let i = 0; i < toPoints.length; i++) {
    const dx = toPoints[i].x - fromX;
    const dy = toPoints[i].y - fromY;
    result[i] = Math.sqrt(dx * dx + dy * dy);
  }

  return result;
}

/**
 * Get angle between two points in degrees
 */
export function getAngle(p1: Coordinates, p2: Coordinates): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
}
