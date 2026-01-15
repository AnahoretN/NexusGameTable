import React, { useCallback, useMemo } from 'react';
import { Layers, Lock, Shuffle, Hand, Eye, Search, Undo, Copy, Trash2, RefreshCw } from 'lucide-react';
import { useGame } from '../store/GameContext';
import { Deck as DeckType, CardPile, Card as CardType, ItemType } from '../types';
import { DECK_OFFSET } from '../constants';
import { Tooltip } from './Tooltip';

interface DeckComponentProps {
  deck: DeckType;
  draggingId: string | null;
  hoveredDeckId: string | null;
  hoveredPileId: string | null;
  setHoveredDeckId: (id: string | null) => void;
  setHoveredPileId: (id: string | null) => void;
  isGM: boolean;
  draggingClass: string;
  draggingPile: { pile: CardPile; deck: DeckType } | null;
  setDraggingPile: (pile: { pile: CardPile; deck: DeckType } | null) => void;
  pileDragStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
  setTopDeckModalDeck: (deck: DeckType | null) => void;
  handleMouseDown: (e: React.MouseEvent, id?: string) => void;
  handleContextMenu: (e: React.MouseEvent, obj: any) => void;
  handlePileContextMenu: (e: React.MouseEvent, pile: CardPile, deck: DeckType) => void;
  setSearchModalDeck: (deck: DeckType | null) => void;
  setSearchModalPile: (pile: CardPile | undefined) => void;
  setPilesButtonMenu: (menu: { x: number; y: number; deck: DeckType } | null) => void;
  setDeleteCandidateId: (id: string | null) => void;
  executeClickAction: (obj: any, action: string, event?: React.MouseEvent) => void;
  cursorSlotHasCards: boolean;
  allObjects: Record<string, any>;
}

export const DeckComponent: React.FC<DeckComponentProps> = ({
  deck,
  draggingId,
  hoveredDeckId,
  hoveredPileId,
  setHoveredDeckId,
  setHoveredPileId,
  isGM,
  draggingClass,
  draggingPile,
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
  cursorSlotHasCards = false,
  allObjects,
}) => {
  const { state } = useGame();

  const isDraggingCardFromTable = draggingId && state.objects[draggingId]?.type === ItemType.CARD;
  const canDropCard = (isDraggingCardFromTable || cursorSlotHasCards) && hoveredDeckId === deck.id;

  // Memoize visible card count calculation
  const visibleCardCount = useMemo(() => {
    return deck.cardIds.filter(id => {
      const card = allObjects?.[id];
      return card && !card.hidden;
    }).length;
  }, [deck.cardIds, allObjects]);

  // Memoize top card calculation
  const topCard = useMemo(() => {
    const visibleCardIds = deck.cardIds.filter(id => {
      const card = allObjects?.[id];
      return card && !card.hidden;
    });
    return visibleCardIds.length > 0 ? (allObjects[visibleCardIds[0]] as CardType) : null;
  }, [deck.cardIds, allObjects]);

  // Memoize piles grouping by position
  const { pilesByPosition, getPilePosition } = useMemo(() => {
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
        return { x: pile.x ?? 0, y: pile.y ?? 0 };
      }

      // Find index of this pile in its position group
      const positionGroup = pilesByPosition[pile.position] || [];
      const pileIndex = positionGroup.findIndex(p => p.id === pile.id);

      switch (pile.position) {
        case 'left':
          if (isHalfSize) {
            const yOffset = pileIndex * (deck.height * 0.5 + 2);
            return { x: deck.x - deck.width * 0.5 - 4, y: deck.y + yOffset };
          }
          return { x: deck.x - deck.width - 4, y: deck.y };
        case 'right':
          if (isHalfSize) {
            const yOffset = pileIndex * (deck.height * 0.5 + 2);
            return { x: deck.x + deck.width + 4, y: deck.y + yOffset };
          }
          return { x: deck.x + deck.width + 4, y: deck.y };
        case 'top':
          if (isHalfSize) {
            const xOffset = pileIndex * (deck.width * 0.5 + 2);
            return { x: deck.x + xOffset, y: deck.y - deck.height * 0.5 - 4 };
          }
          return { x: deck.x, y: deck.y - deck.height - 4 };
        case 'bottom':
          if (isHalfSize) {
            const xOffset = pileIndex * (deck.width * 0.5 + 2);
            return { x: deck.x + xOffset, y: deck.y + deck.height + 4 };
          }
          return { x: deck.x, y: deck.y + deck.height + 4 };
        default:
          return { x: deck.x, y: deck.y };
      }
    };

    return { pilesByPosition, getPilePosition };
  }, [deck.piles, deck.x, deck.y, deck.width, deck.height]);

  const handlePilesButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const deckElement = document.querySelector(`[data-object-id="${deck.id}"]`) as HTMLElement;
    if (deckElement) {
      const rect = deckElement.getBoundingClientRect();
      setPilesButtonMenu({
        x: rect.left,
        y: rect.bottom + 5,
        deck
      });
    }
  }, [deck.id, setPilesButtonMenu]);

  return (
    <Tooltip
      text={deck.tooltipText}
      showImage={deck.showTooltipImage}
      imageSrc={deck.content}
      scale={deck.tooltipScale}
    >
      <div style={{ position: 'relative', width: deck.width, height: deck.height }}>
        {/* Render piles */}
      {deck.piles?.filter(p => p.visible).map(pile => {
        const pilePos = getPilePosition(pile);
        const pileCards = pile.cardIds.map(id => state.objects[id]).filter(Boolean) as CardType[];
        const topCard = pileCards.length > 0 ? pileCards[0] : null;
        const pileSize = pile.size ?? 1;

        // Check if dragging a card and hovering over this pile
        const isHoveringPile = (isDraggingCardFromTable || cursorSlotHasCards) && hoveredPileId === pile.id;

        return (
          <React.Fragment key={pile.id}>
            {/* Highlight overlay - rendered separately with high z-index */}
            {isHoveringPile && (
              <div
                className="absolute ring-4 ring-purple-500 ring-opacity-75 pointer-events-none rounded"
                style={{
                  left: pilePos.x,
                  top: pilePos.y,
                  width: deck.width * pileSize,
                  height: deck.height * pileSize,
                  transform: `rotate(${deck.rotation}deg)`,
                  zIndex: 100
                }}
              />
            )}
            {/* Pile container - keeps normal z-index */}
            <div
              data-pile-id={pile.id}
              onMouseEnter={() => {
                // Allow hover if dragging card OR if cursor slot has cards
                const draggingFromTable = draggingId && state.objects[draggingId]?.type === ItemType.CARD;
                if (draggingFromTable || cursorSlotHasCards) {
                  setHoveredPileId(pile.id);
                }
              }}
              onMouseLeave={() => {
                if (hoveredPileId === pile.id) {
                  setHoveredPileId(null);
                }
              }}
              className={`absolute group ${draggingPile?.pile.id === pile.id ? 'opacity-50 scale-95 cursor-grabbing' : ''}`}
              style={{
                left: pilePos.x,
                top: pilePos.y,
                width: deck.width * pileSize,
                height: deck.height * pileSize,
                transform: `rotate(${deck.rotation}deg)`
              }}
            >
              {/* Pile visual representation */}
              <div
                className={`absolute inset-0 bg-slate-800 border-2 rounded flex flex-col items-center justify-center transition-colors ${
                  pile.position === 'free'
                    ? pile.locked
                      ? 'border-red-600 cursor-pointer'
                      : draggingPile?.pile.id === pile.id
                        ? 'border-yellow-400 cursor-grabbing'
                        : 'border-slate-600 cursor-move hover:border-slate-500'
                    : 'border-slate-600 cursor-pointer'
                }`}
                onContextMenu={(e) => handlePileContextMenu(e, pile, deck)}
                onMouseDown={(e) => {
                  if (pile.position === 'free' && !pile.locked && e.button === 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggingPile({ pile, deck });
                    pileDragStartRef.current = {
                      x: e.clientX - (pile.x ?? 0),
                      y: e.clientY - (pile.y ?? 0)
                    };
                  }
                }}
              >
                {pile.showTopCard && topCard ? (
                  // Show top card face without text overlay
                  <div className="w-full h-full relative overflow-hidden rounded">
                    <div
                      className="w-full h-full"
                      style={{
                        backgroundColor: 'white',
                        backgroundImage: topCard.content ? `url(${topCard.content})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    />
                  </div>
                ) : topCard ? (
                  // Normal pile appearance with optional face up display
                  <div className="w-full h-full relative overflow-hidden rounded">
                    <div
                      className="w-full h-full"
                      style={{
                        backgroundColor: pile.faceUp ? 'white' : '#1e293b',
                        backgroundImage: pile.faceUp && topCard.content ? `url(${topCard.content})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
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
            </div>
          </React.Fragment>
        );
      })}

      {/* Render the deck itself */}
      <React.Fragment>
        {/* Highlight overlay - rendered separately with high z-index */}
        {canDropCard && (
          <div
            className="absolute ring-4 ring-purple-500 ring-opacity-75 pointer-events-none rounded"
            style={{
              left: 0,
              top: 0,
              width: deck.width,
              height: deck.height,
              transform: `rotate(${deck.rotation}deg)`,
              zIndex: 100
            }}
          />
        )}
        {/* Deck container - keeps normal z-index */}
        <div
          data-object-id={deck.id}
          onMouseDown={(e) => isGM && handleMouseDown(e, deck.id)}
          onContextMenu={(e) => handleContextMenu(e, deck)}
          onMouseEnter={() => {
            // Allow hover if dragging card OR if cursor slot has cards
            const draggingFromTable = draggingId && state.objects[draggingId]?.type === ItemType.CARD;
            if (draggingFromTable || cursorSlotHasCards) {
              setHoveredDeckId(deck.id);
            }
          }}
          onMouseLeave={() => {
            if (hoveredDeckId === deck.id) {
              setHoveredDeckId(null);
            }
          }}
          className={`absolute group ${draggingClass}`}
          style={{
            left: 0,
            top: 0,
            width: deck.width,
            height: deck.height,
            transform: `rotate(${deck.rotation}deg)`
          }}
        >
        {[2, 1, 0].map(i => (
          <div
            key={i}
            className="absolute rounded bg-slate-800 border-2 border-slate-600 shadow-md pointer-events-none"
            style={{
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              transform: `translate(${i * DECK_OFFSET}px, ${i * DECK_OFFSET}px)`,
              zIndex: -i
            }}
          />
        ))}

        {deck.showTopCard && topCard ? (
          // Show top card face
          <div className="w-full h-full relative overflow-hidden rounded">
            <div
              className="w-full h-full"
              style={{
                backgroundColor: 'white',
                backgroundImage: topCard.content ? `url(${topCard.content})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />
          </div>
        ) : (
          // Normal deck appearance
          <div className="absolute inset-0 bg-slate-900 rounded border-2 border-slate-500 flex flex-col items-center justify-center cursor-pointer transition-colors">
            <Layers className="text-slate-400 mb-2" />
            <span className="text-xs text-slate-300 font-bold px-2 text-center select-none">{deck.name}</span>
            <span className="text-xs text-slate-500 select-none">{visibleCardCount} / {(deck.baseCardIds || deck.cardIds).length}</span>
          </div>
        )}

        {/* Action buttons on bottom edge - like cards */}
        {/* Hide buttons when cursor slot has cards */}
        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-2 flex items-center gap-1 transition-opacity z-30 pointer-events-none ${cursorSlotHasCards ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
          {(() => {
            // Define all possible buttons based on actionButtons setting
            const actionButtons = deck.actionButtons || [];

            const buttonConfigs: Record<string, { key: string; action: (e?: React.MouseEvent | undefined) => void; className: string; title: string; icon: React.ReactNode }> = {
              draw: {
                key: 'draw',
                action: () => executeClickAction(deck, 'draw'),
                className: 'bg-blue-600 hover:bg-blue-500',
                title: 'Draw',
                icon: <Hand size={14} />
              },
              playTopCard: {
                key: 'playTopCard',
                action: (e?: React.MouseEvent) => executeClickAction(deck, 'playTopCard', e),
                className: 'bg-green-600 hover:bg-green-500',
                title: 'Play Top',
                icon: <Eye size={14} />
              },
              shuffleDeck: {
                key: 'shuffleDeck',
                action: () => executeClickAction(deck, 'shuffleDeck'),
                className: 'bg-purple-600 hover:bg-purple-500',
                title: 'Shuffle',
                icon: <Shuffle size={14} />
              },
              searchDeck: {
                key: 'searchDeck',
                action: () => {
                  setSearchModalDeck(deck);
                  setSearchModalPile(undefined);
                },
                className: 'bg-cyan-600 hover:bg-cyan-500',
                title: 'Search',
                icon: <Search size={14} />
              },
              topDeck: {
                key: 'topDeck',
                action: () => {
                  setTopDeckModalDeck(deck);
                },
                className: 'bg-orange-600 hover:bg-orange-500',
                title: 'Top Deck',
                icon: <Search size={14} />
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
                action: () => executeClickAction(deck, 'returnAll'),
                className: 'bg-red-600 hover:bg-red-500',
                title: 'Return All',
                icon: <Undo size={14} />
              },
              clone: {
                key: 'clone',
                action: () => executeClickAction(deck, 'clone'),
                className: 'bg-cyan-600 hover:bg-cyan-500',
                title: 'Clone',
                icon: <Copy size={14} />
              },
              delete: {
                key: 'delete',
                action: () => setDeleteCandidateId(deck.id),
                className: 'bg-red-600 hover:bg-red-500',
                title: 'Delete',
                icon: <Trash2 size={14} />
              },
              lock: {
                key: 'lock',
                action: () => executeClickAction(deck, 'lock'),
                className: 'bg-yellow-600 hover:bg-yellow-500',
                title: deck.locked ? 'Unlock' : 'Lock',
                icon: <Lock size={14} />
              },
              layer: {
                key: 'layer',
                action: () => executeClickAction(deck, 'layerUp'),
                className: 'bg-indigo-600 hover:bg-indigo-500',
                title: 'Layer Up',
                icon: <Layers size={14} />
              },
              rotateClockwise: {
                key: 'rotateClockwise',
                action: () => executeClickAction(deck, 'rotateClockwise'),
                className: 'bg-yellow-600 hover:bg-yellow-500',
                title: 'Rotate Clockwise',
                icon: <RefreshCw size={14} />
              },
              rotateCounterClockwise: {
                key: 'rotateCounterClockwise',
                action: () => executeClickAction(deck, 'rotateCounterClockwise'),
                className: 'bg-yellow-600 hover:bg-yellow-500',
                title: 'Rotate Counter-Clockwise',
                icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
              },
              swingClockwise: {
                key: 'swingClockwise',
                action: () => executeClickAction(deck, 'swingClockwise'),
                className: 'bg-orange-600 hover:bg-orange-500',
                title: 'Swing Clockwise',
                icon: <RefreshCw size={14} />
              },
              swingCounterClockwise: {
                key: 'swingCounterClockwise',
                action: () => executeClickAction(deck, 'swingCounterClockwise'),
                className: 'bg-orange-600 hover:bg-orange-500',
                title: 'Swing Counter-Clockwise',
                icon: <RefreshCw size={14} style={{ transform: 'scaleX(-1)' }} />
              },
            };

            const buttons = actionButtons
              .map(action => buttonConfigs[action])
              .filter(Boolean)
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
      </React.Fragment>
      </div>
    </Tooltip>
  );
};
