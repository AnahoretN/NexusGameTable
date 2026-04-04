import { t as translate, Locale } from '../utils/translations';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store/GameContext';
import { Deck, Card, CardPile, ContextAction, AppLanguage } from '../types';
import { X, ArrowUp, Eye, EyeOff, Hand, ArrowDown, Trash2, RefreshCw, Copy } from 'lucide-react';
import { logger } from '../utils/logger';
import { Card as CardComponent } from './Card';
import { CardOrientation } from '../types';
import { DEFAULT_HAND_CARD_WIDTH, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT } from '../constants';

const DEFAULT_MODAL_WIDTH = 1400; // px
const MIN_MODAL_WIDTH = 900; // px
const MAX_MODAL_WIDTH = 1800; // px
const DEFAULT_MODAL_HEIGHT = 900; // px

interface TopDeckModalProps {
  deck: Deck;
  onClose: () => void;
  language?: AppLanguage;
}

export const TopDeckModal: React.FC<TopDeckModalProps> = ({ deck, onClose, language = 'en' }) => {

  const { state, dispatch } = useGame();
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const currentPlayerId = state.activePlayerId;
  const currentPlayer = state.players.find(p => p.id === currentPlayerId);
  const isGM = currentPlayer?.isGM ?? false;

  const [cardOrder, setCardOrder] = useState<string[]>(deck.cardIds);

  // Modal width state
  const [modalWidth, setModalWidth] = useState(DEFAULT_MODAL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ mouseX: number; startWidth: number } | null>(null);

  const cards = useMemo(() =>
    cardOrder.map(id => state.objects[id] as Card).filter(Boolean).filter(card => isGM || !card.hidden),
    [cardOrder, state.objects, isGM]
  );

  // Get the mill pile (pile with isMillPile = true)
  const millPile = deck.piles?.find(p => p.isMillPile);

  const baseCardWidth = DEFAULT_HAND_CARD_WIDTH;
  const isHorizontal = deck.cardOrientation === CardOrientation.HORIZONTAL;
  const scaledBaseCardWidth = isHorizontal ? baseCardWidth * 1.254 : baseCardWidth;

  const getCardDimensions = useCallback((card: Card) => {
    const actualCardWidth = card.width ?? DEFAULT_DECK_WIDTH;
    const actualCardHeight = card.height ?? DEFAULT_DECK_HEIGHT;
    // Card dimensions now reflect the orientation (no swap needed)
    const aspectRatio = actualCardWidth / actualCardHeight;
    const cardHeight = scaledBaseCardWidth / aspectRatio;
    return { width: scaledBaseCardWidth, height: cardHeight };
  }, [scaledBaseCardWidth]);

  // Set initial flip state when modal opens: top card face up, others face down
  const initializedRef = useRef(false);
  const prevCardIdsRef = useRef<string[] | null>(null);

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

    // Initialize prevCardIdsRef
    prevCardIdsRef.current = [...deck.cardIds];
  }, [deck.cardIds, state.objects, dispatch]);

  // Sync cardOrder with deck.cardIds
  // This ensures cards reorder visually after move operations
  useEffect(() => {
    const currentDeck = state.objects[deck.id] as Deck;
    if (currentDeck && currentDeck.cardIds) {
      const prevIds = prevCardIdsRef.current;
      // Only sync if deck.cardIds has changed (reorder operation)
      if (prevIds && JSON.stringify(currentDeck.cardIds) !== JSON.stringify(prevIds)) {
        setCardOrder([...currentDeck.cardIds]);
      }
      prevCardIdsRef.current = [...currentDeck.cardIds];
    }
  }, [state.objects, deck.id]);

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
    // cardOrder will sync via useEffect with deck.cardIds
  }, [dispatch, deck.id]);

  // Mill - send card to mill pile
  const handleMill = useCallback((cardId: string) => {
    if (!millPile) {
      logger.warn('No mill pile found for deck');
      return;
    }

    dispatch({ type: 'MILL_CARD_TO_PILE', payload: { cardId, deckId: deck.id, pileId: millPile.id } });
    const newCardOrder = cardOrder.filter(id => id !== cardId);
    setCardOrder(newCardOrder);
  }, [dispatch, cardOrder, deck.id, millPile]);

  // Move to Top Deck
  const handleMoveToTopDeck = useCallback((cardId: string) => {
    // Card is already at top in Top Deck modal, just keep it there
    // No action needed
  }, []);

  // Move to Bottom Deck
  const handleMoveToBottomDeck = useCallback((cardId: string) => {
    dispatch({ type: 'RETURN_CARD_TO_DECK_BOTTOM', payload: { cardId, deckId: deck.id } });
    // cardOrder will sync via useEffect with deck.cardIds
  }, [dispatch, deck.id]);

  // Move to Discard
  const handleMoveToDiscard = useCallback((cardId: string) => {
    if (!millPile) {
      logger.warn('No discard pile found for deck');
      return;
    }
    dispatch({ type: 'MILL_CARD_TO_PILE', payload: { cardId, deckId: deck.id, pileId: millPile.id } });
    const newCardOrder = cardOrder.filter(id => id !== cardId);
    setCardOrder(newCardOrder);
  }, [dispatch, cardOrder, deck.id, millPile]);

  // Clone
  const handleClone = useCallback((cardId: string) => {
    dispatch({ type: 'CLONE_OBJECT', payload: { id: cardId } });
  }, [dispatch]);

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

  // Action buttons for each card - based on deck.cardActionButtons
  const getCardButtons = useCallback((card: Card) => {
    const actionButtons = deck.cardActionButtons || [];

    // Button configurations
    const buttonConfigs: Partial<Record<ContextAction, { className: string; title: string; icon: JSX.Element; onClick: () => void }>> = {
      flip: {
        className: 'bg-purple-600 hover:bg-purple-500',
        title: translate('Flip', language as Locale),
        icon: card.faceUp ? <EyeOff size={12} /> : <Eye size={12} />,
        onClick: () => handleFlip(card.id)
      },
      moveToHand: {
        className: 'bg-blue-600 hover:bg-blue-500',
        title: translate('Move to Hand', language as Locale),
        icon: <Hand size={12} />,
        onClick: () => handleToHand(card.id)
      },
      moveToTopDeck: {
        className: 'bg-orange-600 hover:bg-orange-500',
        title: translate('Move to Top Deck', language as Locale),
        icon: <ArrowUp size={12} />,
        onClick: () => handleMoveToTopDeck(card.id)
      },
      moveToBottomDeck: {
        className: 'bg-yellow-600 hover:bg-yellow-500',
        title: translate('Move to Bottom Deck', language as Locale),
        icon: <ArrowDown size={12} />,
        onClick: () => handleMoveToBottomDeck(card.id)
      },
      moveToDiscard: {
        className: 'bg-red-600 hover:bg-red-500',
        title: translate('Move to Discard', language as Locale),
        icon: <Trash2 size={12} />,
        onClick: () => handleMoveToDiscard(card.id)
      },
      millToBottom: {
        className: 'bg-green-600 hover:bg-green-500',
        title: translate('Mill to Bottom', language as Locale),
        icon: <ArrowDown size={12} />,
        onClick: () => handleMillToBottom(card.id)
      },
      clone: {
        className: 'bg-cyan-600 hover:bg-cyan-500',
        title: translate('Clone', language as Locale),
        icon: <Copy size={12} />,
        onClick: () => handleClone(card.id)
      }
    };

    // Add mill button only if mill pile exists and action is enabled
    if (millPile && !(buttonConfigs as any).mill) {
      (buttonConfigs as any).mill = {
        className: 'bg-red-600 hover:bg-red-500',
        title: translate(`Mill to ${millPile.name}`, language as Locale),
        icon: <Trash2 size={12} />,
        onClick: () => handleMill(card.id)
      };
    }

    // Render buttons based on actionButtons setting (max 4)
    const buttons = actionButtons
      .filter(action => action in buttonConfigs)
      .slice(0, 4)
      .map(action => buttonConfigs[action]!);

    if (buttons.length === 0) return null;

    return (
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {buttons.map((btn, idx) => (
          <button
            key={idx}
            onClick={(e) => { e.stopPropagation(); btn.onClick(); }}
            className={`p-1.5 rounded-lg text-white shadow ${btn.className} pointer-events-auto`}
            title={btn.title}
          >
            {btn.icon}
          </button>
        ))}
      </div>
    );
  }, [deck.cardActionButtons, millPile, handleFlip, handleToHand, handleMillToBottom, handleMill, handleMoveToTopDeck, handleMoveToBottomDeck, handleMoveToDiscard, handleClone, language]);

  return createPortal(
    <div className="fixed inset-0 z-[100002] flex items-center justify-center">
      <div
        ref={modalContainerRef}
        data-modal="top-deck"
        className="bg-slate-900 border border-slate-700 flex flex-col relative overflow-hidden"
        style={{ width: `${modalWidth}px`, height: `${DEFAULT_MODAL_HEIGHT}px` }}
      >
        {/* Header - minimal style */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <ArrowUp size={16} className="text-slate-400" />
            <span className="text-sm font-semibold text-white">{translate(`Top Deck - ${deck.name}`, language as Locale)}</span>
            <span className="text-xs text-slate-500">({cards.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModalWidth(DEFAULT_MODAL_WIDTH)}
              className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-white"
              title={translate('Reset Size', language as Locale)}
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="flex-1 overflow-y-scroll p-2 custom-scrollbar">
          <style>{`.custom-scrollbar::-webkit-scrollbar { width: 12px; } .custom-scrollbar::-webkit-scrollbar-track { background: #1e293b; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 6px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }`}</style>
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600">
              <ArrowUp size={32} className="mb-2 opacity-30" />
              <p className="text-sm">{translate('No cards in deck', language as Locale)}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-[2px] w-full">
              {cards.map((card, index) => {
                const { width: cardWidth, height: cardHeight } = getCardDimensions(card);

                return (
                  <div
                    key={card.id}
                    className="relative flex-shrink-0 group transition-all"
                    style={{
                      width: cardWidth,
                      height: cardHeight,
                      opacity: card.hidden && isGM ? 0.5 : 1
                    }}
                  >
                    <CardComponent
                      card={card}
                      overrideWidth={cardWidth}
                      overrideHeight={cardHeight}
                      cardNamePosition={deck.cardNamePosition}
                      cardOrientation={deck.cardOrientation}
                      disableRotationTransform={true}
                      showActionButtons={false}
                      deckSpriteConfig={deck.spriteConfig}
                      deckShowTooltipImage={deck.showTooltipImage}
                      deckTooltipScale={deck.tooltipScale}
                      language={language}
                    />

                    {/* Custom action buttons for Top Deck */}
                    {getCardButtons(card)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer - minimal */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700">
          <div className="text-xs text-slate-500">
            {millPile ? (
              <span>{translate(`Mill: ${millPile.name}`, language as Locale)}</span>
            ) : (
              <span className="text-slate-600">{translate('No mill pile', language as Locale)}</span>
            )}
          </div>
          <span className="text-xs text-slate-600">{translate('Top Deck', language as Locale)}</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
