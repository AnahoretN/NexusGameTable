
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { useLocalSettings } from '../hooks/useLocalSettings';
import { ItemType, CardLocation, TableObject, Card as CardType, Token as TokenType, TokenType as TokenArchetype, DiceObject, Counter, TokenShape, GridType, CardPile, Deck as DeckType, CardOrientation, CardShape, PanelObject, WindowObject, BattlefieldCell, Board as BoardType, NexusBoard, NexusCellObject, HexDirection } from '../types';
import { Card } from './Card';
import { ContextMenu } from './ContextMenu';
import { PileContextMenu } from './PileContextMenu';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SearchDeckModal } from './SearchDeckModal';
import { TopDeckModal } from './TopDeckModal';
import { DeckComponent } from './DeckComponent';
import { UIObjectRendererMemo } from './UIObjectRenderer';
import { Tooltip } from './Tooltip';
import { DrawingCanvas } from './DrawingCanvas';
import { SvgTokenShape } from './SvgTokenShape';
import { SvgDeckShape, DeckLabel, shouldUseSvgForDeck } from './SvgDeckShape';
import { BoardWithResizeMemo } from './BoardWithResize';
import { NexusBoardMemo } from './NexusBoard';
import { Layers, Lock, Unlock, Minus, Plus, Search, RefreshCw, Trash2, Copy, RotateCw, ChevronsUpDown } from 'lucide-react';
import { CARD_SHAPE_DIMS, WORLD_SIZE_VU } from '../constants';
import { generateUUID } from '../utils/uuid';
import { vuToPixels, pixelsToVu } from '../utils/vuSystem';
import { CursorSlotVisualization } from './CursorSlotVisualization';
// import { RemoteObjectAnimation, useRemoteObjectAnimation } from './RemoteObjectAnimation';
import { PinnedIndicator } from './PinnedIndicator';
import { ObjectActionButtons } from './ObjectActionButtons';
import {
  calculateFlexibleHexGrid,
  calculateHorizontalHexGrid,
  addObjectToCellMagnet,
  removeObjectFromCellMagnet,
  findCellForSnappedObject,
  calculateMagnetPointPositions
} from '../utils/gridUtils';

export const Tabletop: React.FC = () => {
  const { state, dispatch, isHost } = useGame();
  const { settings: localSettings } = useLocalSettings();

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

  // Shift key state for delete cursor
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Ruler state
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerCurrent, setRulerCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isRulerRightClick, setIsRulerRightClick] = useState(false);

  // Resizing state for boards
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Cursor slot state - holds cards and tokens picked up with Shift+click (max 100 items)
  // Stores full object data and removes objects from their original position
  const [cursorSlot, setCursorSlot] = useState<(CardType | TokenType)[]>([]);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  // Ref for immediate cursor position updates (synchronous, for rendering slot items)
  const cursorPositionRef = useRef<{ x: number; y: number } | null>(null);
  // Track how items were added to cursor slot:
  // - 'shift' = Shift+click on board (drop only on click, not on mouseup)
  // - 'hold' = Long press or drag (drop on mouseup)
  // - 'archetype' = Click on token archetype in ToolsPanel (don't drop on normal click)
  const [cursorSlotSource, setCursorSlotSource] = useState<'shift' | 'hold' | 'archetype' | null>(null);

  // Ref to track when we're adding a token (prevent slot from being dropped during add)
  const isAddingTokenRef = useRef(false);

  // Local state to handle the visual "rapid change" animation of dice
  const [rollingDice, setRollingDice] = useState<Record<string, number>>({});

  // UI modal/menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject } | null>(null);
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
  const longPressItemRef = useRef<{ id: string; item: TableObject; startX: number; startY: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartPositionRef = useRef<{ id: string; x: number; y: number } | null>(null); // Track initial position for network commit
  const pileDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const isPanningRef = useRef(false);
  const resizingIdRef = useRef<string | null>(null);
  const draggingPileRef = useRef<{ pile: CardPile; deck: DeckType } | null>(null);
  const cursorSlotRef = useRef<(CardType | TokenType)[]>([]);
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
  // Sync cursorSlotRef - always sync to ensure consistency
  useEffect(() => {
    cursorSlotRef.current = cursorSlot;
  }, [cursorSlot]);

  // Track global mouse position for playTopCard and other features
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
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
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [clickTooltip]);

  // Prevent native browser drag-and-drop on the tabletop
  useEffect(() => {
    const handleDragStart = (e: Event) => {
      e.preventDefault();
    };
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('dragstart', handleDragStart);
      container.addEventListener('selectstart', handleSelectStart);
      return () => {
        container.removeEventListener('dragstart', handleDragStart);
        container.removeEventListener('selectstart', handleSelectStart);
      };
    }
  }, []);

  // Listen for add-to-cursor-slot events from other components (e.g., HandPanel)
  useEffect(() => {
    const handleAddToSlot = (e: Event) => {
      const customEvent = e as CustomEvent<{
        cardId: string;
        clientX: number;
        clientY: number;
        source?: 'shift' | 'hold';
      }>;
      const { cardId, clientX, clientY, source = 'shift' } = customEvent.detail;
      const item = state.objects[cardId];
      if (item && cursorSlot.length < 100) {
        // Set source based on how the item was added (only if slot was empty before)
        if (cursorSlot.length === 0) {
          setCursorSlotSource(source);
        }

        // Deep clone to preserve all properties (especially content/image URL)
        let itemClone: TableObject;

        if (item.type === ItemType.CARD) {
          const card = item as CardType;
          // Get deck to check orientation
          const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
          const isHorizontal = deck?.cardOrientation === CardOrientation.HORIZONTAL;

          itemClone = {
            id: card.id,
            type: ItemType.CARD,
            name: card.name,
            content: card.content, // Image URL - this is the main image
            frontFaceUrl: card.frontFaceUrl,
            backFaceUrl: card.backFaceUrl,
            deckId: card.deckId,
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
            spriteIndex: card.spriteIndex,
            spriteColumns: card.spriteColumns,
            spriteRows: card.spriteRows,
            spriteUrl: card.spriteUrl,
            shape: card.shape,
          } as CardType;
        } else {
          itemClone = { ...item } as TokenType;
        }

        setCursorSlot(prev => [...prev, itemClone]);
        dispatch({ type: 'UPDATE_OBJECT', payload: { id: cardId, inCursorSlot: true } });
        const pos = { x: clientX, y: clientY };
        setCursorPosition(pos);
        cursorPositionRef.current = pos;
      }
    };

    window.addEventListener('add-to-cursor-slot', handleAddToSlot);
    return () => window.removeEventListener('add-to-cursor-slot', handleAddToSlot);
  }, [cursorSlot.length, dispatch, state.objects]);

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

      // Create new token from archetype
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
      };

      // Add token to objects list
      dispatch({ type: 'ADD_OBJECT', payload: newToken });

      // Create clone for cursor slot
      const tokenClone: TokenType = { ...newToken };
      (tokenClone as any).cursorSlotIndex = cursorSlot.length;

      // Add to cursor slot
      setCursorSlot(prev => [...prev, tokenClone]);
      cursorSlotRef.current = [...cursorSlotRef.current, tokenClone];

      // Set cursor position to show token immediately (use provided coords or current mouse position)
      if (clientX !== undefined && clientY !== undefined) {
        const pos = { x: clientX, y: clientY };
        setCursorPosition(pos);
        cursorPositionRef.current = pos;
      } else if (cursorPosition) {
        // Use existing cursor position
        cursorPositionRef.current = cursorPosition;
      }
      // If no position available, token will appear on first mouse move

      // Set source to 'archetype' when adding from token type click
      setCursorSlotSource('archetype');
    };

    window.addEventListener('add-token-to-cursor-slot', handleAddTokenToSlot, { passive: false });
    return () => window.removeEventListener('add-token-to-cursor-slot', handleAddTokenToSlot);
  }, [cursorSlot.length, dispatch, state.objects]);

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

      // Update all cards in this deck with new dimensions
      Object.values(state.objects).forEach(obj => {
        if (obj.type === ItemType.CARD && (obj as CardType).deckId === deckId) {
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: obj.id,
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

  // Ref to always have current state for event listeners
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Click tracking for single/double click detection
  const clickTrackerRef = useRef<{ objectId: string | null; timestamp: number; clickCount: number }>({
    objectId: null,
    timestamp: 0,
    clickCount: 0
  });

  const activePlayer = (state.players || []).find(p => p.id === state.activePlayerId);
  const isGM = !!activePlayer?.isGM;

  // --- Grid Snapping Logic ---
  // Snaps ONLY tokens to the center of nearest grid cell
  // Snap radius = token size (half width or half height, whichever is larger)
  const getSnappedCoordinates = (cursorX: number, cursorY: number, objects: Record<string, TableObject>, currentDraggingId: string | null): { x: number, y: number } => {
      const draggingObj = objects[currentDraggingId || ''];

      // Only tokens snap to grid
      if (!draggingObj || draggingObj.type !== ItemType.TOKEN) {
          const objHalfW = draggingObj ? (draggingObj.width ?? 100) / 2 : 0;
          const objHalfH = draggingObj ? (draggingObj.height ?? 100) / 2 : 0;
          return { x: cursorX - objHalfW, y: cursorY - objHalfH };
      }

      const objW = draggingObj.width ?? 100;
      const objH = draggingObj.height ?? 100;
      const objHalfW = objW / 2;
      const objHalfH = objH / 2;

      // Snap radius = token size (using max dimension)
      const snapRadius = Math.max(objW, objH);

      // Get all boards with snapToGrid enabled
      const boards = Object.values(objects).filter(obj =>
          obj.type === ItemType.BOARD &&
          (obj as any).snapToGrid &&
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
      let nearestCell: { x: number; y: number; distance: number } | null = null;

      // Check boards first
      for (const board of boards) {
          // All values are in vu (virtual units)
          const gridW = board.gridWidth || board.gridSize || 50;
          const gridH = board.gridHeight || board.gridSize || 50;
          const boardCols = Math.floor(board.width / gridW);
          const boardRows = Math.floor(board.height / gridH);

          if (board.gridType === GridType.SQUARE) {
              // Find the cell under cursor
              const relativeX = cursorX - board.x;
              const relativeY = cursorY - board.y;
              const col = Math.floor(relativeX / gridW);
              const row = Math.floor(relativeY / gridH);

              // Check if cell is within board bounds
              if (col < 0 || col >= boardCols || row < 0 || row >= boardRows) {
                  continue;
              }

              // Calculate cell center
              const cellCenterX = board.x + (col * gridW) + (gridW / 2);
              const cellCenterY = board.y + (row * gridH) + (gridH / 2);

              // Check if within snap radius
              const distance = Math.sqrt(
                  Math.pow(cursorX - cellCenterX, 2) +
                  Math.pow(cursorY - cellCenterY, 2)
              );

              if (distance <= snapRadius && (!nearestCell || distance < nearestCell.distance)) {
                  nearestCell = { x: cellCenterX, y: cellCenterY, distance };
              }
          } else if (board.gridType === GridType.HEX) {
              // Pointy-top hex grid snapping
              // Height is calculated from width: height = width * 1.15
              // Row spacing = 0.75 * height (tight hex packing)
              // Column spacing = width
              // Every other row is offset by width / 2
              const hexW = gridW || 100;
              const hexH = hexW * 1.15;  // Fixed aspect ratio for pointy-top hex
              const rowSpacing = hexH * 0.75;  // Tight packing: 3/4 of height
              const colSpacing = hexW;
              const rowOffset = hexW / 2;
              const halfW = hexW / 2;
              const halfH = hexH / 2;

              // Calculate row and column
              const row = Math.round((cursorY - board.y - halfH) / rowSpacing);
              const col = Math.round((cursorX - board.x - (row % 2) * rowOffset - halfW) / colSpacing);

              // Calculate hex center
              const hexCenterX = board.x + col * colSpacing + (row % 2) * rowOffset + halfW;
              const hexCenterY = board.y + row * rowSpacing + halfH;

              // Check if hex center is within board bounds
              const hexX = hexCenterX - board.x;
              const hexY = hexCenterY - board.y;
              if (hexX < -hexW/2 || hexX > board.width + hexW/2 ||
                  hexY < -halfH || hexY > board.height + halfH) {
                  continue;
              }

              // Check if within snap radius
              const distance = Math.sqrt(
                  Math.pow(cursorX - hexCenterX, 2) +
                  Math.pow(cursorY - hexCenterY, 2)
              );

              if (distance <= snapRadius && (!nearestCell || distance < nearestCell.distance)) {
                  nearestCell = { x: hexCenterX, y: hexCenterY, distance };
              }
          } else if (board.gridType === GridType.HEX_HORIZONTAL) {
              // Flat-top (horizontal) hex grid snapping - 90° rotated from pointy-top
              // Width is the base dimension, height = width / 1.15
              // Default: width=115, height=100
              // Column spacing = 0.75 * width (tight hex packing)
              // Row spacing = height
              // Every other column is offset by height/2
              const hexW = gridW || 115;
              const hexH = hexW / 1.15;  // Fixed aspect ratio for flat-top hex
              const colSpacing = hexW * 0.75;  // Tight packing: 3/4 of width
              const rowSpacing = hexH;
              const colOffset = hexH / 2;
              const halfW = hexW / 2;
              const halfH = hexH / 2;

              // Calculate column and row (adjusted for hex positioning)
              const col = Math.round((cursorX - board.x - halfW) / colSpacing);
              const row = Math.round((cursorY - board.y - (col % 2) * colOffset - halfH) / rowSpacing);

              // Calculate hex center
              const hexCenterX = board.x + col * colSpacing + halfW;
              const hexCenterY = board.y + row * rowSpacing + (col % 2) * colOffset + halfH;

              // Check if hex center is within board bounds
              const hexX = hexCenterX - board.x;
              const hexY = hexCenterY - board.y;
              if (hexX < -halfW || hexX > board.width + halfW ||
                  hexY < -hexH/2 || hexY > board.height + hexH/2) {
                  continue;
              }

              // Check if within snap radius
              const distance = Math.sqrt(
                  Math.pow(cursorX - hexCenterX, 2) +
                  Math.pow(cursorY - hexCenterY, 2)
              );

              if (distance <= snapRadius && (!nearestCell || distance < nearestCell.distance)) {
                  nearestCell = { x: hexCenterX, y: hexCenterY, distance };
              }
          }
      }

      // Check individual battlefield cells - snap to magnet points
      for (const cell of cells) {
          const cellCenterX = cell.x + (cell.width ?? 100) / 2;
          const cellCenterY = cell.y + (cell.height ?? 100) / 2;

          // Get magnetism settings for this cell
          const magnetPointCount = cell.magnetPointCount ?? 1;
          const magnetRotation = cell.magnetRotation ?? 0;

          // Calculate magnet point positions
          const magnetPoints: { x: number; y: number }[] = [];

          if (magnetPointCount === 1) {
              // Single point at center
              magnetPoints.push({ x: cellCenterX, y: cellCenterY });
          } else {
              // Multiple magnet points along lines from center to inscribed ellipse
              const anglePerSlice = 360 / magnetPointCount;
              const halfW = (cell.width ?? 100) / 2 - 2; // 2 vu padding
              const halfH = (cell.height ?? 100) / 2 - 2;

              for (let i = 0; i < magnetPointCount; i++) {
                  const angle = (i * anglePerSlice + magnetRotation) * Math.PI / 180;
                  const cosA = Math.cos(angle);
                  const sinA = Math.sin(angle);

                  // Calculate distance to inscribed ellipse in this direction
                  // Ellipse equation: (x/a)² + (y/b)² = 1
                  // r = 1 / sqrt((cos(a)/a)² + (sin(a)/b)²)
                  const lineLength = 1 / Math.sqrt(
                      (cosA / halfW) ** 2 + (sinA / halfH) ** 2
                  );

                  // Magnet point is at 60% from center along the line
                  const magnetRadius = lineLength * 0.6;
                  const magnetX = cellCenterX + cosA * magnetRadius;
                  const magnetY = cellCenterY + sinA * magnetRadius;
                  magnetPoints.push({ x: magnetX, y: magnetY });
              }
          }

          // Find nearest magnet point
          for (const magnetPoint of magnetPoints) {
              const distance = Math.sqrt(
                  Math.pow(cursorX - magnetPoint.x, 2) +
                  Math.pow(cursorY - magnetPoint.y, 2)
              );

              if (distance <= snapRadius && (!nearestCell || distance < nearestCell.distance)) {
                  nearestCell = { x: magnetPoint.x, y: magnetPoint.y, distance };
              }
          }
      }

      // If we found a magnet point to snap to, return coordinates centered on that point
      if (nearestCell) {
          return {
              x: nearestCell.x - objHalfW,
              y: nearestCell.y - objHalfH
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
    if (contextMenu) setContextMenu(null);

    const obj = state.objects[id];
    if (!obj || obj.locked) return;

    setResizingId(id);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: obj.width ?? 100,
      height: obj.height ?? 100,
    });
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

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
            };

            // Set cursor position first to ensure immediate render
            setCursorPosition(mousePos);

            // Add to cursor slot
            cursorSlotRef.current = [...cursorSlotRef.current, cardForSlot];
            setCursorSlot(prev => [...prev, cardForSlot]);
            if (cursorSlot.length === 0) {
              setCursorSlotSource('shift');
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
            const worldX = obj.x + offset.x;
            const worldY = obj.y + offset.y;
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: obj.id, x: worldX, y: worldY, isPinnedToViewport: false }
            });
          } else {
            // Pin: use current screen position
            const worldX = obj.x;
            const worldY = obj.y;
            const screenX = worldX - offset.x;
            const screenY = worldY - offset.y;
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
  const addToCursorSlot = useCallback((id: string, item: TableObject, source: 'shift' | 'hold' = 'shift', mousePosition?: { x: number; y: number }) => {
    console.log(`[DRAG SYSTEM] addToCursorSlot - source: ${source}, item: ${item.name} (${item.type}), slot size before: ${cursorSlot.length}`);
    if (cursorSlot.length >= 100) return; // Max 100 items in slot

    // Set source based on how the item was added (only if slot was empty before)
    if (cursorSlot.length === 0) {
      setCursorSlotSource(source);
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
      } as CardType;
    } else {
      itemClone = { ...item } as TokenType;
    }

    // Store the index of this item in the cursor slot (used for offset calculation)
    // This ensures consistent offset between slot rendering and dropping
    (itemClone as any).cursorSlotIndex = cursorSlot.length;

    // IMPORTANT: Store original zIndex for proper restoration when dropping
    // For shift mode: use new stack zIndex (10000+), for hold mode: preserve original
    (itemClone as any).originalZIndex = item.zIndex ?? 0;

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
    setCursorSlot(prev => [...prev, itemClone]);
    // Also update ref immediately for consistent state
    cursorSlotRef.current = [...cursorSlotRef.current, itemClone];

    // Mark the item as inCursorSlot (keeps it in objects list but hidden from tabletop)
    dispatch({ type: 'UPDATE_OBJECT', payload: { id, inCursorSlot: true } });

    // Clean up magnet points - when picking up an object, remove it from any cell's magnet points
    // and reposition remaining objects
    for (const obj of Object.values(state.objects)) {
      if ((obj.type === ItemType.BATTLEFIELD_CELL || obj.type === ItemType.NEXUS_CELL) && obj.magnetPoints) {
        const cell = obj as BattlefieldCell | NexusCellObject;
        if (cell.magnetPoints?.some(p => p.objectId === id)) {
          const result = removeObjectFromCellMagnet(cell, id, state.objects);
          if (result) {
            // Update the cell with new magnet points
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: cell.id,
                magnetPointCount: result.updatedCell.magnetPointCount,
                magnetPoints: result.updatedCell.magnetPoints
              }
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
          }
        }
      }
    }
  }, [cursorSlot.length, dispatch, v2p, state.viewTransform, state.objects, cursorSlotRef]);

  // Drop all items from cursor slot at specified screen coordinates
  const dropCursorSlot = useCallback((clientX: number, clientY: number, slotItems?: (CardType | TokenType)[]) => {
    // Use provided slotItems or fall back to cursorSlot from state
    const currentSlot = slotItems ?? cursorSlot;
    console.log(`[DRAG SYSTEM] dropCursorSlot - dropping ${currentSlot.length} items`);
    if (currentSlot.length === 0) return;

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
    let targetBoardCellCenter: { x: number; y: number } | null = null;

    // Only tokens use automatic cell magnetism
    const firstItem = currentSlot[0];
    if (firstItem && firstItem.type === ItemType.TOKEN) {
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
              (obj as BoardType).snapToGrid &&
              (obj as BoardType).gridType !== GridType.NONE &&
              obj.isOnTable !== false) {
            const board = obj as BoardType;
            const gridW = board.gridWidth || board.gridSize || 50;
            const gridH = board.gridHeight || board.gridSize || 50;
            let cellCenterX: number, cellCenterY: number;

            if (board.gridType === GridType.SQUARE) {
              const relativeX = worldX - board.x;
              const relativeY = worldY - board.y;
              const col = Math.floor(relativeX / gridW);
              const row = Math.floor(relativeY / gridH);

              // Check if cell is within board bounds
              if (col >= 0 && col < Math.floor(board.width / gridW) &&
                  row >= 0 && row < Math.floor(board.height / gridH)) {
                cellCenterX = board.x + (col * gridW) + (gridW / 2);
                cellCenterY = board.y + (row * gridH) + (gridH / 2);
                targetBoardCellCenter = { x: cellCenterX, y: cellCenterY };
                break;
              }
            } else if (board.gridType === GridType.HEX) {
              // Pointy-top hex grid
              const hexW = gridW || 100;
              const hexH = hexW * 1.15;
              const rowSpacing = hexH * 0.75;
              const colSpacing = hexW;
              const rowOffset = hexW / 2;
              const halfW = hexW / 2;
              const halfH = hexH / 2;

              const row = Math.round((worldY - board.y - halfH) / rowSpacing);
              const col = Math.round((worldX - board.x - (row % 2) * rowOffset - halfW) / colSpacing);

              cellCenterX = board.x + col * colSpacing + (row % 2) * rowOffset + halfW;
              cellCenterY = board.y + row * rowSpacing + halfH;

              // Check if hex center is within board bounds
              const hexX = cellCenterX - board.x;
              const hexY = cellCenterY - board.y;
              if (hexX >= -hexW/2 && hexX <= board.width + hexW/2 &&
                  hexY >= -halfH && hexY <= board.height + halfH) {
                targetBoardCellCenter = { x: cellCenterX, y: cellCenterY };
                break;
              }
            } else if (board.gridType === GridType.HEX_HORIZONTAL) {
              // Flat-top hex grid
              const hexW = gridW || 115;
              const hexH = hexW / 1.15;
              const colSpacing = hexW * 0.75;
              const rowSpacing = hexH;
              const colOffset = hexH / 2;
              const halfW = hexW / 2;
              const halfH = hexH / 2;

              const col = Math.round((worldX - board.x - halfW) / colSpacing);
              const row = Math.round((worldY - board.y - (col % 2) * colOffset - halfH) / rowSpacing);

              cellCenterX = board.x + col * colSpacing + halfW;
              cellCenterY = board.y + row * rowSpacing + (col % 2) * colOffset + halfH;

              // Check if hex center is within board bounds
              const hexX = cellCenterX - board.x;
              const hexY = cellCenterY - board.y;
              if (hexX >= -halfW && hexX <= board.width + halfW &&
                  hexY >= -hexH/2 && hexY <= board.height + hexH/2) {
                targetBoardCellCenter = { x: cellCenterX, y: cellCenterY };
                break;
              }
            }
          }
        }
      }
    }

    // Track cells that need to be updated (to avoid duplicate updates)
    const updatedCellIds = new Set<string>();

    // Add all items from slot back to the game with automatic magnetism
    currentSlot.forEach((item, index) => {
      const isCard = item.type === ItemType.CARD;
      let baseWidth = item.width ?? (isCard ? 63 : 50);
      let baseHeight = item.height ?? (isCard ? 88 : 50);

      // For cards, get settings from deck for proper dimensions
      let isHorizontal = (item as any).isHorizontal;
      if (isCard) {
        const cardSettings = getCardSettings(item as CardType);
        baseWidth = item.width ?? cardSettings.cardWidth ?? 63;
        baseHeight = item.height ?? cardSettings.cardHeight ?? 88;
        isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;
      }

      // For horizontal cards, swap dimensions to match cursor visualization
      if (isHorizontal) {
        [baseWidth, baseHeight] = [baseHeight, baseWidth];
      }

      // Clamp zIndex to hyperscale layer bounds
      const itemLayer = state.hyperscaleLayers.find(l => l.id === item.hyperscaleLayerId);
      const minZ = itemLayer?.minZIndex ?? 1;
      const maxZ = itemLayer?.maxZIndex ?? 10000;

      // Use original zIndex if preserving, otherwise use stack zIndex (clamped to layer bounds)
      const stackZ = Math.min(10000 + index, maxZ);
      const defaultZIndex = useOriginalZIndex
        ? ((item as any).originalZIndex ?? minZ)
        : stackZ;

      let finalX: number, finalY: number;
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
      } else if (item.type === ItemType.TOKEN && targetBoardCellCenter) {
        // Snap to Board grid cell center
        finalX = targetBoardCellCenter.x - baseWidth / 2;
        finalY = targetBoardCellCenter.y - baseHeight / 2;
      } else {
        // No cell magnetism - use regular snapping
        let snapTargetX: number, snapTargetY: number;
        if (item.type === ItemType.TOKEN) {
          const snappedPos = getSnappedCoordinates(worldX, worldY, state.objects, item.id);
          snapTargetX = snappedPos.x + baseWidth / 2;
          snapTargetY = snappedPos.y + baseHeight / 2;
        } else {
          snapTargetX = worldX;
          snapTargetY = worldY;
        }

        // Apply stacking offset for multiple items
        const slotIndex = (item as any).cursorSlotIndex ?? 0;
        const newestIndex = currentSlot.length - 1;
        const offsetFromBack = Math.max(0, newestIndex - slotIndex);
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.05;
        const offsetX = offsetFromBack * offsetAmount;
        const offsetY = offsetFromBack * offsetAmount;

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
        },
      });
    });

    // Track recently dropped objects to prevent showing shadow version
    const droppedIds = new Set(currentSlot.map(item => item.id));
    setRecentlyInMyCursorSlot(droppedIds);
    // Clear after 500ms (enough time for WebRTC sync)
    setTimeout(() => {
      setRecentlyInMyCursorSlot(prev => {
        const next = new Set(prev);
        droppedIds.forEach(id => next.delete(id));
        return next;
      });
    }, 500);

    // Clear the slot - also update ref immediately for mouseup handler
    console.log(`[DRAG SYSTEM] Clearing cursor slot - dropped ${currentSlot.length} items`);
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

      // Drop the cursor slot at the specified position
      if (cursorSlot.length > 0) {
        dropCursorSlot(clientX, clientY);
      }
    };

    window.addEventListener('drop-cursor-slot-at-position', handleDropAtPosition);
    return () => window.removeEventListener('drop-cursor-slot-at-position', handleDropAtPosition);
  }, [cursorSlot.length, dropCursorSlot]);

  // Drop cursor slot items to a specific deck (called from handleGlobalClick when clicking on deck)
  const dropToDeck = useCallback((deckId: string, slotItems?: (CardType | TokenType)[]) => {
    // Use provided slotItems or fall back to cursorSlot from state
    const currentSlot = slotItems ?? cursorSlot;

    if (currentSlot.length === 0) {
      return;
    }

    const deck = state.objects[deckId] as DeckType;
    if (!deck) {
      return;
    }

    // Only add cards to deck (not tokens)
    const cardsInSlot = currentSlot.filter(item => item.type === ItemType.CARD);
    if (cardsInSlot.length > 0) {
      // First, restore cards from cursor slot (set inCursorSlot: false)
      // ADD_CARD_TO_TOP_OF_DECK will update their position to deck position
      cardsInSlot.forEach((item) => {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: item.id, inCursorSlot: false }
        });
      });

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
      nonCardsInSlot.forEach((item) => {
        const baseWidth = item.width ?? 50;
        const baseHeight = item.height ?? 50;

        // Calculate offset the SAME WAY as cursor slot rendering
        // Newest element (highest index) has offset 0, older elements are offset down-right
        const slotIndex = (item as any).cursorSlotIndex ?? 0;
        const newestIndex = currentSlot.length - 1;
        const offsetFromBack = Math.max(0, newestIndex - slotIndex);
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.05;
        const offsetX = offsetFromBack * offsetAmount;
        const offsetY = offsetFromBack * offsetAmount;

        // Clamp zIndex to hyperscale layer bounds
        const itemLayer = state.hyperscaleLayers.find(l => l.id === item.hyperscaleLayerId);
        const maxZ = itemLayer?.maxZIndex ?? 10000;
        const stackZ = Math.min(10000 + slotIndex, maxZ);

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
  const dropToPile = useCallback((pileId: string, deckId: string, slotItems?: (CardType | TokenType)[]) => {
    // Use provided slotItems or fall back to cursorSlot from state
    const currentSlot = slotItems ?? cursorSlot;

    if (currentSlot.length === 0) {
      return;
    }

    // Only add cards to pile (not tokens)
    const cardsInSlot = currentSlot.filter(item => item.type === ItemType.CARD);
    if (cardsInSlot.length > 0) {
      // First, restore cards from cursor slot (set inCursorSlot: false)
      cardsInSlot.forEach((item) => {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: item.id, inCursorSlot: false }
        });
      });

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

      nonCardsInSlot.forEach((item) => {
        const baseWidth = item.width ?? 50;
        const baseHeight = item.height ?? 50;

        // Calculate offset the SAME WAY as cursor slot rendering
        // Newest element (highest index) has offset 0, older elements are offset down-right
        const slotIndex = (item as any).cursorSlotIndex ?? 0;
        const newestIndex = currentSlot.length - 1;
        const offsetFromBack = Math.max(0, newestIndex - slotIndex);
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.05;
        const offsetX = offsetFromBack * offsetAmount;
        const offsetY = offsetFromBack * offsetAmount;

        // Clamp zIndex to hyperscale layer bounds
        const itemLayer = state.hyperscaleLayers.find(l => l.id === item.hyperscaleLayerId);
        const minZ = itemLayer?.minZIndex ?? 1;
        const maxZ = itemLayer?.maxZIndex ?? 10000;
        const stackZ = Math.min(10000 + slotIndex, maxZ);

        // Use original zIndex if preserving, otherwise use stack zIndex (clamped to layer bounds)
        const zIndex = useOriginalZIndex
          ? ((item as any).originalZIndex ?? minZ)
          : stackZ;

        // Calculate center position (without offset for snapping)
        const pileCenterX = pileX + deck.width * pileSize / 2;
        const pileCenterY = pileY + deck.height * pileSize / 2;

        // Apply grid snapping for tokens only (find snap from center, then add offset)
        let finalX, finalY;
        if (item.type === ItemType.TOKEN) {
          const snappedPos = getSnappedCoordinates(pileCenterX, pileCenterY, state.objects, item.id);
          // snappedPos is top-left, convert to center, add offset, convert back to top-left
          finalX = snappedPos.x + baseWidth / 2 + offsetX - baseWidth / 2;
          finalY = snappedPos.y + baseHeight / 2 + offsetY - baseHeight / 2;
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
            x: finalX,
            y: finalY,
            zIndex,
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
      // Close click tooltip on any click
      if (clickTooltip) {
        setClickTooltip(null);
        clickTooltipBoundsRef.current = null;
      }

      if (cursorSlot.length === 0 || e.button !== 0) {
        return;
      }

      const target = e.target as HTMLElement;

      // Check if clicking on an archetype card (token type in ToolsPanel or MainMenu)
      const archetypeCard = target.closest('[data-archetype-card]');
      if (archetypeCard) {
        return; // Don't drop cursor slot when clicking on archetype cards
      }

      // Check if Shift is pressed
      if (e.shiftKey) return;

      // Check if clicking on ToolsPanel - don't drop, let the panel handle adding more tokens
      const toolsPanel = target.closest('[data-tools-panel]');
      if (toolsPanel) {
        return;
      }

      // Check if clicking inside hand panel - dispatch event to add cards to hand
      const handPanel = target.closest('[data-hand-panel]');
      if (handPanel) {
        // Dispatch custom event for hand panel to handle
        window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
          detail: { items: cursorSlot }
        }));
        // Track recently dropped objects to prevent showing shadow version
        const droppedIds = new Set(cursorSlot.map(item => item.id));
        setRecentlyInMyCursorSlot(droppedIds);
        setTimeout(() => {
          setRecentlyInMyCursorSlot(prev => {
            const next = new Set(prev);
            droppedIds.forEach(id => next.delete(id));
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

      // Check if clicking on a deck - only drop if source='shift' (not for drag/drop)
      const deckElement = target.closest('[data-object-id]');
      if (deckElement && cursorSlotSource === 'shift') {
        const objectId = deckElement.getAttribute('data-object-id');
        const obj = objectId ? state.objects[objectId] : undefined;
        if (obj && obj.type === ItemType.DECK && objectId) {
          // Drop cards to the deck directly - pass cursorSlot from closure
          e.preventDefault();
          e.stopPropagation();
          dropToDeck(objectId, cursorSlot);
          return;
        }
      }

      // Check if clicking on a pile - only drop if source='shift'
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
            e.preventDefault();
            e.stopPropagation();
            dropToPile(pileId, foundDeckId, cursorSlot);
            return;
          }
        }
      }

      // Check if clicking on UI objects (panels, windows) - don't drop there
      if (target.closest('[data-ui-object]')) {
        return;
      }

      // Drop items at cursor position on tabletop - pass cursorSlot from closure
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // Prevent handleMouseDown from being called
      dropCursorSlot(e.clientX, e.clientY, cursorSlot);
    };

    window.addEventListener('mousedown', handleGlobalClick, { capture: true });
    return () => window.removeEventListener('mousedown', handleGlobalClick, { capture: true } as any);
  }, [cursorSlot, dropCursorSlot, state.objects, dropToDeck, dropToPile, clickTooltip]);

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
      if (clickTooltipTimerRef.current) {
        clearTimeout(clickTooltipTimerRef.current);
      }
      clickTooltipBoundsRef.current = null;
    };
  }, []);

  // Global mouseup handler for cursor slot drop (when source='hold' for drag)
  // Also handles adding cards/tokens to cursor slot on click without drag
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      // FIRST: Check if a card/token was pressed but not dragged (longPressItemRef still set)
      // This handles the case where user clicks on a card/token without Shift and without dragging 5px
      if (longPressItemRef.current) {
        const itemRef = longPressItemRef.current;
        // Clear the ref first to prevent double-processing
        longPressItemRef.current = null;

        // Calculate distance to check if this was a drag or a click
        const dx = e.clientX - itemRef.startX;
        const dy = e.clientY - itemRef.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if we just dropped items - prevent immediate re-pickup
        const timeSinceDrop = Date.now() - lastDropTimeRef.current;
        if (justDroppedRef.current && timeSinceDrop < 200) {
          console.log(`[DRAG SYSTEM] Ignoring CLICK in mouseup ${timeSinceDrop}ms after drop - preventing re-pickup`);
          return;
        }

        // Simple click without drag no longer adds to cursor slot
        // Only Shift+click and drag (5px+) work for adding items
        if (distance < 5) {
          console.log(`[DRAG SYSTEM] CLICK without drag (${distance.toFixed(1)}px < 5px) - ignored, use Shift+click to add to slot`);
        }
        console.log(`[DRAG SYSTEM] Mouse up after drag completed (${distance.toFixed(1)}px >= 5px) - tracking already cleared`);
        // If moved 5px or more, the card was already added to slot in mousemove, nothing to do
      }

      // Use cursorSlotRef.current to get the immediate value (avoid closure stale data)
      // Only process if cursor slot has items with source='hold' (drag, not Shift+click)
      const currentSlot = cursorSlotRef.current;
      if (currentSlot.length === 0 || cursorSlotSource !== 'hold') return;

      const clientX = e.clientX;
      const clientY = e.clientY;

      // Check if we're over hand panel
      const target = e.target as HTMLElement;
      const handPanel = target.closest('[data-hand-panel]');

      if (handPanel) {
        // Over hand panel - dispatch event to add cards to hand
        window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
          detail: { items: currentSlot }
        }));
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
        // Clear the slot
        cursorSlotRef.current = [];
        setCursorSlot([]);
        setCursorPosition(null);
        setCursorSlotSource(null);
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // Check if clicking on a deck or pile - handle it directly here
      // Use document.elementFromPoint to find what's under cursor since cursor slot cards have pointer-events: none
      const elementUnderCursor = document.elementFromPoint(clientX, clientY);

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
                console.log(`[DRAG SYSTEM] Dropping ${currentSlot.length} items to pile: ${pile.name}`);
                dropToPile(pileId, deck.id, currentSlot);
                // Ensure slot is cleared after dropping to pile
                cursorSlotRef.current = [];
                setCursorSlot([]);
                setCursorPosition(null);
                setCursorSlotSource(null);
                return;
              }
            }
          }
        }
      }

      // Then check for deck
      const deckElement = elementUnderCursor?.closest('[data-object-id]');
      if (deckElement) {
        const objectId = deckElement.getAttribute('data-object-id');
        const obj = objectId ? state.objects[objectId] : undefined;
        if (obj && obj.type === ItemType.DECK && objectId) {
          e.preventDefault();
          e.stopPropagation();
          console.log(`[DRAG SYSTEM] Dropping ${currentSlot.length} items to deck: ${obj.name}`);
          dropToDeck(objectId, currentSlot);
          // Ensure slot is cleared after dropping to deck
          cursorSlotRef.current = [];
          setCursorSlot([]);
          setCursorPosition(null);
          setCursorSlotSource(null);
          return;
        }
      }

      // Not over hand panel or deck - drop on tabletop, pass currentSlot
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
    if (contextMenu) setContextMenu(null);

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

      // Check if this is a UI object (panel or window) - handled differently
      if (item && (item.type === ItemType.PANEL || item.type === ItemType.WINDOW)) {
        if (item.locked) return; // Locked objects can't be dragged

        // Note: We DON'T unpin pinned objects on drag - pinned objects stay pinned while dragging

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
    // If no id (background), check for panning or dropping cursor slot
    if (!id) {
      if (e.button === 0 && e.shiftKey && currentTool !== 'marker') {
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

      // If cursor slot has items and we click without shift, drop all items
      // Exception: if source is 'archetype' (tokens from archetype click), don't drop - treat like Shift is held
      // Use cursorSlotRef.current to check synchronously (state update is async)
      if (e.button === 0 && !e.shiftKey && cursorSlotRef.current.length > 0 && cursorSlotSource !== 'archetype') {
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
        console.log(`[LAYER DRAG] Object ${item.name} (id: ${id}) is LOCKED - drag prevented`);
        return;
      }

      // Hyperscale layer check - only allow dragging objects in selected hyperscale layers
      // This applies to all players including GM
      // EXCEPTION: Objects in current player's cursor slot can always be moved
      const isInCursorSlot = item.draggingPlayerId === state.activePlayerId;
      if (!isInCursorSlot) {
        const objLayer = item.hyperscaleLayerId || 'none';
        const selectedLayers = state.selectedHyperscaleLayerIds;
        const layerAllowed = objLayer === 'none' || selectedLayers.includes(objLayer);
        console.log(`[LAYER DRAG] Object: ${item.name} (${item.type})`);
        console.log(`[LAYER DRAG] Object layer: ${objLayer}`);
        console.log(`[LAYER DRAG] Selected layers: ${selectedLayers.join(', ')}`);
        console.log(`[LAYER DRAG] Drag allowed: ${layerAllowed}`);
        if (!layerAllowed) {
          console.log(`[LAYER DRAG] Drag PREVENTED - layer not selected`);
          return; // Object is in a non-selected hyperscale layer
        }
      } else {
        console.log(`[LAYER DRAG] Object ${item.name} is in cursor slot - layer check skipped`);
      }

      // Cards and tokens: Shift+click immediately adds to cursor slot
      if (e.shiftKey && item && (item.type === ItemType.CARD || item.type === ItemType.TOKEN)) {
        console.log(`[DRAG SYSTEM] SHIFT+CLICK - activating SHIFT mode for item: ${item.name} (${item.type})`);
        addToCursorSlot(id, item);
        return;
      }

      // If cursor slot has items and we click without shift, drop all items first
      // Exception: if source is 'archetype' (tokens from archetype click), don't drop
      // Use cursorSlotRef.current to check synchronously (state update is async)
      if (!e.shiftKey && cursorSlotRef.current.length > 0 && cursorSlotSource !== 'archetype') {
        dropCursorSlot(e.clientX, e.clientY);
        return; // Don't proceed with normal drag handling
      }

      // Prevent immediate re-pickup after dropping items (within 200ms)
      const timeSinceDrop = Date.now() - lastDropTimeRef.current;
      if (justDroppedRef.current && timeSinceDrop < 200) {
        console.log(`[DRAG SYSTEM] Ignoring click ${timeSinceDrop}ms after drop - preventing re-pickup`);
        return;
      }

      // Clear the just-dropped flag if enough time has passed
      if (justDroppedRef.current && timeSinceDrop >= 200) {
        justDroppedRef.current = false;
      }

      // For cards and tokens: Shift+click immediately adds to cursor slot
      // Without Shift: track mouse movement, add to slot after 5px drag threshold

      // Store click start position for click detection
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // Cards and tokens use cursor slot drag system ONLY (no normal drag)
      if (item && (item.type === ItemType.CARD || item.type === ItemType.TOKEN)) {
        // Store item info for drag threshold detection (no timer, just movement)
        console.log(`[DRAG SYSTEM] Starting HOLD mode tracking - item: ${item.name} (${item.type})`);
        longPressItemRef.current = {
          id,
          item,
          startX: e.clientX,
          startY: e.clientY
        };
        // DO NOT set draggingId - cards/tokens use cursor slot system only
        return; // Don't proceed with normal drag system
      }

      // For other objects (dice, counters, etc.), use normal drag system
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
  // Ctrl+Shift+click: remove magnet point
  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    // Always update cursor position for slot visualization (needed when adding token to slot)
    const newCursorPosition = { x: e.clientX, y: e.clientY };
    setCursorPosition(newCursorPosition);
    // Also update ref immediately for synchronous access during render
    cursorPositionRef.current = newCursorPosition;

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

    // Check for drag movement - if mouse moves 5px while holding on a card/token, add to slot immediately
    if (longPressItemRef.current) {
      const moveThreshold = 5; // pixels
      const dx = e.clientX - longPressItemRef.current.startX;
      const dy = e.clientY - longPressItemRef.current.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= moveThreshold) {
        // Mouse moved enough - add to cursor slot for drag
        // Use same positioning logic as Shift+click (WITHOUT mousePosition) to avoid jump
        // The cursor will be positioned at card center, then follow mouse movement
        console.log(`[DRAG SYSTEM] Drag threshold reached (${distance.toFixed(1)}px) - switching to HOLD mode`);
        addToCursorSlot(longPressItemRef.current.id, longPressItemRef.current.item, 'hold');
        // IMPORTANT: Update cursor position to current mouse position AFTER adding to slot
        // This ensures the card center is at the mouse position from the start
        cursorPositionRef.current = { x: e.clientX, y: e.clientY };
        setCursorPosition({ x: e.clientX, y: e.clientY });
        longPressItemRef.current = null;
      }
    }

    if (isPanning) {
      // Direct scrollbar manipulation - synchronized with browser's scroll system
      const container = scrollContainerRef.current;
      if (container) {
        const startRef = dragStartRef.current;
        const deltaX = e.clientX - startRef.x;
        const deltaY = e.clientY - startRef.y;

        // Update scroll position directly (inverse of drag direction)
        container.scrollLeft = (startRef.scrollLeft || 0) - deltaX;
        container.scrollTop = (startRef.scrollTop || 0) - deltaY;
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

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: resizingId,
          width: newWidth,
          height: newHeight,
        },
      });
      return;
    }

    // Handle dragging
    // Note: Cards and tokens don't set draggingId, they use cursor slot system only
    if (draggingId) {
      const draggingObj = state.objects[draggingId];
      if (!draggingObj) return;

      // Pinned objects (boards, decks) and UI objects use screen coordinates directly
      const isPinned = (draggingObj as any).isPinnedToViewport === true;
      if (draggingObj.type === ItemType.PANEL || draggingObj.type === ItemType.WINDOW || isPinned) {
        const targetX = e.clientX - (dragOffsetRef.current?.x || 0);
        const targetY = e.clientY - (dragOffsetRef.current?.y || 0);

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
        const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
        if (deck?.cardOrientation === CardOrientation.HORIZONTAL) {
          // Horizontal cards have width and height swapped for display
          [draggingObjWidth, draggingObjHeight] = [draggingObjHeight, draggingObjWidth];
        }
      }

      const centerX = targetX + draggingObjWidth / 2;
      const centerY = targetY + draggingObjHeight / 2;

      const snapped = getSnappedCoordinates(centerX, centerY, state.objects, draggingId);

      dispatch({
        type: 'MOVE_OBJECT',
        payload: {
          id: draggingId,
          x: snapped.x,
          y: snapped.y,
        },
        _localOnly: true, // Don't send over network during drag
      });

      // Check if cursor is over a deck (for card-to-deck drop)
      if (draggingObj.type === ItemType.CARD) {
        // Convert cursor screen coordinates to world coordinates
        // Add scroll position to account for panning
        const worldX = p2v(e.clientX + state.viewTransform.scroll.x);
        const worldY = p2v(e.clientY + state.viewTransform.scroll.y);

        // First check if cursor is over any pile (piles take priority)
        let foundPile = null;
        for (const obj of Object.values(state.objects)) {
          if (obj.type === ItemType.DECK) {
            const deck = obj as DeckType;
            const visiblePiles = deck.piles?.filter(p => p.visible) || [];

            for (const pile of visiblePiles) {
              // Calculate pile position
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
                foundPile = pile.id;
                break;
              }
            }
            if (foundPile) break;
          }
        }

        setHoveredPileId(foundPile);

        // If not over a pile, check if over a deck
        if (!foundPile) {
          let foundDeck = null;
          Object.values(state.objects).forEach(obj => {
            if (obj.type === ItemType.DECK) {
              // Check if cursor is within deck bounds (accounting for rotation)
              if (isPointInRotatedRect(worldX, worldY, obj.x, obj.y, obj.width, obj.height, obj.rotation || 0)) {
                foundDeck = obj.id;
              }
            }
          });
          setHoveredDeckId(foundDeck);
        } else {
          setHoveredDeckId(null); // Clear deck hover when over pile
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
  }, [isPanning, resizingId, resizeStart, state.objects, state.activePlayerId, draggingId, draggingPile, offset, dispatch, cursorSlot, isPointInRotatedRect, currentTool, rulerStart, scrollContainerRef]);

  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Clear long-press timer if mouse is released before timeout
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Check if this was a card/token click without movement (longPressItemRef still set)
    const wasCardClickWithoutMovement = longPressItemRef.current !== null;

    if (wasCardClickWithoutMovement) {
      // This was just a click, not a drag - clear draggingId and handle click action
      const id = longPressItemRef.current!.id;
      longPressItemRef.current = null;

      // Clear draggingId since we're not dragging
      setDraggingId(null);

      // Now handle the click action
      const obj = state.objects[id];
      if (!obj) return;

      const now = Date.now();
      const DOUBLE_CLICK_DELAY = 300;

      // Get click action from object (for cards, inherit from deck)
      let singleClickAction = (obj as any)?.singleClickAction;
      let doubleClickAction = (obj as any)?.doubleClickAction;

      // For cards, use inherited settings from deck
      if (obj?.type === ItemType.CARD) {
        const cardSettings = getCardSettings(obj as CardType);
        singleClickAction = cardSettings.singleClickAction;
        doubleClickAction = cardSettings.doubleClickAction;
      }

      // Check if this is a double click
      const lastClick = clickTrackerRef.current;
      if (lastClick.objectId === id && now - lastClick.timestamp < DOUBLE_CLICK_DELAY) {
        // Double click detected
        const action = doubleClickAction;
        if (action) {
          executeClickAction(obj, action, e as React.MouseEvent);
        }
        clickTrackerRef.current = { objectId: null, timestamp: 0, clickCount: 0 };
        return;
      }

      // Single click - schedule execution after double click delay
      clickTrackerRef.current = {
        objectId: id,
        timestamp: now,
        clickCount: lastClick.clickCount + 1
      };

      setTimeout(() => {
        const currentTracker = clickTrackerRef.current;
        if (currentTracker.objectId === id && now === currentTracker.timestamp) {
          const action = singleClickAction;
          if (action) {
            executeClickAction(obj, action, e as React.MouseEvent);
          }
          clickTrackerRef.current = { objectId: null, timestamp: 0, clickCount: 0 };
        }
      }, DOUBLE_CLICK_DELAY);
      return;
    }

    longPressItemRef.current = null;

    // Note: Cursor slot drop on mouseup is handled by the global handler above
    // This handleMouseUp is only called when there's an active drag/pan/resize operation

    // Check if this was a click (not a drag or resize)
    const wasDragging = draggingId !== null;
    const wasResizing = resizingId !== null;
    const clientX = e?.clientX || dragStartRef.current.x;
    const clientY = e?.clientY || dragStartRef.current.y;

    // Calculate distance moved
    const distance = Math.sqrt(
      Math.pow(clientX - dragStartRef.current.x, 2) +
      Math.pow(clientY - dragStartRef.current.y, 2)
    );

    const wasClick = !wasResizing && distance < 5; // Less than 5px movement = click

    // Handle click detection and execution
    if (wasClick && wasDragging && draggingId) {
      const obj = state.objects[draggingId];
      const now = Date.now();
      const DOUBLE_CLICK_DELAY = 300; // ms

      // Get click action from object (for cards, inherit from deck)
      let singleClickAction = (obj as any)?.singleClickAction;
      let doubleClickAction = (obj as any)?.doubleClickAction;

      // For cards, use inherited settings from deck
      if (obj?.type === ItemType.CARD) {
        const cardSettings = getCardSettings(obj as CardType);
        singleClickAction = cardSettings.singleClickAction;
        doubleClickAction = cardSettings.doubleClickAction;
      }

      // Check if this is a double click
      const lastClick = clickTrackerRef.current;
      if (lastClick.objectId === draggingId && now - lastClick.timestamp < DOUBLE_CLICK_DELAY) {
        // Double click detected
        const action = doubleClickAction;
        if (action) {
          executeClickAction(obj, action, e as React.MouseEvent);
        }
        // Reset click tracker after double click
        clickTrackerRef.current = { objectId: null, timestamp: 0, clickCount: 0 };
      } else {
        // Single click - schedule execution after double click delay
        clickTrackerRef.current = {
          objectId: draggingId,
          timestamp: now,
          clickCount: lastClick.clickCount + 1
        };

        // Wait to see if this becomes a double click
        setTimeout(() => {
          const currentTracker = clickTrackerRef.current;
          if (currentTracker.objectId === draggingId && now === currentTracker.timestamp) {
            // Still the same click, execute single click action
            const action = singleClickAction;
            if (action) {
              executeClickAction(obj, action, e as React.MouseEvent);
            }
            clickTrackerRef.current = { objectId: null, timestamp: 0, clickCount: 0 };
          }
        }, DOUBLE_CLICK_DELAY);
      }
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
          setIsPanning(false);
          setResizingId(null);
          setResizeStart(null);
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

    // Notify that drag ended (for main menu and hand panel)
    // Only send card-drag-end if card was NOT added to a deck or pile
    if (draggingId && !cardAddedToDeckOrPile) {
      const draggingObj = state.objects[draggingId];
      if (draggingObj && draggingObj.type === ItemType.CARD) {
        // Send card-drag-end for hand panel to receive cards
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

        // Also send tabletop-drag-end for main menu
        if ((draggingObj as CardType).location === CardLocation.TABLE) {
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
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: draggingId, draggingPlayerId: null, broadcastX: undefined, broadcastY: undefined }
      });
    }

    setDraggingId(null);
    setIsPanning(false);
    setResizingId(null);
    setResizeStart(null);
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
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

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
          object: obj
      });
  }, [currentTool]);

  const executeMenuAction = (action: string) => {
      if (!contextMenu) return;
      const { object } = contextMenu;

      // Actions specific to context menu
      switch(action) {
          case 'configure':
              setContextMenu(null);
              // Token-copies don't have individual settings
              if (object.type === ItemType.TOKEN && (object as any).archetypeId) {
                  return; // Don't open settings for token-copies
              }
              setSettingsModalObj(object);
              return;
          case 'delete':
              setContextMenu(null);
              // Token-copies are deleted immediately without confirmation
              if (object.type === ItemType.TOKEN && (object as any).archetypeId) {
                  dispatch({ type: 'DELETE_OBJECT', payload: { id: object.id }});
                  return;
              }
              setDeleteCandidateId(object.id);
              return;
          case 'pinToViewport':
              let screenX: number, screenY: number;

              if (object.type === ItemType.PANEL || object.type === ItemType.WINDOW) {
                  // For UI objects, find the actual rendered element and get its screen position
                  const uiElement = document.querySelector(`[data-ui-object="${object.id}"]`) as HTMLElement;
                  if (uiElement) {
                      const rect = uiElement.getBoundingClientRect();
                      screenX = rect.left;
                      screenY = rect.top;
                  } else {
                      // Fallback: calculate from object position (unpinned UI objects use object.x directly)
                      screenX = object.x;
                      screenY = object.y;
                  }
              } else {
                  // For game objects (decks, etc.) in transform container
                  // CSS transform is: translate(offset) scale(zoom)
                  // So: screenX = (worldX + offset.x) * zoom
                  screenX = object.x + offset.x;
                  screenY = object.y + offset.y;
              }

              setContextMenu(null);
              dispatch({
                  type: 'PIN_TO_VIEWPORT',
                  payload: {
                      id: object.id,
                      screenX,
                      screenY
                  }
              });
              return;
          case 'unpinFromViewport':
              setContextMenu(null);
              // Convert viewport coordinates to world coordinates
              // For pinned objects, x/y are viewport coordinates (position: fixed)
              // For unpinned objects, x/y need to be world coordinates (position: absolute)
              let worldX: number, worldY: number;

              if (object.type === ItemType.PANEL || object.type === ItemType.WINDOW) {
                  // UI objects: For pinned UI objects, object.x/y ARE the current viewport coordinates
                  // To convert to world coordinates for unpinned: worldX = screenX / zoom + offset.x
                  // But for UI objects, they use position: absolute with left: object.x (no transform)
                  // So: worldX = object.x * zoom + offset.x
                  worldX = object.x + offset.x;
                  worldY = object.y + offset.y;
              } else {
                  // Game objects (decks, etc.): render in transform container
                  // For pinned game objects, visual position comes from pinnedScreenPosition
                  const pinnedPos = (object as any).pinnedScreenPosition;
                  if (!pinnedPos) {
                      // No pinned position - shouldn't happen, but use current position as fallback
                      worldX = object.x;
                      worldY = object.y;
                  } else {
                      // pinnedPos contains current viewport coordinates
                      // Convert to world coordinates: worldX = screenX / zoom - offset.x
                      worldX = pinnedPos.x - offset.x;
                      worldY = pinnedPos.y - offset.y;
                  }
              }

              dispatch({
                  type: 'UNPIN_FROM_VIEWPORT',
                  payload: { id: object.id, worldX, worldY }
              });
              return;
      }

      // Handle moveToPile actions (moveToPile-{pileId})
      if (action.startsWith('moveToPile-') && object.type === ItemType.CARD) {
          const pileId = action.replace('moveToPile-', '');
          const card = object as CardType;
          if (card.deckId) {
              dispatch({ type: 'ADD_CARD_TO_PILE', payload: { cardId: card.id, pileId, deckId: card.deckId }});
          }
          setContextMenu(null);
          return;
      }

      // Handle pile actions for decks (pile-{pileId})
      if (action.startsWith('pile-') && object.type === ItemType.DECK) {
          const pileId = action.replace('pile-', '');
          const deck = object as DeckType;
          const pile = deck.piles?.find(p => p.id === pileId);
          if (pile) {
              setSearchModalDeck(deck);
              setSearchModalPile(pile);
          }
          return;
      }

      // Handle hyperscale layer actions (moveToHyperscaleLayer:{layerId})
      if (action.startsWith('moveToHyperscaleLayer:')) {
          const layerId = action.replace('moveToHyperscaleLayer:', '');
          dispatch({
              type: 'MOVE_OBJECT_TO_HYPERSCALE_LAYER',
              payload: { objectId: object.id, layerId }
          });
          setContextMenu(null);
          return;
      }

      // Handle editNexusBoard action for NexusBoard - start editing mode
      if (action === 'editNexusBoard' && object.type === ItemType.NEXUS_BOARD) {
          setContextMenu(null);
          setNexusBoardAddingCell(object.id);
          return;
      }

      // Handle editNexusBoard action for NexusCellObject - use linked board
      if (action === 'editNexusBoard' && object.type === ItemType.NEXUS_CELL) {
          setContextMenu(null);
          setNexusBoardAddingCell((object as NexusCellObject).nexusBoardId);
          return;
      }

      // Handle closeNexusBoardEditing action for NexusBoard - stop editing mode
      if (action === 'closeNexusBoardEditing' && object.type === ItemType.NEXUS_BOARD) {
          setContextMenu(null);
          setNexusBoardAddingCell(null);
          return;
      }

      // Handle closeNexusBoardEditing action for NexusCellObject - use linked board
      if (action === 'closeNexusBoardEditing' && object.type === ItemType.NEXUS_CELL) {
          setContextMenu(null);
          setNexusBoardAddingCell(null);
          return;
      }

      // Handle deleteNexusBoard action for NexusCellObject - delete the whole board
      if (action === 'deleteNexusBoard' && object.type === ItemType.NEXUS_CELL) {
          setContextMenu(null);
          const cell = object as NexusCellObject;
          const boardId = cell.nexusBoardId;

          // Delete the NexusBoard (this will cascade to all cells)
          dispatch({ type: 'DELETE_OBJECT', payload: { id: boardId } });
          return;
      }

      // Handle deleteNexusBoard action for NexusBoard - delete the whole board
      if (action === 'deleteNexusBoard' && object.type === ItemType.NEXUS_BOARD) {
          setContextMenu(null);
          dispatch({ type: 'DELETE_OBJECT', payload: { id: object.id } });
          return;
      }

      // Reset counter to base value
      if (action === 'resetToBase' && object.type === ItemType.COUNTER) {
          setContextMenu(null);
          const counter = object as Counter;
          dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: object.id, value: counter.baseValue ?? 0 }
          });
          return;
      }

      // All other actions use the unified executeClickAction
      executeClickAction(object, action);
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
              break;
          case 'searchDeck':
              setSearchModalDeck(deck);
              setSearchModalPile(pile);
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
              break;
          case 'returnAll':
              executeClickAction(deck, 'returnAll');
              break;
          case 'showTop':
              dispatch({
                  type: 'TOGGLE_SHOW_TOP_CARD',
                  payload: { deckId: deck.id, pileId: pile.id }
              });
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
          if (obj.inCursorSlot) return false;
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
    // Fixed world size: WORLD_SIZE_VU × WORLD_SIZE_VU (in virtual units)
    // Convert to pixels for rendering (using local zoom-adjusted pixelsPerVU)
    const sizePx = vuToPixels(WORLD_SIZE_VU, pixelsPerVU);
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
      className={`w-full h-full bg-table overflow-auto relative ${
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

        const scrollLeft = target.scrollLeft;
        const scrollTop = target.scrollTop;

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
          obj.type !== ItemType.DECK &&
          obj.type !== ItemType.BOARD
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
      {/* Board background with grid pattern */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
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
                zIndex: -1
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
                if (obj.type === ItemType.BOARD) return null; // Boards shouldn't be in cursor slot

                // Calculate global z-index for remote objects
                const layer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                const layerOrder = layer?.order ?? 2;
                const globalZIndex = layerOrder * 10000 + (obj.zIndex ?? 0);

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
                                pixelsPerVU={pixelsPerVU}
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
                if (obj.type === ItemType.BOARD) return null;

                // Calculate global z-index for remote dragging objects
                const layer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                const layerMinZ = layer?.minZIndex ?? 3001;
                const globalZIndex = layerMinZ + (obj.zIndex ?? 0);

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
                                pixelsPerVU={pixelsPerVU}
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
                const layer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                const layerMinZ = layer?.minZIndex ?? 3001;
                const globalZIndex = layerMinZ + (obj.zIndex ?? 0);

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
                                pixelsPerVU={pixelsPerVU}
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
                const canDrag = !obj.locked;
                const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : (canDrag ? 'cursor-grab' : 'cursor-default');

                // Calculate global z-index using layer's minZIndex as base
                // This ensures tokens (3001-6000) always render above boards (1-1000)
                const layer = state.hyperscaleLayers.find(l => l.id === (obj.hyperscaleLayerId || 'tokens'));
                const layerMinZ = layer?.minZIndex ?? 3001;
                const globalZIndex = layerMinZ + (obj.zIndex ?? 0);

                // Get local zoom scale for this object's layer
                const objLayerId = obj.hyperscaleLayerId || 'tokens';
                const layerZoomScale = getLayerZoomScale(objLayerId);

                if (obj.type === ItemType.BOARD) {
                    // Skip pinned boards - they are rendered separately in fixed container
                    if ((obj as any).isPinnedToViewport === true) {
                        return null;
                    }

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
                                            v2p(board.width),
                                            v2p(board.height),
                                            globalZIndex,
                                            objLayer,
                                            { pointerEvents: isPermeable ? 'none' : 'auto' }
                                        )}
                                    >
                                    <BoardWithResizeMemo
                                        token={board}
                                        obj={obj}
                                        isOwner={isOwner}
                                        isDragging={isDragging}
                                        isResizing={isResizing}
                                        canResize={canResize}
                                        onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                                        onContextMenu={(e) => handleContextMenu(e, obj)}
                                        onResizeStart={(e) => isOwner && handleResizeStart(e, obj.id)}
                                        gridSize={gridSize}
                                        gridWidth={gridW_px}
                                        gridHeight={gridH_px}
                                        showGrid={board.showGrid}
                                        currentTool={currentTool}
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
                                className={`absolute flex items-center justify-center text-white font-bold select-none group ${currentTool !== 'none' ? 'cursor-default' : draggingClass}`}
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
                            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity z-20 pointer-events-none ${currentTool === 'none' ? 'group-hover:opacity-100' : ''}`}>
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
                                className={`absolute flex items-center justify-center select-none group ${currentTool !== 'none' ? 'cursor-default' : draggingClass}`}
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
                                    width={v2p(obj.width)}
                                    height={v2p(obj.height)}
                                    style={{ overflow: 'visible' }}
                                >
                                    <g transform={`translate(${v2p(obj.width) / 2}, ${v2p(obj.height) / 2})`}>
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
                                                        rx={v2p(ellipseRx)}
                                                        ry={v2p(ellipseRy)}
                                                        fill="none"
                                                        stroke="#22c55e"
                                                        strokeWidth={v2p(1.5)}
                                                        opacity={0.7}
                                                    />

                                                    {/* Magnet lines (from center to inscribed ellipse) */}
                                                    {/* Only show lines for points that have objects snapped OR if snapToGrid is enabled */}
                                                    {(cell.snapToGrid || cell.magnetPoints?.length > 0) && magnetPointCount > 1 && Array.from({ length: magnetPointCount }).map((_, index) => {
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
                                                                x2={v2p(endX)}
                                                                y2={v2p(endY)}
                                                                stroke={hasObject ? "#22c55e" : "#f59e0b"}
                                                                strokeWidth={v2p(hasObject ? 1.5 : 1)}
                                                                opacity={hasObject ? 0.8 : 0.4}
                                                            />
                                                        );
                                                    })}

                                                    {/* Magnet points - different style for occupied vs empty points */}
                                                    {magnetPointCount > 1 && Array.from({ length: magnetPointCount }).map((_, index) => {
                                                        const anglePerSlice = 360 / magnetPointCount;
                                                        const angle = (index * anglePerSlice + magnetRotation) * Math.PI / 180;
                                                        const lineLength = calcLineLength(angle);
                                                        const magnetRadius = lineLength * 0.6;
                                                        const magnetX = Math.cos(angle) * magnetRadius;
                                                        const magnetY = Math.sin(angle) * magnetRadius;
                                                        const hasObject = occupiedPointIndices.has(index);

                                                        return (
                                                            <circle
                                                                key={`magnet-point-${index}`}
                                                                cx={v2p(magnetX)}
                                                                cy={v2p(magnetY)}
                                                                r={v2p(hasObject ? 2.5 : 2)}
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
                                                            r={v2p(3)}
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
                                <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity z-20 pointer-events-none ${currentTool === 'none' ? 'group-hover:opacity-100' : ''}`}>
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
                                className={`absolute flex items-center justify-center select-none group ${currentTool !== 'none' ? 'cursor-default' : draggingClass}`}
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
                                    width={v2p(obj.width)}
                                    height={v2p(obj.height)}
                                    style={{ overflow: 'visible' }}
                                >
                                    <g transform={`translate(${v2p(obj.width) / 2}, ${v2p(obj.height) / 2})`}>
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
                                                        rx={v2p(ellipseRx)}
                                                        ry={v2p(ellipseRy)}
                                                        fill="none"
                                                        stroke="#22c55e"
                                                        strokeWidth={v2p(1.5)}
                                                        opacity={0.7}
                                                    />

                                                    {/* Magnet lines (from center to inscribed ellipse) */}
                                                    {/* Only show lines for points that have objects snapped OR if snapToGrid is enabled */}
                                                    {(cell.snapToGrid || cell.magnetPoints?.length > 0) && magnetPointCount > 1 && Array.from({ length: magnetPointCount }).map((_, index) => {
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
                                                                x2={v2p(endX)}
                                                                y2={v2p(endY)}
                                                                stroke={hasObject ? "#22c55e" : "#f59e0b"}
                                                                strokeWidth={v2p(hasObject ? 1.5 : 1)}
                                                                opacity={hasObject ? 0.8 : 0.4}
                                                            />
                                                        );
                                                    })}

                                                    {/* Magnet points - different style for occupied vs empty points */}
                                                    {magnetPointCount > 1 && Array.from({ length: magnetPointCount }).map((_, index) => {
                                                        const anglePerSlice = 360 / magnetPointCount;
                                                        const angle = (index * anglePerSlice + magnetRotation) * Math.PI / 180;
                                                        const lineLength = calcLineLength(angle);
                                                        const magnetRadius = lineLength * 0.6;
                                                        const magnetX = Math.cos(angle) * magnetRadius;
                                                        const magnetY = Math.sin(angle) * magnetRadius;
                                                        const hasObject = occupiedPointIndices.has(index);

                                                        return (
                                                            <circle
                                                                key={`magnet-point-${index}`}
                                                                cx={v2p(magnetX)}
                                                                cy={v2p(magnetY)}
                                                                r={v2p(hasObject ? 2.5 : 2)}
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
                                                            r={v2p(3)}
                                                            fill="#fbbf24"
                                                        />
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </g>
                                </svg>

                                {/* Action buttons */}
                                <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity z-20 pointer-events-none ${currentTool === 'none' ? 'group-hover:opacity-100' : ''}`}>
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
                                className={`absolute bg-slate-900 border-2 border-slate-600 rounded-lg shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none group ${currentTool !== 'none' ? 'cursor-default' : draggingClass}`}
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
                            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity z-20 pointer-events-none ${currentTool === 'none' ? 'group-hover:opacity-100' : ''}`}>
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
                            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 transition-opacity z-20 pointer-events-none ${currentTool === 'none' ? 'group-hover:opacity-100' : ''}`}>
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
                            className={`rounded-lg ${currentTool !== 'none' ? 'cursor-default' : draggingClass}`}
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
                                  pixelsPerVU={pixelsPerVU}
                                  disableRotationTransform={true}
                                  deckSpriteConfig={card.deckId ? (state.objects[card.deckId] as DeckType)?.spriteConfig : undefined}
                                  deckShowTooltipImage={card.deckId ? (state.objects[card.deckId] as DeckType)?.showTooltipImage : undefined}
                                  deckTooltipScale={card.deckId ? (state.objects[card.deckId] as DeckType)?.tooltipScale : undefined}
                                  onActionButtonClick={(action) => {
                                    switch (action) {
                                        case 'flip':
                                            dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id }});
                                            break;
                                        case 'moveToHand':
                                            dispatch({
                                                type: 'UPDATE_OBJECT',
                                                payload: {
                                                    id: obj.id,
                                                    location: CardLocation.HAND,
                                                    ownerId: state.activePlayerId,
                                                    isOnTable: false
                                                }
                                            });
                                            break;
                                        case 'moveToTopDeck': {
                                            const card = obj as CardType;
                                            if (card.deckId) {
                                                dispatch({ type: 'RETURN_CARD_TO_DECK_TOP', payload: { cardId: obj.id, deckId: card.deckId }});
                                            }
                                            break;
                                        }
                                        case 'moveToBottomDeck': {
                                            const card = obj as CardType;
                                            if (card.deckId) {
                                                dispatch({ type: 'RETURN_CARD_TO_DECK_BOTTOM', payload: { cardId: obj.id, deckId: card.deckId }});
                                            }
                                            break;
                                        }
                                        case 'moveToDiscard': {
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
                                            break;
                                        }
                                        case 'rotate':
                                            dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id }});
                                            break;
                                        case 'rotateClockwise':
                                            dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id }});
                                            break;
                                        case 'rotateCounterClockwise':
                                            dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: -(obj.rotationStep ?? 45) }});
                                            break;
                                        case 'swingClockwise':
                                            dispatch({ type: 'SWING_CLOCKWISE', payload: { id: obj.id }});
                                            break;
                                        case 'swingCounterClockwise':
                                            dispatch({ type: 'SWING_COUNTER_CLOCKWISE', payload: { id: obj.id }});
                                            break;
                                        case 'clone':
                                            dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id }});
                                            break;
                                        case 'lock':
                                            dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id }});
                                            break;
                                        case 'layer':
                                            dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id }});
                                            break;
                                    }
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
                const layer = state.hyperscaleLayers.find(l => l.id === (deckObj.hyperscaleLayerId || 'cards'));
                const layerMinZ = layer?.minZIndex ?? 1001;
                const globalZIndex = layerMinZ + (deckObj.zIndex ?? 0);
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
                const layer = state.hyperscaleLayers.find(l => l.id === (deckObj.hyperscaleLayerId || 'cards'));
                const layerMinZ = layer?.minZIndex ?? 1001;
                const globalZIndex = layerMinZ + (deckObj.zIndex ?? 0);

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

            {/* Pinned Boards - rendered in fixed container using pinnedScreenPosition */}
            {Object.values(state.objects).filter(obj =>
              obj.type === ItemType.BOARD && (obj as any).isPinnedToViewport === true
            ).map((obj) => {
                const board = obj as any;
                const pinnedPosition = board.pinnedScreenPosition;
                if (!pinnedPosition) return null;

                const gridSize = v2p(board.gridSize || 50); // Convert vu to pixels
                const gridW_px = v2p(board.gridWidth || board.gridSize || 50);
                const gridH_px = v2p(board.gridHeight || board.gridSize || 50);

                const isDragging = draggingId === board.id;
                const isResizing = resizingId === board.id;

                // For pinned boards, override position to 0,0 since the outer container
                // is already positioned at the pinned screen position
                const pinnedBoardObj = { ...board, x: 0, y: 0 };

                return (
                    <div
                        key={board.id}
                        className="pointer-events-auto"
                        style={{
                            position: 'absolute',
                            left: pinnedPosition.x,
                            top: pinnedPosition.y,
                            width: v2p(board.width),
                            height: v2p(board.height),
                            zIndex: board.zIndex || 1000,
                        }}
                    >
                        <BoardWithResizeMemo
                            token={board}
                            obj={pinnedBoardObj}
                            isOwner={true}
                            isDragging={isDragging}
                            isResizing={isResizing}
                            canResize={!board.locked}
                            onMouseDown={(e) => handleMouseDown(e, board.id)}
                            onContextMenu={(e) => handleContextMenu(e, board)}
                            onResizeStart={(e) => !board.locked && handleResizeStart(e, board.id)}
                            gridSize={gridSize}
                            gridWidth={gridW_px}
                            gridHeight={gridH_px}
                            showGrid={board.showGrid}
                        />
                        {/* Pinned indicator - top-right corner */}
                        <div
                            className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 pointer-events-none"
                            style={{ zIndex: 10001 }}
                            title="Pinned to screen"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <line x1="12" y1="17" x2="12" y2="22"></line>
                                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                            </svg>
                        </div>
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
                const canDrag = !obj.locked;
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
                object={contextMenu.object}
                isGM={isGM}
                onAction={executeMenuAction}
                onClose={() => setContextMenu(null)}
                allObjects={state.objects}
                language={state.language}
                nexusBoardEditingId={nexusBoardAddingCell}
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
                                    width: newDeck.cardWidth || newDeck.width,
                                    height: newDeck.cardHeight || newDeck.height,
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
    </div>
  );
};
