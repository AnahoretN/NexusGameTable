/**
 * Object Factory Functions
 * Unified creation functions for all game objects to eliminate code duplication
 */

import { generateUUID } from './uuid';
import {
  Deck,
  Card,
  Token,
  TokenType,
  DiceObject,
  Counter,
  Board,
  BattlefieldCell,
  NexusBoard,
  NexusCellObject,
  EffectTemplate,
  CardPile,
  ItemType,
  TokenShape,
  CardShape,
  CardOrientation,
  GridType,
  HexDirection,
  ContextAction,
  CardLocation
} from '../types';
import { CARD_SHAPE_DIMS, DEFAULT_DECK_HEIGHT, DEFAULT_DECK_WIDTH, DEFAULT_DICE_SIZE, TOKEN_SIZE } from '../constants';
import { Dispatch } from 'react';

// ============================================
// COMMON INTERFACES
// ============================================

/**
 * Position parameters where (x, y) represent the CENTER of the object
 * All factory functions will calculate top-left position as: x - width/2, y - height/2
 */
export interface PositionParams {
  x: number; // Center X coordinate
  y: number; // Center Y coordinate
}

export interface BaseObjectParams extends PositionParams {
  id?: string;
  name?: string;
  rotation?: number;
  locked?: boolean;
  isOnTable?: boolean;
}

export interface DeckParams extends BaseObjectParams {
  cardShape?: CardShape;
  cardOrientation?: CardOrientation;
  cardWidth?: number;
  cardHeight?: number;
  cardActionButtons?: ContextAction[];
  cardAllowedActions?: ContextAction[];
  cardAllowedActionsForGM?: ContextAction[];
  actionButtons?: ContextAction[];
  allowedActions?: ContextAction[];
  allowedActionsForGM?: ContextAction[];
}

// ============================================
// DECK FACTORIES
// ============================================

/**
 * Create a discard pile for decks
 */
function createDiscardPile(deckId: string): CardPile {
  return {
    id: generateUUID(),
    name: 'Discard',
    deckId,
    position: 'right',
    cardIds: [],
    faceUp: false,
    visible: false,
    size: 1,
    isMillPile: true,
  };
}

/**
 * Common deck properties shared by all deck types
 */
const COMMON_DECK_PROPS = {
  cardActionButtons: ['moveToHand', 'swingClockwise', 'flip'] as ContextAction[],
  cardAllowedActions: undefined,
  cardAllowedActionsForGM: undefined,
  cardSingleClickAction: undefined,
  cardDoubleClickAction: undefined,
  cardNamePosition: 'none' as const,
  actionButtons: ['draw', 'playTopCard', 'millTopCard', 'shuffleDeck'] as ContextAction[],
  allowedActions: [
    'draw',
    'playTopCard',
    'millTopCard',
    'toBottom',
    'showTop',
    'topDeck',
    'searchDeck',
    'shuffleDeck',
    'piles',
    'returnAll',
    'rotateClockwise',
    'rotateCounterClockwise',
    'swingClockwise',
    'swingCounterClockwise',
  ] as ContextAction[],
  allowedActionsForGM: undefined,
};

/**
 * Create a standard deck (poker cards)
 */
export function createStandardDeck(params: DeckParams = {}): Deck {
  const { x = 0, y = 0, id = generateUUID(), name = 'Standard Deck', cardShape = CardShape.POKER, ...rest } = params;
  const dims = CARD_SHAPE_DIMS[cardShape];
  const deckWidth = rest.cardWidth ?? DEFAULT_DECK_WIDTH;
  const deckHeight = rest.cardHeight ?? DEFAULT_DECK_HEIGHT;

  return {
    id,
    type: ItemType.DECK,
    name,
    x: x - deckWidth / 2,  // Center to top-left
    y: y - deckHeight / 2, // Center to top-left
    width: deckWidth,
    height: deckHeight,
    rotation: rest.rotation ?? 0,
    color: '#2c3e50',
    borderColor: '#64748b',
    borderWidth: 2,
    content: '',
    isOnTable: rest.isOnTable ?? true,
    locked: rest.locked ?? false,
    baseCardIds: [],
    cardIds: [],
    showTopCard: false,
    piles: [createDiscardPile(id)],
    cardShape,
    cardOrientation: rest.cardOrientation ?? CardOrientation.VERTICAL,
    cardWidth: deckWidth,
    cardHeight: deckHeight,
    ...COMMON_DECK_PROPS,
    ...rest,
  };
}

/**
 * Create a hex deck
 */
export function createHexDeck(params: DeckParams = {}): Deck {
  const hexHeight = DEFAULT_DECK_HEIGHT;
  const hexWidth = Math.sqrt(3) * hexHeight / 2;

  return createStandardDeck({
    ...params,
    name: params.name ?? 'Hex Deck',
    cardShape: CardShape.HEX,
    cardWidth: params.cardWidth ?? hexWidth,
    cardHeight: params.cardHeight ?? hexHeight,
  });
}

// ============================================
// TOKEN FACTORIES
// ============================================

/**
 * Common token properties
 */
const COMMON_TOKEN_PROPS = {
  snapToGrid: false,
  gridType: GridType.NONE,
  gridSize: 50,
  zIndex: 10,
};

/**
 * Create a token
 */
export function createToken(params: BaseObjectParams & { shape?: TokenShape; content?: string } = {}): Token {
  const { x = 0, y = 0, id = generateUUID(), name = 'Token', shape = TokenShape.CIRCLE, content = '', ...rest } = params;
  const tokenSize = TOKEN_SIZE;

  return {
    id,
    type: ItemType.TOKEN,
    name,
    x: x - tokenSize / 2,  // Center to top-left
    y: y - tokenSize / 2, // Center to top-left
    width: tokenSize,
    height: tokenSize,
    rotation: rest.rotation ?? 0,
    color: '#e74c3c',
    borderColor: '#ffffff',
    borderWidth: 2,
    isOnTable: rest.isOnTable ?? true,
    locked: rest.locked ?? false,
    shape,
    content,
    ...COMMON_TOKEN_PROPS,
    ...rest,
  };
}

/**
 * Create a token type (archetype for tools panel)
 */
export function createTokenType(params: BaseObjectParams & { shape?: TokenShape; maxCopies?: number } = {}): TokenType {
  const { x = 0, y = 0, id = generateUUID(), name = 'Token Type', shape = TokenShape.HEX, maxCopies = 0, ...rest } = params;
  const hexWidth = Math.round(TOKEN_SIZE / 1.155);
  const tokenHeight = TOKEN_SIZE;

  return {
    id,
    type: ItemType.TOKEN_TYPE,
    name,
    x: x - hexWidth / 2,     // Center to top-left
    y: y - tokenHeight / 2,  // Center to top-left
    width: hexWidth,
    height: tokenHeight,
    rotation: rest.rotation ?? 0,
    color: '#3498db',
    borderColor: '#ffffff',
    borderWidth: 2,
    isOnTable: false,
    locked: rest.locked ?? false,
    shape,
    content: '',
    defaultSize: { width: hexWidth, height: tokenHeight },
    autoName: false,
    namePrefix: '',
    spawnCount: 0,
    maxCopies,
    ...rest,
  };
}

// ============================================
// DICE FACTORIES
// ============================================

/**
 * Get dice shape and dimensions based on number of sides
 */
function getDiceShape(sides: number): { shape: TokenShape; width: number; height: number } {
  if (sides < 5) {
    return { shape: TokenShape.TRIANGLE, width: DEFAULT_DICE_SIZE, height: Math.round(DEFAULT_DICE_SIZE / 1.155) };
  }
  if (sides <= 12) {
    return { shape: TokenShape.SQUARE, width: DEFAULT_DICE_SIZE, height: DEFAULT_DICE_SIZE };
  }
  return { shape: TokenShape.HEX, width: Math.round(DEFAULT_DICE_SIZE / 1.155), height: DEFAULT_DICE_SIZE };
}

/**
 * Create a dice object
 */
export function createDice(params: BaseObjectParams & { sides?: number } = {}): DiceObject {
  const { x = 0, y = 0, id = generateUUID(), name = 'Dice', sides = 6, ...rest } = params;
  const { shape, width, height } = getDiceShape(sides);

  return {
    id,
    type: ItemType.DICE_OBJECT,
    name,
    x: x - width / 2,   // Center to top-left
    y: y - height / 2,  // Center to top-left
    width,
    height,
    rotation: rest.rotation ?? 0,
    color: '#6366f1',
    content: '',
    isOnTable: rest.isOnTable ?? true,
    locked: rest.locked ?? false,
    sides,
    currentValue: 1,
    shape,
    actionButtons: ['roll'],
    allowedActions: ['roll'],
    allowedActionsForGM: ['roll'],
    ...rest,
  };
}

// ============================================
// COUNTER FACTORIES
// ============================================

/**
 * Create a counter
 */
export function createCounter(params: BaseObjectParams & { isLifeCounter?: boolean } = {}): Counter {
  const { x = 0, y = 0, id = generateUUID(), name = 'Counter', isLifeCounter = false, ...rest } = params;
  const counterWidth = 150;
  const counterHeight = 60;

  return {
    id,
    type: ItemType.COUNTER,
    name: isLifeCounter ? 'Life Counter' : name,
    x: x - counterWidth / 2,   // Center to top-left
    y: y - counterHeight / 2,  // Center to top-left
    width: counterWidth,
    height: counterHeight,
    rotation: rest.rotation ?? 0,
    color: '#10b981',
    content: '',
    isOnTable: rest.isOnTable ?? true,
    locked: rest.locked ?? false,
    value: isLifeCounter ? 30 : 0,
    baseValue: isLifeCounter ? 30 : 0,
    maxValue: isLifeCounter ? undefined : 30,
    allowNegative: !isLifeCounter,
    actionButtons: ['lock', 'delete'],
    ...rest,
  };
}

// ============================================
// BOARD FACTORIES
// ============================================

/**
 * Create a standard game board
 */
export function createBoard(params: BaseObjectParams & { offsetX?: number; offsetY?: number } = {}): Board {
  const { x = 0, y = 0, id = generateUUID(), name = 'Board', offsetX = 400, offsetY = 300, ...rest } = params;
  const boardWidth = 800;
  const boardHeight = 600;

  return {
    id,
    type: ItemType.BOARD,
    name,
    x: x - boardWidth / 2,   // Center to top-left
    y: y - boardHeight / 2,  // Center to top-left
    width: boardWidth,
    height: boardHeight,
    rotation: rest.rotation ?? 0,
    color: '#34495e',
    content: '',
    isOnTable: rest.isOnTable ?? true,
    locked: rest.locked ?? false,
    shape: TokenShape.HEX,
    gridType: GridType.HEX,
    gridSize: 65,
    gridWidth: 100,
    gridHeight: 115,
    snapToGrid: true,
    hyperscaleLayerId: 'boards',
    ...rest,
  };
}

/**
 * Create a battlefield cell
 */
export function createBattlefieldCell(params: BaseObjectParams & {
  shape?: TokenShape;
  hyperscaleLayerId?: string;
  pixelsPerVU?: number;
} = {}): BattlefieldCell {
  const {
    x = 0,
    y = 0,
    id = generateUUID(),
    name = 'Cell',
    shape = TokenShape.SQUARE,
    hyperscaleLayerId,
    pixelsPerVU = 1,
    ...rest
  } = params;
  const cellWidth = 100;  // VU
  const cellHeight = 100;  // VU

  return {
    id,
    type: ItemType.BATTLEFIELD_CELL,
    shape,
    x: x - cellWidth / 2, // Center to top-left
    y: y - cellHeight / 2, // Center to top-left
    rotation: rest.rotation ?? 0,
    width: cellWidth,
    height: cellHeight,
    content: '',
    name,
    isOnTable: rest.isOnTable ?? true,
    locked: rest.locked ?? false,
    color: '#496179',
    borderColor: '#212f3c',
    borderWidth: 2,
    opacity: 100,
    borderOpacity: 100,
    snapToGrid: true,
    snapCardsToGrid: false,
    gridSize: 50,
    zIndex: 0,
    hyperscaleLayerId,
    actionButtons: ['pin', 'lock', 'delete'],
    ...rest,
  };
}

// ============================================
// NEXUS BOARD FACTORIES
// ============================================

/**
 * Create a Nexus board with main cell
 */
export function createNexusBoard(params: BaseObjectParams & {
  cellWidth?: number;
  cellHeight?: number;
  pixelsPerVU?: number;
  hyperscaleLayerId?: string;
} = {}): { board: NexusBoard; mainCell: NexusCellObject } {
  const {
    x = 0,
    y = 0,
    name = 'Nexus Board',
    cellWidth = 100,
    cellHeight = 150,
    pixelsPerVU = 1,
    hyperscaleLayerId,
    ...rest
  } = params;

  const boardId = generateUUID();
  const mainCellId = generateUUID();

  const mainCell: NexusCellObject = {
    id: mainCellId,
    type: ItemType.NEXUS_CELL,
    shape: TokenShape.HEX,
    x: x - cellWidth / 2, // Center to top-left
    y: y - cellHeight / 2, // Center to top-left
    rotation: 0,
    width: cellWidth,
    height: cellHeight,
    content: '',
    name: 'Main Cell',
    isOnTable: true,
    locked: false,
    color: '#496179',
    borderColor: '#212f3c',
    borderWidth: 2,
    opacity: 100,
    borderOpacity: 100,
    snapToGrid: true,
    gridSize: 50,
    zIndex: 0,
    hyperscaleLayerId,
    nexusBoardId: boardId,
    direction: 'N' as HexDirection,
    offset: { x: 0, y: 0 },
    gridType: GridType.HEX,
    magnetPointCount: 1,
    magnetRotation: 0,
  };

  // Nexus board itself is a logical container with no visual representation
  // Its position marks the center of the main cell
  const board: NexusBoard = {
    id: boardId,
    type: ItemType.NEXUS_BOARD,
    shape: TokenShape.HEX,
    x: x - cellWidth / 2, // Center to top-left (same as main cell)
    y: y - cellHeight / 2, // Center to top-left (same as main cell)
    rotation: 0,
    width: 0,
    height: 0,
    content: '',
    name,
    isOnTable: true,
    locked: false,
    color: '#496179',
    borderColor: '#212f3c',
    borderWidth: 0,
    opacity: 100,
    borderOpacity: 100,
    zIndex: 0,
    hyperscaleLayerId,
    gridType: GridType.HEX,
    gridSize: 50,
    cells: [{ id: mainCellId, direction: 'N' as HexDirection }],
    cellWidth,
    cellHeight,
    snapToGrid: true,
    ...rest,
  };

  return { board, mainCell };
}

// ============================================
// EFFECT TEMPLATE FACTORIES
// ============================================

/**
 * Create a fire cone effect template
 * The (x, y) point corresponds to the pivot point (origin of rotation)
 */
export function createFireConeEffect(params: BaseObjectParams & { pixelsPerVU?: number } = {}): EffectTemplate {
  const { x = 0, y = 0, id = generateUUID(), name = 'Fire Cone Effect', pixelsPerVU = 1, ...rest } = params;
  const effectWidth = 200;
  const effectHeight = 350;

  return {
    id,
    type: ItemType.EFFECT_TEMPLATE,
    name,
    x: x - (effectWidth / 2 / pixelsPerVU), // Center to top-left (approximate for pivot at bottom)
    y: y - (effectHeight / pixelsPerVU),    // Pivot at bottom (100% of height)
    rotation: rest.rotation ?? 0,
    width: effectWidth,
    height: effectHeight,
    content: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1777883916/FireConeEffect_npwe4x.png',
    isOnTable: rest.isOnTable ?? true,
    locked: rest.locked ?? false,
    pivot: { x: 50, y: 100 },
    actionButtons: ['lock', 'delete'],
    hyperscaleLayerId: 'boards',
    zIndex: 15,
    opacity: 85,
    ...rest,
  };
}

/**
 * Create a fire explosion effect template
 * The (x, y) point corresponds to the pivot point (center of explosion)
 */
export function createFireExplosionEffect(params: BaseObjectParams & { pixelsPerVU?: number } = {}): EffectTemplate {
  const { x = 0, y = 0, id = generateUUID(), name = 'Fire Explosion Effect', pixelsPerVU = 1, ...rest } = params;
  const effectWidth = 300;
  const effectHeight = 300;

  return {
    id,
    type: ItemType.EFFECT_TEMPLATE,
    name,
    x: x - (effectWidth / 2 / pixelsPerVU), // Center to top-left (pivot at 50%, 50%)
    y: y - (effectHeight / 2 / pixelsPerVU), // Center to top-left (pivot at 50%, 50%)
    rotation: rest.rotation ?? 0,
    width: effectWidth,
    height: effectHeight,
    content: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1777884706/FireExplosionEffect_bejprf.png',
    isOnTable: rest.isOnTable ?? true,
    locked: rest.locked ?? false,
    pivot: { x: 50, y: 50 },
    rotationMarkerDistance: 150,
    proportionalScaling: true,
    actionButtons: ['lock', 'delete'],
    hyperscaleLayerId: 'boards',
    zIndex: 15,
    opacity: 85,
    ...rest,
  };
}

// ============================================
// STANDARD DECK WITH CARDS (FOR GAME INITIALIZATION)
// ============================================

/**
 * Sprite sheet configuration for standard playing cards
 */
const STANDARD_SPRITE_CONFIG = {
  url: 'https://res.cloudinary.com/dxxh6meej/image/upload/v1768356401/%D0%9C%D0%BE%D0%BD%D1%82%D0%B0%D0%B6%D0%BD%D0%B0%D1%8F_%D0%BE%D0%B1%D0%BB%D0%B0%D1%81%D1%82%D1%8C_1Poker_fdvt8z.png',
  columns: 13,
  rows: 5,
  totalCards: 55,
  cardBackSpriteIndex: 54,
};

/**
 * Create a standard deck with 54 playing cards using sprite sheet
 * Used for game initialization
 */
export function createStandardDeckWithCards(params: BaseObjectParams = {}): { deck: Deck; cards: Card[] } {
  const deckId = params.id ?? generateUUID();
  const cardIds: string[] = [];
  const cards: Card[] = [];
  const defaultShape = CardShape.POKER;
  const defaultDims = CARD_SHAPE_DIMS[defaultShape];
  const centerX = params.x ?? 0;
  const centerY = params.y ?? 0;

  // Create 54 playing cards
  for (let i = 0; i < 54; i++) {
    const cid = generateUUID();
    cardIds.push(cid);
    const card: Card = {
      id: cid,
      type: ItemType.CARD,
      x: centerX - defaultDims.width / 2,   // Center to top-left
      y: centerY - defaultDims.height / 2,  // Center to top-left
      width: defaultDims.width,
      height: defaultDims.height,
      rotation: 0,
      name: `Card ${i + 1}`,
      content: '',
      location: CardLocation.DECK,
      faceUp: false,
      deckId: deckId,
      locked: false,
      isOnTable: true,
      shape: defaultShape,
      // Sprite sheet info
      spriteIndex: i,
      spriteUrl: STANDARD_SPRITE_CONFIG.url,
      spriteColumns: STANDARD_SPRITE_CONFIG.columns,
      spriteRows: STANDARD_SPRITE_CONFIG.rows,
      hyperscaleLayerId: 'cards',
    };
    cards.push(card);
  }

  const deck: Deck = {
    id: deckId,
    type: ItemType.DECK,
    x: centerX - defaultDims.width / 2,   // Center to top-left
    y: centerY - defaultDims.height / 2,  // Center to top-left
    width: defaultDims.width,
    height: defaultDims.height,
    rotation: params.rotation ?? 0,
    name: params.name ?? 'Standard Deck',
    content: '',
    baseCardIds: [...cardIds],
    cardIds,
    locked: params.locked ?? false,
    isOnTable: true,
    allowedActions: ['topDeck', 'layer', 'piles', 'draw', 'shuffleDeck', 'playTopCard', 'searchDeck', 'millTopCard', 'returnAll', 'rotateClockwise', 'rotateCounterClockwise', 'swingClockwise', 'swingCounterClockwise'],
    actionButtons: ['draw', 'playTopCard', 'millTopCard', 'shuffleDeck'],
    cardShape: defaultShape,
    cardOrientation: CardOrientation.VERTICAL,
    cardWidth: defaultDims.width,
    cardHeight: defaultDims.height,
    cardAllowedActions: ['moveTo', 'flip', 'layer', 'rotate', 'lock'],
    cardAllowedActionsForGM: undefined,
    cardActionButtons: ['moveToHand', 'swingClockwise', 'flip'],
    cardSingleClickAction: undefined,
    cardDoubleClickAction: undefined,
    cardNamePosition: 'none' as const,
    initialCardCount: cardIds.length,
    hyperscaleLayerId: 'cards',
    // Sprite sheet configuration
    spriteConfig: {
      spriteUrl: STANDARD_SPRITE_CONFIG.url,
      cardBackUrl: '',
      columns: STANDARD_SPRITE_CONFIG.columns,
      rows: STANDARD_SPRITE_CONFIG.rows,
      totalCards: STANDARD_SPRITE_CONFIG.totalCards,
      spriteIndex: 0,
      cardBackSpriteUrl: STANDARD_SPRITE_CONFIG.url,
      cardBackSpriteIndex: STANDARD_SPRITE_CONFIG.cardBackSpriteIndex,
      cardBackSpriteColumns: STANDARD_SPRITE_CONFIG.columns,
      cardBackSpriteRows: STANDARD_SPRITE_CONFIG.rows,
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

// ============================================
// UNIFIED ACTION HANDLERS
// ============================================

/**
 * Unified handler for shuffle deck action
 * Eliminates duplication across multiple files
 */
export function handleShuffleDeckAction(deckId: string, dispatch: Dispatch<any>): void {
  window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
    detail: { deckId }
  }));
  dispatch({ type: 'SHUFFLE_DECK', payload: { deckId } });
}

/**
 * Unified handler for return all cards and shuffle action
 * Eliminates duplication across multiple files
 */
export function handleReturnAllAndShuffleAction(deckId: string, dispatch: Dispatch<any>): void {
  window.dispatchEvent(new CustomEvent('deck-shuffle-start', {
    detail: { deckId }
  }));
  dispatch({ type: 'RETURN_ALL_CARDS_TO_DECK', payload: { deckId, shuffleAfter: true } });
}

/**
 * Unified handler for clone card within deck action
 * Used by both objectActionHandlers and contextMenuActions
 * @param card - The card to clone
 * @param deck - The deck containing the card
 * @param stateObjects - All objects in state for accessing deck data
 * @param dispatch - Dispatch function for actions
 */
export function handleCloneCardInDeck(
  card: { id: string; name: string; deckId?: string },
  deck: { id: string; cardIds: string[]; baseCardIds?: string[]; type?: string },
  stateObjects: Record<string, any>,
  dispatch: Dispatch<any>
): void {
  // Create a copy of the card in the same deck
  const newCardId = `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Create exact copy of the card with new ID
  const newCard = {
    ...card,
    id: newCardId,
    name: `${card.name} (copy)`,
    deckId: card.deckId,
  };

  // Add new card to deck's cardIds AND baseCardIds
  const updatedCardIds = [...deck.cardIds, newCardId];
  const updatedBaseCardIds = [...(deck.baseCardIds || []), newCardId];

  dispatch({
    type: 'UPDATE_OBJECT',
    payload: {
      id: deck.id,
      updates: { cardIds: updatedCardIds, baseCardIds: updatedBaseCardIds }
    }
  });

  // Add the cloned card to objects
  dispatch({
    type: 'ADD_OBJECT',
    payload: { object: newCard }
  });
}

// ============================================
// MAP FACTORY FOR DYNAMIC CREATION
// ============================================

type CreateParams = BaseObjectParams & {
  type: ItemType;
  cardShape?: CardShape;
  sides?: number;
  isLifeCounter?: boolean;
  hyperscaleLayerId?: string;
  pixelsPerVU?: number;
  cellWidth?: number;
  cellHeight?: number;
};

/**
 * Universal factory function - creates any object type
 */
export function createObject(params: CreateParams): Deck | Token | TokenType | DiceObject | Counter | Board | BattlefieldCell | NexusBoard | NexusCellObject | EffectTemplate | null {
  switch (params.type) {
    case ItemType.DECK:
      if (params.cardShape === CardShape.HEX) {
        return createHexDeck(params);
      }
      return createStandardDeck(params);

    case ItemType.TOKEN:
      return createToken(params);

    case ItemType.TOKEN_TYPE:
      return createTokenType(params);

    case ItemType.DICE_OBJECT:
      return createDice(params);

    case ItemType.COUNTER:
      return createCounter({ ...params, isLifeCounter: params.name === 'Life Counter' });

    case ItemType.BOARD:
      return createBoard(params);

    case ItemType.BATTLEFIELD_CELL:
      return createBattlefieldCell(params);

    case ItemType.NEXUS_BOARD: {
      const { board, mainCell } = createNexusBoard(params);
      // Note: caller needs to dispatch both objects
      return board;
    }

    case ItemType.EFFECT_TEMPLATE:
      if (params.name?.includes('Cone')) {
        return createFireConeEffect(params);
      }
      return createFireExplosionEffect(params);

    default:
      return null;
  }
}
