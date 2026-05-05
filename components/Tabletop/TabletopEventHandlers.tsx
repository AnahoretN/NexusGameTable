import { useCallback, useEffect, useRef } from 'react';
import { TableObject, ItemType, Card as CardType, Token, TokenType, Deck as DeckType, Board as BoardType, CardOrientation, GridType, CardLocation, EffectTemplate } from '../../types';
import { clampScrollToPlayableArea } from '../../utils/viewportConstraints';
import { useIsSettingsModalOpen } from '../../store/contexts';
import {
  parseGridCellKey,
  calculateGridCellCenter,
  calculateGridDimensions,
  removeObjectFromGridCellMagnet,
  addObjectToGridCellMagnet,
  generateGridCellKey
} from '../../utils/gridUtils';
import {
  applyClickOffset,
  calculateStackOffset
} from '../../utils/dragDropUtils';
import {
  allocateZIndexWithDefrag
} from '../../utils/zIndexAllocator';

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
  isShiftPressed: boolean;
  setIsShiftPressed: React.Dispatch<React.SetStateAction<boolean>>;
  isCtrlPressed: boolean;
  setIsCtrlPressed: React.Dispatch<React.SetStateAction<boolean>>;
  draggingId: string | null;
  draggingIdRef: React.MutableRefObject<string | null>;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  resizingId: string | null;
  setResizingId: React.Dispatch<React.SetStateAction<string | null>>;
  resizeStart: { x: number; y: number; width: number; height: number } | null;
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
  liveResizeSizeRef: React.MutableRefObject<{ width: number; height: number } | null>;
  setLiveResizeSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;
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

  // Check if item is locked - locked objects can't be added to cursor slot
  const obj = state.objects[id];
  if (obj.locked) {
    return; // Locked objects can't be picked up
  }

  // Set source based on how the item was added (only if slot was empty before)
  if (cursorSlot.length === 0) {
    setCursorSlotSource(source);
  }
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
  } else if (item.type === ItemType.EFFECT_TEMPLATE) {
    const effect = item as EffectTemplate;
    itemClone = {
      id: effect.id,
      type: ItemType.EFFECT_TEMPLATE,
      name: effect.name,
      content: effect.content,
      width: effect.width ?? 100,  // Default to 100 if undefined
      height: effect.height ?? 100,  // Default to 100 if undefined
      pivot: effect.pivot,
      rotation: effect.rotation || 0,
      rotationMarkerDistance: effect.rotationMarkerDistance,
      opacity: effect.opacity,
      locked: effect.locked,
      x: 0,  // ❌ Сбрасываем координаты в слоте курсора
      y: 0,
      zIndex: effect.zIndex ?? 0,
      hyperscaleLayerId: effect.hyperscaleLayerId ?? 'boards',
    } as EffectTemplate;
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

    // Calculate object's VISUAL position on screen (in pixels)
    // Objects are rendered with: left: v2p(obj.x) = obj.x * pixelsPerVU
    // where pixelsPerVU already includes zoomMultiplier
    // The visual position on screen is: rect.left + v2p(obj.x) - scrollX
    const objScreenX = rect.left + (obj.x * pixelsPerVU) - scrollX;
    const objScreenY = rect.top + (obj.y * pixelsPerVU) - scrollY;

    // Calculate click offset in SCREEN PIXELS
    // Use calculated objScreenX/objScreenY for all objects (including rotated Effect Templates)
    // This ensures the offset is relative to the container's position (obj.x/obj.y)
    const finalOffsetX_PX = mousePosition.x - objScreenX;
    const finalOffsetY_PX = mousePosition.y - objScreenY;

    // IMPORTANT: Calculate offset in VIRTUAL UNITS relative to object's game position
    // This ensures offset works correctly regardless of scroll position
    // Click position in virtual units (relative to game world origin)
    const clickX_VU = p2v(mousePosition.x - rect.left + scrollX);
    const clickY_VU = p2v(mousePosition.y - rect.top + scrollY);

    // For pinned objects, obj.x/y don't represent the actual world position
    // Use the pixel offset converted to VU instead
    const isPinned = (obj as any).isPinnedToViewport;
    let clickOffsetX_VU: number;
    let clickOffsetY_VU: number;

    if (isPinned) {
      // For pinned objects, convert the pixel offset to VU
      // This is the only reliable way since pinned objects use screen coordinates
      clickOffsetX_VU = finalOffsetX_PX / pixelsPerVU;
      clickOffsetY_VU = finalOffsetY_PX / pixelsPerVU;
    } else {
      // For all other objects (including rotated Effect Templates), use the standard calculation
      // This works because finalOffsetX_PX is calculated from objScreenX (container position)
      clickOffsetX_VU = clickX_VU - obj.x;
      clickOffsetY_VU = clickY_VU - obj.y;
    }

    // Store offset in SCREEN PIXELS for CursorSlotVisualization (for visual rendering)
    (itemClone as any).clickOffsetX_PX = finalOffsetX_PX;
    (itemClone as any).clickOffsetY_PX = finalOffsetY_PX;

    // Store offset in VIRTUAL UNITS for drop position calculation (scroll-aware!)
    (itemClone as any).clickOffsetX = clickOffsetX_VU;
    (itemClone as any).clickOffsetY = clickOffsetY_VU;

    // Store source zoom level for accurate coordinate conversion between panels
    (itemClone as any).sourceZoom = viewTransform?.zoom || 1;

    // Store original object position for drop calculation
    // For pinned objects, calculate the world position from screen position
    if (isPinned) {
      const pinnedScreenPos = (obj as any).pinnedScreenPosition || { x: 0, y: 0 };
      // Convert pinned screen position to world coordinates
      // Pinned rendering: left = pinnedPosition.x (no zoom, offset, scroll)
      // Unpinned rendering: left = worldX * pixelsPerVU + offset.x - scroll.x
      // So: worldX = (pinnedPosition.x - offset.x + scroll.x) / pixelsPerVU
      const offsetX = viewTransform?.offset?.x || 0;
      const offsetY = viewTransform?.offset?.y || 0;
      (itemClone as any).originalX = (pinnedScreenPos.x - offsetX + scrollX) / pixelsPerVU;
      (itemClone as any).originalY = (pinnedScreenPos.y - offsetY + scrollY) / pixelsPerVU;
    } else {
      (itemClone as any).originalX = obj.x;
      (itemClone as any).originalY = obj.y;
    }
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

    // Calculate world coordinates from pinned screen position for unpinning
    // This ensures the object stays at the same visual position after unpinning
    const scrollX = viewTransform?.scroll?.x || 0;
    const scrollY = viewTransform?.scroll?.y || 0;
    const offsetX = viewTransform?.offset?.x || 0;
    const offsetY = viewTransform?.offset?.y || 0;

    // Convert pinned screen position to world coordinates
    const worldX = (pinnedPos.x - offsetX + scrollX) / pixelsPerVU;
    const worldY = (pinnedPos.y - offsetY + scrollY) / pixelsPerVU;

    // Unpin the object with correct world coordinates
    dispatch({
      type: 'UNPIN_FROM_VIEWPORT',
      payload: {
        id: id,
        worldX,
        worldY
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
        sourceZoom: (itemClone as any).sourceZoom,
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
    p2v,
    hyperscaleLayers
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

  // IMPORTANT: Check if cursor is over pool panel FIRST
  // If dropping to pool panel, don't process hand panel drop
  const poolPanel = elementAtCursor?.closest('[data-pool-panel]');
  if (poolPanel) {
    // Let pool panel handle the drop
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
      // IMPORTANT: Also dispatch cursor-slot-dropped to hide purple outline
      window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
        detail: { cardIds: items.map(i => i.id) }
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

        // Send cursor-slot-dropped event to reset hover state in DeckComponent
        window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
          detail: { cardIds: cards.map(c => c.id) }
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

  // Check if items came from hand/deck (should get new z-indices) or from table (keep original)
  // Items from HAND or DECK always get new z-indices on drop
  // Items from TABLE keep original z-indices only when using 'hold' source
  const firstItem = itemsToDrop[0];
  const firstItemLocation = firstItem?.type === ItemType.CARD ? (firstItem as CardType).location : null;
  const isFromHandOrDeck = firstItem && (
    firstItemLocation === CardLocation.HAND ||
    firstItemLocation === CardLocation.DECK ||
    firstItemLocation === CardLocation.PILE ||
    firstItemLocation === CardLocation.CURSOR_SLOT
  );

  // useOriginalZIndex: true only for 'hold' source AND items from table (not from hand/deck/pile)
  const useOriginalZIndex = !isFromHandOrDeck && (source === 'hold' || source === 'archetype');

  // Calculate drop position
  const rect = scrollContainerRef.current?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  // p2v already uses pixelsPerVU which includes zoomMultiplier
  const baseX = p2v(clientX - rect.left + (viewTransform?.scroll?.x || 0));
  const baseY = p2v(clientY - rect.top + (viewTransform?.scroll?.y || 0));

  // Sort items by DESCENDING cursorSlotIndex to match CursorSlotVisualization
  // sortedIndex=0 (last added, highest cursorSlotIndex) is front/top
  // sortedIndex=max (first added, lowest cursorSlotIndex) is back/bottom
  const sortedItems = [...itemsToDrop].sort((a, b) => {
    const sortKeyA = (a as any).cursorSlotIndex ?? (a as any).originalZIndex ?? a.zIndex ?? 0;
    const sortKeyB = (b as any).cursorSlotIndex ?? (b as any).originalZIndex ?? b.zIndex ?? 0;
    return sortKeyB - sortKeyA; // Descending - higher index (last added) first
  });

  // NEW: Smart z-index allocation with defragmentation support
  // Group items by hyperscale layer to allocate z-indices per layer
  const layerGroups: Record<string, typeof sortedItems> = {};
  for (const item of sortedItems) {
    const layerId = item.hyperscaleLayerId ?? 'default';
    if (!layerGroups[layerId]) {
      layerGroups[layerId] = [];
    }
    layerGroups[layerId].push(item);
  }

  // Allocate z-indices for each layer
  const layerAllocations: Record<string, { allocatedZIndex: number; objectsToUpdate?: Record<string, number> }> = {};

  // Track item index within each layer for reverse z-index allocation
  const layerItemIndices: Record<string, number> = {};

  for (const [layerId, _layerItems] of Object.entries(layerGroups)) {
    if (useOriginalZIndex) {
      // For 'hold' and 'archetype' sources, use original z-indices
      // No allocation needed - items keep their original z-indices
      layerAllocations[layerId] = { allocatedZIndex: 0 };
    } else {
      // Allocate new z-indices above all existing objects in the layer
      // With automatic defragmentation if needed
      const allocation = allocateZIndexWithDefrag(
        state.objects,
        layerId === 'default' ? undefined : layerId,
        hyperscaleLayers
      );

      // Store allocation info for this layer
      layerAllocations[layerId] = {
        allocatedZIndex: allocation.allocatedZIndex
      };

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

  // Drop all items from cursor slot
  sortedItems.forEach((item, sortedIndex) => {
    let finalX, finalY;

    // Get object dimensions for centering
    const objWidth = item.width ?? 50;
    const objHeight = item.height ?? 50;

    // Get click offsets (try VU first, then PX)
    const clickOffsetX = (item as any).clickOffsetX;
    const clickOffsetY = (item as any).clickOffsetY;
    const clickOffsetX_PX = (item as any).clickOffsetX_PX;
    const clickOffsetY_PX = (item as any).clickOffsetY_PX;

    // Check if we have click offset info (from any source)
    // IMPORTANT: Use clickOffset if available, regardless of originalX/originalY
    // This is needed for cards from HAND where originalX/originalY are undefined
    if (clickOffsetX !== undefined && clickOffsetY !== undefined) {
      // Calculate final position: dropPos - clickOffset
      // This places the object so the clicked point ends up at the drop position
      finalX = baseX - clickOffsetX;
      finalY = baseY - clickOffsetY;
    } else if (clickOffsetX_PX !== undefined && clickOffsetY_PX !== undefined) {
      // Use PX offsets when VU offsets are not available
      // clickOffsetX_PX is ALWAYS in screen pixels now (consistently from all sources)
      // Use the centralized utility to apply the offset
      const offsetResult = applyClickOffset(
        baseX,
        baseY,
        clickOffsetX_PX,
        clickOffsetY_PX,
        props.pixelsPerVU
      );
      finalX = offsetResult.x;
      finalY = offsetResult.y;
    } else {
      // Fallback: center on drop position (for archetype tokens without clickOffset)
      finalX = baseX - objWidth / 2;
      finalY = baseY - objHeight / 2;
    }

    // Apply stack offset - matches CursorSlotVisualization exactly
    // sortedIndex=0 (front/top) gets no offset, sortedIndex=1 gets offsetAmount, etc.
    if (sortedItems.length > 1) {
      const objWidth = item.width ?? 50;
      const objHeight = item.height ?? 50;
      const stackOffset = calculateStackOffset(sortedIndex, objWidth, objHeight);
      finalX += stackOffset.offsetX;
      finalY += stackOffset.offsetY;
    }

    // Check for board grid magnetism
    const isToken = item.type === ItemType.TOKEN;
    const isCard = item.type === ItemType.CARD;
    // Count tokens in cursor slot - if multiple tokens, drop as stack without magnetism
    const tokenCount = itemsToDrop.filter(i => i.type === ItemType.TOKEN).length;
    const shouldSnapToGrid = (isToken && tokenCount <= 1) || (isCard && item.snapToGrid);

    let finalZIndex = item.zIndex;
    if (!useOriginalZIndex) {
      // Use the allocated z-index for this layer
      // sortedIndex=0 is last added (front/top), should get highest Z
      // sortedIndex=max is first added (back/bottom), should get lowest Z
      const layerId = item.hyperscaleLayerId ?? 'default';
      const allocation = layerAllocations[layerId];
      if (allocation) {
        // Count items in this layer to calculate reverse index
        const itemsInThisLayer = layerGroups[layerId]?.length ?? 1;
        // Reverse index: sortedIndex=0 -> itemsInThisLayer-1, sortedIndex=max -> 0
        const currentIndex = layerItemIndices[layerId] ?? 0;
        const reverseIndex = itemsInThisLayer - 1 - currentIndex;
        finalZIndex = allocation.allocatedZIndex + reverseIndex;
        // Increment item index for this layer
        layerItemIndices[layerId] = currentIndex + 1;
      }
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

    // For Effect Templates, preserve all template-specific properties
    const isEffectTemplate = item.type === ItemType.EFFECT_TEMPLATE;
    const effectTemplateUpdates = isEffectTemplate ? {
      width: (item as EffectTemplate).width,
      height: (item as EffectTemplate).height,
      pivot: (item as EffectTemplate).pivot,
      rotation: (item as EffectTemplate).rotation,
      rotationMarkerDistance: (item as EffectTemplate).rotationMarkerDistance,
    } : {};

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
          ...effectTemplateUpdates,
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
      const zoom = viewTransform?.zoom || 1;

      let screenX: number;
      let screenY: number;

      // UI objects (panels/windows) use pixel coordinates directly
      // Game objects use world coordinates (VU) that need conversion
      if (item.type === ItemType.PANEL || item.type === ItemType.WINDOW) {
        // For UI objects: obj.x/y are already in screen pixels
        screenX = finalX / zoom - scrollX;
        screenY = finalY / zoom - scrollY;
      } else {
        // For game objects: obj.x/y are in world coordinates (VU)
        // Convert to pinned screen coordinates using the same formula as pinning
        const offsetX = viewTransform?.offset?.x || 0;
        const offsetY = viewTransform?.offset?.y || 0;
        screenX = finalX * props.pixelsPerVU + (offsetX - scrollX) / zoom;
        screenY = finalY * props.pixelsPerVU + (offsetY - scrollY) / zoom;
      }

      dispatch({
        type: 'PIN_TO_VIEWPORT',
        payload: {
          id: item.id,
          screenX,
          screenY
        }
      });

      // Remove from tracking
      unpinnedDuringDragRef.current.delete(item.id);
    }
  });

  // IMPORTANT: Remove dropped cards from all players' handCardOrder
  // When cards are dropped from hand to tabletop, they should be removed from hand
  const droppedCardIds = itemsToDrop.filter(item => item.type === ItemType.CARD).map(item => item.id);
  if (droppedCardIds.length > 0 && state.players) {
    state.players.forEach((player: any) => {
      const currentHandOrder = player.handCardOrder || [];
      const updatedHandOrder = currentHandOrder.filter((id: string) => !droppedCardIds.includes(id));
      if (updatedHandOrder.length !== currentHandOrder.length) {
        dispatch({
          type: 'UPDATE_PLAYER',
          payload: {
            id: player.id,
            updates: { handCardOrder: updatedHandOrder }
          }
        });
      }
    });
  }

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
    setCursorPosition,
    setZoom,
    setScroll,
    cursorPositionRef,
    cursorSlotSource,
    currentTool,
    isShiftPressed,
    setIsShiftPressed,
    setIsCtrlPressed,
    draggingId,
    draggingIdRef,
    setDraggingId,
    resizingId,
    setResizingId,
    resizeStart,
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
    liveResizeSizeRef,
    setLiveResizeSize,
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

  // Check if settings modal is open (to block context menus)
  const isSettingsModalOpen = useIsSettingsModalOpen();

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
    // Prevent context menu when using ruler tool
    if (currentTool === 'ruler') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Block context menu if settings modal is open
    if (isSettingsModalOpen) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      object: obj,
      shiftKey: isShiftPressed
    });
  }, [currentTool, isSettingsModalOpen, isShiftPressed, setContextMenu]);

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
    // Helper function to start ruler measurement
    const startRulerMeasurement = () => {
      const rect = scrollContainerRef.current?.getBoundingClientRect();
      if (rect) {
        const scrollX = viewTransform?.scroll?.x || 0;
        const scrollY = viewTransform?.scroll?.y || 0;
        const startX = e.clientX - rect.left + scrollX;
        const startY = e.clientY - rect.top + scrollY;
        const startVX = p2v(startX);
        const startVY = p2v(startY);
        setRulerStart({ x: startVX, y: startVY });
        setRulerCurrent(null);
      }
    };

    // Handle clicking on empty space (clear context menus, rulers, etc.)
    if (!objId) {
      // Ruler tool: start measuring on left mouse down (hold and drag behavior)
      if (currentTool === 'ruler' && e.button === 0) {
        startRulerMeasurement();
      }
      // Ruler tool: enable radius circle on right mouse down (while holding left)
      if (currentTool === 'ruler' && e.button === 2 && rulerStart) {
        setIsRulerRightClick(true);
      }
      return;
    }

    // Ruler tool: when clicking on objects, also start measurement
    if (currentTool === 'ruler') {
      if (e.button === 0) {
        // Left click on object - start ruler from click position
        startRulerMeasurement();
        return;
      }
      if (e.button === 2 && rulerStart) {
        // Right click while ruler is active - enable radius circle
        setIsRulerRightClick(true);
        return;
      }
      // For ruler tool, don't process object interactions
      return;
    }

    const obj = state.objects[objId];
    if (!obj) {
      return;
    }

    // Check if object is locked - locked objects can't be interacted with (even for GM)
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    if (obj.locked) {
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
    scrollContainerRef,
    dragThresholdRef,
    dragOffsetRef,
    cursorSlot,
    cursorSlotSource,
    props
  ]);

  // Double click handler - rolls dice
  const handleDoubleClick = useCallback((e: React.MouseEvent, obj: TableObject) => {
    if (!obj) return;

    // Check if object is locked - locked objects can't be interacted with (even for GM)
    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;
    if (obj.locked) {
      return;
    }
    if (!isOwner) {
      return;
    }

    // Only handle dice objects - always roll only the clicked dice
    if (obj.type === ItemType.DICE_OBJECT) {
      e.stopPropagation();
      // Roll single dice regardless of group membership
      dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: obj.id, rollGroup: false } });
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

    // Handle ruler tool: update current position while dragging
    if (currentTool === 'ruler' && rulerStart && (e.target as HTMLElement)?.closest('[data-tabletop="true"]')) {
      const rect = scrollContainerRef.current?.getBoundingClientRect();
      if (rect) {
        const scrollX = viewTransform?.scroll?.x || 0;
        const scrollY = viewTransform?.scroll?.y || 0;
        const currentX = e.clientX - rect.left + scrollX;
        const currentY = e.clientY - rect.top + scrollY;
        const currentVX = p2v(currentX);
        const currentVY = p2v(currentY);
        setRulerCurrent({ x: currentVX, y: currentVY });
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

      // Check if object is locked - locked objects can't be dragged
      if (obj.locked) {
        return;
      }

      // Check if this is a UI object (panel/window) - use screen coordinates
      const isUIObject = obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW;

      if (isUIObject) {
        // UI objects move immediately without threshold - smooth drag
        let newX = e.clientX - dragOffsetRef.current.x;
        let newY = e.clientY - dragOffsetRef.current.y;

        // Constrain panel within viewport bounds
        const panelWidth = obj.width || 300;
        const panelHeight = obj.height || 400;
        const maxX = window.innerWidth - panelWidth;
        const maxY = window.innerHeight - panelHeight;

        // Clamp position to keep panel visible
        newX = Math.max(0, Math.min(maxX, newX));
        newY = Math.max(0, Math.min(maxY, newY));

        // For unpinned panels, convert screen pixels to world coordinates
        // World coords account for scroll offset and zoom level
        if (!(obj as any).isPinnedToViewport) {
          const scrollX = viewTransform?.scroll?.x || 0;
          const scrollY = viewTransform?.scroll?.y || 0;
          const zoom = viewTransform?.zoom || 1;

          // Convert screen pixels to world coords: (screen - scroll) * zoom
          newX = (newX + scrollX) * zoom;
          newY = (newY + scrollY) * zoom;
        }

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

    // Handle board resizing
    if (resizingId && resizeStart) {
      const obj = state.objects[resizingId];
      if (obj && obj.type === ItemType.BOARD) {
        const rect = scrollContainerRef.current?.getBoundingClientRect();
        if (rect) {
          // Calculate delta in screen pixels
          const deltaX = e.clientX - resizeStart.x;
          const deltaY = e.clientY - resizeStart.y;

          // Convert delta to virtual units
          const zoom = viewTransform?.zoom || 1;
          const deltaVU_X = deltaX / zoom;
          const deltaVU_Y = deltaY / zoom;

          // Calculate new size
          const newWidth = Math.max(50, resizeStart.width + deltaVU_X);
          const newHeight = Math.max(50, resizeStart.height + deltaVU_Y);

          // Update live preview size
          liveResizeSizeRef.current = { width: newWidth, height: newHeight };
          setLiveResizeSize({ width: newWidth, height: newHeight });
        }
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
    activePlayerId,
    resizingId,
    resizeStart,
    liveResizeSizeRef,
    setLiveResizeSize
  ]);

  // Mouse up handler WITH LOGGING
  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Handle ruler tool: clear ruler on left mouse up, clear radius on right mouse up
    if (currentTool === 'ruler') {
      const button = e?.button;
      // Left button released: clear entire ruler
      if (button === 0 && rulerStart) {
        setRulerStart(null);
        setRulerCurrent(null);
        setIsRulerRightClick(false);
      }
      // Right button released: clear only radius circle
      if (button === 2 && isRulerRightClick) {
        setIsRulerRightClick(false);
      }
      return;
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
        // Get current playerPanelSettings to preserve other properties
        const currentSettings = state.playerPanelSettings?.[activePlayerId]?.[currentDraggingId];

        // Clear x,y from playerPanelSettings so panel uses uiObject position directly
        // This prevents issues where playerPanelSettings overrides the actual object position
        dispatch({
          type: 'UPDATE_PLAYER_PANEL_SETTINGS',
          payload: {
            playerId: activePlayerId,
            panelId: currentDraggingId,
            settings: {
              ...currentSettings,
              // Don't store x/y in playerPanelSettings - let uiObject be the source of truth
              x: undefined,
              y: undefined,
              // Preserve other properties
              width: currentSettings?.width ?? obj.width,
              height: currentSettings?.height ?? obj.height,
              minimized: currentSettings?.minimized ?? (obj as any).minimized ?? false,
              isPinnedToViewport: currentSettings?.isPinnedToViewport ?? (obj as any).isPinnedToViewport ?? false,
            }
          }
        });

        // If object was unpinned during drag, repin it
        if (unpinnedDuringDragRef.current.has(currentDraggingId)) {

          const scrollX = viewTransform?.scroll?.x || 0;
          const scrollY = viewTransform?.scroll?.y || 0;
          const zoom = viewTransform?.zoom || 1;

          // Convert world coords to screen coords for pinning
          // obj.x/y are in world coords (for unpinned panels during drag)
          const screenX = obj.x / zoom - scrollX;
          const screenY = obj.y / zoom - scrollY;

          dispatch({
            type: 'PIN_TO_VIEWPORT',
            payload: {
              id: currentDraggingId,
              screenX: screenX,
              screenY: screenY
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
    }

    // Handle resize completion
    if (resizingId && liveResizeSizeRef.current) {
      const obj = state.objects[resizingId];
      if (obj && obj.type === ItemType.BOARD) {
        const finalSize = liveResizeSizeRef.current;

        // Apply final size to the object
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: resizingId,
            updates: {
              width: finalSize.width,
              height: finalSize.height
            }
          }
        });
      }

      // Clear resize state
      liveResizeSizeRef.current = null;
      setLiveResizeSize(null);
      setResizingId(null);
      setResizeStart(null);
    }

    if (dragThresholdRef.current.targetId) {
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
    rulerStart,
    setRulerStart,
    setRulerCurrent,
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
    props,
    resizingId,
    resizeStart,
    liveResizeSizeRef,
    setLiveResizeSize,
    setResizingId,
    setResizeStart
  ]);

  // Wheel handler (native event for passive: false support)
  const handleWheel = useCallback((e: WheelEvent) => {
    // Check if the event target is inside a scrollable panel
    // If so, don't handle the wheel event here (let the panel handle it)
    const target = e.target as HTMLElement;
    const scrollableParent = target.closest('[data-scrollable], .overflow-y-auto, .overflow-auto, [data-hand-panel], [data-tokens-panel], [data-tools-panel]');

    if (scrollableParent) {
      // Let the scrollable panel handle the wheel event
      return;
    }

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

  // Global click handler (also handles contextmenu event)
  const handleGlobalClick = useCallback((e: MouseEvent) => {
    // Prevent context menu when using ruler tool
    if (currentTool === 'ruler' && e.type === 'contextmenu') {
      e.preventDefault();
      return;
    }

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