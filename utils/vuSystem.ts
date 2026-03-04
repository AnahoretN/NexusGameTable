/**
 * Virtual Units (vu) Coordinate System
 *
 * The game world is defined in virtual units (vu), independent of screen pixels.
 * This allows all players to see the same game regardless of their screen resolution.
 *
 * - Game world: 5000 × 5000 vu (fixed)
 * - Object positions and sizes are stored in vu
 * - Each client converts vu to their local pixels for rendering
 * - Proportions are always preserved
 *
 * vu to pixels conversion: 1 vu = 0.1% of screen height
 * This means 1000 vu = 100% of screen height (visible vertical area)
 */

// Core constants
export const WORLD_SIZE_VU = 5000; // Game world is 5000×5000 vu
export const VU_PER_SCREEN_HEIGHT = 1000; // 1000 vu = 100% of screen height

/**
 * Calculate pixelsPerVU conversion factor for the current viewport
 *
 * 1 vu = 0.1% of screen height
 * 1000 vu = 100% of screen height
 *
 * pixelsPerVU = viewportHeight / 1000
 */
export function calculatePixelsPerVU(viewportWidth: number, viewportHeight: number): number {
  return viewportHeight / VU_PER_SCREEN_HEIGHT;
}

/**
 * Convert virtual units to pixels
 */
export function vuToPixels(vu: number, pixelsPerVU: number): number {
  if (pixelsPerVU === undefined || pixelsPerVU === null || isNaN(pixelsPerVU)) {
    return vu; // Fallback: assume 1:1 if pixelsPerVU is invalid
  }
  return vu * pixelsPerVU;
}

/**
 * Convert pixels to virtual units
 */
export function pixelsToVu(px: number, pixelsPerVU: number): number {
  if (pixelsPerVU === undefined || pixelsPerVU === null || isNaN(pixelsPerVU) || pixelsPerVU === 0) {
    return px; // Fallback: assume 1:1 if pixelsPerVU is invalid
  }
  return px / pixelsPerVU;
}
