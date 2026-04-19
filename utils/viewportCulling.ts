import { TableObject } from '../types';
import { vuToPixels } from './vuSystem';

export interface ViewportBounds {
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelsPerVU: number;
}

export interface CullingConfig {
  overscan?: number; // Buffer zone in pixels (default: 200)
  enabled?: boolean; // Enable/disable culling (default: true)
  minObjectsToCull?: number; // Only cull if more than this many objects (default: 50)
}

/**
 * Check if an object intersects with the viewport
 */
function objectIntersectsViewport(
  obj: TableObject,
  bounds: ViewportBounds,
  overscan: number
): boolean {
  const { scrollX, scrollY, viewportWidth, viewportHeight, pixelsPerVU } = bounds;

  // Object position and size in pixels
  const objX = vuToPixels(obj.x ?? 0, pixelsPerVU);
  const objY = vuToPixels(obj.y ?? 0, pixelsPerVU);
  const objWidth = vuToPixels(obj.width ?? 100, pixelsPerVU);
  const objHeight = vuToPixels(obj.height ?? 100, pixelsPerVU);

  // Viewport bounds with overscan
  const viewportLeft = scrollX - overscan;
  const viewportRight = scrollX + viewportWidth + overscan;
  const viewportTop = scrollY - overscan;
  const viewportBottom = scrollY + viewportHeight + overscan;

  // Check intersection
  return (
    objX < viewportRight &&
    objX + objWidth > viewportLeft &&
    objY < viewportBottom &&
    objY + objHeight > viewportTop
  );
}

/**
 * Filter objects to only those visible in viewport
 * This is a performance optimization for rendering large numbers of objects
 */
export function filterVisibleObjects(
  objects: TableObject[],
  bounds: ViewportBounds,
  config: CullingConfig = {}
): TableObject[] {
  const {
    overscan = 200, // 200px buffer zone
    enabled = true,
    minObjectsToCull = 50
  } = config;

  // Don't cull if disabled or if there are few objects
  if (!enabled || objects.length < minObjectsToCull) {
    return objects;
  }

  // Filter to only visible objects
  return objects.filter(obj =>
    objectIntersectsViewport(obj, bounds, overscan)
  );
}

/**
 * Hook for calculating viewport bounds
 */
export interface ViewportBoundsResult {
  bounds: ViewportBounds;
  shouldCull: boolean;
}

export function calculateViewportBounds(
  scrollLeft: number,
  scrollTop: number,
  viewportWidth: number,
  viewportHeight: number,
  pixelsPerVU: number,
  totalObjects: number,
  config: CullingConfig = {}
): ViewportBoundsResult {
  const { minObjectsToCull = 50, enabled = true } = config;

  const bounds: ViewportBounds = {
    scrollX: scrollLeft,
    scrollY: scrollTop,
    viewportWidth,
    viewportHeight,
    pixelsPerVU
  };

  const shouldCull = enabled && totalObjects >= minObjectsToCull;

  return { bounds, shouldCull };
}

/**
 * Utility to estimate culling effectiveness
 */
export interface CullingStats {
  totalObjects: number;
  visibleObjects: number;
  culledObjects: number;
  cullingRatio: number; // 0-1, higher is better
}

export function calculateCullingStats(
  allObjects: TableObject[],
  visibleObjects: TableObject[]
): CullingStats {
  const totalObjects = allObjects.length;
  const visibleObjectsCount = visibleObjects.length;
  const culledObjects = totalObjects - visibleObjectsCount;
  const cullingRatio = totalObjects > 0 ? culledObjects / totalObjects : 0;

  return {
    totalObjects,
    visibleObjects: visibleObjectsCount,
    culledObjects,
    cullingRatio
  };
}