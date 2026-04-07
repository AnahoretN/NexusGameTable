import { t as translate, Locale } from '../utils/translations';
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../store/GameContext';
import { Deck, Card, CardPile, ContextAction, TableObject, SearchWindowVisibility, CardOrientation, ItemType, Deck as DeckType, AppLanguage } from '../types';
import { X, Search, Eye, EyeOff, Hand, RefreshCw, Copy, GripVertical, RotateCw, Move3D, ArrowUp, ArrowDown } from 'lucide-react';
import { Card as CardComponent } from './Card';
import { ContextMenu } from './ContextMenu';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { DEFAULT_HAND_CARD_WIDTH, DEFAULT_DECK_WIDTH, DEFAULT_DECK_HEIGHT, DEFAULT_MODAL_WIDTH_VU, DEFAULT_MODAL_MIN_WIDTH_VU, DEFAULT_MODAL_MAX_WIDTH_VU, DEFAULT_MODAL_HEIGHT_VU } from '../constants';

const DEFAULT_MODAL_WIDTH = DEFAULT_MODAL_WIDTH_VU; // vu
const MIN_MODAL_WIDTH = DEFAULT_MODAL_MIN_WIDTH_VU; // vu
const MAX_MODAL_WIDTH = DEFAULT_MODAL_MAX_WIDTH_VU; // vu
const DEFAULT_MODAL_HEIGHT = DEFAULT_MODAL_HEIGHT_VU; // vu

// Lazy card component - renders sequentially one by one for smooth visual fill effect
// Cards are rendered in order with a small delay between each (16ms per card index)
const LazyCard = React.memo(({
  card,
  cardWidth,
  cardHeight,
  displayFaceUp,
  cardActionButtons,
  buttons,
  commonDeckProps,
  onContextMenu,
  onActionButtonClick,
  isGM,
  index
}: {
  card: Card;
  cardWidth: number;
  cardHeight: number;
  displayFaceUp: boolean;
  cardActionButtons: ContextAction[];
  buttons: ReturnType<typeof getCardButtonConfigs>;
  commonDeckProps: any;
  onContextMenu: (e: React.MouseEvent, card: Card) => void;
  onActionButtonClick: (card: Card, action: ContextAction) => void;
  isGM: boolean;
  index: number; // Position in the list for sequential rendering
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Calculate delay based on index: 16ms per card (60 cards ≈ 1 second total)
    // First card (index 0) renders immediately, last card renders after ~1s
    const delay = index * 16;

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [index]);

  const displayCard = useMemo(() => ({ ...card, faceUp: displayFaceUp }), [card, displayFaceUp]);

  return (
    <div
      data-card-id={card.id}
      onContextMenu={(e) => onContextMenu(e, displayCard)}
      className="relative flex-shrink-0 group transition-all"
      style={{
        width: cardWidth,
        height: cardHeight,
        opacity: card.hidden && isGM ? 0.5 : 1,
        // Reserve space even when not visible
        minHeight: isVisible ? undefined : cardHeight,
      }}
    >
      {isVisible ? (
        <>
          <CardComponent
            card={displayCard}
            overrideWidth={cardWidth}
            overrideHeight={cardHeight}
            {...commonDeckProps}
            onContextMenu={(e: React.MouseEvent) => onContextMenu(e, card)}
          />

          {buttons.length > 0 && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
              {buttons.map(btn => (
                <button
                  key={btn.action}
                  onClick={(e) => { e.stopPropagation(); onActionButtonClick(card, btn.action as ContextAction); }}
                  className={`p-1.5 rounded-lg text-white shadow ${btn.className} pointer-events-auto`}
                  title={btn.title}
                >
                  {btn.icon}
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
});

LazyCard.displayName = 'LazyCard';

interface SearchDeckModalProps {
  deck: Deck;
  pile?: CardPile;
  onClose: () => void;
  language?: AppLanguage;
}

const getCardButtonConfigs = (card: Card, actionButtons: ContextAction[] = [], language: AppLanguage = 'en') => {
  // Exclude rotate and swing actions from deck window
  const filteredActions = actionButtons.filter(action =>
    !['rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'].includes(action)
  );


  const configs: Partial<Record<ContextAction, { className: string; title: string; icon: JSX.Element }>> = {
    flip: {
      className: 'bg-purple-600 hover:bg-purple-500',
      title: translate('Flip', language as Locale),
      icon: card.faceUp ? <EyeOff size={14} /> : <Eye size={14} />
    },
    rotate: {
      className: 'bg-green-600 hover:bg-green-500',
      title: translate('Rotate', language as Locale),
      icon: <RefreshCw size={14} />
    },
    rotateClockwise: {
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: translate('Rotate Clockwise', language as Locale),
      icon: <RotateCw size={14} />
    },
    rotateCounterClockwise: {
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: translate('Rotate Counter-Clockwise', language as Locale),
      icon: <RotateCw size={14} style={{ transform: 'scaleX(-1)' }} />
    },
    swingClockwise: {
      className: 'bg-green-600 hover:bg-green-500',
      title: translate('Swing Clockwise', language as Locale),
      icon: <Move3D size={14} />
    },
    swingCounterClockwise: {
      className: 'bg-green-600 hover:bg-green-500',
      title: translate('Swing Counter-Clockwise', language as Locale),
      icon: <Move3D size={14} style={{ transform: 'scaleX(-1)' }} />
    },
    layerUp: {
      className: 'bg-blue-600 hover:bg-blue-500',
      title: translate('Layer Up', language as Locale),
      icon: <ArrowUp size={14} />
    },
    layerDown: {
      className: 'bg-blue-600 hover:bg-blue-500',
      title: translate('Layer Down', language as Locale),
      icon: <ArrowDown size={14} />
    },
    clone: {
      className: 'bg-cyan-600 hover:bg-cyan-500',
      title: translate('Clone', language as Locale),
      icon: <Copy size={14} />
    },
    moveToHand: {
      className: 'bg-blue-600 hover:bg-blue-500',
      title: translate('Move to Hand', language as Locale),
      icon: <Hand size={14} />
    },
    moveToTopDeck: {
      className: 'bg-orange-600 hover:bg-orange-500',
      title: translate('Move to Top Deck', language as Locale),
      icon: <ArrowUp size={14} />
    },
    moveToBottomDeck: {
      className: 'bg-yellow-600 hover:bg-yellow-500',
      title: translate('Move to Bottom Deck', language as Locale),
      icon: <ArrowDown size={14} />
    },
  };

  return filteredActions
    .filter(action => action in configs)
    .map(action => ({ action, ...configs[action]! }))
    .slice(0, 4);
};

export const SearchDeckModal: React.FC<SearchDeckModalProps> = ({ deck, pile, onClose, language = 'en' }) => {
  const { state, dispatch } = useGame();
  const gmInitializedRef = useRef(false);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Get pixelsPerVU for converting vu to pixels
  const pixelsPerVU = state.viewTransform?.pixelsPerVU ?? 1.08;
  const vuToPx = useCallback((vu: number) => vu * pixelsPerVU, [pixelsPerVU]);

  const [cardOrder, setCardOrder] = useState<string[]>(
    pile ? pile.cardIds : deck.cardIds
  );

  // Modal width state (stored in vu)
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

  // Sync cardOrder with deck.cardIds when viewing main deck
  // Use a ref to track previous cardIds and only sync on actual changes
  const prevCardIdsRef = useRef<string[] | null>(null);

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

  // Sync cardOrder with deck.cardIds when viewing main deck
  // This ensures cards reorder visually after move operations
  useEffect(() => {
    if (!isPile) {
      const currentDeck = state.objects[deck.id] as Deck;
      if (currentDeck && currentDeck.cardIds) {
        const prevIds = prevCardIdsRef.current;
        // Only sync if deck.cardIds has changed (reorder operation)
        if (prevIds && JSON.stringify(currentDeck.cardIds) !== JSON.stringify(prevIds)) {
          setCardOrder([...currentDeck.cardIds]);
        }
        prevCardIdsRef.current = [...currentDeck.cardIds];
      }
    }
  }, [state.objects, deck.id, isPile]);

  // Initialize prevCardIdsRef when deck changes
  useEffect(() => {
    if (!isPile) {
      const currentDeck = state.objects[deck.id] as Deck;
      if (currentDeck && currentDeck.cardIds) {
        prevCardIdsRef.current = [...currentDeck.cardIds];
      }
    }
  }, [deck.id, isPile, state.objects]);

  const getCardDimensions = useCallback((card: Card) => {
    const actualCardWidth = card.width ?? DEFAULT_DECK_WIDTH;
    const actualCardHeight = card.height ?? DEFAULT_DECK_HEIGHT;

    // Use the card's actual dimensions to determine display size
    // Scale the card proportionally while maintaining its aspect ratio
    const aspectRatio = actualCardWidth / actualCardHeight;

    // Calculate scale factor based on the card's size relative to a standard card
    // This ensures larger cards appear larger and smaller cards appear smaller
    const standardCardWidth = DEFAULT_DECK_WIDTH;
    const scaleFromStandard = scaledBaseCardWidth / standardCardWidth;

    const cardWidth = actualCardWidth * scaleFromStandard;
    const cardHeight = cardWidth / aspectRatio;

    return { width: cardWidth, height: cardHeight };
  }, [scaledBaseCardWidth]);

  // Memoize common deck props to avoid creating new objects on every render
  // This is critical for performance when rendering 60+ cards
  const commonDeckProps = useMemo(() => ({
    cardNamePosition: deck.cardNamePosition,
    cardOrientation: deck.cardOrientation,
    disableRotationTransform: true,
    deckSpriteConfig: deck.spriteConfig,
    // Note: deck.showTooltipImage controls image display in tooltips
    // Individual cards may have their own tooltipText that should be displayed
    deckShowTooltipImage: deck.showTooltipImage,
    deckTooltipScale: deck.tooltipScale,
    language
  }), [
    deck.cardNamePosition,
    deck.cardOrientation,
    deck.spriteConfig,
    deck.showTooltipImage,
    deck.tooltipScale,
    language
  ]);

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

  const handleActionButtonClick = useCallback((card: Card, action: ContextAction) => {
    switch (action) {
      case 'flip':
        handleFlip(card.id);
        break;
      case 'moveToHand':
        handleToHand(card.id);
        break;
      case 'moveToTopDeck':
        if (card.deckId) {
          dispatch({ type: 'RETURN_CARD_TO_DECK_TOP', payload: { cardId: card.id, deckId: card.deckId } });
          // Sync cardOrder with updated deck.cardIds after state updates
          if (isPile && pile) {
            // Viewing a pile: remove card from pile's cardOrder
            setCardOrder(cardOrder.filter(id => id !== card.id));
          }
          // If viewing main deck, cardOrder will sync via useEffect
        }
        break;
      case 'moveToBottomDeck':
        if (card.deckId) {
          dispatch({ type: 'RETURN_CARD_TO_DECK_BOTTOM', payload: { cardId: card.id, deckId: card.deckId } });
          // Sync cardOrder with updated deck.cardIds after state updates
          if (isPile && pile) {
            // Viewing a pile: remove card from pile's cardOrder
            setCardOrder(cardOrder.filter(id => id !== card.id));
          }
          // If viewing main deck, cardOrder will sync via useEffect
        }
        break;
      case 'moveToDiscard':
        if (card.deckId) {
          const cardDeck = state.objects[card.deckId] as DeckType | undefined;
          if (cardDeck?.piles) {
            const millPile = cardDeck.piles.find(p => p.isMillPile);
            if (millPile) {
              dispatch({
                type: 'ADD_CARD_TO_PILE',
                payload: { deckId: cardDeck.id, pileId: millPile.id, cardId: card.id }
              });
              // Sync cardOrder with updated deck.cardIds after state updates
              if (isPile && pile) {
                // Viewing a pile: remove card from pile's cardOrder
                setCardOrder(cardOrder.filter(id => id !== card.id));
              }
            }
          }
        }
        break;
      case 'clone':
        dispatch({ type: 'CLONE_OBJECT', payload: { id: card.id }});
        break;
    }
  }, [handleFlip, handleToHand, dispatch, cardOrder, isPile, pile, state.objects]);

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
      case 'moveToHand':
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
        const moveToHandCardOrder = cardOrder.filter(id => id !== object.id);
        if (isPile && pile) {
          const updatedPiles = deck.piles?.map(p =>
            p.id === pile.id ? { ...p, cardIds: moveToHandCardOrder } : p
          );
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: updatedPiles } });
        } else {
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: moveToHandCardOrder } });
        }
        setCardOrder(moveToHandCardOrder);
        break;
      case 'moveToTopDeck': {
        const card = object as Card;
        if (card.deckId) {
          dispatch({ type: 'RETURN_CARD_TO_DECK_TOP', payload: { cardId: card.id, deckId: card.deckId } });
          // Sync cardOrder with updated deck.cardIds after state updates
          if (isPile && pile) {
            // Viewing a pile: remove card from pile's cardOrder
            setCardOrder(cardOrder.filter(id => id !== card.id));
          }
          // If viewing main deck, cardOrder will sync via useEffect
        }
        break;
      }
      case 'moveToBottomDeck': {
        const card = object as Card;
        if (card.deckId) {
          dispatch({ type: 'RETURN_CARD_TO_DECK_BOTTOM', payload: { cardId: card.id, deckId: card.deckId } });
          // Sync cardOrder with updated deck.cardIds after state updates
          if (isPile && pile) {
            // Viewing a pile: remove card from pile's cardOrder
            setCardOrder(cardOrder.filter(id => id !== card.id));
          }
          // If viewing main deck, cardOrder will sync via useEffect
        }
        break;
      }
      case 'moveToDiscard': {
        const card = object as Card;
        if (card.deckId) {
          const cardDeck = state.objects[card.deckId] as DeckType | undefined;
          if (cardDeck?.piles) {
            const millPile = cardDeck.piles.find(p => p.isMillPile);
            if (millPile) {
              dispatch({
                type: 'ADD_CARD_TO_PILE',
                payload: { deckId: cardDeck.id, pileId: millPile.id, cardId: card.id }
              });
              // Sync cardOrder with updated deck.cardIds after state updates
              if (isPile && pile) {
                // Viewing a pile: remove card from pile's cardOrder
                setCardOrder(cardOrder.filter(id => id !== card.id));
              }
            }
          }
        }
        break;
      }
      case 'clone': {
        // Clone card and add it to the same deck
        const card = object as Card;
        if (card.deckId) {
          // Create a cloned card with a new ID
          const newCard = {
            ...card,
            id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            name: `${card.name} (Copy)`,
          };

          // Add the cloned card to the objects
          dispatch({ type: 'ADD_OBJECT', payload: newCard });

          // Get current deck state
          const currentDeck = state.objects[deck.id] as Deck;
          const currentCardIds = currentDeck?.cardIds || deck.cardIds;
          const currentBaseCardIds = currentDeck?.baseCardIds || deck.baseCardIds;

          // Add the new card to deck's cardIds and baseCardIds
          const updatedCardIds = [...currentCardIds, newCard.id];
          const updatedBaseCardIds = [...currentBaseCardIds, newCard.id];

          if (isPile && pile) {
            const updatedPiles = (currentDeck?.piles || deck.piles)?.map(p =>
              p.id === pile.id ? { ...p, cardIds: [...pile.cardIds, newCard.id] } : p
            );
            dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: updatedPiles, cardIds: updatedCardIds, baseCardIds: updatedBaseCardIds } });
            setCardOrder([...cardOrder, newCard.id]);
          } else {
            dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: updatedCardIds, baseCardIds: updatedBaseCardIds } });
            setCardOrder(updatedCardIds);
          }
        } else {
          // If card has no deck, just clone it normally
          dispatch({ type: 'CLONE_OBJECT', payload: { id: object.id }});
        }
        break;
      }
      case 'toggleHide':
        const isHidden = (object as Card).hidden === true;
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: object.id, hidden: !isHidden }
        });
        break;
      case 'delete':
        const filteredOrder = cardOrder.filter(id => id !== object.id);
        // GM deletion removes card from baseCardIds (permanent removal from deck's card pool)
        // Get the current baseCardIds from state to ensure we're working with latest data
        const currentDeck = state.objects[deck.id] as Deck;
        const currentBaseCardIds = currentDeck?.baseCardIds || deck.baseCardIds || [];
        const filteredBaseCardIds = currentBaseCardIds.filter(id => id !== object.id);

        if (isPile && pile) {
          const updatedPiles = (currentDeck?.piles || deck.piles)?.map(p =>
            p.id === pile.id ? { ...p, cardIds: filteredOrder } : p
          );
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: updatedPiles, baseCardIds: filteredBaseCardIds } });
        } else {
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: filteredOrder, baseCardIds: filteredBaseCardIds } });
        }
        setCardOrder(filteredOrder);
        break;
      case 'destroy':
        // Destroy permanently removes card from the deck, including from baseCardIds
        // This means the card won't come back even with "Return All" action
        const destroyFilteredOrder = cardOrder.filter(id => id !== object.id);
        // Get the current baseCardIds from state to ensure we're working with latest data
        const destroyCurrentDeck = state.objects[deck.id] as Deck;
        const destroyCurrentBaseCardIds = destroyCurrentDeck?.baseCardIds || deck.baseCardIds || [];
        const destroyFilteredBaseCardIds = destroyCurrentBaseCardIds.filter(id => id !== object.id);

        // Also remove the card object from state.objects to completely forget about it
        dispatch({ type: 'DELETE_OBJECT', payload: { id: object.id } });

        if (isPile && pile) {
          const destroyUpdatedPiles = (destroyCurrentDeck?.piles || deck.piles)?.map(p =>
            p.id === pile.id ? { ...p, cardIds: destroyFilteredOrder } : p
          );
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, piles: destroyUpdatedPiles, baseCardIds: destroyFilteredBaseCardIds } });
        } else {
          dispatch({ type: 'UPDATE_OBJECT', payload: { id: deck.id, cardIds: destroyFilteredOrder, baseCardIds: destroyFilteredBaseCardIds } });
        }
        setCardOrder(destroyFilteredOrder);
        break;
      case 'setCardBack':
        // Set the current card's image as the deck's card back
        const card = object as Card;
        if (card.deckId) {
          const parentDeck = state.objects[card.deckId] as Deck;
          if (parentDeck && parentDeck.spriteConfig) {
            // If the card is from a sprite sheet, save the sprite info for the card back
            const updatedSpriteConfig = {
              ...parentDeck.spriteConfig,
              cardBackSpriteUrl: card.spriteUrl || card.content,
              cardBackSpriteIndex: card.spriteIndex ?? 0,
              cardBackSpriteColumns: card.spriteColumns ?? 1,
              cardBackSpriteRows: card.spriteRows ?? 1,
            };
            dispatch({
              type: 'UPDATE_OBJECT',
              payload: { id: parentDeck.id, spriteConfig: updatedSpriteConfig }
            });
          }
        }
        break;
    }
    setContextMenu(null);
  }, [contextMenu, isGM, gmFlipStates, visibility, dispatch, deck.id, state.activePlayerId, cardOrder, isPile, pile, state.objects, deck]);

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
      const deltaVU = deltaX / pixelsPerVU;
      const newWidth = resizeStartRef.current.startWidth + deltaVU;

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
    return undefined;
  }, [isResizing, pixelsPerVU]);

  return createPortal(
    <div className="fixed inset-0 z-[100002] flex items-center justify-center bg-black/40">
      <div
        ref={modalContainerRef}
        data-modal="search-deck"
        className="bg-slate-900 border border-slate-700 flex flex-col relative overflow-hidden"
        style={{ width: `${vuToPx(modalWidth)}px`, height: `${vuToPx(DEFAULT_MODAL_HEIGHT)}px` }}
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
              <p className="text-sm">{translate('No cards', language as Locale)}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-[2px] w-full">
              {cards.map((card, index) => {
                const buttons = getCardButtonConfigs(card, cardActionButtons, language);
                const { width: cardWidth, height: cardHeight } = getCardDimensions(card);
                const displayFaceUp = getCardFaceUp(card);

                return (
                  <LazyCard
                    key={card.id}
                    card={card}
                    cardWidth={cardWidth}
                    cardHeight={cardHeight}
                    displayFaceUp={displayFaceUp}
                    cardActionButtons={cardActionButtons}
                    buttons={buttons}
                    commonDeckProps={commonDeckProps}
                    onContextMenu={handleContextMenu}
                    onActionButtonClick={handleActionButtonClick}
                    isGM={isGM}
                    index={index}
                  />
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
              title={translate('Shuffle All', language as Locale)}
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
              title={translate('Flip All', language as Locale)}
            >
              <Eye size={14} />
            </button>
          </div>
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
          language={language}
        />
      )}

      {/* Object Settings Modal */}
      {settingsModalObj && (
        <ObjectSettingsModal
          object={settingsModalObj}
          language={language}
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
