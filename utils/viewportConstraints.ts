import { PLAYABLE_AREA_SIZE } from '../constants';

/**
 * Viewport constraint utilities
 * Limits scrolling and panning to playable area (5000×5000 top-left corner)
 */

export interface ViewportConstraints {
  minScrollX: number;
  maxScrollX: number;
  minScrollY: number;
  maxScrollY: number;
}

/**
 * Calculate scroll constraints based on viewport size and pixels per VU
 */
export function calculateScrollConstraints(
  viewportWidth: number,
  viewportHeight: number,
  pixelsPerVU: number
): ViewportConstraints {
  // Convert playable area size to pixels
  const playableAreaPx = PLAYABLE_AREA_SIZE * pixelsPerVU;

  // Maximum scroll is the difference between playable area and viewport size
  const maxScrollX = Math.max(0, playableAreaPx - viewportWidth);
  const maxScrollY = Math.max(0, playableAreaPx - viewportHeight);

  return {
    minScrollX: 0,
    maxScrollX,
    minScrollY: 0,
    maxScrollY
  };
}

/**
 * Clamp scroll values to playable area constraints
 */
export function clampScrollToPlayableArea(
  scrollX: number,
  scrollY: number,
  viewportWidth: number,
  viewportHeight: number,
  pixelsPerVU: number
): { x: number; y: number } {
  const constraints = calculateScrollConstraints(viewportWidth, viewportHeight, pixelsPerVU);

  return {
    x: Math.max(constraints.minScrollX, Math.min(scrollX, constraints.maxScrollX)),
    y: Math.max(constraints.minScrollY, Math.min(scrollY, constraints.maxScrollY))
  };
}

/**
 * Check if a world coordinate is within playable area
 */
export function isInPlayableArea(worldX: number, worldY: number): boolean {
  return worldX >= 0 && worldX < PLAYABLE_AREA_SIZE &&
         worldY >= 0 && worldY < PLAYABLE_AREA_SIZE;
}

/**
 * Check if a rectangle intersects with playable area
 */
export function intersectsPlayableArea(
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number
): boolean {
  return rectX < PLAYABLE_AREA_SIZE && rectY < PLAYABLE_AREA_SIZE &&
         rectX + rectWidth > 0 && rectY + rectHeight > 0;
}

/**
 * Filter objects to only those in playable area (for rendering optimization)
 */
export function filterPlayableObjects<T extends { x: number; y: number; width?: number; height?: number }>(
  objects: T[]
): T[] {
  return objects.filter(obj => {
    const x = obj.x ?? 0;
    const y = obj.y ?? 0;
    const width = obj.width ?? 100;
    const height = obj.height ?? 100;

    // Include objects that intersect with playable area
    return intersectsPlayableArea(x, y, width, height);
  });
}

/**
 * Clamp object position to playable area
 * Ensures at least a minimum portion of the object stays within the playable area
 * @param x - Object's top-left X coordinate
 * @param y - Object's top-left Y coordinate
 * @param width - Object width
 * @param height - Object height
 * @param minVisibleRatio - Minimum ratio of object that must stay visible (0-1), default 0.25 (25%)
 * @returns Clamped {x, y} coordinates
 */
export function clampObjectPositionToPlayableArea(
  x: number,
  y: number,
  width: number,
  height: number,
  minVisibleRatio: number = 0.25
): { x: number; y: number } {
  const objWidth = width ?? 100;
  const objHeight = height ?? 100;

  // Calculate minimum visible portion
  const minVisibleWidth = objWidth * minVisibleRatio;
  const minVisibleHeight = objHeight * minVisibleRatio;

  // Clamp X: ensure at least minVisibleWidth is visible on the right side
  // and allow the object to go partially off-screen on the left
  const maxX = PLAYABLE_AREA_SIZE - minVisibleWidth;
  const clampedX = Math.max(-objWidth + minVisibleWidth, Math.min(x, maxX));

  // Clamp Y: ensure at least minVisibleHeight is visible on the bottom side
  // and allow the object to go partially off-screen on the top
  const maxY = PLAYABLE_AREA_SIZE - minVisibleHeight;
  const clampedY = Math.max(-objHeight + minVisibleHeight, Math.min(y, maxY));

  return { x: clampedX, y: clampedY };
}