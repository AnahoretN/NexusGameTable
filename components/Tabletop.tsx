
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { useLocalSettings } from '../hooks/useLocalSettings';
import { ItemType, CardLocation, TableObject, Card as CardType, Token, Token as TokenType, TokenType as TokenArchetype, DiceObject, Randomizer, Counter, TokenShape, GridType, CardPile, Deck as DeckType, CardOrientation, CardShape, PanelObject, WindowObject, BattlefieldCell, Board, Board as BoardType, NexusBoard, NexusCellObject, HexDirection } from '../types';
import { Card } from './Card';
import { ContextMenu } from './ContextMenu';
import { executeContextMenuAction } from '../utils/contextMenuActions';
import { PileContextMenu } from './PileContextMenu';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SearchDeckModal } from './SearchDeckModal';
import { TopDeckModal } from './TopDeckModal';
import { DeckComponent } from './DeckComponent';
import { UIObjectRendererMemo } from './UIObjectRenderer';
import { executeActionButtonUniversal, ActionButtonsHandlerContext } from '../utils/actionButtonsHandler';
import { Tooltip } from './Tooltip';
import { DrawingCanvas } from './DrawingCanvas';
import { SvgTokenShape } from './SvgTokenShape';
import { SvgDeckShape, DeckLabel, shouldUseSvgForDeck } from './SvgDeckShape';
import { BoardWithResizeMemo } from './Tabletop/BoardWithResize';
import { NexusBoardMemo } from './NexusBoard';
import { Layers, Lock, Unlock, Minus, Plus, Search, RefreshCw, Trash2, Copy, ChevronsUpDown, Pin } from 'lucide-react';
import { useDragOverStore } from '../store/dragOverState';
import { PLAYABLE_AREA_SIZE } from '../constants';
import { generateUUID } from '../utils/uuid';
import { clampScrollToPlayableArea } from '../utils/viewportConstraints';
import { vuToPixels, pixelsToVu } from '../utils/vuSystem';
import { CursorSlotVisualization } from './CursorSlotVisualization';
import {
  calculatePoolDropPosition,
  dropObjectsToPool,
  createPoolZoneFromPanel
} from '../utils/poolPlacement';
// import { RemoteObjectAnimation, useRemoteObjectAnimation } from './RemoteObjectAnimation';
import { PinnedIndicator } from './PinnedIndicator';
import { ObjectActionButtons } from './ObjectActionButtons';
import {
  calculateFlexibleHexGrid,
  calculateHorizontalHexGrid,
  addObjectToCellMagnet,
  removeObjectFromCellMagnet,
  removeObjectFromGridCellMagnet,
  findCellForSnappedObject,
  calculateMagnetPointPositions,
  getHexCenterAtPixel,
  calculateGridCellMagnetPositions,
  addObjectToGridCellMagnet,
  generateGridCellKey,
  parseGridCellKey,
  calculateGridCellCenter
} from '../utils/gridUtils';

export const Tabletop: React.FC = () => {
  const { state, dispatch, isHost } = useGame();
  const { settings: localSettings } = useLocalSettings();
  const { setDraggingOver, clearDraggingOver } = useDragOverStore();

  // Ref to access dragOver state efficiently in mousemove handler
  const dragOverStoreRef = useRef<ReturnType<typeof useDragOverStore.getState> | null>(null);

  // Get the base pixelsPerVU conversion factor
  const basePixelsPerVU = state.viewTransform?.pixelsPerVU ?? 1.08;
  // Local zoom multiplier (100 = default, 150 = 50% larger objects, etc.)
  const zoomMultiplier = (localSettings.zoom ?? 100) / 100;

  // Helper to get zoom scale for a specific layer (returns 1 if zoom disabled for layer)
  const getLayerZoomScale = useCallback((layerId: string): number => {
    const layer = state.hyperscaleLayers.find(l => l.id === layerId);
    const zoomEnabled = layer?.zoomEnabled ?? true;
    return zoomEnabled ? zoomMultiplier : 1;
  }, [zoomMultiplier, state.hyperscaleLayers]);

  // Helper to get inverse scale for layers without zoom (to cancel out global zoom)
  const getLayerInverseScale = useCallback((layerId: string): number => {
    const scale = getLayerZoomScale(layerId);
    return scale !== zoomMultiplier ? (1 / zoomMultiplier) : 1;
  }, [getLayerZoomScale, zoomMultiplier]);

  // Helper to create positioning styles with layer zoom consideration
  const createPositionedStyle = useCallback(((
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex: number,
    layerId: string,
    additionalStyle: React.CSSProperties = {}
  ): React.CSSProperties => {
    const inverseScale = getLayerInverseScale(layerId);
    return {
      position: 'absolute' as const,
      left: x,
      top: y,
      width,
      height,
      zIndex,
      ...(inverseScale !== 1 && {
        transform: `scale(${inverseScale})`,
        transformOrigin: 'top left',
      }),
      ...additionalStyle,
    };
  }), [getLayerInverseScale]);

  // Apply zoom multiplier to pixelsPerVU (affects all calculations)
  const pixelsPerVU = useMemo(() => basePixelsPerVU * zoomMultiplier, [basePixelsPerVU, zoomMultiplier]);

  // Helper functions for vu ↔ pixel conversion (with zoom applied)
  const v2p = useCallback((vu: number) => vuToPixels(vu ?? 0, pixelsPerVU), [pixelsPerVU]);
  const p2v = useCallback((px: number) => pixelsToVu(px ?? 0, pixelsPerVU), [pixelsPerVU]);

  // Viewport state (offset is always 0,0 since native scroll handles panning)
  const offset = useMemo(() => ({ x: 0, y: 0 }), []);
  const [isPanning, setIsPanning] = useState(false);
  const [currentTool, setCurrentTool] = useState<string>('none');

  // Dragging state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingPile, setDraggingPile] = useState<{ pile: CardPile; deck: DeckType } | null>(null);
  // Note: isDraggingOverPool removed - using useDragOverStore global state instead

  // Shift key state for delete cursor
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Ctrl/Meta key state for hiding action buttons during pan view
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);

  // Ruler state
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerCurrent, setRulerCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isRulerRightClick, setIsRulerRightClick] = useState(false);

  // Resizing state for boards
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isOverResizeHandle, setIsOverResizeHandle] = useState(false);
  const [liveResizeSize, setLiveResizeSize] = useState<{ width: number; height: number } | null>(null); // Live preview during resize
  const liveResizeSizeRef = useRef<{ width: number; height: number } | null>(null); // Ref for immediate access
  const resizeThrottleRef = useRef<number | null>(null);
  const resizeFinalSizeRef = useRef<{ width: number; height: number } | null>(null);

  // Cursor slot state - holds cards, tokens, boards, and other objects picked up with Shift+click (max 100 items)
  // Stores full object data and removes objects from their original position
  const [cursorSlot, setCursorSlot] = useState<(CardType | TokenType | BoardType)[]>([]);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  // Ref for immediate cursor position updates (synchronous, for rendering slot items)
  const cursorPositionRef = useRef<{ x: number; y: number } | null>(null);
  // Track how items were added to cursor slot:
  // - 'shift' = Shift+click on board (drop only on click, not on mouseup)
  // - 'hold' = Long press or drag (drop on mouseup)
  // - 'archetype' = Click on token archetype in ToolsPanel (don't drop on normal click)
  const [cursorSlotSource, setCursorSlotSource] = useState<'ctrl' | 'hold' | 'archetype' | null>(null);

  // Ref to track when we're adding a token (prevent slot from being dropped during add)
  const isAddingTokenRef = useRef(false);

  // Local state to handle the visual "rapid change" animation of dice
  const [rollingDice, setRollingDice] = useState<Record<string, number>>({});

  // UI modal/menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject; shiftKey?: boolean } | null>(null);
  const [settingsModalObj, setSettingsModalObj] = useState<TableObject | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  // Pile context menu and search modal
  const [pileContextMenu, setPileContextMenu] = useState<{ x: number; y: number; pile: CardPile; deck: DeckType } | null>(null);
  const [searchModalDeck, setSearchModalDeck] = useState<DeckType | null>(null);
  const [searchModalPile, setSearchModalPile] = useState<CardPile | undefined>(undefined);
  const [topDeckModalDeck, setTopDeckModalDeck] = useState<DeckType | null>(null);
  const [pilesButtonMenu, setPilesButtonMenu] = useState<{ x: number; y: number; deck: DeckType } | null>(null);
  // NexusBoard add-cell UI state
  const [nexusBoardAddingCell, setNexusBoardAddingCell] = useState<string | null>(null);

  // Click-to-show tooltip state for cards
  const [clickTooltip, setClickTooltip] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const clickTooltipTimerRef = useRef<number | null>(null);
  const clickTooltipBoundsRef = useRef<{ left: number; right: number; top: number; bottom: number } | null>(null);

  // Hover state for deck/pile drop targets
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);
  const [hoveredPileId, setHoveredPileId] = useState<string | null>(null);

  // Refs
  const longPressTimerRef = useRef<number | null>(null);
  const cursorHoldTimerRef = useRef<number | null>(null); // Timer for 3ms hold before adding to cursor slot (deprecated, using drag threshold instead)
  const dragThresholdRef = useRef<{
    initialX: number;
    initialY: number;
    targetId: string | null;
    addedToSlot: boolean;
  }>({ initialX: 0, initialY: 0, targetId: null, addedToSlot: false });
  const lastLogTimeRef = useRef<number>(0); // Track last log time for throttling (500ms)
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartPositionRef = useRef<{ id: string; x: number; y: number } | null>(null); // Track initial position for network commit
  const pileDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const isPanningRef = useRef(false);
  const resizingIdRef = useRef<string | null>(null);
  const draggingPileRef = useRef<{ pile: CardPile; deck: DeckType } | null>(null);
  const cursorSlotRef = useRef<(CardType | TokenType | BoardType)[]>([]);
  // Track items currently being processed for adding to cursor slot to prevent duplicates
  const processingAddToSlotRef = useRef<Set<string>>(new Set());
  // Track objects that were recently in local cursor slot to prevent showing their shadow version
  // when another player hasn't synced the inCursorSlot: false state yet
  const [recentlyInMyCursorSlot, setRecentlyInMyCursorSlot] = useState<Set<string>>(new Set());
  const globalMousePosRef = useRef<{ x: number; y: number }>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  // Track when items were just dropped from cursor slot to prevent immediate re-pickup
  const justDroppedRef = useRef(false);
  const lastDropTimeRef = useRef(0);

  // Dice roll animation sync tracking
  const initiatedRollsRef = useRef<Set<string>>(new Set()); // Dice IDs we initiated rolls for
  const lastSeenRollStartTimeRef = useRef<Record<string, number>>({}); // Last rollStartTime per dice

  // Update refs when state changes
  useEffect(() => { draggingIdRef.current = draggingId; }, [draggingId]);
  useEffect(() => { isPanningRef.current = isPanning; }, [isPanning]);
  useEffect(() => { resizingIdRef.current = resizingId; }, [resizingId]);
  useEffect(() => { draggingPileRef.current = draggingPile; }, [draggingPile]);
  // Sync liveResizeSizeRef to liveResizeSize state for proper re-renders
  useEffect(() => {
    if (liveResizeSize) {
      liveResizeSizeRef.current = liveResizeSize;
    } else {
      liveResizeSizeRef.current = null;
    }
  }, [liveResizeSize]);
  // Sync cursorSlotRef - always sync to ensure consistency
  useEffect(() => {
    cursorSlotRef.current = cursorSlot;
  }, [cursorSlot]);

  // Track global mouse position for playTopCard and pool panel drag-over visualization
  useEffect(() => {
    let lastCheckTime = 0;
    const CHECK_THROTTLE = 200; // Check 5 times per second (enough for drag-over feedback)

    const handleMouseMove = (e: MouseEvent) => {
      // Store mouse position for other features (like playTopCard)
      globalMousePosRef.current = { x: e.clientX, y: e.clientY };

      // Check if we should hide click tooltip (mouse left the card)
      if (clickTooltip && clickTooltipBoundsRef.current) {
        const bounds = clickTooltipBoundsRef.current;
        const isInCard = e.clientX >= bounds.left && e.clientX <= bounds.right &&
                         e.clientY >= bounds.top && e.clientY <= bounds.bottom;
        if (!isInCard) {
          setClickTooltip(null);
          clickTooltipBoundsRef.current = null;
        }
      }

      // Throttle pool panel drag-over visualization checks
      const now = performance.now();
      if (now - lastCheckTime < CHECK_THROTTLE) return;
      lastCheckTime = now;

      // Only check if cursor slot has objects
      if (cursorSlot.length === 0) {
        if (dragOverStoreRef.current?.targetPoolPanelId) {
          clearDraggingOver();
          // IMPORTANT: Update ref immediately after clearing state
          dragOverStoreRef.current = useDragOverStore.getState();
        }
        return;
      }

      const cursorSlotObj = cursorSlot[0];
      const canPlaceInPool = cursorSlotObj && [
        ItemType.CARD,
        ItemType.TOKEN,
        ItemType.DECK,
        ItemType.DICE_OBJECT,
        ItemType.COUNTER,
        ItemType.BOARD
      ].includes(cursorSlotObj.type);

      if (!canPlaceInPool) {
        if (dragOverStoreRef.current?.targetPoolPanelId) {
          clearDraggingOver();
        }
        return;
      }

      // Find pool panel under cursor (simple check - just first panel under cursor)
      // IMPORTANT: Check [data-pool-content] which has the VISIBLE panel bounds, not [data-pool-panel]
      // which has the virtual space bounds (1000×1000 vu)
      const poolContentElements = document.querySelectorAll('[data-pool-content]');
      let foundPoolPanelId: string | null = null;

      // Get the source panel ID if object was picked up from a pool panel
      const sourcePoolPanelId = (cursorSlotObj as any)?.cursorSlotSourcePanel || (cursorSlotObj as any)?.fromPoolPanel;

      // Check if there are multiple pool panels (more than just the source)
      const hasMultiplePanels = poolContentElements.length > 1;

      for (const contentArea of poolContentElements) {
        const panelId = contentArea.getAttribute('data-pool-content');
        if (!panelId) continue;

        const panelObj = state.objects[panelId as string] as PanelObject | WindowObject | undefined;
        if (panelObj?.minimized) continue;

        // IMPORTANT: Skip the source pool panel ONLY if there are other panels available
        // If this is the only panel, allow drag-over for feedback
        if (panelId === sourcePoolPanelId && hasMultiplePanels) {
          continue;
        }

        // Use the visible content area bounds for accurate cursor detection
        const rect = contentArea.getBoundingClientRect();
        const isOver = e.clientX >= rect.left && e.clientX <= rect.right &&
                       e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (isOver) {
          foundPoolPanelId = panelId;
          break;
        }
      }

      // Update drag-over state for visual feedback
      if (foundPoolPanelId && foundPoolPanelId !== dragOverStoreRef.current?.targetPoolPanelId) {
        setDraggingOver(foundPoolPanelId, cursorSlotObj.id);
        // IMPORTANT: Update ref immediately after setting state
        dragOverStoreRef.current = useDragOverStore.getState();
      } else if (!foundPoolPanelId && dragOverStoreRef.current?.targetPoolPanelId) {
        clearDraggingOver();
        // IMPORTANT: Update ref immediately after clearing state
        dragOverStoreRef.current = useDragOverStore.getState();
      }
    };

    // Store reference to dragOver state for efficient access
    dragOverStoreRef.current = useDragOverStore.getState();

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [clickTooltip, cursorSlot, state.objects]);

  // Prevent native browser drag-and-drop on the tabletop
  useEffect(() => {
    const handleDragStart = (e: Event) => {
      e.preventDefault();
    };
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
    };

    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('dragstart', handleDragStart);
    container.addEventListener('selectstart', handleSelectStart);
    return () => {
      container.removeEventListener('dragstart', handleDragStart);
      container.removeEventListener('selectstart', handleSelectStart);
    };
  }, []);

  // Listen for add-to-cursor-slot events from other components (e.g., HandPanel)
  useEffect(() => {
    const handleAddToSlot = (e: Event) => {
      const startTime = performance.now();

      const customEvent = e as CustomEvent<{
        cardId: string;
        clientX: number;
        clientY: number;
        source?: 'ctrl' | 'hold';
        fromPoolPanel?: string;
        cardOverride?: any;
      }>;
      const { cardId, clientX, clientY, source = 'ctrl', fromPoolPanel, cardOverride } = customEvent.detail;

      const itemLookupStart = performance.now();
      const item = state.objects[cardId];

      if (!item) {
        return;
      }

      // IMPORTANT: Set dragThresholdRef.addedToSlot = true for events from pool panel/hand panel
      // This ensures wasThresholdReached is true when handleGlobalMouseUp processes the drop
      // Support both 'hold' (drag from panel) and 'shift' (Shift+click)
      if ((source === 'hold' || source === 'shift') && (fromPoolPanel || (item as any).location === CardLocation.HAND || (item as any).location === CardLocation.TABLE || (item as any).location === CardLocation.DECK)) {
        dragThresholdRef.current = {
          initialX: clientX,
          initialY: clientY,
          targetId: cardId,
          addedToSlot: true  // Mark as already added to slot
        };
      }

      if (cursorSlot.length >= 100) {
        return;
      }

      if (!item) {
        return;
      }

      // Check if item is already being processed
      if (processingAddToSlotRef.current.has(cardId)) {
        return;
      }

      // Check if item is already in cursor slot or already marked as inCursorSlot
      const alreadyInSlot = cursorSlot.some(slotItem => slotItem.id === cardId);
      const alreadyMarked = (item as any).inCursorSlot;

      if (alreadyInSlot || alreadyMarked) {
        return;
      }

      // Mark as being processed
      processingAddToSlotRef.current.add(cardId);

      // Set source based on how the item was added (only if slot was empty before)
      if (cursorSlot.length === 0) {
        setCursorSlotSource(source);
      }

      // Process immediately without setTimeout to ensure cursorSlot is updated before mouseup
      // This fixes the issue where handleGlobalMouseUp sees empty slot (hasItems: false)
        const processStart = performance.now();

        try {
        // Optimized clone - only copy properties needed for cursor slot rendering
        const cloneStart = performance.now();

        let itemClone: TableObject;

        if (item.type === ItemType.CARD) {
          const card = cardOverride || item as CardType;
          // Get deck to check orientation
          const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
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
            zIndex: card.zIndex ?? 0,
            hyperscaleLayerId: card.hyperscaleLayerId ?? 'cards',
            location: card.location, // IMPORTANT: Preserve location for proper deck/hand/pool detection
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
            zIndex: deck.zIndex ?? 0,
            hyperscaleLayerId: deck.hyperscaleLayerId ?? 'cards',
            locked: deck.locked,
          } as DeckType;
        } else if (item.type === ItemType.RANDOMIZER) {
          const randomizer = item as Randomizer;
          itemClone = {
            id: randomizer.id,
            type: ItemType.RANDOMIZER,
            name: randomizer.name,
            x: randomizer.x,
            y: randomizer.y,
            rotation: randomizer.rotation,
            width: randomizer.width,
            height: randomizer.height,
            content: randomizer.content,
            locked: randomizer.locked,
            isOnTable: randomizer.isOnTable,
            randomizerType: randomizer.randomizerType,
            currentValue: randomizer.currentValue,
            zIndex: randomizer.zIndex ?? 0,
            hyperscaleLayerId: randomizer.hyperscaleLayerId ?? 'tokens',
          } as Randomizer;
        } else if (item.type === ItemType.COUNTER) {
          const counter = item as Counter;
          itemClone = {
            id: counter.id,
            type: ItemType.COUNTER,
            name: counter.name,
            width: counter.width,
            height: counter.height,
            value: counter.value,
            zIndex: counter.zIndex ?? 0,
            hyperscaleLayerId: counter.hyperscaleLayerId ?? 'tokens',
          } as Counter;
        } else if (item.type === ItemType.DICE_OBJECT) {
          const dice = item as DiceObject;
          itemClone = {
            id: dice.id,
            type: ItemType.DICE_OBJECT,
            width: dice.width,
            height: dice.height,
            currentValue: dice.currentValue,
            color: dice.color,
            shape: dice.shape,
            borderWidth: dice.borderWidth,
            borderColor: dice.borderColor,
            opacity: dice.opacity,
            borderOpacity: dice.borderOpacity,
            fontColor: dice.fontColor,
            zIndex: dice.zIndex ?? 0,
            hyperscaleLayerId: dice.hyperscaleLayerId ?? 'tokens',
          } as DiceObject;
        } else if (item.type === ItemType.BOARD) {
          const board = item as BoardType;
          itemClone = {
            id: board.id,
            type: ItemType.BOARD,
            name: board.name,
            content: board.content,
            width: board.width,
            height: board.height,
            x: board.x,
            y: board.y,
            rotation: board.rotation,
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
          const token = item as TokenType;
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
            zIndex: token.zIndex ?? 0,
            hyperscaleLayerId: token.hyperscaleLayerId ?? 'tokens',
          } as TokenType;
        }

        // IMPORTANT: Store original zIndex and source for proper layer relationships
        (itemClone as any).originalZIndex = item.zIndex ?? 0;
        (itemClone as any).source = source;
        (itemClone as any).cursorSlotIndex = cursorSlot.length;
        (itemClone as any).timestamp = Date.now(); // Track when item was added to slot

        // Store pool panel source if object is being dragged from pool panel
        if (fromPoolPanel) {
          (itemClone as any).fromPoolPanel = fromPoolPanel;
        }


        const updateStart = performance.now();
        setCursorSlot(prev => [...prev, itemClone as CardType | TokenType | BoardType]);

        const dispatchStart = performance.now();
        const updatePayload: any = { id: cardId, inCursorSlot: true, isOnTable: false };
        if (fromPoolPanel) {
          updatePayload.fromPoolPanel = fromPoolPanel;
        }

        dispatch({ type: 'UPDATE_OBJECT', payload: updatePayload });

        const posStart = performance.now();
        const pos = { x: clientX, y: clientY };
        setCursorPosition(pos);
        cursorPositionRef.current = pos;

        const totalProcessTime = performance.now() - processStart;
        const totalFromStart = performance.now() - startTime;

        // Remove from processing set immediately
        processingAddToSlotRef.current.delete(cardId);
          } catch (error) {
            processingAddToSlotRef.current.delete(cardId);
          }
    };


    window.addEventListener('add-to-cursor-slot', handleAddToSlot);
    return () => window.removeEventListener('add-to-cursor-slot', handleAddToSlot);
  }, [cursorSlot.length, dispatch, state.objects]);

  // Auto-add objects to cursor slot when their location changes to CURSOR_SLOT
  // This handles PLAY_TOP_CARD which sets location to CURSOR_SLOT but doesn't fire event
  useEffect(() => {
    const cursorSlotObjects = Object.values(state.objects).filter(obj => {
      const item = obj as any;
      // Skip if already in cursor slot
      if (cursorSlot.some(slotItem => slotItem.id === obj.id)) return false;
      // Skip if already being processed
      if (processingAddToSlotRef.current.has(obj.id)) return false;
      // Skip if explicitly handled via add-to-cursor-slot event
      // (these objects are added via event handler, not auto-add)
      // Only auto-add objects with __pendingPlayTop (PLAY_TOP_CARD action)
      if (!item.__pendingPlayTop) return false;
      return item.location === CardLocation.CURSOR_SLOT;
    });

    if (cursorSlotObjects.length > 0) {
      cursorSlotObjects.forEach(obj => {
        // Mark as processing BEFORE dispatching to prevent race conditions
        processingAddToSlotRef.current.add(obj.id);

        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: obj.id,
            clientX: cursorPosition?.x || window.innerWidth / 2,
            clientY: cursorPosition?.y || window.innerHeight / 2,
            source: 'hold'
          }
        }));
      });
    }
  }, [state.objects, cursorSlot, cursorPosition]);

  // Listen for add-token-to-cursor-slot events from ToolsPanel
  useEffect(() => {
    const handleAddTokenToSlot = (e: Event) => {
      // Set flag to prevent slot from being dropped during this operation
      isAddingTokenRef.current = true;

      // Prevent event from propagating to avoid clearing the slot
      e.preventDefault();
      e.stopPropagation();

      const customEvent = e as CustomEvent<{ archetypeId: string; clientX?: number; clientY?: number }>;
      const { archetypeId, clientX, clientY } = customEvent.detail;
      const archetype = state.objects[archetypeId] as TokenArchetype;

      if (!archetype || archetype.type !== ItemType.TOKEN_TYPE) {
        isAddingTokenRef.current = false;
        return;
      }
      if (cursorSlot.length >= 100) {
        isAddingTokenRef.current = false;
        return;
      } // Max 100 items in slot

      // ALWAYS create a NEW token copy from archetype (not add existing tokens)
      const newTokenId = generateUUID();

      const defaultSize = archetype.defaultSize || { width: 50, height: 50 };
      const newToken: TokenType = {
        id: newTokenId,
        type: ItemType.TOKEN,
        name: archetype.name, // Use archetype name for token-copy
        x: 0,
        y: 0,
        width: defaultSize.width,
        height: defaultSize.height,
        rotation: 0,
        color: archetype.color,
        borderColor: (archetype as any).borderColor,
        content: archetype.content,
        shape: archetype.shape,
        isOnTable: false,
        locked: false,
        archetypeId: archetype.id,
        inCursorSlot: true,
        // Store settings from archetype
        showName: (archetype as any).showName || false,
        fontColor: (archetype as any).fontColor,
        // IMPORTANT: Set zIndex to maintain layer relationships
        zIndex: archetype.zIndex ?? 3000,
        hyperscaleLayerId: archetype.hyperscaleLayerId ?? 'tokens',
      };

      // Add token to objects list
      dispatch({ type: 'ADD_OBJECT', payload: newToken });

      // Add to cursor slot
      const tokenClone: TokenType = { ...newToken };
      (tokenClone as any).cursorSlotIndex = cursorSlot.length;
      (tokenClone as any).originalZIndex = newToken.zIndex ?? 0;
      (tokenClone as any).source = 'shift'; // Use 'shift' for Shift+click behavior

      setCursorSlot(prev => [...prev, tokenClone]);
      cursorSlotRef.current = [...cursorSlotRef.current, tokenClone];

      // Set cursor position to show tokens immediately (use provided coords or current mouse position)
      if (clientX !== undefined && clientY !== undefined) {
        const pos = { x: clientX, y: clientY };
        setCursorPosition(pos);
        cursorPositionRef.current = pos;
      } else if (cursorPosition) {
        // Use existing cursor position
        cursorPositionRef.current = cursorPosition;
      }

      // Set source to 'shift' to behave like Shift+click (drop on click, not on mouseup)
      setCursorSlotSource('ctrl');

      isAddingTokenRef.current = false;
    };

    window.addEventListener('add-token-to-cursor-slot', handleAddTokenToSlot, { passive: false });
    return () => window.removeEventListener('add-token-to-cursor-slot', handleAddTokenToSlot);
  }, [cursorSlot.length, dispatch, state.objects, cursorPosition, setCursorSlot, setCursorPosition, setCursorSlotSource]);

  // Listen for current tool changes from ToolsPanel
  useEffect(() => {
    const handleToolChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ tool: string }>;
      const newTool = customEvent.detail.tool;
      setCurrentTool(newTool);
      // Clear ruler state when switching away from ruler tool
      if (newTool !== 'ruler') {
        setRulerStart(null);
        setRulerCurrent(null);
        setIsRulerRightClick(false);
      }
    };
    window.addEventListener('drawing-tool-changed', handleToolChanged);
    return () => window.removeEventListener('drawing-tool-changed', handleToolChanged);
  }, []);

  // Listen for token-copy updates from archetype settings changes
  useEffect(() => {
    const handleUpdateTokenCopy = (e: Event) => {
      const customEvent = e as CustomEvent<{ copyId: string; updates: Partial<TokenType> }>;
      const { copyId, updates } = customEvent.detail;

      // Update the token-copy with new values from archetype
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: copyId, ...updates }
      });
    };

    window.addEventListener('update-token-copy-from-archetype', handleUpdateTokenCopy);
    return () => window.removeEventListener('update-token-copy-from-archetype', handleUpdateTokenCopy);
  }, [dispatch]);

  // Listen for deck card dimensions updates from deck settings changes
  useEffect(() => {
    const handleUpdateDeckCardsDimensions = (e: Event) => {
      const customEvent = e as CustomEvent<{
        deckId: string;
        cardWidth: number;
        cardHeight: number;
      }>;
      const { deckId, cardWidth, cardHeight } = customEvent.detail;

      // Clear card dimensions cache to ensure new dimensions are used
      import('../utils/cardUtils').then(({ clearCardDimensionsCache }) => {
        clearCardDimensionsCache();
      });

      // Update all cards in this deck with deck's current cardWidth/cardHeight
      // This ensures cards always use deck's dimensions instead of their own stored values
      Object.values(state.objects).forEach(obj => {
        if (obj.type === ItemType.CARD && (obj as CardType).deckId === deckId) {
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: obj.id,
              // Update to deck's current dimensions instead of deleting
              width: cardWidth,
              height: cardHeight
            }
          });
        }
      });
    };

    window.addEventListener('update-deck-cards-dimensions', handleUpdateDeckCardsDimensions);
    return () => window.removeEventListener('update-deck-cards-dimensions', handleUpdateDeckCardsDimensions);
  }, [dispatch]);

  // Listen for deck card rotation step updates from deck settings changes
  useEffect(() => {
    const handleUpdateDeckCardsRotationStep = (e: Event) => {
      const customEvent = e as CustomEvent<{
        deckId: string;
        rotationStep: number;
      }>;
      const { deckId, rotationStep } = customEvent.detail;

      // Update all cards in this deck with deck's current rotationStep
      Object.values(state.objects).forEach(obj => {
        if (obj.type === ItemType.CARD && (obj as CardType).deckId === deckId) {
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: obj.id,
              rotationStep: rotationStep
            }
          });
        }
      });
    };

    window.addEventListener('update-deck-cards-rotation-step', handleUpdateDeckCardsRotationStep);
    return () => window.removeEventListener('update-deck-cards-rotation-step', handleUpdateDeckCardsRotationStep);
  }, [dispatch]);

  // Listen for clear-cursor-slot events from PoolTabletop
  useEffect(() => {
    const handleClearCursorSlot = (e: Event) => {
      const customEvent = e as CustomEvent<{ reason?: string }>;

      // Clear cursor slot and related state
      cursorSlotRef.current = [];
      setCursorSlot([]);
      setCursorPosition(null);
      setCursorSlotSource(null);

      // Clear recently dropped tracking
      setRecentlyInMyCursorSlot(new Set());
    };

    window.addEventListener('clear-cursor-slot', handleClearCursorSlot);
    return () => window.removeEventListener('clear-cursor-slot', handleClearCursorSlot);
  }, []);

  // Helper to get card settings from deck (cards always inherit from deck)
  const getCardSettings = useCallback((card: CardType) => {
    if (card.deckId) {
      const deck = state.objects[card.deckId] as DeckType;
      if (deck && deck.type === ItemType.DECK) {
        return {
          cardShape: deck.cardShape,
          cardOrientation: deck.cardOrientation,
          allowedActions: deck.cardAllowedActions,
          allowedActionsForGM: deck.cardAllowedActionsForGM,
          actionButtons: deck.cardActionButtons,
          singleClickAction: deck.cardSingleClickAction,
          doubleClickAction: deck.cardDoubleClickAction,
          cardWidth: deck.cardWidth,
          cardHeight: deck.cardHeight,
          cardNamePosition: deck.cardNamePosition,
        };
      }
    }

    // Default to no specific settings (all actions allowed)
    return {
      cardShape: undefined,
      cardOrientation: undefined,
      allowedActions: undefined,
      allowedActionsForGM: undefined,
      actionButtons: undefined,
      singleClickAction: undefined,
      doubleClickAction: undefined,
      cardWidth: undefined,
      cardHeight: undefined,
      cardNamePosition: undefined,
    };
  }, [state.objects]);

  // Refs to always have current values in event handlers
  const draggingCardRef = useRef<CardType | null>(null);
  const hoveredDeckRef = useRef<string | null>(null);
  const hoveredPileRef = useRef<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    hoveredDeckRef.current = hoveredDeckId;
  }, [hoveredDeckId]);

  useEffect(() => {
    hoveredPileRef.current = hoveredPileId;
  }, [hoveredPileId]);

  const dragStartRef = useRef<{ x: number; y: number; scrollLeft?: number; scrollTop?: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleMouseUpRef = useRef<(e?: MouseEvent | React.MouseEvent) => void>(() => {});
  const handleMouseMoveRef = useRef<(e: MouseEvent | React.MouseEvent) => void>(() => {});

  // Unified click/drag tracking system
  const interactionStateRef = useRef<{
    objectId: string | null;
    startTime: number;
    startClientX: number;
    startClientY: number;
    hasMoved: boolean;
    clickCount: number;
    lastClickTime: number;
    isInDragMode: boolean; // True when we've started dragging (>= 1VU movement)
  }>({
    objectId: null,
    startTime: 0,
    startClientX: 0,
    startClientY: 0,
    hasMoved: false,
    clickCount: 0,
    lastClickTime: 0,
    isInDragMode: false
  });

  // Ref to always have current state for event listeners
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Ref to always have current context menu state for event listeners
  const contextMenuRef = useRef<typeof contextMenu>(null);
  useEffect(() => {
    contextMenuRef.current = contextMenu;
  }, [contextMenu]);

  // Debug: Track when objects are dropped into pool panels
  const droppedObjectRef = useRef<string | null>(null);
  useEffect(() => {
    if (droppedObjectRef.current) {
      droppedObjectRef.current = null;
    }
  }, [state.objects]);

  const activePlayer = (state.players || []).find(p => p.id === state.activePlayerId);
  const isGM = !!activePlayer?.isGM;

  // --- Grid Snapping Logic ---
  // Helper function to transform coordinates with board rotation
  const transformPointWithBoardRotation = (localX: number, localY: number, board: BoardType): { x: number, y: number } => {
    if (!board.rotation || board.rotation === 0) {
      return { x: localX, y: localY };
    }

    // Board center
    const boardCenterX = board.x + board.width / 2;
    const boardCenterY = board.y + board.height / 2;

    // Relative position from board center
    const relX = localX - boardCenterX;
    const relY = localY - boardCenterY;

    // Convert rotation to radians
    const angle = (board.rotation * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Apply rotation
    const rotatedX = relX * cosA - relY * sinA;
    const rotatedY = relX * sinA + relY * cosA;

    // Convert back to absolute position
    return {
      x: boardCenterX + rotatedX,
      y: boardCenterY + rotatedY
    };
  };

  // Helper function to transform cursor coordinates back to board's local coordinate system
  const transformCursorToBoardSpace = (cursorX: number, cursorY: number, board: BoardType): { x: number, y: number } => {
    if (!board.rotation || board.rotation === 0) {
      return { x: cursorX - board.x, y: cursorY - board.y };
    }

    // Board center
    const boardCenterX = board.x + board.width / 2;
    const boardCenterY = board.y + board.height / 2;

    // Relative position from board center
    const relX = cursorX - boardCenterX;
    const relY = cursorY - boardCenterY;

    // Convert rotation to radians and apply inverse rotation
    const angle = (-board.rotation * Math.PI) / 180; // Inverse rotation
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Apply inverse rotation
    const rotatedX = relX * cosA - relY * sinA;
    const rotatedY = relX * sinA + relY * cosA;

    // Convert to board-local coordinates (relative to board top-left)
    return {
      x: rotatedX + board.width / 2,
      y: rotatedY + board.height / 2
    };
  };

  // Snaps ONLY tokens to the center of nearest grid cell
  // Snap radius = token size (half width or half height, whichever is larger)
  const getSnappedCoordinates = (cursorX: number, cursorY: number, objects: Record<string, TableObject>, currentDraggingId: string | null): { x: number, y: number, snappedToBoard?: BoardType } => {
      const draggingObj = objects[currentDraggingId || ''];

      // Only tokens and cards snap to grid
      const isToken = draggingObj?.type === ItemType.TOKEN;
      const isCard = draggingObj?.type === ItemType.CARD;
      if (!draggingObj || (!isToken && !isCard)) {
          const objHalfW = draggingObj ? (draggingObj.width ?? 100) / 2 : 0;
          const objHalfH = draggingObj ? (draggingObj.height ?? 100) / 2 : 0;
          return { x: cursorX - objHalfW, y: cursorY - objHalfH };
      }

      const objW = draggingObj.width ?? 100;
      const objH = draggingObj.height ?? 100;
      const objHalfW = objW / 2;
      const objHalfH = objH / 2;

      // Snap radius = token/card size (using max dimension)
      const snapRadius = Math.max(objW, objH);
      const snapRadiusSq = snapRadius * snapRadius; // Use squared distance for comparisons

      // Get all boards with snapToGrid enabled (for tokens) or snapCardsToGrid enabled (for cards)
      const boards = Object.values(objects).filter(obj =>
          obj.type === ItemType.BOARD &&
          (isCard ? (obj as any).snapCardsToGrid : (obj as any).snapToGrid) &&
          (obj as any).gridType !== GridType.NONE &&
          obj.isOnTable &&
          obj.id !== currentDraggingId
      ) as BoardType[];

      // Get all individual battlefield cells with snapToGrid enabled
      const cells = Object.values(objects).filter(obj =>
          obj.type === ItemType.BATTLEFIELD_CELL &&
          (obj as any).snapToGrid &&
          obj.isOnTable &&
          obj.id !== currentDraggingId
      ) as BattlefieldCell[];

      // Find nearest cell center within snap radius
      let nearestCell: { x: number; y: number; distanceSq: number } | null = null;

      // Check boards first
      for (const board of boards) {
          // All values are in vu (virtual units)
          const gridW = board.gridWidth || board.gridSize || 50;
          const gridH = board.gridHeight || board.gridSize || 50;
          const boardCols = Math.floor(board.width / gridW);
          const boardRows = Math.floor(board.height / gridH);

          if (board.gridType === GridType.SQUARE) {
              // Transform cursor to board's local coordinate system (accounting for rotation)
              const localCoords = transformCursorToBoardSpace(cursorX, cursorY, board);
              const col = Math.floor(localCoords.x / gridW);
              const row = Math.floor(localCoords.y / gridH);

              // Check if cell is within board bounds
              if (col < 0 || col >= boardCols || row < 0 || row >= boardRows) {
                  continue;
              }

              // Calculate cell center in board-local coordinates
              const localCellCenterX = (col * gridW) + (gridW / 2);
              const localCellCenterY = (row * gridH) + (gridH / 2);

              // Transform cell center back to world coordinates (with board rotation)
              const worldCellCenter = transformPointWithBoardRotation(
                board.x + localCellCenterX,
                board.y + localCellCenterY,
                board
              );

              const cellCenterX = worldCellCenter.x;
              const cellCenterY = worldCellCenter.y;

              // Check if this cell has custom magnet points or use default
              const cellKey = `${col},${row}`;
              let cellMagnetData = board.gridCellMagnetPoints?.[cellKey];

              // If no custom data for this cell, create temporary data using default count
              if (!cellMagnetData && board.defaultGridCellMagnetPointCount && board.defaultGridCellMagnetPointCount > 1) {
                cellMagnetData = {
                  magnetPointCount: board.defaultGridCellMagnetPointCount,
                  magnetRotation: 0
                };
              }

              let snapX = cellCenterX;
              let snapY = cellCenterY;

              if (cellMagnetData && cellMagnetData.magnetPointCount && cellMagnetData.magnetPointCount > 1) {
                // Find nearest magnet point in this cell (in board-local coordinates)
                const magnetPositions = calculateGridCellMagnetPositions(
                  localCellCenterX, localCellCenterY, gridW, gridH, cellMagnetData
                );

                // Transform magnet points to world coordinates and find nearest
                let minMagnetDistSq = Infinity;
                for (const localMagnetPos of magnetPositions) {
                  // Transform from board-local to world coordinates
                  const worldMagnetPos = transformPointWithBoardRotation(
                    board.x + localMagnetPos.x,
                    board.y + localMagnetPos.y,
                    board
                  );

                  const dx = cursorX - worldMagnetPos.x;
                  const dy = cursorY - worldMagnetPos.y;
                  const distSq = dx * dx + dy * dy;
                  if (distSq < minMagnetDistSq) {
                    minMagnetDistSq = distSq;
                    snapX = worldMagnetPos.x;
                    snapY = worldMagnetPos.y;
                  }
                }
              }

              // Check if within snap radius (using squared distance)
              const dx = cursorX - snapX;
              const dy = cursorY - snapY;
              const distSq = dx * dx + dy * dy;

              if (distSq <= snapRadiusSq && (!nearestCell || distSq < nearestCell.distanceSq)) {
                  nearestCell = { x: snapX, y: snapY, distanceSq: distSq, board: board };
                  // Early exit if we found an exact match
                  if (distSq === 0) return { x: snapX - objHalfW, y: snapY - objHalfH, snappedToBoard: board };
              }
          } else if (board.gridType === GridType.HEX) {
              // Pointy-top hex grid snapping - using gridUtils for consistency
              const hexW = gridW || 100;
              const hexH = gridH || (hexW * 1.15);  // Use board's gridHeight if available

              // Transform cursor to board's local coordinate system
              const localCoords = transformCursorToBoardSpace(cursorX, cursorY, board);

              // Use gridUtils to get hex center in local coordinates
              const localHexCenter = getHexCenterAtPixel(
                  localCoords.x,
                  localCoords.y,
                  hexW,
                  hexH,
                  'pointy-top'
              );

              // Transform hex center back to world coordinates
              const worldHexCenter = transformPointWithBoardRotation(
                board.x + localHexCenter.x,
                board.y + localHexCenter.y,
                board
              );

              const hexCenterX = worldHexCenter.x;
              const hexCenterY = worldHexCenter.y;

              // Check if hex center is within board bounds (in local coordinates)
              const hexX = localHexCenter.x;
              const hexY = localHexCenter.y;
              const halfW = hexW / 2;
              const halfH = hexH / 2;

              if (hexX < -halfW || hexX > board.width + halfW ||
                  hexY < -halfH || hexY > board.height + halfH) {
                  continue;
              }

              // Check if within snap radius (using squared distance)
              const dx = cursorX - hexCenterX;
              const dy = cursorY - hexCenterY;
              const distSq = dx * dx + dy * dy;

              if (distSq <= snapRadiusSq && (!nearestCell || distSq < nearestCell.distanceSq)) {
                  nearestCell = { x: hexCenterX, y: hexCenterY, distanceSq: distSq, board: board };
                  // Early exit if we found an exact match
                  if (distSq === 0) return { x: hexCenterX - objHalfW, y: hexCenterY - objHalfH, snappedToBoard: board };
              }
          } else if (board.gridType === GridType.HEX_HORIZONTAL) {
              // Flat-top (horizontal) hex grid snapping - using gridUtils for consistency
              const hexW = gridW || 115;
              const hexH = gridH || (hexW / 1.15);  // Use board's gridHeight if available

              // Transform cursor to board's local coordinate system
              const localCoords = transformCursorToBoardSpace(cursorX, cursorY, board);

              // Use gridUtils to get hex center in local coordinates
              const localHexCenter = getHexCenterAtPixel(
                  localCoords.x,
                  localCoords.y,
                  hexW,
                  hexH,
                  'flat-top'
              );

              // Transform hex center back to world coordinates
              const worldHexCenter = transformPointWithBoardRotation(
                board.x + localHexCenter.x,
                board.y + localHexCenter.y,
                board
              );

              const hexCenterX = worldHexCenter.x;
              const hexCenterY = worldHexCenter.y;

              // Check if hex center is within board bounds (in local coordinates)
              const hexX = localHexCenter.x;
              const hexY = localHexCenter.y;
              const halfW = hexW / 2;
              const halfH = hexH / 2;

              if (hexX < -halfW || hexX > board.width + halfW ||
                  hexY < -halfH || hexY > board.height + halfH) {
                  continue;
              }

              // Check if within snap radius (using squared distance)
              const dx = cursorX - hexCenterX;
              const dy = cursorY - hexCenterY;
              const distSq = dx * dx + dy * dy;

              if (distSq <= snapRadiusSq && (!nearestCell || distSq < nearestCell.distanceSq)) {
                  nearestCell = { x: hexCenterX, y: hexCenterY, distanceSq: distSq, board: board };
                  // Early exit if we found an exact match
                  if (distSq === 0) return { x: hexCenterX - objHalfW, y: hexCenterY - objHalfH, snappedToBoard: board };
              }
          }
      }

      // Check individual battlefield cells - snap to magnet points
      for (const cell of cells) {
          // Use utility function to calculate magnet point positions
          const magnetPoints = calculateMagnetPointPositions(cell);

          // Find nearest magnet point
          for (const magnetPoint of magnetPoints) {
              const dx = cursorX - magnetPoint.x;
              const dy = cursorY - magnetPoint.y;
              const distSq = dx * dx + dy * dy;

              if (distSq <= snapRadiusSq && (!nearestCell || distSq < nearestCell.distanceSq)) {
                  nearestCell = { x: magnetPoint.x, y: magnetPoint.y, distanceSq: distSq };
                  // Early exit if we found an exact match
                  if (distSq === 0) return { x: magnetPoint.x - objHalfW, y: magnetPoint.y - objHalfH, snappedToBoard: nearestCell.board };
              }
          }
      }

      // If we found a magnet point to snap to, return coordinates centered on that point
      if (nearestCell) {
          return {
              x: nearestCell.x - objHalfW,
              y: nearestCell.y - objHalfH,
              snappedToBoard: nearestCell.board
          };
      }

      // No snap - return top-left coordinates directly
      return { x: cursorX - objHalfW, y: cursorY - objHalfH };
  };

  // Local dice animation function (used by both initiator and remote players)
  const startDiceAnimation = useCallback((diceId: string, sides: number, isInitiator: boolean) => {
    let steps = 0;
    const maxSteps = 10; // Change 10 times
    const duration = 1000; // 1 second
    const intervalTime = duration / maxSteps;

    const interval = setInterval(() => {
        steps++;
        if (steps < maxSteps) {
            // Update local state for visual effect only
            setRollingDice(prev => ({
                ...prev,
                [diceId]: Math.floor(Math.random() * sides) + 1
            }));
        } else {
            clearInterval(interval);

            // Clear local override so the component displays the value from the store
            setRollingDice(prev => {
                const next = { ...prev };
                delete next[diceId];
                return next;
            });

            // Only the initiator dispatches the final result
            if (isInitiator) {
                dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: diceId } });
                // Clear the rollStartTime after animation completes
                dispatch({
                  type: 'UPDATE_OBJECT',
                  payload: { id: diceId, rollStartTime: undefined }
                });
                initiatedRollsRef.current.delete(diceId);
            }
        }
    }, intervalTime);
  }, [dispatch]);

  const animateDiceRoll = useCallback((dice: DiceObject) => {
    const rollStartTime = Date.now();

    // Mark this as a roll we initiated (so we dispatch the final result)
    initiatedRollsRef.current.add(dice.id);

    // Broadcast the roll start time to all players
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id: dice.id, rollStartTime }
    });

    // Start local animation
    startDiceAnimation(dice.id, dice.sides, true);
  }, [dispatch, startDiceAnimation]);

  // Watch for dice rollStartTime changes to sync animations across players
  useEffect(() => {
    Object.values(state.objects).forEach(obj => {
      if (obj.type === ItemType.DICE_OBJECT) {
        const dice = obj as DiceObject;
        const lastSeen = lastSeenRollStartTimeRef.current[dice.id];

        // If rollStartTime is newer than what we've seen, start animation
        if (dice.rollStartTime && dice.rollStartTime !== lastSeen) {
          lastSeenRollStartTimeRef.current[dice.id] = dice.rollStartTime;

          // Only start animation if we didn't initiate this roll ourselves
          if (!initiatedRollsRef.current.has(dice.id)) {
            startDiceAnimation(dice.id, dice.sides, false);
          }
        }
      }
    });
  }, [state.objects, startDiceAnimation]);

  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (contextMenu) setContextMenu(null);

    const obj = state.objects[id];
    if (!obj || obj.locked) return;

    // Clear any existing resize state
    if (resizingIdRef.current) {
      // Clear previous resize state
    }

    setResizingId(id);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: obj.width ?? 100,
      height: obj.height ?? 100,
    });
    setLiveResizeSize(null); // Reset live preview size
    liveResizeSizeRef.current = null; // Reset ref
    resizeFinalSizeRef.current = null; // Reset final size ref
    setIsOverResizeHandle(false); // Reset cursor state

    // Global mouseup handler for cleanup
    const handleGlobalMouseUp = () => {
      // Get final size from ref (most up-to-date)
      const finalSize = resizeFinalSizeRef.current || { width: obj.width ?? 100, height: obj.height ?? 100 };

      // Do final dispatch with actual size update
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id,
          width: finalSize.width,
          height: finalSize.height,
        },
      });

      // Sync to network
      syncResizeToNetwork(id);

      // Clear all resize state
      setResizingId(null);
      setResizeStart(null);
      setLiveResizeSize(null);
      liveResizeSizeRef.current = null;
      setIsOverResizeHandle(false);
      resizeFinalSizeRef.current = null;

      // Clear throttle timer
      if (resizeThrottleRef.current !== null) {
        clearTimeout(resizeThrottleRef.current);
        resizeThrottleRef.current = null;
      }

      // Clear drag offset to prevent incorrect positioning on next drag
      dragOffsetRef.current = null;

      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp, { once: true });
  };

  // Throttled dispatch for resize updates (100ms)
  const throttledResizeUpdate = useCallback((id: string, width: number, height: number) => {
    // Store final size for network sync
    resizeFinalSizeRef.current = { width, height };

    // Clear existing throttle
    if (resizeThrottleRef.current !== null) {
      clearTimeout(resizeThrottleRef.current);
    }

    // Local-only update (no network)
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: { id, width, height },
      _localOnly: true,
    });

    // Set up throttle for network sync (100ms)
    resizeThrottleRef.current = window.setTimeout(() => {
      // Final network sync will happen on mouseup, this just ensures periodic updates
      if (resizingIdRef.current === id) {
        resizeFinalSizeRef.current = null;
      }
    }, 100);
  }, [dispatch, resizingIdRef]);

  // Final network sync when resize completes
  const syncResizeToNetwork = useCallback((id: string) => {
    const finalSize = resizeFinalSizeRef.current;
    if (finalSize) {
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id, ...finalSize },
      });
      resizeFinalSizeRef.current = null;
    }

    // Clear throttle
    if (resizeThrottleRef.current !== null) {
      clearTimeout(resizeThrottleRef.current);
      resizeThrottleRef.current = null;
    }
  }, [dispatch]);

  // Roll dice with group support - if dice is in a group, roll all dice in the group
  const rollDiceWithGroup = useCallback((dice: DiceObject) => {
    // Check if dice belongs to a group
    if (dice.diceGroupId) {
      const group = state.diceGroups.find(g => g.id === dice.diceGroupId);
      if (group && group.visible) {
        // Roll all dice in the group
        group.diceIds.forEach(diceId => {
          const groupDice = state.objects[diceId];
          if (groupDice?.type === ItemType.DICE_OBJECT) {
            animateDiceRoll(groupDice as DiceObject);
          }
        });
      } else {
        // Group not found or not visible, roll single dice
        animateDiceRoll(dice);
      }
    } else {
      // Single dice roll (not in a group)
      animateDiceRoll(dice);
    }
  }, [state.diceGroups, state.objects, animateDiceRoll]);

  // Execute a click action on an object
  const executeClickAction = useCallback((obj: TableObject, action: string, event?: React.MouseEvent) => {
    if (!action || action === 'none') return;

    // Block all click actions when marker or eraser tool is active
    if (currentTool === 'marker' || currentTool === 'eraser') {
      return;
    }

    switch (action) {
      case 'flip':
        if (obj.type === ItemType.CARD) {
          dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } });
        }
        break;
      case 'rotate':
        // Legacy rotate action - use rotationStep
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } });
        break;
      case 'rotateClockwise':
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } });
        break;
      case 'rotateCounterClockwise':
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: -((obj as any).rotationStep ?? 45) } });
        break;
      case 'resetRotation':
        dispatch({ type: 'SET_ROTATION', payload: { id: obj.id, rotation: 0 } });
        break;
      case 'draw':
        if (obj.type === ItemType.DECK) {
          dispatch({ type: 'DRAW_CARD', payload: { deckId: obj.id, playerId: state.activePlayerId } });
        }
        break;
      case 'playTopCard':
        // Take the top card from deck and add it to cursor slot
        if (obj.type === ItemType.DECK) {
          const deck = obj as DeckType;
          if (deck.cardIds && deck.cardIds.length > 0) {
            const topCardId = deck.cardIds[0];
            const card = state.objects[topCardId] as CardType;
            if (!card) return;

            const faceUp = deck.playTopFaceUp ?? true;

            // Get mouse position: from click event, or current cursorPosition, or global mouse ref
            const mousePos = event
              ? { x: event.clientX, y: event.clientY }
              : cursorPosition || globalMousePosRef.current;

            // Prepare card with all properties for cursor slot
            const isHorizontal = deck.cardOrientation === CardOrientation.HORIZONTAL;
            const cardForSlot: CardType = {
              ...card,
              location: CardLocation.CURSOR_SLOT,
              faceUp: faceUp,
              isOnTable: false, // Important: card should NOT render on table
              // Store orientation info for cursor slot rendering
              isHorizontal: isHorizontal,
              // Inherit card dimensions from deck for correct aspect ratio
              width: deck.cardWidth,
              height: deck.cardHeight,
            };

            // Set cursor position first to ensure immediate render
            setCursorPosition(mousePos);

            // Add to cursor slot
            cursorSlotRef.current = [...cursorSlotRef.current, cardForSlot];
            setCursorSlot(prev => [...prev, cardForSlot]);
            if (cursorSlot.length === 0) {
              setCursorSlotSource('ctrl');
            }

            // Use new PLAY_TOP_CARD action with undo tracking
            dispatch({ type: 'PLAY_TOP_CARD', payload: { deckId: deck.id } });
          }
        }
        break;
      case 'shuffleDeck':
        if (obj.type === ItemType.DECK) {
          // Dispatch event for shuffle animation
          window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
            detail: { deckId: obj.id }
          }));
          dispatch({ type: 'SHUFFLE_DECK', payload: { deckId: obj.id } });
        }
        break;
      case 'searchDeck':
        if (obj.type === ItemType.DECK) {
          setSearchModalDeck(obj as DeckType);
          setSearchModalPile(undefined);
        }
        break;
      case 'topDeck':
        if (obj.type === ItemType.DECK) {
          setTopDeckModalDeck(obj as DeckType);
        }
        break;
      case 'piles':
        // Open piles button menu at the object's position
        if (obj.type === ItemType.DECK) {
          const deck = obj as DeckType;
          // Get the element position for the menu
          const deckElement = document.querySelector(`[data-object-id="${deck.id}"]`) as HTMLElement;
          if (deckElement) {
            const rect = deckElement.getBoundingClientRect();
            setPilesButtonMenu({
              x: rect.left,
              y: rect.bottom + 5,
              deck
            });
          }
        }
        break;
      case 'returnAll':
        // Return all cards to their base deck state
        // This is now handled entirely by the reducer
        if (obj.type === ItemType.DECK) {
          dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: obj.id } });
        }
        break;
      case 'returnAllAndShuffle':
        // Return all cards and shuffle the deck
        if (obj.type === ItemType.DECK) {
          // Dispatch event for shuffle animation before returning cards
          window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
            detail: { deckId: obj.id }
          }));
          dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: obj.id, shuffleAfter: true } });
        }
        break;
      case 'returnAllExceptHands':
        // Return all cards except those in players' hands
        if (obj.type === ItemType.DECK) {
          dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: obj.id, exceptHands: true } });
        }
        break;
      case 'moveToHand':
        if (obj.type === ItemType.CARD) {
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: obj.id,
              location: CardLocation.HAND,
              ownerId: state.activePlayerId,
              isOnTable: false
            }
          });
        }
        break;
      case 'moveToTopDeck': {
        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          if (card.deckId) {
            dispatch({ type: 'RETURN_CARD_TO_DECK_TOP', payload: { cardId: obj.id, deckId: card.deckId }});
          }
        }
        break;
      }
      case 'moveToBottomDeck': {
        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          if (card.deckId) {
            dispatch({ type: 'RETURN_CARD_TO_DECK_BOTTOM', payload: { cardId: obj.id, deckId: card.deckId }});
          }
        }
        break;
      }
      case 'moveToDiscard': {
        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          if (card.deckId) {
            const deck = state.objects[card.deckId] as DeckType | undefined;
            if (deck?.piles) {
              const millPile = deck.piles.find(p => p.isMillPile);
              if (millPile) {
                dispatch({
                  type: 'ADD_CARD_TO_PILE',
                  payload: { deckId: deck.id, pileId: millPile.id, cardId: obj.id }
                });
              }
            }
          }
        }
        break;
      }
      case 'delete':
        dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } });
        break;
      case 'clone':
        dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } });
        break;
      case 'lock':
        dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } });
        break;
      case 'pin':
        // Toggle pin to viewport
        {
          const isPinned = (obj as any).isPinnedToViewport || false;
          if (isPinned) {
            // Unpin: convert viewport coordinates to world coordinates
            // For pinned objects, obj.x/obj.y are screen coordinates
            const worldX = (obj.x - offset.x) / zoom;
            const worldY = (obj.y - offset.y) / zoom;
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: obj.id, x: worldX, y: worldY, isPinnedToViewport: false }
            });
          } else {
            // Pin: convert world coordinates to viewport coordinates
            // For unpinned game objects, obj.x/obj.y are world coordinates
            const screenX = (obj.x * zoom) + offset.x;
            const screenY = (obj.y * zoom) + offset.y;
            // For dice and counters, also store pinnedScreenPosition
            const isDiceOrCounter = obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.COUNTER;
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: obj.id,
                x: screenX,
                y: screenY,
                isPinnedToViewport: true,
                ...(isDiceOrCounter && { pinnedScreenPosition: { x: screenX, y: screenY } })
              }
            });
          }
        }
        break;
      case 'layerUp':
        dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } });
        break;
      case 'layerDown':
        dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } });
        break;
      case 'bringToFront':
        dispatch({ type: 'BRING_TO_FRONT', payload: { id: obj.id } });
        break;
      case 'sendToBack':
        dispatch({ type: 'SEND_TO_BACK', payload: { id: obj.id } });
        break;
      case 'showTop':
        if (obj.type === ItemType.DECK) {
          dispatch({ type: 'TOGGLE_SHOW_TOP_CARD', payload: { deckId: obj.id } });
        }
        break;
      case 'millTopCard':
        if (obj.type === ItemType.DECK) {
          const deck = obj as DeckType;
          if (deck.cardIds && deck.cardIds.length > 0 && deck.piles && deck.piles.length > 0) {
            const topCardId = deck.cardIds[0];
            // Use mill pile if exists, otherwise use first available pile
            const millPile = deck.piles.find(p => p.isMillPile) || deck.piles[0];
            if (millPile && topCardId) {
              // Add card to mill pile
              dispatch({
                type: 'ADD_CARD_TO_PILE',
                payload: { deckId: deck.id, pileId: millPile.id, cardId: topCardId }
              });
            }
          }
        }
        break;
      case 'toBottom':
        if (obj.type === ItemType.DECK) {
          const deck = obj as DeckType;
          if (deck.cardIds && deck.cardIds.length > 0) {
            const topCardId = deck.cardIds[0];
            // Remove from front and add to back
            const newCardIds = [...deck.cardIds.slice(1), topCardId];
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: deck.id, cardIds: newCardIds }
            });
          }
        }
        break;
      case 'millToBottom':
        // Send card to bottom of its deck
        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          if (card.deckId) {
            dispatch({ type: 'MILL_CARD_TO_BOTTOM', payload: { cardId: obj.id, deckId: card.deckId }});
          }
        }
        break;
      case 'hide':
        // Remove object from table (hide it)
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: obj.id, isOnTable: false }
        });
        break;
      case 'show':
        // Show hidden object on table
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: obj.id, isOnTable: true }
        });
        break;
      case 'swingClockwise':
        dispatch({ type: 'SWING_CLOCKWISE', payload: { id: obj.id } });
        break;
      case 'swingCounterClockwise':
        dispatch({ type: 'SWING_COUNTER_CLOCKWISE', payload: { id: obj.id } });
        break;
      case 'showTooltipImage':
        // Show card tooltip image on click with delay
        if (obj.type === ItemType.CARD) {
          // Capture coordinates immediately (use event or fallback to global mouse ref)
          const clickX = event?.clientX ?? globalMousePosRef.current.x;
          const clickY = event?.clientY ?? globalMousePosRef.current.y;
          // Calculate card bounds for mouse leave detection
          const card = obj as CardType;
          const cardWidth = card.width ?? 100;
          const cardHeight = card.height ?? 140;
          // Clear any existing timer
          if (clickTooltipTimerRef.current) {
            clearTimeout(clickTooltipTimerRef.current);
          }
          // Set timer to show tooltip after 300ms delay
          clickTooltipTimerRef.current = window.setTimeout(() => {
            // Store card bounds - use a generous padding around the card
            clickTooltipBoundsRef.current = {
              left: card.x - 20,
              right: card.x + cardWidth + 20,
              top: card.y - 20,
              bottom: card.y + cardHeight + 20
            };
            setClickTooltip({
              cardId: obj.id,
              x: clickX,
              y: clickY
            });
          }, 300);
        }
        break;
      case 'roll':
        if (obj.type === ItemType.DICE_OBJECT) {
          rollDiceWithGroup(obj as DiceObject);
        }
        break;
    }
  }, [dispatch, state.activePlayerId, state.objects, state.viewTransform, cursorSlot, setCursorSlot, setCursorSlotSource, setCursorPosition, rollDiceWithGroup]);

  // Add object to cursor slot (Shift+click or long-press on card/token)
  const addToCursorSlot = useCallback((id: string, item: TableObject, source: 'ctrl' | 'hold' = 'ctrl', mousePosition?: { x: number; y: number }) => {
    // IMPORTANT: Check if cursor is over a token archetype button - if so, don't add to slot
    // This prevents accidental pickup when clicking token type buttons
    const elementUnderCursor = document.elementFromPoint(mousePosition?.x ?? 0, mousePosition?.y ?? 0);
    const archetypeButton = elementUnderCursor?.closest('[data-archetype-card]');
    if (archetypeButton) {
      return;
    }

    if (cursorSlot.length >= 100) {
      return; // Max 100 items in slot
    }

    // Set source based on how the item was added (only if slot was empty before)
    if (cursorSlot.length === 0) {
      setCursorSlotSource(source);
    }

    // Check if item is snapped to a grid cell and unhook it - OPTIMIZED
    const obj = state.objects[id];
    if (obj && obj.type === ItemType.TOKEN && (obj as Token).gridCellKey) {
      const token = obj as Token;

      // Parse gridCellKey: "boardId:col,row"
      const [boardId, ...cellParts] = (token.gridCellKey ?? '').split(':');
      const cellKey = cellParts.join(':');

      const board = state.objects[boardId] as Board;
      if (board && board.gridCellMagnetPoints && board.gridCellMagnetPoints[cellKey]) {
        // Parse col and row from cellKey instead of calculating from position
        const { col, row } = parseGridCellKey(cellKey);

        // Calculate cell dimensions for magnet point repositioning
        const gridW = board.gridWidth || board.gridSize || 50;
        const gridH = board.gridHeight || board.gridSize || 50;

        // Use helper function to calculate cell center
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
          // Create updated board object preserving all other properties
          const updatedBoard = {
            ...board,
            gridCellMagnetPoints: result.updatedBoard.gridCellMagnetPoints
          };

          // Update board with new magnet points
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: updatedBoard
          });

          // Move remaining objects to their new magnet positions
          for (const movedObj of result.movedObjects) {
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: movedObj.objectId,
                x: movedObj.x,
                y: movedObj.y
              }
            });
          }

          // Clear gridCellKey from the token being picked up
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: id,
              gridCellKey: undefined
            }
          });
        }
      }
    }

    // Clone the item to store it in the slot - deep copy to preserve all properties
    let itemClone: TableObject;
    let baseWidth = item.width ?? 50;
    let baseHeight = item.height ?? 50;

    if (item.type === ItemType.CARD) {
      const card = item as CardType;
      // Get deck to check orientation
      const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
      const isHorizontal = deck?.cardOrientation === CardOrientation.HORIZONTAL;
      baseWidth = card.width ?? deck?.cardWidth ?? 63;
      baseHeight = card.height ?? deck?.cardHeight ?? 88;

      itemClone = {
        id: card.id,
        type: ItemType.CARD,
        name: card.name,
        content: card.content, // Image URL - this is the main image
        frontFaceUrl: card.frontFaceUrl,
        backFaceUrl: card.backFaceUrl,
        deckId: card.deckId,
        // Use the card's actual current dimensions (what player sees on table)
        width: card.width,
        height: card.height,
        x: card.x,
        y: card.y,
        rotation: card.rotation,
        location: card.location,
        faceUp: card.faceUp,
        ownerId: card.ownerId,
        isOnTable: card.isOnTable,
        locked: card.locked,
        // Store orientation info for cursor slot rendering
        isHorizontal: isHorizontal,
        // Preserve sprite properties for proper card display
        spriteUrl: card.spriteUrl,
        spriteIndex: card.spriteIndex,
        spriteColumns: card.spriteColumns,
        spriteRows: card.spriteRows,
        shape: card.shape,
        // IMPORTANT: Preserve zIndex to maintain layer relationships
        zIndex: card.zIndex ?? 0,
        hyperscaleLayerId: card.hyperscaleLayerId ?? 'cards',
      } as CardType;
    } else if (item.type === ItemType.DECK) {
      const deck = item as DeckType;
      baseWidth = deck.width ?? 100;
      baseHeight = deck.height ?? 140;

      itemClone = {
        ...deck, // Deep copy to preserve all deck properties
        // IMPORTANT: Preserve all deck-specific properties
        cardIds: [...deck.cardIds], // Copy array to preserve order
        baseCardIds: [...deck.baseCardIds], // Copy array
        piles: deck.piles ? deck.piles.map(pile => ({ ...pile })) : [], // Deep copy piles
        cardShape: deck.cardShape,
        cardOrientation: deck.cardOrientation,
        showTopCard: deck.showTopCard,
        spriteConfig: deck.spriteConfig ? { ...deck.spriteConfig } : undefined,
        // IMPORTANT: Preserve zIndex to maintain layer relationships
        zIndex: deck.zIndex ?? 0,
        hyperscaleLayerId: deck.hyperscaleLayerId ?? 'cards',
      } as DeckType;
    } else if (item.type === ItemType.RANDOMIZER) {
      const randomizer = item as Randomizer;
      baseWidth = randomizer.width ?? 60;
      baseHeight = randomizer.height ?? 60;

      itemClone = {
        ...randomizer, // Deep copy to preserve all randomizer properties
        // Preserve all randomizer-specific settings
        currentValue: randomizer.currentValue,
        options: randomizer.options ? [...randomizer.options] : [],
        // IMPORTANT: Preserve zIndex to maintain layer relationships
        zIndex: randomizer.zIndex ?? 0,
        hyperscaleLayerId: randomizer.hyperscaleLayerId ?? 'tokens',
      } as Randomizer;
    } else if (item.type === ItemType.COUNTER) {
      const counter = item as Counter;
      baseWidth = counter.width ?? 60;
      baseHeight = counter.height ?? 60;

      itemClone = {
        ...counter, // Deep copy to preserve all counter properties
        // Preserve all counter-specific settings
        value: counter.value,
        baseValue: counter.baseValue,
        maxValue: counter.maxValue,
        allowNegative: counter.allowNegative,
        // IMPORTANT: Preserve zIndex to maintain layer relationships
        zIndex: counter.zIndex ?? 0,
        hyperscaleLayerId: counter.hyperscaleLayerId ?? 'tokens',
      } as Counter;
    } else if (item.type === ItemType.DICE_OBJECT) {
      const dice = item as DiceObject;
      baseWidth = dice.width ?? 60;
      baseHeight = dice.height ?? 60;

      itemClone = {
        ...dice, // Deep copy to preserve all dice properties
        // Preserve all dice-specific settings
        currentValue: dice.currentValue,
        sides: dice.sides,
        rollStartTime: dice.rollStartTime,
        // IMPORTANT: Preserve zIndex to maintain layer relationships
        zIndex: dice.zIndex ?? 0,
        hyperscaleLayerId: dice.hyperscaleLayerId ?? 'tokens',
      } as DiceObject;
    } else if (item.type === ItemType.BOARD) {
      const board = item as BoardType;
      baseWidth = board.width ?? 500;
      baseHeight = board.height ?? 500;

      itemClone = {
        ...board, // Deep copy to preserve all board properties
        // Preserve all board-specific settings
        gridType: board.gridType,
        gridSize: board.gridSize,
        gridWidth: board.gridWidth,
        gridHeight: board.gridHeight,
        showGrid: board.showGrid,
        snapToGrid: board.snapToGrid,
        gridCellMagnetPoints: board.gridCellMagnetPoints ? { ...board.gridCellMagnetPoints } : undefined,
        defaultGridCellMagnetPointCount: board.defaultGridCellMagnetPointCount,
        // IMPORTANT: Preserve zIndex to maintain layer relationships
        zIndex: board.zIndex ?? 0,
        hyperscaleLayerId: board.hyperscaleLayerId ?? 'boards',
      } as BoardType;
    } else {
      itemClone = { ...item } as TokenType;
    }

    // Store the index of this item in the cursor slot (used for offset calculation)
    // This ensures consistent offset between slot rendering and dropping
    (itemClone as any).cursorSlotIndex = cursorSlot.length;

    // IMPORTANT: Store original zIndex for proper restoration when dropping
    // This preserves layer relationships between objects
    (itemClone as any).originalZIndex = item.zIndex ?? 0;
    (itemClone as any).timestamp = Date.now(); // Track when item was added to slot

    // Keep original zIndex in clone - sorting happens during render/drop
    itemClone.zIndex = item.zIndex ?? 0;

    // Store source in each item so we can determine the mode even when slotItems is passed
    (itemClone as any).source = source;

    // IMPORTANT: Set cursor position FIRST, before any state changes that trigger re-render
    // This ensures cursorPositionRef.current is updated synchronously before the render happens
    if (mousePosition) {
      // Use the current mouse position when dragging
      const newPos = { x: mousePosition.x, y: mousePosition.y };
      cursorPositionRef.current = newPos;
      setCursorPosition(newPos);
    } else {
      // Calculate screen position of object center (world -> screen) for Shift+click
      // IMPORTANT: Use v2p to convert vu to pixels, and account for scroll position
      const itemCenterX = item.x + (item.width ?? 63) / 2;
      const itemCenterY = item.y + (item.height ?? 88) / 2;
      const screenX = v2p(itemCenterX) - state.viewTransform.scroll.x;
      const screenY = v2p(itemCenterY) - state.viewTransform.scroll.y;
      // Set cursor position to object center on screen
      cursorPositionRef.current = { x: screenX, y: screenY };
      setCursorPosition({ x: screenX, y: screenY });
    }

    // NOW update cursor slot state (triggers re-render)
    setCursorSlot(prev => [...prev, itemClone as CardType | TokenType | BoardType]);
    // Also update ref immediately for consistent state
    cursorSlotRef.current = [...cursorSlotRef.current, itemClone as CardType | TokenType | BoardType];

    // Mark the item as inCursorSlot immediately (no delay for smoother pickup)
    dispatch({ type: 'UPDATE_OBJECT', payload: { id, inCursorSlot: true } });

    // Clean up magnet points - when picking up an object, remove it from any cell's magnet points
    // and reposition remaining objects (OPTIMIZED: only for tokens that are actually snapped)
    const pickedObj = state.objects[id];
    if (pickedObj && pickedObj.type === ItemType.TOKEN && (pickedObj as Token).gridCellKey) {
      // Token is snapped to a grid cell - clean up magnet points
      for (const cellObj of Object.values(state.objects)) {
        if ((cellObj.type === ItemType.BATTLEFIELD_CELL || cellObj.type === ItemType.NEXUS_CELL) && cellObj.magnetPoints) {
          const cell = cellObj as BattlefieldCell | NexusCellObject;
          if (cell.magnetPoints?.some(p => p.objectId === id)) {
            const result = removeObjectFromCellMagnet(cell, id, state.objects);
            if (result) {
              // Batch all updates together for better performance
              const updates = [
                {
                  id: cell.id,
                  magnetPointCount: result.updatedCell.magnetPointCount,
                  magnetPoints: result.updatedCell.magnetPoints
                },
                ...result.movedObjects.map(movedObj => ({
                  id: movedObj.objectId,
                  x: movedObj.x,
                  y: movedObj.y
                }))
              ];

              // Dispatch all updates in one batch
              updates.forEach(update => {
                dispatch({ type: 'UPDATE_OBJECT', payload: update });
              });
            }
          }
        }
      }
    }
  }, [cursorSlot.length, dispatch, v2p, state.viewTransform, state.objects, cursorSlotRef]);

  // Drop all items from cursor slot at specified screen coordinates
  const dropCursorSlot = useCallback((clientX: number, clientY: number, slotItems?: (CardType | TokenType | BoardType)[]) => {
    // Use provided slotItems or fall back to cursorSlot from state
    const currentSlot = slotItems ?? cursorSlot;
    if (currentSlot.length === 0) return;

    // Notify that items were dropped from cursor slot (for hand panel to clear pickingUpCardIds)
    const droppedIds = currentSlot.map(item => item.id);
    window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
      detail: { cardIds: droppedIds }
    }));

    // Check if cursor is over a token archetype card (in MainMenu or TokensPanel)
    // If so, prevent the drop to avoid accidental drops when clicking tokens
    const elementAtCursor = document.elementFromPoint(clientX, clientY);
    const archetypeCard = elementAtCursor?.closest('[data-archetype-card]');

    if (archetypeCard) {
      // Cursor is over a token button, don't drop
      return;
    }

    // Determine if we should preserve original zIndex or use stack zIndex
    // Read source from the first item in slot (stored when adding to slot)
    // Shift mode: use stack zIndex (10000+), Hold/Archetype mode: preserve original
    const itemSource = currentSlot.length > 0 ? (currentSlot[0] as any).source : null;
    const source = itemSource || cursorSlotSource;
    const useOriginalZIndex = source === 'hold' || source === 'archetype';

    // NOTE: Dropping on decks is handled by handleGlobalMouseUp -> dropToDeck
    // This function only handles dropping on the tabletop (not on decks)

    // Not dropping on a deck - drop items on tabletop
    // Convert screen coordinates to world coordinates
    // clientX/Y are viewport coordinates, add scroll position to get world-relative position
    const scrollX = state.viewTransform.scroll.x;
    const scrollY = state.viewTransform.scroll.y;
    const worldX = p2v(clientX + scrollX);
    const worldY = p2v(clientY + scrollY);

    // Find cell with snapToGrid enabled under cursor for automatic magnetism
    const snapRadius = 100; // VU - radius to check for cell
    let targetCell: (BattlefieldCell | NexusCellObject) | null = null;
    let targetBoardCell: { board: BoardType; col: number; row: number; cellCenterX: number; cellCenterY: number } | null = null;

    // Only tokens and cards use automatic cell magnetism
    const firstItem = currentSlot[0];
    const isToken = firstItem?.type === ItemType.TOKEN;
    const isCard = firstItem?.type === ItemType.CARD;
    if (firstItem && (isToken || isCard)) {
      // Check battlefield cells first
      for (const obj of Object.values(state.objects)) {
        if ((obj.type === ItemType.BATTLEFIELD_CELL || obj.type === ItemType.NEXUS_CELL) &&
            obj.snapToGrid &&
            obj.isOnTable !== false) {
          const cell = obj as BattlefieldCell | NexusCellObject;
          const cellCenterX = cell.x + (cell.width ?? 100) / 2;
          const cellCenterY = cell.y + (cell.height ?? 100) / 2;
          const distance = Math.sqrt(
            Math.pow(worldX - cellCenterX, 2) +
            Math.pow(worldY - cellCenterY, 2)
          );

          // Use the larger of cell dimensions as snap radius
          const cellSnapRadius = Math.max(cell.width ?? 100, cell.height ?? 100) / 2 + 50;
          if (distance <= cellSnapRadius) {
            targetCell = cell;
            break;
          }
        }
      }

      // If no battlefield cell found, check Board grid cells
      if (!targetCell) {
        for (const obj of Object.values(state.objects)) {
          if (obj.type === ItemType.BOARD &&
              (isCard ? (obj as BoardType).snapCardsToGrid : (obj as BoardType).snapToGrid) &&
              (obj as BoardType).gridType !== GridType.NONE &&
              obj.isOnTable !== false) {
            const board = obj as BoardType;
            const gridW = board.gridWidth || board.gridSize || 50;
            const gridH = board.gridHeight || board.gridSize || 50;
            let cellCenterX: number, cellCenterY: number;

            if (board.gridType === GridType.SQUARE) {
              // Transform world coordinates to board's local coordinate system
              const localCoords = transformCursorToBoardSpace(worldX, worldY, board);
              const col = Math.floor(localCoords.x / gridW);
              const row = Math.floor(localCoords.y / gridH);

              // Check if cell is within board bounds
              if (col >= 0 && col < Math.floor(board.width / gridW) &&
                  row >= 0 && row < Math.floor(board.height / gridH)) {
                // Calculate cell center in local coordinates
                const localCellCenterX = (col * gridW) + (gridW / 2);
                const localCellCenterY = (row * gridH) + (gridH / 2);

                // Transform to world coordinates
                const worldCellCenter = transformPointWithBoardRotation(
                  board.x + localCellCenterX,
                  board.y + localCellCenterY,
                  board
                );

                cellCenterX = worldCellCenter.x;
                cellCenterY = worldCellCenter.y;
                targetBoardCell = { board, col, row, cellCenterX, cellCenterY };
                break;
              }
            } else if (board.gridType === GridType.HEX) {
              // Pointy-top hex grid - using gridUtils for consistency
              const hexW = gridW || 100;
              const hexH = gridH || (hexW * 1.15);  // Use board's gridHeight if available

              // Transform world coordinates to board's local coordinate system
              const localCoords = transformCursorToBoardSpace(worldX, worldY, board);

              const localHexCenter = getHexCenterAtPixel(
                  localCoords.x,
                  localCoords.y,
                  hexW,
                  hexH,
                  'pointy-top'
              );

              // Transform to world coordinates
              const worldCellCenter = transformPointWithBoardRotation(
                board.x + localHexCenter.x,
                board.y + localHexCenter.y,
                board
              );

              cellCenterX = worldCellCenter.x;
              cellCenterY = worldCellCenter.y;

              // Calculate col and row from hex center position (in local coordinates)
              const hCapIdeal = hexW / (2 * Math.sqrt(3));
              const hCap = Math.min(hCapIdeal, hexH / 2);
              const dx = hexW;
              const dy = hexH - hCap;
              const offsetX = hexW / 2;

              const row = Math.round(localHexCenter.y / dy);
              const col = Math.round((localHexCenter.x - (row % 2) * offsetX) / dx);

              // Check if hex center is within board bounds (in local coordinates)
              const hexX = localHexCenter.x;
              const hexY = localHexCenter.y;
              const halfW = hexW / 2;
              const halfH = hexH / 2;

              if (hexX >= -halfW && hexX <= board.width + halfW &&
                  hexY >= -halfH && hexY <= board.height + halfH) {
                targetBoardCell = { board, col, row, cellCenterX, cellCenterY };
                break;
              }
            } else if (board.gridType === GridType.HEX_HORIZONTAL) {
              // Flat-top hex grid - using gridUtils for consistency
              const hexW = gridW || 115;
              const hexH = gridH || (hexW / 1.15);  // Use board's gridHeight if available

              const wCapIdeal = hexH / (2 * Math.sqrt(3));
              const wCap = Math.min(wCapIdeal, hexW / 2);

              // Transform world coordinates to board's local coordinate system
              const localCoords = transformCursorToBoardSpace(worldX, worldY, board);

              const localHexCenter = getHexCenterAtPixel(
                  localCoords.x,
                  localCoords.y,
                  hexW,
                  hexH,
                  'flat-top'
              );

              // Transform to world coordinates
              const worldCellCenter = transformPointWithBoardRotation(
                board.x + localHexCenter.x,
                board.y + localHexCenter.y,
                board
              );

              cellCenterX = worldCellCenter.x;
              cellCenterY = worldCellCenter.y;

              // Calculate col and row from hex center position (in local coordinates)
              const dx = hexW - wCap;
              const dy = hexH;
              const offsetY = hexH / 2;

              const col = Math.round(localHexCenter.x / dx);
              const row = Math.round((localHexCenter.y - (col % 2) * offsetY) / dy);

              // Check if hex center is within board bounds (in local coordinates)
              const hexX = localHexCenter.x;
              const hexY = localHexCenter.y;
              const halfW = hexW / 2;
              const halfH = hexH / 2;

              if (hexX >= -halfW && hexX <= board.width + halfW &&
                  hexY >= -halfH && hexY <= board.height + halfH) {
                targetBoardCell = { board, col, row, cellCenterX, cellCenterY };
                break;
              }
            }
          }
        }
      }
    }

    // Track cells that need to be updated (to avoid duplicate updates)
    const updatedCellIds = new Set<string>();

    // Sort by originalZIndex in DESCENDING order to preserve layer relationships when dropping
    // Items with higher originalZIndex (top) should be processed first
    const sortedSlot = [...currentSlot].sort((a, b) => {
      const zA = (a as any).originalZIndex ?? a.zIndex ?? 0;
      const zB = (b as any).originalZIndex ?? b.zIndex ?? 0;
      return zB - zA; // Descending order - higher Z first
    });

    // Calculate base Z for preserving layer proportions from original zIndex
    const minOriginalZ = Math.min(...currentSlot.map(item => (item as any).originalZIndex ?? 0));

    // Add all items from slot back to the game with automatic magnetism
    sortedSlot.forEach((item, sortedIndex) => {
      const isCard = item.type === ItemType.CARD;
      const isDeck = item.type === ItemType.DECK;
      const isRandomizer = item.type === ItemType.RANDOMIZER;
      const isCounter = item.type === ItemType.COUNTER;
      const isDice = item.type === ItemType.DICE_OBJECT;
      const isBoard = item.type === ItemType.BOARD;

      let baseWidth = item.width ?? 50;
      let baseHeight = item.height ?? 50;

      // For cards, get settings from deck for proper dimensions
      let isHorizontal = (item as any).isHorizontal;
      if (isCard) {
        const cardSettings = getCardSettings(item as CardType);
        baseWidth = item.width ?? cardSettings.cardWidth ?? 63;
        baseHeight = item.height ?? cardSettings.cardHeight ?? 88;
        isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;
      } else if (isDeck) {
        baseWidth = item.width ?? 100;
        baseHeight = item.height ?? 140;
      } else if (isRandomizer || isCounter || isDice) {
        baseWidth = item.width ?? 60;
        baseHeight = item.height ?? 60;
      } else if (isBoard) {
        baseWidth = item.width ?? 500;
        baseHeight = item.height ?? 500;
      }

      // For horizontal cards, swap dimensions to match cursor visualization
      if (isHorizontal) {
        [baseWidth, baseHeight] = [baseHeight, baseWidth];
      }

      // Clamp zIndex to hyperscale layer bounds
      const itemLayer = state.hyperscaleLayers.find(l => l.id === item.hyperscaleLayerId);
      const minZ = itemLayer?.minZIndex ?? 1;
      const maxZ = itemLayer?.maxZIndex ?? 10000;

      // Use original zIndex if preserving, otherwise preserve relative layer proportions
      const originalZIndex = (item as any).originalZIndex ?? item.zIndex ?? 0;
      let stackZ: number;
      if (useOriginalZIndex) {
        // Hold mode: use original zIndex directly
        stackZ = originalZIndex;
      } else {
        // Shift mode: preserve relative proportions starting from 10000
        // Calculate offset from minimum original Z and add to base 10000
        const relativeZ = originalZIndex - minOriginalZ;
        stackZ = Math.min(10000 + relativeZ, maxZ);
      }
      const defaultZIndex = Math.max(minZ, Math.min(maxZ, stackZ));

      let finalX: number, finalY: number;
      let finalRotation: number = item.rotation ?? 0; // Will be updated if snapRotationToGrid is enabled
      let finalZIndex: number = defaultZIndex; // Will be overridden if snapped to cell

      // Use automatic magnetism for tokens dropped on cells
      if (item.type === ItemType.TOKEN && targetCell && !updatedCellIds.has(targetCell.id)) {
        const result = addObjectToCellMagnet(targetCell, item.id, state.objects);

        // Calculate zIndex for new object - place it below all already snapped objects
        // Find minimum zIndex among objects already snapped to this cell
        const existingSnappedObjectIds = (targetCell.magnetPoints ?? [])
          .filter(p => p.objectId !== item.id) // Exclude the object being added
          .map(p => p.objectId);

        let snappedObjectZIndices: number[] = [];
        for (const snappedId of existingSnappedObjectIds) {
          const snappedObj = state.objects[snappedId];
          if (snappedObj) {
            snappedObjectZIndices.push(snappedObj.zIndex ?? minZ);
          }
        }

        // Find the lowest zIndex among snapped objects, and place new object below it
        if (snappedObjectZIndices.length > 0) {
          const minSnappedZ = Math.min(...snappedObjectZIndices);
          // Place new object below the lowest snapped object (subtract 1, but respect minZ)
          finalZIndex = Math.max(minZ, minSnappedZ - 1);
        } else {
          // First object being snapped - use its current zIndex or cell's zIndex - 1
          finalZIndex = useOriginalZIndex
            ? ((item as any).originalZIndex ?? minZ)
            : Math.max(minZ, (targetCell.zIndex ?? minZ + 1) - 1);
        }

        // Ensure we don't exceed layer bounds
        finalZIndex = Math.max(minZ, Math.min(maxZ, finalZIndex));

        // Update the cell with new magnet points
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: targetCell.id,
            magnetPointCount: result.updatedCell.magnetPointCount,
            magnetPoints: result.updatedCell.magnetPoints
          }
        });

        // Move existing objects to their new magnet positions
        for (const movedObj of result.movedObjects) {
          if (movedObj.objectId !== item.id) {
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: movedObj.objectId,
                x: movedObj.x,
                y: movedObj.y
              }
            });
          }
        }

        // Calculate final position for the new object (center to top-left)
        finalX = result.snapPosition.x - baseWidth / 2;
        finalY = result.snapPosition.y - baseHeight / 2;

        // Mark cell as updated
        updatedCellIds.add(targetCell.id);
      } else if (item.type === ItemType.TOKEN && targetBoardCell && !updatedCellIds.has(targetBoardCell.board.id)) {
        // Snap to Board grid cell with magnetism
        const { board, col, row, cellCenterX, cellCenterY } = targetBoardCell;
        const gridW = board.gridWidth || board.gridSize || 50;
        const gridH = board.gridHeight || board.gridSize || 50;

        // Add object to grid cell magnet points
        const result = addObjectToGridCellMagnet(
          board,
          col,
          row,
          item.id,
          state.objects,
          cellCenterX,
          cellCenterY,
          gridW,
          gridH
        );

        // Calculate zIndex for new object - place it below all already snapped objects in this cell
        const cellKey = generateGridCellKey(col, row);
        const gridCellKeyForToken = `${board.id}:${cellKey}`; // Store direct reference in token

        const existingSnappedObjectIds = (board.gridCellMagnetPoints?.[cellKey]?.magnetPoints ?? [])
          .filter(p => p.objectId !== item.id) // Exclude the object being added
          .map(p => p.objectId);

        let snappedObjectZIndices: number[] = [];
        for (const snappedId of existingSnappedObjectIds) {
          const snappedObj = state.objects[snappedId];
          if (snappedObj) {
            snappedObjectZIndices.push(snappedObj.zIndex ?? minZ);
          }
        }

        // Find the lowest zIndex among snapped objects, and place new object below it
        if (snappedObjectZIndices.length > 0) {
          const minSnappedZ = Math.min(...snappedObjectZIndices);
          // Place new object below the lowest snapped object (subtract 1, but respect minZ)
          finalZIndex = Math.max(minZ, minSnappedZ - 1);
        } else {
          // First object being snapped - use its current zIndex or board's zIndex - 1
          finalZIndex = useOriginalZIndex
            ? ((item as any).originalZIndex ?? minZ)
            : Math.max(minZ, (board.zIndex ?? minZ + 1) - 1);
        }

        // Ensure we don't exceed layer bounds
        finalZIndex = Math.max(minZ, Math.min(maxZ, finalZIndex));

        // Create updated board object preserving all other properties
        const updatedBoardForDrop = {
          ...board,
          gridCellMagnetPoints: result.updatedBoard.gridCellMagnetPoints
        };

        // Update the board with new grid cell magnet points
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: updatedBoardForDrop
        });

        // Move existing objects to their new magnet positions
        for (const movedObj of result.movedObjects) {
          if (movedObj.objectId !== item.id) {
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: movedObj.objectId,
                x: movedObj.x,
                y: movedObj.y
              }
            });
          }
        }

        // Calculate final position for the new object (center to top-left)
        finalX = result.snapPosition.x - baseWidth / 2;
        finalY = result.snapPosition.y - baseHeight / 2;

        // Store gridCellKey in the token for faster lookup when unhooking
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: item.id,
            gridCellKey: gridCellKeyForToken
          }
        });

        // Mark board as updated
        updatedCellIds.add(board.id);
      } else {
        // No cell magnetism - use regular snapping
        let snapTargetX: number, snapTargetY: number;

        // Check if object is being dragged from pool panel
        const fromPoolPanel = (item as any).fromPoolPanel;
        if (fromPoolPanel && useOriginalZIndex) {
          // Object from pool panel - use CURRENT CURSOR POSITION instead of original position
          // This allows dragging objects from pool panel to any position on tabletop
          snapTargetX = worldX;
          snapTargetY = worldY;
        } else if (item.type === ItemType.TOKEN || item.type === ItemType.CARD) {
          const snappedPos = getSnappedCoordinates(worldX, worldY, state.objects, item.id);
          snapTargetX = snappedPos.x + baseWidth / 2;
          snapTargetY = snappedPos.y + baseHeight / 2;

          // Apply board rotation if snapped to a board with snapRotationToGrid enabled
          if (snappedPos.snappedToBoard && snappedPos.snappedToBoard.snapRotationToGrid) {
            finalRotation = snappedPos.snappedToBoard.rotation ?? 0;
          }
        } else {
          snapTargetX = worldX;
          snapTargetY = worldY;
        }

        // Apply stacking offset for multiple items
        // Use sortedIndex to ensure offset matches zIndex order
        // Highest zIndex (top, sortedIndex=0) gets no offset, lower gets more offset
        const offsetFromFront = sortedIndex;
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.05;
        const offsetX = offsetFromFront * offsetAmount;
        const offsetY = offsetFromFront * offsetAmount;

        finalX = snapTargetX - baseWidth / 2 + offsetX;
        finalY = snapTargetY - baseHeight / 2 + offsetY;
      }

      // Use DROP_FROM_CURSOR_SLOT action with undo tracking
      dispatch({
        type: 'DROP_FROM_CURSOR_SLOT',
        payload: {
          objectId: item.id,
          x: finalX,
          y: finalY,
          zIndex: finalZIndex,
          rotation: finalRotation,
        },
      });
    });

    // Track recently dropped objects to prevent showing shadow version
    const recentlyDroppedIds = new Set(currentSlot.map(item => item.id));
    setRecentlyInMyCursorSlot(recentlyDroppedIds);
    // Clear after 500ms (enough time for WebRTC sync)
    setTimeout(() => {
      setRecentlyInMyCursorSlot(prev => {
        const next = new Set(prev);
        recentlyDroppedIds.forEach(id => next.delete(id));
        return next;
      });
    }, 500);

    // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
    processingAddToSlotRef.current.clear();

    // Clear the slot - also update ref immediately for mouseup handler
    cursorSlotRef.current = [];
    setCursorSlot([]);
    setCursorPosition(null);
    setCursorSlotSource(null);
    // Set flag to prevent immediate re-pickup
    justDroppedRef.current = true;
    lastDropTimeRef.current = Date.now();
  }, [cursorSlot, cursorSlotSource, p2v, state.viewTransform, state.objects, state.hyperscaleLayers, dispatch, getCardSettings, getSnappedCoordinates]);

  // Listen for drop-cursor-slot-at-position events (from drag-to-place in ToolsPanel)
  useEffect(() => {
    const handleDropAtPosition = (e: Event) => {
      const customEvent = e as CustomEvent<{ clientX: number; clientY: number }>;
      const { clientX, clientY } = customEvent.detail;

      // Check if cursor is over a token archetype card (in MainMenu or TokensPanel)
      // If so, prevent the drop to avoid accidental drops when clicking tokens
      const elementAtCursor = document.elementFromPoint(clientX, clientY);
      const archetypeCard = elementAtCursor?.closest('[data-archetype-card]');

      if (archetypeCard) {
        // Cursor is over a token button, don't drop
        return;
      }

      // Drop the cursor slot at the specified position
      if (cursorSlot.length > 0) {
        dropCursorSlot(clientX, clientY);
      }
    };

    window.addEventListener('drop-cursor-slot-at-position', handleDropAtPosition);
    return () => window.removeEventListener('drop-cursor-slot-at-position', handleDropAtPosition);
  }, [cursorSlot.length, dropCursorSlot]);

  // Listen for cursor-slot-drop-to-tabletop events from PoolTabletop
  useEffect(() => {
    const handleDropToTabletop = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number; y: number }>;
      const { x, y } = customEvent.detail;

      // Only process if cursor slot has items
      const currentSlot = cursorSlotRef.current;
      if (currentSlot.length === 0) return;

      // Drop objects on main tabletop using the existing dropCursorSlot function
      dropCursorSlot(x, y, currentSlot);

      // Clear cursor slot immediately after drop to prevent ghost objects
      cursorSlotRef.current = [];
      setCursorSlot([]);
      setCursorPosition(null);
      setCursorSlotSource(null);
    };

    window.addEventListener('cursor-slot-drop-to-tabletop', handleDropToTabletop);
    return () => window.removeEventListener('cursor-slot-drop-to-tabletop', handleDropToTabletop);
  }, [dropCursorSlot]);

  // Drop cursor slot items to a specific deck (called from handleGlobalClick when clicking on deck)
  const dropToDeck = useCallback((deckId: string, slotItems?: (CardType | TokenType | BoardType)[]) => {
    // Use provided slotItems or fall back to cursorSlot from state
    const currentSlot = slotItems ?? cursorSlot;

    if (currentSlot.length === 0) {
      return;
    }

    // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
    processingAddToSlotRef.current.clear();

    const deck = state.objects[deckId] as DeckType;
    if (!deck) {
      return;
    }

    // Only add cards to deck (not tokens)
    const cardsInSlot = currentSlot.filter(item => item.type === ItemType.CARD);
    if (cardsInSlot.length > 0) {
      const cardIds = cardsInSlot.map(item => item.id);

      // First, restore cards from cursor slot (set inCursorSlot: false)
      // ADD_CARD_TO_TOP_OF_DECK will update their position to deck position
      cardsInSlot.forEach((item) => {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: item.id, inCursorSlot: false, fromPoolPanel: undefined }
        });
      });

      // Notify that cards were dropped from cursor slot (for hand panel to clear pickingUpCardIds)
      window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
        detail: { cardIds }
      }));

      // Then add them to the deck in reverse order (last in slot = first to be added = ends up on top)
      [...cardsInSlot].reverse().forEach((item) => {
        dispatch({
          type: 'ADD_CARD_TO_TOP_OF_DECK',
          payload: { cardId: item.id, deckId }
        });
      });
    }

    // For non-card items (tokens), drop them on the tabletop at deck position
    const nonCardsInSlot = currentSlot.filter(item => item.type !== ItemType.CARD);
    if (nonCardsInSlot.length > 0) {
      // Sort by originalZIndex in DESCENDING order to preserve layer relationships
      const sortedTokens = [...nonCardsInSlot].sort((a, b) => {
        const zA = (a as any).originalZIndex ?? a.zIndex ?? 0;
        const zB = (b as any).originalZIndex ?? b.zIndex ?? 0;
        return zB - zA; // Descending order - higher Z first
      });

      // Calculate base Z for preserving layer proportions
      const minOriginalZ = Math.min(...nonCardsInSlot.map(item => (item as any).originalZIndex ?? 0));

      sortedTokens.forEach((item, sortedIndex) => {
        const baseWidth = item.width ?? 50;
        const baseHeight = item.height ?? 50;

        // Calculate offset using sortedIndex to match zIndex order
        // Highest zIndex (top, sortedIndex=0) gets no offset, lower gets more offset
        const offsetFromFront = sortedIndex;
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.05;
        const offsetX = offsetFromFront * offsetAmount;
        const offsetY = offsetFromFront * offsetAmount;

        // Clamp zIndex to hyperscale layer bounds
        const itemLayer = state.hyperscaleLayers.find(l => l.id === item.hyperscaleLayerId);
        const maxZ = itemLayer?.maxZIndex ?? 10000;
        const originalZIndex = (item as any).originalZIndex ?? item.zIndex ?? 0;
        const relativeZ = originalZIndex - minOriginalZ;
        const stackZ = Math.min(10000 + relativeZ, maxZ);

        // Use DROP_FROM_CURSOR_SLOT action with undo tracking
        dispatch({
          type: 'DROP_FROM_CURSOR_SLOT',
          payload: {
            objectId: item.id,
            x: deck.x + deck.width / 2 - baseWidth / 2 + offsetX,
            y: deck.y + deck.height / 2 - baseHeight / 2 + offsetY,
            zIndex: stackZ,
          }
        });
      });
    }

    // Track recently dropped objects to prevent showing shadow version
    const droppedIds = new Set(currentSlot.map(item => item.id));
    setRecentlyInMyCursorSlot(droppedIds);
    setTimeout(() => {
      setRecentlyInMyCursorSlot(prev => {
        const next = new Set(prev);
        droppedIds.forEach(id => next.delete(id));
        return next;
      });
    }, 500);

    // Clear the slot - also update ref immediately for mouseup handler
    cursorSlotRef.current = [];
    setCursorSlot([]);
    setCursorPosition(null);
    setCursorSlotSource(null);
  }, [cursorSlot, dispatch, state.objects]);

  // Drop cursor slot items to a specific pile (called from handleGlobalClick when clicking on pile)
  const dropToPile = useCallback((pileId: string, deckId: string, slotItems?: (CardType | TokenType | BoardType)[]) => {
    // Use provided slotItems or fall back to cursorSlot from state
    const currentSlot = slotItems ?? cursorSlot;

    if (currentSlot.length === 0) {
      return;
    }

    // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
    processingAddToSlotRef.current.clear();

    // Only add cards to pile (not tokens)
    const cardsInSlot = currentSlot.filter(item => item.type === ItemType.CARD);
    if (cardsInSlot.length > 0) {
      const cardIds = cardsInSlot.map(item => item.id);

      // First, restore cards from cursor slot (set inCursorSlot: false)
      cardsInSlot.forEach((item) => {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: item.id, inCursorSlot: false, fromPoolPanel: undefined }
        });
      });

      // Notify that cards were dropped from cursor slot (for hand panel to clear pickingUpCardIds)
      window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
        detail: { cardIds }
      }));

      // Then add them to the pile in reverse order (last in slot = first to be added = ends up on top)
      [...cardsInSlot].reverse().forEach((item) => {
        dispatch({
          type: 'ADD_CARD_TO_PILE',
          payload: { cardId: item.id, pileId, deckId }
        });
      });
    }

    // For non-card items (tokens), drop them on the tabletop near the pile
    const deck = state.objects[deckId] as DeckType;
    const pile = deck?.piles?.find(p => p.id === pileId);
    const nonCardsInSlot = currentSlot.filter(item => item.type !== ItemType.CARD);
    if (nonCardsInSlot.length > 0 && deck && pile) {
      // Determine if we should preserve original zIndex
      const useOriginalZIndex = cursorSlotSource === 'hold' || cursorSlotSource === 'archetype';

      // Calculate pile position (same logic as in render)
      const pileSize = pile.size ?? 1;
      let pileX: number, pileY: number;

      if (pile.position === 'free') {
        pileX = pile.x ?? 0;
        pileY = pile.y ?? 0;
      } else if (pile.position === 'right') {
        pileX = deck.x + deck.width + 4;
        pileY = deck.y;
      } else if (pile.position === 'left') {
        pileX = deck.x - deck.width - 4;
        pileY = deck.y;
      } else if (pile.position === 'top') {
        pileX = deck.x;
        pileY = deck.y - deck.height - 4;
      } else if (pile.position === 'bottom') {
        pileX = deck.x;
        pileY = deck.y + deck.height + 4;
      } else {
        pileX = deck.x;
        pileY = deck.y;
      }

      // Sort by originalZIndex in DESCENDING order to preserve layer relationships
      const sortedTokens = [...nonCardsInSlot].sort((a, b) => {
        const zA = (a as any).originalZIndex ?? a.zIndex ?? 0;
        const zB = (b as any).originalZIndex ?? b.zIndex ?? 0;
        return zB - zA; // Descending order - higher Z first
      });

      // Calculate base Z for preserving layer proportions
      const minOriginalZ = Math.min(...nonCardsInSlot.map(item => (item as any).originalZIndex ?? 0));

      sortedTokens.forEach((item, sortedIndex) => {
        const baseWidth = item.width ?? 50;
        const baseHeight = item.height ?? 50;

        // Calculate offset using sortedIndex to match zIndex order
        // Highest zIndex (top, sortedIndex=0) gets no offset, lower gets more offset
        const offsetFromFront = sortedIndex;
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.05;
        const offsetX = offsetFromFront * offsetAmount;
        const offsetY = offsetFromFront * offsetAmount;

        // Clamp zIndex to hyperscale layer bounds
        const itemLayer = state.hyperscaleLayers.find(l => l.id === item.hyperscaleLayerId);
        const minZ = itemLayer?.minZIndex ?? 1;
        const maxZ = itemLayer?.maxZIndex ?? 10000;

        // Use original zIndex if preserving, otherwise preserve relative proportions
        const originalZIndex = (item as any).originalZIndex ?? item.zIndex ?? 0;
        let stackZ: number;
        if (useOriginalZIndex) {
          stackZ = originalZIndex;
        } else {
          const relativeZ = originalZIndex - minOriginalZ;
          stackZ = Math.min(10000 + relativeZ, maxZ);
        }
        const zIndex = Math.max(minZ, Math.min(maxZ, stackZ));

        // Calculate center position (without offset for snapping)
        const pileCenterX = pileX + deck.width * pileSize / 2;
        const pileCenterY = pileY + deck.height * pileSize / 2;

        // Apply grid snapping for tokens and cards (find snap from center, then add offset)
        let finalX, finalY, finalRotation = item.rotation ?? 0;
        if (item.type === ItemType.TOKEN || item.type === ItemType.CARD) {
          const snappedPos = getSnappedCoordinates(pileCenterX, pileCenterY, state.objects, item.id);
          // snappedPos is top-left, convert to center, add offset, convert back to top-left
          finalX = snappedPos.x + baseWidth / 2 + offsetX - baseWidth / 2;
          finalY = snappedPos.y + baseHeight / 2 + offsetY - baseHeight / 2;

          // Apply board rotation if snapped to a board with snapRotationToGrid enabled
          if (snappedPos.snappedToBoard && snappedPos.snappedToBoard.snapRotationToGrid) {
            finalRotation = snappedPos.snappedToBoard.rotation ?? 0;
          }
        } else {
          finalX = pileCenterX - baseWidth / 2 + offsetX;
          finalY = pileCenterY - baseHeight / 2 + offsetY;
        }

        // Use original item.id - restore token to tabletop
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: item.id,
            inCursorSlot: false,
            fromPoolPanel: undefined,
            x: finalX,
            y: finalY,
            zIndex,
            rotation: finalRotation,
          }
        });
      });
    }

    // Track recently dropped objects to prevent showing shadow version
    const droppedIds = new Set(currentSlot.map(item => item.id));
    setRecentlyInMyCursorSlot(droppedIds);
    setTimeout(() => {
      setRecentlyInMyCursorSlot(prev => {
        const next = new Set(prev);
        droppedIds.forEach(id => next.delete(id));
        return next;
      });
    }, 500);

    // Clear the slot - also update ref immediately for mouseup handler
    cursorSlotRef.current = [];
    setCursorSlot([]);
    setCursorPosition(null);
    setCursorSlotSource(null);
  }, [cursorSlot, cursorSlotSource, dispatch, state.objects]);

  // Global click handler to drop cursor slot items when clicking outside hand panel
  // NOTE: This effect depends on cursorSlot to ensure the handler has fresh data
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // IMPORTANT: Block all object interactions when ruler tool is active
      if (currentTool === 'ruler') {
        return; // Let ruler have exclusive control
      }

      // IMPORTANT: If clicking inside ANY context menu, don't process global clicks
      // This prevents interference with context menu button clicks in both Tabletop and Pool panels
      const tableContextMenuElement = target.closest('[data-context-menu="tabletop"]');
      const poolContextMenuElement = target.closest('[data-context-menu="pool"]');
      const submenuElement = target.closest('[data-submenu="true"]');
      const searchDeckModalElement = target.closest('[data-modal="search-deck"]');
      const topDeckModalElement = target.closest('[data-modal="top-deck"]');


      // IMPORTANT: Check for card/deck click actions FIRST, before cursor slot check
      // This allows click actions to work even when cursor slot is empty
      if (e.button === 0) { // Only left click
        // Try to find the object element - check both data-object-id and navigate up the DOM tree
        let objElement = target.closest('[data-object-id]');

        // If not found directly, try to find by checking parent elements more thoroughly
        if (!objElement) {
          let currentElement = target as HTMLElement;
          while (currentElement && currentElement !== document.body) {
            if (currentElement.getAttribute && currentElement.getAttribute('data-object-id')) {
              objElement = currentElement;
              break;
            }
            currentElement = currentElement.parentElement as HTMLElement;
          }
        }

        if (objElement) {
          const objectId = objElement.getAttribute('data-object-id');
          if (objectId) {
            const obj = state.objects[objectId];
            // Check for cards with click actions
            if (obj?.type === ItemType.CARD) {
              const cardSettings = getCardSettings(obj as CardType);
              // If this card has click actions configured, don't intercept the mousedown
              if (cardSettings.singleClickAction || cardSettings.doubleClickAction) {
                return; // Let the card's click handlers work
              }
            }
            // Check for decks with click actions
            if (obj?.type === ItemType.DECK) {
              const deck = obj as DeckType;
              // If this deck has click actions configured, don't intercept the mousedown
              if (deck.singleClickAction || deck.doubleClickAction) {
                return; // Let the deck's click handlers work
              }
            }
          }
        }
      }

      if (tableContextMenuElement || poolContextMenuElement || submenuElement || searchDeckModalElement || topDeckModalElement) {
        return;
      }

      // CRITICAL: Check for Ctrl/Meta FIRST to allow adding items to slot
      // This must happen BEFORE click actions check to ensure Shift+click works properly
      if ((e.ctrlKey || e.metaKey) && cursorSlotRef.current.length === 0) {
        return; // Let handleMouseDown add the clicked item to slot
      }

      // Close click tooltip on any click
      if (clickTooltip) {
        setClickTooltip(null);
        clickTooltipBoundsRef.current = null;
      }

      // IMPORTANT: Check for card/deck click actions FIRST, before cursor slot check
      // This allows click actions to work even when cursor slot is empty
      if (e.button === 0) { // Only left click
        // Try to find the object element - check both data-object-id and navigate up the DOM tree
        let objElement = target.closest('[data-object-id]');

        // If not found directly, try to find by checking parent elements more thoroughly
        if (!objElement) {
          let currentElement = target as HTMLElement;
          while (currentElement && currentElement !== document.body) {
            if (currentElement.getAttribute && currentElement.getAttribute('data-object-id')) {
              objElement = currentElement;
              break;
            }
            currentElement = currentElement.parentElement as HTMLElement;
          }
        }

        if (objElement) {
          const objectId = objElement.getAttribute('data-object-id');
          if (objectId) {
            const obj = state.objects[objectId];
            // Check for cards with click actions
            if (obj?.type === ItemType.CARD) {
              const cardSettings = getCardSettings(obj as CardType);
              // If this card has click actions configured, don't intercept the mousedown
              if (cardSettings.singleClickAction || cardSettings.doubleClickAction) {
                return; // Let the card's click handlers work
              }
            }
            // Check for decks with click actions
            if (obj?.type === ItemType.DECK) {
              const deck = obj as DeckType;
              // If this deck has click actions configured, don't intercept the mousedown
              if (deck.singleClickAction || deck.doubleClickAction) {
                return; // Let the deck's click handlers work
              }
            }
          }
        }
      }

      // IMPORTANT: Check for Ctrl/Meta to allow adding NEW items to slot FIRST
      // This must happen BEFORE other checks to ensure Shift+click works properly
      // When Ctrl/Meta is pressed, NEVER drop - always allow adding more items to slot
      if (e.ctrlKey || e.metaKey) {
        return; // Let handleMouseDown add the clicked item to slot
      }

      // IMPORTANT: Use cursorSlotRef.current instead of cursorSlot to avoid race condition
      // cursorSlot in closure may be stale due to async React state updates
      if (cursorSlotRef.current.length === 0 || e.button !== 0) {
        return;
      }

      // Check if clicking on an archetype card (token type in ToolsPanel or MainMenu)
      const archetypeCard = target.closest('[data-archetype-card]');
      if (archetypeCard) {
        return; // Don't drop cursor slot when clicking on archetype cards
      }

      // If Ctrl/Meta is pressed and slot has items, still allow drop (user wants to drop)
      // When cursorSlotSource === 'shift', we WANT to drop on click even if Shift is pressed
      // This fixes the issue where PLAY_TOP_CARD sets source='ctrl' but Ctrl check prevents drop

      // Check if clicking on ToolsPanel - don't drop, let the panel handle adding more tokens
      const toolsPanel = target.closest('[data-tools-panel]');
      if (toolsPanel) {
        return;
      }

      // Check if clicking on TokensPanel - don't drop, let the panel handle adding more tokens
      const tokensPanel = target.closest('[data-tokens-panel]');
      if (tokensPanel) {
        return;
      }

      // Check if clicking inside hand panel - dispatch event to add cards to hand
      // IMPORTANT: Check hand panel BEFORE main menu, because hand panel is inside main menu
      const handPanel = target.closest('[data-hand-panel]');
      if (handPanel) {
        // IMPORTANT: Use cursorSlot from state to ensure we have current data
        // Don't use cursorSlotRef.current as it may be stale
        if (cursorSlot.length > 0) {
          // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
          processingAddToSlotRef.current.clear();

          // CRITICAL: Reset dragThresholdRef to prevent handleGlobalMouseUp from processing stale state
          dragThresholdRef.current = {
            initialX: 0,
            initialY: 0,
            targetId: null,
            addedToSlot: false
          };

          // CRITICAL: Notify that cards were dropped from cursor slot (for hand panel to clear pickingUpCardIds)
          // This must happen BEFORE dispatching cursor-slot-drop-to-hand to avoid race conditions
          const droppedIds = cursorSlot.map(item => item.id);
          window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
            detail: { cardIds: droppedIds }
          }));

          // Dispatch custom event for hand panel to handle
          window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
            detail: { items: cursorSlot }
          }));
          // Track recently dropped objects to prevent showing shadow version
          const recentlyDroppedIds = new Set(cursorSlot.map(item => item.id));
          setRecentlyInMyCursorSlot(recentlyDroppedIds);
          setTimeout(() => {
            setRecentlyInMyCursorSlot(prev => {
              const next = new Set(prev);
              recentlyDroppedIds.forEach(id => next.delete(id));
              return next;
            });
          }, 500);
          // Clear the slot - also update ref immediately
          cursorSlotRef.current = [];
          setCursorSlot([]);
          setCursorPosition(null);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // Check if clicking on main menu - don't drop, let it handle adding tokens
      // Only prevent drop if NOT clicking on hand panel (already handled above)
      const mainMenu = target.closest('[data-main-menu="true"]');
      if (mainMenu) {
        return;
      }

      // Check if clicking inside pool panel - dispatch event to add objects to pool
      const poolPanel = target.closest('[data-pool-panel]');
      if (poolPanel) {
        // IMPORTANT: Check if cursor is over a deck or pile FIRST
        // If hovering over deck/pile, let PoolTabletop handle it (don't drop to pool)
        const clickElement = document.elementFromPoint(e.clientX, e.clientY);

        // Check for piles FIRST (before deck) - piles are more specific targets
        const pileElement = clickElement?.closest('[data-pile-id]');
        if (pileElement) {
          const pileId = pileElement.getAttribute('data-pile-id');
          const deckElement = pileElement.closest('[data-object-id]');
          const deckId = deckElement?.getAttribute('data-object-id');

          if (pileId && deckId) {
            // Let PoolTabletop handle pile drops - stop propagation to prevent pool drop
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

        // Check for deck
        const deckElement = clickElement?.closest('[data-object-id]');
        if (deckElement) {
          const objectId = deckElement.getAttribute('data-object-id');
          const obj = objectId ? state.objects[objectId] : undefined;
          if (obj && obj.type === ItemType.DECK) {
            // Let PoolTabletop handle deck drops - stop propagation to prevent pool drop
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

        // Not hovering over deck/pile - drop to pool panel
        const panelId = poolPanel.getAttribute('data-pool-panel');
        if (panelId) {
          // Get pool panel data to calculate drop position
          const panelObj = state.objects[panelId] as any;
          if (panelObj && panelObj.poolData) {
            const poolZone = createPoolZoneFromPanel(panelObj.poolData);
            const panelRect = poolPanel.getBoundingClientRect();
            const pixelsPerVU = state.viewTransform?.pixelsPerVU ?? 1.08;

            // Calculate drop position using utility function
            const dropPosition = calculatePoolDropPosition(
              e.clientX,
              e.clientY,
              poolZone,
              panelRect,
              pixelsPerVU
            );

            // Drop objects using utility function
            dropObjectsToPool(cursorSlotRef.current, dropPosition, poolZone, dispatch, state.objects);

            // Clear the slot
            cursorSlotRef.current = [];
            setCursorSlot([]);
            setCursorPosition(null);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }

      // Check if clicking on a deck - only drop if source='ctrl' (not for drag/drop)
      // Use elementFromPoint for consistent behavior with drag mode
      const clickElement = document.elementFromPoint(e.clientX, e.clientY);
      const deckElement = clickElement?.closest('[data-object-id]');
      if (deckElement && cursorSlotSource === 'shift') {
        const objectId = deckElement.getAttribute('data-object-id');
        const obj = objectId ? state.objects[objectId] : undefined;
        if (obj && obj.type === ItemType.DECK && objectId) {
          // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
          processingAddToSlotRef.current.clear();

          // CRITICAL: Reset dragThresholdRef to prevent handleGlobalMouseUp from processing stale state
          dragThresholdRef.current = {
            initialX: 0,
            initialY: 0,
            targetId: null,
            addedToSlot: false
          };

          // Drop cards to the deck directly - use cursorSlotRef.current to avoid race condition
          e.preventDefault();
          e.stopPropagation();
          dropToDeck(objectId, cursorSlotRef.current);
          return;
        }
      }

      // Check if clicking on a pile - only drop if source='ctrl'
      const pileElement = target.closest('[data-pile-id]');
      if (pileElement && cursorSlotSource === 'shift') {
        const pileId = pileElement.getAttribute('data-pile-id');
        if (pileId) {
          // Find the deck that owns this pile
          let foundDeckId: string | null = null;
          for (const obj of Object.values(state.objects)) {
            if (obj.type === ItemType.DECK) {
              const deck = obj as DeckType;
              if (deck.piles?.some(p => p.id === pileId)) {
                foundDeckId = deck.id;
                break;
              }
            }
          }
          if (foundDeckId) {
            // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
            processingAddToSlotRef.current.clear();

            // CRITICAL: Reset dragThresholdRef to prevent handleGlobalMouseUp from processing stale state
            dragThresholdRef.current = {
              initialX: 0,
              initialY: 0,
              targetId: null,
              addedToSlot: false
            };

            e.preventDefault();
            e.stopPropagation();
            dropToPile(pileId, foundDeckId, cursorSlotRef.current);
            return;
          }
        }
      }

      // Check if clicking on UI objects (panels, windows) - don't drop there
      if (target.closest('[data-ui-object]')) {
        return;
      }

      // Drop items at cursor position on tabletop - use cursorSlotRef.current to avoid race condition
      // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
      processingAddToSlotRef.current.clear();

      // CRITICAL: Reset dragThresholdRef to prevent handleGlobalMouseUp from processing stale state
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false
      };

      e.preventDefault();
      e.stopPropagation();
      dropCursorSlot(e.clientX, e.clientY, cursorSlotRef.current);
    };

    window.addEventListener('mousedown', handleGlobalClick, { capture: true });
    return () => window.removeEventListener('mousedown', handleGlobalClick, { capture: true } as any);
  }, [cursorSlot, dropCursorSlot, state.objects, dropToDeck, dropToPile, clickTooltip, currentTool]);

  // Helper function to check if a point is within a rotated rectangle
  const isPointInRotatedRect = useCallback((
    px: number, py: number,
    rectX: number, rectY: number,
    rectWidth: number, rectHeight: number,
    rotation: number
  ): boolean => {
    // Convert rotation to radians
    const radians = (rotation * Math.PI) / 180;

    // Translate point to rectangle's local coordinate system
    const centerX = rectX + rectWidth / 2;
    const centerY = rectY + rectHeight / 2;

    const cos = Math.cos(-radians);
    const sin = Math.sin(-radians);

    const dx = px - centerX;
    const dy = py - centerY;

    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // Check if point is within unrotated rectangle bounds
    return Math.abs(localX) <= rectWidth / 2 && Math.abs(localY) <= rectHeight / 2;
  }, []);

  // Dispatch cursor position events for MainMenuContent to track
  // Also update hoveredDeckId when dragging cards in cursor slot
  useEffect(() => {
    if (cursorSlot.length === 0) return;

    const handleMouseMove = (e: MouseEvent) => {
      window.dispatchEvent(new CustomEvent('cursor-position-update', {
        detail: {
          x: e.clientX,
          y: e.clientY,
          hasCards: cursorSlot.some(item => item.type === ItemType.CARD)
        }
      }));

      // Update hoveredDeckId when dragging cards in cursor slot
      // Use document.elementFromPoint to find what's actually under the cursor
      // This works because cursor slot cards have pointer-events: none
      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (element) {
        // Find the closest deck/pile element by walking up the DOM
        let currentElement: Element | null = element;
        let foundDeckId: string | null = null;
        let foundPileId: string | null = null;

        while (currentElement) {
          const objectId = currentElement.getAttribute?.('data-object-id');
          if (objectId) {
            const obj = state.objects[objectId];
            if (obj?.type === ItemType.DECK) {
              foundDeckId = objectId;
              break;
            }
          }
          // Check for pile element (has pile id in class or attribute)
          const pileId = currentElement.getAttribute?.('data-pile-id');
          if (pileId) {
            foundPileId = pileId;
            break;
          }
          currentElement = currentElement.parentElement;
        }

        setHoveredDeckId(foundDeckId);
        setHoveredPileId(foundPileId);
        return;
      }
      setHoveredDeckId(null);
      setHoveredPileId(null);
    };

    const handleMouseLeave = () => {
      window.dispatchEvent(new CustomEvent('cursor-position-update', {
        detail: { x: -1, y: -1, hasCards: false }
      }));
      setHoveredDeckId(null);
      setHoveredPileId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [cursorSlot.length, cursorSlot, state.objects]);

  // Clear hoveredDeckId when cursor slot becomes empty
  useEffect(() => {
    if (cursorSlot.length === 0) {
      setHoveredDeckId(null);
    }
  }, [cursorSlot.length]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (cursorHoldTimerRef.current) {
        clearTimeout(cursorHoldTimerRef.current);
      }
      if (clickTooltipTimerRef.current) {
        clearTimeout(clickTooltipTimerRef.current);
      }
      clickTooltipBoundsRef.current = null;
    };
  }, []);

  // Global mouseup handler for cursor slot drop (when source='hold' for drag)
  // Drops items immediately on mouseup if they were picked up after 1VU drag threshold
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // IMPORTANT: If clicking inside ANY context menu or modal, don't process global mouseup
      // This prevents interference with context menu button clicks in both Tabletop and Pool panels
      const tableContextMenuElement = target.closest('[data-context-menu="tabletop"]');
      const poolContextMenuElement = target.closest('[data-context-menu="pool"]');
      const submenuElement = target.closest('[data-submenu="true"]');
      const searchDeckModalElement = target.closest('[data-modal="search-deck"]');
      const topDeckModalElement = target.closest('[data-modal="top-deck"]');
      if (tableContextMenuElement || poolContextMenuElement || submenuElement || searchDeckModalElement || topDeckModalElement) {
        return;
      }

      // Clear drag threshold state
      const wasThresholdReached = dragThresholdRef.current.addedToSlot;
      dragThresholdRef.current = {
        initialX: 0,
        initialY: 0,
        targetId: null,
        addedToSlot: false
      };

      // Clear hold timer if still running (legacy, should not be used anymore)
      if (cursorHoldTimerRef.current) {
        clearTimeout(cursorHoldTimerRef.current);
        cursorHoldTimerRef.current = null;
      }

      // Only process if cursor slot has items with source='hold' (drag, not Shift+click)
      // Shift+click is handled in handleGlobalClick (mousedown)
      // IMPORTANT: Use cursorSlot (state) not cursorSlotRef (ref) because ref may not be synced yet
      const currentSlot = cursorSlot;

      if (currentSlot.length === 0 || cursorSlotSource !== 'hold') {
        // CRITICAL: Clear processingAddToSlotRef if slot is empty to prevent "already being processed" errors
        if (currentSlot.length === 0) {
          processingAddToSlotRef.current.clear();
        }

        return;
      }

      // Only drop if threshold was reached (object was actually added to slot)
      if (!wasThresholdReached) {
        // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
        processingAddToSlotRef.current.clear();
        return;
      }

      const clientX = e.clientX;
      const clientY = e.clientY;

      // Check if we're over hand panel - use elementFromPoint for more reliable detection
      const elementUnderCursor = document.elementFromPoint(clientX, clientY);
      const handPanel = elementUnderCursor?.closest('[data-hand-panel]');

      if (handPanel) {
        // Filter to only allow cards in hand panel
        const itemsToDrop = [...currentSlot];
        const cardsOnly = itemsToDrop.filter(item => item.type === ItemType.CARD);
        const nonCardItems = itemsToDrop.filter(item => item.type !== ItemType.CARD);

        // If there are non-card items, don't treat this as a hand panel drop
        // Instead, drop them on the tabletop
        if (nonCardItems.length > 0) {
          // CRITICAL: Clear processingAddToSlotRef before drop to prevent "already being processed" errors
          processingAddToSlotRef.current.clear();

          // Drop non-card items on tabletop instead
          dropCursorSlot(clientX, clientY, currentSlot);
          e.stopPropagation();
          e.preventDefault();
          return;
        }

        // CRITICAL: Clear cursor slot FIRST to prevent visual flicker
        // Copy items before clearing slot for the event
        const itemsForDrop = [...cardsOnly];
        setCursorSlot([]);
        setCursorPosition(null);
        setCursorSlotSource(null);

        // CRITICAL: Clear processingAddToSlotRef to prevent "already being processed" errors
        processingAddToSlotRef.current.clear();

        // CRITICAL: Notify that cards were dropped from cursor slot (for hand panel to clear pickingUpCardIds)
        const droppedIds = itemsForDrop.map(item => item.id);
        window.dispatchEvent(new CustomEvent('cursor-slot-dropped', {
          detail: { cardIds: droppedIds }
        }));

        // Over hand panel - dispatch event to add cards to hand
        window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
          detail: { items: itemsForDrop }
        }));
        // Track recently dropped objects to prevent showing shadow version
        const recentlyDroppedIds = new Set(itemsForDrop.map(item => item.id));
        setRecentlyInMyCursorSlot(recentlyDroppedIds);
        setTimeout(() => {
          setRecentlyInMyCursorSlot(prev => {
            const next = new Set(prev);
            recentlyDroppedIds.forEach(id => next.delete(id));
            return next;
          });
        }, 500);

        // CRITICAL: Stop propagation IMMEDIATELY to prevent other mouseup handlers from running
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // Check if we're over pool panel
      const poolPanel = elementUnderCursor?.closest('[data-pool-panel]');
      if (poolPanel) {
        const panelId = poolPanel.getAttribute('data-pool-panel');
        if (panelId) {
          const panelObj = state.objects[panelId] as any;
          if (panelObj && panelObj.poolData) {
            // Check if object came from THIS pool panel
            // If so, drop to main tabletop instead of back to pool panel
            const firstItem = currentSlot[0];
            const fromPoolPanel = (firstItem as any)?.fromPoolPanel;

            if (fromPoolPanel === panelId) {
              // Object came from this pool panel - drop to main tabletop instead
              // Don't return - continue to drop to main tabletop below
            } else {
              // Object came from elsewhere OR from different pool panel - drop to this pool panel
              const poolZone = createPoolZoneFromPanel(panelObj.poolData);
              const panelRect = poolPanel.getBoundingClientRect();
              const pixelsPerVU = state.viewTransform?.pixelsPerVU ?? 1.08;

              // Calculate drop position using utility function
              const dropPosition = calculatePoolDropPosition(
                clientX,
                clientY,
                poolZone,
                panelRect,
                pixelsPerVU
              );

              // CRITICAL: Clear cursor slot FIRST to prevent visual flicker
              // This ensures CursorSlotVisualization stops rendering items before they're updated
              const itemsToDrop = [...currentSlot]; // Copy before clearing
              setCursorSlot([]);
              setCursorPosition(null);
              setCursorSlotSource(null);

              // Then drop objects using utility function
              dropObjectsToPool(itemsToDrop, dropPosition, poolZone, dispatch, state.objects);

              e.stopPropagation();
              e.preventDefault();
              return;
            }
          }
        }
      }

      // Check if clicking on a deck or pile - handle it directly here
      // elementUnderCursor is already defined above (line 2955)

      // Check for piles FIRST (before deck) - piles are more specific targets
      const pileElement = elementUnderCursor?.closest('[data-pile-id]');
      if (pileElement) {
        const pileId = pileElement.getAttribute('data-pile-id');
        if (pileId) {
          // Find the deck this pile belongs to
          for (const obj of Object.values(state.objects)) {
            if (obj.type === ItemType.DECK) {
              const deck = obj as DeckType;
              const pile = deck.piles?.find(p => p.id === pileId);
              if (pile) {
                e.preventDefault();
                e.stopPropagation();
                dropToPile(pileId, deck.id, currentSlot);
                // Ensure slot is cleared after dropping to pile
                setCursorSlot([]);
                setCursorPosition(null);
                setCursorSlotSource(null);
                return;
              }
            }
          }
        }
      }

      // Then check for deck - use elementUnderCursor (already computed above)
      const deckElement = elementUnderCursor?.closest('[data-object-id]');
      if (deckElement) {
        const objectId = deckElement.getAttribute('data-object-id');
        const obj = objectId ? state.objects[objectId] : undefined;
        if (obj && obj.type === ItemType.DECK && objectId) {
          e.preventDefault();
          e.stopPropagation();
          dropToDeck(objectId, currentSlot);
          // Ensure slot is cleared after dropping to deck
          setCursorSlot([]);
          setCursorPosition(null);
          setCursorSlotSource(null);
          return;
        }
      }

      // Not over hand panel or deck - drop on tabletop, pass currentSlot
      // CRITICAL: Clear processingAddToSlotRef before drop to prevent "already being processed" errors
      processingAddToSlotRef.current.clear();
      dropCursorSlot(clientX, clientY, currentSlot);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [cursorSlotSource, dropCursorSlot, dropToDeck, dropToPile, state.objects, dispatch, addToCursorSlot]);

  // Handler for adding a cell to a NexusBoard - creates a standalone NexusCellObject
  const handleAddNexusCell = useCallback((boardId: string, direction: HexDirection) => {
    const board = state.objects[boardId] as NexusBoard;

    if (!board || board.type !== ItemType.NEXUS_BOARD) {
      return;
    }

    // Find main cell to use its position and size
    const mainCellId = board.cells[0]?.id;
    const mainCell = mainCellId ? (state.objects[mainCellId] as NexusCellObject) : null;

    // Use actual main cell dimensions, or fall back to board defaults
    const cellWidth = mainCell?.width || board.cellWidth || 100;
    const cellHeight = mainCell?.height || board.cellHeight || 150;

    // Hex grid spacing (same as used in NexusBoard.tsx for UI)
    // Uses decaying extrapolation: height=115→coeff=0.75, height=150→coeff=0.80833, approaches 0.86
    const H1 = 115;
    const C1 = 0.75;
    const H2 = 150;
    const C2 = 121.25 / 150;
    const targetRatio = 0.906;
    const k = -Math.log((targetRatio - C2) / (targetRatio - C1)) / (H2 - H1);
    const rowSpacingRatio = targetRatio - (targetRatio - C1) * Math.exp(-k * (cellHeight - H1));
    const rowSpacing = cellHeight * rowSpacingRatio;
    const colSpacing = cellWidth;
    const colOffset = cellWidth * 0.5;

    let offsetX = 0;
    let offsetY = 0;

    switch (direction) {
      case 'NE':
        offsetX = colOffset;
        offsetY = -rowSpacing;
        break;
      case 'SE':
        offsetX = colSpacing;
        offsetY = 0;
        break;
      case 'NW':
        offsetX = -colOffset;
        offsetY = -rowSpacing;
        break;
      case 'SW':
        offsetX = -colSpacing;
        offsetY = 0;
        break;
      case 'N':
        offsetX = 0;
        offsetY = -rowSpacing;
        break;
      case 'S':
        offsetX = 0;
        offsetY = rowSpacing;
        break;
    }

    // Main cell position is top-left corner, but green buttons are positioned from center
    // The container is centered on main cell, so:
    // Green button at: left: calc(50% + offsetX - cellWidth/2) from center
    // In absolute coords: mainCell.x + cellWidth/2 + offsetX - cellWidth/2 = mainCell.x + offsetX
    const cellX = (mainCell?.x ?? board.x) + offsetX;
    const cellY = (mainCell?.y ?? board.y) + offsetY;

    // Create new NexusCellObject (similar to BattlefieldCell)
    const newCell: NexusCellObject = {
      id: generateUUID(),
      type: ItemType.NEXUS_CELL,
      shape: TokenShape.HEX,
      x: cellX,
      y: cellY,
      rotation: 0,
      width: cellWidth,
      height: cellHeight,
      content: '',
      name: `${board.name} - ${direction}`,
      isOnTable: true,
      locked: false,
      color: board.color || '#496179',
      borderColor: board.borderColor || '#212f3c',
      borderWidth: 3,
      opacity: board.opacity || 100,
      borderOpacity: board.borderOpacity || 100,
      snapToGrid: true,
      gridSize: board.gridSize || 50,
      zIndex: board.zIndex,
      hyperscaleLayerId: board.hyperscaleLayerId,
      nexusBoardId: board.id,
      direction: direction,
      offset: { x: offsetX, y: offsetY },
      gridType: board.gridType,
      magnetPointCount: 1,
      magnetRotation: 0,
    };

    // Add the cell object to the table
    dispatch({ type: 'ADD_OBJECT', payload: newCell });

    // Also update board's cells array for reference
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: boardId,
        cells: [...board.cells, { id: newCell.id, direction }]
      }
    });

    // Keep editing mode open for adding more cells
  }, [state.objects, dispatch]);

  const handleMouseDown = useCallback((e: React.MouseEvent, id?: string) => {
    // Removed logging for better performance

    if (contextMenu) {
      setContextMenu(null);
    }

    // Pan view with Ctrl+drag - works EVERYWHERE (including objects, UI, boards)
    // Ctrl+Drag is exclusively for pan view, overrides all other interactions
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      setIsPanning(true);
      // Store initial mouse position AND scroll position for direct scroll manipulation
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: scrollContainerRef.current?.scrollLeft || 0,
        scrollTop: scrollContainerRef.current?.scrollTop || 0
      };
      return;
    }

    // Note: Unified click/drag system with clear priority:
    // 1. Check for double click first (fast clicks without movement)
    // 2. Then check for drag (movement >= 1VU)
    // 3. Single click does nothing (unless singleClickAction is configured)

    if (id && e.button === 0) {
      const item = state.objects[id];
      if (item) {
        // Check if object has doubleClickAction
        let doubleClickAction = (item as any)?.doubleClickAction;
        if (item?.type === ItemType.CARD) {
          const cardSettings = getCardSettings(item as CardType);
          doubleClickAction = cardSettings.doubleClickAction;
        }

        const now = Date.now();
        const DOUBLE_CLICK_DELAY = 300; // ms

        // Check for double click FIRST (before drag)
        if (doubleClickAction && doubleClickAction !== 'none') {
          const timeSinceLastClick = now - interactionStateRef.current.lastClickTime;

          if (interactionStateRef.current.objectId === id && timeSinceLastClick < DOUBLE_CLICK_DELAY) {
            // DOUBLE CLICK DETECTED!
            executeClickAction(item, doubleClickAction, e);

            // Reset interaction state
            interactionStateRef.current = {
              objectId: null,
              startTime: 0,
              startClientX: 0,
              startClientY: 0,
              hasMoved: false,
              clickCount: 0,
              lastClickTime: 0,
              isInDragMode: false
            };

            e.preventDefault();
            e.stopPropagation();
            return; // Don't proceed with drag logic
          }

          // First click - save state for potential drag or second click
          interactionStateRef.current = {
            objectId: id,
            startTime: now,
            startClientX: e.clientX,
            startClientY: e.clientY,
            hasMoved: false,
            clickCount: interactionStateRef.current.objectId === id ? interactionStateRef.current.clickCount + 1 : 1,
            lastClickTime: now,
            isInDragMode: false
          };

          // Set timeout to detect if this becomes a single click (no second click within delay)
          // IMPORTANT: Only reset if lastClickTime hasn't changed (meaning no second click happened)
          setTimeout(() => {
            const currentState = interactionStateRef.current;
            // Only reset if this is still the same click (lastClickTime hasn't been updated by a second click)
            if (currentState.objectId === id && currentState.lastClickTime === now) {
              // This was a single click - reset state, don't execute anything
              interactionStateRef.current = {
                objectId: null,
                startTime: 0,
                startClientX: 0,
                startClientY: 0,
                hasMoved: false,
                clickCount: 0,
                lastClickTime: 0,
                isInDragMode: false
              };
            }
          }, DOUBLE_CLICK_DELAY);

          return; // Don't proceed with normal drag handling yet
        }

        // No doubleClickAction - proceed with normal drag logic

        // Reset interaction state if no doubleClickAction
        interactionStateRef.current = {
          objectId: null,
          startTime: 0,
          startClientX: 0,
          startClientY: 0,
          hasMoved: false,
          clickCount: 0,
          lastClickTime: 0,
          isInDragMode: false
        };
      }
    }

    // Block all mouse interactions when ruler tool is active (except ruler-specific handling)
    if (currentTool === 'ruler') {
      // Only handle left click for ruler functionality
      if (e.button === 0) {
        e.preventDefault();
        e.stopPropagation();

        // Get world coordinates from screen coordinates
        const scrollContainer = scrollContainerRef.current;
        if (scrollContainer) {
          const rect = scrollContainer.getBoundingClientRect();
          const worldX = (e.clientX - rect.left + scrollContainer.scrollLeft) / pixelsPerVU;
          const worldY = (e.clientY - rect.top + scrollContainer.scrollTop) / pixelsPerVU;

          if (rulerStart) {
            // If we have a start point, clear it (reset ruler)
            setRulerStart(null);
            setRulerCurrent(null);
            setIsRulerRightClick(false);
          } else {
            // Set the start point and current position (so the point appears immediately)
            const startPos = { x: worldX, y: worldY };
            setRulerStart(startPos);
            setRulerCurrent(startPos);
          }
        }
      }
      // Block all other buttons when ruler is active
      return;
    }

    // Check if clicking on a UI object first - UI objects (panels/windows) should always be draggable
    // even when marker or eraser tool is active
    if (id && e.button === 0) {
      e.stopPropagation();
      const item = state.objects[id];

      // Check if this is a UI object (panel or window) or BOARD - handled differently
      // Boards use cursor slot system like other draggable objects
      if (item && (item.type === ItemType.PANEL || item.type === ItemType.WINDOW)) {
        if (item.locked) return; // Locked objects can't be dragged

        // Note: We DON'T unpin pinned objects on drag - pinned objects stay pinned while dragging

        // Panel layer management: when dragging a panel (not main-menu), bring it to front
        // Logic: defragment panels from bottom (9001) up, dragged panel → first free layer
        if (item.type === ItemType.PANEL) {
          const panel = item as PanelObject;
          const isMainMenu = panel.panelType === 'main_menu';

          if (!isMainMenu) {
            // Find all panels except main-menu
            const allPanels = Object.values(state.objects)
              .filter(obj => obj.type === ItemType.PANEL)
              .filter(obj => (obj as PanelObject).panelType !== 'main_menu')
              .map(obj => obj as PanelObject);

            if (allPanels.length > 0) {
              const BOTTOM_Z = 9001;

              // Sort all panels (including dragged one) by current z-index (ascending)
              // This gives us the order from bottom to top
              const sortedPanels = [...allPanels].sort((a, b) => (a.zIndex || 1000) - (b.zIndex || 1000));

              // Defragment: start from BOTTOM_Z and move up sequentially
              sortedPanels.forEach((otherPanel, index) => {
                const newZ = BOTTOM_Z + index;

                dispatch({
                  type: 'UPDATE_OBJECT',
                  payload: {
                    id: otherPanel.id,
                    zIndex: newZ
                  },
                  _localOnly: true // Layer management is local per player
                });

                // Update individual panel settings for this player
                dispatch({
                  type: 'UPDATE_PLAYER_PANEL_SETTINGS',
                  payload: {
                    playerId: state.activePlayerId,
                    panelId: otherPanel.id,
                    settings: { zIndex: newZ }
                  }
                });
              });

              // After defragmentation, the dragged panel is now at some position
              // Move it to the layer right above the highest panel (no gaps)
              const highestPanelZ = BOTTOM_Z + sortedPanels.length - 1;
              const draggedPanelNewZ = highestPanelZ + 1;

              dispatch({
                type: 'UPDATE_OBJECT',
                payload: {
                  id: id,
                  zIndex: draggedPanelNewZ
                },
                _localOnly: true // Layer management is local per player
              });

              // Update individual panel settings for dragged panel
              dispatch({
                type: 'UPDATE_PLAYER_PANEL_SETTINGS',
                payload: {
                  playerId: state.activePlayerId,
                  panelId: id,
                  settings: { zIndex: draggedPanelNewZ }
                }
              });
            }
          }
        }

        // UI objects use screen coordinates directly, not world coordinates
        setDraggingId(id);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragOffsetRef.current = {
          x: e.clientX - item.x,
          y: e.clientY - item.y
        };
        // Store initial position for network commit on drag end
        dragStartPositionRef.current = { id, x: item.x, y: item.y };
        // Mark object as being dragged by local player (shows as shadow/locked to others)
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id, draggingPlayerId: state.activePlayerId, broadcastX: item.x, broadcastY: item.y }
        });
        return;
      }

    }

    // Block all other mouse interactions when marker or eraser tool is active
    // (but UI objects are already handled above)
    if (currentTool === 'marker' || currentTool === 'eraser') {
      return;
    }

    // Check if clicking on a UI object - if it has an id, process normally
    // If no id (background), check for dropping cursor slot
    if (!id) {
      // If cursor slot has items and we click without shift/ctrl/meta, drop all items
      // Exception: if source is 'archetype' (tokens from archetype click), don't drop - treat like Shift is held
      // Use cursorSlotRef.current to check synchronously (state update is async)
      if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && cursorSlotRef.current.length > 0 && cursorSlotSource !== 'archetype') {
        e.preventDefault(); // Prevent native browser drag-and-drop
        e.stopPropagation();
        dropCursorSlot(e.clientX, e.clientY);
        return;
      }
    }

    if (id && e.button === 0) {
      e.stopPropagation();
      const item = state.objects[id];

      // UI objects (panels/windows) are already handled above, skip them here
      if (item && (item.type === ItemType.PANEL || item.type === ItemType.WINDOW)) {
        return;
      }

      // Locked objects check - don't send drag messages for locked objects even for GM
      if (item && item.locked) {
        return;
      }

      // Hyperscale layer check - only allow dragging objects in selected hyperscale layers
      // This applies to all players including GM
      // EXCEPTION: Objects in current player's cursor slot can always be moved
      // EXCEPTION: Objects in pool zones can always be moved (ignore hyperscale restrictions)
      const isInCursorSlot = item.draggingPlayerId === state.activePlayerId || (item as any).inCursorSlot;
      const isInPoolZone = item.x >= 2500; // Simple check if object is in pool zone
      if (!isInCursorSlot && !isInPoolZone) {
        const objLayer = item.hyperscaleLayerId || 'none';
        const selectedLayers = state.selectedHyperscaleLayerIds;
        const layerAllowed = objLayer === 'none' || selectedLayers.includes(objLayer);
        if (!layerAllowed) {
          return; // Object is in a non-selected hyperscale layer
        }
      }

      // Cards, tokens, boards, and other small objects: Shift+click immediately adds to cursor slot
      if (e.shiftKey && item && (
        item.type === ItemType.CARD ||
        item.type === ItemType.TOKEN ||
        item.type === ItemType.DECK ||
        item.type === ItemType.RANDOMIZER ||
        item.type === ItemType.COUNTER ||
        item.type === ItemType.DICE_OBJECT ||
        item.type === ItemType.BOARD
      )) {
        e.preventDefault();
        e.stopPropagation();
        addToCursorSlot(id, item);
        return;
      }

      // Prevent immediate re-pickup after dropping items (within 50ms)
      // IMPORTANT: Check this BEFORE cursorSlot.length check to prevent race conditions
      // Short timeout (50ms) prevents accidental double-clicks but allows quick re-drag
      const timeSinceDrop = Date.now() - lastDropTimeRef.current;
      if (justDroppedRef.current && timeSinceDrop < 50) {
        return;
      }

      // Clear the just-dropped flag if enough time has passed
      if (justDroppedRef.current && timeSinceDrop >= 50) {
        justDroppedRef.current = false;
      }

      // If cursor slot has items and we click without shift/ctrl/meta, drop all items first
      // Exception: if source is 'archetype' (tokens from archetype click), don't drop
      // Use cursorSlotRef.current to check synchronously (state update is async)
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey && cursorSlotRef.current.length > 0 && cursorSlotSource !== 'archetype') {
        dropCursorSlot(e.clientX, e.clientY);
        return; // Don't proceed with normal drag handling
      }

      // For cards and tokens: Shift+click immediately adds to cursor slot
      // Without Ctrl: track mouse movement, add to slot after 5px drag threshold

      // Store click start position for click detection
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // Cards, tokens, boards, decks, randomizers, counters, and dice use cursor slot drag system ONLY (no normal drag)
      // These objects ALWAYS use cursor slot system - NO 5px threshold, IMMEDIATE pickup
      if (item && (
        item.type === ItemType.CARD ||
        item.type === ItemType.TOKEN ||
        item.type === ItemType.DECK ||
        item.type === ItemType.RANDOMIZER ||
        item.type === ItemType.COUNTER ||
        item.type === ItemType.DICE_OBJECT ||
        item.type === ItemType.BOARD
      )) {
        // Check if object is in pool zone (x >= 2500)
        // Pool zones start at x=2500, objects there should be handled by PoolTabletop only
        const objX = item.x || 0;
        if (objX >= 2500) {
          return; // Don't handle - let PoolTabletop handle it
        }

        // CRITICAL: Prevent duplicate processing - if object is already in cursor slot, IGNORE
        // Only check cursorSlotRef.current (actual slot state), ignore stale inCursorSlot flag
        // The flag may be stale due to async dispatch after drop
        const actuallyInSlot = cursorSlotRef.current.some(obj => obj.id === id);
        if (actuallyInSlot) {
          e.stopPropagation();
          return;
        }

        // Store initial position for drag threshold detection
        dragThresholdRef.current = {
          initialX: e.clientX,
          initialY: e.clientY,
          targetId: id,
          addedToSlot: false
        };

        e.stopPropagation();
        return; // Don't proceed with normal drag system
      }

      // Boards use cursor slot system (handled above), don't use normal drag
      if (item.type === ItemType.BOARD) {
        return;
      }

      setDraggingId(id);
      if (item) {
        // Note: We don't unpin pinned objects on drag anymore - pinned objects stay pinned while dragging
        // Their position is updated in both x/y and pinnedScreenPosition

        // Bring dragged object to front (clamped to its hyperscale layer's maxZ)
        const itemLayer = state.hyperscaleLayers.find(l => l.id === item.hyperscaleLayerId);
        const maxZ = itemLayer?.maxZIndex ?? 10000;
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id, zIndex: maxZ }
        });

        // Check if this object is pinned to viewport
        const isPinned = (item as any).isPinnedToViewport === true;
        // BOARD objects should always be treated as pinned for drag purposes
        const isBoard = item.type === ItemType.BOARD;

        // Calculate the offset from cursor to object's position
        // For pinned objects, use screen coordinates (like UI objects)
        // For unpinned objects, use world coordinates with zoom and offset
        let offsetX: number;
        let offsetY: number;

        if (isPinned) {
          // Pinned objects: use screen coordinates directly
          // item.x for pinned objects is already the screen coordinate
          offsetX = e.clientX - item.x;
          offsetY = e.clientY - item.y;
        } else if (isBoard) {
          // Boards: use screen coordinates (not world coordinates) for consistent positioning
          // item.x for boards is stored as screen coordinate
          offsetX = e.clientX - item.x;
          offsetY = e.clientY - item.y;
        } else {
          // Unpinned objects: use world coordinates
          // Convert viewport coordinates to world coordinates
          // Add scroll position to account for panning
          const mouseWorldX = p2v(e.clientX + state.viewTransform.scroll.x);
          const mouseWorldY = p2v(e.clientY + state.viewTransform.scroll.y);

          offsetX = mouseWorldX - item.x;
          offsetY = mouseWorldY - item.y;
        }

        dragOffsetRef.current = {
          x: offsetX,
          y: offsetY
        };
        // Store initial position for network commit on drag end
        dragStartPositionRef.current = { id, x: item.x, y: item.y };
        // Mark object as being dragged by local player (shows as shadow/locked to others)
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id, draggingPlayerId: state.activePlayerId, broadcastX: item.x, broadcastY: item.y }
        });
      }
    }
  }, [contextMenu, currentTool, cursorSlot, cursorSlotSource, dropCursorSlot, isGM, state.objects, state.activePlayerId, state.selectedHyperscaleLayerIds, dispatch, addToCursorSlot, offset, setDraggingId, setIsPanning]);

  // Handle click on battlefield cell for magnetism control
  // Shift+click: add magnet point
  // Ctrl+Shift+click: remove magnet point (unchanged)
  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    // Always update ref immediately for synchronous access during render
    const newCursorPosition = { x: e.clientX, y: e.clientY };
    cursorPositionRef.current = newCursorPosition;

    // Block cursor slot drag when ruler is active
    if (currentTool !== 'ruler') {
      // Check interaction state for objects with doubleClickAction
      if (interactionStateRef.current.objectId && !interactionStateRef.current.isInDragMode) {
        const { objectId, startClientX, startClientY } = interactionStateRef.current;

        // Calculate distance in screen pixels
        const deltaX = e.clientX - startClientX;
        const deltaY = e.clientY - startClientY;
        const distancePixels = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Convert to virtual units
        const distanceVU = distancePixels / pixelsPerVU;

        // Check if threshold reached (1VU) - switch to drag mode
        if (distanceVU >= 1) {
          interactionStateRef.current.isInDragMode = true;
          interactionStateRef.current.hasMoved = true;

          // Add to cursor slot using the normal cursor slot system
          const item = state.objects[objectId];
          if (item && !item.locked) {
            // Set dragThresholdRef to ensure wasThresholdReached is true in handleGlobalMouseUp
            dragThresholdRef.current = {
              initialX: startClientX,
              initialY: startClientY,
              targetId: objectId,
              addedToSlot: true  // Mark as added to slot
            };

            addToCursorSlot(objectId, item, 'hold');

            // Mark interaction state as added to slot to prevent duplicate adds
            interactionStateRef.current.isInDragMode = true;
          }
        }
      }

      // Check drag threshold for adding to cursor slot (legacy system)
      if (dragThresholdRef.current.targetId && !dragThresholdRef.current.addedToSlot) {
        const { initialX, initialY, targetId } = dragThresholdRef.current;

        // Calculate distance in screen pixels
        const deltaX = e.clientX - initialX;
        const deltaY = e.clientY - initialY;
        const distancePixels = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Convert to virtual units
        const distanceVU = distancePixels / pixelsPerVU;

        // Check if threshold reached (1VU for more responsive pickup)
        if (distanceVU >= 1) {
          const item = state.objects[targetId];
          if (item && (item.type === ItemType.CARD || item.type === ItemType.TOKEN ||
            item.type === ItemType.DECK || item.type === ItemType.RANDOMIZER ||
            item.type === ItemType.COUNTER || item.type === ItemType.DICE_OBJECT ||
            item.type === ItemType.BOARD)) {

            // IMPORTANT: Check if cursor is over a token archetype button - don't pickup
            const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
            const archetypeButton = elementUnderCursor?.closest('[data-archetype-card]');
            if (archetypeButton) {
              return; // Don't pickup when clicking on token type buttons
            }

            // Add to cursor slot
            addToCursorSlot(targetId, item, 'hold');

            // Mark as added to prevent duplicate adds
            dragThresholdRef.current.addedToSlot = true;
          }
        }
      }
    }

    // Throttle cursor position updates to prevent excessive re-renders
    // Only update if position changed significantly or enough time passed
    if (!cursorPosition || Math.abs(cursorPosition.x - newCursorPosition.x) > 2 || Math.abs(cursorPosition.y - newCursorPosition.y) > 2) {
      setCursorPosition(newCursorPosition);
    }

    // Update ruler current position when ruler is active
    if (currentTool === 'ruler' && rulerStart) {
      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        const worldX = (e.clientX - rect.left + scrollContainer.scrollLeft) / pixelsPerVU;
        const worldY = (e.clientY - rect.top + scrollContainer.scrollTop) / pixelsPerVU;
        setRulerCurrent({ x: worldX, y: worldY });
      }
    } else if (currentTool !== 'ruler') {
      // Clear ruler current when tool is not ruler
      setRulerCurrent(null);
    }

    // Note: Duplicate pool panel drag-over code removed - already handled in first mousemove handler (lines 230-313)

    if (isPanning) {
      // Direct scrollbar manipulation - synchronized with browser's scroll system
      const container = scrollContainerRef.current;
      if (container) {
        const startRef = dragStartRef.current;
        const deltaX = e.clientX - startRef.x;
        const deltaY = e.clientY - startRef.y;

        // Calculate new scroll position
        let newScrollLeft = (startRef.scrollLeft || 0) - deltaX;
        let newScrollTop = (startRef.scrollTop || 0) - deltaY;

        // Constrain to playable area
        const constrained = clampScrollToPlayableArea(
          newScrollLeft,
          newScrollTop,
          container.clientWidth,
          container.clientHeight,
          pixelsPerVU
        );

        // Update scroll position directly (inverse of drag direction)
        container.scrollLeft = constrained.x;
        container.scrollTop = constrained.y;
      }
      return;
    }

    // Handle resizing (corner only - changes width/height only)
    if (resizingId && resizeStart) {
      const obj = state.objects[resizingId];
      if (!obj) return;

      const deltaX = p2v(e.clientX - resizeStart.x);
      const deltaY = p2v(e.clientY - resizeStart.y);

      const minSize = 100;
      const newWidth = Math.max(minSize, resizeStart.width + deltaX);
      const newHeight = Math.max(minSize, resizeStart.height + deltaY);

      // Store in ref for immediate access
      liveResizeSizeRef.current = { width: newWidth, height: newHeight };
      resizeFinalSizeRef.current = { width: newWidth, height: newHeight };

      // Update state for re-render (batched by React)
      setLiveResizeSize({ width: newWidth, height: newHeight });
      return;
    }

    // Handle dragging
    // Note: Cards and tokens don't set draggingId, they use cursor slot system only
    // Note: Boards are not draggable anymore
    if (draggingId) {
      const draggingObj = state.objects[draggingId];
      if (!draggingObj) return;

      // Additional safety check: prevent board dragging
      if (draggingObj.type === ItemType.BOARD) {
        return;
      }

      // Pinned objects (boards, decks) and UI objects use screen coordinates directly
      const isPinned = (draggingObj as any).isPinnedToViewport === true;
      // BOARD objects should always use screen coordinates for drag
      const isBoard = draggingObj.type === ItemType.BOARD;
      if (draggingObj.type === ItemType.PANEL || draggingObj.type === ItemType.WINDOW || isPinned || isBoard) {
        // Calculate delta from initial mouse position to avoid drift
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        // Use initial object position + delta for smooth dragging
        const initialPos = dragStartPositionRef.current;
        const targetX = initialPos.x + deltaX;
        const targetY = initialPos.y + deltaY;

        dispatch({
          type: 'MOVE_OBJECT',
          payload: {
            id: draggingId,
            x: targetX,
            y: targetY,
          },
          _localOnly: true, // Don't send over network during drag
        });
        return;
      }

      // Unpinned game objects use world coordinates with zoom and offset
      // Always update position - the world coordinates work correctly even when cursor is outside
      // Convert viewport coordinates to world coordinates
      // Add scroll position to account for panning
      const mouseWorldX = p2v(e.clientX + state.viewTransform.scroll.x);
      const mouseWorldY = p2v(e.clientY + state.viewTransform.scroll.y);

      // Use the offset to position the object relative to cursor
      const targetX = mouseWorldX - (dragOffsetRef.current?.x || 0);
      const targetY = mouseWorldY - (dragOffsetRef.current?.y || 0);

      // getSnappedCoordinates expects the CENTER position, so add half dimensions
      // For horizontal cards, use visual dimensions (swapped) for center calculation
      let draggingObjWidth = draggingObj.width ?? 100;
      let draggingObjHeight = draggingObj.height ?? 100;

      // Check if this is a card with horizontal orientation (display dimensions are swapped)
      if (draggingObj.type === ItemType.CARD) {
        const card = draggingObj as CardType;
        const deck = card.deckId ? stateRef.current.objects[card.deckId] as DeckType | undefined : undefined;
        if (deck?.cardOrientation === CardOrientation.HORIZONTAL) {
          // Horizontal cards have width and height swapped for display
          [draggingObjWidth, draggingObjHeight] = [draggingObjHeight, draggingObjWidth];
        }
      }

      const centerX = targetX + draggingObjWidth / 2;
      const centerY = targetY + draggingObjHeight / 2;

      const snapped = getSnappedCoordinates(centerX, centerY, stateRef.current.objects, draggingId);

      // Apply board rotation if snapped to a board with snapRotationToGrid enabled
      let newRotation = draggingObj.rotation ?? 0;
      if (snapped.snappedToBoard && snapped.snappedToBoard.snapRotationToGrid) {
        newRotation = snapped.snappedToBoard.rotation ?? 0;
      }

      dispatch({
        type: 'MOVE_OBJECT',
        payload: {
          id: draggingId,
          x: snapped.x,
          y: snapped.y,
          rotation: newRotation,
        },
        _localOnly: true, // Don't send over network during drag
      });

      // Check if cursor is over a deck (for card-to-deck drop)
      if (draggingObj.type === ItemType.CARD) {
        // Convert cursor screen coordinates to world coordinates
        // Add scroll position to account for panning
        const worldX = p2v(e.clientX + state.viewTransform.scroll.x);
        const worldY = p2v(e.clientY + state.viewTransform.scroll.y);

        // Skip pile detection during drag for better performance
        // Piles are only relevant when dropping, not during drag
        // This removes the expensive loop through all objects on every mousemove

        // Skip deck detection during drag for better performance
        // Deck hover is only needed for visual feedback, not critical
        // Checking all decks on every mousemove is too expensive
        if (!foundPile) {
          setHoveredDeckId(null);
        }
      }
    }

    // Handle pile dragging (for free-position piles)
    if (draggingPile && pileDragStartRef.current) {
      const mouseWorldX = p2v(e.clientX + state.viewTransform.scroll.x);
      const mouseWorldY = p2v(e.clientY + state.viewTransform.scroll.y);

      // Calculate new position based on drag start offset
      const newX = mouseWorldX - pileDragStartRef.current.x;
      const newY = mouseWorldY - pileDragStartRef.current.y;

      // Immediately update the pile's position in state for smooth dragging
      const updatedPiles = draggingPile.deck.piles?.map(p =>
        p.id === draggingPile.pile.id
          ? { ...p, x: newX, y: newY }
          : p
      );

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: draggingPile.deck.id, piles: updatedPiles },
        _localOnly: true // Don't send over network during drag
      });
    }
  }, [isPanning, resizingId, resizeStart, state.activePlayerId, draggingId, draggingPile, offset, dispatch, cursorSlot, isPointInRotatedRect, currentTool, rulerStart, scrollContainerRef, pixelsPerVU, addToCursorSlot, throttledResizeUpdate, syncResizeToNetwork]);

  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Clear long-press timer if mouse is released before timeout
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Clear cursor hold timer if mouse is released before 3ms (legacy)
    if (cursorHoldTimerRef.current) {
      clearTimeout(cursorHoldTimerRef.current);
      cursorHoldTimerRef.current = null;
    }

    // Note: Cursor slot drop on mouseup is handled by the global handler above
    // This handleMouseUp is only called when there's an active drag/pan/resize operation

    // Save drag threshold state BEFORE clearing it
    const wasThresholdReached = dragThresholdRef.current.addedToSlot;

    // Clear drag threshold state
    dragThresholdRef.current = {
      initialX: 0,
      initialY: 0,
      targetId: null,
      addedToSlot: false
    };

    // Check if this was a click (not a drag or resize)
    const wasDragging = draggingId !== null;
    const wasResizing = resizingId !== null;

    // Handle interaction state (unified click/drag system)
    if (interactionStateRef.current.objectId && !wasResizing) {
      const { objectId, isInDragMode } = interactionStateRef.current;

      if (isInDragMode) {
        // This was a drag - handle drag completion
        // Normal drag logic will handle the rest
      } else {
        // This was a click without drag - already handled by double click logic in handleMouseDown
      }

      // Clear interaction state
      interactionStateRef.current = {
        objectId: null,
        startTime: 0,
        startClientX: 0,
        startClientY: 0,
        hasMoved: false,
        clickCount: 0,
        lastClickTime: 0,
        isInDragMode: false
      };
    }

    // Check if dropping a card onto a deck or pile
    let cardAddedToDeckOrPile = false;
    let dropClientX = 0;
    let dropClientY = 0;

    if (draggingId) {
      const draggingObj = state.objects[draggingId];
      if (draggingObj && draggingObj.type === ItemType.CARD) {
        dropClientX = e?.clientX ?? 0;
        dropClientY = e?.clientY ?? 0;

        // Convert cursor screen coordinates to world coordinates
        // CSS transform is: translate(offset) scale(zoom)
        const worldX = dropClientX - offset.x;
        const worldY = dropClientY - offset.y;

        // First check if dropping on a pile (piles should take priority over decks)
        type PileInfo = { pile: CardPile; deck: DeckType };
        let foundPile: PileInfo | null = null;

        for (const obj of Object.values(state.objects)) {
          if (obj.type === ItemType.DECK) {
            const deck = obj as DeckType;
            const visiblePiles = deck.piles?.filter(p => p.visible) || [];

            for (const pile of visiblePiles) {
              // Calculate pile position (same logic as in render)
              const pileSize = pile.size ?? 1;
              let pileX: number, pileY: number;

              if (pile.position === 'free') {
                pileX = pile.x ?? 0;
                pileY = pile.y ?? 0;
              } else if (pile.position === 'right') {
                pileX = obj.x + obj.width + 4;
                pileY = obj.y;
              } else if (pile.position === 'left') {
                pileX = obj.x - obj.width - 4;
                pileY = obj.y;
              } else if (pile.position === 'top') {
                pileX = obj.x;
                pileY = obj.y - obj.height - 4;
              } else if (pile.position === 'bottom') {
                pileX = obj.x;
                pileY = obj.y + obj.height + 4;
              } else {
                pileX = obj.x;
                pileY = obj.y;
              }

              const pileWidth = obj.width * pileSize;
              const pileHeight = obj.height * pileSize;

              // Check if cursor is within pile bounds (using deck's rotation since piles rotate with deck)
              if (isPointInRotatedRect(worldX, worldY, pileX, pileY, pileWidth, pileHeight, deck.rotation || 0)) {
                foundPile = { pile, deck };
                break;
              }
            }
            if (foundPile) break;
          }
        }

        if (foundPile) {
          dispatch({
            type: 'ADD_CARD_TO_PILE',
            payload: { cardId: draggingId, pileId: foundPile.pile.id, deckId: foundPile.deck.id }
          });
          cardAddedToDeckOrPile = true;
          // Skip deck check and card-drag-end event if we found a pile
          setHoveredDeckId(null);
          setHoveredPileId(null);
          // Clear dragging state and draggingPlayerId
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: { id: draggingId, draggingPlayerId: null, broadcastX: undefined, broadcastY: undefined }
          });
          setDraggingId(null);
          clearDraggingOver(); // Clear global drag-over state
          setIsPanning(false);
          // Clear drag offset when ending pan operation
          dragOffsetRef.current = null;
          return;
        }

        // Check if dropping on a deck - also check by coordinates if hoveredDeckId is not set
        // (in case the dragged card blocks mouse events to the deck)
        let targetDeckId = hoveredDeckId;

        if (!targetDeckId) {
          // Manually check if cursor is over any deck (accounting for rotation)
          for (const obj of Object.values(state.objects)) {
            if (obj.type === ItemType.DECK) {
              const deck = obj as DeckType;
              // Convert cursor screen coordinates to world coordinates
              const worldX = dropClientX - offset.x;
              const worldY = dropClientY - offset.y;

              // Check if cursor is within deck bounds (accounting for rotation)
              if (isPointInRotatedRect(worldX, worldY, deck.x, deck.y, deck.width, deck.height, deck.rotation || 0)) {
                targetDeckId = deck.id;
                break;
              }
            }
          }
        }

        if (targetDeckId) {
          dispatch({
            type: 'ADD_CARD_TO_TOP_OF_DECK',
            payload: { cardId: draggingId, deckId: targetDeckId }
          });
          cardAddedToDeckOrPile = true;
        }
      }
    }

    // Notify that drag ended (for main menu, hand panel, and pool panel)
    // Send object-drag-end for cards and tokens that were NOT added to a deck or pile
    if (draggingId && !cardAddedToDeckOrPile) {
      const draggingObj = state.objects[draggingId];
      if (draggingObj && (draggingObj.type === ItemType.CARD || draggingObj.type === ItemType.TOKEN)) {
        // Send object-drag-end for panels to receive objects
        window.dispatchEvent(new CustomEvent('object-drag-end', {
          detail: {
            wasDragging: true,
            objectId: draggingId,
            objectType: draggingObj.type,
            source: 'tabletop',
            x: dropClientX,
            y: dropClientY,
            offsetX: 0,
            offsetY: 0,
          }
        }));

        // Also send card-drag-end for backward compatibility with hand panel
        if (draggingObj.type === ItemType.CARD) {
          window.dispatchEvent(new CustomEvent('card-drag-end', {
            detail: {
              wasDragging: true,
              cardId: draggingId,
              source: 'tabletop',
              x: dropClientX,
              y: dropClientY,
              offsetX: 0,
              offsetY: 0,
            }
          }));
        }

        // Also send tabletop-drag-end for main menu
        if (draggingObj.type === ItemType.CARD && (draggingObj as CardType).location === CardLocation.TABLE) {
          window.dispatchEvent(new CustomEvent('tabletop-drag-end'));
        }
      }
    }

    // Clear hover state
    setHoveredDeckId(null);
    setHoveredPileId(null);

    // Send final position when drag ends
    if (dragStartPositionRef.current && draggingId) {
      const startPos = dragStartPositionRef.current;
      const obj = state.objects[draggingId];
      if (obj && startPos.id === draggingId) {
        if (!isHost) {
          // Guest: send MOVE_OBJECT_COMMIT to host
          dispatch({
            type: 'MOVE_OBJECT_COMMIT',
            payload: {
              id: draggingId,
              x: obj.x,
              y: obj.y,
              previousX: startPos.x,
              previousY: startPos.y,
            },
          });
        } else {
          // Host: send final MOVE_OBJECT to all guests (without _localOnly)
          dispatch({
            type: 'MOVE_OBJECT',
            payload: {
              id: draggingId,
              x: obj.x,
              y: obj.y,
            },
          });
        }
      }
    }
    dragStartPositionRef.current = null;

    // Clear draggingPlayerId for any dragging object
    if (draggingId) {
      // Check if dropping over pool panel using saved state
      const { targetPoolPanelId: savedPoolPanelId } = useDragOverStore.getState();

      if (savedPoolPanelId && e) {
        // Get fresh state from stateRef to ensure we have the latest object data
        const currentState = stateRef.current;
        const panelObj = currentState.objects[savedPoolPanelId] as PanelObject;

        if (panelObj && panelObj.poolData) {
          // Find the pool panel and game space elements
          // gameSpace is the parent container, poolTabletop is inside it
          const gameSpace = document.querySelector(`[data-pool-gamespace="${savedPoolPanelId}"]`) as HTMLElement;
          const poolTabletop = document.querySelector(`[data-pool-panel="${savedPoolPanelId}"]`) as HTMLElement;

          if (gameSpace && poolTabletop) {
            const pixelsPerVU = currentState.viewTransform?.pixelsPerVU ?? 1.08;

            // Get object being dragged from current state
            const draggedObj = currentState.objects[draggingId];

            if (draggedObj) {
              // Use game space rect for accurate positioning
              const panelRect = gameSpace.getBoundingClientRect();

              // Calculate drop position in pool zone
              const relativePixelX = e.clientX - panelRect.left;
              const relativePixelY = e.clientY - panelRect.top;

              // Add scroll position to account for scrolling in game space
              const scrollLeft = gameSpace.scrollLeft;
              const scrollTop = gameSpace.scrollTop;

              // Convert to virtual units (account for scroll)
              const relativeVUX = (relativePixelX + scrollLeft) / pixelsPerVU;
              const relativeVUY = (relativePixelY + scrollTop) / pixelsPerVU;

              // Pool zone coordinates
              const poolX = panelObj.poolData.offsetX + relativeVUX;
              const poolY = panelObj.poolData.offsetY + relativeVUY;

              // Get object dimensions for centering
              const objWidth = draggedObj.width || 100;
              const objHeight = draggedObj.height || 100;

              // Calculate final position (cursor is at center of object, so subtract half dimensions)
              const finalX = poolX - (objWidth / 2);
              const finalY = poolY - (objHeight / 2);

              // Constrain to pool zone bounds
              const poolWidth = panelObj.poolData.width || 1000;
              const poolHeight = panelObj.poolData.height || 1000;

              const constrainedX = Math.max(panelObj.poolData.offsetX, Math.min(finalX, panelObj.poolData.offsetX + poolWidth - objWidth));
              const constrainedY = Math.max(panelObj.poolData.offsetY, Math.min(finalY, panelObj.poolData.offsetY + poolHeight - objHeight));

              // Clear cursor slot if object was in it BEFORE updating position
              const cursorSlotObj = cursorSlot.find(obj => obj.id === draggingId);
              if (cursorSlotObj) {
                const newCursorSlot = cursorSlot.filter(obj => obj.id !== draggingId);
                cursorSlotRef.current = newCursorSlot;
                setCursorSlot(newCursorSlot);

                // Clear cursor position if slot is empty
                if (newCursorSlot.length === 0) {
                  setCursorPosition(null);
                }
              }

              // Move object to pool panel AND clear dragging state in one dispatch
              dispatch({
                type: 'UPDATE_OBJECT',
                payload: {
                  id: draggingId,
                  x: constrainedX,
                  y: constrainedY,
                  inCursorSlot: false,
                  fromPoolPanel: undefined,
                  draggingPlayerId: null,
                  broadcastX: undefined,
                  broadcastY: undefined
                }
              });

              // Set ref to trigger debug useEffect
              droppedObjectRef.current = draggingId;
            }
          }
        }
      } else {
        // Clear dragging player ID only if not dropping to pool
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: draggingId, draggingPlayerId: null, broadcastX: undefined, broadcastY: undefined }
        });
      }
    }

    setDraggingId(null);
    clearDraggingOver(); // Clear global drag-over state
    setIsPanning(false);
    if (resizingId) {
      // Resize ending
    }
    // Note: resize cleanup (setResizingId null) is handled by global mouseup handler in handleResizeStart
    dragOffsetRef.current = null;

    // Send final pile position when drag ends
    if (draggingPile && pileDragStartRef.current) {
      if (!isHost) {
        // Guest: send final position to host
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: draggingPile.deck.id, piles: draggingPile.deck.piles }
        });
      } else {
        // Host: broadcast final position to all guests
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: draggingPile.deck.id, piles: draggingPile.deck.piles }
        });
      }
    }

    // Clear pile dragging state
    setDraggingPile(null);
    pileDragStartRef.current = null;
  }, [draggingId, hoveredDeckId, hoveredPileId, state.objects, dispatch, executeClickAction, isPointInRotatedRect, isHost]);

  // Keep handleMouseUp ref updated
  useEffect(() => {
    handleMouseUpRef.current = handleMouseUp;
  }, [handleMouseUp]);

  // Keep handleMouseMove ref updated
  useEffect(() => {
    handleMouseMoveRef.current = handleMouseMove;
  }, [handleMouseMove]);

  // Handle Escape key to close click tooltip, Space for testing pin compensation, Ctrl+Z for undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Track Ctrl/Meta key state for hiding action buttons during pan view
      if ((e.ctrlKey || e.metaKey) && !isCtrlPressed) {
        setIsCtrlPressed(true);
      }

      // Close click tooltip on ESC
      if (e.key === 'Escape') {
        if (clickTooltip) {
          setClickTooltip(null);
          clickTooltipBoundsRef.current = null;
        }
        // Clear ruler on ESC
        if (currentTool === 'ruler' && rulerStart) {
          setRulerStart(null);
          setRulerCurrent(null);
          setIsRulerRightClick(false);
        }
      }

      // Ctrl+Z / Cmd+Z for undo (use 'code' to work with any keyboard layout)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        // Check if marker tool is active
        if (currentTool === 'marker') {
          // Undo marker action
          dispatch({ type: 'UNDO_MARKER' });
        } else {
          // Undo general action
          dispatch({ type: 'UNDO_GENERAL' });
        }
        return;
      }

      // TEST: Spacebar manually compensates pinned deck position based on scroll
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        const pinnedDeck = Object.values(state.objects).find(obj =>
          (obj as any).isPinnedToViewport && obj.type === ItemType.DECK
        ) as DeckType | undefined;
        if (pinnedDeck && (pinnedDeck as any).pinnedScreenPosition) {
          // For pinned objects: convert screen position to world position
          // CSS transform is: translate(offset) scale(zoom)
          // So: worldX = screenX / zoom - offset.x
          const newRenderX = (pinnedDeck as any).pinnedScreenPosition.x - offset.x;
          const newRenderY = (pinnedDeck as any).pinnedScreenPosition.y - offset.y;
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: pinnedDeck.id,
              x: newRenderX,
              y: newRenderY
            }
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.objects, offset, clickTooltip, currentTool, dispatch, rulerStart]);

  // Track Shift key state for delete cursor when eraser tool is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
      // Reset Ctrl/Meta key state when released
      if (!e.ctrlKey && !e.metaKey && isCtrlPressed) {
        setIsCtrlPressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [clickTooltip, currentTool, rulerStart, dispatch, isCtrlPressed]);

  // Track right mouse button for ruler circle display
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2 && currentTool === 'ruler' && rulerStart) {
        setIsRulerRightClick(true);
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        setIsRulerRightClick(false);
      }
    };
    // Also clear on leaving the window
    const handleMouseLeave = () => {
      setIsRulerRightClick(false);
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [currentTool, rulerStart]);

  // Prevent context menu when right-clicking with ruler tool
  useEffect(() => {
    if (currentTool !== 'ruler') return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [currentTool]);

  // Global mouseup handler for drag operations - ALWAYS active, checks state internally
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // IMPORTANT: If clicking inside ANY context menu or modal, don't process global mouseup
      // This prevents interference with context menu button clicks in both Tabletop and Pool panels
      const tableContextMenuElement = target.closest('[data-context-menu="tabletop"]');
      const poolContextMenuElement = target.closest('[data-context-menu="pool"]');
      const submenuElement = target.closest('[data-submenu="true"]');
      const searchDeckModalElement = target.closest('[data-modal="search-deck"]');
      const topDeckModalElement = target.closest('[data-modal="top-deck"]');
      if (tableContextMenuElement || poolContextMenuElement || submenuElement || searchDeckModalElement || topDeckModalElement) {
        return;
      }

      // Only handle actual mouseup events (button was released)
      // Ignore synthetic events or events during drag
      if (e.button !== 0) return;

      // Use refs to check current state without depending on them
      const currentDraggingId = draggingIdRef.current;
      const currentIsPanning = isPanningRef.current;
      const currentResizingId = resizingIdRef.current;
      const currentDraggingPile = draggingPileRef.current;

      if (currentDraggingId || currentIsPanning || currentResizingId || currentDraggingPile) {
        handleMouseUpRef.current(e);
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Use refs to check current state without depending on them
      const currentDraggingId = draggingIdRef.current;
      const currentIsPanning = isPanningRef.current;
      const currentResizingId = resizingIdRef.current;
      const currentDraggingPile = draggingPileRef.current;

      if (currentDraggingId || currentIsPanning || currentResizingId || currentDraggingPile) {
        handleMouseMoveRef.current(e);
      }
    };

    // Listen in bubbling phase (not capture) to avoid interfering with other handlers
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, []); // Empty deps - handlers check refs for current state

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Zoom disabled - keeping scale at 1
  }, []);

  // Sync scroll and pixelsPerVU to global state (for save/load)
  React.useEffect(() => {
    const currentScroll = scrollContainerRef.current?.scrollLeft || 0;
    const currentScrollTop = scrollContainerRef.current?.scrollTop || 0;
    // Calculate base pixelsPerVU without local zoom multiplier
    const zoomMultiplier = (localSettings.zoom ?? 100) / 100;
    const basePixelsPerVU = pixelsPerVU / zoomMultiplier;

    dispatch({
      type: 'UPDATE_VIEW_TRANSFORM',
      payload: { offset: { x: 0, y: 0 }, zoom: 1, scroll: { x: currentScroll, y: currentScrollTop }, pixelsPerVU: basePixelsPerVU }
    });
  }, [pixelsPerVU, localSettings.zoom, dispatch]);

  const handleContextMenu = useCallback((e: React.MouseEvent, obj: TableObject) => {
      // Don't show context menu when ruler, marker, or eraser tool is active
      if (currentTool === 'ruler' || currentTool === 'marker' || currentTool === 'eraser') {
          e.preventDefault();
          return;
      }
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
          x: e.clientX,
          y: e.clientY,
          object: obj,
          shiftKey: e.shiftKey // Store shift key state
      });
  }, [currentTool]);

  const executeMenuAction = (action: string, shiftKey?: boolean) => {
    if (!contextMenu) return;

    // Always get fresh object from state to ensure we have latest data
    const freshObject = state.objects[contextMenu.object.id] || contextMenu.object;

    const { object } = contextMenu;

    // Use shift key from context menu or parameter
    const isShiftPressed = shiftKey !== undefined ? shiftKey : contextMenu.shiftKey;

    // Try to handle action with shared contextMenuAction utility
    // Returns true if action was handled, false otherwise
    let wasHandled = false;

    // Actions that require special handling in context menu
    const specialActions = [
      'configure', 'delete', 'pinToViewport', 'unpinFromViewport',
      'moveToPile-', 'pile-', 'moveToHyperscaleLayer:', 'editNexusBoard',
      'closeNexusBoardEditing', 'deleteNexusBoard', 'resetToBase'
    ];

    const isSpecialAction = specialActions.some(specialAction => action.startsWith(specialAction));

    if (isSpecialAction) {
      try {
        executeContextMenuAction(action, {
          object: freshObject,
          dispatch,
          state,
          activePlayerId: state.activePlayerId,
          offset,
          setContextMenu,
          setSettingsModalObj,
          setDeleteCandidateId,
          setSearchModalDeck,
          setSearchModalPile,
          setTopDeckModalDeck,
          setNexusBoardAddingCell,
          isShiftPressed,
          isGM,
          isPoolPanel: false
        });
      } catch (error) {
        // Error handling
      }
      wasHandled = true;
      // Close menu after executing special action (except for modals)
      if (setContextMenu && action !== 'configure' && action !== 'delete') {
        setContextMenu(null);
      }
    }

    // All other actions use the unified executeClickAction
    if (!wasHandled) {
      executeClickAction(freshObject, action);
      // Close menu after executing action
      if (setContextMenu) setContextMenu(null);
    }
  };

  const handlePileContextMenu = useCallback((e: React.MouseEvent, pile: CardPile, deck: DeckType) => {
      e.preventDefault();
      e.stopPropagation();
      setPileContextMenu({
          x: e.clientX,
          y: e.clientY,
          pile,
          deck
      });
  }, []);

  const executePileMenuAction = (action: string) => {
      if (!pileContextMenu) return;
      const { pile, deck } = pileContextMenu;

      switch(action) {
          case 'lock':
              dispatch({
                  type: 'TOGGLE_PILE_LOCK',
                  payload: { deckId: deck.id, pileId: pile.id }
              });
              setPileContextMenu(null);
              break;
          case 'showTop':
              dispatch({
                  type: 'TOGGLE_SHOW_TOP_CARD',
                  payload: { deckId: deck.id, pileId: pile.id }
              });
              setPileContextMenu(null);
              break;
          case 'searchDeck':
              setSearchModalDeck(deck);
              setSearchModalPile(pile);
              setPileContextMenu(null);
              break;
          case 'draw':
              dispatch({
                  type: 'DRAW_FROM_PILE',
                  payload: {
                      pileId: pile.id,
                      deckId: deck.id,
                      playerId: state.activePlayerId
                  }
              });
              setPileContextMenu(null);
              break;
          case 'returnAll':
              executeClickAction(deck, action);
              setPileContextMenu(null);
              break;
          case 'returnAllAndShuffle':
              executeClickAction(deck, action);
              setPileContextMenu(null);
              break;
          case 'returnAllExceptHands':
              executeClickAction(deck, action);
              setPileContextMenu(null);
              break;
      }
  };

  // Track remote object animations
  // const { getAnimatingIds, animatingObjects } = useRemoteObjectAnimation(
  //   state.objects,
  //   draggingId
  // );
  // const animatingIds = getAnimatingIds();

  // Memoize table objects to prevent unnecessary re-renders
  // Note: DECK objects are filtered out here and rendered separately (pinned/unpinned)
  const tableObjects = useMemo(() => {
    return (Object.values(state.objects || {}) as TableObject[])
      .filter(obj => {
          // Exclude objects currently being animated (they're rendered separately)
          // if (animatingIds.has(obj.id)) return false;
          // Exclude UI objects (panels and windows) - they have their own rendering
          if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) return false;
          // Exclude DECK objects - they are rendered separately with pinned/unpinned logic
          if (obj.type === ItemType.DECK) return false;
          // Exclude objects in cursor slot
          // All draggable objects disappear when picked up (traditional behavior)
          if (obj.inCursorSlot) {
            return false;
          }
          // Exclude objects being dragged by another player (rendered separately as shadow if effect enabled)
          const draggingPlayerId = (obj as any).draggingPlayerId;
          if (draggingPlayerId && draggingPlayerId !== state.activePlayerId) return false;
          if (!obj.isOnTable) return false;
          if (obj.type === ItemType.CARD) {
            const card = obj as CardType;
            // Only render cards on TABLE - exclude DECK, HAND, PILE, CURSOR_SLOT
            if (card.location !== CardLocation.TABLE) return false;
            // Filter out hidden cards for players (GM sees them)
            if (card.hidden && !isGM) return false;
          }
          // Filter out hidden objects (visible === false)
          if ((obj as any).visible === false) return false;

          // PERFORMANCE: Only render objects in or intersecting with playable area
          // Objects in pool panel territories (outside 5000×5000) are rendered separately
          const objX = obj.x || 0;
          const objY = obj.y || 0;
          const objWidth = obj.width || 100;
          const objHeight = obj.height || 100;

          // Include objects that intersect with playable area (0-5000×0-5000)
          const inPlayableArea = objX < PLAYABLE_AREA_SIZE && objY < PLAYABLE_AREA_SIZE &&
                                objX + objWidth > 0 && objY + objHeight > 0;

          if (!inPlayableArea) return false;

          return true;
      })
      .sort((a, b) => {
          // First, sort by hyperscale layer order (boards < cards < tokens < interface)
          const layerA = state.hyperscaleLayers.find(l => l.id === (a.hyperscaleLayerId || 'tokens'));
          const layerB = state.hyperscaleLayers.find(l => l.id === (b.hyperscaleLayerId || 'tokens'));
          const orderA = layerA?.order ?? 2;
          const orderB = layerB?.order ?? 2;
          if (orderA !== orderB) return orderA - orderB;

          // Within the same layer, sort by zIndex
          const zA = a.zIndex ?? 0;
          const zB = b.zIndex ?? 0;
          if (zA !== zB) return zA - zB;

          // Token types (archetypes) go to the back (for Tools panel)
          if (a.type === ItemType.TOKEN_TYPE) return -1;
          if (b.type === ItemType.TOKEN_TYPE) return 1;

          if (a.locked && !b.locked) return -1;
          if (!a.locked && b.locked) return 1;

          return 0;
      });
  }, [state.objects, state.hyperscaleLayers, isGM]);

  // Objects that are in another player's cursor slot (inCursorSlot=true but not in my local cursorSlot)
  // These are rendered as darkened/semi-transparent and non-interactive
  const remoteCursorSlotObjects = useMemo(() => {
    // Early return if effect is disabled
    if (!localSettings.effects.showRemoteCursorSlotObjects) return [];

    const myCursorSlotIds = new Set(cursorSlot.map(item => item.id));
    return (Object.values(state.objects || {}) as TableObject[])
      .filter(obj => {
        // Exclude UI objects and decks first (they don't have inCursorSlot)
        if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW || obj.type === ItemType.DECK) return false;
        // Must be marked as in cursor slot in synced state
        if (!(obj as any).inCursorSlot) return false;
        // Must NOT be in my local cursor slot (that means another player has it)
        if (myCursorSlotIds.has(obj.id)) return false;
        // Must NOT be in my recently dropped cursor slot (prevents shadow flicker when I drop items)
        if (recentlyInMyCursorSlot.has(obj.id)) return false;
        // Must be on table
        if (!(obj as any).isOnTable) return false;
        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          if (card.location !== CardLocation.TABLE) return false;
          // Filter out hidden cards for players (GM sees them)
          if (card.hidden && !isGM) return false;
        }
        // Include dice, counters, and randomizers in remote cursor slot rendering
        // These will be shown as shadows when another player is dragging them
        if (obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.COUNTER || obj.type === ItemType.RANDOMIZER) {
          return true;
        }
        // Filter out hidden objects
        if ((obj as any).visible === false) return false;
        return true;
      })
      .sort((a, b) => {
          // Sort by hyperscale layer order first, then by zIndex
          const layerA = state.hyperscaleLayers.find(l => l.id === (a.hyperscaleLayerId || 'tokens'));
          const layerB = state.hyperscaleLayers.find(l => l.id === (b.hyperscaleLayerId || 'tokens'));
          const orderA = layerA?.order ?? 2;
          const orderB = layerB?.order ?? 2;
          if (orderA !== orderB) return orderA - orderB;
          return (a.zIndex ?? 0) - (b.zIndex ?? 0);
      });
  }, [state.objects, state.hyperscaleLayers, cursorSlot, recentlyInMyCursorSlot, isGM, localSettings.effects.showRemoteCursorSlotObjects]);

  // Objects that are being dragged by another player (draggingPlayerId is set but not by local player)
  // These are rendered as darkened/semi-transparent and non-interactive (if effect enabled)
  const remoteDraggingObjects = useMemo(() => {
    // Early return if effect is disabled
    if (!localSettings.effects.showRemoteCursorSlotObjects) return [];

    return (Object.values(state.objects || {}) as TableObject[])
      .filter(obj => {
        // Exclude UI objects only
        if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) return false;
        // Must be marked as being dragged by another player
        const draggingPlayerId = (obj as any).draggingPlayerId;
        if (!draggingPlayerId) return false;
        // Must NOT be dragged by local player
        if (draggingPlayerId === state.activePlayerId) return false;
        // Must be on table
        if (!(obj as any).isOnTable) return false;
        if (obj.type === ItemType.CARD) {
          const card = obj as CardType;
          if (card.location !== CardLocation.TABLE) return false;
          if (card.hidden && !isGM) return false;
        }
        // Filter out hidden objects
        if ((obj as any).visible === false) return false;
        return true;
      })
      .sort((a, b) => {
          // Sort by hyperscale layer order first, then by zIndex
          const layerA = state.hyperscaleLayers.find(l => l.id === (a.hyperscaleLayerId || 'tokens'));
          const layerB = state.hyperscaleLayers.find(l => l.id === (b.hyperscaleLayerId || 'tokens'));
          const orderA = layerA?.order ?? 2;
          const orderB = layerB?.order ?? 2;
          if (orderA !== orderB) return orderA - orderB;
          return (a.zIndex ?? 0) - (b.zIndex ?? 0);
      });
  }, [state.objects, state.hyperscaleLayers, state.activePlayerId, isGM, localSettings.effects.showRemoteCursorSlotObjects]);

  // UI objects (panels and windows) - separate from game objects
  const uiObjects = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter(obj => obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW)
      .filter(obj => {
        // For windows with ownerId, only show to the owner
        if (obj.type === ItemType.WINDOW) {
          const windowObj = obj as WindowObject;
          // Filter out windows owned by other players
          if (windowObj.ownerId && windowObj.ownerId !== state.activePlayerId) {
            return false;
          }
          return windowObj.visible !== false;
        }
        if (obj.type === ItemType.PANEL) {
          return (obj as PanelObject).visible !== false;
        }
        return true;
      })
      .sort((a, b) => {
          // Sort by hyperscale layer order first, then by zIndex
          const layerA = state.hyperscaleLayers.find(l => l.id === (a.hyperscaleLayerId || 'interface'));
          const layerB = state.hyperscaleLayers.find(l => l.id === (b.hyperscaleLayerId || 'interface'));
          const orderA = layerA?.order ?? 3;
          const orderB = layerB?.order ?? 3;
          if (orderA !== orderB) return orderA - orderB;
          return (a.zIndex || 1000) - (b.zIndex || 1000);
      });
  }, [state.objects, state.hyperscaleLayers, state.activePlayerId]);

  // Split UI objects into pinned and unpinned for separate rendering
  const pinnedUIObjects = useMemo(() => {
    return uiObjects.filter(obj => (obj as PanelObject | WindowObject).isPinnedToViewport === true);
  }, [uiObjects]);

  const unpinnedUIObjects = useMemo(() => {
    return uiObjects.filter(obj => (obj as PanelObject | WindowObject).isPinnedToViewport !== true);
  }, [uiObjects]);

  // Split deck objects into pinned and unpinned for separate rendering
  const pinnedDecks = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter(obj => {
        if (obj.type !== ItemType.DECK) return false;
        if (!obj.isOnTable) return false;
        if ((obj as any).isPinnedToViewport !== true) return false;
        // Exclude decks being dragged by other players (shown as shadow in remoteDraggingObjects if effect enabled)
        const draggingPlayerId = (obj as any).draggingPlayerId;
        if (draggingPlayerId && draggingPlayerId !== state.activePlayerId) return false;
        return true;
      });
  }, [state.objects, state.activePlayerId]);

  const unpinnedDecks = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter(obj => {
        if (obj.type !== ItemType.DECK) return false;
        if (!obj.isOnTable) return false;
        if ((obj as any).isPinnedToViewport === true) return false;
        // Exclude decks being dragged by other players (shown as shadow in remoteDraggingObjects if effect enabled)
        const draggingPlayerId = (obj as any).draggingPlayerId;
        if (draggingPlayerId && draggingPlayerId !== state.activePlayerId) return false;
        return true;
      });
  }, [state.objects, state.activePlayerId]);

  const worldBounds = useMemo(() => {
    // For scrollbars: show only playable area (5000×5000) as if that's the entire world
    // Convert to pixels for rendering (using local zoom-adjusted pixelsPerVU)
    const sizePx = vuToPixels(PLAYABLE_AREA_SIZE, pixelsPerVU);
    return { width: sizePx, height: sizePx };
  }, [pixelsPerVU]);

  const confirmDelete = () => {
    if (deleteCandidateId) {
        dispatch({ type: 'DELETE_OBJECT', payload: { id: deleteCandidateId }});
        setDeleteCandidateId(null);
    }
  };

  return (
    <div
      ref={scrollContainerRef}
      data-tabletop="true"
      className={`w-full h-full overflow-auto relative ${
        currentTool === 'eraser' && isShiftPressed
          ? 'cursor-eraser-delete'
          : currentTool === 'marker' && isShiftPressed
            ? 'cursor-move'
            : cursorSlot.length > 0
              ? 'cursor-grabbing'
              : 'cursor-default'
      }`}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        cursor: currentTool === 'eraser' && isShiftPressed
          ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 6h18' /><path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' /><path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' /><line x1='10' y1='11' x2='10' y2='17' /><line x1='14' y1='11' x2='14' y2='17' /></svg>") 12 12, auto`
          : undefined
      }}
      onMouseDown={(e) => handleMouseDown(e)}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onScroll={(e) => {
        const target = e.target as HTMLElement;
        if (target.scrollLeft === undefined || target.scrollTop === undefined) return;

        let scrollLeft = target.scrollLeft;
        let scrollTop = target.scrollTop;

        // Constrain scroll to playable area (5000×5000 top-left)
        const constrained = clampScrollToPlayableArea(
          scrollLeft,
          scrollTop,
          target.clientWidth,
          target.clientHeight,
          pixelsPerVU
        );

        // Apply constraints if needed
        if (constrained.x !== scrollLeft || constrained.y !== scrollTop) {
          target.scrollLeft = constrained.x;
          target.scrollTop = constrained.y;
          scrollLeft = constrained.x;
          scrollTop = constrained.y;
        }

        // Update scroll position in global state for deck positioning
        dispatch({
          type: 'UPDATE_VIEW_TRANSFORM',
          payload: {
            ...state.viewTransform,
            scroll: { x: scrollLeft, y: scrollTop }
          }
        });

        // Find all pinned GAME objects (not UI panels/windows/decks/boards - they render in fixed container now)
        const pinnedObjects = Object.values(state.objects).filter(obj =>
          (obj as any).isPinnedToViewport &&
          obj.type !== ItemType.PANEL &&
          obj.type !== ItemType.WINDOW &&
          obj.type !== ItemType.DECK
        );

        if (pinnedObjects.length > 0) {
          pinnedObjects.forEach(obj => {
            const pinnedObj = obj as any;
            const pinnedPosition = pinnedObj.pinnedScreenPosition;

            if (pinnedPosition) {
              // For game objects in transform container: screenX = (obj.x + offset.x) * zoom
              // We want: screenX = pinnedPosition.x
              // So: obj.x = pinnedPosition.x / zoom - offset.x
              const newX = pinnedPosition.x - offset.x;
              const newY = pinnedPosition.y - offset.y;

              // Only dispatch if position actually changed significantly
              if (Math.abs(newX - obj.x) > 0.5 || Math.abs(newY - obj.y) > 0.5) {
                dispatch({
                  type: 'UPDATE_OBJECT',
                  payload: {
                    id: obj.id,
                    x: newX,
                    y: newY
                  }
                });
              }
            }
          });
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => {
        // Allow drops from hand panel
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        // Handle drop from hand panel or tools panel
        e.preventDefault();
        e.stopPropagation();

        // Try to get token archetype data first
        const archetypeData = e.dataTransfer.getData('application/json');
        if (archetypeData) {
          try {
            const data = JSON.parse(archetypeData);
            if (data.type === 'token-archetype' && data.archetypeId) {
              const archetype = state.objects[data.archetypeId] as TokenArchetype;
              if (archetype && archetype.type === ItemType.TOKEN_TYPE) {
                // Add token to cursor slot instead of spawning directly on board
                window.dispatchEvent(new CustomEvent('add-token-to-cursor-slot', {
                  detail: { archetypeId: archetype.id, clientX: e.clientX, clientY: e.clientY }
                }));
                return;
              }
            }
          } catch (err) {
            // Not JSON data, continue with card handling
          }
        }

        // Handle drop from hand panel (when dropped outside the transformed area)
        const cardId = e.dataTransfer.getData('text/plain');
        if (cardId && state.objects[cardId]) {
            const card = state.objects[cardId] as CardType;
            if (card.type === ItemType.CARD && card.location === CardLocation.HAND) {
                // Calculate world position for the card
                const worldX = p2v(e.clientX + state.viewTransform.scroll.x) - (card.width ?? 100) / 2;
                const worldY = p2v(e.clientY + state.viewTransform.scroll.y) - (card.height ?? 140) / 2;

                // Clamp zIndex to card's hyperscale layer's maxZ
                const cardLayer = state.hyperscaleLayers.find(l => l.id === card.hyperscaleLayerId);
                const maxZ = cardLayer?.maxZIndex ?? 10000;

                // Cards on table get max zIndex of their layer (same as dragging)
                dispatch({
                    type: 'UPDATE_OBJECT',
                    payload: {
                        id: cardId,
                        location: CardLocation.TABLE,
                        x: worldX,
                        y: worldY,
                        isOnTable: true,
                        faceUp: true,
                        zIndex: maxZ,
                        ownerId: undefined
                    }
                });
            }
        }
      }}
    >
      {/* Solid background color */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: worldBounds.width,
          height: worldBounds.height,
          backgroundColor: '#2c3e50',
          pointerEvents: 'none',
          zIndex: -3
        }}
      />

      {/* Board background with grid pattern */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: worldBounds.width,
          height: worldBounds.height,
          backgroundImage: 'radial-gradient(#34495e 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
          zIndex: -1
        }}
      />
      <div
            style={{
                width: worldBounds.width,
                height: worldBounds.height,
                position: 'absolute',
                top: 0, left: 0,
                pointerEvents: 'none',
                zIndex: -2  // Changed to -2 to not overlap background grid
            }}
        />

        {/* Drawing Canvas - overlays the board for marker/eraser tools */}
        <DrawingCanvas
          width={worldBounds.width}
          height={worldBounds.height}
          offsetX={state.viewTransform.scroll.x}
          offsetY={state.viewTransform.scroll.y}
          cursorSlotLength={cursorSlot.length}
        />

        <div
            data-tabletop="true"
            className="absolute origin-top-left"
            style={{
                top: 0,
                left: 0,
                width: worldBounds.width,
                height: worldBounds.height,
            }}
        >
            {/* Ruler overlay - inside world container for correct coordinate system */}
            {currentTool === 'ruler' && rulerStart && (
              <svg
                className="absolute pointer-events-none"
                style={{ top: 0, left: 0, width: '100%', height: '100%', zIndex: 8000 }}
              >
                {/* Start point circle */}
                <circle
                  cx={v2p(rulerStart.x)}
                  cy={v2p(rulerStart.y)}
                  r={v2p(1.5)}
                  fill="white"
                />
                {/* Dashed line from start to current */}
                {rulerCurrent && (
                  <>
                    <line
                      x1={v2p(rulerStart.x)}
                      y1={v2p(rulerStart.y)}
                      x2={v2p(rulerCurrent.x)}
                      y2={v2p(rulerCurrent.y)}
                      stroke="white"
                      strokeWidth={v2p(1)}
                      strokeDasharray={`${v2p(6)},${v2p(4)}`}
                    />
                    {/* Circle around start point when right-click is held (radius = line length) */}
                    {isRulerRightClick && (() => {
                      const lineLength = Math.sqrt(Math.pow(rulerCurrent.x - rulerStart.x, 2) + Math.pow(rulerCurrent.y - rulerStart.y, 2));
                      return lineLength > 0 ? (
                        <circle
                          cx={v2p(rulerStart.x)}
                          cy={v2p(rulerStart.y)}
                          r={v2p(lineLength)}
                          fill="none"
                          stroke="white"
                          strokeWidth={v2p(0.5)}
                          strokeDasharray={`${v2p(6)},${v2p(4)}`}
                        />
                      ) : null;
                    })()}
                    {/* Length label in the middle */}
                    <text
                      x={v2p((rulerStart.x + rulerCurrent.x) / 2)}
                      y={v2p((rulerStart.y + rulerCurrent.y) / 2)}
                      fill="white"
                      fontSize={12}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{
                        textShadow: '1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black',
                        pointerEvents: 'none'
                      }}
                    >
                      {Math.sqrt(Math.pow(rulerCurrent.x - rulerStart.x, 2) + Math.pow(rulerCurrent.y - rulerStart.y, 2)).toFixed(1)}vu
                    </text>
                  </>
                )}
              </svg>
            )}

            {/* Objects in another player's cursor slot - darkened, semi-transparent, non-interactive */}
            {remoteCursorSlotObjects.map((obj) => {
                // Calculate global z-index for remote objects in cursor slot
                // Remote cursor slot objects should appear above everything
                const layer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                const layerOrder = layer?.order ?? 2;
                const globalZIndex = 999997; // Remote cursor slot objects always on top

                if (obj.type === ItemType.TOKEN) {
                    const token = obj as TokenType;
                    return (
                        <div
                            key={`remote-cursor-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: v2p(obj.width),
                                height: v2p(obj.height),
                                transform: `rotate(${obj.rotation}deg)`,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <SvgTokenShape
                                shape={token.shape}
                                width={v2p(obj.width)}
                                height={v2p(obj.height)}
                                color={obj.color || '#e74c3c'}
                                content={obj.content}
                                rotation={0}
                                borderWidth={obj.borderWidth ?? 2}
                                borderColor={(obj as any).borderColor || 'white'}
                                opacity={obj.opacity ?? 100}
                                borderOpacity={obj.borderOpacity ?? 100}
                                showThickness={true}
                                tokenName={(obj as any).showNameOnToken || (obj as any).showName || ((obj as any).archetypeId && (state.objects[(obj as any).archetypeId] as any)?.showName) ? obj.name : undefined}
                                fontColor={(obj as any).fontColor || 'white'}
                            />
                        </div>
                    );
                }

                if (obj.type === ItemType.CARD) {
                    const card = obj as CardType;
                    const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;

                    let baseWidth = card.width ?? (deck?.cardWidth ?? 63);
                    let baseHeight = card.height ?? (deck?.cardHeight ?? 88);
                    const pxWidth = v2p(baseWidth);
                    const pxHeight = v2p(baseHeight);

                    return (
                        <div
                            key={`remote-cursor-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: pxWidth,
                                height: pxHeight,
                                transform: `rotate(${obj.rotation ?? 0}rad)`,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <Card
                                card={card}
                                overrideWidth={pxWidth}
                                overrideHeight={pxHeight}
                                cardWidth={deck?.cardWidth}
                                cardHeight={deck?.cardHeight}
                                cardOrientation={deck?.cardOrientation}
                                cardNamePosition={deck?.cardNamePosition}
                                disableRotationTransform={true}
                                disablePointerEvents={true}
                                showActionButtons={false}
                                skipTooltip={true}
                                deckSpriteConfig={deck?.spriteConfig}
                                deckShowTooltipImage={deck?.showTooltipImage}
                                deckTooltipScale={deck?.tooltipScale}
                            />
                        </div>
                    );
                }

                return null;
            })}

            {/* Objects being dragged by another player - darkened, semi-transparent, non-interactive */}
            {remoteDraggingObjects.map((obj) => {
                // Calculate global z-index for remote dragging objects
                // Remote dragging objects should appear above everything
                const layer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                const layerMinZ = layer?.minZIndex ?? 3001;
                const globalZIndex = 999999; // Remote dragging objects always on top

                if (obj.type === ItemType.TOKEN) {
                    const token = obj as TokenType;
                    return (
                        <div
                            key={`remote-drag-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: v2p(obj.width),
                                height: v2p(obj.height),
                                transform: `rotate(${obj.rotation}deg)`,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <SvgTokenShape
                                shape={token.shape}
                                width={v2p(obj.width)}
                                height={v2p(obj.height)}
                                color={obj.color || '#e74c3c'}
                                content={obj.content}
                                rotation={0}
                                borderWidth={obj.borderWidth ?? 2}
                                borderColor={(obj as any).borderColor || 'white'}
                                opacity={obj.opacity ?? 100}
                                borderOpacity={obj.borderOpacity ?? 100}
                                showThickness={true}
                                tokenName={(obj as any).showNameOnToken || (obj as any).showName || ((obj as any).archetypeId && (state.objects[(obj as any).archetypeId] as any)?.showName) ? obj.name : undefined}
                                fontColor={(obj as any).fontColor || 'white'}
                            />
                        </div>
                    );
                }

                if (obj.type === ItemType.CARD) {
                    const card = obj as CardType;
                    const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
                    let baseWidth = card.width ?? (deck?.cardWidth ?? 63);
                    let baseHeight = card.height ?? (deck?.cardHeight ?? 88);
                    const pxWidth = v2p(baseWidth);
                    const pxHeight = v2p(baseHeight);
                    return (
                        <div
                            key={`remote-drag-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: pxWidth,
                                height: pxHeight,
                                transform: `rotate(${obj.rotation ?? 0}rad)`,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <Card
                                card={card}
                                overrideWidth={pxWidth}
                                overrideHeight={pxHeight}
                                cardWidth={deck?.cardWidth}
                                cardHeight={deck?.cardHeight}
                                cardOrientation={deck?.cardOrientation}
                                cardNamePosition={deck?.cardNamePosition}
                                disableRotationTransform={true}
                                disablePointerEvents={true}
                                showActionButtons={false}
                                skipTooltip={true}
                                deckSpriteConfig={deck?.spriteConfig}
                                deckShowTooltipImage={deck?.showTooltipImage}
                                deckTooltipScale={deck?.tooltipScale}
                            />
                        </div>
                    );
                }

                return null;
            })}

            {/* Shadow objects being dragged by remote players */}
            {remoteDraggingObjects.map((obj) => {
                // Calculate global z-index for shadow objects
                // Shadow objects being dragged by remote players should appear above everything
                const layer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                const layerMinZ = layer?.minZIndex ?? 3001;
                const globalZIndex = 999998; // Shadow objects just below the actively dragging object

                if (obj.type === ItemType.TOKEN) {
                    const token = obj as TokenType;
                    return (
                        <div
                            key={`remote-drag-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: v2p(obj.width),
                                height: v2p(obj.height),
                                transform: `rotate(${obj.rotation}deg)`,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <SvgTokenShape
                                shape={token.shape}
                                width={v2p(obj.width)}
                                height={v2p(obj.height)}
                                color={obj.color || '#e74c3c'}
                                content={obj.content}
                                rotation={0}
                                borderWidth={obj.borderWidth ?? 2}
                                borderColor={(obj as any).borderColor || 'white'}
                                opacity={obj.opacity ?? 100}
                                borderOpacity={obj.borderOpacity ?? 100}
                                showThickness={true}
                                tokenName={(obj as any).showNameOnToken || (obj as any).showName || ((obj as any).archetypeId && (state.objects[(obj as any).archetypeId] as any)?.showName) ? obj.name : undefined}
                                fontColor={(obj as any).fontColor || 'white'}
                            />
                        </div>
                    );
                }

                if (obj.type === ItemType.CARD) {
                    const card = obj as CardType;
                    const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
                    let baseWidth = card.width ?? (deck?.cardWidth ?? 63);
                    let baseHeight = card.height ?? (deck?.cardHeight ?? 88);
                    const pxWidth = v2p(baseWidth);
                    const pxHeight = v2p(baseHeight);
                    return (
                        <div
                            key={`remote-drag-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: pxWidth,
                                height: pxHeight,
                                transform: `rotate(${obj.rotation ?? 0}rad)`,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <Card
                                card={card}
                                overrideWidth={pxWidth}
                                overrideHeight={pxHeight}
                                cardWidth={deck?.cardWidth}
                                cardHeight={deck?.cardHeight}
                                cardOrientation={deck?.cardOrientation}
                                cardNamePosition={deck?.cardNamePosition}
                                disableRotationTransform={true}
                                disablePointerEvents={true}
                                showActionButtons={false}
                                skipTooltip={true}
                                deckSpriteConfig={deck?.spriteConfig}
                                deckShowTooltipImage={deck?.showTooltipImage}
                                deckTooltipScale={deck?.tooltipScale}
                            />
                        </div>
                    );
                }

                if (obj.type === ItemType.DICE_OBJECT) {
                    const dice = obj as DiceObject;
                    const diceShape = dice.shape || TokenShape.SQUARE;
                    return (
                        <div
                            key={`remote-drag-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: v2p(dice.width || 60),
                                height: v2p(dice.height || 60),
                                transform: `rotate(${obj.rotation}deg)`,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <SvgTokenShape
                                shape={diceShape}
                                width={v2p(dice.width || 60)}
                                height={v2p(dice.height || 60)}
                                color={obj.color || '#6366f1'}
                                content={''}
                                borderColor={(obj as any).borderColor || '#4f46e5'}
                                borderWidth={(obj as any).borderWidth ?? 3}
                                opacity={obj.opacity ?? 100}
                                borderOpacity={(obj as any).borderOpacity ?? 100}
                            />
                            {/* Dice value - always centered */}
                            <div
                                className="absolute flex items-center justify-center pointer-events-none"
                                style={{
                                    top: diceShape === TokenShape.TRIANGLE ? '56%' : '45%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)'
                                }}
                            >
                                <span
                                    className="font-bold text-white drop-shadow-md"
                                    style={{
                                        fontSize: `${Math.min(24 * (1 + ((dice.height || 60) / 60 - 1) * (2/3)), (dice.width || 60) * 0.7)}px`
                                    }}
                                >{dice.currentValue}</span>
                            </div>
                            {/* Dice sides indicator */}
                            <div
                                className="absolute flex items-center justify-center pointer-events-none"
                                style={{
                                    top: diceShape === TokenShape.TRIANGLE ? '78%' : '72.5%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)'
                                }}
                            >
                                <span
                                    className="opacity-75 text-white drop-shadow-md"
                                    style={{
                                        fontSize: `${Math.min(9 * (1 + ((dice.height || 60) / 60 - 1) * (2/3)), (dice.width || 60) * 0.25)}px`
                                    }}
                                >d{dice.sides}</span>
                            </div>
                        </div>
                    );
                }

                if (obj.type === ItemType.COUNTER) {
                    const counter = obj as Counter;
                    const width = v2p(Math.max(obj.width, 100));
                    const height = v2p(50);
                    return (
                        <div
                            key={`remote-drag-${obj.id}`}
                            className="absolute pointer-events-none select-none bg-slate-900 border-2 border-slate-600 rounded-lg shadow-xl flex items-center justify-center p-2 text-white"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: width,
                                height: height,
                                transform: `rotate(${obj.rotation}deg)`,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <span className="text-xl font-bold">{counter.value}</span>
                        </div>
                    );
                }

                if (obj.type === ItemType.DECK) {
                    const deck = obj as DeckType;
                    const cardShape = deck.cardShape || CardShape.POKER;
                    const cardOrientation = deck.cardOrientation || CardOrientation.VERTICAL;
                    const useSvg = shouldUseSvgForDeck(cardShape);
                    const effectiveWidth = v2p((deck.cardWidth || 63) * (cardOrientation === CardOrientation.HORIZONTAL ? 1.5 : 1));
                    const effectiveHeight = v2p((deck.cardHeight || 88) * (cardOrientation === CardOrientation.HORIZONTAL ? 1.5 : 1));
                    const visibleCardCount = deck.cardIds?.length || 0;
                    const baseCardIds = deck.baseCardIds || deck.cardIds || [];

                    return (
                        <div
                            key={`remote-drag-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: effectiveWidth,
                                height: effectiveHeight,
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <div style={{ transform: `rotate(${deck.rotation || 0}deg)`, width: '100%', height: '100%' }}>
                                {useSvg ? (
                                    // SVG rendering for geometric shapes (HEX, TRIANGLE)
                                    <>
                                        {/* Stacked layers effect */}
                                        {[2, 1, 0].map(i => (
                                            <div
                                                key={i}
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    height: '100%',
                                                    transform: `translate(${i * 4}px, ${i * 4}px)`,
                                                    zIndex: -i,
                                                }}
                                            >
                                                <SvgDeckShape
                                                    shape={cardShape}
                                                    width={effectiveWidth}
                                                    height={effectiveHeight}
                                                    backgroundColor="#1e293b"
                                                    borderColor="#475569"
                                                    borderWidth={2}
                                                    orientation={cardOrientation}
                                                />
                                            </div>
                                        ))}

                                        {/* Main deck with content */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <SvgDeckShape
                                                shape={cardShape}
                                                width={effectiveWidth}
                                                height={effectiveHeight}
                                                backgroundColor="#0f172a"
                                                borderColor="#64748b"
                                                borderWidth={2}
                                                orientation={cardOrientation}
                                            >
                                                <foreignObject x="0" y="0" width="100" height="100">
                                                    <div className="w-full h-full flex flex-col items-center justify-center">
                                                        <Layers className="text-slate-400 mb-1" size={16} />
                                                        <DeckLabel
                                                            name={deck.name}
                                                            count={visibleCardCount}
                                                            totalCount={baseCardIds.length}
                                                            shape={cardShape}
                                                        />
                                                    </div>
                                                </foreignObject>
                                            </SvgDeckShape>
                                        </div>
                                    </>
                                ) : (
                                    // CSS rendering for standard shapes (POKER, BRIDGE, etc.)
                                    <>
                                        {/* Stacked layers effect */}
                                        {[2, 1, 0].map(i => (
                                            <div
                                                key={i}
                                                className="absolute bg-slate-800 border-2 border-slate-600 shadow-md pointer-events-none"
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    top: 0,
                                                    left: 0,
                                                    transform: `translate(${i * 4}px, ${i * 4}px)`,
                                                    zIndex: -i,
                                                }}
                                            />
                                        ))}

                                        {/* Main deck */}
                                        <div className="absolute inset-0 bg-slate-900 border-2 border-slate-500 flex flex-col items-center justify-center">
                                            <Layers className="text-slate-400 mb-1" size={16} />
                                            <span className="text-xs text-slate-300 font-bold px-2 text-center select-none">
                                                {deck.name}
                                            </span>
                                            <span className="text-xs text-slate-500 select-none">
                                                {visibleCardCount} / {baseCardIds.length}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                }

                if (obj.type === ItemType.BOARD) {
                    const board = obj as BoardType;
                    return (
                        <div
                            key={`remote-drag-${obj.id}`}
                            className="absolute pointer-events-none select-none"
                            style={{
                                left: v2p(obj.x),
                                top: v2p(obj.y),
                                width: v2p(obj.width),
                                height: v2p(obj.height),
                                opacity: 0.5,
                                filter: 'brightness(0.6)',
                                zIndex: globalZIndex,
                            }}
                        >
                            <div
                                className="w-full h-full border-4 border-slate-600 rounded-lg bg-cover bg-center"
                                style={{
                                    backgroundImage: board.content ? `url(${board.content})` : undefined,
                                    backgroundColor: board.content ? undefined : '#4a5568',
                                    transform: `rotate(${obj.rotation || 0}deg)`,
                                }}
                            />
                        </div>
                    );
                }

                return null;
            })}

            {/* All objects in unified space */}
            {tableObjects.map((obj) => {
                const isOwner = !(obj as any).ownerId || (obj as any).ownerId === state.activePlayerId || isGM;
                // Only show grab cursor for unlocked objects that can be dragged
                // Dice always use default cursor since they're not draggable by mouse in main tabletop
                const isDice = obj.type === ItemType.DICE_OBJECT;
                const canDrag = !obj.locked && !isDice;
                const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

                // Calculate global z-index using layer's minZIndex as base
                // This ensures tokens (3001-6000) always render above boards (1-1000)
                // When dragging, use very high z-index to appear above everything else
                const layer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                const layerMinZ = layer?.minZIndex ?? 3001;
                const isDragging = draggingId === obj.id;
                const globalZIndex = isDragging ? 999999 : layerMinZ + (obj.zIndex ?? 0);

                // Get local zoom scale for this object's layer
                const objLayerId = obj.hyperscaleLayerId || 'tokens';
                const layerZoomScale = getLayerZoomScale(objLayerId);

                if (obj.type === ItemType.BOARD) {
                    const board = obj as BoardType;
                    const isResizing = resizingId === obj.id;
                    const isDragging = draggingId === obj.id;
                    const canResize = !obj.locked;
                    const gridSize = v2p(board.gridSize || 50); // Convert vu to pixels
                    const gridW_px = v2p(board.gridWidth || board.gridSize || 50);
                    const gridH_px = v2p(board.gridHeight || board.gridSize || 50);

                    return (
                        <Tooltip
                            key={obj.id}
                            text={obj.tooltipText}
                            showImage={obj.showTooltipImage}
                            imageSrc={obj.content}
                            scale={obj.tooltipScale}
                        >
                            {(() => {
                                const objLayer = obj.hyperscaleLayerId || 'none';
                                const hasSelectedLayers = state.selectedHyperscaleLayerIds.length > 0;
                                const isLayerSelected = objLayer === 'none' || state.selectedHyperscaleLayerIds.includes(objLayer);
                                const isPermeable = hasSelectedLayers && !isLayerSelected;

                                return (
                                    <div
                                        className={isPermeable ? '' : 'pointer-events-auto'}
                                        style={createPositionedStyle(
                                            v2p(obj.x),
                                            v2p(obj.y),
                                            v2p(resizingId === obj.id && liveResizeSizeRef.current ? liveResizeSizeRef.current.width : board.width),
                                            v2p(resizingId === obj.id && liveResizeSizeRef.current ? liveResizeSizeRef.current.height : board.height),
                                            globalZIndex,
                                            objLayer,
                                            { pointerEvents: isPermeable ? 'none' : 'auto' }
                                        )}
                                    >
                                    <BoardWithResizeMemo
                                        token={board}
                                        obj={obj}
                                        isOwner={isOwner}
                                        isResizing={isResizing}
                                        canResize={canResize}
                                        zoom={layerZoomScale}
                                        onContextMenu={(e) => handleContextMenu(e, obj)}
                                        onMouseDown={(e) => handleMouseDown(e, obj.id)}
                                        onResizeStart={(e) => isOwner && handleResizeStart(e, obj.id)}
                                        onResizeHandleEnter={() => setIsOverResizeHandle(true)}
                                        onResizeHandleLeave={() => setIsOverResizeHandle(false)}
                                        gridSize={gridSize}
                                        gridWidth={gridW_px}
                                        gridHeight={gridH_px}
                                        showGrid={board.showGrid}
                                        currentTool={currentTool}
                                        livePreviewSize={resizingId === obj.id ? liveResizeSizeRef.current : null}
                                    />
                                    </div>
                                );
                            })()}
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.NEXUS_BOARD) {
                    const nexusBoard = obj as NexusBoard;
                    const isDragging = draggingId === obj.id;
                    const showAddUI = nexusBoardAddingCell === obj.id;

                    // Find main cell to position the board correctly
                    const mainCellId = nexusBoard.cells[0]?.id;
                    const mainCell = mainCellId ? (state.objects[mainCellId] as NexusCellObject) : null;

                    // Use main cell's position and size for proper centering of green + buttons
                    const boardX = mainCell?.x ?? obj.x;
                    const boardY = mainCell?.y ?? obj.y;
                    const boardWidth = mainCell?.width ?? nexusBoard.cellWidth ?? 100;
                    const boardHeight = mainCell?.height ?? nexusBoard.cellHeight ?? 150;

                    return (
                        <Tooltip
                            key={obj.id}
                            text={obj.tooltipText}
                            showImage={obj.showTooltipImage}
                            imageSrc={obj.content}
                            scale={obj.tooltipScale}
                        >
                            <div
                                className="absolute"
                                style={createPositionedStyle(
                                    v2p(boardX),
                                    v2p(boardY),
                                    v2p(boardWidth),
                                    v2p(boardHeight),
                                    globalZIndex,
                                    obj.hyperscaleLayerId || 'none',
                                    {
                                        transform: `rotate(${obj.rotation || 0}deg)${getLayerInverseScale(obj.hyperscaleLayerId || 'none') !== 1 ? ` scale(${getLayerInverseScale(obj.hyperscaleLayerId || 'none')})` : ''}`,
                                        transformOrigin: 'center center',
                                    }
                                )}
                            >
                                <NexusBoardMemo
                                    board={nexusBoard}
                                    isOwner={isOwner}
                                    isDragging={isDragging}
                                    onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                                    onContextMenu={(e) => handleContextMenu(e, obj)}
                                    onAddCell={(direction) => handleAddNexusCell(obj.id, direction)}
                                    showAddUI={showAddUI}
                                    mainCellWidth={mainCell?.width}
                                    mainCellHeight={mainCell?.height}
                                    pixelsPerVU={pixelsPerVU}
                                />
                            </div>
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.TOKEN) {
                    const token = obj as TokenType;
                    const showGrid = token.gridType && token.gridType !== GridType.NONE;
                    const gridSize = v2p(token.gridSize || 50); // Convert vu to pixels

                    // Check if object's layer is selected - if not, make it permeable to clicks
                    const objLayer = obj.hyperscaleLayerId || 'none';
                    const hasSelectedLayers = state.selectedHyperscaleLayerIds.length > 0;
                    const isLayerSelected = objLayer === 'none' || state.selectedHyperscaleLayerIds.includes(objLayer);
                    const isPermeable = hasSelectedLayers && !isLayerSelected;

                    // Flexible hexagon grid
                    // Height is calculated from width for proper hex proportions
                    // For HEX (pointy-top): default width=100, height=115
                    // For HEX_HORIZONTAL (flat-top): default width=115, height=100
                    const isHexHorizontal = token.gridType === GridType.HEX_HORIZONTAL;
                    const tokenGridWidth = (obj as any).gridWidth ?? (isHexHorizontal ? 115 : 100);

                    const hexGrid = isHexHorizontal
                        ? calculateHorizontalHexGrid(tokenGridWidth)
                        : calculateFlexibleHexGrid(tokenGridWidth);
                    const patternW = hexGrid.patternWidth;
                    const patternH = hexGrid.patternHeight;
                    const hexPath = hexGrid.path;

                    return (
                        <Tooltip
                            key={obj.id}
                            text={obj.tooltipText}
                            showImage={obj.showTooltipImage}
                            imageSrc={obj.content}
                            scale={obj.tooltipScale}
                        >
                            <div
                                onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                className={`absolute flex items-center justify-center text-white font-bold select-none group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
                                style={createPositionedStyle(
                                    v2p(obj.x),
                                    v2p(obj.y),
                                    v2p(obj.width),
                                    v2p(obj.height),
                                    globalZIndex,
                                    objLayer,
                                    {
                                        transform: `rotate(${obj.rotation}deg)${getLayerInverseScale(objLayer) !== 1 ? ` scale(${getLayerInverseScale(objLayer)})` : ''}`,
                                        pointerEvents: isPermeable ? 'none' : 'auto',
                                    }
                                )}
                            >
                                {/* Render SVG token for all tokens */}
                                <SvgTokenShape
                                    shape={token.shape}
                                    width={v2p(obj.width)}
                                    height={v2p(obj.height)}
                                    color={obj.color || '#e74c3c'}
                                    content={obj.content}
                                    rotation={0}
                                    borderWidth={obj.borderWidth ?? 2}
                                    borderColor={(obj as any).borderColor || 'white'}
                                    opacity={obj.opacity ?? 100}
                                    borderOpacity={obj.borderOpacity ?? 100}
                                    showThickness={true}
                                    tokenName={(obj as any).showNameOnToken || (obj as any).showName || ((obj as any).archetypeId && (state.objects[(obj as any).archetypeId] as any)?.showName) ? obj.name : undefined}
                                    fontColor={(obj as any).fontColor || 'white'}
                                />

                            {(obj as any).isPinnedToViewport && <PinnedIndicator />}
                            {showGrid && (
                                <svg className="absolute inset-0 pointer-events-none opacity-50" width="100%" height="100%">
                                    <defs>
                                        {token.gridType === GridType.SQUARE && (
                                            <pattern id={`grid-square-${obj.id}`} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                                                <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="black" strokeWidth="1"/>
                                            </pattern>
                                        )}
                                        {(token.gridType === GridType.HEX || token.gridType === GridType.HEX_HORIZONTAL) && (
                                            <pattern id={`grid-hex-${obj.id}`} width={patternW} height={patternH} patternUnits="userSpaceOnUse">
                                                <path d={hexPath} fill="none" stroke="black" strokeWidth="1"/>
                                            </pattern>
                                        )}
                                    </defs>
                                    <rect width="100%" height="100%" fill={`url(#grid-${token.gridType === GridType.SQUARE ? 'square' : 'hex'}-${obj.id})`} />
                                </svg>
                            )}

                            {/* No letter display needed - SvgTokenShape handles all token rendering */}

                            {/* Action buttons */}
                            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : currentTool === 'zoom' ? 'opacity-100 pointer-events-auto' : currentTool === 'none' ? 'opacity-0 group-hover:opacity-100 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
                                {(() => {
                                    const actionButtons = obj.actionButtons || [];
                                    const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
                                        flip: {
                                            key: 'flip',
                                            action: () => dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id }}),
                                            className: 'bg-purple-600 hover:bg-purple-500',
                                            title: 'Flip',
                                            icon: <RefreshCw size={14} />
                                        },
                                        rotate: {
                                            key: 'rotate',
                                            action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
                                            className: 'bg-green-600 hover:bg-green-500',
                                            title: 'Rotate',
                                            icon: <RefreshCw size={14} />
                                        },
                                        delete: {
                                            key: 'delete',
                                            action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
                                            className: 'bg-red-600 hover:bg-red-500',
                                            title: 'Delete',
                                            icon: <Trash2 size={14} />
                                        },
                                        clone: {
                                            key: 'clone',
                                            action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
                                            className: 'bg-cyan-600 hover:bg-cyan-500',
                                            title: 'Clone',
                                            icon: <Copy size={14} />
                                        },
                                        lock: {
                                            key: 'lock',
                                            action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id }}),
                                            className: 'bg-yellow-600 hover:bg-yellow-500',
                                            title: obj.locked ? 'Unlock' : 'Lock',
                                            icon: obj.locked ? <Lock size={14} /> : <Lock size={14} />
                                        },
                                        layer: {
                                            key: 'layer',
                                            action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id }}),
                                            className: 'bg-indigo-600 hover:bg-indigo-500',
                                            title: 'Layer Up',
                                            icon: <Layers size={14} />
                                        },
                                    };

                                    const buttons = actionButtons
                                        .map(action => buttonConfigs[action])
                                        .filter(Boolean)
                                        .slice(0, 4);

                                    return buttons.map(btn => (
                                        <button
                                            key={btn.key}
                                            onClick={(e) => { e.stopPropagation(); btn.action(); }}
                                            className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
                                            title={btn.title}
                                        >
                                            {btn.icon}
                                        </button>
                                    ));
                                })()}
                            </div>
                        </div>
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.BATTLEFIELD_CELL) {
                    const cell = obj as BattlefieldCell;
                    // Use magnetPoints array length to determine actual magnet point count
                    const actualMagnetPointCount = (cell.magnetPoints?.length ?? 0) || (cell.magnetPointCount ?? 1);
                    const magnetPointCount = Math.max(1, actualMagnetPointCount);
                    const magnetRotation = cell.magnetRotation ?? 0;

                    // Check if object's layer is selected - if not, make it permeable to clicks
                    const objLayer = obj.hyperscaleLayerId || 'none';
                    const hasSelectedLayers = state.selectedHyperscaleLayerIds.length > 0;
                    const isLayerSelected = objLayer === 'none' || state.selectedHyperscaleLayerIds.includes(objLayer);
                    const isPermeable = hasSelectedLayers && !isLayerSelected;

                    return (
                        <Tooltip
                            key={obj.id}
                            text={obj.tooltipText}
                            showImage={obj.showTooltipImage}
                            imageSrc={obj.content}
                            scale={obj.tooltipScale}
                        >
                            <div
                                onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                className={`absolute flex items-center justify-center select-none group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
                                style={createPositionedStyle(
                                    v2p(obj.x),
                                    v2p(obj.y),
                                    v2p(obj.width),
                                    v2p(obj.height),
                                    globalZIndex,
                                    objLayer,
                                    {
                                        transform: `rotate(${obj.rotation}deg)${getLayerInverseScale(objLayer) !== 1 ? ` scale(${getLayerInverseScale(objLayer)})` : ''}`,
                                        pointerEvents: isPermeable ? 'none' : 'auto',
                                    }
                                )}
                            >
                                <SvgTokenShape
                                    shape={cell.shape}
                                    width={v2p(obj.width)}
                                    height={v2p(obj.height)}
                                    color={obj.color || '#4ade80'}
                                    borderWidth={obj.borderWidth ?? 2}
                                    borderColor={obj.borderColor || '#166534'}
                                    opacity={obj.opacity ?? 100}
                                    borderOpacity={obj.borderOpacity ?? 100}
                                    rotation={0}
                                    showThickness={false}
                                />

                                {/* Magnetism System Visualization - hidden */}
                                <svg
                                    className="absolute pointer-events-none hidden"
                                    width="100%"
                                    height="100%"
                                    viewBox={`0 0 ${obj.width} ${obj.height}`}
                                    preserveAspectRatio="none"
                                    style={{ overflow: 'visible' }}
                                >
                                    <g transform={`translate(${obj.width / 2}, ${obj.height / 2})`}>
                                        {/* Calculate ellipse radii - simple version (inscribed in bounding box) */}
                                        {(() => {
                                            // For all shapes, use the same simple approach: ellipse in bounding box
                                            const ellipseRx = obj.width / 2 - 2;
                                            const ellipseRy = obj.height / 2 - 2;

                                            // Helper to calculate line length to ellipse at given angle
                                            const calcLineLength = (angleRad: number) => {
                                                const cosA = Math.cos(angleRad);
                                                const sinA = Math.sin(angleRad);
                                                return 1 / Math.sqrt((cosA / ellipseRx) ** 2 + (sinA / ellipseRy) ** 2);
                                            };

                                            // Create a set of occupied point indices
                                            const occupiedPointIndices = new Set(
                                                (cell.magnetPoints ?? []).map(p => p.pointIndex)
                                            );

                                            return (
                                                <>
                                                    {/* Inscribed ellipse (green) - magnetism boundary */}
                                                    <ellipse
                                                        cx={0}
                                                        cy={0}
                                                        rx={ellipseRx}
                                                        ry={ellipseRy}
                                                        fill="none"
                                                        stroke="#22c55e"
                                                        strokeWidth={1.5}
                                                        opacity={0.7}
                                                    />

                                                    {/* Magnet lines (from center to inscribed ellipse) */}
                                                    {/* Only show lines for points that have objects snapped OR if snapToGrid is enabled */}
                                                    {(cell.snapToGrid || (cell.magnetPoints && cell.magnetPoints.length > 0)) && magnetPointCount > 1 && Array.from({ length: magnetPointCount }).map((_, index) => {
                                                        const anglePerSlice = 360 / magnetPointCount;
                                                        const angle = (index * anglePerSlice + magnetRotation) * Math.PI / 180;
                                                        const lineLength = calcLineLength(angle);
                                                        const endX = Math.cos(angle) * lineLength;
                                                        const endY = Math.sin(angle) * lineLength;
                                                        const hasObject = occupiedPointIndices.has(index);

                                                        return (
                                                            <line
                                                                key={`magnet-line-${index}`}
                                                                x1={0}
                                                                y1={0}
                                                                x2={endX}
                                                                y2={endY}
                                                                stroke={hasObject ? "#22c55e" : "#f59e0b"}
                                                                strokeWidth={hasObject ? 1.5 : 1}
                                                                opacity={hasObject ? 0.8 : 0.4}
                                                            />
                                                        );
                                                    })}

                                                    {/* Magnet points - different style for occupied vs empty points */}
                                                    {magnetPointCount > 1 && Array.from({ length: magnetPointCount }).map((_, index) => {
                                                        const anglePerSlice = 360 / magnetPointCount;
                                                        const angle = (index * anglePerSlice + magnetRotation) * Math.PI / 180;
                                                        const lineLength = calcLineLength(angle);
                                                        const magnetRadius = lineLength * 0.55;
                                                        const magnetX = Math.cos(angle) * magnetRadius;
                                                        const magnetY = Math.sin(angle) * magnetRadius;
                                                        const hasObject = occupiedPointIndices.has(index);

                                                        return (
                                                            <circle
                                                                key={`magnet-point-${index}`}
                                                                cx={magnetX}
                                                                cy={magnetY}
                                                                r={hasObject ? 2.5 : 2}
                                                                fill={hasObject ? "#22c55e" : "#ef4444"}
                                                                opacity={hasObject ? 1 : 0.7}
                                                            />
                                                        );
                                                    })}

                                                    {/* Center point (yellow dot) - shown when single point or no objects */}
                                                    {magnetPointCount === 1 && (
                                                        <circle
                                                            cx={0}
                                                            cy={0}
                                                            r={3}
                                                            fill="#fbbf24"
                                                        />
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </g>
                                </svg>

                                {(obj as any).isPinnedToViewport && (
                                    <div
                                        className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
                                        title="Pinned to screen"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                            <line x1="12" y1="17" x2="12" y2="22"></line>
                                            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                        </svg>
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : currentTool === 'zoom' ? 'opacity-100 pointer-events-auto' : currentTool === 'none' ? 'opacity-0 group-hover:opacity-100 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
                                    {(() => {
                                        const actionButtons = obj.actionButtons || [];
                                        const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
                                            roll: {
                                                key: 'roll',
                                                action: () => executeClickAction(obj, 'roll'),
                                                className: 'bg-purple-600 hover:bg-purple-500',
                                                title: 'Roll',
                                                icon: <RefreshCw size={14} />
                                            },
                                            rotate: {
                                                key: 'rotate',
                                                action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
                                                className: 'bg-green-600 hover:bg-green-500',
                                                title: 'Rotate',
                                                icon: <RefreshCw size={14} />
                                            },
                                            delete: {
                                                key: 'delete',
                                                action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
                                                className: 'bg-red-600 hover:bg-red-500',
                                                title: 'Delete',
                                                icon: <Trash2 size={14} />
                                            },
                                            clone: {
                                                key: 'clone',
                                                action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
                                                className: 'bg-cyan-600 hover:bg-cyan-500',
                                                title: 'Clone',
                                                icon: <Copy size={14} />
                                            },
                                            layerUp: {
                                                key: 'layerUp',
                                                action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
                                                className: 'bg-blue-600 hover:bg-blue-500',
                                                title: 'Layer Up',
                                                icon: <ChevronsUpDown size={14} />
                                            },
                                            layerDown: {
                                                key: 'layerDown',
                                                action: () => dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } }),
                                                className: 'bg-blue-600 hover:bg-blue-500',
                                                title: 'Layer Down',
                                                icon: <ChevronsUpDown size={14} />
                                            },
                                            lock: {
                                                key: 'lock',
                                                action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } }),
                                                className: obj.locked ? 'bg-yellow-500 hover:bg-yellow-400' : 'bg-yellow-600 hover:bg-yellow-500',
                                                title: obj.locked ? 'Unlock' : 'Lock',
                                                icon: obj.locked ? <Unlock size={14} /> : <Lock size={14} />
                                            },
                                            pin: {
                                                key: 'pin',
                                                action: () => executeClickAction(obj, 'pin'),
                                                className: 'bg-pink-600 hover:bg-pink-500',
                                                title: (obj as any).isPinnedToViewport ? 'Unpin' : 'Pin',
                                                icon: <Pin size={14} />
                                            },
                                        };

                                        return actionButtons.map((action) => {
                                            const config = buttonConfigs[action];
                                            if (!config) return null;
                                            return (
                                                <button
                                                    key={config.key}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => { e.stopPropagation(); config.action(); }}
                                                    className={`p-1.5 rounded shadow ${config.className} pointer-events-auto`}
                                                    title={config.title}
                                                >
                                                    {config.icon}
                                                </button>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.NEXUS_CELL) {
                    const cell = obj as NexusCellObject;
                    // Use magnetPoints array length to determine actual magnet point count
                    const actualMagnetPointCount = (cell.magnetPoints?.length ?? 0) || (cell.magnetPointCount ?? 1);
                    const magnetPointCount = Math.max(1, actualMagnetPointCount);
                    const magnetRotation = cell.magnetRotation ?? 0;

                    // Check if object's layer is selected - if not, make it permeable to clicks
                    const objLayer = obj.hyperscaleLayerId || 'none';
                    const hasSelectedLayers = state.selectedHyperscaleLayerIds.length > 0;
                    const isLayerSelected = objLayer === 'none' || state.selectedHyperscaleLayerIds.includes(objLayer);
                    const isPermeable = hasSelectedLayers && !isLayerSelected;

                    return (
                        <Tooltip
                            key={obj.id}
                            text={obj.tooltipText}
                            showImage={obj.showTooltipImage}
                            imageSrc={obj.content}
                            scale={obj.tooltipScale}
                        >
                            <div
                                onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                className={`absolute flex items-center justify-center select-none group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
                                style={{
                                    left: v2p(obj.x),
                                    top: v2p(obj.y),
                                    width: v2p(obj.width),
                                    height: v2p(obj.height),
                                    transform: `rotate(${obj.rotation}deg)`,
                                    zIndex: globalZIndex,
                                    pointerEvents: isPermeable ? 'none' : 'auto',
                                }}
                            >
                                <SvgTokenShape
                                    shape={cell.shape}
                                    width={v2p(obj.width)}
                                    height={v2p(obj.height)}
                                    color={obj.color || '#4ade80'}
                                    borderWidth={obj.borderWidth ?? 2}
                                    borderColor={obj.borderColor || '#166534'}
                                    opacity={obj.opacity ?? 100}
                                    borderOpacity={obj.borderOpacity ?? 100}
                                    rotation={0}
                                    showThickness={false}
                                />

                                {/* Magnetism System Visualization - hidden */}
                                <svg
                                    className="absolute pointer-events-none hidden"
                                    width="100%"
                                    height="100%"
                                    viewBox={`0 0 ${obj.width} ${obj.height}`}
                                    preserveAspectRatio="none"
                                    style={{ overflow: 'visible' }}
                                >
                                    <g transform={`translate(${obj.width / 2}, ${obj.height / 2})`}>
                                        {/* Calculate ellipse radii - simple version (inscribed in bounding box) */}
                                        {(() => {
                                            // For all shapes, use the same simple approach: ellipse in bounding box
                                            const ellipseRx = obj.width / 2 - 2;
                                            const ellipseRy = obj.height / 2 - 2;

                                            // Helper to calculate line length to ellipse at given angle
                                            const calcLineLength = (angleRad: number) => {
                                                const cosA = Math.cos(angleRad);
                                                const sinA = Math.sin(angleRad);
                                                return 1 / Math.sqrt((cosA / ellipseRx) ** 2 + (sinA / ellipseRy) ** 2);
                                            };

                                            // Create a set of occupied point indices
                                            const occupiedPointIndices = new Set(
                                                (cell.magnetPoints ?? []).map(p => p.pointIndex)
                                            );

                                            return (
                                                <>
                                                    {/* Inscribed ellipse (green) - magnetism boundary */}
                                                    <ellipse
                                                        cx={0}
                                                        cy={0}
                                                        rx={ellipseRx}
                                                        ry={ellipseRy}
                                                        fill="none"
                                                        stroke="#22c55e"
                                                        strokeWidth={1.5}
                                                        opacity={0.7}
                                                    />

                                                    {/* Magnet lines (from center to inscribed ellipse) */}
                                                    {/* Only show lines for points that have objects snapped OR if snapToGrid is enabled */}
                                                    {(cell.snapToGrid || (cell.magnetPoints && cell.magnetPoints.length > 0)) && magnetPointCount > 1 && Array.from({ length: magnetPointCount }).map((_, index) => {
                                                        const anglePerSlice = 360 / magnetPointCount;
                                                        const angle = (index * anglePerSlice + magnetRotation) * Math.PI / 180;
                                                        const lineLength = calcLineLength(angle);
                                                        const endX = Math.cos(angle) * lineLength;
                                                        const endY = Math.sin(angle) * lineLength;
                                                        const hasObject = occupiedPointIndices.has(index);

                                                        return (
                                                            <line
                                                                key={`magnet-line-${index}`}
                                                                x1={0}
                                                                y1={0}
                                                                x2={endX}
                                                                y2={endY}
                                                                stroke={hasObject ? "#22c55e" : "#f59e0b"}
                                                                strokeWidth={hasObject ? 1.5 : 1}
                                                                opacity={hasObject ? 0.8 : 0.4}
                                                            />
                                                        );
                                                    })}

                                                    {/* Magnet points - different style for occupied vs empty points */}
                                                    {magnetPointCount > 1 && Array.from({ length: magnetPointCount }).map((_, index) => {
                                                        const anglePerSlice = 360 / magnetPointCount;
                                                        const angle = (index * anglePerSlice + magnetRotation) * Math.PI / 180;
                                                        const lineLength = calcLineLength(angle);
                                                        const magnetRadius = lineLength * 0.55;
                                                        const magnetX = Math.cos(angle) * magnetRadius;
                                                        const magnetY = Math.sin(angle) * magnetRadius;
                                                        const hasObject = occupiedPointIndices.has(index);

                                                        return (
                                                            <circle
                                                                key={`magnet-point-${index}`}
                                                                cx={magnetX}
                                                                cy={magnetY}
                                                                r={hasObject ? 2.5 : 2}
                                                                fill={hasObject ? "#22c55e" : "#ef4444"}
                                                                opacity={hasObject ? 1 : 0.7}
                                                            />
                                                        );
                                                    })}

                                                    {/* Center point (yellow dot) - shown when single point or no objects */}
                                                    {magnetPointCount === 1 && (
                                                        <circle
                                                            cx={0}
                                                            cy={0}
                                                            r={3}
                                                            fill="#fbbf24"
                                                        />
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </g>
                                </svg>

                                {/* Action buttons */}
                                <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : currentTool === 'zoom' ? 'opacity-100 pointer-events-auto' : currentTool === 'none' ? 'opacity-0 group-hover:opacity-100 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
                                    {(() => {
                                        const actionButtons = obj.actionButtons || [];
                                        const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
                                            roll: {
                                                key: 'roll',
                                                action: () => executeClickAction(obj, 'roll'),
                                                className: 'bg-purple-600 hover:bg-purple-500',
                                                title: 'Roll',
                                                icon: <RefreshCw size={14} />
                                            },
                                            rotate: {
                                                key: 'rotate',
                                                action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
                                                className: 'bg-green-600 hover:bg-green-500',
                                                title: 'Rotate',
                                                icon: <RefreshCw size={14} />
                                            },
                                            delete: {
                                                key: 'delete',
                                                action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
                                                className: 'bg-red-600 hover:bg-red-500',
                                                title: 'Delete',
                                                icon: <Trash2 size={14} />
                                            },
                                            clone: {
                                                key: 'clone',
                                                action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
                                                className: 'bg-cyan-600 hover:bg-cyan-500',
                                                title: 'Clone',
                                                icon: <Copy size={14} />
                                            },
                                            layerUp: {
                                                key: 'layerUp',
                                                action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } }),
                                                className: 'bg-blue-600 hover:bg-blue-500',
                                                title: 'Layer Up',
                                                icon: <ChevronsUpDown size={14} />
                                            },
                                            layerDown: {
                                                key: 'layerDown',
                                                action: () => dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } }),
                                                className: 'bg-blue-700 hover:bg-blue-600',
                                                title: 'Layer Down',
                                                icon: <ChevronsUpDown size={14} />
                                            },
                                        };
                                        return actionButtons.map(action => buttonConfigs[action]).filter(Boolean).map(config => (
                                            <button
                                                key={config.key}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={config.action}
                                                className={`${config.className} text-white rounded p-1 shadow-lg hover:scale-110 transition-transform pointer-events-auto`}
                                                title={config.title}
                                            >
                                                {config.icon}
                                            </button>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.COUNTER) {
                    // Skip pinned counters - they are rendered separately in fixed container
                    if ((obj as any).isPinnedToViewport === true) {
                        return null;
                    }
                    const counter = obj as Counter;

                    // Check if object's layer is selected - if not, make it permeable to clicks
                    const objLayer = obj.hyperscaleLayerId || 'none';
                    const hasSelectedLayers = state.selectedHyperscaleLayerIds.length > 0;
                    const isLayerSelected = objLayer === 'none' || state.selectedHyperscaleLayerIds.includes(objLayer);
                    const isPermeable = hasSelectedLayers && !isLayerSelected;

                    return (
                        <Tooltip
                            key={obj.id}
                            text={obj.tooltipText}
                            showImage={obj.showTooltipImage}
                            imageSrc={obj.content}
                            scale={obj.tooltipScale}
                        >
                            <div
                                onMouseDown={(e) => handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                className={`absolute bg-slate-900 border-2 border-slate-600 rounded-lg shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
                                style={{
                                    left: v2p(obj.x),
                                    top: v2p(obj.y),
                                    width: v2p(Math.max(obj.width, 100)),
                                    height: v2p(50),
                                    transform: `rotate(${obj.rotation}deg)`,
                                    zIndex: globalZIndex,
                                    pointerEvents: isPermeable ? 'none' : 'auto',
                                }}
                            >
                            {(obj as any).isPinnedToViewport && <PinnedIndicator />}
                            <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: -1 }})}><Minus size={14}/></button>
                            <span className="text-xl font-bold">{counter.value}</span>
                            <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: 1 }})}><Plus size={14}/></button>
                            {/* Name on top - shown when showNameOnToken is enabled, 75% width */}
                            {(obj as any).showNameOnToken && (
                              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-center text-[12px] truncate px-1" style={{ color: (obj as any).fontColor || '#ffffff', width: '75%' }}>
                                {obj.name}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : currentTool === 'zoom' ? 'opacity-100 pointer-events-auto' : currentTool === 'none' ? 'opacity-0 group-hover:opacity-100 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
                                {(() => {
                                    const actionButtons = obj.actionButtons || [];
                                    const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
                                        delete: {
                                            key: 'delete',
                                            action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
                                            className: 'bg-red-600 hover:bg-red-500',
                                            title: 'Delete',
                                            icon: <Trash2 size={14} />
                                        },
                                        clone: {
                                            key: 'clone',
                                            action: () => dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } }),
                                            className: 'bg-cyan-600 hover:bg-cyan-500',
                                            title: 'Clone',
                                            icon: <Copy size={14} />
                                        },
                                        rotate: {
                                            key: 'rotate',
                                            action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
                                            className: 'bg-green-600 hover:bg-green-500',
                                            title: 'Rotate',
                                            icon: <RefreshCw size={14} />
                                        },
                                        lock: {
                                            key: 'lock',
                                            action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id }}),
                                            className: 'bg-yellow-600 hover:bg-yellow-500',
                                            title: obj.locked ? 'Unlock' : 'Lock',
                                            icon: obj.locked ? <Lock size={14} /> : <Lock size={14} />
                                        },
                                        layer: {
                                            key: 'layer',
                                            action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id }}),
                                            className: 'bg-indigo-600 hover:bg-indigo-500',
                                            title: 'Layer Up',
                                            icon: <Layers size={14} />
                                        },
                                    };

                                    const buttons = actionButtons
                                        .map(action => buttonConfigs[action])
                                        .filter(Boolean)
                                        .slice(0, 4);

                                    return buttons.map(btn => (
                                        <button
                                            key={btn.key}
                                            onClick={(e) => { e.stopPropagation(); btn.action(); }}
                                            className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
                                            title={btn.title}
                                        >
                                            {btn.icon}
                                        </button>
                                    ));
                                })()}
                            </div>
                        </div>
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.DICE_OBJECT) {
                    // Skip pinned dice - they are rendered separately in fixed container
                    if ((obj as any).isPinnedToViewport === true) {
                        return null;
                    }
                    const dice = obj as DiceObject;
                    const diceShape = dice.shape || TokenShape.SQUARE;

                    // Check if object's layer is selected - if not, make it permeable to clicks
                    const objLayer = obj.hyperscaleLayerId || 'none';
                    const hasSelectedLayers = state.selectedHyperscaleLayerIds.length > 0;
                    const isLayerSelected = objLayer === 'none' || state.selectedHyperscaleLayerIds.includes(objLayer);
                    const isPermeable = hasSelectedLayers && !isLayerSelected;

                    return (
                        <Tooltip
                            key={obj.id}
                            text={obj.tooltipText}
                            showImage={obj.showTooltipImage}
                            imageSrc={obj.content}
                            scale={obj.tooltipScale}
                        >
                            <div
                                onMouseDown={(e) => handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                onDoubleClick={(e) => { e.stopPropagation(); if (currentTool !== 'marker' && currentTool !== 'eraser') rollDiceWithGroup(dice); }}
                                className={`absolute flex items-center justify-center group select-none ${draggingClass}`}
                                style={{
                                    left: v2p(obj.x),
                                    top: v2p(obj.y),
                                    width: v2p(dice.width || 60),
                                    height: v2p(dice.height || 60),
                                    transform: `rotate(${obj.rotation}deg)`,
                                    pointerEvents: isPermeable ? 'none' : 'auto',
                                    zIndex: globalZIndex,
                                }}
                            >
                                <SvgTokenShape
                                    shape={diceShape}
                                    width={v2p(dice.width || 60)}
                                    height={v2p(dice.height || 60)}
                                    color={obj.color || '#6366f1'}
                                    content={''}
                                    borderColor={(obj as any).borderColor || '#4f46e5'}
                                    borderWidth={(obj as any).borderWidth ?? 3}
                                    opacity={obj.opacity ?? 100}
                                    borderOpacity={(obj as any).borderOpacity ?? 100}
                                />
                                {/* Dice value - always centered */}
                                <div
                                    className="absolute flex items-center justify-center pointer-events-none"
                                    style={{
                                        top: diceShape === TokenShape.TRIANGLE ? '56%' : '45%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                >
                                    <span
                                        className="font-bold text-white drop-shadow-md"
                                        style={{
                                            fontSize: `${Math.min(24 * (1 + ((dice.height || 60) / 60 - 1) * (2/3)), (dice.width || 60) * 0.7)}px`
                                        }}
                                    >{rollingDice[dice.id] ?? dice.currentValue}</span>
                                </div>
                                {/* Dice sides indicator - midpoint between value center and bottom */}
                                <div
                                    className="absolute flex items-center justify-center pointer-events-none"
                                    style={{
                                        top: diceShape === TokenShape.TRIANGLE ? '78%' : '72.5%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                >
                                    <span
                                        className="opacity-75 text-white drop-shadow-md"
                                        style={{
                                            fontSize: `${Math.min(9 * (1 + ((dice.height || 60) / 60 - 1) * (2/3)), (dice.width || 60) * 0.25)}px`
                                        }}
                                    >d{dice.sides}</span>
                                </div>
                                {(obj as any).isPinnedToViewport && (
                                    <div
                                        className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
                                        title="Pinned to screen"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                            <line x1="12" y1="17" x2="12" y2="22"></line>
                                            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                        </svg>
                                    </div>
                                )}

                            {/* Action buttons */}
                            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 transition-opacity z-20 ${isCtrlPressed ? 'opacity-0 pointer-events-none' : currentTool === 'zoom' ? 'opacity-100 pointer-events-auto' : currentTool === 'none' ? 'opacity-0 group-hover:opacity-100 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
                                {(() => {
                                    const actionButtons = obj.actionButtons || [];
                                    const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
                                        rotate: {
                                            key: 'rotate',
                                            action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } }),
                                            className: 'bg-green-600 hover:bg-green-500',
                                            title: 'Rotate',
                                            icon: <RefreshCw size={14} />
                                        },
                                        delete: {
                                            key: 'delete',
                                            action: () => dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } }),
                                            className: 'bg-red-600 hover:bg-red-500',
                                            title: 'Delete',
                                            icon: <Trash2 size={14} />
                                        },
                                        lock: {
                                            key: 'lock',
                                            action: () => dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id }}),
                                            className: 'bg-yellow-600 hover:bg-yellow-500',
                                            title: obj.locked ? 'Unlock' : 'Lock',
                                            icon: obj.locked ? <Lock size={14} /> : <Lock size={14} />
                                        },
                                        layer: {
                                            key: 'layer',
                                            action: () => dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id }}),
                                            className: 'bg-indigo-600 hover:bg-indigo-500',
                                            title: 'Layer Up',
                                            icon: <Layers size={14} />
                                        },
                                    };

                                    const buttons = actionButtons
                                        .map(action => buttonConfigs[action])
                                        .filter(Boolean)
                                        .slice(0, 4);

                                    return buttons.map(btn => (
                                        <button
                                            key={btn.key}
                                            onClick={(e) => { e.stopPropagation(); btn.action(); }}
                                            className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
                                            title={btn.title}
                                        >
                                            {btn.icon}
                                        </button>
                                    ));
                                })()}
                            </div>
                        </div>
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.DECK) {
                    // DECKs are now rendered separately via pinnedDecks and unpinnedDecks
                    return null;
                }

                if (obj.type === ItemType.CARD) {
                    const card = obj as CardType;
                    const cardSettings = getCardSettings(card);
                    // Card dimensions now reflect the orientation (no swap needed)
                    const displayWidth = card.width ?? cardSettings.cardWidth ?? 100;
                    const displayHeight = card.height ?? cardSettings.cardHeight ?? 140;

                    const isDragging = draggingId === obj.id;
                    const isCardHidden = (card as any).hidden === true;

                    // Check if object's layer is selected - if not, make it permeable to clicks
                    const objLayer = obj.hyperscaleLayerId || 'none';
                    const hasSelectedLayers = state.selectedHyperscaleLayerIds.length > 0;
                    const isLayerSelected = objLayer === 'none' || state.selectedHyperscaleLayerIds.includes(objLayer);
                    // Objects in non-selected layers are permeable (let clicks pass through)
                    const isPermeable = hasSelectedLayers && !isLayerSelected;

                    // Get inverse scale if zoom is disabled for this layer
                    const inverseScale = getLayerInverseScale(objLayer);

                    return (
                        <div
                            key={obj.id}
                            data-tabletop-card="true"
                            style={createPositionedStyle(
                                v2p(obj.x),
                                v2p(obj.y),
                                v2p(displayWidth),
                                v2p(displayHeight),
                                globalZIndex,
                                objLayer,
                                {
                                    transform: `rotate(${obj.rotation}deg)${inverseScale !== 1 ? ` scale(${inverseScale})` : ''}`,
                                    opacity: isCardHidden && isGM ? 0.5 : 1,
                                    pointerEvents: isDragging || isPermeable ? 'none' : 'auto',
                                }
                            )}
                            onMouseDown={(e) => handleMouseDown(e, obj.id)}
                            onContextMenu={(e) => handleContextMenu(e, obj)}
                            className={`rounded-lg ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
                        >
                            {(obj as any).isPinnedToViewport && <PinnedIndicator />}
                            <div>
                              <Card
                                  card={card}
                                  canFlip={cardSettings.actionButtons?.includes('flip') ?? false}
                                  onFlip={() => dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id }})}
                                  showActionButtons={currentTool === 'none'}
                                  actionButtons={cardSettings.actionButtons}
                                  overrideWidth={v2p(displayWidth)}
                                  overrideHeight={v2p(displayHeight)}
                                  cardNamePosition={cardSettings.cardNamePosition}
                                  cardOrientation={cardSettings.cardOrientation}
                                  disableRotationTransform={true}
                                  deckSpriteConfig={card.deckId ? (state.objects[card.deckId] as DeckType)?.spriteConfig : undefined}
                                  deckShowTooltipImage={card.deckId ? (state.objects[card.deckId] as DeckType)?.showTooltipImage : undefined}
                                  deckTooltipScale={card.deckId ? (state.objects[card.deckId] as DeckType)?.tooltipScale : undefined}
                                  onActionButtonClick={(action) => {
                                    const context: ActionButtonsHandlerContext = {
                                      dispatch,
                                      activePlayerId: state.activePlayerId,
                                      objects: state.objects
                                    };
                                    executeActionButtonUniversal(obj, action, context);
                                  }}
                                language={state.language}
                            />
                            </div>
                        </div>
                    )
                }
                return null;
            })}

            {/* Unpinned Decks - rendered in the transform container with other game objects */}
            {unpinnedDecks.map((deck) => {
                const deckObj = deck as DeckType;
                const canDrag = !deckObj.locked;
                const draggingClass = draggingId === deckObj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

                // Calculate global z-index for decks (cards layer: 1001-3000)
                // When dragging, use very high z-index to appear above everything else
                const layer = state.hyperscaleLayers.find(l => l.id === (deckObj.hyperscaleLayerId || 'cards'));
                const layerMinZ = layer?.minZIndex ?? 1001;
                const isDraggingDeck = draggingId === deckObj.id;
                const globalZIndex = isDraggingDeck ? 999999 : layerMinZ + (deckObj.zIndex ?? 0);
                const objLayerId = deckObj.hyperscaleLayerId || 'cards';

                return (
                    <div
                        key={deckObj.id}
                        style={createPositionedStyle(
                            v2p(deckObj.x),
                            v2p(deckObj.y),
                            0,
                            0,
                            globalZIndex,
                            objLayerId
                        )}
                    >
                        <DeckComponent
                            deck={deckObj}
                            draggingId={draggingId}
                            hoveredDeckId={hoveredDeckId}
                            hoveredPileId={hoveredPileId}
                            setHoveredDeckId={setHoveredDeckId}
                            setHoveredPileId={setHoveredPileId}
                            isGM={isGM}
                            draggingClass={draggingClass}
                            draggingPile={draggingPile}
                            setDraggingPile={setDraggingPile}
                            pileDragStartRef={pileDragStartRef}
                            setTopDeckModalDeck={setTopDeckModalDeck}
                            handleMouseDown={handleMouseDown}
                            handleContextMenu={handleContextMenu}
                            handlePileContextMenu={handlePileContextMenu}
                            setSearchModalDeck={setSearchModalDeck}
                            setSearchModalPile={setSearchModalPile}
                            setPilesButtonMenu={setPilesButtonMenu}
                            setDeleteCandidateId={setDeleteCandidateId}
                            executeClickAction={executeClickAction}
                            cursorSlotHasCards={cursorSlot.some(item => item.type === ItemType.CARD)}
                            allObjects={state.objects}
                            currentTool={currentTool}
                            pixelsPerVU={pixelsPerVU}
                        />
                    </div>
                );
            })}
        </div>

        {/* Unpinned UI Objects Container - rendered outside transform, always above game objects */}
        <div className="fixed inset-0 pointer-events-none z-[9800]">
            {unpinnedUIObjects.map((uiObj) => (
                <UIObjectRendererMemo
                    key={uiObj.id}
                    uiObject={uiObj as PanelObject | WindowObject}
                    isDragging={draggingId === uiObj.id}
                    onMouseDown={handleMouseDown}
                    offset={offset}
                    isPinnedMode={false}
                />
            ))}
        </div>

        {/* Pinned UI Objects Container - rendered outside transform, not affected by camera/scroll */}
        {/* Panels are always above game objects, even when pinned */}
        <div className="fixed inset-0 pointer-events-none z-[9900]">
            {pinnedUIObjects.map((uiObj) => (
                <UIObjectRendererMemo
                    key={uiObj.id}
                    uiObject={uiObj as PanelObject | WindowObject}
                    isDragging={draggingId === uiObj.id}
                    onMouseDown={handleMouseDown}
                    offset={{ x: 0, y: 0 }}
                    isPinnedMode={true}
                />
            ))}
        </div>

        {/* Pinned Game Objects Container - rendered outside transform, below panels */}
        <div className="fixed inset-0 pointer-events-none z-[500]">
            {/* Pinned Decks - rendered in fixed container using pinnedScreenPosition */}
            {pinnedDecks.map((deck) => {
                const deckObj = deck as DeckType;
                const pinnedPosition = (deckObj as any).pinnedScreenPosition;
                if (!pinnedPosition) return null;

                const canDrag = !deckObj.locked;
                const draggingClass = draggingId === deckObj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

                // Calculate global z-index for decks (cards layer: 1001-3000)
                // When dragging, use very high z-index to appear above everything else
                const layer = state.hyperscaleLayers.find(l => l.id === (deckObj.hyperscaleLayerId || 'cards'));
                const layerMinZ = layer?.minZIndex ?? 1001;
                const isDraggingDeck = draggingId === deckObj.id;
                const globalZIndex = isDraggingDeck ? 999999 : layerMinZ + (deckObj.zIndex ?? 0);

                return (
                    <div
                        key={deckObj.id}
                        className="pointer-events-auto"
                        style={{
                            position: 'fixed',
                            left: pinnedPosition.x,
                            top: pinnedPosition.y,
                            zIndex: globalZIndex,
                        }}
                    >
                        {/* Pinned indicator */}
                        <div
                            className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
                            title="Pinned to screen"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <line x1="12" y1="17" x2="12" y2="22"></line>
                                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                            </svg>
                        </div>
                        <DeckComponent
                            deck={deckObj}
                            draggingId={draggingId}
                            hoveredDeckId={hoveredDeckId}
                            hoveredPileId={hoveredPileId}
                            setHoveredDeckId={setHoveredDeckId}
                            setHoveredPileId={setHoveredPileId}
                            isGM={isGM}
                            draggingClass={draggingClass}
                            draggingPile={draggingPile}
                            setDraggingPile={setDraggingPile}
                            pileDragStartRef={pileDragStartRef}
                            setTopDeckModalDeck={setTopDeckModalDeck}
                            handleMouseDown={handleMouseDown}
                            handleContextMenu={handleContextMenu}
                            handlePileContextMenu={handlePileContextMenu}
                            setSearchModalDeck={setSearchModalDeck}
                            setSearchModalPile={setSearchModalPile}
                            setPilesButtonMenu={setPilesButtonMenu}
                            setDeleteCandidateId={setDeleteCandidateId}
                            executeClickAction={executeClickAction}
                            cursorSlotHasCards={cursorSlot.some(item => item.type === ItemType.CARD)}
                            allObjects={state.objects}
                            currentTool={currentTool}
                            pixelsPerVU={pixelsPerVU}
                        />
                    </div>
                );
            })}


            {/* Pinned Dice and Counters - rendered in fixed container */}
            {Object.values(state.objects).filter(obj =>
              (obj.type === ItemType.DICE_OBJECT || obj.type === ItemType.COUNTER) && (obj as any).isPinnedToViewport === true
            ).map((obj) => {
                const pinnedPosition = (obj as any).pinnedScreenPosition;
                if (!pinnedPosition) return null;

                const isDragging = draggingId === obj.id;
                // Dice always use default cursor since they're not draggable by mouse in main tabletop
                const isDice = obj.type === ItemType.DICE_OBJECT;
                const canDrag = !obj.locked && !isDice;
                const draggingClass = isDragging ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

                // Check if object's layer is selected - if not, make it permeable to clicks
                const objLayer = obj.hyperscaleLayerId || 'none';
                const hasSelectedLayers = state.selectedHyperscaleLayerIds.length > 0;
                const isLayerSelected = objLayer === 'none' || state.selectedHyperscaleLayerIds.includes(objLayer);
                const isPermeable = hasSelectedLayers && !isLayerSelected;

                // Render dice
                if (obj.type === ItemType.DICE_OBJECT) {
                    const dice = obj as DiceObject;
                    const diceShape = dice.shape || TokenShape.SQUARE;
                    return (
                        <div
                            key={obj.id}
                            className={isPermeable ? '' : 'pointer-events-auto'}
                            style={{
                                left: pinnedPosition.x,
                                top: pinnedPosition.y,
                                pointerEvents: isPermeable ? 'none' : 'auto',
                            }}
                        >
                            <div
                                onMouseDown={(e) => handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                onDoubleClick={(e) => { e.stopPropagation(); if (currentTool !== 'marker' && currentTool !== 'eraser') rollDiceWithGroup(dice); }}
                                className={`flex items-center justify-center group select-none ${currentTool !== 'none' ? 'cursor-default' : draggingClass}`}
                                style={{
                                    width: v2p(dice.width || 60),
                                    height: v2p(dice.height || 60),
                                    transform: `rotate(${obj.rotation}deg)`
                                }}
                            >
                                <SvgTokenShape
                                    shape={diceShape}
                                    width={v2p(dice.width || 60)}
                                    height={v2p(dice.height || 60)}
                                    color={obj.color || '#6366f1'}
                                    content={''}
                                    borderColor={(obj as any).borderColor || '#4f46e5'}
                                    borderWidth={(obj as any).borderWidth ?? 3}
                                    opacity={obj.opacity ?? 100}
                                    borderOpacity={(obj as any).borderOpacity ?? 100}
                                />
                                {/* Dice value - always centered */}
                                <div
                                    className="absolute flex items-center justify-center pointer-events-none"
                                    style={{
                                        top: diceShape === TokenShape.TRIANGLE ? '71%' : '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                >
                                    <span
                                        className="font-bold text-white drop-shadow-md"
                                        style={{
                                            fontSize: `${Math.min(24 * (1 + ((dice.height || 60) / 60 - 1) * (2/3)), (dice.width || 60) * 0.7)}px`
                                        }}
                                    >{rollingDice[dice.id] ?? dice.currentValue}</span>
                                </div>
                                {/* Dice sides indicator - midpoint between value center and bottom */}
                                <div
                                    className="absolute flex items-center justify-center pointer-events-none"
                                    style={{
                                        top: diceShape === TokenShape.TRIANGLE ? '78%' : '72.5%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                >
                                    <span
                                        className="opacity-75 text-white drop-shadow-md"
                                        style={{
                                            fontSize: `${Math.min(9 * (1 + ((dice.height || 60) / 60 - 1) * (2/3)), (dice.width || 60) * 0.25)}px`
                                        }}
                                    >d{dice.sides}</span>
                                </div>
                            </div>
                        </div>
                    );
                }

                // Render counter
                if (obj.type === ItemType.COUNTER) {
                    const counter = obj as Counter;
                    return (
                        <div
                            key={obj.id}
                            className={isPermeable ? '' : 'pointer-events-auto'}
                            style={{
                                left: pinnedPosition.x,
                                top: pinnedPosition.y,
                                pointerEvents: isPermeable ? 'none' : 'auto',
                            }}
                        >
                            <div
                                onMouseDown={(e) => handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                className={`bg-slate-900 border-2 border-slate-600 rounded-lg shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none ${draggingClass}`}
                                style={{
                                    width: v2p(Math.max(obj.width, 100)),
                                    height: v2p(50),
                                    transform: `rotate(${obj.rotation}deg)`
                                }}
                            >
                                <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: -1 }})}><Minus size={14}/></button>
                                <span className="text-xl font-bold">{counter.value}</span>
                                <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: 1 }})}><Plus size={14}/></button>
                                {(obj as any).showNameOnToken && (
                                  <div className="absolute -top-5 left-0 right-0 text-center text-[12px] truncate px-1" style={{ color: (obj as any).fontColor || '#ffffff' }}>
                                    {obj.name}
                                  </div>
                                )}
                            </div>
                        </div>
                    );
                }

                return null;
            })}
        </div>

        {contextMenu && (
            <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                object={state.objects[contextMenu.object.id] || contextMenu.object}
                isGM={isGM}
                onAction={executeMenuAction}
                onClose={() => setContextMenu(null)}
                allObjects={state.objects}
                language={state.language}
                shiftKey={contextMenu.shiftKey}
                nexusBoardEditingId={nexusBoardAddingCell}
                contextMenuType="tabletop"
            />
        )}

        {settingsModalObj && (
            <ObjectSettingsModal
                object={settingsModalObj}
                allObjects={state.objects}
                language={state.language}
                onClose={() => setSettingsModalObj(null)}
                onSave={(updatedObj) => {
                    // If updating a deck with sprite config, generate cards from sprite
                    if (settingsModalObj.type === ItemType.DECK && updatedObj.type === ItemType.DECK) {
                        const oldDeck = settingsModalObj as DeckType;
                        const newDeck = updatedObj as DeckType;

                        // Check if sprite config is set and different (or newly set)
                        if (newDeck.spriteConfig && (!oldDeck.spriteConfig ||
                            oldDeck.spriteConfig.spriteUrl !== newDeck.spriteConfig.spriteUrl ||
                            oldDeck.spriteConfig.columns !== newDeck.spriteConfig.columns ||
                            oldDeck.spriteConfig.rows !== newDeck.spriteConfig.rows ||
                            oldDeck.spriteConfig.totalCards !== newDeck.spriteConfig.totalCards)) {
                            // Generate cards from sprite - this sets the base card list
                            const spriteConfig = newDeck.spriteConfig;
                            const totalCards = spriteConfig.totalCards || (spriteConfig.columns * spriteConfig.rows);
                            const baseCardIds: string[] = [];

                            for (let i = 0; i < totalCards; i++) {
                                const cardId = `card-${Date.now()}-${i}`;
                                baseCardIds.push(cardId);

                                const cardObj: TableObject = {
                                    id: cardId,
                                    type: ItemType.CARD,
                                    x: 0,
                                    y: 0,
                                    // Don't set width/height on cards - let them use deck's cardWidth/cardHeight
                                    // This ensures cards always respect deck's card dimension settings
                                    // width: newDeck.cardWidth || newDeck.width,
                                    // height: newDeck.cardHeight || newDeck.height,
                                    rotation: 0,
                                    name: `Card ${i + 1}`,
                                    content: spriteConfig.cardBackUrl || spriteConfig.spriteUrl,
                                    locked: false,
                                    isOnTable: true,
                                    location: CardLocation.DECK,
                                    faceUp: false,
                                    deckId: newDeck.id,
                                    shape: newDeck.cardShape,
                                    // Sprite info
                                    spriteIndex: i,
                                    spriteUrl: spriteConfig.spriteUrl,
                                    spriteColumns: spriteConfig.columns,
                                    spriteRows: spriteConfig.rows,
                                    // Inherit tooltip settings from deck
                                    showTooltipImage: newDeck.showTooltipImage,
                                    tooltipScale: newDeck.tooltipScale,
                                };
                                dispatch({ type: 'ADD_OBJECT', payload: cardObj });
                            }

                            // Update deck with new baseCardIds and cardIds (both start with the same cards)
                            updatedObj = { ...updatedObj, baseCardIds, cardIds: baseCardIds };
                        }

                        // Check if card dimensions changed
                        if (oldDeck.cardWidth !== newDeck.cardWidth || oldDeck.cardHeight !== newDeck.cardHeight) {
                            dispatch({
                                type: 'UPDATE_DECK_CARD_DIMENSIONS',
                                payload: {
                                    deckId: updatedObj.id,
                                    cardWidth: newDeck.cardWidth,
                                    cardHeight: newDeck.cardHeight,
                                }
                            });
                        }

                        // Check if tooltip settings changed - propagate to all cards in deck
                        if (oldDeck.showTooltipImage !== newDeck.showTooltipImage || oldDeck.tooltipScale !== newDeck.tooltipScale) {
                            const cardIds = newDeck.cardIds || [];
                            cardIds.forEach(cardId => {
                                const card = state.objects[cardId] as CardType;
                                if (card) {
                                    dispatch({
                                        type: 'UPDATE_OBJECT',
                                        payload: {
                                            ...card,
                                            showTooltipImage: newDeck.showTooltipImage,
                                            tooltipScale: newDeck.tooltipScale,
                                        }
                                    });
                                }
                            });
                        }
                    }

                    dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
                }}
                diceGroups={state.diceGroups}
                dispatch={dispatch}
            />
        )}

        {deleteCandidateId && (
            <DeleteConfirmModal
                objectName={(state.objects[deleteCandidateId] as any)?.name || 'Object'}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteCandidateId(null)}
                language={state.language}
            />
        )}

        {/* Pile Context Menu */}
        {pileContextMenu && (
            <PileContextMenu
                x={pileContextMenu.x}
                y={pileContextMenu.y}
                pile={pileContextMenu.pile}
                deck={pileContextMenu.deck}
                onAction={executePileMenuAction}
                onClose={() => setPileContextMenu(null)}
                language={state.language}
            />
        )}

        {/* Piles Button Menu */}
        {pilesButtonMenu && (
            <>
                <div
                    className="fixed inset-0 z-[9998]"
                    onClick={() => setPilesButtonMenu(null)}
                />
                <div
                    className="fixed z-[9999] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[180px] text-sm animate-in fade-in zoom-in-95 duration-100"
                    style={{
                        left: pilesButtonMenu.x,
                        top: pilesButtonMenu.y
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-2 border-b border-slate-700 mb-1">
                        <span className="text-xs text-gray-400 font-bold uppercase">Piles</span>
                    </div>
                    {pilesButtonMenu.deck.piles?.map((pile) => (
                        <button
                            key={pile.id}
                            onClick={() => {
                                setSearchModalDeck(pilesButtonMenu.deck);
                                setSearchModalPile(pile);
                                setPilesButtonMenu(null);
                            }}
                            className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors ${pile.isMillPile ? 'text-red-400' : 'text-gray-200'}`}
                        >
                            <Layers size={14} />
                            <span>{pile.name}</span>
                            {pile.isMillPile && <span className="ml-auto text-[10px] bg-red-600 px-1 rounded">MILL</span>}
                        </button>
                    ))}
                    <div className="h-px bg-slate-700 my-1 mx-2" />
                    <button
                        onClick={() => {
                            setSearchModalDeck(pilesButtonMenu.deck);
                            setSearchModalPile(undefined);
                            setPilesButtonMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700 transition-colors text-gray-200"
                    >
                        <Search size={14} />
                        <span>Main Deck</span>
                    </button>
                </div>
            </>
        )}

        {/* Search Deck/Pile Modal */}
        {searchModalDeck && (
            <SearchDeckModal
                deck={searchModalDeck}
                pile={searchModalPile}
                onClose={() => {
                    setSearchModalDeck(null);
                    setSearchModalPile(undefined);
                }}
                language={state.language}
            />
        )}

        {topDeckModalDeck && (
            <TopDeckModal
                deck={topDeckModalDeck}
                onClose={() => setTopDeckModalDeck(null)}
                language={state.language}
            />
        )}

        {/* Cursor Slot Visualization - renders items following cursor */}
        <CursorSlotVisualization
            cursorSlot={cursorSlot}
            cursorPosition={cursorPosition}
            cursorPositionRef={cursorPositionRef}
            pixelsPerVU={pixelsPerVU}
            zoom={state.viewTransform.zoom}
            state={state}
            getCardSettings={getCardSettings}
        />

        {/* Remote Object Animation - smooth position transitions for remote player movements */}
        {/* <RemoteObjectAnimation
            animatingObjects={animatingObjects}
            state={state}
            zoom={zoom}
            getCardSettings={getCardSettings}
        /> */}

        {/* Click-to-show tooltip for cards */}
        {clickTooltip && (() => {
          const card = state.objects[clickTooltip.cardId] as CardType;
          if (!card) return null;

          const deck = card.deckId ? (state.objects[card.deckId] as DeckType | undefined) : undefined;

          // Get tooltip image source
          const getTooltipImageSrc = (): string | undefined => {
            // For click tooltip, always show image if available (regardless of deck.showTooltipImage setting)
            if (card.faceUp) {
              if (card.spriteUrl) return card.spriteUrl;
              if (card.content) return card.content;
            }
            // Card is face down
            if (deck) {
              if (deck.spriteConfig?.cardBackSpriteUrl) return deck.spriteConfig.cardBackSpriteUrl;
              if (deck.spriteConfig?.cardBackUrl) return deck.spriteConfig.cardBackUrl;
            }
            return undefined;
          };

          const imageSrc = getTooltipImageSrc();
          if (!imageSrc) return null;

          // Calculate dimensions
          const cardWidth = card.width ?? deck?.cardWidth ?? 100;
          const cardHeight = card.height ?? deck?.cardHeight ?? 140;
          const aspectRatio = cardWidth / cardHeight;
          const tooltipScale = deck?.tooltipScale ?? 125;
          const baseWidth = cardWidth;

          // Get sprite info
          const spriteIndex = card.spriteIndex;
          const spriteColumns = card.spriteColumns ?? deck?.spriteConfig?.columns;
          const spriteRows = card.spriteRows ?? deck?.spriteConfig?.rows;

          // Calculate background position for sprite
          let bgPosition = 'center';
          let bgSize = 'cover';
          if (spriteIndex !== undefined && spriteColumns && spriteRows) {
            const col = spriteIndex % spriteColumns;
            const row = Math.floor(spriteIndex / spriteColumns);
            const colPercent = spriteColumns > 1 ? (col / (spriteColumns - 1)) * 100 : 0;
            const rowPercent = spriteRows > 1 ? (row / (spriteRows - 1)) * 100 : 0;
            bgPosition = `${colPercent}% ${rowPercent}%`;
            bgSize = `${spriteColumns * 100}% ${spriteRows * 100}%`;
          }

          return (
            <div
              className="fixed z-[99999] pointer-events-none"
              style={{
                left: clickTooltip.x + 5,
                top: clickTooltip.y + 5,
              }}
            >
              <div
                className="bg-slate-900/95 border border-slate-600 rounded-lg overflow-hidden shadow-xl"
                style={{
                  width: `${baseWidth * (tooltipScale / 100)}px`,
                  height: `${baseWidth * (tooltipScale / 100) / aspectRatio}px`,
                  backgroundImage: `url(${imageSrc})`,
                  backgroundSize: bgSize,
                  backgroundPosition: bgPosition,
                  backgroundRepeat: 'no-repeat',
                }}
              />
            </div>
          );
        })()}

        {/* Dragged object over pool panel - now handled by CursorSlotVisualization */}
      </div>
    );
};
