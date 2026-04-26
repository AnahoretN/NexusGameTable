import { useCallback, useEffect, useRef } from 'react';
import { TableObject, ItemType, Card as CardType, Token, TokenType, Deck as DeckType, Board as BoardType, CardOrientation, GridType, CardLocation, DiceObject } from '../../types';
import { clampScrollToPlayableArea } from '../../utils/viewportConstraints';
import {
  parseGridCellKey,
  calculateGridCellCenter,
  calculateGridDimensions,
  removeObjectFromGridCellMagnet,
  addObjectToGridCellMagnet,
  generateGridCellKey
} from '../../utils/gridUtils';

interface TabletopEventHandlersProps {
  state: any;
  dispatch: React.Dispatch<any>;
  cursorSlot: any[];
  setCursorSlot: React.Dispatch<React.SetStateAction<any[]>>;
  setCursorPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  cursorPositionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  setCursorSlotSource: React.Dispatch<React.SetStateAction<'hold' | 'shift' | 'archetype' | null>>;
  cursorSlotSource: 'hold' | 'shift' | 'archetype' | null;
  currentTool: string;
  setCurrentTool: React.Dispatch<React.SetStateAction<string>>;
  isShiftPressed: boolean;
  setIsShiftPressed: React.Dispatch<React.SetStateAction<boolean>>;
  isCtrlPressed: boolean;
  setIsCtrlPressed: React.Dispatch<React.SetStateAction<boolean>>;
  draggingId: string | null;
  draggingIdRef: React.MutableRefObject<string | null>;
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
  cursorSlotLastAddedRef: React.MutableRefObject<number>;
  unpinnedDuringDragRef: React.MutableRefObject<Map<string, { x: number; y: number }>>;
  setClickTooltip: React.Dispatch<React.SetStateAction<{ cardId: string; x: number; y: number } | null>>;
  setNexusBoardAddingCell: React.Dispatch<React.SetStateAction<string | null>>;
  setSettingsModalObj: React.Dispatch<React.SetStateAction<TableObject | null>>;
  setPileContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; pile: any; deck: any } | null>>;
  setSearchModalDeck: React.Dispatch<React.SetStateAction<any>>;
  setPilesButtonMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; deck: any } | null>>;
  setTopDeckModalDeck: React.Dispatch<React.SetStateAction<any>>;
  setZoom?: (zoom: number) => void; // Optional setZoom from ViewTransformContext
  setScroll?: (x: number, y: number) => void; // Optional setScroll from ViewTransformContext
}

// Helper function to add object to cursor slot WITH LOGGING
const addToCursorSlot = (
  id: string,
  item: TableObject,
  mousePosition: { x: number; y: number } | undefined,
  props: TabletopEventHandlersProps,
  source: 'hold' | 'shift' = 'hold'
) => {
  const {
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    setCursorSlotSource,
    cursorSlotLastAddedRef,
    unpinnedDuringDragRef,
    state,
    dispatch,
    scrollContainerRef,
    viewTransform,
    pixelsPerVU,
    p2v
  } = props;

  // IMPORTANT: Check if slot actually has items
  // Use cursorSlot.length first (React state), fallback to state.objects check
  // Objects in cursor slot have inCursorSlot: true (NOT isOnTable: false, which includes cards in hand!)

  // Check if cursor is over a token archetype button
  const elementUnderCursor = document.elementFromPoint(mousePosition?.x ?? 0, mousePosition?.y ?? 0);
  const archetypeButton = elementUnderCursor?.closest('[data-archetype-card]');
  if (archetypeButton) {
    return;
  }

  // Note: BOARD is never added to cursor slot via shift+click
  // CARD/TOKEN can coexist in slot, no special handling needed

  // Check cursorSlot for the 100 item limit
  if (cursorSlot.length >= 100) {
    return; // Max 100 items in slot
  }

  // Set source based on how the item was added (only if slot was empty before)
  if (cursorSlot.length === 0) {
    setCursorSlotSource(source);
  }

  // Check if item is snapped to a grid cell and unhook it
  const obj = state.objects[id];
  const gridCellKey = (obj as Token)?.gridCellKey || (obj as CardType)?.gridCellKey;
  if (obj && gridCellKey && (obj.type === ItemType.TOKEN || obj.type === ItemType.CARD)) {
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
  let itemClone: TableObject;

  if (item.type === ItemType.CARD) {
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
    itemClone = { ...item, x: 0, y: 0 }; // ❌ Сбрасываем координаты в слоте курсора
  }

  // Store metadata for cursor slot
  (itemClone as any).originalZIndex = item.zIndex ?? 0;
  (itemClone as any).source = source;
  (itemClone as any).cursorSlotIndex = cursorSlot.length;
  (itemClone as any).timestamp = Date.now();

  // Calculate and store click offset in SCREEN PIXELS (not virtual units!)
  // This ensures offset is consistent regardless of scroll position
  if (mousePosition && obj && scrollContainerRef.current) {
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const scrollX = viewTransform?.scroll?.x || 0;
    const scrollY = viewTransform?.scroll?.y || 0;

    // Get the ACTUAL DOM element position for comparison
    // Try multiple methods to find the object element
    let objElementRect: DOMRect | null = null;

    // Method 1: Try to find via closest from target element
    const targetElement = (mousePosition as any).target as HTMLElement;
    if (targetElement) {
      const objElement = targetElement.closest('[data-object-id]') as HTMLElement;
      if (objElement) {
        objElementRect = objElement.getBoundingClientRect();
      }
    }

    // Method 2: If closest didn't work, try querySelector with object ID
    if (!objElementRect) {
      const objElement = scrollContainerRef.current.querySelector(`[data-object-id="${obj.id}"]`) as HTMLElement;
      if (objElement) {
        objElementRect = objElement.getBoundingClientRect();
      }
    }

    // Calculate object's VISUAL position on screen (in pixels)
    // Objects are rendered with: left: v2p(obj.x) = obj.x * pixelsPerVU
    // where pixelsPerVU already includes zoomMultiplier
    // The visual position on screen is: rect.left + v2p(obj.x) - scrollX
    const objScreenX = rect.left + (obj.x * pixelsPerVU) - scrollX;
    const objScreenY = rect.top + (obj.y * pixelsPerVU) - scrollY;

    // Use ACTUAL DOM position if available, otherwise fall back to calculated
    let finalOffsetX_PX: number;
    let finalOffsetY_PX: number;

    if (objElementRect) {
      // Use actual DOM element position
      finalOffsetX_PX = mousePosition.x - objElementRect.left;
      finalOffsetY_PX = mousePosition.y - objElementRect.top;
    } else {
      // Fallback: use calculated position
      const offsetX_PX = mousePosition.x - objScreenX;
      const offsetY_PX = mousePosition.y - objScreenY;
      finalOffsetX_PX = offsetX_PX;
      finalOffsetY_PX = offsetY_PX;
    }

    // IMPORTANT: Calculate offset in VIRTUAL UNITS relative to object's game position
    // This ensures offset works correctly regardless of scroll position
    // Click position in virtual units (relative to game world origin)
    const clickX_VU = p2v(mousePosition.x - rect.left + scrollX);
    const clickY_VU = p2v(mousePosition.y - rect.top + scrollY);

    // Offset is the difference between click position and object position (both in VU)
    const clickOffsetX_VU = clickX_VU - obj.x;
    const clickOffsetY_VU = clickY_VU - obj.y;

    // Store offset in SCREEN PIXELS for CursorSlotVisualization (for visual rendering)
    (itemClone as any).clickOffsetX_PX = finalOffsetX_PX;
    (itemClone as any).clickOffsetY_PX = finalOffsetY_PX;

    // Store offset in VIRTUAL UNITS for drop position calculation (scroll-aware!)
    (itemClone as any).clickOffsetX = clickOffsetX_VU;
    (itemClone as any).clickOffsetY = clickOffsetY_VU;

    // Store original object position for drop calculation
    (itemClone as any).originalX = obj.x;
    (itemClone as any).originalY = obj.y;
  }

  // Update cursor position FIRST (before state update to ensure ref is set during render)
  if (mousePosition) {
    const pos = { x: mousePosition.x, y: mousePosition.y };
    cursorPositionRef.current = pos;
    setCursorPosition(pos);
  }

  // Add to cursor slot
  const newSlot = [...cursorSlot, itemClone as CardType | TokenType | BoardType | DeckType];

  setCursorSlot(newSlot);

  // Track when item was added to prevent immediate drop on mouse up
  cursorSlotLastAddedRef.current = Date.now();

  // Remove object from table temporarily (hide it while in slot)
  // If object is pinned, unpin it temporarily during drag
  if ((obj as any).isPinnedToViewport) {

    // Store the pinned state to restore later
    const pinnedPos = (obj as any).pinnedScreenPosition || { x: obj.x, y: obj.y };
    unpinnedDuringDragRef.current.set(id, pinnedPos);

    // Unpin the object
    dispatch({
      type: 'UNPIN_FROM_VIEWPORT',
      payload: {
        id: id,
        worldX: obj.x,
        worldY: obj.y
      }
    });
  }

  dispatch({
    type: 'UPDATE_OBJECT',
    payload: {
      id: id,
      updates: {
        inCursorSlot: true,
        isOnTable: false,
        // Move object far away to hide it while in slot
        x: -999999,
        y: -999999,
        // Store click offsets for proper drop positioning
        clickOffsetX_PX: (itemClone as any).clickOffsetX_PX,
        clickOffsetY_PX: (itemClone as any).clickOffsetY_PX,
        clickOffsetX: (itemClone as any).clickOffsetX,
        clickOffsetY: (itemClone as any).clickOffsetY,
        originalX: (itemClone as any).originalX,
        originalY: (itemClone as any).originalY
      }
    }
  });
};

// Helper function to drop cursor slot items WITH LOGGING
const dropCursorSlot = (
  clientX: number,
  clientY: number,
  props: TabletopEventHandlersProps
) => {
  const {
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    setCursorSlotSource,
    cursorSlotSource,
    unpinnedDuringDragRef,
    state,
    dispatch,
    scrollContainerRef,
    viewTransform,
    p2v
  } = props;

  if (cursorSlot.length === 0) {
    return;
  }

  // Use a local variable to track items to drop (can be modified below)
  let itemsToDrop = cursorSlot;

  // Notify that items were dropped from cursor slot
  const droppedIds = itemsToDrop.map(item => item.id);

  window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
    detail: { cardIds: droppedIds }
  }));

  // Check if cursor is over a token archetype card
  const elementAtCursor = document.elementFromPoint(clientX, clientY);
  const archetypeCard = elementAtCursor?.closest('[data-archetype-card]');

  if (archetypeCard) {
    return;
  }

  // Check if cursor is over hand panel - drop cards to hand instead of table
  const handPanel = elementAtCursor?.closest('[data-hand-panel="true"]');
  if (handPanel) {

    // Filter only CARDS, TOKENS and COUNTERS from cursor slot (allow all in hand panel)
    const items = itemsToDrop.filter(item => item.type === ItemType.CARD || item.type === ItemType.TOKEN || item.type === ItemType.COUNTER);
    const nonCardItems = itemsToDrop.filter(item => item.type !== ItemType.CARD && item.type !== ItemType.TOKEN && item.type !== ItemType.COUNTER);

    if (items.length > 0) {
      window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
        detail: { items }
      }));
    }

    // If there are non-card items, keep them in slot and drop them normally
    // Otherwise clear the slot
    if (nonCardItems.length > 0) {
      setCursorSlot(nonCardItems);
    } else {
      setCursorSlot([]);
      setCursorPosition(null);
      cursorPositionRef.current = null;
      setCursorSlotSource(null);
    }

    return;
  }

  // Check if cursor is over a deck - drop cards to deck instead of table
  const deckElement = elementAtCursor?.closest('[data-object-id]');
  if (deckElement) {
    const deckId = deckElement.getAttribute('data-object-id');
    const deckObj = deckId ? state.objects[deckId] : null;

    if (deckObj && deckObj.type === ItemType.DECK) {

      // Filter only cards from cursor slot
      const cards = itemsToDrop.filter(item => item.type === ItemType.CARD);

      if (cards.length > 0) {
        // Add cards to deck in reverse order (last in slot = first to be added = ends up on top)
        [...cards].reverse().forEach((item) => {
          dispatch({
            type: 'ADD_CARD_TO_TOP_OF_DECK',
            payload: { cardId: item.id, deckId }
          });
        });

        // Send cursor-left-deck event to remove highlight
        window.dispatchEvent(new CustomEvent('cursor-left-deck', {
          detail: { deckId }
        }));
      }

      // For non-card items (tokens), drop them on the table at deck position
      const nonCards = itemsToDrop.filter(item => item.type !== ItemType.CARD);
      if (nonCards.length > 0) {
        // These will be handled by the normal drop logic below
        // Update itemsToDrop to only include non-card items
        itemsToDrop = nonCards;
      } else {
        // Clear cursor slot after successful deck drop
        setCursorSlot([]);
        setCursorPosition(null);
        cursorPositionRef.current = null;
        setCursorSlotSource(null);

        return;
      }
    }
  }

  // Determine zIndex behavior based on source
  const itemSource = itemsToDrop.length > 0 ? (itemsToDrop[0] as any).source : null;
  const source = itemSource || cursorSlotSource;
  const useOriginalZIndex = source === 'hold' || source === 'archetype';

  // Calculate drop position
  const rect = scrollContainerRef.current?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  // p2v already uses pixelsPerVU which includes zoomMultiplier
  const baseX = p2v(clientX - rect.left + (viewTransform?.scroll?.x || 0));
  const baseY = p2v(clientY - rect.top + (viewTransform?.scroll?.y || 0));

  // Sort items by DESCENDING Z to match CursorSlotVisualization
  // This ensures items drop in the same visual order they appear in cursor slot
  // For archetype tokens with same Z, use cursorSlotIndex to preserve order
  const sortedItems = [...itemsToDrop].sort((a, b) => {
    const sortKeyA = (a as any).cursorSlotIndex ?? (a as any).originalZIndex ?? a.zIndex ?? 0;
    const sortKeyB = (b as any).cursorSlotIndex ?? (b as any).originalZIndex ?? b.zIndex ?? 0;
    return sortKeyB - sortKeyA; // Descending - higher index/Z first (front of stack)
  });

  // Find minimum zIndex for each hyperscale layer on the table
  // This allows dropped items to be placed below existing items while preserving their relative order
  const layerMinZIndex: Record<string, number> = {};
  for (const obj of Object.values(state.objects) as any[]) {
    const objData = obj as any;
    if (objData.isOnTable && !objData.inCursorSlot) {
      const layerId = obj.hyperscaleLayerId ?? 'default';
      const currentMin = layerMinZIndex[layerId] ?? Infinity;
      if ((obj.zIndex ?? 0) < currentMin) {
        layerMinZIndex[layerId] = obj.zIndex ?? 0;
      }
    }
  }

  // Drop all items from cursor slot
  sortedItems.forEach((item, sortedIndex) => {
    let finalX, finalY;

    // Get object dimensions for centering
    const objWidth = item.width ?? 50;
    const objHeight = item.height ?? 50;

    // Check if we have stored original position and click offset info
    if ((item as any).originalX !== undefined && (item as any).originalY !== undefined) {
      // Use the stored click offsets to calculate the final position
      // clickOffsetX/Y are in VU (virtual units) - this is the source of truth
      const clickOffsetX = (item as any).clickOffsetX;
      const clickOffsetY = (item as any).clickOffsetY;

      if (clickOffsetX !== undefined && clickOffsetY !== undefined) {
        // Calculate final position: dropPos - clickOffset
        // This places the object so the clicked point ends up at the drop position
        finalX = baseX - clickOffsetX;
        finalY = baseY - clickOffsetY;
      } else {
        // Fallback: center on drop position (for archetype tokens without clickOffset)
        finalX = baseX - objWidth / 2;
        finalY = baseY - objHeight / 2;
      }
    } else {
      // Fallback: center on drop position
      finalX = baseX - objWidth / 2;
      finalY = baseY - objHeight / 2;
    }

    // Apply stack offset - matches CursorSlotVisualization exactly
    // sortedIndex=0 (front/top) gets no offset, sortedIndex=1 gets offsetAmount, etc.
    if (sortedItems.length > 1) {
      const objWidth = item.width ?? 50;
      const objHeight = item.height ?? 50;
      const offsetAmount = Math.min(objWidth, objHeight) * 0.05; // 5% like in CursorSlotVisualization
      const offsetFromFront = sortedIndex; // 0 for front, increasing for items behind
      finalX += offsetFromFront * offsetAmount;
      finalY += offsetFromFront * offsetAmount;
    }

    // Check for board grid magnetism
    const isToken = item.type === ItemType.TOKEN;
    const isCard = item.type === ItemType.CARD;
    // Count tokens in cursor slot - if multiple tokens, drop as stack without magnetism
    const tokenCount = itemsToDrop.filter(i => i.type === ItemType.TOKEN).length;
    const shouldSnapToGrid = (isToken && tokenCount <= 1) || (isCard && item.snapToGrid);

    let finalZIndex = item.zIndex;
    if (!useOriginalZIndex) {
      // Use minimum zIndex of the hyperscale layer, preserving relative order from cursor slot
      // sortedIndex=0 (front) gets highest Z, sortedIndex=max (back) gets lowest Z
      const layerId = item.hyperscaleLayerId ?? 'default';
      const minZ = layerMinZIndex[layerId] ?? 0;
      // Offset by sortedIndex to preserve visual order: front items stay above back items
      finalZIndex = minZ - sortedIndex;
    }

    if (shouldSnapToGrid) {
      // Find board under drop position
      // Use object center for finding the grid cell (not cursor position!)
      const objWidth = item.width ?? 50;
      const objHeight = item.height ?? 50;
      // Calculate object center from final position (accounting for offset)
      const centerX = finalX + objWidth / 2;
      const centerY = finalY + objHeight / 2;

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
    // Change location from HAND to TABLE for cards
    const currentCard = isCard ? state.objects[item.id] as CardType : null;

    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: item.id,
        updates: {
          inCursorSlot: false,
          isOnTable: true,
          x: finalX,
          y: finalY,
          zIndex: finalZIndex,
          ...(isCard && currentCard?.location === CardLocation.HAND && {
            location: CardLocation.TABLE
          })
        }
      }
    });

    // If object was unpinned during drag, repin it at new position
    if (unpinnedDuringDragRef.current.has(item.id)) {

      const scrollX = viewTransform?.scroll?.x || 0;
      const scrollY = viewTransform?.scroll?.y || 0;

      dispatch({
        type: 'PIN_TO_VIEWPORT',
        payload: {
          id: item.id,
          screenX: finalX - scrollX,
          screenY: finalY - scrollY
        }
      });

      // Remove from tracking
      unpinnedDuringDragRef.current.delete(item.id);
    }
  });

  // Clear cursor slot
  setCursorSlot([]);
  setCursorPosition(null);
  cursorPositionRef.current = null;
  setCursorSlotSource(null);

};

export const useTabletopEventHandlers = (props: TabletopEventHandlersProps) => {
  const {
    state,
    dispatch,
    cursorSlot,
    setCursorSlot,
    setCursorPosition,
    setZoom,
    setScroll,
    cursorPositionRef,
    setCursorSlotSource,
    cursorSlotSource,
    currentTool,
    isShiftPressed,
    setIsShiftPressed,
    setIsCtrlPressed,
    draggingId,
    draggingIdRef,
    setDraggingId,
    setResizingId,
    setResizeStart,
    rulerStart,
    setRulerStart,
    setRulerCurrent,
    isRulerRightClick,
    setIsRulerRightClick,
    setContextMenu,
    setDeleteCandidateId,
    scrollContainerRef,
    viewTransform,
    pixelsPerVU,
    p2v,
    activePlayerId,
    isGM,
    localSettings,
    updateSetting,
    longPressTimerRef,
    clickTooltipTimerRef,
    dragThresholdRef,
    dragOffsetRef,
    cursorSlotLastAddedRef,
    unpinnedDuringDragRef,
    setNexusBoardAddingCell,
    setPileContextMenu,
    setPilesButtonMenu,
  } = props;

  // Track previous deck for cursor hover detection
  const previousDeckIdRef = useRef<string | null>(null);

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

  // Pile context menu handler
  const handlePileContextMenu = useCallback((e: React.MouseEvent, pile: any, deck: any) => {
    e.preventDefault();
    e.stopPropagation();
    setPileContextMenu({
      x: e.clientX,
      y: e.clientY,
      pile,
      deck
    });
  }, [setPileContextMenu]);

  // Mouse down handler WITH LOGGING
  const handleMouseDown = useCallback((e: React.MouseEvent, objId?: string) => {
    // Handle clicking on empty space (clear context menus, rulers, etc.)
    if (!objId) {
      // Clear ruler if active
      if (currentTool === 'ruler' && e.button === 0) {
        if (!rulerStart) {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const startX = e.clientX - rect.left;
          const startY = e.clientY - rect.top;
          setRulerStart({ x: p2v(startX), y: p2v(startY) });
        }
      }
      return;
    }

    const obj = state.objects[objId];
    if (!obj) {
      return;
    }

    // Check if object is locked or not owned by player
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    if (obj.locked && !isGM) {
      return;
    }
    if (!isOwner) {
      return;
    }

    // Handle different tools
    if (currentTool === 'marker') {
      // Marker tool logic would go here
      return;
    }

    if (currentTool === 'eraser') {
      if (isShiftPressed && isOwner) {
        setDeleteCandidateId(objId);
      }
      return;
    }

    // Handle right-click for ruler radius
    if (currentTool === 'ruler' && e.button === 2) {
      setIsRulerRightClick(true);
      return;
    }

    // Check if cursor slot has items
    // Use cursorSlot.length first (React state), fallback to state.objects check
    // Objects in cursor slot have inCursorSlot: true (NOT isOnTable: false, which includes cards in hand!)
    const slotHasItemsFromState = cursorSlot.length > 0;
    const objectsInCursorSlot = (Object.values(state.objects) as TableObject[]).filter(o =>
      (o.type === ItemType.CARD || o.type === ItemType.TOKEN || o.type === ItemType.COUNTER) &&
      (o as any).inCursorSlot === true
    );
    const actuallyHasItems = slotHasItemsFromState || objectsInCursorSlot.length > 0;

    // REGULAR CLICK (no shift): if slot has items, drop them
    if (!e.shiftKey && actuallyHasItems) {
      e.preventDefault();
      e.stopPropagation();
      dropCursorSlot(e.clientX, e.clientY, props);
      cursorSlotLastAddedRef.current = Date.now();
      return;
    }

    // SHIFT+CLICK: add to slot immediately (accumulate multiple items)
    // BOARD is excluded - never added to slot via shift+click
    if (e.shiftKey && obj && obj.type !== ItemType.BOARD && (
      obj.type === ItemType.CARD ||
      obj.type === ItemType.TOKEN ||
      obj.type === ItemType.COUNTER
    )) {
      e.preventDefault();
      e.stopPropagation();
      addToCursorSlot(objId, obj, { x: e.clientX, y: e.clientY }, props, 'shift');
      return;
    }

    // Handle left-click for dragging
    // IMPORTANT: Regular click (without Shift) does NOT add objects to cursor slot
    if (e.button === 0) {
      // Check if object is already in cursor slot
      const actuallyInSlot = cursorSlot.some(item => item.id === objId);
      if (actuallyInSlot) {
        e.stopPropagation();
        return;
      }

      // Check if this is a UI object (panel/window) - moves immediately without threshold
      const isUIObject = obj?.type === ItemType.PANEL || obj?.type === ItemType.WINDOW;

      if (isUIObject) {
        // UI objects use immediate drag (no cursor slot, no threshold)
        // Find the actual panel container by looking for data-ui-object attribute
        let rect = (e.target as HTMLElement).getBoundingClientRect();
        const panelContainer = (e.target as HTMLElement).closest('[data-ui-object]');
        if (panelContainer) {
          rect = panelContainer.getBoundingClientRect();
        }

        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        dragOffsetRef.current = { x: clickX, y: clickY };
        setDraggingId(objId);
        draggingIdRef.current = objId; // Set ref for immediate access in handleMouseMove

        // If object is pinned, unpin it temporarily during drag
        if ((obj as any).isPinnedToViewport) {

          // Store the pinned screen position to restore later
          const pinnedPos = (obj as any).pinnedScreenPosition || { x: obj.x, y: obj.y };
          unpinnedDuringDragRef.current.set(objId, pinnedPos);

          // Unpin the object (convert to world coordinates)
          dispatch({
            type: 'UNPIN_FROM_VIEWPORT',
            payload: {
              id: objId,
              worldX: obj.x,
              worldY: obj.y
            }
          });
        }

        return;
      }

      // For game objects (cards, tokens, boards, decks):
      // WITHOUT Shift: set up drag threshold for normal dragging (NOT cursor slot)
      // WITH Shift: objects are added to cursor slot above (no drag threshold needed)

      // Check if we just dropped an item (prevent immediate re-add)
      const timeSinceLastDrop = Date.now() - cursorSlotLastAddedRef.current;
      if (timeSinceLastDrop < 100) {
        return;
      }

      // Set up drag threshold to distinguish clicks from drags
      dragThresholdRef.current = {
        initialX: e.clientX,
        initialY: e.clientY,
        targetId: objId,
        addedToSlot: false
      };

      // Note: setDraggingId is NOT set here for game objects
      // It will be set only after drag threshold is exceeded in handleMouseMove
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

  // Double click handler - rolls dice
  const handleDoubleClick = useCallback((e: React.MouseEvent, obj: TableObject) => {
    if (!obj) return;

    // Check if object is locked or not owned by player
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    if (obj.locked && !isGM) {
      return;
    }
    if (!isOwner) {
      return;
    }

    // Only handle dice objects
    if (obj.type === ItemType.DICE_OBJECT) {
      e.stopPropagation();

      const dice = obj as DiceObject;

      // Check if dice belongs to a group
      if (dice.diceGroupId) {
        const group = state.diceGroups?.find(g => g.id === dice.diceGroupId);
        if (group) {
          // Roll all dice in the group
          group.diceIds.forEach(diceId => {
            const groupDice = state.objects[diceId];
            if (groupDice?.type === ItemType.DICE_OBJECT) {
              dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: diceId } });
            }
          });
        } else {
          // Group not found, roll single dice
          dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: obj.id } });
        }
      } else {
        // Single dice roll (not in a group)
        dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: obj.id } });
      }
    }
  }, [state.objects, state.diceGroups, activePlayerId, isGM, dispatch]);

  // RAF ref for throttling mouse move updates
  const rafRef = useRef<number>();

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Mouse move handler (throttled)
  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    // Update cursor slot position
    if (cursorSlot.length > 0) {
      const newX = e.clientX;
      const newY = e.clientY;

      if (cursorPositionRef.current?.x !== newX || cursorPositionRef.current?.y !== newY) {
        // Always update ref immediately for smooth dragging
        cursorPositionRef.current = { x: newX, y: newY };

        // Throttle state updates using RAF to prevent excessive re-renders
        if (rafRef.current === undefined) {
          rafRef.current = requestAnimationFrame(() => {
            setCursorPosition({ x: newX, y: newY });
            rafRef.current = undefined;

            // Dispatch events for HandPanel and MainMenu to detect hover
            const eventData = {
              x: newX,
              y: newY,
              isOverMainMenu: false,
              hasCards: cursorSlot.length > 0,
              items: cursorSlot.map(item => ({ type: item.type }))
            };

            // Event for HandPanel to detect hover
            window.dispatchEvent(new CustomEvent('cursor-slot-move', {
              detail: eventData
            }));

            // Event for MainMenu to switch to hand tab
            window.dispatchEvent(new CustomEvent('cursor-position-update', {
              detail: eventData
            }));

            // Check if cursor is over a deck for highlighting
            const elementAtCursor = document.elementFromPoint(newX, newY);
            const deckElement = elementAtCursor?.closest('[data-object-id]');

            if (deckElement) {
              const deckId = deckElement.getAttribute('data-object-id');
              const deckObj = deckId ? state.objects[deckId] : null;

              if (deckObj && deckObj.type === ItemType.DECK) {
                // Track previous deck to detect when cursor leaves
                const previousDeckId = previousDeckIdRef.current;

                if (previousDeckId && previousDeckId !== deckId) {
                  // Cursor left previous deck
                  window.dispatchEvent(new CustomEvent('cursor-left-deck', {
                    detail: { deckId: previousDeckId }
                  }));
                }

                // Dispatch event for DeckComponent to highlight
                window.dispatchEvent(new CustomEvent('cursor-over-deck', {
                  detail: { deckId }
                }));

                // Store current deck for next comparison
                previousDeckIdRef.current = deckId;
              }
            } else {
              // Cursor not over any deck, clear previous deck
              const previousDeckId = previousDeckIdRef.current;
              if (previousDeckId) {
                window.dispatchEvent(new CustomEvent('cursor-left-deck', {
                  detail: { deckId: previousDeckId }
                }));
              }
            }
          });
        }
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

    // Check drag threshold for game objects (even if not yet dragging)
    // DISABLED for Shift: Shift+click adds to slot, Shift+drag does NOT
    if (dragThresholdRef.current.targetId && !dragThresholdRef.current.addedToSlot && !isShiftPressed) {
      const targetId = dragThresholdRef.current.targetId;
      const obj = state.objects[targetId];

      if (obj) {
        // Convert 2 VU to pixels for threshold check
        const thresholdPixels = 2 * pixelsPerVU;
        const deltaX = e.clientX - dragThresholdRef.current.initialX;
        const deltaY = e.clientY - dragThresholdRef.current.initialY;
        const hasExceededThreshold = Math.abs(deltaX) > thresholdPixels || Math.abs(deltaY) > thresholdPixels;

        if (hasExceededThreshold) {
          // Mark as added to prevent duplicate adds
          dragThresholdRef.current.addedToSlot = true;

          // Add object to cursor slot (same as shift+click)
          addToCursorSlot(targetId, obj, { x: e.clientX, y: e.clientY }, props, 'hold');
        }
      }
    }

    // Handle dragging objects
    const currentDraggingId = draggingIdRef.current || draggingId;

    if (currentDraggingId && dragOffsetRef.current) {
      const obj = state.objects[currentDraggingId];
      if (!obj) return;

      // Check if this is a UI object (panel/window) - use screen coordinates
      const isUIObject = obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW;

      if (isUIObject) {
        // UI objects move immediately without threshold - smooth drag
        const newX = e.clientX - dragOffsetRef.current.x;
        const newY = e.clientY - dragOffsetRef.current.y;

        // Update only uiObject position during drag (playerPanelSettings updated on mouseUp)
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: currentDraggingId,
            updates: {
              x: newX,
              y: newY
            }
          },
          _localOnly: true  // Critical: ensures x,y are updated (not filtered by reducer)
        });
      } else {
        // For game objects, use virtual units
        const rect = scrollContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // p2v already uses pixelsPerVU which includes zoomMultiplier
        const newX = p2v(e.clientX - rect.left - dragOffsetRef.current.x + (viewTransform?.scroll?.x || 0));
        const newY = p2v(e.clientY - rect.top - dragOffsetRef.current.y + (viewTransform?.scroll?.y || 0));

        // Update object position
        dispatch({
          type: 'UPDATE_OBJECT_POSITION',
          payload: {
            id: currentDraggingId,
            x: newX,
            y: newY
          }
        });
      }

      // Mark as dragging for remote players
      if (!obj.isDragging) {
        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: currentDraggingId,
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
    pixelsPerVU,
    viewTransform,
    dispatch,
    activePlayerId
  ]);

  // Mouse up handler WITH LOGGING
  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Handle ruler tool right-click release
    if (currentTool === 'ruler' && isRulerRightClick) {
      setIsRulerRightClick(false);
    }

    // Handle dragging completion
    const currentDraggingId = draggingIdRef.current || draggingId;
    if (currentDraggingId) {
      const obj = state.objects[currentDraggingId];
      if (obj && obj.isDragging) {
        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: currentDraggingId,
            isDragging: false,
            dragOwnerId: null
          }
        });
      }

      // For UI objects, update playerPanelSettings to sync position
      if (obj && (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW)) {
        dispatch({
          type: 'UPDATE_PLAYER_PANEL_SETTINGS',
          payload: {
            playerId: activePlayerId,
            panelId: currentDraggingId,
            settings: {
              x: obj.x,
              y: obj.y
            }
          }
        });

        // If object was unpinned during drag, repin it
        if (unpinnedDuringDragRef.current.has(currentDraggingId)) {

          const scrollX = viewTransform?.scroll?.x || 0;
          const scrollY = viewTransform?.scroll?.y || 0;

          dispatch({
            type: 'PIN_TO_VIEWPORT',
            payload: {
              id: currentDraggingId,
              screenX: obj.x - scrollX,
              screenY: obj.y - scrollY
            }
          });

          // Remove from tracking
          unpinnedDuringDragRef.current.delete(currentDraggingId);
        }
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
      draggingIdRef.current = null;
    } else if (dragThresholdRef.current.targetId) {
      // No drag occurred (threshold not exceeded) - this was a click
      // IMPORTANT: If item was added to slot via drag threshold, this is NOT a click!
      const wasAddedToSlot = dragThresholdRef.current.addedToSlot;
      const wasClickNotDrag = !wasAddedToSlot;
      const hadCursorSlot = cursorSlot.length > 0;

      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false
      };

      // Only drop cursor slot if this was truly a click (not drag threshold exceeded)
      // IMPORTANT: Don't drop if Shift is held - user wants to keep item in slot
      const isShiftHeld = e?.shiftKey === true;

      if (wasClickNotDrag && hadCursorSlot && e && !isShiftHeld) {
        dropCursorSlot(e.clientX, e.clientY, props);
        cursorSlotLastAddedRef.current = Date.now();

        // Don't continue to the normal drop logic below
        return;
      }
    }

    // Handle cursor slot dropping
    // Drop if: slot has items AND there's a mouse event AND Shift is NOT held
    // dropCursorSlot will handle the logic for hand panel, deck, or table
    const isShiftHeld = e?.shiftKey === true;

    const shouldDropOnMouseUp = cursorSlot.length > 0 && e && !isShiftHeld;

    if (shouldDropOnMouseUp) {
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
    cursorSlotLastAddedRef,
    setDraggingId,
    cursorSlot,
    cursorSlotSource,
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

      // Update scroll position in view transform context
      setScroll?.(constrained.x, constrained.y);

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
    setScroll,
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
  const handleAddNexusCell = useCallback((_objId: string, _direction: string) => {
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

  // Handle cursor-slot-drop-to-tabletop event from pool panels
  useEffect(() => {
    const handleDropFromPool = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number; y: number }>;

      // Only drop if we have items in cursor slot
      if (cursorSlot.length > 0) {
        dropCursorSlot(customEvent.detail.x, customEvent.detail.y, props);
      }
    };

    window.addEventListener('cursor-slot-drop-to-tabletop', handleDropFromPool);
    return () => {
      window.removeEventListener('cursor-slot-drop-to-tabletop', handleDropFromPool);
    };
  }, [cursorSlot, props]);

  // Setup event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('contextmenu', handleGlobalClick);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('contextmenu', handleGlobalClick);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleKeyDown, handleKeyUp, handleGlobalClick, handleGlobalMouseUp, handleMouseMove]);

  return {
    handleContextMenu,
    handlePileContextMenu,
    handleMouseDown,
    handleDoubleClick,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleResizeStart,
    handleAddNexusCell,
    handleGlobalClick,
    handleGlobalMouseUp,
  };
};