import { useCallback, useEffect, useRef } from 'react';
import { TableObject, ItemType, Card as CardType, Token, TokenType, Deck as DeckType, Board as BoardType, CardOrientation, GridType, CardLocation } from '../../types';
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
    cursorSlotLastAddedRef,
    state,
    dispatch,
    activePlayerId,
    scrollContainerRef,
    viewTransform,
    pixelsPerVU,
    p2v
  } = props;

  console.log('🔍 [CURSOR SLOT] Current slot state:', {
    slotLength: cursorSlot.length,
    maxItems: 100
  });

  // IMPORTANT: Check if slot actually has items
  // Use cursorSlot.length first (React state), fallback to state.objects check
  // Objects in cursor slot have inCursorSlot: true (NOT isOnTable: false, which includes cards in hand!)
  const slotHasItemsFromState = cursorSlot.length > 0;
  const objectsInCursorSlot = Object.values(state.objects).filter(o =>
    (o.type === ItemType.CARD || o.type === ItemType.TOKEN || o.type === ItemType.COUNTER) &&
    (o as any).inCursorSlot === true
  );
  const actuallyHasItems = slotHasItemsFromState || objectsInCursorSlot.length > 0;

  console.log('🔍 [CURSOR SLOT] Actual slot state from state.objects:', {
    cursorSlotLength: cursorSlot.length,
    inCursorSlotCount: objectsInCursorSlot.length,
    actuallyHasItems
  });

  // Check if cursor is over a token archetype button
  const elementUnderCursor = document.elementFromPoint(mousePosition?.x ?? 0, mousePosition?.y ?? 0);
  const archetypeButton = elementUnderCursor?.closest('[data-archetype-card]');
  if (archetypeButton) {
    console.log('❌ [CURSOR SLOT] Blocked: cursor over archetype button');
    return;
  }

  // Note: BOARD is never added to cursor slot via shift+click
  // CARD/TOKEN can coexist in slot, no special handling needed

  // Check cursorSlot for the 100 item limit
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

    console.log('🎯 [CURSOR SLOT] CLICK OFFSET DEBUG:', {
      objId: item.id,
      objType: item.type,
      objPosition_VU: { x: obj.x, y: obj.y },
      objRotation: obj.rotation || 0,
      // Calculated position
      calculatedObjScreenPos: { x: objScreenX, y: objScreenY },
      // Actual DOM position (if available)
      actualDOMRect: objElementRect ? {
        left: objElementRect.left,
        top: objElementRect.top,
        width: objElementRect.width,
        height: objElementRect.height
      } : 'NOT_FOUND',
      domVsCalculated: objElementRect ? {
        diffX: objElementRect.left - objScreenX,
        diffY: objElementRect.top - objScreenY
      } : null,
      // Mouse position
      mouseScreenPos: { x: mousePosition.x, y: mousePosition.y },
      // Check if mousePosition matches event.clientX/Y
      mousePositionMatchesEvent: (mousePosition as any).clientX !== undefined && mousePosition.x === (mousePosition as any).clientX,
      // Context
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      scroll: { x: scrollX, y: scrollY },
      pixelsPerVU,
      searchMethod: objElementRect ? 'querySelector' : 'none',
      // Additional debug info
      containerChildren: scrollContainerRef.current?.children.length,
      dataObjectElements: scrollContainerRef.current?.querySelectorAll('[data-object-id]').length
    });

    // Use ACTUAL DOM position if available, otherwise fall back to calculated
    let finalOffsetX_PX: number;
    let finalOffsetY_PX: number;

    if (objElementRect) {
      // Use actual DOM element position
      finalOffsetX_PX = mousePosition.x - objElementRect.left;
      finalOffsetY_PX = mousePosition.y - objElementRect.top;
      console.log('✅ [CURSOR SLOT] Using ACTUAL DOM offset:', {
        x: finalOffsetX_PX,
        y: finalOffsetY_PX,
        objLeft: objElementRect.left,
        objTop: objElementRect.top,
        mouseX: mousePosition.x,
        mouseY: mousePosition.y
      });
    } else {
      // Fallback: use calculated position
      const offsetX_PX = mousePosition.x - objScreenX;
      const offsetY_PX = mousePosition.y - objScreenY;
      finalOffsetX_PX = offsetX_PX;
      finalOffsetY_PX = offsetY_PX;
      console.warn('⚠️ [CURSOR SLOT] Using CALCULATED offset (DOM element not found):', {
        x: finalOffsetX_PX,
        y: finalOffsetY_PX,
        objId: obj.id
      });
    }

    // IMPORTANT: Calculate offset in VIRTUAL UNITS relative to object's game position
    // This ensures offset works correctly regardless of scroll position
    // Click position in virtual units (relative to game world origin)
    const clickX_VU = p2v(mousePosition.x - rect.left + scrollX);
    const clickY_VU = p2v(mousePosition.y - rect.top + scrollY);

    // Offset is the difference between click position and object position (both in VU)
    const clickOffsetX_VU = clickX_VU - obj.x;
    const clickOffsetY_VU = clickY_VU - obj.y;

    console.log('🧮 [CURSOR SLOT] Calculated VU offset (scroll-aware):', {
      clickX_VU,
      clickY_VU,
      objX: obj.x,
      objY: obj.y,
      clickOffsetX_VU,
      clickOffsetY_VU,
      scrollX,
      scrollY,
      pixelsPerVU
    });

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

  console.log('✨ [CURSOR SLOT] Clone created:', {
    cloneId: itemClone.id,
    cloneType: itemClone.type,
    slotIndex: (itemClone as any).cursorSlotIndex
  });

  // Update cursor position FIRST (before state update to ensure ref is set during render)
  if (mousePosition) {
    const pos = { x: mousePosition.x, y: mousePosition.y };
    console.log('🖱️ [CURSOR SLOT] Setting cursor position BEFORE state update:', pos);
    cursorPositionRef.current = pos;
    setCursorPosition(pos);

    // Verify ref was set correctly
    console.log('✅ [CURSOR SLOT] Verified cursorPositionRef.current after set:', {
      refValue: cursorPositionRef.current,
      matches: cursorPositionRef.current === pos
    });
  } else {
    console.warn('⚠️ [CURSOR SLOT] No mousePosition provided to addToCursorSlot!');
  }

  // Add to cursor slot
  const newSlot = [...cursorSlot, itemClone as CardType | TokenType | BoardType | DeckType];
  console.log('➕ [CURSOR SLOT] Adding to slot:', {
    oldLength: cursorSlot.length,
    newLength: newSlot.length,
    addedItem: itemClone.id,
    storedOriginalPosition: { x: (itemClone as any).x, y: (itemClone as any).y }
  });

  setCursorSlot(newSlot);

  // Track when item was added to prevent immediate drop on mouse up
  cursorSlotLastAddedRef.current = Date.now();

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
    p2v,
    pixelsPerVU
  } = props;

  console.log('🔍 [CURSOR SLOT] Current slot state before drop:', {
    slotLength: cursorSlot.length,
    items: cursorSlot.map(item => ({ id: item.id, type: item.type }))
  });

  if (cursorSlot.length === 0) {
    console.log('❌ [CURSOR SLOT] Slot is empty, nothing to drop');
    return;
  }

  // Use a local variable to track items to drop (can be modified below)
  let itemsToDrop = cursorSlot;

  // Notify that items were dropped from cursor slot
  const droppedIds = itemsToDrop.map(item => item.id);
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

  // Check if cursor is over hand panel - drop cards to hand instead of table
  const handPanel = elementAtCursor?.closest('[data-hand-panel="true"]');
  if (handPanel) {
    console.log('✅ [CURSOR SLOT] Dropping items to hand panel');

    // Filter only CARDS, TOKENS and COUNTERS from cursor slot (allow all in hand panel)
    const items = itemsToDrop.filter(item => item.type === ItemType.CARD || item.type === ItemType.TOKEN || item.type === ItemType.COUNTER);
    const nonCardItems = itemsToDrop.filter(item => item.type !== ItemType.CARD && item.type !== ItemType.TOKEN && item.type !== ItemType.COUNTER);

    console.log('🔍 [CURSOR SLOT] Filtered items:', {
      total: itemsToDrop.length,
      cardsAndTokens: items.length,
      otherItems: nonCardItems.length,
      otherItemTypes: nonCardItems.map(i => i.type)
    });

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
      console.log('✅ [CURSOR SLOT] Dropping cards to deck:', deckId);

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

  // p2v already uses pixelsPerVU which includes zoomMultiplier
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
  itemsToDrop.forEach((item, index) => {
    let finalX, finalY;

    // Check if we have stored original position and click offset info
    if ((item as any).originalX !== undefined && (item as any).originalY !== undefined) {
      // Calculate offset from original position to current cursor position
      // This maintains the same offset as when the object was picked up
      const originalX = (item as any).originalX;
      const originalY = (item as any).originalY;

      // The offset is the difference between the drop position and the original position
      // We want to maintain the same offset from cursor to object as when picked up
      const deltaX_VU = baseX - originalX;
      const deltaY_VU = baseY - originalY;

      // Use the stored click offsets to calculate the final position
      // clickOffsetX/Y are in VU (virtual units) - these are the source of truth
      // clickOffsetX_PX/Y_PX are in screen pixels - only used for CursorSlotVisualization
      const clickOffsetX = (item as any).clickOffsetX;
      const clickOffsetY = (item as any).clickOffsetY;

      if (clickOffsetX !== undefined && clickOffsetY !== undefined) {
        // Calculate final position: dropPos - clickOffset
        // This places the object so the clicked point ends up at the drop position
        finalX = baseX - clickOffsetX;
        finalY = baseY - clickOffsetY;

        console.log('🎯 [CURSOR SLOT] Calculated final position with VU offset:', {
          itemId: item.id,
          finalPosition: { x: finalX, y: finalY },
          originalPosition: { x: originalX, y: originalY },
          dropPosition: { x: baseX, y: baseY },
          clickOffsetX,
          clickOffsetY,
          clickOffsetX_PX: (item as any).clickOffsetX_PX,
          clickOffsetY_PX: (item as any).clickOffsetY_PX,
          calculation: `dropPos(${baseX.toFixed(2)}, ${baseY.toFixed(2)}) - offset(${clickOffsetX.toFixed(2)}, ${clickOffsetY.toFixed(2)})`
        });
      } else {
        // Fallback: use simple delta from original position
        finalX = baseX;
        finalY = baseY;

        console.log('⚠️ [CURSOR SLOT] Using drop position directly (no VU offset):', {
          itemId: item.id,
          dropPosition: { x: finalX, y: finalY }
        });
      }
    } else {
      // Fallback: use simple offset if no original position stored
      const offsetX = index * 20;
      const offsetY = index * 20;
      finalX = baseX + offsetX;
      finalY = baseY + offsetY;

      console.log('⚠️ [CURSOR SLOT] No original position, using simple offset:', {
        itemId: item.id,
        simpleOffset: { x: offsetX, y: offsetY }
      });
    }

    // Apply stack offset for multiple items
    if (itemsToDrop.length > 1) {
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
    setScroll,
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
    draggingIdRef,
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
    cursorSlotLastAddedRef,
    setClickTooltip,
    setNexusBoardAddingCell,
    setSettingsModalObj,
    setPileContextMenu,
    setSearchModalDeck,
    setPilesButtonMenu,
    setTopDeckModalDeck,
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

    // SHIFT+CLICK only works for CARD, TOKEN and COUNTER - BOARD is excluded
    const isShiftClickOnMovableObject = e.shiftKey && obj && (
      obj.type === ItemType.CARD ||
      obj.type === ItemType.TOKEN ||
      obj.type === ItemType.COUNTER
    );

    // Check if cursor slot has items
    // Use cursorSlot.length first (React state), fallback to state.objects check
    // Objects in cursor slot have inCursorSlot: true (NOT isOnTable: false, which includes cards in hand!)
    const slotHasItemsFromState = cursorSlot.length > 0;
    const objectsInCursorSlot = Object.values(state.objects).filter(o =>
      (o.type === ItemType.CARD || o.type === ItemType.TOKEN || o.type === ItemType.COUNTER) &&
      (o as any).inCursorSlot === true
    );
    const actuallyHasItems = slotHasItemsFromState || objectsInCursorSlot.length > 0;

    // REGULAR CLICK (no shift): if slot has items, drop them
    // This prevents swap behavior
    if (!e.shiftKey && actuallyHasItems) {
      console.log('📦 [MOUSE DOWN] Simple click with slot occupied - dropping all items:', {
        cursorSlotLength: cursorSlot.length,
        inCursorSlotCount: objectsInCursorSlot.length,
        clickedObjectId: objId
      });
      e.preventDefault();
      e.stopPropagation();
      dropCursorSlot(e.clientX, e.clientY, props);
      cursorSlotLastAddedRef.current = Date.now();
      return;
    }

    // SHIFT+CLICK on CARD/TOKEN: add to cursor slot
    // Multiple items can coexist in slot
    // BOARD is never added to slot via shift+click
    if (isShiftClickOnMovableObject) {
      console.log('🎯 [SHIFT+CLICK] Adding to cursor slot:', {
        objId,
        type: obj.type,
        name: obj.name,
        cursorSlotLength: cursorSlot.length,
        inCursorSlotCount: objectsInCursorSlot.length
      });
      e.preventDefault();
      e.stopPropagation();
      addToCursorSlot(objId, obj, { x: e.clientX, y: e.clientY }, props, 'shift');
      return;
    }

    // Handle left-click for dragging
    // IMPORTANT: Regular click (without Shift) does NOT add objects to cursor slot
    if (e.button === 0) {
      console.log('🖱️ [MOUSE DOWN] Left click on object:', {
        objId,
        type: obj?.type,
        name: obj?.name,
        shiftKey: e.shiftKey
      });

      // Check if object is already in cursor slot
      const actuallyInSlot = cursorSlot.some(item => item.id === objId);
      if (actuallyInSlot) {
        console.log('⚠️ [MOUSE DOWN] Object already in slot, ignoring');
        e.stopPropagation();
        return;
      }

      // Check if this is a UI object (panel/window) - moves immediately without threshold
      const isUIObject = obj?.type === ItemType.PANEL || obj?.type === ItemType.WINDOW;

      if (isUIObject) {
        // UI objects use immediate drag (no cursor slot, no threshold)
        console.log('🪟 [MOUSE DOWN] Using immediate drag for UI object:', {
          objId,
          type: obj.type
        });

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
        return;
      }

      // For game objects (cards, tokens, boards, decks):
      // WITHOUT Shift: set up drag threshold for normal dragging (NOT cursor slot)
      // WITH Shift: objects are added to cursor slot above (no drag threshold needed)

      // Check if we just dropped an item (prevent immediate re-add)
      const timeSinceLastDrop = Date.now() - cursorSlotLastAddedRef.current;
      if (timeSinceLastDrop < 100) {
        console.log('⏸️ [MOUSE DOWN] Skipping drag threshold (just dropped):', {
          timeSinceLastDrop
        });
        return;
      }

      console.log('🎯 [MOUSE DOWN] Setting up drag threshold (2 VU) for game object:', {
        objId,
        type: obj?.type,
        name: obj?.name
      });

      // Set up drag threshold to distinguish clicks from drags
      dragThresholdRef.current = {
        initialX: e.clientX,
        initialY: e.clientY,
        targetId: objId,
        addedToSlot: false
      };

      // Note: setDraggingId is NOT set here for game objects
      // It will be set only after drag threshold is exceeded in handleMouseMove
      console.log('✅ [MOUSE DOWN] Drag threshold initiated, waiting for 2 VU movement');
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
    if (dragThresholdRef.current.targetId && !dragThresholdRef.current.addedToSlot) {
      const targetId = dragThresholdRef.current.targetId;
      const obj = state.objects[targetId];

      if (obj) {
        // Convert 2 VU to pixels for threshold check
        const thresholdPixels = 2 * pixelsPerVU;
        const deltaX = e.clientX - dragThresholdRef.current.initialX;
        const deltaY = e.clientY - dragThresholdRef.current.initialY;
        const hasExceededThreshold = Math.abs(deltaX) > thresholdPixels || Math.abs(deltaY) > thresholdPixels;

        if (hasExceededThreshold) {
          console.log('🎯 [MOUSE MOVE] Drag threshold exceeded (2 VU), adding to cursor slot:', {
            targetId,
            deltaX,
            deltaY,
            thresholdPixels
          });

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
    const currentDraggingId = draggingIdRef.current || draggingId;
    if (currentDraggingId) {
      console.log('🔄 [MOUSE UP] Completing drag operation:', {
        draggingId: currentDraggingId,
        wasDragging: state.objects[currentDraggingId]?.isDragging
      });

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
        console.log('✅ [MOUSE UP] Drag state cleared');
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

      console.log('🖱️ [MOUSE UP] Click detected (threshold not exceeded), resetting drag threshold:', {
        targetId: dragThresholdRef.current.targetId,
        addedToSlot: dragThresholdRef.current.addedToSlot,
        cursorSlotLength: cursorSlot.length,
        wasClickNotDrag
      });

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
        console.log('📦 [MOUSE UP] Dropping cursor slot on click (Shift not held):', {
          slotSize: cursorSlot.length,
          clientX: e.clientX,
          clientY: e.clientY,
          source: cursorSlotSource,
          isShiftHeld
        });

        dropCursorSlot(e.clientX, e.clientY, props);
        cursorSlotLastAddedRef.current = Date.now();

        // Don't continue to the normal drop logic below
        return;
      }

      if (wasClickNotDrag && hadCursorSlot && e && isShiftHeld) {
        console.log('⏸️ [MOUSE UP] Keeping item in slot (Shift held):', {
          slotSize: cursorSlot.length,
          isShiftHeld
        });
      }
    }

    // Handle cursor slot dropping
    // Drop if: slot has items AND there's a mouse event AND Shift is NOT held
    // dropCursorSlot will handle the logic for hand panel, deck, or table
    const isShiftHeld = e?.shiftKey === true;

    // Debug logging
    if (cursorSlot.length > 0) {
      console.log('🔍 [MOUSE UP] Cursor slot check:', {
        slotSize: cursorSlot.length,
        hasEvent: !!e,
        eventClientX: e?.clientX,
        eventClientY: e?.clientY,
        cursorSlotSource,
        isShiftHeld,
        shouldDrop: cursorSlot.length > 0 && e && !isShiftHeld
      });
    }

    const shouldDropOnMouseUp = cursorSlot.length > 0 && e && !isShiftHeld;

    if (shouldDropOnMouseUp) {
      console.log('📦 [MOUSE UP] Dropping cursor slot items:', {
        slotSize: cursorSlot.length,
        clientX: e.clientX,
        clientY: e.clientY,
        source: cursorSlotSource
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

  // Handle cursor-slot-drop-to-tabletop event from pool panels
  useEffect(() => {
    const handleDropFromPool = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number; y: number }>;
      console.log('🎯 [TABLETOP] Received cursor-slot-drop-to-tabletop event:', customEvent.detail);

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
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleResizeStart,
    handleAddNexusCell,
    handleGlobalClick,
    handleGlobalMouseUp,
  };
};