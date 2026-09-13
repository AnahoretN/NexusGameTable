import { TableObject, ItemType, CardLocation, Board as BoardType, HyperscaleLayer, BattlefieldCell } from '../types';
import { STACKING_OFFSET_FACTOR, DEFAULT_POOL_WIDTH, DEFAULT_POOL_HEIGHT } from '../constants/pool';
import { logger } from './logger';
import { allocateZIndexWithDefrag } from './zIndexAllocator';
import { applyCellEdgeMagnetism, type CellEdgeSnapCell } from './cellEdgeMagnetism';
import {
  calculateGridDimensions,
  calculateGridCellCenter,
  generateGridCellKey,
  addObjectToGridCellMagnet,
  findGridCellUnderCenter
} from './gridUtils';

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
  sourceZoom?: number; // Zoom level of the source panel where drag started
  clickOffsetX?: number; // X offset from object top-left to click position (in VU)
  clickOffsetY?: number; // Y offset from object top-left to click position (in VU)
  clickOffsetX_PX?: number; // X offset from object top-left to click position (in screen pixels)
  clickOffsetY_PX?: number; // Y offset from object top-left to click position (in screen pixels)
  originalX?: number; // Original object X before being picked up
  originalY?: number; // Original object Y before being picked up
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
  containerRect: DOMRect,
  scrollLeft: number,
  scrollTop: number,
  pixelsPerVU: number,
  zoom: number = 1
): DropPosition {
  // Calculate position relative to container
  // IMPORTANT: containerRect is the unscaled PoolTabletop container
  // Objects are positioned relative to this container, not the scroll parent
  // Don't divide by zoom because containerRect is already unscaled
  const relativeX = (clientX - containerRect.left + scrollLeft) / pixelsPerVU;
  const relativeY = (clientY - containerRect.top + scrollTop) / pixelsPerVU;

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

  // baseX/baseY represent the position where object top-left should be (after offset applied)
  // Apply stacking offset
  const x = baseX + offsetX;
  const y = baseY + offsetY;

  // For boards, allow placement anywhere (they'll be clipped by container overflow)
  // For other objects, constrain to pool zone bounds
  const isBoard = obj.type === ItemType.BOARD || obj.type === ItemType.NEXUS_BOARD;
  const constrainedX = isBoard ? x : Math.max(poolZone.offsetX, Math.min(x, poolZone.offsetX + poolZone.width - objWidth));
  const constrainedY = isBoard ? y : Math.max(poolZone.offsetY, Math.min(y, poolZone.offsetY + poolZone.height - objHeight));

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
  poolObjects: Record<string, TableObject>,
  pixelsPerVU: number = 1,
  zoom: number = 1,
  hyperscaleLayers?: HyperscaleLayer[],
  isFromHandOrDeck?: boolean  // NEW: Track if objects came from hand/deck for proper z-index handling
): void {
  if (!objects || objects.length === 0) {
    return;
  }

  if (!dropPosition || !poolZone) {
    return;
  }

  if (typeof dispatch !== 'function') {
    return;
  }

  // Determine if objects came from hand/deck if not explicitly provided
  // Check the first object's location to determine source
  let shouldAllocateNewZ = isFromHandOrDeck;
  if (shouldAllocateNewZ === undefined) {
    const firstItem = objects[0];
    const firstItemLocation = firstItem?.type === ItemType.CARD ? (firstItem as any).location : null;
    // Note: CURSOR_SLOT is not a CardLocation - check inCursorSlot property instead
    const inCursorSlot = (firstItem as CursorSlotObject)?.inCursorSlot;
    shouldAllocateNewZ = firstItem && (
      firstItemLocation === CardLocation.HAND ||
      firstItemLocation === CardLocation.DECK ||
      firstItemLocation === CardLocation.PILE ||
      inCursorSlot === true
    );
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

    // NEW: Smart z-index allocation for pool panel drops
    // Group objects by hyperscale layer for z-index allocation
    const layerGroups: Record<string, TableObject[]> = {};
    for (const obj of sortedObjects) {
      if (obj.type === ItemType.CARD && (obj as any).location === CardLocation.DECK) {
        continue; // Skip cards in deck
      }
      const layerId = obj.hyperscaleLayerId ?? 'default';
      if (!layerGroups[layerId]) {
        layerGroups[layerId] = [];
      }
      layerGroups[layerId].push(obj);
    }

    // Allocate z-indices for each layer
    // IMPORTANT: Always allocate new z-indices for objects from hand/deck
    // For objects from table, only allocate if hyperscaleLayers are provided
    const layerAllocations: Record<string, { allocatedZIndex: number; objectsToUpdate?: Record<string, number> }> = {};
    const layerItemIndices: Record<string, number> = {};

    // Determine if we should allocate z-indices
    const shouldAllocateZIndices = shouldAllocateNewZ || (hyperscaleLayers && hyperscaleLayers.length > 0);

    if (shouldAllocateZIndices) {
      for (const [layerId, _layerItems] of Object.entries(layerGroups)) {

        // IMPORTANT: Only allocate z-indices if hyperscaleLayers is available
        // If hyperscaleLayers is undefined, skip z-index allocation and use object's current z-index
        if (!hyperscaleLayers || hyperscaleLayers.length === 0) {
          continue;
        }

        const allocation = allocateZIndexWithDefrag(
          poolObjects,
          layerId === 'default' ? undefined : layerId,
          hyperscaleLayers
        );
        layerAllocations[layerId] = allocation;

        // If defragmentation was needed, apply it first
        if (allocation.objectsToUpdate) {
          for (const [objId, newZ] of Object.entries(allocation.objectsToUpdate)) {
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: objId,
                updates: { zIndex: newZ }
              }
            });
          }
        }
      }
    }

    // Drop items with offset based on layer position
    // Working copy of objects - tracks position/board updates made while dropping this batch,
    // so sequentially dropped objects (e.g. several cells) see each other's final positions
    const currentObjects: Record<string, TableObject> = { ...poolObjects };
    const batchIds = new Set(sortedObjects.map(o => o.id));

    sortedObjects.forEach((obj, sortedIndex) => {
      if (!obj || !obj.id) {
        return;
      }

      // IMPORTANT: Skip objects that are in a deck (location === 'DECK')
      // Cards in deck should not be dropped to pool panel - this prevents duplication
      // BUT: Allow cards in CURSOR_SLOT (they're being dragged, not actually in deck)
      if (obj.type === ItemType.CARD && (obj as any).location === CardLocation.DECK && !(obj as any).inCursorSlot) {
        return;
      }

      let finalX = dropPosition.baseX;
      let finalY = dropPosition.baseY;

      // IMPORTANT: Apply click offset to position object correctly
      // We need to handle different coordinate systems based on where the object came from
      if ((obj as CursorSlotObject).clickOffsetX !== undefined &&
          (obj as CursorSlotObject).clickOffsetY !== undefined) {
        // PREFER VU offsets - these are consistent across different zoom levels
        // clickOffsetX/Y are in VU (virtual units) and work regardless of source/destination zoom
        const offsetX = (obj as CursorSlotObject).clickOffsetX!;
        const offsetY = (obj as CursorSlotObject).clickOffsetY!;

        // Position the object so the grab point is under the cursor
        // clickOffset is distance from top-left to grab point, so subtract from cursor position
        finalX = dropPosition.baseX - offsetX;
        finalY = dropPosition.baseY - offsetY;
      } else if ((obj as CursorSlotObject).clickOffsetX_PX !== undefined &&
                 (obj as CursorSlotObject).clickOffsetY_PX !== undefined) {
        // Use PX offsets when VU offsets are not available
        // clickOffsetX_PX is ALWAYS in screen pixels (consistently from all sources now)
        const offsetPX_X = (obj as CursorSlotObject).clickOffsetX_PX!;
        const offsetPX_Y = (obj as CursorSlotObject).clickOffsetY_PX!;

        // Convert screen pixel offsets to pool panel VU
        const offsetX_VU = offsetPX_X / pixelsPerVU;
        const offsetY_VU = offsetPX_Y / pixelsPerVU;

        // Position the object so the grab point is under the cursor
        finalX = dropPosition.baseX - offsetX_VU;
        finalY = dropPosition.baseY - offsetY_VU;
      }
      // If no offset, object drops at cursor position (top-left corner at cursor)

      // IMPORTANT: Clear any existing grid cell attachment when dropping to pool
      // This prevents objects from retaining board attachments from main tabletop
      const existingGridCellKey = (obj as any).gridCellKey;
      if (existingGridCellKey) {
        // Parse the grid cell key (format: "boardId:col,row")
        const [boardId, cellKey] = existingGridCellKey.split(':');
        if (boardId && cellKey) {
          const board = currentObjects[boardId] as any;
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
                updates: {
                  gridCellMagnetPoints: updatedGridCellMagnetPoints
                }
              }
            });

            // Keep the working copy in sync so a later re-snap in this batch
            // doesn't read the stale magnet points
            currentObjects[boardId] = {
              ...board,
              gridCellMagnetPoints: updatedGridCellMagnetPoints
            };
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

      let finalPosX = position.constrainedX;
      let finalPosY = position.constrainedY;
      // Set when the cell snaps to a board grid cell in this pool zone
      let snappedGridCellKey: string | undefined = undefined;

      // Battlefield cell magnetism - mirrors the main tabletop drop behavior
      // (cursor slot drop handler in TabletopEventHandlers):
      // 1) Cells with snapToBoardGrid enabled snap to board grid cells (boards in this pool zone)
      // 2) Otherwise cells with edgeMagnetism (default true) snap flush to other cells' edges
      //    and to the pool zone edges, aligning centers when they are close
      if (obj.type === ItemType.BATTLEFIELD_CELL) {
        const cell = obj as BattlefieldCell;
        const cellW = obj.width || 100;
        const cellH = obj.height || 100;
        const cellCenterX = finalPosX + cellW / 2;
        const cellCenterY = finalPosY + cellH / 2;
        let snappedToGrid = false;

        // 1) Board grid magnetism (per-cell snapToBoardGrid setting)
        if (cell.snapToBoardGrid === true) {
          for (const boardId of Object.keys(currentObjects)) {
            const board = currentObjects[boardId] as BoardType;
            if (!board || board.type !== ItemType.BOARD) continue;

            // Skip hidden boards - magnetism should not work when board is hidden
            if (board.isOnTable === false) continue;
            if (!board.snapToGrid) continue;

            // Only boards that belong to this pool zone (same center-point rule the pool
            // uses to assign objects to panels) - don't snap to main tabletop boards
            const boardW = board.width || 500;
            const boardH = board.height || 500;
            const boardCenterX = (board.x || 0) + boardW / 2;
            const boardCenterY = (board.y || 0) + boardH / 2;
            if (boardCenterX < poolZone.offsetX || boardCenterX > poolZone.offsetX + poolZone.width ||
                boardCenterY < poolZone.offsetY || boardCenterY > poolZone.offsetY + poolZone.height) {
              continue;
            }

            // Cell center must be over the board
            if (cellCenterX < board.x || cellCenterX > board.x + boardW ||
                cellCenterY < board.y || cellCenterY > board.y + boardH) {
              continue;
            }

            const { gridW, gridH } = calculateGridDimensions(board);
            const { col, row } = findGridCellUnderCenter(board, cellCenterX, cellCenterY);
            const snappedCellCenter = calculateGridCellCenter(board, col, row);

            const magnetResult = addObjectToGridCellMagnet(
              board,
              col,
              row,
              obj.id,
              currentObjects,
              snappedCellCenter.x,
              snappedCellCenter.y,
              gridW,
              gridH
            );

            // Update board with new magnet points
            if (magnetResult.updatedBoard.gridCellMagnetPoints) {
              dispatch({
                type: 'UPDATE_OBJECT',
                payload: {
                  id: board.id,
                  updates: {
                    gridCellMagnetPoints: magnetResult.updatedBoard.gridCellMagnetPoints
                  }
                }
              });
              currentObjects[board.id] = { ...board, ...magnetResult.updatedBoard } as TableObject;
            }

            // Move other objects that were repositioned
            for (const movedObj of magnetResult.movedObjects) {
              if (movedObj.objectId !== obj.id) {
                dispatch({
                  type: 'UPDATE_OBJECT',
                  payload: {
                    id: movedObj.objectId,
                    updates: { x: movedObj.x, y: movedObj.y }
                  }
                });
                if (currentObjects[movedObj.objectId]) {
                  currentObjects[movedObj.objectId] = {
                    ...currentObjects[movedObj.objectId],
                    x: movedObj.x,
                    y: movedObj.y
                  };
                }
              }
            }

            // Snap position is already the top-left position for the object
            finalPosX = magnetResult.snapPosition.x;
            finalPosY = magnetResult.snapPosition.y;
            snappedGridCellKey = `${board.id}:${generateGridCellKey(col, row)}`;
            snappedToGrid = true;
            break; // Only snap to first matching board
          }
        }

        // 2) Cell edge magnetism: snap this cell's edges flush to other cells' edges in this
        // pool zone and to the pool zone edges. Hex cells snap side-to-side instead:
        // parallel sides attract and settle flush along the shared apothem (the line from
        // the center that bisects a side), aligning centers for a proper hex tiling
        // position. Skipped when the cell snapped to a board grid cell - grid snapping wins
        if (!snappedToGrid && cell.edgeMagnetism !== false) {
          const nearbyCells: CellEdgeSnapCell[] = [];

          for (const otherId of Object.keys(currentObjects)) {
            if (otherId === obj.id) continue;
            // Skip other objects dropped in the same batch - their final positions
            // are not known yet when they come later in the batch
            if (batchIds.has(otherId)) continue;
            const otherObj = currentObjects[otherId] as TableObject;
            if (!otherObj || otherObj.type !== ItemType.BATTLEFIELD_CELL) continue;
            // Skip hidden cells - magnetism should not work when cell is hidden
            if (otherObj.isOnTable === false) continue;
            // Skip pinned cells - their x/y may not match their actual visual position
            if ((otherObj as any).isPinnedToViewport) continue;

            // Only cells that belong to this pool zone (same center-point rule)
            const w = otherObj.width || 100;
            const h = otherObj.height || 100;
            const otherCenterX = (otherObj.x || 0) + w / 2;
            const otherCenterY = (otherObj.y || 0) + h / 2;
            if (otherCenterX < poolZone.offsetX || otherCenterX > poolZone.offsetX + poolZone.width ||
                otherCenterY < poolZone.offsetY || otherCenterY > poolZone.offsetY + poolZone.height) {
              continue;
            }

            nearbyCells.push({
              id: otherObj.id,
              x: otherObj.x,
              y: otherObj.y,
              width: w,
              height: h,
              shape: (otherObj as BattlefieldCell).shape,
              rotation: (otherObj as BattlefieldCell).rotation,
              borderWidth: (otherObj as BattlefieldCell).borderWidth,
            });
          }

          const snap = applyCellEdgeMagnetism({
            cell: {
              width: cellW,
              height: cellH,
              shape: cell.shape,
              rotation: cell.rotation,
              borderWidth: cell.borderWidth,
            },
            position: { x: finalPosX, y: finalPosY },
            others: nearbyCells,
            bounds: {
              left: poolZone.offsetX,
              top: poolZone.offsetY,
              right: poolZone.offsetX + poolZone.width,
              bottom: poolZone.offsetY + poolZone.height,
            },
          });

          finalPosX = snap.x;
          finalPosY = snap.y;
        }

        // Track final position so batch-dropped cells can snap to each other sequentially
        currentObjects[obj.id] = { ...(currentObjects[obj.id] || obj), x: finalPosX, y: finalPosY };
      }

      // Prepare update payload
      const updatePayload: any = {
        id: obj.id,
        x: finalPosX,
        y: finalPosY,
        inCursorSlot: false,
        gridCellKey: snappedGridCellKey, // Clear grid cell reference when dropping to pool (re-set when snapped to a pool board grid)
        isOnTable: true // IMPORTANT: All objects in pool panel must have isOnTable=true for visibility!
      };

      // For cards, set proper location and isOnTable=true for visibility in pool panel
      // IMPORTANT: Cards in pool panel should NEVER have location=HAND or location=CURSOR_SLOT
      // This prevents cards from briefly appearing in hand panel when being dragged to deck
      if (obj.type === ItemType.CARD) {
        const card = obj as any;

        // IMPORTANT: Don't change location if card is already in a deck (location === 'DECK')
        // This prevents cards from being pulled out of deck when opening search modal
        if (card.location === CardLocation.DECK) {
          // Keep current location and just update position
          updatePayload.isOnTable = true; // MUST be true for pool panel visibility
        } else {
          // Cards in pool panel should always have location=TABLE (unless already in deck)
          // deckId only indicates which deck the card belongs to, not its current location
          // When card is in deck, it will be handled by ADD_CARD_TO_TOP_OF_DECK action
          const properLocation = CardLocation.TABLE;

          updatePayload.location = properLocation; // Set proper location for deck/hand detection
          updatePayload.isOnTable = true; // MUST be true for pool panel visibility
        }
      }

      // Calculate z-index using smart allocation
      // IMPORTANT: Always allocate new z-indices for objects from hand/deck
      // For objects from table, only allocate if hyperscaleLayers were provided
      let finalZIndex = obj.zIndex ?? 0;
      if (shouldAllocateZIndices) {
        const layerId = obj.hyperscaleLayerId ?? 'default';
        const allocation = layerAllocations[layerId];
        if (allocation) {
          const currentIndex = layerItemIndices[layerId] ?? 0;
          finalZIndex = allocation.allocatedZIndex + currentIndex;
          layerItemIndices[layerId] = currentIndex + 1;
        }
      }

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: updatePayload.id,
          updates: {
            x: updatePayload.x,
            y: updatePayload.y,
            inCursorSlot: updatePayload.inCursorSlot,
            gridCellKey: updatePayload.gridCellKey,
            isOnTable: updatePayload.isOnTable,
            zIndex: finalZIndex,
            ...(updatePayload.location !== undefined && { location: updatePayload.location })
          }
        }
      });
    });
  } catch (error) {
    // Error handling
  }
}

/**
 * Get cursor slot objects (all draggable objects in cursor slot)
 * Supports: CARD, TOKEN, DECK, DICE_OBJECT, RANDOMIZER, DRAWING, BATTLEFIELD_CELL, BOARD, NEXUS_BOARD, NEXUS_CELL, COUNTER, EFFECT_TEMPLATE
 * Excludes: PANEL, WINDOW (UI objects), cards in DECK location
 */
export function getCursorSlotObjects(objects: Record<string, TableObject>): TableObject[] {
  const result = Object.values(objects).filter(obj => {
    // Exclude UI objects
    if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) return false;

    // Only include objects in cursor slot
    if (!(obj as CursorSlotObject).inCursorSlot) return false;

    // Exclude cards that are in a deck (location === 'DECK')
    // These cards should not trigger highlight or be draggable to pool panel
    if (obj.type === ItemType.CARD && (obj as any).location === CardLocation.DECK) {
      return false;
    }

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
      ItemType.COUNTER,
      ItemType.EFFECT_TEMPLATE
    ].includes(obj.type);
  });

  return result;
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
 * NOTE: This function is deprecated - use createPoolZoneFromTab instead
 */
export function createPoolZoneFromPanel(poolData: PoolPanelData): PoolZone {
  // Get active tab coordinates
  const activeTab = poolData.tabs?.find(tab => tab.id === poolData.activeTabId) || poolData.tabs?.[0];

  return {
    offsetX: activeTab?.offsetX ?? 0,
    offsetY: activeTab?.offsetY ?? 0,
    width: poolData.width || DEFAULT_POOL_WIDTH,
    height: poolData.height || DEFAULT_POOL_HEIGHT
  };
}

/**
 * Create pool zone from specific tab
 */
export function createPoolZoneFromTab(poolData: PoolPanelData, tabId: string): PoolZone {
  const tab = poolData.tabs?.find(t => t.id === tabId);

  return {
    offsetX: tab?.offsetX ?? 0,
    offsetY: tab?.offsetY ?? 0,
    width: poolData.width || DEFAULT_POOL_WIDTH,
    height: poolData.height || DEFAULT_POOL_HEIGHT
  };
}