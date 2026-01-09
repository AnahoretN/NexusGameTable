import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useGame } from '../store/GameContext';
import { Card, CardLocation, ContextAction, Deck as DeckType } from '../types';
import { Hand, Plus, Minus, Eye, RefreshCw, Copy, GripVertical } from 'lucide-react';
import { Card as CardComponent } from './Card';

// Global handlers for drag-from-hand that survive component unmount
let globalHandDragMouseMove: ((e: MouseEvent) => void) | null = null;
let globalHandDragMouseUp: ((e: MouseEvent) => void) | null = null;
let globalHandDragData: {
  cardId: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  baseCardWidth: number;
  viewTransform: { offset: { x: number; y: number }; zoom: number };
  cardsAreaRect: DOMRect;
} | null = null;

interface DragState {
  cardId: string | null;
  dragIndex: number | null;
  isDragging: boolean;
  showBlueSlot: boolean;
  cardInInvisibleSlot: boolean;
  determiningCardIndex: number | null;
  purpleSlotIndex: number | null;
}

interface HandPanelProps {
  width?: number;
}

// Blue slot component - shows where dragged card was
const BlueSlot: React.FC<{ width: number; height: number; onDragLeave?: (e: React.DragEvent) => void; onDrop?: (e: React.DragEvent) => void }> = ({ width, height, onDragLeave, onDrop }) => (
  <div
    className="relative flex-shrink-0 border-2 border-dashed border-blue-500/70 bg-blue-500/20 rounded-lg"
    style={{ width, height }}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
  >
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-blue-500/50 animate-pulse" />
    </div>
  </div>
);

// Purple slot component - shows where card will be dropped
const PurpleSlot: React.FC<{ width: number; height: number; onDragOver?: (e: React.DragEvent) => void; onDrop?: (e: React.DragEvent) => void }> = ({ width, height, onDragOver, onDrop }) => (
  <div
    className="relative flex-shrink-0 border-2 border-dashed border-purple-500 bg-purple-500/20 rounded-lg"
    style={{ width, height }}
    onDragOver={onDragOver}
    onDrop={onDrop}
  >
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-purple-500" />
    </div>
  </div>
);

const getCardButtonConfigs = (
  card: Card,
  actionButtons: ContextAction[] = [],
  onFlip: () => void,
  onRotate: () => void,
  onClone: () => void
) => {
  const configs: Record<string, {
    className: string;
    title: string;
    icon: JSX.Element;
    onAction: () => void;
  }> = {
    flip: {
      className: 'bg-purple-600 hover:bg-purple-500',
      title: 'Flip',
      icon: card.faceUp ? <Eye size={14} /> : <Eye size={14} />,
      onAction: onFlip
    },
    rotate: {
      className: 'bg-green-600 hover:bg-green-500',
      title: 'Rotate',
      icon: <RefreshCw size={14} />,
      onAction: onRotate
    },
    clone: {
      className: 'bg-cyan-600 hover:bg-cyan-500',
      title: 'Clone',
      icon: <Copy size={14} />,
      onAction: onClone
    },
  };

  return actionButtons
    .filter(action => action in configs)
    .map(action => ({ action, ...configs[action]! }))
    .slice(0, 3);
};

export const HandPanel: React.FC<HandPanelProps> = ({ width = 286 }) => {
  const { state, dispatch } = useGame();
  const cardsAreaRef = useRef<HTMLDivElement>(null);
  const lastDropIndexRef = useRef<number | null>(null);

  // Get hand cards for current player
  const rawHandCards = useMemo(() =>
    (Object.values(state.objects) as Card[])
      .filter(obj =>
        obj.type === 'CARD' &&
        obj.location === CardLocation.HAND &&
        obj.ownerId === state.activePlayerId
      ) as Card[],
    [state.objects, state.activePlayerId]
  );

  // Use player's saved order if available, otherwise default sorting
  const currentPlayer = state.players.find(p => p.id === state.activePlayerId);
  const [cardOrder, setCardOrder] = useState<string[]>(
    () => {
      if (currentPlayer?.handCardOrder && currentPlayer.handCardOrder.length > 0) {
        return currentPlayer.handCardOrder.filter(id =>
          rawHandCards.some(c => c.id === id)
        );
      }
      return rawHandCards.sort((a, b) => b.id.localeCompare(a.id)).map(c => c.id);
    }
  );

  // Update cardOrder when rawHandCards change
  useEffect(() => {
    if (currentPlayer?.handCardOrder && currentPlayer.handCardOrder.length > 0) {
      const orderedIds = currentPlayer.handCardOrder.filter(id =>
        rawHandCards.some(c => c.id === id)
      );
      const newCardIds = rawHandCards
        .filter(c => !currentPlayer.handCardOrder?.includes(c.id))
        .map(c => c.id)
        .sort((a, b) => b.localeCompare(a));
      setCardOrder([...newCardIds, ...orderedIds]);
    } else {
      setCardOrder(rawHandCards.sort((a, b) => b.id.localeCompare(a.id)).map(c => c.id));
    }
  }, [rawHandCards, currentPlayer?.handCardOrder]);

  const cards = useMemo(() =>
    cardOrder.map(id => state.objects[id] as Card).filter(Boolean),
    [cardOrder, state.objects]
  );

  const [dragState, setDragState] = useState<DragState>({
    cardId: null,
    dragIndex: null,
    isDragging: false,
    showBlueSlot: false,
    cardInInvisibleSlot: false,
    determiningCardIndex: null,
    purpleSlotIndex: null
  });

  const [cardScale, setCardScale] = useState(1);
  const [draggingToTable, setDraggingToTable] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);

  // Get card settings from deck
  const getCardSettings = useCallback((card: Card) => {
    if (card.deckId) {
      const deck = state.objects[card.deckId] as DeckType;
      if (deck && deck.type === 'DECK') {
        return {
          cardOrientation: deck.cardOrientation,
          cardActionButtons: deck.cardActionButtons,
          cardWidth: deck.cardWidth,
          cardHeight: deck.cardHeight,
          cardNamePosition: deck.cardNamePosition,
        };
      }
    }
    return {
      cardOrientation: undefined,
      cardActionButtons: undefined,
      cardWidth: undefined,
      cardHeight: undefined,
      cardNamePosition: undefined,
    };
  }, [state.objects]);

  // Calculate card dimensions based on scale
  const getCardDimensions = useCallback((card: Card) => {
    const cardSettings = getCardSettings(card);
    const actualCardWidth = card.width ?? 100;
    const actualCardHeight = card.height ?? 140;
    const isHorizontal = cardSettings.cardOrientation === 'HORIZONTAL';
    const layoutWidth = isHorizontal ? actualCardHeight : actualCardWidth;
    const layoutHeight = isHorizontal ? actualCardWidth : actualCardHeight;
    const aspectRatio = layoutWidth / layoutHeight;

    // Base width: 140% of original (140 instead of 100), scaled by cardScale
    // Account for padding and gap
    const availableWidth = width - 20; // padding
    const baseCardWidth = Math.min(125, availableWidth / 2); // 133% base (140 - 5%), max 2 per row

    const cardWidth = baseCardWidth * cardScale;
    const cardHeight = cardWidth / aspectRatio;

    return { width: cardWidth, height: cardHeight };
  }, [cardScale, width, getCardSettings]);

  // Handle card drag start (reordering within hand)
  const handleDragStart = (e: React.DragEvent, cardId: string, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);

    // Create a custom drag image
    const target = e.currentTarget.cloneNode(true) as HTMLElement;
    target.style.position = 'absolute';
    target.style.top = '-9999px';
    target.style.left = '-9999px';
    document.body.appendChild(target);

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    e.dataTransfer.setDragImage(target, offsetX, offsetY);

    setTimeout(() => {
      document.body.removeChild(target);
    }, 100);

    // First set drag state without showing blue slot or hiding card
    setDragState({
      cardId,
      dragIndex: index,
      isDragging: true,
      showBlueSlot: false,
      cardInInvisibleSlot: false,
      determiningCardIndex: index,
      purpleSlotIndex: null
    });

    // Then show blue slot and hide card in next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDragState(prev => ({
          ...prev,
          showBlueSlot: true,
          cardInInvisibleSlot: true
        }));
      });
    });
  };

  // Handle drag over - determine drop position
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (index === dragState.dragIndex) {
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cursorX = e.clientX;
    const cardCenterX = rect.left + rect.width / 2;
    const cursorOnLeft = cursorX < cardCenterX;

    const newPurpleSlotIndex = cursorOnLeft ? index : index + 1;

    if (newPurpleSlotIndex !== dragState.purpleSlotIndex) {
      lastDropIndexRef.current = newPurpleSlotIndex;
      setDragState(prev => ({
        ...prev,
        determiningCardIndex: index,
        purpleSlotIndex: newPurpleSlotIndex
      }));
    }
  };

  // Handle drop - reorder cards
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const actualDropIndex = dragState.purpleSlotIndex ?? lastDropIndexRef.current ?? dropIndex;

    const { dragIndex, cardId } = dragState;
    if (dragIndex === null || cardId === null) {
      resetDragState();
      return;
    }

    if (dragIndex === actualDropIndex) {
      resetDragState();
      return;
    }

    const newOrder = [...cardOrder];
    newOrder.splice(dragIndex, 1);
    const adjustedDropIndex = dragIndex < actualDropIndex ? actualDropIndex - 1 : actualDropIndex;
    newOrder.splice(adjustedDropIndex, 0, cardId);

    setCardOrder(newOrder);
    dispatch({
      type: 'UPDATE_HAND_CARD_ORDER',
      payload: { playerId: state.activePlayerId, cardOrder: newOrder }
    });

    resetDragState();
  };

  // Handle drag end
  const handleDragEnd = () => {
    resetDragState();
  };

  const resetDragState = () => {
    lastDropIndexRef.current = null;
    setDragState({
      cardId: null,
      dragIndex: null,
      isDragging: false,
      showBlueSlot: false,
      cardInInvisibleSlot: false,
      determiningCardIndex: null,
      purpleSlotIndex: null
    });
  };

  // Handle card mouse down for drag to table (Shift+drag)
  const handleCardMouseDown = (e: React.MouseEvent, card: Card) => {
    // Only start drag-to-table if Shift+drag (normal drag is for reorder)
    if (e.button === 0 && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();

      const cardsArea = cardsAreaRef.current;
      if (!cardsArea) return;

      const cardsAreaRect = cardsArea.getBoundingClientRect();

      setDraggingToTable({
        cardId: card.id,
        x: e.clientX,
        y: e.clientY
      });
      setDragStartPos({ x: e.clientX, y: e.clientY });

      // Store global drag data
      globalHandDragData = {
        cardId: card.id,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        baseCardWidth: getCardDimensions(card).width,
        viewTransform: state.viewTransform,
        cardsAreaRect
      };

      // Set up global handlers
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (globalHandDragData) {
          globalHandDragData.currentX = e.clientX;
          globalHandDragData.currentY = e.clientY;
          setDraggingToTable({
            cardId: globalHandDragData.cardId,
            x: e.clientX,
            y: e.clientY
          });
        }
      };

      const handleGlobalMouseUp = (e: MouseEvent) => {
        if (!globalHandDragData) return;

        const { cardId, startX, startY, viewTransform, cardsAreaRect } = globalHandDragData;

        // Check if drag distance is significant
        const dragDistance = Math.sqrt(
          Math.pow(e.clientX - startX, 2) +
          Math.pow(e.clientY - startY, 2)
        );

        if (dragDistance > 10) {
          // Check if dropped outside sidebar
          const isOutsideSidebar =
            e.clientX < cardsAreaRect.left ||
            e.clientX > cardsAreaRect.right ||
            e.clientY < cardsAreaRect.top ||
            e.clientY > cardsAreaRect.bottom;

          if (isOutsideSidebar) {
            // Place card on table
            const cardObj = state.objects[cardId] as Card;
            if (cardObj) {
              const actualCardWidth = cardObj.width ?? 100;
              const actualCardHeight = cardObj.height ?? 140;
              const worldX = (e.clientX - viewTransform.offset.x) / viewTransform.zoom - actualCardWidth / 2;
              const worldY = (e.clientY - viewTransform.offset.y) / viewTransform.zoom - actualCardHeight / 2;

              // Get the highest zIndex
              const tableObjects = Object.values(state.objects).filter(obj =>
                obj.isOnTable && obj.id !== cardId
              );
              const allZ = tableObjects.map(o => o.zIndex || 0);
              const maxZ = allZ.length ? Math.max(...allZ) : 0;

              dispatch({
                type: 'UPDATE_OBJECT',
                payload: {
                  id: cardId,
                  x: worldX,
                  y: worldY,
                  location: CardLocation.TABLE,
                  ownerId: undefined,
                  isOnTable: true,
                  zIndex: maxZ + 1
                }
              });
            }
          }
        }

        // Clean up
        globalHandDragData = null;
        globalHandDragMouseMove = null;
        globalHandDragMouseUp = null;
        setDraggingToTable(null);
        setDragStartPos(null);

        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };

      globalHandDragMouseMove = handleGlobalMouseMove;
      globalHandDragMouseUp = handleGlobalMouseUp;

      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
  };

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

  const changeCardScale = (delta: number) => {
    setCardScale(prev => Math.max(0.5, Math.min(2, prev + delta)));
  };

  // Clean up global listeners on unmount
  useEffect(() => {
    return () => {
      if (globalHandDragMouseMove) {
        window.removeEventListener('mousemove', globalHandDragMouseMove);
      }
      if (globalHandDragMouseUp) {
        window.removeEventListener('mouseup', globalHandDragMouseUp);
      }
    };
  }, []);

  return (
    <div className="h-full flex flex-col p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Hand size={16} />
          Your Hand
        </h3>
        <div className="flex items-center gap-2">
          {/* Scale controls */}
          <button
            onClick={() => changeCardScale(-0.1)}
            className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300 hover:text-white transition-colors"
            title="Decrease card size"
          >
            <Minus size={12} />
          </button>
          <span className="text-xs text-gray-400 w-8 text-center">{Math.round(cardScale * 100)}%</span>
          <button
            onClick={() => changeCardScale(0.1)}
            className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300 hover:text-white transition-colors"
            title="Increase card size"
          >
            <Plus size={12} />
          </button>
          <span className="text-xs bg-purple-600 px-2 py-1 rounded-full text-white ml-1">{cards.length}</span>
        </div>
      </div>

      {/* Cards Grid */}
      <div
        ref={cardsAreaRef}
        className="flex-1 overflow-y-scroll custom-scrollbar"
      >
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-10">
            <Hand size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No cards in hand</p>
            <p className="text-xs mt-1">Draw cards from a deck or drag from table</p>
          </div>
        ) : (
          <div
            className="flex flex-wrap gap-[2px] w-full relative"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDragLeave={(e) => {
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                setDragState(prev => ({ ...prev, determiningCardIndex: null, purpleSlotIndex: null }));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragState.purpleSlotIndex === null) {
                handleDrop(e, cards.length);
              }
            }}
          >
            {cards.flatMap((card, index) => {
              const isDraggingCard = dragState.cardId === card.id;
              const isBlueSlotPosition = isDraggingCard && dragState.showBlueSlot && index === dragState.dragIndex;
              const cardSettings = getCardSettings(card);
              const cardActionButtons = cardSettings.cardActionButtons || [];
              const { width: cardWidth, height: cardHeight } = getCardDimensions(card);

              const buttons = getCardButtonConfigs(
                card,
                cardActionButtons,
                () => handleFlip(card.id),
                () => handleRotate(card.id),
                () => handleClone(card.id)
              );

              const result: React.ReactNode[] = [];

              // Insert purple slot BEFORE this card if purpleSlotIndex equals current index
              if (dragState.purpleSlotIndex === index) {
                const determiningCard = cards[dragState.determiningCardIndex ?? index];
                const slotDims = determiningCard ? getCardDimensions(determiningCard) : { width: cardWidth, height: cardHeight };
                result.push(
                  <PurpleSlot
                    key={`purple-${index}`}
                    width={slotDims.width}
                    height={slotDims.height}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDrop(e, index);
                    }}
                  />
                );
              }

              // Add blue slot at dragged card's original position
              if (isBlueSlotPosition) {
                result.push(
                  <BlueSlot
                    key={`blue-${index}`}
                    width={cardWidth}
                    height={cardHeight}
                    onDragLeave={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                        setDragState(prev => ({ ...prev, showBlueSlot: false }));
                      }
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDrop(e, index);
                    }}
                  />
                );
              }

              // Skip if card is in invisible preservation slot
              if (isDraggingCard && dragState.cardInInvisibleSlot) {
                return result;
              }

              // Add the card itself
              result.push(
                <div
                  key={card.id}
                  draggable
                  data-card-index={index}
                  onDragStart={(e) => handleDragStart(e, card.id, index)}
                  onDragOver={(e) => {
                    e.stopPropagation();
                    handleDragOver(e, index);
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleDrop(e, index);
                  }}
                  onDragEnd={handleDragEnd}
                  onMouseDown={(e) => handleCardMouseDown(e, card)}
                  className="relative flex-shrink-0 group transition-all"
                  style={{
                    cursor: dragState.isDragging ? 'grabbing' : 'grab',
                    width: cardWidth,
                    height: cardHeight
                  }}
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
                          key={btn.action}
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

              return result;
            })}

            {/* Purple slot after last card */}
            {dragState.purpleSlotIndex === cards.length && (
              <PurpleSlot
                key="purple-last"
                width={cards.length > 0 ? getCardDimensions(cards[cards.length - 1]).width : 100}
                height={cards.length > 0 ? getCardDimensions(cards[cards.length - 1]).height : 140}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.stopPropagation();
                  handleDrop(e, cards.length);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Drag preview for cards being dragged to table */}
      {draggingToTable && (() => {
        const card = cards.find(c => c.id === draggingToTable.cardId);
        if (!card) return null;
        const { width: cardWidth, height: cardHeight } = getCardDimensions(card);

        return (
          <div
            className="fixed pointer-events-none z-[10000]"
            style={{
              left: draggingToTable.x,
              top: draggingToTable.y,
              transform: 'translate(-50%, -50%)',
              filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))'
            }}
          >
            <CardComponent
              card={card}
              overrideWidth={cardWidth}
              overrideHeight={cardHeight}
              cardWidth={getCardSettings(card).cardWidth}
              cardHeight={getCardSettings(card).cardHeight}
              cardNamePosition={getCardSettings(card).cardNamePosition}
              cardOrientation={getCardSettings(card).cardOrientation}
              disableRotationTransform={true}
            />
          </div>
        );
      })()}
    </div>
  );
};
