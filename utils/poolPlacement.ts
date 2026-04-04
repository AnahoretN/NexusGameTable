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
}

/**
 * Extended table object with cursor slot properties
 */
export interface CursorSlotObject extends TableObject {
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
    // Find all boards in pool zone with snapToGrid enabled
    const boardsInPool = (poolObjects && typeof poolObjects === 'object') ? Object.values(poolObjects).filter(obj =>
      obj.type === ItemType.BOARD &&
      (obj as BoardType).snapToGrid &&
      obj.x >= poolZone.offsetX &&
      obj.x < poolZone.offsetX + poolZone.width &&
      obj.y >= poolZone.offsetY &&
      obj.y < poolZone.offsetY + poolZone.height
    ) as BoardType[] : [];

    // Sort by zIndex in DESCENDING order to preserve layer relationships
    const sortedObjects = sortObjectsByLayerIndex(objects);

    // Drop items with offset based on layer position
    sortedObjects.forEach((obj, sortedIndex) => {
      if (!obj || !obj.id) {
        console.warn('[dropObjectsToPool] Invalid object in drop list', obj);
        return;
      }

      let finalX = dropPosition.baseX;
      let finalY = dropPosition.baseY;

      // Apply board magnetism for tokens if boards are present
      if (obj.type === ItemType.TOKEN && boardsInPool.length > 0) {
        const token = obj as Token;

        // Try to snap to each board's grid
        for (const board of boardsInPool) {
          if (!board.gridCellMagnetPoints) continue;

          const gridW = board.gridWidth || board.gridSize || 50;
          const gridH = board.gridHeight || board.gridSize || 50;

          // Calculate relative position to board
          const relativeX = finalX - board.x;
          const relativeY = finalY - board.y;

          // Find which cell this position is in
          let col = 0, row = 0;
          if (board.gridType === GridType.SQUARE) {
            col = Math.floor(relativeX / gridW);
            row = Math.floor(relativeY / gridH);
          } else if (board.gridType === GridType.HEX) {
            col = Math.floor(relativeX / (gridW || 100));
            row = Math.floor(relativeY / (gridH || 115));
          } else if (board.gridType === GridType.HEX_HORIZONTAL) {
            col = Math.floor(relativeX / (gridW || 115));
            row = Math.floor(relativeY / (gridH || 100));
          }

          // Check if this cell has magnet points available
          const cellKey = `${col},${row}`;
          const cellMagnet = board.gridCellMagnetPoints[cellKey];

          if (cellMagnet && cellMagnet.magnetPoints && cellMagnet.magnetPoints.length < (cellMagnet.magnetPointCount || 1)) {
            // Calculate cell center
            const cellCenterX = board.x + (col * gridW) + (gridW / 2);
            const cellCenterY = board.y + (row * gridH) + (gridH / 2);

            // Check if token is close enough to snap (within 50 vu)
            const distance = Math.sqrt(
              Math.pow(finalX - cellCenterX, 2) +
              Math.pow(finalY - cellCenterY, 2)
            );

            if (distance < 50) {
              // Snap to cell center
              finalX = cellCenterX - (token.width || 50) / 2;
              finalY = cellCenterY - (token.height || 50) / 2;

              // Add to board's magnet points
              const updatedMagnetPoints = [...(cellMagnet.magnetPoints || []), { objectId: token.id, pointIndex: cellMagnet.magnetPoints.length }];
              const updatedGridCellMagnetPoints = {
                ...board.gridCellMagnetPoints,
                [cellKey]: {
                  ...cellMagnet,
                  magnetPoints: updatedMagnetPoints
                }
              };

              // Update board with new magnet points
              dispatch({
                type: 'UPDATE_OBJECT',
                payload: {
                  id: board.id,
                  gridCellMagnetPoints: updatedGridCellMagnetPoints
                }
              });

              // Store grid cell reference in token for easier unhooking
              dispatch({
                type: 'UPDATE_OBJECT',
                payload: {
                  id: token.id,
                  gridCellKey: `${board.id}:${cellKey}`
                }
              });

              break; // Only snap to first available board
            }
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
        inCursorSlot: false
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

        // Set location based on card's deckId
        // If card has deckId, it belongs to a deck -> location = DECK
        // Otherwise -> location = TABLE (card on table, even if it has ownerId)
        // NEVER use HAND location for cards in pool panel!
        let properLocation = CardLocation.TABLE;

        if (card.deckId) {
          properLocation = CardLocation.DECK;
        }

        console.log('[dropObjectsToPool] Card location correction:', {
          id: card.id,
          oldLocation: card.location,
          newLocation: properLocation,
          deckId: card.deckId,
          ownerId: card.ownerId,
          reason: properLocation === CardLocation.DECK ? 'Has deckId' : 'No deckId -> TABLE'
        });

        updatePayload.location = properLocation; // Set proper location for deck/hand detection
        updatePayload.isOnTable = true; // MUST be true for pool panel visibility
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