import { PLAYABLE_AREA_SIZE, POOL_PANEL_SIZE } from '../constants';

/**
 * Territory management system for pool panels
 * Pool panels reserve territories outside the playable area (5000×5000 top-left)
 */

export interface Territory {
  id: string; // Pool panel ID
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerritoryRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Check if two territories overlap
 */
export function territoriesOverlap(a: TerritoryRect, b: TerritoryRect): boolean {
  return !(a.x + a.width <= b.x ||
           b.x + b.width <= a.x ||
           a.y + a.height <= b.y ||
           b.y + b.height <= a.y);
}

/**
 * Check if a territory is within playable area
 */
export function isInPlayableArea(rect: TerritoryRect): boolean {
  return rect.x < PLAYABLE_AREA_SIZE && rect.y < PLAYABLE_AREA_SIZE &&
         rect.x + rect.width > 0 && rect.y + rect.height > 0;
}

/**
 * Find available territory for a new pool panel
 * Searches in three 5000×5000 zones outside playable area:
 * 1. RIGHT zone: x ∈ [5000, 10000], y ∈ [0, 5000]     → 25 panels (5×5)
 * 2. BOTTOM zone: x ∈ [0, 5000], y ∈ [5000, 10000]    → 25 panels (5×5)
 * 3. DIAGONAL zone: x ∈ [5000, 10000], y ∈ [5000, 10000] → 25 panels (5×5)
 * Total capacity: 75 pool panels
 */
export function findAvailableTerritory(
  existingTerritories: Territory[],
  preferredSize: number = POOL_PANEL_SIZE
): TerritoryRect | null {
  const size = preferredSize;

  // Zone boundaries
  const ZONE_RIGHT = { minX: PLAYABLE_AREA_SIZE, maxX: WORLD_SIZE_VU, minY: 0, maxY: PLAYABLE_AREA_SIZE };
  const ZONE_BOTTOM = { minX: 0, maxX: PLAYABLE_AREA_SIZE, minY: PLAYABLE_AREA_SIZE, maxY: WORLD_SIZE_VU };
  const ZONE_DIAGONAL = { minX: PLAYABLE_AREA_SIZE, maxX: WORLD_SIZE_VU, minY: PLAYABLE_AREA_SIZE, maxY: WORLD_SIZE_VU };

  // Helper to check and return territory
  const tryTerritory = (x: number, y: number): TerritoryRect | null => {
    const candidate: TerritoryRect = { x, y, width: size, height: size };

    // Skip if overlaps playable area
    if (isInPlayableArea(candidate)) return null;

    // Check if overlaps with existing territories
    const overlaps = existingTerritories.some(existing =>
      territoriesOverlap(candidate, existing)
    );

    return overlaps ? null : candidate;
  };

  // Strategy 1: RIGHT zone (5000-10000 × 0-5000) - 25 panels
  for (let y = ZONE_RIGHT.minY; y < ZONE_RIGHT.maxY; y += size) {
    for (let x = ZONE_RIGHT.minX; x < ZONE_RIGHT.maxX; x += size) {
      const territory = tryTerritory(x, y);
      if (territory) return territory;
    }
  }

  // Strategy 2: BOTTOM zone (0-5000 × 5000-10000) - 25 panels
  for (let y = ZONE_BOTTOM.minY; y < ZONE_BOTTOM.maxY; y += size) {
    for (let x = ZONE_BOTTOM.minX; x < ZONE_BOTTOM.maxX; x += size) {
      const territory = tryTerritory(x, y);
      if (territory) return territory;
    }
  }

  // Strategy 3: DIAGONAL zone (5000-10000 × 5000-10000) - 25 panels
  for (let y = ZONE_DIAGONAL.minY; y < ZONE_DIAGONAL.maxY; y += size) {
    for (let x = ZONE_DIAGONAL.minX; x < ZONE_DIAGONAL.maxX; x += size) {
      const territory = tryTerritory(x, y);
      if (territory) return territory;
    }
  }

  return null; // No available territory found (all 75 slots occupied)
}

/**
 * Calculate territory for pool panel based on pool data
 */
export function calculatePoolTerritory(poolId: string, poolData: any): Territory {
  return {
    id: poolId,
    x: poolData.offsetX || 0,
    y: poolData.offsetY || 0,
    width: poolData.width || POOL_PANEL_SIZE,
    height: poolData.height || POOL_PANEL_SIZE
  };
}

/**
 * Validate that a pool territory is valid (outside playable area and not overlapping)
 */
export function validatePoolTerritory(
  territory: Territory,
  existingTerritories: Territory[]
): { valid: boolean; error?: string } {
  // Check if territory overlaps playable area
  if (isInPlayableArea(territory)) {
    return {
      valid: false,
      error: `Pool territory at (${territory.x}, ${territory.y}) overlaps playable area (0-${PLAYABLE_AREA_SIZE}×0-${PLAYABLE_AREA_SIZE})`
    };
  }

  // Check if territory overlaps existing pools
  const overlaps = existingTerritories
    .filter(existing => existing.id !== territory.id)
    .some(existing => territoriesOverlap(territory, existing));

  if (overlaps) {
    return {
      valid: false,
      error: `Pool territory at (${territory.x}, ${territory.y}) overlaps existing pool`
    };
  }

  return { valid: true };
}

/**
 * World size constant
 */
export const WORLD_SIZE_VU = 10000;

/**
 * Get playable area bounds
 */
export function getPlayableAreaBounds(): TerritoryRect {
  return {
    x: 0,
    y: 0,
    width: PLAYABLE_AREA_SIZE,
    height: PLAYABLE_AREA_SIZE
  };
}