import { useCallback, useEffect, useRef } from 'react';
import { TableObject, ItemType, Card as CardType, Token, TokenType, Deck as DeckType, Board as BoardType, CardOrientation, GridType } from '../../types';
import { clampScrollToPlayableArea } from '../../utils/viewportConstraints';
import {
  parseGridCellKey,
  calculateGridCellCenter,
  calculateGridDimensions,
  removeObjectFromGridCellMagnet,
  addObjectToGridCellMagnet,
  generateGridCellKey,
  snapToGrid
} from '../../utils/gridUtils';

interface TabletopEventHandlersProps {
  state: any;
  dispatch: React.Dispatch<any>;
  cursorSlot: any[];
  setCursorSlot: React.Dispatch<React.SetStateAction<any[]>>;
  setCursorPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  cursorPositionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  setCursorSlotSource: React.Dispatch<React.SetStateAction<'ctrl' | 'hold' | 'shift' | 'archetype' | null>>;
  cursorSlotSource: 'ctrl' | 'hold' | 'shift' | 'archetype' | null;
  currentTool: string;
  setCurrentTool: React.Dispatch<React.SetStateAction<string>>;
  isShiftPressed: boolean;
  setIsShiftPressed: React.Dispatch<React.SetStateAction<boolean>>;
  isCtrlPressed: boolean;
  setIsCtrlPressed: React.Dispatch<React.SetStateAction<boolean>>;
  draggingId: string | null;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  setResizingId: React.Dispatch<React.SetStateAction<string | null>>;
  setResizeStart: React.Dispatch<React.SetStateAction<{ x: number; y: number; width: number; height: number } | null>>;
  rulerStart: { x: number; y: number } | null;
  setRulerStart: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  rulerCurrent: { x: number; y: number } | null;
  setRulerCurrent: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  isRulerRightClick: boolean;
  setIsRulerRightClick: React.Dispatch<React.SetStateAction<boolean>>;
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; object: TableObject; shiftKey?: boolean } | null>>;
  setDeleteCandidateId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  viewTransform: any;
  pixelsPerVU: number;
  v2p: (vu: number) => number;
  p2v: (px: number) => number;
  activePlayerId: string;
  isGM: boolean;
  hyperscaleLayers: any[];
  localSettings: any;
  updateSetting: (key: string | number | symbol, value: any) => void;
  liveResizeSizeRef: React.RefObject<{ width: number; height: number } | null>;
  setLiveResizeSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;
  resizeFinalSizeRef: React.RefObject<{ width: number; height: number } | null>;
  isAddingTokenRef: React.RefObject<boolean>;
  longPressTimerRef: React.RefObject<number | null>;
  clickTooltipTimerRef: React.RefObject<number | null>;
  clickTooltipBoundsRef: React.RefObject<{ left: number; right: number; top: number; bottom: number } | null>;
  dragThresholdRef: React.MutableRefObject<{
    initialX: number;
    initialY: number;
    targetId: string | null;
    addedToSlot: boolean;
  }>;
  dragOffsetRef: React.MutableRefObject<{ x: number; y: number } | null>;
  setClickTooltip: React.Dispatch<React.SetStateAction<{ cardId: string; x: number; y: number } | null>>;
  setNexusBoardAddingCell: React.Dispatch<React.SetStateAction<string | null>>;
  setSettingsModalObj: React.Dispatch<React.SetStateAction<TableObject | null>>;
  setPileContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; pile: any; deck: any } | null>>;
  setSearchModalDeck: React.Dispatch<React.SetStateAction<any>>;
  setPilesButtonMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; deck: any } | null>>;
  setTopDeckModalDeck: React.Dispatch<React.SetStateAction<any>>;
  setZoom?: (zoom: number) => void; // Optional setZoom from ViewTransformContext
}

// Helper function to add object to cursor slot WITH LOGGING
const addToCursorSlot = (
  id: string,
  item: TableObject,
  mousePosition: { x: number; y: number } | undefined,
  props: TabletopEventHandlersProps,
  source: 'ctrl' | 'hold' | 'shift' = 'ctrl'
) => {
  console.log('🎯 [CURSOR SLOT] addToCursorSlot called:', {
    id,
    itemType: item?.type,
    itemName: item?.name,
    source,
    mousePosition,
    timestamp: new Date().toISOString()
  });

  const {
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    setCursorSlotSource,
    state,
    dispatch,
    activePlayerId,
    scrollContainerRef,
    viewTransform,
    p2v
  } = props;

  console.log('🔍 [CURSOR SLOT] Current slot state:', {
    slotLength: cursorSlot.length,
    maxItems: 100
  });

  // Check if cursor is over a token archetype button
  const elementUnderCursor = document.elementFromPoint(mousePosition?.x ?? 0, mousePosition?.y ?? 0);
  const archetypeButton = elementUnderCursor?.closest('[data-archetype-card]');
  if (archetypeButton) {
    console.log('❌ [CURSOR SLOT] Blocked: cursor over archetype button');
    return;
  }

  if (cursorSlot.length >= 100) {
    console.log('❌ [CURSOR SLOT] Blocked: slot full (100 items max)');
    return; // Max 100 items in slot
  }

  // Set source based on how the item was added (only if slot was empty before)
  if (cursorSlot.length === 0) {
    console.log('📍 [CURSOR SLOT] Setting slot source:', source);
    setCursorSlotSource(source);
  }

  // Check if item is snapped to a grid cell and unhook it
  const obj = state.objects[id];
  const gridCellKey = (obj as Token)?.gridCellKey || (obj as CardType)?.gridCellKey;
  if (obj && gridCellKey && (obj.type === ItemType.TOKEN || obj.type === ItemType.CARD)) {
    console.log('🔓 [CURSOR SLOT] Unhooking from grid cell:', gridCellKey);
    const [boardId, ...cellParts] = gridCellKey.split(':');
    const cellKey = cellParts.join(':');

    const board = state.objects[boardId] as BoardType;
    if (board && board.gridCellMagnetPoints && board.gridCellMagnetPoints[cellKey]) {
      const { col, row } = parseGridCellKey(cellKey);
      const gridW = board.gridWidth || board.gridSize || 50;
      const gridH = board.gridHeight || board.gridSize || 50;
      const cellCenter = calculateGridCellCenter(board, col, row);

      const result = removeObjectFromGridCellMagnet(
        board,
        col,
        row,
        id,
        state.objects,
        cellCenter.x,
        cellCenter.y,
        gridW,
        gridH
      );

      if (result) {
        console.log('✅ [CURSOR SLOT] Unhooked from grid:', result);
        const updatedBoard = {
          ...board,
          gridCellMagnetPoints: result.updatedBoard.gridCellMagnetPoints
        };

        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: updatedBoard.id,
            updates: updatedBoard
          }
        });

        for (const movedObj of result.movedObjects) {
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: movedObj.objectId,
              updates: {
                x: movedObj.x,
                y: movedObj.y
              }
            }
          });
        }

        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: id,
            updates: {
              gridCellKey: undefined
            }
          }
        });
      }
    }
  }

  // Clone the item to store it in the slot - STORE COMPLETE OBJECT INFO
  console.log('📋 [CURSOR SLOT] Cloning object for slot...');
  let itemClone: TableObject;

  if (item.type === ItemType.CARD) {
    console.log('🃏 [CURSOR SLOT] Cloning CARD:', {
      cardId: item.id,
      deckId: (item as CardType).deckId,
      faceUp: (item as CardType).faceUp
    });

    const card = item as CardType;
    const deck = card.deckId ? state.objects[card.deckId] as any : undefined;
    const isHorizontal = deck?.cardOrientation === CardOrientation.HORIZONTAL;

    itemClone = {
      id: card.id,
      type: ItemType.CARD,
      name: card.name,
      content: card.content,
      frontFaceUrl: card.frontFaceUrl,
      backFaceUrl: card.backFaceUrl,
      deckId: card.deckId,
      width: card.width,
      height: card.height,
      faceUp: card.faceUp,
      isHorizontal: isHorizontal,
      spriteIndex: card.spriteIndex,
      spriteColumns: card.spriteColumns,
      spriteRows: card.spriteRows,
      spriteUrl: card.spriteUrl,
      shape: card.shape,
      x: 0,  // ❌ Сбрасываем координаты в слоте курсора
      y: 0,
      rotation: card.rotation || 0,
      zIndex: card.zIndex ?? 0,
      hyperscaleLayerId: card.hyperscaleLayerId ?? 'cards',
      location: card.location,
    } as CardType;
  } else if (item.type === ItemType.DECK) {
    console.log('🗃️ [CURSOR SLOT] Cloning DECK:', {
      deckId: item.id,
      deckName: item.name
    });

    const deck = item as DeckType;
    itemClone = {
      id: deck.id,
      type: ItemType.DECK,
      name: deck.name,
      cardIds: [...deck.cardIds],
      baseCardIds: [...deck.baseCardIds],
      width: deck.width,
      height: deck.height,
      cardShape: deck.cardShape,
      cardOrientation: deck.cardOrientation,
      showTopCard: deck.showTopCard,
      spriteConfig: deck.spriteConfig ? { ...deck.spriteConfig } : undefined,
      x: 0,  // ❌ Сбрасываем координаты в слоте курсора
      y: 0,
      rotation: deck.rotation || 0,
      zIndex: deck.zIndex ?? 0,
      hyperscaleLayerId: deck.hyperscaleLayerId ?? 'cards',
      locked: deck.locked,
    } as DeckType;
  } else if (item.type === ItemType.TOKEN) {
    console.log('🔄 [CURSOR SLOT] Cloning TOKEN:', {
      tokenId: item.id,
      tokenName: item.name
    });

    const token = item as Token;
    itemClone = {
      id: token.id,
      type: ItemType.TOKEN,
      name: token.name,
      width: token.width,
      height: token.height,
      shape: token.shape,
      color: token.color,
      content: token.content,
      borderWidth: token.borderWidth,
      borderColor: (token as any).borderColor,
      opacity: token.opacity,
      borderOpacity: token.borderOpacity,
      x: 0,  // ❌ Сбрасываем координаты в слоте курсора
      y: 0,
      rotation: token.rotation || 0,
      zIndex: token.zIndex ?? 0,
      hyperscaleLayerId: token.hyperscaleLayerId ?? 'tokens',
    } as Token;
  } else if (item.type === ItemType.BOARD) {
    console.log('📋 [CURSOR SLOT] Cloning BOARD:', {
      boardId: item.id,
      boardName: item.name
    });

    const board = item as BoardType;
    itemClone = {
      id: board.id,
      type: ItemType.BOARD,
      name: board.name,
      content: board.content,
      width: board.width,
      height: board.height,
      x: 0,  // ❌ Сбрасываем координаты в слоте курсора
      y: 0,
      rotation: board.rotation || 0,
      gridType: board.gridType,
      gridSize: board.gridSize,
      gridWidth: board.gridWidth,
      gridHeight: board.gridHeight,
      showGrid: board.showGrid,
      snapToGrid: board.snapToGrid,
      color: board.color,
      zIndex: board.zIndex ?? 0,
      hyperscaleLayerId: board.hyperscaleLayerId ?? 'boards',
    } as BoardType;
  } else {
    console.log('📦 [CURSOR SLOT] Cloning OTHER:', item.type);
    itemClone = { ...item, x: 0, y: 0 }; // ❌ Сбрасываем координаты в слоте курсора
  }

  // Store metadata for cursor slot
  (itemClone as any).originalZIndex = item.zIndex ?? 0;
  (itemClone as any).source = source;
  (itemClone as any).cursorSlotIndex = cursorSlot.length;
  (itemClone as any).timestamp = Date.now();

  // Calculate and store click offset from object center
  if (mousePosition && obj && scrollContainerRef.current) {
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const scrollX = viewTransform?.scroll?.x || 0;
    const scrollY = viewTransform?.scroll?.y || 0;

    // Convert click position to virtual units
    const clickX_VU = p2v(mousePosition.x - rect.left + scrollX);
    const clickY_VU = p2v(mousePosition.y - rect.top + scrollY);

    // Calculate offset from top-left corner to click position (not from center!)
    const offsetX = clickX_VU - obj.x;
    const offsetY = clickY_VU - obj.y;

    console.log('🎯 [CURSOR SLOT] Calculating click offset from top-left corner:', {
      objId: item.id,
      objPosition: { x: obj.x, y: obj.y },
      clickPosition_VU: { x: clickX_VU, y: clickY_VU },
      clickPosition_PX: { x: mousePosition.x, y: mousePosition.y },
      calculatedOffset: { x: offsetX, y: offsetY },
      objSize: { width: obj.width, height: obj.height }
    });

    // Store offset in virtual units
    (itemClone as any).clickOffsetX = offsetX;
    (itemClone as any).clickOffsetY = offsetY;

    console.log('💾 [CURSOR SLOT] Stored click offset on clone:', {
      itemId: itemClone.id,
      clickOffsetX: offsetX,
      clickOffsetY: offsetY,
      cloneXY: { x: itemClone.x, y: itemClone.y }
    });

    // Store original object position for drop calculation
    (itemClone as any).originalX = obj.x;
    (itemClone as any).originalY = obj.y;
  }

  console.log('✨ [CURSOR SLOT] Clone created:', {
    cloneId: itemClone.id,
    cloneType: itemClone.type,
    slotIndex: (itemClone as any).cursorSlotIndex
  });

  // Add to cursor slot
  const newSlot = [...cursorSlot, itemClone as CardType | TokenType | BoardType | DeckType];
  console.log('➕ [CURSOR SLOT] Adding to slot:', {
    oldLength: cursorSlot.length,
    newLength: newSlot.length,
    addedItem: itemClone.id,
    storedOriginalPosition: { x: (itemClone as any).x, y: (itemClone as any).y }
  });

  setCursorSlot(newSlot);

  // Remove object from table temporarily (hide it while in slot)
  console.log('🚫 [CURSOR SLOT] Hiding object from table while in slot:', {
    objectId: id
  });

  dispatch({
    type: 'UPDATE_OBJECT',
    payload: {
      id: id,
      updates: {
        inCursorSlot: true,
        isOnTable: false,
        // Move object far away to hide it while in slot
        x: -999999,
        y: -999999
      }
    }
  });

  // Update cursor position
  if (mousePosition) {
    const pos = { x: mousePosition.x, y: mousePosition.y };
    console.log('🖱️ [CURSOR SLOT] Updating cursor position:', pos);
    setCursorPosition(pos);
    cursorPositionRef.current = pos;
  }

  console.log('✅ [CURSOR SLOT] Successfully added item to slot:', {
    itemId: id,
    slotSize: newSlot.length,
    source: source
  });
};

// Helper function to drop cursor slot items WITH LOGGING
const dropCursorSlot = (
  clientX: number,
  clientY: number,
  props: TabletopEventHandlersProps
) => {
  console.log('🎯 [CURSOR SLOT] dropCursorSlot called:', {
    clientX,
    clientY,
    timestamp: new Date().toISOString()
  });

  const {
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    setCursorSlotSource,
    cursorSlotSource,
    state,
    dispatch,
    activePlayerId,
    scrollContainerRef,
    viewTransform,
    p2v
  } = props;

  console.log('🔍 [CURSOR SLOT] Current slot state before drop:', {
    slotLength: cursorSlot.length,
    items: cursorSlot.map(item => ({ id: item.id, type: item.type }))
  });

  if (cursorSlot.length === 0) {
    console.log('❌ [CURSOR SLOT] Slot is empty, nothing to drop');
    return;
  }

  // Notify that items were dropped from cursor slot
  const droppedIds = cursorSlot.map(item => item.id);
  console.log('📢 [CURSOR SLOT] Dispatching cursor-slot-dropped event:', droppedIds);

  window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
    detail: { cardIds: droppedIds }
  }));

  // Check if cursor is over a token archetype card
  const elementAtCursor = document.elementFromPoint(clientX, clientY);
  const archetypeCard = elementAtCursor?.closest('[data-archetype-card]');

  if (archetypeCard) {
    console.log('❌ [CURSOR SLOT] Drop blocked: cursor over archetype card');
    return;
  }

  // Determine zIndex behavior based on source
  const itemSource = cursorSlot.length > 0 ? (cursorSlot[0] as any).source : null;
  const source = itemSource || cursorSlotSource;
  const useOriginalZIndex = source === 'hold' || source === 'archetype';

  console.log('🎨 [CURSOR SLOT] Drop settings:', {
    source,
    useOriginalZIndex,
    itemSource
  });

  // Calculate drop position
  const rect = scrollContainerRef.current?.getBoundingClientRect();
  if (!rect) {
    console.log('❌ [CURSOR SLOT] Cannot get rect, dropping canceled');
    return;
  }

  const baseX = p2v(clientX - rect.left + (viewTransform?.scroll?.x || 0));
  const baseY = p2v(clientY - rect.top + (viewTransform?.scroll?.y || 0));

  console.log('📍 [CURSOR SLOT] Drop position calculated:', {
    baseX,
    baseY,
    clientX,
    clientY,
    scrollX: viewTransform?.scroll?.x,
    scrollY: viewTransform?.scroll?.y
  });

  // Drop all items from cursor slot
  cursorSlot.forEach((item, index) => {
    let finalX, finalY;

    // Check if we have stored click offset info
    if ((item as any).clickOffsetX !== undefined && (item as any).clickOffsetY !== undefined) {
      // Use stored offset to position object correctly
      const offsetX = (item as any).clickOffsetX;
      const offsetY = (item as any).clickOffsetY;

      console.log('📍 [CURSOR SLOT] Using stored click offset:', {
        itemId: item.id,
        offset: { x: offsetX, y: offsetY },
        dropPosition: { x: baseX, y: baseY }
      });

      // Calculate final position: dropPos - offset
      // This makes the clicked point end up at the drop position
      finalX = baseX - offsetX;
      finalY = baseY - offsetY;

      console.log('🎯 [CURSOR SLOT] Calculated final position with offset:', {
        itemId: item.id,
        finalPosition: { x: finalX, y: finalY },
        originalPosition: { x: item.x, y: item.y },
        calculation: `dropPos(${baseX.toFixed(2)}, ${baseY.toFixed(2)}) - offset(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)})`
      });
    } else {
      // Fallback: use simple offset if no click offset stored
      const offsetX = index * 20;
      const offsetY = index * 20;
      finalX = baseX + offsetX;
      finalY = baseY + offsetY;

      console.log('⚠️ [CURSOR SLOT] No stored offset, using simple offset:', {
        itemId: item.id,
        simpleOffset: { x: offsetX, y: offsetY }
      });
    }

    // Apply stack offset for multiple items
    if (cursorSlot.length > 1) {
      const stackOffsetX = index * 20;
      const stackOffsetY = index * 20;
      finalX += stackOffsetX;
      finalY += stackOffsetY;

      console.log('📚 [CURSOR SLOT] Applied stack offset:', {
        itemId: item.id,
        stackOffset: { x: stackOffsetX, y: stackOffsetY },
        adjustedPosition: { x: finalX, y: finalY }
      });
    }

    let finalZIndex = item.zIndex;
    if (!useOriginalZIndex) {
      finalZIndex = 10000 + index;
    }

    console.log('📦 [CURSOR SLOT] Dropping item:', {
      index,
      itemId: item.id,
      itemType: item.type,
      x: finalX,
      y: finalY,
      zIndex: finalZIndex,
      restoringOriginalPosition: { x: (item as any).originalX, y: (item as any).originalY }
    });

    // Check for board grid magnetism
    const isToken = item.type === ItemType.TOKEN;
    const isCard = item.type === ItemType.CARD;
    const shouldSnapToGrid = isToken || (isCard && item.snapToGrid);

    if (shouldSnapToGrid) {
      // Find board under drop position
      // Use object center for finding the grid cell (not cursor position!)
      const objWidth = item.width ?? 50;
      const objHeight = item.height ?? 50;
      // Calculate object center from final position (accounting for offset)
      const centerX = finalX + objWidth / 2;
      const centerY = finalY + objHeight / 2;

      console.log('🧲 [MAGNET DEBUG] Object drop position:', {
        itemId: item.id,
        finalX, finalY,
        centerX, centerY,
        cursorPosition: { x: baseX, y: baseY },
        objWidth, objHeight
      });

      for (const boardId of Object.keys(state.objects)) {
        const board = state.objects[boardId] as BoardType;
        if (board.type !== ItemType.BOARD) continue;

        // Check if object is over this board
        const boardWidth = board.width ?? 500;
        const boardHeight = board.height ?? 500;
        const boardLeft = board.x;
        const boardRight = board.x + boardWidth;
        const boardTop = board.y;
        const boardBottom = board.y + boardHeight;

        if (centerX < boardLeft || centerX > boardRight || centerY < boardTop || centerY > boardBottom) {
          continue;
        }

        // Check if board has snapToGrid enabled for this item type
        const snapEnabled = isToken ? board.snapToGrid : board.snapCardsToGrid;
        if (!snapEnabled) continue;

        console.log('🧲 [MAGNET DEBUG] Board found for snap:', {
          boardId: board.id,
          boardX: board.x,
          boardY: board.y,
          boardWidth: board.width,
          boardHeight: board.height,
          gridW: board.gridWidth || board.gridSize || 50,
          gridH: board.gridHeight || board.gridSize || 50,
          gridType: board.gridType,
          snapEnabled,
          cursorPosition: { x: centerX, y: centerY }
        });

        // Calculate grid cell under the drop position using consistent dimensions
        const { gridW, gridH } = calculateGridDimensions(board);

        let col: number;
        let row: number;

        if (board.gridType === GridType.HEX) {
          // For pointy-top hex grids, odd rows are offset to the right by gridW/2
          // We need to find the nearest hex cell by checking multiple candidates
          const hCap = Math.min(gridW / (2 * Math.sqrt(3)), gridH / 2);
          const dy = gridH - hCap;
          const offsetX = gridW / 2;

          const relX = centerX - board.x;
          const relY = centerY - board.y;

          // Calculate initial row estimate
          const initialRow = Math.round(relY / dy);

          // Check several row candidates (initialRow-1, initialRow, initialRow+1)
          let bestCol = 0;
          let bestRow = 0;
          let minDistance = Infinity;

          for (const rowCandidate of [initialRow - 1, initialRow, initialRow + 1]) {
            if (rowCandidate < 0) continue;

            // For this row, calculate the best col
            const rowOffset = (rowCandidate % 2 === 1) ? offsetX : 0;
            const colCandidate = Math.round((relX - rowOffset) / gridW);

            if (colCandidate < 0) continue;

            // Calculate the actual center of this cell
            const cellCenter = calculateGridCellCenter(board, colCandidate, rowCandidate);
            const distance = Math.sqrt(
              Math.pow(cellCenter.x - centerX, 2) +
              Math.pow(cellCenter.y - centerY, 2)
            );

            if (distance < minDistance) {
              minDistance = distance;
              bestCol = colCandidate;
              bestRow = rowCandidate;
            }
          }

          col = bestCol;
          row = bestRow;
        } else if (board.gridType === GridType.HEX_HORIZONTAL) {
          // For flat-top hex grids, odd columns are offset downward by gridH/2
          // We need to find the nearest hex cell by checking multiple candidates
          const wCap = Math.min(gridH / (2 * Math.sqrt(3)), gridW / 2);
          const dx = gridW - wCap;
          const offsetY = gridH / 2;

          const relX = centerX - board.x;
          const relY = centerY - board.y;

          // Calculate initial col estimate
          const initialCol = Math.round(relX / dx);

          // Check several col candidates (initialCol-1, initialCol, initialCol+1)
          let bestCol = 0;
          let bestRow = 0;
          let minDistance = Infinity;

          for (const colCandidate of [initialCol - 1, initialCol, initialCol + 1]) {
            if (colCandidate < 0) continue;

            // For this col, calculate the best row
            const colOffset = (colCandidate % 2 === 1) ? offsetY : 0;
            const rowCandidate = Math.round((relY - colOffset) / gridH);

            if (rowCandidate < 0) continue;

            // Calculate the actual center of this cell
            const cellCenter = calculateGridCellCenter(board, colCandidate, rowCandidate);
            const distance = Math.sqrt(
              Math.pow(cellCenter.x - centerX, 2) +
              Math.pow(cellCenter.y - centerY, 2)
            );

            if (distance < minDistance) {
              minDistance = distance;
              bestCol = colCandidate;
              bestRow = rowCandidate;
            }
          }

          col = bestCol;
          row = bestRow;
        } else {
          // Square grid
          col = Math.floor((centerX - board.x) / gridW);
          row = Math.floor((centerY - board.y) / gridH);
        }

        const cellKey = generateGridCellKey(col, row);

        const cellCenter = calculateGridCellCenter(board, col, row);

        const expectedCellCenter = {
          x: board.x + col * gridW + gridW / 2,
          y: board.y + row * gridH + gridH / 2
        };

        console.log('🧲 [MAGNET DEBUG] Cell calculated:', {
          col, row, cellKey,
          'cellCenter.x': cellCenter.x.toFixed(2),
          'cellCenter.y': cellCenter.y.toFixed(2),
          'expectedCellCenter.x': expectedCellCenter.x.toFixed(2),
          'expectedCellCenter.y': expectedCellCenter.y.toFixed(2),
          'cursorPosition.x': centerX.toFixed(2),
          'cursorPosition.y': centerY.toFixed(2),
          'gridW': gridW,
          'gridH': gridH,
          'board.x': board.x,
          'board.y': board.y,
          'cellCenterMatch': cellCenter.x === expectedCellCenter.x && cellCenter.y === expectedCellCenter.y,
          'dx': (cellCenter.x - expectedCellCenter.x).toFixed(2),
          'dy': (cellCenter.y - expectedCellCenter.y).toFixed(2),
          'calculation': `expected: ${expectedCellCenter.x.toFixed(2)} = ${board.x} + ${col}*${gridW} + ${gridW/2}`
        });

        // Add object to grid cell magnet points
        const magnetResult = addObjectToGridCellMagnet(
          board,
          col,
          row,
          item.id,
          state.objects,
          cellCenter.x,
          cellCenter.y,
          gridW,
          gridH
        );

        console.log('🧲 [GRID MAGNET] Snapped object to grid cell:', {
          itemId: item.id,
          boardId: board.id,
          cellKey,
          col,
          row,
          snapPosition: magnetResult.snapPosition,
          cellCenter: cellCenter,
          expectedSnapPosition: {
            x: cellCenter.x,
            y: cellCenter.y
          },
          movedObjects: magnetResult.movedObjects
        });

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
        }

        // Move other objects that were repositioned
        for (const movedObj of magnetResult.movedObjects) {
          if (movedObj.objectId !== item.id) {
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: movedObj.objectId,
                updates: {
                  x: movedObj.x,
                  y: movedObj.y
                }
              }
            });
          }
        }

        // Update current object position to snap position
        // Snap position is already the top-left position for the object
        finalX = magnetResult.snapPosition.x;
        finalY = magnetResult.snapPosition.y;

        console.log('🧲 [MAGNET DEBUG] Snap applied:', {
          itemId: item.id,
          snapPosition: magnetResult.snapPosition,
          clickOffset: { x: (item as any).clickOffsetX, y: (item as any).clickOffsetY },
          finalPosition: { x: finalX, y: finalY },
          calculation: `final = snap(${magnetResult.snapPosition.x.toFixed(2)}, ${magnetResult.snapPosition.y.toFixed(2)})`
        });

        // Store grid cell reference on the object
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: item.id,
            updates: {
              gridCellKey: `${board.id}:${cellKey}`
            }
          }
        });

        break; // Only snap to first matching board
      }
    }

    // Restore object to table at new position
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: item.id,
        updates: {
          inCursorSlot: false,
          isOnTable: true,
          x: finalX,
          y: finalY,
          zIndex: finalZIndex
        }
      }
    });
  });

  // Clear cursor slot
  console.log('🧹 [CURSOR SLOT] Clearing slot after drop');
  setCursorSlot([]);
  setCursorPosition(null);
  cursorPositionRef.current = null;
  setCursorSlotSource(null);

  console.log('✅ [CURSOR SLOT] Drop completed successfully');
};

export const useTabletopEventHandlers = (props: TabletopEventHandlersProps) => {
  const {
    state,
    dispatch,
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    setZoom,
    cursorPositionRef,
    setCursorSlotSource,
    cursorSlotSource,
    currentTool,
    setCurrentTool,
    isShiftPressed,
    setIsShiftPressed,
    isCtrlPressed,
    setIsCtrlPressed,
    draggingId,
    setDraggingId,
    setResizingId,
    setResizeStart,
    rulerStart,
    setRulerStart,
    rulerCurrent,
    setRulerCurrent,
    isRulerRightClick,
    setIsRulerRightClick,
    setContextMenu,
    setDeleteCandidateId,
    setIsPanning,
    scrollContainerRef,
    viewTransform,
    pixelsPerVU,
    v2p,
    p2v,
    activePlayerId,
    isGM,
    hyperscaleLayers,
    localSettings,
    updateSetting,
    liveResizeSizeRef,
    setLiveResizeSize,
    resizeFinalSizeRef,
    isAddingTokenRef,
    longPressTimerRef,
    clickTooltipTimerRef,
    clickTooltipBoundsRef,
    dragThresholdRef,
    dragOffsetRef,
    setClickTooltip,
    setNexusBoardAddingCell,
    setSettingsModalObj,
    setPileContextMenu,
    setSearchModalDeck,
    setPilesButtonMenu,
    setTopDeckModalDeck,
  } = props;

  // Clear tooltip click timer
  useEffect(() => {
    return () => {
      if (clickTooltipTimerRef.current) {
        clearTimeout(clickTooltipTimerRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, obj: TableObject) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      object: obj,
      shiftKey: isShiftPressed
    });
  }, [isShiftPressed, setContextMenu]);

  // Mouse down handler WITH LOGGING
  const handleMouseDown = useCallback((e: React.MouseEvent, objId?: string) => {
    console.log('🖱️ [MOUSE DOWN] Event triggered:', {
      button: e.button,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      objId,
      timestamp: new Date().toISOString()
    });

    // Handle clicking on empty space (clear context menus, rulers, etc.)
    if (!objId) {
      console.log('📍 [MOUSE DOWN] Clicked on empty space');
      // Clear ruler if active
      if (currentTool === 'ruler' && e.button === 0) {
        if (!rulerStart) {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const startX = e.clientX - rect.left;
          const startY = e.clientY - rect.top;
          setRulerStart({ x: p2v(startX), y: p2v(startY) });
          console.log('📏 [MOUSE DOWN] Ruler started:', { startX, startY });
        }
      }
      return;
    }

    const obj = state.objects[objId];
    if (!obj) {
      console.log('❌ [MOUSE DOWN] Object not found:', objId);
      return;
    }

    console.log('🎯 [MOUSE DOWN] Object clicked:', {
      id: obj.id,
      type: obj.type,
      name: obj.name,
      locked: obj.locked,
      ownerId: (obj as any).ownerId
    });

    // Check if object is locked or not owned by player
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    if (obj.locked && !isGM) {
      console.log('🔒 [MOUSE DOWN] Object locked, access denied');
      return;
    }
    if (!isOwner) {
      console.log('🚫 [MOUSE DOWN] Not owner, access denied');
      return;
    }

    // Handle different tools
    if (currentTool === 'marker') {
      console.log('✏️ [MOUSE DOWN] Marker tool active');
      // Marker tool logic would go here
      return;
    }

    if (currentTool === 'eraser') {
      console.log('🧹 [MOUSE DOWN] Eraser tool active');
      if (isShiftPressed && isOwner) {
        setDeleteCandidateId(objId);
        console.log('🗑️ [MOUSE DOWN] Marked for deletion:', objId);
      }
      return;
    }

    // Handle right-click for ruler radius
    if (currentTool === 'ruler' && e.button === 2) {
      console.log('📏 [MOUSE DOWN] Ruler right-click');
      setIsRulerRightClick(true);
      return;
    }

    // Shift+click immediately adds to cursor slot for cards, tokens, boards, etc.
    if (e.shiftKey && obj && (
      obj.type === ItemType.CARD ||
      obj.type === ItemType.TOKEN ||
      obj.type === ItemType.BOARD
    )) {
      console.log('🎯 [SHIFT+CLICK] Adding to cursor slot:', {
        objId,
        type: obj.type,
        name: obj.name
      });

      e.preventDefault();
      e.stopPropagation();
      addToCursorSlot(objId, obj, { x: e.clientX, y: e.clientY }, props, 'shift');
      return;
    }

    // Ctrl+click adds to cursor slot instead of dragging
    if (e.ctrlKey || e.metaKey) {
      if (obj && obj.type !== ItemType.PANEL && obj.type !== ItemType.WINDOW) {
        console.log('🎯 [CTRL+CLICK] Adding to cursor slot:', {
          objId,
          type: obj.type,
          name: obj.name
        });

        addToCursorSlot(objId, obj, { x: e.clientX, y: e.clientY }, props, 'ctrl');
        return;
      }
    }

    // If cursor slot has items and we click without shift/ctrl/meta, drop all items first
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && cursorSlot.length > 0 && cursorSlotSource !== 'archetype') {
      console.log('📦 [MOUSE DOWN] Dropping existing slot items:', {
        slotSize: cursorSlot.length,
        source: cursorSlotSource
      });

      dropCursorSlot(e.clientX, e.clientY, props);
      return;
    }

    // Handle left-click for dragging - ADD TO CURSOR SLOT
    if (e.button === 0) {
      console.log('🖱️ [MOUSE DOWN] Starting drag operation:', {
        objId,
        clientX: e.clientX,
        clientY: e.clientY
      });

      // Check if object is already in cursor slot
      const actuallyInSlot = cursorSlot.some(item => item.id === objId);
      if (actuallyInSlot) {
        console.log('⚠️ [MOUSE DOWN] Object already in slot, ignoring');
        e.stopPropagation();
        return;
      }

      // Immediately add to cursor slot for cards, tokens, boards, decks
      if (obj && (
        obj.type === ItemType.CARD ||
        obj.type === ItemType.TOKEN ||
        obj.type === ItemType.BOARD ||
        obj.type === ItemType.DECK
      )) {
        console.log('🎯 [MOUSE DOWN] Adding object to cursor slot on mouse down:', {
          objId,
          type: obj.type,
          name: obj.name
        });

        e.preventDefault();
        e.stopPropagation();
        addToCursorSlot(objId, obj, { x: e.clientX, y: e.clientY }, props, 'hold');
        return;
      }

      // For other objects, use traditional drag system
      console.log('🔄 [MOUSE DOWN] Using traditional drag for non-slot object:', {
        objType: obj?.type,
        objName: obj?.name
      });

      // Set up drag threshold to distinguish clicks from drags
      dragThresholdRef.current = {
        initialX: e.clientX,
        initialY: e.clientY,
        targetId: objId,
        addedToSlot: false
      };

      // Calculate offset from object's top-left corner
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      dragOffsetRef.current = {
        x: clickX,
        y: clickY
      };

      setDraggingId(objId);
      console.log('✅ [MOUSE DOWN] Traditional drag operation initiated');
    }
  }, [
    state.objects,
    currentTool,
    rulerStart,
    setRulerStart,
    setIsRulerRightClick,
    isShiftPressed,
    activePlayerId,
    isGM,
    setDraggingId,
    setDeleteCandidateId,
    p2v,
    dragThresholdRef,
    dragOffsetRef,
    cursorSlot,
    cursorSlotSource,
    props
  ]);

  // Mouse move handler WITH LOGGING
  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    // Update cursor slot position
    if (cursorSlot.length > 0) {
      const newX = e.clientX;
      const newY = e.clientY;

      if (cursorPositionRef.current?.x !== newX || cursorPositionRef.current?.y !== newY) {
        console.log('🖱️ [MOUSE MOVE] Updating cursor slot position:', {
          oldX: cursorPositionRef.current?.x,
          oldY: cursorPositionRef.current?.y,
          newX,
          newY,
          slotSize: cursorSlot.length
        });

        setCursorPosition({ x: newX, y: newY });
        cursorPositionRef.current = { x: newX, y: newY };
      }
    }

    // Handle ruler tool
    if (currentTool === 'ruler' && rulerStart && (e.target as HTMLElement)?.closest('[data-tabletop="true"]')) {
      const rect = scrollContainerRef.current?.getBoundingClientRect();
      if (rect) {
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        setRulerCurrent({ x: p2v(currentX), y: p2v(currentY) });
      }
    }

    // Handle dragging objects
    if (draggingId && dragOffsetRef.current) {
      const obj = state.objects[draggingId];
      if (!obj) return;

      // Check if drag threshold has been exceeded
      const dragThreshold = 5; // pixels
      const deltaX = e.clientX - dragThresholdRef.current.initialX;
      const deltaY = e.clientY - dragThresholdRef.current.initialY;
      const hasExceededThreshold = Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold;

      if (!hasExceededThreshold && !dragThresholdRef.current.addedToSlot) {
        return; // Still in click threshold zone
      }

      dragThresholdRef.current.addedToSlot = true;

      const rect = scrollContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Calculate new position in virtual units
      const newX = p2v(e.clientX - rect.left - dragOffsetRef.current.x + (viewTransform?.scroll?.x || 0));
      const newY = p2v(e.clientY - rect.top - dragOffsetRef.current.y + (viewTransform?.scroll?.y || 0));

      // Update object position
      dispatch({
        type: 'UPDATE_OBJECT_POSITION',
        payload: {
          id: draggingId,
          x: newX,
          y: newY
        }
      });

      // Mark as dragging for remote players
      if (!obj.isDragging) {
        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: draggingId,
            isDragging: true,
            dragOwnerId: activePlayerId
          }
        });
      }
    }
  }, [
    cursorSlot.length,
    setCursorPosition,
    cursorPositionRef,
    currentTool,
    rulerStart,
    setRulerCurrent,
    draggingId,
    dragOffsetRef,
    dragThresholdRef,
    state.objects,
    scrollContainerRef,
    p2v,
    viewTransform,
    dispatch,
    activePlayerId
  ]);

  // Mouse up handler WITH LOGGING
  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    console.log('🖱️ [MOUSE UP] Event triggered:', {
      hasEvent: !!e,
      clientX: e?.clientX,
      clientY: e?.clientY,
      timestamp: new Date().toISOString()
    });

    // Handle ruler tool right-click release
    if (currentTool === 'ruler' && isRulerRightClick) {
      console.log('📏 [MOUSE UP] Ruler right-click released');
      setIsRulerRightClick(false);
    }

    // Handle dragging completion
    if (draggingId) {
      console.log('🔄 [MOUSE UP] Completing drag operation:', {
        draggingId,
        wasDragging: state.objects[draggingId]?.isDragging
      });

      const obj = state.objects[draggingId];
      if (obj && obj.isDragging) {
        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: draggingId,
            isDragging: false,
            dragOwnerId: null
          }
        });
        console.log('✅ [MOUSE UP] Drag state cleared');
      }

      // Reset drag threshold tracking
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false
      };

      dragOffsetRef.current = null;
      setDraggingId(null);
    }

    // Handle cursor slot dropping
    if (cursorSlot.length > 0 && e) {
      console.log('📦 [MOUSE UP] Dropping cursor slot items:', {
        slotSize: cursorSlot.length,
        clientX: e.clientX,
        clientY: e.clientY
      });

      dropCursorSlot(e.clientX, e.clientY, props);
    }
  }, [
    currentTool,
    isRulerRightClick,
    setIsRulerRightClick,
    draggingId,
    state.objects,
    dispatch,
    dragThresholdRef,
    dragOffsetRef,
    setDraggingId,
    cursorSlot,
    props
  ]);

  // Wheel handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Handle zoom with Ctrl/Cmd + scroll
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();

      const zoomSensitivity = 0.001;
      const delta = -e.deltaY * zoomSensitivity;
      const currentZoom = localSettings.zoom ?? 100;
      const newZoom = Math.max(25, Math.min(400, currentZoom + delta * 100));

      // Round to nearest 5%
      const roundedZoom = Math.round(newZoom / 5) * 5;

      if (roundedZoom !== currentZoom) {
        // Update localSettings
        updateSetting('zoom', roundedZoom);

        // Sync with ViewTransformContext (convert 25-400 to 0.25-4.0)
        if (setZoom) {
          const zoomFactor = roundedZoom / 100;
          setZoom(zoomFactor);
        }

        // Sync with ToolSettingsContext via custom event
        window.dispatchEvent(new CustomEvent('zoom-settings-changed', {
          detail: { level: roundedZoom }
        }));

        // Also update ToolSettingsContext directly if available
        if ((window as any).updateToolSettingsZoom) {
          (window as any).updateToolSettingsZoom(roundedZoom);
        }
      }
      return;
    }

    // Handle panning with scroll
    if (!e.ctrlKey && !e.metaKey && scrollContainerRef.current) {
      const container = scrollContainerRef.current;

      // Apply scroll constraints
      const scrollLeft = container.scrollLeft + e.deltaX;
      const scrollTop = container.scrollTop + e.deltaY;

      // Constrain to playable area
      const constrained = clampScrollToPlayableArea(
        scrollLeft,
        scrollTop,
        container.clientWidth,
        container.clientHeight,
        pixelsPerVU
      );

      container.scrollLeft = constrained.x;
      container.scrollTop = constrained.y;

      // Update view transform
      dispatch({
        type: 'UPDATE_VIEW_TRANSFORM',
        payload: {
          ...viewTransform,
          scroll: { x: constrained.x, y: constrained.y }
        }
      });
    }
  }, [
    localSettings.zoom,
    updateSetting,
    setZoom,
    scrollContainerRef,
    pixelsPerVU,
    viewTransform,
    dispatch
  ]);

  // Keyboard down handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      setIsShiftPressed(true);
    }
    if (e.key === 'Control' || e.key === 'Meta') {
      setIsCtrlPressed(true);
    }
  }, [setIsShiftPressed, setIsCtrlPressed]);

  // Keyboard up handler
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      setIsShiftPressed(false);
    }
    if (e.key === 'Control' || e.key === 'Meta') {
      setIsCtrlPressed(false);
    }
  }, [setIsShiftPressed, setIsCtrlPressed]);

  // Resize start handler
  const handleResizeStart = useCallback((e: React.MouseEvent, objId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const obj = state.objects[objId];
    if (obj) {
      setResizingId(objId);
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: obj.width,
        height: obj.height
      });
    }
  }, [state.objects, setResizingId, setResizeStart]);

  // Nexus board add cell handler
  const handleAddNexusCell = useCallback((objId: string, direction: string) => {
    // Simplified implementation
    setNexusBoardAddingCell(null);
    // Logic to add cell would go here
  }, [setNexusBoardAddingCell]);

  // Global click handler
  const handleGlobalClick = useCallback((e: MouseEvent) => {
    // Clear context menu on outside click
    const target = e.target as HTMLElement;
    if (!target.closest('.context-menu') && !target.closest('[data-prevent-close="true"]')) {
      setContextMenu(null);
      setPileContextMenu(null);
      setPilesButtonMenu(null);
    }

    // Clear ruler on outside click
    if (currentTool === 'ruler' && !target.closest('[data-tabletop="true"]')) {
      setRulerStart(null);
      setRulerCurrent(null);
    }
  }, [setContextMenu, setPileContextMenu, setPilesButtonMenu, currentTool, setRulerStart, setRulerCurrent]);

  // Global mouse up handler
  const handleGlobalMouseUp = useCallback((e: MouseEvent) => {
    // Handle mouse up anywhere (even outside tabletop)
    if (draggingId) {
      const obj = state.objects[draggingId];
      if (obj && obj.isDragging) {
        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: draggingId,
            isDragging: false,
            dragOwnerId: null
          }
        });
      }

      // Check if this was a click (not a drag)
      const deltaX = e.clientX - dragThresholdRef.current.initialX;
      const deltaY = e.clientY - dragThresholdRef.current.initialY;
      const dragThreshold = 5;
      const wasClick = Math.abs(deltaX) < dragThreshold && Math.abs(deltaY) < dragThreshold;

      if (wasClick && draggingId) {
        // This was a click, not a drag - could trigger click handlers
        const obj = state.objects[draggingId];
        if (obj && obj.onClick) {
          // Execute object's click handler
          obj.onClick(e, obj);
        }
      }

      // Reset drag state
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false
      };

      dragOffsetRef.current = null;
      setDraggingId(null);
    }
  }, [
    draggingId,
    state.objects,
    dispatch,
    dragThresholdRef,
    dragOffsetRef,
    setDraggingId
  ]);

  // Setup event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('contextmenu', handleGlobalClick);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('contextmenu', handleGlobalClick);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleKeyDown, handleKeyUp, handleGlobalClick, handleGlobalMouseUp]);

  return {
    handleContextMenu,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleResizeStart,
    handleAddNexusCell,
    handleGlobalClick,
    handleGlobalMouseUp,
  };
};