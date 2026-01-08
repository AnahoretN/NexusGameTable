
export enum ItemType {
  TOKEN = 'TOKEN',
  CARD = 'CARD',
  DECK = 'DECK',
  DICE_OBJECT = 'DICE_OBJECT',
  COUNTER = 'COUNTER',
}

// Visual subtypes for tokens to handle Chips, Figurines, Badges, Boards
export enum TokenShape {
  CIRCLE = 'CIRCLE',
  SQUARE = 'SQUARE',
  HEX = 'HEX',
  STANDEE = 'STANDEE', // Figurine
  RECTANGLE = 'RECTANGLE' // For Boards
}

export enum CardShape {
  POKER = 'POKER',
  BRIDGE = 'BRIDGE',
  MINI_US = 'MINI_US',
  MINI_EURO = 'MINI_EURO',
  SQUARE = 'SQUARE',
  HEX = 'HEX',
  CIRCLE = 'CIRCLE',
  TRIANGLE = 'TRIANGLE'
}

export enum CardOrientation {
  VERTICAL = 'VERTICAL',   // Normal orientation (portrait)
  HORIZONTAL = 'HORIZONTAL' // Rotated 90 degrees clockwise (landscape)
}

export enum SearchWindowVisibility {
  FACE_UP = 'FACE_UP',           // Always show face up
  FACE_DOWN = 'FACE_DOWN',       // Always show face down
  AS_GM = 'AS_GM',               // Same as GM sees (for players)
  LAST_STATE = 'LAST_STATE',     // Remember per-player last state
  SHARED_DECK = 'SHARED_DECK'    // Shared state across all players
}

export enum GridType {
  NONE = 'NONE',
  SQUARE = 'SQUARE',
  HEX = 'HEX'
}

export enum CardLocation {
  TABLE = 'TABLE',
  DECK = 'DECK',
  HAND = 'HAND',
  PILE = 'PILE'
}

export type PilePosition = 'left' | 'right' | 'top' | 'bottom' | 'free';
export type PileSize = 0.5 | 1;

export interface CardPile {
  id: string;
  name: string;
  deckId: string; // Which deck this pile belongs to
  position: PilePosition; // Where pile is positioned relative to deck
  x?: number; // For 'free' position - absolute coordinates
  y?: number;
  cardIds: string[]; // IDs of cards in this pile
  faceUp?: boolean; // Whether cards in pile are face up
  visible: boolean; // Whether pile is shown/hidden
  size?: PileSize; // Size of pile relative to deck (0.5 = half, 1 = full)
  locked?: boolean; // Whether pile position is locked (only for free position)
}

export type ContextAction = 'flip' | 'rotate' | 'delete' | 'lock' | 'clone' | 'toHand' | 'draw' | 'layer' | 'shuffleDeck' | 'searchDeck' | 'playTopCard' | 'returnAll' | 'removeFromTable';
export type ClickAction = ContextAction | 'none';

export interface Coordinates {
  x: number;
  y: number;
}

export interface GameItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  content: string; // Image URL or Text
  name: string;
  ownerId?: string; // For tokens locked to a player
  color?: string;
  
  // New props for context menu features
  locked: boolean;
  isOnTable: boolean; // Controls visibility on the battlefield vs just in the list
  allowedActions?: ContextAction[]; // Actions players are allowed to perform in context menu (undefined = all allowed)
  allowedActionsForGM?: ContextAction[]; // Actions GM is allowed to perform in context menu (undefined = all allowed)
  actionButtons?: ContextAction[]; // Actions shown as buttons on the object (max 4)
  singleClickAction?: ClickAction; // Action to perform on single click
  doubleClickAction?: ClickAction; // Action to perform on double click
  zIndex?: number; // Visual layering order
}

// Where to show the card name
export type CardNamePosition = 'top' | 'bottom' | 'none';

// Card does NOT have its own settings - it always inherits from its deck
export interface Card extends Omit<GameItem, 'allowedActions' | 'allowedActionsForGM' | 'actionButtons' | 'singleClickAction' | 'doubleClickAction' | 'width' | 'height'> {
  type: ItemType.CARD;
  location: CardLocation;
  faceUp: boolean;
  deckId?: string; // If inside a deck or drawn from one
  description?: string;
  shape?: CardShape;
  width?: number; // Can override deck's cardWidth (optional)
  height?: number; // Can override deck's cardHeight (optional)
}

export interface Deck extends GameItem {
  type: ItemType.DECK;
  cardIds: string[]; // IDs of cards currently in the stack
  cardShape?: CardShape; // The shape setting for cards in this deck
  cardOrientation?: CardOrientation; // Default orientation for cards from this deck (undefined = VERTICAL)
  initialCardCount?: number; // Initial number of cards when deck was created
  piles?: CardPile[]; // Additional card piles associated with this deck (discard, etc.)

  // Settings for cards belonging to this deck (inherited by cards)
  cardAllowedActions?: ContextAction[]; // Actions players are allowed on cards from this deck
  cardAllowedActionsForGM?: ContextAction[]; // Actions GM is allowed on cards from this deck
  cardActionButtons?: ContextAction[]; // Actions shown as buttons on cards from this deck (max 4)
  cardSingleClickAction?: ClickAction; // Action to perform on single click for cards from this deck
  cardDoubleClickAction?: ClickAction; // Action to perform on double click for cards from this deck
  cardWidth?: number; // Default width for cards from this deck (undefined = use deck width)
  cardHeight?: number; // Default height for cards from this deck (undefined = use deck height)
  cardNamePosition?: CardNamePosition; // Where to show card name: 'top', 'bottom', or 'none' (default 'bottom')
  searchFaceUp?: boolean; // DEPRECATED: Use searchWindowVisibility instead
  playTopFaceUp?: boolean; // Whether played top card is face up (default true)
  searchWindowVisibility?: SearchWindowVisibility; // How cards are displayed in search window for players
  perPlayerSearchFaceUp?: Record<string, boolean>; // Player ID -> their preferred face up setting (for 'lastState' mode)
}

export interface Token extends GameItem {
  type: ItemType.TOKEN;
  shape: TokenShape;
  // Grid properties for Boards
  gridType?: GridType;
  gridSize?: number; // Size of a cell in pixels
  snapToGrid?: boolean; // If true, other objects snap to this
}

export interface DiceObject extends GameItem {
  type: ItemType.DICE_OBJECT;
  sides: number;
  currentValue: number;
}

export interface Counter extends GameItem {
  type: ItemType.COUNTER;
  value: number;
}

export type TableObject = Card | Deck | Token | DiceObject | Counter;

export interface Player {
  id: string;
  name: string;
  color: string;
  isGM: boolean;
  handCardOrder?: string[]; // Custom order of card IDs in player's hand
}

export interface DiceRoll {
  id: string;
  value: number;
  timestamp: number;
  playerName: string;
}
