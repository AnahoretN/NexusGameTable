/**
 * Individual Objects Utilities
 * Handles object positions and visibility on hyperscale layers with individualObjects enabled
 */

import { TableObject, HyperscaleLayer } from '../types';
import { PlayerObjectPositions } from '../store/gameState';

/**
 * Check if an object is on a hyperscale layer with individualObjects enabled
 * When enabled, objects are completely individual per player:
 * - Position (x, y, rotation, zIndex) is individual
 * - Visibility (hidden, visible, visibleToOthers) is individual
 * - Locked and pinned states are individual
 */
export function isObjectIndividual(
  object: TableObject,
  hyperscaleLayers: HyperscaleLayer[]
): boolean {
  if (!object.hyperscaleLayerId) return false;

  const layer = hyperscaleLayers.find(l => l.id === object.hyperscaleLayerId);
  return layer?.individualObjects === true;
}

/**
 * Get individual position for an object for a specific player
 * Returns null if no individual position exists
 */
export function getIndividualPosition(
  objectId: string,
  playerId: string,
  playerObjectPositions: PlayerObjectPositions
): { x: number; y: number; rotation?: number; zIndex?: number } | null {
  return playerObjectPositions[playerId]?.[objectId] || null;
}

/**
 * Filter object updates to remove position properties for objects on individual objects layers
 * This is used when broadcasting state from host to guests
 */
export function filterPositionUpdatesForIndividualLayers(
  updates: Partial<TableObject> & { id: string },
  hyperscaleLayers: HyperscaleLayer[],
  objects: Record<string, TableObject>
): Partial<TableObject> & { id: string} {
  const obj = objects[updates.id];
  if (!obj) return updates;

  // Check if object is on individual objects layer
  if (!isObjectIndividual(obj, hyperscaleLayers)) {
    return updates;
  }

  // Filter out position-related properties
  const filteredUpdates: Partial<TableObject> & { id: string } = { id: updates.id };
  Object.entries(updates).forEach(([key, value]) => {
    if (
      key !== 'id' &&
      key !== 'x' &&
      key !== 'y' &&
      key !== 'rotation' &&
      key !== 'zIndex'
    ) {
      (filteredUpdates as any)[key] = value;
    }
  });

  return filteredUpdates;
}

/**
 * Filter objects for broadcast to remove positions and visibility from individual objects layers
 * This is used when broadcasting full state from host to guests
 *
 * IMPORTANT: Individual Objects blocks position, locked, pinned, and visibility sync
 *            All other properties (character data, counters, etc.) MUST sync
 */
export function filterObjectsForBroadcast(
  objects: Record<string, TableObject>,
  hyperscaleLayers: HyperscaleLayer[]
): Record<string, TableObject> {
  const filteredObjects: Record<string, TableObject> = {};

  Object.entries(objects).forEach(([id, obj]) => {
    const isIndividual = isObjectIndividual(obj, hyperscaleLayers);

    if (isIndividual) {
      // Clone the object to avoid mutating the original
      const filteredObj: any = { ...obj };

      // Remove position-related properties
      delete filteredObj.x;
      delete filteredObj.y;
      delete filteredObj.rotation;
      delete filteredObj.zIndex;

      // Lock/unlock state is individual per player
      delete filteredObj.locked;

      // Pin/unpin state is individual per player
      delete filteredObj.isPinnedToViewport;
      delete filteredObj.pinnedScreenPosition;
      delete filteredObj.expandedPinnedPosition;
      delete filteredObj.collapsedPinnedPosition;

      // Visibility properties are individual per player
      delete filteredObj.hidden;
      delete filteredObj.visible;
      delete filteredObj.visibleToOthers;

      // Note: width/height are kept because they affect rendering, not position

      filteredObjects[id] = filteredObj;
    } else {
      // No filtering needed, keep the object as is
      filteredObjects[id] = obj;
    }
  });

  return filteredObjects;
}

/**
 * Filter visibility updates (hidden/visible) for objects on individual objects layers
 * This is used when broadcasting updates from host to guests
 */
export function filterVisibilityUpdatesForIndividualLayers(
  updates: Partial<TableObject> & { id: string },
  hyperscaleLayers: HyperscaleLayer[],
  objects: Record<string, TableObject>
): Partial<TableObject> & { id: string } {
  const obj = objects[updates.id];
  if (!obj) return updates;

  // Check if object is on individual objects layer
  if (!isObjectIndividual(obj, hyperscaleLayers)) {
    return updates;
  }

  // Filter out visibility-related properties
  const filteredUpdates: Partial<TableObject> & { id: string } = { id: updates.id };
  Object.entries(updates).forEach(([key, value]) => {
    if (
      key !== 'id' &&
      key !== 'hidden' &&
      key !== 'visible' &&
      key !== 'visibleToOthers'
    ) {
      (filteredUpdates as any)[key] = value;
    }
  });

  return filteredUpdates;
}
