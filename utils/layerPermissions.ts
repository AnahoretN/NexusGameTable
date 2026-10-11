/**
 * Layer permission helpers - single source of truth for hyperscale-layer gating
 *
 * Used by LayersPanel, ContextMenu, tabletop event handlers and renderers so
 * that "can the current user interact with objects on this layer" is decided
 * identically everywhere.
 */

import { HyperscaleLayer } from '../types';

/** Default layer for objects without an explicit hyperscaleLayerId (matches GameContext auto-assign). */
export const DEFAULT_OBJECT_LAYER_ID = 'tokens';

/** Layer id an object belongs to ('tokens' when unset). */
export const getObjectLayerId = (obj: { hyperscaleLayerId?: string } | null | undefined): string =>
  obj?.hyperscaleLayerId || DEFAULT_OBJECT_LAYER_ID;

/**
 * Layer ids the user may keep selected:
 * GM selects everything, players only layers with playerCanSelect.
 */
export const getSelectableLayerIds = (layers: HyperscaleLayer[], isGM: boolean): string[] => {
  if (isGM) return layers.map(l => l.id);
  return layers.filter(l => l.playerCanSelect).map(l => l.id);
};

/** Filter a selection down to layers selectable by this user (players drop playerCanSelect=false layers). */
export const sanitizeLayerSelection = (
  selectedIds: string[],
  layers: HyperscaleLayer[],
  isGM: boolean
): string[] => {
  const selectable = getSelectableLayerIds(layers, isGM);
  return selectedIds.filter(id => selectable.includes(id));
};

/**
 * Is the object's layer selected in the user's layer panel?
 * Unknown/stale layer ids are treated as selected (fail-open, matching zoom behaviour).
 */
export const isObjectLayerSelected = (
  obj: { hyperscaleLayerId?: string } | null | undefined,
  selectedLayerIds: string[],
  layers: HyperscaleLayer[]
): boolean => {
  const layerId = getObjectLayerId(obj);
  if (!layers.some(l => l.id === layerId)) return true;
  return selectedLayerIds.includes(layerId);
};

/** Can a non-GM open the context menu on objects of this layer? GM always can. Unknown layers fail open. */
export const canUseContextMenuOnLayer = (
  obj: { hyperscaleLayerId?: string } | null | undefined,
  layers: HyperscaleLayer[],
  isGM: boolean
): boolean => {
  if (isGM) return true;
  const layerId = getObjectLayerId(obj);
  const layer = layers.find(l => l.id === layerId);
  if (!layer) return true;
  return layer.playerCanUseContextMenu !== false;
};

/**
 * Layers a player may move objects to via the "Change Layer" context submenu
 * (previously filtered by the old playerCanView flag; now playerCanSelect).
 */
export const canMoveObjectToLayer = (layer: HyperscaleLayer, isGM: boolean): boolean =>
  isGM || layer.playerCanSelect === true;
