import React, { useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store/GameContext';
import { Deck, Card, CardPile, ContextAction } from '../types';
import { X, Search, Eye, EyeOff, Hand, RefreshCw, Copy } from 'lucide-react';
import { Card as CardComponent } from './Card';

interface DragState {
  cardId: string | null;
  dragIndex: number | null;
  isDragging: boolean;
  // 'showBlueSlot' - true when blue slot is shown at dragged card's original position
  showBlueSlot: boolean;
  // 'cardInInvisibleSlot' - true when dragged card is in invisible preservation slot
  cardInInvisibleSlot: boolean;
  // 'determiningCardIndex' is the index of the card currently under the cursor
  determiningCardIndex: number | null;
  // 'purpleSlotIndex' is the index where purple slot appears (replaces the card at that index)
  purpleSlotIndex: number | null;
}

interface SearchDeckModalProps {
  deck: Deck;
  pile?: CardPile;
  onClose: () => void;
}

const getCardButtonConfigs = (card: Card, actionButtons: ContextAction[] = []) => {
  const configs: Partial<Record<ContextAction, { className: string; title: string; icon: JSX.Element }>> = {
    flip: {
      className: 'bg-purple-600 hover:bg-purple-500',
      title: 'Flip',
      icon: card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />
    },
    toHand: {
      className: 'bg-blue-600 hover:bg-blue-500',
      title: 'To Hand',
      icon: <Hand size={14} />
    },
    rotate: {
      className: 'bg-green-600 hover:bg-green-500',
      title: 'Rotate',
      icon: <RefreshCw size={14} />
    },
    clone: {
      className: 'bg-cyan-600 hover:bg-cyan-500',
      title: 'Clone',
      icon: <Copy size={14} />
    },
  };

  return actionButtons
    .filter(action => action in configs)
    .map(action => ({ action, ...configs[action]! }))
    .slice(0, 4);
};

export const SearchDeckModal: React.FC<SearchDeckModalProps> = ({ deck, pile, onClose }) => {
  const { state, dispatch } = useGame();
  const lastDropIndexRef = useRef<number | null>(null);

  const [cardOrder, setCardOrder] = useState<string[]>(
    pile ? pile.cardIds : deck.cardIds
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

  const isPile = !!pile;
  const title = isPile ? `${pile.name} - ${deck.name}` : deck.name;

  const cards = useMemo(() =>
    cardOrder.map(id => state.objects[id] as Card).filter(Boolean),
    [cardOrder, state.objects]
  );

  const cardActionButtons = deck.cardActionButtons || [];
  const baseCardWidth = 139;

  // Memoize card dimensions calculation
  const getCardDimensions = useCallback((card: Card) => {
    const actualCardWidth = card.width ?? 100;
    const actualCardHeight = card.height ?? 140;
    const isHorizontal = deck.cardOrientation === 'HORIZONTAL';
    const layoutWidth = isHorizontal ? actualCardHeight : actualCardWidth;
    const layoutHeight = isHorizontal ? actualCardWidth : actualCardHeight;
    const aspectRatio = layoutWidth / layoutHeight;
    const cardHeight = baseCardWidth / aspectRatio;
    return { width: baseCardWidth, height: cardHeight };
  }, [deck.cardOrientation, baseCardWidth]);

  const handleFlip = useCallback((cardId: string) => {
    dispatch({ type: 'FLIP_CARD', payload: { cardId } });
  }, [dispatch]);

  const handleToHand = useCallback((cardId: string) => {
    dispatch({
      type: 'UPDATE_OBJECT',
      payload: {
        id: cardId,
        location: 'HAND' as any,
        ownerId: state.activePlayerId,
        isOnTable: false,
        faceUp: true
      } as any
    });

    const newCardOrder = cardOrder.filter(id => id !== cardId);
    if (isPile && pile) {
      const updatedPiles = deck.piles?.map(p =>
        p.id === pile.id ? { ...p, cardIds: newCardOrder } : p
      );
      dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: updatedPiles } });
    } else {
      dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: newCardOrder } });
    }
    setCardOrder(newCardOrder);
  }, [dispatch, state.activePlayerId, cardOrder, isPile, pile, deck]);

  const handleRotate = useCallback((cardId: string) => {
    dispatch({ type: 'ROTATE_OBJECT', payload: { id: cardId, angle: 90 } });
  }, [dispatch]);

  const handleActionButtonClick = useCallback((card: Card, action: ContextAction) => {
    switch (action) {
      case 'flip':
        handleFlip(card.id);
        break;
      case 'toHand':
        handleToHand(card.id);
        break;
      case 'rotate':
        handleRotate(card.id);
        break;
      case 'clone':
        dispatch({ type: 'CLONE_OBJECT', payload: { id: card.id }});
        break;
    }
  }, [handleFlip, handleToHand, handleRotate, dispatch]);

  const resetDragState = useCallback(() => {
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
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, cardId: string, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);

    const target = e.currentTarget.cloneNode(true) as HTMLElement;
    target.style.position = 'absolute';
    target.style.top = '-9999px';
    target.style.left = '-9999px';
    document.body.appendChild(target);
    e.dataTransfer.setDragImage(target, 0, 0);

    setTimeout(() => {
      document.body.removeChild(target);
    }, 100);

    setDragState({
      cardId,
      dragIndex: index,
      isDragging: true,
      showBlueSlot: false,
      cardInInvisibleSlot: false,
      determiningCardIndex: null,
      purpleSlotIndex: null
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDragState(prev => ({
          ...prev,
          showBlueSlot: true,
          cardInInvisibleSlot: true
        }));
      });
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
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
  }, [dragState.dragIndex, dragState.purpleSlotIndex]);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

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

    const newCardOrder = [...cardOrder];
    newCardOrder.splice(dragIndex, 1);
    const adjustedDropIndex = dragIndex < actualDropIndex ? actualDropIndex - 1 : actualDropIndex;
    newCardOrder.splice(adjustedDropIndex, 0, cardId);

    if (isPile && pile) {
      const updatedPiles = deck.piles?.map(p =>
        p.id === pile.id ? { ...p, cardIds: newCardOrder } : p
      );
      dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: updatedPiles } });
    } else {
      dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: newCardOrder } });
    }

    setCardOrder(newCardOrder);
    resetDragState();
  }, [cardOrder, dragState, resetDragState, isPile, pile, deck, dispatch]);

  const handleDragEnd = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  // Purple slot component - extracted to avoid duplication
  const PurpleSlot = useCallback(({ index, width, height }: { index: number; width: number; height: number }) => (
    <div
      key={`purple-${index}`}
      className="relative flex-shrink-0 border-2 border-dashed border-purple-500/70 bg-purple-500/20 rounded-lg"
      style={{ width, height }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.stopPropagation();
        handleDrop(e, index);
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-purple-500/50 animate-pulse" />
      </div>
    </div>
  ), [handleDrop]);


  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-[75.525vw] h-[80vh] flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
              <Search className="text-purple-400" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{title}</h2>
              <p className="text-sm text-slate-400">{cards.length} card{cards.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Cards Grid */}
        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <Search size={48} className="mb-4 opacity-50" />
              <p className="text-lg">No cards in {isPile ? 'pile' : 'deck'}</p>
            </div>
          ) : (
            <div
              className="flex flex-wrap gap-[2px] w-full relative"
              onDragOver={(e) => {
                e.preventDefault();
                // Just allow drop, don't interfere with card handlers
              }}
              onDragLeave={(e) => {
                // When leaving the container entirely, reset
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                  setDragState(prev => ({ ...prev, determiningCardIndex: null, purpleSlotIndex: null }));
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(e, cards.length);
              }}
            >
              {cards.flatMap((card, index) => {
                const isDraggingCard = dragState.cardId === card.id;
                const isBlueSlotPosition = isDraggingCard && dragState.showBlueSlot && index === dragState.dragIndex;
                const buttons = getCardButtonConfigs(card, cardActionButtons);
                const { width: cardWidth, height: cardHeight } = getCardDimensions(card);
                const displayCard = useMemo(() => ({ ...card, faceUp: deck.searchFaceUp ?? true }), [card, deck.searchFaceUp]);

                const result: React.ReactNode[] = [];

                // Insert purple slot BEFORE this card if purpleSlotIndex equals current index
                if (dragState.purpleSlotIndex === index) {
                  const determiningCard = cards[dragState.determiningCardIndex ?? index];
                  const slotDims = determiningCard ? getCardDimensions(determiningCard) : { width: cardWidth, height: cardHeight };
                  result.push(<PurpleSlot index={index} width={slotDims.width} height={slotDims.height} />);
                }

                // Add blue slot at dragged card's original position
                if (isBlueSlotPosition) {
                  result.push(
                    <div
                      key={`blue-${index}`}
                      className="relative flex-shrink-0 border-2 border-dashed border-blue-500/70 bg-blue-500/20 rounded-lg"
                      style={{ width: cardWidth, height: cardHeight }}
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
                    >
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-2 border-blue-500/50 animate-pulse" />
                      </div>
                    </div>
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
                    className="relative flex-shrink-0 group transition-all"
                    style={{ cursor: dragState.isDragging ? 'grabbing' : 'grab' }}
                  >
                    <CardComponent
                      card={displayCard}
                      overrideWidth={cardWidth}
                      overrideHeight={cardHeight}
                      cardNamePosition={deck.cardNamePosition}
                      cardOrientation={deck.cardOrientation}
                    />

                    {buttons.length > 0 && (
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                        {buttons.map(btn => (
                          <button
                            key={btn.action}
                            onClick={(e) => { e.stopPropagation(); handleActionButtonClick(card, btn.action as ContextAction); }}
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
                  index={cards.length}
                  width={cards.length > 0 ? getCardDimensions(cards[cards.length - 1]).width : 139}
                  height={cards.length > 0 ? getCardDimensions(cards[cards.length - 1]).height : 194}
                />
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end items-center px-4 py-2 border-t border-slate-700 bg-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

