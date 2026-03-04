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
 * Helper function to create a Standard Deck with 54 cards using sprite sheet
 * Sprite sheet: 13 columns x 5 rows = 65 cards, last 10 removed, 55th card is the back
 */
export function createStandardDeck(): { deck: Deck; cards: Card[] } {
  const deckId = generateUUID();
  const cardIds: string[] = [];
  const cards: Card[] = [];
  const defaultShape = CardShape.POKER;
  const defaultDims = CARD_SHAPE_DIMS[defaultShape];

  // Sprite sheet configuration
  const spriteUrl = 'https://res.cloudinary.com/dxxh6meej/image/upload/v1768356401/%D0%9C%D0%BE%D0%BD%D1%82%D0%B0%D0%B6%D0%BD%D0%B0%D1%8F_%D0%BE%D0%B1%D0%BB%D0%B0%D1%81%D1%82%D1%8C_1Poker_fdvt8z.png';
  const columns = 13;
  const rows = 5;
  const totalCards = 55; // 65 - 10 (empty cards removed)
  const cardBackSpriteIndex = 54; // 55th card (0-based index) is the card back

  // Create 54 playing cards (standard deck)
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
      content: '', // Content determined by sprite sheet
      location: CardLocation.DECK,
      faceUp: false,
      deckId: deckId,
      locked: false,
      isOnTable: true,
      shape: defaultShape,
      // Sprite sheet info
      spriteIndex: i,
      spriteUrl,
      spriteColumns: columns,
      spriteRows: rows,
      hyperscaleLayerId: 'cards', // Cards in deck are on cards layer
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
    hyperscaleLayerId: 'cards', // Deck is on cards layer
    // Sprite sheet configuration
    spriteConfig: {
      spriteUrl,
      cardBackUrl: '', // Card back is in the sprite sheet
      columns,
      rows,
      totalCards,
      spriteIndex: 0,
      // Card back from sprite sheet (55th card)
      cardBackSpriteUrl: spriteUrl,
      cardBackSpriteIndex: cardBackSpriteIndex,
      cardBackSpriteColumns: columns,
      cardBackSpriteRows: rows,
    },
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
