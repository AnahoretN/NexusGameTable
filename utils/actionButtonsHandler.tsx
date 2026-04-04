import { TableObject, ItemType, Deck as DeckType, CardLocation } from '../types';

/**
 * Universal action buttons handler that works for both pool panels and main tabletop
 * This provides a consistent way to handle action button clicks across different contexts
 */
export interface ActionButtonsHandlerContext {
  dispatch: (action: any) => void;
  setDeleteCandidateId?: (id: string | null) => void;
  setSearchModalDeck?: (deck: DeckType) => void;
  setTopDeckModalDeck?: (deck: DeckType) => void;
  animateDiceRoll?: (dice: any) => void;
  activePlayerId?: string;
  objects?: Record<string, any>;
}

/**
 * Execute an action button click universally
 * This function works for both pool panels and main tabletop
 * Matches the exact behavior from Tabletop.tsx onActionButtonClick
 */
export function executeActionButtonUniversal(
  obj: TableObject,
  action: string,
  context: ActionButtonsHandlerContext
) {
  console.log('[executeActionButtonUniversal] Action:', action, 'for object:', obj.id, 'type:', obj.type, 'activePlayerId:', context.activePlayerId);

  const { dispatch, setDeleteCandidateId, setSearchModalDeck, setTopDeckModalDeck, animateDiceRoll, activePlayerId, objects } = context;

  switch (action) {
    case 'flip':
      if (obj.type === ItemType.CARD) {
        dispatch({ type: 'FLIP_CARD', payload: { cardId: obj.id } });
      }
      break;

    case 'moveToHand':
      if (obj.type === ItemType.CARD && activePlayerId) {
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: {
            id: obj.id,
            location: CardLocation.HAND,
            ownerId: activePlayerId,
            isOnTable: false
          }
        });
      }
      break;

    case 'moveToTopDeck': {
      if (obj.type === ItemType.CARD && obj.deckId) {
        dispatch({ type: 'RETURN_CARD_TO_DECK_TOP', payload: { cardId: obj.id, deckId: obj.deckId }});
      }
      break;
    }

    case 'moveToBottomDeck': {
      if (obj.type === ItemType.CARD && obj.deckId) {
        dispatch({ type: 'RETURN_CARD_TO_DECK_BOTTOM', payload: { cardId: obj.id, deckId: obj.deckId }});
      }
      break;
    }

    case 'moveToDiscard': {
      if (obj.type === ItemType.CARD && obj.deckId) {
        const deck = objects?.[obj.deckId] as DeckType | undefined;
        if (deck?.piles) {
          const millPile = deck.piles.find(p => p.isMillPile);
          if (millPile) {
            dispatch({
              type: 'ADD_CARD_TO_PILE',
              payload: { deckId: deck.id, pileId: millPile.id, cardId: obj.id }
            });
          }
        }
      }
      break;
    }

    case 'mill': {
      if (obj.type === ItemType.CARD && obj.deckId) {
        const deck = objects?.[obj.deckId] as DeckType | undefined;
        if (deck?.piles) {
          const millPile = deck.piles.find(p => p.isMillPile);
          if (millPile) {
            // Send to mill pile
            dispatch({
              type: 'ADD_CARD_TO_PILE',
              payload: { deckId: deck.id, pileId: millPile.id, cardId: obj.id }
            });
          } else {
            // Fallback to bottom of deck if no mill pile exists
            dispatch({ type: 'MILL_CARD_TO_BOTTOM', payload: { cardId: obj.id, deckId: obj.deckId }});
          }
        } else {
          // No piles at all, send to bottom
          dispatch({ type: 'MILL_CARD_TO_BOTTOM', payload: { cardId: obj.id, deckId: obj.deckId }});
        }
      }
      break;
    }

    case 'rotate':
      dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id } });
      break;

    case 'rotateClockwise':
      dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: (obj as any).rotationStep ?? 45 } });
      break;

    case 'rotateCounterClockwise':
      dispatch({ type: 'ROTATE_OBJECT', payload: { id: obj.id, angle: -((obj as any).rotationStep ?? 45) } });
      break;

    case 'swingClockwise':
      dispatch({ type: 'SWING_CLOCKWISE', payload: { id: obj.id } });
      break;

    case 'swingCounterClockwise':
      dispatch({ type: 'SWING_COUNTER_CLOCKWISE', payload: { id: obj.id } });
      break;

    case 'clone':
      dispatch({ type: 'CLONE_OBJECT', payload: { id: obj.id } });
      break;

    case 'lock':
      dispatch({ type: 'TOGGLE_LOCK', payload: { id: obj.id } });
      break;

    case 'layer':
      dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } });
      break;

    case 'delete':
      if (setDeleteCandidateId) {
        setDeleteCandidateId(obj.id);
      } else {
        dispatch({ type: 'DELETE_OBJECT', payload: { id: obj.id } });
      }
      break;

    case 'bringToFront':
      dispatch({ type: 'BRING_TO_FRONT', payload: { id: obj.id } });
      break;

    case 'sendToBack':
      dispatch({ type: 'SEND_TO_BACK', payload: { id: obj.id } });
      break;

    case 'layerUp':
      dispatch({ type: 'MOVE_LAYER_UP', payload: { id: obj.id } });
      break;

    case 'layerDown':
      dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: obj.id } });
      break;

    case 'roll':
      if (obj.type === ItemType.DICE_OBJECT && animateDiceRoll) {
        animateDiceRoll(obj);
      }
      break;

    case 'draw':
      if (obj.type === ItemType.DECK && activePlayerId) {
        dispatch({ type: 'DRAW_CARD', payload: { deckId: obj.id, playerId: activePlayerId } });
      }
      break;

    case 'playTopCard':
      if (obj.type === ItemType.DECK && activePlayerId) {
        // Take the top card out of deck and add to cursor slot
        const deck = obj as DeckType;
        if (deck.cardIds && deck.cardIds.length > 0) {
          const topCardId = deck.cardIds[0];
          const card = objects ? objects[topCardId] : null;

          // Take the top card out
          dispatch({ type: 'TAKE_TOP_CARD', payload: { deckId: deck.id } });

          // Add to cursor slot
          window.dispatchEvent(new CustomEvent('add-to-cursor-slot', {
            detail: {
              cardId: topCardId,
              clientX: window.innerWidth / 2,
              clientY: window.innerHeight / 2,
              source: 'shift'
            }
          }));
        }
      }
      break;

    case 'millTopCard':
      if (obj.type === ItemType.DECK && activePlayerId) {
        dispatch({ type: 'MILL_TOP_CARD', payload: { deckId: obj.id, playerId: activePlayerId } });
      }
      break;

    case 'toBottom':
      if (obj.type === ItemType.CARD) {
        dispatch({ type: 'RETURN_TO_DECK', payload: { cardId: obj.id } });
      }
      break;

    case 'shuffleDeck':
      if (obj.type === ItemType.DECK) {
        window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
          detail: { deckId: obj.id }
        }));
        dispatch({ type: 'SHUFFLE_DECK', payload: { deckId: obj.id } });
      }
      break;

    case 'searchDeck':
      if (obj.type === ItemType.DECK && setSearchModalDeck) {
        setSearchModalDeck(obj as DeckType);
      }
      break;

    case 'topDeck':
      if (obj.type === ItemType.DECK && setTopDeckModalDeck) {
        setTopDeckModalDeck(obj as DeckType);
      }
      break;

    case 'piles':
      if (obj.type === ItemType.DECK) {
        // Open piles modal or context menu
        console.log('[executeActionButtonUniversal] Piles action for deck:', obj.id);
      }
      break;

    case 'returnAll':
      if (obj.type === ItemType.DECK) {
        dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: obj.id, shuffleAfter: false } });
      }
      break;

    case 'millToBottom':
      if (obj.type === ItemType.CARD && activePlayerId) {
        // Move card to bottom of deck
        dispatch({ type: 'RETURN_TO_DECK', payload: { cardId: obj.id } });
      }
      break;

    case 'showTop':
      if (obj.type === ItemType.DECK) {
        dispatch({ type: 'SHOW_TOP_CARD', payload: { deckId: obj.id } });
      }
      break;

    case 'hide':
      dispatch({ type: 'UPDATE_OBJECT', payload: { id: obj.id, isOnTable: false } });
      break;

    default:
      console.log('[executeActionButtonUniversal] Action not implemented:', action);
  }
}
