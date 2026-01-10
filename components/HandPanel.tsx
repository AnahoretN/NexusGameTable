import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { Card, ContextAction, Deck as DeckType, CardOrientation, CardNamePosition } from '../types';
import { Hand, Plus, Minus, Eye, RefreshCw, Copy } from 'lucide-react';
import { Card as CardComponent } from './Card';

interface HandPanelProps {
  width?: number;
}

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
    }
  };

  return actionButtons.map(action => configs[action]).filter(Boolean);
};

export const HandPanel: React.FC<HandPanelProps> = ({ width = 286 }) => {
  const { state, dispatch } = useGame();

  // Track which card is being dragged
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

  // Listen for drag events
  useEffect(() => {
    const handleDragStart = (e: Event) => {
      const customEvent = e as CustomEvent<{ data: { cardId: string }; dragId: string }>;
      setDraggingCardId(customEvent.detail.data?.cardId || null);
    };

    const handleDragEnd = () => {
      setDraggingCardId(null);
    };

    window.addEventListener('global-drag-start', handleDragStart);
    window.addEventListener('global-drag-end', handleDragEnd);

    return () => {
      window.removeEventListener('global-drag-start', handleDragStart);
      window.removeEventListener('global-drag-end', handleDragEnd);
    };
  }, []);

  // Get cards in hand for current player
  const cards = useMemo(() =>
    Object.values(state.objects).filter(o =>
      o.type === 'CARD' && (o as Card).location === 'HAND' && (o as Card).ownerId === state.activePlayerId
    ) as Card[],
    [state.objects, state.activePlayerId]
  );

  // Base scale is 0.9 (90%), but displayed as 100% to user
  const BASE_SCALE = 0.9;
  const [displayScale, setDisplayScale] = useState(1);
  const actualScale = displayScale * BASE_SCALE;

  // Get card settings from deck
  const getCardSettings = useCallback((card: Card) => {
    if (!card.deckId) {
      return {
        cardWidth: 100,
        cardHeight: 140,
        cardNamePosition: 'none' as CardNamePosition,
        cardOrientation: CardOrientation.VERTICAL,
        cardActionButtons: []
      };
    }

    const deck = state.objects[card.deckId] as DeckType | undefined;
    return {
      cardWidth: deck?.cardWidth ?? 100,
      cardHeight: deck?.cardHeight ?? 140,
      cardNamePosition: (deck?.cardNamePosition ?? 'none') as CardNamePosition,
      cardOrientation: (deck?.cardOrientation ?? CardOrientation.VERTICAL) as CardOrientation,
      cardActionButtons: deck?.cardActionButtons ?? []
    };
  }, [state.objects]);

  // Get card dimensions based on scale
  const getCardDimensions = useCallback((card: Card) => {
    const settings = getCardSettings(card);
    const actualCardWidth = settings.cardWidth;
    const actualCardHeight = settings.cardHeight;
    const scaledWidth = actualCardWidth * actualScale;
    const scaledHeight = actualCardHeight * actualScale;
    const aspectRatio = scaledWidth / scaledHeight;

    // For horizontal cards, we calculate height based on width
    const baseWidth = 140;
    let cardWidth = baseWidth * actualScale;
    let cardHeight = cardWidth / aspectRatio;

    return { width: cardWidth, height: cardHeight };
  }, [actualScale, getCardSettings]);

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
    setDisplayScale(prev => Math.max(0.5, Math.min(2, prev + delta)));
  };

  return (
    <div className="h-full flex flex-col p-2" style={{ width }}>
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
          <span className="text-xs text-gray-400 w-8 text-center">{Math.round(displayScale * 100)}%</span>
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
      <div className="flex-1 overflow-y-scroll custom-scrollbar">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 py-10">
            <Hand size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No cards in hand</p>
            <p className="text-xs mt-1">Draw cards from a deck</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-[2px] w-full">
            {cards.map(card => {
              const cardSettings = getCardSettings(card);
              const cardActionButtons = cardSettings.cardActionButtons;
              const { width: cardWidth, height: cardHeight } = getCardDimensions(card);

              const buttons = getCardButtonConfigs(
                card,
                cardActionButtons,
                () => handleFlip(card.id),
                () => handleRotate(card.id),
                () => handleClone(card.id)
              );

              return (
                <div
                  key={card.id}
                  className="relative flex-shrink-0 group transition-all"
                  style={{ width: cardWidth, height: cardHeight, zIndex: draggingCardId === card.id ? 200 : 'auto' }}
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
  );
};
