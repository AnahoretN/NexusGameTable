
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { ItemType, CardLocation, TableObject, Card as CardType, Token as TokenType, DiceObject, Counter, TokenShape, GridType, CardPile, Deck as DeckType, CardOrientation, PanelObject, WindowObject, Board as BoardType } from '../types';
import { Card } from './Card';
import { ContextMenu } from './ContextMenu';
import { PileContextMenu } from './PileContextMenu';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { SearchDeckModal } from './SearchDeckModal';
import { TopDeckModal } from './TopDeckModal';
import { DeckComponent } from './DeckComponent';
import { UIObjectRenderer } from './UIObjectRenderer';
import { Layers, Lock, Minus, Plus, Search, RefreshCw, Trash2, Copy, RotateCw } from 'lucide-react';
import { useCardDrag } from '../hooks/useCardDrag';

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null;

// Board component with resize handles
interface BoardWithResizeProps {
    token: TokenType;
    obj: TableObject;
    isOwner: boolean;
    isDragging: boolean;
    isResizing: boolean;
    resizeHandle: ResizeHandle;
    canResize: boolean;
    zoom: number;
    getResizeCursor: (handle: ResizeHandle | null) => string;
    onMouseDown: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    gridSize: number;
    hexR: number;
    hexW: number;
    hexPath: string;
}

const BoardWithResize: React.FC<BoardWithResizeProps> = ({
    token,
    obj,
    isOwner,
    isDragging,
    isResizing,
    resizeHandle,
    canResize,
    zoom,
    getResizeCursor,
    onMouseDown,
    onContextMenu,
    gridSize,
    hexR,
    hexW,
    hexPath,
}) => {
    const [hoverHandle, setHoverHandle] = useState<ResizeHandle>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        // Get position relative to the visible element (can be negative if outside)
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert to board coordinates (0 to obj.width/height inside the element)
        // The element might be scaled by zoom, so we need to account for that
        const objWidth = obj.width ?? 100;
        const objHeight = obj.height ?? 100;
        const scaleX = objWidth / rect.width;
        const scaleY = objHeight / rect.height;
        const localX = mouseX * scaleX;
        const localY = mouseY * scaleY;

        // Check which edge we're on - threshold extends beyond the element
        // to allow grabbing from outside, centered on the border line
        const edgeThreshold = 6 / zoom;
        const leftEdge = localX < edgeThreshold;
        const rightEdge = localX > objWidth - edgeThreshold;
        const topEdge = localY < edgeThreshold;
        const bottomEdge = localY > objHeight - edgeThreshold;

        let handle: ResizeHandle = null;
        if (leftEdge && topEdge) handle = 'nw';
        else if (rightEdge && topEdge) handle = 'ne';
        else if (leftEdge && bottomEdge) handle = 'sw';
        else if (rightEdge && bottomEdge) handle = 'se';
        else if (topEdge) handle = 'n';
        else if (bottomEdge) handle = 's';
        else if (leftEdge) handle = 'w';
        else if (rightEdge) handle = 'e';

        setHoverHandle(canResize ? handle : null);
    }, [canResize, obj.width, obj.height, zoom]);

    const handleMouseLeave = useCallback(() => {
        setHoverHandle(null);
    }, []);

    const showGrid = token.gridType && token.gridType !== GridType.NONE;

    // Determine cursor based on hover state and action state
    const getCursor = useCallback(() => {
        if (isResizing && resizeHandle) {
            return getResizeCursor(resizeHandle);
        }
        if (isDragging) return 'grabbing';
        if (hoverHandle && canResize) return getResizeCursor(hoverHandle);
        return 'grab';
    }, [hoverHandle, canResize, isDragging, isResizing, resizeHandle, getResizeCursor]);

    const cursor = getCursor();

    // Edge highlight styles - centered on the border (2px thick, so offset by 1px)
    const edgeStyle = {
        position: 'absolute' as const,
        backgroundColor: 'rgba(250, 204, 21, 0.6)',
        transition: 'none',
        pointerEvents: 'none' as const,
    };

    // Edge thickness is 6/zoom, centered on the 2px border
    // So we position it at -1px offset (half of border) and extend by half thickness on each side
    const edgeThickness = 6 / zoom;

    return (
        <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
            className="absolute flex items-center justify-center text-white font-bold select-none hover:ring-2 ring-yellow-400"
            style={{
                left: obj.x,
                top: obj.y,
                width: obj.width,
                height: obj.height,
                backgroundColor: obj.content ? 'transparent' : (obj.color || '#34495e'),
                backgroundImage: obj.content ? `url(${obj.content})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                border: '2px solid white',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                transform: `rotate(${obj.rotation}deg)`,
                cursor: cursor,
            }}
        >
            {/* Grid overlay */}
            {showGrid && (
                <svg className="absolute inset-0 pointer-events-none opacity-50" width="100%" height="100%">
                    <defs>
                        {token.gridType === GridType.SQUARE && (
                            <pattern id={`grid-square-${obj.id}`} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                                <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="black" strokeWidth="1"/>
                            </pattern>
                        )}
                        {token.gridType === GridType.HEX && (
                            <pattern id={`grid-hex-${obj.id}`} width={hexW} height={gridSize * 3} patternUnits="userSpaceOnUse">
                                <path d={hexPath} fill="none" stroke="black" strokeWidth="1"/>
                            </pattern>
                        )}
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#grid-${token.gridType === GridType.SQUARE ? 'square' : 'hex'}-${obj.id})`} />
                </svg>
            )}

            {/* Resize edge highlights - shown when hovering over edges */}
            {/* Centered on the border line (border is 2px, positioned at edge) */}
            {canResize && hoverHandle && !isDragging && !isResizing && (
                <>
                    {/* Top edge - positioned above the element, centered on border */}
                    {(hoverHandle === 'n' || hoverHandle === 'nw' || hoverHandle === 'ne') && (
                        <div style={{ ...edgeStyle, top: -edgeThickness/2, left: 0, right: 0, height: edgeThickness }} />
                    )}
                    {/* Bottom edge - positioned below the element, centered on border */}
                    {(hoverHandle === 's' || hoverHandle === 'sw' || hoverHandle === 'se') && (
                        <div style={{ ...edgeStyle, bottom: -edgeThickness/2, left: 0, right: 0, height: edgeThickness }} />
                    )}
                    {/* Left edge - positioned left of the element, centered on border */}
                    {(hoverHandle === 'w' || hoverHandle === 'nw' || hoverHandle === 'sw') && (
                        <div style={{ ...edgeStyle, left: -edgeThickness/2, top: 0, bottom: 0, width: edgeThickness }} />
                    )}
                    {/* Right edge - positioned right of the element, centered on border */}
                    {(hoverHandle === 'e' || hoverHandle === 'ne' || hoverHandle === 'se') && (
                        <div style={{ ...edgeStyle, right: -edgeThickness/2, top: 0, bottom: 0, width: edgeThickness }} />
                    )}
                </>
            )}

        </div>
    );
};

export const Tabletop: React.FC = () => {
  const { state, dispatch } = useGame();
  const { startDrag: startCardDrag } = useCardDrag();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // Local state to handle the visual "rapid change" animation of dice
  const [rollingDice, setRollingDice] = useState<Record<string, number>>({});

  // Resizing state for boards
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number; objX: number; objY: number } | null>(null);

  // Free rotation state
  const [freeRotatingId, setFreeRotatingId] = useState<string | null>(null);
  const [rotateStartAngle, setRotateStartAngle] = useState<number>(0);
  const [rotateStartMouse, setRotateStartMouse] = useState<{ x: number; y: number } | null>(null);

  // Store the offset between cursor and object's top-left corner when dragging starts
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject } | null>(null);
  const [settingsModalObj, setSettingsModalObj] = useState<TableObject | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  // Pile context menu and search modal
  const [pileContextMenu, setPileContextMenu] = useState<{ x: number; y: number; pile: CardPile; deck: DeckType } | null>(null);
  const [searchModalDeck, setSearchModalDeck] = useState<DeckType | null>(null);
  const [searchModalPile, setSearchModalPile] = useState<CardPile | undefined>(undefined);
  const [topDeckModalDeck, setTopDeckModalDeck] = useState<DeckType | null>(null);
  const [pilesButtonMenu, setPilesButtonMenu] = useState<{ x: number; y: number; deck: DeckType } | null>(null);

  // Pile dragging state (for free position piles)
  const [draggingPile, setDraggingPile] = useState<{ pile: CardPile; deck: DeckType } | null>(null);
  const pileDragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Refs for drag states - used by global event handlers to check current state
  const draggingIdRef = useRef<string | null>(null);
  const isPanningRef = useRef(false);
  const resizingIdRef = useRef<string | null>(null);
  const draggingPileRef = useRef<{ pile: CardPile; deck: DeckType } | null>(null);
  const freeRotatingIdRef = useRef<string | null>(null);

  // Update refs when state changes
  useEffect(() => { draggingIdRef.current = draggingId; }, [draggingId]);
  useEffect(() => { isPanningRef.current = isPanning; }, [isPanning]);
  useEffect(() => { resizingIdRef.current = resizingId; }, [resizingId]);
  useEffect(() => { draggingPileRef.current = draggingPile; }, [draggingPile]);
  useEffect(() => { freeRotatingIdRef.current = freeRotatingId; }, [freeRotatingId]);

  // Track card being dragged from hand (via main menu)
  const [draggingCardFromHand, setDraggingCardFromHand] = useState<CardType | null>(null);
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);
  const [hoveredPileId, setHoveredPileId] = useState<string | null>(null);

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
    draggingCardRef.current = draggingCardFromHand;
  }, [draggingCardFromHand]);

  useEffect(() => {
    hoveredDeckRef.current = hoveredDeckId;
  }, [hoveredDeckId]);

  useEffect(() => {
    hoveredPileRef.current = hoveredPileId;
  }, [hoveredPileId]);

  // Pinned object positions are calculated at render time based on offset/zoom
  // Debug: track offset changes
  const prevOffsetRef = useRef({ x: 0, y: 0 });

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleMouseUpRef = useRef<(e?: MouseEvent | React.MouseEvent) => void>(() => {});
  const handleMouseMoveRef = useRef<(e: MouseEvent | React.MouseEvent) => void>(() => {});

  // Ref to always have current state for event listeners
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Debug: log offset changes (camera movement)
  useEffect(() => {
    const deltaX = offset.x - prevOffsetRef.current.x;
    const deltaY = offset.y - prevOffsetRef.current.y;

    // Only log if there's actual movement (not initial render)
    if (prevOffsetRef.current.x !== 0 || prevOffsetRef.current.y !== 0) {
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
        // Find pinned deck
        const pinnedDeck = Object.values(state.objects).find(obj =>
          (obj as any).isPinnedToViewport && obj.type === ItemType.DECK
        ) as any;

        if (pinnedDeck) {
          const oldDeckScreenX = pinnedDeck.x * zoom + prevOffsetRef.current.x;
          const oldDeckScreenY = pinnedDeck.y * zoom + prevOffsetRef.current.y;
          const newDeckScreenX = pinnedDeck.x * zoom + offset.x;
          const newDeckScreenY = pinnedDeck.y * zoom + offset.y;

          console.log('[OFFSET CHANGE]', {
            deckName: pinnedDeck.name,
            offsetDelta: { x: deltaX, y: deltaY },
            oldOffset: { ...prevOffsetRef.current },
            newOffset: { ...offset },
            deckWorldPos: { x: pinnedDeck.x, y: pinnedDeck.y },
            oldDeckScreenPos: { x: oldDeckScreenX, y: oldDeckScreenY },
            newDeckScreenPos: { x: newDeckScreenX, y: newDeckScreenY },
            deckScreenDelta: { x: newDeckScreenX - oldDeckScreenX, y: newDeckScreenY - oldDeckScreenY }
          });
        } else {
          console.log('[OFFSET CHANGE] No pinned deck found', {
            offsetDelta: { x: deltaX, y: deltaY },
            newOffset: { ...offset }
          });
        }
      }
    }

    prevOffsetRef.current = offset;
  }, [offset.x, offset.y, state.objects, zoom]);

  // Click tracking for single/double click detection
  const clickTrackerRef = useRef<{ objectId: string | null; timestamp: number; clickCount: number }>({
    objectId: null,
    timestamp: 0,
    clickCount: 0
  });

  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  const isGM = !!activePlayer?.isGM;

  // Listen for drag events from main menu (cards from hand)
  useEffect(() => {
    const handleDragStart = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardId: string; fromSearchWindow?: boolean }>;
      // Ignore drags from search window - they handle their own drop logic
      if (customEvent.detail.fromSearchWindow) return;

      const card = stateRef.current.objects[customEvent.detail.cardId] as CardType;
      if (card && card.type === ItemType.CARD) {
        setDraggingCardFromHand(card);
      }
    };

    const handleDragEnd = (e: Event) => {
      const customEvent = e as CustomEvent<{ cardId: string; clientX: number; clientY: number; fromSearchWindow?: boolean }>;
      // Ignore drags from search window - they handle their own drop logic
      if (customEvent.detail.fromSearchWindow) return;

      // Clear dragging card from hand
      setDraggingCardFromHand(null);

      const { cardId, clientX, clientY } = customEvent.detail;

      // Get current card from state (it may have been updated by UPDATE_OBJECT)
      const card = stateRef.current.objects[cardId] as CardType;

      if (!card || card.type !== ItemType.CARD) {
        return;
      }

      // Find if cursor is over any visible pile
      type PileInfo = { pile: CardPile; deck: DeckType; pileRect: { left: number; top: number; right: number; bottom: number } };
      let pileInfo: PileInfo | null = null;

      for (const obj of Object.values(stateRef.current.objects)) {
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

            // Convert to screen coordinates
            const currentViewTransform = stateRef.current.viewTransform;
            const screenX = pileX * currentViewTransform.zoom + currentViewTransform.offset.x;
            const screenY = pileY * currentViewTransform.zoom + currentViewTransform.offset.y;
            const screenWidth = obj.width * pileSize * currentViewTransform.zoom;
            const screenHeight = obj.height * pileSize * currentViewTransform.zoom;

            // Check if cursor is within pile bounds
            if (clientX >= screenX && clientX <= screenX + screenWidth &&
                clientY >= screenY && clientY <= screenY + screenHeight) {
              pileInfo = { pile, deck, pileRect: { left: screenX, top: screenY, right: screenX + screenWidth, bottom: screenY + screenHeight } };
              break; // Found pile, stop searching
            }
          }
          if (pileInfo) break; // Found pile in this deck, stop searching
        }
      }

      if (pileInfo) {
        dispatch({
          type: 'ADD_CARD_TO_PILE',
          payload: { cardId: card.id, pileId: pileInfo.pile.id, deckId: pileInfo.deck.id }
        });
        return;
      }

      // Check if dropping on a deck (original logic)
      let foundDeck = null;
      Object.values(stateRef.current.objects).forEach(obj => {
        if (obj.type === ItemType.DECK) {
          const currentViewTransform = stateRef.current.viewTransform;
          const screenX = obj.x * currentViewTransform.zoom + currentViewTransform.offset.x;
          const screenY = obj.y * currentViewTransform.zoom + currentViewTransform.offset.y;
          const screenWidth = obj.width * currentViewTransform.zoom;
          const screenHeight = obj.height * currentViewTransform.zoom;

          if (clientX >= screenX && clientX <= screenX + screenWidth &&
              clientY >= screenY && clientY <= screenY + screenHeight) {
            foundDeck = obj.id;
          }
        }
      });

      if (foundDeck) {
        dispatch({
          type: 'ADD_CARD_TO_TOP_OF_DECK',
          payload: { cardId: card.id, deckId: foundDeck }
        });
      }
    };

    // Handle card drag start from hand
    const handleCardDragStart = (e: Event) => {
      const customEvent = e as CustomEvent<{
        cardId: string | null;
        source: 'hand' | 'tabletop' | null;
      }>;

      if (customEvent.detail.source !== 'hand') return;
      if (!customEvent.detail.cardId) return;

      const card = stateRef.current.objects[customEvent.detail.cardId] as CardType;
      if (card && card.type === ItemType.CARD) {
        setDraggingCardFromHand(card);
      }
    };

    // Handle card drag from hand using useCardDrag hook
    const handleCardDragEnd = (e: Event) => {
      const customEvent = e as CustomEvent<{
        wasDragging: boolean;
        cardId: string | null;
        source: 'hand' | 'tabletop' | null;
        x: number;
        y: number;
      }>;

      // Always clear dragging card from hand when drag ends
      setDraggingCardFromHand(null);

      if (!customEvent.detail.wasDragging || customEvent.detail.source !== 'hand') return;
      if (!customEvent.detail.cardId) return;

      const { cardId, x: clientX, y: clientY } = customEvent.detail;

      // Get current card from state
      const card = stateRef.current.objects[cardId] as CardType;
      if (!card || card.type !== ItemType.CARD) return;

      // Find if cursor is over any visible pile
      type PileInfo = { pile: CardPile; deck: DeckType };
      let pileInfo: PileInfo | null = null;

      for (const obj of Object.values(stateRef.current.objects)) {
        if (obj.type === ItemType.DECK) {
          const deck = obj as DeckType;
          const visiblePiles = deck.piles?.filter(p => p.visible) || [];

          for (const pile of visiblePiles) {
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

            // Convert to screen coordinates
            const currentViewTransform = stateRef.current.viewTransform;
            const screenX = pileX * currentViewTransform.zoom + currentViewTransform.offset.x;
            const screenY = pileY * currentViewTransform.zoom + currentViewTransform.offset.y;
            const screenWidth = obj.width * pileSize * currentViewTransform.zoom;
            const screenHeight = obj.height * pileSize * currentViewTransform.zoom;

            // Check if cursor is within pile bounds
            if (clientX >= screenX && clientX <= screenX + screenWidth &&
                clientY >= screenY && clientY <= screenY + screenHeight) {
              pileInfo = { pile, deck };
              break;
            }
          }
          if (pileInfo) break;
        }
      }

      if (pileInfo) {
        dispatch({
          type: 'ADD_CARD_TO_PILE',
          payload: { cardId, pileId: pileInfo.pile.id, deckId: pileInfo.deck.id }
        });
        return;
      }

      // Check if dropping on a deck
      let foundDeck: string | null = null;
      Object.values(stateRef.current.objects).forEach(obj => {
        if (obj.type === ItemType.DECK) {
          const currentViewTransform = stateRef.current.viewTransform;
          const screenX = obj.x * currentViewTransform.zoom + currentViewTransform.offset.x;
          const screenY = obj.y * currentViewTransform.zoom + currentViewTransform.offset.y;
          const screenWidth = obj.width * currentViewTransform.zoom;
          const screenHeight = obj.height * currentViewTransform.zoom;

          if (clientX >= screenX && clientX <= screenX + screenWidth &&
              clientY >= screenY && clientY <= screenY + screenHeight) {
            foundDeck = obj.id;
          }
        }
      });

      if (foundDeck) {
        dispatch({
          type: 'ADD_CARD_TO_TOP_OF_DECK',
          payload: { cardId, deckId: foundDeck }
        });
        return;
      }

      // Otherwise, play card to table at drop position
      // Convert screen coordinates to world coordinates
      const currentViewTransform = stateRef.current.viewTransform;
      const worldX = (clientX - currentViewTransform.offset.x) / currentViewTransform.zoom;
      const worldY = (clientY - currentViewTransform.offset.y) / currentViewTransform.zoom;

      dispatch({
        type: 'PLAY_CARD',
        payload: { cardId, x: worldX, y: worldY }
      });
    };

    window.addEventListener('main-menu-drag-start', handleDragStart as EventListener);
    window.addEventListener('main-menu-drag-end', handleDragEnd as EventListener);
    window.addEventListener('card-drag-start', handleCardDragStart);
    window.addEventListener('card-drag-end', handleCardDragEnd);

    return () => {
      window.removeEventListener('main-menu-drag-start', handleDragStart as EventListener);
      window.removeEventListener('main-menu-drag-end', handleDragEnd as EventListener);
      window.removeEventListener('card-drag-start', handleCardDragStart);
      window.removeEventListener('card-drag-end', handleCardDragEnd);
    };
  }, [dispatch]);

  // --- Grid Snapping Logic ---
  const getSnappedCoordinates = (cursorX: number, cursorY: number, objects: Record<string, TableObject>, currentDraggingId: string | null): { x: number, y: number } => {
      const draggingObj = objects[currentDraggingId || ''];
      const objHalfW = draggingObj ? (draggingObj.width ?? 100) / 2 : 0;
      const objHalfH = draggingObj ? (draggingObj.height ?? 100) / 2 : 0;

      const boards = Object.values(objects).filter(obj => 
          obj.type === ItemType.TOKEN && 
          (obj as TokenType).shape === TokenShape.RECTANGLE && 
          (obj as TokenType).snapToGrid &&
          (obj as TokenType).gridType !== GridType.NONE &&
          obj.isOnTable &&
          obj.id !== currentDraggingId
      ) as TokenType[];

      for (const board of boards) {
          const relativeX = cursorX - board.x;
          const relativeY = cursorY - board.y;
          
          if (relativeX >= 0 && relativeX <= board.width && relativeY >= 0 && relativeY <= board.height) {
              const size = board.gridSize || 50;
              let targetCenterX = 0;
              let targetCenterY = 0;

              if (board.gridType === GridType.SQUARE) {
                  targetCenterX = board.x + (Math.floor(relativeX / size) * size) + (size / 2);
                  targetCenterY = board.y + (Math.floor(relativeY / size) * size) + (size / 2);
              } else if (board.gridType === GridType.HEX) {
                  const hexR = size;
                  const hexW = hexR * Math.sqrt(3);
                  const originOffsetX = hexW / 2;
                  const originOffsetY = hexR; 
                  
                  const dx = relativeX - originOffsetX;
                  const dy = relativeY - originOffsetY;

                  const q_raw = (Math.sqrt(3)/3 * dx - 1/3 * dy) / hexR;
                  const r_raw = (2/3 * dy) / hexR;
                  
                  let rx = Math.round(q_raw);
                  let ry = Math.round(r_raw);
                  let rz = Math.round(-q_raw - r_raw);

                  const x_diff = Math.abs(rx - q_raw);
                  const y_diff = Math.abs(ry - r_raw);
                  const z_diff = Math.abs(rz - (-q_raw - r_raw));

                  if (x_diff > y_diff && x_diff > z_diff) {
                      rx = -ry - rz;
                  } else if (y_diff > z_diff) {
                      ry = -rx - rz;
                  } else {
                      rz = -rx - ry;
                  }

                  const q = rx;
                  const r = ry;

                  const centerDx = hexR * Math.sqrt(3) * (q + r/2);
                  const centerDy = hexR * 3/2 * r;

                  targetCenterX = board.x + originOffsetX + centerDx;
                  targetCenterY = board.y + originOffsetY + centerDy;
              }

              const collisionThreshold = size * 0.4;
              const existingItems = Object.values(objects).filter(o => {
                  if (o.id === currentDraggingId || !o.isOnTable || o.locked) return false;
                  const oWidth = o.width ?? 100;
                  const oHeight = o.height ?? 100;
                  const oCenterX = o.x + (oWidth / 2);
                  const oCenterY = o.y + (oHeight / 2);
                  return Math.abs(oCenterX - targetCenterX) < collisionThreshold &&
                         Math.abs(oCenterY - targetCenterY) < collisionThreshold;
              });

              if (existingItems.length > 0) {
                  const offsetSize = 10 + (existingItems.length * 2);
                  targetCenterX += offsetSize;
                  targetCenterY += offsetSize;
              }

              return {
                  x: targetCenterX - objHalfW,
                  y: targetCenterY - objHalfH
              };
          }
      }

      return { x: cursorX - objHalfW, y: cursorY - objHalfH };
  };

  const animateDiceRoll = (dice: DiceObject) => {
    let steps = 0;
    const maxSteps = 10; // Change 10 times
    const duration = 500; // 0.5 seconds
    const intervalTime = duration / maxSteps;

    const interval = setInterval(() => {
        steps++;
        if (steps < maxSteps) {
            // Update local state for visual effect only
            setRollingDice(prev => ({
                ...prev,
                [dice.id]: Math.floor(Math.random() * dice.sides) + 1
            }));
        } else {
            clearInterval(interval);
            // Dispatch the actual game logic roll (which sets the final permanent value)
            dispatch({ type: 'ROLL_PHYSICAL_DICE', payload: { id: dice.id } });
            
            // Clear local override so the component displays the value from the store
            setRollingDice(prev => {
                const next = { ...prev };
                delete next[dice.id];
                return next;
            });
        }
    }, intervalTime);
  };

  // Check if cursor is near the edge of a board for resize
  const getResizeHandle = useCallback((cursorX: number, cursorY: number, obj: TokenType): ResizeHandle => {
    // Border is 2px, so threshold is 6px (3x wider than border), scaled by zoom
    const edgeThreshold = 6 / zoom;
    const leftEdge = Math.abs(cursorX - obj.x) < edgeThreshold;
    const rightEdge = Math.abs(cursorX - (obj.x + obj.width)) < edgeThreshold;
    const topEdge = Math.abs(cursorY - obj.y) < edgeThreshold;
    const bottomEdge = Math.abs(cursorY - (obj.y + obj.height)) < edgeThreshold;

    if (leftEdge && topEdge) return 'nw';
    if (rightEdge && topEdge) return 'ne';
    if (leftEdge && bottomEdge) return 'sw';
    if (rightEdge && bottomEdge) return 'se';
    if (topEdge) return 'n';
    if (bottomEdge) return 's';
    if (leftEdge) return 'w';
    if (rightEdge) return 'e';
    return null;
  }, [zoom]);

  // Get cursor style based on resize handle
  const getResizeCursor = (handle: ResizeHandle | null): string => {
    switch (handle) {
      case 'n': case 's': return 'ns-resize';
      case 'e': case 'w': return 'ew-resize';
      case 'ne': case 'sw': return 'nesw-resize';
      case 'nw': case 'se': return 'nwse-resize';
      default: return 'grab';
    }
  };

  const handleResizeStart = (e: React.MouseEvent, id: string, handle: ResizeHandle) => {
    e.stopPropagation();
    if (contextMenu) setContextMenu(null);

    const obj = state.objects[id];
    if (!obj || obj.locked) return;

    setResizingId(id);
    setResizeHandle(handle);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: obj.width ?? 100,
      height: obj.height ?? 100,
      objX: obj.x,
      objY: obj.y,
    });
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  // Execute a click action on an object
  const executeClickAction = useCallback((obj: TableObject, action: string) => {
    if (!action || action === 'none') return;

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
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: -(obj.rotationStep ?? 45) } });
        break;
      case 'freeRotate':
        setFreeRotatingId(obj.id);
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
        // Take the top card from deck and place it on the table at deck position with offset
        if (obj.type === ItemType.DECK) {
          const deck = obj as any;
          if (deck.cardIds && deck.cardIds.length > 0) {
            const topCardId = deck.cardIds[0]; // Top card is first element (index 0)
            // Remove from deck
            const newCardIds = deck.cardIds.slice(1);
            // Update deck
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: deck.id,
                cardIds: newCardIds
              }
            });
            // Update card - place it at deck position with slight offset down-left, use playTopFaceUp setting
            const faceUp = deck.playTopFaceUp ?? true;
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: topCardId,
                location: CardLocation.TABLE,
                x: deck.x + 10,
                y: deck.y + 10,
                faceUp: faceUp,
                zIndex: (deck.zIndex || 0) + 1
              }
            });
          }
        }
        break;
      case 'shuffleDeck':
        if (obj.type === ItemType.DECK) {
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
        // Return cards that belong to other decks back to their original decks
        // AND return all cards of THIS deck from hands, table, and ALL piles (own and other decks')
        if (obj.type === ItemType.DECK) {
          const currentDeck = obj as DeckType;


          // Collect all card IDs in this deck's MAIN deck only (not piles)
          const cardIdsInMainDeck = new Set(currentDeck.cardIds);

          // Group 1: Cards in current deck (main + piles) that belong to OTHER decks -> return them
          const cardsByOriginalDeck: Record<string, string[]> = {};
          const cardsToDelete: string[] = [];

          // Check main deck for foreign cards
          currentDeck.cardIds.forEach(cardId => {
            const card = state.objects[cardId] as CardType;
            if (card && card.deckId && card.deckId !== currentDeck.id) {
              const originalDeck = state.objects[card.deckId] as DeckType | undefined;
              if (originalDeck && originalDeck.type === ItemType.DECK) {
                if (!cardsByOriginalDeck[card.deckId]) {
                  cardsByOriginalDeck[card.deckId] = [];
                }
                cardsByOriginalDeck[card.deckId].push(card.id);
              } else {
                cardsToDelete.push(card.id);
              }
            }
          });

          // Check this deck's piles for foreign cards
          currentDeck.piles?.forEach(pile => {
            pile.cardIds.forEach(cardId => {
              const card = state.objects[cardId] as CardType;
              if (card && card.deckId && card.deckId !== currentDeck.id) {
                const originalDeck = state.objects[card.deckId] as DeckType | undefined;
                if (originalDeck && originalDeck.type === ItemType.DECK) {
                  if (!cardsByOriginalDeck[card.deckId]) {
                    cardsByOriginalDeck[card.deckId] = [];
                  }
                  if (!cardsByOriginalDeck[card.deckId].includes(card.id)) {
                    cardsByOriginalDeck[card.deckId].push(card.id);
                  }
                } else {
                  if (!cardsToDelete.includes(card.id)) {
                    cardsToDelete.push(card.id);
                  }
                }
              }
            });
          });

          // Group 2: ALL cards of THIS deck from everywhere (hands, table, ALL piles including own and other decks')
          const cardsOfThisDeck: string[] = [];

          // First, find cards from this deck's OWN piles that belong to this deck
          const cardsFromOwnPiles: string[] = [];

          currentDeck.piles?.forEach(pile => {
            pile.cardIds.forEach(cardId => {
              const card = state.objects[cardId] as CardType;
              if (card && card.deckId === currentDeck.id) {
                if (!cardsFromOwnPiles.includes(cardId)) {
                  cardsFromOwnPiles.push(cardId);
                }
              }
            });
          });

          // Add cards from own piles to cardsOfThisDeck
          cardsFromOwnPiles.forEach(cardId => {
            if (!cardsOfThisDeck.includes(cardId)) {
              cardsOfThisDeck.push(cardId);
            }
          });

          // Find cards from hands, table, and OTHER decks' piles
          let allCardsWithThisDeckId = 0;
          Object.values(state.objects).forEach(o => {
            if (o.type === ItemType.CARD && o.deckId === currentDeck.id) {
              allCardsWithThisDeckId++;
              const card = o as CardType;
              // Skip cards already in this deck's MAIN deck
              if (cardIdsInMainDeck.has(card.id)) return;
              // Skip cards from own piles (already added)
              if (cardsFromOwnPiles.includes(card.id)) return;
              // Card is in hand, on table, or in another deck's pile
              if (!cardsOfThisDeck.includes(card.id)) {
                cardsOfThisDeck.push(card.id);
              }
            }
          });

          // Also check ALL other decks for cards of this deck
          Object.values(state.objects).forEach(o => {
            if (o.type === ItemType.DECK) {
              const deck = o as DeckType;
              // Skip current deck
              if (deck.id === currentDeck.id) return;

              // Check main deck
              deck.cardIds.forEach(cardId => {
                const card = state.objects[cardId] as CardType;
                if (card?.deckId === currentDeck.id) {
                  if (!cardsOfThisDeck.includes(cardId)) {
                    cardsOfThisDeck.push(cardId);
                  }
                }
              });

              // Check piles
              deck.piles?.forEach(pile => {
                pile.cardIds.forEach(cardId => {
                  const card = state.objects[cardId] as CardType;
                  if (card?.deckId === currentDeck.id) {
                    if (!cardsOfThisDeck.includes(cardId)) {
                      cardsOfThisDeck.push(cardId);
                    }
                  }
                });
              });
            }
          });


          // Step 1: Remove foreign cards from current deck and piles
          const allForeignCardsToReturn = [...Object.values(cardsByOriginalDeck).flat(), ...cardsToDelete];

          if (allForeignCardsToReturn.length > 0) {
            // Remove from main deck
            const newCardIds = currentDeck.cardIds.filter(id => !allForeignCardsToReturn.includes(id));
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: currentDeck.id, cardIds: newCardIds }
            });

            // Remove from piles
            if (currentDeck.piles) {
              const updatedPiles = currentDeck.piles.map(pile => ({
                ...pile,
                cardIds: pile.cardIds.filter(id => !allForeignCardsToReturn.includes(id))
              }));
              dispatch({
                type: 'UPDATE_OBJECT',
                payload: { id: currentDeck.id, piles: updatedPiles }
              });
            }
          }

          // Step 2: Move cards from this deck's OWN piles to the main deck
          if (cardsFromOwnPiles.length > 0) {
            // Remove from piles AND add to main deck in a single update
            const updatedPiles = currentDeck.piles?.map(pile => ({
              ...pile,
              cardIds: pile.cardIds.filter(id => !cardsFromOwnPiles.includes(id))
            })) || [];

            // Add cards from own piles to the beginning of main deck
            const newCardIds = [...cardsFromOwnPiles, ...currentDeck.cardIds];

            dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: currentDeck.id, cardIds: newCardIds, piles: updatedPiles }
            });
          }

          // Step 3: Remove cards of this deck from other decks and piles
          Object.values(state.objects).forEach(o => {
            if (o.type === ItemType.DECK) {
              const deck = o as DeckType;
              if (deck.id === currentDeck.id) return;

              const cardsInThisDeck = deck.cardIds.filter(id => cardsOfThisDeck.includes(id));

              deck.piles?.forEach(pile => {
                const cardsInPile = pile.cardIds.filter(id => cardsOfThisDeck.includes(id));
                if (cardsInPile.length > 0 || cardsInThisDeck.length > 0) {
                  // Remove from main deck
                  const newMainCardIds = deck.cardIds.filter(id => !cardsOfThisDeck.includes(id));
                  dispatch({
                    type: 'UPDATE_OBJECT',
                    payload: { id: deck.id, cardIds: newMainCardIds }
                  });

                  // Remove from this pile
                  const updatedPiles = deck.piles?.map(p => ({
                    ...p,
                    cardIds: p.id === pile.id ? p.cardIds.filter(id => !cardsOfThisDeck.includes(id)) : p.cardIds
                  })) || [];

                  dispatch({
                    type: 'UPDATE_OBJECT',
                    payload: { id: deck.id, piles: updatedPiles }
                  });
                }
              });
            }
          });

          // Step 4: Return foreign cards to their original decks
          Object.keys(cardsByOriginalDeck).forEach(originalDeckId => {
            const cardIds = cardsByOriginalDeck[originalDeckId];
            cardIds.forEach(cardId => {
              dispatch({ type: 'RETURN_TO_DECK', payload: { cardId: cardId } });
            });
          });

          // Step 5: Delete cards whose original deck doesn't exist
          cardsToDelete.forEach(cardId => {
            dispatch({ type: 'DELETE_OBJECT', payload: { id: cardId } });
          });

          // Step 6: Return remaining cards of this deck back to this deck (from hands, table, other decks' piles)
          // Filter out cards from own piles (already moved)
          const cardsToReturn = cardsOfThisDeck.filter(id => !cardsFromOwnPiles.includes(id));
          cardsToReturn.forEach(cardId => {
            dispatch({ type: 'RETURN_TO_DECK', payload: { cardId: cardId } });
          });
        }
        break;
      case 'toHand':
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
      case 'delete':
        dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } });
        break;
      case 'clone':
        dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } });
        break;
      case 'lock':
        dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } });
        break;
      case 'layerUp':
        dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } });
        break;
      case 'layerDown':
        dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } });
        break;
      case 'showTop':
        if (obj.type === ItemType.DECK) {
          dispatch({ type: 'TOGGLE_SHOW_TOP_CARD', payload: { deckId: obj.id } });
        }
        break;
      case 'swingClockwise':
        dispatch({ type: 'SWING_CLOCKWISE', payload: { id: obj.id } });
        break;
      case 'swingCounterClockwise':
        dispatch({ type: 'SWING_COUNTER_CLOCKWISE', payload: { id: obj.id } });
        break;
    }
  }, [dispatch, state.activePlayerId, state.objects]);

  const handleMouseDown = (e: React.MouseEvent, id?: string) => {
    if (contextMenu) setContextMenu(null);

    // Check if clicking on a UI object - if it has an id, process normally
    // If no id (background), check for panning
    if (!id) {
      if (e.button === 0 && e.shiftKey) {
        setIsPanning(true);
        dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        return;
      }
    }

    if (id && e.button === 0) {
      e.stopPropagation();
      const item = state.objects[id];

      // Check if this is a UI object (panel or window) - handled differently
      if (item && (item.type === ItemType.PANEL || item.type === ItemType.WINDOW)) {
        if (item.locked) return;

        // UI objects use screen coordinates directly, not world coordinates
        setDraggingId(id);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        dragOffsetRef.current = {
          x: e.clientX - item.x,
          y: e.clientY - item.y
        };
        return;
      }

      // Check if we're in free rotation mode for this object
      if (freeRotatingId === id && item) {
        const objCenterX = item.x + (item.width ?? 100) / 2;
        const objCenterY = item.y + (item.height ?? 100) / 2;
        const mouseWorldX = (e.clientX - offset.x) / zoom;
        const mouseWorldY = (e.clientY - offset.y) / zoom;

        // Calculate initial angle from object center to mouse
        const startAngle = Math.atan2(mouseWorldY - objCenterY, mouseWorldX - objCenterX) * 180 / Math.PI;
        setRotateStartAngle(item.rotation - startAngle);
        setRotateStartMouse({ x: e.clientX, y: e.clientY });
        return;
      }

      // Check if this is a board and if we're clicking on the resize edge
      if (item && item.type === ItemType.TOKEN) {
        const token = item as TokenType;
        if (token.shape === TokenShape.RECTANGLE) {
          const mouseWorldX = (e.clientX - offset.x) / zoom;
          const mouseWorldY = (e.clientY - offset.y) / zoom;
          const handle = getResizeHandle(mouseWorldX, mouseWorldY, token);

          if (handle && !item.locked) {
            handleResizeStart(e, id, handle);
            return;
          }
        }
      }

      if (item && item.locked && !isGM) return;

      // Store click start position for click detection
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // For cards on tabletop, also start the card drag for hand drop
      if (item.type === ItemType.CARD) {
        startCardDrag(id, 'tabletop', e.nativeEvent);
      }

      setDraggingId(id);
      if (item) {
        // Bring dragged object to front (zIndex 9999)
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id, zIndex: 9999 }
        });

        // Calculate the offset from cursor to object's top-left corner
        // This keeps the object in the same position relative to cursor during drag
        const mouseWorldX = (e.clientX - offset.x) / zoom;
        const mouseWorldY = (e.clientY - offset.y) / zoom;
        dragOffsetRef.current = {
          x: mouseWorldX - item.x,
          y: mouseWorldY - item.y
        };
      }
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (isPanning) {
      const newOffset = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };

      // Log pan movement and find pinned deck
      const pinnedDeck = Object.values(state.objects).find(obj =>
        (obj as any).isPinnedToViewport && obj.type === ItemType.DECK
      ) as any;

      if (pinnedDeck) {
        const deckScreenX = pinnedDeck.x * zoom + offset.x;
        const deckScreenY = pinnedDeck.y * zoom + offset.y;
        const newDeckScreenX = pinnedDeck.x * zoom + newOffset.x;
        const newDeckScreenY = pinnedDeck.y * zoom + newOffset.y;

        console.log('[PAN DEBUG]', {
          deckName: pinnedDeck.name,
          offsetDelta: { x: newOffset.x - offset.x, y: newOffset.y - offset.y },
          oldOffset: offset,
          newOffset: newOffset,
          deckWorldPos: { x: pinnedDeck.x, y: pinnedDeck.y },
          oldDeckScreenPos: { x: deckScreenX, y: deckScreenY },
          newDeckScreenPos: { x: newDeckScreenX, y: newDeckScreenY },
          deckScreenDelta: { x: newDeckScreenX - deckScreenX, y: newDeckScreenY - deckScreenY }
        });
      }

      setOffset(newOffset);
      return;
    }

    // Handle free rotation
    if (freeRotatingId && rotateStartMouse) {
      const obj = state.objects[freeRotatingId];
      if (obj) {
        const objCenterX = obj.x + (obj.width ?? 100) / 2;
        const objCenterY = obj.y + (obj.height ?? 100) / 2;
        const mouseWorldX = (e.clientX - offset.x) / zoom;
        const mouseWorldY = (e.clientY - offset.y) / zoom;

        // Calculate current angle from object center to mouse
        const currentAngle = Math.atan2(mouseWorldY - objCenterY, mouseWorldX - objCenterX) * 180 / Math.PI;
        const newRotation = (currentAngle + rotateStartAngle + 360) % 360;

        dispatch({
          type: 'SET_ROTATION',
          payload: { id: freeRotatingId, rotation: newRotation }
        });
      }
      return;
    }

    // Handle resizing
    if (resizingId && resizeStart && resizeHandle) {
      const obj = state.objects[resizingId];
      if (!obj) return;

      const deltaX = (e.clientX - resizeStart.x) / zoom;
      const deltaY = (e.clientY - resizeStart.y) / zoom;

      const minSize = 100;
      let newWidth = resizeStart.width;
      let newHeight = resizeStart.height;
      let newX = resizeStart.objX;
      let newY = resizeStart.objY;

      // Calculate new dimensions and position based on resize handle
      if (resizeHandle.includes('e')) {
        newWidth = Math.max(minSize, resizeStart.width + deltaX);
      }
      if (resizeHandle.includes('w')) {
        const maxDelta = resizeStart.width - minSize;
        const validDelta = Math.min(deltaX, maxDelta);
        newWidth = resizeStart.width - validDelta;
        newX = resizeStart.objX + validDelta;
      }
      if (resizeHandle.includes('s')) {
        newHeight = Math.max(minSize, resizeStart.height + deltaY);
      }
      if (resizeHandle.includes('n')) {
        const maxDelta = resizeStart.height - minSize;
        const validDelta = Math.min(deltaY, maxDelta);
        newHeight = resizeStart.height - validDelta;
        newY = resizeStart.objY + validDelta;
      }

      dispatch({
        type: 'UPDATE_OBJECT',
        payload: {
          id: resizingId,
          width: newWidth,
          height: newHeight,
          x: newX,
          y: newY,
        },
      });
      return;
    }

    // Handle dragging
    if (draggingId) {
      const draggingObj = state.objects[draggingId];
      if (!draggingObj) return;

      // UI objects (panels and windows) use screen coordinates directly
      if (draggingObj.type === ItemType.PANEL || draggingObj.type === ItemType.WINDOW) {
        const targetX = e.clientX - (dragOffsetRef.current?.x || 0);
        const targetY = e.clientY - (dragOffsetRef.current?.y || 0);

        dispatch({
          type: 'MOVE_OBJECT',
          payload: {
            id: draggingId,
            x: targetX,
            y: targetY,
          },
        });
        return;
      }

      // Game objects use world coordinates with zoom and offset
      // Always update position - the world coordinates work correctly even when cursor is outside
      const mouseWorldX = (e.clientX - offset.x) / zoom;
      const mouseWorldY = (e.clientY - offset.y) / zoom;

      // Use the offset to position the object relative to cursor
      const targetX = mouseWorldX - (dragOffsetRef.current?.x || 0);
      const targetY = mouseWorldY - (dragOffsetRef.current?.y || 0);

      // getSnappedCoordinates expects the CENTER position, so add half dimensions
      const draggingObjWidth = draggingObj.width ?? 100;
      const draggingObjHeight = draggingObj.height ?? 100;
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
      });

      // Check if cursor is over a deck (for card-to-deck drop)
      if (draggingObj.type === ItemType.CARD) {
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

              // Convert to screen coordinates
              const screenX = pileX * zoom + offset.x;
              const screenY = pileY * zoom + offset.y;
              const screenWidth = obj.width * pileSize * zoom;
              const screenHeight = obj.height * pileSize * zoom;

              // Check if cursor is within pile bounds
              if (e.clientX >= screenX && e.clientX <= screenX + screenWidth &&
                  e.clientY >= screenY && e.clientY <= screenY + screenHeight) {
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
              // Convert deck position to screen coordinates
              const deckScreenX = obj.x * zoom + offset.x;
              const deckScreenY = obj.y * zoom + offset.y;
              const deckWidth = obj.width * zoom;
              const deckHeight = obj.height * zoom;

              // Check if cursor is within deck bounds
              if (e.clientX >= deckScreenX && e.clientX <= deckScreenX + deckWidth &&
                  e.clientY >= deckScreenY && e.clientY <= deckScreenY + deckHeight) {
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
      const mouseWorldX = (e.clientX - offset.x) / zoom;
      const mouseWorldY = (e.clientY - offset.y) / zoom;

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
        payload: { id: draggingPile.deck.id, piles: updatedPiles }
      });
    }
  }, [isPanning, resizingId, resizeStart, resizeHandle, state.objects, state.activePlayerId, draggingId, draggingPile, offset, zoom, dispatch, freeRotatingId, rotateStartAngle, rotateStartMouse]);

  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Debug: log when mouseup happens
    if (draggingId && e) {
      console.log('[Tabletop] handleMouseUp called', {
        draggingId,
        clientX: e.clientX,
        clientY: e.clientY,
        target: (e.target as HTMLElement)?.className,
      });
    }

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
          executeClickAction(obj, action);
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
              executeClickAction(obj, action);
            }
            clickTrackerRef.current = { objectId: null, timestamp: 0, clickCount: 0 };
          }
        }, DOUBLE_CLICK_DELAY);
      }
    }

    // Check if dropping a card onto a deck or pile
    if (draggingId) {
      const draggingObj = state.objects[draggingId];
      if (draggingObj && draggingObj.type === ItemType.CARD) {
        const clientX = e?.clientX ?? 0;
        const clientY = e?.clientY ?? 0;

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

              // Convert to screen coordinates
              const screenX = pileX * zoom + offset.x;
              const screenY = pileY * zoom + offset.y;
              const screenWidth = obj.width * pileSize * zoom;
              const screenHeight = obj.height * pileSize * zoom;

              // Check if cursor is within pile bounds
              if (clientX >= screenX && clientX <= screenX + screenWidth &&
                  clientY >= screenY && clientY <= screenY + screenHeight) {
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
          // Skip deck check if we found a pile
          setHoveredDeckId(null);
          setHoveredPileId(null);
          setDraggingId(null);
          setIsPanning(false);
          setResizingId(null);
          setResizeHandle(null);
          setResizeStart(null);
          dragOffsetRef.current = null;
          return;
        }

        // Check if dropping on a deck
        if (hoveredDeckId) {
          dispatch({
            type: 'ADD_CARD_TO_TOP_OF_DECK',
            payload: { cardId: draggingId, deckId: hoveredDeckId }
          });
        }
      }
    }

    // Notify that drag ended (for main menu)
    if (draggingId) {
      const draggingObj = state.objects[draggingId];
      if (draggingObj && draggingObj.type === ItemType.CARD && (draggingObj as CardType).location === CardLocation.TABLE) {
        window.dispatchEvent(new CustomEvent('tabletop-drag-end'));
      }
    }

    // Clear hover state
    setHoveredDeckId(null);
    setHoveredPileId(null);
    setDraggingId(null);
    setIsPanning(false);
    setResizingId(null);
    setResizeHandle(null);
    setResizeStart(null);
    dragOffsetRef.current = null;

    // Clear free rotation state
    setFreeRotatingId(null);
    setRotateStartAngle(0);
    setRotateStartMouse(null);

    // Clear pile dragging state
    setDraggingPile(null);
    pileDragStartRef.current = null;
  }, [draggingId, hoveredDeckId, hoveredPileId, state.objects, dispatch, executeClickAction, freeRotatingId]);

  // Keep handleMouseUp ref updated
  useEffect(() => {
    handleMouseUpRef.current = handleMouseUp;
  }, [handleMouseUp]);

  // Keep handleMouseMove ref updated
  useEffect(() => {
    handleMouseMoveRef.current = handleMouseMove;
  }, [handleMouseMove]);

  // Handle Escape key to cancel free rotation mode, Space for testing pin compensation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && freeRotatingId) {
        setFreeRotatingId(null);
        setRotateStartAngle(0);
        setRotateStartMouse(null);
      }
      // TEST: Spacebar manually compensates pinned deck position based on scroll
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        const pinnedDeck = Object.values(state.objects).find(obj =>
          (obj as any).isPinnedToViewport && obj.type === ItemType.DECK
        ) as DeckType | undefined;
        if (pinnedDeck && (pinnedDeck as any).pinnedScreenPosition) {
          const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
          const scrollTop = scrollContainerRef.current?.scrollTop || 0;
          // Manually compensate deck position
          const newRenderX = ((pinnedDeck as any).pinnedScreenPosition.x - offset.x + scrollLeft) / zoom;
          const newRenderY = ((pinnedDeck as any).pinnedScreenPosition.y - offset.y + scrollTop) / zoom;
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: pinnedDeck.id,
              x: newRenderX,
              y: newRenderY
            }
          });
          console.log('[SPACEBAR - Manual pin compensation]', {
            deckName: pinnedDeck.name,
            oldPosition: { x: pinnedDeck.x, y: pinnedDeck.y },
            newPosition: { x: newRenderX, y: newRenderY },
            scroll: { left: scrollLeft, top: scrollTop },
            offset,
            zoom
          });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [freeRotatingId, state.objects, offset, zoom]);

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
      const currentFreeRotatingId = freeRotatingIdRef.current;

      if (currentDraggingId || currentIsPanning || currentResizingId || currentDraggingPile || currentFreeRotatingId) {
        handleMouseUpRef.current(e);
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Use refs to check current state without depending on them
      const currentDraggingId = draggingIdRef.current;
      const currentIsPanning = isPanningRef.current;
      const currentResizingId = resizingIdRef.current;
      const currentDraggingPile = draggingPileRef.current;
      const currentFreeRotatingId = freeRotatingIdRef.current;

      if (currentDraggingId || currentIsPanning || currentResizingId || currentDraggingPile || currentFreeRotatingId) {
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

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        setZoom(z => Math.min(Math.max(0.2, z + scaleAmount), 3));
    }
  };

  // Sync offset and zoom changes to global state
  React.useEffect(() => {
    dispatch({
      type: 'UPDATE_VIEW_TRANSFORM',
      payload: { offset, zoom }
    });
  }, [offset, zoom, dispatch]);

  const handleContextMenu = (e: React.MouseEvent, obj: TableObject) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
          x: e.clientX,
          y: e.clientY,
          object: obj
      });
  };

  const executeMenuAction = (action: string) => {
      if (!contextMenu) return;
      const { object } = contextMenu;

      // Actions specific to context menu
      switch(action) {
          case 'configure':
              setSettingsModalObj(object);
              return;
          case 'delete':
              setDeleteCandidateId(object.id);
              return;
          case 'pinToViewport':
              // Calculate current screen position for the object
              // Need to account for scroll position since scrollbars move the viewport
              const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
              const scrollTop = scrollContainerRef.current?.scrollTop || 0;
              const screenX = object.x * zoom + offset.x - scrollLeft;
              const screenY = object.y * zoom + offset.y - scrollTop;
              console.log('[PIN ACTION - Saving screen position]', {
                  objectId: object.id,
                  objectName: 'name' in object ? object.name : (object.type),
                  worldPosition: { x: object.x, y: object.y },
                  offset,
                  scroll: { left: scrollLeft, top: scrollTop },
                  zoom,
                  calculatedScreenPosition: { x: screenX, y: screenY }
              });
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
              dispatch({ type: 'UNPIN_FROM_VIEWPORT', payload: { id: object.id } });
              return;
      }

      // Handle pile actions (pile-{pileId})
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

      // All other actions use the unified executeClickAction
      executeClickAction(object, action);
  };

  const handlePileContextMenu = (e: React.MouseEvent, pile: CardPile, deck: DeckType) => {
      e.preventDefault();
      e.stopPropagation();
      setPileContextMenu({
          x: e.clientX,
          y: e.clientY,
          pile,
          deck
      });
  };

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

  const tableObjects = (Object.values(state.objects) as TableObject[])
    .filter(obj => {
        // Exclude UI objects (panels and windows) - they have their own rendering
        if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) return false;
        if (!obj.isOnTable) return false;
        if (obj.type === ItemType.CARD) return (obj as CardType).location === CardLocation.TABLE;
        // Filter out hidden objects (visible === false)
        if ((obj as any).visible === false) return false;
        return true;
    })
    .sort((a, b) => {
        const zA = a.zIndex ?? 0;
        const zB = b.zIndex ?? 0;
        if (zA !== zB) return zA - zB;

        if (a.type === ItemType.TOKEN && (a as TokenType).shape === TokenShape.RECTANGLE) return -1;
        if (b.type === ItemType.TOKEN && (b as TokenType).shape === TokenShape.RECTANGLE) return 1;
        
        if (a.locked && !b.locked) return -1;
        if (!a.locked && b.locked) return 1;

        return 0;
    });

  // UI objects (panels and windows) - separate from game objects
  const uiObjects = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter(obj => obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW)
      .filter(obj => {
        if (obj.type === ItemType.PANEL) {
          return (obj as PanelObject).visible !== false;
        }
        if (obj.type === ItemType.WINDOW) {
          return (obj as WindowObject).visible !== false;
        }
        return true;
      })
      .sort((a, b) => (a.zIndex || 1000) - (b.zIndex || 1000));
  }, [state.objects]);

  const worldBounds = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    tableObjects.forEach(obj => {
        const objWidth = obj.width ?? 100;
        const objHeight = obj.height ?? 100;
        const right = obj.x + objWidth;
        const bottom = obj.y + objHeight;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
    });
    return { width: Math.max(maxX + 500, window.innerWidth), height: Math.max(maxY + 500, window.innerHeight) };
  }, [tableObjects]);

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
      className="w-full h-full bg-table overflow-auto relative cursor-grab active:cursor-grabbing"
      onMouseDown={(e) => handleMouseDown(e)}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onScroll={(e) => {
        const target = e.target as HTMLElement;
        if (target.scrollLeft === undefined || target.scrollTop === undefined) return;

        // Find all pinned objects and update their positions
        const pinnedObjects = Object.values(state.objects).filter(obj =>
          (obj as any).isPinnedToViewport
        );

        if (pinnedObjects.length > 0) {
          const scrollLeft = target.scrollLeft;
          const scrollTop = target.scrollTop;

          pinnedObjects.forEach(obj => {
            const pinnedObj = obj as any;
            if (pinnedObj.pinnedScreenPosition) {
              let newX: number;
              let newY: number;

              // UI panels/windows are NOT in the transform container, so no zoom/offset affect
              if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) {
                // For UI objects: screenX = obj.x - scrollLeft
                // We want: screenX = pinnedScreenPosition.x
                // So: obj.x = pinnedScreenPosition.x + scrollLeft
                newX = pinnedObj.pinnedScreenPosition.x + scrollLeft;
                newY = pinnedObj.pinnedScreenPosition.y + scrollTop;
              } else {
                // For game objects in transform container: screenX = obj.x * zoom + offset.x - scrollLeft
                // We want: screenX = pinnedScreenPosition.x
                // So: obj.x = (pinnedScreenPosition.x - offset.x + scrollLeft) / zoom
                newX = (pinnedObj.pinnedScreenPosition.x - offset.x + scrollLeft) / zoom;
                newY = (pinnedObj.pinnedScreenPosition.y - offset.y + scrollTop) / zoom;
              }

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
        // Handle drop from hand panel (when dropped outside the transformed area)
        e.preventDefault();
        e.stopPropagation();
        const cardId = e.dataTransfer.getData('text/plain');
        if (cardId && state.objects[cardId]) {
            const card = state.objects[cardId] as CardType;
            if (card.type === ItemType.CARD && card.location === CardLocation.HAND) {
                // Calculate world position for the card
                const worldX = (e.clientX - offset.x) / zoom - (card.width ?? 100) / 2;
                const worldY = (e.clientY - offset.y) / zoom - (card.height ?? 140) / 2;

                // Cards on table get zIndex 9999 (same as dragging, above panels at 9998)
                dispatch({
                    type: 'UPDATE_OBJECT',
                    payload: {
                        id: cardId,
                        location: CardLocation.TABLE,
                        x: worldX,
                        y: worldY,
                        isOnTable: true,
                        faceUp: true,
                        zIndex: 9999,
                        ownerId: undefined
                    }
                });
            }
        }
      }}
      style={{
        backgroundImage: 'radial-gradient(#34495e 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        cursor: freeRotatingId ? 'crosshair' : undefined
      }}
    >
      {/* Free rotation mode indicator */}
      {freeRotatingId && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg z-[1000] flex items-center gap-2">
          <RotateCw size={16} className="animate-spin" />
          <span className="text-sm font-medium">Free Rotation Mode - Drag to rotate, press ESC to exit</span>
        </div>
      )}

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

        <div
            data-tabletop="true"
            className="absolute origin-top-left transition-transform duration-0 ease-linear"
            style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
        >
            {/* All objects in unified space */}
            {tableObjects.map((obj) => {
                const isOwner = !obj.ownerId || obj.ownerId === state.activePlayerId || isGM;
                const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : 'cursor-grab';

                if (obj.type === ItemType.BOARD) {
                    const board = obj as BoardType;
                    const isResizing = resizingId === obj.id;
                    const isDragging = draggingId === obj.id;
                    const canResize = !obj.locked;
                    const currentResizeHandle = isResizing ? resizeHandle : null;
                    const showGrid = board.gridType && board.gridType !== GridType.NONE;
                    const gridSize = board.gridSize || 50;

                    const hexR = gridSize;
                    const hexW = hexR * Math.sqrt(3);
                    const hexPath =
                      `M 0 ${hexR/2} ` +
                      `L ${hexW/2} 0 ` +
                      `L ${hexW} ${hexR/2} ` +
                      `L ${hexW} ${hexR*1.5} ` +
                      `L ${hexW/2} ${hexR*2} ` +
                      `L 0 ${hexR*1.5} Z ` +
                      `M ${hexW/2} ${hexR*2} L ${hexW/2} ${hexR*3}`;

                    return (
                        <BoardWithResize
                            key={obj.id}
                            token={board}
                            obj={obj}
                            isOwner={isOwner}
                            isDragging={isDragging}
                            isResizing={isResizing}
                            resizeHandle={currentResizeHandle}
                            canResize={canResize}
                            zoom={zoom}
                            getResizeCursor={getResizeCursor}
                            onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                            onContextMenu={(e) => handleContextMenu(e, obj)}
                            gridSize={gridSize}
                            hexR={hexR}
                            hexW={hexW}
                            hexPath={hexPath}
                        />
                    );
                }

                if (obj.type === ItemType.TOKEN) {
                    const token = obj as TokenType;
                    const borderRadius = token.shape === TokenShape.CIRCLE ? '50%' 
                        : token.shape === TokenShape.SQUARE ? '8px' 
                        : token.shape === TokenShape.RECTANGLE ? '0px'
                        : '4px';
                    
                    const isStandee = token.shape === TokenShape.STANDEE;
                    
                    const isBoard = token.shape === TokenShape.RECTANGLE;
                    const showGrid = isBoard && token.gridType && token.gridType !== GridType.NONE;
                    const gridSize = token.gridSize || 50;

                    const hexR = gridSize;
                    const hexW = hexR * Math.sqrt(3);
                    const hexPath = 
                      `M 0 ${hexR/2} ` +
                      `L ${hexW/2} 0 ` +
                      `L ${hexW} ${hexR/2} ` +
                      `L ${hexW} ${hexR*1.5} ` +
                      `L ${hexW/2} ${hexR*2} ` +
                      `L 0 ${hexR*1.5} Z ` +
                      `M ${hexW/2} ${hexR*2} L ${hexW/2} ${hexR*3}`;

                    // Special rendering for boards (RECTANGLE tokens) with resize capability
                    if (isBoard) {
                        const isResizing = resizingId === obj.id;
                        const isDragging = draggingId === obj.id;
                        const canResize = !obj.locked;
                        const currentResizeHandle = isResizing ? resizeHandle : null;

                        return (
                            <BoardWithResize
                                key={obj.id}
                                token={token}
                                obj={obj}
                                isOwner={isOwner}
                                isDragging={isDragging}
                                isResizing={isResizing}
                                resizeHandle={currentResizeHandle}
                                canResize={canResize}
                                zoom={zoom}
                                getResizeCursor={getResizeCursor}
                                onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                gridSize={gridSize}
                                hexR={hexR}
                                hexW={hexW}
                                hexPath={hexPath}
                            />
                        );
                    }

                    return (
                        <div
                            key={obj.id}
                            onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                            onContextMenu={(e) => handleContextMenu(e, obj)}
                            className={`absolute flex items-center justify-center text-white font-bold select-none hover:ring-2 ring-yellow-400 ${draggingClass} ${isStandee ? 'origin-bottom' : ''} group`}
                            style={{
                                left: obj.x,
                                top: obj.y,
                                width: obj.width,
                                height: obj.height,
                                borderRadius: borderRadius,
                                backgroundColor: obj.content ? 'transparent' : (obj.color || '#e74c3c'),
                                backgroundImage: obj.content ? `url(${obj.content})` : undefined,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                border: isStandee ? 'none' : '2px solid white',
                                boxShadow: isStandee ? 'none' : '0 4px 6px rgba(0,0,0,0.3)',
                                transform: `rotate(${obj.rotation}deg)`
                            }}
                        >
                            {(obj as any).isPinnedToViewport && (
                                <div
                                    className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
                                    title="Pinned to screen"
                                    style={{ transform: `scale(${1/zoom})` }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <line x1="12" y1="17" x2="12" y2="22"></line>
                                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                </div>
                            )}
                            {showGrid && (
                                <svg className="absolute inset-0 pointer-events-none opacity-50" width="100%" height="100%">
                                    <defs>
                                        {token.gridType === GridType.SQUARE && (
                                            <pattern id={`grid-square-${obj.id}`} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                                                <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="black" strokeWidth="1"/>
                                            </pattern>
                                        )}
                                        {token.gridType === GridType.HEX && (
                                            <pattern id={`grid-hex-${obj.id}`} width={hexW} height={gridSize * 3} patternUnits="userSpaceOnUse">
                                                <path d={hexPath} fill="none" stroke="black" strokeWidth="1"/>
                                            </pattern>
                                        )}
                                    </defs>
                                    <rect width="100%" height="100%" fill={`url(#grid-${token.gridType === GridType.SQUARE ? 'square' : 'hex'}-${obj.id})`} />
                                </svg>
                            )}

                            {isStandee && (
                                <div className="absolute bottom-0 w-full h-4 bg-black/50 rounded-full blur-sm translate-y-2 scale-x-75"/>
                            )}
                            {isStandee && (
                                <div className="w-full h-full border-2 border-white bg-cover bg-center"
                                     style={{backgroundImage: `url(${obj.content || 'https://via.placeholder.com/150'})`}} />
                            )}

                            {!obj.content && !isStandee && obj.name.charAt(0)}

                            {/* Action buttons */}
                            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
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
                                            action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: 90 } }),
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
                    );
                }

                if (obj.type === ItemType.COUNTER) {
                    const counter = obj as Counter;
                    return (
                        <div
                            key={obj.id}
                            onMouseDown={(e) => handleMouseDown(e, obj.id)}
                            onContextMenu={(e) => handleContextMenu(e, obj)}
                            className={`absolute bg-slate-900 border-2 border-slate-600 rounded-lg shadow-xl flex items-center justify-between p-2 gap-2 text-white select-none ${draggingClass} group`}
                            style={{
                                left: obj.x,
                                top: obj.y,
                                width: Math.max(obj.width, 100),
                                height: 50,
                                transform: `rotate(${obj.rotation}deg)`
                            }}
                        >
                            {(obj as any).isPinnedToViewport && (
                                <div
                                    className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
                                    title="Pinned to screen"
                                    style={{ transform: `scale(${1/zoom})` }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <line x1="12" y1="17" x2="12" y2="22"></line>
                                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                </div>
                            )}
                            <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: -1 }})}><Minus size={14}/></button>
                            <span className="text-xl font-bold">{counter.value}</span>
                            <button className="p-1 hover:bg-slate-700 rounded" onMouseDown={(e) => e.stopPropagation()} onClick={() => dispatch({type: 'UPDATE_COUNTER', payload: { id: obj.id, delta: 1 }})}><Plus size={14}/></button>
                            <div className="absolute -bottom-4 w-full text-center text-[10px] text-gray-400 truncate">{obj.name}</div>

                            {/* Action buttons */}
                            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
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
                                            action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: 90 } }),
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
                    );
                }

                if (obj.type === ItemType.DICE_OBJECT) {
                    const dice = obj as DiceObject;

                    return (
                        <div
                            key={obj.id}
                            onMouseDown={(e) => handleMouseDown(e, obj.id)}
                            onContextMenu={(e) => handleContextMenu(e, obj)}
                            className={`absolute bg-indigo-600 text-white flex flex-col items-center justify-center rounded-lg shadow-xl border-2 border-indigo-400 group ${draggingClass}`}
                            style={{
                                left: obj.x,
                                top: obj.y,
                                width: 60,
                                height: 60,
                                transform: `rotate(${obj.rotation}deg)`
                            }}
                        >
                            {(obj as any).isPinnedToViewport && (
                                <div
                                    className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
                                    title="Pinned to screen"
                                    style={{ transform: `scale(${1/zoom})` }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <line x1="12" y1="17" x2="12" y2="22"></line>
                                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                </div>
                            )}
                            <span className="text-2xl font-bold">{rollingDice[dice.id] ?? dice.currentValue}</span>
                            <span className="text-[8px] opacity-75">d{dice.sides}</span>

                            {/* Action buttons */}
                            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
                                {(() => {
                                    const actionButtons = obj.actionButtons || [];
                                    const buttonConfigs: Record<string, { key: string; action: () => void; className: string; title: string; icon: React.ReactNode }> = {
                                        rotate: {
                                            key: 'rotate',
                                            action: () => dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: 90 } }),
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
                    );
                }
                
                if (obj.type === ItemType.DECK) {
                    const deck = obj as DeckType;

                    return (
                        <div key={obj.id} style={{ position: 'relative' }}>
                            {(obj as any).isPinnedToViewport && (
                                <div
                                    className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
                                    title="Pinned to screen"
                                    style={{ transform: `scale(${1/zoom})` }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <line x1="12" y1="17" x2="12" y2="22"></line>
                                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                </div>
                            )}
                            <DeckComponent
                                deck={deck}
                                isDraggingCardFromHand={draggingCardFromHand !== null}
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
                            />
                        </div>
                    );
                }

                if (obj.type === ItemType.CARD) {
                    const card = obj as CardType;
                    const cardSettings = getCardSettings(card);
                    // For horizontal orientation, swap width and height for display
                    const isHorizontal = cardSettings.cardOrientation === CardOrientation.HORIZONTAL;
                    const actualCardWidth = card.width ?? cardSettings.cardWidth ?? 100;
                    const actualCardHeight = card.height ?? cardSettings.cardHeight ?? 140;
                    const displayWidth = isHorizontal ? actualCardHeight : actualCardWidth;
                    const displayHeight = isHorizontal ? actualCardWidth : actualCardHeight;

                    const isDragging = draggingId === obj.id;

                    return (
                        <div
                            key={obj.id}
                            data-tabletop-card="true"
                            style={{
                                left: obj.x,
                                top: obj.y,
                                position: 'absolute',
                                transform: `rotate(${obj.rotation}deg)`,
                            }}
                            onMouseDown={(e) => handleMouseDown(e, obj.id)}
                            onContextMenu={(e) => handleContextMenu(e, obj)}
                            className={`${draggingClass} rounded-lg`}
                        >
                            {(obj as any).isPinnedToViewport && (
                                <div
                                    className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
                                    title="Pinned to screen"
                                    style={{ transform: `scale(${1/zoom})` }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <line x1="12" y1="17" x2="12" y2="22"></line>
                                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                </div>
                            )}
                            <div style={{ transform: `rotate(${-obj.rotation}deg)` }}>
                              <Card
                                  card={card}
                                  canFlip={isGM || (cardSettings.actionButtons !== undefined && cardSettings.actionButtons.includes('flip'))}
                                  onFlip={() => dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id }})}
                                  showActionButtons={true}
                                  actionButtons={cardSettings.actionButtons}
                                  overrideWidth={displayWidth}
                                  overrideHeight={displayHeight}
                                  cardNamePosition={cardSettings.cardNamePosition}
                                  cardOrientation={cardSettings.cardOrientation}
                                  disableRotationTransform={true}
                                  onActionButtonClick={(action) => {
                                    switch (action) {
                                        case 'flip':
                                            dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id }});
                                            break;
                                        case 'toHand':
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
                                        case 'rotate':
                                            dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: 90 }});
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
                            />
                            </div>
                        </div>
                    )
                }
                return null;
            })}

            {/* UI Objects - Panels and Windows rendered in the same unified space */}
            {uiObjects.map((uiObj) => (
                <UIObjectRenderer
                    key={uiObj.id}
                    uiObject={uiObj as PanelObject | WindowObject}
                    isDragging={draggingId === uiObj.id}
                    onMouseDown={handleMouseDown}
                    offset={offset}
                    zoom={zoom}
                />
            ))}

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
            />
        )}

        {settingsModalObj && (
            <ObjectSettingsModal
                object={settingsModalObj}
                onClose={() => setSettingsModalObj(null)}
                onSave={(updatedObj) => {
                    dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });

                    // If updating a deck and card dimensions changed, update all cards
                    if (settingsModalObj.type === ItemType.DECK && updatedObj.type === ItemType.DECK) {
                        const oldDeck = settingsModalObj as DeckType;
                        const newDeck = updatedObj as DeckType;

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
                    }
                }}
            />
        )}

        {deleteCandidateId && (
            <DeleteConfirmModal
                objectName={state.objects[deleteCandidateId]?.name || 'Object'}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteCandidateId(null)}
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
            />
        )}

        {topDeckModalDeck && (
            <TopDeckModal
                deck={topDeckModalDeck}
                onClose={() => setTopDeckModalDeck(null)}
            />
        )}
    </div>
  );
};
