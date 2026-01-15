import { TableObject, ItemType, CardLocation } from '../../types';

/**
 * Reducer functions for card and deck manipulation actions
 * DRAW_CARD, PLAY_CARD, SHUFFLE_DECK, FLIP_CARD, etc.
 */

export function drawCardReducer(state: any, action: any): any {
  if (action.type !== 'DRAW_CARD') return state;

  const { deckId, playerId, count = 1 } = action.payload;
  const deck = state.objects[deckId];
  if (!deck || deck.type !== ItemType.DECK) return state;

  const newObjects = { ...state.objects };
  const drawnCardIds: string[] = [];

  // Draw cards from the end of cardIds (top of deck)
  for (let i = 0; i < count && deck.cardIds.length > 0; i++) {
    const cardId = deck.cardIds[deck.cardIds.length - 1];
    const card = state.objects[cardId];

    if (card) {
      newObjects[cardId] = {
        ...card,
        location: CardLocation.HAND,
        ownerId: playerId,
        isOnTable: false,
        x: 0, y: 0, // Position in hand is managed by HandPanel
        faceUp: false // Cards are drawn face down
      };
      drawnCardIds.push(cardId);
    }

    // Remove from deck's cardIds
    deck.cardIds.pop();
  }

  // Update deck
  newObjects[deckId] = { ...deck };

  return { ...state, objects: newObjects };
}

export function playCardReducer(state: any, action: any): any {
  if (action.type !== 'PLAY_CARD') return state;

  const { cardId, x, y, faceUp } = action.payload;
  const card = state.objects[cardId];

  if (!card || card.type !== ItemType.CARD) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [cardId]: {
        ...card,
        location: CardLocation.TABLE,
        ownerId: undefined,
        isOnTable: true,
        x,
        y,
        faceUp: faceUp ?? true
      }
    }
  };
}

export function shuffleDeckReducer(state: any, action: any): any {
  if (action.type !== 'SHUFFLE_DECK') return state;

  const deck = state.objects[action.payload.id];
  if (!deck || deck.type !== ItemType.DECK) return state;

  // Shuffle cardIds
  const shuffled = [...deck.cardIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...deck,
        cardIds: shuffled
      }
    }
  };
}

export function flipCardReducer(state: any, action: any): any {
  if (action.type !== 'FLIP_CARD') return state;

  const card = state.objects[action.payload.cardId];
  if (!card || card.type !== ItemType.CARD) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.cardId]: {
        ...card,
        faceUp: !card.faceUp
      }
    }
  };
}

export function returnToDeckReducer(state: any, action: any): any {
  if (action.type !== 'RETURN_TO_DECK') return state;

  const { cardId, deckId, faceUp } = action.payload;
  const card = state.objects[cardId];
  const deck = state.objects[deckId];

  if (!card || !deck) return state;

  const newObjects = { ...state.objects };

  // Update card
  newObjects[cardId] = {
    ...card,
    location: CardLocation.DECK,
    deckId,
    ownerId: undefined,
    isOnTable: true,
    faceUp: faceUp ?? false
  };

  // Add to deck
  newObjects[deckId] = {
    ...deck,
    cardIds: [...(deck as any).cardIds, cardId]
  };

  return { ...state, objects: newObjects };
}

export function addCardToTopOfDeckReducer(state: any, action: any): any {
  if (action.type !== 'ADD_CARD_TO_TOP_OF_DECK') return state;

  const { deckId, cardId } = action.payload;
  const deck = state.objects[deckId];
  const card = state.objects[cardId];

  if (!deck || !card) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [deckId]: {
        ...deck,
        cardIds: [...(deck as any).cardIds, cardId]
      },
      [cardId]: {
        ...card,
        location: CardLocation.DECK,
        deckId,
        ownerId: undefined
      }
    }
  };
}

export function millCardToBottomReducer(state: any, action: any): any {
  if (action.type !== 'MILL_CARD_TO_BOTTOM') return state;

  const { deckId, count = 1 } = action.payload;
  const deck = state.objects[deckId];
  if (!deck || deck.type !== ItemType.DECK) return state;

  const currentCardIds = [...(deck as any).cardIds];
  const toMove = currentCardIds.splice(0, Math.min(count, currentCardIds.length));
  const newCardIds = [...currentCardIds, ...toMove];

  return {
    ...state,
    objects: {
      ...state.objects,
      [deckId]: {
        ...deck,
        cardIds: newCardIds
      }
    }
  };
}

export function toggleShowTopCardReducer(state: any, action: any): any {
  if (action.type !== 'TOGGLE_SHOW_TOP_CARD') return state;

  const deck = state.objects[action.payload.id];
  if (!deck || deck.type !== ItemType.DECK) return state;

  return {
    ...state,
    objects: {
      ...state.objects,
      [action.payload.id]: {
        ...deck,
        showTopCard: (deck as any).showTopCard ? false : true
      }
    }
  };
}
