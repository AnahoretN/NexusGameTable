import { TableObject, HyperscaleLayer } from '../types';

/**
 * Result of finding an available z-index
 */
export interface ZIndexAllocationResult {
  allocatedZIndex: number;
  needsDefragmentation: boolean;
  defragmentedObjects?: Array<{ id: string; oldZIndex: number; newZIndex: number }>;
}

/**
 * Find the minimum available z-index in a hyperscale layer that is above all existing objects.
 * If no space is available (reached maxZIndex), returns needsDefragmentation: true.
 *
 * @param objects - All objects in the game
 * @param hyperscaleLayerId - The layer to allocate z-index for
 * @param hyperscaleLayers - All hyperscale layers to get min/max z-index bounds
 * @returns ZIndexAllocationResult with the allocated z-index or defragmentation flag
 */
export function allocateZIndexInHyperslice(
  objects: Record<string, TableObject>,
  hyperscaleLayerId: string | undefined,
  hyperscaleLayers: HyperscaleLayer[]
): ZIndexAllocationResult {
  // Find the hyperscale layer
  const layerId = hyperscaleLayerId || 'default';
  const layer = hyperscaleLayers.find(l => l.id === layerId);

  // If layer not found, use default bounds
  const minZ = layer?.minZIndex ?? 0;
  const maxZ = layer?.maxZIndex ?? 10000;

  // Get all objects in this layer that are on the table
  const layerObjects = Object.values(objects).filter(
    obj => (obj.hyperscaleLayerId || 'default') === layerId &&
           obj.isOnTable !== false &&
           (obj as any).inCursorSlot !== true
  );

  // If no objects in layer, start at minZ
  if (layerObjects.length === 0) {
    return { allocatedZIndex: minZ, needsDefragmentation: false };
  }

  // Collect all used z-indices in this layer
  const usedZIndices = layerObjects
    .map(obj => obj.zIndex ?? 0)
    .filter(z => z >= minZ && z <= maxZ)
    .sort((a, b) => a - b);

  if (usedZIndices.length === 0) {
    return { allocatedZIndex: minZ, needsDefragmentation: false };
  }

  // Find the maximum used z-index
  const maxUsedZ = usedZIndices[usedZIndices.length - 1];

  // If we have space above the max used z-index, allocate there
  if (maxUsedZ < maxZ) {
    return { allocatedZIndex: maxUsedZ + 1, needsDefragmentation: false };
  }

  // No space available - need defragmentation
  return { allocatedZIndex: -1, needsDefragmentation: true };
}

/**
 * Defragment z-indices in a hyperscale layer by compacting all objects
 * to the start of the layer's range, freeing up space at the top.
 *
 * @param objects - All objects in the game
 * @param hyperscaleLayerId - The layer to defragment
 * @param hyperscaleLayers - All hyperscale layers to get min/max z-index bounds
 * @returns Object with defragmented objects mapping
 */
export function defragmentHyperslice(
  objects: Record<string, TableObject>,
  hyperscaleLayerId: string | undefined,
  hyperscaleLayers: HyperscaleLayer[]
): Record<string, number> {
  // Find the hyperscale layer
  const layerId = hyperscaleLayerId || 'default';
  const layer = hyperscaleLayers.find(l => l.id === layerId);

  const minZ = layer?.minZIndex ?? 0;

  // Get all objects in this layer that are on the table
  const layerObjects = Object.values(objects).filter(
    obj => (obj.hyperscaleLayerId || 'default') === layerId &&
           obj.isOnTable !== false &&
           (obj as any).inCursorSlot !== true
  );

  // Sort by current z-index to preserve relative order
  const sortedObjects = layerObjects.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  // Reassign z-indices starting from minZ, compacting them
  const newZIndices: Record<string, number> = {};

  sortedObjects.forEach((obj, index) => {
    newZIndices[obj.id] = minZ + index;
  });

  return newZIndices;
}

/**
 * Allocate z-index with automatic defragmentation if needed.
 * This is a convenience function that combines allocation and defragmentation.
 *
 * @param objects - All objects in the game
 * @param hyperscaleLayerId - The layer to allocate z-index for
 * @param hyperscaleLayers - All hyperscale layers
 * @returns Object with allocated z-index and objects to update (if defragmented)
 */
export function allocateZIndexWithDefrag(
  objects: Record<string, TableObject>,
  hyperscaleLayerId: string | undefined,
  hyperscaleLayers: HyperscaleLayer[]
): { allocatedZIndex: number; objectsToUpdate?: Record<string, number> } {
  const allocationResult = allocateZIndexInHyperslice(
    objects,
    hyperscaleLayerId,
    hyperscaleLayers
  );

  if (!allocationResult.needsDefragmentation) {
    return { allocatedZIndex: allocationResult.allocatedZIndex };
  }

  // Defragment needed
  const newZIndices = defragmentHyperslice(
    objects,
    hyperscaleLayerId,
    hyperscaleLayers
  );

  // Get the layer to find minZ
  const layerId = hyperscaleLayerId || 'default';
  const layer = hyperscaleLayers.find(l => l.id === layerId);
  const minZ = layer?.minZIndex ?? 0;

  // After defragmentation, allocate at the next available position
  const allocatedZIndex = minZ + Object.keys(newZIndices).length;

  return {
    allocatedZIndex,
    objectsToUpdate: newZIndices
  };
}

/**
 * Calculate the minimum available z-index for multiple items being dropped together.
 * Preserves the relative order of items while placing them above existing objects.
 *
 * @param objects - All objects in the game
 * @param hyperscaleLayerId - The layer to allocate z-index for
 * @param hyperscaleLayers - All hyperscale layers
 * @param itemCount - Number of items being dropped
 * @returns Starting z-index for the first item (subsequent items use +1, +2, etc.)
 */
export function allocateZIndexRange(
  objects: Record<string, TableObject>,
  hyperscaleLayerId: string | undefined,
  hyperscaleLayers: HyperscaleLayer[],
  itemCount: number
): { startZIndex: number; needsDefragmentation: boolean } {
  // Find the hyperscale layer
  const layerId = hyperscaleLayerId || 'default';
  const layer = hyperscaleLayers.find(l => l.id === layerId);

  const minZ = layer?.minZIndex ?? 0;
  const maxZ = layer?.maxZIndex ?? 10000;

  // Get all objects in this layer
  const layerObjects = Object.values(objects).filter(
    obj => (obj.hyperscaleLayerId || 'default') === layerId &&
           obj.isOnTable !== false &&
           (obj as any).inCursorSlot !== true
  );

  if (layerObjects.length === 0) {
    return { startZIndex: minZ, needsDefragmentation: false };
  }

  // Collect and sort used z-indices
  const usedZIndices = layerObjects
    .map(obj => obj.zIndex ?? 0)
    .filter(z => z >= minZ && z <= maxZ)
    .sort((a, b) => a - b);

  const maxUsedZ = usedZIndices[usedZIndices.length - 1];

  // Check if we have space for all items
  if (maxUsedZ + itemCount <= maxZ) {
    return { startZIndex: maxUsedZ + 1, needsDefragmentation: false };
  }

  // Need defragmentation
  return { startZIndex: -1, needsDefragmentation: true };
}
