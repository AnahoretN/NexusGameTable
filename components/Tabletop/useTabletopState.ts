/**
 * Custom hook for Tabletop component local state
 * Manages all UI state that doesn't need to be in global state
 */

import { useState, useRef, useCallback } from 'react';
import {
  Card as CardType,
  Token as TokenType,
  Board as BoardType,
  TableObject,
  CardPile,
  Deck as DeckType
} from '../../types';
import { CursorSlotState, RulerState, ModalStates, ToolStates, DraggingStates, ResizeStates } from './types';

/**
 * Manage tool-related state (current tool, modifier keys)
 */
export const useToolState = () => {
  const [currentTool, setCurrentTool] = useState<string>('none');
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  return {
    currentTool,
    setCurrentTool,
    isShiftPressed,
    setIsShiftPressed,
    isCtrlPressed,
    setIsCtrlPressed,
    isPanning,
    setIsPanning
  };
};

/**
 * Manage cursor slot state
 */
export const useCursorSlotState = () => {
  const [cursorSlot, setCursorSlot] = useState<(CardType | TokenType | BoardType)[]>([]);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const cursorPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Update ref whenever position changes
  const updateCursorPosition = useCallback((position: { x: number; y: number } | null) => {
    setCursorPosition(position);
    cursorPositionRef.current = position;
  }, []);

  const [cursorSlotSource, setCursorSlotSource] = useState<'hold' | 'shift' | 'archetype' | null>(null);

  // Ref for immediate access in event handlers
  const cursorSlotRef = useRef<(CardType | TokenType | BoardType)[]>([]);
  cursorSlotRef.current = cursorSlot;

  return {
    cursorSlot,
    setCursorSlot,
    cursorPosition,
    updateCursorPosition,
    cursorPositionRef,
    cursorSlotSource,
    setCursorSlotSource
  };
};

/**
 * Manage ruler/measurement tool state
 */
export const useRulerState = () => {
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerCurrent, setRulerCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isRulerRightClick, setIsRulerRightClick] = useState(false);

  return {
    rulerStart,
    setRulerStart,
    rulerCurrent,
    setRulerCurrent,
    isRulerRightClick,
    setIsRulerRightClick
  };
};

/**
 * Manage modal/dialog states
 */
export const useModalStates = () => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    object: TableObject;
    shiftKey?: boolean;
  } | null>(null);

  const [settingsModalObj, setSettingsModalObj] = useState<TableObject | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const [pileContextMenu, setPileContextMenu] = useState<{
    x: number;
    y: number;
    pile: CardPile;
    deck: DeckType;
  } | null>(null);

  const [searchModalDeck, setSearchModalDeck] = useState<DeckType | null>(null);
  const [searchModalPile, setSearchModalPile] = useState<CardPile | undefined>(undefined);
  const [topDeckModalDeck, setTopDeckModalDeck] = useState<DeckType | null>(null);
  const [pilesButtonMenu, setPilesButtonMenu] = useState<{
    x: number;
    y: number;
    deck: DeckType;
  } | null>(null);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setSettingsModalObj(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteCandidateId(null);
  }, []);

  return {
    contextMenu,
    setContextMenu,
    settingsModalObj,
    setSettingsModalObj,
    deleteCandidateId,
    setDeleteCandidateId,
    pileContextMenu,
    setPileContextMenu,
    searchModalDeck,
    setSearchModalDeck,
    searchModalPile,
    setSearchModalPile,
    topDeckModalDeck,
    setTopDeckModalDeck,
    pilesButtonMenu,
    setPilesButtonMenu,
    closeContextMenu,
    closeSettingsModal,
    closeDeleteModal
  };
};

/**
 * Manage dragging state
 */
export const useDraggingState = () => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingPile, setDraggingPile] = useState<{
    pile: CardPile;
    deck: DeckType;
  } | null>(null);

  // Refs for immediate access in event handlers
  const draggingIdRef = useRef<string | null>(null);
  draggingIdRef.current = draggingId;

  const draggingPileRef = useRef<{
    pile: CardPile;
    deck: DeckType;
  } | null>(null);
  draggingPileRef.current = draggingPile;

  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartPositionRef = useRef<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const pileDragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Track pinned objects that were unpinned during drag
  // Map of objectId -> pinnedScreenPosition (to restore after drag)
  const unpinnedDuringDragRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  return {
    draggingId,
    setDraggingId,
    draggingPile,
    setDraggingPile,
    draggingIdRef,
    draggingPileRef,
    dragOffsetRef,
    dragStartPositionRef,
    pileDragStartRef,
    unpinnedDuringDragRef
  };
};

/**
 * Manage resize state for boards
 */
export const useResizeState = () => {
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [liveResizeSize, setLiveResizeSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Refs for immediate access in event handlers
  const liveResizeSizeRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  liveResizeSizeRef.current = liveResizeSize;

  const resizingIdRef = useRef<string | null>(null);
  resizingIdRef.current = resizingId;

  const resizeThrottleRef = useRef<number | null>(null);
  const resizeFinalSizeRef = useRef<{
    width: number;
    height: number;
  } | null>(null);

  return {
    resizingId,
    setResizingId,
    resizeStart,
    setResizeStart,
    liveResizeSize,
    setLiveResizeSize,
    liveResizeSizeRef,
    resizingIdRef,
    resizeThrottleRef,
    resizeFinalSizeRef
  };
};

/**
 * Manage dice rolling state
 */
export const useDiceState = () => {
  const [rollingDice, setRollingDice] = useState<Record<string, number>>({});

  // Track dice rolls we initiated
  const initiatedRollsRef = useRef<Set<string>>(new Set());
  const lastSeenRollStartTimeRef = useRef<Record<string, number>>({});

  return {
    rollingDice,
    setRollingDice,
    initiatedRollsRef,
    lastSeenRollStartTimeRef
  };
};

/**
 * Manage hover states
 */
export const useHoverState = () => {
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);
  const [hoveredPileId, setHoveredPileId] = useState<string | null>(null);

  const hoveredDeckRef = useRef<string | null>(null);
  hoveredDeckRef.current = hoveredDeckId;

  const hoveredPileRef = useRef<string | null>(null);
  hoveredPileRef.current = hoveredPileId;

  return {
    hoveredDeckId,
    setHoveredDeckId,
    hoveredPileId,
    setHoveredPileId,
    hoveredDeckRef,
    hoveredPileRef
  };
};

/**
 * Manage additional UI states
 */
export const useAdditionalUIState = () => {
  const [nexusBoardAddingCell, setNexusBoardAddingCell] = useState<string | null>(null);

  const [clickTooltip, setClickTooltip] = useState<{
    cardId: string;
    x: number;
    y: number;
  } | null>(null);

  const clickTooltipTimerRef = useRef<number | null>(null);
  const clickTooltipBoundsRef = useRef<{
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null>(null);

  return {
    nexusBoardAddingCell,
    setNexusBoardAddingCell,
    clickTooltip,
    setClickTooltip,
    clickTooltipTimerRef,
    clickTooltipBoundsRef
  };
};