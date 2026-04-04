import { TableObject, CardLocation, Deck as DeckType, Card, CardPile, TokenShape, ItemType, DiceObject, Counter, NexusCellObject } from '../types';

/**
 * Common context menu action handlers
 * This eliminates code duplication between Tabletop and PoolTabletop
 */

export interface ContextMenuActionParams {
  object: TableObject;
  dispatch: React.Dispatch<any>;
  state: any;
  activePlayerId?: string;
  offset?: { x: number; y: number };
  setContextMenu?: (menu: any) => void;
  setSettingsModalObj?: (obj: TableObject) => void;
  setDeleteCandidateId?: (id: string) => void;
  setSearchModalDeck?: (deck: DeckType | null) => void;
  setSearchModalPile?: (pile: CardPile | undefined) => void;
  setTopDeckModalDeck?: (deck: DeckType | null) => void;
  setNexusBoardAddingCell?: (id: string | null) => void;
  isShiftPressed?: boolean;
  isGM?: boolean;
  // Pool panel specific callbacks
  animateDiceRoll?: (dice: DiceObject) => void;
  isPoolPanel?: boolean;
}

/**
 * Execute context menu action - shared logic for both Tabletop and PoolTabletop
 */
export const executeContextMenuAction = (action: string, params: ContextMenuActionParams): void => {
  console.log('[executeContextMenuAction] CALLED with action:', action, 'object type:', params.object.type);

  const {
    object,
    dispatch,
    state,
    activePlayerId,
    offset = { x: 0, y: 0 },
    setContextMenu,
    setSettingsModalObj,
    setDeleteCandidateId,
    setSearchModalDeck,
    setSearchModalPile,
    setTopDeckModalDeck,
    setNexusBoardAddingCell,
    isShiftPressed = false,
    isGM = false,
    isPoolPanel = false
  } = params;

  console.log('[executeContextMenuAction] Params extracted, setSearchModalDeck:', !!setSearchModalDeck, 'setSearchModalPile:', !!setSearchModalPile);
  console.log('[executeContextMenuAction] ABOUT TO ENTER SWITCH, action:', action);

  switch(action) {
    case 'configure':
      // Token-copies don't have individual settings
      if (object.type === ItemType.TOKEN && (object as any).archetypeId) {
        return;
      }
      if (setSettingsModalObj) setSettingsModalObj(object);
      return;

    case 'delete':
      // Special handling for cards in decks - delete permanently from deck
      if (object.type === ItemType.CARD && (object as Card).deckId) {
        // Cards in decks are deleted immediately without confirmation
        // This removes the card completely from the deck (decrement deck count)
        dispatch({ type: 'DELETE_OBJECT', payload: { id: object.id }});
        return;
      }
      // If Shift is held, delete immediately without confirmation
      if (isShiftPressed) {
        dispatch({ type: 'DELETE_OBJECT', payload: { id: object.id }});
        return;
      }
      // Token-copies are deleted immediately without confirmation
      if (object.type === ItemType.TOKEN && (object as any).archetypeId) {
        dispatch({ type: 'DELETE_OBJECT', payload: { id: object.id }});
        return;
      }
      if (setDeleteCandidateId) setDeleteCandidateId(object.id);
      return;

    case 'pinToViewport':
      let screenX: number, screenY: number;

      if (object.type === ItemType.PANEL || object.type === ItemType.WINDOW) {
        // For UI objects, find the actual rendered element and get its screen position
        const uiElement = document.querySelector(`[data-ui-object="${object.id}"]`) as HTMLElement;
        if (uiElement) {
          const rect = uiElement.getBoundingClientRect();
          screenX = rect.left;
          screenY = rect.top;
        } else {
          // Fallback: calculate from object position (unpinned UI objects use object.x directly)
          screenX = object.x;
          screenY = object.y;
        }
      } else {
        // For game objects (decks, etc.) in transform container
        // CSS transform is: translate(offset) scale(zoom)
        // So: screenX = (worldX + offset.x) * zoom
        screenX = object.x + offset.x;
        screenY = object.y + offset.y;
      }

      dispatch({
        type: 'PIN_TO_VIEWPORT',
        payload: {
          id: object.id,
          screenX,
          screenY
        }
      });
      return;

    case 'unpinFromViewport':
      let worldX: number, worldY: number;

      if (object.type === ItemType.PANEL || object.type === ItemType.WINDOW) {
        // UI objects: For pinned UI objects, object.x/y ARE the current viewport coordinates
        // To convert to world coordinates for unpinned: worldX = screenX / zoom + offset.x
        // But for UI objects, they use position: absolute with left: object.x (no transform)
        // So: worldX = object.x * zoom + offset.x
        worldX = object.x + offset.x;
        worldY = object.y + offset.y;
      } else {
        // Game objects (decks, etc.): render in transform container
        // For pinned game objects, visual position comes from pinnedScreenPosition
        const pinnedPos = (object as any).pinnedScreenPosition;
        if (!pinnedPos) {
          // No pinned position - shouldn't happen, but use current position as fallback
          worldX = object.x;
          worldY = object.y;
        } else {
          // pinnedPos contains current viewport coordinates
          // Convert to world coordinates: worldX = screenX / zoom - offset.x
          worldX = pinnedPos.x - offset.x;
          worldY = pinnedPos.y - offset.y;
        }
      }

      dispatch({
        type: 'UNPIN_FROM_VIEWPORT',
        payload: { id: object.id, worldX, worldY }
      });
      return;

    case 'lock':
      dispatch({ type: 'TOGGLE_LOCK', payload: { id: object.id } });
      break;

    case 'clone':
      // Special handling for cards in decks - clone card within the same deck
      if (object.type === ItemType.CARD && (object as Card).deckId) {
        const card = object as Card;
        const deck = state.objects[card.deckId] as DeckType;
        if (deck && deck.type === ItemType.DECK) {
          // Create a copy of the card in the same deck
          const newCardId = `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          // Create exact copy of the card with new ID
          const newCard: Card = {
            ...card,
            id: newCardId,
            name: `${card.name} (copy)`
          };

          // Add new card to deck
          const updatedCardIds = [...deck.cardIds, newCardId];

          dispatch({
            type: 'UPDATE_OBJECT',
            payload: {
              id: deck.id,
              cardIds: updatedCardIds
            }
          });

          // Add the cloned card to objects
          dispatch({
            type: 'ADD_OBJECT',
            payload: { object: newCard }
          });

          console.log('[contextMenuActions] Card cloned in deck:', {
            originalCardId: card.id,
            newCardId,
            deckId: deck.id,
            totalCards: updatedCardIds.length
          });
        } else {
          // Fallback to regular object clone
          dispatch({ type: 'CLONE_OBJECT', payload: { id: object.id } });
        }
      } else {
        dispatch({ type: 'CLONE_OBJECT', payload: { id: object.id } });
      }
      break;

    case 'flip':
      dispatch({ type: 'FLIP_CARD', payload: { cardId: object.id } });
      break;

    case 'rotate':
    case 'rotateClockwise':
      dispatch({ type: 'ROTATE_OBJECT', payload: { id: object.id } });
      break;

    case 'rotateCounterClockwise':
      // Rotate counter-clockwise (negative rotation)
      const currentRotation = object.rotation || 0;
      const rotationStep = (object as any).rotationStep || 45;
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, rotation: currentRotation - rotationStep }
      });
      break;

    case 'resetRotation':
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, rotation: 0 }
      });
      break;

    case 'swingClockwise':
      // Swing clockwise (90° rotation)
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, rotation: (object.rotation || 0) + 90 }
      });
      break;

    case 'swingCounterClockwise':
      // Swing counter-clockwise (90° rotation)
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, rotation: (object.rotation || 0) - 90 }
      });
      break;

    case 'bringToFront':
      dispatch({ type: 'MOVE_LAYER_UP', payload: { id: object.id } });
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, zIndex: 10000 }
      });
      break;

    case 'sendToBack':
      dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: object.id } });
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, zIndex: 0 }
      });
      break;

    case 'layerUp':
      dispatch({ type: 'MOVE_LAYER_UP', payload: { id: object.id } });
      break;

    case 'layerDown':
      dispatch({ type: 'MOVE_LAYER_DOWN', payload: { id: object.id } });
      break;

    case 'show':
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, isOnTable: true }
      });
      break;

    case 'hide':
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, isOnTable: false }
      });
      break;

    // Deck-specific actions
    case 'topDeck':
      // Open top deck modal - dispatch event to main app
      window.dispatchEvent(new CustomEvent('open-top-deck-modal', {
        detail: { deckId: object.id }
      }));
      break;

    case 'searchDeck':
      // Open search deck modal - dispatch event to main app
      window.dispatchEvent(new CustomEvent('open-search-deck-modal', {
        detail: { deckId: object.id }
      }));
      break;

    case 'shuffleDeck':
      // Dispatch event for shuffle animation (same as Tabletop.tsx)
      window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
        detail: { deckId: object.id }
      }));
      dispatch({ type: 'SHUFFLE_DECK', payload: { deckId: object.id } });
      break;

    case 'draw':
      dispatch({ type: 'DRAW_CARD', payload: { deckId: object.id, playerId: activePlayerId || state.activePlayerId } });
      break;

    case 'playTopCard':
      // Play top card from deck to tabletop
      dispatch({ type: 'PLAY_TOP_CARD', payload: { deckId: object.id } });
      break;

    case 'millTopCard':
      // Mill top card (move to mill pile)
      const deckToMill = object as DeckType;
      const millPile = deckToMill.piles?.find(p => p.isMillPile);
      if (millPile && deckToMill.cardIds.length > 0) {
        const topCardId = deckToMill.cardIds[deckToMill.cardIds.length - 1];
        dispatch({
          type: 'MILL_CARD_TO_PILE',
          payload: {
            cardId: topCardId,
            deckId: object.id,
            pileId: millPile.id
          }
        });
      }
      break;

    case 'toBottom':
      // Move top card to bottom of deck
      const deckToBottom = object as DeckType;
      if (deckToBottom.cardIds.length > 0) {
        const topCardId = deckToBottom.cardIds[deckToBottom.cardIds.length - 1];
        dispatch({
          type: 'MILL_CARD_TO_BOTTOM',
          payload: { deckId: object.id, cardId: topCardId }
        });
      }
      break;

    case 'showTop':
      // Toggle showing top card
      const deckShowTop = object as DeckType;
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, showTopCard: !deckShowTop.showTopCard }
      });
      break;

    case 'hideTop':
      // Hide top card (same as showTop with false)
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, showTopCard: false }
      });
      break;

    case 'returnAll':
      dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: object.id, shuffleAfter: false } });
      break;

    case 'returnAllAndShuffle':
      // Dispatch event for shuffle animation before returning cards
      window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
        detail: { deckId: object.id }
      }));
      dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: object.id, shuffleAfter: true } });
      break;

    case 'returnAllExceptHands':
      dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId: object.id, exceptHands: true, shuffleAfter: false } });
      break;

    // Dice-specific actions
    case 'roll':
      if (object.type === ItemType.DICE_OBJECT && animateDiceRoll) {
        animateDiceRoll(object as DiceObject);
      }
      break;

    // Counter-specific actions
    case 'resetToBase':
      if (object.type === ItemType.COUNTER) {
        const counter = object as Counter;
        // Menu closing is handled by the component
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: object.id, value: counter.baseValue ?? 0 }
        });
      }
      break;

    // Search window card actions
    case 'setCardBack':
      // Menu closing is handled by the component
      window.dispatchEvent(new CustomEvent('set-card-back', {
        detail: { cardId: object.id }
      }));
      break;

    case 'toggleHide':
      dispatch({
        type: 'UPDATE_OBJECT',
        payload: { id: object.id, hidden: !(object as Card).hidden }
      });
      break;

    // Card movement actions
    case 'moveToHand':
      // Move card to hand - use DRAW_CARD in reverse or set proper card location
      const cardToHand = object as any;
      if (cardToHand.deckId) {
        // Remove from current location and add to player's hand
        dispatch({
          type: 'UPDATE_OBJECT',
          payload: { id: object.id, location: CardLocation.HAND }
        });
      }
      break;

    case 'moveToTopDeck':
      const card = object as any;
      if (card.deckId) {
        dispatch({
          type: 'RETURN_CARD_TO_DECK_TOP',
          payload: { cardId: object.id, deckId: card.deckId }
        });
      }
      break;

    case 'moveToBottomDeck':
      const cardBottom = object as any;
      if (cardBottom.deckId) {
        // For pool panels, use RETURN_CARD_TO_DECK_BOTTOM
        // For tabletop, use MILL_CARD_TO_BOTTOM
        const action = isPoolPanel ? 'RETURN_CARD_TO_DECK_BOTTOM' : 'MILL_CARD_TO_BOTTOM';
        dispatch({
          type: action,
          payload: { deckId: cardBottom.deckId, cardId: object.id }
        });
      }
      break;

    case 'moveToDiscard':
      const cardDiscard = object as any;
      if (cardDiscard.deckId) {
        const deckDiscard = state.objects[cardDiscard.deckId] as DeckType;
        const millPileDiscard = deckDiscard?.piles?.find(p => p.isMillPile);
        if (millPileDiscard) {
          dispatch({
            type: 'ADD_CARD_TO_PILE',
            payload: { cardId: object.id, deckId: cardDiscard.deckId, pileId: millPileDiscard.id }
          });
        }
      }
      break;
  }

  // Handle dynamic actions (outside of switch)
  // These actions use prefixes and cannot be handled by switch cases

  // Handle moveToPile actions (moveToPile-{pileId})
    console.log('[executeContextMenuAction] Checking moveToPile-:', action.startsWith('moveToPile-'), 'objectType:', object.type);
    if (action.startsWith('moveToPile-') && object.type === ItemType.CARD) {
      const pileId = action.replace('moveToPile-', '');
      const card = object as CardType;
      if (card.deckId) {
        dispatch({ type: 'ADD_CARD_TO_PILE', payload: { cardId: card.id, pileId, deckId: card.deckId }});
      }
      // Menu closing is handled by the component
      return;
    }

    // Handle pile actions for decks (pile-{pileId})
    console.log('[executeContextMenuAction] Checking pile-:', action.startsWith('pile-'), 'objectType:', object.type);
    if (action.startsWith('pile-') && object.type === ItemType.DECK) {
      const pileId = action.replace('pile-', '');
      const deck = object as DeckType;
      const pile = deck.piles?.find(p => p.id === pileId);
      console.log('[executeContextMenuAction] pile- action:', { action, pileId, deck: deck.name, pile: pile?.name, isPoolPanel });
      if (pile) {
        if (isPoolPanel) {
          // For pool panels, dispatch event
          window.dispatchEvent(new CustomEvent('open-pile-modal', {
            detail: { pileId }
          }));
        } else {
          // For tabletop, use state
          console.log('[executeContextMenuAction] Setting search modal:', { deck: deck.name, pile: pile.name });
          if (setSearchModalDeck) setSearchModalDeck(deck);
          if (setSearchModalPile) setSearchModalPile(pile);
        }
      }
    }

    // Handle hyperscale layer actions (moveToHyperscaleLayer:{layerId})
    console.log('[executeContextMenuAction] Checking moveToHyperscaleLayer::', action.startsWith('moveToHyperscaleLayer:'));
    if (action.startsWith('moveToHyperscaleLayer:')) {
      const layerId = action.replace('moveToHyperscaleLayer:', '');
      console.log('[executeContextMenuAction] moveToHyperscaleLayer: action:', { action, layerId, objectId: object.id });
      dispatch({
        type: 'MOVE_OBJECT_TO_HYPERSCALE_LAYER',
        payload: { objectId: object.id, layerId }
      });
    }

    // Handle editNexusBoard action for NexusBoard - start editing mode
    if (action === 'editNexusBoard' && object.type === ItemType.NEXUS_BOARD) {
      // Menu closing is handled by the component
      if (isPoolPanel) {
        // For pool panels, dispatch event
        window.dispatchEvent(new CustomEvent('edit-nexus-board', {
          detail: { objectId: object.id }
        }));
      } else {
        // For tabletop, use state
        if (setNexusBoardAddingCell) setNexusBoardAddingCell(object.id);
      }
      return;
    }

    // Handle editNexusBoard action for NexusCellObject - use linked board
    if (action === 'editNexusBoard' && object.type === ItemType.NEXUS_CELL) {
      // Menu closing is handled by the component
      if (isPoolPanel) {
        // For pool panels, dispatch event
        window.dispatchEvent(new CustomEvent('edit-nexus-board', {
          detail: { objectId: object.id }
        }));
      } else {
        // For tabletop, use state
        if (setNexusBoardAddingCell) setNexusBoardAddingCell((object as NexusCellObject).nexusBoardId);
      }
      return;
    }

    // Handle closeNexusBoardEditing action for NexusBoard - stop editing mode
    if (action === 'closeNexusBoardEditing' && object.type === ItemType.NEXUS_BOARD) {
      // Menu closing is handled by the component
      if (isPoolPanel) {
        // For pool panels, dispatch event
        window.dispatchEvent(new CustomEvent('close-nexus-board-editing', {
          detail: { objectId: object.id }
        }));
      } else {
        // For tabletop, use state
        if (setNexusBoardAddingCell) setNexusBoardAddingCell(null);
      }
      return;
    }

    // Handle closeNexusBoardEditing action for NexusCellObject - use linked board
    if (action === 'closeNexusBoardEditing' && object.type === ItemType.NEXUS_CELL) {
      // Menu closing is handled by the component
      if (isPoolPanel) {
        // For pool panels, dispatch event
        window.dispatchEvent(new CustomEvent('close-nexus-board-editing', {
          detail: { objectId: object.id }
        }));
      } else {
        // For tabletop, use state
        if (setNexusBoardAddingCell) setNexusBoardAddingCell(null);
      }
      return;
    }

    // Handle deleteNexusBoard action for NexusCellObject - delete the whole board
    if (action === 'deleteNexusBoard' && object.type === ItemType.NEXUS_CELL) {
      // Menu closing is handled by the component
      dispatch({ type: 'DELETE_OBJECT', payload: { id: (object as NexusCellObject).nexusBoardId }});
      return;
    }

    // Default: call executeClickAction for any other actions
    // This handles deck actions, card actions, etc.
    // We need to find executeClickAction - but it's defined inside Tabletop component
    // For pool panels, we'll skip this and just close the menu
    // NOTE: Don't close menu here - let the component decide when to close
};
