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
 */
function notifyChange() {
  cursorSlotVersion++;
  changeCallbacks.forEach(cb => cb());
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
  (window as any).__cursorSlotTracker = {
    addToCursorSlot,
    removeFromCursorSlot,
    isInCursorSlot,
    getCursorSlotObjects,
    getCursorSlotStats,
    clearCursorSlot,
  };
}
