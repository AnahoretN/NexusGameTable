import { generateUUID } from '../utils/uuid';
import { CARD_SHAPE_DIMS } from '../constants';
import { Card, Deck, ItemType, CardLocation, CardShape, CardOrientation } from '../types';

/**
 * Color for GM players
 */
export const GM_COLOR = '#8e44ad';

/**
 * Generate or get session ID from localStorage
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'unknown';
  let sessionId = localStorage.getItem('nexus-session-id');
  if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('nexus-session-id', sessionId);
  }
  return sessionId;
}

/**
 * Helper function to create a Standard Deck with 54 cards
 */
export function createStandardDeck(): { deck: Deck; cards: Card[] } {
  const deckId = generateUUID();
  const cardIds: string[] = [];
  const cards: Card[] = [];
  const defaultShape = CardShape.POKER;
  const defaultDims = CARD_SHAPE_DIMS[defaultShape];

  for (let i = 0; i < 54; i++) {
    const cid = generateUUID();
    cardIds.push(cid);
    const card: Card = {
      id: cid,
      type: ItemType.CARD,
      x: 0, y: 0,
      width: defaultDims.width,
      height: defaultDims.height,
      rotation: 0,
      name: `Card ${i + 1}`,
      content: `https://picsum.photos/seed/${cid}/${defaultDims.width}/${defaultDims.height}`,
      location: CardLocation.DECK,
      faceUp: false,
      deckId: deckId,
      locked: false,
      isOnTable: true,
      shape: defaultShape
    };
    cards.push(card);
  }

  const deck: Deck = {
    id: deckId,
    type: ItemType.DECK,
    x: 0, y: 0, // Will be set by caller
    width: defaultDims.width,
    height: defaultDims.height,
    rotation: 0,
    name: 'Standard Deck',
    content: '',
    baseCardIds: [...cardIds], // Base list - starts same as cardIds
    cardIds,
    locked: false,
    isOnTable: true,
    allowedActions: ['draw', 'shuffleDeck', 'playTopCard', 'searchDeck', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
    actionButtons: ['draw', 'playTopCard', 'shuffleDeck', 'searchDeck'],
    cardShape: defaultShape,
    cardOrientation: CardOrientation.VERTICAL,
    cardWidth: defaultDims.width,
    cardHeight: defaultDims.height,
    cardAllowedActions: ['flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise', 'layer', 'layerUp', 'layerDown', 'moveTo', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard'],
    cardAllowedActionsForGM: ['flip', 'rotate', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise', 'layer', 'layerUp', 'layerDown', 'delete', 'clone', 'lock', 'pin', 'moveTo', 'moveToHand', 'moveToTopDeck', 'moveToBottomDeck', 'moveToDiscard'],
    cardActionButtons: ['moveToHand', 'swingClockwise', 'flip'],
    cardSingleClickAction: undefined,
    cardDoubleClickAction: undefined,
    cardNamePosition: 'none' as const,
    initialCardCount: cardIds.length,
    piles: [
      {
        id: `${deckId}-discard`,
        name: 'Discard',
        deckId: deckId,
        position: 'right',
        cardIds: [],
        faceUp: false,
        visible: false,
        size: 1,
        isMillPile: true
      }
    ]
  };

  return { deck, cards };
}
