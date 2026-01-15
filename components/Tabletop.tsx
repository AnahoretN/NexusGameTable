
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
import { Tooltip } from './Tooltip';
import { Layers, Lock, Minus, Plus, Search, RefreshCw, Trash2, Copy, RotateCw } from 'lucide-react';
import { CARD_SHAPE_DIMS } from '../constants';

// Board component with resize handle (corner only, like panels)
interface BoardWithResizeProps {
    token: TokenType | BoardType;
    obj: TableObject;
    isOwner: boolean;
    isDragging: boolean;
    isResizing: boolean;
    canResize: boolean;
    zoom: number;
    onMouseDown: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    onResizeStart: (e: React.MouseEvent) => void;
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
    canResize,
    zoom,
    onMouseDown,
    onContextMenu,
    onResizeStart,
    gridSize,
    hexR,
    hexW,
    hexPath,
}) => {
    const [isHoveringCorner, setIsHoveringCorner] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current || !canResize) return;
        const rect = containerRef.current.getBoundingClientRect();
        const handleSize = 20;

        // Check if hovering near bottom-right corner
        const nearCorner = e.clientX >= rect.right - handleSize &&
                          e.clientY >= rect.bottom - handleSize &&
                          e.clientX <= rect.right + 10 &&
                          e.clientY <= rect.bottom + 10;

        setIsHoveringCorner(nearCorner);
    }, [canResize]);

    const handleMouseLeave = useCallback(() => {
        setIsHoveringCorner(false);
    }, []);

    const showGrid = token.gridType && token.gridType !== GridType.NONE;

    // Determine cursor based on hover state and action state
    const getCursor = useCallback(() => {
        if (isResizing) return 'nwse-resize';
        if (isDragging) return 'grabbing';
        if (isHoveringCorner && canResize) return 'nwse-resize';
        return 'grab';
    }, [isHoveringCorner, canResize, isDragging, isResizing]);

    const cursor = getCursor();

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
                backgroundColor: (obj as any).content ? 'transparent' : ((obj as any).color || '#34495e'),
                backgroundImage: (obj as any).content ? `url(${(obj as any).content})` : undefined,
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

            {/* Resize handle - bottom-right corner */}
            {canResize && !isDragging && (
                <div
                    onMouseDown={onResizeStart}
                    className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize transition-opacity ${
                        isHoveringCorner || isResizing ? 'opacity-100' : 'opacity-75'
                    }`}
                    style={{
                        background: 'linear-gradient(135deg, transparent 50%, rgba(147, 51, 234, 0.8) 50%)',
                        borderTopLeftRadius: '4px',
                        pointerEvents: 'auto',
                    }}
                />
            )}

        </div>
    );
};

export const Tabletop: React.FC = () => {
  const { state, dispatch } = useGame();

  // Viewport state
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [isPanning, setIsPanning] = useState(false);

  // Dragging state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingPile, setDraggingPile] = useState<{ pile: CardPile; deck: DeckType } | null>(null);

  // Resizing state for boards
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Free rotation state
  const [freeRotatingId, setFreeRotatingId] = useState<string | null>(null);
  const [rotateStartAngle, setRotateStartAngle] = useState<number>(0);
  const [rotateStartMouse, setRotateStartMouse] = useState<{ x: number; y: number } | null>(null);

  // Cursor slot state - holds cards and tokens picked up with Shift+click (max 100 items)
  // Stores full object data and removes objects from their original position
  const [cursorSlot, setCursorSlot] = useState<(CardType | TokenType)[]>([]);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  // Track how items were added to cursor slot:
  // - 'shift' = Shift+click (drop only on click, not on mouseup)
  // - 'hold' = Long press or drag (drop on mouseup)
  const [cursorSlotSource, setCursorSlotSource] = useState<'shift' | 'hold' | null>(null);

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

  // Hover state for deck/pile drop targets
  const [hoveredDeckId, setHoveredDeckId] = useState<string | null>(null);
  const [hoveredPileId, setHoveredPileId] = useState<string | null>(null);

  // Refs
  const longPressTimerRef = useRef<number | null>(null);
  const longPressItemRef = useRef<{ id: string; item: TableObject; startX: number; startY: number } | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const pileDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const isPanningRef = useRef(false);
  const resizingIdRef = useRef<string | null>(null);
  const draggingPileRef = useRef<{ pile: CardPile; deck: DeckType } | null>(null);
  const freeRotatingIdRef = useRef<string | null>(null);
  const cursorSlotRef = useRef<(CardType | TokenType)[]>([]);
  const globalMousePosRef = useRef<{ x: number; y: number }>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  // Update refs when state changes
  useEffect(() => { draggingIdRef.current = draggingId; }, [draggingId]);
  useEffect(() => { isPanningRef.current = isPanning; }, [isPanning]);
  useEffect(() => { resizingIdRef.current = resizingId; }, [resizingId]);
  useEffect(() => { draggingPileRef.current = draggingPile; }, [draggingPile]);
  useEffect(() => { freeRotatingIdRef.current = freeRotatingId; }, [freeRotatingId]);
  useEffect(() => { cursorSlotRef.current = cursorSlot; }, [cursorSlot]);

  // Track global mouse position for playTopCard and other features
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      globalMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
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
          itemClone = {
            id: card.id,
            type: ItemType.CARD,
            name: card.name,
            content: card.content, // Image URL - this is the main image
            frontFaceUrl: (card as any).frontFaceUrl,
            backFaceUrl: (card as any).backFaceUrl,
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
          } as CardType;
        } else {
          itemClone = { ...item } as TokenType;
        }

        setCursorSlot(prev => [...prev, itemClone]);
        dispatch({ type: 'DELETE_OBJECT', payload: { id: cardId } });
        setCursorPosition({ x: clientX, y: clientY });
      }
    };

    window.addEventListener('add-to-cursor-slot', handleAddToSlot);
    return () => window.removeEventListener('add-to-cursor-slot', handleAddToSlot);
  }, [cursorSlot.length, dispatch, state.objects]);

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
                  if (o.id === currentDraggingId || !(o as any).isOnTable || o.locked) return false;
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

  // Execute a click action on an object
  const executeClickAction = useCallback((obj: TableObject, action: string, event?: React.MouseEvent) => {
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
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: -((obj as any).rotationStep ?? 45) } });
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
            const cardForSlot: CardType = {
              ...card,
              location: CardLocation.CURSOR_SLOT,
              faceUp: faceUp,
              isOnTable: false, // Important: card should NOT render on table
            };

            // Set cursor position first to ensure immediate render
            setCursorPosition(mousePos);

            // Add to cursor slot
            cursorSlotRef.current = [...cursorSlotRef.current, cardForSlot];
            setCursorSlot(prev => [...prev, cardForSlot]);
            if (cursorSlot.length === 0) {
              setCursorSlotSource('shift');
            }

            // Remove card from deck and update in state
            const newCardIds = deck.cardIds.slice(1);
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: deck.id, cardIds: newCardIds }
            });
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: {
                id: topCardId,
                location: CardLocation.CURSOR_SLOT,
                faceUp: faceUp,
                isOnTable: false,
                // Preserve sprite properties
                spriteUrl: card.spriteUrl,
                spriteIndex: card.spriteIndex,
                spriteColumns: card.spriteColumns,
                spriteRows: card.spriteRows,
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
        // Return all cards to their base deck state
        // This is now handled entirely by the reducer
        if (obj.type === ItemType.DECK) {
          dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: obj.id } });
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
  }, [dispatch, state.activePlayerId, state.objects, state.viewTransform, cursorSlot, setCursorSlot, setCursorSlotSource, setCursorPosition]);

  // Add object to cursor slot (Shift+click or long-press on card/token)
  const addToCursorSlot = useCallback((id: string, item: TableObject, source: 'shift' | 'hold' = 'shift') => {
    if (cursorSlot.length >= 100) return; // Max 100 items in slot

    // Set source based on how the item was added (only if slot was empty before)
    if (cursorSlot.length === 0) {
      setCursorSlotSource(source);
    }

    // Clone the item to store it in the slot - deep copy to preserve all properties
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
        frontFaceUrl: (card as any).frontFaceUrl,
        backFaceUrl: (card as any).backFaceUrl,
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

    setCursorSlot(prev => [...prev, itemClone]);

    // Remove the item from the game state
    dispatch({ type: 'DELETE_OBJECT', payload: { id } });

    // Calculate screen position of object center (world -> screen)
    const itemCenterX = item.x + (item.width ?? 63) / 2;
    const itemCenterY = item.y + (item.height ?? 88) / 2;
    const screenX = itemCenterX * zoom + offset.x;
    const screenY = itemCenterY * zoom + offset.y;

    // Set cursor position to object center on screen
    setCursorPosition({ x: screenX, y: screenY });
  }, [cursorSlot.length, dispatch, offset.x, offset.y, zoom]);

  // Drop all items from cursor slot at specified screen coordinates
  const dropCursorSlot = useCallback((clientX: number, clientY: number, slotItems?: (CardType | TokenType)[]) => {
    // Use provided slotItems or fall back to cursorSlot from state
    const currentSlot = slotItems ?? cursorSlot;
    if (currentSlot.length === 0) return;

    // NOTE: Dropping on decks is handled by handleGlobalClick -> dropToDeck
    // This function only handles dropping on the tabletop (not on decks)

    // Not dropping on a deck - drop items on tabletop
    // Get current scroll position from container
    const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    const scrollTop = scrollContainerRef.current?.scrollTop || 0;

    // Use current viewTransform from state to get accurate offset/zoom
    const currentOffset = state.viewTransform.offset;
    const currentZoom = state.viewTransform.zoom;

    // Convert screen coordinates to world coordinates
    // Formula: screenX = worldX * zoom + offset.x - scrollLeft
    // So: worldX = (screenX - offset.x + scrollLeft) / zoom
    const worldX = (clientX - currentOffset.x + scrollLeft) / currentZoom;
    const worldY = (clientY - currentOffset.y + scrollTop) / currentZoom;

    // Add all items from slot back to the game with same offsets as in cursor display
    currentSlot.forEach((item, index) => {
      const isCard = item.type === ItemType.CARD;
      const baseWidth = item.width ?? (isCard ? 63 : 50);
      const baseHeight = item.height ?? (isCard ? 88 : 50);
      // Offset is 10% of object size (same as in cursor display)
      const offsetAmount = Math.min(baseWidth, baseHeight) * 0.1;
      const offsetFromBack = (currentSlot.length - 1 - index) * offsetAmount;
      // Use high z-index for visibility
      const zIndex = 10000;

      const finalX = worldX - baseWidth / 2 + offsetFromBack;
      const finalY = worldY - baseHeight / 2 + offsetFromBack;

      const itemWithId = {
        ...item,
        id: `slot-${Date.now()}-${index}`,
        x: finalX,
        y: finalY,
        zIndex, // High z-index to ensure visibility
      };

      // For cards, ensure they go to tabletop (not hand)
      if (isCard) {
        (itemWithId as any).location = CardLocation.TABLE;
        (itemWithId as any).isOnTable = true;
      }

      dispatch({
        type: 'ADD_OBJECT',
        payload: itemWithId
      });
    });

    // Clear the slot - also update ref immediately for mouseup handler
    cursorSlotRef.current = [];
    setCursorSlot([]);
    setCursorPosition(null);
    setCursorSlotSource(null);
  }, [cursorSlot, state.viewTransform.offset.x, state.viewTransform.offset.y, state.viewTransform.zoom, dispatch, cursorSlotRef]);

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
      // First, add cards back to state (they were removed when added to slot)
      // ADD_CARD_TO_TOP_OF_DECK will update their position to deck position
      cardsInSlot.forEach((item) => {
        dispatch({
          type: 'ADD_OBJECT',
          payload: item
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
      nonCardsInSlot.forEach((item, index) => {
        const baseWidth = item.width ?? 50;
        const baseHeight = item.height ?? 50;
        const offsetAmount = Math.min(baseWidth, baseHeight) * 0.1;
        const offsetFromBack = (nonCardsInSlot.length - 1 - index) * offsetAmount;

        const itemWithId = {
          ...item,
          id: `slot-${Date.now()}-${index}`,
          x: deck.x + deck.width / 2 - baseWidth / 2 + offsetFromBack,
          y: deck.y + deck.height / 2 - baseHeight / 2 + offsetFromBack,
          zIndex: 10000,
        };

        dispatch({
          type: 'ADD_OBJECT',
          payload: itemWithId
        });
      });
    }

    // Clear the slot - also update ref immediately for mouseup handler
    cursorSlotRef.current = [];
    setCursorSlot([]);
    setCursorPosition(null);
    setCursorSlotSource(null);
  }, [cursorSlot, dispatch, state.objects, cursorSlotRef]);

  // Global click handler to drop cursor slot items when clicking outside hand panel
  // NOTE: This effect depends on cursorSlot to ensure the handler has fresh data
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (cursorSlot.length === 0 || e.button !== 0) {
        return;
      }

      // Check if Shift is pressed
      if (e.shiftKey) return;

      const target = e.target as HTMLElement;

      // Check if clicking inside hand panel - dispatch event to add cards to hand
      const handPanel = target.closest('[data-hand-panel]');
      if (handPanel) {
        // Dispatch custom event for hand panel to handle
        window.dispatchEvent(new CustomEvent('cursor-slot-drop-to-hand', {
          detail: { items: cursorSlot }
        }));
        // Clear the slot - also update ref immediately
        cursorSlotRef.current = [];
        setCursorSlot([]);
        setCursorPosition(null);
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Check if clicking on a deck - handle it directly here
      const deckElement = target.closest('[data-object-id]');
      if (deckElement) {
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

      // Check if clicking on UI objects (panels, windows) - don't drop there
      if (target.closest('[data-ui-object]')) {
        return;
      }

      // Drop items at cursor position on tabletop - pass cursorSlot from closure
      e.preventDefault();
      e.stopPropagation();
      dropCursorSlot(e.clientX, e.clientY, cursorSlot);
    };

    window.addEventListener('mousedown', handleGlobalClick, { capture: true });
    return () => window.removeEventListener('mousedown', handleGlobalClick, { capture: true } as any);
  }, [cursorSlot, dropCursorSlot, state.objects, dropToDeck, cursorSlotRef]);

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

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Global mouseup handler for cursor slot drop (when source='hold')
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      // Use cursorSlotRef.current to get the immediate value (avoid closure stale data)
      // Only process if cursor slot has items with source='hold'
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
        // Clear the slot
        cursorSlotRef.current = [];
        setCursorSlot([]);
        setCursorPosition(null);
        setCursorSlotSource(null);
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      // Check if clicking on a deck - handle it directly here
      // Use document.elementFromPoint to find what's under cursor since cursor slot cards have pointer-events: none
      const elementUnderCursor = document.elementFromPoint(clientX, clientY);
      const deckElement = elementUnderCursor?.closest('[data-object-id]');
      if (deckElement) {
        const objectId = deckElement.getAttribute('data-object-id');
        const obj = objectId ? state.objects[objectId] : undefined;
        if (obj && obj.type === ItemType.DECK && objectId) {
          e.preventDefault();
          e.stopPropagation();
          dropToDeck(objectId, currentSlot);
          return;
        }

        // Also check for piles
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

                  // Add cards from slot to pile
                  const cardsInSlot = currentSlot.filter(item => item.type === ItemType.CARD);
                  if (cardsInSlot.length > 0) {
                    // First, add cards back to state
                    cardsInSlot.forEach((item) => {
                      dispatch({
                        type: 'ADD_OBJECT',
                        payload: item
                      });
                    });

                    // Then add them to the pile in reverse order
                    [...cardsInSlot].reverse().forEach((item) => {
                      dispatch({
                        type: 'ADD_CARD_TO_PILE',
                        payload: { cardId: item.id, pileId, deckId: deck.id }
                      });
                    });
                  }

                  // Clear the slot
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
      }

      // Not over hand panel or deck - drop on tabletop, pass currentSlot
      dropCursorSlot(clientX, clientY, currentSlot);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [cursorSlotSource, dropCursorSlot, dropToDeck, state.objects, dispatch, cursorSlotRef]);

  const handleMouseDown = (e: React.MouseEvent, id?: string) => {
    if (contextMenu) setContextMenu(null);

    // Check if clicking on a UI object - if it has an id, process normally
    // If no id (background), check for panning or dropping cursor slot
    if (!id) {
      if (e.button === 0 && e.shiftKey) {
        setIsPanning(true);
        dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
        return;
      }

      // If cursor slot has items and we click without shift, drop all items
      if (e.button === 0 && !e.shiftKey && cursorSlot.length > 0) {
        e.stopPropagation();
        dropCursorSlot(e.clientX, e.clientY);
        return;
      }
    }

    if (id && e.button === 0) {
      e.stopPropagation();
      const item = state.objects[id];

      // Check if this is a UI object (panel or window) - handled differently
      if (item && (item.type === ItemType.PANEL || item.type === ItemType.WINDOW)) {
        if (item.locked) return;

        // Unpin from viewport if pinned (manual drag cancels pin)
        if ((item as any).isPinnedToViewport) {
          dispatch({
            type: 'UNPIN_FROM_VIEWPORT',
            payload: { id }
          });
        }

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

      if (item && item.locked && !isGM) return;

      // Cards and tokens: Shift+click immediately adds to cursor slot
      if (e.shiftKey && item && (item.type === ItemType.CARD || item.type === ItemType.TOKEN)) {
        addToCursorSlot(id, item);
        return;
      }

      // If cursor slot has items and we click without shift, drop all items first
      if (!e.shiftKey && cursorSlot.length > 0) {
        dropCursorSlot(e.clientX, e.clientY);
        return; // Don't proceed with normal drag handling
      }

      // For cards and tokens: start long-press timer (500ms) to add to cursor slot
      if (!e.shiftKey && item && (item.type === ItemType.CARD || item.type === ItemType.TOKEN)) {
        // Store the item and start position for long-press detection
        longPressItemRef.current = {
          id,
          item,
          startX: e.clientX,
          startY: e.clientY
        };

        // Start timer - after 250ms, add to cursor slot
        longPressTimerRef.current = window.setTimeout(() => {
          if (longPressItemRef.current) {
            addToCursorSlot(longPressItemRef.current.id, longPressItemRef.current.item, 'hold');
            longPressItemRef.current = null;
            longPressTimerRef.current = null;
          }
        }, 250); // 250ms long-press

        // Don't return - we need to continue to set dragStartRef for movement detection
      }

      // Store click start position for click detection
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // Note: Cards and tokens are handled via Shift+click cursor slot only,
      // they never reach this point since we return early above

      setDraggingId(id);
      if (item) {
        // Unpin from viewport if pinned (manual drag cancels pin)
        if ((item as any).isPinnedToViewport) {
          dispatch({
            type: 'UNPIN_FROM_VIEWPORT',
            payload: { id }
          });
        }

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
    // Update cursor position for slot visualization
    if (cursorSlot.length > 0) {
      setCursorPosition({ x: e.clientX, y: e.clientY });
    }

    // Check for long-press movement - if mouse moves while holding on a card/token, add to slot immediately
    if (longPressItemRef.current) {
      const moveThreshold = 5; // pixels
      const dx = e.clientX - longPressItemRef.current.startX;
      const dy = e.clientY - longPressItemRef.current.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= moveThreshold) {
        // Mouse moved enough - cancel timer and add to slot immediately
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        addToCursorSlot(longPressItemRef.current.id, longPressItemRef.current.item, 'hold');
        longPressItemRef.current = null;
      }
    }

    if (isPanning) {
      const newOffset = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };

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

    // Handle resizing (corner only - changes width/height only)
    if (resizingId && resizeStart) {
      const obj = state.objects[resizingId];
      if (!obj) return;

      const deltaX = (e.clientX - resizeStart.x) / zoom;
      const deltaY = (e.clientY - resizeStart.y) / zoom;

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
        // Convert cursor screen coordinates to world coordinates
        const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
        const scrollTop = scrollContainerRef.current?.scrollTop || 0;
        const worldX = (e.clientX - offset.x + scrollLeft) / zoom;
        const worldY = (e.clientY - offset.y + scrollTop) / zoom;

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
  }, [isPanning, resizingId, resizeStart, state.objects, state.activePlayerId, draggingId, draggingPile, offset, zoom, dispatch, freeRotatingId, rotateStartAngle, rotateStartMouse, cursorSlot, isPointInRotatedRect]);

  const handleMouseUp = useCallback((e?: MouseEvent | React.MouseEvent) => {
    // Clear long-press timer if mouse is released before timeout
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
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
    let cardAddedToDeckOrPile = false;
    let dropClientX = 0;
    let dropClientY = 0;

    if (draggingId) {
      const draggingObj = state.objects[draggingId];
      if (draggingObj && draggingObj.type === ItemType.CARD) {
        dropClientX = e?.clientX ?? 0;
        dropClientY = e?.clientY ?? 0;

        // Convert cursor screen coordinates to world coordinates
        const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
        const scrollTop = scrollContainerRef.current?.scrollTop || 0;
        const worldX = (dropClientX - offset.x + scrollLeft) / zoom;
        const worldY = (dropClientY - offset.y + scrollTop) / zoom;

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
              const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
              const scrollTop = scrollContainerRef.current?.scrollTop || 0;
              const worldX = (dropClientX - offset.x + scrollLeft) / zoom;
              const worldY = (dropClientY - offset.y + scrollTop) / zoom;

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
    setDraggingId(null);
    setIsPanning(false);
    setResizingId(null);
    setResizeStart(null);
    dragOffsetRef.current = null;

    // Clear free rotation state
    setFreeRotatingId(null);
    setRotateStartAngle(0);
    setRotateStartMouse(null);

    // Clear pile dragging state
    setDraggingPile(null);
    pileDragStartRef.current = null;
  }, [draggingId, hoveredDeckId, hoveredPileId, state.objects, dispatch, executeClickAction, freeRotatingId, isPointInRotatedRect]);

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
      // Don't intercept if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

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
    if (e.shiftKey) {
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

  const handleContextMenu = useCallback((e: React.MouseEvent, obj: TableObject) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
          x: e.clientX,
          y: e.clientY,
          object: obj
      });
  }, []);

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

  // Memoize table objects to prevent unnecessary re-renders
  const tableObjects = useMemo(() => {
    return (Object.values(state.objects) as TableObject[])
      .filter(obj => {
          // Exclude UI objects (panels and windows) - they have their own rendering
          if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) return false;
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
          const zA = a.zIndex ?? 0;
          const zB = b.zIndex ?? 0;
          if (zA !== zB) return zA - zB;

          if (a.type === ItemType.TOKEN && (a as TokenType).shape === TokenShape.RECTANGLE) return -1;
          if (b.type === ItemType.TOKEN && (b as TokenType).shape === TokenShape.RECTANGLE) return 1;

          if (a.locked && !b.locked) return -1;
          if (!a.locked && b.locked) return 1;

          return 0;
      });
  }, [state.objects, isGM]);

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
    // Fixed world size: 5000x5000
    return { width: 5000, height: 5000 };
  }, []);

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
      className={`w-full h-full bg-table overflow-auto relative ${cursorSlot.length > 0 ? 'cursor-grabbing' : 'cursor-grab'} active:cursor-grabbing`}
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
            const isMinimized = pinnedObj.minimized || false;
            const hasDualPosition = pinnedObj.dualPosition || false;

            // Determine which pinned position to use based on dual position mode and minimized state
            let pinnedPosition = pinnedObj.pinnedScreenPosition;

            if (hasDualPosition) {
              // In dual position mode, try to use the state-specific position first
              if (isMinimized) {
                // When minimized, prefer collapsedPinnedPosition, fall back to expandedPinnedPosition, then pinnedScreenPosition
                pinnedPosition = pinnedObj.collapsedPinnedPosition ||
                               pinnedObj.expandedPinnedPosition ||
                               pinnedObj.pinnedScreenPosition;
              } else {
                // When expanded, prefer expandedPinnedPosition, fall back to collapsedPinnedPosition, then pinnedScreenPosition
                pinnedPosition = pinnedObj.expandedPinnedPosition ||
                               pinnedObj.collapsedPinnedPosition ||
                               pinnedObj.pinnedScreenPosition;
              }
            }

            if (pinnedPosition) {
              let newX: number;
              let newY: number;

              // UI panels/windows are NOT in the transform container, so no zoom/offset affect
              if (obj.type === ItemType.PANEL || obj.type === ItemType.WINDOW) {
                // For UI objects: screenX = obj.x - scrollLeft
                // We want: screenX = pinnedPosition.x
                // So: obj.x = pinnedPosition.x + scrollLeft
                newX = pinnedPosition.x + scrollLeft;
                newY = pinnedPosition.y + scrollTop;
              } else {
                // For game objects in transform container: screenX = obj.x * zoom + offset.x - scrollLeft
                // We want: screenX = pinnedPosition.x
                // So: obj.x = (pinnedPosition.x - offset.x + scrollLeft) / zoom
                newX = (pinnedPosition.x - offset.x + scrollLeft) / zoom;
                newY = (pinnedPosition.y - offset.y + scrollTop) / zoom;
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
                const isOwner = !(obj as any).ownerId || (obj as any).ownerId === state.activePlayerId || isGM;
                const draggingClass = draggingId === obj.id ? 'cursor-grabbing z-[100000]' : 'cursor-grab';

                if (obj.type === ItemType.BOARD) {
                    const board = obj as BoardType;
                    const isResizing = resizingId === obj.id;
                    const isDragging = draggingId === obj.id;
                    const canResize = !obj.locked;
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
                        <Tooltip
                            key={obj.id}
                            text={obj.tooltipText}
                            showImage={obj.showTooltipImage}
                            imageSrc={obj.content}
                            scale={obj.tooltipScale}
                        >
                            <BoardWithResize
                                token={board}
                                obj={obj}
                                isOwner={isOwner}
                                isDragging={isDragging}
                                isResizing={isResizing}
                                canResize={canResize}
                                zoom={zoom}
                                onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                onResizeStart={(e) => isOwner && handleResizeStart(e, obj.id)}
                                gridSize={gridSize}
                                hexR={hexR}
                                hexW={hexW}
                                hexPath={hexPath}
                            />
                        </Tooltip>
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

                        return (
                            <BoardWithResize
                                key={obj.id}
                                token={token}
                                obj={obj}
                                isOwner={isOwner}
                                isDragging={isDragging}
                                isResizing={isResizing}
                                canResize={canResize}
                                zoom={zoom}
                                onMouseDown={(e) => isOwner && handleMouseDown(e, obj.id)}
                                onContextMenu={(e) => handleContextMenu(e, obj)}
                                onResizeStart={(e) => isOwner && handleResizeStart(e, obj.id)}
                                gridSize={gridSize}
                                hexR={hexR}
                                hexW={hexW}
                                hexPath={hexPath}
                            />
                        );
                    }

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
                                className={`absolute flex items-center justify-center text-white font-bold select-none hover:ring-2 ring-yellow-400 ${draggingClass} ${isStandee ? 'origin-bottom' : ''} group`}
                                style={{
                                    left: obj.x,
                                    top: obj.y,
                                    width: obj.width,
                                    height: obj.height,
                                    borderRadius: borderRadius,
                                    border: isStandee ? 'none' : '2px solid white',
                                    boxShadow: isStandee ? 'none' : '0 4px 6px rgba(0,0,0,0.3)',
                                    transform: `rotate(${obj.rotation}deg)`
                                }}
                            >
                                {/* Token thickness effect layers */}
                                {!isStandee && [2, 1].map(i => (
                                    <div
                                        key={i}
                                        className="absolute rounded pointer-events-none"
                                        style={{
                                            inset: 0,
                                            borderRadius: borderRadius,
                                            backgroundColor: obj.color || '#e74c3c',
                                            transform: `translate(${i * 2}px, ${i * 2}px)`,
                                            zIndex: -i,
                                            opacity: 0.4
                                        }}
                                    />
                                ))}

                                {/* Main token content */}
                                <div
                                    className="absolute inset-0 rounded"
                                    style={{
                                        backgroundColor: obj.content ? 'transparent' : (obj.color || '#e74c3c'),
                                        backgroundImage: obj.content ? `url(${obj.content})` : undefined,
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                        borderRadius: borderRadius,
                                    }}
                                />
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
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.COUNTER) {
                    const counter = obj as Counter;
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
                        </Tooltip>
                    );
                }

                if (obj.type === ItemType.DICE_OBJECT) {
                    const dice = obj as DiceObject;

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
                        </Tooltip>
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
                    const isCardHidden = (card as any).hidden === true;

                    return (
                        <div
                            key={obj.id}
                            data-tabletop-card="true"
                            style={{
                                left: obj.x,
                                top: obj.y,
                                position: 'absolute',
                                transform: `rotate(${obj.rotation}deg)`,
                                opacity: isCardHidden && isGM ? 0.5 : 1,
                                pointerEvents: isDragging ? 'none' : 'auto', // Allow mouse events to pass through when dragging
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
                                  deckSpriteConfig={card.deckId ? (state.objects[card.deckId] as Deck)?.spriteConfig : undefined}
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
                    }

                    dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
                }}
            />
        )}

        {deleteCandidateId && (
            <DeleteConfirmModal
                objectName={(state.objects[deleteCandidateId] as any)?.name || 'Object'}
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

        {/* Cursor Slot Visualization - renders items following cursor */}
        {cursorSlot.length > 0 && cursorPosition && (
            <div
                className="fixed pointer-events-none z-[100001]"
                style={{
                    left: cursorPosition.x,
                    top: cursorPosition.y,
                }}
            >
                {/* Render stacked items - newest in front, older items offset */}
                {cursorSlot.map((item, index) => {
                    const isCard = item.type === ItemType.CARD;
                    // Use the card's actual dimensions (same as on table)
                    let baseWidth = item.width ?? (isCard ? 63 : 50);
                    let baseHeight = item.height ?? (isCard ? 88 : 50);

                    // Scale by zoom to match in-game size
                    const width = baseWidth * zoom;
                    const height = baseHeight * zoom;
                    // Offset is 10% of object size
                    const offsetAmount = Math.min(width, height) * 0.1;
                    const offsetFromBack = (cursorSlot.length - 1 - index) * offsetAmount;
                    // Cards at bottom (lower z-index), tokens at top (higher z-index)
                    const zIndex = isCard ? index : index + 1000;

                    if (isCard) {
                        const card = item as CardType;
                        const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
                        const isHorizontal = deck?.cardOrientation === CardOrientation.HORIZONTAL;

                        // For horizontal cards, swap width and height to match tabletop appearance
                        // (wide rectangle instead of tall), but disable rotation transform
                        const cardWidth = isHorizontal ? height : width;
                        const cardHeight = isHorizontal ? width : height;

                        return (
                            <div
                                key={`${card.id}-${index}`}
                                className="absolute"
                                style={{
                                    left: -cardWidth / 2 + offsetFromBack,
                                    top: -cardHeight / 2 + offsetFromBack,
                                    zIndex,
                                    pointerEvents: 'none',
                                }}
                            >
                                {/* Use the same Card component as on table for identical appearance */}
                                <Card
                                    card={card}
                                    overrideWidth={cardWidth}
                                    overrideHeight={cardHeight}
                                    cardWidth={deck?.cardWidth}
                                    cardHeight={deck?.cardHeight}
                                    cardOrientation={deck?.cardOrientation}
                                    cardNamePosition={deck?.cardNamePosition}
                                    disableRotationTransform={true}
                                    disablePointerEvents={true}
                                    showActionButtons={false}
                                    skipTooltip={true}
                                    deckSpriteConfig={deck?.spriteConfig}
                                />
                            </div>
                        );
                    }

                    // Token rendering
                    const token = item as TokenType;
                    return (
                        <div
                            key={`${token.id}-${index}`}
                            className="absolute"
                            style={{
                                left: -width / 2 + offsetFromBack,
                                top: -height / 2 + offsetFromBack,
                                width: `${width}px`,
                                height: `${height}px`,
                                zIndex,
                                pointerEvents: 'none', // Ensure cursor slot tokens don't block mouse events to decks/piles
                            }}
                        >
                            <div
                                className="w-full h-full flex items-center justify-center text-white font-bold select-none"
                                style={{
                                    backgroundColor: token.color || '#34495e',
                                    backgroundImage: token.content ? `url(${token.content})` : undefined,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    border: '2px solid white',
                                    borderRadius: token.shape === TokenShape.CIRCLE ? '50%' : '4px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                    opacity: 0.9,
                                }}
                            />
                        </div>
                    );
                })}

                {/* Stack counter badge - only show if more than 1 item */}
                {cursorSlot.length > 1 && (
                    <div className="absolute" style={{
                        left: `${((cursorSlot[0]?.width ?? 63) * zoom) / 2 + 4}px`,
                        top: `${-((cursorSlot[0]?.height ?? 88) * zoom) / 2 - 4}px`,
                    }}>
                        <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">
                            {cursorSlot.length}
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
  );
};
