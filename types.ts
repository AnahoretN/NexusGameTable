
export enum ItemType {
  TOKEN = 'TOKEN',
  TOKEN_TYPE = 'TOKEN_TYPE', // Token type/template for Tools panel
  CARD = 'CARD',
  DECK = 'DECK',
  DICE_OBJECT = 'DICE_OBJECT',
  COUNTER = 'COUNTER',
  BOARD = 'BOARD',        // Game boards/tables with grids
  BATTLEFIELD_CELL = 'BATTLEFIELD_CELL', // Single battlefield cell (square, hex, circle, triangle)
  NEXUS_BOARD = 'NEXUS_BOARD', // Nexus board with connected hex cells
  NEXUS_CELL = 'NEXUS_CELL', // Single cell connected to a Nexus board
  RANDOMIZER = 'RANDOMIZER', // Randomizers (spinners, etc.)
  PANEL = 'PANEL',        // UI panels (hand, deck search, etc.)
  WINDOW = 'WINDOW',      // Modal windows
  DRAWING = 'DRAWING',    // Drawings created with marker tool
  PAGE = 'PAGE',          // Pages
  EFFECT_TEMPLATE = 'EFFECT_TEMPLATE', // Effect templates for area-of-effect visualization (explosions, cones, lines)
}

// Visual subtypes for tokens to handle Chips, Figurines, Badges
export enum TokenShape {
  CIRCLE = 'CIRCLE',
  SQUARE = 'SQUARE',
  HEX = 'HEX',
  HEX_HORIZONTAL = 'HEX_HORIZONTAL',
  TRIANGLE = 'TRIANGLE'
}

export enum CardShape {
  POKER = 'POKER',
  BRIDGE = 'BRIDGE',
  MINI_US = 'MINI_US',
  MINI_EURO = 'MINI_EURO',
  SQUARE = 'SQUARE',
  HEX = 'HEX',
  HEX_HORIZONTAL = 'HEX_HORIZONTAL',
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
  HEX = 'HEX',
  HEX_HORIZONTAL = 'HEX_HORIZONTAL',
  CUSTOM = 'CUSTOM' // Irregular grid from image analysis
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

// Token State - alternative appearance/configuration for tokens
export interface TokenState {
  id: string;
  name: string; // State name (e.g., "Wounded", "Poisoned", "Berserk")
  // Visual properties (can override token defaults)
  content?: string; // Image URL or Text
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  borderOpacity?: number;
  shape?: TokenShape;
  width?: number;
  height?: number;
  rotation?: number;
  rotationStep?: number;
  // Display settings
  showNameOnToken?: boolean;
  fontColor?: string;
  // Optional: custom tooltip text for this state
  tooltipText?: string;
}

// Token Counter - numeric counter attached to a token (e.g., HP, MP, stamina)
export interface TokenCounter {
  id: string;
  name: string; // Counter name (e.g., "HP", "Mana", "Stamina")
  value: number; // Current value
  maxValue: number; // Maximum value
  minValue?: number; // Minimum value (default 0)
  color?: string; // Counter display color (default: #ef4444 red)
  icon?: string; // Optional emoji or icon for the counter
  showValue?: boolean; // Whether to show numeric value (default true)
  showBar?: boolean; // Whether to show progress bar (default true)
}

// Counter layout position for tokens
export type TokenCounterPosition = 'above' | 'below' | 'center' | 'left' | 'right';

// Counter display settings for token/token type
export interface TokenCounterDisplay {
  position: TokenCounterPosition; // Where to show counters relative to token
  showForPlayers?: boolean; // Whether players can see counters (default true - GM always sees)
}

export type ContextAction = 'flip' | 'rotate' | 'rotateClockwise' | 'rotateCounterClockwise' | 'swingClockwise' | 'swingCounterClockwise' | 'delete' | 'destroy' | 'lock' | 'clone' | 'roll' | 'layer' | 'layerUp' | 'layerDown' | 'bringToFront' | 'sendToBack' | 'millToBottom' | 'hideTop' | 'showTop' | 'moveTo' | 'moveToHand' | 'moveToTopDeck' | 'moveToBottomDeck' | 'moveToDiscard' | 'editNexusBoard' | 'closeNexusBoardEditing' | 'deleteNexusBoard' | 'returnAll' | 'returnAllAndShuffle' | 'returnAllExceptHands' | 'resetRotation' | 'configure' | 'show' | 'unpinFromViewport' | 'pinToViewport' | 'pin' | 'hide' | 'topDeck' | 'shuffleDeck' | 'searchDeck' | 'piles' | 'draw' | 'playTopCard' | 'millTopCard' | 'toBottom' | 'states' | 'switchState' | 'toggleState1' | 'nextState' | 'previousState';
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
  borderWidth?: number; // Border width in pixels
  opacity?: number; // Fill opacity (0-100, default 100)
  borderOpacity?: number; // Border opacity (0-100, default 100)
  showNameOnToken?: boolean; // Show token name in the center of the token
  fontColor?: string; // Font color for token name display

  // New props for context menu features
  locked: boolean;
  isOnTable: boolean; // Controls visibility on the battlefield vs just in the list
  inCursorSlot?: boolean; // Object is currently in the cursor slot (hidden from tabletop, locked from editing)
  draggingPlayerId?: string | null; // ID of player currently dragging this object (if any, object appears as shadow/locked to others)
  broadcastX?: number; // X coordinate to broadcast while dragging (prevents showing drag path to other players)
  broadcastY?: number; // Y coordinate to broadcast while dragging (prevents showing drag path to other players)
  allowedActions?: ContextAction[]; // Actions players are allowed to perform in context menu (undefined = all allowed)
  allowedActionsForGM?: ContextAction[]; // Actions GM is allowed to perform in context menu (undefined = all allowed)
  actionButtons?: ContextAction[]; // Actions shown as buttons on the object (max 4)
  singleClickAction?: ClickAction; // Action to perform on single click
  doubleClickAction?: ClickAction; // Action to perform on double click
  zIndex?: number; // Visual layering order
  hyperscaleLayerId?: string; // ID of hyperscale layer this object belongs to (undefined = default "tokens" layer)
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
  // Remember proportions button state
  linkObjectSize?: boolean;
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
  showTextOnCard?: boolean; // If true, show card description directly on the card face instead of in tooltip

  // Alternative card back (per-card override)
  alternativeBack?: AlternativeCardBack; // Alternative card back settings

  // Additional card properties
  isHorizontal?: boolean; // Used internally for cursor slot rendering
  fromPoolPanel?: string; // ID of pool panel this card was picked up from (if any)
  gridCellKey?: string; // Format: "boardId:col,row" for grid cell magnetism
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
  showDeckBack?: boolean; // Whether to show the deck back on the deck object (uses Card Back URL or top card's alternative back)
  showTopCardBack?: boolean; // Whether to show the top card's back on the deck object

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

  // Text to Cards functionality
  textCardsData?: Array<{ name: string; description: string }>; // Parsed text card data
  textCardsStyle?: {
    backgroundColor: string;
    textColor: string;
    fontSize: string;
    useSpriteSheet?: boolean;
  }; // Style settings for text cards
  showTextOnCards?: boolean; // Whether to show text directly on cards (instead of tooltips)

  // Remember proportions button state
  linkCardSize?: boolean;
  fromPoolPanel?: string; // ID of pool panel this deck was picked up from (if any)
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
  // Grid cell magnetism optimization - store direct reference to snapped cell
  gridCellKey?: string; // Format: "boardId:col,row" for quick lookup
  fromPoolPanel?: string; // ID of pool panel this token was picked up from (if any)
  // State system - current active state (for individual tokens)
  currentStateId?: string; // ID of the currently active state (from archetype states)
  states?: TokenState[]; // Alternative states for this token (if not using archetype)
  // Counter system - individual token counters (override archetype counters)
  counters?: TokenCounter[]; // Counters for this token (HP, MP, etc.)
  counterDisplay?: TokenCounterDisplay; // How to display counters
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
  maxCopies?: number; // Maximum number of copies allowed (0 = unlimited)
  // Display settings
  showName?: boolean; // Show the token name on the token itself
  // State system - alternative states for tokens
  states?: TokenState[]; // List of alternative states available for tokens of this type
  // Counter system - default counters for spawned tokens
  counters?: TokenCounter[]; // Default counters for tokens of this type
  counterDisplay?: TokenCounterDisplay; // How to display counters
}

// Magnet point tracking - which objects are snapped to which magnet points
export interface MagnetPoint {
  objectId: string;      // ID of the object snapped to this point
  pointIndex: number;    // Index of this magnet point (0-based)
}

// Grid cell identifier for board magnetism system
export interface GridCellKey {
  col: number;           // Column index
  row: number;           // Row index
}

// Magnet points for a single grid cell
export interface GridCellMagnetPoints {
  magnetPointCount?: number;   // Number of magnet points (default 1, min 1, max 12)
  magnetRotation?: number;     // Rotation of magnet lines in degrees (default 0)
  magnetPoints?: MagnetPoint[]; // Track which objects are snapped to which points
}

// Battlefield Cell - single cell for battlefields/tactical maps
// Can have different shapes (circle, square, hex, triangle) like tokens
// Designed for creating tactical game areas
export interface BattlefieldCell extends GameItem {
  type: ItemType.BATTLEFIELD_CELL;
  shape: TokenShape; // CIRCLE, SQUARE, HEX, or TRIANGLE
  snapToGrid?: boolean; // When enabled, other objects snap to this cell's position
  gridSize?: number; // Grid size for snapping (default 50)

  // Magnetism system - controls where tokens snap to in this cell
  magnetPointCount?: number; // Number of magnet points (default 1, min 1, max 12)
  magnetRotation?: number; // Rotation of magnet lines in degrees (default 0)
  magnetPoints?: MagnetPoint[]; // Track which objects are snapped to which points (auto-managed)
}

// Hex direction for Nexus board cell connections
export type HexDirection = 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW';

// Single cell in a Nexus board
export interface NexusCell {
  id: string;                    // Unique ID for this cell
  direction: HexDirection;       // Position relative to parent/center
  color?: string;                // Cell color (inherits from board if not set)
  locked?: boolean;              // Whether this specific cell is locked
}

// Nexus Cell Object - a standalone cell on the tabletop connected to a Nexus board
export interface NexusCellObject extends GameItem {
  type: ItemType.NEXUS_CELL;
  shape: TokenShape.HEX; // Always hex shape for now
  nexusBoardId: string;  // ID of the parent Nexus board
  direction: HexDirection; // Position relative to parent board center
  offset: { x: number; y: number }; // Offset from parent board center

  // Grid settings (inherited from parent board)
  gridType: GridType.HEX | GridType.HEX_HORIZONTAL;
  gridSize: number;              // Grid size (default 100x150 for hex)
  snapToGrid?: boolean;          // When enabled, other objects snap to this cell

  // Magnetism system (same as BattlefieldCell)
  magnetPointCount?: number;     // Number of magnet points (default 1, min 1, max 12)
  magnetRotation?: number;       // Rotation of magnet lines in degrees (default 0)
  magnetPoints?: MagnetPoint[];  // Track which objects are snapped to which points (auto-managed)
}

// Nexus Board - connected hexagonal cells that move together
export interface NexusBoard extends GameItem {
  type: ItemType.NEXUS_BOARD;
  shape: TokenShape.HEX | TokenShape.HEX_HORIZONTAL; // Always hex shape

  // Grid settings for the board (for snapping and display)
  gridType: GridType.HEX | GridType.HEX_HORIZONTAL;
  gridSize: number;              // Default cell size (100x150 for hex)

  // Connected cells in this board
  cells: NexusCell[];            // Array of connected cells (main cell is always first)

  // Cell dimensions
  cellWidth: number;             // Default 100
  cellHeight: number;            // Default 150

  // Magnetism control for all cells in this board
  snapToGrid?: boolean;          // When disabled, no cells in this board will attract tokens
}

export interface DiceObject extends GameItem {
  type: ItemType.DICE_OBJECT;
  sides: number;
  currentValue: number;
  shape?: TokenShape;
  rollStartTime?: number; // Timestamp when roll animation started (for syncing across players)
  rolling?: boolean; // Whether the dice is currently rolling (for animation)
  rollTargetValue?: number; // Final value to show after animation completes
  diceGroupId?: string; // ID of the dice group this dice belongs to (optional)
  fromPoolPanel?: string; // ID of pool panel this dice was picked up from (if any)
  valueOverrides?: Record<number, DiceValueOverride>; // Custom display for dice values (1-indexed)
  isExplosive?: boolean; // If true, rolling max value triggers another roll and adds the results
  explosiveColor?: string; // Color for explosive dice effect (default: yellow)
  explosiveTextColor?: string; // Text color for explosive dice effect (default: red)
  explosiveGlow?: string; // Glow color for explosive dice effect (default: red)
  explosiveRollValue?: number; // Second roll value for explosive dice (added to max sides for display)
}

// Custom display override for a dice value
export interface DiceValueOverride {
  type: 'image' | 'icon' | 'emoji'; // Type of override
  value: string; // URL for image, icon name, or emoji character
}

// Dice group for rolling multiple dice together
export interface DiceGroup {
  id: string;
  name: string;
  color: string;
  diceIds: string[];
  visible: boolean;
}

export interface Counter extends GameItem {
  type: ItemType.COUNTER;
  value: number;
  baseValue?: number;
  minValue?: number; // Minimum value for counter
  maxValue?: number;
  allowNegative?: boolean;
  wrapAround?: boolean; // Whether counter wraps around when reaching min/max
  fromPoolPanel?: string; // ID of pool panel this counter was picked up from (if any)
}

// Point type for polygons and other 2D coordinates
export interface Point {
  x: number;
  y: number;
}

// Custom grid cell for irregular grids (from image analysis)
export interface CustomGridCell {
  id: string;           // Unique cell ID
  x: number;            // X position relative to board (0-1 range for normalized, or pixels)
  y: number;            // Y position relative to board
  width: number;        // Cell width
  height: number;       // Cell height
  shape: 'square' | 'circle' | 'polygon'; // Cell shape
  polygon?: Point[];    // Polygon points for irregular shapes (if shape === 'polygon')
  magnetPoints?: MagnetPoint[]; // Objects snapped to this cell
}

export interface Board extends GameItem {
  type: ItemType.BOARD;
  shape: TokenShape;
  gridType: GridType;
  gridSize: number;
  gridWidth?: number;  // Width of grid cell (for non-square cells)
  gridHeight?: number; // Height of grid cell (for non-square cells)
  showGrid?: boolean;  // Whether to show the grid visually
  snapToGrid: boolean; // Snap tokens to grid
  snapCardsToGrid?: boolean; // Snap cards to grid
  snapRotationToGrid?: boolean; // Apply board rotation to snapped objects
  linkGridSize?: boolean; // Remember proportions button state for grid settings
  fromPoolPanel?: string; // ID of pool panel this board was picked up from (if any)

  // Custom grid for irregular layouts (from image analysis)
  customGridCells?: CustomGridCell[]; // Array of custom cells when gridType === CUSTOM
  customGridImage?: string; // Original image URL used for grid generation (for reference)

  // Grid cell magnetism system - stores magnet points for each grid cell
  gridCellMagnetPoints?: Record<string, GridCellMagnetPoints>; // Key: "col,row" string
  defaultGridCellMagnetPointCount?: number; // Default magnet points per cell (1-12)
}

export interface Randomizer extends GameItem {
  type: ItemType.RANDOMIZER;
  randomizerType: 'spinner' | 'coin' | 'custom';
  currentValue?: string;
  options?: string[]; // For custom randomizers
  fromPoolPanel?: string; // ID of pool panel this randomizer was picked up from (if any)
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

// Effect Template - area-of-effect visualization templates for wargames
// Used for explosions, cones, lines, and other spell/ability effects
export interface EffectTemplate extends GameItem {
  type: ItemType.EFFECT_TEMPLATE;
  // Pivot point in percentage of image dimensions (0-100)
  // Determines the center of rotation for the effect template
  pivot: { x: number; y: number };
  // Distance from pivot to rotation marker (in VU)
  // Independent from height - allows pivot to move without changing template size
  // If not specified, defaults to height (backward compatibility)
  rotationMarkerDistance?: number;
  // Hitbox polygon data for accurate click detection on non-transparent areas
  // Generated from image alpha channel on load
  hitboxPolygon?: Array<{ x: number; y: number }>;
  // Whether pivot editing mode is active
  isEditingPivot?: boolean;
  // Base height of the original image in VU (used for proportional scaling)
  // Allows height to exceed baseImageHeight when scaling via Rotation Marker
  baseImageHeight?: number;
  // Show width marker and ruler (default: true)
  showWidthMarker?: boolean;
  // When scaling height via rotation marker, also scale width proportionally (default: false)
  proportionalScaling?: boolean;
}

export type TableObject = Card | Deck | Token | TokenType | DiceObject | Counter | Board | Randomizer | PanelObject | WindowObject | Drawing | BattlefieldCell | NexusBoard | NexusCellObject | EffectTemplate;

// Language settings
export type AppLanguage = 'en' | 'ru' | 'be' | 'uk' | 'sr';

// Player permissions for object management in main menu
export interface PlayerPermissions {
  createObjects: boolean;  // Can create objects via Create tab
  configureObjects: boolean;  // Can open object settings
  deleteObjects: boolean;  // Can delete objects via Delete button
  hideObjects: boolean;  // Can show/hide objects via eye icon
}

// Hyperscale layer system - higher level organization above regular z-index
// Objects in lower hyperscale layers can never appear above objects in higher hyperscale layers
export interface HyperscaleLayer {
  id: string;
  name: string;
  minZIndex: number;  // Minimum z-index for this layer
  maxZIndex: number;  // Maximum z-index for this layer
  color: string;       // Display color in UI
  // GM-only settings
  playerCanSelect: boolean;  // Can players select this layer in Layers panel
  playerCanView: boolean;    // Can players see this layer in context menu
  individualPosition: boolean;  // Objects shared, but position is local per player (host knows for saving)
  individualObjects: boolean;    // Layer is completely local - objects and positions individual per player (host knows for saving)
  zoomEnabled: boolean;  // Whether local zoom affects objects in this layer
  order: number;       // Display order (lower = higher priority in list)
}

// Local panel settings for each player
// These settings override the global panel state
export interface LocalPanelSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  isPinnedToViewport: boolean;
  pinnedScreenPosition?: { x: number; y: number };
  expandedState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  collapsedState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  expandedPinnedPosition?: { x: number; y: number };
  collapsedPinnedPosition?: { x: number; y: number };
}

export interface Player {
  id: string;
  name: string;
  color: string;
  isGM: boolean;
  handCardOrder?: string[]; // Custom order of card IDs in player's hand
  // Hand visibility permissions (who can view this player's hand)
  handVisibleToPlayerIds?: string[]; // Player IDs who can see this hand
  // Hand management permissions (who can reorder/manipulate cards in this hand)
  handManageableByPlayerIds?: string[]; // Player IDs who can manage this hand
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
  POOL = 'POOL',        // Pool panel for drawing cards
  CHARACTER = 'CHARACTER',  // Character panel for RPG games
  TOOLS = 'TOOLS',  // Tools panel
  TOKENS = 'TOKENS',  // Tokens panel for quick access
}

// Window types for modal windows
export enum WindowType {
  OBJECT_SETTINGS = 'OBJECT_SETTINGS',
  DELETE_CONFIRM = 'DELETE_CONFIRM',
  TOP_DECK = 'TOP_DECK',
  HYPERSCALE_LAYER_SETTINGS = 'HYPERSCALE_LAYER_SETTINGS',
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
  hyperscaleLayerId?: string; // ID of hyperscale layer this object belongs to
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
  // Pixel dimensions when pinned - to prevent size changes when pinning/unpinning
  pinnedPixelWidth?: number;
  pinnedPixelHeight?: number;
  // Permission actions (for panels/windows that can have actions)
  allowedActions?: ContextAction[];
  allowedActionsForGM?: ContextAction[];
  // Owner ID - if set, this UI object is only visible to the player with this ID
  // Used for settings windows that should be local to the player who opened them
  ownerId?: string;
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
  // Optional: character panel data for CHARACTER panel type
  characterData?: CharacterPanelData;
  // Optional: pool panel data for POOL panel type
  poolData?: PoolPanelData;
  // Optional: tableau panel data for TABLEAU panel type
  tableauData?: TableauPanelData;
}

// ============================================================================
// CHARACTER PANEL TYPES
// ============================================================================

// Block types for character panels
export enum CharacterBlockType {
  TEXT = 'TEXT',
  TABLE = 'TABLE',
  SLIDER = 'SLIDER',
  INVENTORY = 'INVENTORY',
  AVATAR = 'AVATAR',
  COUNTER = 'COUNTER',
}

// Base character block interface
export interface CharacterBlock {
  id: string;
  type: CharacterBlockType;
  title: string;
  visible: boolean;
  order: number;
  columnId: string; // ID of the column this block belongs to
  data: TextBlockData | TableBlockData | SliderBlockData | InventoryBlockData | AvatarBlockData | CounterBlockData;
}

// Text block data
export interface TextBlockData {
  content: string;
  editable: boolean;
  maxLength?: number;
}

// Table block data
export interface TableBlockData {
  columns: TableColumn[];
  rows: TableRow[];
  editable: boolean;
  addRowAllowed: boolean;
  addColumnAllowed: boolean;
}

export interface TableColumn {
  id: string;
  title: string;
  width: number;
  type: 'text' | 'number';
}

export interface TableRow {
  id: string;
  cells: Record<string, string | number>;
}

// Slider block data
export interface SliderItem {
  id: string;
  label: string;
  value: number;
  maxValue: number;
  minValue: number;
  color: string;
  showValue: boolean;
  showPercentage: boolean;
}

export interface SliderBlockData {
  sliders: SliderItem[];
}

// Inventory block data
export interface InventoryBlockData {
  gridColumns: number;
  items: InventoryItem[];
  maxItems?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  imageUrl?: string;
  quantity: number;
}

// Avatar block data
export interface AvatarBlockData {
  imageUrl: string;
  name: string;
  showName: boolean;
}

// Counter block data
export interface CounterItem {
  id: string;
  name: string;
  value: number;
}

export interface CounterBlockData {
  counters: CounterItem[];
}

// Character sub-tab (for organizing blocks within a character)
export interface CharacterSubTab {
  id: string;
  name: string;
  blocks: CharacterBlock[];
  columns: number; // Number of columns (default: 1)
}

// Character tab data
export interface CharacterTab {
  id: string;
  characterName: string;
  playerId?: string;
  blocks?: CharacterBlock[]; // Legacy: for backward compatibility, moved to subTabs
  columns?: number; // Legacy: for backward compatibility, moved to subTabs
  subTabs?: CharacterSubTab[]; // New: sub-tabs for organizing blocks
  activeSubTabId?: string; // New: active sub-tab ID
  visibleToPlayerIds: string[];
  manageableByPlayerIds: string[]; // Can change values but not structure
  editableByPlayerIds: string[];
  avatarUrl?: string;
}

// Character preset
export interface CharacterPreset {
  id: string;
  name: string;
  description?: string;
  blocks: Omit<CharacterBlock, 'id'>[];
}

// Character panel data
export interface CharacterPanelData {
  characters: CharacterTab[];
  presets: CharacterPreset[];
  activeCharacterId: string;
  isUniversal: boolean;
}

// ============================================================================
// POOL & TABLEAU PANEL TYPES
// ============================================================================

// Tab for Pool/Tableau panels
export interface PanelTab {
  id: string;
  name: string;
  // Permission settings
  visibleToPlayerIds: string[]; // Player IDs who can see this tab
  manageableByPlayerIds: string[]; // Player IDs who can manage objects in this tab
  editableByPlayerIds: string[]; // Player IDs who can add/remove objects in this tab
  zoom?: number; // Zoom level for this tab (default 1)
  // Each tab has its own separate 1000x1000vu game space
  offsetX: number; // X position of this tab's pool zone in game space
  offsetY: number; // Y position of this tab's pool zone in game space
  territoryId?: string; // Unique identifier for this tab's territory
}

// Pool panel data - separate 1000x1000vu game space per tab
export interface PoolPanelData {
  tabs: PanelTab[];
  activeTabId: string;
  // Note: Each tab now has its own offsetX, offsetY, territoryId
  // These fields below are kept for backward compatibility with old data
  offsetX?: number; // Deprecated: Use tabs[].offsetX instead
  offsetY?: number; // Deprecated: Use tabs[].offsetY instead
  territoryId?: string; // Deprecated: Use tabs[].territoryId instead
  width?: number; // Deprecated: Pool zone is always 1000x1000
  height?: number; // Deprecated: Pool zone is always 1000x1000
}

// Tableau panel data - same as main game space but in panel form
export interface TableauPanelData {
  tabs: PanelTab[];
  activeTabId: string;
  // Objects stored in each tab (separate from main game space)
  tabObjects: { [tabId: string]: string[] }; // Map of tabId -> object IDs
}

// Window object - modal dialogs on the game board
export interface WindowObject extends UIObject {
  type: ItemType.WINDOW;
  windowType: WindowType;
  title: string;
  // Optional: target object ID this window operates on
  targetObjectId?: string;
  // Optional: target hyperscale layer ID this window operates on
  targetLayerId?: string;
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

// Audit Log System
export enum AuditActionType {
  OBJECT_CREATED = 'OBJECT_CREATED',
  OBJECT_DELETED = 'OBJECT_DELETED',
  OBJECT_MOVED = 'OBJECT_MOVED',
  OBJECT_UPDATED = 'OBJECT_UPDATED',
  OBJECT_RESIZED = 'OBJECT_RESIZED',
  OBJECT_ROTATED = 'OBJECT_ROTATED',
  OBJECT_LOCKED = 'OBJECT_LOCKED',
  OBJECT_HIDDEN = 'OBJECT_HIDDEN',
  OBJECT_LAYER_CHANGED = 'OBJECT_LAYER_CHANGED',
  CARD_DRAWN = 'CARD_DRAWN',
  CARD_PLAYED = 'CARD_PLAYED',
  CARD_FLIPPED = 'CARD_FLIPPED',
  DECK_SHUFFLED = 'DECK_SHUFFLED',
  STROKE_ADDED = 'STROKE_ADDED',
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actionType: AuditActionType;
  tags?: AuditActionType[]; // Multiple tags for complex changes (e.g., move + resize)
  playerId: string;
  playerName: string;
  isGM: boolean;
  details: {
    objectId?: string;
    objectType?: ItemType;
    objectName?: string;
    description?: string;
    fromPosition?: { x: number; y: number };
    toPosition?: { x: number; y: number };
    previousValue?: any;
    newValue?: any;
    metadata?: Record<string, any>;
  };
  // Store the original action for replay (any to avoid circular dependency)
  action: any;
  // For undo: store inverse action if applicable
  inverseAction?: any;
}

export interface AuditLogState {
  entries: AuditLogEntry[];
  maxEntries: number;
  // Track replay state for restore functionality
  baseStateSnapshot?: any;  // Initial state when logging started (serialized)
  currentReplayIndex: number;  // Current position in replay
}
