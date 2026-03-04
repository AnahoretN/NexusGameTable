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
 */

// Core constants
export const WORLD_SIZE_VU = 5000; // Game world is 5000×5000 vu
export const REFERENCE_SCREEN_SIZE = 1080; // Reference screen size in pixels (Full HD)
export const REFERENCE_VU_VISIBLE = 1000; // How many vu are visible on reference screen by default

/**
 * Calculate pixelsPerVU conversion factor for the current viewport
 *
 * On a 1080px screen, we can see REFERENCE_VU_VISIBLE (1000) vu by default.
 * This gives us pixelsPerVU = REFERENCE_SCREEN_SIZE / REFERENCE_VU_VISIBLE = 1.08 px/vu
 *
 * For other screen sizes, we scale proportionally to maintain the same visual experience.
 */
export function calculatePixelsPerVU(viewportWidth: number, viewportHeight: number): number {
  const minDimension = Math.min(viewportWidth, viewportHeight);
  // Maintain the same ratio: how many pixels per vu
  return (minDimension / REFERENCE_SCREEN_SIZE) * (REFERENCE_SCREEN_SIZE / REFERENCE_VU_VISIBLE);
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
