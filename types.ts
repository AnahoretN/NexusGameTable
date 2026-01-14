
export enum ItemType {
  TOKEN = 'TOKEN',
  CARD = 'CARD',
  DECK = 'DECK',
  DICE_OBJECT = 'DICE_OBJECT',
  COUNTER = 'COUNTER',
  BOARD = 'BOARD',        // Game boards/tables with grids
  RANDOMIZER = 'RANDOMIZER', // Randomizers (spinners, etc.)
  PANEL = 'PANEL',        // UI panels (hand, deck search, etc.)
  WINDOW = 'WINDOW',      // Modal windows
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
  PILE = 'PILE',
  CURSOR_SLOT = 'CURSOR_SLOT',
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
  isMillPile?: boolean; // If true, this is the default pile for "mill" action
  showTopCard?: boolean; // Whether to show the top card face on the pile itself
}

export type ContextAction = 'flip' | 'rotate' | 'rotateClockwise' | 'rotateCounterClockwise' | 'swingClockwise' | 'swingCounterClockwise' | 'delete' | 'lock' | 'clone' | 'toHand' | 'draw' | 'layer' | 'shuffleDeck' | 'searchDeck' | 'playTopCard' | 'returnAll' | 'removeFromTable' | 'topDeck' | 'millToBottom' | 'piles' | 'showTop';
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
  rotationStep?: number; // Degrees to rotate when using rotate actions (default 45)
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
  baseRotation?: number; // Base rotation for swing actions (undefined = current rotation is base)
  // Viewport pinning - when true, object stays fixed on screen regardless of camera movement
  isPinnedToViewport?: boolean;
  // Screen position where object is pinned (constant, used for render-time calculation)
  // For dual position mode, use expandedPinnedPosition and collapsedPinnedPosition
  pinnedScreenPosition?: { x: number; y: number };
  // Dual pinned positions for panels with dualPosition mode enabled
  expandedPinnedPosition?: { x: number; y: number };
  collapsedPinnedPosition?: { x: number; y: number };
  // Tooltip settings
  tooltipText?: string;
  showTooltipImage?: boolean;
  tooltipScale?: number; // Default 125 (1.25x)
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
  hidden?: boolean; // GM can hide cards - hidden cards are excluded from deck count, search, and top deck

  // Sprite sheet info - if this card is part of a sprite sheet
  spriteIndex?: number; // Index of this card in the sprite sheet (0-based)
  spriteUrl?: string; // URL of the sprite sheet image
  spriteColumns?: number; // Number of columns in the sprite sheet
  spriteRows?: number; // Number of rows in the sprite sheet
}

// Sprite sheet configuration for cards
export interface CardSpriteConfig {
  // URL of the sprite sheet image containing all cards
  spriteUrl: string;
  // URL of the card back image (rubashka)
  cardBackUrl: string;
  // Number of cards per row in the sprite sheet
  columns: number;
  // Number of rows in the sprite sheet
  rows: number;
  // Total number of cards to generate (columns * rows by default, but can be less)
  totalCards?: number;
  // Card back as sprite sheet (optional - if not set, uses cardBackUrl as simple image)
  cardBackSpriteUrl?: string; // URL of the sprite sheet for card back
  cardBackSpriteIndex?: number; // Index of the card back in the sprite sheet
  cardBackSpriteColumns?: number; // Number of columns in the card back sprite sheet
  cardBackSpriteRows?: number; // Number of rows in the card back sprite sheet
}

// Per-card sprite position info (stored in card.description or separate metadata)
export interface CardSpriteInfo {
  // Index of this card in the sprite sheet (0-based)
  spriteIndex: number;
}

export interface Deck extends GameItem {
  type: ItemType.DECK;
  cardIds: string[]; // IDs of cards currently in the stack
  cardShape?: CardShape; // The shape setting for cards in this deck
  cardOrientation?: CardOrientation; // Default orientation for cards from this deck (undefined = VERTICAL)
  initialCardCount?: number; // Initial number of cards when deck was created
  piles?: CardPile[]; // Additional card piles associated with this deck (discard, etc.)
  showTopCard?: boolean; // Whether to show the top card face on the deck itself

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
  gmSearchFaceUp?: Record<string, boolean>; // Card ID -> GM's preferred face up setting in search window

  // Sprite sheet configuration for importing cards from a single image
  spriteConfig?: CardSpriteConfig;
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

export interface Board extends GameItem {
  type: ItemType.BOARD;
  shape: TokenShape.RECTANGLE;
  gridType: GridType;
  gridSize: number;
  snapToGrid: boolean;
}

export interface Randomizer extends GameItem {
  type: ItemType.RANDOMIZER;
  randomizerType: 'spinner' | 'coin' | 'custom';
  currentValue?: string;
  options?: string[]; // For custom randomizers
}

export type TableObject = Card | Deck | Token | DiceObject | Counter | Board | Randomizer | PanelObject | WindowObject;

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

// Panel types for UI elements
export enum PanelType {
  HAND = 'HAND',
  DECK_SEARCH = 'DECK_SEARCH',
  DECK_BUILD = 'DECK_BUILD',
  CHAT = 'CHAT',
  PLAYERS = 'PLAYERS',
  CREATE = 'CREATE',
  MAIN_MENU = 'MAIN_MENU',  // Main right menu panel
  TABLEAU = 'TABLEAU',  // Tableau panel for card tableau
  PULL = 'PULL',        // Pull panel for drawing cards
}

// Window types for modal windows
export enum WindowType {
  OBJECT_SETTINGS = 'OBJECT_SETTINGS',
  DELETE_CONFIRM = 'DELETE_CONFIRM',
  TOP_DECK = 'TOP_DECK',
}

// Base interface for all UI objects (panels and windows)
export interface UIObject {
  id: string;
  type: ItemType.PANEL | ItemType.WINDOW;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex?: number;
  locked?: boolean;
  minimized?: boolean;
  visible: boolean; // Can be hidden/closed
  // Collapse state memory - for storing expanded size/position when collapsed
  collapsedState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Expanded state memory - for storing collapsed size/position when expanded
  expandedState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Viewport pinning - when true, object stays fixed on screen regardless of camera movement
  isPinnedToViewport?: boolean;
  // Screen position where object is pinned (constant, used for render-time calculation)
  // For dual position mode, use expandedPinnedPosition and collapsedPinnedPosition
  pinnedScreenPosition?: { x: number; y: number };
  // Dual pinned positions for panels with dualPosition mode enabled
  expandedPinnedPosition?: { x: number; y: number };
  collapsedPinnedPosition?: { x: number; y: number };
  // Permission actions (for panels/windows that can have actions)
  allowedActions?: ContextAction[];
  allowedActionsForGM?: ContextAction[];
}

// Panel object - persistent UI panels on the game board
export interface PanelObject extends UIObject {
  type: ItemType.PANEL;
  panelType: PanelType;
  title: string;
  // Optional: associated deck ID for deck-related panels
  deckId?: string;
  // Optional: player ID for player-specific panels
  playerId?: string;
  // Dual position mode: when true, panel has separate positions for collapsed and expanded states
  dualPosition?: boolean;
}

// Window object - modal dialogs on the game board
export interface WindowObject extends UIObject {
  type: ItemType.WINDOW;
  windowType: WindowType;
  title: string;
  // Optional: target object ID this window operates on
  targetObjectId?: string;
}
