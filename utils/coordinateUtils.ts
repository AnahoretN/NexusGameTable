import { Coordinates } from '../types';

/**
 * Convert viewport (screen) coordinates to world coordinates
 * Used when unpinning objects from viewport
 */
export function viewportToWorld(
  viewportX: number,
  viewportY: number,
  offset: Coordinates,
  zoom: number,
  scrollLeft: number = 0,
  scrollTop: number = 0
): Coordinates {
  return {
    x: (viewportX + scrollLeft - offset.x) / zoom,
    y: (viewportY + scrollTop - offset.y) / zoom
  };
}

/**
 * Convert world coordinates to viewport (screen) coordinates
 * Used when pinning objects to viewport
 */
export function worldToViewport(
  worldX: number,
  worldY: number,
  offset: Coordinates,
  zoom: number,
  scrollLeft: number = 0,
  scrollTop: number = 0
): Coordinates {
  return {
    x: worldX * zoom + offset.x - scrollLeft,
    y: worldY * zoom + offset.y - scrollTop
  };
}

/**
 * Convert viewport coordinates to world coordinates for UI objects
 * UI objects don't account for scroll in their rendering
 */
export function viewportToUIWorld(
  viewportX: number,
  viewportY: number,
  offset: Coordinates,
  zoom: number
): Coordinates {
  return {
    x: viewportX * zoom + offset.x,
    y: viewportY * zoom + offset.y
  };
}

/**
 * Convert world coordinates to viewport coordinates for UI objects
 */
export function uiWorldToViewport(
  worldX: number,
  worldY: number,
  offset: Coordinates,
  zoom: number
): Coordinates {
  return {
    x: (worldX - offset.x) / zoom,
    y: (worldY - offset.y) / zoom
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
