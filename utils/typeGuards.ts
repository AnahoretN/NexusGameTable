import { TableObject, PanelObject, WindowObject, Deck, PanelType, ItemType } from '../types';

/**
 * Type guards for pinned objects
 */

export interface PinnedObject {
  isPinnedToViewport: true;
  pinnedScreenPosition: { x: number; y: number };
  expandedPinnedPosition?: { x: number; y: number };
  collapsedPinnedPosition?: { x: number; y: number };
}

export interface PinnedUIObject extends PinnedObject {
  dualPosition?: boolean;
  minimized?: boolean;
}

/**
 * Check if an object is pinned to viewport
 */
export function isPinnedToObject(obj: TableObject): obj is TableObject & PinnedObject {
  return (obj as any).isPinnedToViewport === true;
}

/**
 * Check if a UI object (panel/window) has dual position mode enabled
 */
export function hasDualPosition(obj: PanelObject | WindowObject): boolean {
  return (obj as any).dualPosition === true;
}

/**
 * Check if an object is a main menu panel
 */
export function isMainMenuPanel(obj: TableObject): obj is PanelObject {
  return obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.MAIN_MENU;
}

/**
 * Check if a panel is a hand panel
 */
export function isHandPanel(obj: TableObject): obj is PanelObject {
  return obj.type === ItemType.PANEL && (obj as PanelObject).panelType === PanelType.HAND;
}

/**
 * Get pinned position for an object (expanded or collapsed based on minimized state)
 */
export function getPinnedPosition(obj: PanelObject | WindowObject): { x: number; y: number } | null {
  if (!isPinnedToObject(obj)) return null;

  const hasDual = hasDualPosition(obj);
  const isMinimized = obj.minimized || false;

  if (hasDual && isMinimized) {
    return obj.collapsedPinnedPosition || obj.expandedPinnedPosition || obj.pinnedScreenPosition || null;
  }
  if (hasDual && !isMinimized) {
    return obj.expandedPinnedPosition || obj.collapsedPinnedPosition || obj.pinnedScreenPosition || null;
  }

  return obj.pinnedScreenPosition || null;
}

/**
 * Check if an object is a deck with baseCardIds
 */
export function hasBaseCardIds(obj: TableObject): obj is Deck & { baseCardIds: string[] } {
  return obj.type === ItemType.DECK && typeof (obj as Deck).baseCardIds !== 'undefined';
}

/**
 * Get all pinned objects from an object record
 */
export function getPinnedObjects(objects: Record<string, TableObject>): TableObject[] {
  return Object.values(objects).filter(isPinnedToObject);
}

/**
 * Get pinned UI objects (panels and windows)
 */
export function getPinnedUIObjects(objects: Record<string, TableObject>): (PanelObject | WindowObject)[] {
  return Object.values(objects).filter(
    (obj): obj is PanelObject | WindowObject =>
      (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) && isPinnedToObject(obj)
  );
}

/**
 * Get pinned deck objects
 */
export function getPinnedDecks(objects: Record<string, TableObject>): Deck[] {
  return Object.values(objects).filter(
    (obj): obj is Deck =>
      obj.type === ItemType.DECK && obj.isOnTable && isPinnedToObject(obj)
  );
}

/**
 * Safe access to pinnedScreenPosition
 */
export function getPinnedScreenPosition(obj: TableObject): { x: number; y: number } | undefined {
  if (isPinnedToObject(obj)) {
    return obj.pinnedScreenPosition;
  }
  return undefined;
}

/**
 * Safe access to expandedPinnedPosition
 */
export function getExpandedPinnedPosition(obj: TableObject): { x: number; y: number } | undefined {
  if (isPinnedToObject(obj)) {
    return obj.expandedPinnedPosition;
  }
  return undefined;
}

/**
 * Safe access to collapsedPinnedPosition
 */
export function getCollapsedPinnedPosition(obj: TableObject): { x: number; y: number } | undefined {
  if (isPinnedToObject(obj)) {
    return obj.collapsedPinnedPosition;
  }
  return undefined;
}
