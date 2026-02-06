
export enum ItemType {
  TOKEN = 'TOKEN',
  TOKEN_TYPE = 'TOKEN_TYPE', // Token type/template for Tools panel
  CARD = 'CARD',
  DECK = 'DECK',
  DICE_OBJECT = 'DICE_OBJECT',
  COUNTER = 'COUNTER',
  BOARD = 'BOARD',        // Game boards/tables with grids
  RANDOMIZER = 'RANDOMIZER', // Randomizers (spinners, etc.)
  PANEL = 'PANEL',        // UI panels (hand, deck search, etc.)
  WINDOW = 'WINDOW',      // Modal windows
  DRAWING = 'DRAWING',    // Drawings created with marker tool
}

// Visual subtypes for tokens to handle Chips, Figurines, Badges
export enum TokenShape {
  CIRCLE = 'CIRCLE',
  SQUARE = 'SQUARE',
  HEX = 'HEX',
  TRIANGLE = 'TRIANGLE'
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

export type ContextAction = 'flip' | 'rotate' | 'rotateClockwise' | 'rotateCounterClockwise' | 'swingClockwise' | 'swingCounterClockwise' | 'delete' | 'lock' | 'clone' | 'draw' | 'layer' | 'layerUp' | 'layerDown' | 'shuffleDeck' | 'searchDeck' | 'playTopCard' | 'millTopCard' | 'toBottom' | 'returnAll' | 'removeFromTable' | 'topDeck' | 'millToBottom' | 'piles' | 'showTop' | 'pin' | 'moveTo' | 'moveToHand' | 'moveToTopDeck' | 'moveToBottomDeck' | 'moveToDiscard';
export type ClickAction = ContextAction | 'none' | 'showTooltipImage';

// Alternative card back settings (per-card)
export interface AlternativeCardBack {
  url: string; // URL of the alternative back image
  locations: CardLocation[]; // Where to show the alternative back (TABLE, HAND, DECK, PILE, CURSOR_SLOT)
  visibleToOthers: boolean; // Whether players who shouldn't see the card face can see the alternative back
}

export interface Coordinates {
  x: number;
  y: number;
}

// Drawing system types
export interface StrokePoint {
  x: number;
  y: number;
  pressure?: number; // For pressure-sensitive drawing
}

export interface Stroke {
  id: string;
  points: StrokePoint[];
  color: string;
  thickness: number;
  timestamp: number;
  author?: string; // Player ID who created the stroke
}

export interface DrawingLayer {
  id: string;
  // Binding to object (if null, drawing is on the board)
  boundObjectId?: string; // ID of the object this drawing is bound to
  // For cards, can specify which side the drawing is on
  boundCardSide?: 'front' | 'back';
  // Strokes in this layer
  strokes: Stroke[];
  // Layer visibility
  visible: boolean;
  // Layer opacity
  opacity?: number;
  // Z-index within drawing layers
  zIndex?: number;
}

// Drawing data stored per board or globally
export interface DrawingData {
  layers: DrawingLayer[];
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
  borderColor?: string; // Border/stroke color for tokens
  showNameOnToken?: boolean; // Show token name in the center of the token
  fontColor?: string; // Font color for token name display

  // New props for context menu features
  locked: boolean;
  isOnTable: boolean; // Controls visibility on the battlefield vs just in the list
  inCursorSlot?: boolean; // Object is currently in the cursor slot (hidden from tabletop, locked from editing)
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

  // Individual card face URLs (override deck defaults)
  frontFaceUrl?: string; // Custom front face image URL
  backFaceUrl?: string; // Custom back face image URL

  // Alternative card back (per-card override)
  alternativeBack?: AlternativeCardBack; // Alternative card back settings

  // Additional card properties
  isHorizontal?: boolean; // Used internally for cursor slot rendering
  __pendingPlayTop?: { // Internal: stores pending play-top data for undo when card is dropped
    deckId: string;
    previousCardIds: string[];
    previousLocation: CardLocation;
    previousFaceUp: boolean;
  };
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
  // Default sprite index for cards in this deck
  spriteIndex?: number;
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
  baseCardIds: string[]; // Base list of cards - immutable set by sprite generation or GM deletion, defines max cards
  cardIds: string[]; // Current list of cards in the stack - changes with draw, shuffle, play top, etc.
  cardShape?: CardShape; // The shape setting for cards in this deck
  cardOrientation?: CardOrientation; // Default orientation for cards from this deck (undefined = VERTICAL)
  initialCardCount?: number; // DEPRECATED: Now calculated from baseCardIds.length, kept for backwards compatibility
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
  // Reference to archetype if spawned from one
  archetypeId?: string;
  // Show name on token (inherited from archetype for token-copies)
  showName?: boolean;
}

// Token Type - a template for creating tokens
// Appears in Tools panel, acts as a template (not consumed when spawning tokens)
export interface TokenType extends GameItem {
  type: ItemType.TOKEN_TYPE;
  shape: TokenShape;
  // Default size for spawned tokens (if different from archetype's own size)
  defaultSize?: { width: number; height: number };
  // Spawn settings
  autoName?: boolean; // Auto-generate names like "Goblin 1", "Goblin 2", etc.
  namePrefix?: string; // Prefix for auto-naming
  spawnCount?: number; // Track how many have been spawned for naming
  // Display settings
  showName?: boolean; // Show the token name on the token itself
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
  shape: TokenShape.SQUARE;
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

// Drawing object - contains strokes created with marker tool
export interface Drawing extends GameItem {
  type: ItemType.DRAWING;
  // Drawing data
  strokes: Stroke[];
  // Drawing bounds (calculated from strokes)
  bounds: { x: number; y: number; width: number; height: number };
  // Background color (optional, transparent by default)
  backgroundColor?: string;
  // Drawing color (used for new strokes, defaults to first stroke color or red)
  color?: string;
  // Drawing opacity (1-100, default 100)
  opacity?: number;
}

export type TableObject = Card | Deck | Token | TokenType | DiceObject | Counter | Board | Randomizer | PanelObject | WindowObject | Drawing;

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

// Undo/History system types

// Marker history entries (max 10)
export type MarkerHistoryEntry =
  | { type: 'drawing-created'; drawingId: string; drawing: Drawing }
  | { type: 'stroke-added'; drawingId: string; strokeId: string; stroke: Stroke }
  | { type: 'drawing-deleted'; drawing: Drawing }
  | { type: 'drawings-merged'; mergedIntoId: string; sourceDrawings: Drawing[]; targetDrawingBeforeMerge: Drawing };

// General history entries (max 100)
export type GeneralHistoryEntry =
  | { type: 'object-added'; objectId: string; object: TableObject }
  | { type: 'object-deleted'; objectId: string; object: TableObject; cascadedDeletes?: TableObject[] }
  | { type: 'object-moved'; objectId: string; previousX: number; previousY: number }
  | { type: 'object-updated'; objectId: string; previousValues: Partial<TableObject> }
  | { type: 'object-rotated'; objectId: string; previousRotation: number; previousBaseRotation?: number }
  | { type: 'object-lock-toggled'; objectId: string; previousLocked: boolean }
  | { type: 'object-on-table-toggled'; objectId: string; previousIsOnTable: boolean }
  | { type: 'object-layer-changed'; objectId: string; direction: 'up' | 'down'; previousZIndex?: number; otherObjectId?: string; otherObjectPreviousZIndex?: number }
  | { type: 'object-pinned'; objectId: string; previousPinnedToViewport?: boolean; previousScreenPosition?: { x: number; y: number } }
  | { type: 'object-unpinned'; objectId: string; previousX: number; previousY: number; previousPinnedToViewport: boolean; previousScreenPosition?: { x: number; y: number } }
  | { type: 'counter-updated'; objectId: string; previousValue: number; delta: number }
  | { type: 'token-spawned'; objectId: string; archetypeId: string; archetypePreviousSpawnCount?: number }
  | { type: 'card-flipped'; cardId: string; previousFaceUp: boolean }
  | { type: 'card-drawn'; cardId: string; fromDeckId: string; fromIndex: number; previousLocation: CardLocation }
  | { type: 'card-played'; cardId: string; previousLocation: CardLocation; previousX?: number; previousY?: number; previousFaceUp?: boolean }
  | { type: 'card-played-from-top'; cardId: string; deckId: string; previousCardIds: string[]; previousLocation: CardLocation; previousFaceUp: boolean }
  | { type: 'dropped-from-cursor-slot'; objectId: string; previousState: 'cursor_slot' | 'table' | 'hand' | 'deck' | 'pile'; previousLocation: CardLocation; previousX?: number; previousY?: number; previousZIndex?: number; previousFaceUp?: boolean; previousDeckId?: string; previousOwnerId?: string; previousDeckCardIds?: string[]; previousPileId?: string; previousPileCardIds?: string[]; previousInCursorSlot?: boolean }
  | { type: 'card-returned-to-deck'; cardId: string; previousLocation: CardLocation; previousX?: number; previousY?: number; deckId: string }
  | { type: 'card-added-to-pile'; cardId: string; previousLocation: CardLocation; previousX?: number; previousY?: number; deckId: string; pileId: string; previousDeckCardIds?: string[]; previousPileCardIds?: string[] }
  | { type: 'card-drawn-from-pile'; cardId: string; previousLocation: CardLocation; deckId: string; pileId: string; fromIndex: number }
  | { type: 'card-returned-to-top'; cardId: string; previousLocation: CardLocation; previousX?: number; previousY?: number; previousFaceUp?: boolean; fromDeckId: string; toDeckId: string; fromCardIds?: string[]; toCardIds?: string[]; fromPileId?: string; fromPileCardIds?: string[] }
  | { type: 'card-returned-to-bottom'; cardId: string; previousLocation: CardLocation; previousX?: number; previousY?: number; previousFaceUp?: boolean; fromDeckId: string; toDeckId: string; fromCardIds?: string[]; toCardIds?: string[]; fromPileId?: string; fromPileCardIds?: string[] }
  | { type: 'card-added-to-top'; cardId: string; previousLocation: CardLocation; previousX?: number; previousY?: number; previousFaceUp?: boolean; fromDeckId?: string; toDeckId: string; fromCardIds?: string[]; toCardIds?: string[] }
  | { type: 'card-milled-to-bottom'; cardId: string; deckId: string; previousCardIds: string[] }
  | { type: 'card-milled-to-pile'; cardId: string; deckId: string; pileId: string; previousDeckCardIds: string[]; previousPileCardIds: string[] }
  | { type: 'deck-shuffled'; deckId: string; previousCardOrder: string[] };

export interface UndoState {
  markerHistory: MarkerHistoryEntry[]; // Max 10 entries
  generalHistory: GeneralHistoryEntry[]; // Max 100 entries
  readonly maxMarkerHistory: 10;
  readonly maxGeneralHistory: 100;
}
