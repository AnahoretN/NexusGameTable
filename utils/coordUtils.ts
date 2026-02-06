/**
 * Coordinate transformation utilities for viewport system
 * The viewport uses CSS transform: translate(offset.x, offset.y) scale(zoom)
 * These functions convert between screen (client) coordinates and world coordinates
 */

export interface ViewportOffset {
  x: number;
  y: number;
}

/**
 * Convert screen/client coordinates to world coordinates
 * Formula: world = screen / zoom - offset
 * @param clientX - Screen X coordinate (e.g., event.clientX)
 * @param clientY - Screen Y coordinate (e.g., event.clientY)
 * @param zoom - Current zoom level
 * @param offset - Current viewport offset
 * @returns World coordinates { x, y }
 */
export function screenToWorld(
  clientX: number,
  clientY: number,
  zoom: number,
  offset: ViewportOffset
): { x: number; y: number } {
  return {
    x: clientX / zoom - offset.x,
    y: clientY / zoom - offset.y
  };
}

/**
 * Convert world coordinates to screen coordinates
 * Formula: screen = (world + offset) * zoom
 * @param worldX - World X coordinate
 * @param worldY - World Y coordinate
 * @param zoom - Current zoom level
 * @param offset - Current viewport offset
 * @returns Screen coordinates { x, y }
 */
export function worldToScreen(
  worldX: number,
  worldY: number,
  zoom: number,
  offset: ViewportOffset
): { x: number; y: number } {
  return {
    x: (worldX + offset.x) * zoom,
    y: (worldY + offset.y) * zoom
  };
}

/**
 * Convert only X coordinate from screen to world
 * @param clientX - Screen X coordinate
 * @param zoom - Current zoom level
 * @param offset - Current viewport offset
 * @returns World X coordinate
 */
export function screenXToWorldX(clientX: number, zoom: number, offset: ViewportOffset): number {
  return clientX / zoom - offset.x;
}

/**
 * Convert only Y coordinate from screen to world
 * @param clientY - Screen Y coordinate
 * @param zoom - Current zoom level
 * @param offset - Current viewport offset
 * @returns World Y coordinate
 */
export function screenYToWorldY(clientY: number, zoom: number, offset: ViewportOffset): number {
  return clientY / zoom - offset.y;
}

/**
 * Calculate screen position for a game object
 * Used for UI positioning, hit testing, etc.
 * @param objX - Object's world X coordinate
 * @param objY - Object's world Y coordinate
 * @param zoom - Current zoom level
 * @param offset - Current viewport offset
 * @returns Screen position { x, y }
 */
export function getObjectScreenPosition(
  objX: number,
  objY: number,
  zoom: number,
  offset: ViewportOffset
): { x: number; y: number } {
  return {
    x: (objX + offset.x) * zoom,
    y: (objY + offset.y) * zoom
  };
}

/**
 * Calculate CSS transform string for viewport container
 * @param offset - Viewport offset
 * @param zoom - Zoom level
 * @returns CSS transform string
 */
export function getViewportTransform(offset: ViewportOffset, zoom: number): string {
  return `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;
}

/**
 * Calculate delta in world coordinates from screen delta
 * Useful for drag operations where you have movement in screen pixels
 * @param screenDeltaX - Movement in screen X pixels
 * @param screenDeltaY - Movement in screen Y pixels
 * @param zoom - Current zoom level
 * @returns Delta in world coordinates
 */
export function screenDeltaToWorld(
  screenDeltaX: number,
  screenDeltaY: number,
  zoom: number
): { x: number; y: number } {
  return {
    x: screenDeltaX / zoom,
    y: screenDeltaY / zoom
  };
}
