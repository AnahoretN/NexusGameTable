import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { Layers, Lock, Unlock, Shuffle, Hand, Search, Undo, Copy, Trash2, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { useObjectById } from '../store/objectStore';
import { Deck as DeckType, CardPile, Card as CardType, ItemType, CardShape, CardOrientation, ContextAction } from '../types';
import { DECK_OFFSET } from '../constants';
import { Tooltip } from './Tooltip';
import { getCardShapeStyles } from '../utils/shapeUtils';
import { SvgDeckShape, DeckLabel, shouldUseSvgForDeck } from './SvgDeckShape';
import { executeClickAction } from '../utils/objectActionHandlers';
import { vuToPixels } from '../utils/vuSystem';
import { useCursorSlotHover } from '../hooks';

// 🔥 OPTIMIZED: Zustand version of DeckComponent
// Replaces: components/DeckComponent.tsx
// Performance: Isolation from unnecessary re-renders by using useMemo instead of repeated state.objects lookups
// NOTE: Using useMemo instead of direct Zustand hooks to avoid infinite loop with GameContext sync

// Submenu actions map to their parent section for permission checking
const SUBMENU_TO_PARENT: Record<string, ContextAction> = {
  'layerUp': 'layer',
  'layerDown': 'layer',
  'layerToTop': 'layer',
  'layerToBottom': 'layer',
  'rotateClockwise': 'rotate',
  'rotateCounterClockwise': 'rotate',
  'resetRotation': 'rotate',
  'swingClockwise': 'rotate',
  'swingCounterClockwise': 'rotate',
  'draw': 'topDeck',
  'playTopCard': 'topDeck',
  'millTopCard': 'topDeck',
  'toBottom': 'topDeck',
  'showTop': 'topDeck',
  'moveToHand': 'moveTo',
  'moveToTopDeck': 'moveTo',
  'moveToBottomDeck': 'moveTo',
  'moveToDiscard': 'moveTo',
};

interface DeckComponentProps {
  deck: DeckType;
  draggingId?: string | null;
  hoveredPileId?: string | null;
  setHoveredPileId?: (id: string | null) => void;
  isGM?: boolean;
  draggingClass?: string;
  draggingPile?: { pile: CardPile; deck: DeckType } | null;
  setDraggingPile?: (pile: { pile: CardPile; deck: DeckType } | null) => void;
  pileDragStartRef?: React.MutableRefObject<{ x: number; y: number } | null>;
  setTopDeckModalDeck?: (deck: DeckType | null) => void;
  handleMouseDown?: (e: React.MouseEvent, id?: string) => void;
  handleContextMenu?: (e: React.MouseEvent, obj: any) => void;
  handlePileContextMenu?: (e: React.MouseEvent, pile: CardPile, deck: DeckType) => void;
  setSearchModalDeck?: (deck: DeckType | null) => void;
  setSearchModalPile?: (pile: CardPile | undefined) => void;
  setPilesButtonMenu?: (menu: { x: number; y: number; deck: DeckType } | null) => void;
  setDeleteCandidateId?: (id: string | null) => void;
  executeClickAction?: (obj: any, action: string, event?: React.MouseEvent) => void;
  allObjects?: Record<string, any>;
  currentTool?: string;
  pixelsPerVU?: number; // Conversion factor from vu to pixels
  style?: React.CSSProperties; // Additional styles for positioning
  disableDeckHighlight?: boolean; // Force disable deck highlight
}

export const DeckComponent: React.FC<DeckComponentProps> = React.memo(({
  deck,
  draggingId = null,
  hoveredPileId = null,
  setHoveredPileId,
  isGM = false,
  draggingClass = '',
  draggingPile = null,
  setDraggingPile,
  pileDragStartRef,
  setTopDeckModalDeck,
  handleMouseDown,
  handleContextMenu,
  handlePileContextMenu,
  setSearchModalDeck,
  setSearchModalPile,
  setPilesButtonMenu,
  setDeleteCandidateId,
  executeClickAction,
  allObjects = {},
  currentTool = 'none',
  pixelsPerVU = 1.0,
  style,
  disableDeckHighlight = false,
}) => {
  // 🔥 OPTIMIZED: Get specific dragging object to prevent unnecessary re-renders
  const draggingObject = useObjectById(draggingId || '');

  // 🔥 OPTIMIZED: Memoize dragging object type check to avoid repeated lookups
  const isDraggingCardFromTable = useMemo(() => {
    return draggingId && draggingObject?.type === ItemType.CARD;
  }, [draggingId, draggingObject]);

  // Local state for cursor hover detection - same approach as HandPanel
  // MUST be declared before useCallback that references it
  const [isCursorOver, setIsCursorOver] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);

  // Memoized mouse down handler to prevent multiple re-renders
  const handleDeckMouseDown = useCallback((e: React.MouseEvent) => {
    if (!deck.locked || isGM) {
      // Note: Double click actions are handled in Tabletop's handleMouseUp
      // We don't block mouseDown here to allow normal dragging to work

      if (handleMouseDown) {
        handleMouseDown(e, deck.id);
      }
    }
  }, [deck.id, deck.locked, isGM, deck.singleClickAction, deck.doubleClickAction, handleMouseDown, executeClickAction]);

  // Optimized hover handlers - simplified, no longer needed for highlight logic
  const handleDeckMouseEnter = useCallback(() => {
    // Highlight is now handled by cursor-slot-move event
  }, []);

  const handleDeckMouseLeave = useCallback(() => {
    // Highlight is now handled by cursor-slot-move event
  }, []);

  const handlePileMouseEnter = useCallback((pileId: string) => {
    if (disableDeckHighlight) return; // Skip hover in pool panels
    // Keep old logic for piles
    if (isDraggingCardFromTable || isCursorOver) {
      if (setHoveredPileId && typeof setHoveredPileId === 'function') {
        setHoveredPileId(pileId);
      }
    }
  }, [disableDeckHighlight, isDraggingCardFromTable, isCursorOver, setHoveredPileId]);

  const handlePileMouseLeave = useCallback((pileId: string) => {
    if (disableDeckHighlight) return; // Skip hover in pool panels
    // Always clear hover state when mouse leaves, regardless of cursor slot state
    if (hoveredPileId === pileId) {
      if (setHoveredPileId && typeof setHoveredPileId === 'function') {
        setHoveredPileId(null);
      }
    }
  }, [disableDeckHighlight, hoveredPileId, setHoveredPileId]);

  // Convert vu to pixels for deck dimensions

  // 🔥 OPTIMIZED: Simple hover check - same approach as HandPanel
  const canDropCard = !disableDeckHighlight && isCursorOver;

  // Helper to check if an action is allowed for the current user
  const can = (action: ContextAction): boolean => {
    const allowedActions = deck.allowedActions;
    const allowedActionsForGM = deck.allowedActionsForGM;

    // Check if this is a submenu action - if so, check parent section permission
    const parentAction = SUBMENU_TO_PARENT[action];
    const actionToCheck = parentAction || action;

    if (isGM) {
      // GM: check allowedActionsForGM
      // undefined/null = all allowed, [] = none allowed, specific array = only those allowed
      return allowedActionsForGM == null || (allowedActionsForGM.length > 0 && allowedActionsForGM.includes(actionToCheck));
    }
    // Player: check allowedActions
    // undefined/null = all allowed, [] = none allowed, specific array = only those allowed
    return allowedActions == null || (allowedActions.length > 0 && allowedActions.includes(actionToCheck));
  };

  // Card shape and orientation for deck styling (not for deck dimensions)
  const cardShape = deck.cardShape ?? CardShape.POKER;
  const cardOrientation = deck.cardOrientation ?? CardOrientation.VERTICAL;

  // Deck dimensions are independent of card orientation
  // The deck displays with its own width and height
  const effectiveWidth = vuToPixels(deck.width);
  const effectiveHeight = vuToPixels(deck.height);

  // Memoize visible card count calculation
  const visibleCardCount = useMemo(() => {
    return deck.cardIds.filter(id => {
      const card = allObjects?.[id];
      return card && !card.hidden;
    }).length;
  }, [deck.cardIds, allObjects]);

  // Shuffle animation state (initialized after visibleCardCount is available)
  const [isShuffling, setIsShuffling] = useState(false);
  const [animatedCurrentCount, setAnimatedCurrentCount] = useState(visibleCardCount);
  const [animatedBaseCount, setAnimatedBaseCount] = useState((deck.baseCardIds || deck.cardIds).length);
  const shuffleEndTimeRef = useRef<number | null>(null);

  // Memoize top card calculation
  const topCard = useMemo(() => {
    const visibleCardIds = deck.cardIds.filter(id => {
      const card = allObjects?.[id];
      return card && !card.hidden;
    });
    return visibleCardIds.length > 0 ? (allObjects[visibleCardIds[0]] as CardType) : null;
  }, [deck.cardIds, allObjects]);

  // Helper function to get background styles for a card (handles sprite sheets)
  const getCardBackgroundStyles = useCallback((card: CardType | null) => {
    if (!card) return { backgroundColor: 'white' };

    const deckSpriteConfig = deck.spriteConfig;
    const spriteUrl = card.spriteUrl || deckSpriteConfig?.spriteUrl;
    const spriteIndex = card.spriteIndex !== undefined ? card.spriteIndex : deckSpriteConfig?.spriteIndex;
    const spriteColumns = card.spriteColumns || deckSpriteConfig?.columns;
    const spriteRows = card.spriteRows || deckSpriteConfig?.rows;
    const hasSpriteSheet = spriteUrl && spriteIndex !== undefined && spriteColumns && spriteRows;

    if (hasSpriteSheet) {
      // Calculate background position for sprite sheet
      const col = spriteIndex % spriteColumns;
      const row = Math.floor(spriteIndex / spriteColumns);
      const colPercent = spriteColumns > 1 ? (col / (spriteColumns - 1)) * 100 : 0;
      const rowPercent = spriteRows > 1 ? (row / (spriteRows - 1)) * 100 : 0;

      return {
        backgroundImage: `url(${spriteUrl})`,
        backgroundSize: `${spriteColumns * 100}% ${spriteRows * 100}%`,
        backgroundPosition: `${colPercent}% ${rowPercent}%`,
        backgroundColor: 'white'
      };
    } else if (card.content) {
      // Regular card with content image
      return {
        backgroundImage: `url(${card.content})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundColor: 'white'
      };
    }

    // No image - just white background
    return {
      backgroundImage: undefined,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center',
      backgroundColor: 'white'
    };
  }, [deck.spriteConfig]);

  // Helper function to get background styles for a card back (handles priority)
  const getCardBackStyles = useCallback((card: CardType | null) => {
    if (!card) return { backgroundColor: '#1e293b' };

    // Priority 1: Check if card has alternativeBack
    if (card.alternativeBack && card.alternativeBack.url) {
      return {
        backgroundImage: `url(${card.alternativeBack.url})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundColor: '#1e293b'
      };
    }

    // Priority 2: Check if card has custom backFaceUrl
    if (card.backFaceUrl) {
      return {
        backgroundImage: `url(${card.backFaceUrl})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundColor: '#1e293b'
      };
    }

    // Priority 3: Use deck's spriteConfig cardBackUrl or cardBackSpriteUrl
    const deckSpriteConfig = deck.spriteConfig;
    if (deckSpriteConfig?.cardBackSpriteUrl && deckSpriteConfig.cardBackSpriteIndex !== undefined) {
      const spriteColumns = deckSpriteConfig.cardBackSpriteColumns || 1;
      const spriteRows = deckSpriteConfig.cardBackSpriteRows || 1;
      const col = deckSpriteConfig.cardBackSpriteIndex % spriteColumns;
      const row = Math.floor(deckSpriteConfig.cardBackSpriteIndex / spriteColumns);
      const colPercent = spriteColumns > 1 ? (col / (spriteColumns - 1)) * 100 : 0;
      const rowPercent = spriteRows > 1 ? (row / (spriteRows - 1)) * 100 : 0;

      return {
        backgroundImage: `url(${deckSpriteConfig.cardBackSpriteUrl})`,
        backgroundSize: `${spriteColumns * 100}% ${spriteRows * 100}%`,
        backgroundPosition: `${colPercent}% ${rowPercent}%`,
        backgroundColor: '#1e293b'
      };
    } else if (deckSpriteConfig?.cardBackUrl) {
      return {
        backgroundImage: `url(${deckSpriteConfig.cardBackUrl})`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundColor: '#1e293b'
      };
    }

    // No card back found - return default dark background
    return {
      backgroundImage: undefined,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center',
      backgroundColor: '#1e293b'
    };
  }, [deck.spriteConfig]);

  // Memoize piles grouping by position
  const { getPilePosition } = useMemo(() => {
    const visiblePiles = deck.piles?.filter(p => p.visible) || [];
    const pilesByPosition: Record<string, CardPile[]> = {
      left: [],
      right: [],
      top: [],
      bottom: [],
      free: []
    };
    visiblePiles.forEach(p => {
      if (p.position !== 'free') {
        pilesByPosition[p.position].push(p);
      }
    });

    const getPilePosition = (pile: CardPile) => {
      const pileSize = pile.size ?? 1;
      const isHalfSize = pileSize === 0.5;

      if (pile.position === 'free') {
        // For free position, use world coordinates (pile.x, pile.y are in world space)
        return { x: pile.x ?? 0, y: pile.y ?? 0 };
      }

      // Find index of this pile in its position group
      const positionGroup = pilesByPosition[pile.position] || [];
      const pileIndex = positionGroup.findIndex(p => p.id === pile.id);

      // Use effective dimensions for pile positioning
      const ew = effectiveWidth;
      const eh = effectiveHeight;

      // Positions are relative to deck's top-left corner (not world coordinates)
      // since the deck container is already positioned at deck.x, deck.y
      switch (pile.position) {
        case 'left':
          if (isHalfSize) {
            const yOffset = pileIndex * (eh * 0.5 + 2);
            return { x: -ew * 0.5 - 4, y: yOffset };
          }
          return { x: -ew - 4, y: 0 };
        case 'right':
          if (isHalfSize) {
            const yOffset = pileIndex * (eh * 0.5 + 2);
            return { x: ew + 4, y: yOffset };
          }
          return { x: ew + 4, y: 0 };
        case 'top':
          if (isHalfSize) {
            const xOffset = pileIndex * (ew * 0.5 + 2);
            return { x: xOffset, y: -eh * 0.5 - 4 };
          }
          return { x: 0, y: -eh - 4 };
        case 'bottom':
          if (isHalfSize) {
            const xOffset = pileIndex * (ew * 0.5 + 2);
            return { x: xOffset, y: eh + 4 };
          }
          return { x: 0, y: eh + 4 };
        default:
          return { x: 0, y: 0 };
      }
    };

    return { getPilePosition };
  }, [deck.piles, deck.x, deck.y, deck.width, deck.height, effectiveWidth, effectiveHeight]);

  const handlePilesButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const deckElement = document.querySelector(`[data-object-id="${deck.id}"]`) as HTMLElement;
    if (deckElement && setPilesButtonMenu) {
      const rect = deckElement.getBoundingClientRect();
      setPilesButtonMenu({
        x: rect.left,
        y: rect.bottom + 5,
        deck
      });
    }
  }, [deck.id, setPilesButtonMenu]);

  // Get shape styles based on deck's cardShape setting
  const shapeStyles = useMemo(() => {
    return getCardShapeStyles(deck.cardShape ?? CardShape.POKER, deck.cardOrientation ?? CardOrientation.VERTICAL);
  }, [deck.cardShape, deck.cardOrientation]);

  // Shuffle animation effect
  useEffect(() => {
    const handleShuffleStart = (e: Event) => {
      const customEvent = e as CustomEvent<{ deckId: string }>;
      if (customEvent.detail.deckId === deck.id) {
        setIsShuffling(true);
        shuffleEndTimeRef.current = Date.now() + 1000; // Animate for 1 second
      }
    };

    window.addEventListener('deck-shuffle-start', handleShuffleStart);
    return () => window.removeEventListener('deck-shuffle-start', handleShuffleStart);
  }, [deck.id]);

  // Random number animation during shuffle
  useEffect(() => {
    if (!isShuffling) {
      // Reset to actual values when not shuffling
      setAnimatedCurrentCount(visibleCardCount);
      setAnimatedBaseCount((deck.baseCardIds || deck.cardIds).length);
      return;
    }

    const animationInterval = setInterval(() => {
      // Generate random numbers for animation effect
      const baseCount = (deck.baseCardIds || deck.cardIds).length;
      // Random numbers between 0 and baseCount + some extra for visual effect
      setAnimatedCurrentCount(Math.floor(Math.random() * (baseCount + 5)));
      setAnimatedBaseCount(Math.floor(Math.random() * (baseCount + 5)));
    }, 100); // 10 times per second

    return () => clearInterval(animationInterval);
  }, [isShuffling, deck.cardIds, deck.baseCardIds]);

  // End shuffle animation after timeout
  useEffect(() => {
    if (!isShuffling || !shuffleEndTimeRef.current) return;

    const remainingTime = shuffleEndTimeRef.current - Date.now();
    if (remainingTime <= 0) {
      setIsShuffling(false);
      shuffleEndTimeRef.current = null;
      // Reset to actual values
      setAnimatedCurrentCount(visibleCardCount);
      setAnimatedBaseCount((deck.baseCardIds || deck.cardIds).length);
      return;
    }

    const timeout = setTimeout(() => {
      setIsShuffling(false);
      shuffleEndTimeRef.current = null;
      setAnimatedCurrentCount(visibleCardCount);
      setAnimatedBaseCount((deck.baseCardIds || deck.cardIds).length);
    }, remainingTime);

    return () => clearTimeout(timeout);
  }, [isShuffling, visibleCardCount, deck.cardIds, deck.baseCardIds]);

  // Handle cursor slot hover over deck - using shared hook
  const { isCursorOver: isCursorOverFromHook } = useCursorSlotHover(deckRef, {
    requireCards: true,
  });

  // Update local state when hook state changes
  useEffect(() => {
    setIsCursorOver(isCursorOverFromHook);
  }, [isCursorOverFromHook]);

  // Handle cursor-left-deck event (specific to deck component)
  useEffect(() => {
    const handleCursorLeftDeck = (e: Event) => {
      const customEvent = e as CustomEvent<{ deckId: string }>;
      // Hide highlight when leaving this specific deck
      if (customEvent.detail.deckId === deck.id) {
        setIsCursorOver(false);
      }
    };

    window.addEventListener('cursor-left-deck', handleCursorLeftDeck);
    return () => {
      window.removeEventListener('cursor-left-deck', handleCursorLeftDeck);
    };
  }, [deck.id]);

  // Don't render if deck is in cursor slot (it's being dragged)
  if (deck.inCursorSlot) {
    return null;
  }

  return (
    <Tooltip
      text={deck.tooltipText}
      showImage={deck.showTooltipImage}
      imageSrc={deck.content}
      scale={deck.tooltipScale}
    >
      <div data-object-id={deck.id} style={{ position: 'relative', width: effectiveWidth, height: effectiveHeight, ...style }}>
        {/* Render piles */}
      {deck.piles?.filter(p => p.visible).map(pile => {
        const pilePos = getPilePosition(pile);
        // 🔥 OPTIMIZED: Use direct object access (state.objects already optimized by parent)
        const pileCards = pile.cardIds.map(id => state.objects[id]).filter(Boolean) as CardType[];
        const topCard = pileCards.length > 0 ? pileCards[0] : null;
        const pileSize = pile.size ?? 1;

        // Check if dragging a card and hovering over this pile
        const isHoveringPile = !disableDeckHighlight && (isDraggingCardFromTable || isCursorOver) && hoveredPileId === pile.id;

        return (
          <React.Fragment key={pile.id}>
            {/* Pile container - keeps normal z-index */}
            <div
              data-pile-id={pile.id}
              onMouseEnter={() => handlePileMouseEnter(pile.id)}
              onMouseLeave={() => handlePileMouseLeave(pile.id)}
              className={`absolute group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingPile?.pile.id === pile.id ? 'opacity-50 scale-95 cursor-grabbing' : ''}`}
              style={{
                left: pilePos.x,
                top: pilePos.y,
                width: effectiveWidth * pileSize,
                height: effectiveHeight * pileSize,
                transform: `rotate(${deck.rotation}deg)`
              }}
            >
              {/* Pile visual representation */}
              {shouldUseSvgForDeck(cardShape) ? (
                // SVG rendering for geometric shapes
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center transition-colors cursor-pointer"
                  onContextMenu={(e) => handlePileContextMenu?.(e, pile, deck)}
                  onMouseDown={(e) => {
                    if (pile.position === 'free' && !pile.locked && e.button === 0) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingPile?.({ pile, deck });
                      if (pileDragStartRef) {
                        pileDragStartRef.current = {
                          x: e.clientX - (pile.x ?? 0),
                          y: e.clientY - (pile.y ?? 0)
                        };
                      }
                    }
                  }}
                >
                  <SvgDeckShape
                    shape={cardShape}
                    width={effectiveWidth * pileSize}
                    height={effectiveHeight * pileSize}
                    backgroundColor="#1e293b"
                    borderColor={
                      pile.position === 'free'
                        ? pile.locked
                          ? '#dc2626'
                          : draggingPile?.pile.id === pile.id
                            ? '#facc15'
                            : '#475569'
                        : '#475569'
                    }
                    borderWidth={2}
                    orientation={cardOrientation}
                  >
                    {pile.showTopCard && topCard ? (
                      // Show top card face without text overlay
                      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ width: '100%', height: '100%', ...getCardBackgroundStyles(topCard) }} />
                      </div>
                    ) : topCard ? (
                      // Normal pile appearance with optional face up display
                      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ width: '100%', height: '100%', ...(pile.faceUp ? getCardBackgroundStyles(topCard) : { backgroundColor: '#1e293b' }) }} />
                        {/* Pile name overlay with count */}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                          <DeckLabel
                            name={pile.name}
                            count={pileCards.length}
                            totalCount={pileCards.length}
                            shape={cardShape}
                          />
                        </div>
                      </div>
                    ) : (
                      // Empty pile
                      <DeckLabel
                        name={pile.name}
                        count={pileCards.length}
                        totalCount={pileCards.length}
                        shape={cardShape}
                      />
                    )}
                  </SvgDeckShape>
                </div>
              ) : (
                // CSS rendering for standard shapes
                <div
                  className={`absolute inset-0 bg-slate-800 border-2 flex flex-col items-center justify-center transition-colors ${
                    currentTool !== 'none'
                      ? 'cursor-default'
                      : pile.position === 'free'
                        ? pile.locked
                          ? 'border-red-600 cursor-pointer'
                          : draggingPile?.pile.id === pile.id
                            ? 'border-yellow-400 cursor-grabbing'
                            : 'border-slate-600 cursor-move hover:border-slate-500'
                        : 'border-slate-600 cursor-pointer'
                  }`}
                  style={shapeStyles}
                  onContextMenu={(e) => handlePileContextMenu?.(e, pile, deck)}
                  onMouseDown={(e) => {
                    if (pile.position === 'free' && !pile.locked && e.button === 0) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingPile?.({ pile, deck });
                      if (pileDragStartRef) {
                        pileDragStartRef.current = {
                          x: e.clientX - (pile.x ?? 0),
                          y: e.clientY - (pile.y ?? 0)
                        };
                      }
                    }
                  }}
                >
                  {pile.showTopCard && topCard ? (
                    // Show top card face without text overlay
                    <div className="w-full h-full relative overflow-hidden" style={shapeStyles}>
                      <div className="w-full h-full" style={getCardBackgroundStyles(topCard)} />
                    </div>
                  ) : topCard ? (
                    // Normal pile appearance with optional face up display
                    <div className="w-full h-full relative overflow-hidden" style={shapeStyles}>
                      <div
                        className="w-full h-full"
                        style={pile.faceUp ? getCardBackgroundStyles(topCard) : { backgroundColor: '#1e293b' }}
                      />
                      {/* Pile name overlay with count */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                        <span className="text-xs text-white font-bold px-2 text-center select-none drop-shadow-md">
                          {pile.name}
                        </span>
                        <span className="text-xs text-slate-300 select-none drop-shadow-md">{pileCards.length}</span>
                      </div>
                    </div>
                  ) : (
                    // Empty pile
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-xs text-slate-300 font-bold px-2 text-center select-none">{pile.name}</span>
                      <span className="text-xs text-slate-500 select-none">{pileCards.length}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Highlight overlay for pile - same approach as HandPanel */}
            {isHoveringPile && (
              <div
                className="absolute inset-0 pointer-events-none ring-4 ring-purple-500 ring-inset"
                style={{
                  left: pilePos.x,
                  top: pilePos.y,
                  width: effectiveWidth * pileSize,
                  height: effectiveHeight * pileSize,
                  transform: `rotate(${deck.rotation}deg)`,
                  zIndex: 200,
                  ...shapeStyles
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* Render the deck itself */}
      <React.Fragment>
        {/* Deck container - keeps normal z-index */}
        <div
          ref={deckRef}
          data-object-id={deck.id}
          onMouseDown={handleDeckMouseDown}
          onContextMenu={(e) => handleContextMenu?.(e, deck)}
          onMouseEnter={handleDeckMouseEnter}
          onMouseLeave={handleDeckMouseLeave}
          className={`absolute group ${currentTool !== 'none' && currentTool !== 'zoom' ? 'cursor-default' : draggingClass}`}
          style={{
            left: 0,
            top: 0,
            width: effectiveWidth,
            height: effectiveHeight,
            transform: `rotate(${deck.rotation}deg)`
          }}
        >
        {shouldUseSvgForDeck(cardShape) ? (
          // SVG rendering for geometric shapes (HEX, TRIANGLE, CIRCLE)
          <>
            {[2, 1, 0].map(i => (
              <div
                key={i}
                className="absolute pointer-events-none"
                style={{
                  width: '100%',
                  height: '100%',
                  top: 0,
                  left: 0,
                  transform: `translate(${i * DECK_OFFSET}px, ${i * DECK_OFFSET}px)`,
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

            {deck.showTopCard && topCard ? (
              // Show top card face
              <div className="absolute inset-0 overflow-hidden">
                <SvgDeckShape
                  shape={cardShape}
                  width={effectiveWidth}
                  height={effectiveHeight}
                  backgroundColor="white"
                  borderColor="#64748b"
                  borderWidth={2}
                  orientation={cardOrientation}
                >
                  <div
                    style={{ width: '100%', height: '100%', ...getCardBackgroundStyles(topCard) }}
                  />
                </SvgDeckShape>
              </div>
            ) : deck.showTopCardBack && topCard ? (
              // Show top card back
              <div className="absolute inset-0 overflow-hidden">
                <SvgDeckShape
                  shape={cardShape}
                  width={effectiveWidth}
                  height={effectiveHeight}
                  backgroundColor="#1e293b"
                  borderColor="#64748b"
                  borderWidth={2}
                  orientation={cardOrientation}
                >
                  <div
                    style={{ width: '100%', height: '100%', ...getCardBackStyles(topCard) }}
                  />
                </SvgDeckShape>
              </div>
            ) : deck.showDeckBack ? (
              // Show deck back
              <div className="absolute inset-0 overflow-hidden">
                <SvgDeckShape
                  shape={cardShape}
                  width={effectiveWidth}
                  height={effectiveHeight}
                  backgroundColor="#1e293b"
                  borderColor="#64748b"
                  borderWidth={2}
                  orientation={cardOrientation}
                >
                  <div
                    style={{ width: '100%', height: '100%', ...getCardBackStyles(topCard) }}
                  />
                </SvgDeckShape>
              </div>
            ) : (
              // Normal deck appearance with SVG shape
              <div className="absolute inset-0 cursor-pointer">
                <SvgDeckShape
                  shape={cardShape}
                  width={effectiveWidth}
                  height={effectiveHeight}
                  backgroundColor="#0f172a"
                  borderColor={deck.locked ? "#dc2626" : "#64748b"}
                  borderWidth={2}
                  orientation={cardOrientation}
                >
                  <Layers className="text-slate-400 mb-1" size={shouldUseSvgForDeck(cardShape) ? 12 : 16} />
                  <DeckLabel
                    name={deck.name}
                    count={isShuffling ? animatedCurrentCount : visibleCardCount}
                    totalCount={isShuffling ? animatedBaseCount : (deck.baseCardIds || deck.cardIds).length}
                    shape={cardShape}
                  />
                </SvgDeckShape>
              </div>
            )}
          </>
        ) : (
          // CSS rendering for standard shapes (POKER, BRIDGE, etc.)
          <>
            {[2, 1, 0].map(i => (
              <div
                key={i}
                className="absolute bg-slate-800 border-2 border-slate-600 pointer-events-none"
                style={{
                  width: '100%',
                  height: '100%',
                  top: 0,
                  left: 0,
                  transform: `translate(${i * DECK_OFFSET}px, ${i * DECK_OFFSET}px)`,
                  zIndex: -i,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                  ...shapeStyles
                }}
              />
            ))}

            {deck.showTopCard && topCard ? (
              // Show top card face
              <div className="w-full h-full relative overflow-hidden" style={shapeStyles}>
                <div
                  className="w-full h-full"
                  style={getCardBackgroundStyles(topCard)}
                />
              </div>
            ) : deck.showTopCardBack && topCard ? (
              // Show top card back
              <div className="w-full h-full relative overflow-hidden" style={shapeStyles}>
                <div
                  className="w-full h-full"
                  style={getCardBackStyles(topCard)}
                />
              </div>
            ) : deck.showDeckBack ? (
              // Show deck back
              <div className="w-full h-full relative overflow-hidden" style={shapeStyles}>
                <div
                  className="w-full h-full"
                  style={getCardBackStyles(topCard)}
                />
              </div>
            ) : (
              // Normal deck appearance
              <div className="absolute inset-0 bg-slate-900 border-2 border-slate-500 flex flex-col items-center justify-center cursor-pointer transition-colors" style={shapeStyles}>
                <Layers className="text-slate-400 mb-2" />
                <span className="text-xs text-slate-300 font-bold px-2 text-center select-none">{deck.name}</span>
                <span className={`text-xs select-none ${isShuffling ? 'text-green-400' : 'text-slate-500'}`}>
                  {isShuffling ? animatedCurrentCount : visibleCardCount} / {isShuffling ? animatedBaseCount : (deck.baseCardIds || deck.cardIds).length}
                </span>
              </div>
            )}
          </>
        )}

        {/* Action buttons on bottom edge - like cards */}
        {/* Hide buttons when cursor slot has cards or when drawing tool is active (except zoom) */}
        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1 transition-opacity z-[50] pointer-events-none ${isCursorOver || (currentTool !== 'none' && currentTool !== 'zoom') ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
          {(() => {
            // Define all possible buttons based on actionButtons setting
            const actionButtons = deck.actionButtons || [];

            const buttonConfigs: Record<string, { key: string; action: (e?: React.MouseEvent | undefined) => void; className: string; title: string; icon: React.ReactNode }> = {
              draw: {
                key: 'draw',
                action: () => executeClickAction?.(deck, 'draw'),
                className: 'bg-blue-600 hover:bg-blue-500',
                title: 'Draw',
                icon: <Hand size={14} />
              },
              playTopCard: {
                key: 'playTopCard',
                action: (e?: React.MouseEvent) => executeClickAction?.(deck, 'playTopCard', e),
                className: 'bg-green-600 hover:bg-green-500',
                title: 'Play Top',
                icon: <ArrowUp size={14} />
              },
              shuffleDeck: {
                key: 'shuffleDeck',
                action: () => executeClickAction?.(deck, 'shuffleDeck'),
                className: 'bg-purple-600 hover:bg-purple-500',
                title: 'Shuffle',
                icon: <Shuffle size={14} />
              },
              searchDeck: {
                key: 'searchDeck',
                action: () => {
                  setSearchModalDeck?.(deck);
                  setSearchModalPile?.(undefined);
                },
                className: 'bg-cyan-600 hover:bg-cyan-500',
                title: 'Search',
                icon: <Search size={14} />
              },
              topDeck: {
                key: 'topDeck',
                action: () => {
                  setTopDeckModalDeck?.(deck);
                },
                className: 'bg-orange-600 hover:bg-orange-500',
                title: 'Top Deck',
                icon: <ArrowUp size={14} />
              },
              piles: {
                key: 'piles',
                action: (e?: React.MouseEvent) => { if (e) handlePilesButtonClick(e); },
                className: 'bg-indigo-600 hover:bg-indigo-500',
                title: 'Piles',
                icon: <Layers size={14} />
              },
              returnAll: {
                key: 'returnAll',
                action: () => executeClickAction?.(deck, 'returnAll'),
                className: 'bg-red-600 hover:bg-red-500',
                title: 'Return All',
                icon: <Undo size={14} />
              },
              clone: {
                key: 'clone',
                action: () => executeClickAction?.(deck, 'clone'),
                className: 'bg-cyan-600 hover:bg-cyan-500',
                title: 'Clone',
                icon: <Copy size={14} />
              },
              delete: {
                key: 'delete',
                action: () => setDeleteCandidateId?.(deck.id),
                className: 'bg-red-600 hover:bg-red-500',
                title: 'Delete',
                icon: <Trash2 size={14} />
              },
              lock: {
                key: 'lock',
                action: () => executeClickAction?.(deck, 'lock'),
                className: 'bg-yellow-600 hover:bg-yellow-500',
                title: deck.locked ? 'Unlock' : 'Lock',
                icon: deck.locked ? <Unlock size={14} /> : <Lock size={14} />
              },
              layer: {
                key: 'layer',
                action: () => executeClickAction?.(deck, 'layerUp'),
                className: 'bg-indigo-600 hover:bg-indigo-500',
                title: 'Layer Up',
                icon: <Layers size={14} />
              },
              rotateClockwise: {
                key: 'rotateClockwise',
                action: () => executeClickAction?.(deck, 'rotateClockwise'),
                className: 'bg-yellow-600 hover:bg-yellow-500',
                title: 'Rotate Clockwise',
                icon: <RefreshCw size={14} />
              },
              rotateCounterClockwise: {
                key: 'rotateCounterClockwise',
                action: () => executeClickAction?.(deck, 'rotateCounterClockwise'),
                className: 'bg-yellow-600 hover:bg-yellow-500',
                title: 'Rotate Counter-Clockwise',
                icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
              },
              swingClockwise: {
                key: 'swingClockwise',
                action: () => executeClickAction?.(deck, 'swingClockwise'),
                className: 'bg-orange-600 hover:bg-orange-500',
                title: 'Swing Clockwise',
                icon: <RefreshCw size={14} />
              },
              swingCounterClockwise: {
                key: 'swingCounterClockwise',
                action: () => executeClickAction?.(deck, 'swingCounterClockwise'),
                className: 'bg-orange-600 hover:bg-orange-500',
                title: 'Swing Counter-Clockwise',
                icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
              },
              millTopCard: {
                key: 'millTopCard',
                action: () => executeClickAction?.(deck, 'millTopCard'),
                className: 'bg-teal-600 hover:bg-teal-500',
                title: 'Mill',
                icon: <Undo size={14} />
              },
              toBottom: {
                key: 'toBottom',
                action: () => executeClickAction?.(deck, 'toBottom'),
                className: 'bg-yellow-500 hover:bg-yellow-400',
                title: 'To Bottom',
                icon: <ArrowDown size={14} />
              },
            };

            const buttons = actionButtons
              .map(action => buttonConfigs[action])
              .filter(btnConfig => btnConfig && can(btnConfig.key as ContextAction))
              .slice(0, 4);

            return buttons.map(btn => (
              <button
                key={btn.key}
                onClick={(e) => { e.stopPropagation(); btn.action(e); }}
                onMouseDown={(e) => { e.stopPropagation(); }}
                className={`pointer-events-auto p-2 rounded-lg text-white shadow ${btn.className}`}
                title={btn.title}
              >
                {btn.icon}
              </button>
            ));
          })()}
        </div>
        </div>

        {/* Highlight overlay - same approach as HandPanel */}
        {canDropCard && (
          <div
            className="absolute inset-0 pointer-events-none ring-4 ring-purple-500 ring-inset"
            style={{
              transform: `rotate(${deck.rotation}deg)`,
              zIndex: 200,
              ...shapeStyles
            }}
          />
        )}
      </React.Fragment>
      </div>
    </Tooltip>
  );
});

// Memoize DeckComponent to prevent unnecessary re-renders
export default React.memo(DeckComponent, (prevProps, nextProps) => {
  return (
    prevProps.deck.id === nextProps.deck.id &&
    prevProps.deck.rotation === nextProps.deck.rotation &&
    prevProps.deck.locked === nextProps.deck.locked &&
    prevProps.draggingId === nextProps.draggingId &&
    prevProps.hoveredPileId === nextProps.hoveredPileId &&
    prevProps.currentTool === nextProps.currentTool &&
    prevProps.disableDeckHighlight === nextProps.disableDeckHighlight
    // УБРАЛИ сравнение массивов - они вызывают постоянные ререндеры!
  );
});
