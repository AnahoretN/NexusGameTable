import { TableObject, ItemType, CardLocation } from '../types';
import { STACKING_OFFSET_FACTOR, DEFAULT_POOL_WIDTH, DEFAULT_POOL_HEIGHT } from '../constants/pool';

/**
 * Pool placement utilities for consistent object positioning in pool panels
 */

export interface PoolZone {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  panelId: string;
  tabId: string; // Each tab has its own separate game space
}

/**
 * Extended table object with cursor slot properties
 */
export type CursorSlotObject = TableObject & {
  inCursorSlot?: boolean;
  originalZIndex?: number;
  cursorSlotSourcePanel?: string; // ID of pool panel where drag started
}

export interface DropPosition {
  baseX: number;
  baseY: number;
  relativeX: number;
  relativeY: number;
}

/**
 * Calculate drop position in pool zone from screen coordinates
 */
export function calculatePoolDropPosition(
  clientX: number,
  clientY: number,
  poolZone: PoolZone,
  panelRect: DOMRect,
  pixelsPerVU: number,
  zoom: number = 1
): DropPosition {
  if (!panelRect) {
    throw new Error('Panel rect is required for calculating drop position');
  }

  if (pixelsPerVU <= 0) {
    throw new Error(`Invalid pixelsPerVU value: ${pixelsPerVU}. Must be greater than 0.`);
  }

  // Calculate position relative to the pool panel's visual position
  const relativePixelX = clientX - panelRect.left;
  const relativePixelY = clientY - panelRect.top;

  // Convert to virtual units
  const relativeVUX = relativePixelX / pixelsPerVU;
  const relativeVUY = relativePixelY / pixelsPerVU;

  // Base position in pool zone
  const baseX = poolZone.offsetX + relativeVUX;
  const baseY = poolZone.offsetY + relativeVUY;

  return {
    baseX,
    baseY,
    relativeX: relativeVUX,
    relativeY: relativeVUY
  };
}

/**
 * Calculate scroll-based drop position (for direct pool drops)
 */
export function calculatePoolDropPositionWithScroll(
  clientX: number,
  clientY: number,
  poolZone: PoolZone,
  scrollRect: DOMRect,
  scrollLeft: number,
  scrollTop: number,
  pixelsPerVU: number,
  zoom: number = 1
): DropPosition {
  // Calculate position relative to scroll container
  const relativeX = (clientX - scrollRect.left + scrollLeft) / zoom / pixelsPerVU;
  const relativeY = (clientY - scrollRect.top + scrollTop) / zoom / pixelsPerVU;

  // Convert to pool zone coordinates
  const baseX = poolZone.offsetX + relativeX;
  const baseY = poolZone.offsetY + relativeY;

  return {
    baseX,
    baseY,
    relativeX,
    relativeY
  };
}

/**
 * Sort objects by zIndex in descending order to preserve layer relationships
 */
export function sortObjectsByLayerIndex(objects: TableObject[]): TableObject[] {
  return [...objects].sort((a, b) => {
    const zA = (a as CursorSlotObject).originalZIndex ?? a.zIndex ?? 0;
    const zB = (b as CursorSlotObject).originalZIndex ?? b.zIndex ?? 0;
    return zB - zA; // Descending order - higher Z first
  });
}

/**
 * Calculate offset position for stacked objects to preserve visibility
 */
export interface StackedPosition {
  x: number;
  y: number;
  constrainedX: number;
  constrainedY: number;
}

export function calculateStackedPosition(
  baseX: number,
  baseY: number,
  obj: TableObject,
  sortedIndex: number,
  poolZone: PoolZone
): StackedPosition {
  const objWidth = obj.width || 100;
  const objHeight = obj.height || 100;

  // Calculate offset based on sorted position
  // Highest zIndex (top, sortedIndex=0) gets no offset, lower gets more offset
  const offsetFromFront = sortedIndex;
  const offsetAmount = Math.min(objWidth, objHeight) * STACKING_OFFSET_FACTOR;
  const offsetX = offsetFromFront * offsetAmount;
  const offsetY = offsetFromFront * offsetAmount;

  // Calculate position (cursor is at center of object, so subtract half dimensions)
  const x = baseX - (objWidth / 2) + offsetX;
  const y = baseY - (objHeight / 2) + offsetY;

  // Constrain to pool zone bounds
  const constrainedX = Math.max(poolZone.offsetX, Math.min(x, poolZone.offsetX + poolZone.width - objWidth));
  const constrainedY = Math.max(poolZone.offsetY, Math.min(y, poolZone.offsetY + poolZone.height - objHeight));

  return { x, y, constrainedX, constrainedY };
}

/**
 * Drop objects to pool zone with proper layering and positioning
 */
export function dropObjectsToPool(
  objects: TableObject[],
  dropPosition: DropPosition,
  poolZone: PoolZone,
  dispatch: (action: any) => void,
  poolObjects: Record<string, TableObject>
): void {
  if (!objects || objects.length === 0) {
    return;
  }

  if (!dropPosition || !poolZone) {
    console.error('Invalid drop position or pool zone');
    return;
  }

  if (typeof dispatch !== 'function') {
    console.error('Dispatch must be a function');
    return;
  }

  try {
    // IMPORTANT: Disable board magnetism in pool panels
    // Board magnetism causes issues when objects are dropped in pool panels that contain boards:
    // - Objects get "stuck" to boards even when dropped far away
    // - Decks and other objects may disappear or behave incorrectly
    // Pool panels are for storage/organization, not for gameplay mechanics
    const boardsInPool: BoardType[] = [];

    // Sort by zIndex in DESCENDING order to preserve layer relationships
    const sortedObjects = sortObjectsByLayerIndex(objects);

    // Drop items with offset based on layer position
    sortedObjects.forEach((obj, sortedIndex) => {
      if (!obj || !obj.id) {
        console.warn('[dropObjectsToPool] Invalid object in drop list', obj);
        return;
      }

      // IMPORTANT: Skip objects that are in a deck (location === 'DECK')
      // Cards in deck should not be dropped to pool panel - this prevents duplication
      if (obj.type === ItemType.CARD && (obj as any).location === CardLocation.DECK) {
        console.log('[dropObjectsToPool] Skipping card in deck:', {
          id: obj.id,
          location: (obj as any).location,
          deckId: (obj as any).deckId,
          reason: 'Cards in deck should not be dropped to pool panel'
        });
        return;
      }

      let finalX = dropPosition.baseX;
      let finalY = dropPosition.baseY;

      // IMPORTANT: Clear any existing grid cell attachment when dropping to pool
      // This prevents objects from retaining board attachments from main tabletop
      const existingGridCellKey = (obj as any).gridCellKey;
      if (existingGridCellKey) {
        // Parse the grid cell key (format: "boardId:col,row")
        const [boardId, cellKey] = existingGridCellKey.split(':');
        if (boardId && cellKey) {
          const board = state.objects[boardId] as any;
          if (board && board.gridCellMagnetPoints && board.gridCellMagnetPoints[cellKey]) {
            // Remove object from board's magnet points
            const updatedMagnetPoints = board.gridCellMagnetPoints[cellKey].magnetPoints
              .filter((mp: any) => mp.objectId !== obj.id);

            const updatedGridCellMagnetPoints = {
              ...board.gridCellMagnetPoints,
              [cellKey]: {
                ...board.gridCellMagnetPoints[cellKey],
                magnetPoints: updatedMagnetPoints
              }
            };

            // Update board to remove object from magnet points
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: boardId,
                gridCellMagnetPoints: updatedGridCellMagnetPoints
              }
            });
          }
        }
      }

      const position = calculateStackedPosition(
        finalX,
        finalY,
        obj,
        sortedIndex,
        poolZone
      );

      // Prepare update payload
      const updatePayload: any = {
        id: obj.id,
        x: position.constrainedX,
        y: position.constrainedY,
        inCursorSlot: false,
        gridCellKey: undefined, // Clear grid cell reference when dropping to pool
        isOnTable: true // IMPORTANT: All objects in pool panel must have isOnTable=true for visibility!
      };

      // Debug logging
      console.log('[dropObjectsToPool] Dropping object to pool:', {
        id: obj.id,
        type: obj.type,
        location: (obj as any).location,
        isOnTable: (obj as any).isOnTable,
        x: position.constrainedX,
        y: position.constrainedY,
        poolZone: { offsetX: poolZone.offsetX, offsetY: poolZone.offsetY }
      });

      // For cards, set proper location and isOnTable=true for visibility in pool panel
      // IMPORTANT: Cards in pool panel should NEVER have location=HAND or location=CURSOR_SLOT
      // This prevents cards from briefly appearing in hand panel when being dragged to deck
      if (obj.type === ItemType.CARD) {
        const card = obj as any;

        // IMPORTANT: Don't change location if card is already in a deck (location === 'DECK')
        // This prevents cards from being pulled out of deck when opening search modal
        if (card.location === CardLocation.DECK) {
          console.log('[dropObjectsToPool] Card already in deck, keeping location:', {
            id: card.id,
            location: card.location,
            deckId: card.deckId
          });
          // Keep current location and just update position
          updatePayload.isOnTable = true; // MUST be true for pool panel visibility
        } else {
          // Cards in pool panel should always have location=TABLE (unless already in deck)
          // deckId only indicates which deck the card belongs to, not its current location
          // When card is in deck, it will be handled by ADD_CARD_TO_TOP_OF_DECK action
          const properLocation = CardLocation.TABLE;

          console.log('[dropObjectsToPool] Card location correction:', {
            id: card.id,
            oldLocation: card.location,
            newLocation: properLocation,
            deckId: card.deckId,
            ownerId: card.ownerId,
            reason: 'Cards in pool panel are on TABLE (not in deck)'
          });

          updatePayload.location = properLocation; // Set proper location for deck/hand detection
          updatePayload.isOnTable = true; // MUST be true for pool panel visibility
        }
      }

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: updatePayload
      });
    });
  } catch (error) {
    console.error('Error dropping objects to pool:', error);
  }
}

/**
 * Get cursor slot objects (all draggable objects in cursor slot)
 * Supports: CARD, TOKEN, DECK, DICE_OBJECT, RANDOMIZER, DRAWING, BATTLEFIELD_CELL, BOARD, NEXUS_BOARD, NEXUS_CELL, COUNTER
 * Excludes: PANEL, WINDOW (UI objects)
 */
export function getCursorSlotObjects(objects: Record<string, TableObject>): TableObject[] {
  return Object.values(objects).filter(obj => {
    // Exclude UI objects
    if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) return false;

    // Only include objects in cursor slot
    if (!(obj as CursorSlotObject).inCursorSlot) return false;

    // Support all game object types that can be in cursor slot
    return [
      ItemType.CARD,
      ItemType.TOKEN,
      ItemType.DECK,
      ItemType.DICE_OBJECT,
      ItemType.RANDOMIZER,
      ItemType.DRAWING,
      ItemType.BATTLEFIELD_CELL,
      ItemType.BOARD,
      ItemType.NEXUS_BOARD,
      ItemType.NEXUS_CELL,
      ItemType.COUNTER
    ].includes(obj.type);
  });
}

/**
 * Default pool zone dimensions (re-exported from constants)
 */
export { DEFAULT_POOL_WIDTH, DEFAULT_POOL_HEIGHT };

/**
 * Pool panel data interface
 */
export interface PoolPanelData {
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
}

/**
 * Create default pool zone from panel data
 */
export function createPoolZoneFromPanel(poolData: PoolPanelData): PoolZone {
  return {
    offsetX: poolData.offsetX || 0,
    offsetY: poolData.offsetY || 0,
    width: poolData.width || DEFAULT_POOL_WIDTH,
    height: poolData.height || DEFAULT_POOL_HEIGHT
  };
}