/**
 * Centralized Drag/Drop Utilities
 *
 * This module provides unified functions for handling drag and drop operations
 * across different components (PoolTabletop, Tabletop, HandPanel).
 *
 * Key principles:
 * 1. Offsets are ALWAYS in screen pixels (clientX/clientY coordinate system)
 * 2. Convert to VU only at final positioning
 * 3. Single source of truth for offset calculation
 */

import { TableObject, ItemType } from '../types';

/**
 * Result of calculating pickup offset from a DOM element
 */
export interface PickupOffsetResult {
  /** Offset in screen pixels from element's top-left to click position */
  offsetX_PX: number;
  /** Offset in screen pixels from element's top-left to click position */
  offsetY_PX: number;
  /** The element's bounding rectangle (for debugging) */
  elementRect?: DOMRect;
}

/**
 * Options for calculating pickup offset
 */
export interface PickupOffsetOptions {
  /** The container element to query within (optional, defaults to document) */
  containerRef?: { current: Element | null };
  /** If true, log debug information */
  debug?: boolean;
}

/**
 * Calculate pickup offset from a DOM element
 *
 * This function calculates the offset from an element's top-left corner
 * to the click position. The offset is ALWAYS in screen pixels.
 *
 * @param objectId - The ID of the object to find in the DOM
 * @param startX - The clientX coordinate where the drag started
 * @param startY - The clientY coordinate where the drag started
 * @param options - Optional configuration
 * @returns The offset in screen pixels, or null if element not found
 */
export function calculatePickupOffset(
  objectId: string,
  startX: number,
  startY: number,
  options?: PickupOffsetOptions
): PickupOffsetResult | null {
  const { containerRef, debug = false } = options || {};

  // Try to find the element in the container if provided, otherwise in the document
  const element = containerRef?.current
    ? containerRef.current.querySelector(`[data-object-id="${objectId}"]`)
    : document.querySelector(`[data-object-id="${objectId}"]`);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const offsetX_PX = startX - rect.left;
  const offsetY_PX = startY - rect.top;

  return { offsetX_PX, offsetY_PX, elementRect: rect };
}

/**
 * Calculate pickup offset with fallback to center
 *
 * If the element is not found in the DOM, this function calculates
 * a fallback offset based on the object's center point.
 *
 * @param object - The object being dragged
 * @param startX - The clientX coordinate where the drag started
 * @param startY - The clientY coordinate where the drag started
 * @param pixelsPerVU - Pixels per virtual unit
 * @param options - Optional configuration
 * @returns The offset in screen pixels
 */
export function calculatePickupOffsetWithFallback(
  object: TableObject,
  startX: number,
  startY: number,
  pixelsPerVU: number,
  options?: PickupOffsetOptions
): PickupOffsetResult {
  // First try to get offset from DOM element
  const fromDom = calculatePickupOffset(object.id, startX, startY, options);
  if (fromDom) {
    return fromDom;
  }

  // Fallback: use object center
  const objWidth = object.width ?? 60;
  const objHeight = object.height ?? 60;

  // Calculate center in screen pixels
  const offsetX_PX = (objWidth / 2) * pixelsPerVU;
  const offsetY_PX = (objHeight / 2) * pixelsPerVU;

  return { offsetX_PX, offsetY_PX };
}

/**
 * Convert screen pixel offset to virtual units
 *
 * @param offsetX_PX - Offset in screen pixels
 * @param offsetY_PX - Offset in screen pixels
 * @param pixelsPerVU - Pixels per virtual unit
 * @returns Offset in virtual units
 */
export function pixelsToVU(
  offsetX_PX: number,
  offsetY_PX: number,
  pixelsPerVU: number
): { offsetX_VU: number; offsetY_VU: number } {
  return {
    offsetX_VU: offsetX_PX / pixelsPerVU,
    offsetY_VU: offsetY_PX / pixelsPerVU
  };
}

/**
 * Apply click offset to drop position
 *
 * Calculates the final position where an object should be dropped,
 * taking into account the click offset. The result is in VU.
 *
 * @param baseX - Base X position in VU (where cursor is in VU coordinates)
 * @param baseY - Base Y position in VU (where cursor is in VU coordinates)
 * @param offsetX_PX - Click offset in screen pixels
 * @param offsetY_PX - Click offset in screen pixels
 * @param pixelsPerVU - Pixels per virtual unit
 * @returns Final position in VU
 */
export function applyClickOffset(
  baseX: number,
  baseY: number,
  offsetX_PX: number,
  offsetY_PX: number,
  pixelsPerVU: number
): { x: number; y: number } {
  const { offsetX_VU, offsetY_VU } = pixelsToVU(offsetX_PX, offsetY_PX, pixelsPerVU);
  return {
    x: baseX - offsetX_VU,
    y: baseY - offsetY_VU
  };
}

/**
 * Check if cursor is over a specific element
 *
 * @param x - Client X coordinate
 * @param y - Client Y coordinate
 * @param element - The element to check
 * @returns True if cursor is over the element
 */
export function isCursorOverElement(x: number, y: number, element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Find the nearest pool panel at the given cursor position
 *
 * @param x - Client X coordinate
 * @param y - Client Y coordinate
 * @returns The pool panel ID if found, null otherwise
 */
export function findPoolPanelAtCursor(x: number, y: number): string | null {
  const elements = document.elementsFromPoint(x, y);

  for (const element of elements) {
    const poolPanel = element.closest('[data-pool-panel]');
    if (poolPanel) {
      return poolPanel.getAttribute('data-pool-panel');
    }
  }

  return null;
}

/**
 * Find the deck/pile at the given cursor position
 *
 * @param x - Client X coordinate
 * @param y - Client Y coordinate
 * @returns Object with deckId and optional pileId, or null
 */
export function findDeckAtCursor(x: number, y: number): { deckId: string; pileId?: string } | null {
  const elements = document.elementsFromPoint(x, y);

  // Check for pile first (more specific target)
  for (const element of elements) {
    const pileElement = element.closest('[data-pile-id]');
    if (pileElement) {
      const pileId = pileElement.getAttribute('data-pile-id');
      const deckElement = pileElement.closest('[data-object-id]');
      const deckId = deckElement?.getAttribute('data-object-id');
      if (pileId && deckId) {
        return { deckId, pileId };
      }
    }
  }

  // Check for deck
  for (const element of elements) {
    const deckElement = element.closest('[data-object-id]');
    if (deckElement) {
      const objectId = deckElement.getAttribute('data-object-id');
      if (objectId) {
        return { deckId: objectId };
      }
    }
  }

  return null;
}

/**
 * Extended cursor slot object with drag properties
 */
export type CursorSlotObject = TableObject & {
  inCursorSlot?: boolean;
  originalZIndex?: number;
  cursorSlotSourcePanel?: string;
  sourceZoom?: number;
  clickOffsetX?: number;
  clickOffsetY?: number;
  clickOffsetX_PX?: number;
  clickOffsetY_PX?: number;
  originalX?: number;
  originalY?: number;
};

/**
 * Drop target information
 */
export interface DropTarget {
  type: 'pool' | 'deck' | 'pile' | 'tabletop' | 'hand';
  panelId?: string;
  deckId?: string;
  pileId?: string;
  // Additional target-specific data
  containerRect?: DOMRect;
  scrollLeft?: number;
  scrollTop?: number;
}

/**
 * Analyze drop target at cursor position
 *
 * Determines what type of drop target is at the given cursor position.
 *
 * @param x - Client X coordinate
 * @param y - Client Y coordinate
 * @param currentPoolPanelId - The current pool panel ID (to check if dropping in same panel)
 * @returns Drop target information
 */
export function analyzeDropTarget(
  x: number,
  y: number,
  currentPoolPanelId?: string
): DropTarget {
  // Check for deck/pile first
  const deckInfo = findDeckAtCursor(x, y);
  if (deckInfo) {
    return {
      type: deckInfo.pileId ? 'pile' : 'deck',
      deckId: deckInfo.deckId,
      pileId: deckInfo.pileId
    };
  }

  // Check for pool panel
  const poolPanelId = findPoolPanelAtCursor(x, y);
  if (poolPanelId) {
    return {
      type: 'pool',
      panelId: poolPanelId
    };
  }

  // Check for hand panel
  for (const element of document.elementsFromPoint(x, y)) {
    if (element.closest('[data-hand-panel]')) {
      return { type: 'hand' };
    }
  }

  // Default to tabletop
  return { type: 'tabletop' };
}

/**
 * Calculate stacking offset for multiple objects in cursor slot
 *
 * @param sortedIndex - The object's index in sorted array (0 = front/top)
 * @param objWidth - Object width in VU
 * @param objHeight - Object height in VU
 * @returns Stack offset in VU
 */
export function calculateStackOffset(
  sortedIndex: number,
  objWidth: number,
  objHeight: number
): { offsetX: number; offsetY: number } {
  const offsetFromFront = sortedIndex;
  const offsetAmount = Math.min(objWidth, objHeight) * 0.05; // 5% stacking
  return {
    offsetX: offsetFromFront * offsetAmount,
    offsetY: offsetFromFront * offsetAmount
  };
}

/**
 * Sort objects by zIndex in descending order
 *
 * Higher zIndex objects come first (will be on top/visually in front).
 *
 * @param objects - Objects to sort
 * @returns Sorted array
 */
export function sortObjectsByZIndex(objects: TableObject[]): TableObject[] {
  return [...objects].sort((a, b) => {
    const zA = (a as CursorSlotObject).originalZIndex ?? a.zIndex ?? 0;
    const zB = (b as CursorSlotObject).originalZIndex ?? b.zIndex ?? 0;
    return zB - zA; // Descending
  });
}
