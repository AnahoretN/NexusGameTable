import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store/GameContext';
import { Deck, Card, CardPile } from '../types';
import { X, ArrowUp, Eye, EyeOff, Hand, ArrowDown, Trash2, RefreshCw } from 'lucide-react';
import { Card as CardComponent } from './Card';
import { CardOrientation } from '../types';

const DEFAULT_MODAL_WIDTH = 75.75; // vw
const MIN_MODAL_WIDTH = 50; // vw
const MAX_MODAL_WIDTH = 95; // vw

interface TopDeckModalProps {
  deck: Deck;
  onClose: () => void;
}

export const TopDeckModal: React.FC<TopDeckModalProps> = ({ deck, onClose }) => {
  const { state, dispatch } = useGame();
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const [cardOrder, setCardOrder] = useState<string[]>(deck.cardIds);

  // Modal width state
  const [modalWidth, setModalWidth] = useState(DEFAULT_MODAL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ mouseX: number; startWidth: number } | null>(null);

  const cards = useMemo(() =>
    cardOrder.map(id => state.objects[id] as Card).filter(Boolean),
    [cardOrder, state.objects]
  );

  // Get the mill pile (pile with isMillPile = true)
  const millPile = deck.piles?.find(p => p.isMillPile);

  const baseCardWidth = 140;
  const isHorizontal = deck.cardOrientation === CardOrientation.HORIZONTAL;
  const scaledBaseCardWidth = isHorizontal ? baseCardWidth * 1.254 : baseCardWidth;

  const getCardDimensions = useCallback((card: Card) => {
    const actualCardWidth = card.width ?? 100;
    const actualCardHeight = card.height ?? 140;
    const isHorizontal = deck.cardOrientation === CardOrientation.HORIZONTAL;
    const layoutWidth = isHorizontal ? actualCardHeight : actualCardWidth;
    const layoutHeight = isHorizontal ? actualCardWidth : actualCardHeight;
    const aspectRatio = layoutWidth / layoutHeight;
    const cardHeight = scaledBaseCardWidth / aspectRatio;
    return { width: scaledBaseCardWidth, height: cardHeight };
  }, [deck.cardOrientation, scaledBaseCardWidth]);

  // Set initial flip state when modal opens: top card face up, others face down
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Set all cards face down first
    deck.cardIds.forEach((cardId, index) => {
      const card = state.objects[cardId] as Card;
      if (!card) return;

      // Top card (index 0) should be face up, others face down
      const shouldBeFaceUp = index === 0;
      if (card.faceUp !== shouldBeFaceUp) {
        dispatch({ type: 'FLIP_CARD', payload: { cardId } });
      }
    });
  }, [deck.cardIds, state.objects, dispatch]);

  // Flip handler
  const handleFlip = useCallback((cardId: string) => {
    dispatch({ type: 'FLIP_CARD', payload: { cardId } });
  }, [dispatch]);

  // To Hand handler
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
    dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: newCardOrder } });
    setCardOrder(newCardOrder);
  }, [dispatch, state.activePlayerId, cardOrder, deck.id]);

  // Mill to Bottom - send card to bottom of deck
  const handleMillToBottom = useCallback((cardId: string) => {
    dispatch({ type: 'MILL_CARD_TO_BOTTOM', payload: { cardId, deckId: deck.id } });
    const newCardOrder = [...cardOrder.filter(id => id !== cardId), cardId];
    setCardOrder(newCardOrder);
  }, [dispatch, cardOrder, deck.id]);

  // Mill - send card to mill pile
  const handleMill = useCallback((cardId: string) => {
    if (!millPile) {
      console.warn('No mill pile found for deck');
      return;
    }

    dispatch({ type: 'MILL_CARD_TO_PILE', payload: { cardId, deckId: deck.id, pileId: millPile.id } });
    const newCardOrder = cardOrder.filter(id => id !== cardId);
    setCardOrder(newCardOrder);
  }, [dispatch, cardOrder, deck.id, millPile]);

  // Modal resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = {
      mouseX: e.clientX,
      startWidth: modalWidth
    };
    setIsResizing(true);
  }, [modalWidth]);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeStartRef.current) return;

      const deltaX = resizeStartRef.current.mouseX - e.clientX;
      const windowWidth = window.innerWidth;
      const deltaVw = (deltaX / windowWidth) * 100;
      const newWidth = resizeStartRef.current.startWidth + deltaVw;

      setModalWidth(Math.max(MIN_MODAL_WIDTH, Math.min(MAX_MODAL_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  // Action buttons for each card (Flip, To Hand, Mill to Bottom, Mill)
  const getCardButtons = (card: Card, index: number) => {
    const isTopCard = index === 0;

    return (
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {/* Flip - always available */}
        <button
          onClick={(e) => { e.stopPropagation(); handleFlip(card.id); }}
          className="p-1.5 rounded-lg text-white shadow bg-purple-600 hover:bg-purple-500 pointer-events-auto"
          title="Flip"
        >
          {card.faceUp ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>

        {/* To Hand - always available */}
        <button
          onClick={(e) => { e.stopPropagation(); handleToHand(card.id); }}
          className="p-1.5 rounded-lg text-white shadow bg-blue-600 hover:bg-blue-500 pointer-events-auto"
          title="To Hand"
        >
          <Hand size={12} />
        </button>

        {/* Mill to Bottom - send to bottom of deck */}
        <button
          onClick={(e) => { e.stopPropagation(); handleMillToBottom(card.id); }}
          className="p-1.5 rounded-lg text-white shadow bg-green-600 hover:bg-green-500 pointer-events-auto"
          title="Mill to Bottom"
        >
          <ArrowDown size={12} />
        </button>

        {/* Mill - send to mill pile (if exists) */}
        {millPile && (
          <button
            onClick={(e) => { e.stopPropagation(); handleMill(card.id); }}
            className="p-1.5 rounded-lg text-white shadow bg-red-600 hover:bg-red-500 pointer-events-auto"
            title={`Mill to ${millPile.name}`}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-in fade-in duration-200">
      <div
        ref={modalContainerRef}
        className="bg-slate-900 border border-slate-600 rounded-xl shadow-2xl h-[80vh] flex flex-col relative overflow-hidden"
        style={{ width: `${modalWidth}vw` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
              <ArrowUp className="text-green-400" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Top Deck - {deck.name}</h2>
              <p className="text-sm text-slate-400">{cards.length} card{cards.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModalWidth(DEFAULT_MODAL_WIDTH)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
              title="Reset Size"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Left resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize bg-slate-700 hover:bg-green-500 transition-colors z-10 flex items-center justify-center select-none
            ${isResizing ? 'w-2' : 'w-1'}`}
          style={{ minWidth: isResizing ? '8px' : '4px' }}
        >
          <RefreshCw size={14} className="text-slate-500 opacity-50 hover:opacity-100" />
        </div>

        {/* Cards Grid */}
        <div className="flex-1 overflow-y-scroll p-3 custom-scrollbar">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <ArrowUp size={48} className="mb-4 opacity-50" />
              <p className="text-lg">No cards in deck</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-[2px] w-full">
              {cards.map((card, index) => {
                const { width: cardWidth, height: cardHeight } = getCardDimensions(card);

                return (
                  <div
                    key={card.id}
                    className="relative flex-shrink-0 group transition-all"
                    style={{ width: cardWidth, height: cardHeight }}
                  >
                    <CardComponent
                      card={card}
                      overrideWidth={cardWidth}
                      overrideHeight={cardHeight}
                      cardNamePosition={deck.cardNamePosition}
                      cardOrientation={deck.cardOrientation}
                      disableRotationTransform={true}
                      showActionButtons={false}
                    />

                    {/* Custom action buttons for Top Deck */}
                    {getCardButtons(card, index)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-4 py-2 border-t border-slate-700 bg-slate-800">
          <div className="text-sm text-slate-400">
            {millPile ? (
              <span>Mill pile: <span className="text-green-400">{millPile.name}</span></span>
            ) : (
              <span className="text-yellow-500">No mill pile configured</span>
            )}
          </div>
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
