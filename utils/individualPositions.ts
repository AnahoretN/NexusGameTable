/**
 * Individual Position Utilities
 * Handles object positions on hyperscale layers with individualPosition enabled
 */

import { TableObject, HyperscaleLayer } from '../types';
import { PlayerObjectPositions } from '../store/gameState';

/**
 * Check if an object is on a hyperscale layer with individualPosition enabled
 */
export function isObjectOnIndividualPositionLayer(
  object: TableObject,
  hyperscaleLayers: HyperscaleLayer[]
): boolean {
  if (!object.hyperscaleLayerId) return false;

  const layer = hyperscaleLayers.find(l => l.id === object.hyperscaleLayerId);
  return layer?.individualPosition === true;
}

/**
 * Check if an object is on a hyperscale layer with individualObjects enabled
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
 * Filter object updates to remove position properties for objects on individual position layers
 * This is used when broadcasting state from host to guests
 */
export function filterPositionUpdatesForIndividualLayers(
  updates: Partial<TableObject> & { id: string },
  hyperscaleLayers: HyperscaleLayer[],
  objects: Record<string, TableObject>
): Partial<TableObject> & { id: string} {
  const obj = objects[updates.id];
  if (!obj) return updates;

  // Check if object is on individual position layer
  if (!isObjectOnIndividualPositionLayer(obj, hyperscaleLayers)) {
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
 * Filter objects for broadcast to remove positions from individual position layers
 * This is used when broadcasting full state from host to guests
 */
export function filterObjectsForBroadcast(
  objects: Record<string, TableObject>,
  hyperscaleLayers: HyperscaleLayer[]
): Record<string, TableObject> {
  const filteredObjects: Record<string, TableObject> = {};

  Object.entries(objects).forEach(([id, obj]) => {
    // Skip individual objects entirely
    if (isObjectIndividual(obj, hyperscaleLayers)) {
      return;
    }

    // For objects on individual position layers, keep the object but with host's position
    // (guests will use their own individual positions)
    filteredObjects[id] = obj;
  });

  return filteredObjects;
}
