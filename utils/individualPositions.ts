/**
 * Individual Objects Utilities
 * Handles object positions and visibility on hyperscale layers with individualObjects enabled
 */

import { TableObject, HyperscaleLayer, ItemType, PanelType } from '../types';
import { PlayerObjectPositions } from '../store/gameState';

/**
 * 🔧 Panels/windows on individual objects layers sync their CREATION position:
 * guests must see a new panel where the host created it. Their subsequent
 * MOVEMENT stays per-player (position changes are excluded from sync in the
 * GameContext change tracker and rendering uses playerObjectPositions).
 *
 * Objects on layers with relativePositioning enabled ALSO keep their position:
 * the first-connect aspect-ratio scaling needs the host's x to scale from —
 * without it a new guest would materialize the object at (0,0).
 */
export function individualObjectKeepsPosition(
  obj: TableObject,
  hyperscaleLayers?: HyperscaleLayer[]
): boolean {
  if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) return true;
  if (!hyperscaleLayers || !obj.hyperscaleLayerId) return false;
  const layer = hyperscaleLayers.find(l => l.id === obj.hyperscaleLayerId);
  return layer?.relativePositioning === true;
}

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
      // 🔧 Panels/windows keep x/y/rotation/zIndex — their creation position
      // must sync to guests (movement is per-player and is excluded from sync).
      // Objects on relativePositioning layers keep them too (aspect scaling
      // needs the host's x; without it guests render at (0,0)).
      if (!individualObjectKeepsPosition(obj, hyperscaleLayers)) {
        delete filteredObj.x;
        delete filteredObj.y;
        delete filteredObj.rotation;
        delete filteredObj.zIndex;
      }

      // 🔧 Panels/windows: hidden/visible SYNC from the host (host shows/hides
      // → everyone sees it). Minimized/expanded state and size stay per-player.

      // Lock/unlock state is individual per player
      delete filteredObj.locked;

      // Pin/unpin state is individual per player
      delete filteredObj.isPinnedToViewport;
      delete filteredObj.pinnedScreenPosition;
      delete filteredObj.expandedPinnedPosition;
      delete filteredObj.collapsedPinnedPosition;

      // Visibility properties are individual per player —
      // 🔧 EXCEPT panels/windows: host show/hide syncs to everyone
      if (!individualObjectKeepsPosition(obj)) {
        delete filteredObj.hidden;
        delete filteredObj.visible;
      }
      delete filteredObj.visibleToOthers;

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

/**
 * Is this object the main menu panel? The main menu is "virtually individual":
 * one shared object per session whose position is per-player and never synced.
 */
export function isMainMenuPanelObj(obj: any): boolean {
  return !!obj && obj.type === ItemType.PANEL && (obj as any).panelType === PanelType.MAIN_MENU;
}

/**
 * Left edge (screen-space x) of the main menu panel among the given objects.
 * Pinned panels render from pinnedScreenPosition (falls back to x).
 * Returns null when no main menu object exists.
 */
export function getMainMenuLeftEdge(objects: Record<string, TableObject>): number | null {
  for (const obj of Object.values(objects)) {
    if (isMainMenuPanelObj(obj)) {
      const menu = obj as any;
      const left = menu.pinnedScreenPosition?.x ?? menu.x;
      return typeof left === 'number' && isFinite(left) ? left : null;
    }
  }
  return null;
}

/**
 * 🔧 Relative positioning (layer setting `relativePositioning`, requires
 * individualObjects): when a player first connects, horizontal positions of
 * this layer's objects are scaled by the ratio of VISIBLE WORLD WIDTH (in VU):
 *
 *   ratio = visibleVUWidth_guest / visibleVUWidth_host
 *         = (guestWidth / guestHeight) / (hostWidth / hostHeight)
 *
 * The world scale is height-locked (pixelsPerVU = innerHeight/1000), so two
 * screens of the same aspect have the SAME visible VU width regardless of
 * resolution (FHD vs 4K → ratio 1) — only differing aspects need the scaling.
 * After it, an object keeps the same FRACTION of the visible world width as on
 * the host. Applied uniformly to world objects (x in VU) and panels
 * (x / pinnedScreenPosition in screen px).
 *
 * Applied ONLY at first-connect seeding (new objects in SYNC_STATE); afterwards
 * per-player positions diverge freely via the normal individualObjects flow.
 *
 * Fail-open: ratio missing/not finite/==1 → no change; x not finite → no
 * change; the main menu never scales (its position is per-player and the
 * incoming menu is dropped anyway).
 */
export function applyRelativePositioning(
  obj: TableObject,
  hyperscaleLayers: HyperscaleLayer[],
  ratio: number
): TableObject {
  if (typeof ratio !== 'number' || !isFinite(ratio) || ratio === 1) return obj;
  if (isMainMenuPanelObj(obj)) return obj;

  const layer = obj.hyperscaleLayerId
    ? hyperscaleLayers.find(l => l.id === obj.hyperscaleLayerId)
    : undefined;
  if (layer?.relativePositioning !== true) return obj;

  const x = (obj as any).x;
  if (typeof x !== 'number' || !isFinite(x)) return obj;

  const scaled: any = { ...obj, x: x * ratio };
  if (scaled.pinnedScreenPosition && typeof scaled.pinnedScreenPosition.x === 'number') {
    scaled.pinnedScreenPosition = {
      ...scaled.pinnedScreenPosition,
      x: scaled.pinnedScreenPosition.x * ratio,
    };
  }
  return scaled as TableObject;
}

/**
 * Aspect ratio for the relative-positioning scaling from the two viewports
 * (guest computing from its own window + the host's sent viewport).
 * Returns 1 (no-op) when the host viewport is missing or invalid.
 */
export function getRelativePositioningRatio(
  localWidth: number,
  localHeight: number,
  hostViewport: { width?: number; height?: number } | null | undefined
): number {
  const hw = hostViewport?.width;
  const hh = hostViewport?.height;
  if (
    typeof hw !== 'number' || !isFinite(hw) || hw <= 0 ||
    typeof hh !== 'number' || !isFinite(hh) || hh <= 0 ||
    !localWidth || !localHeight || !isFinite(localWidth) || !isFinite(localHeight)
  ) {
    return 1;
  }
  const ratio = (localWidth / localHeight) / (hw / hh);
  return isFinite(ratio) && ratio > 0 ? ratio : 1;
}
