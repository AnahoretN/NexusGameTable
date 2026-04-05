import { generateUUID } from '../utils/uuid';
import { CARD_SHAPE_DIMS } from '../constants';
import { Card, Deck, ItemType, CardLocation, CardShape, CardOrientation } from '../types';

// ============================================
// GAME CONSTANTS
// ============================================

/**
 * Color for GM players
 */
export const GM_COLOR = '#8e44ad';

/**
 * Deck & Card Constants
 */
export const DECK_CONSTANTS = {
  /** Offset in pixels for stacked cards in deck */
  OFFSET: 15,

  /** Factor for calculating stacking offset based on card count */
  STACKING_OFFSET_FACTOR: 0.05,

  /** Maximum number of action buttons per object */
  MAX_ACTION_BUTTONS: 4,

  /** Double click delay in milliseconds */
  DOUBLE_CLICK_DELAY: 300,
} as const;

/**
 * Drag & Drop Constants
 */
export const DRAG_CONSTANTS = {
  /** Minimum drag distance in pixels to trigger drag */
  THRESHOLD: 5,

  /** Maximum items allowed in cursor slot */
  MAX_CURSOR_SLOT_ITEMS: 100,

  /** Dice drag threshold to distinguish from click */
  DICE_DRAG_THRESHOLD: 5,
} as const;

/**
 * Pool Panel Constants
 */
export const POOL_PANEL_CONSTANTS = {
  /** Pool panel size in virtual units */
  SIZE: 1000,

  /** Default zoom level for pool panels */
  DEFAULT_ZOOM: 1.0,

  /** Minimum zoom level */
  MIN_ZOOM: 0.25,

  /** Maximum zoom level */
  MAX_ZOOM: 3.0,
} as const;

/**
 * Dice Animation Constants
 */
export const DICE_CONSTANTS = {
  /** Number of animation steps for dice roll */
  ANIMATION_STEPS: 10,

  /** Duration of dice roll animation in milliseconds */
  ANIMATION_DURATION: 1000,
} as const;

/**
 * UI Constants
 */
export const UI_CONSTANTS = {
  /** Default context menu width in pixels */
  CONTEXT_MENU_WIDTH: 200,

  /** Default context menu height in pixels */
  CONTEXT_MENU_HEIGHT: 400,

  /** Submenu offset from parent menu */
  SUBMENU_OFFSET: 5,

  /** Portal rendering delay for submenus in milliseconds */
  SUBMENU_PORTAL_DELAY: 10,
} as const;

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
 * Get player's persistent ID from localStorage
 * This persists across page reloads to identify the same player
 */
export function getPlayerId(): string {
  if (typeof window === 'undefined') return 'unknown';
  let playerId = localStorage.getItem('nexus-player-id');
  if (!playerId) {
    playerId = 'player-' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('nexus-player-id', playerId);
  }
  return playerId;
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
    allowedActions: ['topDeck', 'layer', 'piles', 'draw', 'shuffleDeck', 'playTopCard', 'searchDeck', 'millTopCard', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
    actionButtons: ['draw', 'playTopCard', 'millTopCard', 'shuffleDeck'],
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
