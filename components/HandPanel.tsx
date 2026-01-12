
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useGame } from '../store/GameContext';
import { Card, Deck as DeckType, ItemType } from '../types';
import { Card as CardComponent } from './Card';
import { getCardSettings, getCardDimensions, getCardButtonConfigs } from '../utils/cardUtils';
import { MAIN_MENU_WIDTH } from '../constants';

interface HandPanelProps {
  width?: number;
  isDragTarget?: boolean; // When a card from tabletop is being dragged over hand
  isCollapsed?: boolean; // When true, show only header (height 32px)
  cardScale?: number; // Scale for card display (0.5 - 2)
}

export const HandPanel: React.FC<HandPanelProps> = ({ width = MAIN_MENU_WIDTH, isDragTarget = false, isCollapsed = false, cardScale = 1 }) => {
  const { state, dispatch } = useGame();
  const containerRef = useRef<HTMLDivElement>(null);

  // Local drag state for reorder
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Long-press state for adding cards to cursor slot
  const longPressTimerRef = useRef<number | null>(null);
  const longPressCardRef = useRef<{ cardId: string; startX: number; startY: number } | null>(null);

  // Local state for cursor slot hover (purple ring effect)
  const [isCursorOverHand, setIsCursorOverHand] = useState(false);

  // Listen for cursor slot move events to show purple ring when cursor with cards is over hand panel
  useEffect(() => {
    const handleCursorSlotMove = (e: Event) => {
      const customEvent = e as CustomEvent<{
        x: number;
        y: number;
        isOverMainMenu: boolean;
        hasCards: boolean;
      }>;

      const { x, y, hasCards } = customEvent.detail;

      if (!hasCards) {
        setIsCursorOverHand(false);
        return;
      }

      // Check if cursor is over hand panel using container's bounding rect
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const isOver = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        setIsCursorOverHand(isOver);
      } else {
        setIsCursorOverHand(false);
      }
    };

    const handleCursorSlotDrop = () => {
      setIsCursorOverHand(false);
    };

    window.addEventListener('cursor-slot-move', handleCursorSlotMove);
    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);

    return () => {
      window.removeEventListener('cursor-slot-move', handleCursorSlotMove);
      window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    };
  }, []);

  // Cleanup long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Get cards in hand for current player
  const cards = useMemo(() =>
    Object.values(state.objects).filter(o =>
      o.type === 'CARD' && (o as Card).location === 'HAND' && (o as Card).ownerId === state.activePlayerId
    ) as Card[],
    [state.objects, state.activePlayerId]
  );

  // Memoized getCardDimensions
  const computeCardDimensions = useCallback((card: Card) => {
    const deck = card.deckId ? (state.objects[card.deckId] as DeckType | undefined) : undefined;
    return getCardDimensions(card, deck, cardScale, 1);
  }, [state.objects, cardScale]);

  // Memoized getCardSettings
  const computeCardSettings = useCallback((card: Card) => {
    return getCardSettings(card, state.objects);
  }, [state.objects]);

  // Action handlers
  const handleFlip = useCallback((cardId: string) => {
    dispatch({ type: 'FLIP_CARD', payload: { cardId } });
  }, [dispatch]);

  const handleRotate = useCallback((cardId: string) => {
    dispatch({ type: 'ROTATE_OBJECT', payload: { id: cardId, angle: 90 } });
  }, [dispatch]);

  const handleClone = useCallback((cardId: string) => {
    dispatch({ type: 'CLONE_OBJECT', payload: { id: cardId } });
  }, [dispatch]);

  // Handle card mouse down - start reorder drag or add to cursor slot with Shift or long-press
  const handleCardMouseDown = useCallback((e: React.MouseEvent, cardId: string, index: number, _cardElement: HTMLDivElement | null) => {
    // Only left click
    if (e.button !== 0) return;

    // Don't drag if clicking on action buttons
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    // Shift+click: add to cursor slot immediately
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
        detail: { cardId, clientX: e.clientX, clientY: e.clientY }
      }));
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Start long-press timer (500ms) - if completed, add card to cursor slot
    longPressCardRef.current = {
      cardId,
      startX: e.clientX,
      startY: e.clientY
    };

    longPressTimerRef.current = window.setTimeout(() => {
      if (longPressCardRef.current) {
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: longPressCardRef.current.cardId,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'hold' // Mark as coming from long-press, so it drops on mouseup
          }
        }));
        longPressCardRef.current = null;
        longPressTimerRef.current = null;
        setDragIndex(null); // Cancel reorder drag
      }
    }, 250); // 250ms long-press

    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    setDragIndex(index);
  }, []);

  // Handle mouse move for reorder preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Check for long-press movement - if mouse moves while holding on a card, add to slot immediately
    if (longPressCardRef.current) {
      const moveThreshold = 5; // pixels
      const dx = e.clientX - longPressCardRef.current.startX;
      const dy = e.clientY - longPressCardRef.current.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= moveThreshold) {
        // Mouse moved enough - cancel timer and add to slot immediately
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
          detail: {
            cardId: longPressCardRef.current.cardId,
            clientX: e.clientX,
            clientY: e.clientY,
            source: 'hold' // Mark as coming from drag, so it drops on mouseup
          }
        }));
        longPressCardRef.current = null;
        setDragIndex(null); // Cancel reorder drag
        return;
      }
    }

    if (dragIndex === null) return;

    // Check if we moved enough to consider it a drag
    if (dragStartPosRef.current) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      const moveThreshold = 5;

      if (Math.abs(dx) < moveThreshold && Math.abs(dy) < moveThreshold) {
        return;
      }
    }

    // Find which card we're hovering over
    const container = containerRef.current;
    if (!container) return;

    const scrollContainer = container.querySelector('.custom-scrollbar') as HTMLElement;
    if (!scrollContainer) return;

    const cards = scrollContainer.querySelectorAll('[data-card-index]');

    cards.forEach((cardEl) => {
      const index = parseInt(cardEl.getAttribute('data-card-index') || '-1');
      if (index !== dragIndex && index >= 0) {
        const rect = cardEl.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          setDragOverIndex(index);
        }
      }
    });
  }, [dragIndex]);

  // Handle mouse up to complete reorder or drop to tabletop
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    // Clear long-press timer if mouse is released before timeout
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressCardRef.current = null;

    if (dragIndex === null) return;

    // Check if we're dropping outside hand panel (to tabletop)
    const container = containerRef.current;
    if (container && !container.contains(e.target as Node)) {
      // Drop to tabletop - will be handled by tabletop listener
      setDragIndex(null);
      setDragOverIndex(null);
      dragStartPosRef.current = null;
      return;
    }

    // Check if we're reordering within hand
    if (dragOverIndex !== null && dragOverIndex !== dragIndex) {
      // Reorder cards
      const newCards = [...cards];
      const [movedCard] = newCards.splice(dragIndex, 1);
      newCards.splice(dragOverIndex, 0, movedCard);

      const newCardOrder = newCards.map(c => c.id);
      dispatch({
        type: 'UPDATE_HAND_CARD_ORDER',
        payload: { playerId: state.activePlayerId, cardOrder: newCardOrder }
      });
    }

    setDragIndex(null);
    setDragOverIndex(null);
    dragStartPosRef.current = null;
  }, [dragIndex, dragOverIndex, cards, state.activePlayerId, dispatch]);

  // Set up global mouse listeners during drag
  useEffect(() => {
    if (dragIndex === null) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleMouseMove(e as any);
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      handleMouseUp(e as any);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragIndex, handleMouseMove, handleMouseUp]);

  // Listen for cursor slot drop events to add cards to hand
  useEffect(() => {
    const handleCursorSlotDrop = (e: Event) => {
      const customEvent = e as CustomEvent<{
        items: Array<{
          id: string;
          type: string;
          name?: string;
          frontFaceUrl?: string;
          backFaceUrl?: string;
          deckId?: string;
          width?: number;
          height?: number;
          [key: string]: any;
        }>;
      }>;

      const items = customEvent.detail.items;
      if (!items || items.length === 0) return;

      // Filter only cards (tokens can't be in hand)
      const cards = items.filter(item => item.type === ItemType.CARD);

      if (cards.length === 0) return;

      // Get current hand cards
      const handCards = Object.values(state.objects).filter(o =>
        o.type === ItemType.CARD && (o as Card).location === 'HAND' && (o as Card).ownerId === state.activePlayerId
      ) as Card[];

      // New card IDs to add at the beginning
      const newCardIds = cards.map(c => c.id);

      // New order: new cards first, then existing cards
      const newCardOrder = [...newCardIds, ...handCards.map(c => c.id)];

      // Update hand card order
      dispatch({
        type: 'UPDATE_HAND_CARD_ORDER',
        payload: { playerId: state.activePlayerId, cardOrder: newCardOrder }
      });

      // Add each card to the game state with hand location
      cards.forEach(card => {
        const cardPayload: Card = {
          id: card.id,
          type: ItemType.CARD,
          x: 0, // Cards in hand don't need world coordinates
          y: 0,
          rotation: 0,
          content: card.content || card.frontFaceUrl || '', // Use content (main image URL) first
          name: card.name || 'Card',
          locked: false,
          location: 'HAND' as any,
          ownerId: state.activePlayerId,
          isOnTable: false,
          faceUp: true,
          ...(card.frontFaceUrl && { frontFaceUrl: card.frontFaceUrl }),
          ...(card.backFaceUrl && { backFaceUrl: card.backFaceUrl }),
          ...(card.deckId && { deckId: card.deckId }),
          ...(card.width && { width: card.width }),
          ...(card.height && { height: card.height }),
        };

        dispatch({
          type: 'ADD_OBJECT',
          payload: cardPayload
        });
      });
    };

    window.addEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
    return () => window.removeEventListener('cursor-slot-drop-to-hand', handleCursorSlotDrop);
  }, [dispatch, state.objects, state.activePlayerId]);

  return (
    <div
      ref={containerRef}
      data-hand-panel="true"
      className="h-full flex flex-col transition-all"
      style={{ width }}
    >
      {/* Cards Grid - outer scroll container - hidden when collapsed */}
      {!isCollapsed && (
        <>
          <style>{`
            [data-hand-panel="true"] .hand-panel-scrollbar::-webkit-scrollbar {
              width: 16px !important;
            }
          `}</style>
          <div className="flex-1 hand-panel-scrollbar relative">
          {/* Purple ring overlay - rendered separately with high z-index */}
          {(isDragTarget || isCursorOverHand) && (
            <div className="absolute inset-0 pointer-events-none rounded ring-4 ring-purple-500 ring-inset z-[200]" />
          )}
          {/* Inner content container */}
          <div className="h-full transition-all p-1">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-10">
              <p className="text-sm">No cards in hand</p>
              <p className="text-xs mt-1">Draw cards from a deck</p>
            </div>
          ) : (
          <div className="flex flex-wrap gap-[2px] w-full">
            {cards.map((card, index) => {
              const cardSettings = computeCardSettings(card);
              const cardActionButtons = cardSettings.cardActionButtons;
              const { width: cardWidth, height: cardHeight } = computeCardDimensions(card);

              const buttons = getCardButtonConfigs(
                card,
                cardActionButtons,
                () => handleFlip(card.id),
                () => handleRotate(card.id),
                () => handleClone(card.id)
              );

              const isDragging = dragIndex === index;
              const isDragOver = dragOverIndex === index;

              return (
                <div
                  key={card.id}
                  data-card-index={index}
                  className="relative flex-shrink-0 group"
                  style={{
                    width: cardWidth,
                    height: cardHeight,
                    zIndex: isDragging ? 100 : isDragOver ? 50 : 'auto',
                    transform: isDragOver ? 'scale(1.05)' : undefined,
                  }}
                  onMouseDown={(e) => handleCardMouseDown(e, card.id, index, e.currentTarget as HTMLDivElement)}
                >
                  <CardComponent
                    card={card}
                    overrideWidth={cardWidth}
                    overrideHeight={cardHeight}
                    cardWidth={cardSettings.cardWidth}
                    cardHeight={cardSettings.cardHeight}
                    cardNamePosition={cardSettings.cardNamePosition}
                    cardOrientation={cardSettings.cardOrientation}
                    disableRotationTransform={true}
                  />

                  {buttons.length > 0 && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      {buttons.map(btn => (
                        <button
                          key={btn.title}
                          onClick={(e) => { e.stopPropagation(); btn.onAction(); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`p-1.5 rounded-lg text-white shadow ${btn.className} pointer-events-auto`}
                          title={btn.title}
                        >
                          {btn.icon}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
        </>
      )}
    </div>
  );
};
