import type { CSSProperties } from 'react';
/**
 * Cursor Slot Tracker
 *
 * Global tracker for objects currently in cursor slot (being dragged).
 * This is separate from Redux state to avoid race conditions with SYNC_STATE.
 *
 * Problem: When dragging starts, dispatch(UPDATE_OBJECT) sets inCursorSlot=true,
 * but Redux batching means state.objects may not be updated yet when SYNC_STATE
 * arrives from host. This causes the dragged object to lose its cursor slot state.
 *
 * Solution: Use a global Set that's updated immediately when dragging starts/ends.
 * GameContext checks this Set to preserve cursor slot state during SYNC_STATE.
 */

// Global Set of object IDs currently in cursor slot
const cursorSlotObjects = new Set<string>();

// Track original positions for cursor slot objects (for restoration)
const cursorSlotOriginalPositions = new Map<string, { x: number; y: number }>();

// Version counter for change detection
let cursorSlotVersion = 0;

// Callbacks for change notification
const changeCallbacks = new Set<() => void>();

/**
 * Subscribe to cursor slot changes
 * Returns unsubscribe function
 */
export function subscribeToCursorSlotChanges(callback: () => void): () => void {
  changeCallbacks.add(callback);
  return () => changeCallbacks.delete(callback);
}

/**
 * Notify all subscribers of changes
 *
 * 🔧 FIX: callbacks are deferred to a macrotask. notifyChange can run inside
 * the game reducer (i.e. during GameProvider's render phase) — e.g. when a
 * SYNC_STATE merge releases cursor-slot items via removeFromCursorSlot. The
 * subscriber (useObjectFilters) calls setState, and doing that synchronously
 * during another component's render triggered React's
 * "Cannot update a component while rendering a different component" warning.
 * The version counter still increments synchronously.
 */
function notifyChange() {
  cursorSlotVersion++;
  setTimeout(() => {
    changeCallbacks.forEach(cb => cb());
  }, 0);
}

/**
 * Get current version (for React dependencies)
 */
export function getCursorSlotVersion(): number {
  return cursorSlotVersion;
}

/**
 * Add an object to cursor slot (called immediately when drag starts)
 */
export function addToCursorSlot(objectId: string, originalX: number, originalY: number): void {
  cursorSlotObjects.add(objectId);
  cursorSlotOriginalPositions.set(objectId, { x: originalX, y: originalY });
  notifyChange();
}

/**
 * Remove an object from cursor slot (called when drag ends)
 */
export function removeFromCursorSlot(objectId: string): void {
  const wasRemoved = cursorSlotObjects.delete(objectId);
  cursorSlotOriginalPositions.delete(objectId);
  if (wasRemoved) {
    notifyChange();
  }
}

/**
 * Check if an object is currently in cursor slot
 */
export function isInCursorSlot(objectId: string): boolean {
  return cursorSlotObjects.has(objectId);
}

/**
 * Get all objects currently in cursor slot
 */
export function getCursorSlotObjects(): Set<string> {
  return new Set(cursorSlotObjects);
}

/**
 * Get original position for a cursor slot object
 */
export function getOriginalPosition(objectId: string): { x: number; y: number } | undefined {
  return cursorSlotOriginalPositions.get(objectId);
}

/**
 * Clear all cursor slot objects (emergency cleanup)
 */
export function clearCursorSlot(): void {
  cursorSlotObjects.clear();
  cursorSlotOriginalPositions.clear();
  notifyChange();
}

/**
 * Get statistics (for debugging)
 */
export function getCursorSlotStats() {
  return {
    count: cursorSlotObjects.size,
    objects: Array.from(cursorSlotObjects),
  };
}

// Make available globally for debugging
if (typeof window !== 'undefined') {
  (window as any)._cursorSlotTracker = {
    addToCursorSlot,
    removeFromCursorSlot,
    isInCursorSlot,
    getCursorSlotObjects,
    getCursorSlotStats,
    clearCursorSlot,
  };
}

/**
 * 🔧 Visual state for objects held in ANOTHER player's cursor slot:
 * the object stays at its origin but is locked (10% darker, 10% more
 * transparent, non-interactive) until the holder drops it.
 */
export function getLockedInSlotStyle(obj: { id: string; inCursorSlot?: boolean }): CSSProperties | undefined {
  if (obj.inCursorSlot === true && !isInCursorSlot(obj.id)) {
    return {
      filter: 'brightness(0.9)',
      opacity: 0.9,
      pointerEvents: 'none',
      cursor: 'default',
    };
  }
  return undefined;
}

