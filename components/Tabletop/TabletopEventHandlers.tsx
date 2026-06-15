import { useCallback, useEffect, useRef } from 'react';
import { TableObject, ItemType, Card as CardType, Token, TokenType, Deck as DeckType, Board as BoardType, CardOrientation, GridType, CardLocation, EffectTemplate, Drawing } from '../../types';
import { clampScrollToPlayableArea, clampObjectPositionToPlayableArea } from '../../utils/viewportConstraints';
import { SCROLLBAR_WIDTH_THICK } from '../../constants';
import { useIsSettingsModalOpen } from '../../store/contexts';
import {
  parseGridCellKey,
  calculateGridCellCenter,
  calculateGridDimensions,
  removeObjectFromGridCellMagnet,
  addObjectToGridCellMagnet,
  generateGridCellKey,
  addObjectToCellMagnet,
  removeObjectFromCellMagnet
} from '../../utils/gridUtils';
import {
  applyClickOffset,
  calculateStackOffset
} from '../../utils/dragDropUtils';
import {
  allocateZIndexWithDefrag
} from '../../utils/zIndexAllocator';
import { applyPanelToPanelMagnetism, type PanelBounds, type MagnetismConfig, type GameSpaceBounds } from '../../utils/panelMagnetism';
import { getTokenWithAppliedState } from '../../hooks/useTokenWithState';
import { findDrawingAtPosition } from '../../utils/drawingUtils';
import { addToCursorSlot, removeFromCursorSlot, isInCursorSlot, getCursorSlotObjects } from '../../utils/cursorSlotTracker';
import { executeClickAction, type ActionHandlerContext } from '../../utils/objectActionHandlers';

interface TabletopEventHandlersProps {
  state: any;
  dispatch: React.Dispatch<any>;
  cursorSlot: any[];
  cursorSlotRef: React.MutableRefObject<any[]>;
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
  isPanning: boolean;
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  panStartRef: React.MutableRefObject<{ x: number; y: number; scrollX: number; scrollY: number } | null>;
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
  setLivePreviewSize: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>;
  isAddingTokenRef: React.RefObject<boolean>;
  longPressTimerRef: React.RefObject<number | null>;
  clickTooltipTimerRef: React.RefObject<number | null>;
  clickTooltipBoundsRef: React.RefObject<{ left: number; right: number; top: number; bottom: number } | null>;
  dragThresholdRef: React.MutableRefObject<{
    initialX: number;
    initialY: number;
    targetId: string | null;
    addedToSlot: boolean;
    skipThreshold: boolean; // Item already in cursor slot, no threshold check needed
    logCounter?: number; // For throttling logs
    skipLogCounter?: number; // For throttling skip logs
  }>;
  dragOffsetRef: React.MutableRefObject<{ x: number; y: number } | null>;
  cursorSlotLastAddedRef: React.MutableRefObject<number>;
  cursorSlotLastDroppedRef: React.MutableRefObject<number>;
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

// Helper function to add object to cursor slot
const addToCursorSlotLocal = (
  id: string,
  item: TableObject,
  mousePosition: { x: number; y: number } | undefined,
  props: TabletopEventHandlersProps,
  source: 'hold' | 'shift' = 'hold'
) => {
  const {
    cursorSlot,
    cursorSlotRef,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    setCursorSlotSource,
    cursorSlotLastAddedRef,
    cursorSlotLastDroppedRef,
    unpinnedDuringDragRef,
    state,
    dispatch,
    scrollContainerRef,
    viewTransform,
    pixelsPerVU,
    p2v
  } = props;

  // 🔥 FIX: Helper function to safely update both cursorSlot ref and state
  // This prevents race conditions where state updates don't immediately reflect in the ref
  const updateCursorSlot = (newValue: any[] | ((prev: any[]) => any[])) => {
    if (typeof newValue === 'function') {
      setCursorSlot(prev => {
        const result = newValue(prev);
        // Update ref with the computed result
        cursorSlotRef.current = result;
        return result;
      });
    } else {
      // Update ref immediately before state update
      cursorSlotRef.current = newValue;
      setCursorSlot(newValue);
    }
  };

  // IMPORTANT: Check if slot actually has items
  // Use cursorSlot.length first (React state), fallback to state.objects check
  // Objects in cursor slot have inCursorSlot: true (NOT isOnTable: false, which includes cards in hand!)

  // Check if cursor is over a token archetype button
  const elementUnderCursor = document.elementFromPoint(mousePosition?.x ?? 0, mousePosition?.y ?? 0);
  const archetypeButton = elementUnderCursor?.closest('[data-archetype-card]');
  if (archetypeButton) {
    return;
  }

  // Note: Other items (CARD/TOKEN) can coexist in slot, no special handling needed

  // Check cursorSlot for the 100 item limit
  // 🔥 FIX: Use cursorSlotRef.current (source of truth) for limit check
  if (cursorSlotRef.current.length >= 100) {
    return; // Max 100 items in slot
  }

  // Check if item is locked - locked objects can't be added to cursor slot
  const obj = state.objects[id];
  if (obj.locked) {
    return; // Locked objects can't be picked up
  }

  // 🔥 FIX: Check if object is already in cursor slot using BOTH global tracker AND cursorSlot
  // IMPORTANT: Check cursorSlotRef.current directly to catch duplicates even when tracker is stale
  // This prevents shift+click from adding the same item multiple times
  if (cursorSlotRef.current.some(item => item.id === id)) {
    return;
  }

  // Check global tracker as well
  if (isInCursorSlot(id)) {
    const obj = state.objects[id];
    const isHandCard = obj?.type === ItemType.CARD && obj?.location === CardLocation.HAND;
    if (!isHandCard) {
      return; // Only block TABLE items that are already in slot
    }
    // For HAND cards, clear stale inCursorSlot and continue
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: id,
        updates: { inCursorSlot: false }
      }
    });
  }

  // 🔥 FIX: Add to global tracker IMMEDIATELY to prevent race conditions
  // This must happen BEFORE any async operations to prevent duplicate adds
  addToCursorSlot(id, obj?.x ?? 0, obj?.y ?? 0);

  // Set source based on how the item was added (only if slot was empty before)
  // 🔥 FIX: Use cursorSlotRef.current (source of truth) for consistency
  if (cursorSlotRef.current.length === 0) {
    setCursorSlotSource(source);
  }
  const gridCellKey = (obj as Token)?.gridCellKey || (obj as CardType)?.gridCellKey;
  if (obj && gridCellKey && (obj.type === ItemType.TOKEN || obj.type === ItemType.CARD)) {
    const [boardId, ...cellParts] = gridCellKey.split(':');
    const cellKey = cellParts.join(':');

    const board = state.objects[boardId] as BoardType;
    // Always clear gridCellKey from token when picked up, regardless of board visibility
    // But only update board magnet points if board is visible
    if (board && board.isOnTable !== false && board.gridCellMagnetPoints && board.gridCellMagnetPoints[cellKey]) {
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
      }
    }

    // Always clear gridCellKey from token when picked up
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

  // Check if object is snapped to a battlefield cell
  const snappedToCellId = (obj as any)?.snappedToCellId;
  if (obj && snappedToCellId && (obj.type === ItemType.TOKEN || obj.type === ItemType.CARD)) {
    const cell = state.objects[snappedToCellId] as any;

    // Always clear snappedToCellId when picked up, but only update cell magnet points if cell exists
    if (cell && cell.isOnTable !== false && cell.magnetPoints) {
      const result = removeObjectFromCellMagnet(
        cell,
        id,
        state.objects
      );

      if (result) {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: cell.id,
            updates: result.updatedCell
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
      }
    }

    // Always clear snappedToCellId from object when picked up
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: id,
        updates: {
          snappedToCellId: undefined
        }
      }
    });
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
    // Apply token state first to get correct visual properties for cursor slot
    const tokenWithState = getTokenWithAppliedState(token, state.objects);

    itemClone = {
      id: token.id,
      type: ItemType.TOKEN,
      name: token.name,
      // Use properties from applied state
      width: tokenWithState.width,
      height: tokenWithState.height,
      shape: tokenWithState.shape,
      color: tokenWithState.color,
      content: tokenWithState.content,
      borderWidth: tokenWithState.borderWidth,
      borderColor: (tokenWithState as any).borderColor,
      opacity: tokenWithState.opacity,
      borderOpacity: (tokenWithState as any).borderOpacity,
      x: 0,  // ❌ Сбрасываем координаты в слоте курсора
      y: 0,
      rotation: token.rotation || 0,  // rotation stays from original token
      zIndex: token.zIndex ?? 0,
      hyperscaleLayerId: token.hyperscaleLayerId ?? 'tokens',
      // Include state-related properties for reference
      currentStateId: (token as any).currentStateId,
      archetypeId: token.archetypeId,
      states: token.states,
      fontColor: (tokenWithState as any).fontColor,
      showName: (token as any).showName,
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
  // 🔥 FIX: Use cursorSlotRef.current.length for cursorSlotIndex (source of truth)
  (itemClone as any).cursorSlotIndex = cursorSlotRef.current.length;
  (itemClone as any).timestamp = Date.now();
  // Store if item came from hand panel (to avoid self-click drop blocking)
  (itemClone as any).isFromHand = (obj as any).location === CardLocation.HAND;

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
  // 🔥 FIX: Use cursorSlotRef.current (source of truth) to prevent duplicates
  // The duplicate check uses cursorSlotRef.current, so we must use it here too
  const newSlot = [...cursorSlotRef.current, itemClone as CardType | TokenType | BoardType | DeckType];

  // 🔥 FIX: Update ref immediately before state update to prevent race conditions
  cursorSlotRef.current = newSlot;

  // 🔥 FIX: DON'T use flushSync - it blocks dispatch and causes objects to stay on table
  // Instead, rely on ghost rendering and CSS transitions to prevent flickering
  updateCursorSlot(newSlot);

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

  // 🔥 FIX: For cards in HAND, clear inCursorSlot BEFORE adding to slot
  // This prevents race condition where card is filtered out during transition
  if ((obj as any).location === CardLocation.HAND && (obj as any).inCursorSlot) {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: id,
        updates: { inCursorSlot: false }
      },
      _localOnly: true // Don't sync this temporary state clear
    });
  }

  // 🔥 FIX: Dispatch event to clear pickingUpCardIds in HandPanelOptimized
  // This prevents stale entries from accumulating when cards are successfully added to cursor slot
  window.dispatchEvent(new CustomEvent('cursor-slot-item-added', {
    detail: { cardId: id }
  }));

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

// Helper function to drop cursor slot items
const dropCursorSlot = (
  clientX: number,
  clientY: number,
  props: TabletopEventHandlersProps,
  skipPoolCheck: boolean = false
) => {
  const {
    cursorSlot,
    cursorSlotRef,
    setCursorSlot,
    setCursorPosition,
    cursorPositionRef,
    setCursorSlotSource,
    cursorSlotSource,
    cursorSlotLastDroppedRef,
    unpinnedDuringDragRef,
    state,
    dispatch,
    scrollContainerRef,
    viewTransform,
    p2v,
    hyperscaleLayers,
    dragThresholdRef
  } = props;

  // IMPORTANT: Clear drag threshold immediately when dropping
  // This prevents cards from becoming undraggable after being dropped
  dragThresholdRef.current = {
    initialX: 0,
    initialY: 0,
    targetId: null,
    addedToSlot: false,
    skipThreshold: false
  };

  // 🔥 FIX: Record drop time to prevent immediate re-pickup
  cursorSlotLastDroppedRef.current = Date.now();

  // 🔥 FIX: Use cursorSlotRef.current as source of truth for drop decision
  // This is because cursorSlot state may not be updated yet due to React batching
  // If cursorSlotRef has items, we should attempt to drop them
  if (cursorSlotRef.current.length === 0) {
    return;
  }

  // IMPORTANT: Use cursorSlotRef.current for items to drop, not cursorSlot state
  // This ensures we drop items even if React hasn't updated the state yet
  let itemsToDrop = cursorSlotRef.current.filter(item => {
    // Check if object exists in state (may have been deleted)
    const obj = state.objects[item.id];
    if (obj != null) return true;

    // 🔥 FIX: Also keep items from pool panel that don't exist in state.objects yet
    // These items need to be spawned into the game state on drop
    // Check if item has the minimal required properties to be spawned
    return item.type === ItemType.DICE_OBJECT ||
           item.type === ItemType.TOKEN ||
           item.type === ItemType.COUNTER ||
           item.type === ItemType.CARD;
  });

  if (itemsToDrop.length === 0) {
    // All items were already dropped elsewhere, just clear the slot
    // 🔥 FIX: Clear cursor slot tracker for all items - use cursorSlotRef.current (source of truth)
    cursorSlotRef.current.forEach(item => removeFromCursorSlot(item.id));
    // 🔥 FIX: Update ref immediately before state update
    cursorSlotRef.current = [];
    setCursorSlot([]);
    setCursorPosition(null);
    cursorPositionRef.current = null;
    setCursorSlotSource(null);
    return;
  }

  // Notify that items were dropped from cursor slot
  const droppedIds = itemsToDrop.map(item => item.id);

  window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
    detail: { cardIds: droppedIds }
  }));

  // Check if cursor is over a token archetype card
  const elementAtCursor = document.elementFromPoint(clientX, clientY);
  const archetypeCard = elementAtCursor?.closest('[data-archetype-card]');

  if (archetypeCard) {
    // Clear cursor slot immediately to prevent stale items
    // 🔥 FIX: Use cursorSlotRef.current (source of truth)
    cursorSlotRef.current.forEach(item => removeFromCursorSlot(item.id));
    cursorSlotRef.current = [];
    setCursorSlot([]);
    setCursorPosition(null);
    cursorPositionRef.current = null;
    setCursorSlotSource(null);
    return;
  }

  // IMPORTANT: Check if cursor is over pool panel FIRST
  // If dropping to pool panel, don't process hand panel drop
  // Skip this check if skipPoolCheck is true (when event comes from pool panel)
  let isOverPoolPanel = false;
  let matchedPoolPanelId: string | null = null;
  const poolPanel = elementAtCursor?.closest('[data-pool-panel]') as HTMLElement;

  if (!skipPoolCheck) {
    // Use getBoundingClientRect() to accurately check if cursor is over VISIBLE pool panel area
    const poolPanelElements = document.querySelectorAll('[data-pool-panel]');

    for (const element of poolPanelElements) {
      const rect = element.getBoundingClientRect();
      // Check if cursor is within the visible bounds of this pool panel
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        isOverPoolPanel = true;
        matchedPoolPanelId = element.getAttribute('data-pool-panel');
        break;
      }
    }
  }

  // IMPORTANT: Check if cursor slot contains BOARD or NEXUS_BOARD
  // Boards can ONLY be dropped in pool panels OR on main tabletop
  // Boards CANNOT be dropped in other panels (Character, Hand, etc.)
  const hasBoardInSlot = itemsToDrop.some(item => item.type === ItemType.BOARD || item.type === ItemType.NEXUS_BOARD);

  if (hasBoardInSlot) {
    // Check if dropping to pool panel - allow it
    if (isOverPoolPanel) {
      // Clear cursor slot immediately to prevent stale items
      // 🔥 FIX: Use cursorSlotRef.current (source of truth)
      cursorSlotRef.current.forEach(item => removeFromCursorSlot(item.id));
      cursorSlotRef.current = [];
      setCursorSlot([]);
      setCursorPosition(null);
      cursorPositionRef.current = null;
      setCursorSlotSource(null);
      return; // Let pool panel handle the drop
    }

    // Check if dropping to other panels (Character, Hand, etc.) - disallow
    // Use precise coordinate check like pool panel, not closest()
    let handPanel = false;
    const handPanelElements = document.querySelectorAll('[data-hand-panel="true"]');
    for (const element of handPanelElements) {
      const rect = element.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        handPanel = true;
        break;
      }
    }
    const characterPanel = elementAtCursor?.closest('[data-character-panel]');
    const otherPanel = handPanel || characterPanel;

    if (otherPanel) {
      // Board is being dropped to a non-pool panel - return to original position
      const boardItems = itemsToDrop.filter(item => item.type === ItemType.BOARD || item.type === ItemType.NEXUS_BOARD);
      const nonBoardItems = itemsToDrop.filter(item => item.type !== ItemType.BOARD && item.type !== ItemType.NEXUS_BOARD);

      // Return boards to their original positions
      boardItems.forEach(board => {
        const originalX = (board as any).originalX;
        const originalY = (board as any).originalY;

        if (originalX !== undefined && originalY !== undefined) {
          // 🔥 FIX: Dispatch FIRST with new coordinates, THEN remove from cursor slot
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: board.id,
              updates: {
                x: originalX,
                y: originalY,
                inCursorSlot: false,
                isOnTable: true
              }
            }
          });

          // Remove from tracker AFTER dispatch
          removeFromCursorSlot(board.id);
        }
      });

      // Keep non-board items in cursor slot for normal drop processing
      if (nonBoardItems.length > 0) {
        // Update cursor slot to only contain non-board items
        cursorSlotRef.current = nonBoardItems;
        setCursorSlot(nonBoardItems);
        // Boards are already removed from tracker above
      } else {
        // Only boards were in slot, clear everything
        cursorSlotRef.current = [];
        setCursorSlot([]);
        setCursorPosition(null);
        cursorPositionRef.current = null;
        setCursorSlotSource(null);
        return;
      }
    }
    // Otherwise, allow drop on main tabletop (continue with normal drop logic)
  }

  if (poolPanel && itemsToDrop.length > 0) {
    // Clear cursor slot immediately to prevent stale items
    // 🔥 FIX: Use cursorSlotRef.current (source of truth)
    cursorSlotRef.current.forEach(item => removeFromCursorSlot(item.id));
    cursorSlotRef.current = [];
    setCursorSlot([]);
    setCursorPosition(null);
    cursorPositionRef.current = null;
    setCursorSlotSource(null);
    // Let pool panel handle the drop (for non-board items or if boards were filtered out above)
    return;
  }

  // Check if cursor is over hand panel - drop cards to hand instead of table
  // Use precise coordinate check like pool panel, not closest()
  let handPanel = false;
  const handPanelElements = document.querySelectorAll('[data-hand-panel="true"]');
  for (const element of handPanelElements) {
    const rect = element.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      handPanel = true;
      break;
    }
  }
  if (handPanel) {

    // Filter only CARDS, TOKENS and COUNTERS from cursor slot (allow all in hand panel)
    const items = itemsToDrop.filter(item => item.type === ItemType.CARD || item.type === ItemType.TOKEN || item.type === ItemType.COUNTER);
    const nonCardItems = itemsToDrop.filter(item => item.type !== ItemType.CARD && item.type !== ItemType.TOKEN && item.type !== ItemType.COUNTER);

    if (items.length > 0) {
      // 🔥 FIX: Clear inCursorSlot flag IMMEDIATELY before dispatch
      // This prevents cards from being blocked on subsequent pickup attempts
      // The dispatch happens asynchronously, so we need to clear the flag synchronously
      items.forEach(item => {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: item.id,
            updates: { inCursorSlot: false }
          }
        });
      });

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
      // Remove card items from tracker (they were dropped to hand)
      items.forEach(item => removeFromCursorSlot(item.id));
      // Keep non-card items in cursor slot
      cursorSlotRef.current = nonCardItems;
      setCursorSlot(nonCardItems);
    } else {
      // Clear cursor slot immediately
      // 🔥 FIX: Use cursorSlotRef.current (source of truth)
      cursorSlotRef.current.forEach(item => removeFromCursorSlot(item.id));
      setCursorSlot([]);
      setCursorPosition(null);
      cursorPositionRef.current = null;
      setCursorSlotSource(null);
      // 🔥 FIX: Also clear cursorSlotRef to prevent stale data on next pickup
      cursorSlotRef.current = [];
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
        // Remove card items from tracker (they were added to deck)
        cards.forEach(card => removeFromCursorSlot(card.id));
        // Update cursor slot to only contain non-card items
        cursorSlotRef.current = nonCards;
        setCursorSlot(nonCards);
        // These will be handled by the normal drop logic below
        // Update itemsToDrop to only include non-card items
        itemsToDrop = nonCards;
      } else {
        // Clear cursor slot immediately after successful deck drop
        // 🔥 FIX: Use cursorSlotRef.current (source of truth)
        cursorSlotRef.current.forEach(item => removeFromCursorSlot(item.id));
        cursorSlotRef.current = [];
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

    // Clamp position to playable area to prevent objects from disappearing
    // Ensures at least 25% of the object remains visible
    const clamped = clampObjectPositionToPlayableArea(
      finalX,
      finalY,
      item.width ?? 50,
      item.height ?? 50,
      0.25
    );
    finalX = clamped.x;
    finalY = clamped.y;

    // Check for board grid magnetism
    const isToken = item.type === ItemType.TOKEN;
    const isCard = item.type === ItemType.CARD;
    // Count tokens in cursor slot - if multiple tokens, drop as stack without magnetism
    const tokenCount = itemsToDrop.filter(i => i.type === ItemType.TOKEN).length;
    // For cards, we check board.snapCardsToGrid inside the loop (not item.snapToGrid)
    const shouldSnapToGrid = (isToken && tokenCount <= 1) || isCard;

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

        // Skip hidden boards - magnetism should not work when board is hidden
        if (board.isOnTable === false) continue;

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

          // Check a wider range of row candidates (initialRow-2 to initialRow+2)
          let bestCol = 0;
          let bestRow = 0;
          let minDistance = Infinity;

          for (let dRow = -2; dRow <= 2; dRow++) {
            const rowCandidate = initialRow + dRow;

            // For this row, calculate the best col
            // Use bitwise AND for reliable odd/even check (works with negative numbers)
            const rowOffset = (rowCandidate & 1) ? offsetX : 0;
            const colCandidate = Math.round((relX - rowOffset) / gridW);

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

          // Check a wider range of col candidates (initialCol-2 to initialCol+2)
          let bestCol = 0;
          let bestRow = 0;
          let minDistance = Infinity;

          for (let dCol = -2; dCol <= 2; dCol++) {
            const colCandidate = initialCol + dCol;

            // For this col, calculate the best row
            // Use bitwise AND for reliable odd/even check (works with negative numbers)
            const colOffset = (colCandidate & 1) ? offsetY : 0;
            const rowCandidate = Math.round((relY - colOffset) / gridH);

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

      // Check battlefield cells for magnetism
      for (const cellId of Object.keys(state.objects)) {
        const cell = state.objects[cellId] as any;
        if (cell.type !== ItemType.BATTLEFIELD_CELL) continue;

        // Skip hidden cells - magnetism should not work when cell is hidden
        if (cell.isOnTable === false) continue;

        // Check if object is over this cell
        const cellWidth = cell.width ?? 100;
        const cellHeight = cell.height ?? 100;
        const cellLeft = cell.x;
        const cellRight = cell.x + cellWidth;
        const cellTop = cell.y;
        const cellBottom = cell.y + cellHeight;

        if (centerX < cellLeft || centerX > cellRight || centerY < cellTop || centerY > cellBottom) {
          continue;
        }

        // Check if cell has snapToGrid enabled for this item type
        const snapEnabled = isToken ? cell.snapToGrid : cell.snapCardsToGrid;
        if (!snapEnabled) continue;

        // Add object to battlefield cell's magnet points
        const magnetResult = addObjectToCellMagnet(
          cell,
          item.id,
          state.objects
        );

        // Update cell with new magnet points
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: cell.id,
            updates: magnetResult.updatedCell
          }
        });

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
        // magnetResult.snapPosition is center position, convert to top-left
        finalX = magnetResult.snapPosition.x - (item.width ?? 50) / 2;
        finalY = magnetResult.snapPosition.y - (item.height ?? 50) / 2;

        // Store cell reference on the object (for future removal)
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: item.id,
            updates: {
              snappedToCellId: cell.id
            }
          }
        });

        break; // Only snap to first matching cell
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

    // Check if this card was played via "Play Top" action
    // If so, use DROP_FROM_CURSOR_SLOT to properly handle __pendingPlayTop data
    const hasPendingPlayTop = isCard && (currentCard as any)?.__pendingPlayTop;

    if (hasPendingPlayTop) {
      // Use DROP_FROM_CURSOR_SLOT for cards played from top
      // This properly clears __pendingPlayTop and adds history entries
      dispatch({
        type: 'DROP_FROM_CURSOR_SLOT',
        payload: {
          objectId: item.id,
          x: finalX,
          y: finalY,
          zIndex: finalZIndex
        }
      });
    } else {
      // 🔥 FIX: Check if object exists in state.objects (pool panel objects might not)
      const objExists = !!state.objects[item.id];

      // Standard dispatch for all other objects - synchronizes via P2P
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: item.id,
          updates: {
            // For pool panel objects that don't exist, include type and name for creation
            ...(!objExists && {
              type: item.type,
              name: item.name || `${item.type} from pool`,
              // Copy type-specific properties needed for object creation
              ...(item.type === ItemType.DICE_OBJECT && {
                sides: (item as any).sides ?? 6,
                currentValue: (item as any).currentValue ?? 1,
                shape: (item as any).shape ?? 'square',
                color: (item as any).color ?? '#ffffff',
                borderWidth: (item as any).borderWidth ?? 2,
                borderColor: (item as any).borderColor ?? '#000000',
                opacity: (item as any).opacity ?? 1,
                borderOpacity: (item as any).borderOpacity ?? 1,
                fontColor: (item as any).fontColor ?? '#000000',
              }),
              ...(item.type === ItemType.TOKEN && {
                content: (item as any).content ?? '',
                frontFaceUrl: (item as any).frontFaceUrl ?? '',
                emoji: (item as any).emoji ?? '',
              }),
              ...(item.type === ItemType.CARD && {
                content: (item as any).content ?? '',
                frontFaceUrl: (item as any).frontFaceUrl ?? '',
                backFaceUrl: (item as any).backFaceUrl ?? '',
                deckId: (item as any).deckId,
                faceUp: (item as any).faceUp ?? false,
                location: (item as any).location ?? CardLocation.TABLE,
              }),
            }),
            // Standard drop properties
            inCursorSlot: false,
            isOnTable: true,
            x: finalX,
            y: finalY,
            zIndex: finalZIndex,
            width: item.width ?? 50,
            height: item.height ?? 50,
            hyperscaleLayerId: item.hyperscaleLayerId ?? 'tokens',
            rotation: item.rotation ?? 0,
            ...effectTemplateUpdates,
            ...(isCard && currentCard?.location === CardLocation.HAND && {
              location: CardLocation.TABLE
            })
          }
        }
      });
    }

    // 🔥 FIX: Remove from cursor slot tracker immediately
    // This prevents the object from being excluded from rendering by useObjectFilters
    // The state.objects.inCursorSlot will be set to false by DROP_FROM_CURSOR_SLOT reducer
    removeFromCursorSlot(item.id);

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
        // For UI objects: obj.x/y are in screen pixels, convert to pinned screen position
        // Formula: screen = (world - scroll) / zoom
        screenX = (finalX - scrollX) / zoom;
        screenY = (finalY - scrollY) / zoom;
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

  // Clear cursor slot after dispatch is applied (using RAF to ensure state updates first)
  // This prevents the gap where object disappears from both cursorSlot and table
  // Note: cursor slot tracker was already cleared above (after each dispatch)

  // 🔥 FIX: Clear cursorSlotRef.current SYNCHRONOUSLY to prevent stale state in subsequent clicks
  // This ensures that handleMouseDown will see an empty cursor slot immediately
  // IMPORTANT: Only clear items that were actually dropped, keep the rest
  const slotIdsDropped = itemsToDrop.map(item => item.id);
  // 🔥 FIX: Use cursorSlotRef.current (source of truth) for filtering
  const remainingItems = cursorSlotRef.current.filter(item => !slotIdsDropped.includes(item.id));

  // Update cursorSlotRef to only contain remaining items (not dropped ones)
  cursorSlotRef.current = remainingItems;

  // 🔥 FIX: Sync global cursorSlotTracker with remainingItems
  // This prevents the bug where remaining items stay in global tracker but are cleared from cursorSlotRef
  // Get all items currently in global tracker
  const globalTrackerItems = getCursorSlotObjects();

  // Remove from global tracker any items that are not in remainingItems
  globalTrackerItems.forEach(id => {
    if (!remainingItems.some(item => item.id === id)) {
      removeFromCursorSlot(id);
    }
  });

  // If all items were dropped, clear everything
  if (remainingItems.length === 0) {
    // 🔥 FIX: Dispatch cursor-slot-dropped event so HandPanelOptimized can clear pickingUpCardIds
    // This prevents cards from being blocked on subsequent pickup attempts after dropping to table
    const droppedCardIds = itemsToDrop.map(item => item.id);
    window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
      detail: { cardIds: droppedCardIds }
    }));

    requestAnimationFrame(() => {
      cursorSlotRef.current = [];
      setCursorSlot([]);
      setCursorPosition(null);
      cursorPositionRef.current = null;
      setCursorSlotSource(null);
    });
  } else {
    // 🔥 FIX: Dispatch cursor-slot-dropped event for dropped items
    // This ensures HandPanelOptimized clears pickingUpCardIds even for partial drops
    const droppedCardIds = itemsToDrop.map(item => item.id);
    window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
      detail: { cardIds: droppedCardIds }
    }));

    // Some items remain in slot, update state to reflect this
    requestAnimationFrame(() => {
      cursorSlotRef.current = remainingItems;
      setCursorSlot(remainingItems);
      // Don't clear cursorPosition or cursorSlotSource - items are still being dragged
    });
  }

};

export const useTabletopEventHandlers = (props: TabletopEventHandlersProps) => {
  const {
    state,
    dispatch,
    cursorSlot,
    cursorSlotRef,
    setCursorPosition,
    setZoom,
    setScroll,
    cursorPositionRef,
    cursorSlotSource,
    setCursorSlotSource,
    setCursorSlot,
    currentTool,
    isShiftPressed,
    setIsShiftPressed,
    isCtrlPressed,
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
    isPanning,
    setIsPanning,
    panStartRef,
    scrollContainerRef,
    viewTransform,
    pixelsPerVU,
    p2v,
    activePlayerId,
    isGM,
    hyperscaleLayers,
    localSettings,
    updateSetting,
    liveResizeSizeRef,
    setLivePreviewSize,
    isAddingTokenRef,
    longPressTimerRef,
    clickTooltipTimerRef,
    dragThresholdRef,
    dragOffsetRef,
    cursorSlotLastAddedRef,
    cursorSlotLastDroppedRef,
    unpinnedDuringDragRef,
    setClickTooltip,
    setNexusBoardAddingCell,
    setSettingsModalObj,
    setPileContextMenu,
    setPilesButtonMenu,
    setSearchModalDeck,
    setTopDeckModalDeck,
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

  // Mouse down handler
  const handleMouseDown = useCallback((e: React.MouseEvent, objId?: string) => {
    const target = e.target as HTMLElement;

    // Check if cursor is over an EFFECT_TEMPLATE that might be stuck
    if (!objId) {
      const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
      if (elementUnderCursor) {
        const closestObject = elementUnderCursor.closest('[data-object-id]');
        if (closestObject) {
          const objectId = closestObject.getAttribute('data-object-id');
          const obj = state.objects[objectId || ''];
          if (obj && obj.type === ItemType.EFFECT_TEMPLATE) {
            // Effect template clicked
          }
        }
      }
    }

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
      // 🔥 FIX: Check if cursor is over a token archetype button
      // If so, don't drop the cursor slot - the button click handler will add tokens
      const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);

      // Check for archetype button using multiple selectors
      const archetypeButton = elementUnderCursor?.closest('[data-archetype-card]') as HTMLElement;
      const archetypeSettings = elementUnderCursor?.closest('[data-archetype-settings]') as HTMLElement;

      // Also check if clicking inside tokens panel
      const tokensPanel = elementUnderCursor?.closest('[data-tokens-panel]');

      // Check if clicking on a hand token
      const handToken = elementUnderCursor?.closest('[data-hand-token]') as HTMLElement;

      if (archetypeButton || archetypeSettings || tokensPanel || handToken) {
        return; // Let the archetype button handle the click
      }

      // 🔥 FIX: Check if we're currently adding a token from archetype
      // If so, don't drop the cursor slot immediately
      if (isAddingTokenRef.current) {
        return;
      }

      // 🔥 FIX: Check if cursor slot has items and drop them on click (not Shift)
      // This handles the second system (Shift+click, token archetype clicks, character token)
      // Use cursorSlotRef.current instead of state.objects for immediate consistency
      const actuallyHasItems = cursorSlotRef.current.length > 0;

      // Drop cursor slot on click (without Shift) - works for both objects and empty space
      if (!e.shiftKey && actuallyHasItems) {
        e.preventDefault();
        e.stopPropagation();
        dropCursorSlot(e.clientX, e.clientY, props);
        cursorSlotLastAddedRef.current = Date.now();
        // Clear drag threshold to prevent blocking future drags
        dragThresholdRef.current = {
          initialX: 0,
          initialY: 0,
          targetId: null,
          addedToSlot: false,
          skipThreshold: false
        };
        return;
      }

      // Pan view: Ctrl + left mouse drag on empty space
      // Special handling for marker tool: check if cursor is over a drawing
      if ((e.ctrlKey || e.metaKey) && e.button === 0 && scrollContainerRef.current) {
        // For marker/eraser tools, check if cursor is over a drawing
        if (currentTool === 'marker' || currentTool === 'eraser') {
          const rect = scrollContainerRef.current.getBoundingClientRect();
          const scrollX = viewTransform?.scroll?.x || 0;
          const scrollY = viewTransform?.scroll?.y || 0;
          const worldX = p2v(e.clientX - rect.left + scrollX);
          const worldY = p2v(e.clientY - rect.top + scrollY);

          // Get all drawings from state
          const allObjects = Object.values(state.objects) as TableObject[];
          const drawings = allObjects.filter((obj): obj is Drawing =>
            obj.type === ItemType.DRAWING && obj.isOnTable
          );

          // Check if cursor is over a drawing
          const clickedDrawing = findDrawingAtPosition(worldX, worldY, drawings);

          if (clickedDrawing) {
            // Cursor is over a drawing - let DrawingCanvas handle the drag
            // Don't start panning, don't return (let DrawingCanvas receive the event)
            return;
          }

          // Cursor is NOT over a drawing - start panning
          panStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            scrollX,
            scrollY
          };
          setIsPanning(true);
          return;
        }

        // For other tools, just pan normally
        const scrollX = viewTransform?.scroll?.x || 0;
        const scrollY = viewTransform?.scroll?.y || 0;
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          scrollX,
          scrollY
        };
        setIsPanning(true);
        return;
      }

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

    // 🔥 FIX: All objects are shared - anyone can move them regardless of ownership
    // Only check if explicitly locked or being dragged by another player
    if (obj.locked) {
      return;
    }
    // Check if object is being dragged by another player
    if (obj.isDragging && obj.dragOwnerId && obj.dragOwnerId !== activePlayerId) {
      return;
    }

    const isOwner = !(obj as any).ownerId || (obj as any).ownerId === activePlayerId || isGM;

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
    // 🔥 FIX: Use cursorSlotRef.current for immediate consistency
    // This works for BOTH systems: first (drag threshold) and second (Shift+click, token archetype clicks)
    // cursorSlotRef is updated synchronously in all event handlers
    const actuallyHasItems = cursorSlotRef.current.length > 0;

    // REGULAR CLICK (no shift): if slot has items, drop them
    if (!e.shiftKey && actuallyHasItems) {
      e.preventDefault();
      e.stopPropagation();
      dropCursorSlot(e.clientX, e.clientY, props);
      cursorSlotLastAddedRef.current = Date.now();
      // Clear drag threshold to prevent blocking future drags
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false,
        skipThreshold: false
      };
      return;
    }

    // SHIFT+CLICK: add to slot immediately (accumulate multiple items)
    // BOARD is excluded - never added to slot via shift+click
    // EFFECT_TEMPLATE is now supported via shift+click
    // Disabled when Ctrl is held (used for panning)
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && obj && obj.type !== ItemType.BOARD && (
      obj.type === ItemType.CARD ||
      obj.type === ItemType.TOKEN ||
      obj.type === ItemType.COUNTER ||
      obj.type === ItemType.EFFECT_TEMPLATE
    )) {
      e.preventDefault();
      e.stopPropagation();
      addToCursorSlotLocal(objId, obj, { x: e.clientX, y: e.clientY }, props, 'shift');
      return;
    }

    // Handle left-click for dragging
    // IMPORTANT: Regular click (without Shift) does NOT add objects to cursor slot
    if (e.button === 0) {
      // Check if object is already in cursor slot
      // 🔥 FIX: Use cursorSlotRef.current instead of cursorSlot to get the latest value
      // cursorSlot from closure may be stale after RAF updates
      const actuallyInSlot = cursorSlotRef.current.some(item => item.id === objId);
      if (actuallyInSlot) {
        e.stopPropagation();
        return;
      }

      // Check if this is a UI object (panel/window) - moves immediately without threshold
      // Disabled when Ctrl is held (used for panning)
      const isUIObject = obj?.type === ItemType.PANEL || obj?.type === ItemType.WINDOW;

      if (isUIObject && !e.ctrlKey && !e.metaKey) {

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

        // UI objects (panels/windows) are ALWAYS pinned - never unpin them
        // They use screen coordinates directly, no conversion needed
        return;
      }

      // For game objects (cards, tokens, boards, decks):
      // WITHOUT Shift: set up drag threshold for normal dragging (NOT cursor slot)
      // WITH Shift: objects are added to cursor slot above (no drag threshold needed)


      // Don't set up drag threshold when Ctrl is held (used for panning)
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      // Clear stale drag threshold - prevents blocking future drags
      // Case 1: Clicking on a different object
      if (dragThresholdRef.current.targetId &&
          dragThresholdRef.current.targetId !== objId) {
        const staleObj = state.objects[dragThresholdRef.current.targetId];
        if (!staleObj || staleObj.locked || (staleObj as any).inCursorSlot === false) {
          dragThresholdRef.current = {
            initialX: 0,
            initialY: 0,
            targetId: null,
            addedToSlot: false,
            skipThreshold: false
          };
        }
      }
      // Case 2: Clicking on the same object that was just dropped
      if (dragThresholdRef.current.targetId === objId) {
        const currentObj = state.objects[objId];
        if (currentObj && (currentObj as any).inCursorSlot === false) {
          dragThresholdRef.current = {
            initialX: 0,
            initialY: 0,
            targetId: null,
            addedToSlot: false,
            skipThreshold: false
          };
        }
      }

      // 🔥 FIX: Check if object was just dropped from cursor slot
      // Set up drag threshold to distinguish clicks from drags
      dragThresholdRef.current = {
        initialX: e.clientX,
        initialY: e.clientY,
        targetId: objId,
        addedToSlot: false,
        skipThreshold: false
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

  // Double click handler - executes configured doubleClickAction or rolls dice
  const handleDoubleClick = useCallback((e: React.MouseEvent, obj: TableObject) => {
    if (!obj) return;

    // Handle dice objects - always roll only the clicked dice
    if (obj.type === ItemType.DICE_OBJECT) {
      e.stopPropagation();
      // Roll single dice regardless of group membership or locked state
      dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: obj.id, rollGroup: false } });
      return;
    }

    // Get doubleClickAction for the object
    let doubleClickAction: string | undefined;

    if (obj.type === ItemType.CARD) {
      // Cards inherit from their deck
      const card = obj as CardType;
      if (card.deckId) {
        const deck = state.objects[card.deckId] as DeckType | undefined;
        doubleClickAction = deck?.cardDoubleClickAction;
      }
    } else {
      // Other objects use their own doubleClickAction
      doubleClickAction = (obj as any).doubleClickAction;
    }

    // 🔥 FIX: Allow double-click on locked objects for ALL players
    // Double-click actions should work regardless of lock state (e.g., flip, show tooltip)
    // Individual actions may have their own permission checks

    if (doubleClickAction && doubleClickAction !== 'none') {
      e.stopPropagation();

      console.log('[handleDoubleClick] obj.id:', obj.id, 'action:', doubleClickAction, 'obj.locked:', obj.locked);

      // 🔥 FIX: Make pin action toggle on double-click
      // 'lock' action already toggles (handleLock uses !obj.locked)
      // But pin needs special handling
      let actionToExecute = doubleClickAction;
      if ((doubleClickAction === 'pin' || doubleClickAction === 'pinToViewport') && (obj as any).isPinnedToViewport) {
        // Already pinned - unpin it
        actionToExecute = 'unpinFromViewport';
      }

      // Create action context for executeClickAction
      const actionContext: ActionHandlerContext = {
        dispatch,
        state: {
          objects: state.objects,
          activePlayerId,
          diceGroups: state.diceGroups,
          viewTransform
        },
        additionalHandlers: {
          onDeleteCandidate: setDeleteCandidateId,
          onOpenSearchDeck: setSearchModalDeck,
          onOpenTopDeckModal: setTopDeckModalDeck
        },
        isGM,
        isShiftPressed
      };

      executeClickAction(obj, actionToExecute, actionContext, e);
    }
  }, [state.objects, state.diceGroups, activePlayerId, isGM, isShiftPressed, dispatch, viewTransform, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck]);

  // RAF ref for throttling mouse move updates
  const rafRef = useRef<number>();

  // Refs to store latest mouse position for RAF callback (board resize needs this)
  // This ensures RAF callback always has the most recent mouse position
  const latestMouseEventRef = useRef<{ clientX: number; clientY: number } | null>(null);

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
    // Store latest mouse position for RAF callback (board resize needs this)
    latestMouseEventRef.current = { clientX: e.clientX, clientY: e.clientY };
    // Handle panning with Shift + drag
    if (isPanning && panStartRef.current && scrollContainerRef.current) {
      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;

      const newScrollX = panStartRef.current.scrollX - deltaX;
      const newScrollY = panStartRef.current.scrollY - deltaY;

      // Apply scroll constraints
      const constrained = clampScrollToPlayableArea(
        newScrollX,
        newScrollY,
        scrollContainerRef.current.clientWidth,
        scrollContainerRef.current.clientHeight,
        pixelsPerVU
      );

      scrollContainerRef.current.scrollLeft = constrained.x;
      scrollContainerRef.current.scrollTop = constrained.y;

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
      return;
    }

    // 🔥 FIX: Handle board resizing SYNCHRONOUSLY for maximum responsiveness
    // Update ref immediately on every mousemove (no throttle)
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

          // Update ref and state immediately for smooth visual feedback
          liveResizeSizeRef.current = { width: newWidth, height: newHeight };
          setLivePreviewSize({ width: newWidth, height: newHeight });
        }
      }
    }

    // Store current mouse position for RAF callback
    const currentMouseX = e.clientX;
    const currentMouseY = e.clientY;

    // 🔥 FIX: Store old position before updating ref for RAF comparison
    const oldPosition = cursorPositionRef.current?.x !== undefined ? { x: cursorPositionRef.current.x, y: cursorPositionRef.current.y } : null;

    // 🔥 FIX: Always update cursor position ref, even when cursor slot is empty
    // This ensures cursorPosition is available when objects are added to cursor slot
    if (cursorPositionRef.current?.x !== currentMouseX || cursorPositionRef.current?.y !== currentMouseY) {
      // Always update ref immediately for smooth dragging
      cursorPositionRef.current = { x: currentMouseX, y: currentMouseY };
    }

    // Update cursor slot position
    // 🔥 FIX: Use cursorSlotRef.current (source of truth)
    if (cursorSlotRef.current.length > 0) {
      // 🔥 FIX: Clear justPickedUpFromHand flag only after cursor moves sufficient distance
      // This prevents accidental drop when cursor jitters after Shift+click pickup
      const DRAG_THRESHOLD_PX = 20; // Minimum distance to clear the flag
      let clearedFlag = false;
      cursorSlotRef.current.forEach(item => {
        if ((item as any).justPickedUpFromHand && (item as any).pickupPosition) {
          const pickupPos = (item as any).pickupPosition;
          const dx = e.clientX - pickupPos.x;
          const dy = e.clientY - pickupPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance >= DRAG_THRESHOLD_PX) {
            (item as any).justPickedUpFromHand = false;
            clearedFlag = true;
          }
        }
      });
    }

    // 🔥 FIX: Throttle cursor slot updates using RAF (not board resize)
    // Board resize is now synchronous (above), cursor slot still throttled
    if (rafRef.current === undefined) {
      rafRef.current = requestAnimationFrame(() => {
        // 🔥 FIX: Use oldPosition for comparison since cursorPositionRef.current was already updated
        if (oldPosition?.x !== currentMouseX || oldPosition?.y !== currentMouseY) {
          setCursorPosition({ x: currentMouseX, y: currentMouseY });
        }

        // Update cursor slot position
        // 🔥 FIX: Use cursorSlotRef.current (source of truth)
        if (cursorSlotRef.current.length > 0) {
          // Dispatch events for HandPanel and MainMenu to detect hover
          const eventData = {
            x: currentMouseX,
            y: currentMouseY,
            isOverMainMenu: false,
            hasCards: cursorSlotRef.current.length > 0,
            items: cursorSlotRef.current.map(item => ({ type: item.type }))
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
          const elementAtCursor = document.elementFromPoint(currentMouseX, currentMouseY);
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
        }

        rafRef.current = undefined;
      });
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
    // DISABLED for Ctrl: Ctrl+drag is used for panning
    if (dragThresholdRef.current.targetId && !isShiftPressed && !isCtrlPressed) {
      const { addedToSlot, skipThreshold, targetId, initialX, initialY } = dragThresholdRef.current;

      // Log only every 30th move to reduce spam (throttled logging)
      if (!dragThresholdRef.current.logCounter) {
        dragThresholdRef.current.logCounter = 0;
      }
      dragThresholdRef.current.logCounter++;

      // Case 1: Item already added to slot via threshold drag (skip to prevent duplicate adds)
      if (addedToSlot && !skipThreshold) {
        // Skip
      }
      // Case 2: Skip threshold check for items already in cursor slot (from PLAY_TOP_CARD, etc.)
      else if (skipThreshold) {
        // Item is already in cursor slot, no need to add it again
        // Just continue - the item is ready to be dragged/dropped
      }
      // Case 3: Check threshold for normal table objects
      else if (!addedToSlot) {
        const obj = state.objects[targetId];

        if (obj) {
          // Convert 2 VU to pixels for threshold check
          const thresholdPixels = 2 * pixelsPerVU;
          const deltaX = e.clientX - initialX;
          const deltaY = e.clientY - initialY;
          const hasExceededThreshold = Math.abs(deltaX) > thresholdPixels || Math.abs(deltaY) > thresholdPixels;

          if (hasExceededThreshold) {
            // Mark as added to prevent duplicate adds
            dragThresholdRef.current.addedToSlot = true;

            // Add object to cursor slot (same as shift+click)
            addToCursorSlotLocal(targetId, obj, { x: e.clientX, y: e.clientY }, props, 'hold');
          }
        } else {
          // Object not found in state, skip
        }
      }
    } else {
      // Log only occasionally why threshold check is not running (every 50th move)
      if (!dragThresholdRef.current.skipLogCounter) {
        dragThresholdRef.current.skipLogCounter = 0;
      }
      dragThresholdRef.current.skipLogCounter++;
      const shouldLogSkip = dragThresholdRef.current.skipLogCounter % 50 === 0;

    }

    // 🔥 FIX: If cursor slot has items but no dragThresholdRef is set,
    // the items were added via PLAY_TOP_CARD or similar action.
    // Set up dragThresholdRef so they can be properly dragged/dropped.
    if (!dragThresholdRef.current.targetId && cursorSlotRef.current.length > 0 && !isShiftPressed && !isCtrlPressed) {
      // Use the first item in cursor slot as the target
      const firstItem = cursorSlotRef.current[0];
      const obj = state.objects[firstItem.id];

      if (obj) {
        // Object is actually in cursor slot - set up dragThresholdRef
        dragThresholdRef.current = {
          initialX: e.clientX,
          initialY: e.clientY,
          targetId: firstItem.id,
          addedToSlot: false,  // Don't skip drag logic
          skipThreshold: true  // Skip threshold check (already in slot)
        };
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

        // Check if this object was originally pinned (before drag started)
        // Pinned panels are temporarily unpinned during drag, so we check the ref
        const wasOriginallyPinned = unpinnedDuringDragRef.current.has(currentDraggingId);

        // Get actual panel dimensions from DOM for accurate magnetism
        let panelWidth = (obj as any).width || 400;
        let panelHeight = (obj as any).height || 300;
        let fromDOM = false;

        const panelElement = document.querySelector(`[data-ui-object="${currentDraggingId}"]`) as HTMLElement;
        if (panelElement) {
          const actualWidth = panelElement.offsetWidth;
          const actualHeight = panelElement.offsetHeight;
          if (actualWidth > 0) {
            panelWidth = actualWidth;
            fromDOM = true;
          }
          if (actualHeight > 0) {
            panelHeight = actualHeight;
            fromDOM = true;
          }
        }

        // Convert VU to pixels if not already from DOM (DOM values are already in pixels)
        // For unpinned panels: width/height are in VU, convert using pixelsPerVU
        // For pinned panels: width/height may be in pixels (from resize), but DOM is preferred
        if (!fromDOM) {
          // Check if this panel was originally pinned (has stored pixel dimensions)
          if (wasOriginallyPinned && (obj as any).pinnedPixelWidth) {
            // Pinned panel with stored pixel dimensions
            panelWidth = (obj as any).pinnedPixelWidth || panelWidth;
            panelHeight = (obj as any).pinnedPixelHeight || panelHeight;
          } else {
            // Unpinned panel or pinned panel without stored dimensions: convert VU to pixels
            // This matches UIObjectRendererOptimized.tsx: containerWidth = vuToPx(effectiveProps.width)
            panelWidth = panelWidth * pixelsPerVU;
            panelHeight = panelHeight * pixelsPerVU;
          }
        }

        // Collect other panel bounds for panel-to-panel snapping
        const otherPanels: PanelBounds[] = [];
        const scrollX = viewTransform?.scroll?.x || 0;
        const scrollY = viewTransform?.scroll?.y || 0;
        const zoom = viewTransform?.zoom || 1;

        for (const [id, otherObj] of Object.entries(state.objects)) {
          if (id === currentDraggingId) continue;
          if ((otherObj as TableObject).type !== ItemType.PANEL && (otherObj as TableObject).type !== ItemType.WINDOW) continue;
          if (!((otherObj as any).visible)) continue;

          // Get panel bounds in screen coordinates
          let px, py, pwidth, pheight;

          // Convert ALL panels to screen coordinates for magnetism
          // Current panel's newX/newY are in screen pixels (from e.clientX)
          if ((otherObj as any).isPinnedToViewport) {
            // Pinned panels: use pinnedScreenPosition (stored screen coords)
            // obj.x/y may be in world coords after repinning, so we use pinnedScreenPosition
            const pinnedPos = (otherObj as any).pinnedScreenPosition || { x: (otherObj as TableObject).x, y: (otherObj as TableObject).y };
            px = pinnedPos.x;
            py = pinnedPos.y;
            // For pinned panels, width/height are already in pixels (from DOM resize)
            // Use pinnedPixelWidth/Height if available, otherwise fall back to width/height
            pwidth = ((otherObj as any).pinnedPixelWidth || (otherObj as any).width || 400);
            pheight = ((otherObj as any).pinnedPixelHeight || (otherObj as any).height || 300);
          } else {
            // Unpinned panels: x/y are in world coordinates, width/height in VU
            // Must match UIObjectRendererOptimized.tsx formula: left = (x - offset.x) / zoom
            // where offset.x = scroll.x
            const otherWidth = (otherObj as any).width || 400;
            const otherHeight = (otherObj as any).height || 300;

            // For unpinned panels, width/height are in VU, convert to pixels using pixelsPerVU
            // This matches UIObjectRendererOptimized.tsx: containerWidth = vuToPx(effectiveProps.width)
            pwidth = otherWidth * pixelsPerVU;
            pheight = otherHeight * pixelsPerVU;

            // Convert position from world to screen - matching UIObjectRendererOptimized
            px = (otherObj.x - scrollX) / zoom;
            py = (otherObj.y - scrollY) / zoom;
          }

          // Add all panels (don't filter by screen visibility - panels may be partially off-screen)
          otherPanels.push({ id, x: px, y: py, width: pwidth, height: pheight });
        }

        // Apply magnetism for ALL UI panels in screen coordinates (including panel-to-panel snapping)
        // Get actual scrollbar width from game container
        let actualScrollbarWidth = 0;
        let gameSpaceBottom = window.innerHeight;
        let gameSpaceRight = window.innerWidth;

        if (scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          // Get actual scrollbar width from container dimensions
          actualScrollbarWidth = container.offsetWidth - container.clientWidth;
          // Get bottom edge of scrollable area (top edge of bottom scrollbar)
          const rect = container.getBoundingClientRect();
          gameSpaceBottom = rect.bottom - actualScrollbarWidth;
          gameSpaceRight = rect.right - actualScrollbarWidth;
        }

        const gameSpaceBounds: GameSpaceBounds = {
          left: 0,
          top: 0,
          right: gameSpaceRight,
          bottom: gameSpaceBottom
        };

        const magnetismConfig: MagnetismConfig = {
          enabled: true,
          snapThreshold: 15,
          snapToLeft: true,
          snapToRight: true,
          snapToTop: true,
          snapToBottom: true,
          scrollbarWidth: actualScrollbarWidth,
        };

        const magnetismResult = applyPanelToPanelMagnetism(
          newX,
          newY,
          panelWidth,
          panelHeight,
          window.innerWidth,
          window.innerHeight,
          otherPanels,
          currentDraggingId,
          magnetismConfig,
          gameSpaceBounds
        );

        newX = magnetismResult.x;
        newY = magnetismResult.y;

        // UI objects (panels/windows) are ALWAYS pinned - use screen coordinates directly
        // No conversion needed - newX/newY are already in screen pixels from e.clientX
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: currentDraggingId,
            updates: {
              x: newX,
              y: newY,
              pinnedScreenPosition: { x: newX, y: newY }  // Keep pinnedScreenPosition in sync
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
        // Check if this is a UI object (panel/window) - these are per-player and should never sync
        const isUIObject = obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW;
        // Check if object is on a hyperscale layer with individualObjects enabled
        const individualLayerId = obj.hyperscaleLayerId || 'tokens';
        const individualLayer = hyperscaleLayers.find(l => l.id === individualLayerId);
        const isIndividualObjectsLayer = individualLayer?.individualObjects === true;

        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: currentDraggingId,
            isDragging: true,
            dragOwnerId: activePlayerId
          },
          // Don't sync SET_DRAGGING for UI objects or objects on individual position layers
          _localOnly: isUIObject || isIndividualObjectsLayer
        });
      }
    }
  }, [
    cursorSlot.length,
    setCursorPosition,
    cursorPositionRef,
    isPanning,
    panStartRef,
    setScroll,
    pixelsPerVU,
    viewTransform,
    dispatch,
    currentTool,
    rulerStart,
    setRulerCurrent,
    draggingId,
    dragOffsetRef,
    dragThresholdRef,
    state.objects,
    scrollContainerRef,
    p2v,
    activePlayerId,
    resizingId,
    resizeStart,
    liveResizeSizeRef,
    setLivePreviewSize,
    isShiftPressed,
    isCtrlPressed,
    props
  ]);

  // Mouse up handler
  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Handle panning: stop panning on mouse up
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      return;
    }

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
        // Check if object is on a hyperscale layer with individualObjects enabled
        const individualLayerId = obj.hyperscaleLayerId || 'tokens';
        const individualLayer = hyperscaleLayers.find(l => l.id === individualLayerId);
        const isIndividualObjectsLayer = individualLayer?.individualObjects === true;

        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: currentDraggingId,
            isDragging: false,
            dragOwnerId: null
          },
          // Don't sync SET_DRAGGING for objects on individual position layers
          _localOnly: isIndividualObjectsLayer
        });
      }

      // For UI objects, update playerPanelSettings to sync position
      if (obj && (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW)) {
        // Get current playerPanelSettings to preserve other properties
        const currentSettings = state.playerPanelSettings?.[activePlayerId]?.[currentDraggingId];

        // Get current visual size from DOM to preserve the actual rendered size
        // This ensures that after resize, the panel keeps its new size when dragged
        let currentWidth = currentSettings?.width ?? obj.width;
        let currentHeight = currentSettings?.height ?? obj.height;

        const panelElement = document.querySelector(`[data-ui-object="${currentDraggingId}"]`) as HTMLElement;
        if (panelElement) {
          const rect = panelElement.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const isPinned = (obj as any).isPinnedToViewport || false;
            // For pinned panels, use pixel values directly
            // For unpinned panels, convert pixels to VU
            if (isPinned) {
              currentWidth = rect.width;
              currentHeight = rect.height;
            } else {
              // Use pixelsPerVU from viewTransform for proper conversion
              const actualPixelsPerVU = viewTransform?.pixelsPerVU ?? 1;
              currentWidth = Math.round((rect.width / actualPixelsPerVU) * 1000) / 1000;
              currentHeight = Math.round((rect.height / actualPixelsPerVU) * 1000) / 1000;
            }
          }
        }

        // Update the object itself with the new size (as _localOnly)
        // This ensures obj.width/height stay in sync with visual size
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: currentDraggingId,
            width: currentWidth,
            height: currentHeight,
          },
          _localOnly: true
        });

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
              // Use current visual size from DOM instead of saved size
              width: currentWidth,
              height: currentHeight,
              minimized: currentSettings?.minimized ?? (obj as any).minimized ?? false,
              // UI objects are ALWAYS pinned - never set to false
              isPinnedToViewport: true,
            }
          }
        });

        // If object was unpinned during drag, repin it
        if (unpinnedDuringDragRef.current.has(currentDraggingId)) {

          const scrollX = viewTransform?.scroll?.x || 0;
          const scrollY = viewTransform?.scroll?.y || 0;
          const zoom = viewTransform?.zoom || 1;

          // Convert world coords to screen coords for pinning
          // obj.x/y are in world coords (after proper unpinning conversion)
          // Formula: screen = (world - scroll) / zoom
          const screenX = (obj.x - scrollX) / zoom;
          const screenY = (obj.y - scrollY) / zoom;

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
        addedToSlot: false,
        skipThreshold: false
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
      setLivePreviewSize(null);
      setResizingId(null);
      setResizeStart(null);
    }

    // 🔥 FIX: Save these values BEFORE clearing dragThresholdRef
    // This preserves the information about how the item was added to the slot
    const wasAddedViaDragThreshold = dragThresholdRef.current.addedToSlot === true;
    const targetIdFromThreshold = dragThresholdRef.current.targetId;

    if (dragThresholdRef.current.targetId) {
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false,
        skipThreshold: false
      };
    }

    // 🔥 FIX: Handle cursor slot dropping when clicking on an object that's in the slot
    // This clears stale cursorSlot to prevent future issues
    const isShiftHeld = e?.shiftKey === true;
    const clickedOnSlotObject = targetIdFromThreshold && cursorSlotRef.current.some(item => item.id === targetIdFromThreshold);
    const isFromHand = clickedOnSlotObject && cursorSlotRef.current.find(item => item.id === targetIdFromThreshold && (item as any).isFromHand);

    // 🔥 FIX: Check if cursorSlotSource indicates archetype tokens
    // If source is 'shift' or 'archetype', don't clear the slot
    const isFromArchetypeSource = cursorSlotSource === 'shift' || cursorSlotSource === 'archetype';

    // 🔥 FIX: Only clear cursorSlot WITHOUT dropping if:
    // 1. Object was NOT added via drag threshold (i.e., it was added via Shift+click or archetype click)
    // 2. Object is from hand (should not be dropped immediately)
    // 3. NOT from archetype source (don't clear when adding from archetype panel)
    if (clickedOnSlotObject && !isFromHand && !wasAddedViaDragThreshold && !isFromArchetypeSource) {
      cursorSlotRef.current = [];
      setCursorSlot([]);
      setCursorPosition(null);
      cursorPositionRef.current = null;
      setCursorSlotSource(null);
      // Don't continue to drop logic below
      return;
    }

    // 🔥 FIX: Handle cursor slot dropping for items in slot
    // This works for BOTH systems - if slot has items on mouseup, drop them
    // (unless Shift is held or item was just picked up from hand)
    const hasJustPickedUpFromHand = cursorSlotRef.current.some(item => (item as any).justPickedUpFromHand === true);
    const hasItemsInSlot = cursorSlotRef.current.length > 0;

    // 🔥 FIX: Don't drop if we're currently adding a token from archetype
    // Check if cursor is over an archetype button, tokens panel
    // 🔥 REMOVED: handToken check - was preventing drop of items from cursor slot when picked up from hand
    const elementUnderCursor = e ? document.elementFromPoint(e.clientX, e.clientY) : null;
    const archetypeButton = elementUnderCursor?.closest('[data-archetype-card]') as HTMLElement;
    const tokensPanel = elementUnderCursor?.closest('[data-tokens-panel]') as HTMLElement;

    const isAddingFromArchetype = isAddingTokenRef.current || archetypeButton || tokensPanel;

    const shouldDropOnMouseUp = hasItemsInSlot && !isShiftHeld && !hasJustPickedUpFromHand && !isAddingFromArchetype && !isFromArchetypeSource && e;

    if (shouldDropOnMouseUp) {
      dropCursorSlot(e.clientX, e.clientY, props);
      cursorSlotLastAddedRef.current = Date.now();
    }

    // 🔥 SAFETY: Always clear dragThresholdRef at the end of handleMouseUp
    // This prevents stale references from blocking future drags
    if (dragThresholdRef.current.targetId) {
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false,
        skipThreshold: false
      };
    }
  }, [
    isPanning,
    setIsPanning,
    panStartRef,
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
    setCursorSlot,
    setCursorSlotSource,
    cursorSlotSource,
    props,
    resizingId,
    resizeStart,
    liveResizeSizeRef,
    setLivePreviewSize,
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
        // Check if object is on a hyperscale layer with individualObjects enabled
        const individualLayerId = obj.hyperscaleLayerId || 'tokens';
        const individualLayer = hyperscaleLayers.find(l => l.id === individualLayerId);
        const isIndividualObjectsLayer = individualLayer?.individualObjects === true;

        dispatch({
          type: 'SET_DRAGGING',
          payload: {
            id: draggingId,
            isDragging: false,
            dragOwnerId: null
          },
          // Don't sync SET_DRAGGING for objects on individual position layers
          _localOnly: isIndividualObjectsLayer
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
        addedToSlot: false,
        skipThreshold: false
      };

      dragOffsetRef.current = null;
      setDraggingId(null);
    }
  }, [
    draggingId,
    state.objects,
    hyperscaleLayers,
    dispatch,
    dragThresholdRef,
    dragOffsetRef,
    setDraggingId
  ]);

  // Handle cursor-slot-drop-to-tabletop event from pool panels
  useEffect(() => {
    const handleDropFromPool = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number; y: number }>;

      // IMPORTANT: Use cursorSlot as source of truth, NOT state.objects.inCursorSlot
      // state.objects may not be updated yet due to React's batched updates
      if (props.cursorSlot.length > 0) {
        // Skip pool panel check since this event comes from pool panel
        // (pool panel already determined cursor is NOT over it)
        dropCursorSlot(customEvent.detail.x, customEvent.detail.y, props, true);
      }
    };

    window.addEventListener('cursor-slot-drop-to-tabletop', handleDropFromPool);
    return () => {
      window.removeEventListener('cursor-slot-drop-to-tabletop', handleDropFromPool);
    };
  }, [props.cursorSlot, props]);

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

  // Clear drag threshold when objects are dropped (from hand, deck, etc.)
  useEffect(() => {
    const handleCursorSlotDropped = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardIds: string[] }>;
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false,
        skipThreshold: false
      };
    };

    window.addEventListener('cursor-slot-dropped', handleCursorSlotDropped);
    return () => {
      window.removeEventListener('cursor-slot-dropped', handleCursorSlotDropped);
    };
  }, []);

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