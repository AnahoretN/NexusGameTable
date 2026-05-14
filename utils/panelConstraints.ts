/**
 * Panel Constraint Utilities
 * Ensures panels stay within screen bounds and have valid sizes
 * All coordinates and sizes are in Virtual Units (VU)
 *
 * Screen size in VU:
 * - Height is always 1000 VU (by definition of VU system)
 * - Width depends on aspect ratio: (viewportWidth / viewportHeight) * 1000
 */

import { VU_PER_SCREEN_HEIGHT } from './vuSystem';
import { PanelObject, WindowObject } from '../types';

// Minimum panel dimensions in VU
export const MIN_PANEL_WIDTH = 200;
export const MIN_PANEL_HEIGHT = 150;

// Default screen dimensions in VU (can be overridden by actual viewport)
export const DEFAULT_SCREEN_WIDTH_VU = 1778; // ~16:9 aspect ratio
export const DEFAULT_SCREEN_HEIGHT_VU = VU_PER_SCREEN_HEIGHT; // 1000 VU

/**
 * Constrain a value to be within min/max bounds
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Constrain panel size to be within screen bounds
 * Panel cannot be larger than the screen (in VU)
 *
 * @param width - Desired width in VU
 * @param height - Desired height in VU
 * @param screenWidth - Screen width in VU (default: 1778 for 16:9)
 * @param screenHeight - Screen height in VU (default: 1000)
 */
export function constrainPanelSize(
  width: number,
  height: number,
  screenWidth: number = DEFAULT_SCREEN_WIDTH_VU,
  screenHeight: number = DEFAULT_SCREEN_HEIGHT_VU
): { width: number; height: number } {
  return {
    width: clamp(width, MIN_PANEL_WIDTH, screenWidth),
    height: clamp(height, MIN_PANEL_HEIGHT, screenHeight),
  };
}

/**
 * Constrain panel position so at least 50% of the panel is visible on screen
 * Panel can extend beyond screen bounds, but no more than half its size
 *
 * @param x - Desired X position in VU
 * @param y - Desired Y position in VU
 * @param width - Panel width in VU
 * @param height - Panel height in VU
 * @param screenWidth - Screen width in VU
 * @param screenHeight - Screen height in VU
 * @returns Constrained position {x, y} in VU
 */
export function constrainPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  screenWidth: number = DEFAULT_SCREEN_WIDTH_VU,
  screenHeight: number = DEFAULT_SCREEN_HEIGHT_VU
): { x: number; y: number } {
  // Allow panel to go off-screen by up to half its size
  // Minimum visible: 50% of panel must be on screen
  const minX = -width / 2;
  const maxX = screenWidth - width / 2;
  const minY = -height / 2;
  const maxY = screenHeight - height / 2;

  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
  };
}

/**
 * Constrain both size and position of a panel
 * Useful when both dimensions and position might change
 */
export function constrainPanelBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  screenWidth: number = DEFAULT_SCREEN_WIDTH_VU,
  screenHeight: number = DEFAULT_SCREEN_HEIGHT_VU
): { x: number; y: number; width: number; height: number } {
  const constrainedSize = constrainPanelSize(width, height, screenWidth, screenHeight);
  const constrainedPosition = constrainPanelPosition(
    x,
    y,
    constrainedSize.width,
    constrainedSize.height,
    screenWidth,
    screenHeight
  );

  return {
    ...constrainedPosition,
    ...constrainedSize,
  };
}

/**
 * Apply constraints to a panel object (for PanelObject or WindowObject)
 * Returns the constrained properties that need to be updated
 *
 * @param obj - Panel or Window object
 * @param updates - Optional partial updates to apply constraints to
 * @param screenWidth - Screen width in VU
 * @param screenHeight - Screen height in VU
 */
export function applyPanelConstraints(
  obj: PanelObject | WindowObject,
  updates?: Partial<{ x: number; y: number; width: number; height: number }>,
  screenWidth: number = DEFAULT_SCREEN_WIDTH_VU,
  screenHeight: number = DEFAULT_SCREEN_HEIGHT_VU
): { x: number; y: number; width: number; height: number } {
  const currentX = updates?.x !== undefined ? updates.x : obj.x;
  const currentY = updates?.y !== undefined ? updates.y : obj.y;
  const currentWidth = updates?.width !== undefined ? updates.width : obj.width;
  const currentHeight = updates?.height !== undefined ? updates.height : obj.height;

  return constrainPanelBounds(currentX, currentY, currentWidth, currentHeight, screenWidth, screenHeight);
}

/**
 * Calculate screen dimensions in VU based on viewport size
 * @param viewportWidth - Viewport width in pixels
 * @param viewportHeight - Viewport height in pixels
 * @returns Screen dimensions in VU { width, height }
 */
export function getScreenDimensionsInVU(
  viewportWidth: number,
  viewportHeight: number
): { width: number; height: number } {
  const aspectRatio = viewportWidth / viewportHeight;
  return {
    width: aspectRatio * VU_PER_SCREEN_HEIGHT,
    height: VU_PER_SCREEN_HEIGHT,
  };
}

/**
 * Validate if a panel's current state is within constraints
 * Returns true if panel is valid, false otherwise
 */
export function isPanelValid(
  obj: PanelObject | WindowObject,
  screenWidth: number = DEFAULT_SCREEN_WIDTH_VU,
  screenHeight: number = DEFAULT_SCREEN_HEIGHT_VU
): boolean {
  const { x, y, width, height } = obj;

  // Check size constraints
  if (width < MIN_PANEL_WIDTH || width > screenWidth) return false;
  if (height < MIN_PANEL_HEIGHT || height > screenHeight) return false;

  // Check position constraints (at least 50% visible)
  if (x < -width / 2 || x > screenWidth - width / 2) return false;
  if (y < -height / 2 || y > screenHeight - height / 2) return false;

  return true;
}

/**
 * Simple size constraint for pixel-based panels (pinned to viewport)
 * Ensures panel stays within viewport bounds
 *
 * @param width - Desired width in pixels
 * @param height - Desired height in pixels
 * @param minWidth - Minimum width (default: 200)
 * @param minHeight - Minimum height (default: 150)
 * @param maxWidth - Maximum width (default: viewport width)
 * @param maxHeight - Maximum height (default: viewport height)
 */
export function constrainPixelSize(
  width: number,
  height: number,
  minWidth: number = 200,
  minHeight: number = 150,
  maxWidth: number = window.innerWidth,
  maxHeight: number = window.innerHeight
): { width: number; height: number } {
  return {
    width: Math.max(minWidth, Math.min(width, maxWidth)),
    height: Math.max(minHeight, Math.min(height, maxHeight)),
  };
}

/**
 * Simple position constraint for pixel-based panels (pinned to viewport)
 * Ensures at least 50px of panel remains visible
 *
 * @param x - Desired X position in pixels
 * @param y - Desired Y position in pixels
 * @param width - Panel width in pixels
 * @param height - Panel height in pixels
 * @param viewportWidth - Viewport width (default: window.innerWidth)
 * @param viewportHeight - Viewport height (default: window.innerHeight)
 * @param minVisible - Minimum visible pixels (default: 50)
 */
export function constrainPixelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number = window.innerWidth,
  viewportHeight: number = window.innerHeight,
  minVisible: number = 50
): { x: number; y: number } {
  // Allow panel to go off-screen, but keep minVisible pixels visible
  // minY: panel can go off top, but minVisible pixels of bottom must show
  // maxY: panel can go off bottom, but minVisible pixels of top must show
  const minX = minVisible - width;
  const maxX = viewportWidth - minVisible;
  const minY = minVisible - height;
  const maxY = viewportHeight - height + minVisible;

  return {
    x: Math.max(minX, Math.min(x, maxX)),
    y: Math.max(minY, Math.min(y, maxY)),
  };
}

/**
 * Quick constraint for both position and size in one call (pixel-based)
 * Useful for pinned panels
 */
export function constrainPixelBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  minWidth: number = 200,
  minHeight: number = 150,
  viewportWidth: number = window.innerWidth,
  viewportHeight: number = window.innerHeight
): { x: number; y: number; width: number; height: number } {
  const constrainedSize = constrainPixelSize(width, height, minWidth, minHeight, viewportWidth, viewportHeight);
  const constrainedPosition = constrainPixelPosition(
    x, y,
    constrainedSize.width,
    constrainedSize.height,
    viewportWidth,
    viewportHeight
  );

  return {
    ...constrainedPosition,
    ...constrainedSize,
  };
}
