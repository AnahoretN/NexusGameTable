import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store/GameContext';
import { Deck, Card, CardPile, ContextAction, TableObject, SearchWindowVisibility, CardOrientation, ItemType } from '../types';
import { X, Search, Eye, EyeOff, Hand, RefreshCw, Copy, GripVertical } from 'lucide-react';
import { Card as CardComponent } from './Card';
import { ContextMenu } from './ContextMenu';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DEFAULT_HAND_CARD_WIDTH, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT } from '../constants';

const DEFAULT_MODAL_WIDTH = 75.75; // vw
const MIN_MODAL_WIDTH = 50; // vw
const MAX_MODAL_WIDTH = 95; // vw

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
  const gmInitializedRef = useRef(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  const [cardOrder, setCardOrder] = useState<string[]>(
    pile ? pile.cardIds : deck.cardIds
  );

  // Modal width state
  const [modalWidth, setModalWidth] = useState(DEFAULT_MODAL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ mouseX: number; startWidth: number } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; object: TableObject } | null>(null);

  // Settings modal state
  const [settingsModalObj, setSettingsModalObj] = useState<TableObject | null>(null);

  // Track modified faceUp states for this player (for LAST_STATE mode)
  const [playerFlipStates, setPlayerFlipStates] = useState<Record<string, boolean>>({});

  const currentPlayerId = state.activePlayerId;
  const currentPlayer = state.players.find(p => p.id === currentPlayerId);
  const isGM = currentPlayer?.isGM ?? false;
  const visibility = deck.searchWindowVisibility ?? SearchWindowVisibility.FACE_UP;

  // Track GM flip states locally for immediate updates (synced with deck.gmSearchFaceUp)
  const [gmFlipStates, setGmFlipStates] = useState<Record<string, boolean>>({});

  // Reset initialization flag when deck changes
  useEffect(() => {
    gmInitializedRef.current = false;
  }, [deck.id]);

  // Initialize GM state on first open - set all cards to face up if not set
  useEffect(() => {
    if (isGM && !gmInitializedRef.current) {
      if (!deck.gmSearchFaceUp) {
        const initialStates: Record<string, boolean> = {};
        cardOrder.forEach(cardId => {
          const card = state.objects[cardId] as Card;
          if (card) {
            initialStates[cardId] = true;
          }
        });
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: deck.id, gmSearchFaceUp: initialStates }
        });
        setGmFlipStates(initialStates);
      } else {
        setGmFlipStates(deck.gmSearchFaceUp);
      }
      gmInitializedRef.current = true;
    }
  }, [isGM]);

  // Determine if a card should be shown face up based on visibility mode
  const getCardFaceUp = useCallback((card: Card): boolean => {
    if (isGM) {
      return gmFlipStates[card.id] ?? true;
    }

    switch (visibility) {
      case SearchWindowVisibility.FACE_UP:
        return true;
      case SearchWindowVisibility.FACE_DOWN:
        return false;
      case SearchWindowVisibility.AS_GM:
        return card.faceUp;
      case SearchWindowVisibility.LAST_STATE:
        if (playerFlipStates[card.id] !== undefined) {
          return playerFlipStates[card.id];
        }
        const deckPref = deck.perPlayerSearchFaceUp?.[currentPlayerId];
        if (deckPref !== undefined) {
          return deckPref;
        }
        return true;
      case SearchWindowVisibility.SHARED_DECK:
        return card.faceUp;
      default:
        return card.faceUp;
    }
  }, [isGM, gmFlipStates, visibility, playerFlipStates, deck.perPlayerSearchFaceUp, currentPlayerId]);

  const isPile = !!pile;
  const title = isPile ? `${pile.name} - ${deck.name}` : deck.name;

  const cards = useMemo(() =>
    cardOrder.map(id => state.objects[id] as Card).filter(Boolean).filter(card => isGM || !card.hidden),
    [cardOrder, state.objects, isGM]
  );

  const cardActionButtons = deck.cardActionButtons || [];
  const baseCardWidth = DEFAULT_HAND_CARD_WIDTH;
  const isHorizontal = deck.cardOrientation === CardOrientation.HORIZONTAL;
  const scaledBaseCardWidth = isHorizontal ? baseCardWidth * 1.254 : baseCardWidth;

  const getCardDimensions = useCallback((card: Card) => {
    const actualCardWidth = card.width ?? DEFAULT_DECK_WIDTH;
    const actualCardHeight = card.height ?? DEFAULT_DECK_HEIGHT;
    const isHorizontal = deck.cardOrientation === CardOrientation.HORIZONTAL;
    const layoutWidth = isHorizontal ? actualCardHeight : actualCardWidth;
    const layoutHeight = isHorizontal ? actualCardWidth : actualCardHeight;
    const aspectRatio = layoutWidth / layoutHeight;
    const cardHeight = scaledBaseCardWidth / aspectRatio;
    return { width: scaledBaseCardWidth, height: cardHeight };
  }, [deck.cardOrientation, scaledBaseCardWidth]);

  const handleFlip = useCallback((cardId: string) => {
    if (isGM) {
      const currentState = gmFlipStates[cardId] ?? true;
      const newState = !currentState;
      const updated = { ...gmFlipStates, [cardId]: newState };
      setGmFlipStates(updated);
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: deck.id, gmSearchFaceUp: updated }
      });
    } else if (visibility === SearchWindowVisibility.LAST_STATE) {
      setPlayerFlipStates(prev => {
        const currentState = prev[cardId] ?? true;
        return { ...prev, [cardId]: !currentState };
      });
    }
    dispatch({ type: 'FLIP_CARD', payload: { cardId } });
  }, [dispatch, visibility, isGM, gmFlipStates, deck.id]);

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

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, card: Card) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      object: card
    });
  }, []);

  const executeMenuAction = useCallback((action: string) => {
    if (!contextMenu) return;
    const { object } = contextMenu;

    switch(action) {
      case 'configure':
        setSettingsModalObj(object);
        setContextMenu(null);
        return;
      case 'flip':
        if (isGM) {
          const currentState = gmFlipStates[object.id] ?? true;
          const newState = !currentState;
          const updated = { ...gmFlipStates, [object.id]: newState };
          setGmFlipStates(updated);
          dispatch({
            type: 'UPDATE_OBJECT',
            payload: { id: deck.id, gmSearchFaceUp: updated }
          });
        } else if (visibility === SearchWindowVisibility.LAST_STATE) {
          setPlayerFlipStates(prev => {
            const currentState = prev[object.id] ?? true;
            return { ...prev, [object.id]: !currentState };
          });
        }
        dispatch({ type: 'FLIP_CARD', payload: { cardId: object.id }});
        break;
      case 'rotate':
        dispatch({ type: 'ROTATE_OBJECT', payload: { id: object.id, angle: 90 }});
        break;
      case 'toHand':
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: object.id,
            location: 'HAND' as any,
            ownerId: state.activePlayerId,
            isOnTable: false,
            faceUp: true
          } as any
        });
        const newCardOrder = cardOrder.filter(id => id !== object.id);
        if (isPile && pile) {
          const updatedPiles = deck.piles?.map(p =>
            p.id === pile.id ? { ...p, cardIds: newCardOrder } : p
          );
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: updatedPiles } });
        } else {
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: newCardOrder } });
        }
        setCardOrder(newCardOrder);
        break;
      case 'clone':
        dispatch({ type: 'CLONE_OBJECT', payload: { id: object.id }});
        break;
      case 'toggleHide':
        const isHidden = (object as any).hidden === true;
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: object.id, hidden: !isHidden }
        });
        break;
      case 'delete':
        const filteredOrder = cardOrder.filter(id => id !== object.id);
        // Calculate new initialCardCount (excluding hidden cards)
        const allCards = Object.values(state.objects).filter(o =>
          o.type === ItemType.CARD &&
          (o as any).deckId === deck.id &&
          !(o as any).hidden
        );
        const newInitialCount = Math.max(0, allCards.length - 1);

        if (isPile && pile) {
          const updatedPiles = deck.piles?.map(p =>
            p.id === pile.id ? { ...p, cardIds: filteredOrder } : p
          );
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: updatedPiles } });
        } else {
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: filteredOrder, initialCardCount: newInitialCount } });
        }
        setCardOrder(filteredOrder);
        break;
    }
    setContextMenu(null);
  }, [contextMenu, isGM, gmFlipStates, visibility, dispatch, deck.id, state.activePlayerId, cardOrder, isPile, pile, state.objects]);

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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        ref={modalContainerRef}
        className="bg-slate-900 border border-slate-700 h-[85vh] flex flex-col relative overflow-hidden"
        style={{ width: `${modalWidth}vw` }}
      >
        {/* Header - minimal style */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-slate-400" />
            <span className="text-sm font-semibold text-white">{title}</span>
            <span className="text-xs text-slate-500">({cards.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModalWidth(DEFAULT_MODAL_WIDTH)}
              className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-500 hover:text-white"
              title="Reset Size"
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

        {/* Left resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className={`absolute left-0 top-0 bottom-0 cursor-col-resize bg-slate-700 hover:bg-purple-500 transition-colors z-10 flex items-center justify-center select-none
            ${isResizing ? 'w-2' : 'w-1'}`}
          style={{ minWidth: isResizing ? '8px' : '4px' }}
        >
          <GripVertical size={14} className="text-slate-500 opacity-50 hover:opacity-100" />
        </div>

        {/* Cards Grid */}
        <div className="flex-1 overflow-y-scroll p-2 custom-scrollbar">
          <style>{`.custom-scrollbar::-webkit-scrollbar { width: 12px; } .custom-scrollbar::-webkit-scrollbar-track { background: #1e293b; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 6px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }`}</style>
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600">
              <Search size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No cards</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-[2px] w-full">
              {cards.map((card) => {
                const buttons = getCardButtonConfigs(card, cardActionButtons);
                const { width: cardWidth, height: cardHeight } = getCardDimensions(card);
                const displayFaceUp = getCardFaceUp(card);
                const displayCard = { ...card, faceUp: displayFaceUp };

                return (
                  <div
                    key={card.id}
                    onContextMenu={(e) => handleContextMenu(e, displayCard)}
                    className="relative flex-shrink-0 group transition-all"
                    style={{
                      width: cardWidth,
                      height: cardHeight,
                      opacity: card.hidden && isGM ? 0.5 : 1
                    }}
                  >
                    <CardComponent
                      card={displayCard}
                      overrideWidth={cardWidth}
                      overrideHeight={cardHeight}
                      cardNamePosition={deck.cardNamePosition}
                      cardOrientation={deck.cardOrientation}
                      disableRotationTransform={true}
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
              })}
            </div>
          )}
        </div>

        {/* Footer - minimal */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newOrder = [...cardOrder].sort(() => Math.random() - 0.5);
                if (isPile && pile) {
                  const updatedPiles = deck.piles?.map(p =>
                    p.id === pile.id ? { ...p, cardIds: newOrder } : p
                  );
                  dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: updatedPiles } });
                } else {
                  dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: newOrder } });
                }
                setCardOrder(newOrder);
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
              title="Shuffle All"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => {
                if (isGM) {
                  // For GM: invert all gmFlipStates
                  const updated: Record<string, boolean> = {};
                  cards.forEach(card => {
                    updated[card.id] = !(gmFlipStates[card.id] ?? true);
                    dispatch({ type: 'FLIP_CARD', payload: { cardId: card.id }});
                  });
                  setGmFlipStates(updated);
                  dispatch({
                    type: 'UPDATE_OBJECT',
                    payload: { id: deck.id, gmSearchFaceUp: updated }
                  });
                } else {
                  // For players: just flip all cards
                  cards.forEach(card => {
                    dispatch({ type: 'FLIP_CARD', payload: { cardId: card.id }});
                  });
                }
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
              title="Flip All"
            >
              <Eye size={14} />
            </button>
          </div>
          <span className="text-xs text-slate-600">Search</span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          object={contextMenu.object}
          isGM={!!state.players.find(p => p.id === state.activePlayerId)?.isGM}
          onAction={executeMenuAction}
          onClose={() => setContextMenu(null)}
          allObjects={state.objects}
          hideCardActions={true}
          isSearchWindow={true}
        />
      )}

      {/* Object Settings Modal */}
      {settingsModalObj && (
        <ObjectSettingsModal
          object={settingsModalObj}
          onSave={(updatedObj) => {
            dispatch({ type: 'UPDATE_OBJECT', payload: updatedObj });
            setSettingsModalObj(null);
          }}
          onClose={() => setSettingsModalObj(null)}
        />
      )}
    </div>,
    document.body
  );
};

// Empty component for compatibility - no longer provides drag preview
export const SearchDeckDragPreview: React.FC = () => {
  return null;
};
